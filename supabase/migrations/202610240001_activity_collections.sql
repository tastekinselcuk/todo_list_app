-- Apply after sharing modules and workspace trash. Existing cards are not moved or rewritten.
begin;
do $$begin
 if to_regprocedure('public.collection_write(uuid)') is null or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='activity_items' and column_name='deleted_at') then
  raise exception 'Apply sharing and workspace trash before 202610240001_activity_collections.sql.';
 end if;
end $$;
create table if not exists public.activity_collections (
 id uuid primary key, collection_id uuid not null references public.module_collections(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 color text not null default '#64748B' check(color ~ '^#[0-9A-Fa-f]{6}$'),
 version integer not null default 1, created_at timestamptz not null default clock_timestamp(), archived_at timestamptz,
 unique(id,collection_id)
);
create unique index if not exists activity_collection_name_idx on public.activity_collections(collection_id,lower(btrim(name))) where archived_at is null;
create table if not exists public.activity_collection_items (
 group_id uuid not null, item_id uuid not null, collection_id uuid not null,
 primary key(group_id,item_id),
 foreign key(group_id,collection_id) references public.activity_collections(id,collection_id) on delete cascade,
 foreign key(item_id,collection_id) references public.activity_items(id,collection_id) on delete cascade
);
create index if not exists activity_collection_item_idx on public.activity_collection_items(item_id);
create index if not exists activity_collection_scope_idx on public.activity_collection_items(collection_id);
alter table public.activity_collections enable row level security;
alter table public.activity_collection_items enable row level security;
revoke all on public.activity_collections,public.activity_collection_items from public,anon,authenticated;
grant select on public.activity_collections,public.activity_collection_items to authenticated;
drop policy if exists activity_collection_read on public.activity_collections;
create policy activity_collection_read on public.activity_collections for select to authenticated using(public.collection_access(collection_id));
drop policy if exists activity_collection_read on public.activity_collection_items;
create policy activity_collection_read on public.activity_collection_items for select to authenticated using(public.collection_access(collection_id));

create or replace function public.activity_library_context(wid uuid) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
 where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and b.module='activities' and 'activities'=any(w.active_modules);
 if cid is null or not public.collection_access(cid) then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501';end if;
 return cid;
end $$;
revoke all on function public.activity_library_context(uuid) from public,anon,authenticated;
create or replace function public.activity_library_load(wid uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid:=public.activity_library_context(wid);
begin
 return jsonb_build_object(
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id) from activity_items i where i.collection_id=cid and i.deleted_at is null),'[]'),
 'collections',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at,g.id) from activity_collections g where g.collection_id=cid),'[]'),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('group_id',m.group_id,'item_id',m.item_id)) from activity_collection_items m join activity_items i on i.id=m.item_id where m.collection_id=cid and i.deleted_at is null),'[]'));
end $$;

