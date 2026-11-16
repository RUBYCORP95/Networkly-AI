-- TESAMI LeadFactory V1. Apply manually in Supabase SQL editor.
create table if not exists public.lead_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 city text not null default '',
 radius_km integer not null default 25 check(radius_km between 1 and 100),
 sectors text[] not null default array['coiffure','beaute']::text[],
 daily_quota integer not null default 5 check(daily_quota between 1 and 20),
 updated_at timestamptz not null default now()
);
create table if not exists public.lead_organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 sector text not null,
 city text not null,
 address text,
 website text,
 email text,
 phone text,
 socials jsonb not null default '{}'::jsonb,
 source_url text not null,
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 constraint lead_source_unique unique(source_url)
);
create table if not exists public.lead_assignments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.lead_organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'new' check(status in ('new','contacted','interested','converted','closed')),
 assigned_at timestamptz not null default now(),
 exclusive_until timestamptz not null default (now() + interval '30 days'),
 unique(organization_id)
);
create table if not exists public.lead_suppressions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null unique references public.lead_organizations(id) on delete cascade,
 reason text not null,
 created_at timestamptz not null default now()
);
create index if not exists lead_assignments_user_idx on public.lead_assignments(user_id,assigned_at desc);
alter table public.lead_preferences enable row level security;
alter table public.lead_organizations enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.lead_suppressions enable row level security;
create policy "lead preferences own select" on public.lead_preferences for select to authenticated using(auth.uid()=user_id);
create policy "lead preferences own insert" on public.lead_preferences for insert to authenticated with check(auth.uid()=user_id);
create policy "lead preferences own update" on public.lead_preferences for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "lead assignments own select" on public.lead_assignments for select to authenticated using(auth.uid()=user_id);
create policy "lead organizations assigned select" on public.lead_organizations for select to authenticated using(exists(select 1 from public.lead_assignments a where a.organization_id=id and a.user_id=auth.uid()));
-- Assignment and organization writes are reserved for server-side service role.
-- Suppressions are deliberately inaccessible to client roles.

-- Atomic, idempotent assignment: only one consultant can claim an organization.
create or replace function public.claim_lead_for_user(p_organization_id uuid,p_user_id uuid,p_daily_quota integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
 if p_daily_quota < 1 or p_daily_quota > 20 then return false; end if;
 perform pg_advisory_xact_lock(hashtext(p_user_id::text));
 select count(*) into n from public.lead_assignments where user_id=p_user_id and assigned_at >= date_trunc('day',now());
 if n >= p_daily_quota then return false; end if;
 if exists(select 1 from public.lead_suppressions where organization_id=p_organization_id) then return false; end if;
 insert into public.lead_assignments(organization_id,user_id) values(p_organization_id,p_user_id) on conflict(organization_id) do nothing;
 return found;
end; $$;
revoke all on function public.claim_lead_for_user(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_lead_for_user(uuid,uuid,integer) to service_role;

-- A consultant can change only the status of their own assigned prospect.
create or replace function public.update_my_lead_status(p_assignment_id uuid,p_status text)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null or p_status not in ('new','contacted','interested','converted','closed') then return false; end if;
 update public.lead_assignments set status=p_status where id=p_assignment_id and user_id=auth.uid();
 return found;
end; $$;
create policy "lead assignments own status update" on public.lead_assignments
 for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
revoke update on public.lead_assignments from authenticated;
grant update(status) on public.lead_assignments to authenticated;
revoke all on function public.update_my_lead_status(uuid,text) from public,anon;
grant execute on function public.update_my_lead_status(uuid,text) to authenticated;
