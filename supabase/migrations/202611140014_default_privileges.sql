begin;
-- Existing objects retain their reviewed grants. Future objects require explicit grants.
alter default privileges for role postgres revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres revoke all on functions from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public,anon,authenticated;
alter default privileges for role postgres in schema private revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema private revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema private revoke all on functions from public,anon,authenticated;
create or replace function public.application_defaults_ready() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select not exists (
  select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
  where d.defaclrole=(select oid from pg_roles where rolname='postgres')
   and (d.defaclnamespace=0 or d.defaclnamespace in (select oid from pg_namespace where nspname in ('public','private')))
   and d.defaclobjtype in ('r','S','f') and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'))
 ) and exists (
  -- PostgreSQL's built-in default grants PUBLIC execute unless globally revoked.
  select 1 from pg_default_acl where defaclrole=(select oid from pg_roles where rolname='postgres') and defaclnamespace=0 and defaclobjtype='f'
 );
$$;
revoke all on function public.application_defaults_ready() from public;
grant execute on function public.application_defaults_ready() to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
