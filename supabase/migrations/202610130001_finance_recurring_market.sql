-- Adds private schedules and automatic market instruments without deleting old entries.
begin;
create table if not exists public.finance_recurring (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 160),
 kind text not null check(kind in ('income','expense')),
 amount numeric(16,2) not null check(amount>0 and amount<=1000000000000),
 cadence text not null check(cadence in ('weekly','monthly','yearly')),
 starts_on date not null check(starts_on between date '1900-01-01' and date '2100-12-31'),
 timezone text not null default 'Europe/Istanbul',
 active boolean not null default true,
 next_index integer not null default 0 check(next_index>=0),
 version integer not null default 1,
 deleted_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists finance_recurring_workspace on public.finance_recurring(workspace_id) where deleted_at is null;
alter table public.finance_recurring enable row level security;
drop policy if exists finance_private on public.finance_recurring;
create policy finance_private on public.finance_recurring for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.user_id=(select auth.uid())));
revoke all on public.finance_recurring from public,anon,authenticated;
grant select on public.finance_recurring to authenticated;
alter table public.finance_transactions add column if not exists recurring_id uuid references public.finance_recurring(id);
create unique index if not exists finance_recurring_occurrence on public.finance_transactions(recurring_id,occurred_on);

create or replace function public.finance_occurrence(anchor date,cadence text,n integer) returns date
language sql immutable set search_path=public,pg_temp as $$
 select case when cadence='weekly' then anchor+7*n else
 (date_trunc('month',anchor)+(case when cadence='yearly' then n*12 else n end)*interval '1 month'
 + (least(extract(day from anchor)::integer,extract(day from date_trunc('month',anchor)+(case when cadence='yearly' then n*12 else n end)*interval '1 month'+interval '1 month - 1 day')::integer)-1)*interval '1 day')::date end;
