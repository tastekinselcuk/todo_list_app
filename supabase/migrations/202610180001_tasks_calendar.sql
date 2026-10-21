-- Apply after 202610170001_workspace_trash.sql. Personal task/project/calendar MVP.
-- External calendars and team projects deliberately require separate authorization flows.
begin;

do $$ begin
 if to_regprocedure('public.trash_page(uuid,text,text,timestamp with time zone,text,integer)') is null
  or to_regprocedure('public.workspace_search_documents(uuid)') is null then
  raise exception 'Apply workspace search and 202610170001_workspace_trash.sql before the tasks/calendar migration.';
 end if;
end $$;

create table if not exists public.work_projects (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, user_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 100), archived boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default clock_timestamp(),
 unique(id,workspace_id), foreign key(workspace_id,user_id) references public.workspaces(id,user_id) on delete cascade
);
create table if not exists public.work_tasks (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, user_id uuid not null,
 project_id uuid, title text not null check(length(btrim(title)) between 1 and 180),
 description text not null default '' check(length(description)<=20000),
 status text not null default 'todo' check(status in ('todo','doing','done')),
 priority text not null default 'none' check(priority in ('none','low','medium','high')),
 due_on date check(due_on between date '1900-01-01' and date '2100-12-31'),
 estimate_minutes integer not null default 30 check(estimate_minutes between 5 and 1440),
 checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=50),
 version integer not null default 1, created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), deleted_at timestamptz,
 unique(id,workspace_id), foreign key(workspace_id,user_id) references public.workspaces(id,user_id) on delete cascade,
 foreign key(project_id,workspace_id) references public.work_projects(id,workspace_id)
);
create table if not exists public.work_blocks (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, user_id uuid not null,
 task_id uuid, title text not null default '' check(length(title)<=180),
 starts_at timestamptz not null, ends_at timestamptz not null,
 timezone text not null default 'UTC', version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), deleted_at timestamptz,
 foreign key(workspace_id,user_id) references public.workspaces(id,user_id) on delete cascade,
 foreign key(task_id,workspace_id) references public.work_tasks(id,workspace_id) on delete cascade,
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at<=starts_at+interval '7 days'),
 check(task_id is not null or length(btrim(title))>0)
);
create index if not exists work_tasks_page on public.work_tasks(workspace_id,created_at desc,id desc) where deleted_at is null;
create index if not exists work_tasks_project on public.work_tasks(workspace_id,project_id,status) where deleted_at is null;
create index if not exists work_tasks_due on public.work_tasks(workspace_id,due_on) where deleted_at is null and due_on is not null;
create index if not exists work_blocks_range on public.work_blocks(workspace_id,starts_at,ends_at) where deleted_at is null;
create index if not exists work_blocks_task on public.work_blocks(task_id);
create index if not exists work_tasks_trash on public.work_tasks(workspace_id,deleted_at) where deleted_at is not null;
create index if not exists work_blocks_trash on public.work_blocks(workspace_id,deleted_at) where deleted_at is not null;
do $$ declare t text; begin
 foreach t in array array['work_projects','work_tasks','work_blocks'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists work_owner on public.%I',t);
  execute format('create policy work_owner on public.%I for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.user_id=auth.uid() and w.archived_at is null))',t);
 end loop;
end $$;

create or replace function public.work_mutate(wid uuid,entity text,operation text,rid uuid,payload jsonb,expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); t text; old_row jsonb; changes jsonb; answer jsonb; pid uuid; tid uuid; item jsonb;
begin
 if uid is null then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 -- A workspace lock serializes archive/delete and related project/task mutations.
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if not found then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 t:=case entity when 'project' then 'work_projects' when 'task' then 'work_tasks' when 'block' then 'work_blocks' end;
 if t is null or rid is null or operation is null or operation not in ('create','update','move','restore','purge') or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_WORK_INPUT';end if;
 if entity='project' and operation not in ('create','update') then raise exception 'INVALID_WORK_INPUT';end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k<>all(case entity
  when 'project' then array['name','archived'] when 'task' then array['title','description','status','priority','project_id','due_on','estimate_minutes','checklist']
  else array['task_id','title','starts_at','ends_at','timezone'] end)) then raise exception 'INVALID_WORK_INPUT';end if;
 execute format('select to_jsonb(r) from public.%I r where id=$1 for update',t) into old_row using rid;
 if old_row is not null and (old_row->>'workspace_id'<>wid::text or old_row->>'user_id'<>uid::text) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if operation='create' and old_row is not null then
  if old_row->>'deleted_at' is not null then raise exception 'WORK_CONFLICT';end if;
  return old_row; -- Retrying the same create UUID never duplicates the record.
 elsif operation<>'create' then
  if old_row is null then raise exception 'WORK_UNAVAILABLE';end if;
  if expected_version is null or expected_version<>(old_row->>'version')::integer then raise exception 'WORK_CONFLICT';end if;
 end if;
 if operation in ('move','restore','purge') then
  if operation='move' and old_row->>'deleted_at' is not null then raise exception 'WORK_CONFLICT';end if;
  if operation<>'move' and old_row->>'deleted_at' is null then raise exception 'WORK_CONFLICT';end if;
  if operation='restore' and (old_row->>'deleted_at')::timestamptz<=clock_timestamp()-interval '30 days' then raise exception 'TRASH_EXPIRED';end if;
  if operation='purge' then
   execute format('delete from public.%I where id=$1',t) using rid;
   return old_row;
  end if;
  execute format('update public.%I set deleted_at=$2,version=version+1 where id=$1 returning to_jsonb(%I.*)',t,t) into answer
   using rid,case when operation='move' then clock_timestamp() else null::timestamptz end;
  return answer;
 end if;
 if old_row->>'deleted_at' is not null then raise exception 'WORK_UNAVAILABLE';end if;
 changes:=coalesce(old_row,'{}'::jsonb)||payload;
 if entity='project' then
  if coalesce(length(btrim(changes->>'name')),0) not between 1 and 100 then raise exception 'INVALID_WORK_INPUT';end if;
  if operation='create' then
   insert into work_projects(id,workspace_id,user_id,name) values(rid,wid,uid,btrim(changes->>'name')) returning to_jsonb(work_projects.*) into answer;
  else
   update work_projects set name=btrim(changes->>'name'),archived=coalesce((changes->>'archived')::boolean,false),version=version+1 where id=rid returning to_jsonb(work_projects.*) into answer;
  end if;
 elsif entity='task' then
  pid:=nullif(changes->>'project_id','')::uuid;
  if pid is not null then
   if not exists(select 1 from work_projects where id=pid and workspace_id=wid and user_id=uid) then raise exception 'INVALID_WORK_PROJECT';end if;
   if (operation='create' or pid::text is distinct from old_row->>'project_id') and exists(select 1 from work_projects where id=pid and archived) then raise exception 'WORK_PROJECT_ARCHIVED';end if;
  end if;
  changes:=jsonb_build_object('description','','status','todo','priority','none','estimate_minutes',30,'checklist','[]'::jsonb)||changes;
  if coalesce(length(btrim(changes->>'title')),0) not between 1 and 180 or changes->>'description' is null or length(changes->>'description')>20000
   or changes->>'status' is null or changes->>'priority' is null or changes->>'estimate_minutes' is null
   or changes->'checklist' is null or jsonb_typeof(changes->'checklist')<>'array' or jsonb_array_length(changes->'checklist')>50 then raise exception 'INVALID_WORK_INPUT';end if;
  for item in select value from jsonb_array_elements(changes->'checklist') loop
   if jsonb_typeof(item)<>'object' or coalesce(length(item->>'id'),0) not between 1 and 80 or coalesce(length(btrim(item->>'title')),0) not between 1 and 180
    or jsonb_typeof(item->'done') is distinct from 'boolean' or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','title','done')) then raise exception 'INVALID_WORK_CHECKLIST';end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(changes->'checklist'))<>jsonb_array_length(changes->'checklist') then raise exception 'INVALID_WORK_CHECKLIST';end if;
  if operation='create' then
   insert into work_tasks(id,workspace_id,user_id,title,description,status,priority,project_id,due_on,estimate_minutes,checklist)
   values(rid,wid,uid,btrim(changes->>'title'),changes->>'description',changes->>'status',changes->>'priority',pid,nullif(changes->>'due_on','')::date,(changes->>'estimate_minutes')::integer,changes->'checklist') returning to_jsonb(work_tasks.*) into answer;
  else
   update work_tasks set title=btrim(changes->>'title'),description=changes->>'description',status=changes->>'status',priority=changes->>'priority',project_id=pid,
    due_on=nullif(changes->>'due_on','')::date,estimate_minutes=(changes->>'estimate_minutes')::integer,checklist=changes->'checklist',version=version+1,updated_at=clock_timestamp()
   where id=rid returning to_jsonb(work_tasks.*) into answer;
  end if;
 else
  tid:=nullif(changes->>'task_id','')::uuid;
  if tid is not null and not exists(select 1 from work_tasks where id=tid and workspace_id=wid and user_id=uid and deleted_at is null) then raise exception 'INVALID_WORK_TASK';end if;
  if not exists(select 1 from pg_timezone_names where name=coalesce(changes->>'timezone','UTC')) then raise exception 'INVALID_WORK_TIMEZONE';end if;
  if changes->>'starts_at' is null or changes->>'ends_at' is null or (tid is null and coalesce(length(btrim(changes->>'title')),0) not between 1 and 180) then raise exception 'INVALID_WORK_INPUT';end if;
  if operation='create' then
   insert into work_blocks(id,workspace_id,user_id,task_id,title,starts_at,ends_at,timezone)
   values(rid,wid,uid,tid,coalesce(btrim(changes->>'title'),''),(changes->>'starts_at')::timestamptz,(changes->>'ends_at')::timestamptz,coalesce(changes->>'timezone','UTC')) returning to_jsonb(work_blocks.*) into answer;
  else
   update work_blocks set task_id=tid,title=coalesce(btrim(changes->>'title'),''),starts_at=(changes->>'starts_at')::timestamptz,ends_at=(changes->>'ends_at')::timestamptz,
    timezone=coalesce(changes->>'timezone','UTC'),version=version+1 where id=rid returning to_jsonb(work_blocks.*) into answer;
  end if;
 end if;
 return answer;
