alter table public.crm_clients add column archived_at timestamptz;

-- Keep existing ownership policies and prevent ordinary updates to archived records.
create policy active_crm_client_updates on public.crm_clients as restrictive
  for update to authenticated using (archived_at is null) with check (archived_at is null);

create function private.archive_crm_client(p_client_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  administrator boolean;
begin
  if actor is null or not private.can_manage_travelling_cases() then
    return false;
  end if;

  select p.is_admin into administrator from public.profiles p where p.id = actor;
  update public.crm_clients c set archived_at = now()
    where c.id = p_client_id and (c.owner_id = actor or administrator is true)
      and c.archived_at is null;
  if found then return true; end if;

  return exists (
    select 1 from public.crm_clients c
    where c.id = p_client_id and (c.owner_id = actor or administrator is true)
      and c.archived_at is not null
  );
end;
$$;
revoke all on function private.archive_crm_client(uuid) from public, anon, authenticated;
grant execute on function private.archive_crm_client(uuid) to authenticated;

create function public.archive_crm_client(p_client_id uuid)
returns boolean language sql security invoker set search_path = ''
begin atomic
  select private.archive_crm_client(p_client_id);
end;
revoke all on function public.archive_crm_client(uuid) from public, anon, authenticated;
grant execute on function public.archive_crm_client(uuid) to authenticated;

-- Serialize new orders, public order links and reminders with archiving. Existing
-- orders and invoices keep their client reference and remain accessible.
create function private.require_active_crm_client()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.crm_clients c
    where c.id = new.client_id and c.owner_id = new.owner_id and c.archived_at is null
    for share;
  if not found then
    raise exception using errcode = '23514', message = 'Client is not active';
  end if;
  return new;
end;
$$;
revoke all on function private.require_active_crm_client() from public, anon, authenticated;

create trigger require_active_crm_client before insert on public.crm_orders
  for each row execute function private.require_active_crm_client();
create trigger require_active_crm_client before insert on public.crm_order_links
  for each row execute function private.require_active_crm_client();
create trigger require_active_crm_client before insert on public.crm_followups
  for each row execute function private.require_active_crm_client();

-- Fresh registrations and prospect conversions match active records only.

CREATE OR REPLACE FUNCTION public.convert_my_lead_to_client(p_allocation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  consultant uuid := (select auth.uid());
  allocation public.lead_daily_allocations%rowtype;
  contact record;
  contact_name text;
  contact_email text;
  contact_phone text;
  contact_location text;
  phone_key text;
  client_id uuid;
begin
  if consultant is null or not public.can_access_my_leads() or not private.can_manage_travelling_cases() then
    raise exception using errcode='42501', message='Lead conversion access denied';
  end if;

  select * into allocation from public.lead_daily_allocations a
    where a.id = p_allocation_id and a.user_id = consultant and a.released_at is null and a.revealed_at is not null
    for update;
  if not found then return null; end if;
  if allocation.converted_client_id is not null then return allocation.converted_client_id; end if;

  select * into contact from public.reveal_my_daily_allocation(allocation.id);
  contact_email := nullif(lower(btrim(contact.email)), '');
  contact_phone := nullif(btrim(contact.phone), '');
  phone_key := private.lead_phone_key(contact_phone);
  contact_name := left(coalesce(
    nullif(concat_ws(' ',nullif(btrim(contact.first_name),''),nullif(btrim(contact.last_name),'')),''),
    nullif(btrim(contact.company),''), contact_email, contact_phone, 'Contact LeadFactory'
  ),120);

  if allocation.contact_kind = 'klaviyo' then
    select left(nullif(concat_ws(' ',nullif(btrim(k.postal_code),''),nullif(btrim(k.city),'')),''),150) into contact_location
      from public.lead_private_klaviyo_contacts k where k.id=allocation.contact_id;
  else
    select left(nullif(concat_ws(' ',nullif(btrim(p.postal_code),''),nullif(btrim(p.city),'')),''),150) into contact_location
      from public.lead_private_professional_imports p where p.id=allocation.contact_id;
  end if;

  if phone_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(consultant::text || ':lead-phone:' || phone_key,0));
  end if;
  if contact_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(consultant::text || ':' || contact_email,0));
    select c.id into client_id from public.crm_clients c where c.owner_id=consultant and c.archived_at is null
      and lower(btrim(c.email))=contact_email order by c.id limit 1;
  end if;

  if client_id is null and phone_key is not null then
    select c.id into client_id from public.crm_clients c where c.owner_id=consultant and c.archived_at is null
      and private.lead_phone_key(c.phone)=phone_key
      and (contact_email is null or nullif(btrim(c.email),'') is null)
      order by c.id limit 1;
  end if;

  if client_id is null then
    insert into public.crm_clients (owner_id,name,email,phone,lead_source,lead_location,lead_note)
    values(consultant,contact_name,left(contact_email,254),left(contact_phone,40),allocation.contact_kind,
      contact_location,'Client issu de LeadFactory') returning id into client_id;
  else
    update public.crm_clients c set
      email=coalesce(nullif(btrim(c.email),''),left(contact_email,254)),
      phone=coalesce(nullif(btrim(c.phone),''),left(contact_phone,40)),
      lead_source=coalesce(c.lead_source,allocation.contact_kind),
      lead_location=coalesce(c.lead_location,contact_location),
      lead_note=coalesce(c.lead_note,'Client issu de LeadFactory')
    where c.id=client_id and c.owner_id=consultant;
  end if;

  update public.lead_daily_allocations set converted_client_id=client_id
    where id=allocation.id and user_id=consultant;
  return client_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_crm_customer(invite_hash text, next_hash text, customer_name text, customer_email text, customer_phone text, customer_birth date)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  consultant uuid;
  customer uuid;
