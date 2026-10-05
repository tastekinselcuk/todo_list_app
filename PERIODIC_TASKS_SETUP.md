# Periodic Reminders — Supabase Setup

Run the SQL below in the Supabase SQL Editor. If you already have the older `periodic_tasks` table, use the **Migration** section.

## Full create (new projects)

```sql
create table if not exists public.periodic_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  category text not null default 'other'
    check (category in ('work', 'health', 'habit', 'goal', 'other')),
  frequency text not null default 'daily'
    check (frequency in ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  days_of_week integer[] default null,
  day_of_month integer default null check (day_of_month is null or (day_of_month >= 1 and day_of_month <= 31)),
  month_of_year integer default null check (month_of_year is null or (month_of_year >= 1 and month_of_year <= 12)),
  interval_days integer default null check (interval_days is null or interval_days >= 1),
  anchor_date date default null,
  reminder_time time default null,
  notify_browser boolean not null default true,
  notify_email boolean not null default false,
  completed_date date,
  last_notified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.periodic_tasks enable row level security;

drop policy if exists "periodic_tasks_select_policy" on public.periodic_tasks;
drop policy if exists "periodic_tasks_insert_policy" on public.periodic_tasks;
drop policy if exists "periodic_tasks_update_policy" on public.periodic_tasks;
drop policy if exists "periodic_tasks_delete_policy" on public.periodic_tasks;

create policy "periodic_tasks_select_policy"
on public.periodic_tasks for select
using (user_id = auth.uid());

create policy "periodic_tasks_insert_policy"
on public.periodic_tasks for insert
with check (user_id = auth.uid());

create policy "periodic_tasks_update_policy"
on public.periodic_tasks for update
using (user_id = auth.uid());

create policy "periodic_tasks_delete_policy"
on public.periodic_tasks for delete
using (user_id = auth.uid());

create index if not exists periodic_tasks_user_id_idx on periodic_tasks(user_id);
create index if not exists periodic_tasks_completed_date_idx on periodic_tasks(completed_date);
```

## Migration (existing table)

```sql
-- Drop old frequency check if present, then widen allowed values
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

alter table public.periodic_tasks
  add constraint periodic_tasks_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly', 'yearly', 'custom'));

alter table public.periodic_tasks
  drop constraint if exists periodic_tasks_category_check;

alter table public.periodic_tasks
  add constraint periodic_tasks_category_check
  check (category in ('work', 'health', 'habit', 'goal', 'other'));
```

## Schema overview

| Column | Type | Description |
|--------|------|-------------|
| `title` | TEXT | Routine title |
| `notes` | TEXT | Optional detail (dose, goal note, etc.) |
| `category` | TEXT | `work` / `health` / `habit` / `goal` / `other` |
| `frequency` | TEXT | `daily` / `weekly` / `monthly` / `yearly` / `custom` |
| `days_of_week` | INT[] | Weekly: 0=Sun … 6=Sat |
| `day_of_month` | INT | Monthly / yearly day |
| `month_of_year` | INT | Yearly month (1–12) |
| `interval_days` | INT | Custom: every N days |
| `anchor_date` | DATE | Custom interval start |
| `reminder_time` | TIME | Local reminder clock time |
| `notify_browser` | BOOL | Browser Notification API |
| `notify_email` | BOOL | Email via Edge Function |
| `completed_date` | DATE | Last completion in current period |
| `last_notified_at` | TIMESTAMPTZ | Dedupes same-day alerts |

---

## Free notifications

### 1. Browser notifications (free, works out of the box)

- Uses the Web Notification API while the app tab is open.
- User grants permission once from the module banner.
- No third-party cost.

### 2. Email (free tier path)

**Resend** free tier: ~3,000 emails/month. Pair with a Supabase Edge Function.

1. Create a free account at [resend.com](https://resend.com) and get an API key.
2. In Supabase Dashboard → **Edge Functions** → create `send-periodic-reminder`.
3. Set secrets:

```bash
supabase secrets set RESEND_API_KEY=re_xxxx
supabase secrets set REMINDER_FROM_EMAIL="Reminders <onboarding@resend.dev>"
```

4. Deploy the function from `supabase/functions/send-periodic-reminder/index.ts` in this repo.

Until the function is deployed, email toggles fail silently and browser alerts still work.

### 3. SMS

There is **no reliable free production SMS** API. Options if you later need SMS:

- Twilio trial credits (temporary)
- Paid Twilio / MessageBird / etc.

The app intentionally does not wire SMS so you are not locked into a paid vendor.

---

## Frequency rules (app logic)

- **daily** — every day  
- **weekly** — selected weekdays  
- **monthly** — `day_of_month` (clamped to month length)  
- **yearly** — `month_of_year` + `day_of_month`  
- **custom** — every `interval_days` from `anchor_date`  
