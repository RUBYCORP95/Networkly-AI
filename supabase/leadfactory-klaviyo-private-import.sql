-- TESAMI private Klaviyo abandoned-cart staging.
-- NOT a lead_organization: there is deliberately no FK or assignment path.
create table if not exists public.lead_private_klaviyo_contacts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'klaviyo' check (source='klaviyo'),
  klaviyo_profile_id text not null unique,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  last_abandoned_at timestamptz not null,
  last_order_at timestamptz,
  orders_checked_at timestamptz not null,
  consent_status text not null default 'unknown'
    check (consent_status in ('subscribed','unsubscribed','suppressed','unknown')),
  source_segment_id text not null default 'RbHGeT',
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_private_klaviyo_imported_idx
  on public.lead_private_klaviyo_contacts(imported_at desc);
alter table public.lead_private_klaviyo_contacts enable row level security;
revoke all on table public.lead_private_klaviyo_contacts from public,anon,authenticated;
grant all on table public.lead_private_klaviyo_contacts to service_role;
comment on table public.lead_private_klaviyo_contacts is
 'Admin-only private Klaviyo contacts; never eligible for the lead assignment or daily prospect distribution.';
