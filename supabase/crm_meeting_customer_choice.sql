begin;

alter table public.crm_host_sessions drop constraint crm_host_sessions_check2,
  add constraint crm_host_sessions_group_address_check check (
    delivery_address is null or (kind = 'meeting' and char_length(btrim(delivery_address)) between 5 and 500));

update public.crm_host_sessions set
  grouped_shipping_cents = coalesce(grouped_shipping_cents,case when delivery_mode = 'individual' then 0 else shipping_cents end),
  individual_shipping_cents = coalesce(individual_shipping_cents,shipping_cents)
where kind = 'meeting' and (grouped_shipping_cents is null or individual_shipping_cents is null);

alter table public.crm_orders
  add column meeting_delivery_mode text check (meeting_delivery_mode is null or
    (host_session_id is not null and meeting_delivery_mode in ('grouped','individual'))),
  add column gift_product text,
  add column gift_quantity integer,
  add constraint crm_orders_gift_check check (
    (gift_product is null and gift_quantity is null) or
    (gift_product is not null and gift_quantity is not null and char_length(btrim(gift_product)) between 1 and 220
      and gift_quantity between 1 and 999));
grant update (gift_product,gift_quantity) on public.crm_orders to authenticated;

update public.crm_orders o set meeting_delivery_mode = 'individual'
from public.crm_host_sessions h where h.owner_id = o.owner_id and h.id = o.host_session_id
  and h.kind = 'meeting' and h.delivery_mode = 'individual' and o.delivery_address is not null;

create function private.meeting_shipping_rate(meeting public.crm_host_sessions, mode text)
returns integer language sql stable set search_path = '' as $$
  select case mode
    when 'grouped' then coalesce(meeting.grouped_shipping_cents,
      case when meeting.delivery_mode is distinct from 'individual' then meeting.shipping_cents else 0 end)
    else coalesce(meeting.individual_shipping_cents,meeting.shipping_cents)
  end;
$$;
revoke all on function private.meeting_shipping_rate(public.crm_host_sessions,text) from public,anon;
grant execute on function private.meeting_shipping_rate(public.crm_host_sessions,text) to service_role;

create or replace function private.guard_meeting_order_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  session_status text;
  session_kind text;
  session_shipping integer;
begin
  if new.host_session_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.host_session_id is not distinct from old.host_session_id then return new; end if;
  select h.kind,h.status,h.shipping_cents into session_kind,session_status,session_shipping from public.crm_host_sessions h
    where h.owner_id = new.owner_id and h.id = new.host_session_id for share;
  if session_kind = 'meeting' and session_status = 'closed' then
    raise exception using errcode = '23514', message = 'Meeting already closed';
  end if;
  if session_kind = 'meeting' and tg_op = 'INSERT' and new.host_request_id is not null and new.meeting_delivery_mode is null then
    new.shipping_cents := session_shipping;
  end if;
  return new;
end;
$$;

create or replace function private.apply_meeting_shipping_on_close() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'meeting' and new.status = 'closed' and old.status <> 'closed' then
    update public.crm_orders o set shipping_cents = new.shipping_cents, meeting_reviewed_at = clock_timestamp()
      where o.owner_id = new.owner_id and o.host_session_id = new.id and o.status <> 'cancelled'
        and o.meeting_delivery_mode is null and o.payment_status = 'later' and o.shipping_cents is distinct from new.shipping_cents;
  end if;
  return new;
end;
$$;
create or replace function private.guard_meeting_close() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind <> 'meeting' or new.status <> 'closed' or old.status = 'closed' then return new; end if;
  if new.delivery_mode is null then
    raise exception using errcode = '23514', message = 'Meeting requires a final delivery mode';
  end if;
  if exists (
    select 1 from public.crm_orders o where o.owner_id = new.owner_id and o.host_session_id = new.id
      and o.status <> 'cancelled' and (o.meeting_reviewed_at is null or o.payment_status not in ('paid','later'))
  ) then raise exception using errcode = '23514', message = 'Meeting orders require payment review'; end if;
  if exists (
    select 1 from public.crm_orders o where o.owner_id = new.owner_id and o.host_session_id = new.id
      and o.status <> 'cancelled' and coalesce(o.meeting_delivery_mode,new.delivery_mode) = 'individual'
      and o.delivery_address is null
  ) then raise exception using errcode = '23514', message = 'Meeting orders require delivery addresses'; end if;
  return new;
end;
$$;
create table public.crm_meeting_promos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  session_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  discount_bp integer not null check (discount_bp between 1 and 10000),
  max_uses integer check (max_uses between 1 and 99999),
  active boolean not null default true,
  unique (owner_id,session_id,id),
  unique (session_id,code),
  foreign key (owner_id,session_id) references public.crm_host_sessions(owner_id,id)
);
alter table public.crm_meeting_promos enable row level security;
revoke all on public.crm_meeting_promos from public,anon,authenticated;
grant select,insert (session_id,code,discount_bp,max_uses),update (active) on public.crm_meeting_promos to authenticated;
grant select,update (active) on public.crm_meeting_promos to service_role;
create policy own_meeting_promos on public.crm_meeting_promos to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()) and exists (
    select 1 from public.crm_host_sessions h where h.owner_id = crm_meeting_promos.owner_id
      and h.id = crm_meeting_promos.session_id and h.kind = 'meeting'
  ));

