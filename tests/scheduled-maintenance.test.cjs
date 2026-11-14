const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {projectDB}=require('./helpers/project-db.cjs')
const {webcrypto,createHmac,randomUUID}=require('node:crypto')
const authExports={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/scheduled-maintenance/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:authExports,crypto:webcrypto,TextEncoder,Uint8Array,Date})
const exportsHandler={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/scheduled-maintenance/handler.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsHandler,Request,Response,Uint8Array,require:()=>authExports})
function signed(secret,issued=Math.floor(Date.now()/1000)){const payload=issued+'.'+randomUUID();return 'v1.'+payload+'.'+createHmac('sha256',secret).update(payload).digest('hex')}
test('scheduled tickets reject forged, expired, future and permanent bearer credentials',async()=>{
 const verify=authExports.verifyMaintenanceTicket,secret='k'.repeat(64)
 assert.equal(await verify(secret,secret),null)
 assert.equal(await verify(signed('wrong-key'),secret),null)
 assert.equal(await verify(signed(secret,Math.floor(Date.now()/1000)-100),secret),null)
 assert.equal(await verify(signed(secret,Math.floor(Date.now()/1000)+30),secret),null)
 assert.ok(await verify(signed(secret),secret))
})
test('scheduled worker requires its own secret and retries failed deliveries without logging private payloads',async()=>{
 const calls=[],secret='x'.repeat(64),claim={id:'delivery',lease:'lease',payload:{to:'private@example.test',title:'Private content'}}
 const handler=exportsHandler.maintenanceHandler({secret,mailConfigured:true,consumeTicket:async()=>true,claim:async()=>[claim],send:async()=>{throw Error('provider private error')},
  finish:async(...args)=>calls.push(args),cleanup:async()=>calls.push('cleanup'),record:async status=>calls.push(status)})
 const req=(token=signed(secret),body='{}')=>new Request('https://worker.test',{method:'POST',headers:{Authorization:`Bearer ${token}`},body})
 assert.equal((await handler(req('bad'))).status,401);assert.equal(calls.length,0)
 assert.equal((await handler(req(signed(secret),'{"user":"other"}'))).status,400);assert.equal(calls.length,0)
 const result=await handler(req());assert.equal(result.status,503)
 assert.deepEqual(calls[1],['delivery','lease',false])
 const output=JSON.stringify(await result.json());assert.ok(!output.includes('private'));assert.ok(!output.includes('provider'))
 assert.equal(calls[2].emails_failed,1)
})
test('unconfigured email skips claims while successful background cleanup is still recorded',async()=>{
 let claimed=false,recorded
 const handler=exportsHandler.maintenanceHandler({secret:'y'.repeat(64),mailConfigured:false,consumeTicket:async()=>true,claim:async()=>{claimed=true;return[]},send:async()=>{},finish:async()=>{},cleanup:async()=>{},record:async value=>{recorded=value}})
 const result=await handler(new Request('https://worker.test',{method:'POST',headers:{Authorization:'Bearer '+signed('y'.repeat(64))}}))
 assert.equal(result.status,200);assert.equal(claimed,false);assert.equal(recorded.mail_configured,false)
})
test('server reminder batch respects opt-in, verified email, scope, frequency, completion and delivery leases',async()=>{
 const f=await projectDB(['202610110001_reminder_delivery']),{db,owner,guest,wid,as,rpc}=f
 try{
  await db.exec('alter table auth.users add column email_confirmed_at timestamptz; alter table periodic_tasks add column deleted_at timestamptz;')
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[owner])
  await db.exec(fs.readFileSync('supabase/migrations/202611140005_scheduled_reminders.sql','utf8'))
  await as(owner)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='periodic'",[wid])).rows[0].collection_id
  const task=(await db.query("insert into periodic_tasks(user_id,workspace_id,collection_id,title,frequency,member_notify_browser,member_notify_email,member_reminder_time) values($1,$2,$3,'Server reminder','daily',false,true,(clock_timestamp() at time zone 'Europe/Istanbul')::time) returning id",[owner,wid,cid])).rows[0].id
  await assert.rejects(db.query('select * from claim_due_periodic_emails(5,null)'),/permission denied/)
  await as(null,'service_role')
  const ticket=randomUUID(),issued=Math.floor(Date.now()/1000)
  assert.equal((await db.query('select consume_maintenance_ticket($1,$2) as accepted',[ticket,issued])).rows[0].accepted,true)
  assert.equal((await db.query('select consume_maintenance_ticket($1,$2) as accepted',[ticket,issued])).rows[0].accepted,false)
  assert.equal((await db.query('select consume_maintenance_ticket($1,$2) as accepted',[randomUUID(),issued-100])).rows[0].accepted,false)
  assert.equal((await db.query("select * from claim_due_periodic_emails(5,'other@test.invalid')")).rows.length,0)
  const first=(await db.query("select * from claim_due_periodic_emails(5,'owner@test.invalid')")).rows[0].claim_due_periodic_emails
  assert.equal(first.status,'claimed');assert.equal(first.payload.to,'owner@test.invalid')
  assert.equal((await db.query('select * from claim_due_periodic_emails(5,null)')).rows.length,0)
  await rpc('select finish_periodic_email($1,$2,false) as result',[first.id,first.lease])
  const retry=(await db.query('select * from claim_due_periodic_emails(5,null)')).rows[0].claim_due_periodic_emails
  assert.equal(retry.id,first.id);assert.notEqual(retry.lease,first.lease)
  await rpc('select finish_periodic_email($1,$2,true) as result',[retry.id,retry.lease])
  assert.equal((await db.query('select * from claim_due_periodic_emails(5,null)')).rows.length,0)
  await as(owner,'postgres')
  await db.query('delete from periodic_email_deliveries where task_id=$1',[task])
  await db.query("update periodic_tasks set completed_date=(clock_timestamp() at time zone 'Europe/Istanbul')::date where id=$1",[task])
  assert.equal((await db.query('select * from claim_due_periodic_emails(5,null)')).rows.length,0)
  await db.query('update periodic_tasks set completed_date=null, deleted_at=now() where id=$1',[task])
  assert.equal((await db.query('select * from claim_due_periodic_emails(5,null)')).rows.length,0)
  await as(guest)
  await assert.rejects(db.query('select * from background_run_status'),/permission denied/)
 }finally{await db.close()}
})
