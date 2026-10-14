-- Apply after analytics.sql, sharing permissions/vault and 202610110001_reminder_delivery.sql.
begin;
alter table module_collections drop constraint if exists module_collections_module_check;
alter table module_collections add constraint module_collections_module_check check(module in
  ('plans','detailed','quick','secure','code','pomodoro','learning','flashcards','workout','periodic','activities'));
create or replace function public.ensure_module_bindings(wid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare m text; cid uuid; uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  perform pg_advisory_xact_lock(hashtext(wid::text));
  foreach m in array array['quick','code','detailed','activities','plans','learning','flashcards','workout','periodic','secure','pomodoro'] loop
    if not exists(select 1 from workspace_module_bindings where workspace_id=wid and module=m) then
      insert into module_collections(module,owner_id,origin_workspace_id) values(m,uid,wid) returning id into cid;
      insert into collection_members(collection_id,user_id,role) values(cid,uid,'owner');
      insert into workspace_module_bindings values(wid,m,cid,cid);
    end if;
  end loop;
end; $$;
do $$ declare w record; cid uuid; begin
  for w in select * from workspaces loop
    if not exists(select 1 from workspace_module_bindings where workspace_id=w.id and module='pomodoro') then
      insert into module_collections(module,owner_id,origin_workspace_id) values('pomodoro',w.user_id,w.id) returning id into cid;
      insert into collection_members(collection_id,user_id,role) values(cid,w.user_id,'owner');
      insert into workspace_module_bindings values(w.id,'pomodoro',cid,cid);
    end if;
  end loop;
end $$;
create table if not exists pomo_tasks (
  id uuid primary key default gen_random_uuid(), collection_id uuid not null references module_collections(id) on delete cascade,
  workspace_id uuid not null references workspaces(id), created_by uuid not null references auth.users(id),
  title text not null check(length(trim(title)) between 1 and 500), completed boolean not null default false,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  version integer not null default 1
);
create index if not exists pomo_tasks_page_idx on pomo_tasks(collection_id,completed,created_at desc,id desc);
alter table pomo_tasks enable row level security;
drop policy if exists read_pomo_tasks on pomo_tasks;
create policy read_pomo_tasks on pomo_tasks for select to authenticated using(collection_access(collection_id));
revoke all on pomo_tasks from public,anon,authenticated;
grant select on pomo_tasks to authenticated;
drop trigger if exists guard_collection_record on pomo_tasks;
create trigger guard_collection_record before insert or update on pomo_tasks for each row execute function guard_collection_record('pomodoro','created_by');
drop trigger if exists collection_record_changed on pomo_tasks;
create trigger collection_record_changed after insert or update or delete on pomo_tasks for each row execute function collection_record_changed();

create table if not exists pomo_task_member_preferences (
  task_id uuid not null references pomo_tasks(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  estimated_sessions integer not null check(estimated_sessions between 1 and 999),
  focus_seconds integer not null check(focus_seconds between 60 and 5400),
  first_estimate_seconds integer, primary key(task_id,user_id)
);
alter table pomo_task_member_preferences enable row level security;
revoke all on pomo_task_member_preferences from public,anon,authenticated;

alter table analytics_focus_sessions add column if not exists association text not null default 'free' check(association in ('free','task'));
alter table analytics_focus_sessions add column if not exists task_id uuid references pomo_tasks(id) on delete set null;
alter table analytics_focus_sessions add column if not exists collection_id uuid references module_collections(id) on delete set null;
alter table analytics_focus_sessions add column if not exists estimated_sessions integer;
alter table analytics_focus_sessions add column if not exists goal_seconds integer;
alter table analytics_focus_sessions add column if not exists credited_segments jsonb;
alter table analytics_focus_sessions add column if not exists credited_completed boolean not null default false;
alter table analytics_focus_sessions add column if not exists writer_client uuid;
alter table analytics_focus_sessions add column if not exists writer_lease uuid;
create index if not exists focus_task_owner_idx on analytics_focus_sessions(user_id,task_id,started_at desc);
create index if not exists focus_terminal_recent_idx on analytics_focus_sessions(user_id,updated_at desc) where status in ('ended','completed');
update analytics_focus_sessions set credited_segments=segments,credited_completed=(status='completed') where credited_segments is null;
create table if not exists focus_ownership (
  user_id uuid primary key references auth.users(id) on delete cascade, session_id uuid not null references analytics_focus_sessions(id) on delete cascade,
  client_id uuid not null, lease uuid not null default gen_random_uuid(), expires_at timestamptz not null default clock_timestamp()+interval '45 seconds'
);
alter table focus_ownership enable row level security;
alter table focus_ownership add column if not exists segment_started_at timestamptz;
revoke all on focus_ownership from public,anon,authenticated;
create or replace function public.record_focus_session_v1(payload jsonb) returns boolean
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
revoke all on function public.record_focus_session_v1(jsonb) from public,anon,authenticated;

-- Intervals accepted first claim their time. Conflicting offline clients keep raw records,
-- but cannot allocate the same minute or full-cycle credit to another task.
create or replace function public.record_focus_session(payload jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); sid uuid:=(payload->>'id')::uuid; tid uuid:=(payload->>'task_id')::uuid;
  prior analytics_focus_sessions; holder focus_ownership; task pomo_tasks;
  own_ranges tstzmultirange; occupied tstzmultirange; accepted tstzmultirange; seconds double precision; result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  select * into holder from focus_ownership where user_id=uid for update;
  select * into prior from analytics_focus_sessions where id=sid;
  if prior.id is not null and prior.user_id<>uid then raise exception 'FOCUS_SESSION_FORBIDDEN'; end if;
  if prior.writer_lease is not null and (prior.writer_client::text is distinct from payload->>'client_id' or prior.writer_lease::text is distinct from payload->>'lease') then
    return true; -- Old owner retries cannot overwrite a transferred session.
  end if;
  if prior.id is null and payload->>'association'='task' and tid is not null then
    select * into task from pomo_tasks where id=tid and collection_access(collection_id);
    if not found then tid:=null; end if; -- Retain private elapsed time without exposing revoked task data.
    if tid is not null and not exists(select 1 from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
      where b.collection_id=task.collection_id and b.workspace_id=(payload->>'workspace_id')::uuid and b.module='pomodoro' and w.user_id=uid) then raise exception 'WORKSPACE_FORBIDDEN'; end if;
  end if;
  if prior.id is not null and prior.association='task' and prior.task_id is not null
    and tid is distinct from prior.task_id then raise exception 'FOCUS_TARGET_IMMUTABLE'; end if;
  if prior.id is not null and (prior.revision>=(payload->>'revision')::bigint or prior.status in ('completed','ended')) then return true; end if;
  perform public.record_focus_session_v1(payload);
  if prior.id is null then
    update analytics_focus_sessions set association=case when payload->>'association'='task' then 'task' else 'free' end,
      task_id=tid,collection_id=task.collection_id,estimated_sessions=greatest(1,least(coalesce((payload->>'estimated_sessions')::integer,1),999)),
      goal_seconds=coalesce((payload->>'goal_seconds')::integer,(payload->>'planned_seconds')::integer) where id=sid;
    if tid is not null then
      insert into pomo_task_member_preferences(task_id,user_id,estimated_sessions,focus_seconds,first_estimate_seconds)
        values(tid,uid,greatest(1,least(coalesce((payload->>'estimated_sessions')::integer,1),999)),
          (payload->>'planned_seconds')::integer,
          greatest(1,least(coalesce((payload->>'estimated_sessions')::integer,1),999))*(payload->>'planned_seconds')::integer)
        on conflict(task_id,user_id) do update set first_estimate_seconds=coalesce(pomo_task_member_preferences.first_estimate_seconds,excluded.first_estimate_seconds);
    end if;
  end if;
  select range_agg(tstzrange((p->>0)::timestamptz,(p->>1)::timestamptz,'[)')) into own_ranges
    from jsonb_array_elements(payload->'segments') p where (p->>1)::timestamptz>(p->>0)::timestamptz;
  select range_agg(tstzrange((p->>0)::timestamptz,(p->>1)::timestamptz,'[)')) into occupied
    from analytics_focus_sessions s cross join lateral jsonb_array_elements(coalesce(s.credited_segments,'[]')) p
    where s.user_id=uid and s.id<>sid and (p->>1)::timestamptz>(p->>0)::timestamptz
      and (p->>1)::timestamptz>(payload->>'started_at')::timestamptz;
  accepted:=coalesce(own_ranges,'{}'::tstzmultirange)-coalesce(occupied,'{}'::tstzmultirange);
  select coalesce(jsonb_agg(jsonb_build_array(lower(span),upper(span)) order by lower(span)),'[]'),
    coalesce(sum(extract(epoch from upper(span)-lower(span))),0) into result,seconds from unnest(accepted) span;
  update analytics_focus_sessions set credited_segments=result,
    credited_completed=(status='completed' and seconds>=planned_seconds-1) where id=sid;
  if holder.session_id=sid then
    update focus_ownership set expires_at=clock_timestamp()+interval '45 seconds' where user_id=uid;
  end if;
  return true;
end $$;
revoke all on function public.record_focus_session(jsonb) from public,anon;
grant execute on function public.record_focus_session(jsonb) to authenticated;

create or replace function public.focus_context(client_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare active jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select (to_jsonb(s)-'writer_client'-'writer_lease')||jsonb_build_object('client_id',o.client_id,'lease',case when o.client_id=focus_context.client_id then o.lease else null end,
    'task_title',case when collection_access(t.collection_id) then t.title else null end,
    'task_completed',case when collection_access(t.collection_id) then t.completed else true end,'expires_at',o.expires_at,'segment_started_at',o.segment_started_at)
    into active from focus_ownership o join analytics_focus_sessions s on s.id=o.session_id
      left join pomo_tasks t on t.id=s.task_id where o.user_id=auth.uid() and s.status in ('running','paused');
  return jsonb_build_object('version',1,'active',active,'closed',coalesce((select jsonb_agg(id) from (select id from analytics_focus_sessions where user_id=auth.uid() and status in ('ended','completed') order by updated_at desc limit 20) recent),'[]'::jsonb));
end $$;

create or replace function public.claim_focus_session(client_id uuid, payload jsonb, takeover boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); holder focus_ownership; active analytics_focus_sessions; token uuid; context jsonb;
  parts jsonb; last_end timestamptz; elapsed double precision; finish timestamptz; proposal jsonb;
begin
  if uid is null or client_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  select * into holder from focus_ownership where user_id=uid for update;
  select * into active from analytics_focus_sessions where id=holder.session_id;
  if active.id is not null and active.status in ('running','paused') and holder.client_id<>claim_focus_session.client_id then
    if not takeover then return jsonb_build_object('status','busy','active',focus_context(claim_focus_session.client_id)->'active'); end if;
    -- Close the previous owner's running segment at handoff, never past its live lease.
    if active.status='running' then
      parts:=active.segments;
      select coalesce(sum(extract(epoch from (p->>1)::timestamptz-(p->>0)::timestamptz)),0) into elapsed from jsonb_array_elements(parts) p;
      last_end:=greatest(coalesce((parts->-1->>1)::timestamptz,active.started_at),coalesce(holder.segment_started_at,active.started_at));
      finish:=least(clock_timestamp(),holder.expires_at,last_end+(greatest(active.planned_seconds-elapsed,0)||' seconds')::interval);
      if finish>last_end then parts:=parts||jsonb_build_array(jsonb_build_array(last_end,finish)); end if;
      proposal:=to_jsonb(active)||jsonb_build_object('segments',parts,'revision',active.revision+1,
        'status',case when elapsed+extract(epoch from greatest(finish,last_end)-last_end)>=active.planned_seconds-1 then 'completed' else 'paused' end,
        'client_id',holder.client_id,'lease',holder.lease);
      perform record_focus_session(proposal);
      select * into active from analytics_focus_sessions where id=active.id;
    end if;
    token:=gen_random_uuid();
    update focus_ownership set client_id=claim_focus_session.client_id,lease=token,segment_started_at=null,expires_at=clock_timestamp()+interval '45 seconds' where user_id=uid;
    update analytics_focus_sessions set writer_client=claim_focus_session.client_id,writer_lease=token where id=holder.session_id;
    context:=focus_context(claim_focus_session.client_id)->'active';
    if context is null or context='null'::jsonb then return jsonb_build_object('status','finished'); end if;
    return jsonb_build_object('status','claimed','active',context);
  end if;
  if payload is null then return jsonb_build_object('status','idle'); end if;
  if payload->>'association'='task' and not exists(select 1 from analytics_focus_sessions s where s.id=(payload->>'id')::uuid and s.user_id=uid) and not exists(select 1 from pomo_tasks t
    join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='pomodoro'
    join workspaces w on w.id=b.workspace_id where t.id=(payload->>'task_id')::uuid and not t.completed
      and collection_access(t.collection_id) and w.id=(payload->>'workspace_id')::uuid and w.user_id=uid and w.archived_at is null) then raise exception 'FOCUS_TARGET_UNAVAILABLE'; end if;
  -- Persist before assigning the lease. Existing sessions retain their frozen target.
  token:=gen_random_uuid();
  if holder.session_id=(payload->>'id')::uuid then
    payload:=payload||jsonb_build_object('client_id',holder.client_id,'lease',holder.lease);
  end if;
  perform record_focus_session(payload);
  if exists(select 1 from analytics_focus_sessions where id=(payload->>'id')::uuid and status in ('completed','ended')) then
    return jsonb_build_object('status','finished');
  end if;
  insert into focus_ownership(user_id,session_id,client_id,lease,segment_started_at) values(uid,(payload->>'id')::uuid,claim_focus_session.client_id,token,clock_timestamp())
    on conflict(user_id) do update set session_id=excluded.session_id,client_id=excluded.client_id,lease=excluded.lease,segment_started_at=excluded.segment_started_at,expires_at=clock_timestamp()+interval '45 seconds';
  update analytics_focus_sessions set writer_client=claim_focus_session.client_id,writer_lease=token where id=(payload->>'id')::uuid;
  if payload->>'association'='task' then
    update pomo_task_member_preferences set first_estimate_seconds=coalesce(first_estimate_seconds,estimated_sessions*focus_seconds)
      where task_id=(payload->>'task_id')::uuid and user_id=uid;
  end if;
  return jsonb_build_object('status','claimed','active',focus_context(claim_focus_session.client_id)->'active');
end $$;

create or replace function public.pomonotes_mutate(wid uuid, operation text, tid uuid default null, title text default null,
  estimate integer default 1, focus_seconds integer default 1500, expected_version integer default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid; task pomo_tasks; uid uuid:=auth.uid();
begin
  perform ensure_module_bindings(wid);
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='pomodoro';
  if not collection_access(cid) then raise exception 'ACCESS_DENIED'; end if;
  if operation not in ('create','edit','goal','complete','reopen','delete') then raise exception 'INVALID_OPERATION'; end if;
  if operation<>'goal' and not collection_write(cid) then raise exception 'READ_ONLY'; end if;
  if operation in ('create','edit','goal') and (estimate not between 1 and 999 or focus_seconds not between 60 and 5400
    or estimate is null or focus_seconds is null) then raise exception 'INVALID_GOAL'; end if;
  if operation in ('create','edit') and (title is null or length(trim(title)) not between 1 and 500) then raise exception 'INVALID_TITLE'; end if;
  if operation='create' then
    insert into pomo_tasks(collection_id,workspace_id,created_by,title) values(cid,wid,uid,trim(title)) returning * into task;
  else
    select * into task from pomo_tasks where id=tid and collection_id=cid for update;
    if not found then raise exception 'TASK_UNAVAILABLE'; end if;
    if operation<>'goal' and (expected_version is null or task.version<>expected_version) then raise exception 'SHARING_CONFLICT'; end if;
    if operation='delete' then delete from pomo_tasks where id=tid;return jsonb_build_object('ok',true); end if;
    if operation<>'goal' then
      update pomo_tasks set title=case when operation='edit' then trim(pomonotes_mutate.title) else pomo_tasks.title end,
        completed=case when operation='complete' then true when operation='reopen' then false else completed end,
        updated_at=clock_timestamp() where id=tid returning * into task;
    end if;
  end if;
  if operation in ('create','edit','goal') then
    insert into pomo_task_member_preferences(task_id,user_id,estimated_sessions,focus_seconds) values(task.id,uid,estimate,pomonotes_mutate.focus_seconds)
      on conflict(task_id,user_id) do update set estimated_sessions=excluded.estimated_sessions,focus_seconds=excluded.focus_seconds;
  end if;
  return to_jsonb(task);
end $$;

create or replace function public.pomonotes_page(wid uuid, status_filter text default 'active', search_text text default '',
  after_item jsonb default null, page_size integer default 30) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid; result jsonb;
begin
  perform ensure_module_bindings(wid);
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='pomodoro';
  if not collection_access(cid) then raise exception 'ACCESS_DENIED'; end if;
  if status_filter not in ('active','completed','all') or page_size not between 1 and 50 or length(search_text)>100 then raise exception 'INVALID_QUERY'; end if;
  with filtered as (
    select * from pomo_tasks where collection_id=cid and (status_filter='all' or completed=(status_filter='completed'))
      and title ilike '%'||replace(replace(replace(search_text,'\','\\'),'%','\%'),'_','\_')||'%'
  ), page as (
    select * from filtered where after_item is null or (created_at,id)<((after_item->>'created_at')::timestamptz,(after_item->>'id')::uuid)
    order by created_at desc,id desc limit page_size+1
  ), shown as (select * from page order by created_at desc,id desc limit page_size),
  progress as (
    select s.task_id,count(*) filter(where s.credited_completed) as sessions,
      coalesce(sum((select coalesce(sum(extract(epoch from (p->>1)::timestamptz-(p->>0)::timestamptz)),0)
        from jsonb_array_elements(coalesce(s.credited_segments,'[]')) p)),0) as seconds
    from analytics_focus_sessions s where s.user_id=auth.uid() and s.task_id in (select id from shown) group by s.task_id
  ), items as (
    select t.*,p.estimated_sessions,p.focus_seconds,p.first_estimate_seconds,coalesce(g.sessions,0) as sessions,coalesce(g.seconds,0) as seconds
    from shown t left join pomo_task_member_preferences p on p.task_id=t.id and p.user_id=auth.uid()
      left join progress g on g.task_id=t.id
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by created_at desc,id desc) from items i),'[]'),
    'total',(select count(*) from filtered),'has_more',(select count(*)>page_size from page),
    'cursor',(select jsonb_build_object('created_at',created_at,'id',id) from shown order by created_at,id limit 1)) into result;
  return result;
end $$;
create or replace function public.pomonotes_history(wid uuid, tid uuid, before_time timestamptz default null, before_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
  perform ensure_module_bindings(wid);
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='pomodoro';
  if not exists(select 1 from pomo_tasks where id=tid and collection_id=cid and collection_access(cid)) then raise exception 'ACCESS_DENIED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by started_at desc,id desc) from (
    select id,started_at,planned_seconds,status,credited_completed,credited_segments from analytics_focus_sessions
      where user_id=auth.uid() and task_id=tid and (before_time is null or (started_at,id)<(before_time,before_id))
      order by started_at desc,id desc limit 30) s),'[]');
end $$;

create or replace function public.create_collection_invite(wid uuid, module_id text, invite_role text default 'viewer') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; token text; iid uuid;
begin
  if invite_role is null or invite_role not in ('viewer','editor') then raise exception 'INVALID_ROLE'; end if;
  perform public.ensure_module_bindings(wid);
  if to_regclass('public.' || case module_id when 'quick' then 'quick_notes' when 'code' then 'code_snippets'
    when 'detailed' then 'todos' when 'activities' then 'activity_items' when 'plans' then 'plans'
    when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks' when 'workout' then 'workout_routines'
    when 'pomodoro' then 'pomo_tasks' when 'periodic' then 'periodic_tasks' when 'secure' then 'secure_notes' else '__unsupported' end) is null then
    raise exception 'MODULE_NOT_SHAREABLE';
  end if;
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module=module_id;
  if cid is null then raise exception 'MODULE_NOT_SHAREABLE'; end if;
  perform 1 from module_collections where id=cid for update;
  if not public.collection_owner(cid) then raise exception 'OWNER_REQUIRED'; end if;
  if module_id='secure' then
    if to_regprocedure('public.vault_collection_ready(uuid)') is null then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
    if not public.vault_collection_ready(cid) then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
  end if;
  -- Two cryptographically random UUIDs provide >240 random bits. Only the SHA-256 digest is retained.
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  insert into collection_invites(collection_id,token_hash,created_by,invite_role)
    values(cid,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid(),invite_role) returning id into iid;
  update module_collections set shared=true where id=cid;
  return jsonb_build_object('id',iid,'token',token,'expires_at',now()+interval '7 days','invite_role',invite_role);
end;
$$;
alter table analytics_events drop constraint if exists analytics_events_module_check;
alter table analytics_events add constraint analytics_events_module_check check(module in ('quick','detailed','plans','pomodoro'));
drop trigger if exists analytics_capture on pomo_tasks;
create trigger analytics_capture after insert or update or delete on pomo_tasks for each row execute function capture_analytics_event('pomodoro');
create or replace function public.analytics_report_v2(wid uuid, date_from date, date_to date, report_timezone text, personal boolean, include_items boolean)
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
        and b.module in ('quick','detailed','plans','pomodoro')
      group by b.collection_id,b.module
  ), events as (
    select e.* from public.analytics_events e join bindings b using(collection_id,module)
      where include_items or (e.occurred_at>=date_from::timestamp at time zone report_timezone and e.occurred_at<(date_to+1)::timestamp at time zone report_timezone)
  ), movements as (
    select *,row_number() over(partition by collection_id,record_id,kind order by occurred_at,id) as sequence
    from events where kind<>'baseline' and occurred_at>=date_from::timestamp at time zone report_timezone
      and occurred_at<(date_to+1)::timestamp at time zone report_timezone
      and (not personal or actor_id=uid)
  ), days as (
    select generate_series(date_from::timestamp,date_to::timestamp,interval '1 day')::date as day
  ), ranges as (
    select tstzrange((p->>0)::timestamptz,(p->>1)::timestamptz,'[)') as span,
      case when s.association='free' then 'free' when s.task_id is not null and collection_access(s.collection_id) then 'task' else 'unavailable' end as category
      from public.analytics_focus_sessions s cross join lateral jsonb_array_elements(coalesce(s.credited_segments,s.segments)) p
      where s.user_id=uid and (wid is null or s.workspace_id=wid) and (p->>1)::timestamptz>(p->>0)::timestamptz
        and (p->>1)::timestamptz>=date_from::timestamp at time zone report_timezone
        and (p->>0)::timestamptz<(date_to+1)::timestamp at time zone report_timezone
  ), allocations as (
    select category,unnest(range_agg(span)) * tstzrange(date_from::timestamp at time zone report_timezone,(date_to+1)::timestamp at time zone report_timezone,'[)') as span
      from ranges group by category
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
      case when not include_items or d.day<(recording at time zone report_timezone)::date then null else (
        select count(*) from (select distinct on(collection_id,record_id) kind,completed from events
          where occurred_at<(d.day+1)::timestamp at time zone report_timezone order by collection_id,record_id,occurred_at desc,id desc) stock
        where kind<>'deleted' and not completed
      ) end as pending
    from days d join focus_daily f using(day)
  ), latest as (
    select distinct on(collection_id,record_id) * from events where include_items order by collection_id,record_id,occurred_at desc,id desc
  ), live_items as (
    select collection_id,id,left(regexp_replace(content,'<[^>]*>','','g'),160) as title from public.quick_notes where include_items
    union all select collection_id,id,left(title,160) from public.todos where include_items
    union all select collection_id,id,left(title,160) from public.plans where include_items
    union all select collection_id,id,left(title,160) from public.pomo_tasks where include_items
  ), items as (
    select l.module,l.record_id,l.item_created_at,l.completed,l.period,l.carry_count,i.title,b.workspace_id
      from latest l join live_items i on i.collection_id=l.collection_id and i.id=l.record_id
      join bindings b on b.collection_id=l.collection_id and b.module=l.module where l.kind<>'deleted'
  ) select jsonb_build_object(
    'recording_started_at',recording,'timezone',report_timezone,'date_from',date_from,'date_to',date_to,
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day) from daily d),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by item_created_at) from items i),'[]'::jsonb),
    'focus_breakdown',coalesce((select jsonb_object_agg(category,seconds) from (
      select category,sum(extract(epoch from upper(span)-lower(span))) as seconds from allocations group by category
    ) a),'{}'::jsonb),
    'completed_sessions',(select count(*) from public.analytics_focus_sessions s where s.user_id=uid
      and (wid is null or s.workspace_id=wid) and s.status='completed' and s.credited_completed
      and (coalesce(s.credited_segments,s.segments)->-1->>1)::timestamptz>=date_from::timestamp at time zone report_timezone
      and (coalesce(s.credited_segments,s.segments)->-1->>1)::timestamptz<(date_to+1)::timestamp at time zone report_timezone)
  ) into result;
  return result;
