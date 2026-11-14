begin;
-- Public monitoring receives one verdict, never job text, identities or queue contents.
create or replace function public.application_operations_ready() returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if (select count(*) from cron.job where active and jobname in ('scheduled-maintenance','finance-recurring-rollover','vault-retention','workspace-trash-retention'))<>4 then return false;end if;
 if not exists(select 1 from public.background_run_status where created_at>now()-interval '10 minutes' and succeeded and cleanup_succeeded)then return false;end if;
 return not exists(
  select 1 from (
   select distinct on(j.jobid) d.status from cron.job j join cron.job_run_details d on d.jobid=j.jobid
   where j.jobname in ('scheduled-maintenance','finance-recurring-rollover','vault-retention','workspace-trash-retention')
    and d.start_time>now()-interval '3 hours'
   order by j.jobid,d.start_time desc
  ) latest where status='failed'
 );
exception when undefined_table or invalid_schema_name then return false;
end;$$;
revoke all on function public.application_operations_ready() from public;
grant execute on function public.application_operations_ready() to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
