-- Retired application tables remain available to the database administrator.
-- Do not create these tables in a new Todo-List installation.
begin;

do $migration$
declare
  table_name text;
  relation regclass;
  policy_name text;
  column_names text;
begin
  foreach table_name in array array[
    'rutin_workspaces', 'rutin_members', 'rutin_routines',
    'rutin_routine_assignees', 'rutin_recurrences', 'rutin_occurrences'
  ] loop
    relation := to_regclass(format('public.%I', table_name));
    if relation is null then
      continue;
    end if;

    execute format('alter table %s enable row level security', relation);
    execute format('revoke all privileges on table %s from public, anon, authenticated', relation);

    -- Table-level REVOKE does not remove independently granted column access.
    select string_agg(quote_ident(attname), ', ' order by attnum)
      into column_names
      from pg_attribute
      where attrelid = relation and attnum > 0 and not attisdropped;
    if column_names is not null then
      execute format(
        'revoke all privileges (%s) on table %s from public, anon, authenticated',
        column_names, relation
      );
    end if;

    for policy_name in
      select polname from pg_policy where polrelid = relation
    loop
      execute format('drop policy %I on %s', policy_name, relation);
    end loop;

    if has_table_privilege('anon', relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated', relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege('anon', relation, 'SELECT,INSERT,UPDATE,REFERENCES')
      or has_any_column_privilege('authenticated', relation, 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'Retired table still has API privileges: %', relation;
    end if;
  end loop;
end;
$migration$;

commit;
