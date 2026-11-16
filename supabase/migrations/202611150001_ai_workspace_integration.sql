begin;

-- 1. Schema upgrades for rich notes across modules
alter table public.plans
  add column if not exists notes text not null default '' check (length(notes) <= 20000);

alter table public.quick_notes
  add column if not exists notes text not null default '' check (length(notes) <= 20000);

alter table public.finance_transactions
  add column if not exists note text check (note is null or length(note) <= 2000);

alter table public.learning_mistakes
  drop constraint if exists learning_mistakes_prompt_check;
alter table public.learning_mistakes
  add constraint learning_mistakes_prompt_check check (length(prompt) <= 10000);

alter table public.learning_mistakes
  drop constraint if exists learning_mistakes_solution_check;
alter table public.learning_mistakes
  add constraint learning_mistakes_solution_check check (length(solution) <= 10000);

-- 2. Note write mode helper (replace | append | prepend | insert_section)
create or replace function public.ai_apply_note_write_mode(
  existing_text text,
  incoming_text text,
  write_mode text default 'replace',
  section_heading text default null,
  target_format text default 'plain'
) returns text
language plpgsql immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  base_val text := coalesce(existing_text, '');
  next_val text := coalesce(incoming_text, '');
  mode_val text := coalesce(nullif(btrim(write_mode), ''), 'replace');
  heading_val text := coalesce(nullif(btrim(section_heading), ''), 'AI Notu');
  html_chunk text;
begin
  if mode_val not in ('replace', 'append', 'prepend', 'insert_section') then
    raise exception 'INVALID_AI_WRITE_MODE';
  end if;
  if mode_val = 'replace' or btrim(base_val) = '' then
    if mode_val = 'insert_section' and btrim(next_val) <> '' then
      if target_format = 'html' then
        html_chunk := case when next_val ~ '<[a-zA-Z]' then next_val else '<p>' || next_val || '</p>' end;
        return '<h2>' || heading_val || '</h2>' || html_chunk;
      end if;
      return '## ' || heading_val || E'\n\n' || ltrim(next_val);
    end if;
    return next_val;
  end if;
  if btrim(next_val) = '' then
    return base_val;
  end if;
  if target_format = 'html' then
    html_chunk := case when next_val ~ '<[a-zA-Z]' then next_val else '<p>' || next_val || '</p>' end;
    if mode_val = 'append' then
      return base_val || html_chunk;
    elsif mode_val = 'prepend' then
      return html_chunk || base_val;
    else
      return base_val || '<h2>' || heading_val || '</h2>' || html_chunk;
    end if;
  else
    if mode_val = 'append' then
      return rtrim(base_val) || E'\n\n' || ltrim(next_val);
    elsif mode_val = 'prepend' then
      return rtrim(next_val) || E'\n\n' || ltrim(base_val);
    else
      return rtrim(base_val) || E'\n\n## ' || heading_val || E'\n\n' || ltrim(next_val);
    end if;
  end if;
end $$;

revoke all on function public.ai_apply_note_write_mode(text, text, text, text, text) from public;
grant execute on function public.ai_apply_note_write_mode(text, text, text, text, text) to authenticated, service_role;

-- 3. Update existing RPCs to include new note fields and AI edge budget
create or replace function public.plan_entries_load(wid uuid) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare pcid uuid; qcid uuid; answer jsonb;
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null and 'plans'=any(active_modules)) then
    raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';
  end if;
  select collection_id into pcid from workspace_module_bindings where workspace_id=wid and module='plans';
  select collection_id into qcid from workspace_module_bindings where workspace_id=wid and module='quick';
  if collection_write(pcid) then perform rollover_collection_plans(pcid); end if;
  with entries as (
    select p.id, 'plans'::text source, to_jsonb(p)-'reason'||jsonb_build_object('source','plans','can_write',collection_write(p.collection_id)) data, p.created_at
    from plans p where p.collection_id=pcid and p.deleted_at is null and collection_access(p.collection_id)
    union all
    select q.id, 'quick', jsonb_build_object('id',q.id,'title',q.content,'notes',coalesce(q.notes,''),'period','timeless','period_date','1970-01-01','completed',q.completed,'created_at',q.created_at,'version',q.version,'history','[]'::jsonb,'source','quick','can_write',collection_write(q.collection_id)), q.created_at
    from quick_notes q where q.collection_id=qcid and q.deleted_at is null and collection_access(q.collection_id)
  ), result as (
    select e.data||jsonb_build_object('focus',case when l.task_id is null then null else jsonb_build_object('id',l.task_id,'estimated_sessions',coalesce(pref.estimated_sessions,1),'focus_seconds',coalesce(pref.focus_seconds,1500),'sessions',(select count(*) from analytics_focus_sessions f where f.user_id=auth.uid() and f.task_id=l.task_id and f.credited_completed)) end) data, e.created_at, e.id
    from entries e
    left join plan_focus_links l on l.source_id=e.id and l.source_module=e.source and l.user_id=auth.uid() and l.workspace_id=wid
    left join pomo_task_member_preferences pref on pref.task_id=l.task_id and pref.user_id=auth.uid()
  ) select coalesce(jsonb_agg(data order by created_at,id),'[]') into answer from result;
  return answer;
end $$;

create or replace function public.plan_entry_source(wid uuid, source text, rid uuid) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare cid uuid; answer jsonb;
begin
  if source not in ('plans','quick') or auth.uid() is null then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501'; end if;
  select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and 'plans'=any(w.active_modules) and b.module=source;
  if cid is null or not collection_access(cid) then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501'; end if;
  if source='plans' then
    select to_jsonb(p)||jsonb_build_object('source','plans','can_write',collection_write(cid)) into answer from plans p where p.id=rid and p.collection_id=cid and p.deleted_at is null;
  else
    select jsonb_build_object('id',q.id,'title',q.content,'notes',coalesce(q.notes,''),'period','timeless','period_date','1970-01-01','completed',q.completed,'created_at',q.created_at,'version',q.version,'history','[]'::jsonb,'source','quick','can_write',collection_write(cid)) into answer from quick_notes q where q.id=rid and q.collection_id=cid and q.deleted_at is null;
  end if;
  if answer is null then raise exception 'PLAN_UNAVAILABLE'; end if;
  return answer-'reason';
end $$;

create or replace function public.activity_library_mutate(wid uuid, operation text, rid uuid, payload jsonb default '{}'::jsonb, expected_version integer default null) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $_$
#variable_conflict error
declare cid uuid:=public.activity_library_context(wid); group_row activity_collections; item_row activity_items;
  target_group uuid; chosen uuid[]; item_title text; item_type text; source_name text; external_key text; was_present boolean:=false; response jsonb;
  next_notes text;
begin
  if not public.collection_write(cid) then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501'; end if;
  if rid is null or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>25000 then raise exception 'INVALID_ACTIVITY_INPUT'; end if;
  perform 1 from module_collections c where c.id=cid for update;
  if operation like 'collection.%' then
    select * into group_row from activity_collections g where g.id=rid for update;
    if group_row.id is not null and group_row.collection_id<>cid then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501'; end if;
    if operation='collection.create' and group_row.id is not null then return jsonb_build_object('collection',to_jsonb(group_row)); end if;
    if operation<>'collection.create' and (group_row.id is null or expected_version is distinct from group_row.version) then raise exception 'SHARING_CONFLICT'; end if;
    if operation in ('collection.create','collection.update') then
      if coalesce(length(btrim(payload->>'name')),0) not between 1 and 80 or coalesce(payload->>'color','#64748B')!~'^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_ACTIVITY_INPUT'; end if;
      if operation='collection.create' then
        insert into activity_collections(id,collection_id,name,color) values(rid,cid,btrim(payload->>'name'),coalesce(payload->>'color','#64748B')) returning * into group_row;
      else
        if group_row.archived_at is not null then raise exception 'ACTIVITY_COLLECTION_ARCHIVED'; end if;
        update activity_collections g set name=btrim(payload->>'name'),color=coalesce(payload->>'color',g.color),version=g.version+1 where g.id=rid returning * into group_row;
      end if;
    elsif operation in ('collection.archive','collection.restore') then
      update activity_collections g set archived_at=case when operation='collection.archive' then clock_timestamp() else null end,version=g.version+1 where g.id=rid returning * into group_row;
    else raise exception 'INVALID_ACTIVITY_INPUT'; end if;
    perform public.sharing_notify('collection:'||cid::text||':'||(select c.epoch from module_collections c where c.id=cid)::text,jsonb_build_object('table','activity_items','id',rid,'operation','UPDATE'));
    return jsonb_build_object('collection',to_jsonb(group_row));
  end if;
  if operation='item.add' then
    target_group:=nullif(payload->>'group_id','')::uuid;
    if target_group is not null and not exists(select 1 from activity_collections g where g.id=target_group and g.collection_id=cid and g.archived_at is null) then raise exception 'ACTIVITY_COLLECTION_ARCHIVED'; end if;
    item_title:=btrim(payload->>'title'); item_type:=payload->>'type'; source_name:=coalesce(payload->>'external_source','manual'); external_key:=nullif(payload->>'external_id','');
    if coalesce(length(item_title),0) not between 1 and 240 or coalesce(item_type,'') not in ('movie','series','book','place')
      or source_name not in ('manual','tmdb','openlibrary','photon') or length(coalesce(external_key,''))>300
      or length(coalesce(payload->>'subtitle',''))>500 or length(coalesce(payload->>'notes',''))>10000
      or (payload ? 'meta' and jsonb_typeof(payload->'meta') is distinct from 'object')
      or (nullif(payload->>'image_url','') is not null and (length(payload->>'image_url')>2000 or payload->>'image_url'!~'^https://[^[:space:]]+$')) then raise exception 'INVALID_ACTIVITY_INPUT'; end if;
    select * into item_row from activity_items i where i.id=rid for update;
    if item_row.id is not null and item_row.collection_id<>cid then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501'; end if;
    if item_row.id is null and external_key is not null then
      select * into item_row from activity_items i where i.collection_id=cid and i.type=item_type and i.external_source=source_name and i.external_id=external_key for update;
    end if;
    if item_row.id is null and source_name='manual' then
      select * into item_row from activity_items i where i.collection_id=cid and i.type=item_type and i.external_source='manual' and lower(btrim(i.title))=lower(item_title) and i.deleted_at is null order by i.created_at limit 1 for update;
    end if;
    if item_row.deleted_at is not null then raise exception 'ACTIVITY_ITEM_IN_TRASH'; end if;
    if item_row.id is null then
      insert into activity_items(id,user_id,workspace_id,collection_id,type,title,subtitle,image_url,external_id,external_source,meta,status,notes)
      values(rid,auth.uid(),wid,cid,item_type,item_title,nullif(payload->>'subtitle',''),nullif(payload->>'image_url',''),external_key,source_name,coalesce(payload->'meta','{}'),'want',nullif(payload->>'notes','')) returning * into item_row;
    else was_present:=target_group is null or exists(select 1 from activity_collection_items m where m.group_id=target_group and m.item_id=item_row.id); end if;
    if target_group is not null then
      insert into activity_collection_items(group_id,item_id,collection_id) values(target_group,item_row.id,cid) on conflict do nothing;
      if not was_present then update activity_items i set updated_at=clock_timestamp() where i.id=item_row.id returning * into item_row; end if;
    end if;
  elsif operation in ('item.status','item.collections','item.notes') then
    select * into item_row from activity_items i where i.id=rid and i.collection_id=cid and i.deleted_at is null for update;
    if item_row.id is null then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501'; end if;
    if expected_version is distinct from item_row.version then raise exception 'SHARING_CONFLICT'; end if;
    if operation='item.status' then
      if coalesce(payload->>'status','') not in ('want','done') then raise exception 'INVALID_ACTIVITY_INPUT'; end if;
      update activity_items i set status=payload->>'status',updated_at=clock_timestamp() where i.id=rid returning * into item_row;
    elsif operation='item.notes' then
      if length(coalesce(payload->>'notes',''))>10000 then raise exception 'INVALID_ACTIVITY_INPUT'; end if;
      next_notes := public.ai_apply_note_write_mode(item_row.notes, coalesce(payload->>'notes',''), coalesce(payload->>'write_mode','replace'), payload->>'section_heading', 'plain');
      update activity_items i set notes=nullif(next_notes,''),updated_at=clock_timestamp() where i.id=rid returning * into item_row;
    else
      if jsonb_typeof(payload->'group_ids') is distinct from 'array' or jsonb_array_length(payload->'group_ids')>50 then raise exception 'INVALID_ACTIVITY_INPUT'; end if;
      if payload ? 'notes' and length(coalesce(payload->>'notes',''))>10000 then raise exception 'INVALID_ACTIVITY_INPUT'; end if;
      select coalesce(array_agg(distinct value::uuid),'{}') into chosen from jsonb_array_elements_text(payload->'group_ids');
      if exists(select 1 from unnest(chosen) requested where requested is null or not exists(select 1 from activity_collections g where g.id=requested and g.collection_id=cid and (g.archived_at is null or exists(select 1 from activity_collection_items m where m.group_id=g.id and m.item_id=rid)))) then raise exception 'ACTIVITY_COLLECTION_ARCHIVED'; end if;
      delete from activity_collection_items m where m.item_id=rid and not(m.group_id=any(chosen));
      insert into activity_collection_items(group_id,item_id,collection_id) select g,rid,cid from unnest(chosen) g on conflict do nothing;
      update activity_items i set
        notes=case when payload ? 'notes' then nullif(payload->>'notes','') else i.notes end,
        updated_at=clock_timestamp()
      where i.id=rid returning * into item_row;
    end if;
  else raise exception 'INVALID_ACTIVITY_INPUT'; end if;
  select jsonb_build_object('item',to_jsonb(item_row),'already_exists',was_present,'group_ids',coalesce((select jsonb_agg(m.group_id) from activity_collection_items m where m.item_id=item_row.id),'[]')) into response;
  return response;
