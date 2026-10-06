-- File de publication et historique des tentatives
alter table public.content_items add column if not exists published_at timestamptz;
alter table public.content_items add column if not exists last_publish_error text;
alter table public.content_items add column if not exists publish_attempts integer not null default 0;

create table if not exists public.publish_logs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 content_id uuid not null references public.content_items(id) on delete cascade,
 provider text not null,
 status text not null,
 provider_post_id text,
 error_message text,
 created_at timestamptz default now()
);
alter table public.publish_logs enable row level security;
create policy "Users read own publish logs" on public.publish_logs for select using(auth.uid()=user_id);
create index if not exists content_publish_queue_idx on public.content_items(scheduled_date,scheduled_time,publish_status);
