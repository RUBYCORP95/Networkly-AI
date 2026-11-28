begin;

create table public.public_catalogues (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  enabled boolean not null default true,
  shipping_cents integer not null default 0 check (shipping_cents between 0 and 99999999)
);

create table public.public_catalogue_products (
  id bigint primary key generated always as identity (start with 1000000000),
  reference text not null unique check (char_length(reference) between 1 and 80),
  category text not null check (category in ('parfums','visage','corps','cheveux','maquillage','entretien','ambiance','bien-etre','hygiene','solaires')),
  title text not null check (char_length(title) between 1 and 180),
  format text not null default '' check (char_length(format) <= 80),
  description text not null default '' check (char_length(description) <= 3000),
  bottle text check (bottle in ('noir','blanc')),
  notes text not null default '' check (char_length(notes) <= 1000),
  photo_url text not null default '' check (char_length(photo_url) <= 1000),
  photo_alt text not null default '' check (char_length(photo_alt) <= 200),
  source_note text not null default '' check (char_length(source_note) <= 1000),
  unit_cents integer not null check (unit_cents between 0 and 99999999),
  available boolean not null default false,
  visible boolean not null default false,
  verified boolean not null default false,
  check (not visible or (verified and photo_url like 'https://%' and source_note <> '' and description <> '' and
    (category <> 'parfums' or (bottle is not null and notes <> ''))))
);

create table public.public_catalogue_promos (
  code text primary key check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  discount_bp integer not null check (discount_bp between 1 and 10000),
  active boolean not null default false
);

create table public.public_catalogue_daily (
  owner_id uuid not null references public.public_catalogues(owner_id) on delete cascade,
  day date not null,
  visits bigint not null default 0,
  orders bigint not null default 0,
  primary key (owner_id, day)
);

alter table public.public_catalogues enable row level security;
alter table public.public_catalogue_products enable row level security;
alter table public.public_catalogue_promos enable row level security;
alter table public.public_catalogue_daily enable row level security;
revoke all on public.public_catalogues, public.public_catalogue_products,
  public.public_catalogue_promos, public.public_catalogue_daily from public, anon, authenticated, service_role;
grant select, insert (owner_id), update (enabled,shipping_cents) on public.public_catalogues to service_role;
grant select, insert, update on public.public_catalogue_products, public.public_catalogue_promos to service_role;
grant usage on sequence public.public_catalogue_products_id_seq to service_role;
grant select on public.public_catalogue_daily to service_role;

alter table public.crm_orders add column catalogue_request_id uuid;
create unique index crm_orders_catalogue_request on public.crm_orders(owner_id,catalogue_request_id)
  where catalogue_request_id is not null;

