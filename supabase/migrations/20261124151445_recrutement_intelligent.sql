create table public.recruitment_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  default_access boolean not null default true,
  margin_cents integer not null default 1750 check (margin_cents between 0 and 100000),
  points integer not null default 14 check (points between 0 and 1000),
  point_value_cents integer check (point_value_cents between 0 and 100000),
  differential boolean not null default true,
  tiers jsonb not null default '[]',
  expenses jsonb not null default '[{"label":"📱 Abonnements","cents":5000},{"label":"🛡️ Assurances","cents":7500},{"label":"⛽ Essence","cents":10000},{"label":"🛒 Courses alimentaires","cents":25000},{"label":"✈️ Budget vacances","cents":10000}]',
  presentation text not null default 'Découvre une activité de vente directe autour des parfums Chogan. La simulation te permet d’explorer les ventes et le développement d’une équipe à ton rythme.',
  video_url text not null default ''
);
insert into public.recruitment_settings default values;

create table public.recruitment_access (
  user_id uuid primary key references auth.users on delete cascade,
  allowed boolean not null
);

create table public.recruitment_simulations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  slug text not null unique default replace(gen_random_uuid()::text, '-', ''),
  first_name text not null,
  consultant_name text not null,
  photo_url text not null default '',
  video_url text not null default '',
  join_url text not null default '',
  whatsapp text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active','follow_up','registered','archived')),
  quantity integer not null check (quantity between 0 and 100),
  team_size integer not null check (team_size between 0 and 1000),
  per_member integer not null check (per_member between 0 and 100),
  personal_sales integer not null check (personal_sales between 0 and 100),
  expenses jsonb not null,
  visits bigint not null default 0,
  whatsapp_clicks bigint not null default 0,
  join_clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recruitment_simulations_owner_history on public.recruitment_simulations (owner_id, updated_at desc, id);

alter table public.recruitment_settings enable row level security;
alter table public.recruitment_access enable row level security;
alter table public.recruitment_simulations enable row level security;
revoke all on public.recruitment_settings, public.recruitment_access, public.recruitment_simulations from public, anon, authenticated;
grant select, insert, update, delete on public.recruitment_settings, public.recruitment_access, public.recruitment_simulations to service_role;
grant select on public.recruitment_simulations to authenticated;

create function private.recruitment_allowed(actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles p cross join public.recruitment_settings s
    left join public.recruitment_access a on a.user_id = actor
    where p.id = actor and s.enabled and (
      p.is_admin is true or (
        p.account_status is distinct from 'suspended'
        and coalesce(a.allowed, s.default_access)
        and exists (select 1 from public.lead_team_memberships m where m.user_id = actor and m.status = 'verified')
      )
    )
  );
$$;
revoke all on function private.recruitment_allowed(uuid) from public, anon, authenticated;

create function private.can_use_recruitment()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.recruitment_allowed((select auth.uid()));
$$;
revoke all on function private.can_use_recruitment() from public, anon, authenticated;
grant execute on function private.can_use_recruitment() to authenticated;

create policy recruitment_read_own on public.recruitment_simulations for select to authenticated
using (owner_id = (select auth.uid()) and (select private.can_use_recruitment()));

create function public.can_use_recruitment()
returns boolean language sql stable security invoker set search_path = ''
begin atomic
  select private.can_use_recruitment();
end;
revoke all on function public.can_use_recruitment() from public, anon, authenticated;
grant execute on function public.can_use_recruitment() to authenticated;

-- The public route receives only an explicit projection. Redirect destinations remain server-side.
create function public.recruitment_public_page(p_slug text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'first_name', r.first_name, 'consultant_name', r.consultant_name, 'photo_url', r.photo_url,
    'video_url', coalesce(nullif(r.video_url, ''), s.video_url), 'whatsapp', r.whatsapp <> '',
    'join', r.join_url <> '', 'quantity', r.quantity, 'team_size', r.team_size,
    'per_member', r.per_member, 'personal_sales', r.personal_sales, 'expenses', r.expenses,
    'settings', jsonb_build_object('margin_cents', s.margin_cents, 'points', s.points,
      'point_value_cents', s.point_value_cents, 'tiers', s.tiers, 'differential', s.differential,
      'presentation', s.presentation)
  )
  from public.recruitment_simulations r cross join public.recruitment_settings s
  where r.slug = p_slug and r.status <> 'archived' and private.recruitment_allowed(r.owner_id);
$$;

create function public.recruitment_event(p_slug text, p_event text)
returns text language plpgsql set search_path = '' as $$
declare destination text;
begin
  if p_event not in ('visit','whatsapp','join') or p_event is null then return null; end if;
  update public.recruitment_simulations r
  set visits = visits + case when p_event = 'visit' then 1 else 0 end,
      whatsapp_clicks = whatsapp_clicks + case when p_event = 'whatsapp' then 1 else 0 end,
      join_clicks = join_clicks + case when p_event = 'join' then 1 else 0 end
  where r.slug = p_slug and r.status <> 'archived' and private.recruitment_allowed(r.owner_id)
    and (p_event <> 'whatsapp' or r.whatsapp <> '') and (p_event <> 'join' or r.join_url <> '')
  returning case p_event when 'whatsapp' then 'https://wa.me/' || r.whatsapp
    when 'join' then r.join_url else '' end into destination;
  return destination;
end;
$$;
revoke all on function public.recruitment_public_page(text), public.recruitment_event(text,text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.recruitment_allowed(uuid) to service_role;
grant execute on function public.recruitment_public_page(text), public.recruitment_event(text,text) to service_role;

create function public.recruitment_metrics(p_owner uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('created', count(*), 'visits', coalesce(sum(visits),0),
    'whatsapp', coalesce(sum(whatsapp_clicks),0), 'joined', coalesce(sum(join_clicks),0),
    'follow_up', count(*) filter (where status = 'follow_up'),
    'registered', count(*) filter (where status = 'registered'),
    'archived', count(*) filter (where status = 'archived'))
  from public.recruitment_simulations
  where owner_id = p_owner and private.recruitment_allowed(p_owner);
$$;
revoke all on function public.recruitment_metrics(uuid) from public, anon, authenticated;
grant execute on function public.recruitment_metrics(uuid) to service_role;
