const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {PGlite}=require('@electric-sql/pglite')
const migration=fs.readFileSync('supabase/migrations/202610230001_api_budgets.sql','utf8')
const owner='10000000-0000-0000-0000-000000000001',other='20000000-0000-0000-0000-000000000002'
async function database(){
 const db=new PGlite()
 await db.exec(`create role authenticated;create role anon;create role service_role;create role authenticator;create schema auth;
  create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
  create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  grant usage on schema public,auth to authenticated,anon,service_role;`)
 return db
}
test('API budgets are atomic, bounded per user and operation, private, and repeatable without erasing quotas',async()=>{
 const db=await database()
 try{
  await db.exec(migration)
  await db.exec('set role service_role')
  const charge=async(uid=owner,operation='finance-prices')=>(await db.query('select public.consume_edge_budget($1,$2) as accepted',[uid,operation])).rows[0].accepted
  const responses=await Promise.all(Array.from({length:23},()=>charge()))
  assert.equal(responses.filter(Boolean).length,20)
  assert.equal(await charge(),false);assert.equal(await charge(other),true);assert.equal(await charge(owner,'send-periodic-reminder'),true)
  await assert.rejects(charge(owner,'attacker-controlled-bucket'),/INVALID_BUDGET/)
  await db.exec('reset role');await db.exec(migration);await db.exec('set role service_role');assert.equal(await charge(),false)
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.api_budgets')).rows[0].n,3)
  await db.exec('set role authenticated')
  await assert.rejects(charge(other),/permission denied/)
  await assert.rejects(db.query('select * from private.api_budgets'),/permission denied/)
  await db.exec('reset role;set role anon');await assert.rejects(charge(),/permission denied/)
  await db.exec('reset role');await db.query('update private.api_budgets set window_id=window_id-1 where user_id=$1',[owner])
  await db.exec('set role service_role');assert.equal(await charge(),true)
 }finally{await db.close()}
})

test('Data API hook rejects excess writes with HTTP 429 and leaves read-only requests usable',async()=>{
 const db=await database()
 try{
  await db.exec(migration)
  assert.ok((await db.query("select rolconfig from pg_roles where rolname='authenticator'")).rows[0].rolconfig.includes('pgrst.db_pre_request=public.check_api_budget'))
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.method','POST',false)",[owner])
  await db.exec(`insert into private.api_budgets values('${owner}','data',60,floor(extract(epoch from clock_timestamp())/60),240)`)
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select check_api_budget()'),error=>{
   assert.equal(error.code,'PGRST');assert.equal(JSON.parse(error.detail).status,429);assert.equal(JSON.parse(error.detail).headers['Retry-After'],'60');return true
  })
  await db.query("select set_config('request.method','GET',false)")
  await db.exec('begin read only');await db.query('select check_api_budget()');await db.exec('commit')
  await db.query("select set_config('request.method','POST',false)")
  await db.exec('begin read only');await db.query('select check_api_budget()');await db.exec('commit')
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role anon');await db.query('select check_api_budget()')
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.api_budgets')).rows[0].n,1)
 }finally{await db.close()}
})

test('installing security budgets refuses to replace a pre-existing project hook',async()=>{
 const db=await database()
 try{
  await db.exec("alter role authenticator set pgrst.db_pre_request='public.existing_hook'")
  await assert.rejects(db.exec(migration),/Existing db_pre_request hook must be composed/)
  await db.exec('rollback')
  assert.equal((await db.query("select to_regprocedure('public.check_api_budget()') as name")).rows[0].name,null)
  assert.ok((await db.query("select rolconfig from pg_roles where rolname='authenticator'")).rows[0].rolconfig.includes('pgrst.db_pre_request=public.existing_hook'))
 }finally{await db.close()}
})

function handler(file,name,deps){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Request,Response,Date,AbortSignal,TextDecoder})
 return exports[name](deps)
}
test('expensive edge endpoints enforce the verified user quota before cache, provider, claim or email work',async()=>{
 for(const [file,name] of [['finance-prices','financePricesHandler'],['send-periodic-reminder','reminderHandler']]){
  let budget=true,queries=0
  const run=handler(`supabase/functions/${file}/handler.ts`,name,{
   authenticate:async token=>token==='valid'?owner:null,
   consumeBudget:async uid=>{assert.equal(uid,owner);return budget},
   cached:async()=>{queries++;return[]},save:async()=>assert.fail('denied'),fetch:async()=>assert.fail('denied'),
   claim:async()=>{queries++;return{status:'delivered'}},finish:async()=>assert.fail('denied'),send:async()=>assert.fail('denied'),
  })
  const request=token=>new Request('https://app.test',{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'})
  assert.equal((await run(request('bad'))).status,401)
  budget=false
  const response=await run(request('valid'));assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');assert.equal(queries,0)
 }
})

test('edge budget backend failure fails closed without invoking expensive services',async()=>{
 for(const [file,name] of [['finance-prices','financePricesHandler'],['send-periodic-reminder','reminderHandler']]){
  const run=handler(`supabase/functions/${file}/handler.ts`,name,{authenticate:async()=>owner,consumeBudget:async()=>{throw Error('db down')},cached:async()=>assert.fail('cache'),claim:async()=>assert.fail('claim')})
  assert.equal((await run(new Request('https://app.test',{method:'POST',headers:{authorization:'Bearer valid'},body:'{}'}))).status,503)
 }
})

test('edge endpoints cap streamed body bytes even without a content-length header',async()=>{
 for(const [file,name,size] of [['finance-prices','financePricesHandler',4096],['send-periodic-reminder','reminderHandler',1024]]){
  let cancelled=false
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(size+1))},cancel(){cancelled=true}})
  const run=handler(`supabase/functions/${file}/handler.ts`,name,{authenticate:async()=>owner,consumeBudget:async()=>true})
  const response=await run(new Request('https://app.test',{method:'POST',headers:{authorization:'Bearer valid'},body,duplex:'half'}))
  assert.equal(response.status,413);assert.equal(cancelled,true)
 }
})
