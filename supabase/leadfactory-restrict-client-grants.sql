-- Restrict client-facing LeadFactory grants; service_role retains server-side management.
revoke all on public.lead_organizations from anon, authenticated;
grant select on public.lead_organizations to authenticated;
revoke all on public.lead_team_memberships from anon, authenticated;
grant select on public.lead_team_memberships to authenticated;
revoke all on public.lead_suppressions from anon, authenticated;
revoke all on public.lead_assignments from anon, authenticated;
grant select on public.lead_assignments to authenticated;
grant update(status) on public.lead_assignments to authenticated;
revoke all on public.lead_preferences from anon, authenticated;
grant select, insert, update on public.lead_preferences to authenticated;
