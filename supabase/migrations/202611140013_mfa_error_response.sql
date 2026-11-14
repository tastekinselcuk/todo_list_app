begin;
-- PostgREST requires both status and headers in the custom error detail.
create or replace function public.check_session_security() returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.check_api_budget();
 if auth.uid() is not null and not public.session_mfa_satisfied() then
  raise sqlstate 'PGRST' using message='{"code":"MFA_REQUIRED","message":"MFA_REQUIRED","details":null,"hint":"Verify your authenticator code"}',detail='{"status":403,"headers":{}}';
 end if;
end; $$;
revoke all on function public.check_session_security() from public;
grant execute on function public.check_session_security() to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
