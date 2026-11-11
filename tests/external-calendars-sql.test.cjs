const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {PGlite}=require('@electric-sql/pglite')
const migration=fs.readFileSync('supabase/migrations/202611040001_external_calendars.sql','utf8'),googleMigration=fs.readFileSync('supabase/migrations/202611100001_google_calendar.sql','utf8'),owner='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002'
async function fixture(){
 const db=new PGlite();await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');grant usage on schema public to authenticated,anon,service_role;`);await db.exec(migration);await db.exec(googleMigration)
 async function rpc(uid,op,id=null,payload={}){return(await db.query('select external_calendar_service($1,$2,$3,$4::jsonb) as result',[uid,op,id,JSON.stringify(payload)])).rows[0].result}
 const complete=(uid,key)=>rpc(uid,'complete',null,{account_key:key,label:key+'@example.test',access:'encrypted-access',refresh:'encrypted-refresh',expires_at:'2030-01-01T00:00:00Z',calendars:[{id:'remote',name:'Work',color:'#64748B',default:true}]})
 return {db,rpc,complete}
}
test('calendar credentials and metadata are unavailable to browser roles, even their owner',async()=>{
 const f=await fixture();try{
  const c=await f.complete(owner,'owner');await f.complete(other,'other')
  const list=await f.rpc(owner,'list');assert.equal(list.connections.length,1);assert.equal(list.connections[0].id,c.id);assert.equal(list.connections[0].calendars.length,1);assert.equal(JSON.stringify(list).includes('encrypted'),false)
  for(const role of ['authenticated','anon']){
   await f.db.exec('set role '+role)
   for(const table of ['connections','sources','tokens','oauth','budgets'])await assert.rejects(f.db.query('select * from external_calendar_'+table),/permission denied/)
   await assert.rejects(f.rpc(owner,'list'),/permission denied/);await assert.rejects(f.rpc(owner,'tokens',c.id),/permission denied/);await f.db.exec('reset role')
  }
  await f.db.exec('set role service_role');assert.equal((await f.rpc(owner,'tokens',c.id)).access_cipher,'encrypted-access')
 }finally{await f.db.close()}
})
test('calendar selections are personal, reconnects preserve them and disconnect removes credentials',async()=>{
 const f=await fixture();try{
  const a=await f.complete(owner,'a'),b=await f.complete(other,'b'),sid=(await f.rpc(owner,'list')).connections[0].calendars[0].id,foreign=(await f.rpc(other,'list')).connections[0].calendars[0].id
  await assert.rejects(f.rpc(owner,'select',null,{ids:[foreign]}),/CALENDAR_SELECTION_INVALID/)
  await assert.rejects(f.rpc(owner,'tokens',b.id),/CALENDAR_ACCESS_DENIED/)
  await f.rpc(owner,'select',null,{ids:[]});await f.complete(owner,'a');assert.equal((await f.rpc(owner,'list')).connections[0].calendars[0].selected,false)
  await f.rpc(owner,'select',null,{ids:[sid]});assert.equal((await f.rpc(owner,'sources',a.id)).length,1)
  const token=await f.rpc(owner,'tokens',a.id);assert.equal(await f.rpc(owner,'lock',a.id,{version:token.version}),true);assert.equal(await f.rpc(owner,'lock',a.id,{version:token.version}),false)
  assert.equal(await f.rpc(owner,'refreshed',a.id,{version:token.version-1,access:'old',refresh:'old',expires_at:'2030-01-01'}),false)
  await f.rpc(owner,'disconnect',a.id);assert.equal((await f.rpc(owner,'list')).connections.length,0);assert.equal((await f.db.query('select * from external_calendar_tokens where connection_id=$1',[a.id])).rows.length,0)
  await f.db.exec(migration);await f.db.exec(googleMigration);assert.equal((await f.rpc(other,'list')).connections.length,1,'reapplying does not erase another account')
 }finally{await f.db.close()}
})
test('OAuth state is single use, expired attempts fail and connection requests have a server budget',async()=>{
 const f=await fixture();try{
  await f.rpc(owner,'begin',null,{hash:'state',verifier:'cipher',return_url:'https://app.test/'})
  assert.equal((await f.rpc(null,'consume',null,{hash:'state'})).user_id,owner)
  const replay=await f.rpc(null,'consume',null,{hash:'state'});assert.ok(!replay||!replay.user_id)
  await f.rpc(owner,'begin',null,{hash:'expired',verifier:'cipher',return_url:'https://app.test/'})
  await f.db.exec("update external_calendar_oauth set expires_at=now()-interval '1 minute'")
  const expired=await f.rpc(null,'consume',null,{hash:'expired'});assert.ok(!expired||!expired.user_id)
  for(let n=0;n<5;n++)assert.equal(await f.rpc(owner,'budget',null,{action:'connect'}),true)
  assert.equal(await f.rpc(owner,'budget',null,{action:'connect'}),false);assert.equal(await f.rpc(other,'budget',null,{action:'connect'}),true)
 }finally{await f.db.close()}
})

test('Google and Outlook accounts remain isolated, share personal selection limits and survive migration reapplication',async()=>{
 const f=await fixture();try{
  const outlook=await f.complete(owner,'same-key')
  const payload={provider:'google',account_key:'same-key',label:'google@example.test',access:'google-encrypted',refresh:'google-refresh',expires_at:'2030-01-01',calendars:[{id:'remote',name:'Google',color:'#4285F4',default:true}]}
  const google=await f.rpc(owner,'complete',null,payload);assert.notEqual(outlook.id,google.id)
  const list=await f.rpc(owner,'list');assert.equal(list.connections.length,2);assert.deepEqual(new Set(list.connections.map(row=>row.provider)),new Set(['google','outlook']));assert.ok(list.connections.every(row=>row.calendars[0].selected))
  assert.equal((await f.rpc(owner,'tokens',google.id)).provider,'google');assert.equal((await f.rpc(owner,'tokens',outlook.id)).access_cipher,'encrypted-access')
  const googleSource=list.connections.find(row=>row.provider==='google').calendars[0].id
  await f.rpc(owner,'select',null,{ids:[googleSource]});await f.rpc(owner,'complete',null,payload)
  assert.equal((await f.rpc(owner,'list')).connections.find(row=>row.provider==='outlook').calendars[0].selected,false)
  await f.db.exec(googleMigration);assert.equal((await f.rpc(owner,'list')).connections.length,2)
  await assert.rejects(f.rpc(other,'tokens',google.id),/CALENDAR_ACCESS_DENIED/)
  await f.rpc(owner,'disconnect',google.id);assert.equal((await f.rpc(owner,'list')).connections[0].provider,'outlook')
  await assert.rejects(f.rpc(owner,'complete',null,{...payload,provider:'unsupported'}),/CALENDAR_INVALID/)
 }finally{await f.db.close()}
})

test('provider-bound OAuth state cannot be consumed through the other callback',async()=>{
 const f=await fixture();try{
  await f.rpc(owner,'begin',null,{hash:'google-state',provider:'google',verifier:'cipher',return_url:'https://app.test/'})
  const wrong=await f.rpc(null,'consume',null,{hash:'google-state',provider:'outlook'});assert.ok(!wrong||!wrong.user_id)
  const state=await f.rpc(null,'consume',null,{hash:'google-state',provider:'google'});assert.equal(state.user_id,owner);assert.equal(state.provider,'google')
  const replay=await f.rpc(null,'consume',null,{hash:'google-state',provider:'google'});assert.ok(!replay||!replay.user_id)
 }finally{await f.db.close()}
})
