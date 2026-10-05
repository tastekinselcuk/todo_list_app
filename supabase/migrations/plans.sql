create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  period text not null check (period in ('daily', 'weekly', 'monthly', 'yearly')),
  period_date date not null,
  completed boolean not null default false,
  reason text not null default '',
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;
drop policy if exists plans_owner on public.plans;
create policy plans_owner on public.plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists plans_user_period_idx on public.plans(user_id, period, period_date);
