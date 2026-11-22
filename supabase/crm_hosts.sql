begin;

create table public.crm_host_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_token uuid not null unique default gen_random_uuid(),
  tracking_token uuid not null unique default gen_random_uuid(),
  kind text not null check (kind in ('meeting','case')),
  host_name text not null check (char_length(btrim(host_name)) between 1 and 120),
  starts_on date not null,
  ends_on date,
  venue text check (char_length(btrim(venue)) between 1 and 240),
  guests text check (char_length(guests) <= 4000),
  status text not null default 'planned' check (status in ('planned','active','closed','cancelled')),
  shipping_cents integer not null default 0 check (shipping_cents between 0 and 99999999),
  check ((kind = 'meeting' and venue is not null and ends_on is null) or
    (kind = 'case' and ends_on is not null and ends_on >= starts_on and venue is null and guests is null)),
  unique (owner_id,id)
);
create index crm_hosts_owner_kind_date on public.crm_host_sessions(owner_id,kind,starts_on desc);

alter table public.crm_orders
  add column host_session_id uuid,
  add column host_request_id uuid,
  add constraint crm_orders_host_owner foreign key (owner_id,host_session_id)
    references public.crm_host_sessions(owner_id,id) deferrable initially deferred,
  add constraint crm_orders_host_request_check check (host_request_id is null or host_session_id is not null);
create index crm_orders_host_sales on public.crm_orders(owner_id,host_session_id) where host_session_id is not null;
create unique index crm_orders_host_request on public.crm_orders(host_session_id,host_request_id) where host_request_id is not null;
grant update (host_session_id) on public.crm_orders to authenticated;

create function private.keep_crm_order_host() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.host_session_id is not null and new.host_session_id is distinct from old.host_session_id then
    raise exception 'Order already attributed to a host';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_crm_order_host() from public,anon,authenticated;
create trigger keep_crm_order_host before update of host_session_id on public.crm_orders
for each row execute function private.keep_crm_order_host();

create table public.crm_host_gifts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  session_id uuid not null,
  threshold_cents integer not null check (threshold_cents between 1 and 99999999),
  label text not null check (char_length(btrim(label)) between 1 and 160),
  delivered_at timestamptz,
  foreign key (owner_id,session_id) references public.crm_host_sessions(owner_id,id) on delete cascade,
  unique (session_id,threshold_cents)
);
alter table public.crm_host_sessions enable row level security;
alter table public.crm_host_gifts enable row level security;
revoke all on public.crm_host_sessions,public.crm_host_gifts from public,anon,authenticated;
grant select, insert (kind,host_name,starts_on,ends_on,venue,guests,status,shipping_cents),
  update (host_name,starts_on,ends_on,venue,guests,status,shipping_cents) on public.crm_host_sessions to authenticated;
grant select, insert (session_id,threshold_cents,label), update (delivered_at), delete on public.crm_host_gifts to authenticated;
grant select on public.crm_host_sessions,public.crm_host_gifts to service_role;

create policy own_crm_host_sessions on public.crm_host_sessions to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
create policy own_crm_host_gifts on public.crm_host_gifts for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
create policy insert_crm_host_gifts on public.crm_host_gifts for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
create policy deliver_crm_host_gifts on public.crm_host_gifts for update to authenticated
  using (owner_id = (select auth.uid()) and delivered_at is null and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
create policy delete_crm_host_gifts on public.crm_host_gifts for delete to authenticated
  using (owner_id = (select auth.uid()) and delivered_at is null and (select private.can_manage_travelling_cases()));

create view public.crm_host_sales with (security_invoker = true) as
  select owner_id, host_session_id as session_id,
    count(*) filter (where status <> 'cancelled' and payment_status = 'paid') as paid_orders,
    coalesce(sum(total_cents + shipping_cents) filter (where status <> 'cancelled' and payment_status = 'paid'),0) as paid_cents
  from public.crm_orders where host_session_id is not null group by owner_id,host_session_id;
revoke all on public.crm_host_sales from public,anon,authenticated;
grant select on public.crm_host_sales to authenticated,service_role;

create function private.check_crm_host_gift() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.delivered_at is null or not exists (
    select 1 from public.crm_host_sales s where s.owner_id = old.owner_id and s.session_id = old.session_id
      and s.paid_cents >= old.threshold_cents
  ) then raise exception 'Reward threshold not reached'; end if;
  new.delivered_at := now();
  return new;
end;
$$;
revoke all on function private.check_crm_host_gift() from public,anon,authenticated;
create trigger check_crm_host_gift before update of delivered_at on public.crm_host_gifts
for each row execute function private.check_crm_host_gift();

create function public.submit_crm_host_order(
  link_token uuid, request_id uuid, customer_name text, customer_email text, customer_phone text,
  subtotal integer, order_items jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  session public.crm_host_sessions%rowtype;
  seller_snapshot jsonb;
  customer uuid;
  local_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if request_id is null or customer_name is null or char_length(btrim(customer_name)) not between 1 and 120
    or customer_email is null or char_length(customer_email) not between 3 and 254
    or char_length(customer_phone) > 40 or subtotal is null or subtotal not between 0 and 99999999
    or order_items is null or jsonb_typeof(order_items) <> 'array'
    or jsonb_array_length(order_items) not between 1 and 20 then return false; end if;

  select h.* into session from public.crm_host_sessions h
    where h.order_token = link_token and h.status = 'active'
      and (h.kind = 'meeting' or local_today between h.starts_on and h.ends_on)
      and exists (select 1 from public.profiles p where p.id = h.owner_id
        and (p.is_admin is true or (p.account_status is distinct from 'suspended' and exists (
          select 1 from public.lead_team_memberships m where m.user_id = p.id and m.status = 'verified'
        ))))
    for share;
  if not found then return false; end if;
  select to_jsonb(s) - 'owner_id' into seller_snapshot from public.crm_seller_profiles s where s.owner_id = session.owner_id;
  if not found then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(session.id::text || ':' || request_id::text, 0));
  if exists (select 1 from public.crm_orders o where o.host_session_id = session.id and o.host_request_id = request_id)
    then return true; end if;

  customer_email := lower(btrim(customer_email));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(session.owner_id::text || ':' || customer_email, 0));
  select c.id into customer from public.crm_clients c where c.owner_id = session.owner_id
    and lower(btrim(c.email)) = customer_email order by c.id limit 1;
  if customer is null then
    insert into public.crm_clients(owner_id,name,email,phone)
      values(session.owner_id,btrim(customer_name),customer_email,nullif(btrim(customer_phone),''))
      returning id into customer;
  end if;
  insert into public.crm_orders(owner_id,client_id,details,total_cents,shipping_cents,items,source,seller,host_session_id,host_request_id)
    values(session.owner_id,customer,'Commande via un lien hôte',subtotal,session.shipping_cents,order_items,'client',
      seller_snapshot,session.id,request_id);
  return true;
end;
$$;
revoke all on function public.submit_crm_host_order(uuid,uuid,text,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.submit_crm_host_order(uuid,uuid,text,text,text,integer,jsonb) to service_role;

-- FOR SHARE in the order RPC needs an update privilege on the locked table.
grant update (status) on public.crm_host_sessions to service_role;

alter table public.crm_seller_profiles add column payment_links jsonb not null default '[]'
  check (jsonb_typeof(payment_links) = 'array' and jsonb_array_length(payment_links) <= 8);
grant update (payment_links) on public.crm_seller_profiles to authenticated;
grant select (owner_id,payment_links) on public.crm_seller_profiles to service_role;

commit;
