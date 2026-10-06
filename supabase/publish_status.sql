-- Synchronise le statut global du contenu depuis ses cibles sociales
create or replace function public.refresh_content_publish_status(p_content_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare total_count integer; published_count integer; failed_count integer;
begin
 select count(*),count(*) filter(where status='published'),count(*) filter(where status='failed')
 into total_count,published_count,failed_count from public.publish_targets where content_id=p_content_id;
 update public.content_items set
  publish_status=case when total_count>0 and published_count=total_count then 'published' when failed_count>0 then 'partial_error' else 'publishing' end,
  published_at=case when total_count>0 and published_count=total_count then now() else published_at end
 where id=p_content_id;
end;$$;
revoke all on function public.refresh_content_publish_status(uuid) from public,anon,authenticated;
grant execute on function public.refresh_content_publish_status(uuid) to service_role;
