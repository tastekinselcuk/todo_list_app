begin;

create or replace function public.valid_user_preferences(value jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare field text; durations jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' or octet_length(value::text) > 4096 then return false; end if;
  for field in select jsonb_object_keys(value) loop
    if field not in ('workspaceWide','pomodoroPlacement','language','theme','pomodoroDurations') then return false; end if;
  end loop;
  if value ? 'workspaceWide' and jsonb_typeof(value->'workspaceWide') <> 'boolean' then return false; end if;
  if value ? 'pomodoroPlacement' and (jsonb_typeof(value->'pomodoroPlacement') <> 'string' or value->>'pomodoroPlacement' not in ('card','navbar')) then return false; end if;
  if value ? 'language' and (jsonb_typeof(value->'language') <> 'string' or value->>'language' not in ('en','tr')) then return false; end if;
  if value ? 'theme' and (jsonb_typeof(value->'theme') <> 'string' or value->>'theme' not in ('light','dark')) then return false; end if;
  if value ? 'pomodoroDurations' then
    durations := value->'pomodoroDurations';
    if jsonb_typeof(durations) <> 'object' or not durations ?& array['focus','shortBreak','longBreak'] then return false; end if;
    for field in select jsonb_object_keys(durations) loop
      if field not in ('focus','shortBreak','longBreak') or jsonb_typeof(durations->field) <> 'number' then return false; end if;
      if (durations->>field)::numeric <> trunc((durations->>field)::numeric) then return false; end if;
    end loop;
    if (durations->>'focus')::numeric not between 10 and 90
      or (durations->>'shortBreak')::numeric not between 3 and 30
      or (durations->>'longBreak')::numeric not between 5 and 45 then return false; end if;
  end if;
  return true;
end $$;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  preferences jsonb not null default '{}'::jsonb check (public.valid_user_preferences(preferences)),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists read_own_preferences on public.user_preferences;
create policy read_own_preferences on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.user_preferences from public, anon, authenticated;
grant select on public.user_preferences to authenticated;

create or replace function public.save_user_preferences(expected_user_id uuid, patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if expected_user_id is distinct from uid then raise exception 'SESSION_CHANGED' using errcode = '42501'; end if;
  if not public.valid_user_preferences(patch) then raise exception 'INVALID_PREFERENCES' using errcode = '22023'; end if;
  -- Merge only edited fields: another device's unrelated preferences survive.
  insert into public.user_preferences(user_id, preferences) values(uid, patch)
    on conflict (user_id) do update set preferences = user_preferences.preferences || excluded.preferences,
      updated_at = clock_timestamp()
    returning preferences into result;
  return result;
end $$;
revoke all on function public.valid_user_preferences(jsonb), public.save_user_preferences(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_user_preferences(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
