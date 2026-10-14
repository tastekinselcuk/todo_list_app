const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {PGlite}=require('@electric-sql/pglite')
const {projectDB}=require('./helpers/project-db.cjs')
const sql=fs.readFileSync('supabase/diagnostics/application_health.sql','utf8')
const run=async db=>{await db.exec(sql);return (await db.query('select * from pg_temp.todo_application_health')).rows}

test('the reviewed repair sequence clears both reported failures while preserving the active session and notes',async()=>{
 const f=await projectDB(['202610110001_reminder_delivery','202610110002_pomonotes']);const {db,as,owner,wid,rpc}=f
 try{
  await as(owner)
  const task=await rpc("select pomonotes_mutate($1,'create',null,'Preserved task',2,60) as result",[wid])
  const proposal={id:'40000000-0000-0000-0000-000000000004',workspace_id:wid,started_at:new Date().toISOString(),planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id}
  await rpc('select claim_focus_session($1,$2,false) as result',['30000000-0000-0000-0000-000000000003',JSON.stringify(proposal)])
  await db.exec('reset role;grant execute on function ensure_default_workspace() to anon')
  const before=(await db.query('select * from analytics_focus_sessions where id=$1',[proposal.id])).rows[0]
  let rows=await run(db)
  assert.equal(rows.find(r=>r.check_name==='end_focus_session(uuid)').status,'FAIL')
  const acl=rows.find(r=>r.check_name==='ensure_default_workspace() execute');assert.equal(acl.status,'FAIL');assert.match(acl.detail,/anon=true/)
  for(const name of ['202610110003_focus_repair','202610120001_workspace_rpc_permissions'])await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
  rows=await run(db)
  for(const name of ['end_focus_session(uuid) execute','ensure_default_workspace() execute','focus_terminal_recent_idx'])assert.equal(rows.find(r=>r.check_name===name).status,'PASS')
  assert.deepEqual(rows.filter(r=>r.area==='versions'&&r.status!=='PASS'),[])
  assert.deepEqual((await db.query('select * from analytics_focus_sessions where id=$1',[proposal.id])).rows[0],before)
  assert.equal((await db.query('select title from pomo_tasks where id=$1',[task.id])).rows[0].title,'Preserved task')
 }finally{await db.close()}
})

test('database health script reports missing and partial schemas without changing public data',async()=>{
 const db=new PGlite()
 try{
  let rows=await run(db);assert.ok(rows.some(r=>r.status==='FAIL'&&r.check_name==='pomo_tasks'))
  assert.ok(rows.some(r=>r.status==='SKIP'&&r.check_name==='focus metadata'))
  await db.exec('create table public.pomo_tasks(id uuid primary key,title text);insert into public.pomo_tasks values(gen_random_uuid(),\'Secret must not appear\')')
  rows=await run(db);assert.ok(rows.some(r=>r.status==='FAIL'&&r.check_name==='pomo_tasks columns'))
  assert.equal(JSON.stringify(rows).includes('Secret must not appear'),false)
  assert.equal((await db.query('select count(*)::int as n from pomo_tasks')).rows[0].n,1)
  assert.equal((await db.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n,1)
 }finally{await db.close()}
})

test('health script validates real focus functions and detects downgrade, broad policy and bad fences',async()=>{
 const f=await projectDB(['202610110001_reminder_delivery','202610110002_pomonotes','202610110003_focus_repair']);const {db,as,owner,wid,rpc}=f
 try{
  let rows=await run(db)
  const important=rows.filter(r=>/pomo|focus|claim_periodic_email|finish_periodic_email/.test(r.check_name))
  assert.deepEqual(important.filter(r=>r.status==='FAIL'||r.status==='SKIP'),[])
  assert.deepEqual(rows.filter(r=>r.area==='versions'&&r.status!=='PASS'),[])
  assert.equal(rows.find(r=>r.check_name==='pomo_tasks.guard_collection_record').status,'PASS')
  assert.equal(rows.find(r=>r.check_name==='pomo_tasks.analytics_capture').status,'PASS')
  await as(owner);const task=await rpc("select pomonotes_mutate($1,'create',null,'Private',2,60) as result",[wid])
  const proposal={id:'40000000-0000-0000-0000-000000000004',workspace_id:wid,started_at:new Date().toISOString(),planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id}
  await rpc('select claim_focus_session($1,$2,false) as result',['30000000-0000-0000-0000-000000000003',JSON.stringify(proposal)])
  await db.exec("reset role;update focus_ownership set lease=gen_random_uuid();create policy unsafe_legacy on pomo_tasks for select using(true);grant execute on function end_focus_session(uuid) to anon;drop function focus_context(uuid)")
  rows=await run(db)
  assert.equal(rows.find(r=>r.check_name==='focus ownership fence').status,'FAIL')
  assert.equal(rows.find(r=>r.check_name==='pomo_tasks broad legacy policies').status,'FAIL')
  assert.equal(rows.find(r=>r.check_name==='end_focus_session(uuid) execute').status,'FAIL')
  assert.equal(rows.find(r=>r.check_name==='focus_context(uuid)').status,'FAIL')
  assert.equal((await db.query('select count(*)::int as n from pomo_tasks')).rows[0].n,1)
 }finally{await db.close()}
})
