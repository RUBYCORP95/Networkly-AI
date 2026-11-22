begin;

alter table public.crm_host_sessions
  add column delivery_mode text check (delivery_mode is null or (kind = 'meeting' and delivery_mode in ('grouped','individual'))),
  add column delivery_address text check (delivery_address is null or
    (delivery_mode is not distinct from 'grouped' and char_length(btrim(delivery_address)) between 5 and 500));

alter table public.crm_orders
  add column delivery_address text check (char_length(btrim(delivery_address)) between 5 and 500);

grant insert (delivery_mode,delivery_address), update (delivery_mode,delivery_address) on public.crm_host_sessions to authenticated;
grant insert (delivery_address) on public.crm_orders to service_role;

create function private.keep_meeting_delivery_mode() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.delivery_mode is not null and old.delivery_mode is distinct from new.delivery_mode and exists (
    select 1 from public.crm_orders o where o.owner_id = old.owner_id and o.host_session_id = old.id
  ) then raise exception 'Meeting delivery already selected for linked orders'; end if;
  return new;
end;
$$;
revoke all on function private.keep_meeting_delivery_mode() from public,anon,authenticated;
create trigger keep_meeting_delivery_mode before update of delivery_mode on public.crm_host_sessions
for each row execute function private.keep_meeting_delivery_mode();

create function public.submit_crm_delivery_order(invite uuid, request_id uuid, first_name text, last_name text,
  customer_email text, customer_phone text, customer_birth date, subtotal integer, order_items jsonb, destination text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  invitation record;
  customer uuid;
  seller_snapshot jsonb;
  delivery_mode text;
begin
  if request_id is null or subtotal is null or subtotal not between 0 and 99999999
    or order_items is null or jsonb_typeof(order_items) <> 'array'
    or jsonb_array_length(order_items) not between 1 and 20 then return false; end if;
  select * into invitation from private.crm_public_invitation(invite);
  if not found then return false; end if;
  if invitation.host_session is not null then
    select h.delivery_mode into delivery_mode from public.crm_host_sessions h
      where h.id = invitation.host_session and h.status = 'active' for share;
    if not found then return false; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(invitation.consultant::text || ':order:' || request_id::text, 0));
  if exists(select 1 from public.crm_orders o where o.owner_id = invitation.consultant and o.host_request_id = request_id)
    then return true; end if;
  destination := nullif(btrim(destination),'');
  if delivery_mode = 'individual' then
    if destination is null or char_length(destination) not between 5 and 500 then return false; end if;
  else
    destination := null;
  end if;
  customer := private.resolve_crm_public_customer(invitation.consultant,first_name,last_name,customer_email,customer_phone,customer_birth);
  if customer is null then return false; end if;
  select to_jsonb(s) - 'owner_id' into seller_snapshot from public.crm_seller_profiles s where s.owner_id = invitation.consultant;
  insert into public.crm_orders(owner_id,client_id,details,total_cents,shipping_cents,items,source,seller,
    host_session_id,host_request_id,manual_email_only,delivery_address)
    values(invitation.consultant,customer,case when invitation.host_session is null then 'Commande via un lien consultant'
      else 'Commande via un lien hôte' end,subtotal,invitation.shipping,order_items,'client',seller_snapshot,
      invitation.host_session,request_id,true,destination);
  insert into public.crm_customer_klaviyo_queue(email) values(lower(btrim(customer_email))) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.submit_crm_delivery_order(uuid,uuid,text,text,text,text,date,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_crm_delivery_order(uuid,uuid,text,text,text,text,date,integer,jsonb,text) to service_role;

commit;
