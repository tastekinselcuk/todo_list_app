-- Custom movements belong to the current workout collection, not to one routine.
begin;
create table if not exists public.workout_library_exercises (
 id uuid primary key,
 collection_id uuid not null references public.module_collections(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 160),
 image_url text not null check(length(image_url) between 1 and 2048 and image_url ~ '^https?://[^[:space:]<>]+$' and image_url !~ '^https?://[^/?#]*@'),
 muscle_group text not null check(muscle_group in ('chest','back','legs','shoulders','arms','core','cardio')),
 equipment text not null check(equipment in ('body only','dumbbell','barbell','cable','machine','kettlebells','bands','medicine ball','exercise ball','foam roll','e-z curl bar','other')),
 version integer not null default 1,
 created_at timestamptz not null default now()
);
create index if not exists workout_library_collection on public.workout_library_exercises(collection_id,created_at desc,id);
alter table public.workout_library_exercises enable row level security;
revoke all on public.workout_library_exercises from public,anon,authenticated;
drop trigger if exists guard_collection_record on public.workout_library_exercises;
create trigger guard_collection_record before insert or update on public.workout_library_exercises for each row execute function public.guard_collection_record('workout','created_by');
drop trigger if exists collection_record_changed on public.workout_library_exercises;
-- The library is append-only through these RPCs. Do not create audit rows during
-- FK cascades after a workspace/collection has already been removed.
create trigger collection_record_changed after insert on public.workout_library_exercises for each row execute function public.collection_record_changed();

create or replace function public.workout_library_collection(wid uuid,writing boolean default false) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select b.collection_id into cid from workspace_module_bindings b
  join workspaces w on w.id=b.workspace_id
  join module_collections c on c.id=b.collection_id and c.module='workout'
  where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and 'workout'=any(w.active_modules) and b.module='workout';
 if cid is null or not collection_access(cid) then raise exception 'WORKOUT_LIBRARY_ACCESS_DENIED' using errcode='42501';end if;
 if writing and not collection_write(cid) then raise exception 'READ_ONLY' using errcode='42501';end if;
 return cid;
end $$;
revoke all on function public.workout_library_collection(uuid,boolean) from public,anon,authenticated;

create or replace function public.workout_library_catalog_item(item public.workout_library_exercises) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('id','custom:'||item.id::text,'name',item.name,'equipment',item.equipment,
  'primaryMuscles','[]'::jsonb,'group',item.muscle_group,'category',case when item.muscle_group='cardio' then 'cardio' else 'strength' end,
  'images',jsonb_build_array(item.image_url),'source','custom')
$$;
revoke all on function public.workout_library_catalog_item(public.workout_library_exercises) from public,anon,authenticated;

create or replace function public.workout_library_load(wid uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid:=workout_library_collection(wid);answer jsonb;
begin
 select coalesce(jsonb_agg(workout_library_catalog_item(e) order by e.created_at desc,e.id),'[]') into answer from workout_library_exercises e where e.collection_id=cid;
 return answer;
end $$;
revoke all on function public.workout_library_load(uuid) from public,anon;
grant execute on function public.workout_library_load(uuid) to authenticated;

create or replace function public.workout_library_save(wid uuid,request_id uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid:=workout_library_collection(wid,true);result workout_library_exercises;n text;url text;g text;eq text;
begin
 if request_id is null or jsonb_typeof(input) is distinct from 'object'
  or (input-array['name','imageUrl','group','equipment'])<>'{}'::jsonb
  or jsonb_typeof(input->'name') is distinct from 'string' or jsonb_typeof(input->'imageUrl') is distinct from 'string'
  or jsonb_typeof(input->'group') is distinct from 'string' or jsonb_typeof(input->'equipment') is distinct from 'string' then raise exception 'INVALID_CUSTOM_EXERCISE';end if;
 n:=trim(input->>'name');url:=trim(input->>'imageUrl');g:=input->>'group';eq:=input->>'equipment';
 if length(n) not between 1 and 160 or length(url) not between 1 and 2048
  or url !~ '^https?://[^[:space:]<>]+$' or url ~ '^https?://[^/?#]*@'
  or g not in ('chest','back','legs','shoulders','arms','core','cardio')
  or eq not in ('body only','dumbbell','barbell','cable','machine','kettlebells','bands','medicine ball','exercise ball','foam roll','e-z curl bar','other') then raise exception 'INVALID_CUSTOM_EXERCISE';end if;
 -- One request ID survives retry after a lost response. A changed payload never
 -- silently replaces another movement, and IDs from other collections reveal nothing.
 insert into workout_library_exercises(id,collection_id,workspace_id,created_by,name,image_url,muscle_group,equipment)
 values(request_id,cid,wid,auth.uid(),n,url,g,eq) on conflict(id) do nothing;
 select * into result from workout_library_exercises e where e.id=request_id and e.collection_id=cid;
 if result.id is null or result.name<>n or result.image_url<>url or result.muscle_group<>g or result.equipment<>eq then raise exception 'WORKOUT_LIBRARY_CONFLICT';end if;
 return workout_library_catalog_item(result);
end $$;
revoke all on function public.workout_library_save(uuid,uuid,jsonb) from public,anon;
grant execute on function public.workout_library_save(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
