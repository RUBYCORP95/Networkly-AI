begin;

alter table public.crm_orders add column product_cost_cents integer
  check (product_cost_cents between 0 and 99999999);
grant update (product_cost_cents) on public.crm_orders to authenticated;

alter table public.crm_client_invoices
  add column finance_declared_cents integer check (finance_declared_cents is null or (finance_declared_cents between 0 and 99999999 and order_id is null)),
  add column finance_excluded boolean not null default false,
  add column finance_reference text,
  add column finance_amount_cents integer check (finance_amount_cents between 0 and 99999999),
  add column finance_paid boolean,
  add column finance_product_cost_cents integer check (finance_product_cost_cents between 0 and 99999999),
  add constraint crm_invoice_finance_complete check (
    (finance_reference is null and finance_amount_cents is null and finance_paid is null and finance_product_cost_cents is null)
    or (order_id is null and not finance_excluded and finance_reference is not null and char_length(btrim(finance_reference)) between 1 and 80
      and finance_amount_cents is not null and finance_paid is not null)
  ),
  add constraint crm_invoice_finance_exclusion check (not finance_excluded or order_id is null);
create unique index crm_invoice_finance_reference
  on public.crm_client_invoices(owner_id, upper(btrim(finance_reference))) where finance_reference is not null;
create index crm_invoices_finance_date on public.crm_client_invoices(owner_id, document_date, id) where order_id is null;
grant insert (finance_declared_cents) on public.crm_client_invoices to authenticated;
grant update (finance_excluded, finance_reference, finance_amount_cents, finance_paid, finance_product_cost_cents)
  on public.crm_client_invoices to authenticated;

create or replace function private.keep_crm_invoice_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.order_id is distinct from old.order_id or new.client_id is distinct from old.client_id
    or (old.order_id is null and
      (new.filename, new.document_date, new.pdf) is distinct from (old.filename, old.document_date, old.pdf)) then
    raise exception 'The invoice links cannot be changed';
  end if;
  return new;
end;
$$;

create table public.crm_finance_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null check (entry_date between date '1000-01-01' and ((now() at time zone 'Europe/Paris')::date)),
  category text not null check (category in ('case', 'personal', 'sample', 'equipment', 'transport', 'other', 'commission')),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  amount_cents integer not null check (amount_cents between 1 and 99999999),
  receipt_name text check (char_length(receipt_name) between 1 and 180),
  receipt_mime text check (receipt_mime in ('application/pdf', 'image/jpeg', 'image/png')),
  receipt bytea,
  check ((receipt is null and receipt_name is null and receipt_mime is null)
    or (receipt_name is not null and receipt_mime is not null and receipt is not null
      and octet_length(receipt) between 8 and 3145728
      and case receipt_mime
        when 'application/pdf' then substring(receipt from 1 for 5) = decode('255044462d', 'hex')
        when 'image/jpeg' then substring(receipt from 1 for 3) = decode('ffd8ff', 'hex')
        when 'image/png' then substring(receipt from 1 for 8) = decode('89504e470d0a1a0a', 'hex')
      end))
);
create index crm_finance_owner_date on public.crm_finance_entries(owner_id, entry_date, id);
alter table public.crm_finance_entries enable row level security;
revoke all on public.crm_finance_entries from public, anon, authenticated;
grant select, delete,
  insert (entry_date, category, label, amount_cents, receipt_name, receipt_mime, receipt),
  update (entry_date, category, label, amount_cents, receipt_name, receipt_mime, receipt)
  on public.crm_finance_entries to authenticated;
create policy own_crm_finance_entries on public.crm_finance_entries to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

-- Match the generated invoice by order identity, so it remains a document on one sale.
create view public.crm_finance_sales with (security_invoker = true) as
  select o.id, o.owner_id, o.client_id, o.order_date as sale_date, 'order'::text as source,
    o.status, o.payment_status, o.total_cents + o.shipping_cents as amount_cents,
    o.product_cost_cents, i.id as invoice_id, i.filename as invoice_name, null::text as invoice_reference,
    null::integer as declared_cents
  from public.crm_orders o
  left join public.crm_client_invoices i on i.order_id = o.id and i.owner_id = o.owner_id
  union all
  select i.id, i.owner_id, i.client_id, i.document_date, 'invoice'::text,
    case when i.finance_excluded then 'excluded' when i.finance_amount_cents is null then 'archive' else 'invoice' end,
    case when i.finance_paid is null then null when i.finance_paid then 'paid' else 'pending' end,
    i.finance_amount_cents, i.finance_product_cost_cents, i.id, i.filename, i.finance_reference, i.finance_declared_cents
  from public.crm_client_invoices i where i.order_id is null;
revoke all on public.crm_finance_sales from public, anon, authenticated;
grant select on public.crm_finance_sales to authenticated;

commit;
