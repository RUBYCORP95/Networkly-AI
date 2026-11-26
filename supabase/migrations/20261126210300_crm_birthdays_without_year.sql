begin;

alter table public.crm_clients
  add column birth_month smallint,
  add column birth_day smallint,
  drop constraint crm_clients_check,
  add constraint crm_clients_partial_birthday_check check (
    (birth_month is null and birth_day is null) or
    (birth_date is null and birth_month is not null and birth_day is not null
      and birth_month between 1 and 12 and birth_day between 1 and
        case when birth_month = 2 then 29 when birth_month in (4, 6, 9, 11) then 30 else 31 end)
  ),
  add constraint crm_clients_birthday_notification_check
    check (not birthday_notification or birth_date is not null or birth_month is not null);

grant insert (birth_month, birth_day), update (birth_month, birth_day)
  on public.crm_clients to authenticated;
grant insert (birth_month, birth_day), update (birth_date, birth_month, birth_day)
  on public.crm_clients to service_role;

create function private.resolve_crm_public_customer(
  consultant uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birthday text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  full_name text := btrim(first_name) || ' ' || btrim(last_name);
  normalized text := private.crm_customer_name(full_name);
  reversed text := private.crm_customer_name(last_name || ' ' || first_name);
  month_day text := right(customer_birthday, 5);
  birth_month_value smallint;
  birth_day_value smallint;
  birth_date_value date;
  candidates uuid[];
  customer uuid;
begin
  if first_name is null or char_length(btrim(first_name)) not between 1 and 60
    or last_name is null or char_length(btrim(last_name)) not between 1 and 59
    or customer_email is null or char_length(customer_email) not between 3 and 254
    or customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(customer_phone) > 40 or customer_birthday is null
    or customer_birthday !~ '^([0-9]{4}-)?[0-9]{2}-[0-9]{2}$' then return null; end if;

  birth_month_value := left(month_day, 2)::smallint;
  birth_day_value := right(month_day, 2)::smallint;
  if birth_month_value not between 1 and 12 or birth_day_value not between 1 and (
    case when birth_month_value = 2 then 29 when birth_month_value in (4, 6, 9, 11) then 30 else 31 end)
    then return null; end if;

  if length(customer_birthday) = 10 then
    begin
      birth_date_value := customer_birthday::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      return null;
    end;
    if birth_date_value < '1900-01-01' or birth_date_value > (now() at time zone 'Europe/Paris')::date
      then return null; end if;
  end if;

  customer_email := lower(btrim(customer_email));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(consultant::text || ':identity:' ||
    least(normalized,reversed) || ':' || greatest(normalized,reversed) || ':' || month_day, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(consultant::text || ':' || customer_email, 0));

  if birth_date_value is not null then
    select array_agg(c.id) into candidates from public.crm_clients c
      where c.owner_id = consultant and c.archived_at is null and c.birth_date = birth_date_value
        and private.crm_customer_name(c.name) in (normalized,reversed);
    if cardinality(candidates) = 1 then return candidates[1]; end if;
    if cardinality(candidates) > 1 then
      select array_agg(c.id) into candidates from public.crm_clients c
        where c.id = any(candidates) and lower(btrim(c.email)) = customer_email;
      if cardinality(candidates) = 1 then return candidates[1]; end if;
      return null;
    end if;
  end if;

  -- An incomplete birthday needs a matching email as well as a matching name.
  select array_agg(c.id) into candidates from public.crm_clients c
    where c.owner_id = consultant and c.archived_at is null
      and private.crm_customer_name(c.name) in (normalized,reversed) and lower(btrim(c.email)) = customer_email
      and (
        (c.birth_date is null and (c.birth_month is null
          or (c.birth_month = birth_month_value and c.birth_day = birth_day_value)))
        or (birth_date_value is null and extract(month from c.birth_date) = birth_month_value
          and extract(day from c.birth_date) = birth_day_value)
      );
  if cardinality(candidates) > 1 then return null; end if;
  if cardinality(candidates) = 1 then
    customer := candidates[1];
    update public.crm_clients c
      set birth_date = birth_date_value,
          birth_month = case when birth_date_value is null then birth_month_value end,
          birth_day = case when birth_date_value is null then birth_day_value end
      where c.id = customer and c.owner_id = consultant and c.archived_at is null and c.birth_date is null
        and (c.birth_month is null or (birth_date_value is not null
          and c.birth_month = birth_month_value and c.birth_day = birth_day_value));
    return customer;
  end if;

  insert into public.crm_clients(owner_id,name,email,phone,birth_date,birth_month,birth_day)
    values(consultant,full_name,customer_email,nullif(btrim(customer_phone),''),birth_date_value,
      case when birth_date_value is null then birth_month_value end,
      case when birth_date_value is null then birth_day_value end)
    returning id into customer;
  return customer;
end;
$$;
revoke all on function private.resolve_crm_public_customer(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.resolve_crm_public_customer(uuid,text,text,text,text,text) to service_role;

create or replace function private.resolve_crm_public_customer(
  consultant uuid, first_name text, last_name text, customer_email text, customer_phone text, customer_birth date
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.resolve_crm_public_customer(consultant, first_name, last_name,
    customer_email, customer_phone, pg_catalog.to_char(customer_birth, 'YYYY-MM-DD'));
$$;

create function public.register_crm_customer_invite(invite uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birthday text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  invitation record;
  customer uuid;
begin
  select * into invitation from private.crm_public_invitation(invite);
  if not found then return false; end if;
  customer := private.resolve_crm_public_customer(invitation.consultant,first_name,last_name,customer_email,customer_phone,customer_birthday);
  if customer is null then return false; end if;
  if invitation.host_session is not null then
    insert into public.crm_host_clients(owner_id,session_id,client_id)
      values(invitation.consultant,invitation.host_session,customer) on conflict do nothing;
  end if;
  insert into public.crm_customer_klaviyo_queue(email) values(lower(btrim(customer_email))) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.register_crm_customer_invite(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_crm_customer_invite(uuid,text,text,text,text,text) to service_role;

create function public.register_crm_customer_with_identity(invite_hash text, next_hash text, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birthday text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  consultant uuid;
  customer uuid;
begin
  select l.owner_id into consultant from public.crm_registration_links l
    where l.token_hash = invite_hash and l.used_at is null and l.expires_at > now()
      and exists(select 1 from public.crm_seller_profiles s where s.owner_id=l.owner_id)
      and exists(select 1 from public.profiles p where p.id=l.owner_id and
        (p.is_admin is true or (p.account_status is distinct from 'suspended' and exists(
          select 1 from public.lead_team_memberships m where m.user_id=p.id and m.status='verified'
        )))) for update;
  if not found then return false; end if;
  customer := private.resolve_crm_public_customer(consultant,first_name,last_name,customer_email,customer_phone,customer_birthday);
  if customer is null then return false; end if;
  update public.crm_registration_links set used_at=now() where token_hash=invite_hash;
  insert into public.crm_order_links(token_hash,owner_id,client_id,manual_email_only) values(next_hash,consultant,customer,true);
  insert into public.crm_customer_klaviyo_queue(email) values(lower(btrim(customer_email))) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.register_crm_customer_with_identity(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_crm_customer_with_identity(text,text,text,text,text,text,text) to service_role;

create function public.submit_crm_delivery_choice(invite uuid, request_id uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birthday text, subtotal integer, order_items jsonb, destination text, selected_mode text, promo_code text)
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
  customer := private.resolve_crm_public_customer(invitation.consultant,first_name,last_name,customer_email,customer_phone,customer_birthday);
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
revoke all on function public.submit_crm_delivery_choice(uuid,uuid,text,text,text,text,text,integer,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_crm_delivery_choice(uuid,uuid,text,text,text,text,text,integer,jsonb,text,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
