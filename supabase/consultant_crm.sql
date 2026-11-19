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
commit;
