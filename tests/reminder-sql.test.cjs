const {test}=require('node:test')
const assert=require('node:assert/strict')
const {projectDB}=require('./helpers/project-db.cjs')
test('email claims verify member scope, time and recipient; lease/idempotency state survives retries',async()=>{
 const f=await projectDB(['202610110001_reminder_delivery']);const {db,owner,guest,wid,gwid,as,rpc}=f
 try {
  await as(owner)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='periodic'",[wid])).rows[0].collection_id
  const task=(await db.query("insert into periodic_tasks(user_id,workspace_id,collection_id,title,notes,frequency,member_notify_browser,member_notify_email,member_reminder_time) values($1,$2,$3,'Trusted title','Trusted note','daily',false,true,(clock_timestamp() at time zone 'UTC')::time) returning id",[owner,wid,cid])).rows[0].id
  const claim=()=>rpc("select claim_periodic_email($1,$2,$3,'UTC') as result",[owner,task,wid])
  await assert.rejects(claim(),/permission denied/)
  await as(null,'service_role')
  await assert.rejects(rpc("select claim_periodic_email($1,$2,$3,'UTC') as result",[guest,task,gwid]),/ACCESS_DENIED/)
  const first=await claim();assert.equal(first.payload.to,'owner@test.invalid');assert.equal(first.payload.title,'Trusted title')
  assert.equal((await claim()).status,'busy')
  await rpc('select finish_periodic_email($1,$2,false) as result',[first.id,first.lease])
  const retry=await claim();assert.equal(retry.id,first.id);assert.notEqual(retry.lease,first.lease)
  assert.equal(await rpc('select finish_periodic_email($1,$2,true) as result',[first.id,first.lease]),false)
  assert.equal(await rpc('select finish_periodic_email($1,$2,true) as result',[retry.id,retry.lease]),true)
  assert.equal((await claim()).status,'delivered')
  await as(owner)
  await assert.rejects(db.query('select * from periodic_email_deliveries'),/permission denied/)
 }finally{await db.close()}
})
