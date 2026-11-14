const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {projectDB}=require('./helpers/project-db.cjs')
test('client error reports contain only fixed codes and suppress storms and reporting failures',async()=>{
 const exports={},calls=[];let time=1
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/errorReporting.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,Map})
 const report=exports.createErrorReporter({release:'abc123',screen:()=> 'unknown',now:()=>time,send:async(...args)=>{calls.push(args);throw Error('network')}})
 await report('UI_RENDER_ERROR');await report('UI_RENDER_ERROR');assert.equal(calls.length,1)
 time+=60001;await report('UI_RENDER_ERROR');assert.equal(calls.length,2)
 assert.deepEqual(calls[0],['UI_RENDER_ERROR','unknown','abc123'])
})
test('error aggregation is private, bounded per user and rejects arbitrary data',async()=>{
 const f=await projectDB(),{db,as,owner}=f
 try{
  await db.exec('create role authenticator;create table background_run_status(created_at timestamptz)')
  await db.exec(fs.readFileSync('supabase/migrations/202610230001_api_budgets.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/202611140007_operational_metrics.sql','utf8'))
  await as(null,'anon');await assert.rejects(db.query("select report_client_error('UI_RENDER_ERROR','unknown','abc123')"),/permission denied/)
  await as(owner)
  await assert.rejects(db.query("select report_client_error('private content','unknown','abc123')"),/INVALID_ERROR_REPORT/)
  await assert.rejects(db.query("select report_client_error('UI_RENDER_ERROR','unknown','https://app/?token=secret')"),/INVALID_ERROR_REPORT/)
  for(let i=0;i<10;i++)assert.equal((await db.query("select report_client_error('UI_RENDER_ERROR','unknown','abc123') as accepted")).rows[0].accepted,true)
  assert.equal((await db.query("select report_client_error('UI_RENDER_ERROR','unknown','abc123') as accepted")).rows[0].accepted,false)
  await assert.rejects(db.query('select * from private.client_error_counts'),/permission denied/)
  await db.exec('reset role')
  assert.equal(Number((await db.query('select occurrences from private.client_error_counts')).rows[0].occurrences),10)
 }finally{await db.close()}
})
