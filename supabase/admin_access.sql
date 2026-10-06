alter table public.profiles add column if not exists is_admin boolean not null default false;
revoke update (is_admin) on public.profiles from authenticated;