exception when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then
 raise exception 'INVALID_WORK_INPUT';
end $$;

create or replace function public.work_load(wid uuid,selected_project uuid default null,after_created timestamptz default null,after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare answer jsonb;
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if (after_created is null)<>(after_id is null) then raise exception 'INVALID_WORK_CURSOR';end if;
 with filtered as materialized(select t.* from work_tasks t where t.workspace_id=wid and t.user_id=auth.uid() and t.deleted_at is null and (selected_project is null or t.project_id=selected_project)),
 page as(select * from filtered where after_created is null or (created_at,id)<(after_created,after_id) order by created_at desc,id desc limit 101),
 shown as(select * from page order by created_at desc,id desc limit 100)
 select jsonb_build_object('projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.archived,p.created_at) from work_projects p where p.workspace_id=wid and p.user_id=auth.uid()),'[]'),
  'tasks',jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc,id desc) from shown s),'[]'),
  'total',(select count(*) from filtered),'counts',(select jsonb_build_object('todo',count(*) filter(where status='todo'),'doing',count(*) filter(where status='doing'),'done',count(*) filter(where status='done')) from filtered),
  'has_more',(select count(*)>100 from page),'cursor',(select jsonb_build_object('id',id,'created_at',created_at) from shown order by created_at,id limit 1))) into answer;
 return answer;
