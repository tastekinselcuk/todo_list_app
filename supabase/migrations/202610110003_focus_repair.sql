-- Apply after 202610110002_pomonotes.sql. Replaces focus RPCs with the current implementation.
begin;
alter table public.focus_ownership add column if not exists segment_started_at timestamptz;
create index if not exists focus_terminal_recent_idx on analytics_focus_sessions(user_id,updated_at desc) where status in ('ended','completed');
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

-- Explicit stop of this user's exact session; never implicitly claims or starts a timer.
-- The old writer remains fenced after the ownership row has been released.
create or replace function public.end_focus_session(session_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); active analytics_focus_sessions; holder focus_ownership;
  parts jsonb; elapsed double precision; last_end timestamptz; finish timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  select * into active from analytics_focus_sessions s where s.id=end_focus_session.session_id and s.user_id=uid for update;
  if not found then raise exception 'FOCUS_SESSION_FORBIDDEN'; end if;
  select * into holder from focus_ownership o where o.user_id=uid and o.session_id=active.id for update;
  if active.status in ('running','paused') then
    parts:=active.segments;
    select coalesce(sum(extract(epoch from (p->>1)::timestamptz-(p->>0)::timestamptz)),0) into elapsed from jsonb_array_elements(parts) p;
    -- Only a live server-owned segment can be extended; paused/offline gaps are not focus.
    if active.status='running' and holder.session_id is not null then
      last_end:=greatest(coalesce((parts->-1->>1)::timestamptz,active.started_at),coalesce(holder.segment_started_at,active.started_at));
      finish:=least(clock_timestamp(),holder.expires_at,last_end+(greatest(active.planned_seconds-elapsed,0)||' seconds')::interval);
      if finish>last_end then
        parts:=parts||jsonb_build_array(jsonb_build_array(last_end,finish));
        elapsed:=elapsed+extract(epoch from finish-last_end);
      end if;
    end if;
    perform record_focus_session(to_jsonb(active)||jsonb_build_object('segments',parts,'revision',active.revision+1,
      'status',case when elapsed>=active.planned_seconds then 'completed' else 'ended' end,
      'client_id',active.writer_client,'lease',active.writer_lease));
  end if;
  update analytics_focus_sessions set writer_client=coalesce(writer_client,gen_random_uuid()),writer_lease=gen_random_uuid() where id=active.id;
  delete from focus_ownership o where o.user_id=uid and o.session_id=active.id;
  return jsonb_build_object('status','stopped','session_id',active.id);
end $$;
revoke all on function public.end_focus_session(uuid),public.focus_context(uuid),public.claim_focus_session(uuid,jsonb,boolean) from public,anon;
grant execute on function public.end_focus_session(uuid),public.focus_context(uuid),public.claim_focus_session(uuid,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
commit;

