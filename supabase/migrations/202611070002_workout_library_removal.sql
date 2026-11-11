-- Retire a custom library entry without touching the snapshots saved in programs.
begin;
alter table public.workout_library_exercises add column if not exists removed_at timestamptz;
create index if not exists workout_library_active on public.workout_library_exercises(collection_id,created_at desc,id) where removed_at is null;

create or replace function public.workout_library_load(wid uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid:=workout_library_collection(wid);answer jsonb;
begin
 select coalesce(jsonb_agg(workout_library_catalog_item(e) order by e.created_at desc,e.id),'[]') into answer
 from workout_library_exercises e where e.collection_id=cid and e.removed_at is null;
 return answer;
end $$;
revoke all on function public.workout_library_load(uuid) from public,anon;
grant execute on function public.workout_library_load(uuid) to authenticated;

-- A late retry of the original create operation must not revive a removed entry.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.workout_library_save(uuid,uuid,jsonb)'::regprocedure);
 if position('result.removed_at is not null' in definition)=0 then
  definition:=replace(definition,'if result.id is null or',
   $replacement$if result.removed_at is not null then raise exception 'WORKOUT_LIBRARY_REMOVED';end if;
 if result.id is null or$replacement$);
 end if;
 if position('result.removed_at is not null' in definition)=0 then raise exception 'WORKOUT_LIBRARY_MIGRATION_MISMATCH';end if;
 execute definition;
end $$;

create or replace function public.workout_library_remove(wid uuid,rid uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid:=workout_library_collection(wid,true);
begin
 if rid is null or not exists(select 1 from workout_library_exercises e where e.id=rid and e.collection_id=cid) then
  raise exception 'WORKOUT_LIBRARY_UNAVAILABLE';
 end if;
 update workout_library_exercises e set removed_at=clock_timestamp() where e.id=rid and e.collection_id=cid and e.removed_at is null;
 return jsonb_build_object('id','custom:'||rid::text,'removed',true);
end $$;
revoke all on function public.workout_library_remove(uuid,uuid) from public,anon;
grant execute on function public.workout_library_remove(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
