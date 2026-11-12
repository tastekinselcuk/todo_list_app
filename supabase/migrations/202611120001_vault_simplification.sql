-- Retire destructive in-place resets and reject new plaintext writes to legacy vaults.
-- Existing vault contents remain unchanged; owners upgrade them after unlocking.
begin;
update public.vault_security_challenges set consumed_at=now() where action='reset' and consumed_at is null;
alter table public.vault_security_challenges drop constraint if exists vault_challenge_active_action_check;
alter table public.vault_security_challenges add constraint vault_challenge_active_action_check check(action<>'reset' or consumed_at is not null);
create or replace function public.guard_vault_ciphertext() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare sealed boolean; shared_collection boolean; key_id text; m jsonb; approved boolean:=coalesce(current_setting('app.vault_admin',true),'')='on'; begin
  if auth.uid() is not null and not public.vault_acknowledged(auth.uid()) then raise exception 'VAULT_ACK_REQUIRED'; end if;
  if tg_op='DELETE' then
    if not approved then raise exception 'VAULT_EMAIL_REQUIRED'; end if;
    return old;
  end if;
  select shared into shared_collection from module_collections where id=new.collection_id;
  if tg_table_name='password_sessions' then
    if tg_op='INSERT' and not public.collection_owner(new.collection_id) then raise exception 'OWNER_REQUIRED'; end if;
    if tg_op='UPDATE' and new.password_hash is distinct from old.password_hash and not approved then raise exception 'VAULT_EMAIL_REQUIRED'; end if;
    if (tg_op='INSERT' or shared_collection or (tg_op='UPDATE' and public.vault_metadata_valid(old.password_hash))) and not public.vault_metadata_valid(new.password_hash) then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
    if tg_op='INSERT' and new.password_hash::jsonb->>'format'<>'todo-vault-v2' then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
  else
    if tg_op='UPDATE' and new.session_id is distinct from old.session_id then raise exception 'OWNERSHIP_IMMUTABLE'; end if;
    if tg_op='INSERT' and new.deleted_at is not null then raise exception 'VAULT_INVALID_DATA'; end if;
    select password_hash::jsonb into m from password_sessions where id=new.session_id and public.vault_metadata_valid(password_hash) for update;
    sealed:=found;
    if not sealed then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
    key_id:=case when m->>'format'='todo-vault-v2' then m->>'key_id' else m->>'salt' end;
    if tg_op='UPDATE' and new.deleted_at is distinct from old.deleted_at and coalesce(current_setting('app.vault_record',true),'')<>'on' and not approved then raise exception 'VAULT_RECORD_ACTION_REQUIRED'; end if;
    if sealed or shared_collection or new.encrypted_payload is not null then
      if not public.vault_envelope_valid(new.encrypted_payload) then raise exception 'VAULT_INVALID_DATA'; end if;
      if sealed and new.encrypted_payload->>'key_id' is distinct from key_id then raise exception 'SHARING_CONFLICT'; end if;
      new.title:='Encrypted note'; new.description:=null; new.type:='secret'; new.username:=null; new.password_encrypted:=null; new.url:=null; new.content:=null;
      if tg_op='UPDATE' and old.encrypted_payload is not null and old.encrypted_payload is distinct from new.encrypted_payload and old.encrypted_payload->>'key_id'=key_id then
        insert into vault_note_history(note_id,collection_id,encrypted_payload) values(old.id,old.collection_id,old.encrypted_payload);
        delete from vault_note_history where note_id=old.id and id in (select id from vault_note_history where note_id=old.id order by saved_at desc,id desc offset 10);
      end if;
    end if;
  end if;
  return new;
