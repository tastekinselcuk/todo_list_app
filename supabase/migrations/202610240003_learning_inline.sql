-- Apply after 202610230002_learning_workspace.sql.
-- Existing long titles remain intact. Only new or renamed titles use the compact limits.
begin;
create or replace function public.learning_name_limit() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare name text; changed boolean; max_length integer;
begin
 if tg_table_name='learning_subjects' then
  name:=new.title;max_length:=80;
  if tg_op='INSERT' then changed:=true;else changed:=new.title is distinct from old.title;end if;
 else
  name:=new.data->>'title';max_length:=100;
  if tg_op='INSERT' then changed:=true;else changed:=(new.data->>'title') is distinct from (old.data->>'title');end if;
 end if;
 if changed and coalesce(char_length(btrim(name)),0) not between 1 and max_length then
  raise exception 'INVALID_LEARNING_NAME' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists learning_name_limit on public.learning_subjects;
create trigger learning_name_limit before insert or update on public.learning_subjects for each row execute function public.learning_name_limit();
drop trigger if exists learning_name_limit on public.learning_subjects_items;
create trigger learning_name_limit before insert or update on public.learning_subjects_items for each row execute function public.learning_name_limit();

create or replace function public.learning_reorder(wid uuid,sid uuid,ordered_ids text[],expected_versions jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict error
declare cid uuid:=public.learning_context(wid); item_count integer; parent public.learning_subjects;
begin
 perform 1 from public.module_collections c where c.id=cid and c.module='learning' for update;
 if not found or not public.collection_write(cid) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(expected_versions) is distinct from 'object' then raise exception 'SHARING_CONFLICT';end if;
 if ordered_ids is null or coalesce(array_ndims(ordered_ids),1)<>1
  or exists(select 1 from unnest(ordered_ids) x(id) where x.id is null)
  or (select count(distinct x.id) from unnest(ordered_ids) x(id))<>cardinality(ordered_ids) then
  raise exception 'INVALID_LEARNING_ORDER' using errcode='22023';
 end if;
 if sid is null then
  perform 1 from public.learning_subjects s where s.collection_id=cid and s.deleted_at is null for update;
  select count(*) into item_count from public.learning_subjects s where s.collection_id=cid and s.deleted_at is null;
  if cardinality(ordered_ids)<>item_count or exists(select 1 from unnest(ordered_ids) x(id) where not exists(
   select 1 from public.learning_subjects s where s.id::text=x.id and s.collection_id=cid and s.deleted_at is null)) then
   raise exception 'INVALID_LEARNING_ORDER' using errcode='22023';
  end if;
  if (select count(*) from jsonb_object_keys(expected_versions))<>item_count or exists(
   select 1 from public.learning_subjects s where s.collection_id=cid and s.deleted_at is null
    and (expected_versions->s.id::text) is distinct from to_jsonb(s.version)) then raise exception 'SHARING_CONFLICT';end if;
  update public.learning_subjects s set position=x.n::integer from unnest(ordered_ids) with ordinality x(id,n)
   where s.id::text=x.id and s.collection_id=cid and s.deleted_at is null and s.position<>x.n;
  return jsonb_build_object('subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.position,s.created_at,s.id)
   from public.learning_subjects s where s.collection_id=cid and s.deleted_at is null),'[]'::jsonb));
 end if;
 select * into parent from public.learning_subjects s where s.id=sid and s.collection_id=cid and s.deleted_at is null for update;
 if parent.id is null then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
 if (select count(*) from jsonb_object_keys(expected_versions))<>1
  or (expected_versions->sid::text) is distinct from to_jsonb(parent.version) then raise exception 'SHARING_CONFLICT';end if;
 select count(*) into item_count from public.learning_subjects_items i where i.parent_id=sid;
 -- Require every child, including archives. Never drop hidden or concurrently added topics.
 if cardinality(ordered_ids)<>item_count or exists(select 1 from unnest(ordered_ids) x(id) where not exists(
  select 1 from public.learning_subjects_items i where i.parent_id=sid and i.collection_id=cid and i.id=x.id)) then
  raise exception 'INVALID_LEARNING_ORDER' using errcode='22023';
 end if;
 update public.learning_subjects_items i set position=x.n::integer from unnest(ordered_ids) with ordinality x(id,n)
  where i.parent_id=sid and i.collection_id=cid and i.id=x.id and i.position<>x.n;
 return jsonb_build_object('subject',(select to_jsonb(s) from public.learning_subjects s where s.id=sid));
end $$;
revoke all on function public.learning_name_limit(),public.learning_reorder(uuid,uuid,text[],jsonb) from public,anon,authenticated;
grant execute on function public.learning_reorder(uuid,uuid,text[],jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
