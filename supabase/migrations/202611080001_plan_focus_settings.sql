begin;

-- Unlink only the caller's private focus target. Keep its historical sessions.
create or replace function public.plan_focus_remove(wid uuid,source text,rid uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare link plan_focus_links;
begin
 perform plan_entry_source(wid,source,rid);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||wid::text||source||rid::text,61));
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 select * into link from plan_focus_links where user_id=auth.uid() and workspace_id=wid and source_module=source and source_id=rid for update;
 if link.task_id is null then return jsonb_build_object('ok',true);end if;
 -- The timer must flush and stop a live session before removing its association.
 if exists(select 1 from analytics_focus_sessions where user_id=auth.uid() and task_id=link.task_id and status in ('running','paused')) then
  raise exception 'FOCUS_SESSION_ACTIVE';
 end if;
 delete from plan_focus_links where user_id=auth.uid() and workspace_id=wid and source_module=source and source_id=rid;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.plan_focus_remove(uuid,text,uuid) from public,anon;
grant execute on function public.plan_focus_remove(uuid,text,uuid) to authenticated;

commit;
