alter table public.profiles add column if not exists payment_failed_at timestamptz;
alter table public.profiles add column if not exists grace_period_ends_at timestamptz;
alter table public.profiles add column if not exists last_payment_at timestamptz;
create index if not exists profiles_grace_period_idx on public.profiles(subscription_status,grace_period_ends_at);


insert into public.networkly_migrations(id,description) values ('payment_grace_period','Délai de paiement de 7 jours') on conflict(id) do update set description=excluded.description,applied_at=now();
