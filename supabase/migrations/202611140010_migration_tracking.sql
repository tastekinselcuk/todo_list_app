begin;
-- Adopt the standard Supabase migration registry for the audited rollout.
-- Earlier ad-hoc SQL remains historical until a clean-install baseline is built.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
 version text primary key,statements text[],name text
);
alter table supabase_migrations.schema_migrations add column if not exists checksum text;
revoke all on schema supabase_migrations from public,anon,authenticated;
revoke all on supabase_migrations.schema_migrations from public,anon,authenticated;
create or replace function public.application_migrations_ready(required jsonb) returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
declare item jsonb;
begin
 if jsonb_typeof(required) is distinct from 'array' then return false; end if;
 if jsonb_array_length(required) not between 1 and 128 then return false; end if;
 for item in select value from jsonb_array_elements(required) loop
  if coalesce(item->>'version','') !~ '^[0-9]{12,14}$' or coalesce(item->>'sha256','') !~ '^[a-f0-9]{64}$'
   or not exists(select 1 from supabase_migrations.schema_migrations m where m.version=item->>'version' and m.checksum=item->>'sha256') then return false; end if;
 end loop;
 return true;
end; $$;
revoke all on function public.application_migrations_ready(jsonb) from public;
grant execute on function public.application_migrations_ready(jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
