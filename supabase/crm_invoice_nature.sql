begin;

alter table public.crm_client_invoices
  add column document_nature text check (document_nature in ('subscription', 'equipment', 'other'));
grant insert (document_nature), update (document_nature) on public.crm_client_invoices to authenticated;

create table public.crm_invoice_nature_accounts (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  subscription_account text check (subscription_account ~ '^[0-9]{1,20}$'),
  equipment_account text check (equipment_account ~ '^[0-9]{1,20}$')
);
alter table public.crm_invoice_nature_accounts enable row level security;
revoke all on public.crm_invoice_nature_accounts from public, anon, authenticated;
grant select, insert (subscription_account, equipment_account),
  update (subscription_account, equipment_account) on public.crm_invoice_nature_accounts to authenticated;
create policy own_crm_invoice_nature_accounts on public.crm_invoice_nature_accounts to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

create view public.crm_invoice_nature_suggestions with (security_invoker = true) as
  select owner_id, issuer_key, document_nature, min(account_number) as account_number
  from public.crm_client_invoices
  where issuer_key <> '' and document_nature is not null and account_number is not null
  group by owner_id, issuer_key, document_nature
  having count(distinct account_number) = 1;
revoke all on public.crm_invoice_nature_suggestions from public, anon, authenticated;
grant select on public.crm_invoice_nature_suggestions to authenticated;

commit;
