alter table public.content_items add column if not exists scheduled_at timestamptz;
alter table public.content_items add column if not exists schedule_timezone text default 'Europe/Paris';
create index if not exists content_items_scheduled_at_idx on public.content_items(scheduled_at) where status='planned';


insert into public.networkly_migrations(id,description) values ('scheduled_at','Programmation avec fuseau horaire') on conflict(id) do update set description=excluded.description,applied_at=now();
