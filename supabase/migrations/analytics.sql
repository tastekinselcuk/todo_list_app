-- Apply after workspaces.sql and the tab_sharing migrations. Safe to rerun.
begin;

create table if not exists public.analytics_config (
  id boolean primary key default true check (id),
  recording_started_at timestamptz not null default now()
);
insert into public.analytics_config(id) values(true) on conflict do nothing;
revoke all on public.analytics_config from public, anon, authenticated;

-- No note bodies are retained in the event log. Deleting a note deletes its body,
-- while anonymous statistical facts remain until its collection/account is removed.
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  collection_id uuid not null references public.module_collections(id) on delete cascade,
  record_id uuid not null,
  module text not null check(module in ('quick','detailed','plans')),
  kind text not null check(kind in ('baseline','created','completed','reopened','deleted','deferred','rollover')),
  actor_id uuid references auth.users(id) on delete set null,
  completed boolean not null,
  item_created_at timestamptz not null,
  period text,
  carry_count integer not null default 0,
  occurred_at timestamptz not null default clock_timestamp()
);
create unique index if not exists analytics_baseline_once on public.analytics_events(collection_id,record_id) where kind='baseline';
create index if not exists analytics_events_scope_time on public.analytics_events(collection_id,occurred_at,id);
create index if not exists analytics_events_item on public.analytics_events(collection_id,record_id,id desc);
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
-- Reads use the report RPC so row-level facts cannot bypass report scoping.

create table if not exists public.analytics_focus_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  started_at timestamptz not null,
  planned_seconds integer not null check(planned_seconds between 60 and 5400),
  revision bigint not null check(revision > 0),
  status text not null check(status in ('running','paused','completed','ended')),
  segments jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create index if not exists analytics_focus_owner_time on public.analytics_focus_sessions(user_id,started_at);
alter table public.analytics_focus_sessions enable row level security;
revoke all on public.analytics_focus_sessions from public, anon, authenticated;

create or replace function public.capture_analytics_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  n jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  event_kind text;
  done boolean := coalesce((n->>'completed')::boolean,false);
  actor uuid := auth.uid();
begin
  if tg_op='INSERT' then event_kind := 'created';
  elsif tg_op='DELETE' then event_kind := 'deleted';
  elsif done is distinct from coalesce((o->>'completed')::boolean,false) then
    event_kind := case when done then 'completed' else 'reopened' end;
  elsif tg_argv[0]='plans' and n->>'period_date' is distinct from o->>'period_date'
    and jsonb_array_length(coalesce(n->'history','[]')) > jsonb_array_length(coalesce(o->'history','[]')) then
    event_kind := 'rollover'; actor := null;
  elsif tg_argv[0]='plans' and n->>'reason' is distinct from o->>'reason' and coalesce(n->>'reason','')<>'' then
    event_kind := 'deferred';
  else return null;
  end if;
  insert into public.analytics_events(collection_id,record_id,module,kind,actor_id,completed,item_created_at,period,carry_count)
    values((n->>'collection_id')::uuid,(n->>'id')::uuid,tg_argv[0],event_kind,actor,done,
      (n->>'created_at')::timestamptz,n->>'period',jsonb_array_length(coalesce(n->'history','[]')));
  return null;
end $$;
revoke all on function public.capture_analytics_event() from public, anon, authenticated;

