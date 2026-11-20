CREATE OR REPLACE FUNCTION public.allocate_my_daily_leads()
 RETURNS TABLE(klaviyo_count integer, professional_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare uid uuid:=auth.uid(); rid uuid; st text; lk integer; lp integer; n1 integer:=0; n2 integer:=0; pref record; c record; begin if uid is null or not public.can_access_my_leads() then raise exception 'not authorized'; end if; perform pg_advisory_xact_lock(hashtextextended(uid::text,0)); select id,status into rid,st from public.lead_daily_generation_requests where user_id=uid and request_date=(now() at time zone 'Europe/Paris')::date for update; if rid is null then raise exception 'daily request required'; end if; if st='completed' then return query select r.klaviyo_granted,r.professional_granted from public.lead_daily_generation_requests r where r.id=rid; return; end if; if st<>'pending' then raise exception 'request not pending'; end if; select * into pref from public.lead_preferences where user_id=uid; if pref.latitude is null or pref.longitude is null or pref.radius_km not between 5 and 50 then raise exception 'location required'; end if; select klaviyo_limit,professional_limit into lk,lp from public.my_lead_daily_limits() limit 1; if lk is null or lp is null then raise exception 'quota unavailable'; end if; update public.lead_daily_allocations set released_at=now() where released_at is null and revealed_at is null and expires_at<=now(); if lk>0 then for c in select k.id from public.lead_private_klaviyo_contacts k where k.latitude between -90 and 90 and k.longitude between -180 and 180 and k.manual_review_status = 'approved'

 and k.manual_review_at is not null and k.manual_review_by is not null
 and k.consent_status in ('unknown', 'subscribed')
 and k.qualification_status is distinct from 'not_interested'
 and k.qualification_status is distinct from 'consultant'
 and k.orders_checked_at >= now() - interval '24 hours'
 and k.latitude between -90 and 90 and k.longitude between -180 and 180
 and nullif(btrim(k.email), '') is not null and k.last_abandoned_at<=now()-interval '60 days' and (k.last_order_at is null or k.last_order_at<k.last_abandoned_at) and public.lead_distance_km(pref.latitude,pref.longitude,k.latitude,k.longitude)<=pref.radius_km and not exists(select 1 from public.lead_daily_allocations a where a.contact_kind='klaviyo' and a.contact_id=k.id and (a.released_at is null or a.user_id=uid)) order by public.lead_distance_km(pref.latitude,pref.longitude,k.latitude,k.longitude),k.id limit greatest(lk*3,1) loop insert into public.lead_daily_allocations(request_id,user_id,contact_kind,contact_id) values(rid,uid,'klaviyo',c.id) on conflict do nothing; if found then n1:=n1+1; end if; exit when n1>=lk; end loop; end if; if lp>0 then for c in select p.id from public.lead_private_professional_imports p where p.latitude between -90 and 90 and p.longitude between -180 and 180 and p.prospect_status='eligible' and public.lead_distance_km(pref.latitude,pref.longitude,p.latitude,p.longitude)<=pref.radius_km and not exists(select 1 from public.lead_daily_allocations a where a.contact_kind='professional' and a.contact_id=p.id and (a.released_at is null or a.user_id=uid)) order by public.lead_distance_km(pref.latitude,pref.longitude,p.latitude,p.longitude),p.id limit greatest(lp*3,1) loop insert into public.lead_daily_allocations(request_id,user_id,contact_kind,contact_id) values(rid,uid,'professional',c.id) on conflict do nothing; if found then n2:=n2+1; end if; exit when n2>=lp; end loop; end if; update public.lead_daily_generation_requests set klaviyo_granted=n1,professional_granted=n2,status='completed' where id=rid; return query select n1,n2; end $function$;

CREATE OR REPLACE FUNCTION public.my_lead_allocation_cards()
 RETURNS TABLE(allocation_id uuid, contact_kind text, city text, department text, postal_code text, distance_km numeric, assigned_at timestamp with time zone, expires_at timestamp with time zone, contact_revealed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select a.id,a.contact_kind,case when a.contact_kind='klaviyo' then k.city else p.city end,case when a.contact_kind='klaviyo' then k.department else p.department end,case when a.contact_kind='klaviyo' then k.postal_code else p.postal_code end,round(public.lead_distance_km(pref.latitude,pref.longitude,case when a.contact_kind='klaviyo' then k.latitude else p.latitude end,case when a.contact_kind='klaviyo' then k.longitude else p.longitude end)::numeric,1),a.assigned_at,a.expires_at,a.revealed_at is not null from public.lead_daily_allocations a join public.lead_preferences pref on pref.user_id=a.user_id left join public.lead_private_klaviyo_contacts k on a.contact_kind='klaviyo' and k.id=a.contact_id and k.manual_review_status = 'approved'

 and k.manual_review_at is not null and k.manual_review_by is not null
 and k.consent_status in ('unknown', 'subscribed')
 and k.qualification_status is distinct from 'not_interested'
 and k.qualification_status is distinct from 'consultant'
 and k.orders_checked_at >= now() - interval '24 hours'
 and k.latitude between -90 and 90 and k.longitude between -180 and 180
 and nullif(btrim(k.email), '') is not null and k.last_abandoned_at<=now()-interval '60 days' and (k.last_order_at is null or k.last_order_at<k.last_abandoned_at) left join public.lead_private_professional_imports p on a.contact_kind='professional' and p.id=a.contact_id where a.user_id=(select auth.uid()) and (a.contact_kind <> 'klaviyo' or k.id is not null) and a.released_at is null and (a.revealed_at is not null or a.expires_at>now()) and public.can_access_my_leads() order by a.assigned_at desc $function$;

CREATE OR REPLACE FUNCTION public.reveal_my_daily_allocation(p_allocation_id uuid)
 RETURNS TABLE(phone text, email text, first_name text, last_name text, company text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare a public.lead_daily_allocations%rowtype; begin if auth.uid() is null or not public.can_access_my_leads() then raise exception 'unauthorized'; end if; select * into a from public.lead_daily_allocations where id=p_allocation_id and user_id=auth.uid() for update; if not found or a.released_at is not null or (a.revealed_at is null and a.expires_at<=now()) then raise exception 'allocation expired or unavailable'; end if; if a.contact_kind='klaviyo' then return query select k.phone,k.email,k.first_name,k.last_name,null::text from public.lead_private_klaviyo_contacts k where k.id=a.contact_id and k.manual_review_status = 'approved'

 and k.manual_review_at is not null and k.manual_review_by is not null
 and k.consent_status in ('unknown', 'subscribed')
 and k.qualification_status is distinct from 'not_interested'
 and k.qualification_status is distinct from 'consultant'
 and k.orders_checked_at >= now() - interval '24 hours'
 and k.latitude between -90 and 90 and k.longitude between -180 and 180
 and nullif(btrim(k.email), '') is not null and k.last_abandoned_at<=now()-interval '60 days' and (k.last_order_at is null or k.last_order_at<k.last_abandoned_at); else return query select p.phone,p.email,p.first_name,p.last_name,p.company from public.lead_private_professional_imports p where p.id=a.contact_id and p.prospect_status='eligible'; end if; if not found then raise exception 'contact no longer eligible'; end if; update public.lead_daily_allocations set revealed_at=coalesce(revealed_at,now()) where id=a.id; end $function$;

create or replace function public.leadfactory_klaviyo_admin_stats()
returns table(pending integer, approved integer, ready integer, assigned integer, missing_location integer, stale integer, proof_to_complete integer)
language sql stable security invoker set search_path = '' as $$
select count(*) filter(where manual_review_status='pending')::int as pending,count(*) filter(where manual_review_status='approved')::int as approved,count(*) filter(where (k.latitude between -90 and 90 and k.longitude between -180 and 180 and k.manual_review_status = 'approved'

 and k.manual_review_at is not null and k.manual_review_by is not null
 and k.consent_status in ('unknown', 'subscribed')
 and k.qualification_status is distinct from 'not_interested'
 and k.qualification_status is distinct from 'consultant'
 and k.orders_checked_at >= now() - interval '24 hours'
 and k.latitude between -90 and 90 and k.longitude between -180 and 180
 and nullif(btrim(k.email), '') is not null and k.last_abandoned_at<=now()-interval '60 days' and (k.last_order_at is null or k.last_order_at<k.last_abandoned_at)) and not exists(select 1 from public.lead_daily_allocations a where a.contact_kind='klaviyo' and a.contact_id=k.id and a.released_at is null and (a.revealed_at is not null or a.expires_at>now())))::int as ready,count(*) filter(where exists(select 1 from public.lead_daily_allocations a where a.contact_kind='klaviyo' and a.contact_id=k.id and a.released_at is null and (a.revealed_at is not null or a.expires_at>now())))::int as assigned,count(*) filter(where manual_review_status='approved' and (latitude is null or longitude is null))::int as missing_location,count(*) filter(where manual_review_status='approved' and (orders_checked_at is null or orders_checked_at<now()-interval '24 hours'))::int as stale ,0::int as proof_to_complete from public.lead_private_klaviyo_contacts k
$$;
revoke all on function public.leadfactory_klaviyo_admin_stats() from public, anon, authenticated;
grant execute on function public.leadfactory_klaviyo_admin_stats() to service_role;