-- Existing installations: normalize only the default-workspace RPC grants.
-- Supabase default privileges can grant EXECUTE directly to anon. Revoking
-- PUBLIC alone does not remove that separate grant. The function body,
-- workspaces, collections, notes and focus history are left intact.
begin;
revoke all on function public.ensure_default_workspace() from public, anon;
grant execute on function public.ensure_default_workspace() to authenticated;
notify pgrst, 'reload schema';
commit;
