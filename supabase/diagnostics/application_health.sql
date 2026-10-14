-- Run the ENTIRE script once in Supabase SQL Editor as postgres.
-- Public application data/schema are only read. Only a session-local temporary results table is written.
-- No email, note body, invite token, password, lease, or personal identity is returned.
-- PASS=verified; FAIL=missing/unsafe; WARN=needs investigation; SKIP=dependency missing.
-- Checks DB structure and aggregate consistency, not deployed Edge secrets, browser/network state or UI.
create temporary table if not exists todo_application_health (
  status text, area text, check_name text, detail text, next_action text
);
truncate table pg_temp.todo_application_health;
do $health$
declare r record; c text; name text; typ text; actual text; missing text; rel oid; fn oid;
  enabled boolean; is_private boolean; n bigint; bad boolean; auth_role oid; anon_role oid; service_role_id oid;
begin
  select oid into auth_role from pg_roles where rolname='authenticated';
  select oid into anon_role from pg_roles where rolname='anon';
  select oid into service_role_id from pg_roles where rolname='service_role';
  insert into pg_temp.todo_application_health values
    (case when auth_role is not null and anon_role is not null and service_role_id is not null then 'PASS' else 'FAIL' end,
      'environment','API roles','authenticated / anon / service_role','Run in the intended Supabase project as postgres.'),
    (case when current_user='postgres' or exists(select 1 from pg_roles where rolname=current_user and rolsuper) then 'PASS' else 'WARN' end,
      'environment','Audit identity',current_user,'SQL Editor postgres must be able to see every row; restricted identities make data counts incomplete.');
  for r in select * from (values
      ('workspaces','id:uuid,user_id:uuid,name:text,active_modules:text[],is_default:boolean,archived_at:timestamp with time zone',false),
      ('module_collections','id:uuid,module:text,owner_id:uuid,origin_workspace_id:uuid,shared:boolean,epoch:integer',false),
      ('collection_members','collection_id:uuid,user_id:uuid,role:text',false),
      ('workspace_module_bindings','workspace_id:uuid,module:text,collection_id:uuid,personal_collection_id:uuid',false),
      ('collection_invites','id:uuid,collection_id:uuid,token_hash:text,created_by:uuid,expires_at:timestamp with time zone,used_at:timestamp with time zone,used_by:uuid,revoked_at:timestamp with time zone,invite_role:text',false),
      ('collection_activity','collection_id:uuid,record_id:uuid,actor_id:uuid,operation:text',false),
      ('periodic_member_preferences','task_id:uuid,user_id:uuid,notify_email:boolean,notify_browser:boolean,reminder_time:time without time zone',false),
      ('pomo_task_member_preferences','task_id:uuid,user_id:uuid,estimated_sessions:integer,focus_seconds:integer,first_estimate_seconds:integer',true),
      ('analytics_config','id:boolean,recording_started_at:timestamp with time zone',true),
      ('analytics_events','id:bigint,collection_id:uuid,record_id:uuid,module:text,kind:text,actor_id:uuid,completed:boolean,occurred_at:timestamp with time zone',true),
      ('analytics_focus_sessions','id:uuid,user_id:uuid,workspace_id:uuid,started_at:timestamp with time zone,planned_seconds:integer,revision:bigint,status:text,segments:jsonb,association:text,task_id:uuid,collection_id:uuid,estimated_sessions:integer,goal_seconds:integer,credited_segments:jsonb,credited_completed:boolean,writer_client:uuid,writer_lease:uuid,updated_at:timestamp with time zone',true),
      ('focus_ownership','user_id:uuid,session_id:uuid,client_id:uuid,lease:uuid,expires_at:timestamp with time zone,segment_started_at:timestamp with time zone',true),
      ('periodic_email_deliveries','id:uuid,user_id:uuid,task_id:uuid,delivery_day:date,payload:jsonb,attempts:integer,lease:uuid,claimed_at:timestamp with time zone,delivered_at:timestamp with time zone',true),
      ('plans','id:uuid,user_id:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('todos','id:uuid,created_by:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('quick_notes','id:uuid,created_by:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('password_sessions','id:uuid,created_by:uuid,workspace_id:uuid,collection_id:uuid,version:integer,password_hash:text',false),
      ('code_snippets','id:uuid,created_by:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('pomo_tasks','id:uuid,created_by:uuid,workspace_id:uuid,collection_id:uuid,version:integer,title:text,completed:boolean,created_at:timestamp with time zone,updated_at:timestamp with time zone',false),
      ('learning_subjects','id:uuid,user_id:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('flashcard_decks','id:uuid,user_id:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('workout_routines','id:uuid,user_id:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('periodic_tasks','id:uuid,user_id:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('activity_items','id:uuid,user_id:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('categories','id:uuid,created_by:uuid,workspace_id:uuid,collection_id:uuid,version:integer',false),
      ('secure_notes','id:uuid,created_by:uuid,workspace_id:uuid,collection_id:uuid,version:integer,session_id:uuid,encrypted_payload:jsonb',false),
      ('learning_subjects_items','parent_id:uuid,collection_id:uuid,id:text,data:jsonb,position:integer,version:integer',false),
      ('flashcard_decks_items','parent_id:uuid,collection_id:uuid,id:text,data:jsonb,position:integer,version:integer',false),
      ('workout_routines_items','parent_id:uuid,collection_id:uuid,id:text,data:jsonb,position:integer,version:integer',false)
    ) v(table_name,columns,is_private) loop
    rel:=to_regclass('public.'||r.table_name);
    if rel is null then
      insert into pg_temp.todo_application_health values('FAIL','schema',r.table_name,'Table missing','Apply the missing setup/migration; do not reset or delete existing data.');
      continue;
    end if;
    missing:='';
    foreach c in array string_to_array(r.columns,',') loop
      name:=split_part(c,':',1);typ:=split_part(c,':',2);
      select format_type(atttypid,atttypmod) into actual from pg_attribute where attrelid=rel and attname=name and attnum>0 and not attisdropped;
      if actual is null or actual<>typ then missing:=missing||name||' expected '||typ||', found '||coalesce(actual,'MISSING')||'; '; end if;
    end loop;
    insert into pg_temp.todo_application_health values(case when missing='' then 'PASS' else 'FAIL' end,'schema',r.table_name||' columns',coalesce(nullif(missing,''),'Required columns/types present'),'Resolve mismatched schema with an incremental migration.');
    select relrowsecurity into enabled from pg_class where oid=rel;
    insert into pg_temp.todo_application_health values(case when enabled or r.table_name='analytics_config' then 'PASS' else 'FAIL' end,'RLS',r.table_name,
      case when enabled then 'Enabled' when r.table_name='analytics_config' then 'Internal config: API grants must be revoked' else 'Disabled' end,'Enable RLS and restore scoped policies; never add USING (true) to silence access errors.');
    insert into pg_temp.todo_application_health values(case when exists(select 1 from pg_constraint where conrelid=rel and contype='p') then 'PASS' else 'FAIL' end,
      'constraints',r.table_name||' primary key','Duplicate row identity protection','Restore the primary key after resolving any duplicates.');
    if r.is_private and auth_role is not null and anon_role is not null then
      bad:=has_table_privilege(auth_role,rel,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege(auth_role,rel,'SELECT,INSERT,UPDATE')
        or has_table_privilege(anon_role,rel,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege(anon_role,rel,'SELECT,INSERT,UPDATE');
      insert into pg_temp.todo_application_health values(case when bad then 'FAIL' else 'PASS' end,'permissions',r.table_name||' private API access',
        case when bad then 'Direct API table/column access granted' else 'Direct API access revoked' end,'Revoke table AND column grants from authenticated/anon; use the checked RPCs.');
    end if;
  end loop;
  for r in select * from (values
    ('pomo_tasks','id,collection_id,workspace_id,created_by,title,completed,created_at,updated_at,version'),
    ('pomo_task_member_preferences','task_id,user_id,estimated_sessions,focus_seconds'),
    ('analytics_focus_sessions','id,user_id,workspace_id,started_at,planned_seconds,revision,status,segments,association,credited_completed'),
    ('focus_ownership','user_id,session_id,client_id,lease,expires_at'),
    ('workspaces','id,user_id,name,active_modules,is_default'),
    ('module_collections','id,module,owner_id,origin_workspace_id,shared,epoch'),
    ('collection_members','collection_id,user_id,role'),
    ('workspace_module_bindings','workspace_id,module,collection_id,personal_collection_id')
  ) v(table_name,columns) loop
    rel:=to_regclass('public.'||r.table_name);
    if rel is null then continue; end if;
    missing:='';
    foreach name in array string_to_array(r.columns,',') loop
      if not exists(select 1 from pg_attribute where attrelid=rel and attname=name and not attisdropped and attnotnull) then missing:=missing||name||', '; end if;
    end loop;
    insert into pg_temp.todo_application_health values(case when missing='' then 'PASS' else 'FAIL' end,'constraints',r.table_name||' required NOT NULL',
      coalesce(nullif(missing,''),'Required nullability present'),'Review existing NULL rows before restoring NOT NULL; retain valid data.');
  end loop;
  for r in select * from (values
      ('ensure_default_workspace()','auth'),
      ('ensure_module_bindings(uuid)','auth'),
      ('sharing_context(uuid)','auth'),
      ('create_collection_invite(uuid,text,text)','auth'),
      ('preview_collection_invite(text)','auth'),
      ('accept_collection_invite(text,uuid)','auth'),
      ('detach_collection(uuid,text)','auth'),
      ('manage_collection(uuid,text,uuid)','auth'),
      ('collection_details(uuid)','auth'),
      ('collection_access(uuid)','auth'),
      ('collection_write(uuid)','auth'),
      ('sharing_topic_access(text)','auth'),
      ('mutate_collection_item(uuid,uuid,text,text,jsonb,integer)','auth'),
      ('personal_workspace_reminders()','auth'),
      ('mark_member_reminder(uuid)','auth'),
      ('rollover_collection_plans(uuid)','auth'),
      ('seal_vault(uuid,text,text,jsonb,integer,text)','auth'),
      ('record_focus_session(jsonb)','auth'),
      ('record_focus_session_v1(jsonb)','internal'),
      ('focus_context(uuid)','auth'),
      ('claim_focus_session(uuid,jsonb,boolean)','auth'),
      ('end_focus_session(uuid)','auth'),
      ('pomonotes_mutate(uuid,text,uuid,text,integer,integer,integer)','auth'),
      ('pomonotes_page(uuid,text,text,jsonb,integer)','auth'),
      ('pomonotes_history(uuid,uuid,timestamp with time zone,uuid)','auth'),
      ('analytics_report(uuid,date,date,text,boolean)','auth'),
      ('analytics_summary(uuid,date,date,text,boolean)','auth'),
      ('analytics_report_v2(uuid,date,date,text,boolean,boolean)','internal'),
      ('claim_periodic_email(uuid,uuid,uuid,text)','service'),
      ('finish_periodic_email(uuid,uuid,boolean)','service')
    ) v(signature,access_kind) loop
    fn:=to_regprocedure('public.'||r.signature);
    if fn is null then
      insert into pg_temp.todo_application_health values('FAIL','RPC',r.signature,'Exact function signature missing','Apply the corresponding current migration, then NOTIFY pgrst, ''reload schema''.');
      continue;
    end if;
    select prosecdef into enabled from pg_proc where oid=fn;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'RPC',r.signature||' security definer',enabled::text,'Compare with the current migration; changing the execution identity can break RLS-protected helpers.');
    select exists(select 1 from pg_proc p,unnest(p.proconfig) cfg where p.oid=fn and cfg like 'search_path=%' and replace(cfg,' ','')='search_path=public,pg_temp') into enabled;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'RPC',r.signature||' search_path','Expected public, pg_temp','Restore a fixed search_path from the current migration.');
    select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=fn and a.grantee=0 and a.privilege_type='EXECUTE') into bad;
    actual:=format('Expected=%s; PUBLIC=%s; anon=%s; authenticated=%s; service_role=%s',r.access_kind,bad,
      coalesce(has_function_privilege(anon_role,fn,'EXECUTE')::text,'role missing'),
      coalesce(has_function_privilege(auth_role,fn,'EXECUTE')::text,'role missing'),
      coalesce(has_function_privilege(service_role_id,fn,'EXECUTE')::text,'role missing'));
    if anon_role is not null then bad:=bad or has_function_privilege(anon_role,fn,'EXECUTE'); end if;
    if auth_role is not null then bad:=bad or (has_function_privilege(auth_role,fn,'EXECUTE')<>(r.access_kind='auth')); end if;
    if r.access_kind='service' and service_role_id is not null then bad:=bad or not has_function_privilege(service_role_id,fn,'EXECUTE'); end if;
    insert into pg_temp.todo_application_health values(case when bad then 'FAIL' else 'PASS' end,'permissions',r.signature||' execute',
      actual,'Use the exact REVOKE/GRANT statements from the corresponding migration.');
  end loop;
  for r in select * from (values
      ('ensure_default_workspace()','2e21ea151d5d387415d39136ce3ea824','workspaces.sql'),
      ('ensure_module_bindings(uuid)','f641550c8d49f6e0875254b60e3b8611','202610110002_pomonotes.sql'),
      ('sharing_context(uuid)','0620c2b593d516defae89a4b53868e90','tab_sharing_permissions.sql'),
      ('create_collection_invite(uuid,text,text)','a8ab42c48203d894052675471b49cee1','202610110002_pomonotes.sql'),
      ('preview_collection_invite(text)','4fc9af9ea6f51aebbe6f4f32399bb2c0','tab_sharing_permissions.sql'),
      ('accept_collection_invite(text,uuid)','f115d57a917faa6260f8b357c837a7d1','tab_sharing_permissions.sql'),
      ('detach_collection(uuid,text)','fead7d12557ffe6c1af3d755a46a4ea5','tab_sharing.sql'),
      ('manage_collection(uuid,text,uuid)','6dc596e55439e218993a48c7ee2d53dc','tab_sharing.sql'),
      ('collection_details(uuid)','0c843ac1eaeb663ef43a2ff2b9d3d705','tab_sharing_permissions.sql'),
      ('collection_access(uuid)','7c01a16f46993bbf1ee130ebdd9570e0','tab_sharing.sql'),
      ('collection_write(uuid)','03bc3ca44b362b1263e178673af55fba','tab_sharing_permissions.sql'),
      ('sharing_topic_access(text)','72ce8b42857a1b575f4a7cfa18f904fd','tab_sharing.sql'),
      ('mutate_collection_item(uuid,uuid,text,text,jsonb,integer)','b61bbd8879922fba304e91edd423d3b2','tab_sharing_modules.sql'),
      ('personal_workspace_reminders()','d441bcee330cfb2ce809fb7743630239','tab_sharing_modules.sql'),
      ('mark_member_reminder(uuid)','ab2f9c4ffdaf6407b47ff6c8e5a749d9','tab_sharing_modules.sql'),
      ('rollover_collection_plans(uuid)','34816d3f470d2967819d523c6dfaeef2','tab_sharing_modules.sql'),
      ('seal_vault(uuid,text,text,jsonb,integer,text)','6162c8d407a72f8d6dbecc0c10cf36a2','tab_sharing_vault.sql'),
      ('record_focus_session(jsonb)','db5ecb537afd914c9a7b80e5ef290807','202610110003_focus_repair.sql'),
      ('record_focus_session_v1(jsonb)','87f87d4452d24421043412d6e2d423cb','202610110003_focus_repair.sql'),
      ('focus_context(uuid)','189bb9176a585c265d06c941dff88ead','202610110003_focus_repair.sql'),
      ('claim_focus_session(uuid,jsonb,boolean)','a3bd564d2abd5d74a637006c40c911b7','202610110003_focus_repair.sql'),
      ('end_focus_session(uuid)','b31775721646e0a39ff280d3c087c184','202610110003_focus_repair.sql'),
      ('pomonotes_mutate(uuid,text,uuid,text,integer,integer,integer)','a49278654e4cab9227e9803b79e1ca6a','202610110002_pomonotes.sql'),
      ('pomonotes_page(uuid,text,text,jsonb,integer)','70ea7060b1e3ca29212cee784c6b8189','202610110002_pomonotes.sql'),
      ('pomonotes_history(uuid,uuid,timestamp with time zone,uuid)','0c90617ba3c16b64c56702585bd3ddf1','202610110002_pomonotes.sql'),
      ('analytics_report(uuid,date,date,text,boolean)','c5af96713a77a7c114e6f4983601311f','202610110002_pomonotes.sql'),
      ('analytics_summary(uuid,date,date,text,boolean)','97531a2f325b9c68fdba0e0df39487be','202610110002_pomonotes.sql'),
      ('analytics_report_v2(uuid,date,date,text,boolean,boolean)','e8bb5ebcab7fba1a8089e9070650397f','202610110002_pomonotes.sql'),
      ('claim_periodic_email(uuid,uuid,uuid,text)','43f02f8b8a28906873c1dc4639c5f99d','202610110001_reminder_delivery.sql'),
      ('finish_periodic_email(uuid,uuid,boolean)','48653fcf8d0d74580885ca42be98b1c9','202610110001_reminder_delivery.sql')
    ) v(signature,expected_hash,migration) loop
    fn:=to_regprocedure('public.'||r.signature);
    if fn is not null then
      select md5(btrim(regexp_replace(prosrc,'[[:space:]]+',' ','g'))) into actual from pg_proc where oid=fn;
      insert into pg_temp.todo_application_health values(case when actual=r.expected_hash then 'PASS' else 'WARN' end,'versions',r.signature,
        case when actual=r.expected_hash then 'Matches repository function body' else 'Function body differs from the current repository' end,
        'Expected definition: '||r.migration||'. Formatting/custom changes can also differ; review before applying anything.');
    end if;
  end loop;
  for r in select * from (values ('plans','plans','user_id'),
      ('todos','detailed','created_by'),
      ('quick_notes','quick','created_by'),
      ('password_sessions','secure','created_by'),
      ('code_snippets','code','created_by'),
      ('pomo_tasks','pomodoro','created_by'),
      ('learning_subjects','learning','user_id'),
      ('flashcard_decks','flashcards','user_id'),
      ('workout_routines','workout','user_id'),
      ('periodic_tasks','periodic','user_id'),
      ('activity_items','activities','user_id'),
      ('categories','detailed','created_by'),('secure_notes','secure','created_by')) v(table_name,module_id,owner_column) loop
    rel:=to_regclass('public.'||r.table_name);
    if rel is null then continue; end if;
    for name in select unnest(array['guard_collection_record','collection_record_changed']) loop
      select exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=rel and not t.tgisinternal
        and t.tgname=name and p.proname=name and t.tgenabled in ('O','A') and
        (name<>'guard_collection_record' or encode(t.tgargs,'hex')=encode(convert_to(r.module_id,'UTF8'),'hex')||'00'||encode(convert_to(r.owner_column,'UTF8'),'hex')||'00')) into enabled;
      insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'triggers',r.table_name||'.'||name,
        'Function, enabled state and guard arguments','Restore this trigger from the current sharing/module migration.');
    end loop;
    if r.table_name in ('quick_notes','todos','plans','pomo_tasks') then
      select exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=rel and not t.tgisinternal and t.tgname='analytics_capture'
        and p.proname='capture_analytics_event' and t.tgenabled in ('O','A') and encode(t.tgargs,'hex')=encode(convert_to(r.module_id,'UTF8'),'hex')||'00') into enabled;
      insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'triggers',r.table_name||'.analytics_capture','Analytics event recording','Restore the analytics trigger; old history cannot be invented.');
    end if;
    select string_agg(polname,', ') into actual from pg_policy where polrelid=rel and polpermissive and
      (lower(coalesce(pg_get_expr(polqual,polrelid),'')) in ('true','(true)') or lower(coalesce(pg_get_expr(polwithcheck,polrelid),'')) in ('true','(true)')
       or coalesce(pg_get_expr(polqual,polrelid),'') ilike '%created_by IS NULL%');
    insert into pg_temp.todo_application_health values(case when actual is null then 'PASS' else 'FAIL' end,'policies',r.table_name||' broad legacy policies',
      coalesce(actual,'No unconditional / nullable-owner legacy policy found'),'Permissive policies combine with OR. Remove broad legacy policies after reviewing current collection policies.');
    begin
      execute format('select count(*) from public.%I t left join public.module_collections c on c.id=t.collection_id where t.collection_id is null or c.id is null or c.module<>$1 or t.workspace_id is distinct from c.origin_workspace_id',r.table_name) into n using r.module_id;
      insert into pg_temp.todo_application_health values(case when n=0 then 'PASS' else 'FAIL' end,'data',r.table_name||' collection scope',n||' inconsistent rows','Repair binding/origin backfill; preserve row IDs/content and do not move shared rows into the guest workspace.');
    exception when undefined_table or undefined_column then
      insert into pg_temp.todo_application_health values('SKIP','data',r.table_name||' collection scope','Schema dependency missing','Resolve schema FAIL rows first.');
    end;
  end loop;
  for r in select * from (values
      ('ensure_default_workspace()',array[]::text[],'uuid'),
      ('ensure_module_bindings(uuid)',array['wid']::text[],'void'),
      ('sharing_context(uuid)',array['wid']::text[],'jsonb'),
      ('create_collection_invite(uuid,text,text)',array['wid','module_id','invite_role']::text[],'jsonb'),
      ('preview_collection_invite(text)',array['invite_token']::text[],'jsonb'),
      ('accept_collection_invite(text,uuid)',array['invite_token','wid']::text[],'jsonb'),
      ('detach_collection(uuid,text)',array['wid','module_id']::text[],'jsonb'),
      ('manage_collection(uuid,text,uuid)',array['cid','action','target_id']::text[],'void'),
      ('collection_details(uuid)',array['cid']::text[],'jsonb'),
      ('collection_access(uuid)',array['cid']::text[],'boolean'),
      ('collection_write(uuid)',array['cid']::text[],'boolean'),
      ('sharing_topic_access(text)',array['topic']::text[],'boolean'),
      ('mutate_collection_item(uuid,uuid,text,text,jsonb,integer)',array['cid','pid','module_id','operation','item','expected_version']::text[],'jsonb'),
      ('personal_workspace_reminders()',array[]::text[],'jsonb'),
      ('mark_member_reminder(uuid)',array['task_id']::text[],'void'),
      ('rollover_collection_plans(uuid)',array['cid']::text[],'void'),
      ('seal_vault(uuid,text,text,jsonb,integer,text)',array['sid','previous_hash','metadata','notes','expected_version','new_name']::text[],'jsonb'),
      ('record_focus_session(jsonb)',array['payload']::text[],'boolean'),
      ('record_focus_session_v1(jsonb)',array['payload']::text[],'boolean'),
      ('focus_context(uuid)',array['client_id']::text[],'jsonb'),
      ('claim_focus_session(uuid,jsonb,boolean)',array['client_id','payload','takeover']::text[],'jsonb'),
      ('end_focus_session(uuid)',array['session_id']::text[],'jsonb'),
      ('pomonotes_mutate(uuid,text,uuid,text,integer,integer,integer)',array['wid','operation','tid','title','estimate','focus_seconds','expected_version']::text[],'jsonb'),
      ('pomonotes_page(uuid,text,text,jsonb,integer)',array['wid','status_filter','search_text','after_item','page_size']::text[],'jsonb'),
      ('pomonotes_history(uuid,uuid,timestamp with time zone,uuid)',array['wid','tid','before_time','before_id']::text[],'jsonb'),
      ('analytics_report(uuid,date,date,text,boolean)',array['wid','date_from','date_to','report_timezone','personal']::text[],'jsonb'),
      ('analytics_summary(uuid,date,date,text,boolean)',array['wid','date_from','date_to','report_timezone','personal']::text[],'jsonb'),
      ('analytics_report_v2(uuid,date,date,text,boolean,boolean)',array['wid','date_from','date_to','report_timezone','personal','include_items']::text[],'jsonb'),
      ('claim_periodic_email(uuid,uuid,uuid,text)',array['uid','tid','wid','tz']::text[],'jsonb'),
      ('finish_periodic_email(uuid,uuid,boolean)',array['did','token','success']::text[],'boolean')
    ) v(signature,arg_names,return_type) loop
    fn:=to_regprocedure('public.'||r.signature);
    if fn is null then continue; end if;
    select coalesce(proargnames,array[]::text[])=r.arg_names and format_type(prorettype,null)=r.return_type into enabled from pg_proc where oid=fn;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'RPC',r.signature||' named arguments/result',
      'Expected argument names '||array_to_string(r.arg_names,', ')||'; returns '||r.return_type,'PostgREST matches JSON property names to SQL argument names. Review the current function signature.');
    select string_agg(p.oid::regprocedure::text,', ') into actual from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=split_part(r.signature,'(',1) and p.oid<>fn;
    if actual is not null then
      insert into pg_temp.todo_application_health values('WARN','RPC',r.signature||' extra overloads',actual,'Unexpected legacy overloads may cause ambiguous RPC resolution; review dependencies before dropping.');
    end if;
  end loop;
  for r in select * from (values
    ('workspaces','workspaces_owner','auth.uid'),
    ('module_collections','collection_metadata','collection_member'),
    ('collection_members','collection_members_read','collection_member'),
    ('workspace_module_bindings','own_bindings','auth.uid'),
    ('collection_invites','own_invites','collection_owner'),
    ('collection_activity','collection_activity_read','collection_access'),
    ('periodic_member_preferences','own_reminder_preferences','auth.uid'),
    ('pomo_tasks','read_pomo_tasks','collection_access'),
    ('learning_subjects_items','read_collection_items','collection_access'),
    ('flashcard_decks_items','read_collection_items','collection_access'),
    ('workout_routines_items','read_collection_items','collection_access')
  ) v(table_name,policy_name,required_expression) loop
    select exists(select 1 from pg_policy where polrelid=to_regclass('public.'||r.table_name) and polname=r.policy_name
      and pg_get_expr(polqual,polrelid) like '%'||r.required_expression||'%') into enabled;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'policies',r.table_name||'.'||r.policy_name,
      'Expected scoped read policy present','Restore the current scoped policy after reviewing extra permissive policies.');
  end loop;
  for r in select * from (values
    ('learning_subjects_items','project_collection_items','project_collection_items'),
    ('flashcard_decks_items','project_collection_items','project_collection_items'),
    ('workout_routines_items','project_collection_items','project_collection_items'),
    ('learning_subjects','guard_projected_array','guard_projected_array'),
    ('flashcard_decks','guard_projected_array','guard_projected_array'),
    ('workout_routines','guard_projected_array','guard_projected_array'),
    ('periodic_tasks','save_member_reminder','save_member_reminder'),
    ('workspaces','guard_workspace_archive','guard_workspace_archive'),
    ('workspace_module_bindings','sharing_binding_changed','sharing_binding_changed'),
    ('module_collections','sharing_collection_changed','sharing_collection_changed')
  ) v(table_name,trigger_name,function_name) loop
    select exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=to_regclass('public.'||r.table_name)
      and t.tgname=r.trigger_name and p.proname=r.function_name and t.tgenabled in ('O','A') and not t.tgisinternal) into enabled;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'triggers',r.table_name||'.'||r.trigger_name,
      'Projection, reminder or workspace/realtime trigger','Review workspaces and tab_sharing_modules migrations; restore only the missing/current trigger.');
  end loop;
  rel:=to_regclass('realtime.messages');
  select exists(select 1 from pg_policy where polrelid=rel and polname='tab_sharing_broadcast' and pg_get_expr(polqual,polrelid) like '%sharing_topic_access%') into enabled;
  insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'WARN' end,'realtime','Private broadcast policy',
    case when rel is null then 'realtime.messages unavailable' when enabled then 'Scoped broadcast read policy present' else 'Broadcast policy missing or different' end,
    'Verify Supabase Realtime private broadcast configuration; SQL does not prove channel connectivity.');
  for r in select * from (values
    ('pomo_tasks','collection_id','module_collections','id','c'),
    ('pomo_task_member_preferences','task_id','pomo_tasks','id','c'),
    ('pomo_task_member_preferences','user_id','auth.users','id','c'),
    ('analytics_focus_sessions','task_id','pomo_tasks','id','n'),
    ('analytics_focus_sessions','collection_id','module_collections','id','n'),
    ('analytics_focus_sessions','user_id','auth.users','id','c'),
    ('focus_ownership','session_id','analytics_focus_sessions','id','c'),
    ('workspace_module_bindings','collection_id','module_collections','id','a')
  ) v(table_name,column_name,target,target_column,delete_action) loop
    rel:=to_regclass('public.'||r.table_name);
    if rel is null then continue; end if;
    select exists(select 1 from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
      join pg_attribute b on b.attrelid=k.confrelid and b.attnum=k.confkey[1]
      where k.conrelid=rel and k.contype='f' and array_length(k.conkey,1)=1 and a.attname=r.column_name
      and k.confrelid=to_regclass(case when r.target like 'auth.%' then r.target else 'public.'||r.target end)
      and b.attname=r.target_column and k.confdeltype::text=r.delete_action and k.convalidated) into enabled;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'constraints',r.table_name||'.'||r.column_name||' FK',
      'Expected target '||r.target||'.'||r.target_column||'; delete action '||r.delete_action,'Restore the foreign key and deletion behavior; resolve existing orphans first.');
  end loop;
  for name in select unnest(array['pomo_tasks_page_idx','focus_task_owner_idx','focus_terminal_recent_idx','analytics_focus_owner_time','analytics_events_scope_time','analytics_baseline_once','workspaces_owner_default','bindings_collection_idx','collection_members_user_idx']) loop
    select exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.'||name) and i.indisvalid and i.indisready) into enabled;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'WARN' end,'indexes',name,'Named repository index ready/valid','Inspect equivalent indexes before recreating; missing indexes can slow pagination and reports.');
  end loop;
  for r in select * from (values
    ('workspace defaults','FAIL',$q$select count(*) from (select user_id from public.workspaces group by user_id having count(*) filter(where is_default and archived_at is null)<>1) bad$q$,'Each workspace owner needs exactly one active default workspace.'),
    ('unknown enabled modules','FAIL',$q$select count(*) from public.workspaces w where exists(select 1 from unnest(w.active_modules) m where m not in ('plans','detailed','quick','secure','code','pomodoro','learning','flashcards','workout','periodic','activities'))$q$,'Remove invalid module IDs; preserve current module order.'),
    ('binding integrity','FAIL',$q$select count(*) from public.workspace_module_bindings b left join public.workspaces w on w.id=b.workspace_id left join public.module_collections c on c.id=b.collection_id left join public.module_collections p on p.id=b.personal_collection_id where w.id is null or c.id is null or p.id is null or c.module<>b.module or p.module<>b.module or p.owner_id is distinct from w.user_id or p.origin_workspace_id is distinct from w.id$q$,'Repair collection/module/origin bindings without moving shared note rows.'),
    ('collection owner membership','FAIL',$q$select count(*) from public.module_collections c where not exists(select 1 from public.collection_members m where m.collection_id=c.id and m.user_id=c.owner_id and m.role='owner')$q$,'Restore owner membership after verifying collection ownership.'),
    ('pomo binding coverage','WARN',$q$select count(*) from public.workspaces w where w.archived_at is null and not exists(select 1 from public.workspace_module_bindings b where b.workspace_id=w.id and b.module='pomodoro')$q$,'New workspaces initialize bindings on first use; existing workspaces should have the PomoNotes backfill.'),
    ('invite redemption pairs','FAIL',$q$select count(*) from public.collection_invites where (used_at is null)<>(used_by is null) or invite_role not in ('viewer','editor')$q$,'Inspect partial invitation redemption; enforce atomic single-use acceptance.'),
    ('focus workspace ownership','FAIL',$q$select count(*) from public.analytics_focus_sessions s left join public.workspaces w on w.id=s.workspace_id where w.id is null or s.user_id is distinct from w.user_id$q$,'Focus history belongs to the focusing user workspace, including shared tasks.'),
    ('focus metadata','FAIL',$q$select count(*) from public.analytics_focus_sessions where planned_seconds not between 60 and 5400 or revision<1 or status not in ('running','paused','completed','ended') or association not in ('task','free') or jsonb_typeof(segments) is distinct from 'array' or jsonb_typeof(credited_segments) is distinct from 'array' or (writer_client is null)<>(writer_lease is null) or (credited_completed and status<>'completed')$q$,'Review incomplete backfill and invalid focus payloads; retain valid elapsed history.'),
    ('focus task collection','FAIL',$q$select count(*) from public.analytics_focus_sessions s join public.pomo_tasks t on t.id=s.task_id where s.association<>'task' or s.collection_id is distinct from t.collection_id$q$,'Restore frozen task/collection association; deleted task references may legitimately be null.'),
    ('focus ownership fence','FAIL',$q$select count(*) from public.focus_ownership o left join public.analytics_focus_sessions s on s.id=o.session_id where s.id is null or s.user_id is distinct from o.user_id or s.writer_client is distinct from o.client_id or s.writer_lease is distinct from o.lease$q$,'Resolve inconsistent owner/lease records through a targeted repair; do not blindly clear all sessions.'),
    ('expired active focus lease','WARN',$q$select count(*) from public.focus_ownership o join public.analytics_focus_sessions s on s.id=o.session_id where s.status in ('running','paused') and o.expires_at<clock_timestamp()$q$,'May indicate a closed/offline/paused browser. Use Continue here or cancel for this user; expiration alone is not data corruption.'),
    ('terminal focus ownership','WARN',$q$select count(*) from public.focus_ownership o join public.analytics_focus_sessions s on s.id=o.session_id where s.status in ('ended','completed')$q$,'Older versions retain a harmless terminal holder until the next claim. Explicit stop now releases it.'),
    ('personal goal bounds','FAIL',$q$select count(*) from public.pomo_task_member_preferences where estimated_sessions not between 1 and 999 or focus_seconds not between 60 and 5400 or first_estimate_seconds<60$q$,'Repair invalid personal goals; estimates are private and must not be shared.'),
    ('duplicate analytics baseline','FAIL',$q$select count(*) from (select collection_id,record_id from public.analytics_events where kind='baseline' group by collection_id,record_id having count(*)>1) bad$q$,'Resolve duplicates then restore the partial unique baseline index.'),
    ('email delivery deduplication','FAIL',$q$select count(*) from (select user_id,task_id,delivery_day from public.periodic_email_deliveries group by user_id,task_id,delivery_day having count(*)>1) bad$q$,'Restore delivery uniqueness; never send another message just to test deduplication.'),
    ('email delivered payload retention','FAIL',$q$select count(*) from public.periodic_email_deliveries where delivered_at is not null and payload is not null$q$,'Inspect finish_periodic_email version; successful delivery should clear the sensitive payload.')
  ) v(check_name,severity,query_sql,action) loop
    begin
      execute r.query_sql into n;
      insert into pg_temp.todo_application_health values(case when n=0 then 'PASS' else r.severity end,'data',r.check_name,n||' rows',r.action);
    exception when undefined_table or undefined_column then
      insert into pg_temp.todo_application_health values('SKIP','data',r.check_name,'Required table/column missing',r.action||' Resolve schema FAIL rows first.');
    when others then
      insert into pg_temp.todo_application_health values('WARN','data',r.check_name,'Check could not complete; SQLSTATE '||sqlstate,'Review schema types and audit permissions; no application data was changed.');
    end;
  end loop;
  for r in select * from (values
    ('module_collections','module_collections_module_check'),('analytics_events','analytics_events_module_check')
  ) v(table_name,constraint_name) loop
    select exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||r.table_name) and conname=r.constraint_name and convalidated and pg_get_constraintdef(oid) like '%pomodoro%') into enabled;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'constraints',r.table_name||' pomodoro support','Validated module CHECK accepts pomodoro','Apply the PomoNotes migration after the older sharing/analytics migrations.');
  end loop;
  for name in select unnest(array['password_sessions','secure_notes']) loop
    rel:=to_regclass('public.'||name);
    select exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=rel and t.tgname='z_guard_vault_ciphertext' and p.proname='guard_vault_ciphertext' and t.tgenabled in ('O','A')) into enabled;
    insert into pg_temp.todo_application_health values(case when enabled then 'PASS' else 'FAIL' end,'triggers',name||' vault ciphertext guard','Encrypted vault write validation','Review tab_sharing_vault.sql before repairing; never expose plaintext vault content.');
  end loop;
  if to_regprocedure('public.end_focus_session(uuid)') is not null then
    insert into pg_temp.todo_application_health values('PASS','capabilities','Explicit focus cancellation','end_focus_session present','Use the updated frontend and 202610110003_focus_repair.sql together.');
  end if;
  insert into pg_temp.todo_application_health values('WARN','external','Checks outside SQL','Edge deployment/secrets, browser connection, schema cache and UI cannot be proven by catalog checks','Verify Edge deployment separately; share FAIL/WARN rows and the failing RPC response for diagnosis.');
end $health$;
select status,area,check_name,detail,next_action from pg_temp.todo_application_health
order by case status when 'FAIL' then 0 when 'WARN' then 1 when 'SKIP' then 2 else 3 end,area,check_name;
