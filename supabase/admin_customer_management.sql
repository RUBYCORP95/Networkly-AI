alter table public.profiles add column if not exists account_status text not null default 'active' check(account_status in ('active','suspended'));
create table if not exists public.admin_customer_notes (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id) on delete cascade,
 admin_id uuid not null references auth.users(id) on delete cascade,
 note text not null,
 created_at timestamptz default now()
);
alter table public.admin_customer_notes enable row level security;
create table if not exists public.admin_audit_log (
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null references auth.users(id) on delete cascade,
 customer_id uuid references auth.users(id) on delete set null,
 action text not null,
 details jsonb default '{}'::jsonb,
 created_at timestamptz default now()
);
alter table public.admin_audit_log enable row level security;
