create or replace function public.leadfactory_available_candidates(p_user_id uuid, p_kind text, p_contact_id uuid default null)
returns table (contact_id uuid, city text, department text, company text, distance_km double precision)
language sql stable set search_path = ''
as $$
  with sector as (
    select latitude, longitude, radius_km from public.lead_preferences
    where user_id = p_user_id and latitude between -90 and 90
      and longitude between -180 and 180 and radius_km between 5 and 50
  ), eligible as (
    select k.id, k.city, k.department, null::text company,
           public.lead_distance_km(s.latitude,s.longitude,k.latitude,k.longitude) distance, s.radius_km
    from sector s cross join public.lead_private_klaviyo_contacts k
    where p_kind = 'klaviyo' and (p_contact_id is null or k.id=p_contact_id)
      and nullif(btrim(k.phone),'') is not null and k.latitude between -90 and 90 and k.longitude between -180 and 180 and k.manual_review_status = 'approved'

 and k.manual_review_at is not null and k.manual_review_by is not null
 and k.consent_status in ('unknown', 'subscribed')
 and k.qualification_status is distinct from 'not_interested'
 and k.qualification_status is distinct from 'consultant'
 and k.orders_checked_at >= now() - interval '24 hours'
 and k.latitude between -90 and 90 and k.longitude between -180 and 180
 and nullif(btrim(k.email), '') is not null and k.last_abandoned_at<=now()-interval '60 days' and (k.last_order_at is null or k.last_order_at<k.last_abandoned_at)
    union all
    select p.id, p.city, p.department, p.company,
           public.lead_distance_km(s.latitude,s.longitude,p.latitude,p.longitude), s.radius_km
    from sector s cross join public.lead_private_professional_imports p
    where p_kind = 'professional' and (p_contact_id is null or p.id=p_contact_id)
      and p.prospect_status='eligible' and p.admin_contacted_at is null
      and nullif(btrim(p.phone),'') is not null
      and p.latitude between -90 and 90 and p.longitude between -180 and 180
  )
  select e.id,e.city,e.department,e.company,e.distance::double precision
  from eligible e
  where e.distance <= e.radius_km
    and not exists (
      select 1 from public.lead_daily_allocations a
      where a.contact_kind=p_kind and a.contact_id=e.id
        and (a.user_id=p_user_id or (a.released_at is null and (a.revealed_at is not null or a.expires_at>now())))
    )
  order by e.distance,e.id limit 100;
