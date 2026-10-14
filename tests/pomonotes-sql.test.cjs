const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {projectDB}=require('./helpers/project-db.cjs')

test('browser journal resumed at a microsecond SQL boundary writes valid non-overlapping segments',async()=>{
 const vm=require('node:vm'),ts=require('typescript'),exports={}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/analytics/lib/focusJournal.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,console})
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair'])
 const entries=new Map(),cache={get length(){return entries.size},key:i=>[...entries.keys()][i],getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)}
 try{
  await f.as(f.owner)
  let clock=Math.floor((Date.now()-60_000)/1000)*1000+856
  const started=new Date(clock-10_000).toISOString(),end=new Date(clock).toISOString().replace('.856Z','.856714Z')
  const seed={id:'40000000-0000-0000-0000-000000000004',workspace_id:f.wid,started_at:started,planned_seconds:60,revision:1,status:'paused',segments:[[started,end]],association:'free'}
  await f.rpc('select record_focus_session($1) as result',[JSON.stringify(seed)])
  const failures=[]
  const journal=new exports.FocusJournal(f.owner,cache,'tab',async value=>{try{await f.rpc('select record_focus_session($1) as result',[JSON.stringify(value)])}catch(error){failures.push(error.message);throw error}},()=>clock,()=> '50000000-0000-0000-0000-000000000005')
  journal.adopt(seed);journal.start(f.wid,60);clock+=20;journal.end();await journal.flush()
  assert.deepEqual(failures,[],'a PostgreSQL microsecond handoff must not produce INVALID_FOCUS_SESSION')
  assert.equal(journal.pending().length,0)
  await f.db.exec('reset role')
  const saved=(await f.db.query('select status,segments from analytics_focus_sessions where id=$1',[seed.id])).rows[0]
  assert.equal(saved.status,'ended');assert.equal(saved.segments[0][1],end,'server precision must be preserved')
 }finally{await f.db.close()}
})

