begin;
grant usage on schema private to service_role;
create table public.crm_customer_invites (
  owner_id uuid primary key references public.crm_seller_profiles(owner_id) on delete cascade,
  token uuid not null unique default gen_random_uuid()
);
insert into public.crm_customer_invites(owner_id) select owner_id from public.crm_seller_profiles;
alter table public.crm_customer_invites enable row level security;
revoke all on public.crm_customer_invites from public,anon,authenticated;
grant select on public.crm_customer_invites to authenticated,service_role;
create policy own_crm_customer_invite on public.crm_customer_invites for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

create function private.create_crm_customer_invite() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crm_customer_invites(owner_id) values(new.owner_id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.create_crm_customer_invite() from public,anon,authenticated;
create trigger create_crm_customer_invite after insert on public.crm_seller_profiles
for each row execute function private.create_crm_customer_invite();

alter table public.crm_host_sessions add column host_client_id uuid,
  add constraint crm_host_client_owner foreign key (owner_id,host_client_id) references public.crm_clients(owner_id,id)
    on delete set null (host_client_id);
grant insert (host_client_id), update (host_client_id) on public.crm_host_sessions to authenticated;

create table public.crm_host_clients (
  owner_id uuid not null,
  session_id uuid not null,
  client_id uuid not null,
  primary key (session_id,client_id),
  foreign key (owner_id,session_id) references public.crm_host_sessions(owner_id,id) on delete cascade,
  foreign key (owner_id,client_id) references public.crm_clients(owner_id,id) on delete cascade
);
alter table public.crm_host_clients enable row level security;
revoke all on public.crm_host_clients from public,anon,authenticated;
grant select,insert on public.crm_host_clients to authenticated,service_role;
create policy own_crm_host_clients on public.crm_host_clients to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

create function private.record_crm_host_customer() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.host_session_id is not null then
    insert into public.crm_host_clients(owner_id,session_id,client_id)
    values(new.owner_id,new.host_session_id,new.client_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.record_crm_host_customer() from public,anon,authenticated;
create trigger record_crm_host_customer after insert or update of host_session_id on public.crm_orders
for each row execute function private.record_crm_host_customer();

create table public.crm_customer_klaviyo_queue (
  email text primary key,
  retry_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.crm_customer_klaviyo_queue enable row level security;
revoke all on public.crm_customer_klaviyo_queue from public,anon,authenticated;
grant select,insert,update,delete on public.crm_customer_klaviyo_queue to service_role;

create function public.claim_crm_customer_klaviyo()
returns table(email text, attempts integer) language sql security invoker set search_path = '' as $$
  with pending as (
    select q.email from public.crm_customer_klaviyo_queue q where q.retry_at <= now()
    order by q.retry_at limit 10 for update skip locked
  )
  update public.crm_customer_klaviyo_queue q set attempts = q.attempts + 1,
    retry_at = now() + pg_catalog.make_interval(mins => least(1440, 5 * (1 + q.attempts)))
  from pending p where p.email = q.email returning q.email, q.attempts;
$$;
revoke all on function public.claim_crm_customer_klaviyo() from public,anon,authenticated;
grant execute on function public.claim_crm_customer_klaviyo() to service_role;

create function private.crm_customer_name(value text) returns text
language sql immutable strict set search_path = '' as $$
  select lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')));
$$;

create index crm_clients_birth_lookup on public.crm_clients(owner_id,birth_date) where birth_date is not null;

create function private.resolve_crm_public_customer(consultant uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birth date)
returns uuid language plpgsql security invoker set search_path = '' as $$
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

  select array_agg(c.id) into candidates from public.crm_clients c where c.owner_id = consultant
    and c.birth_date = customer_birth and private.crm_customer_name(c.name) in (normalized,reversed);
  if cardinality(candidates) = 1 then return candidates[1]; end if;
  if cardinality(candidates) > 1 then
    select array_agg(c.id) into candidates from public.crm_clients c where c.owner_id = consultant
      and c.id = any(candidates) and lower(btrim(c.email)) = customer_email;
    if cardinality(candidates) = 1 then return candidates[1]; end if;
    return null;
  end if;

  select array_agg(c.id) into candidates from public.crm_clients c where c.owner_id = consultant
    and c.birth_date is null and private.crm_customer_name(c.name) in (normalized,reversed)
    and lower(btrim(c.email)) = customer_email;
  if cardinality(candidates) = 1 then return candidates[1]; end if;
  if cardinality(candidates) > 1 then return null; end if;

  insert into public.crm_clients(owner_id,name,email,phone,birth_date)
    values(consultant,full_name,customer_email,nullif(btrim(customer_phone),''),customer_birth) returning id into customer;
  return customer;
end;
$$;
revoke all on function private.resolve_crm_public_customer(uuid,text,text,text,text,date) from public,anon,authenticated;
grant execute on function private.resolve_crm_public_customer(uuid,text,text,text,text,date) to service_role;

create function private.crm_public_invitation(invite uuid)
returns table(consultant uuid, host_session uuid, shipping integer)
language sql security invoker set search_path = '' as $$
  select v.owner_id,v.session_id,v.shipping from (
    select h.owner_id,h.id as session_id,h.shipping_cents as shipping from public.crm_host_sessions h
    where h.order_token = invite and h.status = 'active' and
      (h.kind = 'meeting' or (now() at time zone 'Europe/Paris')::date between h.starts_on and h.ends_on)
    union all
    select i.owner_id,null::uuid,0 from public.crm_customer_invites i where i.token = invite
  ) v join public.profiles p on p.id = v.owner_id
    join public.crm_seller_profiles s on s.owner_id = v.owner_id
  where p.is_admin is true or (p.account_status is distinct from 'suspended' and exists (
    select 1 from public.lead_team_memberships m where m.user_id = p.id and m.status = 'verified'
  ));
$$;
revoke all on function private.crm_public_invitation(uuid) from public,anon,authenticated;
grant execute on function private.crm_public_invitation(uuid) to service_role;

create function public.register_crm_customer_invite(invite uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birth date)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  invitation record;
  customer uuid;
begin
  select * into invitation from private.crm_public_invitation(invite);
  if not found then return false; end if;
  customer := private.resolve_crm_public_customer(invitation.consultant,first_name,last_name,customer_email,customer_phone,customer_birth);
  if customer is null then return false; end if;
  if invitation.host_session is not null then
    insert into public.crm_host_clients(owner_id,session_id,client_id)
      values(invitation.consultant,invitation.host_session,customer) on conflict do nothing;
  end if;
  insert into public.crm_customer_klaviyo_queue(email) values(lower(btrim(customer_email))) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.register_crm_customer_invite(uuid,text,text,text,text,date) from public,anon,authenticated;
grant execute on function public.register_crm_customer_invite(uuid,text,text,text,text,date) to service_role;

alter table public.crm_orders drop constraint crm_orders_host_request_check;
create unique index crm_orders_shared_request on public.crm_orders(owner_id,host_request_id) where host_request_id is not null;

create function public.submit_crm_shared_order(invite uuid, request_id uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birth date, subtotal integer, order_items jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  invitation record;
  customer uuid;
  seller_snapshot jsonb;
begin
  if request_id is null or subtotal is null or subtotal not between 0 and 99999999
    or order_items is null or jsonb_typeof(order_items) <> 'array'
    or jsonb_array_length(order_items) not between 1 and 20 then return false; end if;
  select * into invitation from private.crm_public_invitation(invite);
  if not found then return false; end if;
  if invitation.host_session is not null then
    perform 1 from public.crm_host_sessions h where h.id = invitation.host_session and h.status = 'active' for share;
    if not found then return false; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(invitation.consultant::text || ':order:' || request_id::text, 0));
  if exists(select 1 from public.crm_orders o where o.owner_id = invitation.consultant and o.host_request_id = request_id)
    then return true; end if;
  customer := private.resolve_crm_public_customer(invitation.consultant,first_name,last_name,customer_email,customer_phone,customer_birth);
  if customer is null then return false; end if;
  select to_jsonb(s) - 'owner_id' into seller_snapshot from public.crm_seller_profiles s where s.owner_id = invitation.consultant;
  insert into public.crm_orders(owner_id,client_id,details,total_cents,shipping_cents,items,source,seller,
    host_session_id,host_request_id,manual_email_only)
    values(invitation.consultant,customer,case when invitation.host_session is null then 'Commande via un lien consultant'
      else 'Commande via un lien hôte' end,subtotal,invitation.shipping,order_items,'client',seller_snapshot,
      invitation.host_session,request_id,true);
  insert into public.crm_customer_klaviyo_queue(email) values(lower(btrim(customer_email))) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.submit_crm_shared_order(uuid,uuid,text,text,text,text,date,integer,jsonb) from public,anon,authenticated;
grant execute on function public.submit_crm_shared_order(uuid,uuid,text,text,text,text,date,integer,jsonb) to service_role;

create function public.register_crm_customer_with_identity(invite_hash text, next_hash text, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birth date)
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
  customer := private.resolve_crm_public_customer(consultant,first_name,last_name,customer_email,customer_phone,customer_birth);
  if customer is null then return false; end if;
  update public.crm_registration_links set used_at=now() where token_hash=invite_hash;
  insert into public.crm_order_links(token_hash,owner_id,client_id,manual_email_only) values(next_hash,consultant,customer,true);
  insert into public.crm_customer_klaviyo_queue(email) values(lower(btrim(customer_email))) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.register_crm_customer_with_identity(text,text,text,text,text,text,date) from public,anon,authenticated;
grant execute on function public.register_crm_customer_with_identity(text,text,text,text,text,text,date) to service_role;

create or replace function public.submit_crm_order(link_hash text, order_details text, subtotal integer, order_items jsonb)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  claimed public.crm_order_links%rowtype;
begin
  update public.crm_order_links l set used_at = now()
  where l.token_hash = link_hash and l.used_at is null and l.expires_at > now()
    and exists (select 1 from public.crm_clients c where c.owner_id = l.owner_id and c.id = l.client_id and (l.manual_email_only or c.email is not null))
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
$$;
commit;
