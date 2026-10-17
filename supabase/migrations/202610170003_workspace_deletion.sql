-- Apply after the workspace, sharing and optional workspace-trash migrations.
begin;

create or replace function public.delete_workspace(wid uuid, expected_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 uid uuid:=auth.uid(); target workspaces; replacement workspaces;
 owned uuid[]; external_ids uuid[]; t text; previous_trash_flag text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 perform pg_advisory_xact_lock(hashtext(wid::text));
 select * into target from workspaces where id=wid and user_id=uid for update;
 if target.id is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501';end if;
 if expected_name is null or target.name<>expected_name then raise exception 'WORKSPACE_CHANGED';end if;
 select * into replacement from workspaces where user_id=uid and id<>wid and archived_at is null
 order by is_default desc,created_at,id limit 1;
 if replacement.id is null then raise exception 'LAST_WORKSPACE';end if;

 -- Serializes invite acceptance and collection writes before checking shared references.
 perform 1 from module_collections where origin_workspace_id=wid or id in
  (select collection_id from workspace_module_bindings where workspace_id=wid) order by id for update;
 select coalesce(array_agg(id),'{}'::uuid[]) into owned from module_collections where origin_workspace_id=wid and owner_id=uid;
 if exists(select 1 from module_collections where origin_workspace_id=wid and owner_id<>uid)
  or exists(select 1 from workspace_module_bindings where workspace_id<>wid
   and (collection_id=any(owned) or personal_collection_id=any(owned))) then
  raise exception 'WORKSPACE_SHARED';
 end if;
 if to_regclass('public.focus_ownership') is not null then
  if exists(select 1 from analytics_focus_sessions s join focus_ownership f on f.session_id=s.id
   where s.workspace_id=wid and s.status in ('running','paused') and f.expires_at>clock_timestamp()) then
   raise exception 'WORKSPACE_FOCUS_ACTIVE';
  end if;
 end if;
 select coalesce(array_agg(distinct collection_id),'{}'::uuid[]) into external_ids
 from workspace_module_bindings where workspace_id=wid and not(collection_id=any(owned));

 -- Queue note images for the existing reference-aware Storage cleanup worker.
 if to_regclass('public.trash_image_cleanup') is not null then
  insert into trash_image_cleanup(path)
   select distinct match[1] from todos n cross join lateral regexp_matches(coalesce(n.description,''),'data-note-image="([^"]+)"','g') match
   where n.collection_id=any(owned) and match[1] ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png|jpg|jpeg|gif)$'
    and split_part(match[1],'/',1)=n.collection_id::text
   on conflict(path) do update set queued_at=clock_timestamp();
 end if;
 previous_trash_flag:=coalesce(current_setting('app.trash_write',true),'off');
 perform set_config('app.trash_write','on',true);
 -- Delete records while their collections still exist: audit/FK triggers can finish normally.
 foreach t in array array['todos','quick_notes','plans','code_snippets','pomo_tasks',
  'learning_subjects','flashcard_decks','workout_routines','periodic_tasks','activity_items',
  'secure_notes','password_sessions','categories','pomodoro_history'] loop
  if to_regclass('public.'||t) is null then continue;end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='collection_id') then
   execute format('delete from public.%I where collection_id=any($1)',t) using owned;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='workspace_id') then
   execute format('delete from public.%I where workspace_id=$1',t) using wid;
  end if;
 end loop;
 perform set_config('app.trash_write',previous_trash_flag,true);
 delete from workspace_module_bindings where workspace_id=wid;
 -- Leaving another person's shared tab never deletes that collection or its notes.
 delete from collection_members m where m.collection_id=any(external_ids) and m.user_id=uid
  and not exists(select 1 from module_collections c where c.id=m.collection_id and c.owner_id=uid)
  and not exists(select 1 from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
   where b.collection_id=m.collection_id and w.user_id=uid);
 delete from collection_activity where collection_id=any(owned);
 delete from module_collections where id=any(owned);
 if target.is_default then
  update workspaces set is_default=false where id=wid;
  update workspaces set is_default=true where id=replacement.id returning * into replacement;
 end if;
 delete from workspaces where id=wid and user_id=uid;
 perform public.sharing_notify('sharing-user:'||uid::text,jsonb_build_object('workspace_id',wid,'operation','workspace_deleted'));
 return jsonb_build_object('id',wid,'next_workspace',to_jsonb(replacement));
end $$;

revoke all on function public.delete_workspace(uuid,text) from public,anon;
grant execute on function public.delete_workspace(uuid,text) to authenticated;
-- Direct client DELETE remains unavailable; all deletion passes the ownership/last-workspace checks above.
revoke delete on public.workspaces from authenticated,anon;
commit;
