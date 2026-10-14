-- Apply AFTER workspaces.sql. Existing records retain their IDs and contents.
begin;

create table if not exists public.module_collections (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('quick','code','detailed','activities')),
  owner_id uuid not null references auth.users(id),
  origin_workspace_id uuid not null references public.workspaces(id),
  shared boolean not null default false,
  epoch integer not null default 1,
  created_at timestamptz not null default now()
);
create table if not exists public.collection_members (
  collection_id uuid not null references public.module_collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (collection_id,user_id)
);
create index if not exists collection_members_user_idx on public.collection_members(user_id,collection_id);
create table if not exists public.workspace_module_bindings (
  workspace_id uuid not null references public.workspaces(id),
  module text not null,
  collection_id uuid not null references public.module_collections(id),
  personal_collection_id uuid not null references public.module_collections(id),
  primary key (workspace_id,module)
);
create index if not exists bindings_collection_idx on public.workspace_module_bindings(collection_id);
create table if not exists public.collection_invites (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.module_collections(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.collection_activity (
  id bigint generated always as identity primary key,
  collection_id uuid not null references public.module_collections(id),
  record_id uuid,
  actor_id uuid references auth.users(id),
  operation text not null,
  created_at timestamptz not null default now()
);
create index if not exists collection_activity_collection_idx on public.collection_activity(collection_id,created_at);

-- Functions use the actual session identity, never a client-supplied user ID.
create or replace function public.collection_member(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.collection_members where collection_id=cid and user_id=auth.uid()
  );
$$;
create or replace function public.collection_access(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.collection_member(cid) and exists (
    select 1 from public.workspace_module_bindings b join public.workspaces w on w.id=b.workspace_id
    where b.collection_id=cid and w.user_id=auth.uid() and w.archived_at is null
  );
$$;
create or replace function public.collection_owner(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.module_collections where id=cid and owner_id=auth.uid()
  );
$$;
create or replace function public.collection_write(cid uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.collection_access(cid) and exists(select 1 from public.collection_members
    where collection_id=cid and user_id=auth.uid() and role in ('owner','editor'));
$$;

-- Ensure personal bindings lazily, including workspaces created after this migration.
create or replace function public.ensure_module_bindings(wid uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m text; cid uuid; uid uuid := auth.uid();
begin
  if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then
    raise exception 'WORKSPACE_ACCESS_DENIED';
  end if;
  perform pg_advisory_xact_lock(hashtext(wid::text));
  foreach m in array array['quick','code','detailed','activities'] loop
    if not exists(select 1 from workspace_module_bindings where workspace_id=wid and module=m) then
      insert into module_collections(module,owner_id,origin_workspace_id) values(m,uid,wid) returning id into cid;
      insert into collection_members(collection_id,user_id,role) values(cid,uid,'owner');
      insert into workspace_module_bindings values(wid,m,cid,cid);
    end if;
  end loop;
end;
$$;

-- Backfill all workspaces without impersonating any user.
do $$
declare w record; m text; cid uuid;
begin
  for w in select * from public.workspaces loop
    foreach m in array array['quick','code','detailed','activities'] loop
      if not exists(select 1 from workspace_module_bindings where workspace_id=w.id and module=m) then
        insert into module_collections(module,owner_id,origin_workspace_id) values(m,w.user_id,w.id) returning id into cid;
        insert into collection_members values(cid,w.user_id,'owner',now());
        insert into workspace_module_bindings values(w.id,m,cid,cid);
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.sharing_context(wid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.ensure_module_bindings(wid);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'module',b.module,'collection_id',c.id,'personal_collection_id',b.personal_collection_id,
    'origin_workspace_id',c.origin_workspace_id,'shared',c.shared,'epoch',c.epoch,
    'owner_id',c.owner_id,'role',m.role,'name',w.name,
    'members',(select count(*) from collection_members cm where cm.collection_id=c.id),
    'active_modules',(select active_modules from workspaces where id=wid),
    'timezone',to_jsonb(c)->>'timezone'
  ) order by b.module)
  from workspace_module_bindings b join module_collections c on c.id=b.collection_id
  join collection_members m on m.collection_id=c.id and m.user_id=auth.uid()
  join workspaces w on w.id=c.origin_workspace_id where b.workspace_id=wid),'[]'::jsonb);
end;
$$;

create or replace function public.create_collection_invite(wid uuid, module_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; token text; iid uuid;
begin
  perform public.ensure_module_bindings(wid);
  if to_regclass('public.' || case module_id when 'quick' then 'quick_notes' when 'code' then 'code_snippets'
    when 'detailed' then 'todos' when 'activities' then 'activity_items' when 'plans' then 'plans'
    when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks' when 'workout' then 'workout_routines'
    when 'periodic' then 'periodic_tasks' when 'secure' then 'secure_notes' else '__unsupported' end) is null then
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
  insert into collection_invites(collection_id,token_hash,created_by)
    values(cid,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid()) returning id into iid;
  update module_collections set shared=true where id=cid;
  return jsonb_build_object('id',iid,'token',token,'expires_at',now()+interval '7 days');
end;
$$;

create or replace function public.preview_collection_invite(invite_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare inv collection_invites; result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into inv from collection_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex');
  if inv.id is null then raise exception 'INVITE_INVALID'; end if;
  if inv.revoked_at is not null then raise exception 'INVITE_REVOKED'; end if;
  if inv.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if inv.used_at is not null or inv.used_by is not null then raise exception 'INVITE_USED'; end if;
  select jsonb_build_object('collection_id',c.id,'module',c.module,'name',w.name,
    'owner_label',coalesce(nullif(split_part(u.email,'@',1),''),'Owner'),
    'expires_at',inv.expires_at,'already_member',public.collection_member(c.id)) into result
    from module_collections c join workspaces w on w.id=c.origin_workspace_id
    join auth.users u on u.id=c.owner_id where c.id=inv.collection_id;
  return result;
end;
$$;

create or replace function public.accept_collection_invite(invite_token text,wid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare inv collection_invites; c module_collections;
begin
  perform public.ensure_module_bindings(wid);
  -- Serialize consumption, revocation and acceptance against the same collection.
  select * into inv from collection_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex');
  if inv.id is null then raise exception 'INVITE_INVALID'; end if;
  select * into c from module_collections where id=inv.collection_id for update;
  select * into inv from collection_invites where id=inv.id for update;
  perform public.preview_collection_invite(invite_token);
  if exists(select 1 from workspace_module_bindings where workspace_id=wid and module=c.module
    and collection_id<>personal_collection_id and collection_id<>c.id) then raise exception 'ALREADY_SHARED'; end if;
  insert into collection_members(collection_id,user_id,role) values(c.id,auth.uid(),
    case when c.owner_id=auth.uid() then 'owner' else 'editor' end) on conflict do nothing;
  update workspace_module_bindings set collection_id=c.id where workspace_id=wid and module=c.module;
  update workspaces set active_modules=array(select distinct unnest(active_modules || array[c.module])) where id=wid;
  update collection_invites set used_by=auth.uid(),used_at=now() where id=inv.id;
  return public.sharing_context(wid);
end;
$$;

create or replace function public.detach_collection(wid uuid,module_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b workspace_module_bindings;
begin
  perform public.ensure_module_bindings(wid);
  select * into b from workspace_module_bindings where workspace_id=wid and module=module_id for update;
  perform 1 from module_collections where id=b.collection_id for update;
  if b.collection_id=b.personal_collection_id then raise exception 'OWNER_MUST_END_SHARING'; end if;
  update workspace_module_bindings set collection_id=personal_collection_id where workspace_id=wid and module=module_id;
  if not public.collection_owner(b.collection_id) and not exists(
    select 1 from workspace_module_bindings x join workspaces w on w.id=x.workspace_id
    where x.collection_id=b.collection_id and w.user_id=auth.uid()
  ) then
    delete from collection_members where collection_id=b.collection_id and user_id=auth.uid();
    update module_collections set epoch=epoch+1 where id=b.collection_id;
  end if;
  return public.sharing_context(wid);
end;
$$;

create or replace function public.manage_collection(cid uuid,action text,target_id uuid default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from module_collections where id=cid for update;
  if not public.collection_owner(cid) then raise exception 'OWNER_REQUIRED'; end if;
  if action='revoke_invite' then
    update collection_invites set revoked_at=now() where id=target_id and collection_id=cid;
  elsif action in ('remove_member','end_sharing') then
    if action='remove_member' and (target_id is null or target_id=auth.uid()) then raise exception 'INVALID_MEMBER'; end if;
    update workspace_module_bindings b set collection_id=personal_collection_id from workspaces w
      where w.id=b.workspace_id and b.collection_id=cid and w.user_id<>auth.uid()
      and (action='end_sharing' or w.user_id=target_id);
    delete from collection_members where collection_id=cid and user_id<>auth.uid()
      and (action='end_sharing' or user_id=target_id);
    update module_collections set epoch=epoch+1,shared=case when action='end_sharing' then false else shared end where id=cid;
    if action='end_sharing' then update collection_invites set revoked_at=now() where collection_id=cid and revoked_at is null; end if;
  else raise exception 'INVALID_ACTION'; end if;
end;
$$;

create or replace function public.collection_details(cid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.collection_member(cid) then raise exception 'ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,
      'label',coalesce(nullif(split_part(u.email,'@',1),''),'Member')) order by m.created_at),'[]'::jsonb)
      from collection_members m join auth.users u on u.id=m.user_id where m.collection_id=cid),
    'invites',case when public.collection_owner(cid) then (select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'expires_at',expires_at,'used_at',used_at,'revoked_at',revoked_at) order by created_at desc),'[]'::jsonb)
      from collection_invites where collection_id=cid and expires_at>now()) else '[]'::jsonb end
  );
