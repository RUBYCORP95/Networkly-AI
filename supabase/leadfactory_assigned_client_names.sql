create or replace function public.my_lead_allocation_cards_with_names()
returns table (
  allocation_id uuid, contact_kind text, city text, department text,
  postal_code text, distance_km numeric, assigned_at timestamptz,
  expires_at timestamptz, contact_revealed boolean, display_name text
)
language sql stable security definer
set search_path = ''
as $$
  select card.*, nullif(concat_ws(' ', nullif(btrim(contact.first_name), ''), nullif(btrim(contact.last_name), '')), '')
  from public.my_lead_allocation_cards() card
  join public.lead_daily_allocations allocation
    on allocation.id = card.allocation_id and allocation.user_id = (select auth.uid())
  left join public.lead_private_klaviyo_contacts contact
    on card.contact_kind = 'klaviyo' and contact.id = allocation.contact_id
  order by card.assigned_at desc;
$$;

revoke all on function public.my_lead_allocation_cards_with_names() from public, anon;
grant execute on function public.my_lead_allocation_cards_with_names() to authenticated;
