-- Apply after sharing modules, workspace trash, PomoNotes and tasks/calendar.
-- Shared curriculum and private study records deliberately have different ACLs.
begin;
do $$begin
 if to_regclass('public.learning_subjects_items') is null
  or to_regprocedure('public.work_mutate(uuid,text,text,uuid,jsonb,integer)') is null
  or to_regprocedure('public.pomonotes_mutate(uuid,text,uuid,text,integer,integer,integer)') is null
  or to_regprocedure('public.trash_change(uuid,text,uuid,text,integer)') is null then
  raise exception 'Apply sharing modules, PomoNotes, workspace trash and tasks/calendar migrations before 202610230002_learning_workspace.sql.';
 end if;
end $$;
alter table public.learning_subjects add column if not exists position integer not null default 0;
alter table public.learning_subjects add column if not exists template_key text;
alter table public.learning_subjects add column if not exists template_revision text;
create unique index if not exists learning_template_subject_idx on public.learning_subjects(collection_id,template_key) where template_key is not null;

create table if not exists public.learning_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 subject_id uuid not null references public.learning_subjects(id) on delete cascade,
 topic_id text not null,
 status text not null default 'todo' check(status in ('todo','doing','done')),
 review_on date, last_reviewed_at timestamptz, streak integer not null default 0,
 version integer not null default 1,
 note_id uuid references public.todos(id) on delete set null,
 deck_id uuid references public.flashcard_decks(id) on delete set null,
 pomo_task_id uuid references public.pomo_tasks(id) on delete set null,
 primary key(user_id,subject_id,topic_id),
 foreign key(subject_id,topic_id) references public.learning_subjects_items(parent_id,id) on delete cascade
);
create table if not exists public.learning_mistakes (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 subject_id uuid not null, topic_id text not null,
 prompt text not null default '' check(length(prompt)<=4000),
 solution text not null default '' check(length(solution)<=4000),
 source text not null default '' check(length(source)<=300),
 reason text not null default '' check(reason in ('','knowledge','attention','time')),
 image_path text, resolved boolean not null default false, review_on date,
 attempts integer not null default 0, version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(), deleted_at timestamptz,
 foreign key(subject_id,topic_id) references public.learning_subjects_items(parent_id,id) on delete cascade
);
create index if not exists learning_mistakes_page_idx on public.learning_mistakes(user_id,workspace_id,created_at desc,id desc);
create index if not exists learning_progress_due_idx on public.learning_progress(user_id,review_on) where review_on is not null;
create index if not exists learning_focus_task_idx on public.analytics_focus_sessions(user_id,task_id) where task_id is not null;
create table if not exists public.learning_reviews (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 subject_id uuid not null, topic_id text not null,
 mistake_id uuid references public.learning_mistakes(id) on delete set null,
 correct boolean not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(subject_id,topic_id) references public.learning_subjects_items(parent_id,id) on delete cascade
);
create index if not exists learning_reviews_owner_idx on public.learning_reviews(user_id,subject_id,topic_id,created_at desc);

-- Preserve original booleans; adopt their meaning only for the original author.
insert into public.learning_progress(user_id,subject_id,topic_id,status)
 select s.user_id,s.id,i.id,case when i.data->>'master'='true' then 'done'
  when i.data->>'learn'='true' or i.data->>'practice'='true' then 'doing' else 'todo' end
 from public.learning_subjects s join public.learning_subjects_items i on i.parent_id=s.id
 on conflict do nothing;

do $$ declare t text;begin
 foreach t in array array['learning_progress','learning_mistakes','learning_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists learning_private_read on public.%I',t);
  execute format('create policy learning_private_read on public.%I for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.learning_subjects s where s.id=subject_id and s.deleted_at is null and public.collection_access(s.collection_id)))',t);
 end loop;
end $$;

create or replace function public.learning_context(wid uuid) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
 select b.collection_id into cid from workspace_module_bindings b join workspaces w on w.id=b.workspace_id
 where w.id=wid and w.user_id=auth.uid() and w.archived_at is null and b.module='learning';
 if cid is null or not public.collection_access(cid) or not exists(select 1 from workspaces w where w.id=wid and 'learning'=any(w.active_modules)) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
 return cid;