create function public.count_public_catalogue_visit(catalogue uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.public_catalogue_daily(owner_id,day,visits)
  select c.owner_id,(now() at time zone 'Europe/Paris')::date,1
  from public.public_catalogues c where c.id = catalogue and c.enabled
  on conflict (owner_id,day) do update set visits = public.public_catalogue_daily.visits + 1;
$$;
revoke all on function public.count_public_catalogue_visit(uuid) from public,anon,authenticated;
grant execute on function public.count_public_catalogue_visit(uuid) to service_role;

create function public.checkout_public_catalogue(
  catalogue uuid, context_token uuid, cart jsonb, code_input text, mode_input text, submission uuid,
  expected_total integer, customer_data jsonb, destination text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  config public.public_catalogues%rowtype;
  host public.crm_host_sessions%rowtype;
  meeting_promo public.crm_meeting_promos%rowtype;
  seller_snapshot jsonb;
  shipping integer;
  delivery_mode text;
  customer uuid;
  lines jsonb;
  subtotal bigint;
  discount_bp integer;
  savings integer := 0;
  existing_order uuid;
begin
  select c.* into config from public.public_catalogues c
    join public.profiles p on p.id = c.owner_id
    where c.id = catalogue and c.enabled and (
      p.is_admin is true or (p.account_status is distinct from 'suspended' and exists (
        select 1 from public.lead_team_memberships m where m.user_id = c.owner_id and m.status = 'verified'
      ))) for share of c,p;
  if not found then return jsonb_build_object('error','catalogue'); end if;

  if submission is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(config.owner_id::text || ':order:' || submission::text,0));
    select o.id into existing_order from public.crm_orders o where o.owner_id = config.owner_id
      and o.catalogue_request_id = submission;
    if found then return jsonb_build_object('submitted',true); end if;
  end if;

  select to_jsonb(s) - 'owner_id' - 'payment_links' into seller_snapshot
    from public.crm_seller_profiles s where s.owner_id = config.owner_id;
  if not found then return jsonb_build_object('error','catalogue'); end if;

  shipping := config.shipping_cents;
  if context_token is not null then
    select h.* into host from public.crm_host_sessions h where h.order_token = context_token
      and h.owner_id = config.owner_id and h.status = 'active' and (h.kind = 'meeting' or
      (now() at time zone 'Europe/Paris')::date between h.starts_on and h.ends_on) for share;
    if not found then return jsonb_build_object('error','context'); end if;
    shipping := host.shipping_cents;
    if host.kind = 'meeting' then
      if mode_input is null or mode_input not in ('grouped','individual') then
        return jsonb_build_object('error','delivery');
      end if;
      delivery_mode := mode_input;
      shipping := private.meeting_shipping_rate(host,delivery_mode);
    end if;
  end if;

  if cart is null or jsonb_typeof(cart) <> 'array' or jsonb_array_length(cart) not between 1 and 20 then
    return jsonb_build_object('error','cart');
  end if;
  with products as (
    select p.*, x.quantity from jsonb_to_recordset(cart) as x(id bigint, quantity integer)
    join public.public_catalogue_products p on p.id = x.id
    where p.verified and p.visible and p.available and x.quantity between 1 and 999
    order by p.id for share of p
  )
  select jsonb_agg(jsonb_build_object('id',id::text,'handle','tesami-catalogue','title',title,
      'format',format,'reference',reference,'unit_cents',unit_cents,'quantity',quantity) order by id),
    sum(unit_cents::bigint * quantity)
  into lines,subtotal from products
  having count(distinct id) = jsonb_array_length(cart);
  if subtotal is null or subtotal > 99999999 then return jsonb_build_object('error','cart'); end if;

  if code_input <> '' then
    if host.kind = 'meeting' then
      select p.* into meeting_promo from public.crm_meeting_promos p
      where p.owner_id = config.owner_id and p.session_id = host.id and p.code = code_input and p.active for update;
      if found then
        if meeting_promo.max_uses is not null and
          (select count(*) from public.crm_orders o where o.meeting_promo_id = meeting_promo.id) >= meeting_promo.max_uses then
          return jsonb_build_object('error','promo');
        end if;
        discount_bp := meeting_promo.discount_bp;
      end if;
    end if;
    if discount_bp is null then
      select p.discount_bp into discount_bp from public.public_catalogue_promos p
      where p.code = code_input and p.active for share;
    end if;
    if discount_bp is null then return jsonb_build_object('error','promo'); end if;
    savings := round(subtotal::numeric * discount_bp / 10000)::integer;
  end if;

  if submission is null then
    return jsonb_build_object('subtotal',subtotal,'shipping',shipping,'savings',savings,'total',subtotal-savings+shipping);
  end if;
  if expected_total is distinct from subtotal - savings + shipping then
    return jsonb_build_object('error','price');
  end if;
  if delivery_mode = 'grouped' then
    destination := null;
  elsif destination is null or char_length(btrim(destination)) not between 5 and 500 then
    return jsonb_build_object('error','delivery');
  end if;

  customer := private.resolve_crm_public_customer(config.owner_id,customer_data->>'first_name',
    customer_data->>'last_name',customer_data->>'customer_email',customer_data->>'customer_phone',
    (customer_data->>'customer_birth')::date);
  perform 1 from public.crm_clients c where c.id = customer and c.owner_id = config.owner_id
    and c.archived_at is null for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'Catalogue customer unavailable';
  end if;

  insert into public.crm_orders(owner_id,client_id,details,total_cents,shipping_cents,items,source,seller,
    host_session_id,catalogue_request_id,manual_email_only,delivery_address,meeting_delivery_mode,meeting_promo_id,order_discount)
  values(config.owner_id,customer,'Commande via Mon catalogue',subtotal-savings,shipping,lines,'client',seller_snapshot,
    host.id,submission,true,destination,delivery_mode,meeting_promo.id,
    case when discount_bp is not null then jsonb_build_object('type','percent','amount',discount_bp,'applied_cents',savings) end);
  insert into public.public_catalogue_daily(owner_id,day,orders)
  values(config.owner_id,(now() at time zone 'Europe/Paris')::date,1)
  on conflict (owner_id,day) do update set orders = public.public_catalogue_daily.orders + 1;
  return jsonb_build_object('submitted',true);
end;
$$;
revoke all on function public.checkout_public_catalogue(uuid,uuid,jsonb,text,text,uuid,integer,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.checkout_public_catalogue(uuid,uuid,jsonb,text,text,uuid,integer,jsonb,text) to service_role;

commit;
