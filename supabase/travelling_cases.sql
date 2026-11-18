begin;

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.travelling_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  unique (owner_id, id)
);

create table public.travelling_case_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  case_id uuid not null,
  destination text not null check (char_length(btrim(destination)) between 1 and 160),
  starts_on date not null,
  ends_on date not null,
  cancelled boolean not null default false,
  check (starts_on <= ends_on),
  foreign key (owner_id, case_id) references public.travelling_cases(owner_id, id) on delete cascade,
  exclude using gist (case_id with =, daterange(starts_on, ends_on, '[]') with &&) where (not cancelled)
);

create index travelling_case_trips_owner_idx on public.travelling_case_trips(owner_id, starts_on);

-- Mirror the app's consultant gate for direct requests to Supabase.
create schema if not exists private;
create function private.can_manage_travelling_cases() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and (
      p.is_admin is true or (
        p.account_status is distinct from 'suspended' and exists (
          select 1 from public.lead_team_memberships m
          where m.user_id = p.id and m.status = 'verified'
        )
      )
    )
  );
$$;

revoke all on function private.can_manage_travelling_cases() from public, anon;
grant execute on function private.can_manage_travelling_cases() to authenticated;
alter table public.travelling_cases enable row level security;
alter table public.travelling_case_trips enable row level security;
revoke all on public.travelling_cases, public.travelling_case_trips from anon, authenticated;
grant select, insert on public.travelling_cases, public.travelling_case_trips to authenticated;
grant update (cancelled) on public.travelling_case_trips to authenticated;
create policy own_cases on public.travelling_cases to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
create policy own_case_trips on public.travelling_case_trips to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

commit;