end;
$$;

-- Broadcast invalidations contain no note content, passwords, email addresses or invite tokens.
create or replace function public.sharing_notify(topic text,payload jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    perform realtime.send(payload,'changed',topic,true);
  end if;
end;
$$;
create or replace function public.sharing_binding_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  select user_id into uid from workspaces where id=new.workspace_id;
  perform public.sharing_notify('sharing-user:'||uid::text,jsonb_build_object('workspace_id',new.workspace_id));
  return new;
end;
$$;
drop trigger if exists sharing_binding_changed on public.workspace_module_bindings;
create trigger sharing_binding_changed after insert or update on public.workspace_module_bindings
for each row execute function public.sharing_binding_changed();
create or replace function public.sharing_collection_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  for uid in select user_id from collection_members where collection_id=new.id loop
    perform public.sharing_notify('sharing-user:'||uid::text,jsonb_build_object('collection_id',new.id));
  end loop;
  return new;
end;
$$;
drop trigger if exists sharing_collection_changed on public.module_collections;
create trigger sharing_collection_changed after update on public.module_collections
for each row execute function public.sharing_collection_changed();

create or replace function public.guard_collection_record() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c module_collections; expected_module text := tg_argv[0]; owner_column text := tg_argv[1];
begin
  if tg_op='INSERT' and new.collection_id is null then
    perform public.ensure_module_bindings(new.workspace_id);
    select collection_id into new.collection_id from workspace_module_bindings
      where workspace_id=new.workspace_id and module=expected_module;
  end if;
  select * into c from module_collections where id=new.collection_id;
  if c.module is distinct from expected_module or not public.collection_write(c.id) then raise exception 'COLLECTION_ACCESS_DENIED'; end if;
  if tg_op='UPDATE' then
    if new.collection_id<>old.collection_id or new.workspace_id<>old.workspace_id
      or to_jsonb(new)->owner_column is distinct from to_jsonb(old)->owner_column then raise exception 'OWNERSHIP_IMMUTABLE'; end if;
    new.version := old.version+1;
  else
    new.workspace_id := c.origin_workspace_id;
    new := jsonb_populate_record(new,jsonb_build_object(owner_column,auth.uid()));
    new.version := 1;
  end if;
  return new;
end;
$$;
create or replace function public.collection_record_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare row_data jsonb; cid uuid; ep integer;
begin
  row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  cid := (row_data->>'collection_id')::uuid;
  select epoch into ep from module_collections where id=cid;
  insert into collection_activity(collection_id,record_id,actor_id,operation)
    values(cid,(row_data->>'id')::uuid,auth.uid(),tg_op);
  perform public.sharing_notify('collection:'||cid::text||':'||ep::text,
    jsonb_build_object('table',tg_table_name,'id',row_data->>'id','operation',tg_op));
  return null;
end;
$$;

do $$
declare t text; m text; owner_col text; p record; i record; cols text; predicate text;
begin
  foreach t in array array['quick_notes','code_snippets','categories','todos','activity_items'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    m := case t when 'quick_notes' then 'quick' when 'code_snippets' then 'code'
      when 'activity_items' then 'activities' else 'detailed' end;
    owner_col := case when t='activity_items' then 'user_id' else 'created_by' end;
    execute format('alter table public.%I add column if not exists collection_id uuid references public.module_collections(id)',t);
    execute format('alter table public.%I add column if not exists version integer not null default 1',t);
    execute format('update public.%I r set collection_id=b.personal_collection_id from public.workspace_module_bindings b
      where b.workspace_id=r.workspace_id and b.module=$1 and r.collection_id is null',t) using m;
    execute format('alter table public.%I alter column collection_id set not null',t);
    execute format('alter table public.%I drop constraint if exists %I',t,t||'_workspace_owner_fk');
    execute format('create index if not exists %I on public.%I(collection_id,created_at)',t||'_collection_idx',t);
    execute format('create unique index if not exists %I on public.%I(id,collection_id)',t||'_id_collection_idx',t);
    -- Names and external IDs must be unique within the shared collection, not the origin workspace.
    for i in select idx.indexrelid,ic.relname,con.conname,idx.indnkeyatts,pg_get_expr(idx.indpred,idx.indrelid) as pred
      from pg_index idx join pg_class ic on ic.oid=idx.indexrelid left join pg_constraint con on con.conindid=idx.indexrelid
      where idx.indrelid=to_regclass('public.'||t) and idx.indisunique and not idx.indisprimary
      and exists(select 1 from unnest(idx.indkey) k join pg_attribute a on a.attrelid=idx.indrelid and a.attnum=k where a.attname='workspace_id')
      and not exists(select 1 from unnest(idx.indkey) k join pg_attribute a on a.attrelid=idx.indrelid and a.attnum=k where a.attname='id') loop
      select string_agg(case when pg_get_indexdef(i.indexrelid,k,true)=owner_col then null
        when pg_get_indexdef(i.indexrelid,k,true)='workspace_id' then 'collection_id'
        else pg_get_indexdef(i.indexrelid,k,true) end,', ' order by k) into cols from generate_series(1,i.indnkeyatts) k;
      predicate := case when i.pred is null then '' else ' where '||i.pred end;
      if i.conname is not null then execute format('alter table public.%I drop constraint %I',t,i.conname);
      else execute format('drop index public.%I',i.relname); end if;
      execute format('create unique index %I on public.%I(%s)%s',i.relname,t,cols,predicate);
    end loop;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy collection_read on public.%I for select to authenticated using(public.collection_access(collection_id))',t);
    execute format('create policy collection_insert on public.%I for insert to authenticated with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_update on public.%I for update to authenticated using(public.collection_write(collection_id)) with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_delete on public.%I for delete to authenticated using(public.collection_write(collection_id))',t);
    execute format('drop trigger if exists guard_collection_record on public.%I',t);
    execute format('create trigger guard_collection_record before insert or update on public.%I
      for each row execute function public.guard_collection_record(%L,%L)',t,m,owner_col);
    execute format('drop trigger if exists collection_record_changed on public.%I',t);
    execute format('create trigger collection_record_changed after insert or update or delete on public.%I
      for each row execute function public.collection_record_changed()',t);
  end loop;
  if to_regclass('public.todos') is not null then
    alter table public.todos drop constraint if exists todos_category_workspace_fk;
    if not exists(select 1 from pg_constraint where conname='todos_category_collection_fk') then
      alter table public.todos add constraint todos_category_collection_fk foreign key(category_id,collection_id)
        references public.categories(id,collection_id) on delete set null(category_id);
    end if;
  end if;
end;
$$;

alter table public.module_collections enable row level security;
alter table public.collection_members enable row level security;
alter table public.workspace_module_bindings enable row level security;
alter table public.collection_invites enable row level security;
alter table public.collection_activity enable row level security;
drop policy if exists collection_metadata on public.module_collections;
create policy collection_metadata on public.module_collections for select to authenticated using(public.collection_member(id));
drop policy if exists collection_members_read on public.collection_members;
create policy collection_members_read on public.collection_members for select to authenticated using(public.collection_member(collection_id));
drop policy if exists own_bindings on public.workspace_module_bindings;
create policy own_bindings on public.workspace_module_bindings for select to authenticated using(
  exists(select 1 from public.workspaces w where w.id=workspace_id and w.user_id=auth.uid()));
drop policy if exists own_invites on public.collection_invites;
create policy own_invites on public.collection_invites for select to authenticated using(public.collection_owner(collection_id));
drop policy if exists collection_activity_read on public.collection_activity;
create policy collection_activity_read on public.collection_activity for select to authenticated using(public.collection_access(collection_id));
revoke all on public.module_collections,public.collection_members,public.workspace_module_bindings,public.collection_invites,public.collection_activity from anon,authenticated;
grant select on public.module_collections,public.collection_members,public.workspace_module_bindings,public.collection_activity to authenticated;
-- The raw invite hash is not exposed through the REST API; details are projected via RPC.

create or replace function public.sharing_topic_access(topic text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare parts text[];
begin
  if topic='sharing-user:'||auth.uid()::text then return true; end if;
  parts := string_to_array(topic,':');
  if cardinality(parts)<>3 or parts[1]<>'collection' then return false; end if;
  return exists(select 1 from module_collections where id=parts[2]::uuid and epoch=parts[3]::integer and public.collection_access(id));
exception when invalid_text_representation then return false;
end;
$$;
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists tab_sharing_broadcast on realtime.messages';
    execute 'create policy tab_sharing_broadcast on realtime.messages for select to authenticated
      using(extension=''broadcast'' and public.sharing_topic_access(realtime.topic()))';
  end if;
end; $$;

-- Limit execution to the entry points and authorization helpers.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('collection_member','collection_access','collection_owner','collection_write',
      'ensure_module_bindings','sharing_context','create_collection_invite','preview_collection_invite','accept_collection_invite',
      'detach_collection','manage_collection','collection_details','sharing_notify','sharing_binding_changed',
      'sharing_collection_changed','guard_collection_record','collection_record_changed','sharing_topic_access') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.proname not in ('sharing_notify','sharing_binding_changed','sharing_collection_changed','guard_collection_record','collection_record_changed') then
      execute format('grant execute on function %s to authenticated',f.signature);
    end if;
  end loop;
end; $$;
commit;
