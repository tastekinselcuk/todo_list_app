-- Monthly category limits. Run after the existing finance migrations.
begin;
create table if not exists public.finance_categories (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 60),
 archived boolean not null default false,
 version integer not null default 1,
 budget_version integer not null default 1,
 created_at timestamptz not null default now(),
 unique(workspace_id,name)
);
create table if not exists public.finance_budget_limits (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 category_id uuid not null references public.finance_categories(id),
 month date not null check(extract(day from month)=1 and month between date '1900-01-01' and date '2100-12-01'),
 scope text not null check(scope in ('month','forward')),
 amount numeric(16,2) check(amount>=0 and amount<=1000000000000),
 primary key(workspace_id,category_id,month,scope)
);
alter table public.finance_transactions add column if not exists category_id uuid references public.finance_categories(id);
alter table public.finance_recurring add column if not exists category_id uuid references public.finance_categories(id);
create index if not exists finance_category_month on public.finance_transactions(workspace_id,category_id,occurred_on);

-- Preserve old labels without guessing a category for uncategorized entries.
insert into finance_categories(workspace_id,user_id,name)
 select distinct workspace_id,user_id,category from finance_transactions where category<>'Uncategorized' and category_id is null
 on conflict(workspace_id,name) do nothing;
update finance_transactions t set category_id=c.id from finance_categories c
 where t.workspace_id=c.workspace_id and t.user_id=c.user_id and t.category=c.name and t.category_id is null and t.category<>'Uncategorized';