end $_$;

create or replace function public.finance_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer default null) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare uid uuid:=auth.uid(); row_data jsonb; current_version integer; changes jsonb; field text;
begin
  perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
  if uid is null or not found then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8192 then raise exception 'INVALID_FINANCE_INPUT'; end if;
  if entity='settings' and operation='update' then
    if payload->>'currency' not in ('TRY','USD','EUR','GBP') or payload->>'currency' is null or payload - 'currency'<>'{}'::jsonb then raise exception 'INVALID_FINANCE_INPUT'; end if;
    if exists(select 1 from finance_budget_limits where workspace_id=wid and amount is not null) or exists(select 1 from finance_recurring where workspace_id=wid and deleted_at is null) or exists(select 1 from finance_transactions where workspace_id=wid) or exists(select 1 from finance_positions where workspace_id=wid) then raise exception 'FINANCE_CURRENCY_LOCKED'; end if;
    insert into finance_settings(workspace_id,user_id,currency) values(wid,uid,payload->>'currency')
      on conflict(workspace_id) do update set currency=excluded.currency;
    return payload;
  end if;
  if rid is null or entity not in ('transaction','position') or operation not in ('create','update','delete') then raise exception 'INVALID_FINANCE_INPUT'; end if;
  if entity='transaction' then
    for field in select jsonb_object_keys(payload) loop if field not in ('title','kind','category','category_id','amount','occurred_on','note') then raise exception 'INVALID_FINANCE_INPUT'; end if; end loop;
    select to_jsonb(t),t.version into row_data,current_version from finance_transactions t where t.id=rid and t.workspace_id=wid and t.user_id=uid for update;
  else
    for field in select jsonb_object_keys(payload) loop if field not in ('title','kind','instrument','price_source','quantity','buy_price','purchased_on','manual_price') then raise exception 'INVALID_FINANCE_INPUT'; end if; end loop;
    select to_jsonb(p),p.version into row_data,current_version from finance_positions p where p.id=rid and p.workspace_id=wid and p.user_id=uid for update;
  end if;
  if operation='create' and row_data is not null then
    if row_data @> payload then return row_data; else raise exception 'FINANCE_CONFLICT'; end if;
  end if;
  if operation<>'create' and (row_data is null or expected_version is distinct from current_version) then raise exception 'FINANCE_CONFLICT'; end if;
  if operation='delete' then
    if entity='transaction' then delete from finance_transactions where id=rid and user_id=uid and workspace_id=wid;
    else delete from finance_positions where id=rid and user_id=uid and workspace_id=wid; end if;
    return jsonb_build_object('id',rid);
  end if;
  changes:=coalesce(row_data,'{}'::jsonb)||payload;
  if entity='transaction' then
    changes:=jsonb_build_object('title',coalesce(changes->>'kind','expense'),'category','Uncategorized')||changes;
    if length(coalesce(changes->>'note',''))>2000 then raise exception 'INVALID_FINANCE_INPUT'; end if;
    if changes->>'category_id' is not null then
      perform 1 from finance_categories where id=(changes->>'category_id')::uuid and workspace_id=wid and user_id=uid
        and (not archived or row_data->>'category_id'=changes->>'category_id');
      if not found then raise exception 'INVALID_FINANCE_CATEGORY'; end if;
      changes:=changes||jsonb_build_object('category',(select name from finance_categories where id=(changes->>'category_id')::uuid));
    elsif payload?'category_id' then changes:=changes||jsonb_build_object('category','Uncategorized'); end if;
  end if;
  if entity='transaction' then
    if operation='create' then
      insert into finance_transactions(id,workspace_id,user_id,title,kind,category,amount,occurred_on,category_id,note)
        values(rid,wid,uid,btrim(changes->>'title'),changes->>'kind',btrim(changes->>'category'),(changes->>'amount')::numeric,(changes->>'occurred_on')::date,(changes->>'category_id')::uuid,nullif(btrim(coalesce(changes->>'note','')),''))
        returning to_jsonb(finance_transactions) into row_data;
    else
      update finance_transactions set title=btrim(changes->>'title'),kind=changes->>'kind',category=btrim(changes->>'category'),amount=(changes->>'amount')::numeric,
        occurred_on=(changes->>'occurred_on')::date,category_id=(changes->>'category_id')::uuid,note=nullif(btrim(coalesce(changes->>'note','')),''),version=version+1 where id=rid returning to_jsonb(finance_transactions) into row_data;
    end if;
  else
    if (changes->>'purchased_on')::date>(now() at time zone 'Pacific/Kiritimati')::date then raise exception 'INVALID_FINANCE_INPUT'; end if;
    if operation='create' then
      insert into finance_positions(id,workspace_id,user_id,title,kind,instrument,price_source,quantity,buy_price,purchased_on,manual_price,manual_updated_at)
        values(rid,wid,uid,btrim(changes->>'title'),changes->>'kind',coalesce(changes->>'instrument',''),changes->>'price_source',(changes->>'quantity')::numeric,
          (changes->>'buy_price')::numeric,(changes->>'purchased_on')::date,(changes->>'manual_price')::numeric,case when changes->>'manual_price' is not null then now() end)
        returning to_jsonb(finance_positions) into row_data;
    else
      update finance_positions set title=btrim(changes->>'title'),kind=changes->>'kind',instrument=coalesce(changes->>'instrument',''),price_source=changes->>'price_source',
        quantity=(changes->>'quantity')::numeric,buy_price=(changes->>'buy_price')::numeric,purchased_on=(changes->>'purchased_on')::date,
        manual_updated_at=case when payload ? 'manual_price' and manual_price is distinct from (changes->>'manual_price')::numeric then now() else manual_updated_at end,
        manual_price=(changes->>'manual_price')::numeric,version=version+1 where id=rid returning to_jsonb(finance_positions) into row_data;
    end if;
  end if;
  return row_data;
end $$;

create or replace function public.finance_query(wid uuid, month_start date, filters jsonb default '{}'::jsonb, after_date date default null, after_id uuid default null) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare rows jsonb; totals jsonb; cursor jsonb; more boolean; search_text text; category_filter text; kind_filter text; repeat_filter text;
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid()) then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501'; end if;
  if month_start is null or extract(day from month_start)<>1 or month_start not between date '1900-01-01' and date '2100-12-01' or (after_date is null)<>(after_id is null)
    or filters is null or jsonb_typeof(filters)<>'object' or octet_length(filters::text)>4096 or filters-array['search','category','kind','recurring']<>'{}'::jsonb then raise exception 'INVALID_FINANCE_INPUT'; end if;
  search_text:=coalesce(filters->>'search',''); category_filter:=coalesce(filters->>'category',''); kind_filter:=coalesce(filters->>'kind',''); repeat_filter:=coalesce(filters->>'recurring','');
  if length(search_text)>160 or kind_filter not in ('','income','expense') or repeat_filter not in ('','yes','no') then raise exception 'INVALID_FINANCE_INPUT'; end if;
  with matched as (
    select t.id,t.title,t.kind,coalesce(c.name,t.category) category,t.category_id,t.amount,t.occurred_on,t.version,t.recurring_id,t.note
    from finance_transactions t left join finance_categories c on c.id=t.category_id
    where t.workspace_id=wid and t.user_id=auth.uid() and t.occurred_on>=month_start and t.occurred_on<month_start+interval '1 month'
      and (search_text='' or strpos(lower(t.title),lower(search_text))>0 or strpos(lower(coalesce(t.note,'')),lower(search_text))>0)
      and (kind_filter='' or t.kind=kind_filter)
      and (category_filter='' or (category_filter='uncategorized' and t.category_id is null) or t.category_id::text=category_filter)
      and (repeat_filter='' or (repeat_filter='yes' and t.recurring_id is not null) or (repeat_filter='no' and t.recurring_id is null))
  ), page as (select * from matched where after_date is null or (occurred_on,id)<(after_date,after_id) order by occurred_on desc,id desc limit 51)
  select (select coalesce(jsonb_agg(to_jsonb(p) order by occurred_on desc,id desc),'[]'::jsonb) from page p),
    (select jsonb_build_object('count',count(*),'income',coalesce(sum(amount) filter(where kind='income'),0),'expense',coalesce(sum(amount) filter(where kind='expense'),0)) from matched)
  into rows,totals;
  more:=jsonb_array_length(rows)>50; if more then rows:=rows-50; end if;
  if jsonb_array_length(rows)>0 then cursor:=jsonb_build_object('date',rows->-1->>'occurred_on','id',rows->-1->>'id'); end if;
  return jsonb_build_object('items',rows,'has_more',more,'cursor',cursor,'totals',totals);
end $$;

create or replace function public.consume_edge_budget(uid uuid, operation text) returns boolean
language plpgsql security definer
set search_path to 'pg_catalog', 'public'
as $$
declare quota integer;
begin
  quota:=case operation when 'finance-prices' then 20 when 'send-periodic-reminder' then 30 when 'ai-assistant' then 60 else null end;
  if uid is null or quota is null then raise exception 'INVALID_BUDGET' using errcode='22023'; end if;
  return private.take_api_budget(uid,operation,60,quota);
end $$;

create or replace function public.workspace_search_documents(wid uuid) returns table(module text, record_id uuid, child_id text, title text, body text, meta jsonb, created_at timestamp with time zone)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with bound as materialized (
    select b.module,b.collection_id from public.workspace_module_bindings b
    join public.workspaces w on w.id=b.workspace_id
    join public.module_collections c on c.id=b.collection_id and c.module=b.module
    where w.id=wid and w.user_id=auth.uid() and w.archived_at is null
      and (b.module=any(w.active_modules) or (b.module='quick' and 'plans'=any(w.active_modules))) and b.module<>'secure'
      and public.collection_access(b.collection_id)
  ), docs as (
    select 'detailed'::text module,r.id record_id,null::text child_id,r.title,
      r.description body,'{}'::jsonb meta,r.created_at from public.todos r join bound b on b.module='detailed' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'plans',r.id,null,left(r.content,100),concat_ws(' ',r.content,r.notes),jsonb_build_object('period','timeless','source','quick'),r.created_at from public.quick_notes r join bound b on b.module='quick' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'plans',r.id,null,r.title,concat_ws(' ',r.reason,r.notes),jsonb_build_object('period',r.period,'date',r.period_date),r.created_at from public.plans r join bound b on b.module='plans' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'code',r.id,null,r.title,'','{}',r.created_at from public.code_snippets r join bound b on b.module='code' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'periodic',r.id,null,r.title,r.notes,'{}',r.created_at from public.periodic_tasks r join bound b on b.module='periodic' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'activities',r.id,null,r.title,concat_ws(' ',r.subtitle,r.notes),'{}',r.created_at from public.activity_items r join bound b on b.module='activities' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'learning',r.id,null,r.title,'','{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'learning',r.id,x->>'id',concat_ws(' · ',r.title,x->>'title'),'', '{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.topics) x
    union all select 'learning',m.subject_id,m.id::text,concat_ws(' · ',s.title,left(coalesce(nullif(m.prompt,''),m.source),100)),concat_ws(' ',m.prompt,m.solution,m.source),jsonb_build_object('kind','mistake','topic_id',m.topic_id),m.created_at
      from public.learning_mistakes m join public.learning_subjects s on s.id=m.subject_id join bound b on b.module='learning' and s.collection_id=b.collection_id
      where m.workspace_id=wid and m.user_id=auth.uid() and m.deleted_at is null and s.deleted_at is null
    union all select 'flashcards',r.id,null,r.title,'','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'flashcards',r.id,x->>'id',concat_ws(' · ',r.title,x->>'front'),x->>'back','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.cards) x
    union all select 'workout',r.id,null,r.title,'','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'workout',r.id,x->>'id',concat_ws(' · ',r.title,x->>'name'),x->>'notes','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.exercises) x
    union all select 'tasks',r.id,null,r.title,concat_ws(' ',r.description,coalesce((select string_agg(c->>'title',' ') from jsonb_array_elements(coalesce(r.checklist,'[]'::jsonb)) c),'')),'{}',r.created_at from public.work_tasks r join public.workspaces w on w.id=r.workspace_id
      where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and r.user_id=auth.uid() and r.deleted_at is null and 'tasks'=any(w.active_modules)
  ) select d.module,d.record_id,d.child_id,public.workspace_search_text(d.title),public.workspace_search_text(d.body),d.meta,d.created_at from docs d
