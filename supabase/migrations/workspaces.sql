-- Run after the existing module setup scripts. All changes and the backfill are atomic.
begin;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  active_modules text[] not null default array['plans','detailed','quick','secure','code','pomodoro','learning','flashcards','workout','periodic','activities'],
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index if not exists workspaces_owner_name on public.workspaces(user_id, lower(trim(name)));
create unique index if not exists workspaces_owner_default on public.workspaces(user_id) where is_default;
alter table public.workspaces enable row level security;
drop policy if exists workspaces_owner on public.workspaces;
create policy workspaces_owner on public.workspaces for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Permanent deletion is deliberately unavailable in the first version.
revoke delete on public.workspaces from authenticated, anon;
grant select, insert, update on public.workspaces to authenticated;

insert into public.workspaces(user_id, name, is_default)
  select id, 'Kişisel', true from auth.users
  on conflict (user_id) where is_default do nothing;

-- Retain existing enabled-module preferences only on the migrated default workspace.
do $$
begin
  if to_regclass('public.user_settings') is not null then
    execute 'update public.workspaces w set active_modules = s.active_modules
      from public.user_settings s where w.user_id = s.user_id and w.is_default
      and s.active_modules is not null and not exists (
        select 1 from information_schema.columns where table_schema = ''public''
        and table_name = ''plans'' and column_name = ''workspace_id'')';
  end if;
end $$;

-- Upgrade whichever of the existing modules are installed. Never guess ownership
-- of old anonymous rows when more than one account exists.
do $$
declare
  module_table text;
  owner_column text;
  orphan_count bigint;
  sole_owner uuid;
  owner_count bigint;
  policy_row record;
  unique_row record;
  columns_sql text;
  predicate_sql text;
