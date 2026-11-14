begin;
create schema if not exists private;
-- Only the trusted worker can enumerate due recipients. Each delivery still
-- uses the existing owner/member checks, lease, retry cap and idempotency key.
create or replace function public.claim_due_periodic_emails(batch_size integer default 5, recipient_filter text default null)
returns setof jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare candidate record; result jsonb; claimed integer:=0;
begin
  if batch_size is null or batch_size not between 1 and 20 then raise exception 'INVALID_BATCH_SIZE'; end if;
  for candidate in
    select distinct on (p.user_id,t.id) p.user_id,t.id,w.id as workspace_id,c.timezone
    from public.periodic_member_preferences p
    join public.periodic_tasks t on t.id=p.task_id and t.deleted_at is null
    join public.module_collections c on c.id=t.collection_id
    join public.collection_members m on m.collection_id=c.id and m.user_id=p.user_id
    join public.workspace_module_bindings b on b.collection_id=c.id and b.module='periodic'
    join public.workspaces w on w.id=b.workspace_id and w.user_id=p.user_id
    join auth.users u on u.id=p.user_id and u.email_confirmed_at is not null
    join pg_timezone_names z on z.name=c.timezone
    where p.notify_email and p.reminder_time is not null and w.archived_at is null
      and 'periodic'=any(w.active_modules)
      and (recipient_filter is null or lower(u.email)=lower(recipient_filter))
      and (clock_timestamp() at time zone c.timezone)>=(clock_timestamp() at time zone c.timezone)::date+p.reminder_time
      and (clock_timestamp() at time zone c.timezone)<(clock_timestamp() at time zone c.timezone)::date+p.reminder_time+interval '10 minutes'
      and not exists(select 1 from public.periodic_email_deliveries d where d.user_id=p.user_id and d.task_id=t.id
        and d.delivery_day=(clock_timestamp() at time zone c.timezone)::date
        and (d.delivered_at is not null or d.attempts>=5 or d.claimed_at>clock_timestamp()-interval '1 minute'))
    order by p.user_id,t.id,w.created_at,w.id limit 1000
  loop
    begin
      result:=public.claim_periodic_email(candidate.user_id,candidate.id,candidate.workspace_id,candidate.timezone);
      if result->>'status'='claimed' then
        return next result; claimed:=claimed+1;
        exit when claimed>=batch_size;
      end if;
    exception when raise_exception then
      if sqlerrm not in ('ACCESS_DENIED','EMAIL_DISABLED','EMAIL_UNAVAILABLE','INVALID_TIMEZONE','REMINDER_NOT_DUE','DELIVERY_LIMIT') then raise; end if;
    end;
  end loop;
end; $$;
revoke all on function public.claim_due_periodic_emails(integer,text) from public,anon,authenticated;
grant execute on function public.claim_due_periodic_emails(integer,text) to service_role;

-- Operational counters only: never store note content, email addresses or tokens.
create table if not exists public.background_run_status (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 succeeded boolean not null,
 emails_sent integer not null check(emails_sent between 0 and 20),
 emails_failed integer not null check(emails_failed between 0 and 20),
 mail_configured boolean not null,
 cleanup_succeeded boolean not null
);
alter table public.background_run_status enable row level security;
create index if not exists background_run_status_created on public.background_run_status(created_at);
revoke all on public.background_run_status from public,anon,authenticated;
grant select,insert,delete on public.background_run_status to service_role;
grant usage,select on sequence public.background_run_status_id_seq to service_role;

create table if not exists private.maintenance_tickets(id uuid primary key,issued_at timestamptz not null);
alter table private.maintenance_tickets enable row level security;
revoke all on private.maintenance_tickets from public,anon,authenticated;
create or replace function public.consume_maintenance_ticket(ticket uuid,issued_at bigint) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if ticket is null or issued_at is null or to_timestamp(issued_at)<clock_timestamp()-interval '90 seconds'
  or to_timestamp(issued_at)>clock_timestamp()+interval '15 seconds' then return false; end if;
 delete from private.maintenance_tickets t where t.issued_at<clock_timestamp()-interval '5 minutes';
 insert into private.maintenance_tickets(id,issued_at) values(ticket,to_timestamp(issued_at)) on conflict do nothing;
 return found;
end; $$;
revoke all on function public.consume_maintenance_ticket(uuid,bigint) from public,anon,authenticated;
grant execute on function public.consume_maintenance_ticket(uuid,bigint) to service_role;
notify pgrst,'reload schema';
commit;
