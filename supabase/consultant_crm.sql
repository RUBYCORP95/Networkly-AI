begin;
create table public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  birth_date date,
  birthday_notification boolean not null default false,
  unique (owner_id, id),
  check (not birthday_notification or birth_date is not null)
);

create table public.crm_followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  client_id uuid not null,
  delay_days integer not null check (delay_days between 1 and 3650),
  created_at timestamptz not null default now(),
  due_date date generated always as ((created_at at time zone 'Europe/Paris')::date + delay_days) stored,
  notification boolean not null default false,
  completed_at timestamptz,
  foreign key (owner_id, client_id) references public.crm_clients(owner_id, id) on delete cascade
);

create index crm_followups_owner_due on public.crm_followups(owner_id, due_date);
alter table public.crm_clients enable row level security;
alter table public.crm_followups enable row level security;
revoke all on public.crm_clients, public.crm_followups from public, anon, authenticated;
grant select on public.crm_clients, public.crm_followups to authenticated;
grant insert (name, email, phone, birth_date, birthday_notification),
  update (name, email, phone, birth_date, birthday_notification) on public.crm_clients to authenticated;
grant insert (client_id, delay_days, notification), update (notification, completed_at)
  on public.crm_followups to authenticated;

create policy own_crm_clients on public.crm_clients to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
create policy own_crm_followups on public.crm_followups to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
create table public.crm_seller_profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  business text not null default '' check (char_length(business) <= 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null default '' check (char_length(phone) <= 40),
  address text not null default '' check (char_length(address) <= 500),
  registration text not null default '' check (char_length(registration) <= 50)
);
alter table public.crm_seller_profiles enable row level security;
revoke all on public.crm_seller_profiles from public, anon, authenticated;
grant select on public.crm_seller_profiles to authenticated;
grant insert (name, business, email, phone, address, registration),
  update (name, business, email, phone, address, registration) on public.crm_seller_profiles to authenticated;
create policy own_crm_sellers on public.crm_seller_profiles to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

create table public.crm_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  details text not null check (char_length(btrim(details)) between 1 and 4000),
  total_cents integer check (total_cents between 0 and 99999999),
  shipping_cents integer not null default 0 check (shipping_cents between 0 and 99999999),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20),
  seller jsonb not null default '{}'::jsonb,
  buyer jsonb not null default '{}'::jsonb,
  source text not null default 'consultant' check (source in ('consultant', 'client')),
  email_state text not null default 'not_requested' check (email_state in ('not_requested', 'missing_email', 'queued', 'sending', 'sent', 'failed')),
  email_attempts integer not null default 0,
  email_next_at timestamptz,
  email_sent_at timestamptz,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'later')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  foreign key (owner_id, client_id) references public.crm_clients(owner_id, id) on delete cascade
);
create index crm_orders_owner_client_date on public.crm_orders(owner_id, client_id, created_at desc);
alter table public.crm_orders enable row level security;
revoke all on public.crm_orders from public, anon, authenticated;
grant select on public.crm_orders to authenticated;
grant insert (client_id, details, total_cents, shipping_cents, items), update (status, shipping_cents, payment_status) on public.crm_orders to authenticated;
create policy own_crm_orders on public.crm_orders to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

create table public.crm_order_links (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null default auth.uid(),
  client_id uuid not null,
  shipping_cents integer not null default 0 check (shipping_cents between 0 and 99999999),
  seller jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  foreign key (owner_id, client_id) references public.crm_clients(owner_id, id) on delete cascade
);
alter table public.crm_order_links enable row level security;
revoke all on public.crm_order_links from public, anon, authenticated;
grant insert (token_hash, client_id, shipping_cents) on public.crm_order_links to authenticated;
grant select, update on public.crm_order_links to service_role;
grant select, update on public.crm_orders to service_role;
grant select on public.crm_clients to service_role;
grant insert on public.crm_orders to service_role;
create index crm_orders_email_queue on public.crm_orders (email_next_at)
  where email_state in ('queued', 'sending');

-- Fill snapshots from tenant-owned records, never from public form input.
create function private.crm_snapshot_order() returns trigger language plpgsql security definer set search_path = ''
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
revoke all on function private.crm_snapshot_order() from public, anon, authenticated;
create trigger crm_order_email_and_snapshots before insert or update of status on public.crm_orders
for each row execute function private.crm_snapshot_order();

create function private.crm_snapshot_link() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select to_jsonb(s) - 'owner_id' into new.seller
  from public.crm_seller_profiles s where s.owner_id = new.owner_id;
  return new;
end;
$$;
revoke all on function private.crm_snapshot_link() from public, anon, authenticated;
create trigger crm_order_link_snapshot before insert on public.crm_order_links
for each row execute function private.crm_snapshot_link();

create policy create_own_crm_order_links on public.crm_order_links for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

-- Claim the link and insert its order in the same transaction. Concurrent submissions can only succeed once.
create function public.submit_crm_order(link_hash text, order_details text, subtotal integer, order_items jsonb)
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
  insert into public.crm_orders (owner_id, client_id, details, total_cents, shipping_cents, items, source, seller)
  values (claimed.owner_id, claimed.client_id, order_details, subtotal, claimed.shipping_cents, order_items, 'client', claimed.seller);
  return true;
end;
$$;
revoke all on function public.submit_crm_order(text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.submit_crm_order(text, text, integer, jsonb) to service_role;

create function public.claim_crm_order_emails() returns setof public.crm_orders
language sql security invoker set search_path = ''
as $$
  update public.crm_orders o
    set email_state = 'sending', email_attempts = o.email_attempts + 1,
        email_next_at = now() + interval '5 minutes'
  from (
    select id from public.crm_orders
    where email_state in ('queued', 'sending') and email_next_at <= now() and email_attempts < 3
    order by email_next_at limit 10 for update skip locked
  ) job
  where o.id = job.id returning o.*;
$$;
revoke all on function public.claim_crm_order_emails() from public, anon, authenticated;
grant execute on function public.claim_crm_order_emails() to service_role;

commit;
