-- User budgets supplement RLS; they do not replace upstream IP/DDoS protection.
-- GET/HEAD and STABLE RPCs can use read-only transactions and are not counted.
begin;
create schema if not exists private;
create table if not exists private.api_budgets (
 user_id uuid not null references auth.users(id) on delete cascade,
 bucket text not null,
 seconds integer not null,
 window_id bigint not null,
 used integer not null check(used>0),
 primary key(user_id,bucket,seconds)
);
alter table private.api_budgets enable row level security;
revoke all on private.api_budgets from public,anon,authenticated;

create or replace function private.take_api_budget(uid uuid, name text, duration integer, quota integer)
returns boolean language plpgsql security definer set search_path=pg_catalog,private as $$
declare current_window bigint:=floor(extract(epoch from clock_timestamp())/duration); accepted integer;
begin
 insert into private.api_budgets as b(user_id,bucket,seconds,window_id,used)
 values(uid,name,duration,current_window,1)
 on conflict(user_id,bucket,seconds) do update set
 window_id=excluded.window_id,
 used=case when b.window_id=excluded.window_id then b.used+1 else 1 end
 where b.window_id<>excluded.window_id or b.used<quota
 returning used into accepted;
 return accepted is not null;
end $$;
revoke all on function private.take_api_budget(uuid,text,integer,integer) from public,anon,authenticated;

-- Register as a PostgREST pre-request check, before RLS/RPC business logic.
create or replace function public.check_api_budget()
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid:=auth.uid(); method text:=current_setting('request.method',true);
begin
 if uid is null or method is null or method in ('GET','HEAD','OPTIONS')
  or current_setting('transaction_read_only')='on' then return;end if;
 if not private.take_api_budget(uid,'data',60,240) or not private.take_api_budget(uid,'data',10,80) then
  raise sqlstate 'PGRST' using
   message='{"code":"RATE_LIMITED","message":"Too many requests","details":null,"hint":"Retry after 60 seconds"}',
   detail='{"status":429,"headers":{"Retry-After":"60"}}';
 end if;
end $$;
revoke all on function public.check_api_budget() from public,anon,authenticated;
grant execute on function public.check_api_budget() to anon,authenticated,service_role;

-- Only trusted Edge Functions may charge a verified user's shared budget.
-- An authenticated client cannot supply another user's ID or reset a quota.
create or replace function public.consume_edge_budget(uid uuid, operation text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare quota integer;
begin
 quota:=case operation when 'finance-prices' then 20 when 'send-periodic-reminder' then 30 else null end;
 if uid is null or quota is null then raise exception 'INVALID_BUDGET' using errcode='22023';end if;
 return private.take_api_budget(uid,operation,60,quota);
end $$;
revoke all on function public.consume_edge_budget(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_edge_budget(uuid,text) to service_role;

-- Do not overwrite an existing project-specific hook. Compose explicitly first.
do $$
declare existing text;
begin
 select substring(setting from length('pgrst.db_pre_request=')+1) into existing
 from pg_roles r cross join lateral unnest(r.rolconfig) setting
 where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
 if coalesce(existing,'') not in ('','public.check_api_budget') then
  raise exception 'Existing db_pre_request hook must be composed with public.check_api_budget: %',existing;
 end if;
 if exists(select 1 from pg_roles where rolname='authenticator') then
  alter role authenticator set pgrst.db_pre_request='public.check_api_budget';
 end if;
end $$;
notify pgrst,'reload schema';
notify pgrst,'reload config';
commit;
