begin;
lock table public.password_sessions,public.secure_notes,public.vault_note_history in share row exclusive mode;
create temporary table vault_hardening_snapshot(table_name text primary key,fingerprint text,rows bigint) on commit drop;
do $$ declare t text;h text;n bigint;begin
 foreach t in array array['password_sessions','secure_notes','vault_note_history'] loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by id),'''')),count(*) from public.%I r',t) into h,n;
  insert into vault_hardening_snapshot values(t,h,n);
 end loop;
end;$$;
create or replace function public.vault_ciphertext_storage_valid(value jsonb) returns boolean
language plpgsql immutable security definer set search_path=pg_catalog as $$
begin
 return coalesce(jsonb_typeof(value)='object' and public.vault_envelope_valid(value)
  and jsonb_typeof(value->'v')='number' and jsonb_typeof(value->'iv')='string'
  and jsonb_typeof(value->'ciphertext')='string' and jsonb_typeof(value->'key_id')='string'
  and (value-array['v','iv','ciphertext','key_id'])='{}'::jsonb
  and length(decode(value->>'key_id','base64'))=16,false);
exception when others then return false;
end;$$;
revoke all on function public.vault_ciphertext_storage_valid(jsonb) from public,anon;
grant execute on function public.vault_ciphertext_storage_valid(jsonb) to authenticated,service_role;
-- Revalidate all retained ciphertext; no record contents are rewritten.
alter table public.secure_notes drop constraint vault_ciphertext_required;
alter table public.secure_notes add constraint vault_ciphertext_required check(public.vault_ciphertext_storage_valid(encrypted_payload));
alter table public.vault_note_history drop constraint vault_history_ciphertext_required;
alter table public.vault_note_history add constraint vault_history_ciphertext_required check(public.vault_ciphertext_storage_valid(encrypted_payload));
revoke all on public.password_sessions,public.secure_notes from public,anon,authenticated;
grant select on public.password_sessions,public.secure_notes to authenticated;
do $$ declare t text;c record;begin
 foreach t in array array['password_sessions','secure_notes'] loop
  for c in select attname from pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped loop
   execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',c.attname,c.attname,c.attname,t);
   execute format('revoke select(%I) on public.%I from public,anon',c.attname,t);
  end loop;
 end loop;
end;$$;
create or replace function public.application_vault_writes_ready() returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
declare t text;f text;r oid;sample jsonb:='{"v":1,"iv":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA==","key_id":"AAAAAAAAAAAAAAAAAAAAAA=="}';
begin
 foreach t in array array['password_sessions','secure_notes'] loop
  r:=to_regclass('public.'||t);
  if r is null or not exists(select 1 from pg_class where oid=r and relrowsecurity)
   or has_table_privilege('anon',r,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   or has_any_column_privilege('anon',r,'SELECT,INSERT,UPDATE,REFERENCES')
   or has_table_privilege('authenticated',r,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   or has_any_column_privilege('authenticated',r,'INSERT,UPDATE,REFERENCES')
   or not has_table_privilege('authenticated',r,'SELECT') then return false;end if;
 end loop;
 foreach f in array array['public.vault_import(uuid,text,text,jsonb)','public.vault_rename(uuid,integer,text)','public.vault_note_save(uuid,uuid,jsonb,integer,integer)'] loop
  r:=to_regprocedure(f);
  if r is null or not has_function_privilege('authenticated',r,'EXECUTE') or has_function_privilege('anon',r,'EXECUTE') then return false;end if;
 end loop;
 return public.vault_ciphertext_storage_valid(sample) and not public.vault_ciphertext_storage_valid(sample||'{"plaintext":"forbidden"}'::jsonb)
  and exists(select 1 from pg_constraint where conrelid='public.secure_notes'::regclass and conname='vault_ciphertext_required' and convalidated)
  and exists(select 1 from pg_constraint where conrelid='public.vault_note_history'::regclass and conname='vault_history_ciphertext_required' and convalidated);
end;$$;
revoke all on function public.application_vault_writes_ready() from public;
grant execute on function public.application_vault_writes_ready() to anon,authenticated,service_role;
notify pgrst,'reload schema';
do $$ declare r record;h text;n bigint;begin
 for r in select * from vault_hardening_snapshot loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by id),'''')),count(*) from public.%I t',r.table_name) into h,n;
  if h is distinct from r.fingerprint or n<>r.rows then raise exception 'VAULT_HARDENING_CHANGED_DATA';end if;
 end loop;
end;$$;
commit;