end $$;
revoke all on function public.analytics_report_v2(uuid,date,date,text,boolean,boolean) from public,anon,authenticated;
create or replace function public.analytics_report(wid uuid,date_from date,date_to date,report_timezone text,personal boolean default true)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select analytics_report_v2(wid,date_from,date_to,report_timezone,personal,true);
$$;
create or replace function public.analytics_summary(wid uuid,date_from date,date_to date,report_timezone text,personal boolean default true)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select analytics_report_v2(wid,date_from,date_to,report_timezone,personal,false)-'items';
$$;
revoke all on function public.analytics_report(uuid,date,date,text,boolean),public.analytics_summary(uuid,date,date,text,boolean) from public,anon;
grant execute on function public.analytics_report(uuid,date,date,text,boolean),public.analytics_summary(uuid,date,date,text,boolean) to authenticated;
revoke all on function public.focus_context(uuid),public.claim_focus_session(uuid,jsonb,boolean),
  public.pomonotes_mutate(uuid,text,uuid,text,integer,integer,integer),public.pomonotes_page(uuid,text,text,jsonb,integer),
  public.pomonotes_history(uuid,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.focus_context(uuid),public.claim_focus_session(uuid,jsonb,boolean),
  public.pomonotes_mutate(uuid,text,uuid,text,integer,integer,integer),public.pomonotes_page(uuid,text,text,jsonb,integer),
  public.pomonotes_history(uuid,uuid,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