$$;

-- 4. Faz 2: Unified Mutation RPCs (notes_mutate, code_mutate, plans_mutate, periodic_mutate, mutate_collection_items_batch)
create or replace function public.notes_mutate(
  wid uuid,
  entity text,
  operation text,
  rid uuid,
  payload jsonb default '{}'::jsonb,
  expected_version integer default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  note_row public.todos;
  cat_row public.categories;
  next_title text;
  next_desc text;
  next_priority public.todo_priority;
  next_cat uuid;
  next_due timestamptz;
  next_done boolean;
  mode_val text;
begin
  if uid is null or not public.session_mfa_satisfied() then raise exception 'NOTE_ACCESS_DENIED' using errcode='42501'; end if;
  if rid is null or payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 250000 then
    raise exception 'INVALID_NOTE_INPUT';
  end if;
  perform public.ensure_module_bindings(wid);
  select b.collection_id into cid from public.workspace_module_bindings b join public.workspaces w on w.id=b.workspace_id
    where w.id=wid and w.user_id=uid and w.archived_at is null and b.module='detailed';
  if cid is null or not public.collection_write(cid) then raise exception 'NOTE_ACCESS_DENIED' using errcode='42501'; end if;
  perform 1 from public.module_collections where id=cid for update;

  if entity = 'category' then
    if operation = 'delete' then
      return public.delete_note_category(wid, rid, expected_version);
    elsif operation = 'create' then
      select * into cat_row from public.categories where id=rid and collection_id=cid;
      if cat_row.id is not null then return to_jsonb(cat_row); end if;
      next_title := btrim(coalesce(payload->>'name', ''));
      if length(next_title) not between 1 and 80 then raise exception 'INVALID_NOTE_INPUT'; end if;
      insert into public.categories(id, created_by, workspace_id, collection_id, name, color, icon)
        values(rid, uid, wid, cid, next_title, coalesce(payload->>'color', '#3b82f6'), coalesce(payload->>'icon', 'folder'))
        returning * into cat_row;
      return to_jsonb(cat_row);
    elsif operation = 'update' then
      select * into cat_row from public.categories where id=rid and collection_id=cid for update;
      if cat_row.id is null then raise exception 'NOTE_UNAVAILABLE'; end if;
      if expected_version is not null and cat_row.version <> expected_version then raise exception 'SHARING_CONFLICT'; end if;
      next_title := btrim(coalesce(payload->>'name', cat_row.name));
      if length(next_title) not between 1 and 80 then raise exception 'INVALID_NOTE_INPUT'; end if;
      update public.categories set
        name = next_title,
        color = coalesce(payload->>'color', cat_row.color),
        icon = coalesce(payload->>'icon', cat_row.icon),
        updated_at = now()
      where id=rid returning * into cat_row;
      return to_jsonb(cat_row);
    else
      raise exception 'INVALID_NOTE_INPUT';
    end if;
  elsif entity = 'note' then
    if operation in ('move', 'restore', 'purge') then
      return public.trash_change(wid, 'detailed', rid, operation, expected_version);
    end if;
    select * into note_row from public.todos where id=rid for update;
    if note_row.id is not null and note_row.collection_id <> cid then
      raise exception 'NOTE_ACCESS_DENIED' using errcode='42501';
    end if;
    if operation = 'create' then
      if note_row.id is not null then
        if note_row.deleted_at is not null then raise exception 'SHARING_CONFLICT'; end if;
        return to_jsonb(note_row);
      end if;
      next_title := btrim(coalesce(payload->>'title', ''));
      next_desc := coalesce(payload->>'description', '');
      if length(next_title) not between 1 and 300 or length(next_desc) > 100000 then raise exception 'INVALID_NOTE_INPUT'; end if;
      next_priority := coalesce(nullif(payload->>'priority', ''), 'medium')::public.todo_priority;
      next_cat := nullif(payload->>'category_id', '')::uuid;
      if next_cat is not null and not exists(select 1 from public.categories c where c.id=next_cat and c.collection_id=cid) then
        next_cat := null;
      end if;
      next_due := nullif(payload->>'due_date', '')::timestamptz;
      next_done := coalesce((payload->>'completed')::boolean, false);
      insert into public.todos(id, created_by, workspace_id, collection_id, title, description, completed, category_id, priority, due_date)
        values(rid, uid, wid, cid, next_title, next_desc, next_done, next_cat, next_priority, next_due)
        returning * into note_row;
      return to_jsonb(note_row);
    elsif operation in ('update', 'append', 'prepend', 'insert_section', 'toggle') then
      if note_row.id is null or note_row.deleted_at is not null then raise exception 'NOTE_UNAVAILABLE'; end if;
      if expected_version is not null and note_row.version <> expected_version then raise exception 'SHARING_CONFLICT'; end if;
      next_title := case when payload ? 'title' then btrim(coalesce(payload->>'title', '')) else note_row.title end;
      if length(next_title) not between 1 and 300 then raise exception 'INVALID_NOTE_INPUT'; end if;
      mode_val := case when operation in ('append', 'prepend', 'insert_section') then operation else coalesce(payload->>'write_mode', 'replace') end;
      if payload ? 'description' or operation in ('append', 'prepend', 'insert_section') then
        next_desc := public.ai_apply_note_write_mode(
          note_row.description,
          coalesce(payload->>'description', payload->>'content', ''),
          mode_val,
          payload->>'section_heading',
          coalesce(payload->>'target_format', 'html')
        );
      else
        next_desc := note_row.description;
      end if;
      if length(coalesce(next_desc, '')) > 100000 then raise exception 'INVALID_NOTE_INPUT'; end if;
      next_priority := case when payload ? 'priority' and nullif(payload->>'priority', '') is not null then (payload->>'priority')::public.todo_priority else note_row.priority end;
      next_cat := case when payload ? 'category_id' then nullif(payload->>'category_id', '')::uuid else note_row.category_id end;
      if next_cat is not null and not exists(select 1 from public.categories c where c.id=next_cat and c.collection_id=cid) then
        next_cat := note_row.category_id;
      end if;
      next_due := case when payload ? 'due_date' then nullif(payload->>'due_date', '')::timestamptz else note_row.due_date end;
      next_done := case
        when operation = 'toggle' then not coalesce(note_row.completed, false)
        when payload ? 'completed' then coalesce((payload->>'completed')::boolean, false)
        else note_row.completed
      end;
      update public.todos set
        title = next_title,
        description = next_desc,
        completed = next_done,
        category_id = next_cat,
        priority = next_priority,
        due_date = next_due,
        updated_at = now()
      where id=rid returning * into note_row;
      return to_jsonb(note_row);
    else
      raise exception 'INVALID_NOTE_INPUT';
    end if;
  else
    raise exception 'INVALID_NOTE_INPUT';
  end if;
end $$;

revoke all on function public.notes_mutate(uuid, text, text, uuid, jsonb, integer) from public;
grant execute on function public.notes_mutate(uuid, text, text, uuid, jsonb, integer) to authenticated, service_role;

create or replace function public.code_mutate(
  wid uuid,
  operation text,
  rid uuid,
  payload jsonb default '{}'::jsonb,
  expected_version integer default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  row_rec public.code_snippets;
  next_title text;
  next_lang text;
  next_code text;
  mode_val text;
begin
  if uid is null or not public.session_mfa_satisfied() then raise exception 'CODE_ACCESS_DENIED' using errcode='42501'; end if;
  if rid is null or payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 250000 then
    raise exception 'INVALID_CODE_INPUT';
  end if;
  if operation in ('move', 'restore', 'purge') then
    return public.trash_change(wid, 'code', rid, operation, expected_version);
  end if;
  perform public.ensure_module_bindings(wid);
  select b.collection_id into cid from public.workspace_module_bindings b join public.workspaces w on w.id=b.workspace_id
    where w.id=wid and w.user_id=uid and w.archived_at is null and b.module='code';
  if cid is null or not public.collection_write(cid) then raise exception 'CODE_ACCESS_DENIED' using errcode='42501'; end if;
  perform 1 from public.module_collections where id=cid for update;
  select * into row_rec from public.code_snippets where id=rid for update;
  if row_rec.id is not null and row_rec.collection_id <> cid then raise exception 'CODE_ACCESS_DENIED' using errcode='42501'; end if;

  if operation = 'create' then
    if row_rec.id is not null then
      if row_rec.deleted_at is not null then raise exception 'SHARING_CONFLICT'; end if;
      return to_jsonb(row_rec);
    end if;
    next_title := btrim(coalesce(payload->>'title', ''));
    next_lang := btrim(coalesce(nullif(payload->>'language', ''), 'plaintext'));
    next_code := coalesce(payload->>'code', '');
    if length(next_title) not between 1 and 200 or length(next_lang) not between 1 and 60 or length(next_code) > 100000 then
      raise exception 'INVALID_CODE_INPUT';
    end if;
    insert into public.code_snippets(id, created_by, workspace_id, collection_id, title, language, code)
      values(rid, uid, wid, cid, next_title, next_lang, next_code)
      returning * into row_rec;
    return to_jsonb(row_rec);
  elsif operation in ('update', 'append', 'prepend') then
    if row_rec.id is null or row_rec.deleted_at is not null then raise exception 'CODE_UNAVAILABLE'; end if;
    if expected_version is not null and row_rec.version <> expected_version then raise exception 'SHARING_CONFLICT'; end if;
    next_title := case when payload ? 'title' then btrim(coalesce(payload->>'title', '')) else row_rec.title end;
    next_lang := case when payload ? 'language' then btrim(coalesce(nullif(payload->>'language', ''), 'plaintext')) else row_rec.language end;
    mode_val := case when operation in ('append', 'prepend') then operation else coalesce(payload->>'write_mode', 'replace') end;
    if payload ? 'code' or operation in ('append', 'prepend') then
      next_code := public.ai_apply_note_write_mode(row_rec.code, coalesce(payload->>'code', ''), mode_val, null, 'plain');
    else
      next_code := row_rec.code;
    end if;
    if length(next_title) not between 1 and 200 or length(next_lang) not between 1 and 60 or length(next_code) > 100000 then
      raise exception 'INVALID_CODE_INPUT';
    end if;
    update public.code_snippets set title=next_title, language=next_lang, code=next_code, updated_at=timezone('utc', now())
      where id=rid returning * into row_rec;
    return to_jsonb(row_rec);
  else
    raise exception 'INVALID_CODE_INPUT';
  end if;
end $$;

revoke all on function public.code_mutate(uuid, text, uuid, jsonb, integer) from public;
grant execute on function public.code_mutate(uuid, text, uuid, jsonb, integer) to authenticated, service_role;

create or replace function public.plans_mutate(
  wid uuid,
  operation text,
  rid uuid,
  payload jsonb default '{}'::jsonb,
  expected_version integer default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  source_mod text := coalesce(nullif(payload->>'source', ''), 'plans');
  cid uuid;
  plan_row public.plans;
  quick_row public.quick_notes;
  next_title text;
  next_notes text;
  next_period text;
  next_date date;
  next_done boolean;
  mode_val text;
begin
  if uid is null or not public.session_mfa_satisfied() or source_mod not in ('plans', 'quick') then
    raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';
  end if;
  if rid is null or payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 100000 then
    raise exception 'INVALID_PLAN_INPUT';
  end if;
  if operation in ('move', 'restore', 'purge') then
    return public.trash_change(wid, source_mod, rid, operation, expected_version);
  end if;
  perform public.ensure_module_bindings(wid);
  select b.collection_id into cid from public.workspace_module_bindings b join public.workspaces w on w.id=b.workspace_id
    where w.id=wid and w.user_id=uid and w.archived_at is null and 'plans'=any(w.active_modules) and b.module=source_mod;
  if cid is null or not public.collection_write(cid) then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501'; end if;
  perform 1 from public.module_collections where id=cid for update;

  if source_mod = 'quick' then
    select * into quick_row from public.quick_notes where id=rid and collection_id=cid and deleted_at is null for update;
    if quick_row.id is null then raise exception 'PLAN_UNAVAILABLE'; end if;
    if expected_version is not null and quick_row.version <> expected_version then raise exception 'SHARING_CONFLICT'; end if;
    next_title := case when payload ? 'title' then btrim(coalesce(payload->>'title', '')) else quick_row.content end;
    mode_val := case when operation in ('append', 'prepend', 'insert_section') then operation else coalesce(payload->>'write_mode', 'replace') end;
    if payload ? 'notes' or operation in ('notes', 'append', 'prepend', 'insert_section') then
      next_notes := public.ai_apply_note_write_mode(quick_row.notes, coalesce(payload->>'notes', ''), mode_val, payload->>'section_heading', 'plain');
    else
      next_notes := quick_row.notes;
    end if;
    next_done := case when operation = 'toggle' then not coalesce(quick_row.completed, false) when payload ? 'completed' then coalesce((payload->>'completed')::boolean, false) else quick_row.completed end;
    if length(next_title) not between 1 and 2000 or length(coalesce(next_notes, '')) > 20000 then raise exception 'INVALID_PLAN_INPUT'; end if;
    update public.quick_notes set content=next_title, notes=coalesce(next_notes, ''), completed=next_done, updated_at=now() where id=rid;
    return public.plan_entry_source(wid, 'quick', rid);
  else
    select * into plan_row from public.plans where id=rid for update;
    if plan_row.id is not null and plan_row.collection_id <> cid then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501'; end if;
    if operation = 'create' then
      if plan_row.id is not null then
        if plan_row.deleted_at is not null then raise exception 'SHARING_CONFLICT'; end if;
        return public.plan_entry_source(wid, 'plans', rid);
      end if;
      next_title := btrim(coalesce(payload->>'title', ''));
      next_period := coalesce(nullif(payload->>'period', ''), 'daily');
      next_date := case
        when next_period = 'timeless' then date '1970-01-01'
        when nullif(payload->>'period_date', '') is not null then (payload->>'period_date')::date
        when next_period = 'weekly' then date_trunc('week', current_date)::date
        when next_period = 'monthly' then date_trunc('month', current_date)::date
        when next_period = 'yearly' then date_trunc('year', current_date)::date
        else current_date
      end;
      next_notes := coalesce(payload->>'notes', '');
      next_done := coalesce((payload->>'completed')::boolean, false);
      if length(next_title) not between 1 and 500 or next_period not in ('timeless', 'daily', 'weekly', 'monthly', 'yearly') or length(next_notes) > 20000 then
        raise exception 'INVALID_PLAN_INPUT';
      end if;
      insert into public.plans(id, user_id, workspace_id, collection_id, title, period, period_date, completed, notes)
        values(rid, uid, wid, cid, next_title, next_period, next_date, next_done, next_notes);
      return public.plan_entry_source(wid, 'plans', rid);
    elsif operation in ('update', 'notes', 'toggle', 'append', 'prepend', 'insert_section') then
      if plan_row.id is null or plan_row.deleted_at is not null then raise exception 'PLAN_UNAVAILABLE'; end if;
      if expected_version is not null and plan_row.version <> expected_version then raise exception 'SHARING_CONFLICT'; end if;
      next_title := case when payload ? 'title' then btrim(coalesce(payload->>'title', '')) else plan_row.title end;
      next_period := case when payload ? 'period' then coalesce(nullif(payload->>'period', ''), plan_row.period) else plan_row.period end;
      next_date := case when next_period = 'timeless' then date '1970-01-01' when payload ? 'period_date' then coalesce(nullif(payload->>'period_date', '')::date, plan_row.period_date) else plan_row.period_date end;
      mode_val := case when operation in ('append', 'prepend', 'insert_section') then operation else coalesce(payload->>'write_mode', 'replace') end;
      if payload ? 'notes' or operation in ('notes', 'append', 'prepend', 'insert_section') then
        next_notes := public.ai_apply_note_write_mode(plan_row.notes, coalesce(payload->>'notes', ''), mode_val, payload->>'section_heading', 'plain');
      else
        next_notes := plan_row.notes;
      end if;
      next_done := case when operation = 'toggle' then not coalesce(plan_row.completed, false) when payload ? 'completed' then coalesce((payload->>'completed')::boolean, false) else plan_row.completed end;
      if length(next_title) not between 1 and 500 or next_period not in ('timeless', 'daily', 'weekly', 'monthly', 'yearly') or length(coalesce(next_notes, '')) > 20000 then
        raise exception 'INVALID_PLAN_INPUT';
      end if;
      update public.plans set title=next_title, period=next_period, period_date=next_date, completed=next_done, notes=coalesce(next_notes, '')
        where id=rid;
      return public.plan_entry_source(wid, 'plans', rid);
    else
      raise exception 'INVALID_PLAN_INPUT';
    end if;
  end if;
end $$;

revoke all on function public.plans_mutate(uuid, text, uuid, jsonb, integer) from public;
grant execute on function public.plans_mutate(uuid, text, uuid, jsonb, integer) to authenticated, service_role;

create or replace function public.periodic_mutate(
  wid uuid,
  operation text,
  rid uuid,
  payload jsonb default '{}'::jsonb,
  expected_version integer default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  task_row public.periodic_tasks;
  next_title text;
  next_freq text;
  next_cat text;
  next_notes text;
  next_days integer[];
  next_completed date;
  mode_val text;
begin
  if uid is null or not public.session_mfa_satisfied() then raise exception 'PERIODIC_ACCESS_DENIED' using errcode='42501'; end if;
  if rid is null or payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 50000 then
    raise exception 'INVALID_PERIODIC_INPUT';
  end if;
  if operation in ('move', 'restore', 'purge') then
    return public.trash_change(wid, 'periodic', rid, operation, expected_version);
  end if;
  perform public.ensure_module_bindings(wid);
  select b.collection_id into cid from public.workspace_module_bindings b join public.workspaces w on w.id=b.workspace_id
    where w.id=wid and w.user_id=uid and w.archived_at is null and b.module='periodic';
  if cid is null or not public.collection_write(cid) then raise exception 'PERIODIC_ACCESS_DENIED' using errcode='42501'; end if;
  perform 1 from public.module_collections where id=cid for update;
  select * into task_row from public.periodic_tasks where id=rid for update;
  if task_row.id is not null and task_row.collection_id <> cid then raise exception 'PERIODIC_ACCESS_DENIED' using errcode='42501'; end if;

  if operation = 'create' then
    if task_row.id is not null then
      if task_row.deleted_at is not null then raise exception 'SHARING_CONFLICT'; end if;
      return to_jsonb(task_row);
    end if;
    next_title := btrim(coalesce(payload->>'title', ''));
    next_freq := coalesce(nullif(payload->>'frequency', ''), 'daily');
    next_cat := coalesce(nullif(payload->>'category', ''), 'other');
    next_notes := nullif(coalesce(payload->>'notes', ''), '');
    if length(next_title) not between 1 and 240
      or next_freq not in ('daily', 'weekly', 'monthly', 'yearly', 'custom')
      or next_cat not in ('work', 'health', 'habit', 'goal', 'other')
      or length(coalesce(next_notes, '')) > 10000 then
      raise exception 'INVALID_PERIODIC_INPUT';
    end if;
    if payload ? 'days_of_week' and jsonb_typeof(payload->'days_of_week') = 'array' then
      select coalesce(array_agg(value::integer), array[0,1,2,3,4,5,6]) into next_days from jsonb_array_elements_text(payload->'days_of_week');
    else
      next_days := array[0,1,2,3,4,5,6];
    end if;
    insert into public.periodic_tasks(
      id, user_id, workspace_id, collection_id, title, frequency, days_of_week, category, notes,
      day_of_month, month_of_year, interval_days, anchor_date
    ) values (
      rid, uid, wid, cid, next_title, next_freq, next_days, next_cat, next_notes,
      coalesce((payload->>'day_of_month')::integer, 1),
      coalesce((payload->>'month_of_year')::integer, 1),
      coalesce((payload->>'interval_days')::integer, 2),
      coalesce(nullif(payload->>'anchor_date', '')::date, current_date)
    ) returning * into task_row;
    return to_jsonb(task_row);
  elsif operation in ('update', 'notes', 'toggle', 'append', 'prepend', 'insert_section') then
    if task_row.id is null or task_row.deleted_at is not null then raise exception 'PERIODIC_UNAVAILABLE'; end if;
    if expected_version is not null and task_row.version <> expected_version then raise exception 'SHARING_CONFLICT'; end if;
    next_title := case when payload ? 'title' then btrim(coalesce(payload->>'title', '')) else task_row.title end;
    next_freq := case when payload ? 'frequency' then coalesce(nullif(payload->>'frequency', ''), task_row.frequency) else task_row.frequency end;
    next_cat := case when payload ? 'category' then coalesce(nullif(payload->>'category', ''), task_row.category) else task_row.category end;
    mode_val := case when operation in ('append', 'prepend', 'insert_section') then operation else coalesce(payload->>'write_mode', 'replace') end;
    if payload ? 'notes' or operation in ('notes', 'append', 'prepend', 'insert_section') then
      next_notes := nullif(public.ai_apply_note_write_mode(task_row.notes, coalesce(payload->>'notes', ''), mode_val, payload->>'section_heading', 'plain'), '');
    else
      next_notes := task_row.notes;
    end if;
    if operation = 'toggle' then
      next_completed := case when task_row.completed_date is null then current_date else null end;
    elsif payload ? 'completed_date' then
      next_completed := nullif(payload->>'completed_date', '')::date;
    else
      next_completed := task_row.completed_date;
    end if;
    if length(next_title) not between 1 and 240
      or next_freq not in ('daily', 'weekly', 'monthly', 'yearly', 'custom')
      or next_cat not in ('work', 'health', 'habit', 'goal', 'other')
      or length(coalesce(next_notes, '')) > 10000 then
      raise exception 'INVALID_PERIODIC_INPUT';
    end if;
    update public.periodic_tasks set
      title = next_title,
      frequency = next_freq,
      category = next_cat,
      notes = next_notes,
      completed_date = next_completed,
      updated_at = timezone('utc', now())
    where id=rid returning * into task_row;
    return to_jsonb(task_row);
  else
    raise exception 'INVALID_PERIODIC_INPUT';
  end if;
end $$;

revoke all on function public.periodic_mutate(uuid, text, uuid, jsonb, integer) from public;
grant execute on function public.periodic_mutate(uuid, text, uuid, jsonb, integer) to authenticated, service_role;

create or replace function public.mutate_collection_items_batch(
  wid uuid,
  module_id text,
  pid uuid,
  operations jsonb,
  expected_version integer default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  op jsonb;
  result jsonb;
begin
  if uid is null or not public.session_mfa_satisfied() or module_id not in ('learning', 'flashcards', 'workout') then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  if pid is null or operations is null or jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) not between 1 and 50 then
    raise exception 'INVALID_BATCH_OPERATIONS';
  end if;
  perform public.ensure_module_bindings(wid);
  select b.collection_id into cid from public.workspace_module_bindings b join public.workspaces w on w.id=b.workspace_id
    where w.id=wid and w.user_id=uid and w.archived_at is null and b.module=module_id;
  if cid is null or not public.collection_write(cid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  for op in select value from jsonb_array_elements(operations) loop
    result := public.mutate_collection_item(
      cid,
      pid,
      module_id,
      coalesce(op->>'operation', 'add'),
      coalesce(op->'item', '{}'::jsonb),
      case when op ? 'expected_version' and jsonb_typeof(op->'expected_version') = 'number' then (op->>'expected_version')::integer else expected_version end
    );
  end loop;
  return result;
end $$;

revoke all on function public.mutate_collection_items_batch(uuid, text, uuid, jsonb, integer) from public;
grant execute on function public.mutate_collection_items_batch(uuid, text, uuid, jsonb, integer) to authenticated, service_role;

-- 5. Faz 3: AI Read & Cross-Module Analysis RPCs (ai_workspace_digest, ai_read_records)
create or replace function public.ai_workspace_digest(wid uuid, options jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  ws public.workspaces;
  plans_cid uuid;
  quick_cid uuid;
  detailed_cid uuid;
  periodic_cid uuid;
  learning_cid uuid;
  flashcards_cid uuid;
  workout_cid uuid;
  activities_cid uuid;
  code_cid uuid;
  plans_summary jsonb := '{}'::jsonb;
  tasks_summary jsonb := '{}'::jsonb;
  calendar_summary jsonb := '{}'::jsonb;
  detailed_summary jsonb := '{}'::jsonb;
  periodic_summary jsonb := '{}'::jsonb;
  learning_summary jsonb := '{}'::jsonb;
  flashcards_summary jsonb := '{}'::jsonb;
  workout_summary jsonb := '{}'::jsonb;
  activities_summary jsonb := '{}'::jsonb;
  code_summary jsonb := '{}'::jsonb;
  finance_summary_data jsonb := '{}'::jsonb;
  focus_summary jsonb := '{}'::jsonb;
  signals jsonb := '{}'::jsonb;
  month_anchor date := date_trunc('month', current_date)::date;
begin
  if uid is null or not public.session_mfa_satisfied() then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  select * into ws from public.workspaces where id=wid and user_id=uid and archived_at is null;
  if ws.id is null then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;

  select collection_id into plans_cid from public.workspace_module_bindings where workspace_id=wid and module='plans';
  select collection_id into quick_cid from public.workspace_module_bindings where workspace_id=wid and module='quick';
  select collection_id into detailed_cid from public.workspace_module_bindings where workspace_id=wid and module='detailed';
  select collection_id into periodic_cid from public.workspace_module_bindings where workspace_id=wid and module='periodic';
  select collection_id into learning_cid from public.workspace_module_bindings where workspace_id=wid and module='learning';
  select collection_id into flashcards_cid from public.workspace_module_bindings where workspace_id=wid and module='flashcards';
  select collection_id into workout_cid from public.workspace_module_bindings where workspace_id=wid and module='workout';
  select collection_id into activities_cid from public.workspace_module_bindings where workspace_id=wid and module='activities';
  select collection_id into code_cid from public.workspace_module_bindings where workspace_id=wid and module='code';

  if 'plans' = any(ws.active_modules) and plans_cid is not null and public.collection_access(plans_cid) then
    select jsonb_build_object(
      'active_count', count(*) filter (where not completed),
      'completed_count', count(*) filter (where completed),
      'carried_count', count(*) filter (where not completed and jsonb_array_length(coalesce(history, '[]'::jsonb)) > 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id, 'title', x.title, 'period', x.period, 'period_date', x.period_date,
          'completed', x.completed, 'notes_preview', left(public.workspace_search_text(x.notes), 240),
          'carry_count', jsonb_array_length(coalesce(x.history, '[]'::jsonb)), 'version', x.version, 'source', 'plans'
        ) order by x.completed, x.created_at desc)
        from (select * from public.plans where collection_id=plans_cid and deleted_at is null order by completed, created_at desc limit 25) x
      ), '[]'::jsonb)
    ) into plans_summary from public.plans where collection_id=plans_cid and deleted_at is null;
  end if;

  if 'tasks' = any(ws.active_modules) then
    select jsonb_build_object(
      'counts', jsonb_build_object(
        'todo', count(*) filter (where status='todo'),
        'doing', count(*) filter (where status='doing'),
        'done', count(*) filter (where status='done'),
        'overdue', count(*) filter (where status<>'done' and due_on < current_date),
        'high_priority_open', count(*) filter (where status<>'done' and priority='high')
      ),
      'projects', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'archived', p.archived, 'version', p.version) order by p.created_at)
        from public.work_projects p where p.workspace_id=wid and p.user_id=uid and not p.archived
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'title', t.title, 'status', t.status, 'priority', t.priority,
          'due_on', t.due_on, 'estimate_minutes', t.estimate_minutes, 'project_id', t.project_id,
          'description_preview', left(public.workspace_search_text(t.description), 240),
          'checklist_total', jsonb_array_length(coalesce(t.checklist, '[]'::jsonb)),
          'checklist_done', (select count(*) from jsonb_array_elements(coalesce(t.checklist, '[]'::jsonb)) c where (c->>'done')::boolean),
          'version', t.version
        ) order by (t.status='done'), t.due_on nulls last, t.created_at desc)
        from (select * from public.work_tasks where workspace_id=wid and user_id=uid and deleted_at is null order by (status='done'), due_on nulls last, created_at desc limit 25) t
      ), '[]'::jsonb)
    ) into tasks_summary from public.work_tasks where workspace_id=wid and user_id=uid and deleted_at is null;
  end if;

  if ('calendar' = any(ws.active_modules) or 'tasks' = any(ws.active_modules)) then
    select jsonb_build_object(
      'upcoming_blocks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'title', b.title, 'task_id', b.task_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'timezone', b.timezone, 'version', b.version
        ) order by b.starts_at)
        from (
          select * from public.work_blocks
          where workspace_id=wid and user_id=uid and deleted_at is null
            and ends_at >= now() - interval '1 day' and starts_at <= now() + interval '7 days'
          order by starts_at limit 20
        ) b
      ), '[]'::jsonb)
    ) into calendar_summary;
  end if;

  if 'detailed' = any(ws.active_modules) and detailed_cid is not null and public.collection_access(detailed_cid) then
    select jsonb_build_object(
      'total_count', count(*),
      'empty_count', count(*) filter (where btrim(public.workspace_search_text(description)) = ''),
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'version', c.version) order by c.created_at)
        from public.categories c where c.collection_id=detailed_cid
      ), '[]'::jsonb),
      'recent_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', n.id, 'title', n.title, 'category_id', n.category_id, 'priority', n.priority,
          'completed', n.completed, 'due_date', n.due_date,
          'preview', left(public.workspace_search_text(n.description), 280),
          'updated_at', n.updated_at, 'version', n.version
        ) order by n.updated_at desc nulls last, n.created_at desc)
        from (select * from public.todos where collection_id=detailed_cid and deleted_at is null order by updated_at desc nulls last, created_at desc limit 20) n
      ), '[]'::jsonb)
    ) into detailed_summary from public.todos where collection_id=detailed_cid and deleted_at is null;
  end if;

  if 'periodic' = any(ws.active_modules) and periodic_cid is not null and public.collection_access(periodic_cid) then
    select jsonb_build_object(
      'total_count', count(*),
      'pending_today_count', count(*) filter (where completed_date is distinct from current_date),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'title', p.title, 'frequency', p.frequency, 'category', p.category,
          'completed_date', p.completed_date, 'notes_preview', left(public.workspace_search_text(p.notes), 200),
          'version', p.version
        ) order by p.created_at desc)
        from (select * from public.periodic_tasks where collection_id=periodic_cid and deleted_at is null order by created_at desc limit 20) p
      ), '[]'::jsonb)
    ) into periodic_summary from public.periodic_tasks where collection_id=periodic_cid and deleted_at is null;
  end if;

  if 'learning' = any(ws.active_modules) and learning_cid is not null and public.collection_access(learning_cid) then
    select jsonb_build_object(
      'subjects_count', (select count(*) from public.learning_subjects where collection_id=learning_cid and deleted_at is null),
      'due_reviews_count', (
        select count(*) from public.learning_progress lp
        join public.learning_subjects ls on ls.id=lp.subject_id
        where lp.user_id=uid and ls.collection_id=learning_cid and ls.deleted_at is null and lp.review_on <= current_date
      ),
      'open_mistakes_count', (
        select count(*) from public.learning_mistakes lm
        join public.learning_subjects ls on ls.id=lm.subject_id
        where lm.user_id=uid and lm.workspace_id=wid and ls.collection_id=learning_cid and ls.deleted_at is null and lm.deleted_at is null and not lm.resolved
      ),
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'title', s.title, 'color', s.color, 'version', s.version,
          'topics', coalesce((
            select jsonb_agg(jsonb_build_object('id', t->>'id', 'title', t->>'title', 'archived', coalesce((t->>'archived')::boolean, false)))
            from jsonb_array_elements(coalesce(s.topics, '[]'::jsonb)) t
          ), '[]'::jsonb)
        ) order by s.position, s.created_at)
        from public.learning_subjects s where s.collection_id=learning_cid and s.deleted_at is null
      ), '[]'::jsonb),
      'open_mistakes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'subject_id', m.subject_id, 'topic_id', m.topic_id,
          'prompt_preview', left(public.workspace_search_text(m.prompt), 220),
          'solution_preview', left(public.workspace_search_text(m.solution), 220),
          'source', m.source, 'reason', m.reason, 'review_on', m.review_on, 'version', m.version
        ) order by m.created_at desc)
        from (
          select lm.* from public.learning_mistakes lm
          join public.learning_subjects ls on ls.id=lm.subject_id
          where lm.user_id=uid and lm.workspace_id=wid and ls.collection_id=learning_cid and ls.deleted_at is null and lm.deleted_at is null and not lm.resolved
          order by lm.created_at desc limit 15
        ) m
      ), '[]'::jsonb)
    ) into learning_summary;
  end if;

  if 'flashcards' = any(ws.active_modules) and flashcards_cid is not null and public.collection_access(flashcards_cid) then
    select jsonb_build_object(
      'decks_count', count(*),
      'total_cards_count', coalesce(sum(jsonb_array_length(coalesce(cards, '[]'::jsonb))), 0),
      'decks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id, 'title', d.title, 'color', d.color,
          'card_count', jsonb_array_length(coalesce(d.cards, '[]'::jsonb)), 'version', d.version
        ) order by d.created_at desc)
        from (select * from public.flashcard_decks where collection_id=flashcards_cid and deleted_at is null order by created_at desc limit 15) d
      ), '[]'::jsonb)
    ) into flashcards_summary from public.flashcard_decks where collection_id=flashcards_cid and deleted_at is null;
  end if;

  if 'workout' = any(ws.active_modules) and workout_cid is not null and public.collection_access(workout_cid) then
    select jsonb_build_object(
      'routines_count', count(*),
      'routines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'title', r.title, 'day_of_week', r.day_of_week,
          'exercise_count', jsonb_array_length(coalesce(r.exercises, '[]'::jsonb)), 'version', r.version
        ) order by r.created_at desc)
        from (select * from public.workout_routines where collection_id=workout_cid and deleted_at is null order by created_at desc limit 15) r
      ), '[]'::jsonb)
    ) into workout_summary from public.workout_routines where collection_id=workout_cid and deleted_at is null;
  end if;

  if 'activities' = any(ws.active_modules) and activities_cid is not null and public.collection_access(activities_cid) then
    select jsonb_build_object(
      'want_count', count(*) filter (where status='want'),
      'done_count', count(*) filter (where status='done'),
      'recent_items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'type', a.type, 'title', a.title, 'subtitle', a.subtitle, 'status', a.status,
          'notes_preview', left(public.workspace_search_text(a.notes), 200), 'version', a.version
        ) order by a.created_at desc)
        from (select * from public.activity_items where collection_id=activities_cid and deleted_at is null order by created_at desc limit 15) a
      ), '[]'::jsonb)
    ) into activities_summary from public.activity_items where collection_id=activities_cid and deleted_at is null;
  end if;

  if 'code' = any(ws.active_modules) and code_cid is not null and public.collection_access(code_cid) then
    select jsonb_build_object(
      'total_count', count(*),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'language', s.language, 'version', s.version) order by s.updated_at desc)
        from (select * from public.code_snippets where collection_id=code_cid and deleted_at is null order by updated_at desc limit 15) s
      ), '[]'::jsonb)
    ) into code_summary from public.code_snippets where collection_id=code_cid and deleted_at is null;
  end if;

  if 'finance' = any(ws.active_modules) then
    select jsonb_build_object(
      'currency', coalesce((select currency from public.finance_settings where workspace_id=wid), 'TRY'),
      'month_income', coalesce(sum(amount) filter (where kind='income' and occurred_on >= month_anchor and occurred_on < month_anchor + interval '1 month'), 0),
      'month_expense', coalesce(sum(amount) filter (where kind='expense' and occurred_on >= month_anchor and occurred_on < month_anchor + interval '1 month'), 0),
      'recent_transactions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'title', t.title, 'kind', t.kind, 'category', t.category,
          'amount', t.amount, 'occurred_on', t.occurred_on,
          'note', left(public.workspace_search_text(t.note), 200), 'version', t.version
        ) order by t.occurred_on desc, t.created_at desc)
        from (select * from public.finance_transactions where workspace_id=wid and user_id=uid order by occurred_on desc, created_at desc limit 15) t
      ), '[]'::jsonb)
    ) into finance_summary_data from public.finance_transactions where workspace_id=wid and user_id=uid;
  end if;

  select jsonb_build_object(
    'completed_sessions_7d', count(*) filter (where status='completed' and credited_completed and started_at >= now() - interval '7 days'),
    'total_sessions_7d', count(*) filter (where started_at >= now() - interval '7 days')
  ) into focus_summary from public.analytics_focus_sessions where user_id=uid and workspace_id=wid;

  signals := jsonb_build_object(
    'overdue_tasks_count', coalesce((tasks_summary->'counts'->>'overdue')::integer, 0),
    'high_priority_open_tasks_count', coalesce((tasks_summary->'counts'->>'high_priority_open')::integer, 0),
    'carried_plans_count', coalesce((plans_summary->>'carried_count')::integer, 0),
    'pending_periodic_today_count', coalesce((periodic_summary->>'pending_today_count')::integer, 0),
    'open_mistakes_count', coalesce((learning_summary->>'open_mistakes_count')::integer, 0),
    'due_reviews_count', coalesce((learning_summary->>'due_reviews_count')::integer, 0),
    'empty_notes_count', coalesce((detailed_summary->>'empty_count')::integer, 0)
  );

  return jsonb_build_object(
    'workspace', jsonb_build_object('id', ws.id, 'name', ws.name, 'active_modules', ws.active_modules, 'generated_at', clock_timestamp()),
    'plans', plans_summary,
    'tasks', tasks_summary,
    'calendar', calendar_summary,
    'detailed_notes', detailed_summary,
    'periodic', periodic_summary,
    'learning', learning_summary,
    'flashcards', flashcards_summary,
    'workout', workout_summary,
    'activities', activities_summary,
    'code', code_summary,
    'finance', finance_summary_data,
    'focus_stats', focus_summary,
    'recommendations_signals', signals
  );
