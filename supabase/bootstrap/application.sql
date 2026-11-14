-- Application schema snapshot through 202611140013. No user data or server secrets.
-- Install only into empty application namespaces on a Supabase platform.
begin;
select pg_advisory_xact_lock(hashtext('pomodolist:bootstrap'));
do $$ begin
 if to_regclass('auth.users') is null or to_regclass('storage.objects') is null then raise exception 'SUPABASE_PLATFORM_REQUIRED'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p')) then raise exception 'APPLICATION_DATABASE_NOT_EMPTY'; end if;
end; $$;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS private;


ALTER SCHEMA private OWNER TO postgres;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: rutin_assignment_strategy; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rutin_assignment_strategy AS ENUM (
    'fixed',
    'rotate',
    'everyone',
    'anyone'
);


ALTER TYPE public.rutin_assignment_strategy OWNER TO postgres;

--
-- Name: rutin_member_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rutin_member_role AS ENUM (
    'owner',
    'member'
);


ALTER TYPE public.rutin_member_role OWNER TO postgres;

--
-- Name: rutin_occurrence_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rutin_occurrence_status AS ENUM (
    'pending',
    'done',
    'skipped',
    'missed'
);


ALTER TYPE public.rutin_occurrence_status OWNER TO postgres;

--
-- Name: rutin_overdue_policy; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rutin_overdue_policy AS ENUM (
    'carry_over',
    'expire'
);


ALTER TYPE public.rutin_overdue_policy OWNER TO postgres;

--
-- Name: rutin_recurrence_kind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rutin_recurrence_kind AS ENUM (
    'fixed',
    'quota',
    'since_last_done',
    'once'
);


ALTER TYPE public.rutin_recurrence_kind OWNER TO postgres;

--
-- Name: rutin_workspace_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.rutin_workspace_type AS ENUM (
    'home',
    'cafe',
    'office',
    'airbnb',
    'personal'
);


ALTER TYPE public.rutin_workspace_type OWNER TO postgres;

--
-- Name: secure_note_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.secure_note_type AS ENUM (
    'password',
    'note',
    'secret'
);


ALTER TYPE public.secure_note_type OWNER TO postgres;

--
-- Name: todo_priority; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.todo_priority AS ENUM (
    'low',
    'medium',
    'high'
);


ALTER TYPE public.todo_priority OWNER TO postgres;

--
-- Name: take_api_budget(uuid, text, integer, integer); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE FUNCTION private.take_api_budget(uid uuid, name text, duration integer, quota integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'private'
    AS $$
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


ALTER FUNCTION private.take_api_budget(uid uuid, name text, duration integer, quota integer) OWNER TO postgres;

--
-- Name: accept_collection_invite(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.accept_collection_invite(invite_token text, wid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare inv collection_invites; c module_collections;
begin
  if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITE_INVALID'; end if;
  perform public.ensure_module_bindings(wid);
  select * into inv from collection_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex');
  if inv.id is null then raise exception 'INVITE_INVALID'; end if;
  select * into c from module_collections where id=inv.collection_id for update;
  select * into inv from collection_invites where id=inv.id for update;
  perform public.preview_collection_invite(invite_token);
  if exists(select 1 from workspace_module_bindings where workspace_id=wid and module=c.module
    and collection_id<>personal_collection_id and collection_id<>c.id) then raise exception 'ALREADY_SHARED'; end if;
  if exists(select 1 from collection_members where collection_id=c.id and user_id=auth.uid()
    and role<>'owner' and role<>inv.invite_role) then raise exception 'ALREADY_MEMBER'; end if;
  insert into collection_members(collection_id,user_id,role) values(c.id,auth.uid(),
    case when c.owner_id=auth.uid() then 'owner' else inv.invite_role end) on conflict do nothing;
  update workspace_module_bindings set collection_id=c.id where workspace_id=wid and module=c.module;
  update workspaces set active_modules=array(select distinct unnest(active_modules || case when c.module='quick' then array['plans'] else array[c.module] end)) where id=wid;
  update collection_invites set used_by=auth.uid(),used_at=now() where id=inv.id;
  return public.sharing_context(wid);
end;
$_$;


ALTER FUNCTION public.accept_collection_invite(invite_token text, wid uuid) OWNER TO postgres;

--
-- Name: activity_library_context(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.activity_library_context(wid uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid;
begin
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
 where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and b.module='activities' and 'activities'=any(w.active_modules);
 if cid is null or not public.collection_access(cid) then raise exception 'ACTIVITY_ACCESS_DENIED' using errcode='42501';end if;
 return cid;
end $$;


ALTER FUNCTION public.activity_library_context(wid uuid) OWNER TO postgres;

--
-- Name: activity_library_load(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.activity_library_load(wid uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid:=public.activity_library_context(wid);
begin
 return jsonb_build_object(
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id) from activity_items i where i.collection_id=cid and i.deleted_at is null),'[]'),
 'collections',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at,g.id) from activity_collections g where g.collection_id=cid),'[]'),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('group_id',m.group_id,'item_id',m.item_id)) from activity_collection_items m join activity_items i on i.id=m.item_id where m.collection_id=cid and i.deleted_at is null),'[]'));
end $$;


ALTER FUNCTION public.activity_library_load(wid uuid) OWNER TO postgres;

--
-- Name: activity_library_mutate(uuid, text, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.activity_library_mutate(wid uuid, operation text, rid uuid, payload jsonb DEFAULT '{}'::jsonb, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
end $_$;


ALTER FUNCTION public.activity_library_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) OWNER TO postgres;

--
-- Name: analytics_report(uuid, date, date, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.analytics_report(wid uuid, date_from date, date_to date, report_timezone text, personal boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select analytics_report_v2(wid,date_from,date_to,report_timezone,personal,true);
$$;


ALTER FUNCTION public.analytics_report(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) OWNER TO postgres;

--
-- Name: analytics_report_v2(uuid, date, date, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.analytics_report_v2(wid uuid, date_from date, date_to date, report_timezone text, personal boolean, include_items boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb; uid uuid := auth.uid(); recording timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if date_from is null or date_to is null or date_to<date_from or date_to-date_from>365 then raise exception 'INVALID_DATE_RANGE'; end if;
  if not exists(select 1 from pg_timezone_names where name=report_timezone) then raise exception 'INVALID_TIMEZONE'; end if;
  if date_to>(clock_timestamp() at time zone report_timezone)::date then raise exception 'INVALID_DATE_RANGE'; end if;
  if wid is not null and not exists(select 1 from public.workspaces where id=wid and user_id=uid) then raise exception 'WORKSPACE_FORBIDDEN'; end if;
  select recording_started_at into recording from public.analytics_config where id;
  with bindings as (
    select b.collection_id,b.module,(array_agg(w.id order by (w.archived_at is not null),w.created_at,w.id))[1] as workspace_id from public.workspace_module_bindings b
      join public.workspaces w on w.id=b.workspace_id
      where w.user_id=uid and (wid is null or w.id=wid) and public.collection_access(b.collection_id)
        and b.module in ('quick','detailed','plans')
      group by b.collection_id,b.module
  ), events as (
    select e.* from public.analytics_events e join bindings b using(collection_id,module)
      where include_items or (e.occurred_at>=date_from::timestamp at time zone report_timezone and e.occurred_at<(date_to+1)::timestamp at time zone report_timezone)
  ), movements as (
    select *,row_number() over(partition by collection_id,record_id,kind order by occurred_at,id) as sequence
    from events where kind<>'baseline' and occurred_at>=date_from::timestamp at time zone report_timezone
      and occurred_at<(date_to+1)::timestamp at time zone report_timezone
      and (not personal or actor_id=uid)
  ), days as (
    select generate_series(date_from::timestamp,date_to::timestamp,interval '1 day')::date as day
  ), ranges as (
    select tstzrange((p->>0)::timestamptz,(p->>1)::timestamptz,'[)') as span,
      case when s.association='free' then 'free' when s.task_id is not null and collection_access(s.collection_id) then 'task' else 'unavailable' end as category
      from public.analytics_focus_sessions s cross join lateral jsonb_array_elements(coalesce(s.credited_segments,s.segments)) p
      where s.user_id=uid and (wid is null or s.workspace_id=wid) and (p->>1)::timestamptz>(p->>0)::timestamptz
        and (p->>1)::timestamptz>=date_from::timestamp at time zone report_timezone
        and (p->>0)::timestamptz<(date_to+1)::timestamp at time zone report_timezone
  ), allocations as (
    select category,unnest(range_agg(span)) * tstzrange(date_from::timestamp at time zone report_timezone,(date_to+1)::timestamp at time zone report_timezone,'[)') as span
      from ranges group by category
  ), merged as (
    select unnest(range_agg(span)) as span from ranges
  ), focus_daily as (
    select d.day,coalesce(sum(extract(epoch from upper(clipped)-lower(clipped))),0) as seconds
    from days d left join lateral (
      select span * tstzrange(d.day::timestamp at time zone report_timezone,(d.day+1)::timestamp at time zone report_timezone,'[)') as clipped
      from merged where span && tstzrange(d.day::timestamp at time zone report_timezone,(d.day+1)::timestamp at time zone report_timezone,'[)')
    ) q on true group by d.day
  ), daily as (
    select d.day,f.seconds,
      (select count(*) from movements m where m.kind='created' and (m.occurred_at at time zone report_timezone)::date=d.day) as created,
      (select count(*) from movements m where m.kind='completed' and m.sequence=1 and (m.occurred_at at time zone report_timezone)::date=d.day) as completed,
      (select count(*) from movements m where m.kind='reopened' and (m.occurred_at at time zone report_timezone)::date=d.day) as reopened,
      (select count(*) from movements m where m.kind='deleted' and (m.occurred_at at time zone report_timezone)::date=d.day) as deleted,
      case when not include_items or d.day<(recording at time zone report_timezone)::date then null else (
        select count(*) from (select distinct on(collection_id,record_id) kind,completed from events
          where occurred_at<(d.day+1)::timestamp at time zone report_timezone order by collection_id,record_id,occurred_at desc,id desc) stock
        where kind<>'deleted' and not completed
      ) end as pending
    from days d join focus_daily f using(day)
  ), latest as (
    select distinct on(collection_id,record_id) * from events where include_items order by collection_id,record_id,occurred_at desc,id desc
  ), live_items as (
    select collection_id,id,left(regexp_replace(content,'<[^>]*>','','g'),160) as title from public.quick_notes where include_items
    union all select collection_id,id,left(title,160) from public.todos where include_items
    union all select collection_id,id,left(title,160) from public.plans where include_items
    union all select collection_id,id,left(title,160) from public.pomo_tasks where include_items
  ), items as (
    select l.module,l.record_id,l.item_created_at,l.completed,l.period,l.carry_count,i.title,b.workspace_id
      from latest l join live_items i on i.collection_id=l.collection_id and i.id=l.record_id
      join bindings b on b.collection_id=l.collection_id and b.module=l.module where l.kind<>'deleted'
  ) select jsonb_build_object(
    'recording_started_at',recording,'timezone',report_timezone,'date_from',date_from,'date_to',date_to,
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day) from daily d),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by item_created_at) from items i),'[]'::jsonb),
    'focus_breakdown',coalesce((select jsonb_object_agg(category,seconds) from (
      select category,sum(extract(epoch from upper(span)-lower(span))) as seconds from allocations group by category
    ) a),'{}'::jsonb),
    'completed_sessions',(select count(*) from public.analytics_focus_sessions s where s.user_id=uid
      and (wid is null or s.workspace_id=wid) and s.status='completed' and s.credited_completed
      and (coalesce(s.credited_segments,s.segments)->-1->>1)::timestamptz>=date_from::timestamp at time zone report_timezone
      and (coalesce(s.credited_segments,s.segments)->-1->>1)::timestamptz<(date_to+1)::timestamp at time zone report_timezone)
  ) into result;
  return result;
end $$;


ALTER FUNCTION public.analytics_report_v2(wid uuid, date_from date, date_to date, report_timezone text, personal boolean, include_items boolean) OWNER TO postgres;

