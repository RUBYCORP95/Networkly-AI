-- Verrouillage atomique des cibles à publier
create or replace function public.claim_publish_targets(p_limit integer default 20)
returns setof public.publish_targets
language plpgsql security definer set search_path=public
as $$
begin
 return query
 update public.publish_targets t set status='publishing',attempts=t.attempts+1,updated_at=now()
 where t.id in (
  select pt.id from public.publish_targets pt
  join public.content_items c on c.id=pt.content_id
  where pt.status in ('pending','retry')
    and c.status='planned'
    and ((c.scheduled_at is not null and c.scheduled_at<=now()) or (c.scheduled_at is null and (c.scheduled_date < current_date or (c.scheduled_date=current_date and coalesce(c.scheduled_time,'00:00:00'::time)<=localtime))))
  order by coalesce(c.scheduled_at,c.scheduled_date::timestamp+c.scheduled_time)
  for update skip locked limit p_limit
 )
 returning t.*;
end;$$;
revoke all on function public.claim_publish_targets(integer) from public,anon,authenticated;
grant execute on function public.claim_publish_targets(integer) to service_role;
