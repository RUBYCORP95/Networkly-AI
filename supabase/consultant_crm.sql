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
create table public.crm_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  details text not null check (char_length(btrim(details)) between 1 and 4000),
  total_cents integer check (total_cents between 0 and 99999999),
  shipping_cents integer not null default 0 check (shipping_cents between 0 and 99999999),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20),
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
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  foreign key (owner_id, client_id) references public.crm_clients(owner_id, id) on delete cascade
);
alter table public.crm_order_links enable row level security;
revoke all on public.crm_order_links from public, anon, authenticated;
grant insert (token_hash, client_id, shipping_cents) on public.crm_order_links to authenticated;
grant select, update on public.crm_order_links to service_role;
grant insert on public.crm_orders to service_role;
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
    and exists (select 1 from public.profiles p where p.id = l.owner_id and
      (p.is_admin is true or (p.account_status is distinct from 'suspended' and exists (
        select 1 from public.lead_team_memberships m where m.user_id = p.id and m.status = 'verified'
      ))))
  returning l.* into claimed;
  if not found then return false; end if;
  insert into public.crm_orders (owner_id, client_id, details, total_cents, shipping_cents, items)
  values (claimed.owner_id, claimed.client_id, order_details, subtotal, claimed.shipping_cents, order_items);
  return true;
end;
$$;
revoke all on function public.submit_crm_order(text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.submit_crm_order(text, text, integer, jsonb) to service_role;

commit;
