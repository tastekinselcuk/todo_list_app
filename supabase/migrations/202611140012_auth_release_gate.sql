begin;
-- New RLS tables must include the MFA restriction before a release can ship.
create or replace function public.application_auth_ready() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
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
revoke all on function public.application_auth_ready() from public;
grant execute on function public.application_auth_ready() to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
