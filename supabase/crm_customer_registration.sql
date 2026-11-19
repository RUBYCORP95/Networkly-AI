create table public.crm_registration_links (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz
);
alter table public.crm_registration_links enable row level security;
revoke all on public.crm_registration_links from public, anon, authenticated;
grant insert (token_hash) on public.crm_registration_links to authenticated;
grant select on public.crm_registration_links to service_role;
grant update (used_at) on public.crm_registration_links to service_role;
grant insert (owner_id, name, email, phone, birth_date) on public.crm_clients to service_role;
create policy create_own_crm_registration_link on public.crm_registration_links for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

alter table public.crm_order_links add column manual_email_only boolean not null default false;
grant insert (token_hash, owner_id, client_id, manual_email_only) on public.crm_order_links to service_role;
alter table public.crm_orders add column manual_email_only boolean not null default false;

create function public.register_crm_customer(
  invite_hash text, next_hash text, customer_name text, customer_email text, customer_phone text, customer_birth date
) returns boolean language plpgsql security invoker set search_path = '' as $$
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
    where c.owner_id = consultant and lower(btrim(c.email)) = customer_email
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
$$;
revoke all on function public.register_crm_customer(text,text,text,text,text,date) from public, anon, authenticated;
grant execute on function public.register_crm_customer(text,text,text,text,text,date) to service_role;

create or replace function private.crm_snapshot_order() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.source = 'consultant' then
      select to_jsonb(s) - 'owner_id' into new.seller
      from public.crm_seller_profiles s where s.owner_id = new.owner_id;
      new.seller := coalesce(new.seller, '{}'::jsonb);
    end if;
    select jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone) into new.buyer
    from public.crm_clients c where c.owner_id = new.owner_id and c.id = new.client_id;
    new.buyer := coalesce(new.buyer, '{}'::jsonb);
  end if;
  if new.manual_email_only then return new; end if;
  if (tg_op = 'INSERT' and new.source = 'client') or
      (tg_op = 'UPDATE' and new.status in ('confirmed', 'completed') and old.email_state in ('not_requested', 'missing_email')) then
    if tg_op = 'UPDATE' then
      select jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone) into new.buyer
      from public.crm_clients c where c.owner_id = new.owner_id and c.id = new.client_id;
    end if;
    if coalesce(new.buyer->>'email', '') = '' then
      new.email_state := 'missing_email';
    else
      new.email_state := 'queued';
      new.email_next_at := now();
    end if;
  end if;
  return new;
end;
$$;
create or replace function public.submit_crm_order(link_hash text, order_details text, subtotal integer, order_items jsonb)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  claimed public.crm_order_links%rowtype;
begin
  update public.crm_order_links l set used_at = now()
  where l.token_hash = link_hash and l.used_at is null and l.expires_at > now()
    and exists (select 1 from public.crm_clients c where c.owner_id = l.owner_id and c.id = l.client_id and c.email is not null)
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
