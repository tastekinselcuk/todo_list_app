begin;
create or replace function public.vault_rename(sid uuid,expected_version integer,new_name text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare session_row public.password_sessions%rowtype;
begin
 select ps.* into session_row from public.password_sessions ps where ps.id=sid for update;
 if not found or not public.collection_write(session_row.collection_id) or not public.vault_acknowledged(auth.uid()) or not public.session_mfa_satisfied() then raise exception 'ACCESS_DENIED';end if;
 if session_row.version is distinct from expected_version then raise exception 'SHARING_CONFLICT';end if;
 if new_name is null or length(trim(new_name)) not between 1 and 100 then raise exception 'VAULT_INVALID_DATA';end if;
 update public.password_sessions set name=trim(new_name) where id=sid returning * into session_row;
 return to_jsonb(session_row);
end;$$;
create or replace function public.vault_note_save(sid uuid,nid uuid,payload jsonb,expected_version integer,expected_session_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare session_row public.password_sessions%rowtype;note_row public.secure_notes%rowtype;
begin
 select ps.* into session_row from public.password_sessions ps where ps.id=sid for update;
 if not found or not public.collection_write(session_row.collection_id) or not public.vault_acknowledged(auth.uid()) or not public.session_mfa_satisfied() then raise exception 'ACCESS_DENIED';end if;
 if session_row.version is distinct from expected_session_version then raise exception 'SHARING_CONFLICT';end if;
 if nid is null or not public.vault_v2_storage_valid(session_row.password_hash)
  or not public.vault_ciphertext_storage_valid(payload) or jsonb_typeof(payload)<>'object'
  or (payload-array['v','iv','ciphertext','key_id'])<>'{}'::jsonb
  or payload->>'key_id' is distinct from session_row.password_hash::jsonb->>'key_id' then raise exception 'VAULT_INVALID_DATA';end if;
 select sn.* into note_row from public.secure_notes sn where sn.id=nid for update;
 if expected_version is null then
  if found then
   if note_row.session_id=sid and note_row.collection_id=session_row.collection_id and note_row.created_by=auth.uid() and note_row.deleted_at is null and note_row.encrypted_payload=payload then return to_jsonb(note_row);end if;
   raise exception 'SHARING_CONFLICT';
  end if;
  insert into public.secure_notes(id,workspace_id,collection_id,created_by,session_id,title,type,encrypted_payload)
   values(nid,session_row.workspace_id,session_row.collection_id,auth.uid(),sid,'Encrypted note','secret',payload) returning * into note_row;
 else
  if not found or note_row.session_id<>sid or note_row.collection_id<>session_row.collection_id or note_row.deleted_at is not null or note_row.version<>expected_version then raise exception 'SHARING_CONFLICT';end if;
  update public.secure_notes set encrypted_payload=payload where id=nid returning * into note_row;
 end if;
 return to_jsonb(note_row);
end;$$;
revoke all on function public.vault_rename(uuid,integer,text),public.vault_note_save(uuid,uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.vault_rename(uuid,integer,text),public.vault_note_save(uuid,uuid,jsonb,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
