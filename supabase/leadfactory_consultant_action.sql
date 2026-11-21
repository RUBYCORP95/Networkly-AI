create or replace function public.leadfactory_consultant_action(p_user_id uuid, p_action text, p_allocation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_user_id is null then
    raise exception 'backend only' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id, 'role', 'service_role')::text, true);

  if not coalesce(public.can_access_my_leads(), false) then
    raise exception 'LeadFactory access denied' using errcode = '42501';
  end if;

  if p_action = 'generate' then
    perform public.start_my_lead_daily_request();
    select to_jsonb(counts) into result from public.allocate_my_daily_leads() as counts;
  elsif p_action = 'reveal' and p_allocation_id is not null then
    select to_jsonb(contact) into result from public.reveal_my_daily_allocation(p_allocation_id) as contact;
  else
    raise exception 'Invalid LeadFactory action' using errcode = '22023';
  end if;

  return result;
end;
$$;

revoke all on function public.leadfactory_consultant_action(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.leadfactory_consultant_action(uuid, text, uuid) to service_role;
