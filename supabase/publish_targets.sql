-- Etat indépendant par réseau pour chaque publication
create table if not exists public.publish_targets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 content_id uuid not null references public.content_items(id) on delete cascade,
 provider text not null check(provider in ('facebook','instagram','tiktok')),
 status text not null default 'pending' check(status in ('pending','publishing','published','retry','failed')),
 attempts integer not null default 0,
 provider_post_id text,
 last_error text,
 published_at timestamptz,
 created_at timestamptz default now(),
 updated_at timestamptz default now(),
 unique(content_id,provider)
);
alter table public.publish_targets enable row level security;
create policy "Users read own publish targets" on public.publish_targets for select using(auth.uid()=user_id);
create index if not exists publish_targets_queue_idx on public.publish_targets(status,content_id);
