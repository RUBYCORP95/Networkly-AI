create table if not exists public.billing_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('mollie','paypal')),
 provider_event_id text,
 event_type text not null,
 status text not null,
 amount numeric(10,2),
 currency text default 'EUR',
 subscription_id text,
 created_at timestamptz default now(),
 unique(provider,provider_event_id,event_type)
);
alter table public.billing_events enable row level security;
create policy "Users read own billing events" on public.billing_events for select using(auth.uid()=user_id);
create index if not exists billing_events_user_idx on public.billing_events(user_id,created_at desc);
