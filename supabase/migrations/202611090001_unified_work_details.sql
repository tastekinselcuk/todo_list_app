-- Unified task details, multiple scheduled sessions and optional subtask targets.
-- Apply after 202610180001_tasks_calendar.sql. Existing records are preserved.
begin;
alter table public.work_blocks add column if not exists subtask_ids text[] not null default '{}';

create or replace function public.work_block_data(b public.work_blocks) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select to_jsonb(b)||jsonb_build_object('task_title',t.title,'task_status',case when cardinality(b.subtask_ids)>0 and exists(select 1 from jsonb_array_elements(coalesce(t.checklist,'[]'::jsonb)) c where c->>'id'=any(b.subtask_ids)) then
  case when not exists(select 1 from jsonb_array_elements(t.checklist) c where c->>'id'=any(b.subtask_ids) and not (c->>'done')::boolean) then 'done' else 'todo' end else t.status end,'project_id',t.project_id,
  'subtask_titles',coalesce((select jsonb_agg(c->>'title' order by n) from jsonb_array_elements(coalesce(t.checklist,'[]'::jsonb)) with ordinality as items(c,n) where c->>'id'=any(b.subtask_ids)),'[]'::jsonb))
 from (select 1) dummy left join work_tasks t on t.id=b.task_id and t.workspace_id=b.workspace_id and t.user_id=b.user_id
$$;
revoke all on function public.work_block_data(public.work_blocks) from public,anon,authenticated;

create or replace function public.work_mutate(wid uuid,entity text,operation text,rid uuid,payload jsonb,expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); t text; old_row jsonb; changes jsonb; answer jsonb; pid uuid; tid uuid; item jsonb; steps text[];
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
  else array['task_id','title','starts_at','ends_at','timezone','subtask_ids'] end)) then raise exception 'INVALID_WORK_INPUT';end if;
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
  if jsonb_typeof(coalesce(changes->'subtask_ids','[]'::jsonb))<>'array' then raise exception 'INVALID_WORK_SUBTASK';end if;
  select coalesce(array_agg(value #>> '{}'),'{}'::text[]) into steps from jsonb_array_elements(coalesce(changes->'subtask_ids','[]'::jsonb));
  -- A deleted checklist item must not prevent moving an existing calendar slot.
  if not (payload ? 'subtask_ids') then
   steps:=array(select x from unnest(steps) x where exists(select 1 from work_tasks t,jsonb_array_elements(t.checklist) c where t.id=tid and t.workspace_id=wid and t.user_id=uid and c->>'id'=x));
  end if;
  if cardinality(steps)>50 or (select count(distinct x) from unnest(steps) x)<>cardinality(steps)
   or (tid is null and cardinality(steps)>0) or exists(select 1 from unnest(steps) x where not exists(
    select 1 from work_tasks t,jsonb_array_elements(t.checklist) c where t.id=tid and t.workspace_id=wid and t.user_id=uid and c->>'id'=x)) then raise exception 'INVALID_WORK_SUBTASK';end if;
  if not exists(select 1 from pg_timezone_names where name=coalesce(changes->>'timezone','UTC')) then raise exception 'INVALID_WORK_TIMEZONE';end if;
  if changes->>'starts_at' is null or changes->>'ends_at' is null or (tid is null and coalesce(length(btrim(changes->>'title')),0) not between 1 and 180) then raise exception 'INVALID_WORK_INPUT';end if;
  if operation='create' then
   insert into work_blocks(id,workspace_id,user_id,task_id,title,starts_at,ends_at,timezone,subtask_ids)
   values(rid,wid,uid,tid,coalesce(btrim(changes->>'title'),''),(changes->>'starts_at')::timestamptz,(changes->>'ends_at')::timestamptz,coalesce(changes->>'timezone','UTC'),steps) returning to_jsonb(work_blocks.*) into answer;
  else
   update work_blocks set task_id=tid,title=coalesce(btrim(changes->>'title'),''),starts_at=(changes->>'starts_at')::timestamptz,ends_at=(changes->>'ends_at')::timestamptz,
    timezone=coalesce(changes->>'timezone','UTC'),subtask_ids=steps,version=version+1 where id=rid returning to_jsonb(work_blocks.*) into answer;
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
 with filtered as materialized(select t.* from work_tasks t where t.workspace_id=wid and t.user_id=auth.uid() and t.deleted_at is null and (selected_project is null or t.project_id=selected_project or (selected_project='00000000-0000-0000-0000-000000000000'::uuid and t.project_id is null))),
 page as(select * from filtered where after_created is null or (created_at,id)<(after_created,after_id) order by created_at desc,id desc limit 101),
 shown as(select * from page order by created_at desc,id desc limit 100)
 select jsonb_build_object('projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.archived,p.created_at) from work_projects p where p.workspace_id=wid and p.user_id=auth.uid()),'[]'),
  'tasks',jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('scheduled_blocks',coalesce((select jsonb_agg(public.work_block_data(b) order by b.starts_at,b.id) from work_blocks b where b.task_id=s.id and b.workspace_id=wid and b.user_id=auth.uid() and b.deleted_at is null),'[]'::jsonb)) order by created_at desc,id desc) from shown s),'[]'),
  'total',(select count(*) from filtered),'counts',(select jsonb_build_object('todo',count(*) filter(where status='todo'),'doing',count(*) filter(where status='doing'),'done',count(*) filter(where status='done')) from filtered),
  'has_more',(select count(*)>100 from page),'cursor',(select jsonb_build_object('id',id,'created_at',created_at) from shown order by created_at,id limit 1))) into answer;
 return answer;
