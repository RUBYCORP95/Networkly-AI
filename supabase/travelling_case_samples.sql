alter table public.travelling_cases
  add column samples_to_replace text not null default '' check (char_length(samples_to_replace) <= 1000);

grant update (samples_to_replace) on public.travelling_cases to authenticated;
