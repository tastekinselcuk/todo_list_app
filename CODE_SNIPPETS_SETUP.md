# Code Snippets Supabase Setup

Run this SQL once in the Supabase SQL Editor to enable the new Code Snippets tab.

```sql
create table if not exists public.code_snippets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  language text not null default 'plaintext',
  code text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.code_snippets enable row level security;

drop policy if exists "code_snippets_select_policy" on public.code_snippets;
drop policy if exists "code_snippets_insert_policy" on public.code_snippets;
drop policy if exists "code_snippets_update_policy" on public.code_snippets;
drop policy if exists "code_snippets_delete_policy" on public.code_snippets;

create policy "code_snippets_select_policy"
on public.code_snippets
for select
using (created_by = auth.uid() or created_by is null);

create policy "code_snippets_insert_policy"
on public.code_snippets
for insert
with check (true);

create policy "code_snippets_update_policy"
on public.code_snippets
for update
using (created_by = auth.uid() or created_by is null);

create policy "code_snippets_delete_policy"
on public.code_snippets
for delete
using (created_by = auth.uid() or created_by is null);
```

Notes:
- Snippet content is stored as raw text in `code`, so indentation and whitespace are preserved exactly.
- `updated_at` is updated from the client when a snippet is edited.
