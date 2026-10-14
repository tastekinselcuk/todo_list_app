-- Existing installations: apply this file once after tab_sharing_vault.sql.
-- Adds reader invitations and strictly single-use tokens without changing existing notes.
begin;
alter table public.collection_members drop constraint if exists collection_members_role_check;
alter table public.collection_members add constraint collection_members_role_check check(role in ('owner','editor','viewer'));
alter table public.collection_invites add column if not exists invite_role text not null default 'editor';
alter table public.collection_invites alter column invite_role set default 'viewer';
alter table public.collection_invites drop constraint if exists collection_invites_invite_role_check;
alter table public.collection_invites add constraint collection_invites_invite_role_check check(invite_role in ('viewer','editor'));

create or replace function public.collection_write(cid uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.collection_access(cid) and exists(select 1 from public.collection_members
    where collection_id=cid and user_id=auth.uid() and role in ('owner','editor'));
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
    'timezone',to_jsonb(c)->>'timezone','permissions_ready',true
  ) order by b.module)
  from workspace_module_bindings b join module_collections c on c.id=b.collection_id
  join collection_members m on m.collection_id=c.id and m.user_id=auth.uid()
  join workspaces w on w.id=c.origin_workspace_id where b.workspace_id=wid),'[]'::jsonb);
end;
$$;
-- Remove the old overload: a legacy call without a role now gets the safer viewer default.
drop function if exists public.create_collection_invite(uuid,text);
create or replace function public.create_collection_invite(wid uuid, module_id text, invite_role text default 'viewer') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; token text; iid uuid;
begin
  if invite_role is null or invite_role not in ('viewer','editor') then raise exception 'INVALID_ROLE'; end if;
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
  insert into collection_invites(collection_id,token_hash,created_by,invite_role)
    values(cid,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid(),invite_role) returning id into iid;
  update module_collections set shared=true where id=cid;
  return jsonb_build_object('id',iid,'token',token,'expires_at',now()+interval '7 days','invite_role',invite_role);
end;
$$;
create or replace function public.preview_collection_invite(invite_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare inv collection_invites; result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITE_INVALID'; end if;
  select * into inv from collection_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex');
  if inv.id is null then raise exception 'INVITE_INVALID'; end if;
  if inv.revoked_at is not null then raise exception 'INVITE_REVOKED'; end if;
  if inv.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if inv.used_at is not null or inv.used_by is not null then raise exception 'INVITE_USED'; end if;
  select jsonb_build_object('collection_id',c.id,'module',c.module,'name',w.name,
    'owner_label',coalesce(nullif(split_part(u.email,'@',1),''),'Owner'),
    'expires_at',inv.expires_at,'already_member',public.collection_member(c.id),'invite_role',inv.invite_role) into result
    from module_collections c join workspaces w on w.id=c.origin_workspace_id
    join auth.users u on u.id=c.owner_id where c.id=inv.collection_id;
  return result;
end;
$$;
create or replace function public.accept_collection_invite(invite_token text,wid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare inv collection_invites; c module_collections;
begin
  if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITE_INVALID'; end if;
  perform public.ensure_module_bindings(wid);
  select * into inv from collection_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex');
  if inv.id is null then raise exception 'INVITE_INVALID'; end if;
  select * into c from module_collections where id=inv.collection_id for update;
  select * into inv from collection_invites where id=inv.id for update;
  perform public.preview_collection_invite(invite_token);
  if exists(select 1 from workspace_module_bindings where workspace_id=wid and module=c.module
    and collection_id<>personal_collection_id and collection_id<>c.id) then raise exception 'ALREADY_SHARED'; end if;
  if exists(select 1 from collection_members where collection_id=c.id and user_id=auth.uid()
    and role<>'owner' and role<>inv.invite_role) then raise exception 'ALREADY_MEMBER'; end if;
  insert into collection_members(collection_id,user_id,role) values(c.id,auth.uid(),
    case when c.owner_id=auth.uid() then 'owner' else inv.invite_role end) on conflict do nothing;
  update workspace_module_bindings set collection_id=c.id where workspace_id=wid and module=c.module;
  update workspaces set active_modules=array(select distinct unnest(active_modules || array[c.module])) where id=wid;
  update collection_invites set used_by=auth.uid(),used_at=now() where id=inv.id;
  return public.sharing_context(wid);
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
      'id',id,'expires_at',expires_at,'used_at',used_at,'revoked_at',revoked_at,'invite_role',invite_role) order by created_at desc),'[]'::jsonb)
      from collection_invites where collection_id=cid and expires_at>now()) else '[]'::jsonb end
  );
end;
$$;

-- Patch the write checks in installed SECURITY DEFINER functions as well as RLS.
-- Reads, reminder delivery state and personal workspace bindings remain available to viewers.
do $$ declare f record; definition text; begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('guard_collection_record','mutate_collection_item','rollover_collection_plans','seal_vault') loop
    definition:=pg_get_functiondef(f.oid);
    execute replace(definition,'public.collection_access(','public.collection_write(');
  end loop;
end; $$;
do $$ declare t text; p record; begin
  foreach t in array array['quick_notes','code_snippets','categories','todos','activity_items','plans','learning_subjects','flashcard_decks','workout_routines','periodic_tasks','password_sessions','secure_notes'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy collection_read on public.%I for select to authenticated using(public.collection_access(collection_id))',t);
    execute format('create policy collection_insert on public.%I for insert to authenticated with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_update on public.%I for update to authenticated using(public.collection_write(collection_id)) with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_delete on public.%I for delete to authenticated using(public.collection_write(collection_id))',t);
  end loop;
end; $$;
revoke all on function public.collection_write(uuid),public.create_collection_invite(uuid,text,text),
  public.sharing_context(uuid),public.preview_collection_invite(text),public.accept_collection_invite(text,uuid),public.collection_details(uuid)
  from public,anon,authenticated;
grant execute on function public.collection_write(uuid),public.create_collection_invite(uuid,text,text),
  public.sharing_context(uuid),public.preview_collection_invite(text),public.accept_collection_invite(text,uuid),public.collection_details(uuid)
  to authenticated;
notify pgrst, 'reload schema';
commit;
