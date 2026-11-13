begin;
create or replace function public.finance_rollover_recurring() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_workspace record;
begin
  for current_workspace in
    select distinct recurring.workspace_id, recurring.user_id
    from public.finance_recurring recurring
    join public.workspaces workspace
      on workspace.id = recurring.workspace_id and workspace.user_id = recurring.user_id
    where recurring.active and recurring.deleted_at is null and workspace.archived_at is null
  loop
    perform public.finance_materialize(current_workspace.workspace_id, current_workspace.user_id);
  end loop;
end;
$$;
revoke all on function public.finance_rollover_recurring() from public, anon, authenticated;
grant execute on function public.finance_rollover_recurring() to service_role;
commit;
