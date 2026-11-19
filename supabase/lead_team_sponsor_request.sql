alter table public.lead_team_memberships alter column consultant_identifier drop not null;
alter table public.lead_team_decisions alter column consultant_identifier drop not null;

create function public.request_lead_team_access_with_sponsor(p_sponsor_code text, p_applicant_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  requester uuid := auth.uid();
  request_status text;
begin
  if requester is null or not exists (
    select 1 from public.profiles where id=requester and account_status is distinct from 'suspended'
  ) then raise exception 'Compte inaccessible'; end if;
  if coalesce(length(btrim(p_sponsor_code)),0) not between 2 and 100
    or coalesce(length(btrim(p_applicant_name)),0) not between 2 and 161 then
    raise exception 'Nom ou code sponsor invalide';
  end if;

  insert into public.lead_team_memberships as current_request(user_id, sponsor_code, applicant_name, status)
  values(requester, btrim(p_sponsor_code), btrim(p_applicant_name), 'pending')
  on conflict(user_id) do update set sponsor_code=excluded.sponsor_code, applicant_name=excluded.applicant_name,
    status='pending', updated_at=now()
  where current_request.status is distinct from 'verified'
  returning status into request_status;
  return coalesce(request_status,'verified');
end;
$$;
revoke all on function public.request_lead_team_access_with_sponsor(text,text) from public, anon;
grant execute on function public.request_lead_team_access_with_sponsor(text,text) to authenticated;
