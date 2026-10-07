update storage.buckets
set file_size_limit = 1073741824
where id = 'content-media';


insert into public.networkly_migrations(id,description) values ('storage_1gb','Stockage média jusqu’à 1 Go') on conflict(id) do update set description=excluded.description,applied_at=now();
