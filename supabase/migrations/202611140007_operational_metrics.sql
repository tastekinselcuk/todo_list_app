begin;
create table if not exists private.client_error_counts (
 bucket timestamptz not null,
 code text not null check(code in ('UI_RENDER_ERROR','SCRIPT_ERROR','UNHANDLED_PROMISE')),
 screen text not null check(screen in ('workspace','settings','analytics','auth','unknown')),
 release text not null check(release ~ '^[a-zA-Z0-9._-]{1,64}$'),
 occurrences bigint not null default 1,
 primary key(bucket,code,screen,release)
);
alter table private.client_error_counts enable row level security;
revoke all on private.client_error_counts from public,anon,authenticated;
create or replace function public.report_client_error(code text,screen text,release text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
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
end; $$;
revoke all on function public.report_client_error(text,text,text) from public,anon,authenticated;
grant execute on function public.report_client_error(text,text,text) to authenticated,service_role;
create or replace function public.cleanup_operational_metrics() returns void
language sql security definer set search_path=pg_catalog as $$
 delete from private.client_error_counts where bucket<now()-interval '30 days';
 delete from public.background_run_status where created_at<now()-interval '30 days';
$$;
revoke all on function public.cleanup_operational_metrics() from public,anon,authenticated;
grant execute on function public.cleanup_operational_metrics() to service_role;
notify pgrst,'reload schema';
commit;
