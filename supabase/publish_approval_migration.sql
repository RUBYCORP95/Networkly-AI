alter table public.publish_targets drop constraint if exists publish_targets_status_check;
alter table public.publish_targets add constraint publish_targets_status_check check (status in ('pending_approval','pending','publishing','published','retry','failed'));


insert into public.networkly_migrations(id,description) values ('publish_approval','Validation des publications') on conflict(id) do update set description=excluded.description,applied_at=now();
