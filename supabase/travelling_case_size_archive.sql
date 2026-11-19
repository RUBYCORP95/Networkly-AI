alter table public.travelling_cases
  add column size text check (size in ('small', 'large')),
  add column archived_at timestamptz;
grant update (size, archived_at) on public.travelling_cases to authenticated;

create function private.require_active_travelling_case() returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.travelling_cases
    where id = new.case_id and owner_id = new.owner_id and archived_at is null
    for share;
  if not found then
    raise exception using errcode = '23514', message = 'Mallette archivée ou indisponible.';
  end if;
  return new;
end;
$$;
revoke execute on function private.require_active_travelling_case() from public, anon, authenticated;
create trigger travelling_case_active_before_booking
before insert on public.travelling_case_trips
for each row execute function private.require_active_travelling_case();
