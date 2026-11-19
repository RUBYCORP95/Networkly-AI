alter table public.lead_private_klaviyo_contacts
  add column qualification_status text
  check (qualification_status in ('interested', 'not_interested', 'consultant'));
