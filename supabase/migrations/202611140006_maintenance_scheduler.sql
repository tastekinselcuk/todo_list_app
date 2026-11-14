begin;
create extension if not exists pg_net with schema extensions;
-- The managed extension owns its queue ACLs. Queue only short-lived signed
-- tickets, never the permanent secret; normal clients cannot consume a ticket.
create schema if not exists private;
create table if not exists private.background_dispatch_config (
 singleton boolean primary key default true check(singleton),
 endpoint text not null check(endpoint ~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/scheduled-maintenance$')
);
revoke all on private.background_dispatch_config from public,anon,authenticated;
alter table private.background_dispatch_config enable row level security;
create or replace function public.enqueue_scheduled_maintenance() returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
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
revoke all on function public.enqueue_scheduled_maintenance() from public,anon,authenticated;
grant execute on function public.enqueue_scheduled_maintenance() to service_role;
-- The job is enabled only by deployment provisioning after the worker and its
-- dedicated secret are installed. Never embed credentials in cron.job.command.
commit;
