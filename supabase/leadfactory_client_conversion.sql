begin;

alter table public.crm_clients
  add column lead_source text check (lead_source in ('klaviyo','professional')),
  add column lead_location text check (char_length(lead_location) <= 150),
  add column lead_note text check (char_length(lead_note) <= 500);
grant update (lead_note) on public.crm_clients to authenticated;

alter table public.lead_daily_allocations
  add column converted_client_id uuid,
  add column consultant_archived_at timestamptz,
  add constraint lead_allocation_client_owner foreign key (user_id,converted_client_id)
    references public.crm_clients(owner_id,id) on delete set null (converted_client_id);

create function private.lead_phone_key(value text)
returns text language sql immutable strict set search_path = '' as $$
  select case
    when digits ~ '^0033[1-9][0-9]{8}$' then '0' || substr(digits,5)
    when digits ~ '^33[1-9][0-9]{8}$' then '0' || substr(digits,3)
    when char_length(digits) between 7 and 16 then digits
  end from (select regexp_replace(value,'[^0-9]','','g') as digits) p;
$$;
revoke all on function private.lead_phone_key(text) from public,anon,authenticated;

create function public.convert_my_lead_to_client(p_allocation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  consultant uuid := (select auth.uid());
  allocation public.lead_daily_allocations%rowtype;
  contact record;
  contact_name text;
  contact_email text;
  contact_phone text;
  contact_location text;
  phone_key text;
  client_id uuid;
begin
  if consultant is null or not public.can_access_my_leads() or not private.can_manage_travelling_cases() then
    raise exception using errcode='42501', message='Lead conversion access denied';
  end if;

  select * into allocation from public.lead_daily_allocations a
    where a.id = p_allocation_id and a.user_id = consultant and a.released_at is null and a.revealed_at is not null
    for update;
  if not found then return null; end if;
  if allocation.converted_client_id is not null then return allocation.converted_client_id; end if;

  select * into contact from public.reveal_my_daily_allocation(allocation.id);
  contact_email := nullif(lower(btrim(contact.email)), '');
  contact_phone := nullif(btrim(contact.phone), '');
  phone_key := private.lead_phone_key(contact_phone);
  contact_name := left(coalesce(
    nullif(concat_ws(' ',nullif(btrim(contact.first_name),''),nullif(btrim(contact.last_name),'')),''),
    nullif(btrim(contact.company),''), contact_email, contact_phone, 'Contact LeadFactory'
  ),120);

  if allocation.contact_kind = 'klaviyo' then
    select left(nullif(concat_ws(' ',nullif(btrim(k.postal_code),''),nullif(btrim(k.city),'')),''),150) into contact_location
      from public.lead_private_klaviyo_contacts k where k.id=allocation.contact_id;
  else
    select left(nullif(concat_ws(' ',nullif(btrim(p.postal_code),''),nullif(btrim(p.city),'')),''),150) into contact_location
      from public.lead_private_professional_imports p where p.id=allocation.contact_id;
  end if;

  if phone_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(consultant::text || ':lead-phone:' || phone_key,0));
  end if;
  if contact_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(consultant::text || ':' || contact_email,0));
    select c.id into client_id from public.crm_clients c where c.owner_id=consultant
      and lower(btrim(c.email))=contact_email order by c.id limit 1;
  end if;

  if client_id is null and phone_key is not null then
    select c.id into client_id from public.crm_clients c where c.owner_id=consultant
      and private.lead_phone_key(c.phone)=phone_key
      and (contact_email is null or nullif(btrim(c.email),'') is null)
      order by c.id limit 1;
  end if;

  if client_id is null then
    insert into public.crm_clients (owner_id,name,email,phone,lead_source,lead_location,lead_note)
    values(consultant,contact_name,left(contact_email,254),left(contact_phone,40),allocation.contact_kind,
      contact_location,'Client issu de LeadFactory') returning id into client_id;
  else
    update public.crm_clients c set
      email=coalesce(nullif(btrim(c.email),''),left(contact_email,254)),
      phone=coalesce(nullif(btrim(c.phone),''),left(contact_phone,40)),
      lead_source=coalesce(c.lead_source,allocation.contact_kind),
      lead_location=coalesce(c.lead_location,contact_location),
      lead_note=coalesce(c.lead_note,'Client issu de LeadFactory')
    where c.id=client_id and c.owner_id=consultant;
  end if;

  update public.lead_daily_allocations set converted_client_id=client_id
    where id=allocation.id and user_id=consultant;
  return client_id;
end;
$$;
revoke all on function public.convert_my_lead_to_client(uuid) from public,anon;
grant execute on function public.convert_my_lead_to_client(uuid) to authenticated;

create function public.set_my_lead_archived(p_allocation_id uuid, p_archived boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_my_leads() then
    raise exception using errcode='42501', message='Lead archive access denied';
  end if;
  update public.lead_daily_allocations a set consultant_archived_at =
    case when p_archived then coalesce(a.consultant_archived_at,now()) end
  where a.id=p_allocation_id and a.user_id=(select auth.uid()) and a.revealed_at is not null and a.released_at is null;
  return found;
end;
$$;
revoke all on function public.set_my_lead_archived(uuid,boolean) from public,anon;
grant execute on function public.set_my_lead_archived(uuid,boolean) to authenticated;

create function public.my_lead_conversion_cards()
returns table (
  allocation_id uuid, contact_kind text, city text, department text, postal_code text, distance_km numeric,
  assigned_at timestamptz, expires_at timestamptz, contact_revealed boolean, display_name text,
  client_id uuid, can_convert boolean, archived boolean
)
language sql stable security definer set search_path = '' as $$
  with cards as (select * from public.my_lead_allocation_cards_with_names()),
  permission as (select private.can_manage_travelling_cases() as can_convert)
  select c.*, case when (select p.can_convert from permission p) then a.converted_client_id end,
    (select p.can_convert from permission p) and c.contact_revealed,
    a.consultant_archived_at is not null
  from cards c join public.lead_daily_allocations a on a.id=c.allocation_id and a.user_id=(select auth.uid())
  union all
  select a.id,a.contact_kind,c.lead_location,null::text,null::text,null::numeric,
    a.assigned_at,a.expires_at,true,c.name,c.id,false,a.consultant_archived_at is not null
  from public.lead_daily_allocations a
  left join public.crm_clients c on c.owner_id=a.user_id and c.id=a.converted_client_id and (select p.can_convert from permission p)
  where a.user_id=(select auth.uid()) and public.can_access_my_leads()
    and (a.consultant_archived_at is not null or c.id is not null)
    and not exists (select 1 from cards x where x.allocation_id=a.id)
  order by assigned_at desc;
$$;
revoke all on function public.my_lead_conversion_cards() from public,anon;
grant execute on function public.my_lead_conversion_cards() to authenticated;

commit;
