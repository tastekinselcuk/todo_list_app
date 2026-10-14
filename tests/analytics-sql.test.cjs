const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const owner='10000000-0000-0000-0000-000000000001', guest='20000000-0000-0000-0000-000000000002'
const analytics=fs.readFileSync('supabase/migrations/analytics.sql','utf8')

test('analytics records semantic changes atomically, deduplicates shared scopes and protects private focus', async () => {
  const db=new PGlite()
  try {
    // The requested reports use UTC; current_date must follow that same boundary.
    await db.exec("set time zone 'UTC'")
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create table auth.users(id uuid primary key,email text);
      insert into auth.users values('${owner}','owner@test.invalid'),('${guest}','guest@test.invalid');
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema public,auth to authenticated,anon;
      create table quick_notes(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),content text,completed boolean default false,created_at timestamptz default now());
      create table todos(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),category_id uuid,title text,completed boolean default false,created_at timestamptz default now());
      create table categories(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),name text,created_at timestamptz default now(),unique(created_by,name));
      create table code_snippets(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),code text,created_at timestamptz default now());
      create table activity_items(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),external_id text,created_at timestamptz default now());
      create table plans(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,period text,period_date date,completed boolean default false,reason text default '',history jsonb default '[]',created_at timestamptz default now());
      create table learning_subjects(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,topics jsonb default '[]',created_at timestamptz default now());
      create table flashcard_decks(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,cards jsonb default '[]',created_at timestamptz default now());
      create table workout_routines(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,exercises jsonb default '[]',created_at timestamptz default now());
      create table periodic_tasks(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,notes text,category text,frequency text,days_of_week int[],day_of_month int,month_of_year int,interval_days int,anchor_date date,completed_date date,reminder_time time,notify_browser boolean default true,notify_email boolean default false,last_notified_at timestamptz,created_at timestamptz default now());
      grant all on quick_notes,todos,categories,code_snippets,activity_items,plans,learning_subjects,flashcard_decks,workout_routines,periodic_tasks to authenticated;
      insert into quick_notes(created_by,content,completed) values('${owner}','Legacy completed',true);
    `)
    for(const file of ['workspaces','tab_sharing','tab_sharing_modules','tab_sharing_permissions']) await db.exec(fs.readFileSync(`supabase/migrations/${file}.sql`,'utf8'))
    await db.exec(analytics)
    const workspaces=(await db.query('select * from workspaces')).rows
    const wid=workspaces.find(w=>w.user_id===owner).id, gwid=workspaces.find(w=>w.user_id===guest).id
    const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
    const rpc=async(sql,args=[])=>(await db.query(sql,args)).rows[0].result
    const day=(await db.query('select current_date::text as d')).rows[0].d
    const report=()=>rpc("select analytics_report($1,$2,$2,'UTC',true) as result",[wid,day])
    await as(owner)
    assert.equal((await report()).daily[0].completed,0,'baseline completed notes have no invented completion date')
    const binding=(await db.query("select * from workspace_module_bindings where workspace_id=$1 and module='quick'",[wid])).rows[0]
    const note=(await db.query("insert into quick_notes(created_by,workspace_id,collection_id,content) values($1,$2,$3,'New') returning *",[owner,wid,binding.collection_id])).rows[0]
    await db.query('update quick_notes set completed=true where id=$1',[note.id])
    await db.query('update quick_notes set completed=false where id=$1',[note.id])
    await db.query('update quick_notes set completed=true where id=$1',[note.id])
    await db.query("update quick_notes set content='Changed text only' where id=$1",[note.id])
    let r=await report()
    assert.equal(r.daily[0].created,1);assert.equal(r.daily[0].completed,1);assert.equal(r.daily[0].reopened,1)
    await db.query('delete from quick_notes where id=$1',[note.id])
    r=await report();assert.equal(r.daily[0].deleted,1);assert.equal(r.daily[0].completed,1)
    assert.ok(!r.items.some(i=>i.record_id===note.id),'deleted note text is absent')
    const pb=(await db.query("select * from workspace_module_bindings where workspace_id=$1 and module='plans'",[wid])).rows[0]
    // Plans roll over in the collection's timezone, independently of the report.
    await db.query("insert into plans(user_id,workspace_id,collection_id,title,period,period_date) values($1,$2,$3,'Carry','daily',(now() at time zone (select timezone from module_collections where id=$3))::date-2)",[owner,wid,pb.collection_id])
    await rpc('select rollover_collection_plans($1) as result',[pb.collection_id])
    r=await report();assert.equal(r.items.find(i=>i.module==='plans').carry_count,2)
    await db.exec('reset role')
    assert.equal((await db.query("select actor_id from analytics_events where kind='rollover'")).rows[0].actor_id,null)
    const started=new Date(`${day}T00:00:00Z`)
    // Use yesterday so timestamps remain valid regardless of the test's current hour.
    started.setUTCDate(started.getUTCDate()-1)
    const a=started.toISOString(),b=new Date(+started+600000).toISOString(),c=new Date(+started+900000).toISOString()
    const yesterday=a.slice(0,10)
    await as(owner)
    const payload={id:'40000000-0000-0000-0000-000000000004',workspace_id:wid,started_at:a,planned_seconds:600,revision:2,status:'completed',segments:[[a,b]]}
    await rpc('select record_focus_session($1) as result',[JSON.stringify(payload)])
    await rpc('select record_focus_session($1) as result',[JSON.stringify({...payload,revision:1,status:'running',segments:[]})])
    await rpc('select record_focus_session($1) as result',[JSON.stringify({...payload,id:'50000000-0000-0000-0000-000000000005',planned_seconds:900,segments:[[a,c]]})])
    let focus=await rpc("select analytics_report($1,$2,$2,'UTC',true) as result",[wid,yesterday])
    assert.equal(focus.daily[0].seconds,900,'overlapping devices and duplicate retries cannot double duration')
    const midnightStart=`${yesterday}T20:55:00.000Z`,midnightEnd=`${yesterday}T21:05:00.000Z`
    await rpc('select record_focus_session($1) as result',[JSON.stringify({...payload,id:'70000000-0000-0000-0000-000000000007',started_at:midnightStart,segments:[[midnightStart,midnightEnd]]})])
    const split=await rpc("select analytics_report($1,$2,$3,'Europe/Istanbul',true) as result",[wid,yesterday,day])
    assert.equal(split.daily[0].seconds,1200);assert.equal(split.daily[1].seconds,300,'focus crossing local midnight is split across local days')
    await assert.rejects(rpc('select record_focus_session($1) as result',[JSON.stringify({...payload,id:'60000000-0000-0000-0000-000000000006',segments:[[b,a]]})]),/INVALID_FOCUS_SESSION/)
    const invitation=await rpc("select create_collection_invite($1,'quick','editor') as result",[wid])
    await as(guest);await rpc('select accept_collection_invite($1,$2) as result',[invitation.token,gwid])
    focus=await rpc("select analytics_report($1,$2,$2,'UTC',true) as result",[gwid,yesterday])
    assert.equal(focus.daily[0].seconds,0,'sharing notes does not share focus history')
    const sharedNote=(await db.query("insert into quick_notes(created_by,workspace_id,collection_id,content) values($1,$2,$3,'Guest note') returning id",[guest,gwid,binding.collection_id])).rows[0]
    await db.query('update quick_notes set completed=true where id=$1',[sharedNote.id])
    const mine=await rpc("select analytics_report($1,$2,$2,'UTC',true) as result",[gwid,day])
    const team=await rpc("select analytics_report($1,$2,$2,'UTC',false) as result",[gwid,day])
    assert.equal(mine.daily[0].completed,1);assert.equal(team.daily[0].completed,2,'personal and collection activity are distinguished')
    await assert.rejects(rpc("select analytics_report($1,$2,$2,'UTC',true) as result",[wid,day]),/WORKSPACE_FORBIDDEN/)
    await assert.rejects(rpc('select record_focus_session($1) as result',[JSON.stringify({...payload,workspace_id:gwid,revision:3})]),/FOCUS_SESSION_FORBIDDEN/)
    await assert.rejects(db.query('select * from analytics_focus_sessions'),/permission denied/)
    await as(owner)
    const w2=(await db.query("insert into workspaces(user_id,name) values($1,'Second') returning id",[owner])).rows[0].id
    await rpc('select accept_collection_invite($1,$2) as result',[(await rpc("select create_collection_invite($1,'quick','viewer') as result",[wid])).token,w2])
    const all=await rpc("select analytics_report(null,$1,$1,'UTC',true) as result",[day])
    assert.equal(all.daily[0].completed,1,'the same collection bound twice is counted once')
    await rpc("select manage_collection($1,'remove_member',$2) as result",[binding.collection_id,guest])
    await as(guest)
    const revoked=await rpc("select analytics_report($1,$2,$2,'UTC',false) as result",[gwid,day])
    assert.equal(revoked.daily[0].completed,0);assert.equal(revoked.items.length,0,'revoked collections disappear from reports immediately')
    await db.exec('reset role');await db.exec(analytics)
    assert.equal((await db.query("select count(*)::int as n from analytics_events where kind='baseline'")).rows[0].n,1,'reruns preserve the original baseline')
    await db.exec('set role anon')
    await assert.rejects(rpc("select analytics_report(null,$1,$1,'UTC',true) as result",[day]),/permission denied/)
  } finally {await db.close()}
})
