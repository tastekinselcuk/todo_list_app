-- Retire the Quick Notes / PomoNotes screens without widening collection access.
begin;
do $$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.plans'::regclass and contype='c' and pg_get_constraintdef(oid) like '%period%' and pg_get_constraintdef(oid) not like '%period_date%' loop
  execute format('alter table public.plans drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.plans add constraint plans_period_check check(period in ('timeless','daily','weekly','monthly','yearly'));

-- Import baselines are unique; restores are new state snapshots. Keep that
-- distinction independent of actor_id, which becomes NULL after account deletion.
alter table public.analytics_events add column if not exists is_import_baseline boolean not null default true;
drop index if exists public.analytics_baseline_once;
create unique index analytics_baseline_once on public.analytics_events(collection_id,record_id) where kind='baseline' and is_import_baseline;

-- Safe physical conversion for personal collections. Shared sources keep their own
-- ACL and are projected into Timeless by plan_entries_load instead of merging ACLs.
alter table public.plans disable trigger user;
alter table public.quick_notes disable trigger user;
with moved as (
 insert into plans(id,user_id,workspace_id,collection_id,title,period,period_date,completed,reason,history,created_at,version,deleted_at,deleted_by)
 select q.id,q.created_by,p.origin_workspace_id,p.id,q.content,'timeless',date '1970-01-01',q.completed,'','[]',q.created_at,q.version,q.deleted_at,q.deleted_by
 from quick_notes q join module_collections qc on qc.id=q.collection_id
 join workspace_module_bindings qb on qb.collection_id=qc.id and qb.module='quick'
 join workspace_module_bindings pb on pb.workspace_id=qb.workspace_id and pb.module='plans'
 join module_collections p on p.id=pb.collection_id
 where not qc.shared and not p.shared and qc.owner_id=p.owner_id
 and not exists(select 1 from collection_members m where m.collection_id in(qc.id,p.id) and m.user_id<>p.owner_id)
 and (select count(*) from workspace_module_bindings where collection_id=qc.id)=1
 and (select count(*) from workspace_module_bindings where collection_id=p.id)=1
 and length(trim(q.content))>0
 on conflict(id) do nothing returning id,collection_id
), moved_events as (
 update analytics_events e set collection_id=m.collection_id,module='plans',period='timeless',carry_count=0
 from moved m where e.record_id=m.id and e.module='quick' returning e.id
) delete from quick_notes q using moved where q.id=moved.id;
update plans set reason='',history=coalesce((select jsonb_agg(h-'reason') from jsonb_array_elements(history) h),'[]');
alter table public.plans enable trigger user;
alter table public.quick_notes enable trigger user;

update workspaces set active_modules=array(select distinct m from unnest(active_modules||case when active_modules&&array['quick','pomodoro'] then array['plans'] else '{}'::text[] end) m where m<>'quick');
-- Focus is now personal infrastructure; its retired shared list is not a source.
update workspace_module_bindings set collection_id=personal_collection_id where module='pomodoro' and collection_id<>personal_collection_id;
update collection_invites set revoked_at=clock_timestamp() where revoked_at is null and collection_id in(select id from module_collections where module='pomodoro');
delete from collection_members m using module_collections c where m.collection_id=c.id and c.module='pomodoro' and m.user_id<>c.owner_id;
update module_collections set shared=false,epoch=epoch+1 where module='pomodoro' and shared;

create or replace function public.rollover_collection_plans(cid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p record;today date;boundary date;cursor_date date;snapshots jsonb;
begin
 if not collection_write(cid) or not exists(select 1 from module_collections where id=cid and module='plans') then raise exception 'ACCESS_DENIED';end if;
 select (now() at time zone timezone)::date into today from module_collections where id=cid;
 for p in select * from plans where collection_id=cid and deleted_at is null and not completed and period<>'timeless' order by id for update loop
  boundary:=case p.period when 'daily' then today when 'weekly' then date_trunc('week',today)::date when 'monthly' then date_trunc('month',today)::date when 'yearly' then date_trunc('year',today)::date end;
  cursor_date:=p.period_date;snapshots:=coalesce(p.history,'[]');
  while cursor_date<boundary loop
   snapshots:=snapshots||jsonb_build_array(jsonb_build_object('date',cursor_date,'completed',false));
   cursor_date:=cursor_date+case p.period when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' else interval '1 year' end;
  end loop;
  if p.period_date<boundary then update plans set period_date=boundary,history=snapshots where id=p.id;end if;
 end loop;
end $$;

create table if not exists public.plan_focus_links(
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references workspaces(id) on delete cascade,
 source_module text not null check(source_module in ('plans','quick')),source_id uuid not null,
 task_id uuid not null references pomo_tasks(id) on delete cascade,
 primary key(user_id,workspace_id,source_module,source_id)
);
create index if not exists plan_focus_links_source on plan_focus_links(source_module,source_id);
alter table plan_focus_links enable row level security;
revoke all on plan_focus_links from public,anon,authenticated;

create or replace function public.plan_entry_source(wid uuid,source text,rid uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid;answer jsonb;
begin
 if source not in ('plans','quick') or auth.uid() is null then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';end if;
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and 'plans'=any(w.active_modules) and b.module=source;
 if cid is null or not collection_access(cid) then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';end if;
 if source='plans' then select to_jsonb(p)||jsonb_build_object('source','plans','can_write',collection_write(cid)) into answer from plans p where p.id=rid and p.collection_id=cid and p.deleted_at is null;
 else select jsonb_build_object('id',q.id,'title',q.content,'period','timeless','period_date','1970-01-01','completed',q.completed,'created_at',q.created_at,'version',q.version,'history','[]'::jsonb,'source','quick','can_write',collection_write(cid)) into answer from quick_notes q where q.id=rid and q.collection_id=cid and q.deleted_at is null;end if;
 if answer is null then raise exception 'PLAN_UNAVAILABLE';end if;return answer-'reason';
end $$;
revoke all on function public.plan_entry_source(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.plan_entries_load(wid uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare pcid uuid;qcid uuid;answer jsonb;
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null and 'plans'=any(active_modules)) then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';end if;
 select collection_id into pcid from workspace_module_bindings where workspace_id=wid and module='plans';
 select collection_id into qcid from workspace_module_bindings where workspace_id=wid and module='quick';
 if collection_write(pcid) then perform rollover_collection_plans(pcid);end if;
 with entries as (
  select p.id,'plans'::text source,to_jsonb(p)-'reason'||jsonb_build_object('source','plans','can_write',collection_write(p.collection_id)) data,p.created_at from plans p where p.collection_id=pcid and p.deleted_at is null and collection_access(p.collection_id)
  union all select q.id,'quick',jsonb_build_object('id',q.id,'title',q.content,'period','timeless','period_date','1970-01-01','completed',q.completed,'created_at',q.created_at,'version',q.version,'history','[]'::jsonb,'source','quick','can_write',collection_write(q.collection_id)),q.created_at from quick_notes q where q.collection_id=qcid and q.deleted_at is null and collection_access(q.collection_id)
 ), result as (
  select e.data||jsonb_build_object('focus',case when l.task_id is null then null else jsonb_build_object('id',l.task_id,'estimated_sessions',coalesce(pref.estimated_sessions,1),'focus_seconds',coalesce(pref.focus_seconds,1500),'sessions',(select count(*) from analytics_focus_sessions f where f.user_id=auth.uid() and f.task_id=l.task_id and f.credited_completed)) end) data,e.created_at,e.id
  from entries e left join plan_focus_links l on l.source_id=e.id and l.source_module=e.source and l.user_id=auth.uid() and l.workspace_id=wid
  left join pomo_task_member_preferences pref on pref.task_id=l.task_id and pref.user_id=auth.uid()
 ) select coalesce(jsonb_agg(data order by created_at,id),'[]') into answer from result;
 return answer;
end $$;
revoke all on function public.plan_entries_load(uuid) from public,anon;
grant execute on function public.plan_entries_load(uuid) to authenticated;

create or replace function public.plan_focus_prepare(wid uuid,source text,rid uuid,seconds integer default null,estimate integer default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare entry jsonb;l plan_focus_links;p pomo_task_member_preferences;task jsonb;backing pomo_tasks;
begin
 entry:=plan_entry_source(wid,source,rid);
 if (entry->>'completed')::boolean then raise exception 'PLAN_COMPLETED';end if;
 if not exists(select 1 from workspaces where id=wid and 'pomodoro'=any(active_modules)) then raise exception 'PLAN_FOCUS_DISABLED';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||wid::text||source||rid::text,61));
 select * into l from plan_focus_links where user_id=auth.uid() and workspace_id=wid and source_module=source and source_id=rid;
 if l.task_id is not null then select * into p from pomo_task_member_preferences where task_id=l.task_id and user_id=auth.uid();end if;
 seconds:=coalesce(seconds,p.focus_seconds,1500);estimate:=coalesce(estimate,p.estimated_sessions,1);
 if l.task_id is null or not exists(select 1 from pomo_tasks where id=l.task_id and deleted_at is null and collection_access(collection_id)) then
  task:=pomonotes_mutate(wid,'create',null,left(entry->>'title',500),estimate,seconds,null);
  insert into plan_focus_links values(auth.uid(),wid,source,rid,(task->>'id')::uuid) on conflict(user_id,workspace_id,source_module,source_id) do update set task_id=excluded.task_id;
 else
  select * into backing from pomo_tasks where id=l.task_id for update;
  if backing.title<>left(entry->>'title',500) then
   task:=pomonotes_mutate(wid,'edit',l.task_id,left(entry->>'title',500),estimate,seconds,backing.version);
  else task:=pomonotes_mutate(wid,'goal',l.task_id,null,estimate,seconds,null);end if;
 end if;
 return task||jsonb_build_object('estimated_sessions',estimate,'focus_seconds',seconds,'source_module',source,'source_id',rid,'plan_period',entry->>'period','workspace_id',wid);
end $$;
revoke all on function public.plan_focus_prepare(uuid,text,uuid,integer,integer) from public,anon;
grant execute on function public.plan_focus_prepare(uuid,text,uuid,integer,integer) to authenticated;

create or replace function public.plan_focus_target(wid uuid,tid uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare l plan_focus_links;begin
 select * into l from plan_focus_links where user_id=auth.uid() and workspace_id=wid and task_id=tid;
 if l.task_id is null then return null;end if;return plan_entry_source(wid,l.source_module,l.source_id);
end $$;
revoke all on function public.plan_focus_target(uuid,uuid) from public,anon;
grant execute on function public.plan_focus_target(uuid,uuid) to authenticated;

-- Re-check the original source when starting a new session. Finishing an already
-- recorded session remains possible after deletion/revocation, preserving elapsed time.
create or replace function public.plan_focus_source_available(wid uuid,tid uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from plan_focus_links l
  join workspaces w on w.id=l.workspace_id and w.user_id=l.user_id
  join workspace_module_bindings b on b.workspace_id=w.id and b.module=l.source_module
  where l.user_id=auth.uid() and l.workspace_id=wid and l.task_id=tid and w.archived_at is null
  and 'plans'=any(w.active_modules) and 'pomodoro'=any(w.active_modules) and collection_access(b.collection_id)
  and ((l.source_module='plans' and exists(select 1 from plans p where p.id=l.source_id and p.collection_id=b.collection_id and p.deleted_at is null and not p.completed))
    or (l.source_module='quick' and exists(select 1 from quick_notes q where q.id=l.source_id and q.collection_id=b.collection_id and q.deleted_at is null and not q.completed))))
$$;
revoke all on function public.plan_focus_source_available(uuid,uuid) from public,anon,authenticated;

-- Reject legacy deferral writes; old data was returned to the normal list above.
create or replace function public.guard_plan_period() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 new.reason:='';
 if new.period='timeless' then new.period_date:=date '1970-01-01';new.history:='[]';end if;
 return new;end $$;
drop trigger if exists guard_plan_period on plans;
create trigger guard_plan_period before insert or update on plans for each row execute function guard_plan_period();

-- Preserve the existing, audited search/trash functions and their exact pagination.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.create_collection_invite(uuid,text,text)'::regprocedure);
 definition:=replace(definition,$find$when 'pomodoro' then 'pomo_tasks'$find$,'');execute definition;
 definition:=pg_get_functiondef('public.accept_collection_invite(text,uuid)'::regprocedure);
 definition:=replace(definition,'active_modules || array[c.module]',
  $replace$active_modules || case when c.module='quick' then array['plans'] else array[c.module] end$replace$);execute definition;
 definition:=pg_get_functiondef('public.capture_analytics_event()'::regprocedure);
 definition:=replace(definition,E'\r\n',E'\n');
 if position($test$tg_argv[0]='pomodoro' then return null$test$ in definition)=0 then
  definition:=replace(definition,E'begin\n',$replace$begin
  if tg_argv[0]='pomodoro' then return null;end if;
$replace$);end if;execute definition;
 if position('is_import_baseline' in definition)=0 then
  definition:=replace(definition,'item_created_at,period,carry_count)','item_created_at,period,carry_count,is_import_baseline)');
  definition:=replace(definition,$find$jsonb_array_length(coalesce(n->'history','[]')));$find$,$replace$jsonb_array_length(coalesce(n->'history','[]')),false);$replace$);
 end if;execute definition;
 definition:=pg_get_functiondef('public.analytics_report_v2(uuid,date,date,text,boolean,boolean)'::regprocedure);
 definition:=replace(definition,$find$b.module in ('quick','detailed','plans','pomodoro')$find$,$replace$b.module in ('quick','detailed','plans')$replace$);
 execute definition;
 definition:=pg_get_functiondef('public.claim_focus_session(uuid,jsonb,boolean)'::regprocedure);
 if position('plan_focus_source_available' in definition)=0 then
  definition:=replace(definition,'and collection_access(t.collection_id)',
   $replace$and plan_focus_source_available((payload->>'workspace_id')::uuid,t.id) and collection_access(t.collection_id)$replace$);
 end if;
 if position('plan_focus_source_available' in definition)=0 then raise exception 'PLAN_FOCUS_CLAIM_MIGRATION_MISMATCH';end if;execute definition;
 definition:=pg_get_functiondef('public.record_focus_session(jsonb)'::regprocedure);
 if position('plan_focus_source_available' in definition)=0 then
  definition:=replace(definition,'where id=tid and collection_access(collection_id)',
   $replace$where id=tid and collection_access(collection_id) and plan_focus_source_available((payload->>'workspace_id')::uuid,tid)$replace$);
 end if;
 if position('plan_focus_source_available' in definition)=0 then raise exception 'PLAN_FOCUS_RECORD_MIGRATION_MISMATCH';end if;execute definition;
 definition:=pg_get_functiondef('public.workspace_search_documents(uuid)'::regprocedure);
 definition:=replace(definition,$find$select 'quick',r.id,null,left(r.content,100),r.content,'{}',r.created_at$find$,$replace$select 'plans',r.id,null,left(r.content,100),r.content,jsonb_build_object('period','timeless','source','quick'),r.created_at$replace$);
 if position($test$b.module='quick' and 'plans'=any(w.active_modules)$test$ in definition)=0 then
 definition:=replace(definition,$find$b.module=any(w.active_modules)$find$,$replace$(b.module=any(w.active_modules) or (b.module='quick' and 'plans'=any(w.active_modules)))$replace$);end if;
 definition:=regexp_replace(definition,E'\\n[^\\n]*union all select ''pomodoro''[^\\n]*','','g');
 execute definition;
 definition:=pg_get_functiondef('public.trash_page(uuid,text,text,timestamp with time zone,text,integer)'::regprocedure);
 definition:=replace(definition,$find$if only_module is not null and m<>only_module then continue;end if;$find$,$replace$if m='pomodoro' or (only_module is not null and m<>only_module and not(only_module='plans' and m='quick')) then continue;end if;$replace$);execute definition;
 definition:=pg_get_functiondef('public.trash_empty(uuid,text,timestamp with time zone)'::regprocedure);
 if position($test$only_module='plans' and x.module='quick'$test$ in definition)=0 then
 definition:=replace(definition,'(only_module is null or x.module=only_module)',$replace$(only_module is null or x.module=only_module or (only_module='plans' and x.module='quick')) and x.module<>'pomodoro'$replace$);end if;execute definition;
end $$;
notify pgrst,'reload schema';
commit;
