create or replace function public.networkly_account_active(p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=p_user and coalesce(account_status,'active')='active');
$$;
revoke all on function public.networkly_account_active(uuid) from public,anon;
grant execute on function public.networkly_account_active(uuid) to authenticated;

drop policy if exists "Users manage own content" on public.content_items;
create policy "Active users read own content" on public.content_items for select using(auth.uid()=user_id);
create policy "Active users insert own content" on public.content_items for insert with check(auth.uid()=user_id and public.networkly_account_active(auth.uid()));
create policy "Active users update own content" on public.content_items for update using(auth.uid()=user_id and public.networkly_account_active(auth.uid())) with check(auth.uid()=user_id and public.networkly_account_active(auth.uid()));
create policy "Active users delete own content" on public.content_items for delete using(auth.uid()=user_id and public.networkly_account_active(auth.uid()));

drop policy if exists "Users insert own library" on public.media_library;
drop policy if exists "Users update own library" on public.media_library;
drop policy if exists "Users delete own library" on public.media_library;
create policy "Active users insert own library" on public.media_library for insert with check(auth.uid()=user_id and public.networkly_account_active(auth.uid()));
create policy "Active users update own library" on public.media_library for update using(auth.uid()=user_id and public.networkly_account_active(auth.uid())) with check(auth.uid()=user_id and public.networkly_account_active(auth.uid()));
create policy "Active users delete own library" on public.media_library for delete using(auth.uid()=user_id and public.networkly_account_active(auth.uid()));

drop policy if exists "Users insert own ai jobs" on public.ai_media_jobs;
create policy "Active users insert own ai jobs" on public.ai_media_jobs for insert with check(auth.uid()=user_id and public.networkly_account_active(auth.uid()));


insert into public.networkly_migrations(id,description) values ('suspended_account_rls','Restrictions des comptes suspendus') on conflict(id) do update set description=excluded.description,applied_at=now();
