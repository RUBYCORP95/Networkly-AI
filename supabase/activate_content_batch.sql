create or replace function public.activate_content_batch(p_ids uuid[],p_networks text[],p_publish_mode text default 'approval')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_count integer;
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 if coalesce(array_length(p_ids,1),0)=0 or coalesce(array_length(p_networks,1),0)=0 then raise exception 'missing_input'; end if;
 if p_publish_mode not in ('approval','automatic') then raise exception 'invalid_publish_mode'; end if;
 if exists(select 1 from unnest(p_networks) n where n not in ('instagram','facebook','tiktok')) then raise exception 'invalid_network'; end if;
 update public.content_items set status='planned',platform=array_to_string(p_networks,', '),target_networks=p_networks,publish_mode=p_publish_mode,updated_at=now()
 where user_id=v_user and id=any(p_ids) and status='draft';
 get diagnostics v_count=row_count;
 if v_count=0 then raise exception 'no_drafts'; end if;
 insert into public.publish_targets(user_id,content_id,provider,status)
 select v_user,c.id,n,case when p_publish_mode='automatic' then 'pending' else 'pending_approval' end
 from public.content_items c cross join unnest(p_networks) n
 where c.user_id=v_user and c.id=any(p_ids) and c.status='planned';
 return jsonb_build_object('scheduled',v_count,'targets',v_count*array_length(p_networks,1));
end;$$;
revoke all on function public.activate_content_batch(uuid[],text[],text) from public,anon;
grant execute on function public.activate_content_batch(uuid[],text[],text) to authenticated;
