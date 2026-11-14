begin;
create or replace function public.cleanup_operational_metrics() returns void
language sql security definer set search_path=pg_catalog as $$
 delete from private.client_error_counts where bucket<now()-interval '30 days';
 delete from public.background_run_status where created_at<now()-interval '30 days';
 delete from public.periodic_email_deliveries where delivery_day<current_date-30;
$$;
revoke all on function public.cleanup_operational_metrics() from public,anon,authenticated;
grant execute on function public.cleanup_operational_metrics() to service_role;
commit;
