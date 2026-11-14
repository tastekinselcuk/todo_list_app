const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite')
test('security release gate detects missing vault guards, exposed worker APIs and disabled scheduling',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema private;create schema cron;create schema vault;
   create table password_sessions(id int,constraint vault_v2_metadata_required check(id>0));
   create table secure_notes(encrypted_payload jsonb not null,constraint vault_ciphertext_required check(encrypted_payload is not null),constraint vault_plaintext_forbidden check(encrypted_payload is not null));
   create table vault_note_history(id int,constraint vault_history_ciphertext_required check(id>0));
   create table background_run_status(id int);alter table background_run_status enable row level security;
   create table private.maintenance_tickets(id int);alter table private.maintenance_tickets enable row level security;
   create table private.client_error_counts(id int);alter table private.client_error_counts enable row level security;
   create table private.background_dispatch_config(singleton boolean);alter table private.background_dispatch_config enable row level security;
   insert into private.background_dispatch_config values(true);
   create table cron.job(jobname text,active boolean,schedule text);insert into cron.job values('scheduled-maintenance',true,'* * * * *');
   create table vault.secrets(name text);insert into vault.secrets values('operations_cron_secret');`)
  for(const signature of ['consume_maintenance_ticket(uuid,bigint)','claim_due_periodic_emails(integer,text)','enqueue_scheduled_maintenance()','cleanup_operational_metrics()']){
   await db.exec(`create function public.${signature} returns boolean language sql as 'select true';revoke all on function public.${signature} from public;grant execute on function public.${signature} to service_role`)
  }
  await db.exec(fs.readFileSync('supabase/migrations/202611140008_security_release_gate.sql','utf8'))
  const ready=async()=>(await db.query('select application_security_ready() as ready')).rows[0].ready
  assert.equal(await ready(),true)
  await db.exec('grant select on background_run_status to anon');assert.equal(await ready(),false)
  await db.exec('revoke select on background_run_status from anon;grant execute on function consume_maintenance_ticket(uuid,bigint) to authenticated');assert.equal(await ready(),false)
  await db.exec('revoke execute on function consume_maintenance_ticket(uuid,bigint) from authenticated;update cron.job set active=false');assert.equal(await ready(),false)
  await db.exec('update cron.job set active=true;alter table secure_notes drop constraint vault_plaintext_forbidden');assert.equal(await ready(),false)
  await db.exec('alter table secure_notes add constraint vault_plaintext_forbidden check(encrypted_payload is not null);set role anon')
  assert.equal(await ready(),true)
  await assert.rejects(db.query('select * from vault.secrets'),/permission denied/)
 }finally{await db.close()}
})