begin
  select count(*), (array_agg(id))[1] into owner_count, sole_owner from auth.users;
  foreach module_table in array array['categories','todos','quick_notes','code_snippets',
    'password_sessions','secure_notes','plans','periodic_tasks','activity_items',
    'learning_subjects','flashcard_decks','workout_routines','pomodoro_history'] loop
    if to_regclass(format('public.%I', module_table)) is null then
      raise notice 'Module table % not installed; skipped', module_table;
      continue;
    end if;
    owner_column := case when module_table in ('categories','todos','quick_notes',
      'code_snippets','password_sessions','secure_notes','pomodoro_history') then 'created_by' else 'user_id' end;
    if not exists (select 1 from information_schema.columns c where c.table_schema = 'public'
      and c.table_name = module_table and c.column_name = owner_column) then
      raise exception 'Expected owner column %.% is missing; migration rolled back', module_table, owner_column;
    end if;
    execute format('alter table public.%I add column if not exists workspace_id uuid', module_table);
    -- Preserve the owner inherited from a category or a vault session.
    if module_table = 'todos' then
      execute 'update public.todos t set created_by = c.created_by from public.categories c
        where t.category_id = c.id and t.created_by is null and c.created_by is not null';
    elsif module_table = 'secure_notes' then
      execute 'update public.secure_notes n set created_by = s.created_by from public.password_sessions s
        where n.session_id = s.id and n.created_by is null and s.created_by is not null';
    end if;
    execute format('select count(*) from public.%I where %I is null', module_table, owner_column) into orphan_count;
    if orphan_count > 0 then
      if owner_count <> 1 then
        raise exception '% has % ownerless rows. Assign their owners explicitly before rerunning; no data was changed.', module_table, orphan_count;
      end if;
      execute format('update public.%I set %I = $1 where %I is null', module_table, owner_column, owner_column) using sole_owner;
    end if;
    execute format('update public.%I t set workspace_id = w.id from public.workspaces w
      where t.%I = w.user_id and w.is_default and t.workspace_id is null', module_table, owner_column);
    execute format('alter table public.%I alter column workspace_id set not null', module_table);
    if not exists (select 1 from pg_constraint where conrelid = to_regclass(format('public.%I', module_table))
      and conname = module_table || '_workspace_owner_fk') then
      execute format('alter table public.%I add constraint %I foreign key (workspace_id, %I)
        references public.workspaces(id, user_id) on delete cascade', module_table, module_table || '_workspace_owner_fk', owner_column);
    end if;
    execute format('create index if not exists %I on public.%I(workspace_id, created_at)', module_table || '_workspace_idx', module_table);
    execute format('create unique index if not exists %I on public.%I(id, workspace_id)', module_table || '_id_workspace_idx', module_table);

    -- Existing per-user/global name and external-ID uniqueness becomes per-workspace.
    -- Preserve partial predicates and expressions; leave identifier keys intact.
    for unique_row in select i.indexrelid, ic.relname as index_name, con.conname,
      i.indnkeyatts, pg_get_expr(i.indpred, i.indrelid) as predicate
      from pg_index i join pg_class ic on ic.oid = i.indexrelid
      left join pg_constraint con on con.conindid = i.indexrelid
      where i.indrelid = to_regclass(format('public.%I', module_table)) and i.indisunique and not i.indisprimary
      and not exists (select 1 from unnest(i.indkey) k join pg_attribute a on a.attrelid = i.indrelid
        and a.attnum = k where a.attname in ('id','workspace_id')) loop
      select string_agg(pg_get_indexdef(unique_row.indexrelid, k, true), ', ' order by k)
        into columns_sql from generate_series(1, unique_row.indnkeyatts) k;
      predicate_sql := case when unique_row.predicate is null then '' else ' where ' || unique_row.predicate end;
      if unique_row.conname is not null then
        execute format('alter table public.%I drop constraint %I', module_table, unique_row.conname);
      else
        execute format('drop index public.%I', unique_row.index_name);
      end if;
      execute format('create unique index %I on public.%I(workspace_id, %s)%s', unique_row.index_name, module_table, columns_sql, predicate_sql);
    end loop;

    execute format('alter table public.%I enable row level security', module_table);
    for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = module_table loop
      execute format('drop policy %I on public.%I', policy_row.policyname, module_table);
    end loop;
    execute format('create policy workspace_owner on public.%I for all to authenticated
      using (%I = auth.uid() and exists (select 1 from public.workspaces w
        where w.id = workspace_id and w.user_id = auth.uid() and w.archived_at is null))
      with check (%I = auth.uid() and exists (select 1 from public.workspaces w
        where w.id = workspace_id and w.user_id = auth.uid() and w.archived_at is null))', module_table, owner_column, owner_column);
  end loop;
end $$;

-- A note and its category/vault must belong to the same workspace.
do $$
begin
  if to_regclass('public.todos') is not null and not exists (select 1 from pg_constraint where conname = 'todos_category_workspace_fk' and conrelid = to_regclass('public.todos')) then
    alter table public.todos add constraint todos_category_workspace_fk foreign key (category_id, workspace_id) references public.categories(id, workspace_id) on delete set null (category_id);
  end if;
  if to_regclass('public.secure_notes') is not null and not exists (select 1 from pg_constraint where conname = 'secure_notes_session_workspace_fk' and conrelid = to_regclass('public.secure_notes')) then
    alter table public.secure_notes add constraint secure_notes_session_workspace_fk foreign key (session_id, workspace_id) references public.password_sessions(id, workspace_id) on delete cascade;
  end if;
end $$;

create or replace function public.guard_workspace_archive() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    if (select count(*) from public.workspaces where user_id = new.user_id and archived_at is null) <= 1 then
      raise exception 'LAST_WORKSPACE';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_workspace_archive on public.workspaces;
create trigger guard_workspace_archive before update of archived_at on public.workspaces
  for each row execute function public.guard_workspace_archive();

create or replace function public.ensure_default_workspace() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare owner_id uuid := auth.uid(); result uuid;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(owner_id::text));
  select id into result from public.workspaces where user_id = owner_id and archived_at is null
    order by is_default desc, created_at limit 1;
  if result is null then
    insert into public.workspaces(user_id, name, is_default) values (owner_id, 'Kişisel', true) returning id into result;
  end if;
  return result;
end $$;
revoke all on function public.ensure_default_workspace() from public, anon;
grant execute on function public.ensure_default_workspace() to authenticated;

commit;
