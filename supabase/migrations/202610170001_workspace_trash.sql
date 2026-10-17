-- Apply after the sharing, analytics, PomoNotes and workspace-search migrations.
begin;

create or replace function public.trash_table(module_id text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case module_id when 'detailed' then 'todos' when 'quick' then 'quick_notes'
 when 'plans' then 'plans' when 'code' then 'code_snippets' when 'pomodoro' then 'pomo_tasks'
 when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks'
 when 'workout' then 'workout_routines' when 'periodic' then 'periodic_tasks' when 'activities' then 'activity_items' end
$$;
revoke all on function public.trash_table(text) from public,anon,authenticated;

create table if not exists public.trash_image_cleanup (
 path text primary key, queued_at timestamptz not null default clock_timestamp()
);
alter table public.trash_image_cleanup enable row level security;
revoke all on public.trash_image_cleanup from public,anon,authenticated;

create or replace function public.guard_trash_record() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_setting('app.trash_write',true)='on' then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then
  -- Account / collection cascades retain their existing ownership checks.
  if not exists(select 1 from module_collections where id=old.collection_id) then return old; end if;
  raise exception 'USE_TRASH';
 elsif tg_op='INSERT' then
  if new.deleted_at is not null or new.deleted_by is not null then raise exception 'USE_TRASH'; end if;
 elsif old.deleted_at is not null or new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
  raise exception 'USE_TRASH';
 end if;
 return new;
end $$;

revoke all on function public.guard_trash_record() from public,anon,authenticated;

do $$ declare m text;t text;begin
 foreach m in array array['detailed','quick','plans','code','pomodoro','learning','flashcards','workout','periodic','activities'] loop
  t:=public.trash_table(m);
  if to_regclass('public.'||t) is null then raise exception 'Install module % before workspace trash',m;end if;
  execute format('alter table public.%I add column if not exists deleted_at timestamptz, add column if not exists deleted_by uuid references auth.users(id) on delete set null',t);
  execute format('create index if not exists %I on public.%I(collection_id,deleted_at,id) where deleted_at is not null',t||'_trash_idx',t);
  execute format('drop policy if exists active_trash_records on public.%I',t);
  execute format('create policy active_trash_records on public.%I as restrictive for all to authenticated using(deleted_at is null) with check(deleted_at is null and deleted_by is null)',t);
  execute format('drop trigger if exists guard_trash_record on public.%I',t);
  execute format('create trigger guard_trash_record before insert or update or delete on public.%I for each row execute function public.guard_trash_record()',t);
 end loop;
end $$;

create or replace function public.trash_parent_active(module_id text,rid uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t text:=public.trash_table(module_id);allowed boolean;begin
 if t is null or auth.uid() is null then return false;end if;
 execute format('select exists(select 1 from public.%I where id=$1 and deleted_at is null and public.collection_access(collection_id))',t) into allowed using rid;
 return allowed;
end $$;
revoke all on function public.trash_parent_active(text,uuid) from public,anon;
grant execute on function public.trash_parent_active(text,uuid) to authenticated;
do $$ declare t text;m text;begin
 for t,m in select * from (values('learning_subjects_items','learning'),('flashcard_decks_items','flashcards'),('workout_routines_items','workout')) x(t,m) loop
  if to_regclass('public.'||t) is not null then
   execute format('drop policy if exists active_trash_parent on public.%I',t);
   execute format('create policy active_trash_parent on public.%I as restrictive for select to authenticated using(public.trash_parent_active(%L,parent_id))',t,m);
  end if;
 end loop;
end $$;

create or replace function public.trash_purge_record(module_id text,rid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t text:=public.trash_table(module_id);r record;begin
 if t is null then raise exception 'INVALID_TRASH_MODULE';end if;
 if module_id='detailed' then
  for r in select match[1] path,n.collection_id from todos n cross join lateral regexp_matches(coalesce(n.description,''),'data-note-image="([^"]+)"','g') match where n.id=rid loop
   if r.path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png|jpg|jpeg|gif)$' and split_part(r.path,'/',1)=r.collection_id::text then
    insert into trash_image_cleanup(path) values(r.path) on conflict(path) do update set queued_at=clock_timestamp();
   end if;
  end loop;
 end if;
 perform set_config('app.trash_write','on',true);
 execute format('delete from public.%I where id=$1 and deleted_at is not null',t) using rid;
 perform set_config('app.trash_write','off',true);
end $$;
revoke all on function public.trash_purge_record(text,uuid) from public,anon,authenticated;

create or replace function public.trash_change(wid uuid,module_id text,rid uuid,action text,expected_version integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();t text:=public.trash_table(module_id);cid uuid;row_data jsonb;answer jsonb;begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if t is null or action not in ('move','restore','purge') or rid is null or expected_version is null then raise exception 'INVALID_TRASH_INPUT';end if;
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
 where w.id=wid and w.user_id=uid and w.archived_at is null and b.module=module_id;
 perform 1 from module_collections where id=cid for update;
 if cid is null or not public.collection_write(cid) then raise exception 'TRASH_ACCESS_DENIED' using errcode='42501';end if;
 execute format('select to_jsonb(r) from public.%I r where id=$1 and collection_id=$2 for update',t) into row_data using rid,cid;
 if row_data is null then raise exception 'TRASH_UNAVAILABLE';end if;
 if (row_data->>'version')::integer<>expected_version then raise exception 'SHARING_CONFLICT';end if;
 if action='move' then
  if row_data->>'deleted_at' is not null then raise exception 'TRASH_UNAVAILABLE';end if;
  if module_id='pomodoro' and exists(select 1 from analytics_focus_sessions s join focus_ownership f on f.session_id=s.id
    where s.task_id=rid and s.status in ('running','paused') and f.expires_at>clock_timestamp()) then raise exception 'TRASH_FOCUS_ACTIVE';end if;
  perform set_config('app.trash_write','on',true);
  execute format('update public.%I set deleted_at=clock_timestamp(),deleted_by=$1 where id=$2 returning to_jsonb(%I.*)',t,t) into row_data using uid,rid;
 elsif action='restore' then
  if row_data->>'deleted_at' is null or (row_data->>'deleted_at')::timestamptz<=clock_timestamp()-interval '30 days' then raise exception 'TRASH_EXPIRED';end if;
  perform set_config('app.trash_write','on',true);
  execute format('update public.%I set deleted_at=null,deleted_by=null where id=$1 returning to_jsonb(%I.*)',t,t) into row_data using rid;
 else
  if not public.collection_owner(cid) then raise exception 'OWNER_REQUIRED' using errcode='42501';end if;
  if row_data->>'deleted_at' is null then raise exception 'TRASH_UNAVAILABLE';end if;
  perform public.trash_purge_record(module_id,rid);
 end if;
 perform set_config('app.trash_write','off',true);
 -- Never return note bodies, encrypted payloads or credentials in mutation receipts.
 return jsonb_build_object('id',rid,'module',module_id,'collection_id',cid,'version',(row_data->>'version')::integer,'deleted_at',row_data->>'deleted_at');
end $$;
revoke all on function public.trash_change(uuid,text,uuid,text,integer) from public,anon;
grant execute on function public.trash_change(uuid,text,uuid,text,integer) to authenticated;

create or replace function public.trash_page(wid uuid,only_module text default null,query_text text default '',after_time timestamptz default null,after_key text default null,page_size integer default 40)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();m text;t text;parts text[]:='{}';statement text;answer jsonb;begin
 if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'TRASH_ACCESS_DENIED' using errcode='42501';end if;
 if page_size is null or page_size not between 1 and 60 or length(coalesce(query_text,''))>100 or (only_module is not null and public.trash_table(only_module) is null) then raise exception 'INVALID_TRASH_INPUT';end if;
 foreach m in array array['detailed','quick','plans','code','pomodoro','learning','flashcards','workout','periodic','activities'] loop
  if only_module is not null and m<>only_module then continue;end if;
  t:=public.trash_table(m);
  parts:=array_append(parts,format('select r.id,%L::text module,%L||r.id::text key,r.collection_id,r.deleted_at,r.version,
   left(coalesce(to_jsonb(r)->>''title'',to_jsonb(r)->>''content'',''''),180) title,
   public.collection_owner(r.collection_id) can_purge from public.%I r
   join workspace_module_bindings b on b.collection_id=r.collection_id and b.module=%L
   where b.workspace_id=$1 and r.deleted_at>clock_timestamp()-interval ''30 days'' and public.collection_write(r.collection_id)',m,m||':',t,m));
 end loop;
 statement:='with all_rows as ('||array_to_string(parts,' union all ')||'), filtered as (select * from all_rows where strpos(lower(title),lower($2))>0),
 page as (select * from filtered where $3 is null or (deleted_at,key)<($3,$4) order by deleted_at desc,key desc limit $5+1),
 shown as (select * from page order by deleted_at desc,key desc limit $5)
 select jsonb_build_object(''items'',coalesce((select jsonb_agg(to_jsonb(s) order by deleted_at desc,key desc) from shown s),''[]''),
 ''total'',(select count(*) from filtered),''purgeable'',(select count(*) from filtered where can_purge),''as_of'',clock_timestamp(),''has_more'',(select count(*)>$5 from page),
 ''cursor'',(select jsonb_build_object(''time'',deleted_at,''key'',key) from shown order by deleted_at,key limit 1))';
 execute statement into answer using wid,coalesce(query_text,''),after_time,after_key,page_size;
 return answer;
end $$;
revoke all on function public.trash_page(uuid,text,text,timestamptz,text,integer) from public,anon;
grant execute on function public.trash_page(uuid,text,text,timestamptz,text,integer) to authenticated;

create or replace function public.trash_empty(wid uuid,only_module text default null,cutoff timestamptz default clock_timestamp()) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();b record;r record;t text;n integer:=0;removed jsonb:='[]';begin
 if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'TRASH_ACCESS_DENIED' using errcode='42501';end if;
 if cutoff is null or cutoff>clock_timestamp() or (only_module is not null and public.trash_table(only_module) is null) then raise exception 'INVALID_TRASH_INPUT';end if;
 for b in select x.module,x.collection_id from workspace_module_bindings x join module_collections c on c.id=x.collection_id
 where x.workspace_id=wid and (only_module is null or x.module=only_module) and public.collection_owner(c.id) order by c.id for update of c loop
  t:=public.trash_table(b.module);if t is null then continue;end if;
  for r in execute format('select id,version from public.%I where collection_id=$1 and deleted_at<=$2 and deleted_at>clock_timestamp()-interval ''30 days'' order by id for update',t) using b.collection_id,cutoff loop
   perform public.trash_purge_record(b.module,r.id);n:=n+1;
   removed:=removed||jsonb_build_array(jsonb_build_object('id',r.id,'module',b.module,'version',r.version));
  end loop;
 end loop;
 return jsonb_build_object('count',n,'removed',removed);
end $$;
revoke all on function public.trash_empty(uuid,text,timestamptz) from public,anon;
grant execute on function public.trash_empty(uuid,text,timestamptz) to authenticated;

-- Also callable by pg_cron. Bounded batches avoid long transactions.
create or replace function public.purge_expired_trash(batch_size integer default 200) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare m text;t text;r record;n integer:=0;begin
 foreach m in array array['detailed','quick','plans','code','pomodoro','learning','flashcards','workout','periodic','activities'] loop
  t:=public.trash_table(m);
  for r in execute format('select id from public.%I where deleted_at<=clock_timestamp()-interval ''30 days'' order by deleted_at limit $1 for update skip locked',t) using greatest(0,least(batch_size,500)-n) loop
   perform public.trash_purge_record(m,r.id);n:=n+1;
  end loop;
  exit when n>=least(batch_size,500);
 end loop;
 return n;
end $$;
revoke all on function public.purge_expired_trash(integer) from public,anon,authenticated;
grant execute on function public.purge_expired_trash(integer) to service_role;

create or replace function public.trash_cleanup_images(ack text[] default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from trash_image_cleanup where path=any(ack);
 -- A file still referenced by any retained note is never removed.
 delete from trash_image_cleanup q where exists(select 1 from todos t where strpos(coalesce(t.description,''),q.path)>0);
 return coalesce((select jsonb_agg(path) from (select path from trash_image_cleanup where queued_at<clock_timestamp()-interval '1 day' order by queued_at limit 100) x),'[]');
end $$;
revoke all on function public.trash_cleanup_images(text[]) from public,anon,authenticated;
grant execute on function public.trash_cleanup_images(text[]) to service_role;

-- An existing Cron installation is enough; no credentials are stored in SQL.
do $$begin
 if to_regprocedure('cron.schedule(text,text,text)') is not null then
  perform cron.schedule('workspace-trash-retention','17 * * * *','select public.purge_expired_trash(200)');
 else
  raise notice 'Enable Supabase Cron (pg_cron), then rerun this migration to activate automatic retention cleanup.';
 end if;
end $$;

-- Keep server-side projections and background work consistent with soft deletion.
create or replace function public.workspace_search_documents(wid uuid)
returns table(module text, record_id uuid, child_id text, title text, body text, meta jsonb, created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  with bound as materialized (
    select b.module,b.collection_id from public.workspace_module_bindings b
    join public.workspaces w on w.id=b.workspace_id
    join public.module_collections c on c.id=b.collection_id and c.module=b.module
    where w.id=wid and w.user_id=auth.uid() and w.archived_at is null
      and b.module=any(w.active_modules) and b.module<>'secure'
      and public.collection_access(b.collection_id)
  ), docs as (
    select 'detailed'::text module,r.id record_id,null::text child_id,r.title,
      r.description body,'{}'::jsonb meta,r.created_at from public.todos r join bound b on b.module='detailed' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'quick',r.id,null,left(r.content,100),r.content,'{}',r.created_at from public.quick_notes r join bound b on b.module='quick' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'plans',r.id,null,r.title,r.reason,jsonb_build_object('period',r.period,'date',r.period_date),r.created_at from public.plans r join bound b on b.module='plans' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'code',r.id,null,r.title,'','{}',r.created_at from public.code_snippets r join bound b on b.module='code' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'pomodoro',r.id,null,r.title,'','{}',r.created_at from public.pomo_tasks r join bound b on b.module='pomodoro' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'periodic',r.id,null,r.title,r.notes,'{}',r.created_at from public.periodic_tasks r join bound b on b.module='periodic' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'activities',r.id,null,r.title,concat_ws(' ',r.subtitle,r.notes),'{}',r.created_at from public.activity_items r join bound b on b.module='activities' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'learning',r.id,null,r.title,'','{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'learning',r.id,x->>'id',concat_ws(' · ',r.title,x->>'title'),'', '{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.topics) x
    union all select 'flashcards',r.id,null,r.title,'','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'flashcards',r.id,x->>'id',concat_ws(' · ',r.title,x->>'front'),x->>'back','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.cards) x
    union all select 'workout',r.id,null,r.title,'','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'workout',r.id,x->>'id',concat_ws(' · ',r.title,x->>'name'),x->>'notes','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.exercises) x
  ) select d.module,d.record_id,d.child_id,public.workspace_search_text(d.title),public.workspace_search_text(d.body),d.meta,d.created_at from docs d
$$;
create or replace function public.pomonotes_search_target(wid uuid, tid uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',t.id,'workspace_id',w.id,'collection_id',t.collection_id,'created_by',t.created_by,
    'title',t.title,'completed',t.completed,'version',t.version,'created_at',t.created_at,'updated_at',t.updated_at,
    'estimated_sessions',p.estimated_sessions,'focus_seconds',p.focus_seconds,
    'first_estimate_seconds',p.first_estimate_seconds,'sessions',coalesce(g.sessions,0),'seconds',coalesce(g.seconds,0))
  from public.pomo_tasks t
  join public.workspace_module_bindings b on b.collection_id=t.collection_id and b.module='pomodoro'
  join public.workspaces w on w.id=b.workspace_id
  left join public.pomo_task_member_preferences p on p.task_id=t.id and p.user_id=auth.uid()
  left join lateral (
    select count(*) filter(where s.credited_completed) as sessions,
      coalesce(sum((select coalesce(sum(extract(epoch from (x->>1)::timestamptz-(x->>0)::timestamptz)),0)
        from jsonb_array_elements(coalesce(s.credited_segments,'[]')) x)),0) as seconds
    from public.analytics_focus_sessions s where s.user_id=auth.uid() and s.task_id=t.id
  ) g on true
  where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and 'pomodoro'=any(w.active_modules)
    and t.deleted_at is null and t.id=tid and public.collection_access(t.collection_id)
$$;
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
    select * from pomo_tasks where collection_id=cid and deleted_at is null and (status_filter='all' or completed=(status_filter='completed'))
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
    select * into task from pomo_tasks where id=tid and collection_id=cid and deleted_at is null for update;
    if not found then raise exception 'TASK_UNAVAILABLE'; end if;
    if operation<>'goal' and (expected_version is null or task.version<>expected_version) then raise exception 'SHARING_CONFLICT'; end if;
    if operation='delete' then perform public.trash_change(wid,'pomodoro',tid,'move',expected_version);return jsonb_build_object('ok',true); end if;
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
create or replace function public.pomonotes_history(wid uuid, tid uuid, before_time timestamptz default null, before_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
  perform ensure_module_bindings(wid);
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='pomodoro';
  if not exists(select 1 from pomo_tasks where id=tid and collection_id=cid and deleted_at is null and collection_access(cid)) then raise exception 'ACCESS_DENIED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by started_at desc,id desc) from (
    select id,started_at,planned_seconds,status,credited_completed,credited_segments from analytics_focus_sessions
      where user_id=auth.uid() and task_id=tid and (before_time is null or (started_at,id)<(before_time,before_id))
      order by started_at desc,id desc limit 30) s),'[]');
end $$;
create or replace function public.rollover_collection_plans(cid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; today date; boundary date; cursor_date date; snapshots jsonb;
begin
  if not public.collection_write(cid) or not exists(select 1 from module_collections where id=cid and module='plans') then raise exception 'ACCESS_DENIED'; end if;
  select (now() at time zone timezone)::date into today from module_collections where id=cid;
  for p in select * from plans where collection_id=cid and deleted_at is null and not completed order by id for update loop
    boundary:=case p.period when 'daily' then today when 'weekly' then date_trunc('week',today)::date
      when 'monthly' then date_trunc('month',today)::date when 'yearly' then date_trunc('year',today)::date end;
    cursor_date:=p.period_date;
    snapshots:=coalesce(p.history,'[]'::jsonb);
    while cursor_date<boundary loop
      snapshots:=snapshots||jsonb_build_array(jsonb_build_object('date',cursor_date,'completed',false,'reason',p.reason));
      cursor_date:=cursor_date+case p.period when 'daily' then interval '1 day' when 'weekly' then interval '7 days'
        when 'monthly' then interval '1 month' when 'yearly' then interval '1 year' end;
    end loop;
    if p.period_date<boundary then update plans set period_date=boundary,history=snapshots where id=p.id; end if;
  end loop;
end; $$;
create or replace function public.personal_workspace_reminders() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return coalesce((select jsonb_agg(row_data) from (
    select distinct on(t.id) to_jsonb(t)||jsonb_build_object(
      'workspace_id',w.id,'user_id',auth.uid(),'workspace_name',w.name,
      'notify_browser',coalesce(p.notify_browser,false),'notify_email',coalesce(p.notify_email,false),
      'reminder_time',p.reminder_time,'last_notified_at',p.last_notified_at) as row_data
    from periodic_tasks t join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='periodic'
    join workspaces w on w.id=b.workspace_id left join periodic_member_preferences p on p.task_id=t.id and p.user_id=auth.uid()
    where t.deleted_at is null and w.user_id=auth.uid() and w.archived_at is null and 'periodic'=any(w.active_modules) and public.collection_access(t.collection_id)
    order by t.id,w.created_at
  ) records),'[]'::jsonb);
end; $$;
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
    where t.deleted_at is null and t.id=tid and w.id=wid and w.user_id=uid and w.archived_at is null and 'periodic'=any(w.active_modules);
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
    join workspaces w on w.id=b.workspace_id where t.deleted_at is null and t.id=(payload->>'task_id')::uuid and not t.completed
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
create or replace function public.capture_analytics_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  n jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  event_kind text;
  done boolean := coalesce((n->>'completed')::boolean,false);
  actor uuid := auth.uid();
begin
  if tg_op='DELETE' and n->>'deleted_at' is not null then return null;
  elsif tg_op='UPDATE' and n->>'deleted_at' is distinct from o->>'deleted_at' then
    event_kind := case when n->>'deleted_at' is null then 'baseline' else 'deleted' end;
  elsif tg_op='INSERT' then event_kind := 'created';
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

notify pgrst,'reload schema';
commit;
