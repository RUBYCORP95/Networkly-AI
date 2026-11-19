alter table public.lead_team_memberships
  add column sponsor_code text check (char_length(sponsor_code) between 2 and 100),
  add column applicant_name text check (char_length(applicant_name) between 2 and 161);

create table public.lead_team_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  admin_id uuid not null,
  consultant_identifier text not null,
  sponsor_code text,
  applicant_name text,
  decision text not null check (decision in ('verified','rejected')),
  decided_at timestamptz not null default now()
);
alter table public.lead_team_decisions enable row level security;
revoke all on public.lead_team_decisions from public, anon, authenticated, service_role;
grant select, insert on public.lead_team_decisions to service_role;
grant select, update on public.lead_team_memberships to service_role;

create function public.request_my_lead_team_access(p_consultant_identifier text, p_sponsor_code text, p_applicant_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  requester uuid := auth.uid();
  current_status text;
begin
  if requester is null or not exists (
    select 1 from public.profiles where id=requester and account_status is distinct from 'suspended'
  ) then raise exception 'Compte inaccessible'; end if;
  if coalesce(length(btrim(p_sponsor_code)),0) not between 2 and 100 then raise exception 'Indique ton code sponsor CHOGAN'; end if;

  if coalesce(length(btrim(p_applicant_name)),0) not between 2 and 161 then raise exception 'Indique ton nom et ton prénom'; end if;

  perform public.request_my_lead_team_access(p_consultant_identifier);
  update public.lead_team_memberships set sponsor_code=btrim(p_sponsor_code), applicant_name=btrim(p_applicant_name)
    where user_id=requester and status='pending'
    returning status into current_status;
  return coalesce(current_status,'verified');
end;
$$;
revoke all on function public.request_my_lead_team_access(text,text,text) from public, anon;
grant execute on function public.request_my_lead_team_access(text,text,text) to authenticated;

create function public.review_lead_team_membership(actor_id uuid, member_id uuid, expected_updated_at timestamptz, decision text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  reviewed public.lead_team_memberships%rowtype;
begin
  if decision is null or decision not in ('verified','rejected') or not exists (
    select 1 from public.profiles where id=actor_id and is_admin is true and account_status is distinct from 'suspended'
  ) then return false; end if;

  update public.lead_team_memberships
  set status=decision, updated_at=now(),
      verified_at=case when decision='verified' then now() end,
      verified_by=case when decision='verified' then actor_id end
  where user_id=member_id and status='pending' and updated_at=expected_updated_at
  returning * into reviewed;
  if not found then return false; end if;

  insert into public.lead_team_decisions(user_id,admin_id,consultant_identifier,sponsor_code,applicant_name,decision)
    values(reviewed.user_id,actor_id,reviewed.consultant_identifier,reviewed.sponsor_code,reviewed.applicant_name,decision);
  return true;
end;
$$;
revoke all on function public.review_lead_team_membership(uuid,uuid,timestamptz,text) from public, anon, authenticated;
grant execute on function public.review_lead_team_membership(uuid,uuid,timestamptz,text) to service_role;

CREATE OR REPLACE FUNCTION public.lead_daily_quota_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare lim integer; used integer; owner_id uuid; plan_name text; begin select r.user_id into owner_id from public.lead_daily_generation_requests r where r.id=new.request_id; if owner_id is null or owner_id<>new.user_id then raise exception 'request owner mismatch'; end if; select case when p.subscription_status in ('active','trialing') then coalesce(p.plan,'free') else 'free' end into plan_name from public.profiles p where p.id=owner_id; select case when new.contact_kind='klaviyo' then q.klaviyo_daily_limit else q.professional_daily_limit end into lim from public.lead_plan_quotas q where q.plan_code=coalesce(plan_name,'free'); if lim is null then plan_name := 'free'; select case when new.contact_kind='klaviyo' then q.klaviyo_daily_limit else q.professional_daily_limit end into lim from public.lead_plan_quotas q where q.plan_code='free'; end if; if lower(coalesce(plan_name,'free')) in ('free','gratuit') and not exists (select 1 from public.lead_team_memberships m where m.user_id=owner_id and m.status='verified') then raise exception 'verified lead team membership required'; end if; if lim is null or lim<=0 then raise exception 'daily quota unavailable'; end if; select count(*) into used from public.lead_daily_allocations where request_id=new.request_id and contact_kind=new.contact_kind; if used>=lim then raise exception 'daily quota exceeded'; end if; return new; end $function$;
