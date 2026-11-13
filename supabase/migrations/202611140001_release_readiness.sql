begin;

-- A bounded catalog check for the build server. Returns no application data.
create or replace function public.application_release_ready(required_rpc text[])
returns boolean
language sql stable
set search_path = pg_catalog
as $$
  select coalesce(cardinality(required_rpc) between 1 and 128, false)
    and not exists (
      select 1 from unnest(required_rpc) required(name)
      where name is null or name !~ '^[a-z][a-z0-9_]{0,62}$'
        or not exists (
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = required.name
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        )
    )
    and not exists (
      select 1 from (values
        ('secure_notes', 'encrypted_payload'), ('secure_notes', 'version'),
        ('password_sessions', 'password_hash'), ('password_sessions', 'version'),
        ('workout_library_exercises', 'removed_at'),
        ('plans', 'period'), ('plans', 'version'),
        ('work_blocks', 'task_id')
      ) required(table_name, column_name)
      where not exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        where n.nspname = 'public' and c.relname = required.table_name
          and c.relrowsecurity and a.attname = required.column_name
          and a.attnum > 0 and not a.attisdropped
      )
    )
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('rutin_workspaces', 'rutin_members', 'rutin_routines',
          'rutin_routine_assignees', 'rutin_recurrences', 'rutin_occurrences')
        and (not c.relrowsecurity
          or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
          or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
          or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE')
          or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE'))
    );
$$;

revoke all on function public.application_release_ready(text[]) from public;
grant execute on function public.application_release_ready(text[]) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