end $$;

revoke all on function public.ai_workspace_digest(uuid, jsonb) from public;
grant execute on function public.ai_workspace_digest(uuid, jsonb) to authenticated, service_role;

create or replace function public.ai_read_records(wid uuid, targets jsonb) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  ws public.workspaces;
  target jsonb;
  mod_name text;
  rec_id uuid;
  cid uuid;
  row_json jsonb;
  items jsonb := '[]'::jsonb;
begin
  if uid is null or not public.session_mfa_satisfied() then raise exception 'AI_ACCESS_DENIED' using errcode='42501'; end if;
  select * into ws from public.workspaces where id=wid and user_id=uid and archived_at is null;
  if ws.id is null then raise exception 'AI_ACCESS_DENIED' using errcode='42501'; end if;
  if targets is null or jsonb_typeof(targets) <> 'array' or jsonb_array_length(targets) not between 1 and 25 then
    raise exception 'INVALID_AI_TARGETS';
  end if;

  for target in select value from jsonb_array_elements(targets) loop
    mod_name := coalesce(target->>'module', '');
    if mod_name = 'secure' then
      raise exception 'AI_SECURE_MODULE_FORBIDDEN' using errcode='42501';
    end if;
    rec_id := nullif(target->>'id', '')::uuid;
    if rec_id is null then continue; end if;
    row_json := null;

    if mod_name = 'detailed' and 'detailed' = any(ws.active_modules) then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='detailed';
      if cid is not null and public.collection_access(cid) then
        select jsonb_build_object(
          'module', 'detailed', 'id', t.id, 'title', t.title, 'description', t.description,
          'plain_text', public.workspace_search_text(t.description), 'completed', t.completed,
          'priority', t.priority, 'category_id', t.category_id, 'due_date', t.due_date, 'version', t.version
        ) into row_json from public.todos t where t.id=rec_id and t.collection_id=cid and t.deleted_at is null;
      end if;
    elsif mod_name in ('plans', 'quick') and 'plans' = any(ws.active_modules) then
      row_json := public.plan_entry_source(wid, mod_name, rec_id);
    elsif mod_name = 'tasks' and 'tasks' = any(ws.active_modules) then
      select jsonb_build_object(
        'module', 'tasks', 'id', t.id, 'title', t.title, 'description', t.description,
        'status', t.status, 'priority', t.priority, 'due_on', t.due_on,
        'estimate_minutes', t.estimate_minutes, 'project_id', t.project_id,
        'checklist', t.checklist, 'version', t.version
      ) into row_json from public.work_tasks t where t.id=rec_id and t.workspace_id=wid and t.user_id=uid and t.deleted_at is null;
    elsif mod_name = 'periodic' and 'periodic' = any(ws.active_modules) then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='periodic';
      if cid is not null and public.collection_access(cid) then
        select jsonb_build_object(
          'module', 'periodic', 'id', p.id, 'title', p.title, 'frequency', p.frequency,
          'category', p.category, 'notes', coalesce(p.notes, ''), 'completed_date', p.completed_date, 'version', p.version
        ) into row_json from public.periodic_tasks p where p.id=rec_id and p.collection_id=cid and p.deleted_at is null;
      end if;
    elsif mod_name = 'code' and 'code' = any(ws.active_modules) then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='code';
      if cid is not null and public.collection_access(cid) then
        select jsonb_build_object(
          'module', 'code', 'id', c.id, 'title', c.title, 'language', c.language, 'code', c.code, 'version', c.version
        ) into row_json from public.code_snippets c where c.id=rec_id and c.collection_id=cid and c.deleted_at is null;
      end if;
    elsif mod_name = 'learning' and 'learning' = any(ws.active_modules) then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='learning';
      if cid is not null and public.collection_access(cid) then
        select jsonb_build_object(
          'module', 'learning', 'id', s.id, 'title', s.title, 'color', s.color, 'topics', s.topics, 'version', s.version
        ) into row_json from public.learning_subjects s where s.id=rec_id and s.collection_id=cid and s.deleted_at is null;
        if row_json is null then
          select jsonb_build_object(
            'module', 'learning_mistake', 'id', m.id, 'subject_id', m.subject_id, 'topic_id', m.topic_id,
            'prompt', m.prompt, 'solution', m.solution, 'source', m.source, 'reason', m.reason,
            'resolved', m.resolved, 'version', m.version
          ) into row_json from public.learning_mistakes m where m.id=rec_id and m.workspace_id=wid and m.user_id=uid and m.deleted_at is null;
        end if;
      end if;
    elsif mod_name = 'flashcards' and 'flashcards' = any(ws.active_modules) then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='flashcards';
      if cid is not null and public.collection_access(cid) then
        select jsonb_build_object(
          'module', 'flashcards', 'id', d.id, 'title', d.title, 'color', d.color, 'cards', d.cards, 'version', d.version
        ) into row_json from public.flashcard_decks d where d.id=rec_id and d.collection_id=cid and d.deleted_at is null;
      end if;
    elsif mod_name = 'workout' and 'workout' = any(ws.active_modules) then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='workout';
      if cid is not null and public.collection_access(cid) then
        select jsonb_build_object(
          'module', 'workout', 'id', r.id, 'title', r.title, 'day_of_week', r.day_of_week, 'exercises', r.exercises, 'version', r.version
        ) into row_json from public.workout_routines r where r.id=rec_id and r.collection_id=cid and r.deleted_at is null;
      end if;
    elsif mod_name = 'activities' and 'activities' = any(ws.active_modules) then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='activities';
      if cid is not null and public.collection_access(cid) then
        select jsonb_build_object(
          'module', 'activities', 'id', a.id, 'type', a.type, 'title', a.title, 'subtitle', a.subtitle,
          'status', a.status, 'notes', coalesce(a.notes, ''), 'version', a.version
        ) into row_json from public.activity_items a where a.id=rec_id and a.collection_id=cid and a.deleted_at is null;
      end if;
    elsif mod_name = 'finance' and 'finance' = any(ws.active_modules) then
      select jsonb_build_object(
        'module', 'finance', 'id', f.id, 'title', f.title, 'kind', f.kind, 'category', f.category,
        'amount', f.amount, 'occurred_on', f.occurred_on, 'note', coalesce(f.note, ''), 'version', f.version
      ) into row_json from public.finance_transactions f where f.id=rec_id and f.workspace_id=wid and f.user_id=uid;
    end if;

    if row_json is not null then
      items := items || jsonb_build_array(row_json);
    end if;
  end loop;

  return jsonb_build_object('items', items);
