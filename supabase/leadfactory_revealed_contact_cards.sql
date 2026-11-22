begin;

create function public.my_lead_contact_cards()
returns table (
  allocation_id uuid, contact_kind text, city text, department text, postal_code text,
  distance_km numeric, assigned_at timestamptz, expires_at timestamptz, contact_revealed boolean,
  display_name text, client_id uuid, can_convert boolean, archived boolean,
  phone text, email text, company text
)
language sql stable security definer set search_path = '' as $$
  with active_cards as (
    select c.allocation_id from public.my_lead_allocation_cards() c where c.contact_revealed
  )
  select c.*,
    coalesce(nullif(btrim(k.phone),''),nullif(btrim(p.phone),'')),
    coalesce(nullif(btrim(k.email),''),nullif(btrim(p.email),'')),
    nullif(btrim(p.company),'')
  from public.my_lead_conversion_cards() c
  join public.lead_daily_allocations a on a.id=c.allocation_id and a.user_id=(select auth.uid())
  left join active_cards ac on ac.allocation_id=a.id and a.revealed_at is not null
    and a.released_at is null and not c.archived
  left join public.lead_private_klaviyo_contacts k on ac.allocation_id is not null
    and a.contact_kind='klaviyo' and a.contact_id=k.id
  left join public.lead_private_professional_imports p on ac.allocation_id is not null
    and a.contact_kind='professional' and a.contact_id=p.id and p.prospect_status='eligible'
  order by c.assigned_at desc,c.allocation_id;
$$;

revoke all on function public.my_lead_contact_cards() from public,anon;
grant execute on function public.my_lead_contact_cards() to authenticated;

commit;