test('explicit stop is private, preserves partial credit and fences late writes without stopping a newer session',async()=>{
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair']);const {db,as,rpc,owner,guest,wid}=f
 try{
  await as(owner);const client='30000000-0000-0000-0000-000000000003'
  const task=await rpc("select pomonotes_mutate($1,'create',null,'Stop',2,60) as result",[wid])
  const proposal={id:'40000000-0000-0000-0000-000000000004',workspace_id:wid,started_at:new Date(Date.now()-20_000).toISOString(),planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id}
  const claim=await rpc('select claim_focus_session($1,$2,false) as result',[client,JSON.stringify(proposal)])
  await as(guest);await assert.rejects(rpc('select end_focus_session($1) as result',[proposal.id]),/FOCUS_SESSION_FORBIDDEN/)
  await as(owner);await db.exec('reset role');await db.query("update focus_ownership set segment_started_at=clock_timestamp()-interval '10 seconds' where user_id=$1",[owner]);await as(owner)
  await rpc('select end_focus_session($1) as result',[proposal.id])
  let context=await rpc('select focus_context($1) as result',[client]);assert.equal(context.active,null);assert.ok(context.closed.includes(proposal.id))
  await rpc('select record_focus_session($1) as result',[JSON.stringify({...claim.active,revision:999,status:'running',segments:[]})])
  const page=await rpc('select pomonotes_page($1) as result',[wid]);assert.equal(page.items[0].sessions,0);assert.ok(page.items[0].seconds>=9&&page.items[0].seconds<15)
  const next={...proposal,id:'50000000-0000-0000-0000-000000000005',started_at:new Date().toISOString()}
  await rpc('select claim_focus_session($1,$2,false) as result',[client,JSON.stringify(next)])
  await rpc('select end_focus_session($1) as result',[proposal.id]);context=await rpc('select focus_context($1) as result',[client]);assert.equal(context.active.id,next.id)
  await rpc('select record_focus_session($1) as result',[JSON.stringify({...context.active,status:'paused',revision:context.active.revision+1,segments:[]})])
  await db.exec('reset role');await db.query("update focus_ownership set segment_started_at=clock_timestamp()-interval '1 hour' where user_id=$1",[owner]);await as(owner)
  await rpc('select end_focus_session($1) as result',[next.id]);context=await rpc('select focus_context($1) as result',[client]);assert.equal(context.active,null)
  await db.exec('reset role');assert.equal((await db.query('select jsonb_array_length(segments) as n from analytics_focus_sessions where id=$1',[next.id])).rows[0].n,0,'paused idle gap must not be credited')
  assert.equal((await db.query("select has_function_privilege('anon','public.end_focus_session(uuid)','EXECUTE') as allowed")).rows[0].allowed,false)
  // A provisional offline session can arrive without any lease. Stopping it
  // still needs a complete permanent fence rather than a half-null writer pair.
  await as(owner)
  const offline={...proposal,id:'60000000-0000-0000-0000-000000000006',association:'free',task_id:null,status:'paused'}
  await rpc('select record_focus_session($1) as result',[JSON.stringify(offline)])
  await rpc('select end_focus_session($1) as result',[offline.id])
  await rpc('select record_focus_session($1) as result',[JSON.stringify({...offline,revision:999,status:'running'})])
  await db.exec('reset role')
  const closed=(await db.query('select status,writer_client,writer_lease from analytics_focus_sessions where id=$1',[offline.id])).rows[0]
  assert.equal(closed.status,'ended');assert.ok(closed.writer_client);assert.ok(closed.writer_lease)
  await db.exec(fs.readFileSync('supabase/migrations/202610110003_focus_repair.sql','utf8'))
 }finally{await db.close()}
})
test('PomoNotes pagination, personal goals and focus credit preserve sharing permissions',async()=>{
 const f=await projectDB(['202610110002_pomonotes']);const {db,owner,guest,wid,gwid,as,rpc}=f
 try{
  await as(owner)
  const task=await rpc("select pomonotes_mutate($1,'create',null,'Task',2,60) as result",[wid])
  let page=await rpc('select pomonotes_page($1) as result',[wid]);assert.equal(page.total,1);assert.equal(page.items[0].estimated_sessions,2)
  const client='30000000-0000-0000-0000-000000000003'
  const start=new Date(Date.now()-120000).toISOString(),end=new Date(Date.now()-60000).toISOString()
  const proposal={id:'40000000-0000-0000-0000-000000000004',workspace_id:wid,started_at:start,planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id,estimated_sessions:2,goal_seconds:60}
  const claim=await rpc('select claim_focus_session($1,$2,false) as result',[client,JSON.stringify(proposal)])
  const payload={...proposal,client_id:client,lease:claim.active.lease,revision:2,status:'completed',segments:[[start,end]]}
  await rpc('select record_focus_session($1) as result',[JSON.stringify(payload)])
  await rpc('select record_focus_session($1) as result',[JSON.stringify(payload)])
  page=await rpc('select pomonotes_page($1) as result',[wid]);assert.equal(page.items[0].sessions,1);assert.equal(Math.round(page.items[0].seconds),60)
  const report=await rpc('select analytics_report($1,current_date,current_date,\'UTC\') as result',[wid])
  assert.equal(Math.round(report.focus_breakdown.task),60);assert.equal(report.completed_sessions,1)
  const summary=await rpc('select analytics_summary($1,current_date,current_date,\'UTC\') as result',[wid])
  assert.equal(summary.items,undefined);assert.equal(summary.completed_sessions,report.completed_sessions)
  assert.equal(summary.focus_breakdown.task,report.focus_breakdown.task)
  assert.equal(page.items[0].first_estimate_seconds,120)
  await rpc("select pomonotes_mutate($1,'goal',$2,null,5,60) as result",[wid,task.id])
  page=await rpc('select pomonotes_page($1) as result',[wid]);assert.equal(page.items[0].first_estimate_seconds,120);assert.equal(page.items[0].estimated_sessions,5)
  // A conflicting offline ID has its raw record, but no second minute or cycle credit.
  await rpc('select record_focus_session($1) as result',[JSON.stringify({...payload,id:'50000000-0000-0000-0000-000000000005',lease:undefined,client_id:undefined})])
  page=await rpc('select pomonotes_page($1) as result',[wid]);assert.equal(page.items[0].sessions,1);assert.equal(Math.round(page.items[0].seconds),60)
  await assert.rejects(rpc("select pomonotes_mutate($1,'complete',$2,null,1,60,999) as result",[wid,task.id]),/SHARING_CONFLICT/)
  const invite=await rpc("select create_collection_invite($1,'pomodoro','viewer') as result",[wid])
  await as(guest);await rpc('select accept_collection_invite($1,$2) as result',[invite.token,gwid])
  page=await rpc('select pomonotes_page($1) as result',[gwid]);assert.equal(page.items[0].sessions,0);assert.equal(page.items[0].estimated_sessions,null)
  await rpc("select pomonotes_mutate($1,'goal',$2,null,3,60) as result",[gwid,task.id])
  assert.equal((await rpc('select pomonotes_page($1) as result',[gwid])).items[0].estimated_sessions,3)
  await assert.rejects(rpc("select pomonotes_mutate($1,'complete',$2,null,1,60,$3) as result",[gwid,task.id,task.version]),/READ_ONLY/)
  assert.equal((await rpc('select pomonotes_history($1,$2) as result',[gwid,task.id])).length,0)
  assert.equal(Object.keys((await rpc('select analytics_report($1,current_date,current_date,\'UTC\') as result',[gwid])).focus_breakdown).length,0)
  await assert.rejects(db.query('select * from pomo_task_member_preferences'),/permission denied/)
  await as(owner)
  await rpc("select pomonotes_mutate($1,'create',null,'Another',1,60) as result",[wid])
  page=await rpc("select pomonotes_page($1,'active','',null,1) as result",[wid]);assert.equal(page.items.length,1);assert.equal(page.has_more,true)
  const next=await rpc("select pomonotes_page($1,'active','',$2,1) as result",[wid,JSON.stringify(page.cursor)])
  assert.notEqual(next.items[0].id,page.items[0].id);assert.equal(next.has_more,false)
  await rpc("select pomonotes_mutate($1,'delete',$2,null,1,60,$3) as result",[wid,task.id,task.version])
  const deletedReport=await rpc('select analytics_report($1,current_date,current_date,\'UTC\') as result',[wid])
  assert.equal(Math.round(deletedReport.focus_breakdown.unavailable),60)
  assert.equal(deletedReport.focus_breakdown.free,undefined)
  await db.exec('reset role')
  const historical=(await db.query("select association,task_id,credited_completed from analytics_focus_sessions where id=$1",[proposal.id])).rows[0]
  assert.equal(historical.association,'task');assert.equal(historical.task_id,null);assert.equal(historical.credited_completed,true)
  await db.exec(fs.readFileSync('supabase/migrations/202610110002_pomonotes.sql','utf8'))
 }finally{await db.close()}
})

