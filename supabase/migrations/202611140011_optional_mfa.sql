begin;
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
commit;
