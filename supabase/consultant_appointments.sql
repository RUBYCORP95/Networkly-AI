begin;
create table public.consultant_appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_allocation_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  place text not null default '' check (char_length(place) <= 240),
  day date not null,
  starts_at time not null,
  ends_at time not null,
  cancelled boolean not null default false,
  check (starts_at < ends_at)
);
create index consultant_appointments_owner_day_idx on public.consultant_appointments(owner_id, day);
alter table public.consultant_appointments enable row level security;
revoke all on public.consultant_appointments from anon, authenticated;
grant select, insert on public.consultant_appointments to authenticated;
grant update (cancelled) on public.consultant_appointments to authenticated;
create policy own_appointments on public.consultant_appointments to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));
commit;