$$;
create or replace function public.finance_materialize(wid uuid,uid uuid,cutoff date default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r finance_recurring; due date; through date; n integer;
begin
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if not found then return;end if;
 for r in select * from finance_recurring where workspace_id=wid and user_id=uid and active and deleted_at is null for update loop
  through:=coalesce(cutoff,(now() at time zone r.timezone)::date);n:=r.next_index;
  due:=finance_occurrence(r.starts_on,r.cadence,n);
  while due<=through and due<=date '2100-12-31' loop
   insert into finance_transactions(workspace_id,user_id,kind,title,category,amount,occurred_on,recurring_id)
   values(wid,uid,r.kind,r.title,'Uncategorized',r.amount,due,r.id)
   on conflict(recurring_id,occurred_on) do nothing;
   n:=n+1;due:=finance_occurrence(r.starts_on,r.cadence,n);
  end loop;
  if n<>r.next_index then update finance_recurring set next_index=n where id=r.id;end if;
 end loop;
end $$;
create or replace function public.finance_schedule_mutate(wid uuid,operation text,rid uuid,payload jsonb,expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();r finance_recurring; changes jsonb;field text;today date;n integer;
begin
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if uid is null or not found then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501';end if;
 if rid is null or operation not in ('create','update','pause','resume','delete') or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4096 then raise exception 'INVALID_FINANCE_INPUT';end if;
 for field in select jsonb_object_keys(payload) loop if field not in ('title','kind','amount','cadence','starts_on','timezone') then raise exception 'INVALID_FINANCE_INPUT';end if;end loop;
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
 if changes->>'kind' not in ('income','expense') or changes->>'cadence' not in ('weekly','monthly','yearly')
  or not exists(select 1 from pg_timezone_names where name=changes->>'timezone') then raise exception 'INVALID_FINANCE_INPUT';end if;
 today:=(now() at time zone (changes->>'timezone'))::date;
 if operation='update' and ((changes->>'starts_on')::date is distinct from r.starts_on or changes->>'cadence' is distinct from r.cadence or changes->>'timezone' is distinct from r.timezone) then
  if (changes->>'starts_on')::date<today then raise exception 'INVALID_FINANCE_INPUT';end if;
  n:=0;
 else n:=coalesce(r.next_index,0);end if;
 if operation='create' then
  insert into finance_recurring(id,workspace_id,user_id,title,kind,amount,cadence,starts_on,timezone)
  values(rid,wid,uid,coalesce(nullif(btrim(changes->>'title'),''),changes->>'kind'),changes->>'kind',(changes->>'amount')::numeric,changes->>'cadence',(changes->>'starts_on')::date,changes->>'timezone') returning * into r;
 else
  update finance_recurring set title=coalesce(nullif(btrim(changes->>'title'),''),changes->>'kind'),kind=changes->>'kind',amount=(changes->>'amount')::numeric,
   cadence=changes->>'cadence',starts_on=(changes->>'starts_on')::date,timezone=changes->>'timezone',next_index=n,version=version+1 where id=rid returning * into r;
 end if;
 perform finance_materialize(wid,uid);
 select * into r from finance_recurring where id=rid;return to_jsonb(r);
end $$;
create or replace function public.finance_rollover_recurring() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare w record;begin
 for w in select distinct s.workspace_id,s.user_id from finance_recurring s join workspaces w on w.id=s.workspace_id and w.user_id=s.user_id where s.active and s.deleted_at is null and w.archived_at is null loop
  perform finance_materialize(w.workspace_id,w.user_id);
 end loop;
end $$;
revoke all on function public.finance_occurrence(date,text,integer),public.finance_materialize(uuid,uuid,date),public.finance_schedule_mutate(uuid,text,uuid,jsonb,integer),public.finance_rollover_recurring() from public,anon,authenticated;
grant execute on function public.finance_schedule_mutate(uuid,text,uuid,jsonb,integer) to authenticated;
grant execute on function public.finance_rollover_recurring() to service_role;

-- Provider identifiers are private server-selected values, never user-supplied URLs.
do $$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.finance_positions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%price_source%' loop
  execute format('alter table public.finance_positions drop constraint %I',c.conname);
 end loop;
 for c in select conname from pg_constraint where conrelid='public.finance_market_quotes'::regclass and contype='c' and pg_get_constraintdef(oid) like '%provider%' loop
  execute format('alter table public.finance_market_quotes drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.finance_positions add constraint finance_position_source check(price_source in ('manual','frankfurter','coingecko','market'));
alter table public.finance_positions add constraint finance_position_instrument check(
 price_source='manual'
 or (price_source in ('frankfurter','market') and kind='forex' and instrument in ('TRY','USD','EUR','GBP','CHF','JPY','CAD','AUD','SAR'))
 or (price_source='coingecko' and kind='crypto' and instrument in ('bitcoin','ethereum','solana','cardano','avalanche-2','ripple','dogecoin','chainlink'))
 or (price_source='market' and kind='metal' and instrument in ('XAU','XAG','XPT','XPD','XAU22','GOLD_QUARTER','GOLD_HALF','GOLD_FULL','GOLD_ATA')));
alter table public.finance_market_quotes add constraint finance_quote_provider check(provider in ('frankfurter','coingecko','market'));
alter table public.finance_market_quotes add column if not exists metadata jsonb not null default '{}';
update public.finance_positions set price_source='market' where price_source='frankfurter';
-- Preserve old reference quotes as a labelled fallback until the first live refresh.
insert into public.finance_market_quotes(provider,instrument,currency,price,price_at,fetched_at,metadata)
 select 'market',instrument,currency,price,price_at,fetched_at,jsonb_build_object('source','frankfurter','quality','reference','unit','unit','basis','mid')
 from public.finance_market_quotes where provider='frankfurter' on conflict do nothing;
create or replace function public.finance_position_values(wid uuid)
returns table(id uuid,title text,kind text,instrument text,price_source text,quantity numeric,buy_price numeric,purchased_on date,manual_price numeric,
  version integer,price numeric,price_at timestamptz,stale boolean,cost numeric,current_value numeric,gain numeric,gain_percent numeric)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,p.title,p.kind,p.instrument,p.price_source,p.quantity,p.buy_price,p.purchased_on,p.manual_price,p.version,
    coalesce(case when p.price_source='manual' then p.manual_price else q.price end,null),
    case when p.price_source='manual' then p.manual_updated_at else q.price_at end,
    case when p.price_source='manual' then false when q.price_at is null then true
      when p.price_source='frankfurter' or q.metadata->>'quality'='reference' then q.price_at < now()-interval '4 days' else q.price_at < now()-interval '15 minutes' end,
    round(p.quantity*p.buy_price,2),
    round(p.quantity*(case when p.price_source='manual' then p.manual_price else q.price end),2),
    round(p.quantity*((case when p.price_source='manual' then p.manual_price else q.price end)-p.buy_price),2),
    round(((case when p.price_source='manual' then p.manual_price else q.price end)/p.buy_price-1)*100,2)
  from finance_positions p left join finance_settings s on s.workspace_id=p.workspace_id
  left join finance_market_quotes q on q.provider=p.price_source and q.instrument=p.instrument and q.currency=coalesce(s.currency,'TRY')
  where p.workspace_id=wid and p.user_id=auth.uid()
    and exists(select 1 from workspaces w where w.id=wid and w.user_id=auth.uid());
$$;

create or replace function public.finance_summary(wid uuid,month_start date)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid()) then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501'; end if;
  if month_start is null or month_start not between date '1900-01-01' and date '2100-12-01' or extract(day from month_start)<>1 then raise exception 'INVALID_FINANCE_MONTH'; end if;
  perform finance_materialize(wid,auth.uid());
  select jsonb_build_object('currency',coalesce((select currency from finance_settings where workspace_id=wid),'TRY'),
    'income',coalesce(sum(amount) filter(where kind='income'),0),'expense',coalesce(sum(amount) filter(where kind='expense'),0),
    'count',count(*)) into result from finance_transactions where workspace_id=wid and user_id=auth.uid() and occurred_on>=month_start and occurred_on<month_start+interval '1 month';
  result:=result || jsonb_build_object(
    'monthly',coalesce((select jsonb_agg(row_to_json(m) order by m.day) from (
      select to_char(date_trunc('month',occurred_on),'YYYY-MM-DD') as "day",
      coalesce(sum(amount) filter(where kind='income'),0) income,coalesce(sum(amount) filter(where kind='expense'),0) expense
      from finance_transactions where workspace_id=wid and user_id=auth.uid() and occurred_on>=month_start-interval '11 months' and occurred_on<month_start+interval '1 month'
      group by date_trunc('month',occurred_on))m),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(row_to_json(c) order by c.amount desc) from (
      select category,sum(amount) amount from finance_transactions where workspace_id=wid and user_id=auth.uid() and kind='expense'
      and occurred_on>=month_start and occurred_on<month_start+interval '1 month' group by category)c),'[]'::jsonb),
    'portfolio',(select jsonb_build_object('count',count(*),'cost',coalesce(sum(cost),0),
      'value',sum(current_value),'priced_cost',coalesce(sum(cost) filter(where price is not null),0),
      'gain',sum(gain),'missing',count(*) filter(where price is null),'stale',count(*) filter(where stale and price is not null)) from finance_position_values(wid)),
    'allocation',coalesce((select jsonb_agg(row_to_json(a) order by a.amount desc) from (
      select kind,sum(current_value) amount from finance_position_values(wid) where price is not null group by kind)a),'[]'::jsonb),
    'quote_requests',coalesce((select jsonb_agg(row_to_json(q)) from (
      select distinct price_source provider,instrument from finance_positions where workspace_id=wid and user_id=auth.uid() and price_source<>'manual')q),'[]'::jsonb),
    'schedules',coalesce((select jsonb_agg(to_jsonb(r)-'user_id'-'workspace_id'-'created_at'-'deleted_at' || jsonb_build_object('next_on',finance_occurrence(r.starts_on,r.cadence,r.next_index)) order by r.created_at) from finance_recurring r where r.workspace_id=wid and r.user_id=auth.uid() and r.deleted_at is null),'[]'::jsonb),
    'locked_currency',exists(select 1 from finance_recurring where workspace_id=wid and deleted_at is null) or exists(select 1 from finance_transactions where workspace_id=wid) or exists(select 1 from finance_positions where workspace_id=wid));
  return result;
end $$;

create or replace function public.finance_page(wid uuid,entity text,month_start date,after_date date default null,after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rows jsonb; cursor jsonb; total bigint; more boolean;
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid()) then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501'; end if;
  if (after_date is null) <> (after_id is null) or month_start is null or extract(day from month_start)<>1 then raise exception 'INVALID_FINANCE_PAGE'; end if;
  if entity='transaction' then
    select count(*) into total from finance_transactions where workspace_id=wid and user_id=auth.uid() and occurred_on>=month_start and occurred_on<month_start+interval '1 month';
    select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_on desc,r.id desc),'[]') into rows from (
      select id,title,kind,category,amount,occurred_on,version,recurring_id from finance_transactions where workspace_id=wid and user_id=auth.uid()
      and occurred_on>=month_start and occurred_on<month_start+interval '1 month' and (after_date is null or (occurred_on,id)<(after_date,after_id))
      order by occurred_on desc,id desc limit 51)r;
    more:=jsonb_array_length(rows)>50;rows:=rows - case when more then 50 else -999 end;
    if jsonb_array_length(rows)>0 then cursor:=jsonb_build_object('date',rows->-1->>'occurred_on','id',rows->-1->>'id');end if;
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
    if exists(select 1 from finance_recurring where workspace_id=wid and deleted_at is null) or exists(select 1 from finance_transactions where workspace_id=wid) or exists(select 1 from finance_positions where workspace_id=wid) then raise exception 'FINANCE_CURRENCY_LOCKED';end if;
    insert into finance_settings(workspace_id,user_id,currency) values(wid,uid,payload->>'currency')
      on conflict(workspace_id) do update set currency=excluded.currency;
    return payload;
  end if;
  if rid is null or entity not in ('transaction','position') or operation not in ('create','update','delete') then raise exception 'INVALID_FINANCE_INPUT';end if;
  if entity='transaction' then
    for field in select jsonb_object_keys(payload) loop if field not in ('title','kind','category','amount','occurred_on') then raise exception 'INVALID_FINANCE_INPUT';end if;end loop;
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
  if entity='transaction' then changes:=jsonb_build_object('title',coalesce(changes->>'kind','expense'),'category','Uncategorized')||changes;end if;
  if entity='transaction' then
    if operation='create' then
      insert into finance_transactions(id,workspace_id,user_id,title,kind,category,amount,occurred_on)
        values(rid,wid,uid,btrim(changes->>'title'),changes->>'kind',btrim(changes->>'category'),(changes->>'amount')::numeric,(changes->>'occurred_on')::date)
        returning to_jsonb(finance_transactions) into row_data;
    else
      update finance_transactions set title=btrim(changes->>'title'),kind=changes->>'kind',category=btrim(changes->>'category'),amount=(changes->>'amount')::numeric,
        occurred_on=(changes->>'occurred_on')::date,version=version+1 where id=rid returning to_jsonb(finance_transactions) into row_data;
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

