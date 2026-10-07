alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists onboarding_step smallint not null default 1 check(onboarding_step between 1 and 3);
