-- Networkly AI - configuration commerciale
create table if not exists public.app_settings (
  id text primary key default 'main',
  monthly_price numeric(10,2) not null default 7.90,
  currency text not null default 'EUR',
  discount_type text check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) default 0,
  promo_code text,
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  updated_at timestamptz default now()
);
insert into public.app_settings(id) values('main') on conflict do nothing;

create table if not exists public.integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  klaviyo_enabled boolean not null default false,
  klaviyo_list_id text,
  klaviyo_key_configured boolean not null default false,
  updated_at timestamptz default now()
);
alter table public.integrations enable row level security;
create policy "Users read own integrations" on public.integrations for select using (auth.uid()=user_id);
create policy "Users update own integrations" on public.integrations for update using (auth.uid()=user_id);
create policy "Users insert own integrations" on public.integrations for insert with check (auth.uid()=user_id);
