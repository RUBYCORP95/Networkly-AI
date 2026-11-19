alter table public.travelling_cases
  add column color text check (color ~ '^#[0-9a-f]{6}$');

grant update (color) on public.travelling_cases to authenticated;