end $$;

create or replace function public.work_task(wid uuid,tid uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(t)||jsonb_build_object('scheduled_blocks',coalesce((select jsonb_agg(public.work_block_data(b) order by b.starts_at,b.id) from work_blocks b where b.task_id=t.id and b.workspace_id=wid and b.user_id=auth.uid() and b.deleted_at is null),'[]'::jsonb)) from work_tasks t join workspaces w on w.id=t.workspace_id
 where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and t.user_id=auth.uid() and t.id=tid and t.deleted_at is null
$$;
create or replace function public.work_calendar(wid uuid,range_start timestamptz,range_end timestamptz,selected_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if range_start is null or range_end is null or not isfinite(range_start) or not isfinite(range_end) or range_end<=range_start or range_end>range_start+interval '63 days' then raise exception 'INVALID_WORK_RANGE';end if;
 return jsonb_build_object('blocks',coalesce((select jsonb_agg(public.work_block_data(b) order by b.starts_at,b.id)
  from work_blocks b left join work_tasks t on t.id=b.task_id and t.workspace_id=b.workspace_id
  where b.workspace_id=wid and b.user_id=auth.uid() and b.deleted_at is null and (b.task_id is null or t.deleted_at is null)
   and b.starts_at<range_end and b.ends_at>range_start and (selected_project is null or t.project_id=selected_project or (selected_project='00000000-0000-0000-0000-000000000000'::uuid and t.project_id is null))),'[]'),
  'deadlines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'due_on',due_on,'status',status)) from work_tasks
   where workspace_id=wid and user_id=auth.uid() and deleted_at is null and due_on>=range_start::date and due_on<=range_end::date and (selected_project is null or project_id=selected_project or (selected_project='00000000-0000-0000-0000-000000000000'::uuid and project_id is null))),'[]'));
end $$;

-- A single transaction for task edits plus only the time rows changed by the user.
-- Omitted rows remain untouched; stale versions and foreign records roll everything back.
create or replace function public.work_save_details(wid uuid,tid uuid,task_payload jsonb,task_version integer,time_changes jsonb,time_removals jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); item jsonb; old_block work_blocks; answer jsonb; result jsonb; bid uuid; seen uuid[]:='{}';
begin
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if not found then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(time_changes) is distinct from 'array' or jsonb_typeof(time_removals) is distinct from 'array'
  or jsonb_array_length(time_changes)>100 or jsonb_array_length(time_removals)>100 then raise exception 'INVALID_WORK_INPUT';end if;
 if tid is null and task_payload is not null then raise exception 'INVALID_WORK_TASK';end if;
 if tid is not null then
  if task_payload is null then raise exception 'INVALID_WORK_TASK';end if;
  answer:=work_mutate(wid,'task',case when task_version is null then 'create' else 'update' end,tid,task_payload,task_version);
 end if;
 for item in select value from jsonb_array_elements(time_removals) loop
  bid:=(item->>'id')::uuid;
  if bid=any(seen) then raise exception 'INVALID_WORK_INPUT';end if;seen:=array_append(seen,bid);
  select * into old_block from work_blocks where id=bid and workspace_id=wid and user_id=uid and deleted_at is null for update;
  if not found or old_block.task_id is distinct from tid then raise exception 'WORK_CONFLICT';end if;
  perform work_mutate(wid,'block','move',bid,'{}'::jsonb,(item->>'version')::integer);
 end loop;
 for item in select value from jsonb_array_elements(time_changes) loop
  bid:=(item->>'id')::uuid;
  if bid=any(seen) then raise exception 'INVALID_WORK_INPUT';end if;seen:=array_append(seen,bid);
  select * into old_block from work_blocks where id=bid for update;
  if found and (old_block.workspace_id<>wid or old_block.user_id<>uid or old_block.task_id is distinct from tid) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
  result:=work_mutate(wid,'block',case when item->>'version' is null then 'create' else 'update' end,bid,
   (item-'id'-'version')||jsonb_build_object('task_id',tid),(item->>'version')::integer);
 end loop;
 return jsonb_build_object('task',case when tid is null then null else work_task(wid,tid) end,
  'blocks',coalesce((select jsonb_agg(work_block_data(b) order by b.starts_at,b.id) from work_blocks b where b.workspace_id=wid and b.user_id=uid and b.deleted_at is null and ((tid is not null and b.task_id=tid) or (tid is null and b.id=any(seen)))),'[]'::jsonb));
exception when invalid_text_representation or check_violation or not_null_violation then raise exception 'INVALID_WORK_INPUT';
end $$;

-- Removing a project preserves its tasks and their scheduled times as unassigned.
create or replace function public.work_project_delete(wid uuid,pid uuid,expected_version integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null for update;
 if not found then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 perform 1 from work_projects where id=pid and workspace_id=wid and user_id=auth.uid() and version=expected_version for update;
 if not found then raise exception 'WORK_CONFLICT';end if;
 update work_tasks set project_id=null,version=version+1,updated_at=clock_timestamp() where project_id=pid and workspace_id=wid and user_id=auth.uid();
 delete from work_projects where id=pid and workspace_id=wid and user_id=auth.uid();
 return true;
end $$;
revoke all on function public.work_save_details(uuid,uuid,jsonb,integer,jsonb,jsonb),public.work_project_delete(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.work_save_details(uuid,uuid,jsonb,integer,jsonb,jsonb),public.work_project_delete(uuid,uuid,integer) to authenticated;
commit;
