-- TESAMI LeadFactory: Chogan team access is free, independently of TESAMI subscription.
-- Apply AFTER leadfactory.sql. Only service-role backend may approve members.
create table if not exists public.lead_team_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 consultant_identifier text,
 status text not null default 'pending' check (status in ('pending','verified','rejected','revoked')),
 verified_at timestamptz,
 verified_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists lead_team_memberships_status_idx on public.lead_team_memberships(status);
alter table public.lead_team_memberships enable row level security;
create policy "team members read own verification" on public.lead_team_memberships
 for select to authenticated using (user_id=auth.uid());
-- No client INSERT/UPDATE/DELETE policy. Approval must be performed by service role.
create or replace function public.is_verified_lead_team_member(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.lead_team_memberships where user_id=p_user_id and status='verified')
$$;
revoke all on function public.is_verified_lead_team_member(uuid) from public,anon,authenticated;
grant execute on function public.is_verified_lead_team_member(uuid) to service_role;
