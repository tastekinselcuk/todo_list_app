begin;

-- 1. Idempotency key on ai_action_runs to prevent duplicate writes on retry / double-click
alter table public.ai_action_runs
  add column if not exists request_id text check (request_id is null or length(request_id) between 8 and 128);

create unique index if not exists ai_action_runs_idempotent_req_idx
  on public.ai_action_runs(workspace_id, user_id, request_id)
  where request_id is not null;

-- 2. Workspace-isolated persistent AI conversations & messages
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Yeni Sohbet' check (length(title) between 1 and 160),
  summary text not null default '' check (length(summary) <= 2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);

create index if not exists ai_conversations_ws_user_updated_idx
  on public.ai_conversations(workspace_id, user_id, updated_at desc)
  where deleted_at is null;

alter table public.ai_conversations enable row level security;

drop policy if exists require_verified_mfa on public.ai_conversations;
create policy require_verified_mfa on public.ai_conversations as restrictive for all to authenticated
  using (public.session_mfa_satisfied())
  with check (public.session_mfa_satisfied());

revoke all on table public.ai_conversations from public, anon;
grant select, insert, update, delete on table public.ai_conversations to authenticated;
grant all on table public.ai_conversations to service_role;

drop policy if exists "ai_conversations_owner_select" on public.ai_conversations;
create policy "ai_conversations_owner_select" on public.ai_conversations
  for select to authenticated
  using (user_id = auth.uid() and public.session_mfa_satisfied());

drop policy if exists "ai_conversations_owner_insert" on public.ai_conversations;
create policy "ai_conversations_owner_insert" on public.ai_conversations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.session_mfa_satisfied()
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.user_id = auth.uid() and w.archived_at is null
    )
  );

drop policy if exists "ai_conversations_owner_update" on public.ai_conversations;
create policy "ai_conversations_owner_update" on public.ai_conversations
  for update to authenticated
  using (user_id = auth.uid() and public.session_mfa_satisfied())
  with check (user_id = auth.uid() and public.session_mfa_satisfied());

drop policy if exists "ai_conversations_owner_delete" on public.ai_conversations;
create policy "ai_conversations_owner_delete" on public.ai_conversations
  for delete to authenticated
  using (user_id = auth.uid() and public.session_mfa_satisfied());

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (length(content) <= 16000),
  scope_labels jsonb not null default '[]'::jsonb check (jsonb_typeof(scope_labels) = 'array'),
  clarification jsonb,
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  applied_run_id uuid references public.ai_action_runs(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists ai_messages_conv_created_idx
  on public.ai_messages(conversation_id, created_at asc);

alter table public.ai_messages enable row level security;

drop policy if exists require_verified_mfa on public.ai_messages;
create policy require_verified_mfa on public.ai_messages as restrictive for all to authenticated
  using (public.session_mfa_satisfied())
  with check (public.session_mfa_satisfied());

revoke all on table public.ai_messages from public, anon;
grant select, insert, update, delete on table public.ai_messages to authenticated;
grant all on table public.ai_messages to service_role;

drop policy if exists "ai_messages_owner_all" on public.ai_messages;
create policy "ai_messages_owner_all" on public.ai_messages
  for all to authenticated
  using (user_id = auth.uid() and public.session_mfa_satisfied())
  with check (
    user_id = auth.uid()
    and public.session_mfa_satisfied()
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.workspace_id = workspace_id
        and c.user_id = auth.uid()
        and c.deleted_at is null
    )
  );

-- 3. Opt-in harmless user/workspace AI preferences memory (never stores secrets, finance, or vault data)
create table if not exists public.ai_user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opt_in_memory boolean not null default false,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, workspace_id)
);

alter table public.ai_user_preferences enable row level security;

drop policy if exists require_verified_mfa on public.ai_user_preferences;
create policy require_verified_mfa on public.ai_user_preferences as restrictive for all to authenticated
  using (public.session_mfa_satisfied())
  with check (public.session_mfa_satisfied());

revoke all on table public.ai_user_preferences from public, anon;
grant select, insert, update, delete on table public.ai_user_preferences to authenticated;
grant all on table public.ai_user_preferences to service_role;