--
-- Name: analytics_summary(uuid, date, date, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.analytics_summary(wid uuid, date_from date, date_to date, report_timezone text, personal boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select analytics_report_v2(wid,date_from,date_to,report_timezone,personal,false)-'items';
$$;


ALTER FUNCTION public.analytics_summary(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) OWNER TO postgres;

--
-- Name: application_auth_ready(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.application_auth_ready() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
 select exists (
  select 1 from pg_roles r cross join lateral unnest(r.rolconfig) s
  where r.rolname='authenticator' and s='pgrst.db_pre_request=public.check_session_security'
 ) and not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and c.relrowsecurity
   and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
   and not exists (
    select 1 from pg_policy p where p.polrelid=c.oid and p.polname='require_verified_mfa'
     and not p.polpermissive and p.polcmd='*'
     and (select oid from pg_roles where rolname='authenticated')=any(p.polroles)
     and pg_get_expr(p.polqual,p.polrelid) like '%session_mfa_satisfied()%'
     and pg_get_expr(p.polwithcheck,p.polrelid) like '%session_mfa_satisfied()%'
   )
 ) and not has_function_privilege('anon','public.session_mfa_satisfied()','execute');
$$;


ALTER FUNCTION public.application_auth_ready() OWNER TO postgres;

--
-- Name: application_migrations_ready(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.application_migrations_ready(required jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare item jsonb;
begin
 if jsonb_typeof(required) is distinct from 'array' then return false; end if;
 if jsonb_array_length(required) not between 1 and 128 then return false; end if;
 for item in select value from jsonb_array_elements(required) loop
  if coalesce(item->>'version','') !~ '^[0-9]{12,14}$' or coalesce(item->>'sha256','') !~ '^[a-f0-9]{64}$'
   or not exists(select 1 from supabase_migrations.schema_migrations m where m.version=item->>'version' and m.checksum=item->>'sha256') then return false; end if;
 end loop;
 return true;
end; $_$;


ALTER FUNCTION public.application_migrations_ready(required jsonb) OWNER TO postgres;

--
-- Name: application_release_ready(text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.application_release_ready(required_rpc text[]) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $_$
  select coalesce(cardinality(required_rpc) between 1 and 128, false)
    and not exists (
      select 1 from unnest(required_rpc) required(name)
      where name is null or name !~ '^[a-z][a-z0-9_]{0,62}$'
        or not exists (
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = required.name
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        )
    )
    and not exists (
      select 1 from (values
        ('secure_notes', 'encrypted_payload'), ('secure_notes', 'version'),
        ('password_sessions', 'password_hash'), ('password_sessions', 'version'),
        ('workout_library_exercises', 'removed_at'),
        ('plans', 'period'), ('plans', 'version'),
        ('work_blocks', 'task_id')
      ) required(table_name, column_name)
      where not exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        where n.nspname = 'public' and c.relname = required.table_name
          and c.relrowsecurity and a.attname = required.column_name
          and a.attnum > 0 and not a.attisdropped
      )
    )
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('rutin_workspaces', 'rutin_members', 'rutin_routines',
          'rutin_routine_assignees', 'rutin_recurrences', 'rutin_occurrences')
        and (not c.relrowsecurity
          or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
          or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
          or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE')
          or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE'))
    );
$_$;


ALTER FUNCTION public.application_release_ready(required_rpc text[]) OWNER TO postgres;

--
-- Name: application_security_ready(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.application_security_ready() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare item record; object_oid oid;
begin
 for item in select * from (values
  ('password_sessions','vault_v2_metadata_required'),('secure_notes','vault_ciphertext_required'),
  ('secure_notes','vault_plaintext_forbidden'),('vault_note_history','vault_history_ciphertext_required')
 ) required(table_name,constraint_name) loop
  if not exists(select 1 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=item.table_name and k.conname=item.constraint_name and k.convalidated) then return false; end if;
 end loop;
 if not exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.secure_notes') and a.attname='encrypted_payload' and a.attnotnull and not a.attisdropped) then return false; end if;
 for item in select name from (values('public.background_run_status'),('private.maintenance_tickets'),('private.client_error_counts'),('private.background_dispatch_config')) required(name) loop
  object_oid:=to_regclass(item.name);
  if object_oid is null or not exists(select 1 from pg_class c where c.oid=object_oid and c.relrowsecurity) then return false; end if;
  if has_table_privilege('anon',object_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   or has_table_privilege('authenticated',object_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
   or has_any_column_privilege('anon',object_oid,'SELECT,INSERT,UPDATE')
   or has_any_column_privilege('authenticated',object_oid,'SELECT,INSERT,UPDATE') then return false; end if;
 end loop;
 for item in select name from (values('public.consume_maintenance_ticket(uuid,bigint)'),('public.claim_due_periodic_emails(integer,text)'),
  ('public.enqueue_scheduled_maintenance()'),('public.cleanup_operational_metrics()')) required(name) loop
  object_oid:=to_regprocedure(item.name);
  if object_oid is null or not has_function_privilege('service_role',object_oid,'EXECUTE')
   or has_function_privilege('anon',object_oid,'EXECUTE') or has_function_privilege('authenticated',object_oid,'EXECUTE') then return false; end if;
 end loop;
 return exists(select 1 from cron.job where jobname='scheduled-maintenance' and active and schedule='* * * * *')
  and exists(select 1 from private.background_dispatch_config where singleton)
  and exists(select 1 from vault.secrets where name='operations_cron_secret');
exception when undefined_table or invalid_schema_name then return false;
end; $$;


ALTER FUNCTION public.application_security_ready() OWNER TO postgres;

--
-- Name: capture_analytics_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.capture_analytics_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  n jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  event_kind text;
  done boolean := coalesce((n->>'completed')::boolean,false);
  actor uuid := auth.uid();
begin
  if tg_argv[0]='pomodoro' then return null;end if;
  if tg_op='DELETE' and n->>'deleted_at' is not null then return null;
  elsif tg_op='UPDATE' and n->>'deleted_at' is distinct from o->>'deleted_at' then
    event_kind := case when n->>'deleted_at' is null then 'baseline' else 'deleted' end;
  elsif tg_op='INSERT' then event_kind := 'created';
  elsif tg_op='DELETE' then event_kind := 'deleted';
  elsif done is distinct from coalesce((o->>'completed')::boolean,false) then
    event_kind := case when done then 'completed' else 'reopened' end;
  elsif tg_argv[0]='plans' and n->>'period_date' is distinct from o->>'period_date'
    and jsonb_array_length(coalesce(n->'history','[]')) > jsonb_array_length(coalesce(o->'history','[]')) then
    event_kind := 'rollover'; actor := null;
  elsif tg_argv[0]='plans' and n->>'reason' is distinct from o->>'reason' and coalesce(n->>'reason','')<>'' then
    event_kind := 'deferred';
  else return null;
  end if;
  insert into public.analytics_events(collection_id,record_id,module,kind,actor_id,completed,item_created_at,period,carry_count,is_import_baseline)
    values((n->>'collection_id')::uuid,(n->>'id')::uuid,tg_argv[0],event_kind,actor,done,
      (n->>'created_at')::timestamptz,n->>'period',jsonb_array_length(coalesce(n->'history','[]')),false);
  return null;
end $$;


ALTER FUNCTION public.capture_analytics_event() OWNER TO postgres;

--
-- Name: check_api_budget(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_api_budget() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION public.check_api_budget() OWNER TO postgres;

--
-- Name: check_session_security(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_session_security() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
 perform public.check_api_budget();
 if auth.uid() is not null and not public.session_mfa_satisfied() then
  raise sqlstate 'PGRST' using message='{"code":"MFA_REQUIRED","message":"MFA_REQUIRED","details":null,"hint":"Verify your authenticator code"}',detail='{"status":403,"headers":{}}';
 end if;
end; $$;


ALTER FUNCTION public.check_session_security() OWNER TO postgres;

--
-- Name: claim_due_periodic_emails(integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.claim_due_periodic_emails(batch_size integer DEFAULT 5, recipient_filter text DEFAULT NULL::text) RETURNS SETOF jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare candidate record; result jsonb; claimed integer:=0;
begin
  if batch_size is null or batch_size not between 1 and 20 then raise exception 'INVALID_BATCH_SIZE'; end if;
  for candidate in
    select distinct on (p.user_id,t.id) p.user_id,t.id,w.id as workspace_id,c.timezone
    from public.periodic_member_preferences p
    join public.periodic_tasks t on t.id=p.task_id and t.deleted_at is null
    join public.module_collections c on c.id=t.collection_id
    join public.collection_members m on m.collection_id=c.id and m.user_id=p.user_id
    join public.workspace_module_bindings b on b.collection_id=c.id and b.module='periodic'
    join public.workspaces w on w.id=b.workspace_id and w.user_id=p.user_id
    join auth.users u on u.id=p.user_id and u.email_confirmed_at is not null
    join pg_timezone_names z on z.name=c.timezone
    where p.notify_email and p.reminder_time is not null and w.archived_at is null
      and 'periodic'=any(w.active_modules)
      and (recipient_filter is null or lower(u.email)=lower(recipient_filter))
      and (clock_timestamp() at time zone c.timezone)>=(clock_timestamp() at time zone c.timezone)::date+p.reminder_time
      and (clock_timestamp() at time zone c.timezone)<(clock_timestamp() at time zone c.timezone)::date+p.reminder_time+interval '10 minutes'
      and not exists(select 1 from public.periodic_email_deliveries d where d.user_id=p.user_id and d.task_id=t.id
        and d.delivery_day=(clock_timestamp() at time zone c.timezone)::date
        and (d.delivered_at is not null or d.attempts>=5 or d.claimed_at>clock_timestamp()-interval '1 minute'))
    order by p.user_id,t.id,w.created_at,w.id limit 1000
  loop
    begin
      result:=public.claim_periodic_email(candidate.user_id,candidate.id,candidate.workspace_id,candidate.timezone);
      if result->>'status'='claimed' then
        return next result; claimed:=claimed+1;
        exit when claimed>=batch_size;
      end if;
    exception when raise_exception then
      if sqlerrm not in ('ACCESS_DENIED','EMAIL_DISABLED','EMAIL_UNAVAILABLE','INVALID_TIMEZONE','REMINDER_NOT_DUE','DELIVERY_LIMIT') then raise; end if;
    end;
  end loop;
end; $$;


ALTER FUNCTION public.claim_due_periodic_emails(batch_size integer, recipient_filter text) OWNER TO postgres;

--
-- Name: claim_focus_session(uuid, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.claim_focus_session(client_id uuid, payload jsonb, takeover boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare uid uuid:=auth.uid(); holder focus_ownership; active analytics_focus_sessions; token uuid; context jsonb;
  parts jsonb; last_end timestamptz; elapsed double precision; finish timestamptz; proposal jsonb;
begin
  if uid is null or client_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  select * into holder from focus_ownership where user_id=uid for update;
  select * into active from analytics_focus_sessions where id=holder.session_id;
  if active.id is not null and active.status in ('running','paused') and holder.client_id<>claim_focus_session.client_id then
    if not takeover then return jsonb_build_object('status','busy','active',focus_context(claim_focus_session.client_id)->'active'); end if;
    -- Close the previous owner's running segment at handoff, never past its live lease.
    if active.status='running' then
      parts:=active.segments;
      select coalesce(sum(extract(epoch from (p->>1)::timestamptz-(p->>0)::timestamptz)),0) into elapsed from jsonb_array_elements(parts) p;
      last_end:=greatest(coalesce((parts->-1->>1)::timestamptz,active.started_at),coalesce(holder.segment_started_at,active.started_at));
      finish:=least(clock_timestamp(),holder.expires_at,last_end+(greatest(active.planned_seconds-elapsed,0)||' seconds')::interval);
      if finish>last_end then parts:=parts||jsonb_build_array(jsonb_build_array(last_end,finish)); end if;
      proposal:=to_jsonb(active)||jsonb_build_object('segments',parts,'revision',active.revision+1,
        'status',case when elapsed+extract(epoch from greatest(finish,last_end)-last_end)>=active.planned_seconds-1 then 'completed' else 'paused' end,
        'client_id',holder.client_id,'lease',holder.lease);
      perform record_focus_session(proposal);
      select * into active from analytics_focus_sessions where id=active.id;
    end if;
    token:=gen_random_uuid();
    update focus_ownership set client_id=claim_focus_session.client_id,lease=token,segment_started_at=null,expires_at=clock_timestamp()+interval '45 seconds' where user_id=uid;
    update analytics_focus_sessions set writer_client=claim_focus_session.client_id,writer_lease=token where id=holder.session_id;
    context:=focus_context(claim_focus_session.client_id)->'active';
    if context is null or context='null'::jsonb then return jsonb_build_object('status','finished'); end if;
    return jsonb_build_object('status','claimed','active',context);
  end if;
  if payload is null then return jsonb_build_object('status','idle'); end if;
  if payload->>'association'='task' and not exists(select 1 from analytics_focus_sessions s where s.id=(payload->>'id')::uuid and s.user_id=uid) and not exists(select 1 from pomo_tasks t
    join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='pomodoro'
    join workspaces w on w.id=b.workspace_id where t.deleted_at is null and t.id=(payload->>'task_id')::uuid and not t.completed
      and plan_focus_source_available((payload->>'workspace_id')::uuid,t.id) and collection_access(t.collection_id) and w.id=(payload->>'workspace_id')::uuid and w.user_id=uid and w.archived_at is null) then raise exception 'FOCUS_TARGET_UNAVAILABLE'; end if;
  -- Persist before assigning the lease. Existing sessions retain their frozen target.
  token:=gen_random_uuid();
  if holder.session_id=(payload->>'id')::uuid then
    payload:=payload||jsonb_build_object('client_id',holder.client_id,'lease',holder.lease);
  end if;
  perform record_focus_session(payload);
  if exists(select 1 from analytics_focus_sessions where id=(payload->>'id')::uuid and status in ('completed','ended')) then
    return jsonb_build_object('status','finished');
  end if;
  insert into focus_ownership(user_id,session_id,client_id,lease,segment_started_at) values(uid,(payload->>'id')::uuid,claim_focus_session.client_id,token,clock_timestamp())
    on conflict(user_id) do update set session_id=excluded.session_id,client_id=excluded.client_id,lease=excluded.lease,segment_started_at=excluded.segment_started_at,expires_at=clock_timestamp()+interval '45 seconds';
  update analytics_focus_sessions set writer_client=claim_focus_session.client_id,writer_lease=token where id=(payload->>'id')::uuid;
  if payload->>'association'='task' then
    update pomo_task_member_preferences set first_estimate_seconds=coalesce(first_estimate_seconds,estimated_sessions*focus_seconds)
      where task_id=(payload->>'task_id')::uuid and user_id=uid;
  end if;
  return jsonb_build_object('status','claimed','active',focus_context(claim_focus_session.client_id)->'active');
end $$;


ALTER FUNCTION public.claim_focus_session(client_id uuid, payload jsonb, takeover boolean) OWNER TO postgres;

--
-- Name: claim_periodic_email(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.claim_periodic_email(uid uuid, tid uuid, wid uuid, tz text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare task public.periodic_tasks; pref public.periodic_member_preferences;
  delivery public.periodic_email_deliveries; local_now timestamp; today date;
  recipient text; workspace_name text; due boolean; done boolean; message jsonb;
begin
  if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'INVALID_TIMEZONE'; end if;
  local_now := clock_timestamp() at time zone tz; today := local_now::date;
  select t.* into task from periodic_tasks t
    join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='periodic'
    join workspaces w on w.id=b.workspace_id
    join collection_members m on m.collection_id=t.collection_id and m.user_id=uid
    where t.deleted_at is null and t.id=tid and w.id=wid and w.user_id=uid and w.archived_at is null and 'periodic'=any(w.active_modules);
  if not found then raise exception 'ACCESS_DENIED'; end if;
  select * into pref from periodic_member_preferences where task_id=tid and user_id=uid;
  if not found or not pref.notify_email or pref.reminder_time is null then raise exception 'EMAIL_DISABLED'; end if;
  select email into recipient from auth.users where id=uid;
  if recipient is null or recipient='' then raise exception 'EMAIL_UNAVAILABLE'; end if;
  select name into workspace_name from workspaces where id=wid;
  due := case task.frequency when 'daily' then true
    when 'weekly' then extract(dow from today)::integer=any(coalesce(task.days_of_week,'{}'))
    when 'monthly' then extract(day from today)=least(task.day_of_month,extract(day from date_trunc('month',today)+interval '1 month - 1 day')::integer)
    when 'yearly' then extract(month from today)=task.month_of_year and extract(day from today)=task.day_of_month
    when 'custom' then today>=coalesce(task.anchor_date,task.created_at::date)
      and (today-coalesce(task.anchor_date,task.created_at::date))%greatest(coalesce(task.interval_days,1),1)=0
    else false end;
  done := case task.frequency when 'monthly' then date_trunc('month',task.completed_date)=date_trunc('month',today)
    when 'yearly' then extract(year from task.completed_date)=extract(year from today)
    else task.completed_date=today end;
  if not coalesce(due,false) or coalesce(done,false) or local_now<today+pref.reminder_time
    or local_now>=today+pref.reminder_time+interval '10 minutes' then raise exception 'REMINDER_NOT_DUE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1));
  select * into delivery from periodic_email_deliveries where user_id=uid and task_id=tid and delivery_day=today for update;
  if found then
    if delivery.delivered_at is not null then return jsonb_build_object('status','delivered'); end if;
    if delivery.claimed_at>clock_timestamp()-interval '1 minute' then return jsonb_build_object('status','busy'); end if;
    if delivery.attempts>=5 then raise exception 'DELIVERY_LIMIT'; end if;
    update periodic_email_deliveries set attempts=attempts+1,lease=gen_random_uuid(),claimed_at=clock_timestamp()
      where id=delivery.id returning * into delivery;
  else
    if (select count(*) from periodic_email_deliveries where user_id=uid and claimed_at>clock_timestamp()-interval '1 hour')>=100
      then raise exception 'DELIVERY_LIMIT'; end if;
    message := jsonb_build_object('to',recipient,'title',left(task.title,200),'notes',left(coalesce(task.notes,''),500),
      'category',task.category,'workspaceName',workspace_name,'reminderTime',pref.reminder_time::text);
    insert into periodic_email_deliveries(user_id,task_id,delivery_day,payload) values(uid,tid,today,message) returning * into delivery;
  end if;
  return jsonb_build_object('status','claimed','id',delivery.id,'lease',delivery.lease,'payload',delivery.payload);
end $$;


ALTER FUNCTION public.claim_periodic_email(uid uuid, tid uuid, wid uuid, tz text) OWNER TO postgres;

--
-- Name: cleanup_operational_metrics(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.cleanup_operational_metrics() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
 delete from private.client_error_counts where bucket<now()-interval '30 days';
 delete from public.background_run_status where created_at<now()-interval '30 days';
 delete from public.periodic_email_deliveries where delivery_day<current_date-30;
$$;


ALTER FUNCTION public.cleanup_operational_metrics() OWNER TO postgres;

--
-- Name: collection_access(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.collection_access(cid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.collection_member(cid) and exists (
    select 1 from public.workspace_module_bindings b join public.workspaces w on w.id=b.workspace_id
    where b.collection_id=cid and w.user_id=auth.uid() and w.archived_at is null
  );
$$;


ALTER FUNCTION public.collection_access(cid uuid) OWNER TO postgres;

--
-- Name: collection_details(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.collection_details(cid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not public.collection_member(cid) then raise exception 'ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,
      'label',coalesce(nullif(split_part(u.email,'@',1),''),'Member')) order by m.created_at),'[]'::jsonb)
      from collection_members m join auth.users u on u.id=m.user_id where m.collection_id=cid),
    'invites',case when public.collection_owner(cid) then (select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'expires_at',expires_at,'used_at',used_at,'revoked_at',revoked_at,'invite_role',invite_role) order by created_at desc),'[]'::jsonb)
      from collection_invites where collection_id=cid and expires_at>now()) else '[]'::jsonb end
  );
end;
$$;


ALTER FUNCTION public.collection_details(cid uuid) OWNER TO postgres;

--
-- Name: collection_member(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.collection_member(cid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null and exists (
    select 1 from public.collection_members where collection_id=cid and user_id=auth.uid()
  );
$$;


ALTER FUNCTION public.collection_member(cid uuid) OWNER TO postgres;

--
-- Name: collection_owner(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.collection_owner(cid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null and exists (
    select 1 from public.module_collections where id=cid and owner_id=auth.uid()
  );
$$;


ALTER FUNCTION public.collection_owner(cid uuid) OWNER TO postgres;

--
-- Name: collection_record_changed(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.collection_record_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare row_data jsonb; cid uuid; ep integer;
begin
  row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  cid := (row_data->>'collection_id')::uuid;
  select epoch into ep from module_collections where id=cid;
  insert into collection_activity(collection_id,record_id,actor_id,operation)
    values(cid,(row_data->>'id')::uuid,auth.uid(),tg_op);
  perform public.sharing_notify('collection:'||cid::text||':'||ep::text,
    jsonb_build_object('table',tg_table_name,'id',row_data->>'id','operation',tg_op));
  return null;
end;
$$;


ALTER FUNCTION public.collection_record_changed() OWNER TO postgres;

--
-- Name: collection_write(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.collection_write(cid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.collection_access(cid) and exists(select 1 from public.collection_members
    where collection_id=cid and user_id=auth.uid() and role in ('owner','editor'));
$$;


ALTER FUNCTION public.collection_write(cid uuid) OWNER TO postgres;

--
-- Name: consume_edge_budget(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_edge_budget(uid uuid, operation text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare quota integer;
begin
 quota:=case operation when 'finance-prices' then 20 when 'send-periodic-reminder' then 30 else null end;
 if uid is null or quota is null then raise exception 'INVALID_BUDGET' using errcode='22023';end if;
 return private.take_api_budget(uid,operation,60,quota);
end $$;


ALTER FUNCTION public.consume_edge_budget(uid uuid, operation text) OWNER TO postgres;

--
-- Name: consume_maintenance_ticket(uuid, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.consume_maintenance_ticket(ticket uuid, issued_at bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
 if ticket is null or issued_at is null or to_timestamp(issued_at)<clock_timestamp()-interval '90 seconds'
  or to_timestamp(issued_at)>clock_timestamp()+interval '15 seconds' then return false; end if;
 delete from private.maintenance_tickets t where t.issued_at<clock_timestamp()-interval '5 minutes';
 insert into private.maintenance_tickets(id,issued_at) values(ticket,to_timestamp(issued_at)) on conflict do nothing;
 return found;
end; $$;


ALTER FUNCTION public.consume_maintenance_ticket(ticket uuid, issued_at bigint) OWNER TO postgres;

--
-- Name: create_collection_invite(uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_collection_invite(wid uuid, module_id text, invite_role text DEFAULT 'viewer'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid; token text; iid uuid;
begin
  if invite_role is null or invite_role not in ('viewer','editor') then raise exception 'INVALID_ROLE'; end if;
  perform public.ensure_module_bindings(wid);
  if to_regclass('public.' || case module_id when 'quick' then 'quick_notes' when 'code' then 'code_snippets'
    when 'detailed' then 'todos' when 'activities' then 'activity_items' when 'plans' then 'plans'
    when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks' when 'workout' then 'workout_routines'
     when 'periodic' then 'periodic_tasks' when 'secure' then 'secure_notes' else '__unsupported' end) is null then
    raise exception 'MODULE_NOT_SHAREABLE';
  end if;
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module=module_id;
  if cid is null then raise exception 'MODULE_NOT_SHAREABLE'; end if;
  perform 1 from module_collections where id=cid for update;
  if not public.collection_owner(cid) then raise exception 'OWNER_REQUIRED'; end if;
  if module_id='secure' then
    if to_regprocedure('public.vault_collection_ready(uuid)') is null then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
    if not public.vault_collection_ready(cid) then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
  end if;
  -- Two cryptographically random UUIDs provide >240 random bits. Only the SHA-256 digest is retained.
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  insert into collection_invites(collection_id,token_hash,created_by,invite_role)
    values(cid,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid(),invite_role) returning id into iid;
  update module_collections set shared=true where id=cid;
  return jsonb_build_object('id',iid,'token',token,'expires_at',now()+interval '7 days','invite_role',invite_role);
end;
$$;


ALTER FUNCTION public.create_collection_invite(wid uuid, module_id text, invite_role text) OWNER TO postgres;

--
-- Name: delete_note_category(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_note_category(wid uuid, category_id uuid, expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare uid uuid:=auth.uid(); cid uuid; row_version integer; affected jsonb; previous_flag text;
begin
 if uid is null then raise exception 'CATEGORY_ACCESS_DENIED' using errcode='42501';end if;
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
 where w.id=wid and w.user_id=uid and w.archived_at is null and b.module='detailed';
 if cid is null or not public.collection_write(cid) then raise exception 'CATEGORY_ACCESS_DENIED' using errcode='42501';end if;
 perform 1 from module_collections where id=cid for update;
 select c.version into row_version from categories c where c.id=category_id and c.collection_id=cid for update;
 if row_version is null then raise exception 'CATEGORY_ACCESS_DENIED' using errcode='42501';end if;
 if expected_version is null or row_version<>expected_version then raise exception 'SHARING_CONFLICT';end if;
 if (select count(*) from categories c where c.collection_id=cid)<=1 then raise exception 'LAST_CATEGORY';end if;
 previous_flag:=coalesce(current_setting('app.trash_write',true),'off');
 perform set_config('app.trash_write','on',true);
 with moved as (update todos n set category_id=null where n.collection_id=cid and n.category_id=delete_note_category.category_id returning n.id,n.version)
 select coalesce(jsonb_agg(to_jsonb(moved)),'[]'::jsonb) into affected from moved;
 delete from categories c where c.collection_id=cid and c.id=delete_note_category.category_id;
 perform set_config('app.trash_write',previous_flag,true);
 return jsonb_build_object('id',category_id,'notes',affected);
end $$;


ALTER FUNCTION public.delete_note_category(wid uuid, category_id uuid, expected_version integer) OWNER TO postgres;

--
-- Name: delete_workspace(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_workspace(wid uuid, expected_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
 uid uuid:=auth.uid(); target workspaces; replacement workspaces;
 owned uuid[]; external_ids uuid[]; t text; previous_trash_flag text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 perform pg_advisory_xact_lock(hashtext(wid::text));
 select * into target from workspaces where id=wid and user_id=uid for update;
 if target.id is null then raise exception 'WORKSPACE_ACCESS_DENIED' using errcode='42501';end if;
 if expected_name is null or target.name<>expected_name then raise exception 'WORKSPACE_CHANGED';end if;
 select * into replacement from workspaces where user_id=uid and id<>wid and archived_at is null
 order by is_default desc,created_at,id limit 1;
 if replacement.id is null then raise exception 'LAST_WORKSPACE';end if;

 -- Serializes invite acceptance and collection writes before checking shared references.
 perform 1 from module_collections where origin_workspace_id=wid or id in
  (select collection_id from workspace_module_bindings where workspace_id=wid) order by id for update;
 select coalesce(array_agg(id),'{}'::uuid[]) into owned from module_collections where origin_workspace_id=wid and owner_id=uid;
 if exists(select 1 from module_collections where origin_workspace_id=wid and owner_id<>uid)
  or exists(select 1 from workspace_module_bindings where workspace_id<>wid
   and (collection_id=any(owned) or personal_collection_id=any(owned))) then
  raise exception 'WORKSPACE_SHARED';
 end if;
 if to_regclass('public.focus_ownership') is not null then
  if exists(select 1 from analytics_focus_sessions s join focus_ownership f on f.session_id=s.id
   where s.workspace_id=wid and s.status in ('running','paused') and f.expires_at>clock_timestamp()) then
   raise exception 'WORKSPACE_FOCUS_ACTIVE';
  end if;
 end if;
 select coalesce(array_agg(distinct collection_id),'{}'::uuid[]) into external_ids
 from workspace_module_bindings where workspace_id=wid and not(collection_id=any(owned));

 -- Queue note images for the existing reference-aware Storage cleanup worker.
 if to_regclass('public.trash_image_cleanup') is not null then
  insert into trash_image_cleanup(path)
   select distinct match[1] from todos n cross join lateral regexp_matches(coalesce(n.description,''),'data-note-image="([^"]+)"','g') match
   where n.collection_id=any(owned) and match[1] ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png|jpg|jpeg|gif)$'
    and split_part(match[1],'/',1)=n.collection_id::text
   on conflict(path) do update set queued_at=clock_timestamp();
 end if;
 previous_trash_flag:=coalesce(current_setting('app.trash_write',true),'off');
 perform set_config('app.trash_write','on',true);
 -- Delete records while their collections still exist: audit/FK triggers can finish normally.
 foreach t in array array['todos','quick_notes','plans','code_snippets','pomo_tasks',
  'learning_subjects','flashcard_decks','workout_routines','periodic_tasks','activity_items',
  'secure_notes','password_sessions','categories','pomodoro_history'] loop
  if to_regclass('public.'||t) is null then continue;end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='collection_id') then
   execute format('delete from public.%I where collection_id=any($1)',t) using owned;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='workspace_id') then
   execute format('delete from public.%I where workspace_id=$1',t) using wid;
  end if;
 end loop;
 perform set_config('app.trash_write',previous_trash_flag,true);
 delete from workspace_module_bindings where workspace_id=wid;
 -- Leaving another person's shared tab never deletes that collection or its notes.
 delete from collection_members m where m.collection_id=any(external_ids) and m.user_id=uid
  and not exists(select 1 from module_collections c where c.id=m.collection_id and c.owner_id=uid)
  and not exists(select 1 from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
   where b.collection_id=m.collection_id and w.user_id=uid);
 delete from collection_activity where collection_id=any(owned);
 delete from module_collections where id=any(owned);
 if target.is_default then
  update workspaces set is_default=false where id=wid;
  update workspaces set is_default=true where id=replacement.id returning * into replacement;
 end if;
 delete from workspaces where id=wid and user_id=uid;
 perform public.sharing_notify('sharing-user:'||uid::text,jsonb_build_object('workspace_id',wid,'operation','workspace_deleted'));
 return jsonb_build_object('id',wid,'next_workspace',to_jsonb(replacement));
end $_$;


ALTER FUNCTION public.delete_workspace(wid uuid, expected_name text) OWNER TO postgres;

--
-- Name: detach_collection(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.detach_collection(wid uuid, module_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare b workspace_module_bindings;
begin
  perform public.ensure_module_bindings(wid);
  select * into b from workspace_module_bindings where workspace_id=wid and module=module_id for update;
  perform 1 from module_collections where id=b.collection_id for update;
  if b.collection_id=b.personal_collection_id then raise exception 'OWNER_MUST_END_SHARING'; end if;
  update workspace_module_bindings set collection_id=personal_collection_id where workspace_id=wid and module=module_id;
  if not public.collection_owner(b.collection_id) and not exists(
    select 1 from workspace_module_bindings x join workspaces w on w.id=x.workspace_id
    where x.collection_id=b.collection_id and w.user_id=auth.uid()
  ) then
    delete from collection_members where collection_id=b.collection_id and user_id=auth.uid();
    update module_collections set epoch=epoch+1 where id=b.collection_id;
  end if;
  return public.sharing_context(wid);
end;
$$;


ALTER FUNCTION public.detach_collection(wid uuid, module_id text) OWNER TO postgres;

--
-- Name: end_focus_session(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.end_focus_session(session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare uid uuid:=auth.uid(); active analytics_focus_sessions; holder focus_ownership;
  parts jsonb; elapsed double precision; last_end timestamptz; finish timestamptz;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  select * into active from analytics_focus_sessions s where s.id=end_focus_session.session_id and s.user_id=uid for update;
  if not found then raise exception 'FOCUS_SESSION_FORBIDDEN'; end if;
  select * into holder from focus_ownership o where o.user_id=uid and o.session_id=active.id for update;
  if active.status in ('running','paused') then
    parts:=active.segments;
    select coalesce(sum(extract(epoch from (p->>1)::timestamptz-(p->>0)::timestamptz)),0) into elapsed from jsonb_array_elements(parts) p;
    -- Only a live server-owned segment can be extended; paused/offline gaps are not focus.
    if active.status='running' and holder.session_id is not null then
      last_end:=greatest(coalesce((parts->-1->>1)::timestamptz,active.started_at),coalesce(holder.segment_started_at,active.started_at));
      finish:=least(clock_timestamp(),holder.expires_at,last_end+(greatest(active.planned_seconds-elapsed,0)||' seconds')::interval);
      if finish>last_end then
        parts:=parts||jsonb_build_array(jsonb_build_array(last_end,finish));
        elapsed:=elapsed+extract(epoch from finish-last_end);
      end if;
    end if;
    perform record_focus_session(to_jsonb(active)||jsonb_build_object('segments',parts,'revision',active.revision+1,
      'status',case when elapsed>=active.planned_seconds then 'completed' else 'ended' end,
      'client_id',active.writer_client,'lease',active.writer_lease));
  end if;
  update analytics_focus_sessions set writer_client=coalesce(writer_client,gen_random_uuid()),writer_lease=gen_random_uuid() where id=active.id;
  delete from focus_ownership o where o.user_id=uid and o.session_id=active.id;
  return jsonb_build_object('status','stopped','session_id',active.id);
end $$;


ALTER FUNCTION public.end_focus_session(session_id uuid) OWNER TO postgres;

--
-- Name: enqueue_scheduled_maintenance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enqueue_scheduled_maintenance() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare destination text; credential text; request_id bigint; issued text; ticket text; signature text;
begin
 select endpoint into destination from private.background_dispatch_config where singleton;
 select decrypted_secret into credential from vault.decrypted_secrets where name='operations_cron_secret';
 if destination is null or length(coalesce(credential,''))<32 then raise exception 'OPERATIONS_CONFIGURATION_REQUIRED'; end if;
 issued:=floor(extract(epoch from clock_timestamp()))::bigint::text; ticket:=gen_random_uuid()::text;
 signature:=encode(extensions.hmac(issued||'.'||ticket,credential,'sha256'),'hex');
 select net.http_post(url:=destination,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer v1.'||issued||'.'||ticket||'.'||signature),body:='{}'::jsonb,timeout_milliseconds:=90000) into request_id;
 return request_id;
end; $$;


ALTER FUNCTION public.enqueue_scheduled_maintenance() OWNER TO postgres;

--
-- Name: ensure_default_workspace(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_default_workspace() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare owner_id uuid := auth.uid(); result uuid;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(owner_id::text));
  select id into result from public.workspaces where user_id = owner_id and archived_at is null
    order by is_default desc, created_at limit 1;
  if result is null then
    insert into public.workspaces(user_id, name, is_default) values (owner_id, 'Kişisel', true) returning id into result;
  end if;
  return result;
end $$;


ALTER FUNCTION public.ensure_default_workspace() OWNER TO postgres;

--
-- Name: ensure_module_bindings(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_module_bindings(wid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare m text; cid uuid; uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'WORKSPACE_ACCESS_DENIED'; end if;
  perform pg_advisory_xact_lock(hashtext(wid::text));
  foreach m in array array['quick','code','detailed','activities','plans','learning','flashcards','workout','periodic','secure','pomodoro'] loop
    if not exists(select 1 from workspace_module_bindings where workspace_id=wid and module=m) then
      insert into module_collections(module,owner_id,origin_workspace_id) values(m,uid,wid) returning id into cid;
      insert into collection_members(collection_id,user_id,role) values(cid,uid,'owner');
      insert into workspace_module_bindings values(wid,m,cid,cid);
    end if;
  end loop;
end; $$;


ALTER FUNCTION public.ensure_module_bindings(wid uuid) OWNER TO postgres;

--
-- Name: external_calendar_service(uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.external_calendar_service(uid uuid, operation text, record_id uuid DEFAULT NULL::uuid, payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.external_calendar_service(uid uuid, operation text, record_id uuid, payload jsonb) OWNER TO postgres;

--
-- Name: finance_budget_set(uuid, uuid, date, numeric, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_budget_set(wid uuid, cid uuid, month_start date, limit_amount numeric, apply_scope text, expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_budget_set(wid uuid, cid uuid, month_start date, limit_amount numeric, apply_scope text, expected_version integer) OWNER TO postgres;

--
-- Name: finance_budget_state(uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_budget_state(wid uuid, month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_budget_state(wid uuid, month_start date) OWNER TO postgres;

--
-- Name: finance_cache_quotes(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_cache_quotes(items jsonb) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
 insert into finance_market_quotes(provider,instrument,currency,price,price_at,fetched_at,metadata)
 select q.provider,q.instrument,q.currency,q.price,q.price_at,q.fetched_at,coalesce(q.metadata,'{}'::jsonb)
 from jsonb_to_recordset(items) as q(provider text,instrument text,currency text,price numeric,price_at timestamptz,fetched_at timestamptz,metadata jsonb)
 on conflict(provider,instrument,currency) do update set price=excluded.price,price_at=excluded.price_at,fetched_at=excluded.fetched_at,metadata=excluded.metadata
 where excluded.price_at>=finance_market_quotes.price_at
 or (excluded.metadata->>'quality'='live' and finance_market_quotes.metadata->>'quality'='reference');
$$;


ALTER FUNCTION public.finance_cache_quotes(items jsonb) OWNER TO postgres;

--
-- Name: finance_category_mutate(uuid, text, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_category_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_category_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) OWNER TO postgres;

--
-- Name: finance_inherit_category(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_inherit_category() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_inherit_category() OWNER TO postgres;

--
-- Name: finance_load(uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_load(wid uuid, month_start date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare summary jsonb;begin
 summary:=finance_summary(wid,month_start);
 return jsonb_build_object('summary',summary,'transactions',finance_page(wid,'transaction',month_start),'positions',finance_page(wid,'position',month_start));
end $$;


ALTER FUNCTION public.finance_load(wid uuid, month_start date) OWNER TO postgres;

--
-- Name: finance_materialize(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_materialize(wid uuid, uid uuid, cutoff date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_materialize(wid uuid, uid uuid, cutoff date) OWNER TO postgres;

--
-- Name: finance_mutate(uuid, text, text, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) OWNER TO postgres;

--
-- Name: finance_occurrence(date, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_occurrence(anchor date, cadence text, n integer) RETURNS date
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select case when cadence='weekly' then anchor+7*n else
 (date_trunc('month',anchor)+(case when cadence='yearly' then n*12 else n end)*interval '1 month'
 + (least(extract(day from anchor)::integer,extract(day from date_trunc('month',anchor)+(case when cadence='yearly' then n*12 else n end)*interval '1 month'+interval '1 month - 1 day')::integer)-1)*interval '1 day')::date end;
$$;


ALTER FUNCTION public.finance_occurrence(anchor date, cadence text, n integer) OWNER TO postgres;

--
-- Name: finance_page(uuid, text, date, date, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_page(wid uuid, entity text, month_start date, after_date date DEFAULT NULL::date, after_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_page(wid uuid, entity text, month_start date, after_date date, after_id uuid) OWNER TO postgres;

--
-- Name: finance_position_values(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_position_values(wid uuid) RETURNS TABLE(id uuid, title text, kind text, instrument text, price_source text, quantity numeric, buy_price numeric, purchased_on date, manual_price numeric, version integer, price numeric, price_at timestamp with time zone, stale boolean, cost numeric, current_value numeric, gain numeric, gain_percent numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_position_values(wid uuid) OWNER TO postgres;

--
-- Name: finance_query(uuid, date, jsonb, date, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_query(wid uuid, month_start date, filters jsonb DEFAULT '{}'::jsonb, after_date date DEFAULT NULL::date, after_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_query(wid uuid, month_start date, filters jsonb, after_date date, after_id uuid) OWNER TO postgres;

--
-- Name: finance_rollover_recurring(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_rollover_recurring() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare current_workspace record;
begin
  for current_workspace in
    select distinct recurring.workspace_id, recurring.user_id
    from public.finance_recurring recurring
    join public.workspaces workspace
      on workspace.id = recurring.workspace_id and workspace.user_id = recurring.user_id
    where recurring.active and recurring.deleted_at is null and workspace.archived_at is null
  loop
    perform public.finance_materialize(current_workspace.workspace_id, current_workspace.user_id);
  end loop;
end;
$$;


ALTER FUNCTION public.finance_rollover_recurring() OWNER TO postgres;

--
-- Name: finance_schedule_mutate(uuid, text, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_schedule_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_schedule_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) OWNER TO postgres;

--
-- Name: finance_summary(uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_summary(wid uuid, month_start date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_summary(wid uuid, month_start date) OWNER TO postgres;

--
-- Name: finance_summary_before_budgets(uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finance_summary_before_budgets(wid uuid, month_start date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.finance_summary_before_budgets(wid uuid, month_start date) OWNER TO postgres;

--
-- Name: finish_periodic_email(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.finish_periodic_email(did uuid, token uuid, success boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update periodic_email_deliveries set delivered_at=case when success then clock_timestamp() else null end,
    payload=case when success then null else payload end,
    claimed_at=case when success then claimed_at else clock_timestamp()-interval '1 minute' end
    where id=did and lease=token and delivered_at is null;
  return found;
end $$;


ALTER FUNCTION public.finish_periodic_email(did uuid, token uuid, success boolean) OWNER TO postgres;

--
-- Name: fn_set_created_by(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_set_created_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.fn_set_created_by() OWNER TO postgres;

--
-- Name: fn_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION public.fn_set_updated_at() OWNER TO postgres;

--
-- Name: focus_context(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.focus_context(client_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare active jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select (to_jsonb(s)-'writer_client'-'writer_lease')||jsonb_build_object('client_id',o.client_id,'lease',case when o.client_id=focus_context.client_id then o.lease else null end,
    'task_title',case when collection_access(t.collection_id) then t.title else null end,
    'task_completed',case when collection_access(t.collection_id) then t.completed else true end,'expires_at',o.expires_at,'segment_started_at',o.segment_started_at)
    into active from focus_ownership o join analytics_focus_sessions s on s.id=o.session_id
      left join pomo_tasks t on t.id=s.task_id where o.user_id=auth.uid() and s.status in ('running','paused');
  return jsonb_build_object('version',1,'active',active,'closed',coalesce((select jsonb_agg(id) from (select id from analytics_focus_sessions where user_id=auth.uid() and status in ('ended','completed') order by updated_at desc limit 20) recent),'[]'::jsonb));
end $$;


ALTER FUNCTION public.focus_context(client_id uuid) OWNER TO postgres;

--
-- Name: guard_collection_record(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_collection_record() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c module_collections; expected_module text := tg_argv[0]; owner_column text := tg_argv[1];
begin
  if tg_op='INSERT' and new.collection_id is null then
    perform public.ensure_module_bindings(new.workspace_id);
    select collection_id into new.collection_id from workspace_module_bindings
      where workspace_id=new.workspace_id and module=expected_module;
  end if;
  select * into c from module_collections where id=new.collection_id;
  if c.module is distinct from expected_module or not public.collection_write(c.id) then raise exception 'COLLECTION_ACCESS_DENIED'; end if;
  if tg_op='UPDATE' then
    if new.collection_id<>old.collection_id or new.workspace_id<>old.workspace_id
      or to_jsonb(new)->owner_column is distinct from to_jsonb(old)->owner_column then raise exception 'OWNERSHIP_IMMUTABLE'; end if;
    new.version := old.version+1;
  else
    new.workspace_id := c.origin_workspace_id;
    new := jsonb_populate_record(new,jsonb_build_object(owner_column,auth.uid()));
    new.version := 1;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.guard_collection_record() OWNER TO postgres;

--
-- Name: guard_plan_period(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_plan_period() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$begin
 new.reason:='';
 if new.period='timeless' then new.period_date:=date '1970-01-01';new.history:='[]';end if;
 return new;end $$;


ALTER FUNCTION public.guard_plan_period() OWNER TO postgres;

--
-- Name: guard_projected_array(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_projected_array() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if pg_trigger_depth()<2 and to_jsonb(new)->tg_argv[0] is distinct from to_jsonb(old)->tg_argv[0] then raise exception 'USE_ITEM_OPERATIONS'; end if;
  return new;
end; $$;


ALTER FUNCTION public.guard_projected_array() OWNER TO postgres;

--
-- Name: guard_trash_record(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_trash_record() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if current_setting('app.trash_write',true)='on' then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then
  -- Account / collection cascades retain their existing ownership checks.
  if not exists(select 1 from module_collections where id=old.collection_id) then return old; end if;
  raise exception 'USE_TRASH';
 elsif tg_op='INSERT' then
  if new.deleted_at is not null or new.deleted_by is not null then raise exception 'USE_TRASH'; end if;
 elsif old.deleted_at is not null or new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
  raise exception 'USE_TRASH';
 end if;
 return new;
end $$;


ALTER FUNCTION public.guard_trash_record() OWNER TO postgres;

--
-- Name: guard_vault_ciphertext(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_vault_ciphertext() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare sealed boolean; shared_collection boolean; key_id text; m jsonb; approved boolean:=coalesce(current_setting('app.vault_admin',true),'')='on'; begin
  if auth.uid() is not null and not public.vault_acknowledged(auth.uid()) then raise exception 'VAULT_ACK_REQUIRED'; end if;
  if tg_op='DELETE' then
    if not approved then raise exception 'VAULT_EMAIL_REQUIRED'; end if;
    return old;
  end if;
  select shared into shared_collection from module_collections where id=new.collection_id;
  if tg_table_name='password_sessions' then
    if tg_op='INSERT' and not public.collection_owner(new.collection_id) then raise exception 'OWNER_REQUIRED'; end if;
    if tg_op='UPDATE' and new.password_hash is distinct from old.password_hash and not approved then raise exception 'VAULT_EMAIL_REQUIRED'; end if;
    if (tg_op='INSERT' or shared_collection or (tg_op='UPDATE' and public.vault_metadata_valid(old.password_hash))) and not public.vault_metadata_valid(new.password_hash) then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
    if tg_op='INSERT' and new.password_hash::jsonb->>'format'<>'todo-vault-v2' then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
  else
    if tg_op='UPDATE' and new.session_id is distinct from old.session_id then raise exception 'OWNERSHIP_IMMUTABLE'; end if;
    if tg_op='INSERT' and new.deleted_at is not null then raise exception 'VAULT_INVALID_DATA'; end if;
    select password_hash::jsonb into m from password_sessions where id=new.session_id and public.vault_metadata_valid(password_hash) for update;
    sealed:=found;
    if not sealed then raise exception 'VAULT_UPGRADE_REQUIRED'; end if;
    key_id:=case when m->>'format'='todo-vault-v2' then m->>'key_id' else m->>'salt' end;
    if tg_op='UPDATE' and new.deleted_at is distinct from old.deleted_at and coalesce(current_setting('app.vault_record',true),'')<>'on' and not approved then raise exception 'VAULT_RECORD_ACTION_REQUIRED'; end if;
    if sealed or shared_collection or new.encrypted_payload is not null then
      if not public.vault_envelope_valid(new.encrypted_payload) then raise exception 'VAULT_INVALID_DATA'; end if;
      if sealed and new.encrypted_payload->>'key_id' is distinct from key_id then raise exception 'SHARING_CONFLICT'; end if;
      new.title:='Encrypted note'; new.description:=null; new.type:='secret'; new.username:=null; new.password_encrypted:=null; new.url:=null; new.content:=null;
      if tg_op='UPDATE' and old.encrypted_payload is not null and old.encrypted_payload is distinct from new.encrypted_payload and old.encrypted_payload->>'key_id'=key_id then
        insert into vault_note_history(note_id,collection_id,encrypted_payload) values(old.id,old.collection_id,old.encrypted_payload);
        delete from vault_note_history where note_id=old.id and id in (select id from vault_note_history where note_id=old.id order by saved_at desc,id desc offset 10);
      end if;
    end if;
  end if;
  return new;
end; $$;


ALTER FUNCTION public.guard_vault_ciphertext() OWNER TO postgres;

--
-- Name: guard_workspace_archive(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.guard_workspace_archive() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if old.archived_at is null and new.archived_at is not null then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    if (select count(*) from public.workspaces where user_id = new.user_id and archived_at is null) <= 1 then
      raise exception 'LAST_WORKSPACE';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION public.guard_workspace_archive() OWNER TO postgres;

--
-- Name: learning_context(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learning_context(wid uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid;
begin
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
 where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and b.module='learning';
 if cid is null or not public.collection_access(cid) or not exists(select 1 from workspaces w where w.id=wid and 'learning'=any(w.active_modules)) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
 return cid;
end $$;


ALTER FUNCTION public.learning_context(wid uuid) OWNER TO postgres;

--
-- Name: learning_load(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learning_load(wid uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid:=public.learning_context(wid); answer jsonb;
begin
 select jsonb_build_object(
 'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.position,s.created_at,s.id) from learning_subjects s where s.collection_id=cid and s.deleted_at is null),'[]'),
 'progress',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('seconds',coalesce((select sum((select coalesce(sum(extract(epoch from (part->>1)::timestamptz-(part->>0)::timestamptz)),0) from jsonb_array_elements(f.credited_segments) part)) from analytics_focus_sessions f where f.user_id=auth.uid() and f.task_id=p.pomo_task_id),0)))
  from learning_progress p join learning_subjects s on s.id=p.subject_id where p.user_id=auth.uid() and s.collection_id=cid and s.deleted_at is null),'[]'),
 'due_mistakes',coalesce((select jsonb_agg(to_jsonb(m) order by m.review_on,m.created_at) from (select m.* from learning_mistakes m join learning_subjects s on s.id=m.subject_id
  join learning_subjects_items i on i.parent_id=m.subject_id and i.id=m.topic_id
  where m.user_id=auth.uid() and m.workspace_id=wid and m.deleted_at is null and not m.resolved and s.collection_id=cid and s.deleted_at is null
   and coalesce(i.data->>'archived','false')<>'true' order by m.review_on,m.created_at limit 100) m),'[]')) into answer;
 return answer;
end $$;


ALTER FUNCTION public.learning_load(wid uuid) OWNER TO postgres;

--
-- Name: learning_mistakes_page(uuid, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learning_mistakes_page(wid uuid, filter text DEFAULT 'open'::text, after_time timestamp with time zone DEFAULT NULL::timestamp with time zone, after_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid:=public.learning_context(wid); answer jsonb;
begin
 if filter is null or filter not in ('open','resolved','archive','all') or (after_time is null)<>(after_id is null) then raise exception 'INVALID_LEARNING_INPUT';end if;
 with filtered as (select m.* from learning_mistakes m join learning_subjects s on s.id=m.subject_id join learning_subjects_items i on i.parent_id=m.subject_id and i.id=m.topic_id
  where m.user_id=auth.uid() and m.workspace_id=wid and s.collection_id=cid and s.deleted_at is null
   and coalesce(i.data->>'archived','false')<>'true'
   and case when filter='archive' then m.deleted_at is not null else m.deleted_at is null and (filter='all' or m.resolved=(filter='resolved')) end),
 page as(select * from filtered where after_time is null or (created_at,id)<(after_time,after_id) order by created_at desc,id desc limit 51),
 shown as(select * from page order by created_at desc,id desc limit 50)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(shown) order by created_at desc,id desc) from shown),'[]'),
 'has_more',(select count(*)>50 from page),'total',(select count(*) from filtered)) into answer;
 return answer;
end $$;


ALTER FUNCTION public.learning_mistakes_page(wid uuid, filter text, after_time timestamp with time zone, after_id uuid) OWNER TO postgres;

--
-- Name: learning_mutate(uuid, text, uuid, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learning_mutate(wid uuid, operation text, sid uuid DEFAULT NULL::uuid, tid text DEFAULT NULL::text, payload jsonb DEFAULT '{}'::jsonb, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
#variable_conflict use_variable
<<state>>
declare cid uuid:=public.learning_context(wid); uid uuid:=auth.uid(); subject learning_subjects; topic learning_subjects_items;
 progress learning_progress; mistake learning_mistakes; result jsonb; row_data jsonb; item jsonb; other_item record;
 title text; color text; id uuid; today date; tz text:=coalesce(payload->>'timezone','UTC'); n integer; pos integer; key text; correct boolean;
begin
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>150000 then raise exception 'INVALID_LEARNING_INPUT';end if;
 if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'INVALID_LEARNING_INPUT';end if;
 today:=(clock_timestamp() at time zone tz)::date;
 perform 1 from module_collections where module_collections.id=cid for update;
 if operation in ('subject.create','template.import') then
  if not public.collection_write(cid) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation='template.import' then
   if coalesce(length(payload->>'key'),0) not between 1 and 80 or coalesce(length(payload->>'revision'),0) not between 1 and 40
    or jsonb_typeof(payload->'subjects') is distinct from 'array' or jsonb_array_length(payload->'subjects') not between 1 and 20 then raise exception 'INVALID_LEARNING_INPUT';end if;
   result:='[]';
   for row_data in select value from jsonb_array_elements(payload->'subjects') loop
    title:=btrim(row_data->>'title');key:=(payload->>'key')||':'||(row_data->>'key');
    if coalesce(length(title),0) not between 1 and 120 or coalesce(length(row_data->>'key'),0) not between 1 and 60
     or jsonb_typeof(row_data->'topics') is distinct from 'array' or jsonb_array_length(row_data->'topics') not between 1 and 100 then raise exception 'INVALID_LEARNING_INPUT';end if;
    select * into subject from learning_subjects where collection_id=cid and template_key=key;
    if subject.id is not null and subject.deleted_at is not null then raise exception 'LEARNING_TEMPLATE_IN_TRASH';end if;
    if subject.id is null then
     insert into learning_subjects(user_id,workspace_id,collection_id,title,color,template_key,template_revision,position)
      values(uid,wid,cid,title,'#64748B',key,payload->>'revision',coalesce((select max(position)+1 from learning_subjects where collection_id=cid),0)) returning * into subject;
    end if;
    for item in select value from jsonb_array_elements(row_data->'topics') loop
     if coalesce(length(btrim(item->>'title')),0) not between 1 and 160 or coalesce(length(item->>'key'),0) not between 1 and 100 then raise exception 'INVALID_LEARNING_INPUT';end if;
     insert into learning_subjects_items(parent_id,collection_id,id,data,position)
      values(subject.id,cid,'template:'||(item->>'key'),jsonb_build_object('title',btrim(item->>'title'),'learn',false,'practice',false,'master',false),
       coalesce((select max(position)+1 from learning_subjects_items where parent_id=subject.id),1)) on conflict do nothing;
    end loop;
    select to_jsonb(s) into row_data from learning_subjects s where s.id=subject.id;result:=result||jsonb_build_array(row_data);
   end loop;
   return jsonb_build_object('subjects',result);
  end if;
  title:=btrim(payload->>'title');color:=coalesce(payload->>'color','#64748B');
  if sid is null or coalesce(length(title),0) not between 1 and 120 or color!~'^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_LEARNING_INPUT';end if;
  select * into subject from learning_subjects where learning_subjects.id=sid;
  if subject.id is not null then
   if subject.collection_id<>cid or subject.deleted_at is not null then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  else
   insert into learning_subjects(id,user_id,workspace_id,collection_id,title,color,position)
    values(sid,uid,wid,cid,title,color,coalesce((select max(position)+1 from learning_subjects where collection_id=cid),0)) returning * into subject;
  end if;
  return jsonb_build_object('subject',to_jsonb(subject));
 end if;
 select * into subject from learning_subjects where learning_subjects.id=sid and collection_id=cid and deleted_at is null for update;
 if subject.id is null then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
 if operation like 'subject.%' or operation like 'topic.%' then
  if not public.collection_write(cid) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation like 'subject.%' and expected_version is distinct from subject.version then raise exception 'SHARING_CONFLICT';end if;
  if operation='subject.update' then
   title:=btrim(payload->>'title');color:=coalesce(payload->>'color',subject.color);
   if coalesce(length(title),0) not between 1 and 120 or color!~'^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_LEARNING_INPUT';end if;
   update learning_subjects set title=state.title,color=state.color where learning_subjects.id=sid;
  elsif operation='subject.move' then
   n:=(payload->>'direction')::integer;if n is null or n not in (-1,1) then raise exception 'INVALID_LEARNING_INPUT';end if;
   -- Normalize legacy equal positions before swapping; changes remain transactional.
   with ranked as(select s.id,row_number() over(order by s.position,s.created_at,s.id)::integer p from learning_subjects s where s.collection_id=cid and s.deleted_at is null)
    update learning_subjects s set position=r.p from ranked r where s.id=r.id and s.position<>r.p;
   select position into pos from learning_subjects where learning_subjects.id=sid;
   update learning_subjects set position=case when learning_subjects.id=sid then pos+n else pos end
    where collection_id=cid and (learning_subjects.id=sid or position=pos+n) and deleted_at is null;
   return jsonb_build_object('reload',true);
  elsif operation='topic.add' then
   if jsonb_typeof(payload->'titles') is distinct from 'array' or jsonb_array_length(payload->'titles') not between 1 and 100 then raise exception 'INVALID_LEARNING_INPUT';end if;
   for title in select btrim(value) from jsonb_array_elements_text(payload->'titles') loop
    if coalesce(length(title),0) not between 1 and 160 then raise exception 'INVALID_LEARNING_INPUT';end if;
    if not exists(select 1 from learning_subjects_items i where i.parent_id=sid and lower(i.data->>'title')=lower(title) and coalesce(i.data->>'archived','false')<>'true') then
     insert into learning_subjects_items(parent_id,collection_id,id,data,position) values(sid,cid,gen_random_uuid()::text,jsonb_build_object('title',title,'learn',false,'practice',false,'master',false),coalesce((select max(position)+1 from learning_subjects_items where parent_id=sid),1));
    end if;
   end loop;
  else
   select * into topic from learning_subjects_items where parent_id=sid and learning_subjects_items.id=tid for update;
   if topic.id is null or expected_version is distinct from topic.version then raise exception 'SHARING_CONFLICT';end if;
   if operation='topic.update' then
    title:=btrim(payload->>'title');if coalesce(length(title),0) not between 1 and 160 then raise exception 'INVALID_LEARNING_INPUT';end if;
    update learning_subjects_items set data=data||jsonb_build_object('title',title),version=version+1 where parent_id=sid and learning_subjects_items.id=tid;
   elsif operation in ('topic.archive','topic.restore') then
    update learning_subjects_items set data=data||jsonb_build_object('archived',operation='topic.archive'),version=version+1 where parent_id=sid and learning_subjects_items.id=tid;
   elsif operation='topic.move' then
    n:=(payload->>'direction')::integer;if n is null or n not in (-1,1) then raise exception 'INVALID_LEARNING_INPUT';end if;
    select i.id,i.position into other_item from learning_subjects_items i where i.parent_id=sid and coalesce(i.data->>'archived','false')<>'true'
     and case when n=1 then (i.position,i.id)>(topic.position,topic.id) else (i.position,i.id)<(topic.position,topic.id) end
     order by case when n=1 then position else -position end limit 1;
    if other_item.id is not null then
     update learning_subjects_items i set position=case when i.id=tid then other_item.position else topic.position end,version=version+1 where parent_id=sid and i.id in (tid,other_item.id);
    end if;
   else raise exception 'INVALID_LEARNING_INPUT';end if;
  end if;
  return jsonb_build_object('subject',(select to_jsonb(s) from learning_subjects s where s.id=sid));
 end if;

 select * into topic from learning_subjects_items where parent_id=sid and learning_subjects_items.id=tid and coalesce(data->>'archived','false')<>'true';
 if topic.id is null then raise exception 'LEARNING_TOPIC_UNAVAILABLE';end if;
 insert into learning_progress(user_id,subject_id,topic_id) values(uid,sid,tid) on conflict do nothing;
 select * into progress from learning_progress p where p.user_id=uid and p.subject_id=sid and p.topic_id=tid for update;
 if operation='progress.update' then
  if expected_version is null or (expected_version is distinct from progress.version and not(expected_version=0 and progress.version=1)) then raise exception 'SHARING_CONFLICT';end if;
  if coalesce(payload->>'status','') not in ('todo','doing','done') then raise exception 'INVALID_LEARNING_INPUT';end if;
  update learning_progress p set status=payload->>'status',review_on=case when payload->>'status'='done' then coalesce(review_on,today+1) else review_on end,version=version+1
   where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
 elsif operation in ('review','mistake.review') then
  id:=(payload->>'attempt_id')::uuid;correct:=(payload->>'correct')::boolean;
  if id is null or correct is null then raise exception 'INVALID_LEARNING_INPUT';end if;
  if exists(select 1 from learning_reviews r where r.id=state.id) then
   if not exists(select 1 from learning_reviews r where r.id=state.id and r.user_id=uid and r.subject_id=sid and r.topic_id=tid and r.correct=state.correct and r.mistake_id is not distinct from nullif(payload->>'id','')::uuid) then raise exception 'SHARING_CONFLICT';end if;
   select * into mistake from learning_mistakes m where m.id=nullif(payload->>'id','')::uuid and m.user_id=uid and m.workspace_id=wid;
  else
   if operation='mistake.review' then
    select * into mistake from learning_mistakes m where m.id=(payload->>'id')::uuid and m.user_id=uid and m.workspace_id=wid and m.subject_id=sid and m.topic_id=tid and m.deleted_at is null for update;
    if mistake.id is null or expected_version is distinct from mistake.version then raise exception 'SHARING_CONFLICT';end if;
    update learning_mistakes m set resolved=correct,attempts=attempts+1,review_on=case when correct then null else today+1 end,version=version+1 where m.id=mistake.id returning * into mistake;
   end if;
   insert into learning_reviews(id,user_id,subject_id,topic_id,mistake_id,correct) values(id,uid,sid,tid,mistake.id,correct);
   n:=case when correct then least(progress.streak+1,5) else 0 end;
   update learning_progress p set streak=n,review_on=today+(array[1,3,7,14,30,60])[n+1],last_reviewed_at=clock_timestamp(),version=version+1
    where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
  end if;
 elsif operation like 'mistake.%' then
  id:=(payload->>'id')::uuid;if id is null then raise exception 'INVALID_LEARNING_INPUT';end if;
  select * into mistake from learning_mistakes m where m.id=state.id for update;
  if mistake.id is not null and (mistake.user_id<>uid or mistake.workspace_id<>wid or mistake.subject_id<>sid or mistake.topic_id<>tid) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation='mistake.create' and mistake.id is not null then return jsonb_build_object('mistake',to_jsonb(mistake));end if;
  if operation<>'mistake.create' and (mistake.id is null or expected_version is distinct from mistake.version) then raise exception 'SHARING_CONFLICT';end if;
  if operation in ('mistake.create','mistake.update') then
   if coalesce(length(btrim(payload->>'prompt')),0)=0 and coalesce(length(btrim(payload->>'source')),0)=0 and nullif(payload->>'image_path','') is null then raise exception 'INVALID_LEARNING_INPUT';end if;
   if nullif(payload->>'image_path','') is not null and (payload->>'image_path' !~ ('^'||uid::text||'/'||wid::text||'/[0-9a-f-]{36}\.(webp|png|jpg|jpeg)$')) then raise exception 'INVALID_LEARNING_INPUT';end if;
   if operation='mistake.create' then
    insert into learning_mistakes(id,user_id,workspace_id,subject_id,topic_id,prompt,solution,source,reason,image_path,review_on)
     values(id,uid,wid,sid,tid,coalesce(payload->>'prompt',''),coalesce(payload->>'solution',''),coalesce(payload->>'source',''),coalesce(payload->>'reason',''),nullif(payload->>'image_path',''),today) returning * into mistake;
   else
    update learning_mistakes m set prompt=coalesce(payload->>'prompt',''),solution=coalesce(payload->>'solution',''),source=coalesce(payload->>'source',''),reason=coalesce(payload->>'reason',''),image_path=nullif(payload->>'image_path',''),version=version+1 where m.id=id returning * into mistake;
   end if;
  elsif operation in ('mistake.archive','mistake.restore') then
   update learning_mistakes m set deleted_at=case when operation='mistake.archive' then clock_timestamp() else null end,version=version+1 where m.id=id returning * into mistake;
  else raise exception 'INVALID_LEARNING_INPUT';end if;
 elsif operation in ('link.note','link.deck','link.focus','link.plan') then
  if not exists(select 1 from workspaces w where w.id=wid and (case operation when 'link.note' then 'detailed' when 'link.deck' then 'flashcards' when 'link.focus' then 'pomodoro' else 'tasks' end)=any(w.active_modules)) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation='link.note' then
   if progress.note_id is null or not exists(select 1 from todos t join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='detailed' and b.workspace_id=wid where t.id=progress.note_id and t.deleted_at is null and collection_access(t.collection_id)) then
    select b.collection_id into id from workspace_module_bindings b where b.workspace_id=wid and b.module='detailed';
    if not collection_write(id) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
    insert into todos(created_by,workspace_id,collection_id,title,description,completed) values(uid,wid,id,left(topic.data->>'title',120),'',false) returning todos.id into id;
    update learning_progress p set note_id=id,version=version+1 where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
   end if;
   result:=jsonb_build_object('module','detailed','id',progress.note_id);
  elsif operation='link.deck' then
   if progress.deck_id is null or not exists(select 1 from flashcard_decks d join workspace_module_bindings b on b.collection_id=d.collection_id and b.module='flashcards' and b.workspace_id=wid where d.id=progress.deck_id and d.deleted_at is null and collection_access(d.collection_id)) then
    select b.collection_id into id from workspace_module_bindings b where b.workspace_id=wid and b.module='flashcards';
    if not collection_write(id) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
    insert into flashcard_decks(user_id,workspace_id,collection_id,title,color,cards) values(uid,wid,id,topic.data->>'title','#64748B','[]') returning flashcard_decks.id into id;
    update learning_progress p set deck_id=id,version=version+1 where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
   end if;
   result:=jsonb_build_object('module','flashcards','id',progress.deck_id);
  elsif operation='link.focus' then
   n:=coalesce((payload->>'seconds')::integer,1500);
   if progress.pomo_task_id is null or not exists(select 1 from pomo_tasks t join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='pomodoro' and b.workspace_id=wid where t.id=progress.pomo_task_id and t.deleted_at is null and collection_access(t.collection_id)) then
    row_data:=public.pomonotes_mutate(wid,'create',null,topic.data->>'title',1,n,null);
    update learning_progress p set pomo_task_id=(row_data->>'id')::uuid,version=version+1 where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
   else row_data:=public.pomonotes_mutate(wid,'goal',progress.pomo_task_id,null,1,n,null);end if;
   result:=jsonb_build_object('module','pomodoro','target',row_data);
  else
   id:=(payload->>'id')::uuid;
   row_data:=public.work_mutate(wid,'block','create',id,jsonb_build_object('title',left(subject.title||' · '||(topic.data->>'title'),180),'starts_at',payload->>'starts_at','ends_at',payload->>'ends_at','timezone',tz),null);
   result:=jsonb_build_object('module','tasks','id',row_data->>'id');
  end if;
 else raise exception 'INVALID_LEARNING_INPUT';end if;
 return jsonb_build_object('progress',to_jsonb(progress),'mistake',case when mistake.id is null then null else to_jsonb(mistake) end,'link',result);
end $_$;


ALTER FUNCTION public.learning_mutate(wid uuid, operation text, sid uuid, tid text, payload jsonb, expected_version integer) OWNER TO postgres;

--
-- Name: learning_name_limit(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learning_name_limit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.learning_name_limit() OWNER TO postgres;

--
-- Name: learning_reorder(uuid, uuid, text[], jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.learning_reorder(wid uuid, sid uuid, ordered_ids text[], expected_versions jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.learning_reorder(wid uuid, sid uuid, ordered_ids text[], expected_versions jsonb) OWNER TO postgres;

--
-- Name: manage_collection(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.manage_collection(cid uuid, action text, target_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform 1 from module_collections where id=cid for update;
  if not public.collection_owner(cid) then raise exception 'OWNER_REQUIRED'; end if;
  if action='revoke_invite' then
    update collection_invites set revoked_at=now() where id=target_id and collection_id=cid;
  elsif action in ('remove_member','end_sharing') then
    if action='remove_member' and (target_id is null or target_id=auth.uid()) then raise exception 'INVALID_MEMBER'; end if;
    update workspace_module_bindings b set collection_id=personal_collection_id from workspaces w
      where w.id=b.workspace_id and b.collection_id=cid and w.user_id<>auth.uid()
      and (action='end_sharing' or w.user_id=target_id);
    delete from collection_members where collection_id=cid and user_id<>auth.uid()
      and (action='end_sharing' or user_id=target_id);
    update module_collections set epoch=epoch+1,shared=case when action='end_sharing' then false else shared end where id=cid;
    if action='end_sharing' then update collection_invites set revoked_at=now() where collection_id=cid and revoked_at is null; end if;
  else raise exception 'INVALID_ACTION'; end if;
end;
$$;


ALTER FUNCTION public.manage_collection(cid uuid, action text, target_id uuid) OWNER TO postgres;

--
-- Name: mark_member_reminder(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_member_reminder(task_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not exists(select 1 from periodic_tasks where id=task_id and public.collection_access(collection_id)) then raise exception 'ACCESS_DENIED'; end if;
  update periodic_member_preferences p set last_notified_at=now() where p.task_id=mark_member_reminder.task_id and user_id=auth.uid();
end; $$;


ALTER FUNCTION public.mark_member_reminder(task_id uuid) OWNER TO postgres;

--
-- Name: mutate_collection_item(uuid, uuid, text, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mutate_collection_item(cid uuid, pid uuid, module_id text, operation text, item jsonb, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare root_table text; child_table text; root_field text; current_row jsonb; result jsonb; changed integer; iid text;
begin
  root_table:=case module_id when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks' when 'workout' then 'workout_routines' end;
  if root_table is null or not public.collection_write(cid) or not exists(select 1 from module_collections where id=cid and module=module_id) then raise exception 'ACCESS_DENIED'; end if;
  child_table:=root_table||'_items';
  root_field:=case module_id when 'learning' then 'topics' when 'flashcards' then 'cards' else 'exercises' end;
  execute format('select to_jsonb(p) from public.%I p where id=$1 and collection_id=$2 for update',root_table) into current_row using pid,cid;
  if current_row is null then raise exception 'SHARING_CONFLICT'; end if;
  iid:=item->>'id';
  if operation='add' then
    iid:=coalesce(nullif(iid,''),gen_random_uuid()::text);
    execute format('insert into public.%I(parent_id,collection_id,id,data,position)
      select $1,$2,$3,$4,coalesce(max(position),0)+1 from public.%I where parent_id=$1',child_table,child_table)
      using pid,cid,iid,item-'id'-'_version';
  elsif operation in ('update','delete') then
    if expected_version is null then raise exception 'SHARING_CONFLICT'; end if;
    if operation='update' then
      execute format('update public.%I set data=data||$1,version=version+1 where parent_id=$2 and id=$3 and version=$4',child_table)
        using item-'id'-'_version',pid,iid,expected_version;
    else execute format('delete from public.%I where parent_id=$1 and id=$2 and version=$3',child_table) using pid,iid,expected_version;
    end if;
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'SHARING_CONFLICT'; end if;
  elsif operation='reset' and module_id='workout' then
    if expected_version is null or (current_row->>'version')::integer<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
    execute format('update public.%I set data=data||''{"isCompleted":false}''::jsonb,version=version+1 where parent_id=$1',child_table) using pid;
  else raise exception 'INVALID_ACTION'; end if;
  execute format('select to_jsonb(p)||jsonb_build_object(%L,
    (select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by position,id),''[]'') from public.%I where parent_id=$1))
    from public.%I p where id=$1',root_field,child_table,root_table) into result using pid;
  return result;
end; $_$;


ALTER FUNCTION public.mutate_collection_item(cid uuid, pid uuid, module_id text, operation text, item jsonb, expected_version integer) OWNER TO postgres;

--
-- Name: note_image_access(text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.note_image_access(object_name text, writing boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare cid uuid;
begin
 if auth.uid() is null or object_name is null or object_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg|jpeg|gif)$' then return false;end if;
 cid:=split_part(object_name,'/',1)::uuid;
 if not exists(select 1 from module_collections where id=cid and module='detailed') then return false;end if;
 if writing then return split_part(object_name,'/',2)=auth.uid()::text and public.collection_write(cid);end if;
 return public.collection_access(cid);
end $_$;


ALTER FUNCTION public.note_image_access(object_name text, writing boolean) OWNER TO postgres;

--
-- Name: personal_workspace_reminders(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.personal_workspace_reminders() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return coalesce((select jsonb_agg(row_data) from (
    select distinct on(t.id) to_jsonb(t)||jsonb_build_object(
      'workspace_id',w.id,'user_id',auth.uid(),'workspace_name',w.name,
      'notify_browser',coalesce(p.notify_browser,false),'notify_email',coalesce(p.notify_email,false),
      'reminder_time',p.reminder_time,'last_notified_at',p.last_notified_at) as row_data
    from periodic_tasks t join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='periodic'
    join workspaces w on w.id=b.workspace_id left join periodic_member_preferences p on p.task_id=t.id and p.user_id=auth.uid()
    where t.deleted_at is null and w.user_id=auth.uid() and w.archived_at is null and 'periodic'=any(w.active_modules) and public.collection_access(t.collection_id)
    order by t.id,w.created_at
  ) records),'[]'::jsonb);
end; $$;


ALTER FUNCTION public.personal_workspace_reminders() OWNER TO postgres;

--
-- Name: plan_entries_load(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.plan_entries_load(wid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare pcid uuid;qcid uuid;answer jsonb;
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null and 'plans'=any(active_modules)) then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';end if;
 select collection_id into pcid from workspace_module_bindings where workspace_id=wid and module='plans';
 select collection_id into qcid from workspace_module_bindings where workspace_id=wid and module='quick';
 if collection_write(pcid) then perform rollover_collection_plans(pcid);end if;
 with entries as (
  select p.id,'plans'::text source,to_jsonb(p)-'reason'||jsonb_build_object('source','plans','can_write',collection_write(p.collection_id)) data,p.created_at from plans p where p.collection_id=pcid and p.deleted_at is null and collection_access(p.collection_id)
  union all select q.id,'quick',jsonb_build_object('id',q.id,'title',q.content,'period','timeless','period_date','1970-01-01','completed',q.completed,'created_at',q.created_at,'version',q.version,'history','[]'::jsonb,'source','quick','can_write',collection_write(q.collection_id)),q.created_at from quick_notes q where q.collection_id=qcid and q.deleted_at is null and collection_access(q.collection_id)
 ), result as (
  select e.data||jsonb_build_object('focus',case when l.task_id is null then null else jsonb_build_object('id',l.task_id,'estimated_sessions',coalesce(pref.estimated_sessions,1),'focus_seconds',coalesce(pref.focus_seconds,1500),'sessions',(select count(*) from analytics_focus_sessions f where f.user_id=auth.uid() and f.task_id=l.task_id and f.credited_completed)) end) data,e.created_at,e.id
  from entries e left join plan_focus_links l on l.source_id=e.id and l.source_module=e.source and l.user_id=auth.uid() and l.workspace_id=wid
  left join pomo_task_member_preferences pref on pref.task_id=l.task_id and pref.user_id=auth.uid()
 ) select coalesce(jsonb_agg(data order by created_at,id),'[]') into answer from result;
 return answer;
end $$;


ALTER FUNCTION public.plan_entries_load(wid uuid) OWNER TO postgres;

--
-- Name: plan_entry_source(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.plan_entry_source(wid uuid, source text, rid uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid;answer jsonb;
begin
 if source not in ('plans','quick') or auth.uid() is null then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';end if;
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and 'plans'=any(w.active_modules) and b.module=source;
 if cid is null or not collection_access(cid) then raise exception 'PLAN_ACCESS_DENIED' using errcode='42501';end if;
 if source='plans' then select to_jsonb(p)||jsonb_build_object('source','plans','can_write',collection_write(cid)) into answer from plans p where p.id=rid and p.collection_id=cid and p.deleted_at is null;
 else select jsonb_build_object('id',q.id,'title',q.content,'period','timeless','period_date','1970-01-01','completed',q.completed,'created_at',q.created_at,'version',q.version,'history','[]'::jsonb,'source','quick','can_write',collection_write(cid)) into answer from quick_notes q where q.id=rid and q.collection_id=cid and q.deleted_at is null;end if;
 if answer is null then raise exception 'PLAN_UNAVAILABLE';end if;return answer-'reason';
end $$;


ALTER FUNCTION public.plan_entry_source(wid uuid, source text, rid uuid) OWNER TO postgres;

--
-- Name: plan_focus_prepare(uuid, text, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.plan_focus_prepare(wid uuid, source text, rid uuid, seconds integer DEFAULT NULL::integer, estimate integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare entry jsonb;l plan_focus_links;p pomo_task_member_preferences;task jsonb;backing pomo_tasks;
begin
 entry:=plan_entry_source(wid,source,rid);
 if (entry->>'completed')::boolean then raise exception 'PLAN_COMPLETED';end if;
 if not exists(select 1 from workspaces where id=wid and 'pomodoro'=any(active_modules)) then raise exception 'PLAN_FOCUS_DISABLED';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||wid::text||source||rid::text,61));
 select * into l from plan_focus_links where user_id=auth.uid() and workspace_id=wid and source_module=source and source_id=rid;
 if l.task_id is not null then select * into p from pomo_task_member_preferences where task_id=l.task_id and user_id=auth.uid();end if;
 seconds:=coalesce(seconds,p.focus_seconds,1500);estimate:=coalesce(estimate,p.estimated_sessions,1);
 if l.task_id is null or not exists(select 1 from pomo_tasks where id=l.task_id and deleted_at is null and collection_access(collection_id)) then
  task:=pomonotes_mutate(wid,'create',null,left(entry->>'title',500),estimate,seconds,null);
  insert into plan_focus_links values(auth.uid(),wid,source,rid,(task->>'id')::uuid) on conflict(user_id,workspace_id,source_module,source_id) do update set task_id=excluded.task_id;
 else
  select * into backing from pomo_tasks where id=l.task_id for update;
  if backing.title<>left(entry->>'title',500) then
   task:=pomonotes_mutate(wid,'edit',l.task_id,left(entry->>'title',500),estimate,seconds,backing.version);
  else task:=pomonotes_mutate(wid,'goal',l.task_id,null,estimate,seconds,null);end if;
 end if;
 return task||jsonb_build_object('estimated_sessions',estimate,'focus_seconds',seconds,'source_module',source,'source_id',rid,'plan_period',entry->>'period','workspace_id',wid);
end $$;


ALTER FUNCTION public.plan_focus_prepare(wid uuid, source text, rid uuid, seconds integer, estimate integer) OWNER TO postgres;

--
-- Name: plan_focus_remove(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.plan_focus_remove(wid uuid, source text, rid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare link plan_focus_links;
begin
 perform plan_entry_source(wid,source,rid);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||wid::text||source||rid::text,61));
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 select * into link from plan_focus_links where user_id=auth.uid() and workspace_id=wid and source_module=source and source_id=rid for update;
 if link.task_id is null then return jsonb_build_object('ok',true);end if;
 -- The timer must flush and stop a live session before removing its association.
 if exists(select 1 from analytics_focus_sessions where user_id=auth.uid() and task_id=link.task_id and status in ('running','paused')) then
  raise exception 'FOCUS_SESSION_ACTIVE';
 end if;
 delete from plan_focus_links where user_id=auth.uid() and workspace_id=wid and source_module=source and source_id=rid;
 return jsonb_build_object('ok',true);
end $$;


ALTER FUNCTION public.plan_focus_remove(wid uuid, source text, rid uuid) OWNER TO postgres;

--
-- Name: plan_focus_source_available(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.plan_focus_source_available(wid uuid, tid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select exists(select 1 from plan_focus_links l
  join workspaces w on w.id=l.workspace_id and w.user_id=l.user_id
  join workspace_module_bindings b on b.workspace_id=w.id and b.module=l.source_module
  where l.user_id=auth.uid() and l.workspace_id=wid and l.task_id=tid and w.archived_at is null
  and 'plans'=any(w.active_modules) and 'pomodoro'=any(w.active_modules) and collection_access(b.collection_id)
  and ((l.source_module='plans' and exists(select 1 from plans p where p.id=l.source_id and p.collection_id=b.collection_id and p.deleted_at is null and not p.completed))
    or (l.source_module='quick' and exists(select 1 from quick_notes q where q.id=l.source_id and q.collection_id=b.collection_id and q.deleted_at is null and not q.completed))))
$$;


ALTER FUNCTION public.plan_focus_source_available(wid uuid, tid uuid) OWNER TO postgres;

--
-- Name: plan_focus_target(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.plan_focus_target(wid uuid, tid uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare l plan_focus_links;begin
 select * into l from plan_focus_links where user_id=auth.uid() and workspace_id=wid and task_id=tid;
 if l.task_id is null then return null;end if;return plan_entry_source(wid,l.source_module,l.source_id);
end $$;


ALTER FUNCTION public.plan_focus_target(wid uuid, tid uuid) OWNER TO postgres;

--
-- Name: pomonotes_history(uuid, uuid, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pomonotes_history(wid uuid, tid uuid, before_time timestamp with time zone DEFAULT NULL::timestamp with time zone, before_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid;
begin
  perform ensure_module_bindings(wid);
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='pomodoro';
  if not exists(select 1 from pomo_tasks where id=tid and collection_id=cid and deleted_at is null and collection_access(cid)) then raise exception 'ACCESS_DENIED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by started_at desc,id desc) from (
    select id,started_at,planned_seconds,status,credited_completed,credited_segments from analytics_focus_sessions
      where user_id=auth.uid() and task_id=tid and (before_time is null or (started_at,id)<(before_time,before_id))
      order by started_at desc,id desc limit 30) s),'[]');
end $$;


ALTER FUNCTION public.pomonotes_history(wid uuid, tid uuid, before_time timestamp with time zone, before_id uuid) OWNER TO postgres;

--
-- Name: pomonotes_mutate(uuid, text, uuid, text, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pomonotes_mutate(wid uuid, operation text, tid uuid DEFAULT NULL::uuid, title text DEFAULT NULL::text, estimate integer DEFAULT 1, focus_seconds integer DEFAULT 1500, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid; task pomo_tasks; uid uuid:=auth.uid();
begin
  perform ensure_module_bindings(wid);
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='pomodoro';
  if not collection_access(cid) then raise exception 'ACCESS_DENIED'; end if;
  if operation not in ('create','edit','goal','complete','reopen','delete') then raise exception 'INVALID_OPERATION'; end if;
  if operation<>'goal' and not collection_write(cid) then raise exception 'READ_ONLY'; end if;
  if operation in ('create','edit','goal') and (estimate not between 1 and 999 or focus_seconds not between 60 and 5400
    or estimate is null or focus_seconds is null) then raise exception 'INVALID_GOAL'; end if;
  if operation in ('create','edit') and (title is null or length(trim(title)) not between 1 and 500) then raise exception 'INVALID_TITLE'; end if;
  if operation='create' then
    insert into pomo_tasks(collection_id,workspace_id,created_by,title) values(cid,wid,uid,trim(title)) returning * into task;
  else
    select * into task from pomo_tasks where id=tid and collection_id=cid and deleted_at is null for update;
    if not found then raise exception 'TASK_UNAVAILABLE'; end if;
    if operation<>'goal' and (expected_version is null or task.version<>expected_version) then raise exception 'SHARING_CONFLICT'; end if;
    if operation='delete' then perform public.trash_change(wid,'pomodoro',tid,'move',expected_version);return jsonb_build_object('ok',true); end if;
    if operation<>'goal' then
      update pomo_tasks set title=case when operation='edit' then trim(pomonotes_mutate.title) else pomo_tasks.title end,
        completed=case when operation='complete' then true when operation='reopen' then false else completed end,
        updated_at=clock_timestamp() where id=tid returning * into task;
    end if;
  end if;
  if operation in ('create','edit','goal') then
    insert into pomo_task_member_preferences(task_id,user_id,estimated_sessions,focus_seconds) values(task.id,uid,estimate,pomonotes_mutate.focus_seconds)
      on conflict(task_id,user_id) do update set estimated_sessions=excluded.estimated_sessions,focus_seconds=excluded.focus_seconds;
  end if;
  return to_jsonb(task);
end $$;


ALTER FUNCTION public.pomonotes_mutate(wid uuid, operation text, tid uuid, title text, estimate integer, focus_seconds integer, expected_version integer) OWNER TO postgres;

--
-- Name: pomonotes_page(uuid, text, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pomonotes_page(wid uuid, status_filter text DEFAULT 'active'::text, search_text text DEFAULT ''::text, after_item jsonb DEFAULT NULL::jsonb, page_size integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid; result jsonb;
begin
  perform ensure_module_bindings(wid);
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='pomodoro';
  if not collection_access(cid) then raise exception 'ACCESS_DENIED'; end if;
  if status_filter not in ('active','completed','all') or page_size not between 1 and 50 or length(search_text)>100 then raise exception 'INVALID_QUERY'; end if;
  with filtered as (
    select * from pomo_tasks where collection_id=cid and deleted_at is null and (status_filter='all' or completed=(status_filter='completed'))
      and title ilike '%'||replace(replace(replace(search_text,'\','\\'),'%','\%'),'_','\_')||'%'
  ), page as (
    select * from filtered where after_item is null or (created_at,id)<((after_item->>'created_at')::timestamptz,(after_item->>'id')::uuid)
    order by created_at desc,id desc limit page_size+1
  ), shown as (select * from page order by created_at desc,id desc limit page_size),
  progress as (
    select s.task_id,count(*) filter(where s.credited_completed) as sessions,
      coalesce(sum((select coalesce(sum(extract(epoch from (p->>1)::timestamptz-(p->>0)::timestamptz)),0)
        from jsonb_array_elements(coalesce(s.credited_segments,'[]')) p)),0) as seconds
    from analytics_focus_sessions s where s.user_id=auth.uid() and s.task_id in (select id from shown) group by s.task_id
  ), items as (
    select t.*,p.estimated_sessions,p.focus_seconds,p.first_estimate_seconds,coalesce(g.sessions,0) as sessions,coalesce(g.seconds,0) as seconds
    from shown t left join pomo_task_member_preferences p on p.task_id=t.id and p.user_id=auth.uid()
      left join progress g on g.task_id=t.id
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by created_at desc,id desc) from items i),'[]'),
    'total',(select count(*) from filtered),'has_more',(select count(*)>page_size from page),
    'cursor',(select jsonb_build_object('created_at',created_at,'id',id) from shown order by created_at,id limit 1)) into result;
  return result;
end $$;


ALTER FUNCTION public.pomonotes_page(wid uuid, status_filter text, search_text text, after_item jsonb, page_size integer) OWNER TO postgres;

--
-- Name: pomonotes_search_target(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pomonotes_search_target(wid uuid, tid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('id',t.id,'workspace_id',w.id,'collection_id',t.collection_id,'created_by',t.created_by,
    'title',t.title,'completed',t.completed,'version',t.version,'created_at',t.created_at,'updated_at',t.updated_at,
    'estimated_sessions',p.estimated_sessions,'focus_seconds',p.focus_seconds,
    'first_estimate_seconds',p.first_estimate_seconds,'sessions',coalesce(g.sessions,0),'seconds',coalesce(g.seconds,0))
  from public.pomo_tasks t
  join public.workspace_module_bindings b on b.collection_id=t.collection_id and b.module='pomodoro'
  join public.workspaces w on w.id=b.workspace_id
  left join public.pomo_task_member_preferences p on p.task_id=t.id and p.user_id=auth.uid()
  left join lateral (
    select count(*) filter(where s.credited_completed) as sessions,
      coalesce(sum((select coalesce(sum(extract(epoch from (x->>1)::timestamptz-(x->>0)::timestamptz)),0)
        from jsonb_array_elements(coalesce(s.credited_segments,'[]')) x)),0) as seconds
    from public.analytics_focus_sessions s where s.user_id=auth.uid() and s.task_id=t.id
  ) g on true
  where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and 'pomodoro'=any(w.active_modules)
    and t.deleted_at is null and t.id=tid and public.collection_access(t.collection_id)
$$;


ALTER FUNCTION public.pomonotes_search_target(wid uuid, tid uuid) OWNER TO postgres;

--
-- Name: preview_collection_invite(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.preview_collection_invite(invite_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare inv collection_invites; result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if invite_token is null or invite_token !~ '^[a-f0-9]{64}$' then raise exception 'INVITE_INVALID'; end if;
  select * into inv from collection_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex');
  if inv.id is null then raise exception 'INVITE_INVALID'; end if;
  if inv.revoked_at is not null then raise exception 'INVITE_REVOKED'; end if;
  if inv.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if inv.used_at is not null or inv.used_by is not null then raise exception 'INVITE_USED'; end if;
  select jsonb_build_object('collection_id',c.id,'module',c.module,'name',w.name,
    'owner_label',coalesce(nullif(split_part(u.email,'@',1),''),'Owner'),
    'expires_at',inv.expires_at,'already_member',public.collection_member(c.id),'invite_role',inv.invite_role) into result
    from module_collections c join workspaces w on w.id=c.origin_workspace_id
    join auth.users u on u.id=c.owner_id where c.id=inv.collection_id;
  return result;
end;
$_$;


ALTER FUNCTION public.preview_collection_invite(invite_token text) OWNER TO postgres;

--
-- Name: project_collection_items(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.project_collection_items() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare pid uuid; projection jsonb; root_table text:=tg_argv[0]; root_field text:=tg_argv[1];
begin
  pid:=case when tg_op='DELETE' then old.parent_id else new.parent_id end;
  execute format('select coalesce(jsonb_agg(data||jsonb_build_object(''id'',id,''_version'',version) order by position,id),''[]''::jsonb) from public.%I where parent_id=$1',tg_table_name)
    into projection using pid;
  execute format('update public.%I set %I=$1 where id=$2',root_table,root_field) using projection,pid;
  return null;
end; $_$;


ALTER FUNCTION public.project_collection_items() OWNER TO postgres;

--
-- Name: purge_expired_trash(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.purge_expired_trash(batch_size integer DEFAULT 200) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare m text;t text;r record;n integer:=0;begin
 foreach m in array array['detailed','quick','plans','code','pomodoro','learning','flashcards','workout','periodic','activities'] loop
  t:=public.trash_table(m);
  for r in execute format('select id from public.%I where deleted_at<=clock_timestamp()-interval ''30 days'' order by deleted_at limit $1 for update skip locked',t) using greatest(0,least(batch_size,500)-n) loop
   perform public.trash_purge_record(m,r.id);n:=n+1;
  end loop;
  exit when n>=least(batch_size,500);
 end loop;
 foreach t in array array['work_tasks','work_blocks'] loop
  for r in execute format('select id from public.%I where deleted_at<=clock_timestamp()-interval ''30 days'' order by deleted_at limit $1 for update skip locked',t) using greatest(0,least(batch_size,500)-n) loop
   execute format('delete from public.%I where id=$1',t) using r.id;n:=n+1;
  end loop;
 end loop;
 return n;
end $_$;


ALTER FUNCTION public.purge_expired_trash(batch_size integer) OWNER TO postgres;

--
-- Name: record_focus_session(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.record_focus_session(payload jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare uid uuid:=auth.uid(); sid uuid:=(payload->>'id')::uuid; tid uuid:=(payload->>'task_id')::uuid;
  prior analytics_focus_sessions; holder focus_ownership; task pomo_tasks;
  own_ranges tstzmultirange; occupied tstzmultirange; accepted tstzmultirange; seconds double precision; result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,2));
  select * into holder from focus_ownership where user_id=uid for update;
  select * into prior from analytics_focus_sessions where id=sid;
  if prior.id is not null and prior.user_id<>uid then raise exception 'FOCUS_SESSION_FORBIDDEN'; end if;
  if prior.writer_lease is not null and (prior.writer_client::text is distinct from payload->>'client_id' or prior.writer_lease::text is distinct from payload->>'lease') then
    return true; -- Old owner retries cannot overwrite a transferred session.
  end if;
  if prior.id is null and payload->>'association'='task' and tid is not null then
    select * into task from pomo_tasks where id=tid and collection_access(collection_id) and plan_focus_source_available((payload->>'workspace_id')::uuid,tid);
    if not found then tid:=null; end if; -- Retain private elapsed time without exposing revoked task data.
    if tid is not null and not exists(select 1 from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
      where b.collection_id=task.collection_id and b.workspace_id=(payload->>'workspace_id')::uuid and b.module='pomodoro' and w.user_id=uid) then raise exception 'WORKSPACE_FORBIDDEN'; end if;
  end if;
  if prior.id is not null and prior.association='task' and prior.task_id is not null
    and tid is distinct from prior.task_id then raise exception 'FOCUS_TARGET_IMMUTABLE'; end if;
  if prior.id is not null and (prior.revision>=(payload->>'revision')::bigint or prior.status in ('completed','ended')) then return true; end if;
  perform public.record_focus_session_v1(payload);
  if prior.id is null then
    update analytics_focus_sessions set association=case when payload->>'association'='task' then 'task' else 'free' end,
      task_id=tid,collection_id=task.collection_id,estimated_sessions=greatest(1,least(coalesce((payload->>'estimated_sessions')::integer,1),999)),
      goal_seconds=coalesce((payload->>'goal_seconds')::integer,(payload->>'planned_seconds')::integer) where id=sid;
    if tid is not null then
      insert into pomo_task_member_preferences(task_id,user_id,estimated_sessions,focus_seconds,first_estimate_seconds)
        values(tid,uid,greatest(1,least(coalesce((payload->>'estimated_sessions')::integer,1),999)),
          (payload->>'planned_seconds')::integer,
          greatest(1,least(coalesce((payload->>'estimated_sessions')::integer,1),999))*(payload->>'planned_seconds')::integer)
        on conflict(task_id,user_id) do update set first_estimate_seconds=coalesce(pomo_task_member_preferences.first_estimate_seconds,excluded.first_estimate_seconds);
    end if;
  end if;
  select range_agg(tstzrange((p->>0)::timestamptz,(p->>1)::timestamptz,'[)')) into own_ranges
    from jsonb_array_elements(payload->'segments') p where (p->>1)::timestamptz>(p->>0)::timestamptz;
  select range_agg(tstzrange((p->>0)::timestamptz,(p->>1)::timestamptz,'[)')) into occupied
    from analytics_focus_sessions s cross join lateral jsonb_array_elements(coalesce(s.credited_segments,'[]')) p
    where s.user_id=uid and s.id<>sid and (p->>1)::timestamptz>(p->>0)::timestamptz
      and (p->>1)::timestamptz>(payload->>'started_at')::timestamptz;
  accepted:=coalesce(own_ranges,'{}'::tstzmultirange)-coalesce(occupied,'{}'::tstzmultirange);
  select coalesce(jsonb_agg(jsonb_build_array(lower(span),upper(span)) order by lower(span)),'[]'),
    coalesce(sum(extract(epoch from upper(span)-lower(span))),0) into result,seconds from unnest(accepted) span;
  update analytics_focus_sessions set credited_segments=result,
    credited_completed=(status='completed' and seconds>=planned_seconds-1) where id=sid;
  if holder.session_id=sid then
    update focus_ownership set expires_at=clock_timestamp()+interval '45 seconds' where user_id=uid;
  end if;
  return true;
end $$;


ALTER FUNCTION public.record_focus_session(payload jsonb) OWNER TO postgres;

--
-- Name: record_focus_session_v1(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.record_focus_session_v1(payload jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  uid uuid := auth.uid(); sid uuid := (payload->>'id')::uuid;
  wid uuid := (payload->>'workspace_id')::uuid;
  started timestamptz := (payload->>'started_at')::timestamptz;
  planned integer := (payload->>'planned_seconds')::integer;
  rev bigint := (payload->>'revision')::bigint;
  state text := payload->>'status';
  parts jsonb := payload->'segments'; part jsonb;
  a timestamptz; b timestamptz; last_end timestamptz; duration double precision := 0;
  existing public.analytics_focus_sessions%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if sid is null or wid is null or started is null or started>clock_timestamp()+interval '5 seconds'
    or planned is null or planned not between 60 and 5400 or rev is null or rev<1
    or state is null or state not in ('running','paused','completed','ended')
    or parts is null or jsonb_typeof(parts)<>'array' then raise exception 'INVALID_FOCUS_SESSION'; end if;
  if jsonb_array_length(parts)>1000 then raise exception 'INVALID_FOCUS_SESSION'; end if;
  if not exists(select 1 from public.workspaces where id=wid and user_id=uid) then raise exception 'WORKSPACE_FORBIDDEN'; end if;
  for part in select value from jsonb_array_elements(parts) loop
    a := (part->>0)::timestamptz; b := (part->>1)::timestamptz;
    if a is null or b is null or a<started or b<a or b>clock_timestamp()+interval '5 seconds'
      or (last_end is not null and a<last_end) then raise exception 'INVALID_FOCUS_SESSION'; end if;
    duration := duration+extract(epoch from b-a); last_end := b;
  end loop;
  if duration>planned+1 or (state='completed' and duration<planned-1) then raise exception 'INVALID_FOCUS_SESSION'; end if;
  -- Serialize identical IDs even on their first insert.
  perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
  select * into existing from public.analytics_focus_sessions where id=sid for update;
  if found then
    if existing.user_id<>uid or existing.workspace_id<>wid or existing.started_at<>started or existing.planned_seconds<>planned then
      raise exception 'FOCUS_SESSION_FORBIDDEN';
    end if;
    if existing.revision>=rev then return true; end if;
    if existing.status in ('completed','ended') then return true; end if;
  end if;
  insert into public.analytics_focus_sessions(id,user_id,workspace_id,started_at,planned_seconds,revision,status,segments)
    values(sid,uid,wid,started,planned,rev,state,parts)
    on conflict(id) do update set revision=excluded.revision,status=excluded.status,segments=excluded.segments,updated_at=now();
  return true;
end $$;


ALTER FUNCTION public.record_focus_session_v1(payload jsonb) OWNER TO postgres;

--
-- Name: reorder_workout_exercises(uuid, uuid, text[], integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reorder_workout_exercises(cid uuid, pid uuid, ordered_ids text[], expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.reorder_workout_exercises(cid uuid, pid uuid, ordered_ids text[], expected_version integer) OWNER TO postgres;

--
-- Name: report_client_error(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.report_client_error(code text, screen text, release text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if code is null or code not in ('UI_RENDER_ERROR','SCRIPT_ERROR','UNHANDLED_PROMISE')
   or screen is null or screen not in ('workspace','settings','analytics','auth','unknown')
   or release is null or release !~ '^[a-zA-Z0-9._-]{1,64}$' then raise exception 'INVALID_ERROR_REPORT'; end if;
 if not private.take_api_budget(uid,'error-reports',60,10) or not private.take_api_budget(uid,'error-reports',86400,200) then return false; end if;
 insert into private.client_error_counts as counts(bucket,code,screen,release)
 values(date_trunc('hour',clock_timestamp()),code,screen,release)
 on conflict on constraint client_error_counts_pkey do update set occurrences=counts.occurrences+1;
 return true;
end; $_$;


ALTER FUNCTION public.report_client_error(code text, screen text, release text) OWNER TO postgres;

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

--
-- Name: rollover_collection_plans(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rollover_collection_plans(cid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare p record;today date;boundary date;cursor_date date;snapshots jsonb;
begin
 if not collection_write(cid) or not exists(select 1 from module_collections where id=cid and module='plans') then raise exception 'ACCESS_DENIED';end if;
 select (now() at time zone timezone)::date into today from module_collections where id=cid;
 for p in select * from plans where collection_id=cid and deleted_at is null and not completed and period<>'timeless' order by id for update loop
  boundary:=case p.period when 'daily' then today when 'weekly' then date_trunc('week',today)::date when 'monthly' then date_trunc('month',today)::date when 'yearly' then date_trunc('year',today)::date end;
  cursor_date:=p.period_date;snapshots:=coalesce(p.history,'[]');
  while cursor_date<boundary loop
   snapshots:=snapshots||jsonb_build_array(jsonb_build_object('date',cursor_date,'completed',false));
   cursor_date:=cursor_date+case p.period when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' else interval '1 year' end;
  end loop;
  if p.period_date<boundary then update plans set period_date=boundary,history=snapshots where id=p.id;end if;
 end loop;
end $$;


ALTER FUNCTION public.rollover_collection_plans(cid uuid) OWNER TO postgres;

--
-- Name: save_member_reminder(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_member_reminder() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.member_notify_browser is not null then
    if not public.collection_access(new.collection_id) then raise exception 'ACCESS_DENIED'; end if;
    insert into periodic_member_preferences(task_id,user_id,notify_browser,notify_email,reminder_time)
      values(new.id,auth.uid(),new.member_notify_browser,coalesce(new.member_notify_email,false),new.member_reminder_time)
      on conflict(task_id,user_id) do update set notify_browser=excluded.notify_browser,notify_email=excluded.notify_email,reminder_time=excluded.reminder_time;
  end if;
  new.member_notify_browser:=null; new.member_notify_email:=null; new.member_reminder_time:=null;
  if tg_op='UPDATE' then
    new.notify_browser:=old.notify_browser; new.notify_email:=old.notify_email;
    new.reminder_time:=old.reminder_time; new.last_notified_at:=old.last_notified_at;
  end if;
  return new;
end; $$;


ALTER FUNCTION public.save_member_reminder() OWNER TO postgres;

--
-- Name: save_user_preferences(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_user_preferences(expected_user_id uuid, patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if expected_user_id is distinct from uid then raise exception 'SESSION_CHANGED' using errcode = '42501'; end if;
  if not public.valid_user_preferences(patch) then raise exception 'INVALID_PREFERENCES' using errcode = '22023'; end if;
  -- Merge only edited fields: another device's unrelated preferences survive.
  insert into public.user_preferences(user_id, preferences) values(uid, patch)
    on conflict (user_id) do update set preferences = user_preferences.preferences || excluded.preferences,
      updated_at = clock_timestamp()
    returning preferences into result;
  return result;
end $$;


ALTER FUNCTION public.save_user_preferences(expected_user_id uuid, patch jsonb) OWNER TO postgres;

--
-- Name: seal_vault(uuid, text, text, jsonb, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.seal_vault(sid uuid, previous_hash text, metadata text, notes jsonb, expected_version integer, new_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s record; n record; supplied jsonb; h jsonb; begin
  select * into s from password_sessions where id=sid for update;
  if not found or not public.collection_owner(s.collection_id) then raise exception 'OWNER_REQUIRED'; end if;
  if not public.vault_acknowledged(auth.uid()) then raise exception 'VAULT_ACK_REQUIRED'; end if;
  if s.password_hash is distinct from previous_hash or s.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  if public.vault_metadata_valid(s.password_hash) and s.password_hash::jsonb->>'format'='todo-vault-v2' then raise exception 'VAULT_EMAIL_REQUIRED'; end if;
  if not public.vault_metadata_valid(metadata) or metadata::jsonb->>'format'<>'todo-vault-v2' or jsonb_typeof(notes)<>'array' then raise exception 'VAULT_INVALID_DATA'; end if;
  perform 1 from secure_notes where session_id=sid order by id for update;
  if jsonb_array_length(notes)<>(select count(*) from secure_notes where session_id=sid) or (select count(distinct value->>'id') from jsonb_array_elements(notes))<>jsonb_array_length(notes) then raise exception 'SHARING_CONFLICT'; end if;
  perform set_config('app.vault_admin','on',true);
  update password_sessions set password_hash=metadata,name=coalesce(nullif(trim(new_name),''),s.name) where id=sid returning * into s;
  for n in select * from secure_notes where session_id=sid order by id loop
    select value into supplied from jsonb_array_elements(notes) where value->>'id'=n.id::text;
    if supplied is null or (supplied->>'version')::int is distinct from n.version then raise exception 'SHARING_CONFLICT'; end if;
    perform 1 from vault_note_history where note_id=n.id for update;
    if jsonb_typeof(coalesce(supplied->'history','[]'))<>'array'
      or jsonb_array_length(coalesce(supplied->'history','[]'))<>(select count(*) from vault_note_history where note_id=n.id)
      or (select count(distinct value->>'id') from jsonb_array_elements(coalesce(supplied->'history','[]')))<>jsonb_array_length(coalesce(supplied->'history','[]')) then raise exception 'SHARING_CONFLICT'; end if;
    for h in select value from jsonb_array_elements(coalesce(supplied->'history','[]')) loop
      if not public.vault_envelope_valid(h->'encrypted_payload') or h->'encrypted_payload'->>'key_id' is distinct from metadata::jsonb->>'key_id' then raise exception 'VAULT_INVALID_DATA'; end if;
      update vault_note_history set encrypted_payload=h->'encrypted_payload' where id=(h->>'id')::uuid and note_id=n.id;
      if not found then raise exception 'SHARING_CONFLICT'; end if;
    end loop;
    update secure_notes set encrypted_payload=supplied->'encrypted_payload' where id=n.id;
  end loop;
  perform set_config('app.vault_admin','off',true);
  insert into vault_security_events(user_id,vault_id,action) values(auth.uid(),sid,'upgrade');
  return to_jsonb(s);
end; $$;


ALTER FUNCTION public.seal_vault(sid uuid, previous_hash text, metadata text, notes jsonb, expected_version integer, new_name text) OWNER TO postgres;

--
-- Name: search_workspace(uuid, text, integer, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_workspace(wid uuid, query_text text, page_size integer DEFAULT 5, page_offset integer DEFAULT 0, only_module text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare needle text:=public.workspace_search_normalize(query_text); result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if length(coalesce(query_text,''))>120 or page_offset is null or page_size is null or page_offset<0 or page_offset>10000 or page_size<1 or page_size>30 then raise exception 'INVALID_SEARCH'; end if;
  if needle='' then return jsonb_build_object('groups','[]'::jsonb); end if;
  with matched as materialized (
    select d.*, case when public.workspace_search_normalize(d.title)=needle then 3 when strpos(public.workspace_search_normalize(d.title),needle)>0 then 2 else 1 end as rank,
      greatest(1,strpos(public.workspace_search_normalize(d.body),needle)-65) as snippet_start
    from public.workspace_search_documents(wid) d
    where (only_module is null or d.module=only_module)
      and strpos(public.workspace_search_normalize(concat_ws(' ',d.title,d.body)),needle)>0
  ), numbered as (
    select m.*,row_number() over(partition by module order by rank desc,created_at desc,record_id,child_id nulls first) as n from matched m
  ), groups as (
    select module,count(*) as total,coalesce(jsonb_agg(jsonb_build_object('module',module,'record_id',record_id,'child_id',child_id,
      'title',left(title,180),'preview',substring(body from snippet_start for 220),'meta',meta)
      order by n) filter(where n>page_offset and n<=page_offset+page_size),'[]'::jsonb) as items from numbered group by module
  ) select jsonb_build_object('groups',coalesce(jsonb_agg(to_jsonb(g) order by module),'[]'::jsonb)) into result from groups g;
  return result;
end; $$;


ALTER FUNCTION public.search_workspace(wid uuid, query_text text, page_size integer, page_offset integer, only_module text) OWNER TO postgres;

--
-- Name: session_mfa_satisfied(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.session_mfa_satisfied() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare uid uuid:=auth.uid(); claims jsonb;
begin
 if uid is null then return false; end if;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if claims->>'aal'='aal2' then return true; end if;
 return not exists(select 1 from auth.mfa_factors where user_id=uid and status='verified');
end; $$;


ALTER FUNCTION public.session_mfa_satisfied() OWNER TO postgres;

--
-- Name: set_created_by_auth(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_created_by_auth() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_created_by_auth() OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- Name: sharing_binding_changed(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sharing_binding_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare uid uuid;
begin
  select user_id into uid from workspaces where id=new.workspace_id;
  perform public.sharing_notify('sharing-user:'||uid::text,jsonb_build_object('workspace_id',new.workspace_id));
  return new;
end;
$$;


ALTER FUNCTION public.sharing_binding_changed() OWNER TO postgres;

--
-- Name: sharing_collection_changed(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sharing_collection_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare uid uuid;
begin
  for uid in select user_id from collection_members where collection_id=new.id loop
    perform public.sharing_notify('sharing-user:'||uid::text,jsonb_build_object('collection_id',new.id));
  end loop;
  return new;
end;
$$;


ALTER FUNCTION public.sharing_collection_changed() OWNER TO postgres;

--
-- Name: sharing_context(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sharing_context(wid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform public.ensure_module_bindings(wid);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'module',b.module,'collection_id',c.id,'personal_collection_id',b.personal_collection_id,
    'origin_workspace_id',c.origin_workspace_id,'shared',c.shared,'epoch',c.epoch,
    'owner_id',c.owner_id,'role',m.role,'name',w.name,
    'members',(select count(*) from collection_members cm where cm.collection_id=c.id),
    'active_modules',(select active_modules from workspaces where id=wid),
    'timezone',to_jsonb(c)->>'timezone','permissions_ready',true
  ) order by b.module)
  from workspace_module_bindings b join module_collections c on c.id=b.collection_id
  join collection_members m on m.collection_id=c.id and m.user_id=auth.uid()
  join workspaces w on w.id=c.origin_workspace_id where b.workspace_id=wid),'[]'::jsonb);
end;
$$;


ALTER FUNCTION public.sharing_context(wid uuid) OWNER TO postgres;

--
-- Name: sharing_notify(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sharing_notify(topic text, payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    perform realtime.send(payload,'changed',topic,true);
  end if;
end;
$$;


ALTER FUNCTION public.sharing_notify(topic text, payload jsonb) OWNER TO postgres;

--
-- Name: sharing_topic_access(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sharing_topic_access(topic text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare parts text[];
begin
  if topic='sharing-user:'||auth.uid()::text then return true; end if;
  parts := string_to_array(topic,':');
  if cardinality(parts)<>3 or parts[1]<>'collection' then return false; end if;
  return exists(select 1 from module_collections where id=parts[2]::uuid and epoch=parts[3]::integer and public.collection_access(id));
exception when invalid_text_representation then return false;
end;
$$;


ALTER FUNCTION public.sharing_topic_access(topic text) OWNER TO postgres;

--
-- Name: trash_change(uuid, text, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trash_change(wid uuid, module_id text, rid uuid, action text, expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare uid uuid:=auth.uid();t text:=public.trash_table(module_id);cid uuid;row_data jsonb;answer jsonb;begin
 if module_id in ('tasks','calendar') then
  answer:=public.work_mutate(wid,case when module_id='tasks' then 'task' else 'block' end,action,rid,'{}',expected_version);
  return jsonb_build_object('id',rid,'module',module_id,'collection_id',wid,'version',(answer->>'version')::integer,'deleted_at',answer->>'deleted_at');
 end if;
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 if t is null or action not in ('move','restore','purge') or rid is null or expected_version is null then raise exception 'INVALID_TRASH_INPUT';end if;
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
 where w.id=wid and w.user_id=uid and w.archived_at is null and b.module=module_id;
 perform 1 from module_collections where id=cid for update;
 if cid is null or not public.collection_write(cid) then raise exception 'TRASH_ACCESS_DENIED' using errcode='42501';end if;
 execute format('select to_jsonb(r) from public.%I r where id=$1 and collection_id=$2 for update',t) into row_data using rid,cid;
 if row_data is null then raise exception 'TRASH_UNAVAILABLE';end if;
 if (row_data->>'version')::integer<>expected_version then raise exception 'SHARING_CONFLICT';end if;
 if action='move' then
  if row_data->>'deleted_at' is not null then raise exception 'TRASH_UNAVAILABLE';end if;
  if module_id='pomodoro' and exists(select 1 from analytics_focus_sessions s join focus_ownership f on f.session_id=s.id
    where s.task_id=rid and s.status in ('running','paused') and f.expires_at>clock_timestamp()) then raise exception 'TRASH_FOCUS_ACTIVE';end if;
  perform set_config('app.trash_write','on',true);
  execute format('update public.%I set deleted_at=clock_timestamp(),deleted_by=$1 where id=$2 returning to_jsonb(%I.*)',t,t) into row_data using uid,rid;
 elsif action='restore' then
  if row_data->>'deleted_at' is null or (row_data->>'deleted_at')::timestamptz<=clock_timestamp()-interval '30 days' then raise exception 'TRASH_EXPIRED';end if;
  perform set_config('app.trash_write','on',true);
  execute format('update public.%I set deleted_at=null,deleted_by=null where id=$1 returning to_jsonb(%I.*)',t,t) into row_data using rid;
 else
  if not public.collection_owner(cid) then raise exception 'OWNER_REQUIRED' using errcode='42501';end if;
  if row_data->>'deleted_at' is null then raise exception 'TRASH_UNAVAILABLE';end if;
  perform public.trash_purge_record(module_id,rid);
 end if;
 perform set_config('app.trash_write','off',true);
 -- Never return note bodies, encrypted payloads or credentials in mutation receipts.
 return jsonb_build_object('id',rid,'module',module_id,'collection_id',cid,'version',(row_data->>'version')::integer,'deleted_at',row_data->>'deleted_at');
end $_$;


ALTER FUNCTION public.trash_change(wid uuid, module_id text, rid uuid, action text, expected_version integer) OWNER TO postgres;

--
-- Name: trash_cleanup_images(text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trash_cleanup_images(ack text[] DEFAULT '{}'::text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 delete from trash_image_cleanup where path=any(ack);
 -- A file still referenced by any retained note is never removed.
 delete from trash_image_cleanup q where exists(select 1 from todos t where strpos(coalesce(t.description,''),q.path)>0);
 return coalesce((select jsonb_agg(path) from (select path from trash_image_cleanup where queued_at<clock_timestamp()-interval '1 day' order by queued_at limit 100) x),'[]');
end $$;


ALTER FUNCTION public.trash_cleanup_images(ack text[]) OWNER TO postgres;

--
-- Name: trash_empty(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trash_empty(wid uuid, only_module text DEFAULT NULL::text, cutoff timestamp with time zone DEFAULT clock_timestamp()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare uid uuid:=auth.uid();b record;r record;t text;n integer:=0;removed jsonb:='[]';begin
 if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'TRASH_ACCESS_DENIED' using errcode='42501';end if;
 if cutoff is null or cutoff>clock_timestamp() or (only_module is not null and public.trash_table(only_module) is null) then raise exception 'INVALID_TRASH_INPUT';end if;
 for b in select x.module,x.collection_id from workspace_module_bindings x join module_collections c on c.id=x.collection_id
 where x.workspace_id=wid and (only_module is null or x.module=only_module or (only_module='plans' and x.module='quick')) and x.module<>'pomodoro' and public.collection_owner(c.id) order by c.id for update of c loop
  t:=public.trash_table(b.module);if t is null then continue;end if;
  for r in execute format('select id,version from public.%I where collection_id=$1 and deleted_at<=$2 and deleted_at>clock_timestamp()-interval ''30 days'' order by id for update',t) using b.collection_id,cutoff loop
   perform public.trash_purge_record(b.module,r.id);n:=n+1;
   removed:=removed||jsonb_build_array(jsonb_build_object('id',r.id,'module',b.module,'version',r.version));
  end loop;
 end loop;
 for b in select x.module,x.tbl from (values('tasks','work_tasks'),('calendar','work_blocks')) x(module,tbl) where only_module is null or x.module=only_module loop
  for r in execute format('select id,version from public.%I where workspace_id=$1 and user_id=auth.uid() and deleted_at<=$2 and deleted_at>clock_timestamp()-interval ''30 days'' order by id for update',b.tbl) using wid,cutoff loop
   perform public.work_mutate(wid,case b.module when 'tasks' then 'task' else 'block' end,'purge',r.id,'{}',r.version);
   n:=n+1;removed:=removed||jsonb_build_array(jsonb_build_object('id',r.id,'module',b.module,'version',r.version));
  end loop;
 end loop;
 return jsonb_build_object('count',n,'removed',removed);
end $_$;


ALTER FUNCTION public.trash_empty(wid uuid, only_module text, cutoff timestamp with time zone) OWNER TO postgres;

--
-- Name: trash_page(uuid, text, text, timestamp with time zone, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trash_page(wid uuid, only_module text DEFAULT NULL::text, query_text text DEFAULT ''::text, after_time timestamp with time zone DEFAULT NULL::timestamp with time zone, after_key text DEFAULT NULL::text, page_size integer DEFAULT 40) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare uid uuid:=auth.uid();m text;t text;parts text[]:='{}';statement text;answer jsonb;begin
 if uid is null or not exists(select 1 from workspaces where id=wid and user_id=uid and archived_at is null) then raise exception 'TRASH_ACCESS_DENIED' using errcode='42501';end if;
 if page_size is null or page_size not between 1 and 60 or length(coalesce(query_text,''))>100 or (only_module is not null and public.trash_table(only_module) is null) then raise exception 'INVALID_TRASH_INPUT';end if;
 foreach m in array array['detailed','quick','plans','code','pomodoro','learning','flashcards','workout','periodic','activities'] loop
  if m='pomodoro' or (only_module is not null and m<>only_module and not(only_module='plans' and m='quick')) then continue;end if;
  t:=public.trash_table(m);
  parts:=array_append(parts,format('select r.id,%L::text module,%L||r.id::text key,r.collection_id,r.deleted_at,r.version,
   left(coalesce(to_jsonb(r)->>''title'',to_jsonb(r)->>''content'',''''),180) title,
   public.collection_owner(r.collection_id) can_purge from public.%I r
   join workspace_module_bindings b on b.collection_id=r.collection_id and b.module=%L
   where b.workspace_id=$1 and r.deleted_at>clock_timestamp()-interval ''30 days'' and public.collection_write(r.collection_id)',m,m||':',t,m));
 end loop;
 foreach m in array array['tasks','calendar'] loop
  if m='pomodoro' or (only_module is not null and m<>only_module and not(only_module='plans' and m='quick')) then continue;end if;
  t:=case m when 'tasks' then 'work_tasks' else 'work_blocks' end;
  parts:=array_append(parts,format('select r.id,%L::text module,%L||r.id::text key,r.workspace_id collection_id,r.deleted_at,r.version,
   left(coalesce(nullif(r.title,'''') ,''Untitled''),180) title,true can_purge from public.%I r
   where r.workspace_id=$1 and r.user_id=auth.uid() and r.deleted_at>clock_timestamp()-interval ''30 days''',m,m||':',t));
 end loop;
 statement:='with all_rows as ('||array_to_string(parts,' union all ')||'), filtered as (select * from all_rows where strpos(lower(title),lower($2))>0),
 page as (select * from filtered where $3 is null or (deleted_at,key)<($3,$4) order by deleted_at desc,key desc limit $5+1),
 shown as (select * from page order by deleted_at desc,key desc limit $5)
 select jsonb_build_object(''items'',coalesce((select jsonb_agg(to_jsonb(s) order by deleted_at desc,key desc) from shown s),''[]''),
 ''total'',(select count(*) from filtered),''purgeable'',(select count(*) from filtered where can_purge),''as_of'',clock_timestamp(),''has_more'',(select count(*)>$5 from page),
 ''cursor'',(select jsonb_build_object(''time'',deleted_at,''key'',key) from shown order by deleted_at,key limit 1))';
 execute statement into answer using wid,coalesce(query_text,''),after_time,after_key,page_size;
 return answer;
end $_$;


ALTER FUNCTION public.trash_page(wid uuid, only_module text, query_text text, after_time timestamp with time zone, after_key text, page_size integer) OWNER TO postgres;

--
-- Name: trash_parent_active(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trash_parent_active(module_id text, rid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare t text:=public.trash_table(module_id);allowed boolean;begin
 if t is null or auth.uid() is null then return false;end if;
 execute format('select exists(select 1 from public.%I where id=$1 and deleted_at is null and public.collection_access(collection_id))',t) into allowed using rid;
 return allowed;
end $_$;


ALTER FUNCTION public.trash_parent_active(module_id text, rid uuid) OWNER TO postgres;

--
-- Name: trash_purge_record(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trash_purge_record(module_id text, rid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare t text:=public.trash_table(module_id);r record;begin
 if t is null then raise exception 'INVALID_TRASH_MODULE';end if;
 if module_id='detailed' then
  for r in select match[1] path,n.collection_id from todos n cross join lateral regexp_matches(coalesce(n.description,''),'data-note-image="([^"]+)"','g') match where n.id=rid loop
   if r.path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png|jpg|jpeg|gif)$' and split_part(r.path,'/',1)=r.collection_id::text then
    insert into trash_image_cleanup(path) values(r.path) on conflict(path) do update set queued_at=clock_timestamp();
   end if;
  end loop;
 end if;
 perform set_config('app.trash_write','on',true);
 execute format('delete from public.%I where id=$1 and deleted_at is not null',t) using rid;
 perform set_config('app.trash_write','off',true);
end $_$;


ALTER FUNCTION public.trash_purge_record(module_id text, rid uuid) OWNER TO postgres;

--
-- Name: trash_table(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trash_table(module_id text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select case module_id when 'detailed' then 'todos' when 'quick' then 'quick_notes'
 when 'plans' then 'plans' when 'code' then 'code_snippets' when 'pomodoro' then 'pomo_tasks'
 when 'learning' then 'learning_subjects' when 'flashcards' then 'flashcard_decks'
 when 'workout' then 'workout_routines' when 'periodic' then 'periodic_tasks' when 'activities' then 'activity_items' when 'tasks' then 'work_tasks' when 'calendar' then 'work_blocks' end
$$;


ALTER FUNCTION public.trash_table(module_id text) OWNER TO postgres;

--
-- Name: valid_user_preferences(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.valid_user_preferences(value jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
declare field text; durations jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' or octet_length(value::text) > 4096 then return false; end if;
  for field in select jsonb_object_keys(value) loop
    if field not in ('workspaceWide','pomodoroPlacement','language','theme','themePalette','pomodoroDurations') then return false; end if;
  end loop;
  if value ? 'workspaceWide' and jsonb_typeof(value->'workspaceWide') <> 'boolean' then return false; end if;
  if value ? 'pomodoroPlacement' and (jsonb_typeof(value->'pomodoroPlacement') <> 'string' or value->>'pomodoroPlacement' not in ('card','navbar')) then return false; end if;
  if value ? 'language' and (jsonb_typeof(value->'language') <> 'string' or value->>'language' not in ('en','tr')) then return false; end if;
  if value ? 'theme' and (jsonb_typeof(value->'theme') <> 'string' or value->>'theme' not in ('light','dark')) then return false; end if;
  if value ? 'themePalette' and (jsonb_typeof(value->'themePalette') <> 'string' or value->>'themePalette' not in ('classic','ocean','forest','sand','lavender','amber','ruby','cobalt','graphite')) then return false; end if;
  if value ? 'pomodoroDurations' then
    durations := value->'pomodoroDurations';
    if jsonb_typeof(durations) <> 'object' or not durations ?& array['focus','shortBreak','longBreak'] then return false; end if;
    for field in select jsonb_object_keys(durations) loop
      if field not in ('focus','shortBreak','longBreak') or jsonb_typeof(durations->field) <> 'number' then return false; end if;
      if (durations->>field)::numeric <> trunc((durations->>field)::numeric) then return false; end if;
    end loop;
    if (durations->>'focus')::numeric not between 10 and 90
      or (durations->>'shortBreak')::numeric not between 3 and 30
      or (durations->>'longBreak')::numeric not between 5 and 45 then return false; end if;
  end if;
  return true;
end $$;


ALTER FUNCTION public.valid_user_preferences(value jsonb) OWNER TO postgres;

--
-- Name: vault_acknowledge(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_acknowledge() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into vault_acknowledgements(user_id,notice_version) values(auth.uid(),'2026-11-11') on conflict do nothing;
end; $$;


ALTER FUNCTION public.vault_acknowledge() OWNER TO postgres;

--
-- Name: vault_acknowledged(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_acknowledged(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from vault_acknowledgements where user_id=uid and notice_version='2026-11-11');
$$;


ALTER FUNCTION public.vault_acknowledged(uid uuid) OWNER TO postgres;

--
-- Name: vault_challenge_cancel(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_challenge_cancel(uid uuid, challenge uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  update vault_security_challenges set consumed_at=now() where id=challenge and user_id=uid;
$$;


ALTER FUNCTION public.vault_challenge_cancel(uid uuid, challenge uuid) OWNER TO postgres;

--
-- Name: vault_challenge_finish(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_challenge_finish(uid uuid, challenge uuid, jwt_session text, mail_hash text, otp_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare c record; s record; begin
  select * into c from vault_security_challenges where id=challenge and user_id=uid for update;
  if not found or c.action not in ('password','recover','delete') or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 or c.session_id<>jwt_session or c.email_hash<>mail_hash then return jsonb_build_object('error','INVALID_CODE'); end if;
  if not exists(select 1 from auth.sessions where id=jwt_session::uuid and user_id=uid) then return jsonb_build_object('error','ACCESS_DENIED'); end if;
  update vault_security_challenges set attempts=attempts+1 where id=challenge;
  if c.code_hash<>otp_hash then return jsonb_build_object('error','INVALID_CODE'); end if;
  select * into s from password_sessions where id=c.vault_id for update;
  if not found or not exists(select 1 from module_collections owned join collection_members cm on cm.collection_id=owned.id and cm.user_id=uid and cm.role='owner' join workspace_module_bindings b on b.collection_id=owned.id join workspaces w on w.id=b.workspace_id and w.user_id=uid and w.archived_at is null where owned.id=s.collection_id and owned.owner_id=uid) or not public.vault_acknowledged(uid) then return jsonb_build_object('error','ACCESS_DENIED'); end if;
  update vault_security_challenges set consumed_at=now() where id=challenge;
  if s.version<>c.expected_version then return jsonb_build_object('error','SHARING_CONFLICT'); end if;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid)::text,true);
  perform set_config('app.vault_admin','on',true);
  if c.action='delete' then delete from password_sessions where id=s.id;
  else
    update password_sessions set password_hash=c.payload->>'metadata' where id=s.id returning * into s;
  end if;
  insert into vault_security_events(user_id,vault_id,action) values(uid,c.vault_id,c.action);
  perform set_config('app.vault_admin','off',true);
  return jsonb_build_object('ok',true);
end; $$;


ALTER FUNCTION public.vault_challenge_finish(uid uuid, challenge uuid, jwt_session text, mail_hash text, otp_hash text) OWNER TO postgres;

--
-- Name: vault_challenge_start(uuid, uuid, uuid, text, text, text, text, integer, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_challenge_start(uid uuid, sid uuid, challenge uuid, operation text, jwt_session text, mail_hash text, otp_hash text, expected_version integer, prepared jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s record; begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,891));
  if not exists(select 1 from auth.sessions where id=jwt_session::uuid and user_id=uid) then raise exception 'ACCESS_DENIED'; end if;
  select * into s from password_sessions where id=sid for update;
  if not found or not exists(select 1 from module_collections owned join collection_members cm on cm.collection_id=owned.id and cm.user_id=uid and cm.role='owner' join workspace_module_bindings b on b.collection_id=owned.id join workspaces w on w.id=b.workspace_id and w.user_id=uid and w.archived_at is null where owned.id=s.collection_id and owned.owner_id=uid) or not public.vault_acknowledged(uid) then raise exception 'ACCESS_DENIED'; end if;
  if s.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  if operation not in ('password','recover','delete') or length(jwt_session)>100 or jwt_session='' or length(otp_hash)<>64 or length(mail_hash)<>64 or pg_column_size(prepared)>20000 then raise exception 'VAULT_INVALID_DATA'; end if;
  if operation<>'delete' and (not public.vault_metadata_valid(prepared->>'metadata') or (prepared->>'metadata')::jsonb->>'format'<>'todo-vault-v2') then raise exception 'VAULT_INVALID_DATA'; end if;
  if operation in ('password','recover') and (not public.vault_metadata_valid(s.password_hash) or s.password_hash::jsonb->>'key_id' is distinct from (prepared->>'metadata')::jsonb->>'key_id') then raise exception 'VAULT_INVALID_DATA'; end if;
  if exists(select 1 from vault_security_challenges where user_id=uid and created_at>now()-interval '60 seconds') or (select count(*) from vault_security_challenges where user_id=uid and created_at>now()-interval '15 minutes')>=3 then raise exception 'RATE_LIMITED'; end if;
  update vault_security_challenges set consumed_at=now() where user_id=uid and consumed_at is null;
  insert into vault_security_challenges(id,user_id,vault_id,action,session_id,email_hash,code_hash,expected_version,payload) values(challenge,uid,sid,operation,jwt_session,mail_hash,otp_hash,expected_version,prepared);
  delete from vault_security_challenges where created_at<now()-interval '1 day';
end; $$;


ALTER FUNCTION public.vault_challenge_start(uid uuid, sid uuid, challenge uuid, operation text, jwt_session text, mail_hash text, otp_hash text, expected_version integer, prepared jsonb) OWNER TO postgres;

--
-- Name: vault_ciphertext_storage_valid(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_ciphertext_storage_valid(value jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  return coalesce(public.vault_envelope_valid(value)
    and length(decode(value->>'key_id','base64'))=16,false);
exception when others then return false;
end; $$;


ALTER FUNCTION public.vault_ciphertext_storage_valid(value jsonb) OWNER TO postgres;

--
-- Name: vault_cleanup(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_cleanup(batch_size integer DEFAULT 200) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare removed int; begin
  if batch_size not between 1 and 1000 then raise exception 'INVALID_INPUT'; end if;
  perform set_config('app.vault_admin','on',true);
  delete from secure_notes where id in (select id from secure_notes where deleted_at<now()-interval '30 days' order by deleted_at limit batch_size for update skip locked);
  get diagnostics removed=row_count;
  delete from vault_security_challenges where created_at<now()-interval '1 day';
  delete from vault_security_events where created_at<now()-interval '180 days';
  perform set_config('app.vault_admin','off',true);
  return removed;
end; $$;


ALTER FUNCTION public.vault_cleanup(batch_size integer) OWNER TO postgres;

--
-- Name: vault_collection_ready(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_collection_ready(cid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select not exists(select 1 from password_sessions where collection_id=cid and not public.vault_metadata_valid(password_hash))
    and not exists(select 1 from secure_notes where collection_id=cid and encrypted_payload is null);
$$;


ALTER FUNCTION public.vault_collection_ready(cid uuid) OWNER TO postgres;

--
-- Name: vault_envelope_valid(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_envelope_valid(e jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if pg_column_size(e)>1400000 then return false; end if;
  return coalesce((e->>'v')::int=1 and length(decode(e->>'iv','base64'))=12 and length(decode(e->>'ciphertext','base64')) between 16 and 1000000,false);
exception when others then return false; end; $$;


ALTER FUNCTION public.vault_envelope_valid(e jsonb) OWNER TO postgres;

--
-- Name: vault_import(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_import(wid uuid, new_name text, metadata text, notes jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid; sid uuid; n jsonb; begin
  select collection_id into cid from workspace_module_bindings where workspace_id=wid and module='secure';
  if not public.collection_owner(cid) or not public.collection_write(cid) or not public.vault_acknowledged(auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  if not public.vault_metadata_valid(metadata) or metadata::jsonb->>'format'<>'todo-vault-v2' or length(trim(new_name)) not between 1 and 100 or jsonb_typeof(notes)<>'array' or jsonb_array_length(notes)>10000 or pg_column_size(notes)>10000000 then raise exception 'VAULT_INVALID_DATA'; end if;
  -- The caller selects fresh UUIDs before binding the ciphertext to those IDs.
  sid:=(notes->0->>'session_id')::uuid;
  if sid is null then sid:=gen_random_uuid(); end if;
  insert into password_sessions(id,workspace_id,collection_id,created_by,name,password_hash) values(sid,wid,cid,auth.uid(),trim(new_name),metadata);
  for n in select value from jsonb_array_elements(notes) loop
    if (n->>'session_id')::uuid<>sid then raise exception 'VAULT_INVALID_DATA'; end if;
    insert into secure_notes(id,workspace_id,collection_id,created_by,session_id,title,type,encrypted_payload) values((n->>'id')::uuid,wid,cid,auth.uid(),sid,'Encrypted note','secret',n->'encrypted_payload');
  end loop;
  return sid;
end; $$;


ALTER FUNCTION public.vault_import(wid uuid, new_name text, metadata text, notes jsonb) OWNER TO postgres;

--
-- Name: vault_metadata_valid(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_metadata_valid(value text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare m jsonb; begin
  if length(value)>8192 then return false; end if;
  m:=value::jsonb;
  if m->>'format'='todo-vault-v1' then
    return coalesce((m->>'iterations')::int between 310000 and 2000000 and length(decode(m->>'salt','base64'))=16 and public.vault_envelope_valid(m->'verifier'),false);
  end if;
  return coalesce(m->>'format'='todo-vault-v2' and length(decode(m->>'key_id','base64'))=16
    and (m->'kdf'->>'iterations')::int between 600000 and 2000000 and length(decode(m->'kdf'->>'salt','base64'))=16
    and public.vault_envelope_valid(m->'password') and public.vault_envelope_valid(m->'recovery'->'wrapped')
    and length(decode(m->'recovery'->>'salt','base64'))=16,false);
exception when others then return false; end; $$;


ALTER FUNCTION public.vault_metadata_valid(value text) OWNER TO postgres;

--
-- Name: vault_record_action(uuid, integer, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_record_action(nid uuid, expected_version integer, operation text, hid uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare n record; sid uuid; payload jsonb; begin
  select session_id into sid from secure_notes where id=nid;
  perform 1 from password_sessions where id=sid for update;
  select * into n from secure_notes where id=nid for update;
  if not found or not public.collection_write(n.collection_id) or not public.vault_acknowledged(auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
  if n.version<>expected_version then raise exception 'SHARING_CONFLICT'; end if;
  perform set_config('app.vault_record','on',true);
  if operation='trash' then update secure_notes set deleted_at=now() where id=nid;
  elsif operation='restore' and n.deleted_at>now()-interval '30 days' then update secure_notes set deleted_at=null where id=nid;
  elsif operation='history' and n.deleted_at is null then
    select encrypted_payload into payload from vault_note_history where id=hid and note_id=nid;
    if payload is null then raise exception 'VAULT_INVALID_DATA'; end if;
    update secure_notes set encrypted_payload=payload where id=nid;
  else raise exception 'VAULT_INVALID_DATA'; end if;
  perform set_config('app.vault_record','off',true);
end; $$;


ALTER FUNCTION public.vault_record_action(nid uuid, expected_version integer, operation text, hid uuid) OWNER TO postgres;

--
-- Name: vault_security_budget(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_security_budget(uid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare allowed boolean; begin
  insert into vault_security_budgets(user_id,requests) values(uid,1) on conflict(user_id) do update set
    requests=case when vault_security_budgets.started_at<now()-interval '1 minute' then 1 else vault_security_budgets.requests+1 end,
    started_at=case when vault_security_budgets.started_at<now()-interval '1 minute' then now() else vault_security_budgets.started_at end returning requests<=30 into allowed;
  return allowed;
end; $$;


ALTER FUNCTION public.vault_security_budget(uid uuid) OWNER TO postgres;

--
-- Name: vault_v2_storage_valid(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.vault_v2_storage_valid(value text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if not public.vault_metadata_valid(value) then return false; end if;
  return coalesce(value::jsonb->>'format'='todo-vault-v2',false);
exception when others then return false;
end; $$;


ALTER FUNCTION public.vault_v2_storage_valid(value text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: work_blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    task_id uuid,
    title text DEFAULT ''::text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    subtask_ids text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT work_blocks_check CHECK ((isfinite(starts_at) AND isfinite(ends_at) AND (ends_at > starts_at) AND (ends_at <= (starts_at + '7 days'::interval)))),
    CONSTRAINT work_blocks_check1 CHECK (((task_id IS NOT NULL) OR (length(btrim(title)) > 0))),
    CONSTRAINT work_blocks_title_check CHECK ((length(title) <= 180))
);


ALTER TABLE public.work_blocks OWNER TO postgres;

--
-- Name: work_block_data(public.work_blocks); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.work_block_data(b public.work_blocks) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select to_jsonb(b)||jsonb_build_object('task_title',t.title,'task_status',case when cardinality(b.subtask_ids)>0 and exists(select 1 from jsonb_array_elements(coalesce(t.checklist,'[]'::jsonb)) c where c->>'id'=any(b.subtask_ids)) then
  case when not exists(select 1 from jsonb_array_elements(t.checklist) c where c->>'id'=any(b.subtask_ids) and not (c->>'done')::boolean) then 'done' else 'todo' end else t.status end,'project_id',t.project_id,
  'subtask_titles',coalesce((select jsonb_agg(c->>'title' order by n) from jsonb_array_elements(coalesce(t.checklist,'[]'::jsonb)) with ordinality as items(c,n) where c->>'id'=any(b.subtask_ids)),'[]'::jsonb))
 from (select 1) dummy left join work_tasks t on t.id=b.task_id and t.workspace_id=b.workspace_id and t.user_id=b.user_id
$$;


ALTER FUNCTION public.work_block_data(b public.work_blocks) OWNER TO postgres;

--
-- Name: work_calendar(uuid, timestamp with time zone, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.work_calendar(wid uuid, range_start timestamp with time zone, range_end timestamp with time zone, selected_project uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if range_start is null or range_end is null or not isfinite(range_start) or not isfinite(range_end) or range_end<=range_start or range_end>range_start+interval '63 days' then raise exception 'INVALID_WORK_RANGE';end if;
 return jsonb_build_object('blocks',coalesce((select jsonb_agg(public.work_block_data(b) order by b.starts_at,b.id)
  from work_blocks b left join work_tasks t on t.id=b.task_id and t.workspace_id=b.workspace_id
  where b.workspace_id=wid and b.user_id=auth.uid() and b.deleted_at is null and (b.task_id is null or t.deleted_at is null)
   and b.starts_at<range_end and b.ends_at>range_start and (selected_project is null or t.project_id=selected_project or (selected_project='00000000-0000-0000-0000-000000000000'::uuid and t.project_id is null))),'[]'),
  'deadlines',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'due_on',due_on,'status',status)) from work_tasks
   where workspace_id=wid and user_id=auth.uid() and deleted_at is null and due_on>=range_start::date and due_on<=range_end::date and (selected_project is null or project_id=selected_project or (selected_project='00000000-0000-0000-0000-000000000000'::uuid and project_id is null))),'[]'));
end $$;


ALTER FUNCTION public.work_calendar(wid uuid, range_start timestamp with time zone, range_end timestamp with time zone, selected_project uuid) OWNER TO postgres;

--
-- Name: work_load(uuid, uuid, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.work_load(wid uuid, selected_project uuid DEFAULT NULL::uuid, after_created timestamp with time zone DEFAULT NULL::timestamp with time zone, after_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare answer jsonb;
begin
 if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if (after_created is null)<>(after_id is null) then raise exception 'INVALID_WORK_CURSOR';end if;
 with filtered as materialized(select t.* from work_tasks t where t.workspace_id=wid and t.user_id=auth.uid() and t.deleted_at is null and (selected_project is null or t.project_id=selected_project or (selected_project='00000000-0000-0000-0000-000000000000'::uuid and t.project_id is null))),
 page as(select * from filtered where after_created is null or (created_at,id)<(after_created,after_id) order by created_at desc,id desc limit 101),
 shown as(select * from page order by created_at desc,id desc limit 100)
 select jsonb_build_object('projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.archived,p.created_at) from work_projects p where p.workspace_id=wid and p.user_id=auth.uid()),'[]'),
  'tasks',jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('scheduled_blocks',coalesce((select jsonb_agg(public.work_block_data(b) order by b.starts_at,b.id) from work_blocks b where b.task_id=s.id and b.workspace_id=wid and b.user_id=auth.uid() and b.deleted_at is null),'[]'::jsonb)) order by created_at desc,id desc) from shown s),'[]'),
  'total',(select count(*) from filtered),'counts',(select jsonb_build_object('todo',count(*) filter(where status='todo'),'doing',count(*) filter(where status='doing'),'done',count(*) filter(where status='done')) from filtered),
  'has_more',(select count(*)>100 from page),'cursor',(select jsonb_build_object('id',id,'created_at',created_at) from shown order by created_at,id limit 1))) into answer;
 return answer;
end $$;


ALTER FUNCTION public.work_load(wid uuid, selected_project uuid, after_created timestamp with time zone, after_id uuid) OWNER TO postgres;

--
-- Name: work_mutate(uuid, text, text, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.work_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare uid uuid:=auth.uid(); t text; old_row jsonb; changes jsonb; answer jsonb; pid uuid; tid uuid; item jsonb; steps text[];
begin
 if uid is null then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 -- A workspace lock serializes archive/delete and related project/task mutations.
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if not found then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 t:=case entity when 'project' then 'work_projects' when 'task' then 'work_tasks' when 'block' then 'work_blocks' end;
 if t is null or rid is null or operation is null or operation not in ('create','update','move','restore','purge') or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'INVALID_WORK_INPUT';end if;
 if entity='project' and operation not in ('create','update') then raise exception 'INVALID_WORK_INPUT';end if;
 if exists(select 1 from jsonb_object_keys(payload) k where k<>all(case entity
  when 'project' then array['name','archived'] when 'task' then array['title','description','status','priority','project_id','due_on','estimate_minutes','checklist']
  else array['task_id','title','starts_at','ends_at','timezone','subtask_ids'] end)) then raise exception 'INVALID_WORK_INPUT';end if;
 execute format('select to_jsonb(r) from public.%I r where id=$1 for update',t) into old_row using rid;
 if old_row is not null and (old_row->>'workspace_id'<>wid::text or old_row->>'user_id'<>uid::text) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if operation='create' and old_row is not null then
  if old_row->>'deleted_at' is not null then raise exception 'WORK_CONFLICT';end if;
  return old_row; -- Retrying the same create UUID never duplicates the record.
 elsif operation<>'create' then
  if old_row is null then raise exception 'WORK_UNAVAILABLE';end if;
  if expected_version is null or expected_version<>(old_row->>'version')::integer then raise exception 'WORK_CONFLICT';end if;
 end if;
 if operation in ('move','restore','purge') then
  if operation='move' and old_row->>'deleted_at' is not null then raise exception 'WORK_CONFLICT';end if;
  if operation<>'move' and old_row->>'deleted_at' is null then raise exception 'WORK_CONFLICT';end if;
  if operation='restore' and (old_row->>'deleted_at')::timestamptz<=clock_timestamp()-interval '30 days' then raise exception 'TRASH_EXPIRED';end if;
  if operation='purge' then
   execute format('delete from public.%I where id=$1',t) using rid;
   return old_row;
  end if;
  execute format('update public.%I set deleted_at=$2,version=version+1 where id=$1 returning to_jsonb(%I.*)',t,t) into answer
   using rid,case when operation='move' then clock_timestamp() else null::timestamptz end;
  return answer;
 end if;
 if old_row->>'deleted_at' is not null then raise exception 'WORK_UNAVAILABLE';end if;
 changes:=coalesce(old_row,'{}'::jsonb)||payload;
 if entity='project' then
  if coalesce(length(btrim(changes->>'name')),0) not between 1 and 100 then raise exception 'INVALID_WORK_INPUT';end if;
  if operation='create' then
   insert into work_projects(id,workspace_id,user_id,name) values(rid,wid,uid,btrim(changes->>'name')) returning to_jsonb(work_projects.*) into answer;
  else
   update work_projects set name=btrim(changes->>'name'),archived=coalesce((changes->>'archived')::boolean,false),version=version+1 where id=rid returning to_jsonb(work_projects.*) into answer;
  end if;
 elsif entity='task' then
  pid:=nullif(changes->>'project_id','')::uuid;
  if pid is not null then
   if not exists(select 1 from work_projects where id=pid and workspace_id=wid and user_id=uid) then raise exception 'INVALID_WORK_PROJECT';end if;
   if (operation='create' or pid::text is distinct from old_row->>'project_id') and exists(select 1 from work_projects where id=pid and archived) then raise exception 'WORK_PROJECT_ARCHIVED';end if;
  end if;
  changes:=jsonb_build_object('description','','status','todo','priority','none','estimate_minutes',30,'checklist','[]'::jsonb)||changes;
  if coalesce(length(btrim(changes->>'title')),0) not between 1 and 180 or changes->>'description' is null or length(changes->>'description')>20000
   or changes->>'status' is null or changes->>'priority' is null or changes->>'estimate_minutes' is null
   or changes->'checklist' is null or jsonb_typeof(changes->'checklist')<>'array' or jsonb_array_length(changes->'checklist')>50 then raise exception 'INVALID_WORK_INPUT';end if;
  for item in select value from jsonb_array_elements(changes->'checklist') loop
   if jsonb_typeof(item)<>'object' or coalesce(length(item->>'id'),0) not between 1 and 80 or coalesce(length(btrim(item->>'title')),0) not between 1 and 180
    or jsonb_typeof(item->'done') is distinct from 'boolean' or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','title','done')) then raise exception 'INVALID_WORK_CHECKLIST';end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(changes->'checklist'))<>jsonb_array_length(changes->'checklist') then raise exception 'INVALID_WORK_CHECKLIST';end if;
  if operation='create' then
   insert into work_tasks(id,workspace_id,user_id,title,description,status,priority,project_id,due_on,estimate_minutes,checklist)
   values(rid,wid,uid,btrim(changes->>'title'),changes->>'description',changes->>'status',changes->>'priority',pid,nullif(changes->>'due_on','')::date,(changes->>'estimate_minutes')::integer,changes->'checklist') returning to_jsonb(work_tasks.*) into answer;
  else
   update work_tasks set title=btrim(changes->>'title'),description=changes->>'description',status=changes->>'status',priority=changes->>'priority',project_id=pid,
    due_on=nullif(changes->>'due_on','')::date,estimate_minutes=(changes->>'estimate_minutes')::integer,checklist=changes->'checklist',version=version+1,updated_at=clock_timestamp()
   where id=rid returning to_jsonb(work_tasks.*) into answer;
  end if;
 else
  tid:=nullif(changes->>'task_id','')::uuid;
  if tid is not null and not exists(select 1 from work_tasks where id=tid and workspace_id=wid and user_id=uid and deleted_at is null) then raise exception 'INVALID_WORK_TASK';end if;
  if jsonb_typeof(coalesce(changes->'subtask_ids','[]'::jsonb))<>'array' then raise exception 'INVALID_WORK_SUBTASK';end if;
  select coalesce(array_agg(value #>> '{}'),'{}'::text[]) into steps from jsonb_array_elements(coalesce(changes->'subtask_ids','[]'::jsonb));
  -- A deleted checklist item must not prevent moving an existing calendar slot.
  if not (payload ? 'subtask_ids') then
   steps:=array(select x from unnest(steps) x where exists(select 1 from work_tasks t,jsonb_array_elements(t.checklist) c where t.id=tid and t.workspace_id=wid and t.user_id=uid and c->>'id'=x));
  end if;
  if cardinality(steps)>50 or (select count(distinct x) from unnest(steps) x)<>cardinality(steps)
   or (tid is null and cardinality(steps)>0) or exists(select 1 from unnest(steps) x where not exists(
    select 1 from work_tasks t,jsonb_array_elements(t.checklist) c where t.id=tid and t.workspace_id=wid and t.user_id=uid and c->>'id'=x)) then raise exception 'INVALID_WORK_SUBTASK';end if;
  if not exists(select 1 from pg_timezone_names where name=coalesce(changes->>'timezone','UTC')) then raise exception 'INVALID_WORK_TIMEZONE';end if;
  if changes->>'starts_at' is null or changes->>'ends_at' is null or (tid is null and coalesce(length(btrim(changes->>'title')),0) not between 1 and 180) then raise exception 'INVALID_WORK_INPUT';end if;
  if operation='create' then
   insert into work_blocks(id,workspace_id,user_id,task_id,title,starts_at,ends_at,timezone,subtask_ids)
   values(rid,wid,uid,tid,coalesce(btrim(changes->>'title'),''),(changes->>'starts_at')::timestamptz,(changes->>'ends_at')::timestamptz,coalesce(changes->>'timezone','UTC'),steps) returning to_jsonb(work_blocks.*) into answer;
  else
   update work_blocks set task_id=tid,title=coalesce(btrim(changes->>'title'),''),starts_at=(changes->>'starts_at')::timestamptz,ends_at=(changes->>'ends_at')::timestamptz,
    timezone=coalesce(changes->>'timezone','UTC'),subtask_ids=steps,version=version+1 where id=rid returning to_jsonb(work_blocks.*) into answer;
  end if;
 end if;
 return answer;
exception when invalid_text_representation or datetime_field_overflow or check_violation or not_null_violation then
 raise exception 'INVALID_WORK_INPUT';
end $_$;


ALTER FUNCTION public.work_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) OWNER TO postgres;

--
-- Name: work_project_delete(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.work_project_delete(wid uuid, pid uuid, expected_version integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
 perform 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null for update;
 if not found then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 perform 1 from work_projects where id=pid and workspace_id=wid and user_id=auth.uid() and version=expected_version for update;
 if not found then raise exception 'WORK_CONFLICT';end if;
 update work_tasks set project_id=null,version=version+1,updated_at=clock_timestamp() where project_id=pid and workspace_id=wid and user_id=auth.uid();
 delete from work_projects where id=pid and workspace_id=wid and user_id=auth.uid();
 return true;
end $$;


ALTER FUNCTION public.work_project_delete(wid uuid, pid uuid, expected_version integer) OWNER TO postgres;

--
-- Name: work_save_details(uuid, uuid, jsonb, integer, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.work_save_details(wid uuid, tid uuid, task_payload jsonb, task_version integer, time_changes jsonb, time_removals jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare uid uuid:=auth.uid(); item jsonb; old_block work_blocks; answer jsonb; result jsonb; bid uuid; seen uuid[]:='{}';
begin
 perform 1 from workspaces where id=wid and user_id=uid and archived_at is null for update;
 if not found then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
 if jsonb_typeof(time_changes) is distinct from 'array' or jsonb_typeof(time_removals) is distinct from 'array'
  or jsonb_array_length(time_changes)>100 or jsonb_array_length(time_removals)>100 then raise exception 'INVALID_WORK_INPUT';end if;
 if tid is null and task_payload is not null then raise exception 'INVALID_WORK_TASK';end if;
 if tid is not null then
  if task_payload is null then raise exception 'INVALID_WORK_TASK';end if;
  answer:=work_mutate(wid,'task',case when task_version is null then 'create' else 'update' end,tid,task_payload,task_version);
 end if;
 for item in select value from jsonb_array_elements(time_removals) loop
  bid:=(item->>'id')::uuid;
  if bid=any(seen) then raise exception 'INVALID_WORK_INPUT';end if;seen:=array_append(seen,bid);
  select * into old_block from work_blocks where id=bid and workspace_id=wid and user_id=uid and deleted_at is null for update;
  if not found or old_block.task_id is distinct from tid then raise exception 'WORK_CONFLICT';end if;
  perform work_mutate(wid,'block','move',bid,'{}'::jsonb,(item->>'version')::integer);
 end loop;
 for item in select value from jsonb_array_elements(time_changes) loop
  bid:=(item->>'id')::uuid;
  if bid=any(seen) then raise exception 'INVALID_WORK_INPUT';end if;seen:=array_append(seen,bid);
  select * into old_block from work_blocks where id=bid for update;
  if found and (old_block.workspace_id<>wid or old_block.user_id<>uid or old_block.task_id is distinct from tid) then raise exception 'WORK_ACCESS_DENIED' using errcode='42501';end if;
  result:=work_mutate(wid,'block',case when item->>'version' is null then 'create' else 'update' end,bid,
   (item-'id'-'version')||jsonb_build_object('task_id',tid),(item->>'version')::integer);
 end loop;
 return jsonb_build_object('task',case when tid is null then null else work_task(wid,tid) end,
  'blocks',coalesce((select jsonb_agg(work_block_data(b) order by b.starts_at,b.id) from work_blocks b where b.workspace_id=wid and b.user_id=uid and b.deleted_at is null and ((tid is not null and b.task_id=tid) or (tid is null and b.id=any(seen)))),'[]'::jsonb));
exception when invalid_text_representation or check_violation or not_null_violation then raise exception 'INVALID_WORK_INPUT';
end $$;


ALTER FUNCTION public.work_save_details(wid uuid, tid uuid, task_payload jsonb, task_version integer, time_changes jsonb, time_removals jsonb) OWNER TO postgres;

--
-- Name: work_task(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.work_task(wid uuid, tid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select to_jsonb(t)||jsonb_build_object('scheduled_blocks',coalesce((select jsonb_agg(public.work_block_data(b) order by b.starts_at,b.id) from work_blocks b where b.task_id=t.id and b.workspace_id=wid and b.user_id=auth.uid() and b.deleted_at is null),'[]'::jsonb)) from work_tasks t join workspaces w on w.id=t.workspace_id
 where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and t.user_id=auth.uid() and t.id=tid and t.deleted_at is null
$$;


ALTER FUNCTION public.work_task(wid uuid, tid uuid) OWNER TO postgres;

--
-- Name: workout_library_exercises; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workout_library_exercises (
    id uuid NOT NULL,
    collection_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    created_by uuid NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    muscle_group text NOT NULL,
    equipment text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_at timestamp with time zone,
    CONSTRAINT workout_library_exercises_equipment_check CHECK ((equipment = ANY (ARRAY['body only'::text, 'dumbbell'::text, 'barbell'::text, 'cable'::text, 'machine'::text, 'kettlebells'::text, 'bands'::text, 'medicine ball'::text, 'exercise ball'::text, 'foam roll'::text, 'e-z curl bar'::text, 'other'::text]))),
    CONSTRAINT workout_library_exercises_image_url_check CHECK (((length(image_url) >= 1) AND (length(image_url) <= 2048) AND (image_url ~ '^https?://[^[:space:]<>]+$'::text) AND (image_url !~ '^https?://[^/?#]*@'::text))),
    CONSTRAINT workout_library_exercises_muscle_group_check CHECK ((muscle_group = ANY (ARRAY['chest'::text, 'back'::text, 'legs'::text, 'shoulders'::text, 'arms'::text, 'core'::text, 'cardio'::text]))),
    CONSTRAINT workout_library_exercises_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 160)))
);


ALTER TABLE public.workout_library_exercises OWNER TO postgres;

--
-- Name: workout_library_catalog_item(public.workout_library_exercises); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workout_library_catalog_item(item public.workout_library_exercises) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object('id','custom:'||item.id::text,'name',item.name,'equipment',item.equipment,
  'primaryMuscles','[]'::jsonb,'group',item.muscle_group,'category',case when item.muscle_group='cardio' then 'cardio' else 'strength' end,
  'images',jsonb_build_array(item.image_url),'source','custom')
$$;


ALTER FUNCTION public.workout_library_catalog_item(item public.workout_library_exercises) OWNER TO postgres;

--
-- Name: workout_library_collection(uuid, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workout_library_collection(wid uuid, writing boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION public.workout_library_collection(wid uuid, writing boolean) OWNER TO postgres;

--
-- Name: workout_library_load(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workout_library_load(wid uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid:=workout_library_collection(wid);answer jsonb;
begin
 select coalesce(jsonb_agg(workout_library_catalog_item(e) order by e.created_at desc,e.id),'[]') into answer
 from workout_library_exercises e where e.collection_id=cid and e.removed_at is null;
 return answer;
end $$;


ALTER FUNCTION public.workout_library_load(wid uuid) OWNER TO postgres;

--
-- Name: workout_library_remove(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workout_library_remove(wid uuid, rid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare cid uuid:=workout_library_collection(wid,true);
begin
 if rid is null or not exists(select 1 from workout_library_exercises e where e.id=rid and e.collection_id=cid) then
  raise exception 'WORKOUT_LIBRARY_UNAVAILABLE';
 end if;
 update workout_library_exercises e set removed_at=clock_timestamp() where e.id=rid and e.collection_id=cid and e.removed_at is null;
 return jsonb_build_object('id','custom:'||rid::text,'removed',true);
end $$;


ALTER FUNCTION public.workout_library_remove(wid uuid, rid uuid) OWNER TO postgres;

--
-- Name: workout_library_save(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workout_library_save(wid uuid, request_id uuid, input jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
 if result.removed_at is not null then raise exception 'WORKOUT_LIBRARY_REMOVED';end if;
 if result.id is null or result.name<>n or result.image_url<>url or result.muscle_group<>g or result.equipment<>eq then raise exception 'WORKOUT_LIBRARY_CONFLICT';end if;
 return workout_library_catalog_item(result);
end $_$;


ALTER FUNCTION public.workout_library_save(wid uuid, request_id uuid, input jsonb) OWNER TO postgres;

--
-- Name: workspace_search_context(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workspace_search_context(wid uuid, query_text text DEFAULT ''::text, counts_only boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result jsonb; needle text:=public.workspace_search_normalize(query_text);
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if length(coalesce(query_text,''))>120 then raise exception 'INVALID_SEARCH'; end if;
  with docs as materialized (select * from public.workspace_search_documents(wid)),
  counts as (select module,count(*) filter(where child_id is null) as records,count(*) filter(where child_id is not null) as children from docs group by module),
  matches as (
    select d.*,row_number() over(partition by module order by created_at desc,record_id,child_id nulls first) as n
    from docs d where not counts_only and (needle='' or strpos(public.workspace_search_normalize(concat_ws(' ',title,body)),needle)>0)
  ), sample as (select * from matches where n<=12 order by n,module limit 120)
  select jsonb_build_object('counts',coalesce((select jsonb_agg(to_jsonb(c) order by module) from counts c),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('module',module,'record_id',record_id,'child_id',child_id,'title',left(title,180),'preview',left(body,800),'meta',meta) order by n,module) from sample),'[]'::jsonb),
    'matched', (select count(*) from matches), 'sampled', (select count(*) from sample)) into result;
  return result;
end; $$;


ALTER FUNCTION public.workspace_search_context(wid uuid, query_text text, counts_only boolean) OWNER TO postgres;

--
-- Name: workspace_search_documents(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workspace_search_documents(wid uuid) RETURNS TABLE(module text, record_id uuid, child_id text, title text, body text, meta jsonb, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
    union all select 'plans',r.id,null,left(r.content,100),r.content,jsonb_build_object('period','timeless','source','quick'),r.created_at from public.quick_notes r join bound b on b.module='quick' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'plans',r.id,null,r.title,r.reason,jsonb_build_object('period',r.period,'date',r.period_date),r.created_at from public.plans r join bound b on b.module='plans' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'code',r.id,null,r.title,'','{}',r.created_at from public.code_snippets r join bound b on b.module='code' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'periodic',r.id,null,r.title,r.notes,'{}',r.created_at from public.periodic_tasks r join bound b on b.module='periodic' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'activities',r.id,null,r.title,concat_ws(' ',r.subtitle,r.notes),'{}',r.created_at from public.activity_items r join bound b on b.module='activities' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'learning',r.id,null,r.title,'','{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'learning',r.id,x->>'id',concat_ws(' · ',r.title,x->>'title'),'', '{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.topics) x
    union all select 'flashcards',r.id,null,r.title,'','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'flashcards',r.id,x->>'id',concat_ws(' · ',r.title,x->>'front'),x->>'back','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.cards) x
    union all select 'workout',r.id,null,r.title,'','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id and r.deleted_at is null
    union all select 'workout',r.id,x->>'id',concat_ws(' · ',r.title,x->>'name'),x->>'notes','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id and r.deleted_at is null cross join lateral jsonb_array_elements(r.exercises) x
    union all select 'tasks',r.id,null,r.title,r.description,'{}',r.created_at from public.work_tasks r join public.workspaces w on w.id=r.workspace_id
     where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and r.user_id=auth.uid() and r.deleted_at is null and 'tasks'=any(w.active_modules)
  ) select d.module,d.record_id,d.child_id,public.workspace_search_text(d.title),public.workspace_search_text(d.body),d.meta,d.created_at from docs d
$$;


ALTER FUNCTION public.workspace_search_documents(wid uuid) OWNER TO postgres;

--
-- Name: workspace_search_normalize(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workspace_search_normalize(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select trim(regexp_replace(lower(translate(coalesce(value,''), 'İIıÇçĞğÖöŞşÜü', 'iiiCcGgOoSsUu')), '\s+', ' ', 'g'))
$$;


ALTER FUNCTION public.workspace_search_normalize(value text) OWNER TO postgres;

--
-- Name: workspace_search_text(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.workspace_search_text(value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(value,''),
    '<(script|style)[^>]*>.*?</\1>', ' ', 'gis'), '<[^>]*>', ' ', 'g'),
    '&(nbsp|amp|lt|gt|quot|#39);', ' ', 'gi'),
    '(password|passwd|parola|şifre|sifre|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|authorization)\s*[:=][^\n\r<]*', '[gizli alan]', 'gi'))
$$;


ALTER FUNCTION public.workspace_search_text(value text) OWNER TO postgres;

--
-- Name: api_budgets; Type: TABLE; Schema: private; Owner: postgres
--

CREATE TABLE private.api_budgets (
    user_id uuid NOT NULL,
    bucket text NOT NULL,
    seconds integer NOT NULL,
    window_id bigint NOT NULL,
    used integer NOT NULL,
    CONSTRAINT api_budgets_used_check CHECK ((used > 0))
);


ALTER TABLE private.api_budgets OWNER TO postgres;

--
-- Name: background_dispatch_config; Type: TABLE; Schema: private; Owner: postgres
--

CREATE TABLE private.background_dispatch_config (
    singleton boolean DEFAULT true NOT NULL,
    endpoint text NOT NULL,
    CONSTRAINT background_dispatch_config_endpoint_check CHECK ((endpoint ~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/scheduled-maintenance$'::text)),
    CONSTRAINT background_dispatch_config_singleton_check CHECK (singleton)
);


ALTER TABLE private.background_dispatch_config OWNER TO postgres;

--
-- Name: client_error_counts; Type: TABLE; Schema: private; Owner: postgres
--

CREATE TABLE private.client_error_counts (
    bucket timestamp with time zone NOT NULL,
    code text NOT NULL,
    screen text NOT NULL,
    release text NOT NULL,
    occurrences bigint DEFAULT 1 NOT NULL,
    CONSTRAINT client_error_counts_code_check CHECK ((code = ANY (ARRAY['UI_RENDER_ERROR'::text, 'SCRIPT_ERROR'::text, 'UNHANDLED_PROMISE'::text]))),
    CONSTRAINT client_error_counts_release_check CHECK ((release ~ '^[a-zA-Z0-9._-]{1,64}$'::text)),
    CONSTRAINT client_error_counts_screen_check CHECK ((screen = ANY (ARRAY['workspace'::text, 'settings'::text, 'analytics'::text, 'auth'::text, 'unknown'::text])))
);


ALTER TABLE private.client_error_counts OWNER TO postgres;

--
-- Name: maintenance_tickets; Type: TABLE; Schema: private; Owner: postgres
--

CREATE TABLE private.maintenance_tickets (
    id uuid NOT NULL,
    issued_at timestamp with time zone NOT NULL
);


ALTER TABLE private.maintenance_tickets OWNER TO postgres;

--
-- Name: activity_collection_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_collection_items (
    group_id uuid NOT NULL,
    item_id uuid NOT NULL,
    collection_id uuid NOT NULL
);


ALTER TABLE public.activity_collection_items OWNER TO postgres;

--
-- Name: activity_collections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_collections (
    id uuid NOT NULL,
    collection_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#64748B'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT activity_collections_color_check CHECK ((color ~ '^#[0-9A-Fa-f]{6}$'::text)),
    CONSTRAINT activity_collections_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);


ALTER TABLE public.activity_collections OWNER TO postgres;

--
-- Name: activity_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    subtitle text,
    image_url text,
    external_id text,
    external_source text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'want'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT activity_items_status_check CHECK ((status = ANY (ARRAY['want'::text, 'done'::text]))),
    CONSTRAINT activity_items_type_check CHECK ((type = ANY (ARRAY['movie'::text, 'series'::text, 'place'::text, 'book'::text])))
);


ALTER TABLE public.activity_items OWNER TO postgres;

--
-- Name: analytics_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_config (
    id boolean DEFAULT true NOT NULL,
    recording_started_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT analytics_config_id_check CHECK (id)
);


ALTER TABLE public.analytics_config OWNER TO postgres;

--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_events (
    id bigint NOT NULL,
    collection_id uuid NOT NULL,
    record_id uuid NOT NULL,
    module text NOT NULL,
    kind text NOT NULL,
    actor_id uuid,
    completed boolean NOT NULL,
    item_created_at timestamp with time zone NOT NULL,
    period text,
    carry_count integer DEFAULT 0 NOT NULL,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    is_import_baseline boolean DEFAULT true NOT NULL,
    CONSTRAINT analytics_events_kind_check CHECK ((kind = ANY (ARRAY['baseline'::text, 'created'::text, 'completed'::text, 'reopened'::text, 'deleted'::text, 'deferred'::text, 'rollover'::text]))),
    CONSTRAINT analytics_events_module_check CHECK ((module = ANY (ARRAY['quick'::text, 'detailed'::text, 'plans'::text, 'pomodoro'::text])))
);


ALTER TABLE public.analytics_events OWNER TO postgres;

--
-- Name: analytics_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.analytics_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: analytics_focus_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_focus_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    planned_seconds integer NOT NULL,
    revision bigint NOT NULL,
    status text NOT NULL,
    segments jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    association text DEFAULT 'free'::text NOT NULL,
    task_id uuid,
    collection_id uuid,
    estimated_sessions integer,
    goal_seconds integer,
    credited_segments jsonb,
    credited_completed boolean DEFAULT false NOT NULL,
    writer_client uuid,
    writer_lease uuid,
    CONSTRAINT analytics_focus_sessions_association_check CHECK ((association = ANY (ARRAY['free'::text, 'task'::text]))),
    CONSTRAINT analytics_focus_sessions_planned_seconds_check CHECK (((planned_seconds >= 60) AND (planned_seconds <= 5400))),
    CONSTRAINT analytics_focus_sessions_revision_check CHECK ((revision > 0)),
    CONSTRAINT analytics_focus_sessions_status_check CHECK ((status = ANY (ARRAY['running'::text, 'paused'::text, 'completed'::text, 'ended'::text])))
);


ALTER TABLE public.analytics_focus_sessions OWNER TO postgres;

--
-- Name: background_run_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.background_run_status (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    succeeded boolean NOT NULL,
    emails_sent integer NOT NULL,
    emails_failed integer NOT NULL,
    mail_configured boolean NOT NULL,
    cleanup_succeeded boolean NOT NULL,
    CONSTRAINT background_run_status_emails_failed_check CHECK (((emails_failed >= 0) AND (emails_failed <= 20))),
    CONSTRAINT background_run_status_emails_sent_check CHECK (((emails_sent >= 0) AND (emails_sent <= 20)))
);


ALTER TABLE public.background_run_status OWNER TO postgres;

--
-- Name: background_run_status_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.background_run_status ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.background_run_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    name text NOT NULL,
    color text,
    icon text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: code_snippets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.code_snippets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid,
    title text NOT NULL,
    language text DEFAULT 'plaintext'::text NOT NULL,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


ALTER TABLE public.code_snippets OWNER TO postgres;

--
-- Name: collection_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.collection_activity (
    id bigint NOT NULL,
    collection_id uuid NOT NULL,
    record_id uuid,
    actor_id uuid,
    operation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.collection_activity OWNER TO postgres;

--
-- Name: collection_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.collection_activity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.collection_activity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: collection_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.collection_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    used_by uuid,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    invite_role text DEFAULT 'viewer'::text NOT NULL,
    CONSTRAINT collection_invites_invite_role_check CHECK ((invite_role = ANY (ARRAY['viewer'::text, 'editor'::text])))
);


ALTER TABLE public.collection_invites OWNER TO postgres;

--
-- Name: collection_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.collection_members (
    collection_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT collection_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])))
);


ALTER TABLE public.collection_members OWNER TO postgres;

--
-- Name: external_calendar_budgets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_calendar_budgets (
    user_id uuid NOT NULL,
    action text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    requests integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.external_calendar_budgets OWNER TO postgres;

--
-- Name: external_calendar_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    account_key text NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'connected'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_calendar_connections_provider_check CHECK ((provider = ANY (ARRAY['outlook'::text, 'google'::text]))),
    CONSTRAINT external_calendar_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'reauth'::text])))
);


ALTER TABLE public.external_calendar_connections OWNER TO postgres;

--
-- Name: external_calendar_oauth; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_calendar_oauth (
    state_hash text NOT NULL,
    user_id uuid NOT NULL,
    verifier_cipher text NOT NULL,
    return_url text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    provider text DEFAULT 'outlook'::text NOT NULL,
    CONSTRAINT external_calendar_oauth_provider_check CHECK ((provider = ANY (ARRAY['outlook'::text, 'google'::text])))
);


ALTER TABLE public.external_calendar_oauth OWNER TO postgres;

--
-- Name: external_calendar_sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_calendar_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    remote_id text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#64748B'::text NOT NULL,
    selected boolean DEFAULT false NOT NULL
);


ALTER TABLE public.external_calendar_sources OWNER TO postgres;

--
-- Name: external_calendar_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_calendar_tokens (
    connection_id uuid NOT NULL,
    access_cipher text NOT NULL,
    refresh_cipher text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    locked_until timestamp with time zone
);


ALTER TABLE public.external_calendar_tokens OWNER TO postgres;

--
-- Name: finance_budget_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_budget_limits (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    month date NOT NULL,
    scope text NOT NULL,
    amount numeric(16,2),
    CONSTRAINT finance_budget_limits_amount_check CHECK (((amount >= (0)::numeric) AND (amount <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT finance_budget_limits_month_check CHECK (((EXTRACT(day FROM month) = (1)::numeric) AND ((month >= '1900-01-01'::date) AND (month <= '2100-12-01'::date)))),
    CONSTRAINT finance_budget_limits_scope_check CHECK ((scope = ANY (ARRAY['month'::text, 'forward'::text])))
);


ALTER TABLE public.finance_budget_limits OWNER TO postgres;

--
-- Name: finance_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    budget_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_categories_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60)))
);


ALTER TABLE public.finance_categories OWNER TO postgres;

--
-- Name: finance_market_quotes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_market_quotes (
    provider text NOT NULL,
    instrument text NOT NULL,
    currency text NOT NULL,
    price numeric(20,8) NOT NULL,
    price_at timestamp with time zone NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT finance_market_quotes_currency_check CHECK ((currency = ANY (ARRAY['TRY'::text, 'USD'::text, 'EUR'::text, 'GBP'::text]))),
    CONSTRAINT finance_market_quotes_price_check CHECK (((price > (0)::numeric) AND (price <= (1000000000)::numeric))),
    CONSTRAINT finance_quote_provider CHECK ((provider = ANY (ARRAY['frankfurter'::text, 'coingecko'::text, 'market'::text])))
);


ALTER TABLE public.finance_market_quotes OWNER TO postgres;

--
-- Name: finance_positions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    kind text NOT NULL,
    instrument text DEFAULT ''::text NOT NULL,
    price_source text NOT NULL,
    quantity numeric(20,8) NOT NULL,
    buy_price numeric(20,8) NOT NULL,
    purchased_on date NOT NULL,
    manual_price numeric(20,8),
    manual_updated_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_position_instrument CHECK (((price_source = 'manual'::text) OR ((price_source = ANY (ARRAY['frankfurter'::text, 'market'::text])) AND (kind = 'forex'::text) AND (instrument = ANY (ARRAY['TRY'::text, 'USD'::text, 'EUR'::text, 'GBP'::text, 'CHF'::text, 'JPY'::text, 'CAD'::text, 'AUD'::text, 'SAR'::text]))) OR ((price_source = 'coingecko'::text) AND (kind = 'crypto'::text) AND (instrument = ANY (ARRAY['bitcoin'::text, 'ethereum'::text, 'solana'::text, 'cardano'::text, 'avalanche-2'::text, 'ripple'::text, 'dogecoin'::text, 'chainlink'::text]))) OR ((price_source = 'market'::text) AND (kind = 'metal'::text) AND (instrument = ANY (ARRAY['XAU'::text, 'XAG'::text, 'XPT'::text, 'XPD'::text, 'XAU22'::text, 'GOLD_QUARTER'::text, 'GOLD_HALF'::text, 'GOLD_FULL'::text, 'GOLD_ATA'::text]))))),
    CONSTRAINT finance_position_source CHECK ((price_source = ANY (ARRAY['manual'::text, 'frankfurter'::text, 'coingecko'::text, 'market'::text]))),
    CONSTRAINT finance_positions_buy_price_check CHECK (((buy_price > (0)::numeric) AND (buy_price <= (1000000000)::numeric))),
    CONSTRAINT finance_positions_check CHECK (((quantity * buy_price) <= ('1000000000000'::bigint)::numeric)),
    CONSTRAINT finance_positions_instrument_check CHECK ((length(instrument) <= 60)),
    CONSTRAINT finance_positions_kind_check CHECK ((kind = ANY (ARRAY['forex'::text, 'crypto'::text, 'stock'::text, 'metal'::text, 'other'::text]))),
    CONSTRAINT finance_positions_manual_price_check CHECK (((manual_price >= (0)::numeric) AND (manual_price <= (1000000000)::numeric))),
    CONSTRAINT finance_positions_purchased_on_check CHECK (((purchased_on >= '1900-01-01'::date) AND (purchased_on <= '2100-12-31'::date))),
    CONSTRAINT finance_positions_quantity_check CHECK (((quantity > (0)::numeric) AND (quantity <= (1000000000)::numeric))),
    CONSTRAINT finance_positions_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))
);


ALTER TABLE public.finance_positions OWNER TO postgres;

--
-- Name: finance_recurring; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_recurring (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    kind text NOT NULL,
    amount numeric(16,2) NOT NULL,
    cadence text NOT NULL,
    starts_on date NOT NULL,
    timezone text DEFAULT 'Europe/Istanbul'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    next_index integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category_id uuid,
    CONSTRAINT finance_recurring_amount_check CHECK (((amount > (0)::numeric) AND (amount <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT finance_recurring_cadence_check CHECK ((cadence = ANY (ARRAY['weekly'::text, 'monthly'::text, 'yearly'::text]))),
    CONSTRAINT finance_recurring_kind_check CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text]))),
    CONSTRAINT finance_recurring_next_index_check CHECK ((next_index >= 0)),
    CONSTRAINT finance_recurring_starts_on_check CHECK (((starts_on >= '1900-01-01'::date) AND (starts_on <= '2100-12-31'::date))),
    CONSTRAINT finance_recurring_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))
);


ALTER TABLE public.finance_recurring OWNER TO postgres;

--
-- Name: finance_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_settings (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    currency text DEFAULT 'TRY'::text NOT NULL,
    CONSTRAINT finance_settings_currency_check CHECK ((currency = ANY (ARRAY['TRY'::text, 'USD'::text, 'EUR'::text, 'GBP'::text])))
);


ALTER TABLE public.finance_settings OWNER TO postgres;

--
-- Name: finance_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    amount numeric(16,2) NOT NULL,
    occurred_on date NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recurring_id uuid,
    category_id uuid,
    CONSTRAINT finance_transactions_amount_check CHECK (((amount > (0)::numeric) AND (amount <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT finance_transactions_category_check CHECK (((length(btrim(category)) >= 1) AND (length(btrim(category)) <= 60))),
    CONSTRAINT finance_transactions_kind_check CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text]))),
    CONSTRAINT finance_transactions_occurred_on_check CHECK (((occurred_on >= '1900-01-01'::date) AND (occurred_on <= '2100-12-31'::date))),
    CONSTRAINT finance_transactions_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))
);


ALTER TABLE public.finance_transactions OWNER TO postgres;

--
-- Name: flashcard_decks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flashcard_decks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    color text NOT NULL,
    cards jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


ALTER TABLE public.flashcard_decks OWNER TO postgres;

--
-- Name: flashcard_decks_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flashcard_decks_items (
    parent_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    id text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.flashcard_decks_items OWNER TO postgres;

--
-- Name: focus_ownership; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.focus_ownership (
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    client_id uuid NOT NULL,
    lease uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp with time zone DEFAULT (clock_timestamp() + '00:00:45'::interval) NOT NULL,
    segment_started_at timestamp with time zone
);


ALTER TABLE public.focus_ownership OWNER TO postgres;

--
-- Name: learning_mistakes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learning_mistakes (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    topic_id text NOT NULL,
    prompt text DEFAULT ''::text NOT NULL,
    solution text DEFAULT ''::text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    image_path text,
    resolved boolean DEFAULT false NOT NULL,
    review_on date,
    attempts integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT learning_mistakes_prompt_check CHECK ((length(prompt) <= 4000)),
    CONSTRAINT learning_mistakes_reason_check CHECK ((reason = ANY (ARRAY[''::text, 'knowledge'::text, 'attention'::text, 'time'::text]))),
    CONSTRAINT learning_mistakes_solution_check CHECK ((length(solution) <= 4000)),
    CONSTRAINT learning_mistakes_source_check CHECK ((length(source) <= 300))
);


ALTER TABLE public.learning_mistakes OWNER TO postgres;

--
-- Name: learning_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learning_progress (
    user_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    topic_id text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    review_on date,
    last_reviewed_at timestamp with time zone,
    streak integer DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    note_id uuid,
    deck_id uuid,
    pomo_task_id uuid,
    CONSTRAINT learning_progress_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text])))
);


ALTER TABLE public.learning_progress OWNER TO postgres;

--
-- Name: learning_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learning_reviews (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    topic_id text NOT NULL,
    mistake_id uuid,
    correct boolean NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.learning_reviews OWNER TO postgres;

--
-- Name: learning_subjects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learning_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    color text NOT NULL,
    topics jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    "position" integer DEFAULT 0 NOT NULL,
    template_key text,
    template_revision text
);


ALTER TABLE public.learning_subjects OWNER TO postgres;

--
-- Name: learning_subjects_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.learning_subjects_items (
    parent_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    id text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.learning_subjects_items OWNER TO postgres;

--
-- Name: module_collections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.module_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module text NOT NULL,
    owner_id uuid NOT NULL,
    origin_workspace_id uuid NOT NULL,
    shared boolean DEFAULT false NOT NULL,
    epoch integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'Europe/Istanbul'::text NOT NULL,
    CONSTRAINT module_collections_module_check CHECK ((module = ANY (ARRAY['plans'::text, 'detailed'::text, 'quick'::text, 'secure'::text, 'code'::text, 'pomodoro'::text, 'learning'::text, 'flashcards'::text, 'workout'::text, 'periodic'::text, 'activities'::text])))
);


ALTER TABLE public.module_collections OWNER TO postgres;

--
-- Name: password_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    name text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT vault_v2_metadata_required CHECK (public.vault_v2_storage_valid(password_hash))
);


ALTER TABLE public.password_sessions OWNER TO postgres;

--
-- Name: periodic_email_deliveries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.periodic_email_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    task_id uuid NOT NULL,
    delivery_day date NOT NULL,
    payload jsonb,
    attempts integer DEFAULT 1 NOT NULL,
    lease uuid DEFAULT gen_random_uuid() NOT NULL,
    claimed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    delivered_at timestamp with time zone
);


ALTER TABLE public.periodic_email_deliveries OWNER TO postgres;

--
-- Name: periodic_member_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.periodic_member_preferences (
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    notify_browser boolean DEFAULT false NOT NULL,
    notify_email boolean DEFAULT false NOT NULL,
    reminder_time time without time zone,
    last_notified_at timestamp with time zone
);


ALTER TABLE public.periodic_member_preferences OWNER TO postgres;

--
-- Name: periodic_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.periodic_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    frequency text DEFAULT 'daily'::text NOT NULL,
    days_of_week integer[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
    completed_date date,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    notes text,
    category text DEFAULT 'other'::text NOT NULL,
    day_of_month integer,
    month_of_year integer,
    interval_days integer,
    anchor_date date,
    reminder_time time without time zone,
    notify_browser boolean DEFAULT true NOT NULL,
    notify_email boolean DEFAULT false NOT NULL,
    last_notified_at timestamp with time zone,
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    member_notify_browser boolean,
    member_notify_email boolean,
    member_reminder_time time without time zone,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT periodic_tasks_category_check CHECK ((category = ANY (ARRAY['work'::text, 'health'::text, 'habit'::text, 'goal'::text, 'other'::text]))),
    CONSTRAINT periodic_tasks_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text, 'custom'::text])))
);


ALTER TABLE public.periodic_tasks OWNER TO postgres;

--
-- Name: plan_focus_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plan_focus_links (
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    source_module text NOT NULL,
    source_id uuid NOT NULL,
    task_id uuid NOT NULL,
    CONSTRAINT plan_focus_links_source_module_check CHECK ((source_module = ANY (ARRAY['plans'::text, 'quick'::text])))
);


ALTER TABLE public.plan_focus_links OWNER TO postgres;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    period text NOT NULL,
    period_date date NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    history jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT plans_history_check CHECK ((jsonb_typeof(history) = 'array'::text)),
    CONSTRAINT plans_period_check CHECK ((period = ANY (ARRAY['timeless'::text, 'daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text]))),
    CONSTRAINT plans_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);


ALTER TABLE public.plans OWNER TO postgres;

--
-- Name: pomo_task_member_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pomo_task_member_preferences (
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    estimated_sessions integer NOT NULL,
    focus_seconds integer NOT NULL,
    first_estimate_seconds integer,
    CONSTRAINT pomo_task_member_preferences_estimated_sessions_check CHECK (((estimated_sessions >= 1) AND (estimated_sessions <= 999))),
    CONSTRAINT pomo_task_member_preferences_focus_seconds_check CHECK (((focus_seconds >= 60) AND (focus_seconds <= 5400)))
);


ALTER TABLE public.pomo_task_member_preferences OWNER TO postgres;

--
-- Name: pomo_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pomo_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT pomo_tasks_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 500)))
);


ALTER TABLE public.pomo_tasks OWNER TO postgres;

--
-- Name: pomodoro_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pomodoro_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    mode text NOT NULL,
    duration_seconds integer NOT NULL,
    completed boolean DEFAULT false,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid NOT NULL
);


ALTER TABLE public.pomodoro_history OWNER TO postgres;

--
-- Name: quick_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quick_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    content text NOT NULL,
    completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


ALTER TABLE public.quick_notes OWNER TO postgres;

--
-- Name: rutin_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rutin_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    avatar_key text DEFAULT 'smile'::text NOT NULL,
    color_key text DEFAULT 'terracotta'::text NOT NULL,
    access_token text NOT NULL,
    calendar_token text NOT NULL,
    role public.rutin_member_role DEFAULT 'member'::public.rutin_member_role NOT NULL,
    pin text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rutin_members OWNER TO postgres;

--
-- Name: rutin_occurrences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rutin_occurrences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    member_id uuid,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    due_at timestamp with time zone,
    slot_index integer DEFAULT 0 NOT NULL,
    status public.rutin_occurrence_status DEFAULT 'pending'::public.rutin_occurrence_status NOT NULL,
    completed_at timestamp with time zone,
    completed_by_member_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rutin_occurrences OWNER TO postgres;

--
-- Name: rutin_recurrences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rutin_recurrences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    kind public.rutin_recurrence_kind DEFAULT 'fixed'::public.rutin_recurrence_kind NOT NULL,
    "interval" integer DEFAULT 1 NOT NULL,
    interval_unit text DEFAULT 'week'::text NOT NULL,
    by_weekday integer[] DEFAULT '{}'::integer[] NOT NULL,
    by_month_day integer[] DEFAULT '{}'::integer[] NOT NULL,
    times_of_day text[] DEFAULT '{}'::text[] NOT NULL,
    count_per_period integer,
    starts_on date NOT NULL,
    ends_on date
);


ALTER TABLE public.rutin_recurrences OWNER TO postgres;

--
-- Name: rutin_routine_assignees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rutin_routine_assignees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    routine_id uuid NOT NULL,
    member_id uuid NOT NULL,
    rotation_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.rutin_routine_assignees OWNER TO postgres;

--
-- Name: rutin_routines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rutin_routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    emoji text DEFAULT '✨'::text NOT NULL,
    area text DEFAULT 'genel'::text NOT NULL,
    estimated_minutes integer,
    is_active boolean DEFAULT true NOT NULL,
    assignment_strategy public.rutin_assignment_strategy DEFAULT 'anyone'::public.rutin_assignment_strategy NOT NULL,
    overdue_policy public.rutin_overdue_policy DEFAULT 'carry_over'::public.rutin_overdue_policy NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rutin_routines OWNER TO postgres;

--
-- Name: rutin_workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rutin_workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    workspace_type public.rutin_workspace_type DEFAULT 'home'::public.rutin_workspace_type NOT NULL,
    timezone text DEFAULT 'Europe/Istanbul'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid
);


ALTER TABLE public.rutin_workspaces OWNER TO postgres;

--
-- Name: secure_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.secure_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    title text NOT NULL,
    description text,
    type public.secure_note_type NOT NULL,
    username text,
    password_encrypted text,
    url text,
    content text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid NOT NULL,
    encrypted_payload jsonb NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT vault_ciphertext_required CHECK (public.vault_ciphertext_storage_valid(encrypted_payload)),
    CONSTRAINT vault_plaintext_forbidden CHECK (((NOT (title IS DISTINCT FROM 'Encrypted note'::text)) AND (NOT (type IS DISTINCT FROM 'secret'::public.secure_note_type)) AND (description IS NULL) AND (username IS NULL) AND (password_encrypted IS NULL) AND (url IS NULL) AND (content IS NULL)))
);


ALTER TABLE public.secure_notes OWNER TO postgres;

--
-- Name: todos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.todos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    title text NOT NULL,
    description text,
    completed boolean DEFAULT false,
    category_id uuid,
    priority public.todo_priority DEFAULT 'medium'::public.todo_priority,
    due_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


ALTER TABLE public.todos OWNER TO postgres;

--
-- Name: trash_image_cleanup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.trash_image_cleanup (
    path text NOT NULL,
    queued_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE public.trash_image_cleanup OWNER TO postgres;

--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_preferences_preferences_check CHECK (public.valid_user_preferences(preferences)),
    CONSTRAINT user_preferences_schema_version_check CHECK ((schema_version = 1))
);


ALTER TABLE public.user_preferences OWNER TO postgres;

--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_settings (
    user_id uuid NOT NULL,
    active_modules text[] DEFAULT '{detailed,quick,secure,code,pomodoro}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


ALTER TABLE public.user_settings OWNER TO postgres;

--
-- Name: vault_acknowledgements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vault_acknowledgements (
    user_id uuid NOT NULL,
    notice_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vault_acknowledgements_notice_version_check CHECK ((notice_version = '2026-11-11'::text))
);


ALTER TABLE public.vault_acknowledgements OWNER TO postgres;

--
-- Name: vault_note_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vault_note_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    encrypted_payload jsonb NOT NULL,
    saved_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vault_history_ciphertext_required CHECK (public.vault_ciphertext_storage_valid(encrypted_payload))
);


ALTER TABLE public.vault_note_history OWNER TO postgres;

--
-- Name: vault_security_budgets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vault_security_budgets (
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    requests integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.vault_security_budgets OWNER TO postgres;

--
-- Name: vault_security_challenges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vault_security_challenges (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    vault_id uuid NOT NULL,
    action text NOT NULL,
    session_id text NOT NULL,
    email_hash text NOT NULL,
    code_hash text NOT NULL,
    expected_version integer NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    consumed_at timestamp with time zone,
    CONSTRAINT vault_challenge_active_action_check CHECK (((action <> 'reset'::text) OR (consumed_at IS NOT NULL))),
    CONSTRAINT vault_security_challenges_action_check CHECK ((action = ANY (ARRAY['password'::text, 'recover'::text, 'reset'::text, 'delete'::text])))
);


ALTER TABLE public.vault_security_challenges OWNER TO postgres;

--
-- Name: vault_security_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vault_security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    vault_id uuid NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vault_security_events OWNER TO postgres;

--
-- Name: work_module_setup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_module_setup (
    workspace_id uuid NOT NULL
);


ALTER TABLE public.work_module_setup OWNER TO postgres;

--
-- Name: work_projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT work_projects_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 100)))
);


ALTER TABLE public.work_projects OWNER TO postgres;

--
-- Name: work_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'none'::text NOT NULL,
    due_on date,
    estimate_minutes integer DEFAULT 30 NOT NULL,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT work_tasks_checklist_check CHECK (((jsonb_typeof(checklist) = 'array'::text) AND (jsonb_array_length(checklist) <= 50))),
    CONSTRAINT work_tasks_description_check CHECK ((length(description) <= 20000)),
    CONSTRAINT work_tasks_due_on_check CHECK (((due_on >= '1900-01-01'::date) AND (due_on <= '2100-12-31'::date))),
    CONSTRAINT work_tasks_estimate_minutes_check CHECK (((estimate_minutes >= 5) AND (estimate_minutes <= 1440))),
    CONSTRAINT work_tasks_priority_check CHECK ((priority = ANY (ARRAY['none'::text, 'low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT work_tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text]))),
    CONSTRAINT work_tasks_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 180)))
);


ALTER TABLE public.work_tasks OWNER TO postgres;

--
-- Name: workout_routines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workout_routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    day_of_week text,
    exercises jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    workspace_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


ALTER TABLE public.workout_routines OWNER TO postgres;

--
-- Name: workout_routines_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workout_routines_items (
    parent_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    id text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    "position" integer NOT NULL,
    version integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.workout_routines_items OWNER TO postgres;

--
-- Name: workspace_module_bindings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_module_bindings (
    workspace_id uuid NOT NULL,
    module text NOT NULL,
    collection_id uuid NOT NULL,
    personal_collection_id uuid NOT NULL
);


ALTER TABLE public.workspace_module_bindings OWNER TO postgres;

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    active_modules text[] DEFAULT ARRAY['plans'::text, 'detailed'::text, 'quick'::text, 'secure'::text, 'code'::text, 'pomodoro'::text, 'learning'::text, 'flashcards'::text, 'workout'::text, 'periodic'::text, 'activities'::text, 'finance'::text, 'tasks'::text] NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspaces_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
);


ALTER TABLE public.workspaces OWNER TO postgres;

--
-- Name: api_budgets api_budgets_pkey; Type: CONSTRAINT; Schema: private; Owner: postgres
--

ALTER TABLE ONLY private.api_budgets
    ADD CONSTRAINT api_budgets_pkey PRIMARY KEY (user_id, bucket, seconds);


--
-- Name: background_dispatch_config background_dispatch_config_pkey; Type: CONSTRAINT; Schema: private; Owner: postgres
--

ALTER TABLE ONLY private.background_dispatch_config
    ADD CONSTRAINT background_dispatch_config_pkey PRIMARY KEY (singleton);


--
-- Name: client_error_counts client_error_counts_pkey; Type: CONSTRAINT; Schema: private; Owner: postgres
--

ALTER TABLE ONLY private.client_error_counts
    ADD CONSTRAINT client_error_counts_pkey PRIMARY KEY (bucket, code, screen, release);


--
-- Name: maintenance_tickets maintenance_tickets_pkey; Type: CONSTRAINT; Schema: private; Owner: postgres
--

ALTER TABLE ONLY private.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_pkey PRIMARY KEY (id);


--
-- Name: activity_collection_items activity_collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_collection_items
    ADD CONSTRAINT activity_collection_items_pkey PRIMARY KEY (group_id, item_id);


--
-- Name: activity_collections activity_collections_id_collection_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_collections
    ADD CONSTRAINT activity_collections_id_collection_id_key UNIQUE (id, collection_id);


--
-- Name: activity_collections activity_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_collections
    ADD CONSTRAINT activity_collections_pkey PRIMARY KEY (id);


--
-- Name: activity_items activity_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT activity_items_pkey PRIMARY KEY (id);


--
-- Name: analytics_config analytics_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_config
    ADD CONSTRAINT analytics_config_pkey PRIMARY KEY (id);


--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);


--
-- Name: analytics_focus_sessions analytics_focus_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_focus_sessions
    ADD CONSTRAINT analytics_focus_sessions_pkey PRIMARY KEY (id);


--
-- Name: background_run_status background_run_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.background_run_status
    ADD CONSTRAINT background_run_status_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: code_snippets code_snippets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.code_snippets
    ADD CONSTRAINT code_snippets_pkey PRIMARY KEY (id);


--
-- Name: collection_activity collection_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_activity
    ADD CONSTRAINT collection_activity_pkey PRIMARY KEY (id);


--
-- Name: collection_invites collection_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_invites
    ADD CONSTRAINT collection_invites_pkey PRIMARY KEY (id);


--
-- Name: collection_invites collection_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_invites
    ADD CONSTRAINT collection_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: collection_members collection_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_members
    ADD CONSTRAINT collection_members_pkey PRIMARY KEY (collection_id, user_id);


--
-- Name: external_calendar_budgets external_calendar_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_budgets
    ADD CONSTRAINT external_calendar_budgets_pkey PRIMARY KEY (user_id, action);


--
-- Name: external_calendar_connections external_calendar_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_connections
    ADD CONSTRAINT external_calendar_connections_pkey PRIMARY KEY (id);


--
-- Name: external_calendar_connections external_calendar_connections_user_id_provider_account_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_connections
    ADD CONSTRAINT external_calendar_connections_user_id_provider_account_key_key UNIQUE (user_id, provider, account_key);


--
-- Name: external_calendar_oauth external_calendar_oauth_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_oauth
    ADD CONSTRAINT external_calendar_oauth_pkey PRIMARY KEY (state_hash);


--
-- Name: external_calendar_sources external_calendar_sources_connection_id_remote_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_sources
    ADD CONSTRAINT external_calendar_sources_connection_id_remote_id_key UNIQUE (connection_id, remote_id);


--
-- Name: external_calendar_sources external_calendar_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_sources
    ADD CONSTRAINT external_calendar_sources_pkey PRIMARY KEY (id);


--
-- Name: external_calendar_tokens external_calendar_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_tokens
    ADD CONSTRAINT external_calendar_tokens_pkey PRIMARY KEY (connection_id);


--
-- Name: finance_budget_limits finance_budget_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_budget_limits
    ADD CONSTRAINT finance_budget_limits_pkey PRIMARY KEY (workspace_id, category_id, month, scope);


--
-- Name: finance_categories finance_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_workspace_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_workspace_id_name_key UNIQUE (workspace_id, name);


--
-- Name: finance_market_quotes finance_market_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_market_quotes
    ADD CONSTRAINT finance_market_quotes_pkey PRIMARY KEY (provider, instrument, currency);


--
-- Name: finance_positions finance_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_positions
    ADD CONSTRAINT finance_positions_pkey PRIMARY KEY (id);


--
-- Name: finance_recurring finance_recurring_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_recurring
    ADD CONSTRAINT finance_recurring_pkey PRIMARY KEY (id);


--
-- Name: finance_settings finance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_settings
    ADD CONSTRAINT finance_settings_pkey PRIMARY KEY (workspace_id);


--
-- Name: finance_transactions finance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);


--
-- Name: flashcard_decks_items flashcard_decks_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flashcard_decks_items
    ADD CONSTRAINT flashcard_decks_items_pkey PRIMARY KEY (parent_id, id);


--
-- Name: flashcard_decks flashcard_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flashcard_decks
    ADD CONSTRAINT flashcard_decks_pkey PRIMARY KEY (id);


--
-- Name: focus_ownership focus_ownership_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.focus_ownership
    ADD CONSTRAINT focus_ownership_pkey PRIMARY KEY (user_id);


--
-- Name: learning_mistakes learning_mistakes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_mistakes
    ADD CONSTRAINT learning_mistakes_pkey PRIMARY KEY (id);


--
-- Name: learning_progress learning_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_pkey PRIMARY KEY (user_id, subject_id, topic_id);


--
-- Name: learning_reviews learning_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_reviews
    ADD CONSTRAINT learning_reviews_pkey PRIMARY KEY (id);


--
-- Name: learning_subjects_items learning_subjects_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_subjects_items
    ADD CONSTRAINT learning_subjects_items_pkey PRIMARY KEY (parent_id, id);


--
-- Name: learning_subjects learning_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_subjects
    ADD CONSTRAINT learning_subjects_pkey PRIMARY KEY (id);


--
-- Name: module_collections module_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_collections
    ADD CONSTRAINT module_collections_pkey PRIMARY KEY (id);


--
-- Name: password_sessions password_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_sessions
    ADD CONSTRAINT password_sessions_pkey PRIMARY KEY (id);


--
-- Name: periodic_email_deliveries periodic_email_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_email_deliveries
    ADD CONSTRAINT periodic_email_deliveries_pkey PRIMARY KEY (id);


--
-- Name: periodic_email_deliveries periodic_email_deliveries_user_id_task_id_delivery_day_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_email_deliveries
    ADD CONSTRAINT periodic_email_deliveries_user_id_task_id_delivery_day_key UNIQUE (user_id, task_id, delivery_day);


--
-- Name: periodic_member_preferences periodic_member_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_member_preferences
    ADD CONSTRAINT periodic_member_preferences_pkey PRIMARY KEY (task_id, user_id);


--
-- Name: periodic_tasks periodic_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_tasks
    ADD CONSTRAINT periodic_tasks_pkey PRIMARY KEY (id);


--
-- Name: plan_focus_links plan_focus_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_focus_links
    ADD CONSTRAINT plan_focus_links_pkey PRIMARY KEY (user_id, workspace_id, source_module, source_id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: pomo_task_member_preferences pomo_task_member_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_task_member_preferences
    ADD CONSTRAINT pomo_task_member_preferences_pkey PRIMARY KEY (task_id, user_id);


--
-- Name: pomo_tasks pomo_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_tasks
    ADD CONSTRAINT pomo_tasks_pkey PRIMARY KEY (id);


--
-- Name: pomodoro_history pomodoro_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomodoro_history
    ADD CONSTRAINT pomodoro_history_pkey PRIMARY KEY (id);


--
-- Name: quick_notes quick_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_notes
    ADD CONSTRAINT quick_notes_pkey PRIMARY KEY (id);


--
-- Name: rutin_members rutin_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_members
    ADD CONSTRAINT rutin_members_pkey PRIMARY KEY (id);


--
-- Name: rutin_occurrences rutin_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_occurrences
    ADD CONSTRAINT rutin_occurrences_pkey PRIMARY KEY (id);


--
-- Name: rutin_recurrences rutin_recurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_recurrences
    ADD CONSTRAINT rutin_recurrences_pkey PRIMARY KEY (id);


--
-- Name: rutin_recurrences rutin_recurrences_routine_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_recurrences
    ADD CONSTRAINT rutin_recurrences_routine_id_key UNIQUE (routine_id);


--
-- Name: rutin_routine_assignees rutin_routine_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_routine_assignees
    ADD CONSTRAINT rutin_routine_assignees_pkey PRIMARY KEY (id);


--
-- Name: rutin_routines rutin_routines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_routines
    ADD CONSTRAINT rutin_routines_pkey PRIMARY KEY (id);


--
-- Name: rutin_workspaces rutin_workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_workspaces
    ADD CONSTRAINT rutin_workspaces_pkey PRIMARY KEY (id);


--
-- Name: secure_notes secure_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.secure_notes
    ADD CONSTRAINT secure_notes_pkey PRIMARY KEY (id);


--
-- Name: todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
-- Name: trash_image_cleanup trash_image_cleanup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trash_image_cleanup
    ADD CONSTRAINT trash_image_cleanup_pkey PRIMARY KEY (path);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: vault_acknowledgements vault_acknowledgements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_acknowledgements
    ADD CONSTRAINT vault_acknowledgements_pkey PRIMARY KEY (user_id, notice_version);


--
-- Name: vault_note_history vault_note_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_note_history
    ADD CONSTRAINT vault_note_history_pkey PRIMARY KEY (id);


--
-- Name: vault_security_budgets vault_security_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_security_budgets
    ADD CONSTRAINT vault_security_budgets_pkey PRIMARY KEY (user_id);


--
-- Name: vault_security_challenges vault_security_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_security_challenges
    ADD CONSTRAINT vault_security_challenges_pkey PRIMARY KEY (id);


--
-- Name: vault_security_events vault_security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_security_events
    ADD CONSTRAINT vault_security_events_pkey PRIMARY KEY (id);


--
-- Name: work_blocks work_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_blocks
    ADD CONSTRAINT work_blocks_pkey PRIMARY KEY (id);


--
-- Name: work_module_setup work_module_setup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_module_setup
    ADD CONSTRAINT work_module_setup_pkey PRIMARY KEY (workspace_id);


--
-- Name: work_projects work_projects_id_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_projects
    ADD CONSTRAINT work_projects_id_workspace_id_key UNIQUE (id, workspace_id);


--
-- Name: work_projects work_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_projects
    ADD CONSTRAINT work_projects_pkey PRIMARY KEY (id);


--
-- Name: work_tasks work_tasks_id_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_tasks
    ADD CONSTRAINT work_tasks_id_workspace_id_key UNIQUE (id, workspace_id);


--
-- Name: work_tasks work_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_tasks
    ADD CONSTRAINT work_tasks_pkey PRIMARY KEY (id);


--
-- Name: workout_library_exercises workout_library_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_library_exercises
    ADD CONSTRAINT workout_library_exercises_pkey PRIMARY KEY (id);


--
-- Name: workout_routines_items workout_routines_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_routines_items
    ADD CONSTRAINT workout_routines_items_pkey PRIMARY KEY (parent_id, id);


--
-- Name: workout_routines workout_routines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_routines
    ADD CONSTRAINT workout_routines_pkey PRIMARY KEY (id);


--
-- Name: workspace_module_bindings workspace_module_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_module_bindings
    ADD CONSTRAINT workspace_module_bindings_pkey PRIMARY KEY (workspace_id, module);


--
-- Name: workspaces workspaces_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_id_user_id_key UNIQUE (id, user_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: activity_collection_item_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_collection_item_idx ON public.activity_collection_items USING btree (item_id);


--
-- Name: activity_collection_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX activity_collection_name_idx ON public.activity_collections USING btree (collection_id, lower(btrim(name))) WHERE (archived_at IS NULL);


--
-- Name: activity_collection_scope_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_collection_scope_idx ON public.activity_collection_items USING btree (collection_id);


--
-- Name: activity_items_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_items_collection_idx ON public.activity_items USING btree (collection_id, created_at);


--
-- Name: activity_items_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX activity_items_id_collection_idx ON public.activity_items USING btree (id, collection_id);


--
-- Name: activity_items_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX activity_items_id_workspace_idx ON public.activity_items USING btree (id, workspace_id);


--
-- Name: activity_items_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_items_trash_idx ON public.activity_items USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: activity_items_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_items_type_idx ON public.activity_items USING btree (user_id, type);


--
-- Name: activity_items_user_external_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX activity_items_user_external_uidx ON public.activity_items USING btree (collection_id, type, external_source, external_id) WHERE ((external_id IS NOT NULL) AND (external_source IS NOT NULL));


--
-- Name: activity_items_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_items_user_id_idx ON public.activity_items USING btree (user_id);


--
-- Name: activity_items_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX activity_items_workspace_idx ON public.activity_items USING btree (workspace_id, created_at);


--
-- Name: analytics_baseline_once; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX analytics_baseline_once ON public.analytics_events USING btree (collection_id, record_id) WHERE ((kind = 'baseline'::text) AND is_import_baseline);


--
-- Name: analytics_events_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_events_item ON public.analytics_events USING btree (collection_id, record_id, id DESC);


--
-- Name: analytics_events_scope_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_events_scope_time ON public.analytics_events USING btree (collection_id, occurred_at, id);


--
-- Name: analytics_focus_owner_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_focus_owner_time ON public.analytics_focus_sessions USING btree (user_id, started_at);


--
-- Name: background_run_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX background_run_status_created ON public.background_run_status USING btree (created_at);


--
-- Name: bindings_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bindings_collection_idx ON public.workspace_module_bindings USING btree (collection_id);


--
-- Name: categories_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX categories_collection_idx ON public.categories USING btree (collection_id, created_at);


--
-- Name: categories_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX categories_id_collection_idx ON public.categories USING btree (id, collection_id);


--
-- Name: categories_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX categories_id_workspace_idx ON public.categories USING btree (id, workspace_id);


--
-- Name: categories_user_name_ci_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX categories_user_name_ci_idx ON public.categories USING btree (collection_id, lower(name));


--
-- Name: categories_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX categories_workspace_idx ON public.categories USING btree (workspace_id, created_at);


--
-- Name: code_snippets_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX code_snippets_collection_idx ON public.code_snippets USING btree (collection_id, created_at);


--
-- Name: code_snippets_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX code_snippets_id_collection_idx ON public.code_snippets USING btree (id, collection_id);


--
-- Name: code_snippets_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX code_snippets_id_workspace_idx ON public.code_snippets USING btree (id, workspace_id);


--
-- Name: code_snippets_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX code_snippets_trash_idx ON public.code_snippets USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: code_snippets_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX code_snippets_workspace_idx ON public.code_snippets USING btree (workspace_id, created_at);


--
-- Name: collection_activity_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX collection_activity_collection_idx ON public.collection_activity USING btree (collection_id, created_at);


--
-- Name: collection_members_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX collection_members_user_idx ON public.collection_members USING btree (user_id, collection_id);


--
-- Name: finance_category_month; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX finance_category_month ON public.finance_transactions USING btree (workspace_id, category_id, occurred_on);


--
-- Name: finance_positions_page; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX finance_positions_page ON public.finance_positions USING btree (workspace_id, purchased_on DESC, id DESC);


--
-- Name: finance_recurring_occurrence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX finance_recurring_occurrence ON public.finance_transactions USING btree (recurring_id, occurred_on);


--
-- Name: finance_recurring_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX finance_recurring_workspace ON public.finance_recurring USING btree (workspace_id) WHERE (deleted_at IS NULL);


--
-- Name: finance_transactions_page; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX finance_transactions_page ON public.finance_transactions USING btree (workspace_id, occurred_on DESC, id DESC);


--
-- Name: flashcard_decks_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX flashcard_decks_collection_idx ON public.flashcard_decks USING btree (collection_id, created_at);


--
-- Name: flashcard_decks_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX flashcard_decks_id_collection_idx ON public.flashcard_decks USING btree (id, collection_id);


--
-- Name: flashcard_decks_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX flashcard_decks_id_workspace_idx ON public.flashcard_decks USING btree (id, workspace_id);


--
-- Name: flashcard_decks_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX flashcard_decks_trash_idx ON public.flashcard_decks USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: flashcard_decks_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX flashcard_decks_workspace_idx ON public.flashcard_decks USING btree (workspace_id, created_at);


--
-- Name: focus_task_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX focus_task_owner_idx ON public.analytics_focus_sessions USING btree (user_id, task_id, started_at DESC);


--
-- Name: focus_terminal_recent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX focus_terminal_recent_idx ON public.analytics_focus_sessions USING btree (user_id, updated_at DESC) WHERE (status = ANY (ARRAY['ended'::text, 'completed'::text]));


--
-- Name: idx_categories_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_categories_created_by ON public.categories USING btree (created_by);


--
-- Name: idx_code_snippets_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_code_snippets_created_by ON public.code_snippets USING btree (created_by);


--
-- Name: idx_password_sessions_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_sessions_created_by ON public.password_sessions USING btree (created_by);


--
-- Name: idx_pomodoro_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pomodoro_created_by ON public.pomodoro_history USING btree (created_by);


--
-- Name: idx_pomodoro_history_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pomodoro_history_created_by ON public.pomodoro_history USING btree (created_by);


--
-- Name: idx_quick_notes_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_quick_notes_created_by ON public.quick_notes USING btree (created_by);


--
-- Name: idx_secure_notes_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_secure_notes_created_by ON public.secure_notes USING btree (created_by);


--
-- Name: idx_secure_notes_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_secure_notes_session_id ON public.secure_notes USING btree (session_id);


--
-- Name: idx_sessions_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_created_by ON public.password_sessions USING btree (created_by);


--
-- Name: idx_todos_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_todos_category_id ON public.todos USING btree (category_id);


--
-- Name: idx_todos_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_todos_created_by ON public.todos USING btree (created_by);


--
-- Name: learning_focus_task_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learning_focus_task_idx ON public.analytics_focus_sessions USING btree (user_id, task_id) WHERE (task_id IS NOT NULL);


--
-- Name: learning_mistakes_page_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learning_mistakes_page_idx ON public.learning_mistakes USING btree (user_id, workspace_id, created_at DESC, id DESC);


--
-- Name: learning_progress_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learning_progress_due_idx ON public.learning_progress USING btree (user_id, review_on) WHERE (review_on IS NOT NULL);


--
-- Name: learning_reviews_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learning_reviews_owner_idx ON public.learning_reviews USING btree (user_id, subject_id, topic_id, created_at DESC);


--
-- Name: learning_subjects_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learning_subjects_collection_idx ON public.learning_subjects USING btree (collection_id, created_at);


--
-- Name: learning_subjects_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX learning_subjects_id_collection_idx ON public.learning_subjects USING btree (id, collection_id);


--
-- Name: learning_subjects_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX learning_subjects_id_workspace_idx ON public.learning_subjects USING btree (id, workspace_id);


--
-- Name: learning_subjects_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learning_subjects_trash_idx ON public.learning_subjects USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: learning_subjects_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX learning_subjects_workspace_idx ON public.learning_subjects USING btree (workspace_id, created_at);


--
-- Name: learning_template_subject_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX learning_template_subject_idx ON public.learning_subjects USING btree (collection_id, template_key) WHERE (template_key IS NOT NULL);


--
-- Name: password_sessions_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX password_sessions_collection_idx ON public.password_sessions USING btree (collection_id, created_at);


--
-- Name: password_sessions_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX password_sessions_id_collection_idx ON public.password_sessions USING btree (id, collection_id);


--
-- Name: password_sessions_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX password_sessions_id_workspace_idx ON public.password_sessions USING btree (id, workspace_id);


--
-- Name: password_sessions_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX password_sessions_workspace_idx ON public.password_sessions USING btree (workspace_id, created_at);


--
-- Name: periodic_tasks_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX periodic_tasks_collection_idx ON public.periodic_tasks USING btree (collection_id, created_at);


--
-- Name: periodic_tasks_completed_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX periodic_tasks_completed_date_idx ON public.periodic_tasks USING btree (completed_date);


--
-- Name: periodic_tasks_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX periodic_tasks_id_collection_idx ON public.periodic_tasks USING btree (id, collection_id);


--
-- Name: periodic_tasks_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX periodic_tasks_id_workspace_idx ON public.periodic_tasks USING btree (id, workspace_id);


--
-- Name: periodic_tasks_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX periodic_tasks_trash_idx ON public.periodic_tasks USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: periodic_tasks_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX periodic_tasks_user_id_idx ON public.periodic_tasks USING btree (user_id);


--
-- Name: periodic_tasks_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX periodic_tasks_workspace_idx ON public.periodic_tasks USING btree (workspace_id, created_at);


--
-- Name: plan_focus_links_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plan_focus_links_source ON public.plan_focus_links USING btree (source_module, source_id);


--
-- Name: plans_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plans_collection_idx ON public.plans USING btree (collection_id, created_at);


--
-- Name: plans_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX plans_id_collection_idx ON public.plans USING btree (id, collection_id);


--
-- Name: plans_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX plans_id_workspace_idx ON public.plans USING btree (id, workspace_id);


--
-- Name: plans_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plans_trash_idx ON public.plans USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: plans_user_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plans_user_period_idx ON public.plans USING btree (user_id, period, period_date);


--
-- Name: plans_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plans_workspace_idx ON public.plans USING btree (workspace_id, created_at);


--
-- Name: pomo_tasks_page_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pomo_tasks_page_idx ON public.pomo_tasks USING btree (collection_id, completed, created_at DESC, id DESC);


--
-- Name: pomo_tasks_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pomo_tasks_trash_idx ON public.pomo_tasks USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: pomodoro_history_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX pomodoro_history_id_workspace_idx ON public.pomodoro_history USING btree (id, workspace_id);


--
-- Name: pomodoro_history_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pomodoro_history_workspace_idx ON public.pomodoro_history USING btree (workspace_id, created_at);


--
-- Name: quick_notes_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quick_notes_collection_idx ON public.quick_notes USING btree (collection_id, created_at);


--
-- Name: quick_notes_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX quick_notes_id_collection_idx ON public.quick_notes USING btree (id, collection_id);


--
-- Name: quick_notes_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX quick_notes_id_workspace_idx ON public.quick_notes USING btree (id, workspace_id);


--
-- Name: quick_notes_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quick_notes_trash_idx ON public.quick_notes USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: quick_notes_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quick_notes_workspace_idx ON public.quick_notes USING btree (workspace_id, created_at);


--
-- Name: rutin_members_access_token_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX rutin_members_access_token_uidx ON public.rutin_members USING btree (access_token);


--
-- Name: rutin_members_calendar_token_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX rutin_members_calendar_token_uidx ON public.rutin_members USING btree (calendar_token);


--
-- Name: rutin_members_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rutin_members_workspace_idx ON public.rutin_members USING btree (workspace_id);


--
-- Name: rutin_occurrences_dedupe_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX rutin_occurrences_dedupe_uidx ON public.rutin_occurrences USING btree (routine_id, period_start, slot_index);


--
-- Name: rutin_occurrences_routine_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rutin_occurrences_routine_status_idx ON public.rutin_occurrences USING btree (routine_id, status);


--
-- Name: rutin_routine_assignees_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX rutin_routine_assignees_uidx ON public.rutin_routine_assignees USING btree (routine_id, member_id);


--
-- Name: rutin_routines_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rutin_routines_workspace_idx ON public.rutin_routines USING btree (workspace_id);


--
-- Name: rutin_workspaces_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rutin_workspaces_owner_idx ON public.rutin_workspaces USING btree (owner_id);


--
-- Name: secure_notes_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX secure_notes_collection_idx ON public.secure_notes USING btree (collection_id, created_at);


--
-- Name: secure_notes_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX secure_notes_id_collection_idx ON public.secure_notes USING btree (id, collection_id);


--
-- Name: secure_notes_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX secure_notes_id_workspace_idx ON public.secure_notes USING btree (id, workspace_id);


--
-- Name: secure_notes_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX secure_notes_workspace_idx ON public.secure_notes USING btree (workspace_id, created_at);


--
-- Name: sessions_user_name_ci_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX sessions_user_name_ci_idx ON public.password_sessions USING btree (workspace_id, created_by, lower(name));


--
-- Name: todos_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX todos_collection_idx ON public.todos USING btree (collection_id, created_at);


--
-- Name: todos_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX todos_id_collection_idx ON public.todos USING btree (id, collection_id);


--
-- Name: todos_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX todos_id_workspace_idx ON public.todos USING btree (id, workspace_id);


--
-- Name: todos_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX todos_trash_idx ON public.todos USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: todos_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX todos_workspace_idx ON public.todos USING btree (workspace_id, created_at);


--
-- Name: vault_challenges_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vault_challenges_user ON public.vault_security_challenges USING btree (user_id, created_at DESC);


--
-- Name: vault_note_history_note; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vault_note_history_note ON public.vault_note_history USING btree (note_id, saved_at DESC);


--
-- Name: work_blocks_range; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX work_blocks_range ON public.work_blocks USING btree (workspace_id, starts_at, ends_at) WHERE (deleted_at IS NULL);


--
-- Name: work_blocks_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX work_blocks_task ON public.work_blocks USING btree (task_id);


--
-- Name: work_blocks_trash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX work_blocks_trash ON public.work_blocks USING btree (workspace_id, deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: work_tasks_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX work_tasks_due ON public.work_tasks USING btree (workspace_id, due_on) WHERE ((deleted_at IS NULL) AND (due_on IS NOT NULL));


--
-- Name: work_tasks_page; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX work_tasks_page ON public.work_tasks USING btree (workspace_id, created_at DESC, id DESC) WHERE (deleted_at IS NULL);


--
-- Name: work_tasks_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX work_tasks_project ON public.work_tasks USING btree (workspace_id, project_id, status) WHERE (deleted_at IS NULL);


--
-- Name: work_tasks_trash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX work_tasks_trash ON public.work_tasks USING btree (workspace_id, deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: workout_library_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workout_library_active ON public.workout_library_exercises USING btree (collection_id, created_at DESC, id) WHERE (removed_at IS NULL);


--
-- Name: workout_library_collection; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workout_library_collection ON public.workout_library_exercises USING btree (collection_id, created_at DESC, id);


--
-- Name: workout_routines_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workout_routines_collection_idx ON public.workout_routines USING btree (collection_id, created_at);


--
-- Name: workout_routines_id_collection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX workout_routines_id_collection_idx ON public.workout_routines USING btree (id, collection_id);


--
-- Name: workout_routines_id_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX workout_routines_id_workspace_idx ON public.workout_routines USING btree (id, workspace_id);


--
-- Name: workout_routines_trash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workout_routines_trash_idx ON public.workout_routines USING btree (collection_id, deleted_at, id) WHERE (deleted_at IS NOT NULL);


--
-- Name: workout_routines_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workout_routines_workspace_idx ON public.workout_routines USING btree (workspace_id, created_at);


--
-- Name: workspaces_owner_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX workspaces_owner_default ON public.workspaces USING btree (user_id) WHERE is_default;


--
-- Name: workspaces_owner_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX workspaces_owner_name ON public.workspaces USING btree (user_id, lower(TRIM(BOTH FROM name)));


--
-- Name: plans analytics_capture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER analytics_capture AFTER INSERT OR DELETE OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.capture_analytics_event('plans');


--
-- Name: pomo_tasks analytics_capture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER analytics_capture AFTER INSERT OR DELETE OR UPDATE ON public.pomo_tasks FOR EACH ROW EXECUTE FUNCTION public.capture_analytics_event('pomodoro');


--
-- Name: quick_notes analytics_capture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER analytics_capture AFTER INSERT OR DELETE OR UPDATE ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.capture_analytics_event('quick');


--
-- Name: todos analytics_capture; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER analytics_capture AFTER INSERT OR DELETE OR UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.capture_analytics_event('detailed');


--
-- Name: categories categories_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER categories_set_created_by BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_created_by_auth();


--
-- Name: categories categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activity_items collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.activity_items FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: categories collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: code_snippets collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.code_snippets FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: flashcard_decks collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.flashcard_decks FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: learning_subjects collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.learning_subjects FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: password_sessions collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: periodic_tasks collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.periodic_tasks FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: plans collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: pomo_tasks collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.pomo_tasks FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: quick_notes collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: secure_notes collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: todos collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: workout_library_exercises collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT ON public.workout_library_exercises FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: workout_routines collection_record_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER collection_record_changed AFTER INSERT OR DELETE OR UPDATE ON public.workout_routines FOR EACH ROW EXECUTE FUNCTION public.collection_record_changed();


--
-- Name: finance_transactions finance_inherit_category; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER finance_inherit_category BEFORE INSERT ON public.finance_transactions FOR EACH ROW EXECUTE FUNCTION public.finance_inherit_category();


--
-- Name: activity_items guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.activity_items FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('activities', 'user_id');


--
-- Name: categories guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('detailed', 'created_by');


--
-- Name: code_snippets guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.code_snippets FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('code', 'created_by');


--
-- Name: flashcard_decks guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.flashcard_decks FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('flashcards', 'user_id');


--
-- Name: learning_subjects guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.learning_subjects FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('learning', 'user_id');


--
-- Name: password_sessions guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('secure', 'created_by');


--
-- Name: periodic_tasks guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.periodic_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('periodic', 'user_id');


--
-- Name: plans guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('plans', 'user_id');


--
-- Name: pomo_tasks guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.pomo_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('pomodoro', 'created_by');


--
-- Name: quick_notes guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('quick', 'created_by');


--
-- Name: secure_notes guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('secure', 'created_by');


--
-- Name: todos guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('detailed', 'created_by');


--
-- Name: workout_library_exercises guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.workout_library_exercises FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('workout', 'created_by');


--
-- Name: workout_routines guard_collection_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_collection_record BEFORE INSERT OR UPDATE ON public.workout_routines FOR EACH ROW EXECUTE FUNCTION public.guard_collection_record('workout', 'user_id');


--
-- Name: plans guard_plan_period; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_plan_period BEFORE INSERT OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.guard_plan_period();


--
-- Name: flashcard_decks guard_projected_array; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_projected_array BEFORE UPDATE ON public.flashcard_decks FOR EACH ROW EXECUTE FUNCTION public.guard_projected_array('cards');


--
-- Name: learning_subjects guard_projected_array; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_projected_array BEFORE UPDATE ON public.learning_subjects FOR EACH ROW EXECUTE FUNCTION public.guard_projected_array('topics');


--
-- Name: workout_routines guard_projected_array; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_projected_array BEFORE UPDATE ON public.workout_routines FOR EACH ROW EXECUTE FUNCTION public.guard_projected_array('exercises');


--
-- Name: activity_items guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.activity_items FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: code_snippets guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.code_snippets FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: flashcard_decks guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.flashcard_decks FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: learning_subjects guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.learning_subjects FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: periodic_tasks guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.periodic_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: plans guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: pomo_tasks guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.pomo_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: quick_notes guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: todos guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: workout_routines guard_trash_record; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_trash_record BEFORE INSERT OR DELETE OR UPDATE ON public.workout_routines FOR EACH ROW EXECUTE FUNCTION public.guard_trash_record();


--
-- Name: workspaces guard_workspace_archive; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER guard_workspace_archive BEFORE UPDATE OF archived_at ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_archive();


--
-- Name: learning_subjects learning_name_limit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER learning_name_limit BEFORE INSERT OR UPDATE ON public.learning_subjects FOR EACH ROW EXECUTE FUNCTION public.learning_name_limit();


--
-- Name: learning_subjects_items learning_name_limit; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER learning_name_limit BEFORE INSERT OR UPDATE ON public.learning_subjects_items FOR EACH ROW EXECUTE FUNCTION public.learning_name_limit();


--
-- Name: password_sessions password_sessions_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER password_sessions_set_created_by BEFORE INSERT ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.set_created_by_auth();


--
-- Name: password_sessions password_sessions_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER password_sessions_set_updated_at BEFORE UPDATE ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pomodoro_history pomodoro_history_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER pomodoro_history_set_created_by BEFORE INSERT ON public.pomodoro_history FOR EACH ROW EXECUTE FUNCTION public.set_created_by_auth();


--
-- Name: pomodoro_history pomodoro_history_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER pomodoro_history_set_updated_at BEFORE UPDATE ON public.pomodoro_history FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: flashcard_decks_items project_collection_items; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER project_collection_items AFTER INSERT OR DELETE OR UPDATE ON public.flashcard_decks_items FOR EACH ROW EXECUTE FUNCTION public.project_collection_items('flashcard_decks', 'cards');


--
-- Name: learning_subjects_items project_collection_items; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER project_collection_items AFTER INSERT OR DELETE OR UPDATE ON public.learning_subjects_items FOR EACH ROW EXECUTE FUNCTION public.project_collection_items('learning_subjects', 'topics');


--
-- Name: workout_routines_items project_collection_items; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER project_collection_items AFTER INSERT OR DELETE OR UPDATE ON public.workout_routines_items FOR EACH ROW EXECUTE FUNCTION public.project_collection_items('workout_routines', 'exercises');


--
-- Name: quick_notes quick_notes_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER quick_notes_set_created_by BEFORE INSERT ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.set_created_by_auth();


--
-- Name: quick_notes quick_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER quick_notes_set_updated_at BEFORE UPDATE ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: periodic_tasks save_member_reminder; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER save_member_reminder BEFORE INSERT OR UPDATE ON public.periodic_tasks FOR EACH ROW EXECUTE FUNCTION public.save_member_reminder();


--
-- Name: secure_notes secure_notes_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER secure_notes_set_created_by BEFORE INSERT ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.set_created_by_auth();


--
-- Name: secure_notes secure_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER secure_notes_set_updated_at BEFORE UPDATE ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workspace_module_bindings sharing_binding_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER sharing_binding_changed AFTER INSERT OR UPDATE ON public.workspace_module_bindings FOR EACH ROW EXECUTE FUNCTION public.sharing_binding_changed();


--
-- Name: module_collections sharing_collection_changed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER sharing_collection_changed AFTER UPDATE ON public.module_collections FOR EACH ROW EXECUTE FUNCTION public.sharing_collection_changed();


--
-- Name: todos todos_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER todos_set_created_by BEFORE INSERT ON public.todos FOR EACH ROW EXECUTE FUNCTION public.set_created_by_auth();


--
-- Name: todos todos_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER todos_set_updated_at BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: categories trg_categories_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_categories_set_created_by BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.fn_set_created_by();


--
-- Name: categories trg_categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: code_snippets trg_code_snippets_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_code_snippets_set_created_by BEFORE INSERT ON public.code_snippets FOR EACH ROW EXECUTE FUNCTION public.fn_set_created_by();


--
-- Name: code_snippets trg_code_snippets_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_code_snippets_set_updated_at BEFORE UPDATE ON public.code_snippets FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: password_sessions trg_password_sessions_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_password_sessions_set_created_by BEFORE INSERT ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.fn_set_created_by();


--
-- Name: password_sessions trg_password_sessions_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_password_sessions_set_updated_at BEFORE UPDATE ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: pomodoro_history trg_pomodoro_history_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_pomodoro_history_set_created_by BEFORE INSERT ON public.pomodoro_history FOR EACH ROW EXECUTE FUNCTION public.fn_set_created_by();


--
-- Name: pomodoro_history trg_pomodoro_history_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_pomodoro_history_set_updated_at BEFORE UPDATE ON public.pomodoro_history FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: quick_notes trg_quick_notes_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_quick_notes_set_created_by BEFORE INSERT ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.fn_set_created_by();


--
-- Name: quick_notes trg_quick_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_quick_notes_set_updated_at BEFORE UPDATE ON public.quick_notes FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: secure_notes trg_secure_notes_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_secure_notes_set_created_by BEFORE INSERT ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.fn_set_created_by();


--
-- Name: secure_notes trg_secure_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_secure_notes_set_updated_at BEFORE UPDATE ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: todos trg_todos_set_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_todos_set_created_by BEFORE INSERT ON public.todos FOR EACH ROW EXECUTE FUNCTION public.fn_set_created_by();


--
-- Name: todos trg_todos_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_todos_set_updated_at BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: password_sessions z_guard_vault_ciphertext; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER z_guard_vault_ciphertext BEFORE INSERT OR UPDATE ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_vault_ciphertext();


--
-- Name: secure_notes z_guard_vault_ciphertext; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER z_guard_vault_ciphertext BEFORE INSERT OR UPDATE ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.guard_vault_ciphertext();


--
-- Name: password_sessions z_guard_vault_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER z_guard_vault_delete BEFORE DELETE ON public.password_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_vault_ciphertext();


--
-- Name: secure_notes z_guard_vault_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER z_guard_vault_delete BEFORE DELETE ON public.secure_notes FOR EACH ROW EXECUTE FUNCTION public.guard_vault_ciphertext();


--
-- Name: api_budgets api_budgets_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: postgres
--

ALTER TABLE ONLY private.api_budgets
    ADD CONSTRAINT api_budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: activity_collection_items activity_collection_items_group_id_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_collection_items
    ADD CONSTRAINT activity_collection_items_group_id_collection_id_fkey FOREIGN KEY (group_id, collection_id) REFERENCES public.activity_collections(id, collection_id) ON DELETE CASCADE;


--
-- Name: activity_collection_items activity_collection_items_item_id_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_collection_items
    ADD CONSTRAINT activity_collection_items_item_id_collection_id_fkey FOREIGN KEY (item_id, collection_id) REFERENCES public.activity_items(id, collection_id) ON DELETE CASCADE;


--
-- Name: activity_collections activity_collections_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_collections
    ADD CONSTRAINT activity_collections_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE CASCADE;


--
-- Name: activity_items activity_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT activity_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: activity_items activity_items_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT activity_items_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: activity_items activity_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_items
    ADD CONSTRAINT activity_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: analytics_events analytics_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: analytics_events analytics_events_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE CASCADE;


--
-- Name: analytics_focus_sessions analytics_focus_sessions_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_focus_sessions
    ADD CONSTRAINT analytics_focus_sessions_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE SET NULL;


--
-- Name: analytics_focus_sessions analytics_focus_sessions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_focus_sessions
    ADD CONSTRAINT analytics_focus_sessions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.pomo_tasks(id) ON DELETE SET NULL;


--
-- Name: analytics_focus_sessions analytics_focus_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_focus_sessions
    ADD CONSTRAINT analytics_focus_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: analytics_focus_sessions analytics_focus_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_focus_sessions
    ADD CONSTRAINT analytics_focus_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: categories categories_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: code_snippets code_snippets_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.code_snippets
    ADD CONSTRAINT code_snippets_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: code_snippets code_snippets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.code_snippets
    ADD CONSTRAINT code_snippets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: code_snippets code_snippets_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.code_snippets
    ADD CONSTRAINT code_snippets_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: collection_activity collection_activity_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_activity
    ADD CONSTRAINT collection_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);


--
-- Name: collection_activity collection_activity_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_activity
    ADD CONSTRAINT collection_activity_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: collection_invites collection_invites_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_invites
    ADD CONSTRAINT collection_invites_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE CASCADE;


--
-- Name: collection_invites collection_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_invites
    ADD CONSTRAINT collection_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: collection_invites collection_invites_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_invites
    ADD CONSTRAINT collection_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);


--
-- Name: collection_members collection_members_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_members
    ADD CONSTRAINT collection_members_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE CASCADE;


--
-- Name: collection_members collection_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.collection_members
    ADD CONSTRAINT collection_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: external_calendar_budgets external_calendar_budgets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_budgets
    ADD CONSTRAINT external_calendar_budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: external_calendar_connections external_calendar_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_connections
    ADD CONSTRAINT external_calendar_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: external_calendar_oauth external_calendar_oauth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_oauth
    ADD CONSTRAINT external_calendar_oauth_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: external_calendar_sources external_calendar_sources_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_sources
    ADD CONSTRAINT external_calendar_sources_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.external_calendar_connections(id) ON DELETE CASCADE;


--
-- Name: external_calendar_tokens external_calendar_tokens_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_calendar_tokens
    ADD CONSTRAINT external_calendar_tokens_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.external_calendar_connections(id) ON DELETE CASCADE;


--
-- Name: finance_budget_limits finance_budget_limits_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_budget_limits
    ADD CONSTRAINT finance_budget_limits_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id);


--
-- Name: finance_budget_limits finance_budget_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_budget_limits
    ADD CONSTRAINT finance_budget_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_budget_limits finance_budget_limits_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_budget_limits
    ADD CONSTRAINT finance_budget_limits_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: finance_categories finance_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_categories finance_categories_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: finance_positions finance_positions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_positions
    ADD CONSTRAINT finance_positions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_positions finance_positions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_positions
    ADD CONSTRAINT finance_positions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: finance_recurring finance_recurring_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_recurring
    ADD CONSTRAINT finance_recurring_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id);


--
-- Name: finance_recurring finance_recurring_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_recurring
    ADD CONSTRAINT finance_recurring_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_recurring finance_recurring_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_recurring
    ADD CONSTRAINT finance_recurring_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: finance_settings finance_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_settings
    ADD CONSTRAINT finance_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_settings finance_settings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_settings
    ADD CONSTRAINT finance_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: finance_transactions finance_transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id);


--
-- Name: finance_transactions finance_transactions_recurring_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_recurring_id_fkey FOREIGN KEY (recurring_id) REFERENCES public.finance_recurring(id);


--
-- Name: finance_transactions finance_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_transactions finance_transactions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: flashcard_decks flashcard_decks_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flashcard_decks
    ADD CONSTRAINT flashcard_decks_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: flashcard_decks flashcard_decks_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flashcard_decks
    ADD CONSTRAINT flashcard_decks_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: flashcard_decks_items flashcard_decks_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flashcard_decks_items
    ADD CONSTRAINT flashcard_decks_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: flashcard_decks_items flashcard_decks_items_parent_id_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flashcard_decks_items
    ADD CONSTRAINT flashcard_decks_items_parent_id_collection_id_fkey FOREIGN KEY (parent_id, collection_id) REFERENCES public.flashcard_decks(id, collection_id) ON DELETE CASCADE;


--
-- Name: flashcard_decks flashcard_decks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flashcard_decks
    ADD CONSTRAINT flashcard_decks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: focus_ownership focus_ownership_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.focus_ownership
    ADD CONSTRAINT focus_ownership_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.analytics_focus_sessions(id) ON DELETE CASCADE;


--
-- Name: focus_ownership focus_ownership_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.focus_ownership
    ADD CONSTRAINT focus_ownership_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learning_mistakes learning_mistakes_subject_id_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_mistakes
    ADD CONSTRAINT learning_mistakes_subject_id_topic_id_fkey FOREIGN KEY (subject_id, topic_id) REFERENCES public.learning_subjects_items(parent_id, id) ON DELETE CASCADE;


--
-- Name: learning_mistakes learning_mistakes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_mistakes
    ADD CONSTRAINT learning_mistakes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learning_mistakes learning_mistakes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_mistakes
    ADD CONSTRAINT learning_mistakes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: learning_progress learning_progress_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.flashcard_decks(id) ON DELETE SET NULL;


--
-- Name: learning_progress learning_progress_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.todos(id) ON DELETE SET NULL;


--
-- Name: learning_progress learning_progress_pomo_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_pomo_task_id_fkey FOREIGN KEY (pomo_task_id) REFERENCES public.pomo_tasks(id) ON DELETE SET NULL;


--
-- Name: learning_progress learning_progress_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.learning_subjects(id) ON DELETE CASCADE;


--
-- Name: learning_progress learning_progress_subject_id_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_subject_id_topic_id_fkey FOREIGN KEY (subject_id, topic_id) REFERENCES public.learning_subjects_items(parent_id, id) ON DELETE CASCADE;


--
-- Name: learning_progress learning_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_progress
    ADD CONSTRAINT learning_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learning_reviews learning_reviews_mistake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_reviews
    ADD CONSTRAINT learning_reviews_mistake_id_fkey FOREIGN KEY (mistake_id) REFERENCES public.learning_mistakes(id) ON DELETE SET NULL;


--
-- Name: learning_reviews learning_reviews_subject_id_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_reviews
    ADD CONSTRAINT learning_reviews_subject_id_topic_id_fkey FOREIGN KEY (subject_id, topic_id) REFERENCES public.learning_subjects_items(parent_id, id) ON DELETE CASCADE;


--
-- Name: learning_reviews learning_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_reviews
    ADD CONSTRAINT learning_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learning_subjects learning_subjects_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_subjects
    ADD CONSTRAINT learning_subjects_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: learning_subjects learning_subjects_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_subjects
    ADD CONSTRAINT learning_subjects_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: learning_subjects_items learning_subjects_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_subjects_items
    ADD CONSTRAINT learning_subjects_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: learning_subjects_items learning_subjects_items_parent_id_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_subjects_items
    ADD CONSTRAINT learning_subjects_items_parent_id_collection_id_fkey FOREIGN KEY (parent_id, collection_id) REFERENCES public.learning_subjects(id, collection_id) ON DELETE CASCADE;


--
-- Name: learning_subjects learning_subjects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.learning_subjects
    ADD CONSTRAINT learning_subjects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: module_collections module_collections_origin_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_collections
    ADD CONSTRAINT module_collections_origin_workspace_id_fkey FOREIGN KEY (origin_workspace_id) REFERENCES public.workspaces(id);


--
-- Name: module_collections module_collections_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.module_collections
    ADD CONSTRAINT module_collections_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- Name: password_sessions password_sessions_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_sessions
    ADD CONSTRAINT password_sessions_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: periodic_email_deliveries periodic_email_deliveries_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_email_deliveries
    ADD CONSTRAINT periodic_email_deliveries_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.periodic_tasks(id) ON DELETE CASCADE;


--
-- Name: periodic_email_deliveries periodic_email_deliveries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_email_deliveries
    ADD CONSTRAINT periodic_email_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: periodic_member_preferences periodic_member_preferences_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_member_preferences
    ADD CONSTRAINT periodic_member_preferences_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.periodic_tasks(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: periodic_member_preferences periodic_member_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_member_preferences
    ADD CONSTRAINT periodic_member_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: periodic_tasks periodic_tasks_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_tasks
    ADD CONSTRAINT periodic_tasks_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: periodic_tasks periodic_tasks_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_tasks
    ADD CONSTRAINT periodic_tasks_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: periodic_tasks periodic_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodic_tasks
    ADD CONSTRAINT periodic_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: plan_focus_links plan_focus_links_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_focus_links
    ADD CONSTRAINT plan_focus_links_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.pomo_tasks(id) ON DELETE CASCADE;


--
-- Name: plan_focus_links plan_focus_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_focus_links
    ADD CONSTRAINT plan_focus_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: plan_focus_links plan_focus_links_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_focus_links
    ADD CONSTRAINT plan_focus_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: plans plans_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: plans plans_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: plans plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pomo_task_member_preferences pomo_task_member_preferences_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_task_member_preferences
    ADD CONSTRAINT pomo_task_member_preferences_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.pomo_tasks(id) ON DELETE CASCADE;


--
-- Name: pomo_task_member_preferences pomo_task_member_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_task_member_preferences
    ADD CONSTRAINT pomo_task_member_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pomo_tasks pomo_tasks_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_tasks
    ADD CONSTRAINT pomo_tasks_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE CASCADE;


--
-- Name: pomo_tasks pomo_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_tasks
    ADD CONSTRAINT pomo_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: pomo_tasks pomo_tasks_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_tasks
    ADD CONSTRAINT pomo_tasks_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pomo_tasks pomo_tasks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomo_tasks
    ADD CONSTRAINT pomo_tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: pomodoro_history pomodoro_history_workspace_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pomodoro_history
    ADD CONSTRAINT pomodoro_history_workspace_owner_fk FOREIGN KEY (workspace_id, created_by) REFERENCES public.workspaces(id, user_id) ON DELETE CASCADE;


--
-- Name: quick_notes quick_notes_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_notes
    ADD CONSTRAINT quick_notes_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: quick_notes quick_notes_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quick_notes
    ADD CONSTRAINT quick_notes_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: rutin_members rutin_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_members
    ADD CONSTRAINT rutin_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.rutin_workspaces(id) ON DELETE CASCADE;


--
-- Name: rutin_occurrences rutin_occurrences_completed_by_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_occurrences
    ADD CONSTRAINT rutin_occurrences_completed_by_member_id_fkey FOREIGN KEY (completed_by_member_id) REFERENCES public.rutin_members(id) ON DELETE SET NULL;


--
-- Name: rutin_occurrences rutin_occurrences_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_occurrences
    ADD CONSTRAINT rutin_occurrences_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.rutin_members(id) ON DELETE SET NULL;


--
-- Name: rutin_occurrences rutin_occurrences_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_occurrences
    ADD CONSTRAINT rutin_occurrences_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.rutin_routines(id) ON DELETE CASCADE;


--
-- Name: rutin_recurrences rutin_recurrences_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_recurrences
    ADD CONSTRAINT rutin_recurrences_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.rutin_routines(id) ON DELETE CASCADE;


--
-- Name: rutin_routine_assignees rutin_routine_assignees_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_routine_assignees
    ADD CONSTRAINT rutin_routine_assignees_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.rutin_members(id) ON DELETE CASCADE;


--
-- Name: rutin_routine_assignees rutin_routine_assignees_routine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_routine_assignees
    ADD CONSTRAINT rutin_routine_assignees_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.rutin_routines(id) ON DELETE CASCADE;


--
-- Name: rutin_routines rutin_routines_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_routines
    ADD CONSTRAINT rutin_routines_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.rutin_workspaces(id) ON DELETE CASCADE;


--
-- Name: rutin_workspaces rutin_workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rutin_workspaces
    ADD CONSTRAINT rutin_workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: secure_notes secure_notes_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.secure_notes
    ADD CONSTRAINT secure_notes_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: secure_notes secure_notes_session_collection_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.secure_notes
    ADD CONSTRAINT secure_notes_session_collection_fk FOREIGN KEY (session_id, collection_id) REFERENCES public.password_sessions(id, collection_id) ON DELETE CASCADE;


--
-- Name: secure_notes secure_notes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.secure_notes
    ADD CONSTRAINT secure_notes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.password_sessions(id) ON DELETE CASCADE;


--
-- Name: todos todos_category_collection_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_category_collection_fk FOREIGN KEY (category_id, collection_id) REFERENCES public.categories(id, collection_id) ON DELETE SET NULL (category_id);


--
-- Name: todos todos_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: todos todos_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: todos todos_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: vault_acknowledgements vault_acknowledgements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_acknowledgements
    ADD CONSTRAINT vault_acknowledgements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vault_note_history vault_note_history_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_note_history
    ADD CONSTRAINT vault_note_history_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE CASCADE;


--
-- Name: vault_note_history vault_note_history_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_note_history
    ADD CONSTRAINT vault_note_history_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.secure_notes(id) ON DELETE CASCADE;


--
-- Name: vault_security_budgets vault_security_budgets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_security_budgets
    ADD CONSTRAINT vault_security_budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vault_security_challenges vault_security_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_security_challenges
    ADD CONSTRAINT vault_security_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vault_security_events vault_security_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vault_security_events
    ADD CONSTRAINT vault_security_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: work_blocks work_blocks_task_id_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_blocks
    ADD CONSTRAINT work_blocks_task_id_workspace_id_fkey FOREIGN KEY (task_id, workspace_id) REFERENCES public.work_tasks(id, workspace_id) ON DELETE CASCADE;


--
-- Name: work_blocks work_blocks_workspace_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_blocks
    ADD CONSTRAINT work_blocks_workspace_id_user_id_fkey FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, user_id) ON DELETE CASCADE;


--
-- Name: work_module_setup work_module_setup_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_module_setup
    ADD CONSTRAINT work_module_setup_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: work_projects work_projects_workspace_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_projects
    ADD CONSTRAINT work_projects_workspace_id_user_id_fkey FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, user_id) ON DELETE CASCADE;


--
-- Name: work_tasks work_tasks_project_id_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_tasks
    ADD CONSTRAINT work_tasks_project_id_workspace_id_fkey FOREIGN KEY (project_id, workspace_id) REFERENCES public.work_projects(id, workspace_id);


--
-- Name: work_tasks work_tasks_workspace_id_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_tasks
    ADD CONSTRAINT work_tasks_workspace_id_user_id_fkey FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, user_id) ON DELETE CASCADE;


--
-- Name: workout_library_exercises workout_library_exercises_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_library_exercises
    ADD CONSTRAINT workout_library_exercises_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id) ON DELETE CASCADE;


--
-- Name: workout_library_exercises workout_library_exercises_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_library_exercises
    ADD CONSTRAINT workout_library_exercises_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workout_library_exercises workout_library_exercises_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_library_exercises
    ADD CONSTRAINT workout_library_exercises_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workout_routines workout_routines_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_routines
    ADD CONSTRAINT workout_routines_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: workout_routines workout_routines_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_routines
    ADD CONSTRAINT workout_routines_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workout_routines_items workout_routines_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_routines_items
    ADD CONSTRAINT workout_routines_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: workout_routines_items workout_routines_items_parent_id_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_routines_items
    ADD CONSTRAINT workout_routines_items_parent_id_collection_id_fkey FOREIGN KEY (parent_id, collection_id) REFERENCES public.workout_routines(id, collection_id) ON DELETE CASCADE;


--
-- Name: workout_routines workout_routines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workout_routines
    ADD CONSTRAINT workout_routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: workspace_module_bindings workspace_module_bindings_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_module_bindings
    ADD CONSTRAINT workspace_module_bindings_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.module_collections(id);


--
-- Name: workspace_module_bindings workspace_module_bindings_personal_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_module_bindings
    ADD CONSTRAINT workspace_module_bindings_personal_collection_id_fkey FOREIGN KEY (personal_collection_id) REFERENCES public.module_collections(id);


--
-- Name: workspace_module_bindings workspace_module_bindings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_module_bindings
    ADD CONSTRAINT workspace_module_bindings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: workspaces workspaces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: api_budgets; Type: ROW SECURITY; Schema: private; Owner: postgres
--

ALTER TABLE private.api_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: background_dispatch_config; Type: ROW SECURITY; Schema: private; Owner: postgres
--

ALTER TABLE private.background_dispatch_config ENABLE ROW LEVEL SECURITY;

--
-- Name: client_error_counts; Type: ROW SECURITY; Schema: private; Owner: postgres
--

ALTER TABLE private.client_error_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_tickets; Type: ROW SECURITY; Schema: private; Owner: postgres
--

ALTER TABLE private.maintenance_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings Users can update own settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own settings" ON public.user_settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_settings Users can update own settings (update); Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own settings (update)" ON public.user_settings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_settings Users can view own settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: vault_note_history accessible_history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY accessible_history ON public.vault_note_history FOR SELECT TO authenticated USING ((public.collection_access(collection_id) AND public.vault_acknowledged(auth.uid())));


--
-- Name: flashcard_decks_items active_trash_parent; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_parent ON public.flashcard_decks_items AS RESTRICTIVE FOR SELECT TO authenticated USING (public.trash_parent_active('flashcards'::text, parent_id));


--
-- Name: learning_subjects_items active_trash_parent; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_parent ON public.learning_subjects_items AS RESTRICTIVE FOR SELECT TO authenticated USING (public.trash_parent_active('learning'::text, parent_id));


--
-- Name: workout_routines_items active_trash_parent; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_parent ON public.workout_routines_items AS RESTRICTIVE FOR SELECT TO authenticated USING (public.trash_parent_active('workout'::text, parent_id));


--
-- Name: activity_items active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.activity_items AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: code_snippets active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.code_snippets AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: flashcard_decks active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.flashcard_decks AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: learning_subjects active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.learning_subjects AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: periodic_tasks active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.periodic_tasks AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: plans active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.plans AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: pomo_tasks active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.pomo_tasks AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: quick_notes active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.quick_notes AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: todos active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.todos AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: workout_routines active_trash_records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY active_trash_records ON public.workout_routines AS RESTRICTIVE TO authenticated USING ((deleted_at IS NULL)) WITH CHECK (((deleted_at IS NULL) AND (deleted_by IS NULL)));


--
-- Name: activity_collection_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_collection_items ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_collection_items activity_collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY activity_collection_read ON public.activity_collection_items FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: activity_collections activity_collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY activity_collection_read ON public.activity_collections FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: activity_collections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_items ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_config ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_focus_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.analytics_focus_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: background_run_status; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.background_run_status ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: code_snippets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.code_snippets ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_activity; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.collection_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_activity collection_activity_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_activity_read ON public.collection_activity FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: activity_items collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.activity_items FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: categories collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.categories FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: code_snippets collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.code_snippets FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: flashcard_decks collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.flashcard_decks FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: learning_subjects collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.learning_subjects FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: password_sessions collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.password_sessions FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: periodic_tasks collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.periodic_tasks FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: plans collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.plans FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: quick_notes collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.quick_notes FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: secure_notes collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.secure_notes FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: todos collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.todos FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: workout_routines collection_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_delete ON public.workout_routines FOR DELETE TO authenticated USING (public.collection_write(collection_id));


--
-- Name: activity_items collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.activity_items FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: categories collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.categories FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: code_snippets collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.code_snippets FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: flashcard_decks collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.flashcard_decks FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: learning_subjects collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.learning_subjects FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: password_sessions collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.password_sessions FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: periodic_tasks collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.periodic_tasks FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: plans collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.plans FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: quick_notes collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.quick_notes FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: secure_notes collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.secure_notes FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: todos collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.todos FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: workout_routines collection_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_insert ON public.workout_routines FOR INSERT TO authenticated WITH CHECK (public.collection_write(collection_id));


--
-- Name: collection_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.collection_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.collection_members ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_members collection_members_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_members_read ON public.collection_members FOR SELECT TO authenticated USING (public.collection_member(collection_id));


--
-- Name: module_collections collection_metadata; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_metadata ON public.module_collections FOR SELECT TO authenticated USING (public.collection_member(id));


--
-- Name: activity_items collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.activity_items FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: categories collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.categories FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: code_snippets collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.code_snippets FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: flashcard_decks collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.flashcard_decks FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: learning_subjects collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.learning_subjects FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: password_sessions collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.password_sessions FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: periodic_tasks collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.periodic_tasks FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: plans collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.plans FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: quick_notes collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.quick_notes FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: secure_notes collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.secure_notes FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: todos collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.todos FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: workout_routines collection_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_read ON public.workout_routines FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: activity_items collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.activity_items FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: categories collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.categories FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: code_snippets collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.code_snippets FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: flashcard_decks collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.flashcard_decks FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: learning_subjects collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.learning_subjects FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: password_sessions collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.password_sessions FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: periodic_tasks collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.periodic_tasks FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: plans collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.plans FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: quick_notes collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.quick_notes FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: secure_notes collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.secure_notes FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: todos collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.todos FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: workout_routines collection_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY collection_update ON public.workout_routines FOR UPDATE TO authenticated USING (public.collection_write(collection_id)) WITH CHECK (public.collection_write(collection_id));


--
-- Name: external_calendar_budgets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.external_calendar_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: external_calendar_connections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.external_calendar_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: external_calendar_oauth; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.external_calendar_oauth ENABLE ROW LEVEL SECURITY;

--
-- Name: external_calendar_sources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.external_calendar_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: external_calendar_tokens; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.external_calendar_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_budget_limits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_budget_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_market_quotes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_market_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_positions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_positions ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_budget_limits finance_private; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY finance_private ON public.finance_budget_limits FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = finance_budget_limits.workspace_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: finance_categories finance_private; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY finance_private ON public.finance_categories FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = finance_categories.workspace_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: finance_positions finance_private; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY finance_private ON public.finance_positions FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = finance_positions.workspace_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: finance_recurring finance_private; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY finance_private ON public.finance_recurring FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = finance_recurring.workspace_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: finance_settings finance_private; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY finance_private ON public.finance_settings FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = finance_settings.workspace_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: finance_transactions finance_private; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY finance_private ON public.finance_transactions FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = finance_transactions.workspace_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: finance_market_quotes finance_quote_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY finance_quote_service ON public.finance_market_quotes TO service_role USING (true) WITH CHECK (true);


--
-- Name: finance_recurring; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_recurring ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_decks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_decks_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.flashcard_decks_items ENABLE ROW LEVEL SECURITY;

--
-- Name: focus_ownership; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.focus_ownership ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_mistakes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learning_mistakes ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_mistakes learning_private_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learning_private_read ON public.learning_mistakes FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.learning_subjects s
  WHERE ((s.id = learning_mistakes.subject_id) AND (s.deleted_at IS NULL) AND public.collection_access(s.collection_id))))));


--
-- Name: learning_progress learning_private_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learning_private_read ON public.learning_progress FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.learning_subjects s
  WHERE ((s.id = learning_progress.subject_id) AND (s.deleted_at IS NULL) AND public.collection_access(s.collection_id))))));


--
-- Name: learning_reviews learning_private_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY learning_private_read ON public.learning_reviews FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.learning_subjects s
  WHERE ((s.id = learning_reviews.subject_id) AND (s.deleted_at IS NULL) AND public.collection_access(s.collection_id))))));


--
-- Name: learning_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learning_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_subjects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learning_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_subjects_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.learning_subjects_items ENABLE ROW LEVEL SECURITY;

--
-- Name: module_collections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.module_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_acknowledgements own_ack; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY own_ack ON public.vault_acknowledgements FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: workspace_module_bindings own_bindings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY own_bindings ON public.workspace_module_bindings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = workspace_module_bindings.workspace_id) AND (w.user_id = auth.uid())))));


--
-- Name: collection_invites own_invites; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY own_invites ON public.collection_invites FOR SELECT TO authenticated USING (public.collection_owner(collection_id));


--
-- Name: periodic_member_preferences own_reminder_preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY own_reminder_preferences ON public.periodic_member_preferences FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.periodic_tasks t
  WHERE ((t.id = periodic_member_preferences.task_id) AND public.collection_access(t.collection_id))))));


--
-- Name: vault_security_events own_security_events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY own_security_events ON public.vault_security_events FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: password_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.password_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: periodic_email_deliveries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.periodic_email_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: periodic_member_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.periodic_member_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: periodic_tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.periodic_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_focus_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.plan_focus_links ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: pomo_task_member_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pomo_task_member_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: pomo_tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pomo_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: pomodoro_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pomodoro_history ENABLE ROW LEVEL SECURITY;

--
-- Name: quick_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: flashcard_decks_items read_collection_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_collection_items ON public.flashcard_decks_items FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: learning_subjects_items read_collection_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_collection_items ON public.learning_subjects_items FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: workout_routines_items read_collection_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_collection_items ON public.workout_routines_items FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: user_preferences read_own_preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_own_preferences ON public.user_preferences FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: pomo_tasks read_pomo_tasks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY read_pomo_tasks ON public.pomo_tasks FOR SELECT TO authenticated USING (public.collection_access(collection_id));


--
-- Name: activity_collection_items require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.activity_collection_items AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: activity_collections require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.activity_collections AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: activity_items require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.activity_items AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: analytics_config require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.analytics_config AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: analytics_events require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.analytics_events AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: analytics_focus_sessions require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.analytics_focus_sessions AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: background_run_status require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.background_run_status AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: categories require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.categories AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: code_snippets require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.code_snippets AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: collection_activity require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.collection_activity AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: collection_invites require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.collection_invites AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: collection_members require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.collection_members AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: external_calendar_budgets require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.external_calendar_budgets AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: external_calendar_connections require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.external_calendar_connections AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: external_calendar_oauth require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.external_calendar_oauth AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: external_calendar_sources require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.external_calendar_sources AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: external_calendar_tokens require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.external_calendar_tokens AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: finance_budget_limits require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.finance_budget_limits AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: finance_categories require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.finance_categories AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: finance_market_quotes require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.finance_market_quotes AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: finance_positions require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.finance_positions AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: finance_recurring require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.finance_recurring AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: finance_settings require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.finance_settings AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: finance_transactions require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.finance_transactions AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: flashcard_decks require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.flashcard_decks AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: flashcard_decks_items require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.flashcard_decks_items AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: focus_ownership require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.focus_ownership AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: learning_mistakes require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.learning_mistakes AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: learning_progress require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.learning_progress AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: learning_reviews require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.learning_reviews AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: learning_subjects require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.learning_subjects AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: learning_subjects_items require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.learning_subjects_items AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: module_collections require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.module_collections AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: password_sessions require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.password_sessions AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: periodic_email_deliveries require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.periodic_email_deliveries AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: periodic_member_preferences require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.periodic_member_preferences AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: periodic_tasks require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.periodic_tasks AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: plan_focus_links require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.plan_focus_links AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: plans require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.plans AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: pomo_task_member_preferences require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.pomo_task_member_preferences AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: pomo_tasks require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.pomo_tasks AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: pomodoro_history require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.pomodoro_history AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: quick_notes require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.quick_notes AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: rutin_members require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.rutin_members AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: rutin_occurrences require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.rutin_occurrences AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: rutin_recurrences require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.rutin_recurrences AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: rutin_routine_assignees require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.rutin_routine_assignees AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: rutin_routines require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.rutin_routines AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: rutin_workspaces require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.rutin_workspaces AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: secure_notes require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.secure_notes AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: todos require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.todos AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: trash_image_cleanup require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.trash_image_cleanup AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: user_preferences require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.user_preferences AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: user_settings require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.user_settings AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: vault_acknowledgements require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.vault_acknowledgements AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: vault_note_history require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.vault_note_history AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: vault_security_budgets require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.vault_security_budgets AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: vault_security_challenges require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.vault_security_challenges AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: vault_security_events require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.vault_security_events AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: work_blocks require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.work_blocks AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: work_module_setup require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.work_module_setup AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: work_projects require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.work_projects AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: work_tasks require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.work_tasks AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: workout_library_exercises require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.workout_library_exercises AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: workout_routines require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.workout_routines AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: workout_routines_items require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.workout_routines_items AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: workspace_module_bindings require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.workspace_module_bindings AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: workspaces require_verified_mfa; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY require_verified_mfa ON public.workspaces AS RESTRICTIVE TO authenticated USING (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied)) WITH CHECK (( SELECT public.session_mfa_satisfied() AS session_mfa_satisfied));


--
-- Name: rutin_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rutin_members ENABLE ROW LEVEL SECURITY;

--
-- Name: rutin_occurrences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rutin_occurrences ENABLE ROW LEVEL SECURITY;

--
-- Name: rutin_recurrences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rutin_recurrences ENABLE ROW LEVEL SECURITY;

--
-- Name: rutin_routine_assignees; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rutin_routine_assignees ENABLE ROW LEVEL SECURITY;

--
-- Name: rutin_routines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rutin_routines ENABLE ROW LEVEL SECURITY;

--
-- Name: rutin_workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.rutin_workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: secure_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.secure_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: todos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

--
-- Name: trash_image_cleanup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.trash_image_cleanup ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_acknowledgements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.vault_acknowledgements ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_note_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.vault_note_history ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_security_budgets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.vault_security_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_security_challenges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.vault_security_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_security_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.vault_security_events ENABLE ROW LEVEL SECURITY;

--
-- Name: work_blocks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.work_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: work_module_setup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.work_module_setup ENABLE ROW LEVEL SECURITY;

--
-- Name: work_blocks work_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY work_owner ON public.work_blocks FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = work_blocks.workspace_id) AND (w.user_id = auth.uid()) AND (w.archived_at IS NULL))))));


--
-- Name: work_projects work_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY work_owner ON public.work_projects FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = work_projects.workspace_id) AND (w.user_id = auth.uid()) AND (w.archived_at IS NULL))))));


--
-- Name: work_tasks work_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY work_owner ON public.work_tasks FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = work_tasks.workspace_id) AND (w.user_id = auth.uid()) AND (w.archived_at IS NULL))))));


--
-- Name: work_projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.work_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: work_tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.work_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_library_exercises; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workout_library_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_routines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workout_routines ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_routines_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workout_routines_items ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_module_bindings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workspace_module_bindings ENABLE ROW LEVEL SECURITY;

--
-- Name: pomodoro_history workspace_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY workspace_owner ON public.pomodoro_history TO authenticated USING (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = pomodoro_history.workspace_id) AND (w.user_id = auth.uid()) AND (w.archived_at IS NULL)))))) WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.workspaces w
  WHERE ((w.id = pomodoro_history.workspace_id) AND (w.user_id = auth.uid()) AND (w.archived_at IS NULL))))));


--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces workspaces_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY workspaces_owner ON public.workspaces TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: TYPE rutin_assignment_strategy; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TYPE public.rutin_assignment_strategy TO anon;
GRANT ALL ON TYPE public.rutin_assignment_strategy TO authenticated;


--
-- Name: TYPE rutin_member_role; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TYPE public.rutin_member_role TO anon;
GRANT ALL ON TYPE public.rutin_member_role TO authenticated;


--
-- Name: TYPE rutin_occurrence_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TYPE public.rutin_occurrence_status TO anon;
GRANT ALL ON TYPE public.rutin_occurrence_status TO authenticated;


--
-- Name: TYPE rutin_overdue_policy; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TYPE public.rutin_overdue_policy TO anon;
GRANT ALL ON TYPE public.rutin_overdue_policy TO authenticated;


--
-- Name: TYPE rutin_recurrence_kind; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TYPE public.rutin_recurrence_kind TO anon;
GRANT ALL ON TYPE public.rutin_recurrence_kind TO authenticated;


--
-- Name: TYPE rutin_workspace_type; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TYPE public.rutin_workspace_type TO anon;
GRANT ALL ON TYPE public.rutin_workspace_type TO authenticated;


--
-- Name: FUNCTION take_api_budget(uid uuid, name text, duration integer, quota integer); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION private.take_api_budget(uid uuid, name text, duration integer, quota integer) FROM PUBLIC;


--
-- Name: FUNCTION accept_collection_invite(invite_token text, wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.accept_collection_invite(invite_token text, wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_collection_invite(invite_token text, wid uuid) TO service_role;
GRANT ALL ON FUNCTION public.accept_collection_invite(invite_token text, wid uuid) TO authenticated;


--
-- Name: FUNCTION activity_library_context(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.activity_library_context(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activity_library_context(wid uuid) TO service_role;


--
-- Name: FUNCTION activity_library_load(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.activity_library_load(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activity_library_load(wid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.activity_library_load(wid uuid) TO service_role;


--
-- Name: FUNCTION activity_library_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.activity_library_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activity_library_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.activity_library_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) TO service_role;


--
-- Name: FUNCTION analytics_report(wid uuid, date_from date, date_to date, report_timezone text, personal boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.analytics_report(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_report(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_report(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) TO service_role;


--
-- Name: FUNCTION analytics_report_v2(wid uuid, date_from date, date_to date, report_timezone text, personal boolean, include_items boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.analytics_report_v2(wid uuid, date_from date, date_to date, report_timezone text, personal boolean, include_items boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_report_v2(wid uuid, date_from date, date_to date, report_timezone text, personal boolean, include_items boolean) TO service_role;


--
-- Name: FUNCTION analytics_summary(wid uuid, date_from date, date_to date, report_timezone text, personal boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.analytics_summary(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.analytics_summary(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) TO authenticated;
GRANT ALL ON FUNCTION public.analytics_summary(wid uuid, date_from date, date_to date, report_timezone text, personal boolean) TO service_role;


--
-- Name: FUNCTION application_auth_ready(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.application_auth_ready() FROM PUBLIC;
GRANT ALL ON FUNCTION public.application_auth_ready() TO anon;
GRANT ALL ON FUNCTION public.application_auth_ready() TO authenticated;
GRANT ALL ON FUNCTION public.application_auth_ready() TO service_role;


--
-- Name: FUNCTION application_migrations_ready(required jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.application_migrations_ready(required jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.application_migrations_ready(required jsonb) TO anon;
GRANT ALL ON FUNCTION public.application_migrations_ready(required jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.application_migrations_ready(required jsonb) TO service_role;


--
-- Name: FUNCTION application_release_ready(required_rpc text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.application_release_ready(required_rpc text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.application_release_ready(required_rpc text[]) TO anon;
GRANT ALL ON FUNCTION public.application_release_ready(required_rpc text[]) TO authenticated;
GRANT ALL ON FUNCTION public.application_release_ready(required_rpc text[]) TO service_role;


--
-- Name: FUNCTION application_security_ready(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.application_security_ready() FROM PUBLIC;
GRANT ALL ON FUNCTION public.application_security_ready() TO anon;
GRANT ALL ON FUNCTION public.application_security_ready() TO authenticated;
GRANT ALL ON FUNCTION public.application_security_ready() TO service_role;


--
-- Name: FUNCTION capture_analytics_event(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.capture_analytics_event() FROM PUBLIC;
GRANT ALL ON FUNCTION public.capture_analytics_event() TO service_role;


--
-- Name: FUNCTION check_api_budget(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.check_api_budget() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_api_budget() TO service_role;
GRANT ALL ON FUNCTION public.check_api_budget() TO anon;
GRANT ALL ON FUNCTION public.check_api_budget() TO authenticated;


--
-- Name: FUNCTION check_session_security(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.check_session_security() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_session_security() TO anon;
GRANT ALL ON FUNCTION public.check_session_security() TO authenticated;
GRANT ALL ON FUNCTION public.check_session_security() TO service_role;


--
-- Name: FUNCTION claim_due_periodic_emails(batch_size integer, recipient_filter text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.claim_due_periodic_emails(batch_size integer, recipient_filter text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_due_periodic_emails(batch_size integer, recipient_filter text) TO service_role;


--
-- Name: FUNCTION claim_focus_session(client_id uuid, payload jsonb, takeover boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.claim_focus_session(client_id uuid, payload jsonb, takeover boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_focus_session(client_id uuid, payload jsonb, takeover boolean) TO authenticated;
GRANT ALL ON FUNCTION public.claim_focus_session(client_id uuid, payload jsonb, takeover boolean) TO service_role;


--
-- Name: FUNCTION claim_periodic_email(uid uuid, tid uuid, wid uuid, tz text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.claim_periodic_email(uid uuid, tid uuid, wid uuid, tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_periodic_email(uid uuid, tid uuid, wid uuid, tz text) TO service_role;


--
-- Name: FUNCTION cleanup_operational_metrics(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.cleanup_operational_metrics() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_operational_metrics() TO service_role;


--
-- Name: FUNCTION collection_access(cid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.collection_access(cid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.collection_access(cid uuid) TO service_role;
GRANT ALL ON FUNCTION public.collection_access(cid uuid) TO authenticated;


--
-- Name: FUNCTION collection_details(cid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.collection_details(cid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.collection_details(cid uuid) TO service_role;
GRANT ALL ON FUNCTION public.collection_details(cid uuid) TO authenticated;


--
-- Name: FUNCTION collection_member(cid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.collection_member(cid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.collection_member(cid uuid) TO service_role;
GRANT ALL ON FUNCTION public.collection_member(cid uuid) TO authenticated;


--
-- Name: FUNCTION collection_owner(cid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.collection_owner(cid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.collection_owner(cid uuid) TO service_role;
GRANT ALL ON FUNCTION public.collection_owner(cid uuid) TO authenticated;


--
-- Name: FUNCTION collection_record_changed(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.collection_record_changed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.collection_record_changed() TO service_role;


--
-- Name: FUNCTION collection_write(cid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.collection_write(cid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.collection_write(cid uuid) TO service_role;
GRANT ALL ON FUNCTION public.collection_write(cid uuid) TO authenticated;


--
-- Name: FUNCTION consume_edge_budget(uid uuid, operation text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.consume_edge_budget(uid uuid, operation text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_edge_budget(uid uuid, operation text) TO service_role;


--
-- Name: FUNCTION consume_maintenance_ticket(ticket uuid, issued_at bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.consume_maintenance_ticket(ticket uuid, issued_at bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_maintenance_ticket(ticket uuid, issued_at bigint) TO service_role;


--
-- Name: FUNCTION create_collection_invite(wid uuid, module_id text, invite_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_collection_invite(wid uuid, module_id text, invite_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_collection_invite(wid uuid, module_id text, invite_role text) TO service_role;
GRANT ALL ON FUNCTION public.create_collection_invite(wid uuid, module_id text, invite_role text) TO authenticated;


--
-- Name: FUNCTION delete_note_category(wid uuid, category_id uuid, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_note_category(wid uuid, category_id uuid, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_note_category(wid uuid, category_id uuid, expected_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.delete_note_category(wid uuid, category_id uuid, expected_version integer) TO service_role;


--
-- Name: FUNCTION delete_workspace(wid uuid, expected_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.delete_workspace(wid uuid, expected_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_workspace(wid uuid, expected_name text) TO authenticated;
GRANT ALL ON FUNCTION public.delete_workspace(wid uuid, expected_name text) TO service_role;


--
-- Name: FUNCTION detach_collection(wid uuid, module_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.detach_collection(wid uuid, module_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.detach_collection(wid uuid, module_id text) TO service_role;
GRANT ALL ON FUNCTION public.detach_collection(wid uuid, module_id text) TO authenticated;


--
-- Name: FUNCTION end_focus_session(session_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.end_focus_session(session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_focus_session(session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.end_focus_session(session_id uuid) TO service_role;


--
-- Name: FUNCTION enqueue_scheduled_maintenance(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.enqueue_scheduled_maintenance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_scheduled_maintenance() TO service_role;


--
-- Name: FUNCTION ensure_default_workspace(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.ensure_default_workspace() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_default_workspace() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_default_workspace() TO service_role;


--
-- Name: FUNCTION ensure_module_bindings(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.ensure_module_bindings(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_module_bindings(wid uuid) TO service_role;
GRANT ALL ON FUNCTION public.ensure_module_bindings(wid uuid) TO authenticated;


--
-- Name: FUNCTION external_calendar_service(uid uuid, operation text, record_id uuid, payload jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.external_calendar_service(uid uuid, operation text, record_id uuid, payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.external_calendar_service(uid uuid, operation text, record_id uuid, payload jsonb) TO service_role;


--
-- Name: FUNCTION finance_budget_set(wid uuid, cid uuid, month_start date, limit_amount numeric, apply_scope text, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_budget_set(wid uuid, cid uuid, month_start date, limit_amount numeric, apply_scope text, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_budget_set(wid uuid, cid uuid, month_start date, limit_amount numeric, apply_scope text, expected_version integer) TO service_role;
GRANT ALL ON FUNCTION public.finance_budget_set(wid uuid, cid uuid, month_start date, limit_amount numeric, apply_scope text, expected_version integer) TO authenticated;


--
-- Name: FUNCTION finance_budget_state(wid uuid, month_start date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_budget_state(wid uuid, month_start date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_budget_state(wid uuid, month_start date) TO service_role;


--
-- Name: FUNCTION finance_cache_quotes(items jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_cache_quotes(items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_cache_quotes(items jsonb) TO service_role;


--
-- Name: FUNCTION finance_category_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_category_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_category_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) TO service_role;
GRANT ALL ON FUNCTION public.finance_category_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) TO authenticated;


--
-- Name: FUNCTION finance_inherit_category(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_inherit_category() FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_inherit_category() TO service_role;


--
-- Name: FUNCTION finance_load(wid uuid, month_start date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_load(wid uuid, month_start date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_load(wid uuid, month_start date) TO service_role;
GRANT ALL ON FUNCTION public.finance_load(wid uuid, month_start date) TO authenticated;


--
-- Name: FUNCTION finance_materialize(wid uuid, uid uuid, cutoff date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_materialize(wid uuid, uid uuid, cutoff date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_materialize(wid uuid, uid uuid, cutoff date) TO service_role;


--
-- Name: FUNCTION finance_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) TO service_role;
GRANT ALL ON FUNCTION public.finance_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) TO authenticated;


--
-- Name: FUNCTION finance_occurrence(anchor date, cadence text, n integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_occurrence(anchor date, cadence text, n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_occurrence(anchor date, cadence text, n integer) TO service_role;


--
-- Name: FUNCTION finance_page(wid uuid, entity text, month_start date, after_date date, after_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_page(wid uuid, entity text, month_start date, after_date date, after_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_page(wid uuid, entity text, month_start date, after_date date, after_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.finance_page(wid uuid, entity text, month_start date, after_date date, after_id uuid) TO authenticated;


--
-- Name: FUNCTION finance_position_values(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_position_values(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_position_values(wid uuid) TO service_role;


--
-- Name: FUNCTION finance_query(wid uuid, month_start date, filters jsonb, after_date date, after_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_query(wid uuid, month_start date, filters jsonb, after_date date, after_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_query(wid uuid, month_start date, filters jsonb, after_date date, after_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.finance_query(wid uuid, month_start date, filters jsonb, after_date date, after_id uuid) TO authenticated;


--
-- Name: FUNCTION finance_rollover_recurring(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_rollover_recurring() FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_rollover_recurring() TO service_role;


--
-- Name: FUNCTION finance_schedule_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_schedule_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_schedule_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) TO service_role;
GRANT ALL ON FUNCTION public.finance_schedule_mutate(wid uuid, operation text, rid uuid, payload jsonb, expected_version integer) TO authenticated;


--
-- Name: FUNCTION finance_summary(wid uuid, month_start date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_summary(wid uuid, month_start date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_summary(wid uuid, month_start date) TO service_role;
GRANT ALL ON FUNCTION public.finance_summary(wid uuid, month_start date) TO authenticated;


--
-- Name: FUNCTION finance_summary_before_budgets(wid uuid, month_start date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finance_summary_before_budgets(wid uuid, month_start date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finance_summary_before_budgets(wid uuid, month_start date) TO service_role;


--
-- Name: FUNCTION finish_periodic_email(did uuid, token uuid, success boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.finish_periodic_email(did uuid, token uuid, success boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_periodic_email(did uuid, token uuid, success boolean) TO service_role;


--
-- Name: FUNCTION fn_set_created_by(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_set_created_by() TO anon;
GRANT ALL ON FUNCTION public.fn_set_created_by() TO authenticated;
GRANT ALL ON FUNCTION public.fn_set_created_by() TO service_role;


--
-- Name: FUNCTION fn_set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.fn_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.fn_set_updated_at() TO service_role;


--
-- Name: FUNCTION focus_context(client_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.focus_context(client_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.focus_context(client_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.focus_context(client_id uuid) TO service_role;


--
-- Name: FUNCTION guard_collection_record(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.guard_collection_record() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_collection_record() TO service_role;


--
-- Name: FUNCTION guard_plan_period(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.guard_plan_period() TO anon;
GRANT ALL ON FUNCTION public.guard_plan_period() TO authenticated;
GRANT ALL ON FUNCTION public.guard_plan_period() TO service_role;


--
-- Name: FUNCTION guard_projected_array(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.guard_projected_array() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_projected_array() TO service_role;


--
-- Name: FUNCTION guard_trash_record(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.guard_trash_record() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_trash_record() TO service_role;


--
-- Name: FUNCTION guard_vault_ciphertext(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.guard_vault_ciphertext() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_vault_ciphertext() TO service_role;


--
-- Name: FUNCTION guard_workspace_archive(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.guard_workspace_archive() TO anon;
GRANT ALL ON FUNCTION public.guard_workspace_archive() TO authenticated;
GRANT ALL ON FUNCTION public.guard_workspace_archive() TO service_role;


--
-- Name: FUNCTION learning_context(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learning_context(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_context(wid uuid) TO service_role;


--
-- Name: FUNCTION learning_load(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learning_load(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_load(wid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.learning_load(wid uuid) TO service_role;


--
-- Name: FUNCTION learning_mistakes_page(wid uuid, filter text, after_time timestamp with time zone, after_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learning_mistakes_page(wid uuid, filter text, after_time timestamp with time zone, after_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_mistakes_page(wid uuid, filter text, after_time timestamp with time zone, after_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.learning_mistakes_page(wid uuid, filter text, after_time timestamp with time zone, after_id uuid) TO service_role;


--
-- Name: FUNCTION learning_mutate(wid uuid, operation text, sid uuid, tid text, payload jsonb, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learning_mutate(wid uuid, operation text, sid uuid, tid text, payload jsonb, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_mutate(wid uuid, operation text, sid uuid, tid text, payload jsonb, expected_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.learning_mutate(wid uuid, operation text, sid uuid, tid text, payload jsonb, expected_version integer) TO service_role;


--
-- Name: FUNCTION learning_name_limit(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learning_name_limit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_name_limit() TO service_role;


--
-- Name: FUNCTION learning_reorder(wid uuid, sid uuid, ordered_ids text[], expected_versions jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.learning_reorder(wid uuid, sid uuid, ordered_ids text[], expected_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.learning_reorder(wid uuid, sid uuid, ordered_ids text[], expected_versions jsonb) TO service_role;
GRANT ALL ON FUNCTION public.learning_reorder(wid uuid, sid uuid, ordered_ids text[], expected_versions jsonb) TO authenticated;


--
-- Name: FUNCTION manage_collection(cid uuid, action text, target_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.manage_collection(cid uuid, action text, target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.manage_collection(cid uuid, action text, target_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.manage_collection(cid uuid, action text, target_id uuid) TO authenticated;


--
-- Name: FUNCTION mark_member_reminder(task_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_member_reminder(task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_member_reminder(task_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_member_reminder(task_id uuid) TO service_role;


--
-- Name: FUNCTION mutate_collection_item(cid uuid, pid uuid, module_id text, operation text, item jsonb, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mutate_collection_item(cid uuid, pid uuid, module_id text, operation text, item jsonb, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mutate_collection_item(cid uuid, pid uuid, module_id text, operation text, item jsonb, expected_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.mutate_collection_item(cid uuid, pid uuid, module_id text, operation text, item jsonb, expected_version integer) TO service_role;


--
-- Name: FUNCTION note_image_access(object_name text, writing boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.note_image_access(object_name text, writing boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.note_image_access(object_name text, writing boolean) TO authenticated;
GRANT ALL ON FUNCTION public.note_image_access(object_name text, writing boolean) TO service_role;
GRANT ALL ON FUNCTION public.note_image_access(object_name text, writing boolean) TO anon;


--
-- Name: FUNCTION personal_workspace_reminders(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.personal_workspace_reminders() FROM PUBLIC;
GRANT ALL ON FUNCTION public.personal_workspace_reminders() TO authenticated;
GRANT ALL ON FUNCTION public.personal_workspace_reminders() TO service_role;


--
-- Name: FUNCTION plan_entries_load(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.plan_entries_load(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_entries_load(wid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.plan_entries_load(wid uuid) TO service_role;


--
-- Name: FUNCTION plan_entry_source(wid uuid, source text, rid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.plan_entry_source(wid uuid, source text, rid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_entry_source(wid uuid, source text, rid uuid) TO service_role;


--
-- Name: FUNCTION plan_focus_prepare(wid uuid, source text, rid uuid, seconds integer, estimate integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.plan_focus_prepare(wid uuid, source text, rid uuid, seconds integer, estimate integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_focus_prepare(wid uuid, source text, rid uuid, seconds integer, estimate integer) TO authenticated;
GRANT ALL ON FUNCTION public.plan_focus_prepare(wid uuid, source text, rid uuid, seconds integer, estimate integer) TO service_role;


--
-- Name: FUNCTION plan_focus_remove(wid uuid, source text, rid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.plan_focus_remove(wid uuid, source text, rid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_focus_remove(wid uuid, source text, rid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.plan_focus_remove(wid uuid, source text, rid uuid) TO service_role;


--
-- Name: FUNCTION plan_focus_source_available(wid uuid, tid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.plan_focus_source_available(wid uuid, tid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_focus_source_available(wid uuid, tid uuid) TO service_role;


--
-- Name: FUNCTION plan_focus_target(wid uuid, tid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.plan_focus_target(wid uuid, tid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_focus_target(wid uuid, tid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.plan_focus_target(wid uuid, tid uuid) TO service_role;


--
-- Name: FUNCTION pomonotes_history(wid uuid, tid uuid, before_time timestamp with time zone, before_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.pomonotes_history(wid uuid, tid uuid, before_time timestamp with time zone, before_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pomonotes_history(wid uuid, tid uuid, before_time timestamp with time zone, before_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pomonotes_history(wid uuid, tid uuid, before_time timestamp with time zone, before_id uuid) TO service_role;


--
-- Name: FUNCTION pomonotes_mutate(wid uuid, operation text, tid uuid, title text, estimate integer, focus_seconds integer, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.pomonotes_mutate(wid uuid, operation text, tid uuid, title text, estimate integer, focus_seconds integer, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pomonotes_mutate(wid uuid, operation text, tid uuid, title text, estimate integer, focus_seconds integer, expected_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.pomonotes_mutate(wid uuid, operation text, tid uuid, title text, estimate integer, focus_seconds integer, expected_version integer) TO service_role;


--
-- Name: FUNCTION pomonotes_page(wid uuid, status_filter text, search_text text, after_item jsonb, page_size integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.pomonotes_page(wid uuid, status_filter text, search_text text, after_item jsonb, page_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pomonotes_page(wid uuid, status_filter text, search_text text, after_item jsonb, page_size integer) TO authenticated;
GRANT ALL ON FUNCTION public.pomonotes_page(wid uuid, status_filter text, search_text text, after_item jsonb, page_size integer) TO service_role;


--
-- Name: FUNCTION pomonotes_search_target(wid uuid, tid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.pomonotes_search_target(wid uuid, tid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pomonotes_search_target(wid uuid, tid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pomonotes_search_target(wid uuid, tid uuid) TO service_role;


--
-- Name: FUNCTION preview_collection_invite(invite_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.preview_collection_invite(invite_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.preview_collection_invite(invite_token text) TO service_role;
GRANT ALL ON FUNCTION public.preview_collection_invite(invite_token text) TO authenticated;


--
-- Name: FUNCTION project_collection_items(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.project_collection_items() FROM PUBLIC;
GRANT ALL ON FUNCTION public.project_collection_items() TO service_role;


--
-- Name: FUNCTION purge_expired_trash(batch_size integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.purge_expired_trash(batch_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_expired_trash(batch_size integer) TO service_role;


--
-- Name: FUNCTION record_focus_session(payload jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.record_focus_session(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_focus_session(payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.record_focus_session(payload jsonb) TO service_role;


--
-- Name: FUNCTION record_focus_session_v1(payload jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.record_focus_session_v1(payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_focus_session_v1(payload jsonb) TO service_role;


--
-- Name: FUNCTION reorder_workout_exercises(cid uuid, pid uuid, ordered_ids text[], expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reorder_workout_exercises(cid uuid, pid uuid, ordered_ids text[], expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_workout_exercises(cid uuid, pid uuid, ordered_ids text[], expected_version integer) TO service_role;
GRANT ALL ON FUNCTION public.reorder_workout_exercises(cid uuid, pid uuid, ordered_ids text[], expected_version integer) TO authenticated;


--
-- Name: FUNCTION report_client_error(code text, screen text, release text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.report_client_error(code text, screen text, release text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_client_error(code text, screen text, release text) TO service_role;
GRANT ALL ON FUNCTION public.report_client_error(code text, screen text, release text) TO authenticated;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION rollover_collection_plans(cid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.rollover_collection_plans(cid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rollover_collection_plans(cid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rollover_collection_plans(cid uuid) TO service_role;


--
-- Name: FUNCTION save_member_reminder(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_member_reminder() FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_member_reminder() TO service_role;


--
-- Name: FUNCTION save_user_preferences(expected_user_id uuid, patch jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.save_user_preferences(expected_user_id uuid, patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_user_preferences(expected_user_id uuid, patch jsonb) TO service_role;
GRANT ALL ON FUNCTION public.save_user_preferences(expected_user_id uuid, patch jsonb) TO authenticated;


--
-- Name: FUNCTION seal_vault(sid uuid, previous_hash text, metadata text, notes jsonb, expected_version integer, new_name text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.seal_vault(sid uuid, previous_hash text, metadata text, notes jsonb, expected_version integer, new_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.seal_vault(sid uuid, previous_hash text, metadata text, notes jsonb, expected_version integer, new_name text) TO service_role;
GRANT ALL ON FUNCTION public.seal_vault(sid uuid, previous_hash text, metadata text, notes jsonb, expected_version integer, new_name text) TO authenticated;


--
-- Name: FUNCTION search_workspace(wid uuid, query_text text, page_size integer, page_offset integer, only_module text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.search_workspace(wid uuid, query_text text, page_size integer, page_offset integer, only_module text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_workspace(wid uuid, query_text text, page_size integer, page_offset integer, only_module text) TO authenticated;
GRANT ALL ON FUNCTION public.search_workspace(wid uuid, query_text text, page_size integer, page_offset integer, only_module text) TO service_role;


--
-- Name: FUNCTION session_mfa_satisfied(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.session_mfa_satisfied() FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_mfa_satisfied() TO service_role;
GRANT ALL ON FUNCTION public.session_mfa_satisfied() TO authenticated;


--
-- Name: FUNCTION set_created_by_auth(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_created_by_auth() TO anon;
GRANT ALL ON FUNCTION public.set_created_by_auth() TO authenticated;
GRANT ALL ON FUNCTION public.set_created_by_auth() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION sharing_binding_changed(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sharing_binding_changed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sharing_binding_changed() TO service_role;


--
-- Name: FUNCTION sharing_collection_changed(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sharing_collection_changed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sharing_collection_changed() TO service_role;


--
-- Name: FUNCTION sharing_context(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sharing_context(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sharing_context(wid uuid) TO service_role;
GRANT ALL ON FUNCTION public.sharing_context(wid uuid) TO authenticated;


--
-- Name: FUNCTION sharing_notify(topic text, payload jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sharing_notify(topic text, payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sharing_notify(topic text, payload jsonb) TO service_role;


--
-- Name: FUNCTION sharing_topic_access(topic text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.sharing_topic_access(topic text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sharing_topic_access(topic text) TO service_role;
GRANT ALL ON FUNCTION public.sharing_topic_access(topic text) TO authenticated;


--
-- Name: FUNCTION trash_change(wid uuid, module_id text, rid uuid, action text, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.trash_change(wid uuid, module_id text, rid uuid, action text, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trash_change(wid uuid, module_id text, rid uuid, action text, expected_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.trash_change(wid uuid, module_id text, rid uuid, action text, expected_version integer) TO service_role;


--
-- Name: FUNCTION trash_cleanup_images(ack text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.trash_cleanup_images(ack text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trash_cleanup_images(ack text[]) TO service_role;


--
-- Name: FUNCTION trash_empty(wid uuid, only_module text, cutoff timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.trash_empty(wid uuid, only_module text, cutoff timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trash_empty(wid uuid, only_module text, cutoff timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.trash_empty(wid uuid, only_module text, cutoff timestamp with time zone) TO service_role;


--
-- Name: FUNCTION trash_page(wid uuid, only_module text, query_text text, after_time timestamp with time zone, after_key text, page_size integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.trash_page(wid uuid, only_module text, query_text text, after_time timestamp with time zone, after_key text, page_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trash_page(wid uuid, only_module text, query_text text, after_time timestamp with time zone, after_key text, page_size integer) TO authenticated;
GRANT ALL ON FUNCTION public.trash_page(wid uuid, only_module text, query_text text, after_time timestamp with time zone, after_key text, page_size integer) TO service_role;


--
-- Name: FUNCTION trash_parent_active(module_id text, rid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.trash_parent_active(module_id text, rid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trash_parent_active(module_id text, rid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.trash_parent_active(module_id text, rid uuid) TO service_role;


--
-- Name: FUNCTION trash_purge_record(module_id text, rid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.trash_purge_record(module_id text, rid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trash_purge_record(module_id text, rid uuid) TO service_role;


--
-- Name: FUNCTION trash_table(module_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.trash_table(module_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.trash_table(module_id text) TO service_role;


--
-- Name: FUNCTION valid_user_preferences(value jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.valid_user_preferences(value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.valid_user_preferences(value jsonb) TO service_role;


--
-- Name: FUNCTION vault_acknowledge(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_acknowledge() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_acknowledge() TO service_role;
GRANT ALL ON FUNCTION public.vault_acknowledge() TO authenticated;


--
-- Name: FUNCTION vault_acknowledged(uid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_acknowledged(uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_acknowledged(uid uuid) TO service_role;
GRANT ALL ON FUNCTION public.vault_acknowledged(uid uuid) TO authenticated;


--
-- Name: FUNCTION vault_challenge_cancel(uid uuid, challenge uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_challenge_cancel(uid uuid, challenge uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_challenge_cancel(uid uuid, challenge uuid) TO service_role;


--
-- Name: FUNCTION vault_challenge_finish(uid uuid, challenge uuid, jwt_session text, mail_hash text, otp_hash text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_challenge_finish(uid uuid, challenge uuid, jwt_session text, mail_hash text, otp_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_challenge_finish(uid uuid, challenge uuid, jwt_session text, mail_hash text, otp_hash text) TO service_role;


--
-- Name: FUNCTION vault_challenge_start(uid uuid, sid uuid, challenge uuid, operation text, jwt_session text, mail_hash text, otp_hash text, expected_version integer, prepared jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_challenge_start(uid uuid, sid uuid, challenge uuid, operation text, jwt_session text, mail_hash text, otp_hash text, expected_version integer, prepared jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_challenge_start(uid uuid, sid uuid, challenge uuid, operation text, jwt_session text, mail_hash text, otp_hash text, expected_version integer, prepared jsonb) TO service_role;


--
-- Name: FUNCTION vault_ciphertext_storage_valid(value jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_ciphertext_storage_valid(value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_ciphertext_storage_valid(value jsonb) TO service_role;
GRANT ALL ON FUNCTION public.vault_ciphertext_storage_valid(value jsonb) TO authenticated;


--
-- Name: FUNCTION vault_cleanup(batch_size integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_cleanup(batch_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_cleanup(batch_size integer) TO service_role;


--
-- Name: FUNCTION vault_collection_ready(cid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_collection_ready(cid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_collection_ready(cid uuid) TO service_role;


--
-- Name: FUNCTION vault_envelope_valid(e jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_envelope_valid(e jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_envelope_valid(e jsonb) TO service_role;


--
-- Name: FUNCTION vault_import(wid uuid, new_name text, metadata text, notes jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_import(wid uuid, new_name text, metadata text, notes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_import(wid uuid, new_name text, metadata text, notes jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.vault_import(wid uuid, new_name text, metadata text, notes jsonb) TO service_role;


--
-- Name: FUNCTION vault_metadata_valid(value text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_metadata_valid(value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_metadata_valid(value text) TO service_role;


--
-- Name: FUNCTION vault_record_action(nid uuid, expected_version integer, operation text, hid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_record_action(nid uuid, expected_version integer, operation text, hid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_record_action(nid uuid, expected_version integer, operation text, hid uuid) TO service_role;
GRANT ALL ON FUNCTION public.vault_record_action(nid uuid, expected_version integer, operation text, hid uuid) TO authenticated;


--
-- Name: FUNCTION vault_security_budget(uid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_security_budget(uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_security_budget(uid uuid) TO service_role;


--
-- Name: FUNCTION vault_v2_storage_valid(value text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.vault_v2_storage_valid(value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_v2_storage_valid(value text) TO service_role;
GRANT ALL ON FUNCTION public.vault_v2_storage_valid(value text) TO authenticated;


--
-- Name: TABLE work_blocks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.work_blocks TO service_role;
GRANT SELECT ON TABLE public.work_blocks TO authenticated;


--
-- Name: FUNCTION work_block_data(b public.work_blocks); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.work_block_data(b public.work_blocks) FROM PUBLIC;
GRANT ALL ON FUNCTION public.work_block_data(b public.work_blocks) TO service_role;


--
-- Name: FUNCTION work_calendar(wid uuid, range_start timestamp with time zone, range_end timestamp with time zone, selected_project uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.work_calendar(wid uuid, range_start timestamp with time zone, range_end timestamp with time zone, selected_project uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.work_calendar(wid uuid, range_start timestamp with time zone, range_end timestamp with time zone, selected_project uuid) TO service_role;
GRANT ALL ON FUNCTION public.work_calendar(wid uuid, range_start timestamp with time zone, range_end timestamp with time zone, selected_project uuid) TO authenticated;


--
-- Name: FUNCTION work_load(wid uuid, selected_project uuid, after_created timestamp with time zone, after_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.work_load(wid uuid, selected_project uuid, after_created timestamp with time zone, after_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.work_load(wid uuid, selected_project uuid, after_created timestamp with time zone, after_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.work_load(wid uuid, selected_project uuid, after_created timestamp with time zone, after_id uuid) TO authenticated;


--
-- Name: FUNCTION work_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.work_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.work_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) TO service_role;
GRANT ALL ON FUNCTION public.work_mutate(wid uuid, entity text, operation text, rid uuid, payload jsonb, expected_version integer) TO authenticated;


--
-- Name: FUNCTION work_project_delete(wid uuid, pid uuid, expected_version integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.work_project_delete(wid uuid, pid uuid, expected_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.work_project_delete(wid uuid, pid uuid, expected_version integer) TO service_role;
GRANT ALL ON FUNCTION public.work_project_delete(wid uuid, pid uuid, expected_version integer) TO authenticated;


--
-- Name: FUNCTION work_save_details(wid uuid, tid uuid, task_payload jsonb, task_version integer, time_changes jsonb, time_removals jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.work_save_details(wid uuid, tid uuid, task_payload jsonb, task_version integer, time_changes jsonb, time_removals jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.work_save_details(wid uuid, tid uuid, task_payload jsonb, task_version integer, time_changes jsonb, time_removals jsonb) TO service_role;
GRANT ALL ON FUNCTION public.work_save_details(wid uuid, tid uuid, task_payload jsonb, task_version integer, time_changes jsonb, time_removals jsonb) TO authenticated;


--
-- Name: FUNCTION work_task(wid uuid, tid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.work_task(wid uuid, tid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.work_task(wid uuid, tid uuid) TO service_role;
GRANT ALL ON FUNCTION public.work_task(wid uuid, tid uuid) TO authenticated;


--
-- Name: TABLE workout_library_exercises; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workout_library_exercises TO service_role;


--
-- Name: FUNCTION workout_library_catalog_item(item public.workout_library_exercises); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workout_library_catalog_item(item public.workout_library_exercises) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workout_library_catalog_item(item public.workout_library_exercises) TO service_role;


--
-- Name: FUNCTION workout_library_collection(wid uuid, writing boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workout_library_collection(wid uuid, writing boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workout_library_collection(wid uuid, writing boolean) TO service_role;


--
-- Name: FUNCTION workout_library_load(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workout_library_load(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workout_library_load(wid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workout_library_load(wid uuid) TO service_role;


--
-- Name: FUNCTION workout_library_remove(wid uuid, rid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workout_library_remove(wid uuid, rid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workout_library_remove(wid uuid, rid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workout_library_remove(wid uuid, rid uuid) TO service_role;


--
-- Name: FUNCTION workout_library_save(wid uuid, request_id uuid, input jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workout_library_save(wid uuid, request_id uuid, input jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workout_library_save(wid uuid, request_id uuid, input jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.workout_library_save(wid uuid, request_id uuid, input jsonb) TO service_role;


--
-- Name: FUNCTION workspace_search_context(wid uuid, query_text text, counts_only boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workspace_search_context(wid uuid, query_text text, counts_only boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_search_context(wid uuid, query_text text, counts_only boolean) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_search_context(wid uuid, query_text text, counts_only boolean) TO service_role;


--
-- Name: FUNCTION workspace_search_documents(wid uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workspace_search_documents(wid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_search_documents(wid uuid) TO service_role;


--
-- Name: FUNCTION workspace_search_normalize(value text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workspace_search_normalize(value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_search_normalize(value text) TO service_role;


--
-- Name: FUNCTION workspace_search_text(value text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.workspace_search_text(value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_search_text(value text) TO service_role;


--
-- Name: TABLE activity_collection_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.activity_collection_items TO service_role;
GRANT SELECT ON TABLE public.activity_collection_items TO authenticated;


--
-- Name: TABLE activity_collections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.activity_collections TO service_role;
GRANT SELECT ON TABLE public.activity_collections TO authenticated;


--
-- Name: TABLE activity_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.activity_items TO anon;
GRANT ALL ON TABLE public.activity_items TO authenticated;
GRANT ALL ON TABLE public.activity_items TO service_role;


--
-- Name: TABLE analytics_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_config TO service_role;


--
-- Name: TABLE analytics_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_events TO service_role;


--
-- Name: SEQUENCE analytics_events_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.analytics_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.analytics_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.analytics_events_id_seq TO service_role;


--
-- Name: TABLE analytics_focus_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.analytics_focus_sessions TO service_role;


--
-- Name: TABLE background_run_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.background_run_status TO service_role;


--
-- Name: SEQUENCE background_run_status_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.background_run_status_id_seq TO anon;
GRANT ALL ON SEQUENCE public.background_run_status_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.background_run_status_id_seq TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.categories TO anon;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE code_snippets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.code_snippets TO anon;
GRANT ALL ON TABLE public.code_snippets TO authenticated;
GRANT ALL ON TABLE public.code_snippets TO service_role;


--
-- Name: TABLE collection_activity; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.collection_activity TO service_role;
GRANT SELECT ON TABLE public.collection_activity TO authenticated;


--
-- Name: SEQUENCE collection_activity_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.collection_activity_id_seq TO anon;
GRANT ALL ON SEQUENCE public.collection_activity_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.collection_activity_id_seq TO service_role;


--
-- Name: TABLE collection_invites; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.collection_invites TO service_role;


--
-- Name: TABLE collection_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.collection_members TO service_role;
GRANT SELECT ON TABLE public.collection_members TO authenticated;


--
-- Name: TABLE external_calendar_budgets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.external_calendar_budgets TO service_role;


--
-- Name: TABLE external_calendar_connections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.external_calendar_connections TO service_role;


--
-- Name: TABLE external_calendar_oauth; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.external_calendar_oauth TO service_role;


--
-- Name: TABLE external_calendar_sources; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.external_calendar_sources TO service_role;


--
-- Name: TABLE external_calendar_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.external_calendar_tokens TO service_role;


--
-- Name: TABLE finance_budget_limits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.finance_budget_limits TO service_role;
GRANT SELECT ON TABLE public.finance_budget_limits TO authenticated;


--
-- Name: TABLE finance_categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.finance_categories TO service_role;
GRANT SELECT ON TABLE public.finance_categories TO authenticated;


--
-- Name: TABLE finance_market_quotes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.finance_market_quotes TO service_role;


--
-- Name: TABLE finance_positions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.finance_positions TO service_role;
GRANT SELECT ON TABLE public.finance_positions TO authenticated;


--
-- Name: TABLE finance_recurring; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.finance_recurring TO service_role;
GRANT SELECT ON TABLE public.finance_recurring TO authenticated;


--
-- Name: TABLE finance_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.finance_settings TO service_role;
GRANT SELECT ON TABLE public.finance_settings TO authenticated;


--
-- Name: TABLE finance_transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.finance_transactions TO service_role;
GRANT SELECT ON TABLE public.finance_transactions TO authenticated;


--
-- Name: TABLE flashcard_decks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.flashcard_decks TO anon;
GRANT ALL ON TABLE public.flashcard_decks TO authenticated;
GRANT ALL ON TABLE public.flashcard_decks TO service_role;


--
-- Name: TABLE flashcard_decks_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.flashcard_decks_items TO service_role;
GRANT SELECT ON TABLE public.flashcard_decks_items TO authenticated;


--
-- Name: TABLE focus_ownership; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.focus_ownership TO service_role;


--
-- Name: TABLE learning_mistakes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learning_mistakes TO service_role;
GRANT SELECT ON TABLE public.learning_mistakes TO authenticated;


--
-- Name: TABLE learning_progress; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learning_progress TO service_role;
GRANT SELECT ON TABLE public.learning_progress TO authenticated;


--
-- Name: TABLE learning_reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learning_reviews TO service_role;
GRANT SELECT ON TABLE public.learning_reviews TO authenticated;


--
-- Name: TABLE learning_subjects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learning_subjects TO anon;
GRANT ALL ON TABLE public.learning_subjects TO authenticated;
GRANT ALL ON TABLE public.learning_subjects TO service_role;


--
-- Name: TABLE learning_subjects_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.learning_subjects_items TO service_role;
GRANT SELECT ON TABLE public.learning_subjects_items TO authenticated;


--
-- Name: TABLE module_collections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.module_collections TO service_role;
GRANT SELECT ON TABLE public.module_collections TO authenticated;


--
-- Name: TABLE password_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.password_sessions TO anon;
GRANT ALL ON TABLE public.password_sessions TO authenticated;
GRANT ALL ON TABLE public.password_sessions TO service_role;


--
-- Name: TABLE periodic_email_deliveries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.periodic_email_deliveries TO service_role;


--
-- Name: TABLE periodic_member_preferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.periodic_member_preferences TO service_role;
GRANT SELECT ON TABLE public.periodic_member_preferences TO authenticated;


--
-- Name: TABLE periodic_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.periodic_tasks TO anon;
GRANT ALL ON TABLE public.periodic_tasks TO authenticated;
GRANT ALL ON TABLE public.periodic_tasks TO service_role;


--
-- Name: TABLE plan_focus_links; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plan_focus_links TO service_role;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plans TO anon;
GRANT ALL ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;


--
-- Name: TABLE pomo_task_member_preferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pomo_task_member_preferences TO service_role;


--
-- Name: TABLE pomo_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pomo_tasks TO service_role;
GRANT SELECT ON TABLE public.pomo_tasks TO authenticated;


--
-- Name: TABLE pomodoro_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pomodoro_history TO anon;
GRANT ALL ON TABLE public.pomodoro_history TO authenticated;
GRANT ALL ON TABLE public.pomodoro_history TO service_role;


--
-- Name: TABLE quick_notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.quick_notes TO anon;
GRANT ALL ON TABLE public.quick_notes TO authenticated;
GRANT ALL ON TABLE public.quick_notes TO service_role;


--
-- Name: TABLE rutin_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rutin_members TO service_role;


--
-- Name: TABLE rutin_occurrences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rutin_occurrences TO service_role;


--
-- Name: TABLE rutin_recurrences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rutin_recurrences TO service_role;


--
-- Name: TABLE rutin_routine_assignees; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rutin_routine_assignees TO service_role;


--
-- Name: TABLE rutin_routines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rutin_routines TO service_role;


--
-- Name: TABLE rutin_workspaces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.rutin_workspaces TO service_role;


--
-- Name: TABLE secure_notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.secure_notes TO anon;
GRANT ALL ON TABLE public.secure_notes TO authenticated;
GRANT ALL ON TABLE public.secure_notes TO service_role;


--
-- Name: TABLE todos; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.todos TO anon;
GRANT ALL ON TABLE public.todos TO authenticated;
GRANT ALL ON TABLE public.todos TO service_role;


--
-- Name: TABLE trash_image_cleanup; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.trash_image_cleanup TO service_role;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_preferences TO service_role;
GRANT SELECT ON TABLE public.user_preferences TO authenticated;


--
-- Name: TABLE user_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_settings TO anon;
GRANT ALL ON TABLE public.user_settings TO authenticated;
GRANT ALL ON TABLE public.user_settings TO service_role;


--
-- Name: TABLE vault_acknowledgements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vault_acknowledgements TO service_role;
GRANT SELECT ON TABLE public.vault_acknowledgements TO authenticated;


--
-- Name: TABLE vault_note_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vault_note_history TO service_role;
GRANT SELECT ON TABLE public.vault_note_history TO authenticated;


--
-- Name: TABLE vault_security_budgets; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vault_security_budgets TO service_role;


--
-- Name: TABLE vault_security_challenges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vault_security_challenges TO service_role;


--
-- Name: TABLE vault_security_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vault_security_events TO service_role;
GRANT SELECT ON TABLE public.vault_security_events TO authenticated;


--
-- Name: TABLE work_module_setup; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.work_module_setup TO service_role;


--
-- Name: TABLE work_projects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.work_projects TO service_role;
GRANT SELECT ON TABLE public.work_projects TO authenticated;


--
-- Name: TABLE work_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.work_tasks TO service_role;
GRANT SELECT ON TABLE public.work_tasks TO authenticated;


--
-- Name: TABLE workout_routines; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workout_routines TO anon;
GRANT ALL ON TABLE public.workout_routines TO authenticated;
GRANT ALL ON TABLE public.workout_routines TO service_role;


--
-- Name: TABLE workout_routines_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workout_routines_items TO service_role;
GRANT SELECT ON TABLE public.workout_routines_items TO authenticated;


--
-- Name: TABLE workspace_module_bindings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.workspace_module_bindings TO service_role;
GRANT SELECT ON TABLE public.workspace_module_bindings TO authenticated;


--
-- Name: TABLE workspaces; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.workspaces TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- MFA is opt-in. Once a factor is verified, an AAL1 token cannot access app data.
create or replace function public.session_mfa_satisfied() returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); claims jsonb;
begin
 if uid is null then return false; end if;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if claims->>'aal'='aal2' then return true; end if;
 return not exists(select 1 from auth.mfa_factors where user_id=uid and status='verified');
end; $$;
revoke all on function public.session_mfa_satisfied() from public,anon,authenticated;
grant execute on function public.session_mfa_satisfied() to authenticated,service_role;
create or replace function public.check_session_security() returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.check_api_budget();
 if auth.uid() is not null and not public.session_mfa_satisfied() then
  raise sqlstate 'PGRST' using message='{"code":"MFA_REQUIRED","message":"MFA_REQUIRED","details":null,"hint":"Verify your authenticator code"}',detail='{"status":403}';
 end if;
end; $$;
revoke all on function public.check_session_security() from public;
grant execute on function public.check_session_security() to anon,authenticated,service_role;
do $$ declare previous text; t record; begin
 select substring(setting from length('pgrst.db_pre_request=')+1) into previous from pg_roles r cross join lateral unnest(r.rolconfig) setting
 where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
 if coalesce(previous,'') not in ('','public.check_api_budget','public.check_session_security') then raise exception 'EXISTING_API_HOOK_REQUIRES_REVIEW'; end if;
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
  execute format('drop policy if exists require_verified_mfa on %I.%I',t.nspname,t.relname);
  execute format('create policy require_verified_mfa on %I.%I as restrictive for all to authenticated using((select public.session_mfa_satisfied())) with check((select public.session_mfa_satisfied()))',t.nspname,t.relname);
 end loop;
 alter role authenticator set pgrst.db_pre_request='public.check_session_security';
end; $$;
notify pgrst,'reload config';
notify pgrst,'reload schema';

-- PostgREST requires both status and headers in the custom error detail.
create or replace function public.check_session_security() returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.check_api_budget();
 if auth.uid() is not null and not public.session_mfa_satisfied() then
  raise sqlstate 'PGRST' using message='{"code":"MFA_REQUIRED","message":"MFA_REQUIRED","details":null,"hint":"Verify your authenticator code"}',detail='{"status":403,"headers":{}}';
 end if;
end; $$;
revoke all on function public.check_session_security() from public;
grant execute on function public.check_session_security() to anon,authenticated,service_role;
notify pgrst,'reload schema';

commit;
