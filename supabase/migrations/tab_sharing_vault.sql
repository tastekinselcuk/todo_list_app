-- Apply after tab_sharing.sql and tab_sharing_modules.sql.
-- Legacy vaults remain private until the owner unlocks and encrypts every vault.
begin;
alter table public.module_collections drop constraint if exists module_collections_module_check;
alter table public.module_collections add constraint module_collections_module_check
  check(module in ('quick','code','detailed','activities','plans','learning','flashcards','workout','periodic','secure'));

create or replace function public.ensure_module_bindings(wid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare m text; cid uuid; uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  perform pg_advisory_xact_lock(hashtext(wid::text));
  foreach m in array array['quick','code','detailed','activities','plans','learning','flashcards','workout','periodic','secure'] loop
    if not exists(select 1 from workspace_module_bindings where workspace_id=wid and module=m) then
      insert into module_collections(module,owner_id,origin_workspace_id) values(m,uid,wid) returning id into cid;
      insert into collection_members(collection_id,user_id,role) values(cid,uid,'owner');
      insert into workspace_module_bindings values(wid,m,cid,cid);
    end if;
  end loop;
end; $$;
do $$ declare w record; cid uuid; begin
  for w in select * from workspaces loop
    if not exists(select 1 from workspace_module_bindings where workspace_id=w.id and module='secure') then
      insert into module_collections(module,owner_id,origin_workspace_id) values('secure',w.user_id,w.id) returning id into cid;
      insert into collection_members values(cid,w.user_id,'owner',now());
      insert into workspace_module_bindings values(w.id,'secure',cid,cid);
    end if;
  end loop;
end; $$;

alter table public.secure_notes add column if not exists encrypted_payload jsonb;
do $$ declare t text; p record; begin
  foreach t in array array['password_sessions','secure_notes'] loop
    execute format('alter table public.%I add column if not exists collection_id uuid references public.module_collections(id)',t);
    execute format('alter table public.%I add column if not exists version integer not null default 1',t);
    execute format('update public.%I r set collection_id=b.personal_collection_id from workspace_module_bindings b
      where b.workspace_id=r.workspace_id and b.module=''secure'' and r.collection_id is null',t);
    execute format('alter table public.%I alter column collection_id set not null',t);
    execute format('alter table public.%I drop constraint if exists %I',t,t||'_workspace_owner_fk');
    execute format('create index if not exists %I on public.%I(collection_id,created_at)',t||'_collection_idx',t);
    execute format('create unique index if not exists %I on public.%I(id,collection_id)',t||'_id_collection_idx',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy collection_read on public.%I for select to authenticated using(public.collection_access(collection_id))',t);
    execute format('create policy collection_insert on public.%I for insert to authenticated with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_update on public.%I for update to authenticated using(public.collection_write(collection_id)) with check(public.collection_write(collection_id))',t);
    execute format('create policy collection_delete on public.%I for delete to authenticated using(public.collection_write(collection_id))',t);
    execute format('drop trigger if exists guard_collection_record on public.%I',t);
    execute format('create trigger guard_collection_record before insert or update on public.%I
      for each row execute function guard_collection_record(''secure'',''created_by'')',t);
    execute format('drop trigger if exists collection_record_changed on public.%I',t);
    execute format('create trigger collection_record_changed after insert or update or delete on public.%I
      for each row execute function collection_record_changed()',t);
  end loop;
end; $$;
alter table public.secure_notes drop constraint if exists secure_notes_session_workspace_fk;
alter table public.secure_notes drop constraint if exists secure_notes_session_collection_fk;
alter table public.secure_notes add constraint secure_notes_session_collection_fk
  foreign key(session_id,collection_id) references public.password_sessions(id,collection_id) on delete cascade;

create or replace function public.vault_metadata_valid(value text) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare m jsonb; begin
  m:=value::jsonb;
  return coalesce(m->>'format'='todo-vault-v1' and (m->>'iterations')::int between 310000 and 2000000
    and length(decode(m->>'salt','base64'))=16 and (m->'verifier'->>'v')::int=1
    and length(decode(m->'verifier'->>'iv','base64'))=12 and length(decode(m->'verifier'->>'ciphertext','base64'))>=16,false);
exception when others then return false; end; $$;
create or replace function public.vault_collection_ready(cid uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from password_sessions where collection_id=cid and not public.vault_metadata_valid(password_hash))
    and not exists(select 1 from secure_notes where collection_id=cid and encrypted_payload is null);
$$;
create or replace function public.guard_vault_ciphertext() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare sealed boolean; shared_collection boolean; key_id text; begin
  select shared into shared_collection from module_collections where id=new.collection_id;
  if tg_table_name='password_sessions' then
    if (tg_op='INSERT' or shared_collection or (tg_op='UPDATE' and public.vault_metadata_valid(old.password_hash)))
      and not public.vault_metadata_valid(new.password_hash) then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
  else
    select public.vault_metadata_valid(password_hash),case when public.vault_metadata_valid(password_hash) then password_hash::jsonb->>'salt' end
      into sealed,key_id from password_sessions where id=new.session_id for key share;
    if sealed or shared_collection or new.encrypted_payload is not null then
      if new.encrypted_payload is null or coalesce((new.encrypted_payload->>'v')::int,0)<>1
        or coalesce(length(decode(new.encrypted_payload->>'iv','base64')),0)<>12
        or coalesce(length(decode(new.encrypted_payload->>'ciphertext','base64')),0)<16 then raise exception 'VAULT_INVALID_DATA'; end if;
      if sealed and new.encrypted_payload->>'key_id' is distinct from key_id then raise exception 'SHARING_CONFLICT'; end if;
      -- Sensitive fields exist only inside the authenticated ciphertext.
      new.title:='Encrypted note'; new.description:=null; new.type:='secret'; new.username:=null;
      new.password_encrypted:=null; new.url:=null; new.content:=null;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists z_guard_vault_ciphertext on public.password_sessions;
create trigger z_guard_vault_ciphertext before insert or update on public.password_sessions for each row execute function public.guard_vault_ciphertext();
drop trigger if exists z_guard_vault_ciphertext on public.secure_notes;
create trigger z_guard_vault_ciphertext before insert or update on public.secure_notes for each row execute function public.guard_vault_ciphertext();

create or replace function public.seal_vault(sid uuid,previous_hash text,metadata text,notes jsonb,expected_version int,new_name text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s record; n record; supplied jsonb; begin
  select * into s from password_sessions where id=sid for update;
  if not found or not public.collection_write(s.collection_id) then raise exception 'ACCESS_DENIED'; end if;
  if s.password_hash is distinct from previous_hash or s.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  if not public.vault_metadata_valid(metadata) or jsonb_typeof(notes)<>'array' then raise exception 'VAULT_INVALID_DATA'; end if;
  -- Lock all existing notes and validate the complete set before changing anything.
  perform 1 from secure_notes where session_id=sid order by id for update;
  if jsonb_array_length(notes)<>(select count(*) from secure_notes where session_id=sid)
    or (select count(distinct value->>'id') from jsonb_array_elements(notes))<>jsonb_array_length(notes) then raise exception 'SHARING_CONFLICT'; end if;
  update password_sessions set password_hash=metadata,name=coalesce(nullif(trim(new_name),''),s.name) where id=sid returning * into s;
  for n in select * from secure_notes where session_id=sid order by id loop
    select value into supplied from jsonb_array_elements(notes) where value->>'id'=n.id::text;
    if supplied is null or (supplied->>'version')::int is distinct from n.version then raise exception 'SHARING_CONFLICT'; end if;
    update secure_notes set encrypted_payload=supplied->'encrypted_payload' where id=n.id;
  end loop;
  return to_jsonb(s);
end; $$;
revoke all on function public.vault_metadata_valid(text),public.vault_collection_ready(uuid),public.guard_vault_ciphertext(),
  public.seal_vault(uuid,text,text,jsonb,int,text) from public,anon,authenticated;
grant execute on function public.seal_vault(uuid,text,text,jsonb,int,text) to authenticated;
commit;
