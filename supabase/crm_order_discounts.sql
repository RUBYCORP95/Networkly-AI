alter table public.crm_orders add column if not exists order_discount jsonb;
grant insert (order_discount) on public.crm_orders to authenticated;
