begin;
alter table public.crm_orders add column meeting_reviewed_at timestamptz;
grant update (meeting_reviewed_at,delivery_address) on public.crm_orders to authenticated;

create function private.guard_meeting_order_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  session_status text;
  session_kind text;
begin
  if new.host_session_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.host_session_id is not distinct from old.host_session_id then return new; end if;
  select h.kind,h.status into session_kind,session_status from public.crm_host_sessions h
    where h.owner_id = new.owner_id and h.id = new.host_session_id for share;
  if session_kind = 'meeting' and session_status = 'closed' then
    raise exception using errcode = '23514', message = 'Meeting already closed';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meeting_order_attachment() from public,anon,authenticated;
create trigger guard_meeting_order_attachment before insert or update of host_session_id on public.crm_orders
for each row execute function private.guard_meeting_order_attachment();

create function private.invalidate_meeting_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.meeting_reviewed_at is not distinct from old.meeting_reviewed_at and (
    new.payment_status is distinct from old.payment_status or new.items is distinct from old.items or
    new.total_cents is distinct from old.total_cents or new.shipping_cents is distinct from old.shipping_cents or
    (old.status = 'cancelled' and new.status <> 'cancelled')
  ) then new.meeting_reviewed_at := null; end if;
  return new;
end;
$$;
revoke all on function private.invalidate_meeting_review() from public,anon,authenticated;
create trigger invalidate_meeting_review before update on public.crm_orders
for each row execute function private.invalidate_meeting_review();

create or replace function private.keep_meeting_delivery_mode() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.delivery_mode is not null and old.delivery_mode is distinct from new.delivery_mode
    and not (new.status = 'closed' and old.status <> 'closed') and exists (
      select 1 from public.crm_orders o where o.owner_id = old.owner_id and o.host_session_id = old.id
    ) then raise exception 'Meeting delivery already selected for linked orders'; end if;
  return new;
end;
$$;

create function private.guard_meeting_close() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind <> 'meeting' or new.status <> 'closed' or old.status = 'closed' then return new; end if;
  if new.delivery_mode is null then
    raise exception using errcode = '23514', message = 'Meeting requires a final delivery mode';
  end if;
  if exists (
    select 1 from public.crm_orders o where o.owner_id = new.owner_id and o.host_session_id = new.id
      and o.status <> 'cancelled' and (o.meeting_reviewed_at is null or o.payment_status not in ('paid','later'))
  ) then raise exception using errcode = '23514', message = 'Meeting orders require payment review'; end if;
  if new.delivery_mode = 'individual' and exists (
    select 1 from public.crm_orders o where o.owner_id = new.owner_id and o.host_session_id = new.id
      and o.status <> 'cancelled' and o.delivery_address is null
  ) then raise exception using errcode = '23514', message = 'Meeting orders require delivery addresses'; end if;
  return new;
end;
$$;
revoke all on function private.guard_meeting_close() from public,anon,authenticated;
create trigger guard_meeting_close before update of status on public.crm_host_sessions
for each row execute function private.guard_meeting_close();

create function public.review_crm_meeting_order(meeting uuid, order_id uuid, payment text, destination text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  destination := nullif(btrim(destination),'');
  if payment is null or payment not in ('paid','later') or char_length(destination) not between 5 and 500 then return false; end if;
  if not exists(select 1 from public.crm_host_sessions h where h.owner_id = (select auth.uid()) and
    h.id = meeting and h.kind = 'meeting' and h.status <> 'cancelled') then return false; end if;
  update public.crm_orders o
    set payment_status = payment, meeting_reviewed_at = clock_timestamp(),
      delivery_address = coalesce(destination,o.delivery_address)
    where o.owner_id = (select auth.uid()) and o.id = order_id and o.host_session_id = meeting and o.status <> 'cancelled';
  return found;
end;
$$;
revoke all on function public.review_crm_meeting_order(uuid,uuid,text,text) from public,anon;
grant execute on function public.review_crm_meeting_order(uuid,uuid,text,text) to authenticated;
commit;
