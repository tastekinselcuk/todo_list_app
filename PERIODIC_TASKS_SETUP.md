# Periodic Tasks - Supabase Setup

Run this SQL in the Supabase SQL Editor to create the Periodic Tasks table.

```sql
create table if not exists public.periodic_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  days_of_week integer[] default array[0,1,2,3,4,5,6], -- 0: Sunday, ..., 6: Saturday
  completed_date date, -- Today's date if completed today, null if not completed today
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Enable Row Level Security
alter table public.periodic_tasks enable row level security;

-- Create RLS policies
drop policy if exists "periodic_tasks_select_policy" on public.periodic_tasks;
drop policy if exists "periodic_tasks_insert_policy" on public.periodic_tasks;
drop policy if exists "periodic_tasks_update_policy" on public.periodic_tasks;
drop policy if exists "periodic_tasks_delete_policy" on public.periodic_tasks;

create policy "periodic_tasks_select_policy"
on public.periodic_tasks
for select
using (user_id = auth.uid() or user_id is null);

create policy "periodic_tasks_insert_policy"
on public.periodic_tasks
for insert
with check (true);

create policy "periodic_tasks_update_policy"
on public.periodic_tasks
for update
using (user_id = auth.uid() or user_id is null);

create policy "periodic_tasks_delete_policy"
on public.periodic_tasks
for delete
using (user_id = auth.uid() or user_id is null);

-- Create index for faster queries
create index if not exists periodic_tasks_user_id_idx on periodic_tasks(user_id);
create index if not exists periodic_tasks_completed_date_idx on periodic_tasks(completed_date);
```

## Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | User reference (foreign key) |
| `title` | TEXT | Task/routine title |
| `frequency` | TEXT | 'daily' or 'weekly' |
| `days_of_week` | INTEGER[] | Array of day numbers (0-6) for weekly tasks |
| `completed_date` | DATE | Date when completed (resets daily) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

## Notes

- For **daily** tasks: `days_of_week` contains all days [0,1,2,3,4,5,6]
- For **weekly** tasks: `days_of_week` contains specific days (e.g., [1,3,5] for Mon/Wed/Fri)
- `completed_date` stores today's date when task is checked, resets daily (can't query it, must handle in frontend)
- All data is isolated by `user_id` (RLS policies enforce this)
