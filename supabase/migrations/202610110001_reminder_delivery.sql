-- After tab_sharing_modules.sql. Delivery claims are available only to the Edge Function.
begin;
create table if not exists public.periodic_email_deliveries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.periodic_tasks(id) on delete cascade, delivery_day date not null,
  payload jsonb, attempts integer not null default 1, lease uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default clock_timestamp(), delivered_at timestamptz,
  unique(user_id,task_id,delivery_day)
);
alter table public.periodic_email_deliveries enable row level security;
revoke all on public.periodic_email_deliveries from public,anon,authenticated;
create or replace function public.claim_periodic_email(uid uuid, tid uuid, wid uuid, tz text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare task public.periodic_tasks; pref public.periodic_member_preferences;
  delivery public.periodic_email_deliveries; local_now timestamp; today date;
  recipient text; workspace_name text; due boolean; done boolean; message jsonb;
begin
  if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'INVALID_TIMEZONE'; end if;
  local_now := clock_timestamp() at time zone tz; today := local_now::date;
  select t.* into task from periodic_tasks t
    join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='periodic'
    join workspaces w on w.id=b.workspace_id
    join collection_members m on m.collection_id=t.collection_id and m.user_id=uid
    where t.id=tid and w.id=wid and w.user_id=uid and w.archived_at is null and 'periodic'=any(w.active_modules);
  if not found then raise exception 'ACCESS_DENIED'; end if;
  select * into pref from periodic_member_preferences where task_id=tid and user_id=uid;
  if not found or not pref.notify_email or pref.reminder_time is null then raise exception 'EMAIL_DISABLED'; end if;
  select email into recipient from auth.users where id=uid;
  if recipient is null or recipient='' then raise exception 'EMAIL_UNAVAILABLE'; end if;
  select name into workspace_name from workspaces where id=wid;
  due := case task.frequency when 'daily' then true
    when 'weekly' then extract(dow from today)::integer=any(coalesce(task.days_of_week,'{}'))
    when 'monthly' then extract(day from today)=least(task.day_of_month,extract(day from date_trunc('month',today)+interval '1 month - 1 day')::integer)
    when 'yearly' then extract(month from today)=task.month_of_year and extract(day from today)=task.day_of_month
    when 'custom' then today>=coalesce(task.anchor_date,task.created_at::date)
      and (today-coalesce(task.anchor_date,task.created_at::date))%greatest(coalesce(task.interval_days,1),1)=0
    else false end;
  done := case task.frequency when 'monthly' then date_trunc('month',task.completed_date)=date_trunc('month',today)
    when 'yearly' then extract(year from task.completed_date)=extract(year from today)
    else task.completed_date=today end;
  if not coalesce(due,false) or coalesce(done,false) or local_now<today+pref.reminder_time
    or local_now>=today+pref.reminder_time+interval '10 minutes' then raise exception 'REMINDER_NOT_DUE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1));
  select * into delivery from periodic_email_deliveries where user_id=uid and task_id=tid and delivery_day=today for update;
  if found then
    if delivery.delivered_at is not null then return jsonb_build_object('status','delivered'); end if;
    if delivery.claimed_at>clock_timestamp()-interval '1 minute' then return jsonb_build_object('status','busy'); end if;
    if delivery.attempts>=5 then raise exception 'DELIVERY_LIMIT'; end if;
    update periodic_email_deliveries set attempts=attempts+1,lease=gen_random_uuid(),claimed_at=clock_timestamp()
      where id=delivery.id returning * into delivery;
  else
    if (select count(*) from periodic_email_deliveries where user_id=uid and claimed_at>clock_timestamp()-interval '1 hour')>=100
      then raise exception 'DELIVERY_LIMIT'; end if;
    message := jsonb_build_object('to',recipient,'title',left(task.title,200),'notes',left(coalesce(task.notes,''),500),
      'category',task.category,'workspaceName',workspace_name,'reminderTime',pref.reminder_time::text);
    insert into periodic_email_deliveries(user_id,task_id,delivery_day,payload) values(uid,tid,today,message) returning * into delivery;
  end if;
  return jsonb_build_object('status','claimed','id',delivery.id,'lease',delivery.lease,'payload',delivery.payload);
end $$;
create or replace function public.finish_periodic_email(did uuid, token uuid, success boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update periodic_email_deliveries set delivered_at=case when success then clock_timestamp() else null end,
    payload=case when success then null else payload end,
    claimed_at=case when success then claimed_at else clock_timestamp()-interval '1 minute' end
    where id=did and lease=token and delivered_at is null;
  return found;
end $$;
revoke all on function public.claim_periodic_email(uuid,uuid,uuid,text),public.finish_periodic_email(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_periodic_email(uuid,uuid,uuid,text),public.finish_periodic_email(uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
