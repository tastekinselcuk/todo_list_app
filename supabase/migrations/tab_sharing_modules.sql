-- Apply AFTER tab_sharing.sql. Adds the remaining ordinary data modules.
begin;
alter table public.module_collections drop constraint if exists module_collections_module_check;
alter table public.module_collections add constraint module_collections_module_check
  check(module in ('quick','code','detailed','activities','plans','learning','flashcards','workout','periodic','secure'));
alter table public.module_collections add column if not exists timezone text not null default 'Europe/Istanbul';

create or replace function public.ensure_module_bindings(wid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare m text; cid uuid; uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  perform pg_advisory_xact_lock(hashtext(wid::text));
  foreach m in array array['quick','code','detailed','activities','plans','learning','flashcards','workout','periodic'] loop
    if not exists(select 1 from workspace_module_bindings where workspace_id=wid and module=m) then
      insert into module_collections(module,owner_id,origin_workspace_id) values(m,uid,wid) returning id into cid;
      insert into collection_members(collection_id,user_id,role) values(cid,uid,'owner');
      insert into workspace_module_bindings values(wid,m,cid,cid);
    end if;
  end loop;
end; $$;
do $$ declare w record; m text; cid uuid; begin
  for w in select * from workspaces loop
    foreach m in array array['plans','learning','flashcards','workout','periodic'] loop
      if not exists(select 1 from workspace_module_bindings where workspace_id=w.id and module=m) then
        insert into module_collections(module,owner_id,origin_workspace_id) values(m,w.user_id,w.id) returning id into cid;
        insert into collection_members values(cid,w.user_id,'owner',now());
        insert into workspace_module_bindings values(w.id,m,cid,cid);
      end if;
    end loop;
  end loop;
end; $$;

do $$ declare t text; m text; p record; i record; cols text; predicate text; begin
  foreach t in array array['plans','learning_subjects','flashcard_decks','workout_routines','periodic_tasks'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    m:=case t when 'learning_subjects' then 'learning' when 'flashcard_decks' then 'flashcards'
      when 'workout_routines' then 'workout' when 'periodic_tasks' then 'periodic' else 'plans' end;
    execute format('alter table public.%I add column if not exists collection_id uuid references public.module_collections(id)',t);
    execute format('alter table public.%I add column if not exists version integer not null default 1',t);
    execute format('update public.%I r set collection_id=b.personal_collection_id from workspace_module_bindings b
      where b.workspace_id=r.workspace_id and b.module=$1 and r.collection_id is null',t) using m;
    execute format('alter table public.%I alter column collection_id set not null',t);
    execute format('alter table public.%I drop constraint if exists %I',t,t||'_workspace_owner_fk');
    execute format('create index if not exists %I on public.%I(collection_id,created_at)',t||'_collection_idx',t);
    execute format('create unique index if not exists %I on public.%I(id,collection_id)',t||'_id_collection_idx',t);
    for i in select idx.indexrelid,ic.relname,con.conname,idx.indnkeyatts,pg_get_expr(idx.indpred,idx.indrelid) as pred
      from pg_index idx join pg_class ic on ic.oid=idx.indexrelid left join pg_constraint con on con.conindid=idx.indexrelid
      where idx.indrelid=to_regclass('public.'||t) and idx.indisunique and not idx.indisprimary
      and exists(select 1 from unnest(idx.indkey) k join pg_attribute a on a.attrelid=idx.indrelid and a.attnum=k where a.attname='workspace_id')
      and not exists(select 1 from unnest(idx.indkey) k join pg_attribute a on a.attrelid=idx.indrelid and a.attnum=k where a.attname='id') loop
      select string_agg(case when pg_get_indexdef(i.indexrelid,k,true)='user_id' then null
        when pg_get_indexdef(i.indexrelid,k,true)='workspace_id' then 'collection_id' else pg_get_indexdef(i.indexrelid,k,true) end,', ' order by k)
        into cols from generate_series(1,i.indnkeyatts) k;
      predicate:=case when i.pred is null then '' else ' where '||i.pred end;
      if i.conname is not null then execute format('alter table public.%I drop constraint %I',t,i.conname);
      else execute format('drop index public.%I',i.relname); end if;
      execute format('create unique index %I on public.%I(%s)%s',i.relname,t,cols,predicate);
    end loop;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy collection_read on public.%I for select to authenticated using(public.collection_access(collection_id))',t);
    execute format('create policy collection_insert on public.%I for insert to authenticated with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_update on public.%I for update to authenticated using(public.collection_write(collection_id)) with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_delete on public.%I for delete to authenticated using(public.collection_write(collection_id))',t);
    execute format('drop trigger if exists guard_collection_record on public.%I',t);
    execute format('create trigger guard_collection_record before insert or update on public.%I
      for each row execute function guard_collection_record(%L,''user_id'')',t,m);
    execute format('drop trigger if exists collection_record_changed on public.%I',t);
    execute format('create trigger collection_record_changed after insert or update or delete on public.%I
      for each row execute function collection_record_changed()',t);
  end loop;
end; $$;

-- Plan rollover is atomic and uses the collection's timezone for every member.
create or replace function public.rollover_collection_plans(cid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; today date; boundary date; cursor_date date; snapshots jsonb;
begin
  if not public.collection_write(cid) or not exists(select 1 from module_collections where id=cid and module='plans') then raise exception 'ACCESS_DENIED'; end if;
  select (now() at time zone timezone)::date into today from module_collections where id=cid;
  for p in select * from plans where collection_id=cid and not completed order by id for update loop
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
revoke all on function public.rollover_collection_plans(uuid) from public,anon;
grant execute on function public.rollover_collection_plans(uuid) to authenticated;

-- Child records have independent versions. Parent JSON is a read projection for the existing UI.
create or replace function public.project_collection_items() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid; projection jsonb; root_table text:=tg_argv[0]; root_field text:=tg_argv[1];
begin
  pid:=case when tg_op='DELETE' then old.parent_id else new.parent_id end;
  execute format('select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by position,id),''[]''::jsonb) from public.%I where parent_id=$1',tg_table_name)
    into projection using pid;
  execute format('update public.%I set %I=$1 where id=$2',root_table,root_field) using projection,pid;
  return null;
end; $$;
do $$ declare root_table text; child_table text; field text; begin
  foreach root_table in array array['learning_subjects','flashcard_decks','workout_routines'] loop
    if to_regclass('public.'||root_table) is null then continue; end if;
    child_table:=root_table||'_items';
    field:=case root_table when 'learning_subjects' then 'topics' when 'flashcard_decks' then 'cards' else 'exercises' end;
    execute format('create table if not exists public.%I (
      parent_id uuid not null, collection_id uuid not null references module_collections(id), id text not null,
      data jsonb not null default ''{}'', position integer not null, version integer not null default 1,
      primary key(parent_id,id), foreign key(parent_id,collection_id) references public.%I(id,collection_id) on delete cascade)',child_table,root_table);
    execute format('insert into public.%I(parent_id,collection_id,id,data,position,version)
      select p.id,p.collection_id,coalesce(x.item->>''id'',gen_random_uuid()::text),x.item-''id''-''_version'',x.n::integer,
      coalesce((x.item->>''_version'')::integer,1) from public.%I p cross join lateral jsonb_array_elements(p.%I) with ordinality x(item,n)
      on conflict do nothing',child_table,root_table,field);
    execute format('alter table public.%I enable row level security',child_table);
    execute format('drop policy if exists read_collection_items on public.%I',child_table);
    execute format('create policy read_collection_items on public.%I for select to authenticated using(public.collection_access(collection_id))',child_table);
    execute format('revoke all on public.%I from anon,authenticated',child_table);
    execute format('grant select on public.%I to authenticated',child_table);
    execute format('drop trigger if exists project_collection_items on public.%I',child_table);
    execute format('create trigger project_collection_items after insert or update or delete on public.%I
      for each row execute function project_collection_items(%L,%L)',child_table,root_table,field);
  end loop;
end; $$;

-- Explicit single-item operations serialize against the parent, not a whole client-side array.
create or replace function public.mutate_collection_item(cid uuid,pid uuid,module_id text,operation text,item jsonb,expected_version integer default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare root_table text; child_table text; root_field text; current_row jsonb; result jsonb; changed integer; iid text;
begin
  root_table:=case module_id when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks' when 'workout' then 'workout_routines' end;
  if root_table is null or not public.collection_write(cid) or not exists(select 1 from module_collections where id=cid and module=module_id) then raise exception 'ACCESS_DENIED'; end if;
  child_table:=root_table||'_items';
  root_field:=case module_id when 'learning' then 'topics' when 'flashcards' then 'cards' else 'exercises' end;
  execute format('select to_jsonb(p) from public.%I p where id=$1 and collection_id=$2 for update',root_table) into current_row using pid,cid;
  if current_row is null then raise exception 'SHARING_CONFLICT'; end if;
  iid:=item->>'id';
  if operation='add' then
    iid:=coalesce(nullif(iid,''),gen_random_uuid()::text);
    execute format('insert into public.%I(parent_id,collection_id,id,data,position)
      select $1,$2,$3,$4,coalesce(max(position),0)+1 from public.%I where parent_id=$1',child_table,child_table)
      using pid,cid,iid,item-'id'-'_version';
  elsif operation in ('update','delete') then
    if expected_version is null then raise exception 'SHARING_CONFLICT'; end if;
    if operation='update' then
      execute format('update public.%I set data=data||$1,version=version+1 where parent_id=$2 and id=$3 and version=$4',child_table)
        using item-'id'-'_version',pid,iid,expected_version;
    else execute format('delete from public.%I where parent_id=$1 and id=$2 and version=$3',child_table) using pid,iid,expected_version;
    end if;
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'SHARING_CONFLICT'; end if;
  elsif operation='reset' and module_id='workout' then
    if expected_version is null or (current_row->>'version')::integer<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
    execute format('update public.%I set data=data||''{"isCompleted":false}''::jsonb,version=version+1 where parent_id=$1',child_table) using pid;
  else raise exception 'INVALID_ACTION'; end if;
  execute format('select to_jsonb(p)||jsonb_build_object(%L,
    (select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by position,id),''[]'') from public.%I where parent_id=$1))
    from public.%I p where id=$1',root_field,child_table,root_table) into result using pid;
  return result;
end; $$;
revoke all on function public.project_collection_items() from public,anon,authenticated;
revoke all on function public.mutate_collection_item(uuid,uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.mutate_collection_item(uuid,uuid,text,text,jsonb,integer) to authenticated;

-- Guard projected arrays against direct replacement after child normalization.
create or replace function public.guard_projected_array() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth()<2 and to_jsonb(new)->tg_argv[0] is distinct from to_jsonb(old)->tg_argv[0] then raise exception 'USE_ITEM_OPERATIONS'; end if;
  return new;
end; $$;
do $$ declare t text; f text; begin
  foreach t in array array['learning_subjects','flashcard_decks','workout_routines'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    f:=case t when 'learning_subjects' then 'topics' when 'flashcard_decks' then 'cards' else 'exercises' end;
    execute format('drop trigger if exists guard_projected_array on public.%I',t);
    execute format('create trigger guard_projected_array before update on public.%I for each row execute function guard_projected_array(%L)',t,f);
    -- Attach versions to old projections once, without changing original child IDs or contents.
    execute format('alter table public.%I disable trigger guard_projected_array',t);
    execute format('alter table public.%I disable trigger guard_collection_record',t);
    execute format('alter table public.%I disable trigger collection_record_changed',t);
    execute format('update public.%I p set %I=(select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by position,id),''[]'') from public.%I where parent_id=p.id)
      where %I is distinct from (select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by position,id),''[]'') from public.%I where parent_id=p.id)',t,f,t||'_items',f,t||'_items');
    execute format('alter table public.%I enable trigger guard_projected_array',t);
    execute format('alter table public.%I enable trigger guard_collection_record',t);
    execute format('alter table public.%I enable trigger collection_record_changed',t);
  end loop;
end; $$;
-- Reminder preferences and delivery state belong to the member, not the shared task.
do $$ begin
  if to_regclass('public.periodic_tasks') is not null then
    alter table public.periodic_tasks add column if not exists member_notify_browser boolean;
    alter table public.periodic_tasks add column if not exists member_notify_email boolean;
    alter table public.periodic_tasks add column if not exists member_reminder_time time;
    create table if not exists public.periodic_member_preferences (
      task_id uuid not null references public.periodic_tasks(id) on delete cascade deferrable initially deferred,
      user_id uuid not null references auth.users(id), notify_browser boolean not null default false,
      notify_email boolean not null default false, reminder_time time, last_notified_at timestamptz,
      primary key(task_id,user_id)
    );
    alter table public.periodic_member_preferences enable row level security;
    drop policy if exists own_reminder_preferences on public.periodic_member_preferences;
    create policy own_reminder_preferences on public.periodic_member_preferences for select to authenticated using(
      user_id=auth.uid() and exists(select 1 from public.periodic_tasks t where t.id=task_id and public.collection_access(t.collection_id)));
    revoke all on public.periodic_member_preferences from anon,authenticated;
    grant select on public.periodic_member_preferences to authenticated;
  end if;
end; $$;
create or replace function public.save_member_reminder() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.member_notify_browser is not null then
    if not public.collection_access(new.collection_id) then raise exception 'ACCESS_DENIED'; end if;
    insert into periodic_member_preferences(task_id,user_id,notify_browser,notify_email,reminder_time)
      values(new.id,auth.uid(),new.member_notify_browser,coalesce(new.member_notify_email,false),new.member_reminder_time)
      on conflict(task_id,user_id) do update set notify_browser=excluded.notify_browser,notify_email=excluded.notify_email,reminder_time=excluded.reminder_time;
  end if;
  new.member_notify_browser:=null; new.member_notify_email:=null; new.member_reminder_time:=null;
  if tg_op='UPDATE' then
    new.notify_browser:=old.notify_browser; new.notify_email:=old.notify_email;
    new.reminder_time:=old.reminder_time; new.last_notified_at:=old.last_notified_at;
  end if;
  return new;
end; $$;
do $$ begin
  if to_regclass('public.periodic_tasks') is not null then
    drop trigger if exists save_member_reminder on public.periodic_tasks;
    create trigger save_member_reminder before insert or update on public.periodic_tasks for each row execute function public.save_member_reminder();
  end if;
end; $$;
create or replace function public.mark_member_reminder(task_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from periodic_tasks where id=task_id and public.collection_access(collection_id)) then raise exception 'ACCESS_DENIED'; end if;
  update periodic_member_preferences p set last_notified_at=now() where p.task_id=mark_member_reminder.task_id and user_id=auth.uid();
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
    where w.user_id=auth.uid() and w.archived_at is null and 'periodic'=any(w.active_modules) and public.collection_access(t.collection_id)
    order by t.id,w.created_at
  ) records),'[]'::jsonb);
end; $$;
revoke all on function public.save_member_reminder() from public,anon,authenticated;
revoke all on function public.mark_member_reminder(uuid), public.personal_workspace_reminders() from public,anon;
grant execute on function public.mark_member_reminder(uuid),public.personal_workspace_reminders() to authenticated;
revoke all on function public.guard_projected_array() from public,anon,authenticated;
-- Backfill only after every table/trigger/policy change. The deferred task FK queues
-- constraint triggers on INSERT; subsequent ALTER TABLE would fail with SQLSTATE 55006.
do $$ begin
  if to_regclass('public.periodic_tasks') is not null then
    insert into public.periodic_member_preferences(task_id,user_id,notify_browser,notify_email,reminder_time,last_notified_at)
      select id,user_id,notify_browser,notify_email,reminder_time,last_notified_at from public.periodic_tasks on conflict do nothing;
  end if;
end; $$;
commit;