alter table public.crm_orders add column meeting_promo_id uuid,
  add constraint crm_orders_meeting_promo_owner foreign key (owner_id,host_session_id,meeting_promo_id)
    references public.crm_meeting_promos(owner_id,session_id,id),
  add constraint crm_orders_meeting_promo_session check (meeting_promo_id is null or host_session_id is not null);
create index crm_orders_meeting_promo on public.crm_orders(meeting_promo_id) where meeting_promo_id is not null;

create function public.preview_crm_meeting_promo(invite uuid, promo_code text)
returns integer language sql security invoker set search_path = '' as $$
  select p.discount_bp from private.crm_public_invitation(invite) i
    join public.crm_meeting_promos p on p.owner_id = i.consultant and p.session_id = i.host_session
    where p.code = upper(btrim(promo_code)) and p.active and (p.max_uses is null or
      (select count(*) from public.crm_orders o where o.meeting_promo_id = p.id) < p.max_uses);
$$;
revoke all on function public.preview_crm_meeting_promo(uuid,text) from public,anon,authenticated;
grant execute on function public.preview_crm_meeting_promo(uuid,text) to service_role;

create function public.submit_crm_delivery_choice(invite uuid, request_id uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birth date, subtotal integer, order_items jsonb, destination text, selected_mode text, promo_code text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  invitation record;
  customer uuid;
  seller_snapshot jsonb;
  meeting public.crm_host_sessions%rowtype;
  delivery_mode text;
  shipping integer;
  promo public.crm_meeting_promos%rowtype;
  savings integer := 0;
begin
  if request_id is null or subtotal is null or subtotal not between 0 and 99999999
    or order_items is null or jsonb_typeof(order_items) <> 'array'
    or jsonb_array_length(order_items) not between 1 and 20 then return false; end if;
  select * into invitation from private.crm_public_invitation(invite);
  if not found then return false; end if;
  shipping := invitation.shipping;
  if invitation.host_session is not null then
    select h.* into meeting from public.crm_host_sessions h
      where h.id = invitation.host_session and h.status = 'active' for share;
    if not found then return false; end if;
    if meeting.kind = 'meeting' then
      if selected_mode is null or selected_mode not in ('grouped','individual') then return false; end if;
      delivery_mode := selected_mode;
      shipping := private.meeting_shipping_rate(meeting,delivery_mode);
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(invitation.consultant::text || ':order:' || request_id::text, 0));
  if exists(select 1 from public.crm_orders o where o.owner_id = invitation.consultant and o.host_request_id = request_id)
    then return true; end if;
  destination := nullif(btrim(destination),'');
  if delivery_mode = 'individual' then
    if destination is null or char_length(destination) not between 5 and 500 then return false; end if;
  else
    destination := null;
  end if;
  promo_code := nullif(upper(btrim(promo_code)),'');
  if promo_code is not null then
    select p.* into promo from public.crm_meeting_promos p
      where p.owner_id = invitation.consultant and p.session_id = invitation.host_session
        and p.code = promo_code and p.active for update;
    if not found or (promo.max_uses is not null and
        (select count(*) from public.crm_orders o where o.meeting_promo_id = promo.id) >= promo.max_uses) then
      raise exception 'Meeting promo is unavailable';
    end if;
    savings := round(subtotal::numeric * promo.discount_bp / 10000)::integer;
  end if;
  customer := private.resolve_crm_public_customer(invitation.consultant,first_name,last_name,customer_email,customer_phone,customer_birth);
  if customer is null then return false; end if;
  select to_jsonb(s) - 'owner_id' into seller_snapshot from public.crm_seller_profiles s where s.owner_id = invitation.consultant;
  insert into public.crm_orders(owner_id,client_id,details,total_cents,shipping_cents,items,source,seller,
    host_session_id,host_request_id,manual_email_only,delivery_address,meeting_delivery_mode,meeting_promo_id,order_discount)
    values(invitation.consultant,customer,case when invitation.host_session is null then 'Commande via un lien consultant'
      else 'Commande via un lien hôte' end,subtotal - savings,shipping,order_items,'client',seller_snapshot,
      invitation.host_session,request_id,true,destination,delivery_mode,promo.id,
      case when promo.id is not null then jsonb_build_object('type','percent','amount',promo.discount_bp,'applied_cents',savings) end);
  insert into public.crm_customer_klaviyo_queue(email) values(lower(btrim(customer_email))) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.submit_crm_delivery_choice(uuid,uuid,text,text,text,text,date,integer,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_crm_delivery_choice(uuid,uuid,text,text,text,text,date,integer,jsonb,text,text,text) to service_role;

commit;
