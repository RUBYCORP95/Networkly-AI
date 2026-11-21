alter table public.crm_orders add column order_date date;
update public.crm_orders set order_date = (created_at at time zone 'Europe/Paris')::date;
alter table public.crm_orders alter column order_date set not null,
  alter column order_date set default ((now() at time zone 'Europe/Paris')::date);
alter table public.crm_orders add constraint crm_orders_order_date_valid
  check (order_date between date '1000-01-01' and ((now() at time zone 'Europe/Paris')::date));
grant insert (order_date, status, payment_status), update (order_date) on public.crm_orders to authenticated;
create index crm_orders_owner_order_date on public.crm_orders(owner_id, order_date desc, created_at desc, id desc);
create index crm_orders_owner_client_order_date on public.crm_orders(owner_id, client_id, order_date desc, created_at desc, id desc);

create table private.crm_order_changes (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.crm_orders(id) on delete cascade,
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid,
  changes jsonb not null
);
alter table private.crm_order_changes enable row level security;
revoke all on private.crm_order_changes from public, anon, authenticated;

create function private.record_crm_order_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changes jsonb;
begin
  select jsonb_object_agg(current.key, jsonb_build_object('before', previous.value, 'after', current.value))
  into changes
  from jsonb_each(to_jsonb(new)) as current
  join jsonb_each(to_jsonb(old)) as previous on previous.key = current.key
  where current.key in ('order_date', 'status', 'payment_status', 'details', 'total_cents', 'shipping_cents', 'items', 'order_discount')
    and current.value is distinct from previous.value;
  if changes is not null then
    insert into private.crm_order_changes(order_id, changed_by, changes) values (new.id, auth.uid(), changes);
  end if;
  return new;
end;
$$;
revoke all on function private.record_crm_order_change() from public, anon, authenticated;
create trigger crm_record_order_change after update on public.crm_orders
for each row execute function private.record_crm_order_change();

alter table public.crm_orders add constraint crm_orders_owner_client_id_unique unique (owner_id, client_id, id);

create table public.crm_client_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  client_id uuid not null,
  order_id uuid unique,
  document_date date not null check (document_date between date '1000-01-01' and ((now() at time zone 'Europe/Paris')::date)),
  filename text not null check (char_length(filename) between 1 and 180),
  uploaded_at timestamptz not null default now(),
  pdf bytea not null check (octet_length(pdf) between 6 and 3145728 and substring(pdf from 1 for 5) = decode('255044462d', 'hex')),
  foreign key (owner_id, client_id) references public.crm_clients(owner_id, id) on delete cascade,
  foreign key (owner_id, client_id, order_id) references public.crm_orders(owner_id, client_id, id) on delete cascade
);
create index crm_client_invoices_owner_client_date on public.crm_client_invoices(owner_id, client_id, document_date desc, uploaded_at desc);
alter table public.crm_client_invoices enable row level security;
revoke all on public.crm_client_invoices from public, anon, authenticated;
grant select, insert (client_id, order_id, document_date, filename, pdf),
  update (client_id, order_id, document_date, filename, pdf) on public.crm_client_invoices to authenticated;
create policy own_crm_client_invoices on public.crm_client_invoices to authenticated
  using (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()))
  with check (owner_id = (select auth.uid()) and (select private.can_manage_travelling_cases()));

create function private.keep_crm_invoice_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.order_id is null or new.order_id is distinct from old.order_id
    or new.client_id is distinct from old.client_id then
    raise exception 'The invoice links cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_crm_invoice_links() from public, anon, authenticated;
create trigger crm_keep_invoice_links before update on public.crm_client_invoices
for each row execute function private.keep_crm_invoice_links();