end; $$;
create or replace function public.vault_challenge_start(uid uuid,sid uuid,challenge uuid,operation text,jwt_session text,mail_hash text,otp_hash text,expected_version int,prepared jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s record; begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,891));
  if not exists(select 1 from auth.sessions where id=jwt_session::uuid and user_id=uid) then raise exception 'ACCESS_DENIED'; end if;
  select * into s from password_sessions where id=sid for update;
  if not found or not exists(select 1 from module_collections owned join collection_members cm on cm.collection_id=owned.id and cm.user_id=uid and cm.role='owner' join workspace_module_bindings b on b.collection_id=owned.id join workspaces w on w.id=b.workspace_id and w.user_id=uid and w.archived_at is null where owned.id=s.collection_id and owned.owner_id=uid) or not public.vault_acknowledged(uid) then raise exception 'ACCESS_DENIED'; end if;
  if s.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  if operation not in ('password','recover','delete') or length(jwt_session)>100 or jwt_session='' or length(otp_hash)<>64 or length(mail_hash)<>64 or pg_column_size(prepared)>20000 then raise exception 'VAULT_INVALID_DATA'; end if;
  if operation<>'delete' and (not public.vault_metadata_valid(prepared->>'metadata') or (prepared->>'metadata')::jsonb->>'format'<>'todo-vault-v2') then raise exception 'VAULT_INVALID_DATA'; end if;
  if operation in ('password','recover') and (not public.vault_metadata_valid(s.password_hash) or s.password_hash::jsonb->>'key_id' is distinct from (prepared->>'metadata')::jsonb->>'key_id') then raise exception 'VAULT_INVALID_DATA'; end if;
  if exists(select 1 from vault_security_challenges where user_id=uid and created_at>now()-interval '60 seconds') or (select count(*) from vault_security_challenges where user_id=uid and created_at>now()-interval '15 minutes')>=3 then raise exception 'RATE_LIMITED'; end if;
  update vault_security_challenges set consumed_at=now() where user_id=uid and consumed_at is null;
  insert into vault_security_challenges(id,user_id,vault_id,action,session_id,email_hash,code_hash,expected_version,payload) values(challenge,uid,sid,operation,jwt_session,mail_hash,otp_hash,expected_version,prepared);
  delete from vault_security_challenges where created_at<now()-interval '1 day';
end; $$;
create or replace function public.vault_challenge_finish(uid uuid,challenge uuid,jwt_session text,mail_hash text,otp_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; s record; begin
  select * into c from vault_security_challenges where id=challenge and user_id=uid for update;
  if not found or c.action not in ('password','recover','delete') or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 or c.session_id<>jwt_session or c.email_hash<>mail_hash then return jsonb_build_object('error','INVALID_CODE'); end if;
  if not exists(select 1 from auth.sessions where id=jwt_session::uuid and user_id=uid) then return jsonb_build_object('error','ACCESS_DENIED'); end if;
  update vault_security_challenges set attempts=attempts+1 where id=challenge;
  if c.code_hash<>otp_hash then return jsonb_build_object('error','INVALID_CODE'); end if;
  select * into s from password_sessions where id=c.vault_id for update;
  if not found or not exists(select 1 from module_collections owned join collection_members cm on cm.collection_id=owned.id and cm.user_id=uid and cm.role='owner' join workspace_module_bindings b on b.collection_id=owned.id join workspaces w on w.id=b.workspace_id and w.user_id=uid and w.archived_at is null where owned.id=s.collection_id and owned.owner_id=uid) or not public.vault_acknowledged(uid) then return jsonb_build_object('error','ACCESS_DENIED'); end if;
  update vault_security_challenges set consumed_at=now() where id=challenge;
  if s.version<>c.expected_version then return jsonb_build_object('error','SHARING_CONFLICT'); end if;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid)::text,true);
  perform set_config('app.vault_admin','on',true);
  if c.action='delete' then delete from password_sessions where id=s.id;
  else
    update password_sessions set password_hash=c.payload->>'metadata' where id=s.id returning * into s;
  end if;
  insert into vault_security_events(user_id,vault_id,action) values(uid,c.vault_id,c.action);
  perform set_config('app.vault_admin','off',true);
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.guard_vault_ciphertext(),public.vault_challenge_start(uuid,uuid,uuid,text,text,text,text,int,jsonb),public.vault_challenge_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vault_challenge_start(uuid,uuid,uuid,text,text,text,text,int,jsonb),public.vault_challenge_finish(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
