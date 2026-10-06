-- Les tokens sociaux doivent être chiffrés côté serveur avant stockage.
alter table public.social_connections add column if not exists open_id text;
alter table public.social_connections add column if not exists token_expires_at timestamptz;
alter table public.social_connections add column if not exists refresh_expires_at timestamptz;
alter table public.social_connections add column if not exists metadata jsonb not null default '{}'::jsonb;
