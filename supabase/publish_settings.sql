create table if not exists public.user_publish_settings(
 user_id uuid primary key references auth.users(id) on delete cascade,
 publish_mode text not null default 'approval' check(publish_mode in('draft','approval','automatic')),
 subtitles_enabled boolean not null default true,
 subtitle_style text not null default 'dynamic',
 tiktok_privacy text,
 tiktok_disable_comment boolean not null default false,
 tiktok_disable_duet boolean not null default false,
 tiktok_disable_stitch boolean not null default false,
 updated_at timestamptz default now()
);
alter table public.user_publish_settings enable row level security;
create policy "Users read own publish settings" on public.user_publish_settings for select using(auth.uid()=user_id);
create policy "Users insert own publish settings" on public.user_publish_settings for insert with check(auth.uid()=user_id);
create policy "Users update own publish settings" on public.user_publish_settings for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
