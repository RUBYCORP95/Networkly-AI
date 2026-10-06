-- Networkly AI - bibliothèque média réutilisable
create table if not exists public.media_library (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source text not null default 'imported' check(source in ('imported','ai')),
 media_path text not null,
 media_type text not null,
 original_name text,
 title text,
 description text,
 size_bytes bigint,
 created_at timestamptz default now()
);
alter table public.media_library enable row level security;
create policy "Users read own library" on public.media_library for select using(auth.uid()=user_id);
create policy "Users insert own library" on public.media_library for insert with check(auth.uid()=user_id);
create policy "Users update own library" on public.media_library for update using(auth.uid()=user_id);
create policy "Users delete own library" on public.media_library for delete using(auth.uid()=user_id);
