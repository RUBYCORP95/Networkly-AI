-- TESAMI LeadFactory: contact details unlock on explicit click; unopened leads expire after 48 hours.
-- This migration is safe for existing assignments and does not create test contacts.
alter table public.lead_assignments
  add column if not exists revealed_at timestamptz;

create table if not exists public.lead_assignment_expirations (
  assignment_id uuid primary key,
  organization_id uuid not null references public.lead_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  originally_assigned_at timestamptz not null,
  expired_at timestamptz not null default now()
);
create index if not exists lead_expirations_user_org_idx
  on public.lead_assignment_expirations(user_id, organization_id);
alter table public.lead_assignment_expirations enable row level security;
revoke all on public.lead_assignment_expirations from public, anon, authenticated;
grant all on public.lead_assignment_expirations to service_role;

-- No direct REST access to the organization rows, including phone/email/socials.
-- The authenticated Next.js API returns a redacted view until the owner clicks.
revoke all on public.lead_organizations from public, anon, authenticated;
grant all on public.lead_organizations to service_role;

-- Only a backend holding the service-role key can expire/claim/reveal assignments.
create or replace function public.expire_unopened_leads()
returns integer language plpgsql security definer set search_path = public as $$
declare expired_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  with expired as (
    delete from public.lead_assignments
    where revealed_at is null and assigned_at <= now() - interval '48 hours'
    returning id, organization_id, user_id, assigned_at
  ), archived as (
    insert into public.lead_assignment_expirations
      (assignment_id, organization_id, user_id, originally_assigned_at)
    select id, organization_id, user_id, assigned_at from expired
    on conflict (assignment_id) do nothing
    returning assignment_id
  )
  select count(*) into expired_count from archived;
  return expired_count;
end;
$$;
revoke all on function public.expire_unopened_leads() from public, anon, authenticated;
grant execute on function public.expire_unopened_leads() to service_role;

create or replace function public.reveal_assigned_lead_contact(p_assignment_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare did_reveal boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  update public.lead_assignments
  set revealed_at = coalesce(revealed_at, now())
  where id = p_assignment_id and user_id = p_user_id
    and (revealed_at is not null or assigned_at > now() - interval '48 hours');
  did_reveal := found;
  return did_reveal;
end;
$$;
revoke all on function public.reveal_assigned_lead_contact(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reveal_assigned_lead_contact(uuid, uuid) to service_role;

-- The daily claim RPC also remembers expired assignments, to avoid returning the
-- same untouched prospect to the same consultant again.
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
 if exists(select 1 from public.lead_assignment_expirations where organization_id=p_organization_id and user_id=p_user_id) then return false; end if;
 insert into public.lead_assignments(organization_id,user_id) values(p_organization_id,p_user_id) on conflict(organization_id) do nothing;
 return found;
end; $$;
revoke all on function public.claim_lead_for_user(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_lead_for_user(uuid,uuid,integer) to service_role;