create or replace function public.activity_library_mutate(wid uuid,operation text,rid uuid,payload jsonb default '{}',expected_version integer default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict error
declare cid uuid:=public.activity_library_context(wid); group_row activity_collections; item_row activity_items;
 target_group uuid; chosen uuid[]; item_title text; item_type text; source_name text; external_key text; was_present boolean:=false; response jsonb;
begin
 if not public.collection_write(cid) then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501';end if;
 if rid is null or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>25000 then raise exception 'INVALID_ACTIVITY_INPUT';end if;
 perform 1 from module_collections c where c.id=cid for update;
 if operation like 'collection.%' then
  select * into group_row from activity_collections g where g.id=rid for update;
  if group_row.id is not null and group_row.collection_id<>cid then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501';end if;
  if operation='collection.create' and group_row.id is not null then return jsonb_build_object('collection',to_jsonb(group_row));end if;
  if operation<>'collection.create' and (group_row.id is null or expected_version is distinct from group_row.version) then raise exception 'SHARING_CONFLICT';end if;
  if operation in ('collection.create','collection.update') then
   if coalesce(length(btrim(payload->>'name')),0) not between 1 and 80 or coalesce(payload->>'color','#64748B')!~'^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_ACTIVITY_INPUT';end if;
   if operation='collection.create' then
    insert into activity_collections(id,collection_id,name,color) values(rid,cid,btrim(payload->>'name'),coalesce(payload->>'color','#64748B')) returning * into group_row;
   else
    if group_row.archived_at is not null then raise exception 'ACTIVITY_COLLECTION_ARCHIVED';end if;
    update activity_collections g set name=btrim(payload->>'name'),color=coalesce(payload->>'color',g.color),version=g.version+1 where g.id=rid returning * into group_row;
   end if;
  elsif operation in ('collection.archive','collection.restore') then
   update activity_collections g set archived_at=case when operation='collection.archive' then clock_timestamp() else null end,version=g.version+1 where g.id=rid returning * into group_row;
  else raise exception 'INVALID_ACTIVITY_INPUT';end if;
  perform public.sharing_notify('collection:'||cid::text||':'||(select c.epoch from module_collections c where c.id=cid)::text,jsonb_build_object('table','activity_items','id',rid,'operation','UPDATE'));
  return jsonb_build_object('collection',to_jsonb(group_row));
 end if;
 if operation='item.add' then
  target_group:=nullif(payload->>'group_id','')::uuid;
  if target_group is not null and not exists(select 1 from activity_collections g where g.id=target_group and g.collection_id=cid and g.archived_at is null) then raise exception 'ACTIVITY_COLLECTION_ARCHIVED';end if;
  item_title:=btrim(payload->>'title');item_type:=payload->>'type';source_name:=coalesce(payload->>'external_source','manual');external_key:=nullif(payload->>'external_id','');
  if coalesce(length(item_title),0) not between 1 and 240 or coalesce(item_type,'') not in ('movie','series','book','place')
   or source_name not in ('manual','tmdb','openlibrary','photon') or length(coalesce(external_key,''))>300
   or length(coalesce(payload->>'subtitle',''))>500 or length(coalesce(payload->>'notes',''))>4000
   or (payload ? 'meta' and jsonb_typeof(payload->'meta') is distinct from 'object')
   or (nullif(payload->>'image_url','') is not null and (length(payload->>'image_url')>2000 or payload->>'image_url'!~'^https://[^[:space:]]+$')) then raise exception 'INVALID_ACTIVITY_INPUT';end if;
  select * into item_row from activity_items i where i.id=rid for update;
  if item_row.id is not null and item_row.collection_id<>cid then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501';end if;
  if item_row.id is null and external_key is not null then
   select * into item_row from activity_items i where i.collection_id=cid and i.type=item_type and i.external_source=source_name and i.external_id=external_key for update;
  end if;
  if item_row.id is null and source_name='manual' then
   select * into item_row from activity_items i where i.collection_id=cid and i.type=item_type and i.external_source='manual' and lower(btrim(i.title))=lower(item_title) and i.deleted_at is null order by i.created_at limit 1 for update;
  end if;
  if item_row.deleted_at is not null then raise exception 'ACTIVITY_ITEM_IN_TRASH';end if;
  if item_row.id is null then
   insert into activity_items(id,user_id,workspace_id,collection_id,type,title,subtitle,image_url,external_id,external_source,meta,status,notes)
   values(rid,auth.uid(),wid,cid,item_type,item_title,nullif(payload->>'subtitle',''),nullif(payload->>'image_url',''),external_key,source_name,coalesce(payload->'meta','{}'),'want',nullif(payload->>'notes','')) returning * into item_row;
  else was_present:=target_group is null or exists(select 1 from activity_collection_items m where m.group_id=target_group and m.item_id=item_row.id);end if;
  if target_group is not null then
   insert into activity_collection_items(group_id,item_id,collection_id) values(target_group,item_row.id,cid) on conflict do nothing;
   if not was_present then update activity_items i set updated_at=clock_timestamp() where i.id=item_row.id returning * into item_row;end if;
  end if;
 elsif operation in ('item.status','item.collections') then
  select * into item_row from activity_items i where i.id=rid and i.collection_id=cid and i.deleted_at is null for update;
  if item_row.id is null then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501';end if;
  if expected_version is distinct from item_row.version then raise exception 'SHARING_CONFLICT';end if;
  if operation='item.status' then
   if coalesce(payload->>'status','') not in ('want','done') then raise exception 'INVALID_ACTIVITY_INPUT';end if;
   update activity_items i set status=payload->>'status',updated_at=clock_timestamp() where i.id=rid returning * into item_row;
  else
   if jsonb_typeof(payload->'group_ids') is distinct from 'array' or jsonb_array_length(payload->'group_ids')>50 then raise exception 'INVALID_ACTIVITY_INPUT';end if;
   select coalesce(array_agg(distinct value::uuid),'{}') into chosen from jsonb_array_elements_text(payload->'group_ids');
   if exists(select 1 from unnest(chosen) requested where requested is null or not exists(select 1 from activity_collections g where g.id=requested and g.collection_id=cid and (g.archived_at is null or exists(select 1 from activity_collection_items m where m.group_id=g.id and m.item_id=rid)))) then raise exception 'ACTIVITY_COLLECTION_ARCHIVED';end if;
   delete from activity_collection_items m where m.item_id=rid and not(m.group_id=any(chosen));
   insert into activity_collection_items(group_id,item_id,collection_id) select g,rid,cid from unnest(chosen) g on conflict do nothing;
   update activity_items i set updated_at=clock_timestamp() where i.id=rid returning * into item_row;
  end if;
 else raise exception 'INVALID_ACTIVITY_INPUT';end if;
 select jsonb_build_object('item',to_jsonb(item_row),'already_exists',was_present,'group_ids',coalesce((select jsonb_agg(m.group_id) from activity_collection_items m where m.item_id=item_row.id),'[]')) into response;
 return response;
end $$;
revoke all on function public.activity_library_load(uuid),public.activity_library_mutate(uuid,text,uuid,jsonb,integer) from public,anon;
grant execute on function public.activity_library_load(uuid),public.activity_library_mutate(uuid,text,uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
