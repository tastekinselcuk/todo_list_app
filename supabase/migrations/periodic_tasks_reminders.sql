-- periodic_tasks: migrate to reminder schema (run in Supabase SQL Editor)

alter table public.periodic_tasks drop constraint if exists periodic_tasks_frequency_check;

alter table public.periodic_tasks
  add column if not exists notes text,
  add column if not exists category text not null default 'other',
  add column if not exists day_of_month integer,
  add column if not exists month_of_year integer,
  add column if not exists interval_days integer,
  add column if not exists anchor_date date,
  add column if not exists reminder_time time,
  add column if not exists notify_browser boolean not null default true,
  add column if not exists notify_email boolean not null default false,
  add column if not exists last_notified_at timestamptz;

alter table public.periodic_tasks drop constraint if exists periodic_tasks_frequency_check;
alter table public.periodic_tasks
  add constraint periodic_tasks_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly', 'yearly', 'custom'));

alter table public.periodic_tasks drop constraint if exists periodic_tasks_category_check;
alter table public.periodic_tasks
  add constraint periodic_tasks_category_check
  check (category in ('work', 'health', 'habit', 'goal', 'other'));