begin
  if customer_name is null or length(btrim(customer_name)) not between 1 and 120
    or customer_email is null or length(customer_email) not between 3 and 254
    or customer_phone is null or length(customer_phone) not between 6 and 40
    or customer_birth > (now() at time zone 'Europe/Paris')::date then
    return false;
  end if;

  -- Claim once, after the caller has explicitly accepted the registration form.
  update public.crm_registration_links l set used_at = now()
  where l.token_hash = invite_hash and l.used_at is null and l.expires_at > now()
    and exists (select 1 from public.crm_seller_profiles s where s.owner_id = l.owner_id)
    and exists (select 1 from public.profiles p where p.id = l.owner_id and
      (p.is_admin is true or (p.account_status is distinct from 'suspended' and exists (
        select 1 from public.lead_team_memberships m where m.user_id = p.id and m.status = 'verified'
      ))))
  returning l.owner_id into consultant;
  if not found then return false; end if;

  customer_email := lower(btrim(customer_email));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(consultant::text || ':' || customer_email, 0));
  select c.id into customer from public.crm_clients c
    where c.owner_id = consultant and c.archived_at is null and lower(btrim(c.email)) = customer_email
    order by c.id limit 1;
  if customer is null then
    insert into public.crm_clients (owner_id, name, email, phone, birth_date)
    values (consultant, btrim(customer_name), customer_email, btrim(customer_phone), customer_birth)
    returning id into customer;
  end if;
  insert into public.crm_order_links (token_hash, owner_id, client_id, manual_email_only)
    values (next_hash, consultant, customer, true);
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.resolve_crm_public_customer(consultant uuid, first_name text, last_name text, customer_email text, customer_phone text, customer_birth date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  full_name text := btrim(first_name) || ' ' || btrim(last_name);
  normalized text := private.crm_customer_name(full_name);
  reversed text := private.crm_customer_name(last_name || ' ' || first_name);
  candidates uuid[];
  customer uuid;
begin
  if first_name is null or char_length(btrim(first_name)) not between 1 and 60
    or last_name is null or char_length(btrim(last_name)) not between 1 and 59
    or customer_email is null or char_length(customer_email) not between 3 and 254
    or customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(customer_phone) > 40 or customer_birth is null
    or customer_birth < '1900-01-01' or customer_birth > (now() at time zone 'Europe/Paris')::date then return null; end if;

  customer_email := lower(btrim(customer_email));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(consultant::text || ':identity:' ||
    least(normalized,reversed) || ':' || greatest(normalized,reversed) || ':' || customer_birth::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(consultant::text || ':' || customer_email, 0));

  select array_agg(c.id) into candidates from public.crm_clients c where c.owner_id = consultant and c.archived_at is null
    and c.birth_date = customer_birth and private.crm_customer_name(c.name) in (normalized,reversed);
  if cardinality(candidates) = 1 then return candidates[1]; end if;
  if cardinality(candidates) > 1 then
    select array_agg(c.id) into candidates from public.crm_clients c where c.owner_id = consultant and c.archived_at is null
      and c.id = any(candidates) and lower(btrim(c.email)) = customer_email;
    if cardinality(candidates) = 1 then return candidates[1]; end if;
    return null;
  end if;

  select array_agg(c.id) into candidates from public.crm_clients c where c.owner_id = consultant and c.archived_at is null
    and c.birth_date is null and private.crm_customer_name(c.name) in (normalized,reversed)
    and lower(btrim(c.email)) = customer_email;
  if cardinality(candidates) = 1 then return candidates[1]; end if;
  if cardinality(candidates) > 1 then return null; end if;

  insert into public.crm_clients(owner_id,name,email,phone,birth_date)
    values(consultant,full_name,customer_email,nullif(btrim(customer_phone),''),customer_birth) returning id into customer;
  return customer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_crm_host_order(link_token uuid, request_id uuid, customer_name text, customer_email text, customer_phone text, subtotal integer, order_items jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  select c.id into customer from public.crm_clients c where c.owner_id = session.owner_id and c.archived_at is null
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
$function$;

CREATE OR REPLACE FUNCTION public.submit_crm_order(link_hash text, order_details text, subtotal integer, order_items jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  claimed public.crm_order_links%rowtype;
begin
  update public.crm_order_links l set used_at = now()
  where l.token_hash = link_hash and l.used_at is null and l.expires_at > now()
    and exists (select 1 from public.crm_clients c where c.owner_id = l.owner_id and c.id = l.client_id and c.archived_at is null
      and (l.manual_email_only or c.email is not null))
    and exists (select 1 from public.profiles p where p.id = l.owner_id and
      (p.is_admin is true or (p.account_status is distinct from 'suspended' and exists (
        select 1 from public.lead_team_memberships m where m.user_id = p.id and m.status = 'verified'
      ))))
  returning l.* into claimed;
  if not found then return false; end if;
  insert into public.crm_orders (owner_id, client_id, details, total_cents, shipping_cents, items, source, seller, manual_email_only)
  values (claimed.owner_id, claimed.client_id, order_details, subtotal, claimed.shipping_cents, order_items, 'client', claimed.seller, claimed.manual_email_only);
  return true;
end;
$function$;