end $$;

create or replace function public.work_task(wid uuid,tid uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(t) from work_tasks t join workspaces w on w.id=t.workspace_id
 where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and t.user_id=auth.uid() and t.id=tid and t.deleted_at is null
$$;
create or replace function public.work_calendar(wid uuid,range_start timestamptz,range_end timestamptz,selected_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if range_start is null or range_end is null or not isfinite(range_start) or not isfinite(range_end) or range_end<=range_start or range_end>range_start+interval '63 days' then raise exception 'INVALID_WORK_RANGE';end if;
 return jsonb_build_object('blocks',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('task_title',t.title,'task_status',t.status,'project_id',t.project_id) order by b.starts_at,b.id)
  from work_blocks b left join work_tasks t on t.id=b.task_id and t.workspace_id=b.workspace_id
  where b.workspace_id=wid and b.user_id=auth.uid() and b.deleted_at is null and (b.task_id is null or t.deleted_at is null)
   and b.starts_at<range_end and b.ends_at>range_start and (selected_project is null or t.project_id=selected_project)),'[]'),
  'deadlines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'due_on',due_on,'status',status)) from work_tasks
   where workspace_id=wid and user_id=auth.uid() and deleted_at is null and due_on>=range_start::date and due_on<=range_end::date and (selected_project is null or project_id=selected_project)),'[]'));
