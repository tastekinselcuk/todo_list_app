-- Apply after tab_sharing_modules and tab_sharing_permissions.
-- Reordering changes positions only; exercise content, checkmarks and child versions stay intact.
begin;
create or replace function public.reorder_workout_exercises(
  cid uuid, pid uuid, ordered_ids text[], expected_version integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict error
declare current_row jsonb; result jsonb; item_count integer;
begin
  perform 1 from public.module_collections c where c.id=cid and c.module='workout' for update;
  if not found or not public.collection_write(cid) then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  select to_jsonb(r) into current_row from public.workout_routines r
    where r.id=pid and r.collection_id=cid for update;
  if current_row is null or current_row->>'deleted_at' is not null then raise exception 'SHARING_CONFLICT'; end if;
  if expected_version is null or (current_row->>'version')::integer<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  select count(*) into item_count from public.workout_routines_items i where i.parent_id=pid;
  -- Require an exact permutation. Never drop a newly added exercise or accept foreign IDs.
  if ordered_ids is null or coalesce(array_ndims(ordered_ids),1)<>1
    or cardinality(ordered_ids)<>item_count
    or exists(select 1 from unnest(ordered_ids) x(id) where x.id is null)
    or (select count(distinct x.id) from unnest(ordered_ids) x(id))<>item_count
    or exists(select 1 from unnest(ordered_ids) x(id) where not exists(
      select 1 from public.workout_routines_items i where i.parent_id=pid and i.collection_id=cid and i.id=x.id)) then
    raise exception 'INVALID_EXERCISE_ORDER' using errcode='22023';
  end if;
  update public.workout_routines_items i set position=x.n::integer
    from unnest(ordered_ids) with ordinality x(id,n)
    where i.parent_id=pid and i.collection_id=cid and i.id=x.id and i.position<>x.n;
  select to_jsonb(r) into result from public.workout_routines r where r.id=pid;
  return result;
end;
$$;
revoke all on function public.reorder_workout_exercises(uuid,uuid,text[],integer) from public,anon,authenticated;
grant execute on function public.reorder_workout_exercises(uuid,uuid,text[],integer) to authenticated;
notify pgrst, 'reload schema';
commit;
