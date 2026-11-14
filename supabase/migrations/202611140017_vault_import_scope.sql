begin;
create or replace function public.vault_import(wid uuid,new_name text,metadata text,notes jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare cid uuid;origin uuid;sid uuid;n jsonb;
begin
 select b.collection_id,c.origin_workspace_id into cid,origin from public.workspace_module_bindings b
 join public.workspaces w on w.id=b.workspace_id join public.module_collections c on c.id=b.collection_id
 where b.workspace_id=wid and b.module='secure' and w.user_id=auth.uid() and w.archived_at is null;
 if cid is null or not public.collection_owner(cid) or not public.collection_write(cid) or not public.vault_acknowledged(auth.uid()) or not public.session_mfa_satisfied() then raise exception 'ACCESS_DENIED';end if;
 if not public.vault_v2_storage_valid(metadata) or new_name is null or length(trim(new_name)) not between 1 and 100
  or jsonb_typeof(notes) is distinct from 'array' or jsonb_array_length(notes)>10000 or pg_column_size(notes)>10000000 then raise exception 'VAULT_INVALID_DATA';end if;
 sid:=(notes->0->>'session_id')::uuid;if sid is null then sid:=gen_random_uuid();end if;
 insert into public.password_sessions(id,workspace_id,collection_id,created_by,name,password_hash) values(sid,origin,cid,auth.uid(),trim(new_name),metadata);
 for n in select value from jsonb_array_elements(notes) loop
  if (n->>'session_id')::uuid is distinct from sid or not public.vault_ciphertext_storage_valid(n->'encrypted_payload')
   or ((n->'encrypted_payload')-array['v','iv','ciphertext','key_id'])<>'{}'::jsonb then raise exception 'VAULT_INVALID_DATA';end if;
  insert into public.secure_notes(id,workspace_id,collection_id,created_by,session_id,title,type,encrypted_payload)
   values((n->>'id')::uuid,origin,cid,auth.uid(),sid,'Encrypted note','secret',n->'encrypted_payload');
 end loop;
 return sid;
end;$$;
revoke all on function public.vault_import(uuid,text,text,jsonb) from public,anon;
grant execute on function public.vault_import(uuid,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