do $$
declare tbl text; mod text;
begin
  foreach tbl in array array['quick_notes','todos','plans'] loop
    if to_regclass('public.'||tbl) is null then raise exception 'Install module table % before analytics.sql',tbl; end if;
    mod := case tbl when 'quick_notes' then 'quick' when 'todos' then 'detailed' else 'plans' end;
    execute format('insert into public.analytics_events(collection_id,record_id,module,kind,completed,item_created_at,period,carry_count)
      select (r->>''collection_id'')::uuid,(r->>''id'')::uuid,%L,''baseline'',coalesce((r->>''completed'')::boolean,false),
        (r->>''created_at'')::timestamptz,r->>''period'',jsonb_array_length(coalesce(r->''history'',''[]''))
      from (select to_jsonb(t) r from public.%I t) src
      where not exists(select 1 from public.analytics_events e where e.collection_id=(r->>''collection_id'')::uuid and e.record_id=(r->>''id'')::uuid)
      on conflict do nothing',mod,tbl);
    execute format('drop trigger if exists analytics_capture on public.%I',tbl);
    execute format('create trigger analytics_capture after insert or update or delete on public.%I
      for each row execute function public.capture_analytics_event(%L)',tbl,mod);
  end loop;
end $$;

-- Revisioned snapshots are idempotent. Older retries cannot reopen finished sessions.
create or replace function public.record_focus_session(payload jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid(); sid uuid := (payload->>'id')::uuid;
  wid uuid := (payload->>'workspace_id')::uuid;
  started timestamptz := (payload->>'started_at')::timestamptz;
  planned integer := (payload->>'planned_seconds')::integer;
  rev bigint := (payload->>'revision')::bigint;
  state text := payload->>'status';
  parts jsonb := payload->'segments'; part jsonb;
  a timestamptz; b timestamptz; last_end timestamptz; duration double precision := 0;
  existing public.analytics_focus_sessions%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if sid is null or wid is null or started is null or started>clock_timestamp()+interval '5 seconds'
    or planned is null or planned not between 60 and 5400 or rev is null or rev<1
    or state is null or state not in ('running','paused','completed','ended')
    or parts is null or jsonb_typeof(parts)<>'array' then raise exception 'INVALID_FOCUS_SESSION'; end if;
  if jsonb_array_length(parts)>1000 then raise exception 'INVALID_FOCUS_SESSION'; end if;
  if not exists(select 1 from public.workspaces where id=wid and user_id=uid) then raise exception 'WORKSPACE_FORBIDDEN'; end if;
  for part in select value from jsonb_array_elements(parts) loop
    a := (part->>0)::timestamptz; b := (part->>1)::timestamptz;
    if a is null or b is null or a<started or b<a or b>clock_timestamp()+interval '5 seconds'
      or (last_end is not null and a<last_end) then raise exception 'INVALID_FOCUS_SESSION'; end if;
    duration := duration+extract(epoch from b-a); last_end := b;
  end loop;
  if duration>planned+1 or (state='completed' and duration<planned-1) then raise exception 'INVALID_FOCUS_SESSION'; end if;
  -- Serialize identical IDs even on their first insert.
  perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
  select * into existing from public.analytics_focus_sessions where id=sid for update;
  if found then
    if existing.user_id<>uid or existing.workspace_id<>wid or existing.started_at<>started or existing.planned_seconds<>planned then
      raise exception 'FOCUS_SESSION_FORBIDDEN';
    end if;
    if existing.revision>=rev then return true; end if;
    if existing.status in ('completed','ended') then return true; end if;
  end if;
  insert into public.analytics_focus_sessions(id,user_id,workspace_id,started_at,planned_seconds,revision,status,segments)
    values(sid,uid,wid,started,planned,rev,state,parts)
    on conflict(id) do update set revision=excluded.revision,status=excluded.status,segments=excluded.segments,updated_at=now();
  return true;
end $$;
revoke all on function public.record_focus_session(jsonb) from public, anon;
grant execute on function public.record_focus_session(jsonb) to authenticated;

create or replace function public.analytics_report(wid uuid, date_from date, date_to date, report_timezone text, personal boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; uid uuid := auth.uid(); recording timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if date_from is null or date_to is null or date_to<date_from or date_to-date_from>365 then raise exception 'INVALID_DATE_RANGE'; end if;
  if not exists(select 1 from pg_timezone_names where name=report_timezone) then raise exception 'INVALID_TIMEZONE'; end if;
  if date_to>(clock_timestamp() at time zone report_timezone)::date then raise exception 'INVALID_DATE_RANGE'; end if;
  if wid is not null and not exists(select 1 from public.workspaces where id=wid and user_id=uid) then raise exception 'WORKSPACE_FORBIDDEN'; end if;
  select recording_started_at into recording from public.analytics_config where id;
  with bindings as (
    select b.collection_id,b.module,(array_agg(w.id order by (w.archived_at is not null),w.created_at,w.id))[1] as workspace_id from public.workspace_module_bindings b
      join public.workspaces w on w.id=b.workspace_id
      where w.user_id=uid and (wid is null or w.id=wid) and public.collection_access(b.collection_id)
        and b.module in ('quick','detailed','plans')
      group by b.collection_id,b.module
  ), events as (
    select e.* from public.analytics_events e join bindings b using(collection_id,module)
  ), movements as (
    select *,row_number() over(partition by collection_id,record_id,kind order by occurred_at,id) as sequence
    from events where kind<>'baseline' and occurred_at>=date_from::timestamp at time zone report_timezone
      and occurred_at<(date_to+1)::timestamp at time zone report_timezone
      and (not personal or actor_id=uid)
  ), days as (
    select generate_series(date_from::timestamp,date_to::timestamp,interval '1 day')::date as day
  ), ranges as (
    select tstzrange((p->>0)::timestamptz,(p->>1)::timestamptz,'[)') as span
      from public.analytics_focus_sessions s cross join lateral jsonb_array_elements(s.segments) p
      where s.user_id=uid and (wid is null or s.workspace_id=wid) and (p->>1)::timestamptz>(p->>0)::timestamptz
  ), merged as (
    select unnest(range_agg(span)) as span from ranges
  ), focus_daily as (
    select d.day,coalesce(sum(extract(epoch from upper(clipped)-lower(clipped))),0) as seconds
    from days d left join lateral (
      select span * tstzrange(d.day::timestamp at time zone report_timezone,(d.day+1)::timestamp at time zone report_timezone,'[)') as clipped
      from merged where span && tstzrange(d.day::timestamp at time zone report_timezone,(d.day+1)::timestamp at time zone report_timezone,'[)')
    ) q on true group by d.day
  ), daily as (
    select d.day,f.seconds,
      (select count(*) from movements m where m.kind='created' and (m.occurred_at at time zone report_timezone)::date=d.day) as created,
      (select count(*) from movements m where m.kind='completed' and m.sequence=1 and (m.occurred_at at time zone report_timezone)::date=d.day) as completed,
      (select count(*) from movements m where m.kind='reopened' and (m.occurred_at at time zone report_timezone)::date=d.day) as reopened,
      (select count(*) from movements m where m.kind='deleted' and (m.occurred_at at time zone report_timezone)::date=d.day) as deleted,
      case when d.day<(recording at time zone report_timezone)::date then null else (
        select count(*) from (select distinct on(collection_id,record_id) kind,completed from events
          where occurred_at<(d.day+1)::timestamp at time zone report_timezone order by collection_id,record_id,occurred_at desc,id desc) stock
        where kind<>'deleted' and not completed
      ) end as pending
    from days d join focus_daily f using(day)
  ), latest as (
    select distinct on(collection_id,record_id) * from events order by collection_id,record_id,occurred_at desc,id desc
  ), live_items as (
    select collection_id,id,left(regexp_replace(content,'<[^>]*>','','g'),160) as title from public.quick_notes
    union all select collection_id,id,left(title,160) from public.todos
    union all select collection_id,id,left(title,160) from public.plans
  ), items as (
    select l.module,l.record_id,l.item_created_at,l.completed,l.period,l.carry_count,i.title,b.workspace_id
      from latest l join live_items i on i.collection_id=l.collection_id and i.id=l.record_id
      join bindings b on b.collection_id=l.collection_id and b.module=l.module where l.kind<>'deleted'
  ) select jsonb_build_object(
    'recording_started_at',recording,'timezone',report_timezone,'date_from',date_from,'date_to',date_to,
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day) from daily d),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by item_created_at) from items i),'[]'::jsonb),
    'completed_sessions',(select count(*) from public.analytics_focus_sessions s where s.user_id=uid
      and (wid is null or s.workspace_id=wid) and s.status='completed'
      and (s.segments->-1->>1)::timestamptz>=date_from::timestamp at time zone report_timezone
      and (s.segments->-1->>1)::timestamptz<(date_to+1)::timestamp at time zone report_timezone)
  ) into result;
  return result;
end $$;
revoke all on function public.analytics_report(uuid,date,date,text,boolean) from public, anon;
grant execute on function public.analytics_report(uuid,date,date,text,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
