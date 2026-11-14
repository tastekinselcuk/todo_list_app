begin;
-- Return only an aggregate verdict. No credentials, queue rows or user data.
create or replace function public.application_security_ready() returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
declare item record; object_oid oid;
begin
 for item in select * from (values
  ('password_sessions','vault_v2_metadata_required'),('secure_notes','vault_ciphertext_required'),
  ('secure_notes','vault_plaintext_forbidden'),('vault_note_history','vault_history_ciphertext_required')
 ) required(table_name,constraint_name) loop
  if not exists(select 1 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=item.table_name and k.conname=item.constraint_name and k.convalidated) then return false; end if;
 end loop;
 if not exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.secure_notes') and a.attname='encrypted_payload' and a.attnotnull and not a.attisdropped) then return false; end if;
 for item in select name from (values('public.background_run_status'),('private.maintenance_tickets'),('private.client_error_counts'),('private.background_dispatch_config')) required(name) loop
  object_oid:=to_regclass(item.name);
  if object_oid is null or not exists(select 1 from pg_class c where c.oid=object_oid and c.relrowsecurity) then return false; end if;
  if has_table_privilege('anon',object_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   or has_table_privilege('authenticated',object_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   or has_any_column_privilege('anon',object_oid,'SELECT,INSERT,UPDATE')
   or has_any_column_privilege('authenticated',object_oid,'SELECT,INSERT,UPDATE') then return false; end if;
 end loop;
 for item in select name from (values('public.consume_maintenance_ticket(uuid,bigint)'),('public.claim_due_periodic_emails(integer,text)'),
  ('public.enqueue_scheduled_maintenance()'),('public.cleanup_operational_metrics()')) required(name) loop
  object_oid:=to_regprocedure(item.name);
  if object_oid is null or not has_function_privilege('service_role',object_oid,'EXECUTE')
   or has_function_privilege('anon',object_oid,'EXECUTE') or has_function_privilege('authenticated',object_oid,'EXECUTE') then return false; end if;
 end loop;
 return exists(select 1 from cron.job where jobname='scheduled-maintenance' and active and schedule='* * * * *')
  and exists(select 1 from private.background_dispatch_config where singleton)
  and exists(select 1 from vault.secrets where name='operations_cron_secret');
exception when undefined_table or invalid_schema_name then return false;
end; $$;
revoke all on function public.application_security_ready() from public;
grant execute on function public.application_security_ready() to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
