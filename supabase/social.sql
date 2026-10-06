-- Networkly AI - connexions sociales et options vidéo
create table if not exists public.social_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('facebook','instagram','tiktok')),
 provider_user_id text,
 account_name text,
 access_token_encrypted text,
 refresh_token_encrypted text,
 expires_at timestamptz,
 scopes text[],
 connected boolean not null default true,
 created_at timestamptz default now(),
 updated_at timestamptz default now(),
 unique(user_id,provider,provider_user_id)
);
alter table public.social_connections enable row level security;
create policy "Users read own social connections" on public.social_connections for select using(auth.uid()=user_id);
-- Les tokens sont écrits uniquement par les routes serveur OAuth.

alter table public.content_items add column if not exists media_url text;
alter table public.content_items add column if not exists publish_mode text default 'approval' check(publish_mode in ('draft','approval','automatic'));
alter table public.content_items add column if not exists publish_status text default 'not_published';
alter table public.content_items add column if not exists subtitles_enabled boolean not null default true;
alter table public.content_items add column if not exists subtitle_style text default 'dynamic';
alter table public.content_items add column if not exists is_ai_generated boolean not null default false;
