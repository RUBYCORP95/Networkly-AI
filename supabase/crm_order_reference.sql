begin;

create sequence public.crm_order_consultant_seq start 1001;
create sequence public.crm_order_reference_seq;
grant usage on sequence public.crm_order_consultant_seq to authenticated,service_role;

alter table public.crm_seller_profiles
  add column order_namespace bigint not null unique default nextval('public.crm_order_consultant_seq'),
  add column order_prefix text check (
    order_prefix is null or (order_prefix ~ '^[A-Z][A-Z0-9]{1,11}$' and order_prefix !~ '^BC[0-9]+$'));
grant insert (order_prefix), update (order_prefix) on public.crm_seller_profiles to authenticated;

create table private.crm_order_prefixes (
  prefix text primary key,
  owner_id uuid not null
);
revoke all on private.crm_order_prefixes from public,anon,authenticated;

create function private.reserve_crm_order_prefix() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.order_prefix is null then return new; end if;
  insert into private.crm_order_prefixes(prefix,owner_id) values(new.order_prefix,new.owner_id) on conflict do nothing;
  if not exists(select 1 from private.crm_order_prefixes r where r.prefix = new.order_prefix and r.owner_id = new.owner_id)
  then raise exception using errcode = '23505', message = 'Order prefix already reserved'; end if;
  return new;
end;
$$;
revoke all on function private.reserve_crm_order_prefix() from public,anon,authenticated;
create trigger reserve_crm_order_prefix before insert or update of order_prefix
on public.crm_seller_profiles for each row execute function private.reserve_crm_order_prefix();

alter table public.crm_orders add column order_number text unique;

create function private.assign_crm_order_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  prefix text;
  serial_text text := nextval('public.crm_order_reference_seq'::regclass)::text;
begin
  select coalesce(s.order_prefix,'BC' || s.order_namespace::text) into prefix
    from public.crm_seller_profiles s where s.owner_id = new.owner_id;
  new.order_number := coalesce(prefix,'BC0') || '-' || lpad(serial_text,greatest(6,length(serial_text)),'0');
  return new;
end;
$$;
revoke all on function private.assign_crm_order_number() from public,anon,authenticated;
create trigger assign_crm_order_number before insert on public.crm_orders
for each row execute function private.assign_crm_order_number();

create or replace function private.set_crm_invoice_order_number() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.order_id is not null then
    select left(coalesce(nullif(btrim(o.seller->>'business'), ''), nullif(btrim(o.seller->>'name'), '')), 120),
      coalesce(o.order_number,'BC-' || upper(left(replace(o.id::text,'-',''),12)))
      into new.issuer_name,new.document_number from public.crm_orders o where o.id = new.order_id and o.owner_id = new.owner_id;
  end if;
  return new;
end;
$$;

create or replace view public.crm_finance_sales with (security_invoker = true) as
  select o.id, o.owner_id, o.client_id, o.order_date as sale_date, 'order'::text as source,
    o.status, o.payment_status, o.total_cents + o.shipping_cents as amount_cents,
    o.product_cost_cents, i.id as invoice_id, i.filename as invoice_name, null::text as invoice_reference,
    null::integer as declared_cents, o.order_number
  from public.crm_orders o
  left join public.crm_client_invoices i on i.order_id = o.id and i.owner_id = o.owner_id
  union all
  select i.id, i.owner_id, i.client_id, i.document_date, 'invoice'::text,
    case when i.finance_excluded or (i.client_id is null and i.finance_amount_cents is null) then 'excluded' when i.finance_amount_cents is null then 'archive' else 'invoice' end,
    case when i.finance_paid is null then null when i.finance_paid then 'paid' else 'pending' end,
    i.finance_amount_cents, i.finance_product_cost_cents, i.id, i.filename,
    coalesce(i.finance_reference, i.document_number), i.finance_declared_cents, null::text
  from public.crm_client_invoices i where i.order_id is null;

commit;
