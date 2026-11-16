-- Harden profiles so client JWTs cannot self-promote or self-activate billing.
-- Onboarding can continue updating user-owned descriptive fields.
-- Billing/admin/account flags remain service-role controlled.
revoke all privileges on table public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (
  id, full_name, company, activity, audience, tone, shop_url, join_url,
  onboarding_completed, onboarding_step, created_at, updated_at
) on public.profiles to authenticated;
grant update (
  full_name, company, activity, audience, tone, shop_url, join_url,
  onboarding_completed, onboarding_step, updated_at
) on public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;
