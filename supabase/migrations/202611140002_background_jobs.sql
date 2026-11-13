begin;
do $jobs$
begin
  if to_regprocedure('public.finance_rollover_recurring()') is null
    or to_regprocedure('public.purge_expired_trash(integer)') is null then
    raise exception 'Apply finance recurring and workspace trash migrations before scheduling jobs';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'Supabase Cron is required to activate finance and trash background jobs';
    return;
  end if;
  perform cron.schedule('finance-recurring-rollover', '5 * * * *',
    'select public.finance_rollover_recurring();');
  perform cron.schedule('workspace-trash-retention', '17 * * * *',
    'select public.purge_expired_trash(200);');
end;
$jobs$;
commit;
