-- Networkly AI - stockage médias privés
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('content-media','content-media',false,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create policy "Users upload own media" on storage.objects for insert to authenticated
with check(bucket_id='content-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users read own media" on storage.objects for select to authenticated
using(bucket_id='content-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users delete own media" on storage.objects for delete to authenticated
using(bucket_id='content-media' and (storage.foldername(name))[1]=auth.uid()::text);

alter table public.content_items add column if not exists media_path text;
alter table public.content_items add column if not exists media_type text;
alter table public.content_items add column if not exists target_networks text[] default '{}';
alter table public.content_items add column if not exists scheduled_time time;
