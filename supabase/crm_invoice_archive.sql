begin;

alter table public.crm_client_invoices
  alter column client_id drop not null,
  add constraint crm_invoices_linked_order_has_client check (order_id is null or client_id is not null),
  add constraint crm_invoices_owner_user foreign key (owner_id) references auth.users(id) on delete cascade,
  add column issuer_name text check (char_length(btrim(issuer_name)) between 1 and 120),
  add column account_number text check (account_number ~ '^[0-9]{1,20}$'),
  add column issuer_key text generated always as
    (coalesce(lower(regexp_replace(btrim(normalize(issuer_name, NFKC)), '[[:space:]]+', ' ', 'g')), '')) stored,
  add column pdf_digest bytea generated always as (sha256(pdf)) stored,
  add column document_number text check (char_length(btrim(document_number)) between 1 and 80),
  add column document_number_key text generated always as
    (upper(regexp_replace(normalize(document_number, NFKC), '[[:space:]]+', '', 'g'))) stored;

update public.crm_client_invoices i
  set document_number = 'BC-' || upper(left(replace(i.order_id::text, '-', ''), 12)),
      issuer_name = left(coalesce(nullif(btrim(o.seller->>'business'), ''), nullif(btrim(o.seller->>'name'), '')), 120)
  from public.crm_orders o
  where i.order_id = o.id;
update public.crm_client_invoices
  set document_number = finance_reference
  where order_id is null and finance_reference is not null;

create unique index crm_invoices_owner_document_number
  on public.crm_client_invoices(owner_id, issuer_key, document_number_key) where document_number_key is not null;
create unique index crm_invoices_owner_pdf_digest
  on public.crm_client_invoices(owner_id, pdf_digest) where order_id is null and document_number is not null;
create index crm_invoices_owner_document_date
  on public.crm_client_invoices(owner_id, document_date desc, id desc);

grant insert (document_number, issuer_name, account_number), update (issuer_name, account_number) on public.crm_client_invoices to authenticated;

create function private.set_crm_invoice_order_number() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.order_id is not null then
    select left(coalesce(nullif(btrim(o.seller->>'business'), ''), nullif(btrim(o.seller->>'name'), '')), 120)
      into new.issuer_name from public.crm_orders o where o.id = new.order_id and o.owner_id = new.owner_id;
    new.document_number := 'BC-' || upper(left(replace(new.order_id::text, '-', ''), 12));
  end if;
  return new;
end;
$$;
revoke all on function private.set_crm_invoice_order_number() from public, anon, authenticated;
create trigger crm_set_invoice_order_number before insert on public.crm_client_invoices
for each row execute function private.set_crm_invoice_order_number();

create or replace view public.crm_finance_sales with (security_invoker = true) as
  select o.id, o.owner_id, o.client_id, o.order_date as sale_date, 'order'::text as source,
    o.status, o.payment_status, o.total_cents + o.shipping_cents as amount_cents,
    o.product_cost_cents, i.id as invoice_id, i.filename as invoice_name, null::text as invoice_reference,
    null::integer as declared_cents
  from public.crm_orders o
  left join public.crm_client_invoices i on i.order_id = o.id and i.owner_id = o.owner_id
  union all
  select i.id, i.owner_id, i.client_id, i.document_date, 'invoice'::text,
    case when i.finance_excluded or (i.client_id is null and i.finance_amount_cents is null) then 'excluded' when i.finance_amount_cents is null then 'archive' else 'invoice' end,
    case when i.finance_paid is null then null when i.finance_paid then 'paid' else 'pending' end,
    i.finance_amount_cents, i.finance_product_cost_cents, i.id, i.filename,
    coalesce(i.finance_reference, i.document_number), i.finance_declared_cents
  from public.crm_client_invoices i where i.order_id is null;

create view public.crm_invoice_account_suggestions with (security_invoker = true) as
  select owner_id, issuer_key, min(account_number) as account_number
  from public.crm_client_invoices
  where issuer_key <> '' and account_number is not null
  group by owner_id, issuer_key
  having count(distinct account_number) = 1;
revoke all on public.crm_invoice_account_suggestions from public, anon, authenticated;
grant select on public.crm_invoice_account_suggestions to authenticated;

commit;