end $$;
revoke all on function public.learning_context(uuid) from public,anon,authenticated;

create or replace function public.learning_load(wid uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid:=public.learning_context(wid); answer jsonb;
begin
 select jsonb_build_object(
 'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.position,s.created_at,s.id) from learning_subjects s where s.collection_id=cid and s.deleted_at is null),'[]'),
 'progress',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('seconds',coalesce((select sum((select coalesce(sum(extract(epoch from (part->>1)::timestamptz-(part->>0)::timestamptz)),0) from jsonb_array_elements(f.credited_segments) part)) from analytics_focus_sessions f where f.user_id=auth.uid() and f.task_id=p.pomo_task_id),0)))
  from learning_progress p join learning_subjects s on s.id=p.subject_id where p.user_id=auth.uid() and s.collection_id=cid and s.deleted_at is null),'[]'),
 'due_mistakes',coalesce((select jsonb_agg(to_jsonb(m) order by m.review_on,m.created_at) from (select m.* from learning_mistakes m join learning_subjects s on s.id=m.subject_id
  join learning_subjects_items i on i.parent_id=m.subject_id and i.id=m.topic_id
  where m.user_id=auth.uid() and m.workspace_id=wid and m.deleted_at is null and not m.resolved and s.collection_id=cid and s.deleted_at is null
   and coalesce(i.data->>'archived','false')<>'true' order by m.review_on,m.created_at limit 100) m),'[]')) into answer;
 return answer;
end $$;

create or replace function public.learning_mistakes_page(wid uuid, filter text default 'open', after_time timestamptz default null, after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid:=public.learning_context(wid); answer jsonb;
begin
 if filter is null or filter not in ('open','resolved','archive','all') or (after_time is null)<>(after_id is null) then raise exception 'INVALID_LEARNING_INPUT';end if;
 with filtered as (select m.* from learning_mistakes m join learning_subjects s on s.id=m.subject_id join learning_subjects_items i on i.parent_id=m.subject_id and i.id=m.topic_id
  where m.user_id=auth.uid() and m.workspace_id=wid and s.collection_id=cid and s.deleted_at is null
   and coalesce(i.data->>'archived','false')<>'true'
   and case when filter='archive' then m.deleted_at is not null else m.deleted_at is null and (filter='all' or m.resolved=(filter='resolved')) end),
 page as(select * from filtered where after_time is null or (created_at,id)<(after_time,after_id) order by created_at desc,id desc limit 51),
 shown as(select * from page order by created_at desc,id desc limit 50)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(shown) order by created_at desc,id desc) from shown),'[]'),
 'has_more',(select count(*)>50 from page),'total',(select count(*) from filtered)) into answer;
 return answer;
end $$;