end $$;
revoke all on function public.work_mutate(uuid,text,text,uuid,jsonb,integer),public.work_load(uuid,uuid,timestamptz,uuid),public.work_task(uuid,uuid),public.work_calendar(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.work_mutate(uuid,text,text,uuid,jsonb,integer),public.work_load(uuid,uuid,timestamptz,uuid),public.work_task(uuid,uuid),public.work_calendar(uuid,timestamptz,timestamptz,uuid) to authenticated;

-- Enable once on existing workspaces; reruns never re-enable a user-disabled module.
create table if not exists public.work_module_setup(workspace_id uuid primary key references public.workspaces(id) on delete cascade);
alter table public.work_module_setup enable row level security;
revoke all on public.work_module_setup from public,anon,authenticated;
with added as(insert into work_module_setup select id from workspaces on conflict do nothing returning workspace_id)
 update workspaces set active_modules=array_append(active_modules,'tasks') where id in(select workspace_id from added) and not 'tasks'=any(active_modules);
alter table public.workspaces alter column active_modules set default array['plans','detailed','quick','secure','code','pomodoro','learning','flashcards','workout','periodic','activities','finance','tasks'];

-- Integrate the new personal records into the existing trash and safe global search.
create or replace function public.trash_table(module_id text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case module_id when 'detailed' then 'todos' when 'quick' then 'quick_notes'
 when 'plans' then 'plans' when 'code' then 'code_snippets' when 'pomodoro' then 'pomo_tasks'
 when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks'
 when 'workout' then 'workout_routines' when 'periodic' then 'periodic_tasks' when 'activities' then 'activity_items' when 'tasks' then 'work_tasks' when 'calendar' then 'work_blocks' end
$$;
revoke all on function public.trash_table(text) from public,anon,authenticated;



create or replace function public.trash_change(wid uuid,module_id text,rid uuid,action text,expected_version integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();t text:=public.trash_table(module_id);cid uuid;row_data jsonb;answer jsonb;begin
 if module_id in ('tasks','calendar') then
  answer:=public.work_mutate(wid,case when module_id='tasks' then 'task' else 'block' end,action,rid,'{}',expected_version);
  return jsonb_build_object('id',rid,'module',module_id,'collection_id',wid,'version',(answer->>'version')::integer,'deleted_at',answer->>'deleted_at');
 end if;
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
 foreach m in array array['tasks','calendar'] loop
  if only_module is not null and m<>only_module then continue;end if;
  t:=case m when 'tasks' then 'work_tasks' else 'work_blocks' end;
  parts:=array_append(parts,format('select r.id,%L::text module,%L||r.id::text key,r.workspace_id collection_id,r.deleted_at,r.version,
   left(coalesce(nullif(r.title,'''') ,''Untitled''),180) title,true can_purge from public.%I r
   where r.workspace_id=$1 and r.user_id=auth.uid() and r.deleted_at>clock_timestamp()-interval ''30 days''',m,m||':',t));
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
 for b in select x.module,x.tbl from (values('tasks','work_tasks'),('calendar','work_blocks')) x(module,tbl) where only_module is null or x.module=only_module loop
  for r in execute format('select id,version from public.%I where workspace_id=$1 and user_id=auth.uid() and deleted_at<=$2 and deleted_at>clock_timestamp()-interval ''30 days'' order by id for update',b.tbl) using wid,cutoff loop
   perform public.work_mutate(wid,case b.module when 'tasks' then 'task' else 'block' end,'purge',r.id,'{}',r.version);
   n:=n+1;removed:=removed||jsonb_build_array(jsonb_build_object('id',r.id,'module',b.module,'version',r.version));
  end loop;
 end loop;
 return jsonb_build_object('count',n,'removed',removed);
end $$;

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
 foreach t in array array['work_tasks','work_blocks'] loop
  for r in execute format('select id from public.%I where deleted_at<=clock_timestamp()-interval ''30 days'' order by deleted_at limit $1 for update skip locked',t) using greatest(0,least(batch_size,500)-n) loop
   execute format('delete from public.%I where id=$1',t) using r.id;n:=n+1;
  end loop;
 end loop;
 return n;
end $$;

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
    union all select 'tasks',r.id,null,r.title,r.description,'{}',r.created_at from public.work_tasks r join public.workspaces w on w.id=r.workspace_id
     where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and r.user_id=auth.uid() and r.deleted_at is null and 'tasks'=any(w.active_modules)
  ) select d.module,d.record_id,d.child_id,public.workspace_search_text(d.title),public.workspace_search_text(d.body),d.meta,d.created_at from docs d
$$;
commit;
