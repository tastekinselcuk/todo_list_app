begin;

-- Shared whitelist for search and AI. Vaults, credentials, code bodies, URLs,
-- provider metadata and session records are deliberately never read here.
create or replace function public.workspace_search_text(value text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(value,''),
    '<(script|style)[^>]*>.*?</\1>', ' ', 'gis'), '<[^>]*>', ' ', 'g'),
    '&(nbsp|amp|lt|gt|quot|#39);', ' ', 'gi'),
    '(password|passwd|parola|şifre|sifre|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|authorization)\s*[:=][^\n\r<]*', '[gizli alan]', 'gi'))
$$;
create or replace function public.workspace_search_normalize(value text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select trim(regexp_replace(lower(translate(coalesce(value,''), 'İIıÇçĞğÖöŞşÜü', 'iiiCcGgOoSsUu')), '\s+', ' ', 'g'))
$$;

create or replace function public.workspace_search_documents(wid uuid)
returns table(module text, record_id uuid, child_id text, title text, body text, meta jsonb, created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  with bound as materialized (
    select b.module,b.collection_id from public.workspace_module_bindings b
    join public.workspaces w on w.id=b.workspace_id
    join public.module_collections c on c.id=b.collection_id and c.module=b.module
    where w.id=wid and w.user_id=auth.uid() and w.archived_at is null
      and b.module=any(w.active_modules) and b.module<>'secure'
      and public.collection_access(b.collection_id)
  ), docs as (
    select 'detailed'::text module,r.id record_id,null::text child_id,r.title,
      r.description body,'{}'::jsonb meta,r.created_at from public.todos r join bound b on b.module='detailed' and r.collection_id=b.collection_id
    union all select 'quick',r.id,null,left(r.content,100),r.content,'{}',r.created_at from public.quick_notes r join bound b on b.module='quick' and r.collection_id=b.collection_id
    union all select 'plans',r.id,null,r.title,r.reason,jsonb_build_object('period',r.period,'date',r.period_date),r.created_at from public.plans r join bound b on b.module='plans' and r.collection_id=b.collection_id
    union all select 'code',r.id,null,r.title,'','{}',r.created_at from public.code_snippets r join bound b on b.module='code' and r.collection_id=b.collection_id
    union all select 'pomodoro',r.id,null,r.title,'','{}',r.created_at from public.pomo_tasks r join bound b on b.module='pomodoro' and r.collection_id=b.collection_id
    union all select 'periodic',r.id,null,r.title,r.notes,'{}',r.created_at from public.periodic_tasks r join bound b on b.module='periodic' and r.collection_id=b.collection_id
    union all select 'activities',r.id,null,r.title,concat_ws(' ',r.subtitle,r.notes),'{}',r.created_at from public.activity_items r join bound b on b.module='activities' and r.collection_id=b.collection_id
    union all select 'learning',r.id,null,r.title,'','{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id
    union all select 'learning',r.id,x->>'id',concat_ws(' · ',r.title,x->>'title'),'', '{}',r.created_at from public.learning_subjects r join bound b on b.module='learning' and r.collection_id=b.collection_id cross join lateral jsonb_array_elements(r.topics) x
    union all select 'flashcards',r.id,null,r.title,'','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id
    union all select 'flashcards',r.id,x->>'id',concat_ws(' · ',r.title,x->>'front'),x->>'back','{}',r.created_at from public.flashcard_decks r join bound b on b.module='flashcards' and r.collection_id=b.collection_id cross join lateral jsonb_array_elements(r.cards) x
    union all select 'workout',r.id,null,r.title,'','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id
    union all select 'workout',r.id,x->>'id',concat_ws(' · ',r.title,x->>'name'),x->>'notes','{}',r.created_at from public.workout_routines r join bound b on b.module='workout' and r.collection_id=b.collection_id cross join lateral jsonb_array_elements(r.exercises) x
  ) select d.module,d.record_id,d.child_id,public.workspace_search_text(d.title),public.workspace_search_text(d.body),d.meta,d.created_at from docs d
$$;

create or replace function public.search_workspace(wid uuid, query_text text, page_size integer default 5, page_offset integer default 0, only_module text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare needle text:=public.workspace_search_normalize(query_text); result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if length(coalesce(query_text,''))>120 or page_offset is null or page_size is null or page_offset<0 or page_offset>10000 or page_size<1 or page_size>30 then raise exception 'INVALID_SEARCH'; end if;
  if needle='' then return jsonb_build_object('groups','[]'::jsonb); end if;
  with matched as materialized (
    select d.*, case when public.workspace_search_normalize(d.title)=needle then 3 when strpos(public.workspace_search_normalize(d.title),needle)>0 then 2 else 1 end as rank,
      greatest(1,strpos(public.workspace_search_normalize(d.body),needle)-65) as snippet_start
    from public.workspace_search_documents(wid) d
    where (only_module is null or d.module=only_module)
      and strpos(public.workspace_search_normalize(concat_ws(' ',d.title,d.body)),needle)>0
  ), numbered as (
    select m.*,row_number() over(partition by module order by rank desc,created_at desc,record_id,child_id nulls first) as n from matched m
  ), groups as (
    select module,count(*) as total,coalesce(jsonb_agg(jsonb_build_object('module',module,'record_id',record_id,'child_id',child_id,
      'title',left(title,180),'preview',substring(body from snippet_start for 220),'meta',meta)
      order by n) filter(where n>page_offset and n<=page_offset+page_size),'[]'::jsonb) as items from numbered group by module
  ) select jsonb_build_object('groups',coalesce(jsonb_agg(to_jsonb(g) order by module),'[]'::jsonb)) into result from groups g;
  return result;
end; $$;

-- Counts cover all authorized root records, not just the retrieved excerpts.
-- AI gets a bounded, per-module sample and must disclose that boundary.
create or replace function public.workspace_search_context(wid uuid, query_text text default '', counts_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; needle text:=public.workspace_search_normalize(query_text);
begin
  if auth.uid() is null or not exists(select 1 from workspaces where id=wid and user_id=auth.uid() and archived_at is null) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if length(coalesce(query_text,''))>120 then raise exception 'INVALID_SEARCH'; end if;
  with docs as materialized (select * from public.workspace_search_documents(wid)),
  counts as (select module,count(*) filter(where child_id is null) as records,count(*) filter(where child_id is not null) as children from docs group by module),
  matches as (
    select d.*,row_number() over(partition by module order by created_at desc,record_id,child_id nulls first) as n
    from docs d where not counts_only and (needle='' or strpos(public.workspace_search_normalize(concat_ws(' ',title,body)),needle)>0)
  ), sample as (select * from matches where n<=12 order by n,module limit 120)
  select jsonb_build_object('counts',coalesce((select jsonb_agg(to_jsonb(c) order by module) from counts c),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('module',module,'record_id',record_id,'child_id',child_id,'title',left(title,180),'preview',left(body,800),'meta',meta) order by n,module) from sample),'[]'::jsonb),
    'matched', (select count(*) from matches), 'sampled', (select count(*) from sample)) into result;
  return result;
end; $$;

-- Locate a paginated PomoNote directly instead of fetching every preceding page.
create or replace function public.pomonotes_search_target(wid uuid, tid uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',t.id,'workspace_id',w.id,'collection_id',t.collection_id,'created_by',t.created_by,
    'title',t.title,'completed',t.completed,'version',t.version,'created_at',t.created_at,'updated_at',t.updated_at,
    'estimated_sessions',p.estimated_sessions,'focus_seconds',p.focus_seconds,
    'first_estimate_seconds',p.first_estimate_seconds,'sessions',coalesce(g.sessions,0),'seconds',coalesce(g.seconds,0))
  from public.pomo_tasks t
  join public.workspace_module_bindings b on b.collection_id=t.collection_id and b.module='pomodoro'
  join public.workspaces w on w.id=b.workspace_id
  left join public.pomo_task_member_preferences p on p.task_id=t.id and p.user_id=auth.uid()
  left join lateral (
    select count(*) filter(where s.credited_completed) as sessions,
      coalesce(sum((select coalesce(sum(extract(epoch from (x->>1)::timestamptz-(x->>0)::timestamptz)),0)
        from jsonb_array_elements(coalesce(s.credited_segments,'[]')) x)),0) as seconds
    from public.analytics_focus_sessions s where s.user_id=auth.uid() and s.task_id=t.id
  ) g on true
  where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and 'pomodoro'=any(w.active_modules)
    and t.id=tid and public.collection_access(t.collection_id)
$$;
revoke all on function public.pomonotes_search_target(uuid,uuid) from public,anon;
grant execute on function public.pomonotes_search_target(uuid,uuid) to authenticated;
revoke all on function public.workspace_search_documents(uuid),public.workspace_search_text(text),public.workspace_search_normalize(text) from public,anon,authenticated;
revoke all on function public.search_workspace(uuid,text,integer,integer,text),public.workspace_search_context(uuid,text,boolean) from public,anon;
grant execute on function public.search_workspace(uuid,text,integer,integer,text),public.workspace_search_context(uuid,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