$$;
revoke all on function public.leadfactory_available_candidates(uuid,text,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.lead_daily_quota_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare lim integer; used integer; owner_id uuid; plan_name text; begin select r.user_id into owner_id from public.lead_daily_generation_requests r where r.id=new.request_id; if owner_id is null or owner_id<>new.user_id then raise exception 'request owner mismatch'; end if; select case when p.subscription_status in ('active','trialing') then coalesce(p.plan,'free') else 'free' end into plan_name from public.profiles p where p.id=owner_id; select case when new.contact_kind='klaviyo' then q.klaviyo_daily_limit else q.professional_daily_limit end into lim from public.lead_plan_quotas q where q.plan_code=coalesce(plan_name,'free'); if lim is null then plan_name := 'free'; select case when new.contact_kind='klaviyo' then q.klaviyo_daily_limit else q.professional_daily_limit end into lim from public.lead_plan_quotas q where q.plan_code='free'; end if; if lower(coalesce(plan_name,'free')) in ('free','gratuit') and not exists (select 1 from public.lead_team_memberships m where m.user_id=owner_id and m.status='verified') and not exists (select 1 from public.profiles p where p.id=owner_id and p.is_admin is true and p.account_status is distinct from 'suspended') then raise exception 'verified lead team membership required'; end if; if lim is null or lim<=0 then raise exception 'daily quota unavailable'; end if; if new.revealed_at is not null then
  select count(*) into used from public.lead_daily_allocations where user_id=new.user_id and contact_kind=new.contact_kind
  and (revealed_at at time zone 'Europe/Paris')::date=(now() at time zone 'Europe/Paris')::date;
 else
  select count(*) into used from public.lead_daily_allocations where request_id=new.request_id and contact_kind=new.contact_kind;
 end if; if used>=lim then raise exception 'daily quota exceeded'; end if; return new; end $function$;

create or replace function public.leadfactory_consultant_action(p_user_id uuid, p_action text, p_allocation_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  day_paris date := (now() at time zone 'Europe/Paris')::date;
  kind text;
  daily_request_id uuid;
  allocation_id uuid;
  allocation public.lead_daily_allocations%rowtype;
  limits record;
  used_klaviyo integer;
  used_professional integer;
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_user_id is null then
    raise exception 'backend only' using errcode='42501';
  end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id,'role','service_role')::text,true);
  if not coalesce(public.can_access_my_leads(),false) then
    raise exception 'LeadFactory access denied' using errcode='42501';
  end if;

  if p_action not in ('search_klaviyo','search_professional','claim_klaviyo','claim_professional','reveal') then
    raise exception 'Invalid LeadFactory action' using errcode='22023';
  end if;
  if p_action not like 'search_%' then
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  end if;
  select * into limits from public.my_lead_daily_limits() limit 1;
  select count(*) filter (where a.contact_kind='klaviyo'),count(*) filter (where a.contact_kind='professional')
  into used_klaviyo,used_professional from public.lead_daily_allocations a
  where a.user_id=p_user_id and (a.revealed_at at time zone 'Europe/Paris')::date=day_paris;

  if p_action like 'search_%' then
    kind=substring(p_action from 8);
    select coalesce(jsonb_agg(to_jsonb(c) order by c.distance_km,c.contact_id),'[]'::jsonb) into result
    from public.leadfactory_available_candidates(p_user_id,kind) c;
    return jsonb_build_object('results',result,'klaviyo_used',used_klaviyo,'professional_used',used_professional);
  end if;

  if p_action='reveal' then
    select * into allocation from public.lead_daily_allocations
    where id=p_allocation_id and user_id=p_user_id for update;
  else
    kind=substring(p_action from 7);
    select * into allocation from public.lead_daily_allocations
    where user_id=p_user_id and contact_kind=kind and contact_id=p_allocation_id for update;
  end if;

  if allocation.id is not null then
    kind=allocation.contact_kind;
    allocation_id=allocation.id;
  elsif p_action='reveal' then
    raise exception 'allocation expired or unavailable';
  end if;

  if allocation.revealed_at is null then
    if (kind='klaviyo' and used_klaviyo>=coalesce(limits.klaviyo_limit,0))
       or (kind='professional' and used_professional>=coalesce(limits.professional_limit,0)) then
      raise exception 'daily quota exceeded';
    end if;
    if allocation_id is null then
      perform pg_advisory_xact_lock(hashtextextended(kind||':'||p_allocation_id::text,1));
      if not exists (select 1 from public.leadfactory_available_candidates(p_user_id,kind,p_allocation_id)) then
        raise exception 'allocation expired or unavailable';
      end if;
      select r.request_id into daily_request_id from public.start_my_lead_daily_request() r;
      update public.lead_daily_allocations set released_at=now()
      where contact_kind=kind and contact_id=p_allocation_id and released_at is null and revealed_at is null and expires_at<=now();
      insert into public.lead_daily_allocations(request_id,user_id,contact_kind,contact_id,revealed_at)
      values(daily_request_id,p_user_id,kind,p_allocation_id,now())
      on conflict do nothing returning id into allocation_id;
      if allocation_id is null then raise exception 'allocation expired or unavailable'; end if;
      update public.lead_daily_generation_requests r set
        klaviyo_granted=used_klaviyo+case when kind='klaviyo' then 1 else 0 end,
        professional_granted=used_professional+case when kind='professional' then 1 else 0 end,
        status='completed' where r.id=daily_request_id;
    end if;
  end if;

  select to_jsonb(c) into result from public.reveal_my_daily_allocation(allocation_id) c;
  if allocation.revealed_at is null and nullif(btrim(result->>'phone'),'') is null then
    raise exception 'phone unavailable';
  end if;
  return result || jsonb_build_object('kind',kind,'newly_revealed',allocation.revealed_at is null,'allocation_id',allocation_id);
end;
$$;
revoke all on function public.leadfactory_consultant_action(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.leadfactory_consultant_action(uuid,text,uuid) to service_role;
