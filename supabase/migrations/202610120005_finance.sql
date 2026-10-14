-- Private finance module. No collection bindings, search projection or sharing grants.
begin;
create table if not exists public.finance_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null default 'TRY' check(currency in ('TRY','USD','EUR','GBP'))
);
create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('income','expense')),
  title text not null check(length(btrim(title)) between 1 and 160),
  category text not null check(length(btrim(category)) between 1 and 60),
  amount numeric(16,2) not null check(amount > 0 and amount <= 1000000000000),
  occurred_on date not null check(occurred_on between date '1900-01-01' and date '2100-12-31'),
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create table if not exists public.finance_positions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(btrim(title)) between 1 and 160),
  kind text not null check(kind in ('forex','crypto','stock','metal','other')),
  instrument text not null default '' check(length(instrument)<=60),
  price_source text not null check(price_source in ('manual','frankfurter','coingecko')),
  quantity numeric(20,8) not null check(quantity > 0 and quantity <= 1000000000),
  buy_price numeric(20,8) not null check(buy_price > 0 and buy_price <= 1000000000),
  purchased_on date not null check(purchased_on between date '1900-01-01' and date '2100-12-31'),
  manual_price numeric(20,8) check(manual_price >= 0 and manual_price <= 1000000000),
  manual_updated_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check(quantity*buy_price <= 1000000000000),
  check((price_source='manual') or (price_source='frankfurter' and kind='forex' and instrument in ('USD','EUR','GBP','CHF','JPY','CAD','AUD'))
    or (price_source='coingecko' and kind='crypto' and instrument in ('bitcoin','ethereum','solana','cardano','avalanche-2','ripple','dogecoin','chainlink')))
);
create table if not exists public.finance_market_quotes (
  provider text not null check(provider in ('frankfurter','coingecko')),
  instrument text not null,
  currency text not null check(currency in ('TRY','USD','EUR','GBP')),
  price numeric(20,8) not null check(price > 0 and price <= 1000000000),
  price_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  primary key(provider,instrument,currency)
);
create index if not exists finance_transactions_page on public.finance_transactions(workspace_id,occurred_on desc,id desc);
create index if not exists finance_positions_page on public.finance_positions(workspace_id,purchased_on desc,id desc);

do $$ declare tab text; begin
  foreach tab in array array['finance_settings','finance_transactions','finance_positions'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('drop policy if exists finance_private on public.%I',tab);
    execute format('create policy finance_private on public.%I for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.user_id=(select auth.uid())))',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('grant select on public.%I to authenticated',tab);
  end loop;
end $$;
alter table public.finance_market_quotes enable row level security;
revoke all on public.finance_market_quotes from public,anon,authenticated;
grant select,insert,update on public.finance_market_quotes to service_role;
drop policy if exists finance_quote_service on public.finance_market_quotes;
create policy finance_quote_service on public.finance_market_quotes to service_role using(true) with check(true);

create or replace function public.finance_position_values(wid uuid)
returns table(id uuid,title text,kind text,instrument text,price_source text,quantity numeric,buy_price numeric,purchased_on date,manual_price numeric,
  version integer,price numeric,price_at timestamptz,stale boolean,cost numeric,current_value numeric,gain numeric,gain_percent numeric)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,p.title,p.kind,p.instrument,p.price_source,p.quantity,p.buy_price,p.purchased_on,p.manual_price,p.version,
    coalesce(case when p.price_source='manual' then p.manual_price else q.price end,null),
    case when p.price_source='manual' then p.manual_updated_at else q.price_at end,
    case when p.price_source='manual' then false when q.price_at is null then true
      when p.price_source='frankfurter' then q.price_at < now()-interval '4 days' else q.price_at < now()-interval '15 minutes' end,
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
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid()) then raise exception 'FINANCE_ACCESS_DENIED' using errcode='42501'; end if;
  if month_start is null or month_start not between date '1900-01-01' and date '2100-12-01' or extract(day from month_start)<>1 then raise exception 'INVALID_FINANCE_MONTH'; end if;
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
    'locked_currency',exists(select 1 from finance_transactions where workspace_id=wid) or exists(select 1 from finance_positions where workspace_id=wid));
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
      select id,title,kind,category,amount,occurred_on,version from finance_transactions where workspace_id=wid and user_id=auth.uid()
      and occurred_on>=month_start and occurred_on<month_start+interval '1 month' and (after_date is null or (occurred_on,id)<(after_date,after_id))
      order by occurred_on desc,id desc limit 51)r;
    more:=jsonb_array_length(rows)>50;rows:=rows - case when more then 50 else -999 end;
    if jsonb_array_length(rows)>0 then cursor:=jsonb_build_object('date',rows->-1->>'occurred_on','id',rows->-1->>'id');end if;
  elsif entity='position' then
    select count(*) into total from finance_positions where workspace_id=wid and user_id=auth.uid();
    select coalesce(jsonb_agg(to_jsonb(r) order by r.purchased_on desc,r.id desc),'[]') into rows from (
      select * from finance_position_values(wid) where after_date is null or (purchased_on,id)<(after_date,after_id)
      order by purchased_on desc,id desc limit 51)r;
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
    if exists(select 1 from finance_transactions where workspace_id=wid) or exists(select 1 from finance_positions where workspace_id=wid) then raise exception 'FINANCE_CURRENCY_LOCKED';end if;
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
    if (changes->>'purchased_on')::date>current_date then raise exception 'INVALID_FINANCE_INPUT';end if;
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
-- One request and one database snapshot for the initial view; pages remain independently loadable.
create or replace function public.finance_load(wid uuid,month_start date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('summary',finance_summary(wid,month_start),
    'transactions',finance_page(wid,'transaction',month_start),'positions',finance_page(wid,'position',month_start));
$$;
revoke all on function public.finance_position_values(uuid),public.finance_summary(uuid,date),public.finance_page(uuid,text,date,date,uuid),public.finance_mutate(uuid,text,text,uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.finance_load(uuid,date) from public,anon,authenticated;
grant execute on function public.finance_load(uuid,date) to authenticated;
grant execute on function public.finance_summary(uuid,date),public.finance_page(uuid,text,date,date,uuid),public.finance_mutate(uuid,text,text,uuid,jsonb,integer) to authenticated;

create or replace function public.finance_cache_quotes(items jsonb) returns void
language sql set search_path=public,pg_temp as $$
  insert into finance_market_quotes(provider,instrument,currency,price,price_at,fetched_at)
    select q.provider,q.instrument,q.currency,q.price,q.price_at,q.fetched_at
    from jsonb_to_recordset(items) as q(provider text,instrument text,currency text,price numeric,price_at timestamptz,fetched_at timestamptz)
  on conflict(provider,instrument,currency) do update set price=excluded.price,price_at=excluded.price_at,fetched_at=excluded.fetched_at
    where excluded.price_at>=finance_market_quotes.price_at;
$$;
revoke all on function public.finance_cache_quotes(jsonb) from public,anon,authenticated;
grant execute on function public.finance_cache_quotes(jsonb) to service_role;
-- New workspaces get Finance; existing ones gain it once without resetting other tab choices on reruns.
alter table public.workspaces alter column active_modules set default array['plans','detailed','quick','secure','code','pomodoro','learning','flashcards','workout','periodic','activities','finance'];
with added as (
  insert into finance_settings(workspace_id,user_id) select id,user_id from workspaces on conflict(workspace_id) do nothing returning workspace_id
) update workspaces set active_modules=array_append(active_modules,'finance') where id in(select workspace_id from added) and not 'finance'=any(active_modules);
notify pgrst,'reload schema';
commit;
