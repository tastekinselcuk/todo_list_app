-- activity_items: personal film / series / place / book lists
-- Run in Supabase SQL Editor

create table if not exists public.activity_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('movie', 'series', 'place', 'book')),
  title text not null,
  subtitle text,
  image_url text,
  external_id text,
  external_source text,
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'want' check (status in ('want', 'done')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists activity_items_user_external_uidx
  on public.activity_items (user_id, type, external_source, external_id)
  where external_id is not null and external_source is not null;

create index if not exists activity_items_user_id_idx on public.activity_items(user_id);
create index if not exists activity_items_type_idx on public.activity_items(user_id, type);

alter table public.activity_items enable row level security;

drop policy if exists "activity_items_select_policy" on public.activity_items;
drop policy if exists "activity_items_insert_policy" on public.activity_items;
drop policy if exists "activity_items_update_policy" on public.activity_items;
drop policy if exists "activity_items_delete_policy" on public.activity_items;

create policy "activity_items_select_policy"
on public.activity_items for select
using (user_id = auth.uid());

create policy "activity_items_insert_policy"
on public.activity_items for insert
with check (user_id = auth.uid());

create policy "activity_items_update_policy"
on public.activity_items for update
using (user_id = auth.uid());

create policy "activity_items_delete_policy"
on public.activity_items for delete
using (user_id = auth.uid());
