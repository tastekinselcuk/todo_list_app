const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite')
test('public health verdict detects stopped jobs, stale workers and failed runs without exposing operational rows',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema cron;
   create table cron.job(jobid int primary key,jobname text,active boolean);create table cron.job_run_details(jobid int,status text,start_time timestamptz);
   create table background_run_status(created_at timestamptz,succeeded boolean,cleanup_succeeded boolean);
   insert into cron.job values(1,'scheduled-maintenance',true),(2,'finance-recurring-rollover',true),(3,'vault-retention',true),(4,'workspace-trash-retention',true);
   insert into background_run_status values(now(),true,true);`)
  await db.exec(fs.readFileSync('supabase/migrations/202611140015_operations_health.sql','utf8'))
  const ready=async()=>(await db.query('select application_operations_ready() as ready')).rows[0].ready
  assert.equal(await ready(),true)
  await db.exec("update cron.job set active=false where jobid=2");assert.equal(await ready(),false)
  await db.exec("update cron.job set active=true;update background_run_status set created_at=now()-interval '11 minutes'");assert.equal(await ready(),false)
  await db.exec("update background_run_status set created_at=now();insert into cron.job_run_details values(1,'failed',now()-interval '1 minute')");assert.equal(await ready(),false)
  await db.exec("insert into cron.job_run_details values(1,'succeeded',now());set role anon");assert.equal(await ready(),true)
  await assert.rejects(db.query('select * from background_run_status'),/permission denied/)
 }finally{await db.close()}
})