create or replace function public.finance_load(wid uuid,month_start date) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare summary jsonb;begin
 summary:=finance_summary(wid,month_start);
 return jsonb_build_object('summary',summary,'transactions',finance_page(wid,'transaction',month_start),'positions',finance_page(wid,'position',month_start));
end $$;
create or replace function public.finance_cache_quotes(items jsonb) returns void
language sql set search_path=public,pg_temp as $$
 insert into finance_market_quotes(provider,instrument,currency,price,price_at,fetched_at,metadata)
 select q.provider,q.instrument,q.currency,q.price,q.price_at,q.fetched_at,coalesce(q.metadata,'{}'::jsonb)
 from jsonb_to_recordset(items) as q(provider text,instrument text,currency text,price numeric,price_at timestamptz,fetched_at timestamptz,metadata jsonb)
 on conflict(provider,instrument,currency) do update set price=excluded.price,price_at=excluded.price_at,fetched_at=excluded.fetched_at,metadata=excluded.metadata
 where excluded.price_at>=finance_market_quotes.price_at
 or (excluded.metadata->>'quality'='live' and finance_market_quotes.metadata->>'quality'='reference');
$$;
-- Cron is optional; access-time catch-up always works without extensions or an extra service.
do $$ begin
 if to_regprocedure('cron.schedule(text,text,text)') is not null then
  perform cron.schedule('finance-recurring-rollover','5 * * * *','select public.finance_rollover_recurring();');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
