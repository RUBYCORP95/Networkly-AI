begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-visuals', 'team-visuals', false, 5242880, array['image/jpeg','image/png','image/webp']);

create policy consultant_team_visuals_read on storage.objects for select to authenticated
  using (bucket_id = 'team-visuals' and (select private.can_manage_travelling_cases()));

create policy admin_team_visuals_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-visuals' and exists (
      select 1 from public.profiles where id = (select auth.uid()) and is_admin is true
    )
  );

commit;