test('focus lease handoff rejects stale owners and freezes task attribution',async()=>{
 const f=await projectDB(['202610110002_pomonotes']);const {db,wid,owner,as,rpc}=f
 try{
  await as(owner)
  const task=await rpc("select pomonotes_mutate($1,'create',null,'Focus',1,60) as result",[wid])
  const other=await rpc("select pomonotes_mutate($1,'create',null,'Other',1,60) as result",[wid])
  const a='30000000-0000-0000-0000-000000000003',b='40000000-0000-0000-0000-000000000004'
  const proposal={id:'60000000-0000-0000-0000-000000000006',workspace_id:wid,started_at:new Date(Date.now()-10000).toISOString(),planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id}
  const first=await rpc('select claim_focus_session($1,$2,false) as result',[a,JSON.stringify(proposal)])
  assert.equal((await rpc('select claim_focus_session($1,$2,false) as result',[b,JSON.stringify({...proposal,id:'70000000-0000-0000-0000-000000000007'})])).status,'busy')
  const transferred=await rpc('select claim_focus_session($1,null,true) as result',[b]);assert.equal(transferred.active.id,proposal.id)
  assert.equal(transferred.active.status,'paused');assert.notEqual(transferred.active.lease,first.active.lease)
  await rpc('select record_focus_session($1) as result',[JSON.stringify({...proposal,client_id:a,lease:first.active.lease,revision:99,status:'paused'})])
  const current=await rpc('select focus_context($1) as result',[b]);assert.notEqual(current.active.revision,99)
  await assert.rejects(rpc('select record_focus_session($1) as result',[JSON.stringify({...transferred.active,task_id:other.id,revision:current.active.revision+1})]),/FOCUS_TARGET_IMMUTABLE/)
  // Fencing remains attached to A after another session becomes the active holder.
  const replacement={...proposal,id:'70000000-0000-0000-0000-000000000007',task_id:other.id,started_at:new Date().toISOString()}
  await rpc('select claim_focus_session($1,$2,false) as result',[b,JSON.stringify(replacement)])
  await rpc('select record_focus_session($1) as result',[JSON.stringify({...proposal,client_id:a,lease:first.active.lease,revision:100,status:'paused'})])
  await db.exec('reset role')
  assert.notEqual((await db.query('select revision from analytics_focus_sessions where id=$1',[proposal.id])).rows[0].revision,100)
 }finally{await db.close()}
})

