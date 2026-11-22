begin;

alter table public.crm_host_sessions
  add column grouped_shipping_cents integer check (grouped_shipping_cents between 0 and 99999999),
  add column individual_shipping_cents integer check (individual_shipping_cents between 0 and 99999999);
grant insert (grouped_shipping_cents,individual_shipping_cents),
  update (grouped_shipping_cents,individual_shipping_cents) on public.crm_host_sessions to authenticated;

create function private.align_meeting_shipping() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'meeting' and new.delivery_mode is not null then
    new.shipping_cents := case new.delivery_mode
      when 'grouped' then coalesce(new.grouped_shipping_cents,new.shipping_cents)
      else coalesce(new.individual_shipping_cents,new.shipping_cents)
    end;
  end if;
  return new;
end;
$$;
revoke all on function private.align_meeting_shipping() from public,anon,authenticated;
create trigger align_meeting_shipping before insert or update of delivery_mode,grouped_shipping_cents,individual_shipping_cents
on public.crm_host_sessions for each row execute function private.align_meeting_shipping();

create or replace function private.guard_meeting_order_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  session_status text;
  session_kind text;
  session_shipping integer;
begin
  if new.host_session_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.host_session_id is not distinct from old.host_session_id then return new; end if;
  select h.kind,h.status,h.shipping_cents into session_kind,session_status,session_shipping from public.crm_host_sessions h
    where h.owner_id = new.owner_id and h.id = new.host_session_id for share;
  if session_kind = 'meeting' and session_status = 'closed' then
    raise exception using errcode = '23514', message = 'Meeting already closed';
  end if;
  if session_kind = 'meeting' and tg_op = 'INSERT' and new.host_request_id is not null then
    new.shipping_cents := session_shipping;
  end if;
  return new;
end;
$$;

create function private.apply_meeting_shipping_on_close() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'meeting' and new.status = 'closed' and old.status <> 'closed' then
    update public.crm_orders o set shipping_cents = new.shipping_cents, meeting_reviewed_at = clock_timestamp()
      where o.owner_id = new.owner_id and o.host_session_id = new.id and o.status <> 'cancelled'
        and o.payment_status = 'later' and o.shipping_cents is distinct from new.shipping_cents;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_meeting_shipping_on_close() from public,anon,authenticated;
create trigger apply_meeting_shipping_on_close after update of status on public.crm_host_sessions
for each row execute function private.apply_meeting_shipping_on_close();

commit;