end $$;

revoke all on function public.ai_read_records(uuid, jsonb) from public;
grant execute on function public.ai_read_records(uuid, jsonb) to authenticated, service_role;

-- 6. Faz 4: AI Write, Snapshot Audit & Undo Infrastructure
create table if not exists public.ai_action_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null default '' check (length(prompt) <= 10000),
  provider text not null default 'local' check (provider in ('local', 'gemini', 'openai', 'anthropic')),
  model text not null default '' check (length(model) <= 120),
  write_mode text not null default 'ask_before_write' check (write_mode in ('ask_before_write', 'auto_apply')),
  status text not null default 'applied' check (status in ('applied', 'undone', 'failed')),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  before_snapshots jsonb not null default '[]'::jsonb check (jsonb_typeof(before_snapshots) = 'array'),
  after_snapshots jsonb not null default '[]'::jsonb check (jsonb_typeof(after_snapshots) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  undone_at timestamptz
);

create index if not exists ai_action_runs_workspace_created_idx
  on public.ai_action_runs(workspace_id, user_id, created_at desc);

alter table public.ai_action_runs enable row level security;

drop policy if exists require_verified_mfa on public.ai_action_runs;
create policy require_verified_mfa on public.ai_action_runs as restrictive for all to authenticated
  using (public.session_mfa_satisfied())
  with check (public.session_mfa_satisfied());

