-- Jobs de génération média Alexya
create table if not exists public.ai_media_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null default 'alexya',
 external_id text not null,
 media_kind text not null check(media_kind in ('image','video')),
 prompt text not null,
 status text not null default 'processing',
 poll_url text,
 output_url text,
 credits_charged integer,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);
alter table public.ai_media_jobs enable row level security;
create policy "Users read own ai jobs" on public.ai_media_jobs for select using(auth.uid()=user_id);
create policy "Users insert own ai jobs" on public.ai_media_jobs for insert with check(auth.uid()=user_id);
