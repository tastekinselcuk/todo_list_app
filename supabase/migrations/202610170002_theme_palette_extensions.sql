-- Extends the existing preference allowlist; no saved choices or account permissions change.
begin;

create or replace function public.valid_user_preferences(value jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare field text; durations jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' or octet_length(value::text) > 4096 then return false; end if;
  for field in select jsonb_object_keys(value) loop
    if field not in ('workspaceWide','pomodoroPlacement','language','theme','themePalette','pomodoroDurations') then return false; end if;
  end loop;
  if value ? 'workspaceWide' and jsonb_typeof(value->'workspaceWide') <> 'boolean' then return false; end if;
  if value ? 'pomodoroPlacement' and (jsonb_typeof(value->'pomodoroPlacement') <> 'string' or value->>'pomodoroPlacement' not in ('card','navbar')) then return false; end if;
  if value ? 'language' and (jsonb_typeof(value->'language') <> 'string' or value->>'language' not in ('en','tr')) then return false; end if;
  if value ? 'theme' and (jsonb_typeof(value->'theme') <> 'string' or value->>'theme' not in ('light','dark')) then return false; end if;
  if value ? 'themePalette' and (jsonb_typeof(value->'themePalette') <> 'string' or value->>'themePalette' not in ('classic','ocean','forest','sand','lavender','amber','ruby','cobalt','graphite')) then return false; end if;
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

revoke all on function public.valid_user_preferences(jsonb) from public, anon, authenticated;
commit;