create or replace function public.learning_mutate(wid uuid,operation text,sid uuid default null,tid text default null,payload jsonb default '{}',expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_variable
<<state>>
declare cid uuid:=public.learning_context(wid); uid uuid:=auth.uid(); subject learning_subjects; topic learning_subjects_items;
 progress learning_progress; mistake learning_mistakes; result jsonb; row_data jsonb; item jsonb; other_item record;
 title text; color text; id uuid; today date; tz text:=coalesce(payload->>'timezone','UTC'); n integer; pos integer; key text; correct boolean;
begin
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>150000 then raise exception 'INVALID_LEARNING_INPUT';end if;
 if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'INVALID_LEARNING_INPUT';end if;
 today:=(clock_timestamp() at time zone tz)::date;
 perform 1 from module_collections where module_collections.id=cid for update;
 if operation in ('subject.create','template.import') then
  if not public.collection_write(cid) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation='template.import' then
   if coalesce(length(payload->>'key'),0) not between 1 and 80 or coalesce(length(payload->>'revision'),0) not between 1 and 40
    or jsonb_typeof(payload->'subjects') is distinct from 'array' or jsonb_array_length(payload->'subjects') not between 1 and 20 then raise exception 'INVALID_LEARNING_INPUT';end if;
   result:='[]';
   for row_data in select value from jsonb_array_elements(payload->'subjects') loop
    title:=btrim(row_data->>'title');key:=(payload->>'key')||':'||(row_data->>'key');
    if coalesce(length(title),0) not between 1 and 120 or coalesce(length(row_data->>'key'),0) not between 1 and 60
     or jsonb_typeof(row_data->'topics') is distinct from 'array' or jsonb_array_length(row_data->'topics') not between 1 and 100 then raise exception 'INVALID_LEARNING_INPUT';end if;
    select * into subject from learning_subjects where collection_id=cid and template_key=key;
    if subject.id is not null and subject.deleted_at is not null then raise exception 'LEARNING_TEMPLATE_IN_TRASH';end if;
    if subject.id is null then
     insert into learning_subjects(user_id,workspace_id,collection_id,title,color,template_key,template_revision,position)
      values(uid,wid,cid,title,'#64748B',key,payload->>'revision',coalesce((select max(position)+1 from learning_subjects where collection_id=cid),0)) returning * into subject;
    end if;
    for item in select value from jsonb_array_elements(row_data->'topics') loop
     if coalesce(length(btrim(item->>'title')),0) not between 1 and 160 or coalesce(length(item->>'key'),0) not between 1 and 100 then raise exception 'INVALID_LEARNING_INPUT';end if;
     insert into learning_subjects_items(parent_id,collection_id,id,data,position)
      values(subject.id,cid,'template:'||(item->>'key'),jsonb_build_object('title',btrim(item->>'title'),'learn',false,'practice',false,'master',false),
       coalesce((select max(position)+1 from learning_subjects_items where parent_id=subject.id),1)) on conflict do nothing;
    end loop;
    select to_jsonb(s) into row_data from learning_subjects s where s.id=subject.id;result:=result||jsonb_build_array(row_data);
   end loop;
   return jsonb_build_object('subjects',result);
  end if;
  title:=btrim(payload->>'title');color:=coalesce(payload->>'color','#64748B');
  if sid is null or coalesce(length(title),0) not between 1 and 120 or color!~'^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_LEARNING_INPUT';end if;
  select * into subject from learning_subjects where learning_subjects.id=sid;
  if subject.id is not null then
   if subject.collection_id<>cid or subject.deleted_at is not null then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  else
   insert into learning_subjects(id,user_id,workspace_id,collection_id,title,color,position)
    values(sid,uid,wid,cid,title,color,coalesce((select max(position)+1 from learning_subjects where collection_id=cid),0)) returning * into subject;
  end if;
  return jsonb_build_object('subject',to_jsonb(subject));
 end if;
 select * into subject from learning_subjects where learning_subjects.id=sid and collection_id=cid and deleted_at is null for update;
 if subject.id is null then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
 if operation like 'subject.%' or operation like 'topic.%' then
  if not public.collection_write(cid) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation like 'subject.%' and expected_version is distinct from subject.version then raise exception 'SHARING_CONFLICT';end if;
  if operation='subject.update' then
   title:=btrim(payload->>'title');color:=coalesce(payload->>'color',subject.color);
   if coalesce(length(title),0) not between 1 and 120 or color!~'^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_LEARNING_INPUT';end if;
   update learning_subjects set title=state.title,color=state.color where learning_subjects.id=sid;
  elsif operation='subject.move' then
   n:=(payload->>'direction')::integer;if n is null or n not in (-1,1) then raise exception 'INVALID_LEARNING_INPUT';end if;
   -- Normalize legacy equal positions before swapping; changes remain transactional.
   with ranked as(select s.id,row_number() over(order by s.position,s.created_at,s.id)::integer p from learning_subjects s where s.collection_id=cid and s.deleted_at is null)
    update learning_subjects s set position=r.p from ranked r where s.id=r.id and s.position<>r.p;
   select position into pos from learning_subjects where learning_subjects.id=sid;
   update learning_subjects set position=case when learning_subjects.id=sid then pos+n else pos end
    where collection_id=cid and (learning_subjects.id=sid or position=pos+n) and deleted_at is null;
   return jsonb_build_object('reload',true);
  elsif operation='topic.add' then
   if jsonb_typeof(payload->'titles') is distinct from 'array' or jsonb_array_length(payload->'titles') not between 1 and 100 then raise exception 'INVALID_LEARNING_INPUT';end if;
   for title in select btrim(value) from jsonb_array_elements_text(payload->'titles') loop
    if coalesce(length(title),0) not between 1 and 160 then raise exception 'INVALID_LEARNING_INPUT';end if;
    if not exists(select 1 from learning_subjects_items i where i.parent_id=sid and lower(i.data->>'title')=lower(title) and coalesce(i.data->>'archived','false')<>'true') then
     insert into learning_subjects_items(parent_id,collection_id,id,data,position) values(sid,cid,gen_random_uuid()::text,jsonb_build_object('title',title,'learn',false,'practice',false,'master',false),coalesce((select max(position)+1 from learning_subjects_items where parent_id=sid),1));
    end if;
   end loop;
  else
   select * into topic from learning_subjects_items where parent_id=sid and learning_subjects_items.id=tid for update;
   if topic.id is null or expected_version is distinct from topic.version then raise exception 'SHARING_CONFLICT';end if;
   if operation='topic.update' then
    title:=btrim(payload->>'title');if coalesce(length(title),0) not between 1 and 160 then raise exception 'INVALID_LEARNING_INPUT';end if;
    update learning_subjects_items set data=data||jsonb_build_object('title',title),version=version+1 where parent_id=sid and learning_subjects_items.id=tid;
   elsif operation in ('topic.archive','topic.restore') then
    update learning_subjects_items set data=data||jsonb_build_object('archived',operation='topic.archive'),version=version+1 where parent_id=sid and learning_subjects_items.id=tid;
   elsif operation='topic.move' then
    n:=(payload->>'direction')::integer;if n is null or n not in (-1,1) then raise exception 'INVALID_LEARNING_INPUT';end if;
    select i.id,i.position into other_item from learning_subjects_items i where i.parent_id=sid and coalesce(i.data->>'archived','false')<>'true'
     and case when n=1 then (i.position,i.id)>(topic.position,topic.id) else (i.position,i.id)<(topic.position,topic.id) end
     order by case when n=1 then position else -position end limit 1;
    if other_item.id is not null then
     update learning_subjects_items i set position=case when i.id=tid then other_item.position else topic.position end,version=version+1 where parent_id=sid and i.id in (tid,other_item.id);
    end if;
   else raise exception 'INVALID_LEARNING_INPUT';end if;
  end if;
  return jsonb_build_object('subject',(select to_jsonb(s) from learning_subjects s where s.id=sid));
 end if;

 select * into topic from learning_subjects_items where parent_id=sid and learning_subjects_items.id=tid and coalesce(data->>'archived','false')<>'true';
 if topic.id is null then raise exception 'LEARNING_TOPIC_UNAVAILABLE';end if;
 insert into learning_progress(user_id,subject_id,topic_id) values(uid,sid,tid) on conflict do nothing;
 select * into progress from learning_progress p where p.user_id=uid and p.subject_id=sid and p.topic_id=tid for update;
 if operation='progress.update' then
  if expected_version is null or (expected_version is distinct from progress.version and not(expected_version=0 and progress.version=1)) then raise exception 'SHARING_CONFLICT';end if;
  if coalesce(payload->>'status','') not in ('todo','doing','done') then raise exception 'INVALID_LEARNING_INPUT';end if;
  update learning_progress p set status=payload->>'status',review_on=case when payload->>'status'='done' then coalesce(review_on,today+1) else review_on end,version=version+1
   where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
 elsif operation in ('review','mistake.review') then
  id:=(payload->>'attempt_id')::uuid;correct:=(payload->>'correct')::boolean;
  if id is null or correct is null then raise exception 'INVALID_LEARNING_INPUT';end if;
  if exists(select 1 from learning_reviews r where r.id=state.id) then
   if not exists(select 1 from learning_reviews r where r.id=state.id and r.user_id=uid and r.subject_id=sid and r.topic_id=tid and r.correct=state.correct and r.mistake_id is not distinct from nullif(payload->>'id','')::uuid) then raise exception 'SHARING_CONFLICT';end if;
   select * into mistake from learning_mistakes m where m.id=nullif(payload->>'id','')::uuid and m.user_id=uid and m.workspace_id=wid;
  else
   if operation='mistake.review' then
    select * into mistake from learning_mistakes m where m.id=(payload->>'id')::uuid and m.user_id=uid and m.workspace_id=wid and m.subject_id=sid and m.topic_id=tid and m.deleted_at is null for update;
    if mistake.id is null or expected_version is distinct from mistake.version then raise exception 'SHARING_CONFLICT';end if;
    update learning_mistakes m set resolved=correct,attempts=attempts+1,review_on=case when correct then null else today+1 end,version=version+1 where m.id=mistake.id returning * into mistake;
   end if;
   insert into learning_reviews(id,user_id,subject_id,topic_id,mistake_id,correct) values(id,uid,sid,tid,mistake.id,correct);
   n:=case when correct then least(progress.streak+1,5) else 0 end;
   update learning_progress p set streak=n,review_on=today+(array[1,3,7,14,30,60])[n+1],last_reviewed_at=clock_timestamp(),version=version+1
    where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
  end if;
 elsif operation like 'mistake.%' then
  id:=(payload->>'id')::uuid;if id is null then raise exception 'INVALID_LEARNING_INPUT';end if;
  select * into mistake from learning_mistakes m where m.id=state.id for update;
  if mistake.id is not null and (mistake.user_id<>uid or mistake.workspace_id<>wid or mistake.subject_id<>sid or mistake.topic_id<>tid) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation='mistake.create' and mistake.id is not null then return jsonb_build_object('mistake',to_jsonb(mistake));end if;
  if operation<>'mistake.create' and (mistake.id is null or expected_version is distinct from mistake.version) then raise exception 'SHARING_CONFLICT';end if;
  if operation in ('mistake.create','mistake.update') then
   if coalesce(length(btrim(payload->>'prompt')),0)=0 and coalesce(length(btrim(payload->>'source')),0)=0 and nullif(payload->>'image_path','') is null then raise exception 'INVALID_LEARNING_INPUT';end if;
   if nullif(payload->>'image_path','') is not null and (payload->>'image_path' !~ ('^'||uid::text||'/'||wid::text||'/[0-9a-f-]{36}\.(webp|png|jpg|jpeg)$')) then raise exception 'INVALID_LEARNING_INPUT';end if;
   if operation='mistake.create' then
    insert into learning_mistakes(id,user_id,workspace_id,subject_id,topic_id,prompt,solution,source,reason,image_path,review_on)
     values(id,uid,wid,sid,tid,coalesce(payload->>'prompt',''),coalesce(payload->>'solution',''),coalesce(payload->>'source',''),coalesce(payload->>'reason',''),nullif(payload->>'image_path',''),today) returning * into mistake;
   else
    update learning_mistakes m set prompt=coalesce(payload->>'prompt',''),solution=coalesce(payload->>'solution',''),source=coalesce(payload->>'source',''),reason=coalesce(payload->>'reason',''),image_path=nullif(payload->>'image_path',''),version=version+1 where m.id=id returning * into mistake;
   end if;
  elsif operation in ('mistake.archive','mistake.restore') then
   update learning_mistakes m set deleted_at=case when operation='mistake.archive' then clock_timestamp() else null end,version=version+1 where m.id=id returning * into mistake;
  else raise exception 'INVALID_LEARNING_INPUT';end if;
 elsif operation in ('link.note','link.deck','link.focus','link.plan') then
  if not exists(select 1 from workspaces w where w.id=wid and (case operation when 'link.note' then 'detailed' when 'link.deck' then 'flashcards' when 'link.focus' then 'pomodoro' else 'tasks' end)=any(w.active_modules)) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
  if operation='link.note' then
   if progress.note_id is null or not exists(select 1 from todos t join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='detailed' and b.workspace_id=wid where t.id=progress.note_id and t.deleted_at is null and collection_access(t.collection_id)) then
    select b.collection_id into id from workspace_module_bindings b where b.workspace_id=wid and b.module='detailed';
    if not collection_write(id) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
    insert into todos(created_by,workspace_id,collection_id,title,description,completed) values(uid,wid,id,left(topic.data->>'title',120),'',false) returning todos.id into id;
    update learning_progress p set note_id=id,version=version+1 where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
   end if;
   result:=jsonb_build_object('module','detailed','id',progress.note_id);
  elsif operation='link.deck' then
   if progress.deck_id is null or not exists(select 1 from flashcard_decks d join workspace_module_bindings b on b.collection_id=d.collection_id and b.module='flashcards' and b.workspace_id=wid where d.id=progress.deck_id and d.deleted_at is null and collection_access(d.collection_id)) then
    select b.collection_id into id from workspace_module_bindings b where b.workspace_id=wid and b.module='flashcards';
    if not collection_write(id) then raise exception 'LEARNING_ACCESS_DENIED' using errcode='42501';end if;
    insert into flashcard_decks(user_id,workspace_id,collection_id,title,color,cards) values(uid,wid,id,topic.data->>'title','#64748B','[]') returning flashcard_decks.id into id;
    update learning_progress p set deck_id=id,version=version+1 where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
   end if;
   result:=jsonb_build_object('module','flashcards','id',progress.deck_id);
  elsif operation='link.focus' then
   n:=coalesce((payload->>'seconds')::integer,1500);
   if progress.pomo_task_id is null or not exists(select 1 from pomo_tasks t join workspace_module_bindings b on b.collection_id=t.collection_id and b.module='pomodoro' and b.workspace_id=wid where t.id=progress.pomo_task_id and t.deleted_at is null and collection_access(t.collection_id)) then
    row_data:=public.pomonotes_mutate(wid,'create',null,topic.data->>'title',1,n,null);
    update learning_progress p set pomo_task_id=(row_data->>'id')::uuid,version=version+1 where p.user_id=uid and p.subject_id=sid and p.topic_id=tid returning * into progress;
   else row_data:=public.pomonotes_mutate(wid,'goal',progress.pomo_task_id,null,1,n,null);end if;
   result:=jsonb_build_object('module','pomodoro','target',row_data);
  else
   id:=(payload->>'id')::uuid;
   row_data:=public.work_mutate(wid,'block','create',id,jsonb_build_object('title',left(subject.title||' · '||(topic.data->>'title'),180),'starts_at',payload->>'starts_at','ends_at',payload->>'ends_at','timezone',tz),null);
   result:=jsonb_build_object('module','tasks','id',row_data->>'id');
  end if;
 else raise exception 'INVALID_LEARNING_INPUT';end if;
 return jsonb_build_object('progress',to_jsonb(progress),'mistake',case when mistake.id is null then null else to_jsonb(mistake) end,'link',result);
end $$;
revoke all on function public.learning_load(uuid),public.learning_mistakes_page(uuid,text,timestamptz,uuid),public.learning_mutate(uuid,text,uuid,text,jsonb,integer) from public,anon;
grant execute on function public.learning_load(uuid),public.learning_mistakes_page(uuid,text,timestamptz,uuid),public.learning_mutate(uuid,text,uuid,text,jsonb,integer) to authenticated;

-- Private question photos: never reuse the shared note-image bucket.
do $$begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('learning-images','learning-images',false,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
  execute 'drop policy if exists learning_image_owner on storage.objects';
  execute $policy$create policy learning_image_owner on storage.objects for all to authenticated
   using(bucket_id='learning-images' and split_part(objects.name,'/',1)=auth.uid()::text and exists(select 1 from public.workspaces w where w.id::text=split_part(objects.name,'/',2) and w.user_id=auth.uid() and w.archived_at is null))
   with check(bucket_id='learning-images' and split_part(objects.name,'/',1)=auth.uid()::text and exists(select 1 from public.workspaces w where w.id::text=split_part(objects.name,'/',2) and w.user_id=auth.uid() and w.archived_at is null))$policy$;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