drop policy if exists ai_action_runs_owner_select on public.ai_action_runs;
create policy ai_action_runs_owner_select on public.ai_action_runs for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.ai_action_runs from public, anon, authenticated;
grant select on table public.ai_action_runs to authenticated;
grant all on table public.ai_action_runs to service_role;

create or replace function public.ai_execute_actions(
  wid uuid,
  actions jsonb,
  meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  ws public.workspaces;
  run_id uuid := coalesce(nullif(meta->>'run_id', '')::uuid, gen_random_uuid());
  act jsonb;
  mod_name text;
  op_name text;
  target_id uuid;
  payload jsonb;
  exp_ver integer;
  write_mode text;
  section_heading text;
  cid uuid;
  before_row jsonb;
  after_row jsonb;
  before_list jsonb := '[]'::jsonb;
  after_list jsonb := '[]'::jsonb;
  results_list jsonb := '[]'::jsonb;
  existing_desc text;
  merged_desc text;
  deck_row public.flashcard_decks;
  routine_row public.workout_routines;
  mistake_row public.learning_mistakes;
  subject_id uuid;
  topic_id text;
  child_item jsonb;
begin
  if uid is null or not public.session_mfa_satisfied() then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  select * into ws from public.workspaces where id=wid and user_id=uid and archived_at is null for update;
  if ws.id is null then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  if actions is null or jsonb_typeof(actions) <> 'array' or jsonb_array_length(actions) not between 1 and 25 then
    raise exception 'INVALID_AI_ACTIONS';
  end if;
  perform public.ensure_module_bindings(wid);

  for act in select value from jsonb_array_elements(actions) loop
    mod_name := coalesce(act->>'module', '');
    op_name := coalesce(act->>'operation', 'create');
    if mod_name = 'secure' then
      raise exception 'AI_SECURE_MODULE_FORBIDDEN' using errcode='42501';
    end if;
    target_id := coalesce(nullif(act->>'target_id', '')::uuid, nullif(act->'payload'->>'id', '')::uuid, gen_random_uuid());
    payload := coalesce(act->'payload', '{}'::jsonb);
    write_mode := coalesce(nullif(act->>'write_mode', ''), nullif(payload->>'write_mode', ''), 'replace');
    section_heading := coalesce(act->>'section_heading', payload->>'section_heading');
    exp_ver := case when act ? 'expected_version' and jsonb_typeof(act->'expected_version') = 'number' then (act->>'expected_version')::integer else null end;
    payload := payload || jsonb_build_object('write_mode', write_mode);
    if section_heading is not null then
      payload := payload || jsonb_build_object('section_heading', section_heading);
    end if;

    before_row := null;
    after_row := null;

    if mod_name = 'detailed' then
      if coalesce(act->>'entity', 'note') = 'category' then
        select to_jsonb(c) into before_row from public.categories c where c.id=target_id;
        after_row := public.notes_mutate(wid, 'category', op_name, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
        before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'detailed_category', 'table', 'categories', 'id', target_id, 'existed', before_row is not null, 'row', before_row));
      else
        select to_jsonb(t) into before_row from public.todos t where t.id=target_id;
        after_row := public.notes_mutate(wid, 'note', op_name, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
        before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'detailed', 'table', 'todos', 'id', target_id, 'existed', before_row is not null, 'row', before_row));
      end if;

    elsif mod_name in ('plans', 'quick') then
      if mod_name = 'quick' or coalesce(payload->>'source', '') = 'quick' then
        select to_jsonb(q) into before_row from public.quick_notes q where q.id=target_id;
        after_row := public.plans_mutate(wid, op_name, target_id, payload || jsonb_build_object('source', 'quick'), coalesce(exp_ver, (before_row->>'version')::integer));
        before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'quick', 'table', 'quick_notes', 'id', target_id, 'existed', before_row is not null, 'row', before_row));
      else
        select to_jsonb(p) into before_row from public.plans p where p.id=target_id;
        after_row := public.plans_mutate(wid, op_name, target_id, payload || jsonb_build_object('source', 'plans'), coalesce(exp_ver, (before_row->>'version')::integer));
        before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'plans', 'table', 'plans', 'id', target_id, 'existed', before_row is not null, 'row', before_row));
      end if;

    elsif mod_name = 'tasks' then
      select to_jsonb(t) into before_row from public.work_tasks t where t.id=target_id and t.workspace_id=wid and t.user_id=uid;
      if before_row is not null and (op_name in ('append', 'prepend', 'insert_section') or write_mode <> 'replace') and (payload ? 'description' or payload ? 'notes') then
        existing_desc := coalesce(before_row->>'description', '');
        merged_desc := public.ai_apply_note_write_mode(existing_desc, coalesce(payload->>'description', payload->>'notes', ''), case when op_name in ('append','prepend','insert_section') then op_name else write_mode end, section_heading, 'plain');
        payload := (payload - 'write_mode' - 'section_heading' - 'notes') || jsonb_build_object('description', merged_desc);
        op_name := 'update';
      else
        payload := (payload - 'write_mode' - 'section_heading' - 'notes') || case when payload ? 'notes' and not (payload ? 'description') then jsonb_build_object('description', payload->>'notes') else '{}'::jsonb end;
        if op_name in ('append', 'prepend', 'insert_section') then
          op_name := case when before_row is null then 'create' else 'update' end;
        end if;
      end if;
      after_row := public.work_mutate(wid, 'task', op_name, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'tasks', 'table', 'work_tasks', 'id', target_id, 'existed', before_row is not null, 'row', before_row));
      if op_name = 'update' and payload ? 'title' then
        declare
          lb_rec record;
        begin
          for lb_rec in
            select to_jsonb(b) as row_json, b.id as block_id, b.version as block_ver
            from public.work_blocks b
            where b.task_id = target_id
              and b.workspace_id = wid
              and b.user_id = uid
              and b.deleted_at is null
              and btrim(b.title) <> ''
          loop
            before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'calendar', 'table', 'work_blocks', 'id', lb_rec.block_id, 'existed', true, 'row', lb_rec.row_json));
            perform public.work_mutate(wid, 'block', 'update', lb_rec.block_id, jsonb_build_object('title', ''), lb_rec.block_ver);
          end loop;
        end;
      end if;

    elsif mod_name = 'calendar' then
      select to_jsonb(b) into before_row from public.work_blocks b where b.id=target_id and b.workspace_id=wid and b.user_id=uid;
      payload := payload - 'write_mode' - 'section_heading';
      if before_row is not null and nullif(before_row->>'task_id', '') is not null and payload ? 'title' and op_name = 'update' then
        declare
          parent_task jsonb;
          parent_id uuid := (before_row->>'task_id')::uuid;
        begin
          select to_jsonb(t) into parent_task from public.work_tasks t where t.id=parent_id and t.workspace_id=wid and t.user_id=uid and t.deleted_at is null;
          if parent_task is not null then
            before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'tasks', 'table', 'work_tasks', 'id', parent_id, 'existed', true, 'row', parent_task));
            perform public.work_mutate(wid, 'task', 'update', parent_id, jsonb_build_object('title', payload->>'title'), (parent_task->>'version')::integer);
            payload := payload || jsonb_build_object('title', '');
          end if;
        end;
      end if;
      after_row := public.work_mutate(wid, 'block', op_name, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'calendar', 'table', 'work_blocks', 'id', target_id, 'existed', before_row is not null, 'row', before_row));

    elsif mod_name = 'periodic' then
      select to_jsonb(p) into before_row from public.periodic_tasks p where p.id=target_id;
      after_row := public.periodic_mutate(wid, op_name, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'periodic', 'table', 'periodic_tasks', 'id', target_id, 'existed', before_row is not null, 'row', before_row));

    elsif mod_name = 'code' then
      select to_jsonb(c) into before_row from public.code_snippets c where c.id=target_id;
      after_row := public.code_mutate(wid, op_name, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'code', 'table', 'code_snippets', 'id', target_id, 'existed', before_row is not null, 'row', before_row));

    elsif mod_name = 'activities' then
      select to_jsonb(a) into before_row from public.activity_items a where a.id=target_id;
      if op_name = 'create' then op_name := 'item.add';
      elsif op_name in ('update', 'notes', 'append', 'prepend', 'insert_section') then
        if op_name in ('append', 'prepend', 'insert_section') then
          payload := payload || jsonb_build_object('write_mode', op_name);
        end if;
        op_name := 'item.notes';
      end if;
      after_row := public.activity_library_mutate(wid, op_name, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'activities', 'table', 'activity_items', 'id', target_id, 'existed', before_row is not null, 'row', before_row));

    elsif mod_name = 'finance' then
      select to_jsonb(f) into before_row from public.finance_transactions f where f.id=target_id and f.workspace_id=wid and f.user_id=uid;
      payload := payload - 'write_mode' - 'section_heading';
      after_row := public.finance_mutate(wid, 'transaction', case when op_name in ('create','update','delete') then op_name when before_row is null then 'create' else 'update' end, target_id, payload, coalesce(exp_ver, (before_row->>'version')::integer));
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'finance', 'table', 'finance_transactions', 'id', target_id, 'existed', before_row is not null, 'row', before_row));

    elsif mod_name = 'learning' then
      if op_name like 'mistake.%' or coalesce(act->>'entity', '') = 'mistake' then
        select * into mistake_row from public.learning_mistakes m where m.id=target_id and m.workspace_id=wid and m.user_id=uid;
        before_row := case when mistake_row.id is null then null else to_jsonb(mistake_row) end;
        subject_id := coalesce(nullif(payload->>'subject_id', '')::uuid, mistake_row.subject_id);
        topic_id := coalesce(nullif(payload->>'topic_id', ''), mistake_row.topic_id);
        if subject_id is null then
          select s.id into subject_id from public.learning_subjects s where s.workspace_id=wid and s.deleted_at is null order by s.created_at desc limit 1;
          if subject_id is null then
            subject_id := gen_random_uuid();
            perform public.learning_mutate(wid, 'subject.create', subject_id, null, jsonb_build_object('title', 'Genel Öğrenme', 'color', '#6366f1'), null);
          end if;
        end if;
        if topic_id is null then
          select i.id into topic_id from public.learning_subjects_items i where i.parent_id=subject_id and coalesce(i.data->>'archived', 'false') <> 'true' order by i.position asc limit 1;
          if topic_id is null then
            perform public.learning_mutate(wid, 'topic.add', subject_id, null, jsonb_build_object('titles', jsonb_build_array('Genel Hatalar')), null);
            select i.id into topic_id from public.learning_subjects_items i where i.parent_id=subject_id and coalesce(i.data->>'archived', 'false') <> 'true' order by i.position asc limit 1;
          end if;
        end if;
        if mistake_row.id is not null and (op_name in ('append', 'prepend', 'insert_section') or write_mode <> 'replace') then
          merged_desc := public.ai_apply_note_write_mode(mistake_row.solution, coalesce(payload->>'solution', payload->>'notes', ''), case when op_name in ('append','prepend','insert_section') then op_name else write_mode end, section_heading, 'plain');
          payload := payload || jsonb_build_object('id', target_id, 'prompt', coalesce(payload->>'prompt', mistake_row.prompt), 'solution', merged_desc, 'source', coalesce(payload->>'source', mistake_row.source), 'reason', coalesce(payload->>'reason', mistake_row.reason));
          op_name := 'mistake.update';
        else
          payload := payload || jsonb_build_object('id', target_id);
          if op_name not like 'mistake.%' then
            op_name := case when mistake_row.id is null then 'mistake.create' else 'mistake.update' end;
          end if;
        end if;
        after_row := public.learning_mutate(wid, op_name, subject_id, topic_id, payload, coalesce(exp_ver, mistake_row.version));
        before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'learning_mistake', 'table', 'learning_mistakes', 'id', target_id, 'existed', before_row is not null, 'row', before_row));
      else
        select to_jsonb(s) into before_row from public.learning_subjects s where s.id=target_id;
        if op_name = 'create' then op_name := 'subject.create';
        elsif op_name = 'update' then op_name := 'subject.update';
        end if;
        after_row := public.learning_mutate(wid, op_name, target_id, payload->>'topic_id', payload, coalesce(exp_ver, (before_row->>'version')::integer));
        if op_name = 'subject.create' and jsonb_typeof(payload->'topics') = 'array' and jsonb_array_length(payload->'topics') > 0 then
          perform public.learning_mutate(
            wid,
            'topic.add',
            target_id,
            null,
            jsonb_build_object('titles', payload->'topics'),
            null
          );
        end if;
        before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'learning', 'table', 'learning_subjects', 'id', target_id, 'existed', before_row is not null, 'row', before_row));
      end if;

    elsif mod_name = 'flashcards' then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='flashcards';
      if cid is null or not public.collection_write(cid) then raise exception 'AI_ACCESS_DENIED' using errcode='42501'; end if;
      select * into deck_row from public.flashcard_decks d where d.id=target_id and d.collection_id=cid;
      before_row := case when deck_row.id is null then null else to_jsonb(deck_row) end;
      if deck_row.id is null then
        insert into public.flashcard_decks(id, user_id, workspace_id, collection_id, title, color)
          values(target_id, uid, wid, cid, btrim(coalesce(nullif(payload->>'title', ''), 'AI Kart Destesi')), coalesce(payload->>'color', '#6366f1'))
          returning * into deck_row;
      elsif payload ? 'title' then
        update public.flashcard_decks set title=btrim(payload->>'title'), color=coalesce(payload->>'color', deck_row.color) where id=target_id returning * into deck_row;
      end if;
      if payload ? 'cards' and jsonb_typeof(payload->'cards') = 'array' then
        for child_item in select value from jsonb_array_elements(payload->'cards') loop
          after_row := public.mutate_collection_item(cid, target_id, 'flashcards', 'add', jsonb_build_object('id', coalesce(child_item->>'id', gen_random_uuid()::text), 'front', coalesce(child_item->>'front', ''), 'back', coalesce(child_item->>'back', '')), null);
        end loop;
      else
        select to_jsonb(d) into after_row from public.flashcard_decks d where d.id=target_id;
      end if;
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'flashcards', 'table', 'flashcard_decks', 'id', target_id, 'existed', before_row is not null, 'row', before_row));

    elsif mod_name = 'workout' then
      select collection_id into cid from public.workspace_module_bindings where workspace_id=wid and module='workout';
      if cid is null or not public.collection_write(cid) then raise exception 'AI_ACCESS_DENIED' using errcode='42501'; end if;
      select * into routine_row from public.workout_routines r where r.id=target_id and r.collection_id=cid;
      before_row := case when routine_row.id is null then null else to_jsonb(routine_row) end;
      if routine_row.id is null then
        insert into public.workout_routines(id, user_id, workspace_id, collection_id, title, day_of_week)
          values(target_id, uid, wid, cid, btrim(coalesce(nullif(payload->>'title', ''), 'AI Antrenman Rutini')), payload->>'day_of_week')
          returning * into routine_row;
      elsif payload ? 'title' or payload ? 'day_of_week' then
        update public.workout_routines set title=btrim(coalesce(payload->>'title', routine_row.title)), day_of_week=coalesce(payload->>'day_of_week', routine_row.day_of_week) where id=target_id returning * into routine_row;
      end if;
      if payload ? 'exercises' and jsonb_typeof(payload->'exercises') = 'array' then
        for child_item in select value from jsonb_array_elements(payload->'exercises') loop
          after_row := public.mutate_collection_item(cid, target_id, 'workout', 'add', jsonb_build_object(
            'id', coalesce(child_item->>'id', gen_random_uuid()::text),
            'name', coalesce(child_item->>'name', 'Exercise'),
            'sets', coalesce((child_item->>'sets')::integer, 3),
            'reps', coalesce(child_item->>'reps', '10'),
            'notes', coalesce(child_item->>'notes', ''),
            'isCompleted', false
          ), null);
        end loop;
      else
        select to_jsonb(r) into after_row from public.workout_routines r where r.id=target_id;
      end if;
      before_list := before_list || jsonb_build_array(jsonb_build_object('module', 'workout', 'table', 'workout_routines', 'id', target_id, 'existed', before_row is not null, 'row', before_row));

    else
      raise exception 'UNSUPPORTED_AI_MODULE';
    end if;

    after_list := after_list || jsonb_build_array(jsonb_build_object('module', mod_name, 'id', target_id, 'operation', op_name, 'result', after_row));
    results_list := results_list || jsonb_build_array(jsonb_build_object('module', mod_name, 'id', target_id, 'operation', op_name, 'record', after_row));
  end loop;

  insert into public.ai_action_runs(
    id, workspace_id, user_id, prompt, provider, model, write_mode, status, actions, before_snapshots, after_snapshots
  ) values (
    run_id, wid, uid,
    left(coalesce(meta->>'prompt', ''), 10000),
    case when coalesce(meta->>'provider', 'local') in ('local', 'gemini', 'openai', 'anthropic') then coalesce(meta->>'provider', 'local') else 'local' end,
    left(coalesce(meta->>'model', ''), 120),
    case when coalesce(meta->>'write_mode', 'ask_before_write') in ('ask_before_write', 'auto_apply') then coalesce(meta->>'write_mode', 'ask_before_write') else 'ask_before_write' end,
    'applied',
    actions,
    before_list,
    after_list
  );

  return jsonb_build_object(
    'run_id', run_id,
    'status', 'applied',
    'applied_count', jsonb_array_length(results_list),
    'results', results_list,
    'created_at', clock_timestamp()
  );