test('handoff after a paused resume excludes the idle gap and revoked tasks keep private time',async()=>{
 const f=await projectDB(['202610110002_pomonotes']);const {db,wid,gwid,owner,guest,as,rpc}=f
 try {
  await as(owner)
  const task=await rpc("select pomonotes_mutate($1,'create',null,'Private focus',5,60) as result",[wid])
  const invitation=await rpc("select create_collection_invite($1,'pomodoro','viewer') as result",[wid])
  await as(guest);await rpc('select accept_collection_invite($1,$2) as result',[invitation.token,gwid])
  const a='30000000-0000-0000-0000-000000000003',b='40000000-0000-0000-0000-000000000004'
  const start=new Date(Date.now()-3600000).toISOString(),end=new Date(Date.now()-3590000).toISOString()
  const proposal={id:'80000000-0000-0000-0000-000000000008',workspace_id:gwid,started_at:start,planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id}
  const first=await rpc('select claim_focus_session($1,$2,false) as result',[a,JSON.stringify(proposal)])
  const paused={...proposal,revision:2,status:'paused',segments:[[start,end]],client_id:a,lease:first.active.lease}
  await rpc('select record_focus_session($1) as result',[JSON.stringify(paused)])
  await rpc('select claim_focus_session($1,$2,false) as result',[a,JSON.stringify({...paused,revision:3,status:'running'})])
  const handoff=await rpc('select claim_focus_session($1,null,true) as result',[b])
  const seconds=handoff.active.segments.reduce((sum,[x,y])=>sum+(Date.parse(y)-Date.parse(x))/1000,0)
  assert.ok(seconds>=10&&seconds<15,`idle hour excluded: ${seconds}`);assert.equal(handoff.active.status,'paused')
  await db.exec('reset role');await db.query('delete from collection_members where collection_id=$1 and user_id=$2',[task.collection_id,guest])
  await as(guest)
  const context=await rpc('select focus_context($1) as result',[b]);assert.equal(context.active.task_title,null);assert.equal(context.active.task_completed,true)
  await rpc('select record_focus_session($1) as result',[JSON.stringify({...context.active,revision:context.active.revision+1,status:'ended'})])
  const report=await rpc('select analytics_report($1,($2::timestamptz)::date,current_date,\'UTC\') as result',[gwid,start])
  assert.ok(report.focus_breakdown.unavailable>=10);assert.equal(report.focus_breakdown.task,undefined)
  await assert.rejects(rpc('select pomonotes_history($1,$2) as result',[gwid,task.id]),/ACCESS_DENIED/)
 } finally {await db.close()}
})

test('upgrading an existing analytics installation preserves notes, bindings and unlinked focus history',async()=>{
 const f=await projectDB();const {db,wid,owner,as,rpc}=f
 try {
  await as(owner)
  const start=new Date(Date.now()-120000).toISOString(),end=new Date(Date.now()-60000).toISOString()
  const legacy={id:'90000000-0000-0000-0000-000000000009',workspace_id:wid,started_at:start,planned_seconds:60,revision:1,status:'completed',segments:[[start,end]]}
  await rpc('select record_focus_session($1) as result',[JSON.stringify(legacy)])
  const oldBindings=(await db.query('select module,collection_id from workspace_module_bindings where workspace_id=$1 order by module',[wid])).rows
  const oldNotes=(await db.query('select id,content from quick_notes where workspace_id=$1',[wid])).rows
  await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/202610110002_pomonotes.sql','utf8'))
  await as(owner)
  const newBindings=(await db.query("select module,collection_id from workspace_module_bindings where workspace_id=$1 and module<>'pomodoro' order by module",[wid])).rows
  assert.deepEqual(newBindings,oldBindings)
  assert.deepEqual((await db.query('select id,content from quick_notes where workspace_id=$1',[wid])).rows,oldNotes)
  const page=await rpc('select pomonotes_page($1) as result',[wid]);assert.equal(page.total,0)
  const report=await rpc('select analytics_report($1,current_date,current_date,\'UTC\') as result',[wid])
  assert.equal(Math.round(report.focus_breakdown.free),60);assert.equal(report.completed_sessions,1)
  await assert.rejects(rpc('select analytics_report_v2($1,current_date,current_date,\'UTC\',true,false) as result',[wid]),/permission denied/)
  await db.exec('reset role')
  const row=(await db.query('select association,task_id,credited_completed from analytics_focus_sessions where id=$1',[legacy.id])).rows[0]
  assert.equal(row.association,'free');assert.equal(row.task_id,null);assert.equal(row.credited_completed,true)
 }finally{await db.close()}
})
