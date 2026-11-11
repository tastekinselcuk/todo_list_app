-- Preserve existing Outlook connections while adding Google Calendar to the same private service.
-- OAuth state is bound to its provider; callbacks cannot consume another provider's attempt.
alter table public.external_calendar_connections drop constraint if exists external_calendar_connections_provider_check;
alter table public.external_calendar_connections add constraint external_calendar_connections_provider_check check(provider in ('outlook','google'));
alter table public.external_calendar_oauth add column if not exists provider text not null default 'outlook';
alter table public.external_calendar_oauth drop constraint if exists external_calendar_oauth_provider_check;
alter table public.external_calendar_oauth add constraint external_calendar_oauth_provider_check check(provider in ('outlook','google'));

create or replace function public.external_calendar_service(uid uuid, operation text, record_id uuid default null, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c external_calendar_connections; tok external_calendar_tokens; state external_calendar_oauth;
 provider_key text:=coalesce(payload->>'provider','outlook'); item jsonb; ids uuid[]; n integer; b external_calendar_budgets; lim integer;
begin
 if operation in ('consume','begin','complete') and provider_key not in ('outlook','google') then raise exception 'CALENDAR_INVALID'; end if;
 if operation='consume' then
  delete from external_calendar_oauth where state_hash=payload->>'hash' and provider=provider_key and expires_at>now() returning * into state;
  return to_jsonb(state);
 end if;
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'CALENDAR_ACCESS_DENIED'; end if;
 if operation='budget' then
  lim:=case payload->>'action' when 'connect' then 5 when 'events' then 120 else 60 end;
  insert into external_calendar_budgets(user_id,action) values(uid,payload->>'action') on conflict do nothing;
  select * into b from external_calendar_budgets where user_id=uid and action=payload->>'action' for update;
  if b.started_at<now()-interval '10 minutes' then b.requests:=0; b.started_at:=now(); end if;
  if b.requests>=lim then return 'false'::jsonb; end if;
  update external_calendar_budgets set requests=b.requests+1,started_at=b.started_at where user_id=uid and action=b.action;
  return 'true'::jsonb;
 elsif operation='begin' then
  delete from external_calendar_oauth where expires_at<=now();
  insert into external_calendar_oauth(state_hash,user_id,verifier_cipher,return_url,provider) values(payload->>'hash',uid,payload->>'verifier',payload->>'return_url',provider_key);
  return 'true'::jsonb;
 elsif operation='list' then
  return jsonb_build_object('connections',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'provider',x.provider,'label',x.label,'status',x.status,'updated_at',x.updated_at,'calendars',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'color',s.color,'selected',s.selected) order by s.name,s.id) from external_calendar_sources s where s.connection_id=x.id),'[]'::jsonb)) order by x.updated_at,x.id) from external_calendar_connections x where x.user_id=uid),'[]'::jsonb));
 elsif operation='complete' then
  perform pg_advisory_xact_lock(hashtextextended(uid::text,771));
  select * into c from external_calendar_connections where user_id=uid and provider=provider_key and account_key=payload->>'account_key' for update;
  if c.id is null then
   if (select count(*) from external_calendar_connections where user_id=uid)>=5 then raise exception 'CALENDAR_LIMIT'; end if;
   insert into external_calendar_connections(user_id,provider,account_key,label) values(uid,provider_key,payload->>'account_key',left(payload->>'label',254)) returning * into c;
  else update external_calendar_connections set status='connected',label=left(payload->>'label',254),updated_at=now() where id=c.id; end if;
  insert into external_calendar_tokens(connection_id,access_cipher,refresh_cipher,expires_at) values(c.id,payload->>'access',payload->>'refresh',(payload->>'expires_at')::timestamptz)
   on conflict(connection_id) do update set access_cipher=excluded.access_cipher,refresh_cipher=excluded.refresh_cipher,expires_at=excluded.expires_at,version=external_calendar_tokens.version+1,locked_until=null;
  record_id:=c.id;
 elsif operation='select' then
  perform pg_advisory_xact_lock(hashtextextended(uid::text,771));
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(payload->'ids');
  if cardinality(ids)>10 or exists(select 1 from unnest(ids) i where not exists(select 1 from external_calendar_sources s join external_calendar_connections x on x.id=s.connection_id where s.id=i and x.user_id=uid)) then raise exception 'CALENDAR_SELECTION_INVALID'; end if;
  update external_calendar_sources s set selected=s.id=any(ids) from external_calendar_connections x where x.id=s.connection_id and x.user_id=uid;
  return 'true'::jsonb;
 end if;
 select * into c from external_calendar_connections where id=record_id and user_id=uid for update;
 if c.id is null then raise exception 'CALENDAR_ACCESS_DENIED'; end if;
 if operation in ('complete','sync') then
  if jsonb_typeof(payload->'calendars')<>'array' or jsonb_array_length(payload->'calendars')>100 then raise exception 'CALENDAR_INVALID'; end if;
  select count(*) into n from external_calendar_sources where connection_id=c.id;
  for item in select value from jsonb_array_elements(payload->'calendars') loop
   insert into external_calendar_sources(connection_id,remote_id,name,color,selected)
    values(c.id,item->>'id',left(item->>'name',150),item->>'color',n=0 and coalesce((item->>'default')::boolean,false) and (select count(*) from external_calendar_sources s join external_calendar_connections x on x.id=s.connection_id where x.user_id=uid and s.selected)<10)
    on conflict(connection_id,remote_id) do update set name=excluded.name,color=excluded.color;
  end loop;
  delete from external_calendar_sources s where connection_id=c.id and not exists(select 1 from jsonb_array_elements(payload->'calendars') j where j->>'id'=s.remote_id);
  update external_calendar_connections set updated_at=now() where id=c.id;
  return jsonb_build_object('id',c.id);
 elsif operation='disconnect' then
  delete from external_calendar_connections where id=c.id; return 'true'::jsonb;
 elsif operation='tokens' then
  select * into tok from external_calendar_tokens where connection_id=c.id;
  return to_jsonb(tok)||jsonb_build_object('account_key',c.account_key,'status',c.status,'provider',c.provider);
 elsif operation='sources' then
  return coalesce((select jsonb_agg(to_jsonb(s)) from external_calendar_sources s where s.connection_id=c.id and s.selected),'[]'::jsonb);
 elsif operation='lock' then
  update external_calendar_tokens set locked_until=now()+interval '30 seconds' where connection_id=c.id and (locked_until is null or locked_until<now()) and version=(payload->>'version')::integer;
  return to_jsonb(found);
 elsif operation='refreshed' then
  update external_calendar_tokens set access_cipher=payload->>'access',refresh_cipher=payload->>'refresh',expires_at=(payload->>'expires_at')::timestamptz,version=version+1,locked_until=null where connection_id=c.id and version=(payload->>'version')::integer;
  return to_jsonb(found);
 elsif operation='unlock' then
  update external_calendar_tokens set locked_until=null where connection_id=c.id and version=(payload->>'version')::integer;return 'true'::jsonb;
 elsif operation='reauth' then
  update external_calendar_connections set status='reauth' where id=c.id; return 'true'::jsonb;
 end if;
 raise exception 'CALENDAR_INVALID';
end $$;
revoke all on function public.external_calendar_service(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.external_calendar_service(uuid,text,uuid,jsonb) to service_role;
