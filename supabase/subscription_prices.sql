create table public.subscription_prices (
  code text primary key check (code in ('free','pro','studio','business','agency')),
  cents integer not null check (cents between 0 and 999999 and (code = 'free') = (cents = 0)),
  updated_at timestamptz not null default now()
);
create table public.subscription_price_history (
  id bigint generated always as identity primary key,
  code text not null references public.subscription_prices(code),
  previous_cents integer not null,
  new_cents integer not null,
  administrator uuid not null,
  changed_at timestamptz not null default now()
);
alter table public.subscription_prices enable row level security;
alter table public.subscription_price_history enable row level security;
revoke all on public.subscription_prices, public.subscription_price_history from public, anon, authenticated, service_role;
grant select on public.subscription_prices, public.subscription_price_history to service_role;
grant update (cents, updated_at) on public.subscription_prices to service_role;
grant insert on public.subscription_price_history to service_role;

insert into public.subscription_prices(code,cents) values
  ('free',0),('pro',coalesce((select round(monthly_price*100)::integer from public.app_settings where id='main'),999)),
  ('studio',2999),('business',4999),('agency',9900);

create function public.update_subscription_price(actor uuid, plan_code text, expected_cents integer, new_cents integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=actor and is_admin is true and account_status is distinct from 'suspended') then
    return false;
  end if;
  update public.subscription_prices set cents=new_cents, updated_at=now()
    where code=plan_code and code<>'free' and cents=expected_cents and cents<>new_cents;
  if not found then return false; end if;
  insert into public.subscription_price_history(code,previous_cents,new_cents,administrator)
    values(plan_code,expected_cents,new_cents,actor);
  return true;
end;
$$;
revoke all on function public.update_subscription_price(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.update_subscription_price(uuid,text,integer,integer) to service_role;
