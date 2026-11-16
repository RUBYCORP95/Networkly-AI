alter table public.lead_private_klaviyo_contacts
  add column if not exists city text,
  add column if not exists department text;
alter table public.lead_private_klaviyo_contacts
  add constraint lead_private_klaviyo_location_required
    check (length(btrim(coalesce(city,''))) > 0 or length(btrim(coalesce(department,''))) > 0);
alter table public.lead_private_klaviyo_contacts
  add constraint lead_private_klaviyo_phone_required
    check (phone is not null and length(regexp_replace(phone,'[^0-9]','','g')) >= 8);
