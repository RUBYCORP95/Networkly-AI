begin;
create table public.crm_meeting_order_emails (
  order_id uuid primary key references public.crm_orders(id) on delete cascade,
  owner_id uuid not null,
  session_id uuid not null,
  recipient text,
  state text not null check (state in ('queued','sending','sent','failed','missing_email')),
  attempts integer not null default 0,
  next_at timestamptz,
  sent_at timestamptz,
  foreign key (owner_id,session_id) references public.crm_host_sessions(owner_id,id)
);
create index crm_meeting_email_session on public.crm_meeting_order_emails(owner_id,session_id);
create index crm_meeting_email_due on public.crm_meeting_order_emails(next_at) where state in ('queued','sending');
alter table public.crm_meeting_order_emails enable row level security;
revoke all on public.crm_meeting_order_emails from public,anon,authenticated;
grant select (order_id,owner_id,session_id,state) on public.crm_meeting_order_emails to authenticated;
grant select,update on public.crm_meeting_order_emails to service_role;
create policy own_meeting_order_emails on public.crm_meeting_order_emails for select to authenticated
  using (owner_id=(select auth.uid()) and (select private.can_manage_travelling_cases()));

create function private.queue_meeting_customer_bons() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'meeting' and new.status = 'closed' and old.status <> 'closed' then
    insert into public.crm_meeting_order_emails(order_id,owner_id,session_id,recipient,state,next_at)
    select o.id,o.owner_id,new.id,customer.email,
      case when customer.email is not null then 'queued' else 'missing_email' end,
      case when customer.email is not null then now() end
    from public.crm_orders o join public.crm_clients c on c.owner_id=o.owner_id and c.id=o.client_id
    cross join lateral (select nullif(btrim(c.email),'') as email) customer
    where o.owner_id=new.owner_id and o.host_session_id=new.id and o.status <> 'cancelled'
    on conflict(order_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.queue_meeting_customer_bons() from public,anon,authenticated;
create trigger queue_meeting_customer_bons after update of status on public.crm_host_sessions
  for each row execute function private.queue_meeting_customer_bons();

create function public.claim_meeting_customer_bons()
returns setof public.crm_meeting_order_emails language sql security invoker set search_path = '' as $$
  update public.crm_meeting_order_emails q set state='sending', attempts=q.attempts+1,next_at=now()+interval '5 minutes'
  from (
    select job.order_id from public.crm_meeting_order_emails job
    join public.crm_host_sessions h on h.owner_id=job.owner_id and h.id=job.session_id
    where job.state in ('queued','sending') and job.next_at<=now() and job.attempts<3 and h.status='closed'
    order by job.next_at,job.order_id limit 6 for update of job skip locked
  ) due where q.order_id=due.order_id returning q.*;
$$;
revoke all on function public.claim_meeting_customer_bons() from public,anon,authenticated;
grant execute on function public.claim_meeting_customer_bons() to service_role;

create function public.retry_my_meeting_customer_bon(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_travelling_cases() then return false; end if;
  update public.crm_meeting_order_emails q
  set recipient=btrim(c.email), state='queued', attempts=0, next_at=now()
  from public.crm_orders o join public.crm_clients c on c.owner_id=o.owner_id and c.id=o.client_id
    join public.crm_host_sessions h on h.owner_id=o.owner_id and h.id=o.host_session_id
  where q.owner_id=(select auth.uid()) and q.order_id=p_order_id and q.order_id=o.id and q.owner_id=o.owner_id
    and q.session_id=h.id and h.status='closed' and q.state in ('missing_email','failed')
    and o.status <> 'cancelled' and nullif(btrim(c.email),'') is not null;
  return found;
end;
$$;
revoke all on function public.retry_my_meeting_customer_bon(uuid) from public,anon;
grant execute on function public.retry_my_meeting_customer_bon(uuid) to authenticated;
commit;