end $$;

revoke all on function public.ai_execute_actions(uuid, jsonb, jsonb) from public;
grant execute on function public.ai_execute_actions(uuid, jsonb, jsonb) to authenticated, service_role;

create or replace function public.ai_undo_action_run(wid uuid, run_id uuid) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  run_rec public.ai_action_runs;
  snap jsonb;
  prev_row jsonb;
  tbl text;
  rec_id uuid;
  restored_count integer := 0;
  prev_trash text;
  idx integer;
begin
  if uid is null or not public.session_mfa_satisfied() then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  select * into run_rec from public.ai_action_runs where id=run_id and workspace_id=wid and user_id=uid for update;
  if run_rec.id is null then raise exception 'AI_RUN_NOT_FOUND'; end if;
  if run_rec.status <> 'applied' then raise exception 'AI_RUN_ALREADY_UNDONE'; end if;

  prev_trash := coalesce(current_setting('app.trash_write', true), 'off');
  perform set_config('app.trash_write', 'on', true);

  for idx in reverse jsonb_array_length(run_rec.before_snapshots) - 1 .. 0 loop
    snap := run_rec.before_snapshots->idx;
    tbl := snap->>'table';
    rec_id := (snap->>'id')::uuid;
    prev_row := snap->'row';

    if not coalesce((snap->>'existed')::boolean, false) then
      if tbl in ('todos', 'plans', 'quick_notes', 'periodic_tasks', 'code_snippets', 'activity_items', 'learning_subjects', 'flashcard_decks', 'workout_routines') then
        execute format('update public.%I set deleted_at=clock_timestamp(), deleted_by=$1 where id=$2 and deleted_at is null', tbl) using uid, rec_id;
      elsif tbl in ('work_tasks', 'work_blocks', 'learning_mistakes') then
        execute format('update public.%I set deleted_at=clock_timestamp(), version=version+1 where id=$1 and deleted_at is null', tbl) using rec_id;
      elsif tbl = 'finance_transactions' then
        delete from public.finance_transactions where id=rec_id and workspace_id=wid and user_id=uid;
      elsif tbl = 'categories' then
        if (select count(*) from public.categories where collection_id=(select collection_id from public.categories where id=rec_id)) > 1 then
          delete from public.categories where id=rec_id;
        end if;
      end if;
      restored_count := restored_count + 1;
    else
      if tbl = 'todos' then
        update public.todos set
          title = prev_row->>'title',
          description = prev_row->>'description',
          completed = coalesce((prev_row->>'completed')::boolean, false),
          category_id = nullif(prev_row->>'category_id', '')::uuid,
          priority = (prev_row->>'priority')::public.todo_priority,
          due_date = nullif(prev_row->>'due_date', '')::timestamptz,
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          deleted_by = nullif(prev_row->>'deleted_by', '')::uuid,
          updated_at = now()
        where id=rec_id;
      elsif tbl = 'plans' then
        update public.plans set
          title = prev_row->>'title',
          period = prev_row->>'period',
          period_date = (prev_row->>'period_date')::date,
          completed = coalesce((prev_row->>'completed')::boolean, false),
          notes = coalesce(prev_row->>'notes', ''),
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          deleted_by = nullif(prev_row->>'deleted_by', '')::uuid
        where id=rec_id;
      elsif tbl = 'quick_notes' then
        update public.quick_notes set
          content = prev_row->>'content',
          notes = coalesce(prev_row->>'notes', ''),
          completed = coalesce((prev_row->>'completed')::boolean, false),
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          deleted_by = nullif(prev_row->>'deleted_by', '')::uuid,
          updated_at = now()
        where id=rec_id;
      elsif tbl = 'work_tasks' then
        update public.work_tasks set
          title = prev_row->>'title',
          description = coalesce(prev_row->>'description', ''),
          status = prev_row->>'status',
          priority = prev_row->>'priority',
          project_id = nullif(prev_row->>'project_id', '')::uuid,
          due_on = nullif(prev_row->>'due_on', '')::date,
          estimate_minutes = coalesce((prev_row->>'estimate_minutes')::integer, 30),
          checklist = coalesce(prev_row->'checklist', '[]'::jsonb),
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          version = version + 1,
          updated_at = clock_timestamp()
        where id=rec_id and workspace_id=wid and user_id=uid;
      elsif tbl = 'work_blocks' then
        update public.work_blocks set
          task_id = nullif(prev_row->>'task_id', '')::uuid,
          title = coalesce(prev_row->>'title', ''),
          starts_at = (prev_row->>'starts_at')::timestamptz,
          ends_at = (prev_row->>'ends_at')::timestamptz,
          timezone = coalesce(prev_row->>'timezone', 'UTC'),
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          version = version + 1
        where id=rec_id and workspace_id=wid and user_id=uid;
      elsif tbl = 'periodic_tasks' then
        update public.periodic_tasks set
          title = prev_row->>'title',
          frequency = prev_row->>'frequency',
          category = prev_row->>'category',
          notes = prev_row->>'notes',
          completed_date = nullif(prev_row->>'completed_date', '')::date,
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          deleted_by = nullif(prev_row->>'deleted_by', '')::uuid,
          updated_at = timezone('utc', now())
        where id=rec_id;
      elsif tbl = 'code_snippets' then
        update public.code_snippets set
          title = prev_row->>'title',
          language = prev_row->>'language',
          code = prev_row->>'code',
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          deleted_by = nullif(prev_row->>'deleted_by', '')::uuid,
          updated_at = timezone('utc', now())
        where id=rec_id;
      elsif tbl = 'activity_items' then
        update public.activity_items set
          title = prev_row->>'title',
          subtitle = prev_row->>'subtitle',
          status = prev_row->>'status',
          notes = prev_row->>'notes',
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          deleted_by = nullif(prev_row->>'deleted_by', '')::uuid,
          updated_at = clock_timestamp()
        where id=rec_id;
      elsif tbl = 'finance_transactions' then
        update public.finance_transactions set
          title = prev_row->>'title',
          kind = prev_row->>'kind',
          category = prev_row->>'category',
          category_id = nullif(prev_row->>'category_id', '')::uuid,
          amount = (prev_row->>'amount')::numeric,
          occurred_on = (prev_row->>'occurred_on')::date,
          note = prev_row->>'note',
          version = version + 1
        where id=rec_id and workspace_id=wid and user_id=uid;
      elsif tbl = 'learning_mistakes' then
        update public.learning_mistakes set
          prompt = coalesce(prev_row->>'prompt', ''),
          solution = coalesce(prev_row->>'solution', ''),
          source = coalesce(prev_row->>'source', ''),
          reason = coalesce(prev_row->>'reason', ''),
          resolved = coalesce((prev_row->>'resolved')::boolean, false),
          deleted_at = nullif(prev_row->>'deleted_at', '')::timestamptz,
          version = version + 1
        where id=rec_id and workspace_id=wid and user_id=uid;
      elsif tbl = 'flashcard_decks' then
        update public.flashcard_decks set title = prev_row->>'title', color = prev_row->>'color' where id=rec_id;
        delete from public.flashcard_decks_items where parent_id=rec_id and id not in (
          select value->>'id' from jsonb_array_elements(coalesce(prev_row->'cards', '[]'::jsonb))
        );
      elsif tbl = 'workout_routines' then
        update public.workout_routines set title = prev_row->>'title', day_of_week = prev_row->>'day_of_week' where id=rec_id;
        delete from public.workout_routines_items where parent_id=rec_id and id not in (
          select value->>'id' from jsonb_array_elements(coalesce(prev_row->'exercises', '[]'::jsonb))
        );
      end if;
      restored_count := restored_count + 1;
    end if;
  end loop;

  perform set_config('app.trash_write', prev_trash, true);
  update public.ai_action_runs set status='undone', undone_at=clock_timestamp() where id=run_id;

  return jsonb_build_object(
    'run_id', run_id,
    'status', 'undone',
    'restored_count', restored_count,
    'undone_at', clock_timestamp()
  );
