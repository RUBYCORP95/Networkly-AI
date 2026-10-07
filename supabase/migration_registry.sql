create table if not exists public.networkly_migrations (
 id text primary key,
 description text not null,
 applied_at timestamptz not null default now()
);
alter table public.networkly_migrations enable row level security;

-- IMPORTANT:
-- Ce fichier crée uniquement le registre.
-- Chaque migration doit enregistrer son propre identifiant APRÈS l'exécution
-- réussie de ses changements SQL. Ne jamais pré-remplir ce registre.