drop policy if exists "ai_user_preferences_owner_all" on public.ai_user_preferences;
create policy "ai_user_preferences_owner_all" on public.ai_user_preferences
  for all to authenticated
  using (user_id = auth.uid() and public.session_mfa_satisfied())
  with check (user_id = auth.uid() and public.session_mfa_satisfied());

-- 4. Deterministic SQL aggregation RPC for cross-module AI metrics
create or replace function public.ai_query_metrics(
  wid uuid,
  metric text,
  params jsonb default '{}'::jsonb
) returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  ws public.workspaces;
  lookback_days integer := least(365, greatest(1, coalesce(nullif(params->>'days', '')::integer, 21)));
  cur_month_start date := date_trunc('month', current_date)::date;
  prev_month_start date := (date_trunc('month', current_date) - interval '1 month')::date;
  res jsonb;
begin
  if uid is null or not public.session_mfa_satisfied() then
    raise exception 'AI_ACCESS_DENIED' using errcode = '42501';
  end if;
  select * into ws from public.workspaces where id = wid and user_id = uid and archived_at is null;
  if ws.id is null then
    raise exception 'AI_ACCESS_DENIED' using errcode = '42501';
  end if;

  if metric = 'finance_monthly_comparison' then
    if not ('finance' = any(ws.active_modules)) then
      return jsonb_build_object('metric', metric, 'enabled', false);
    end if;
    with tx as (
      select category, kind, amount, occurred_on
      from public.finance_transactions
      where workspace_id = wid and user_id = uid
        and occurred_on >= prev_month_start
    ),
    by_cat as (
      select
        coalesce(nullif(category, ''), 'Genel') as category,
        coalesce(sum(amount) filter (where kind = 'expense' and occurred_on >= cur_month_start), 0) as current_expense,
        coalesce(sum(amount) filter (where kind = 'expense' and occurred_on >= prev_month_start and occurred_on < cur_month_start), 0) as previous_expense
      from tx
      group by 1
    )
    select jsonb_build_object(
      'metric', metric,
      'current_month_start', cur_month_start,
      'previous_month_start', prev_month_start,
      'current_total_expense', coalesce((select sum(current_expense) from by_cat), 0),
      'previous_total_expense', coalesce((select sum(previous_expense) from by_cat), 0),
      'categories', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'category', category,
            'current_expense', current_expense,
            'previous_expense', previous_expense,
            'delta', current_expense - previous_expense
          )
          order by (current_expense - previous_expense) desc
        )
        from by_cat
      ), '[]'::jsonb)
    ) into res;
    return res;

  elsif metric = 'task_load' then
    select jsonb_build_object(
      'metric', metric,
      'pending_count', count(*) filter (where status <> 'done'),
      'done_count', count(*) filter (where status = 'done'),
      'overdue_count', count(*) filter (where status <> 'done' and due_on is not null and due_on < current_date),
      'due_today_count', count(*) filter (where status <> 'done' and due_on = current_date),
      'due_tomorrow_count', count(*) filter (where status <> 'done' and due_on = current_date + 1)
    ) into res
    from public.work_tasks
    where workspace_id = wid and user_id = uid and deleted_at is null;
    return res;

  elsif metric = 'focus_summary' then
    select jsonb_build_object(
      'metric', metric,
      'days', lookback_days,
      'sessions_count', count(*),
      'completed_sessions', count(*) filter (where credited_completed)
    ) into res
    from public.analytics_focus_sessions
    where user_id = uid and created_at >= (now() - make_interval(days => lookback_days));
    return res;

  elsif metric = 'learning_summary' then
    select jsonb_build_object(
      'metric', metric,
      'unresolved_mistakes', count(*) filter (where not resolved),
      'resolved_mistakes', count(*) filter (where resolved)
    ) into res
    from public.learning_mistakes
    where workspace_id = wid and user_id = uid and deleted_at is null;
    return res;
  end if;

  raise exception 'UNSUPPORTED_AI_METRIC';
end $$;

revoke all on function public.ai_query_metrics(uuid, text, jsonb) from public;
grant execute on function public.ai_query_metrics(uuid, text, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
