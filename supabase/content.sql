-- Networkly AI - calendrier éditorial et quotas
create table if not exists public.content_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 scheduled_date date,
 content_type text not null,
 platform text,
 objective text,
 title text,
 body text not null,
 status text not null default 'draft' check(status in ('draft','planned','published')),
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);
alter table public.content_items enable row level security;
create policy "Users manage own content" on public.content_items for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.usage_monthly (
 user_id uuid not null references auth.users(id) on delete cascade,
 month_key text not null,
 generations integer not null default 0,
 updated_at timestamptz default now(),
 primary key(user_id,month_key)
);
alter table public.usage_monthly enable row level security;
create policy "Users read own usage" on public.usage_monthly for select using(auth.uid()=user_id);
