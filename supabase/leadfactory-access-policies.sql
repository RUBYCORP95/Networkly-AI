-- Apply after leadfactory.sql and leadfactory-team-access.sql.
-- RLS also protects direct Supabase client reads when the Next.js API is bypassed.
create or replace function public.can_access_my_leads()
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists (select 1 from public.profiles active_profile where active_profile.id=auth.uid() and active_profile.account_status is distinct from 'suspended') and (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true and coalesce(p.account_status,'')<>'suspended')
  or exists(select 1 from public.lead_team_memberships m where m.user_id=auth.uid() and m.status='verified')
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status is distinct from 'suspended'
    and p.subscription_status in ('active','trialing') and p.plan is not null and lower(p.plan) not in ('free','gratuit'))
 );
$$;
revoke all on function public.can_access_my_leads() from public,anon;
grant execute on function public.can_access_my_leads() to authenticated;
drop policy if exists "lead preferences own select" on public.lead_preferences;
drop policy if exists "lead preferences own insert" on public.lead_preferences;
drop policy if exists "lead preferences own update" on public.lead_preferences;
drop policy if exists "lead assignments own select" on public.lead_assignments;
drop policy if exists "lead assignments own status update" on public.lead_assignments;
drop policy if exists "lead organizations assigned select" on public.lead_organizations;
create policy "lead preferences own select" on public.lead_preferences for select to authenticated using(auth.uid()=user_id and public.can_access_my_leads());
create policy "lead preferences own insert" on public.lead_preferences for insert to authenticated with check(auth.uid()=user_id and public.can_access_my_leads());
create policy "lead preferences own update" on public.lead_preferences for update to authenticated using(auth.uid()=user_id and public.can_access_my_leads()) with check(auth.uid()=user_id and public.can_access_my_leads());
create policy "lead assignments own select" on public.lead_assignments for select to authenticated using(auth.uid()=user_id and public.can_access_my_leads());
create policy "lead assignments own status update" on public.lead_assignments for update to authenticated using(auth.uid()=user_id and public.can_access_my_leads()) with check(auth.uid()=user_id and public.can_access_my_leads());
create policy "lead organizations assigned select" on public.lead_organizations for select to authenticated using(public.can_access_my_leads() and exists(select 1 from public.lead_assignments a where a.organization_id=id and a.user_id=auth.uid()));
