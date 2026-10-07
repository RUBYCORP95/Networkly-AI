create table if not exists public.networkly_migrations (
 id text primary key,
 description text not null,
 applied_at timestamptz not null default now()
);
alter table public.networkly_migrations enable row level security;

insert into public.networkly_migrations(id,description) values
 ('onboarding','Progression onboarding'),
 ('admin_customer_management','Gestion clients administrateur'),
 ('payment_grace_period','Délai de paiement de 7 jours'),
 ('scheduled_at','Programmation avec fuseau horaire'),
 ('suspended_account_rls','Restrictions des comptes suspendus')
on conflict(id) do nothing;
