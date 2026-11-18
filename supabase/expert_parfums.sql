create table public.expert_parfums_catalogue (
  reference text primary key check (reference ~ '^[A-Z0-9-]{1,24}$'),
  nom text not null check (char_length(trim(nom)) between 1 and 120),
  inspiration text not null default '' check (char_length(inspiration) <= 160),
  public_cible text not null check (public_cible in ('homme', 'femme', 'mixte')),
  famille text not null check (char_length(trim(famille)) between 1 and 120),
  tete text[] not null default '{}',
  coeur text[] not null default '{}',
  fond text[] not null default '{}',
  source text not null check (source ~ '^https://' and char_length(source) <= 1500),
  source_page integer check (source_page between 1 and 10000),
  publie boolean not null default false,
  check (cardinality(tete) <= 40 and cardinality(coeur) <= 40 and cardinality(fond) <= 40),
  check (not publie or cardinality(tete) + cardinality(coeur) + cardinality(fond) > 0)
);

create table public.expert_parfums_historique (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  public_cible text not null check (public_cible in ('tous', 'homme', 'femme', 'mixte')),
  reference_depart text check (reference_depart ~ '^[A-Z0-9-]{1,24}$'),
  preferences text[] not null check (cardinality(preferences) between 1 and 12),
  resultats jsonb not null check (jsonb_typeof(resultats) = 'array' and jsonb_array_length(resultats) <= 13)
);

create index expert_parfums_historique_user_date on public.expert_parfums_historique (user_id, created_at desc);

alter table public.expert_parfums_catalogue enable row level security;
alter table public.expert_parfums_historique enable row level security;

revoke all on public.expert_parfums_catalogue, public.expert_parfums_historique from public, anon, authenticated;
grant select, insert, update on public.expert_parfums_catalogue to authenticated;
grant select on public.expert_parfums_historique to authenticated;
grant insert (user_id, public_cible, reference_depart, preferences, resultats) on public.expert_parfums_historique to authenticated;

create policy expert_parfums_read_catalogue on public.expert_parfums_catalogue for select to authenticated using (
  exists (select 1 from public.profiles where id = (select auth.uid())
    and (is_admin or (publie and account_status is distinct from 'suspended')))
);

create policy expert_parfums_admin_insert on public.expert_parfums_catalogue for insert to authenticated with check (
  exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)
);

create policy expert_parfums_admin_update on public.expert_parfums_catalogue for update to authenticated using (
  exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)
) with check (
  exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)
);

create policy expert_parfums_own_history on public.expert_parfums_historique for select to authenticated
  using (user_id = (select auth.uid()));

create policy expert_parfums_create_history on public.expert_parfums_historique for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.profiles where id = (select auth.uid())
      and (is_admin or account_status is distinct from 'suspended')
  )
);