do $$ declare tab text; begin
 foreach tab in array array['finance_categories','finance_budget_limits'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('drop policy if exists finance_private on public.%I',tab);
  execute format('create policy finance_private on public.%I for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.user_id=(select auth.uid())))',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
 end loop;
end $$;

create or replace function public.finance_category_mutate(wid uuid,operation text,rid uuid,payload jsonb,expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r finance_categories; uid uuid:=auth.uid();
begin
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if uid is null or not found then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501';end if;
 if rid is null or operation not in ('create','update') or payload is null or jsonb_typeof(payload)<>'object' or payload- array['name','archived']<>'{}'::jsonb then raise exception 'INVALID_FINANCE_INPUT';end if;
 select * into r from finance_categories where id=rid and workspace_id=wid and user_id=uid for update;
 if operation='create' then
  if r.id is not null then
   if r.name=btrim(payload->>'name') then return to_jsonb(r);else raise exception 'FINANCE_CONFLICT';end if;
  end if;
  insert into finance_categories(id,workspace_id,user_id,name) values(rid,wid,uid,btrim(payload->>'name')) returning * into r;
 else
  if r.id is null or r.version is distinct from expected_version then raise exception 'FINANCE_CONFLICT';end if;
  update finance_categories set name=case when payload?'name' then btrim(payload->>'name') else name end,
   archived=coalesce((payload->>'archived')::boolean,archived),version=version+1 where id=rid returning * into r;
 end if;
 return to_jsonb(r);
end $$;

create or replace function public.finance_budget_set(wid uuid,cid uuid,month_start date,limit_amount numeric,apply_scope text,expected_version integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r finance_categories; uid uuid:=auth.uid();
begin
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if uid is null or not found then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501';end if;
 select * into r from finance_categories where id=cid and workspace_id=wid and user_id=uid for update;
 if r.id is null or r.budget_version is distinct from expected_version then raise exception 'FINANCE_CONFLICT';end if;
 if month_start is null or month_start not between date '1900-01-01' and date '2100-12-01' or extract(day from month_start)<>1
  or apply_scope is null or apply_scope not in ('month','forward') or (limit_amount is not null and (limit_amount<0 or limit_amount>1e12 or limit_amount<>round(limit_amount,2))) then raise exception 'INVALID_FINANCE_INPUT';end if;
 -- A forward edit explicitly replaces future plans; past months remain intact.
 if apply_scope='forward' then delete from finance_budget_limits where workspace_id=wid and category_id=cid and month>=month_start;end if;
 insert into finance_budget_limits(workspace_id,user_id,category_id,month,scope,amount) values(wid,uid,cid,month_start,apply_scope,limit_amount)
 on conflict(workspace_id,category_id,month,scope) do update set amount=excluded.amount;
 update finance_categories set budget_version=budget_version+1 where id=cid returning * into r;
 return to_jsonb(r);
end $$;

create or replace function public.finance_budget_state(wid uuid,month_start date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid()) then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501';end if;
 if month_start is null or extract(day from month_start)<>1 or month_start not between date '1900-01-01' and date '2100-12-01' then raise exception 'INVALID_FINANCE_MONTH';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at,r.id),'[]'::jsonb) into result from (
  select c.id,c.name,c.archived,c.version,c.budget_version,c.created_at,b.amount as budget,b.scope as budget_scope,
   coalesce((select sum(t.amount) from finance_transactions t where t.workspace_id=wid and t.user_id=auth.uid() and t.category_id=c.id and t.kind='expense' and t.occurred_on>=month_start and t.occurred_on<month_start+interval '1 month'),0) as spent
  from finance_categories c left join lateral (
   select amount,scope from finance_budget_limits where workspace_id=wid and user_id=auth.uid() and category_id=c.id
    and ((scope='month' and month=month_start) or (scope='forward' and month<=month_start))
   order by (scope='month') desc,month desc limit 1
  )b on true where c.workspace_id=wid and c.user_id=auth.uid()
 )r;
 return result;
end $$;

-- Recurring expenses inherit a category only when each occurrence is created.
create or replace function public.finance_inherit_category() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.recurring_id is not null and new.category_id is null then
  select category_id into new.category_id from finance_recurring where id=new.recurring_id and workspace_id=new.workspace_id and user_id=new.user_id;
 end if;
 if new.category_id is not null then
  select name into new.category from finance_categories where id=new.category_id and workspace_id=new.workspace_id and user_id=new.user_id;
  if not found then raise exception 'INVALID_FINANCE_CATEGORY';end if;
 end if;
 return new;
end $$;
drop trigger if exists finance_inherit_category on finance_transactions;
create trigger finance_inherit_category before insert on finance_transactions for each row execute function finance_inherit_category();

-- Keep the existing summary and valuation logic, extending its response.
do $$ begin
 if to_regprocedure('public.finance_summary_before_budgets(uuid,date)') is null then
  alter function public.finance_summary(uuid,date) rename to finance_summary_before_budgets;
 end if;
end $$;
revoke all on function public.finance_summary_before_budgets(uuid,date) from public,anon,authenticated;
create or replace function public.finance_summary(wid uuid,month_start date) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=finance_summary_before_budgets(wid,month_start);
 return result || jsonb_build_object('budget_categories',finance_budget_state(wid,month_start),
  'uncategorized_expense',coalesce((select sum(amount) from finance_transactions where workspace_id=wid and user_id=auth.uid() and kind='expense' and category_id is null and occurred_on>=month_start and occurred_on<month_start+interval '1 month'),0),
  'locked_currency',(result->>'locked_currency')::boolean or exists(select 1 from finance_budget_limits where workspace_id=wid and amount is not null),
  'categories',coalesce((select jsonb_agg(to_jsonb(r) order by r.amount desc) from (
   select t.category_id,c.name as category,sum(t.amount) as amount from finance_transactions t left join finance_categories c on c.id=t.category_id
   where t.workspace_id=wid and t.user_id=auth.uid() and t.kind='expense' and t.occurred_on>=month_start and t.occurred_on<month_start+interval '1 month'
   group by t.category_id,c.name
  )r),'[]'::jsonb));
end $$;

create or replace function public.finance_query(wid uuid,month_start date,filters jsonb default '{}'::jsonb,after_date date default null,after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rows jsonb; totals jsonb; cursor jsonb; more boolean; search_text text; category_filter text; kind_filter text; repeat_filter text;
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid()) then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501';end if;
 if month_start is null or extract(day from month_start)<>1 or month_start not between date '1900-01-01' and date '2100-12-01' or (after_date is null)<>(after_id is null)
  or filters is null or jsonb_typeof(filters)<>'object' or octet_length(filters::text)>4096 or filters-array['search','category','kind','recurring']<>'{}'::jsonb then raise exception 'INVALID_FINANCE_INPUT';end if;
 search_text:=coalesce(filters->>'search','');category_filter:=coalesce(filters->>'category','');kind_filter:=coalesce(filters->>'kind','');repeat_filter:=coalesce(filters->>'recurring','');
 if length(search_text)>160 or kind_filter not in ('','income','expense') or repeat_filter not in ('','yes','no') then raise exception 'INVALID_FINANCE_INPUT';end if;
 with matched as (
  select t.id,t.title,t.kind,coalesce(c.name,t.category) category,t.category_id,t.amount,t.occurred_on,t.version,t.recurring_id
  from finance_transactions t left join finance_categories c on c.id=t.category_id
  where t.workspace_id=wid and t.user_id=auth.uid() and t.occurred_on>=month_start and t.occurred_on<month_start+interval '1 month'
   and (search_text='' or strpos(lower(t.title),lower(search_text))>0)
   and (kind_filter='' or t.kind=kind_filter)
   and (category_filter='' or (category_filter='uncategorized' and t.category_id is null) or t.category_id::text=category_filter)
   and (repeat_filter='' or (repeat_filter='yes' and t.recurring_id is not null) or (repeat_filter='no' and t.recurring_id is null))
 ), page as (select * from matched where after_date is null or (occurred_on,id)<(after_date,after_id) order by occurred_on desc,id desc limit 51)
 select (select coalesce(jsonb_agg(to_jsonb(p) order by occurred_on desc,id desc),'[]'::jsonb) from page p),
  (select jsonb_build_object('count',count(*),'income',coalesce(sum(amount) filter(where kind='income'),0),'expense',coalesce(sum(amount) filter(where kind='expense'),0)) from matched)
 into rows,totals;
 more:=jsonb_array_length(rows)>50;if more then rows:=rows-50;end if;
 if jsonb_array_length(rows)>0 then cursor:=jsonb_build_object('date',rows->-1->>'occurred_on','id',rows->-1->>'id');end if;
 return jsonb_build_object('items',rows,'has_more',more,'cursor',cursor,'totals',totals);
end $$;

revoke all on function public.finance_inherit_category(),public.finance_category_mutate(uuid,text,uuid,jsonb,integer),public.finance_budget_set(uuid,uuid,date,numeric,text,integer),public.finance_budget_state(uuid,date),public.finance_summary(uuid,date),public.finance_query(uuid,date,jsonb,date,uuid) from public,anon,authenticated;
grant execute on function public.finance_category_mutate(uuid,text,uuid,jsonb,integer),public.finance_budget_set(uuid,uuid,date,numeric,text,integer),public.finance_summary(uuid,date),public.finance_query(uuid,date,jsonb,date,uuid) to authenticated;

-- Updated mutation and page definitions are appended below before COMMIT.

create or replace function public.finance_mutate(wid uuid,entity text,operation text,rid uuid,payload jsonb,expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); row_data jsonb; current_version integer; changes jsonb; field text;
begin
  -- Serializes currency configuration and creates; captures ownership for every mutation.
  perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
  if uid is null or not found then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501';end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_FINANCE_INPUT';end if;
  if entity='settings' and operation='update' then
    if payload->>'currency' not in ('TRY','USD','EUR','GBP') or payload->>'currency' is null or payload - 'currency'<>'{}'::jsonb then raise exception 'INVALID_FINANCE_INPUT';end if;
    if exists(select 1 from finance_budget_limits where workspace_id=wid and amount is not null) or exists(select 1 from finance_recurring where workspace_id=wid and deleted_at is null) or exists(select 1 from finance_transactions where workspace_id=wid) or exists(select 1 from finance_positions where workspace_id=wid) then raise exception 'FINANCE_CURRENCY_LOCKED';end if;
    insert into finance_settings(workspace_id,user_id,currency) values(wid,uid,payload->>'currency')
      on conflict(workspace_id) do update set currency=excluded.currency;
    return payload;
  end if;
  if rid is null or entity not in ('transaction','position') or operation not in ('create','update','delete') then raise exception 'INVALID_FINANCE_INPUT';end if;
  if entity='transaction' then
    for field in select jsonb_object_keys(payload) loop if field not in ('title','kind','category','category_id','amount','occurred_on') then raise exception 'INVALID_FINANCE_INPUT';end if;end loop;
    select to_jsonb(t),t.version into row_data,current_version from finance_transactions t where t.id=rid and t.workspace_id=wid and t.user_id=uid for update;
  else
    for field in select jsonb_object_keys(payload) loop if field not in ('title','kind','instrument','price_source','quantity','buy_price','purchased_on','manual_price') then raise exception 'INVALID_FINANCE_INPUT';end if;end loop;
    select to_jsonb(p),p.version into row_data,current_version from finance_positions p where p.id=rid and p.workspace_id=wid and p.user_id=uid for update;
  end if;
  if operation='create' and row_data is not null then
    -- An uncertain network response can be retried with the same UUID without duplicate money entries.
    if row_data @> payload then return row_data;else raise exception 'FINANCE_CONFLICT';end if;
  end if;
  if operation<>'create' and (row_data is null or expected_version is distinct from current_version) then raise exception 'FINANCE_CONFLICT';end if;
  if operation='delete' then
    if entity='transaction' then delete from finance_transactions where id=rid and user_id=uid and workspace_id=wid;
    else delete from finance_positions where id=rid and user_id=uid and workspace_id=wid;end if;
    return jsonb_build_object('id',rid);
  end if;
  changes:=coalesce(row_data,'{}'::jsonb)||payload;
  if entity='transaction' then
   changes:=jsonb_build_object('title',coalesce(changes->>'kind','expense'),'category','Uncategorized')||changes;
   if changes->>'category_id' is not null then
    perform 1 from finance_categories where id=(changes->>'category_id')::uuid and workspace_id=wid and user_id=uid
     and (not archived or row_data->>'category_id'=changes->>'category_id');
    if not found then raise exception 'INVALID_FINANCE_CATEGORY';end if;
    changes:=changes||jsonb_build_object('category',(select name from finance_categories where id=(changes->>'category_id')::uuid));
   elsif payload?'category_id' then changes:=changes||jsonb_build_object('category','Uncategorized');end if;
  end if;
  if entity='transaction' then
    if operation='create' then
      insert into finance_transactions(id,workspace_id,user_id,title,kind,category,amount,occurred_on,category_id)
        values(rid,wid,uid,btrim(changes->>'title'),changes->>'kind',btrim(changes->>'category'),(changes->>'amount')::numeric,(changes->>'occurred_on')::date,(changes->>'category_id')::uuid)
        returning to_jsonb(finance_transactions) into row_data;
    else
      update finance_transactions set title=btrim(changes->>'title'),kind=changes->>'kind',category=btrim(changes->>'category'),amount=(changes->>'amount')::numeric,
        occurred_on=(changes->>'occurred_on')::date,category_id=(changes->>'category_id')::uuid,version=version+1 where id=rid returning to_jsonb(finance_transactions) into row_data;
    end if;
  else
    -- A date-only purchase can be today in any client timezone, including UTC+14.
    if (changes->>'purchased_on')::date>(now() at time zone 'Pacific/Kiritimati')::date then raise exception 'INVALID_FINANCE_INPUT';end if;
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


create or replace function public.finance_schedule_mutate(wid uuid,operation text,rid uuid,payload jsonb,expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();r finance_recurring; changes jsonb;field text;today date;n integer;
begin
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if uid is null or not found then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501';end if;
 if rid is null or operation not in ('create','update','pause','resume','delete') or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_FINANCE_INPUT';end if;
 for field in select jsonb_object_keys(payload) loop if field not in ('title','kind','amount','cadence','starts_on','timezone','category_id') then raise exception 'INVALID_FINANCE_INPUT';end if;end loop;
 perform finance_materialize(wid,uid);
 select * into r from finance_recurring where id=rid and workspace_id=wid and user_id=uid for update;
 if operation='create' and r.id is not null then
  if r.deleted_at is null and to_jsonb(r) @> payload then return to_jsonb(r);else raise exception 'FINANCE_CONFLICT';end if;
 end if;
 if operation<>'create' and (r.id is null or r.deleted_at is not null or r.version is distinct from expected_version) then raise exception 'FINANCE_CONFLICT';end if;
 if operation='delete' then
  update finance_recurring set deleted_at=now(),active=false,version=version+1 where id=r.id;
  return jsonb_build_object('id',rid);
 elsif operation='pause' then
  update finance_recurring set active=false,version=version+1 where id=r.id returning * into r;return to_jsonb(r);
 elsif operation='resume' then
  today:=(now() at time zone r.timezone)::date;n:=r.next_index;
  while finance_occurrence(r.starts_on,r.cadence,n)<today loop n:=n+1;end loop;
  update finance_recurring set active=true,next_index=n,version=version+1 where id=r.id returning * into r;
  perform finance_materialize(wid,uid);
  select * into r from finance_recurring where id=rid;return to_jsonb(r);
 end if;
 changes:=coalesce(to_jsonb(r),'{}'::jsonb)||payload;
 if changes->>'category_id' is not null then
  perform 1 from finance_categories where id=(changes->>'category_id')::uuid and workspace_id=wid and user_id=uid
   and (not archived or id=r.category_id);
  if not found then raise exception 'INVALID_FINANCE_CATEGORY';end if;
 end if;
 if changes->>'kind' not in ('income','expense') or changes->>'cadence' not in ('weekly','monthly','yearly')
  or not exists(select 1 from pg_timezone_names where name=changes->>'timezone') then raise exception 'INVALID_FINANCE_INPUT';end if;
 today:=(now() at time zone (changes->>'timezone'))::date;
 if operation='update' and ((changes->>'starts_on')::date is distinct from r.starts_on or changes->>'cadence' is distinct from r.cadence or changes->>'timezone' is distinct from r.timezone) then
  if (changes->>'starts_on')::date<today then raise exception 'INVALID_FINANCE_INPUT';end if;
  n:=0;
 else n:=coalesce(r.next_index,0);end if;
 if operation='create' then
  insert into finance_recurring(id,workspace_id,user_id,title,kind,amount,cadence,starts_on,timezone,category_id)
  values(rid,wid,uid,coalesce(nullif(btrim(changes->>'title'),''),changes->>'kind'),changes->>'kind',(changes->>'amount')::numeric,changes->>'cadence',(changes->>'starts_on')::date,changes->>'timezone',(changes->>'category_id')::uuid) returning * into r;
 else
  update finance_recurring set title=coalesce(nullif(btrim(changes->>'title'),''),changes->>'kind'),kind=changes->>'kind',amount=(changes->>'amount')::numeric,
   cadence=changes->>'cadence',starts_on=(changes->>'starts_on')::date,timezone=changes->>'timezone',next_index=n,category_id=(changes->>'category_id')::uuid,version=version+1 where id=rid returning * into r;
 end if;
 perform finance_materialize(wid,uid);
 select * into r from finance_recurring where id=rid;return to_jsonb(r);
end $$;

create or replace function public.finance_page(wid uuid,entity text,month_start date,after_date date default null,after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rows jsonb; cursor jsonb; total bigint; more boolean;
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid()) then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501'; end if;
  if (after_date is null) <> (after_id is null) or month_start is null or extract(day from month_start)<>1 then raise exception 'INVALID_FINANCE_PAGE'; end if;
  if entity='transaction' then
    return finance_query(wid,month_start,'{}'::jsonb,after_date,after_id);
  elsif entity='position' then
    select count(*) into total from finance_positions where workspace_id=wid and user_id=auth.uid();
    select coalesce(jsonb_agg(to_jsonb(r) order by r.purchased_on desc,r.id desc),'[]') into rows from (
      select v.*,coalesce(q.metadata,'{}'::jsonb) quote_info from finance_position_values(wid) v
      left join finance_market_quotes q on q.provider=v.price_source and q.instrument=v.instrument and q.currency=coalesce((select currency from finance_settings where workspace_id=wid),'TRY')
      where after_date is null or (v.purchased_on,v.id)<(after_date,after_id)
      order by v.purchased_on desc,v.id desc limit 51)r;
    more:=jsonb_array_length(rows)>50;rows:=rows - case when more then 50 else -999 end;
    if jsonb_array_length(rows)>0 then cursor:=jsonb_build_object('date',rows->-1->>'purchased_on','id',rows->-1->>'id');end if;
  else raise exception 'INVALID_FINANCE_ENTITY';end if;
  return jsonb_build_object('items',rows,'total',total,'has_more',more,'cursor',cursor);
end $$;


commit;
