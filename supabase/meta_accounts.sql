-- Choix de la Page Facebook / compte Instagram à utiliser après OAuth
alter table public.social_connections add column if not exists selected_page_id text;
alter table public.social_connections add column if not exists selected_ig_user_id text;
alter table public.social_connections add column if not exists page_access_token_encrypted text;
