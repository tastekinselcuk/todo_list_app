-- V2 client-side encryption, explicit acknowledgement, owner-only email step-up.
-- No existing vault content is read, decrypted or rewritten by this migration.
begin;
create table if not exists public.vault_acknowledgements (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_version text not null check(notice_version='2026-11-11'),
  accepted_at timestamptz not null default now(), primary key(user_id,notice_version)
);
alter table public.vault_acknowledgements enable row level security;
revoke all on public.vault_acknowledgements from public,anon,authenticated;
grant select on public.vault_acknowledgements to authenticated;
drop policy if exists own_ack on public.vault_acknowledgements;
create policy own_ack on public.vault_acknowledgements for select to authenticated using(user_id=auth.uid());
create or replace function public.vault_acknowledge() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into vault_acknowledgements(user_id,notice_version) values(auth.uid(),'2026-11-11') on conflict do nothing;
end; $$;
create or replace function public.vault_acknowledged(uid uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from vault_acknowledgements where user_id=uid and notice_version='2026-11-11');
$$;
create or replace function public.vault_envelope_valid(e jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if pg_column_size(e)>1400000 then return false; end if;
  return coalesce((e->>'v')::int=1 and length(decode(e->>'iv','base64'))=12 and length(decode(e->>'ciphertext','base64')) between 16 and 1000000,false);
exception when others then return false; end; $$;
create or replace function public.vault_metadata_valid(value text) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare m jsonb; begin
  if length(value)>8192 then return false; end if;
  m:=value::jsonb;
  if m->>'format'='todo-vault-v1' then
    return coalesce((m->>'iterations')::int between 310000 and 2000000 and length(decode(m->>'salt','base64'))=16 and public.vault_envelope_valid(m->'verifier'),false);
  end if;
  return coalesce(m->>'format'='todo-vault-v2' and length(decode(m->>'key_id','base64'))=16
    and (m->'kdf'->>'iterations')::int between 600000 and 2000000 and length(decode(m->'kdf'->>'salt','base64'))=16
    and public.vault_envelope_valid(m->'password') and public.vault_envelope_valid(m->'recovery'->'wrapped')
    and length(decode(m->'recovery'->>'salt','base64'))=16,false);
exception when others then return false; end; $$;
alter table public.secure_notes add column if not exists deleted_at timestamptz;
create table if not exists public.vault_note_history (
  id uuid primary key default gen_random_uuid(), note_id uuid not null references public.secure_notes(id) on delete cascade,
  collection_id uuid not null references public.module_collections(id) on delete cascade,
  encrypted_payload jsonb not null, saved_at timestamptz not null default now()
);
create index if not exists vault_note_history_note on public.vault_note_history(note_id,saved_at desc);
alter table public.vault_note_history enable row level security;
revoke all on public.vault_note_history from public,anon,authenticated;
grant select on public.vault_note_history to authenticated;
drop policy if exists accessible_history on public.vault_note_history;
create policy accessible_history on public.vault_note_history for select to authenticated using(public.collection_access(collection_id) and public.vault_acknowledged(auth.uid()));
create table if not exists public.vault_security_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  vault_id uuid not null, action text not null, created_at timestamptz not null default now()
);
alter table public.vault_security_events enable row level security;
revoke all on public.vault_security_events from public,anon,authenticated;
grant select on public.vault_security_events to authenticated;
drop policy if exists own_security_events on public.vault_security_events;
create policy own_security_events on public.vault_security_events for select to authenticated using(user_id=auth.uid());
create table if not exists public.vault_security_challenges (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, vault_id uuid not null,
  action text not null check(action in ('password','recover','reset','delete')), session_id text not null,
  email_hash text not null, code_hash text not null, expected_version int not null,
  payload jsonb not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
  attempts int not null default 0, consumed_at timestamptz
);
create index if not exists vault_challenges_user on public.vault_security_challenges(user_id,created_at desc);
alter table public.vault_security_challenges enable row level security;
revoke all on public.vault_security_challenges from public,anon,authenticated;

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
    sealed:=found; key_id:=case when m->>'format'='todo-vault-v2' then m->>'key_id' else m->>'salt' end;
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
drop trigger if exists z_guard_vault_delete on public.password_sessions;
create trigger z_guard_vault_delete before delete on public.password_sessions for each row execute function public.guard_vault_ciphertext();
drop trigger if exists z_guard_vault_delete on public.secure_notes;
create trigger z_guard_vault_delete before delete on public.secure_notes for each row execute function public.guard_vault_ciphertext();
-- Replacing an already-v2 key requires email step-up. The legacy upgrade is atomic and owner-only.
create or replace function public.seal_vault(sid uuid,previous_hash text,metadata text,notes jsonb,expected_version int,new_name text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s record; n record; supplied jsonb; h jsonb; begin
  select * into s from password_sessions where id=sid for update;
  if not found or not public.collection_owner(s.collection_id) then raise exception 'OWNER_REQUIRED'; end if;
  if not public.vault_acknowledged(auth.uid()) then raise exception 'VAULT_ACK_REQUIRED'; end if;
  if s.password_hash is distinct from previous_hash or s.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  if public.vault_metadata_valid(s.password_hash) and s.password_hash::jsonb->>'format'='todo-vault-v2' then raise exception 'VAULT_EMAIL_REQUIRED'; end if;
  if not public.vault_metadata_valid(metadata) or metadata::jsonb->>'format'<>'todo-vault-v2' or jsonb_typeof(notes)<>'array' then raise exception 'VAULT_INVALID_DATA'; end if;
  perform 1 from secure_notes where session_id=sid order by id for update;
  if jsonb_array_length(notes)<>(select count(*) from secure_notes where session_id=sid) or (select count(distinct value->>'id') from jsonb_array_elements(notes))<>jsonb_array_length(notes) then raise exception 'SHARING_CONFLICT'; end if;
  perform set_config('app.vault_admin','on',true);
  update password_sessions set password_hash=metadata,name=coalesce(nullif(trim(new_name),''),s.name) where id=sid returning * into s;
  for n in select * from secure_notes where session_id=sid order by id loop
    select value into supplied from jsonb_array_elements(notes) where value->>'id'=n.id::text;
    if supplied is null or (supplied->>'version')::int is distinct from n.version then raise exception 'SHARING_CONFLICT'; end if;
    perform 1 from vault_note_history where note_id=n.id for update;
    if jsonb_typeof(coalesce(supplied->'history','[]'))<>'array'
      or jsonb_array_length(coalesce(supplied->'history','[]'))<>(select count(*) from vault_note_history where note_id=n.id)
      or (select count(distinct value->>'id') from jsonb_array_elements(coalesce(supplied->'history','[]')))<>jsonb_array_length(coalesce(supplied->'history','[]')) then raise exception 'SHARING_CONFLICT'; end if;
    for h in select value from jsonb_array_elements(coalesce(supplied->'history','[]')) loop
      if not public.vault_envelope_valid(h->'encrypted_payload') or h->'encrypted_payload'->>'key_id' is distinct from metadata::jsonb->>'key_id' then raise exception 'VAULT_INVALID_DATA'; end if;
      update vault_note_history set encrypted_payload=h->'encrypted_payload' where id=(h->>'id')::uuid and note_id=n.id;
      if not found then raise exception 'SHARING_CONFLICT'; end if;
    end loop;
    update secure_notes set encrypted_payload=supplied->'encrypted_payload' where id=n.id;
  end loop;
  perform set_config('app.vault_admin','off',true);
  insert into vault_security_events(user_id,vault_id,action) values(auth.uid(),sid,'upgrade');
  return to_jsonb(s);
end; $$;
create or replace function public.vault_record_action(nid uuid,expected_version int,operation text,hid uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare n record; sid uuid; payload jsonb; begin
  select session_id into sid from secure_notes where id=nid;
  perform 1 from password_sessions where id=sid for update;
  select * into n from secure_notes where id=nid for update;
  if not found or not public.collection_write(n.collection_id) or not public.vault_acknowledged(auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  if n.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  perform set_config('app.vault_record','on',true);
  if operation='trash' then update secure_notes set deleted_at=now() where id=nid;
  elsif operation='restore' and n.deleted_at>now()-interval '30 days' then update secure_notes set deleted_at=null where id=nid;
  elsif operation='history' and n.deleted_at is null then
    select encrypted_payload into payload from vault_note_history where id=hid and note_id=nid;
    if payload is null then raise exception 'VAULT_INVALID_DATA'; end if;
    update secure_notes set encrypted_payload=payload where id=nid;
  else raise exception 'VAULT_INVALID_DATA'; end if;
  perform set_config('app.vault_record','off',true);
end; $$;

-- Service-role only. The Edge Function verifies JWT, verified email, MFA and OTP HMAC.
create or replace function public.vault_challenge_start(uid uuid,sid uuid,challenge uuid,operation text,jwt_session text,mail_hash text,otp_hash text,expected_version int,prepared jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s record; begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,891));
  if not exists(select 1 from auth.sessions where id=jwt_session::uuid and user_id=uid) then raise exception 'ACCESS_DENIED'; end if;
  select * into s from password_sessions where id=sid for update;
  if not found or not exists(select 1 from module_collections owned join collection_members cm on cm.collection_id=owned.id and cm.user_id=uid and cm.role='owner' join workspace_module_bindings b on b.collection_id=owned.id join workspaces w on w.id=b.workspace_id and w.user_id=uid and w.archived_at is null where owned.id=s.collection_id and owned.owner_id=uid) or not public.vault_acknowledged(uid) then raise exception 'ACCESS_DENIED'; end if;
  if s.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  if operation not in ('password','recover','reset','delete') or length(jwt_session)>100 or jwt_session='' or length(otp_hash)<>64 or length(mail_hash)<>64 or pg_column_size(prepared)>20000 then raise exception 'VAULT_INVALID_DATA'; end if;
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
  if not found or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 or c.session_id<>jwt_session or c.email_hash<>mail_hash then return jsonb_build_object('error','INVALID_CODE'); end if;
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
    if c.action='reset' then delete from secure_notes where session_id=s.id; end if;
    update password_sessions set password_hash=c.payload->>'metadata' where id=s.id returning * into s;
  end if;
  insert into vault_security_events(user_id,vault_id,action) values(uid,c.vault_id,c.action);
  perform set_config('app.vault_admin','off',true);
  return jsonb_build_object('ok',true);
end; $$;
create or replace function public.vault_import(wid uuid,new_name text,metadata text,notes jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid; sid uuid; n jsonb; begin
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='secure';
  if not public.collection_owner(cid) or not public.collection_write(cid) or not public.vault_acknowledged(auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  if not public.vault_metadata_valid(metadata) or metadata::jsonb->>'format'<>'todo-vault-v2' or length(trim(new_name)) not between 1 and 100 or jsonb_typeof(notes)<>'array' or jsonb_array_length(notes)>10000 or pg_column_size(notes)>10000000 then raise exception 'VAULT_INVALID_DATA'; end if;
  -- The caller selects fresh UUIDs before binding the ciphertext to those IDs.
  sid:=(notes->0->>'session_id')::uuid;
  if sid is null then sid:=gen_random_uuid(); end if;
  insert into password_sessions(id,workspace_id,collection_id,created_by,name,password_hash) values(sid,wid,cid,auth.uid(),trim(new_name),metadata);
  for n in select value from jsonb_array_elements(notes) loop
    if (n->>'session_id')::uuid<>sid then raise exception 'VAULT_INVALID_DATA'; end if;
    insert into secure_notes(id,workspace_id,collection_id,created_by,session_id,title,type,encrypted_payload) values((n->>'id')::uuid,wid,cid,auth.uid(),sid,'Encrypted note','secret',n->'encrypted_payload');
  end loop;
  return sid;
end; $$;
revoke all on function public.vault_import(uuid,text,text,jsonb) from public,anon;
grant execute on function public.vault_import(uuid,text,text,jsonb) to authenticated;
create table if not exists public.vault_security_budgets(user_id uuid primary key references auth.users(id) on delete cascade,started_at timestamptz not null default now(),requests int not null default 0);
alter table public.vault_security_budgets enable row level security;
revoke all on public.vault_security_budgets from public,anon,authenticated;
create or replace function public.vault_security_budget(uid uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed boolean; begin
  insert into vault_security_budgets(user_id,requests) values(uid,1) on conflict(user_id) do update set
    requests=case when vault_security_budgets.started_at<now()-interval '1 minute' then 1 else vault_security_budgets.requests+1 end,
    started_at=case when vault_security_budgets.started_at<now()-interval '1 minute' then now() else vault_security_budgets.started_at end returning requests<=30 into allowed;
  return allowed;
end; $$;
create or replace function public.vault_challenge_cancel(uid uuid,challenge uuid) returns void language sql security definer set search_path=public,pg_temp as $$
  update vault_security_challenges set consumed_at=now() where id=challenge and user_id=uid;
$$;
revoke all on function public.vault_security_budget(uuid),public.vault_challenge_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vault_security_budget(uuid),public.vault_challenge_cancel(uuid,uuid) to service_role;
create or replace function public.vault_cleanup(batch_size int default 200) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare removed int; begin
  if batch_size not between 1 and 1000 then raise exception 'INVALID_INPUT'; end if;
  perform set_config('app.vault_admin','on',true);
  delete from secure_notes where id in (select id from secure_notes where deleted_at<now()-interval '30 days' order by deleted_at limit batch_size for update skip locked);
  get diagnostics removed=row_count;
  delete from vault_security_challenges where created_at<now()-interval '1 day';
  delete from vault_security_events where created_at<now()-interval '180 days';
  perform set_config('app.vault_admin','off',true);
  return removed;
end; $$;
revoke all on function public.vault_cleanup(int) from public,anon,authenticated;
grant execute on function public.vault_cleanup(int) to service_role;
do $$ begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('vault-retention','23 * * * *','select public.vault_cleanup(200)');
  end if;
end; $$;
revoke all on function public.vault_acknowledge(),public.vault_acknowledged(uuid),public.vault_envelope_valid(jsonb),public.vault_record_action(uuid,int,text,uuid),public.vault_challenge_start(uuid,uuid,uuid,text,text,text,text,int,jsonb),public.vault_challenge_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vault_acknowledge(),public.vault_acknowledged(uuid),public.vault_record_action(uuid,int,text,uuid) to authenticated;
grant execute on function public.vault_challenge_start(uuid,uuid,uuid,text,text,text,text,int,jsonb),public.vault_challenge_finish(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