end $$;

revoke all on function public.ai_undo_action_run(uuid, uuid) from public;
grant execute on function public.ai_undo_action_run(uuid, uuid) to authenticated, service_role;

create or replace function public.ai_action_history(wid uuid, lim integer default 20) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.session_mfa_satisfied() then raise exception 'AI_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.workspaces where id=wid and user_id=uid and archived_at is null) then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'prompt', r.prompt, 'provider', r.provider, 'model', r.model,
      'write_mode', r.write_mode, 'status', r.status, 'actions', r.actions,
      'after_snapshots', r.after_snapshots, 'created_at', r.created_at, 'undone_at', r.undone_at
    ) order by r.created_at desc)
    from (
      select * from public.ai_action_runs
      where workspace_id=wid and user_id=uid
      order by created_at desc
      limit greatest(1, least(coalesce(lim, 20), 50))
    ) r
  ), '[]'::jsonb);
end $$;

revoke all on function public.ai_action_history(uuid, integer) from public;
grant execute on function public.ai_action_history(uuid, integer) to authenticated, service_role;

-- 7. Faz 5: AI Provider Credentials & Settings (private.user_ai_credentials)
create table if not exists private.user_ai_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'gemini' check (provider in ('gemini', 'openai', 'anthropic')),
  model text not null default 'gemini-2.5-flash' check (length(btrim(model)) between 1 and 120),
  write_mode text not null default 'ask_before_write' check (write_mode in ('ask_before_write', 'auto_apply')),
  api_keys jsonb not null default '{}'::jsonb check (jsonb_typeof(api_keys) = 'object'),
  updated_at timestamptz not null default clock_timestamp()
);

alter table private.user_ai_credentials enable row level security;
revoke all on table private.user_ai_credentials from public, anon, authenticated;
grant all on table private.user_ai_credentials to service_role;

create or replace function public.ai_settings_get() returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  rec private.user_ai_credentials;
  keys jsonb;
begin
  if uid is null or not public.session_mfa_satisfied() then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  select * into rec from private.user_ai_credentials where user_id=uid;
  keys := coalesce(rec.api_keys, '{}'::jsonb);
  return jsonb_build_object(
    'provider', coalesce(rec.provider, 'gemini'),
    'model', coalesce(rec.model, 'gemini-2.5-flash'),
    'write_mode', coalesce(rec.write_mode, 'ask_before_write'),
    'configured_providers', jsonb_build_object(
      'gemini', coalesce(length(keys->>'gemini'), 0) > 0,
      'openai', coalesce(length(keys->>'openai'), 0) > 0,
      'anthropic', coalesce(length(keys->>'anthropic'), 0) > 0
    ),
    'key_hints', jsonb_build_object(
      'gemini', case when coalesce(length(keys->>'gemini'), 0) >= 4 then '••••' || right(keys->>'gemini', 4) else null end,
      'openai', case when coalesce(length(keys->>'openai'), 0) >= 4 then '••••' || right(keys->>'openai', 4) else null end,
      'anthropic', case when coalesce(length(keys->>'anthropic'), 0) >= 4 then '••••' || right(keys->>'anthropic', 4) else null end
    ),
    'updated_at', rec.updated_at
  );
end $$;

revoke all on function public.ai_settings_get() from public;
grant execute on function public.ai_settings_get() to authenticated, service_role;

create or replace function public.ai_settings_save(
  provider text,
  model text,
  write_mode text default 'ask_before_write',
  api_key text default null,
  clear_provider text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  rec private.user_ai_credentials;
  next_keys jsonb;
  trimmed_key text := nullif(btrim(coalesce(api_key, '')), '');
  trimmed_model text := btrim(coalesce(model, ''));
begin
  if uid is null or not public.session_mfa_satisfied() then
    raise exception 'AI_ACCESS_DENIED' using errcode='42501';
  end if;
  if provider is null or provider not in ('gemini', 'openai', 'anthropic')
    or write_mode is null or write_mode not in ('ask_before_write', 'auto_apply')
    or length(trimmed_model) not between 1 and 120 then
    raise exception 'INVALID_AI_SETTINGS';
  end if;
  if trimmed_key is not null and length(trimmed_key) not between 8 and 512 then
    raise exception 'INVALID_AI_API_KEY';
  end if;
  if clear_provider is not null and clear_provider not in ('gemini', 'openai', 'anthropic') then
    raise exception 'INVALID_AI_SETTINGS';
  end if;

  select * into rec from private.user_ai_credentials where user_id=uid for update;
  next_keys := coalesce(rec.api_keys, '{}'::jsonb);
  if clear_provider is not null then
    next_keys := next_keys - clear_provider;
  end if;
  if trimmed_key is not null then
    next_keys := next_keys || jsonb_build_object(provider, trimmed_key);
  end if;

  insert into private.user_ai_credentials(user_id, provider, model, write_mode, api_keys, updated_at)
    values(uid, provider, trimmed_model, write_mode, next_keys, clock_timestamp())
    on conflict(user_id) do update set
      provider = excluded.provider,
      model = excluded.model,
      write_mode = excluded.write_mode,
      api_keys = excluded.api_keys,
      updated_at = clock_timestamp();

  return public.ai_settings_get();
end $$;

revoke all on function public.ai_settings_save(text, text, text, text, text) from public;
grant execute on function public.ai_settings_save(text, text, text, text, text) to authenticated, service_role;

create or replace function public.ai_resolve_runtime_credentials(uid uuid) returns jsonb
language plpgsql stable security definer
set search_path to 'private', 'public', 'pg_temp'
as $$
declare
  rec private.user_ai_credentials;
  prov text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into rec from private.user_ai_credentials where user_id=uid;
  prov := coalesce(rec.provider, 'gemini');
  return jsonb_build_object(
    'provider', prov,
    'model', coalesce(rec.model, 'gemini-2.5-flash'),
    'write_mode', coalesce(rec.write_mode, 'ask_before_write'),
    'api_key', coalesce(rec.api_keys->>prov, null),
    'api_keys', coalesce(rec.api_keys, '{}'::jsonb)
  );
end $$;

revoke all on function public.ai_resolve_runtime_credentials(uuid) from public, anon, authenticated;
grant execute on function public.ai_resolve_runtime_credentials(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
