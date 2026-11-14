const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{PGlite}=require('@electric-sql/pglite')
test('application baseline installs into empty platform schemas and refuses to replace existing app data',async()=>{
 const db=new PGlite(),contract=JSON.parse(fs.readFileSync('supabase/bootstrap/contract.json','utf8'))
 const sql=fs.readFileSync('supabase/bootstrap/application.sql','utf8').replace(/\r\n/g,'\n')
 const {baselineTransaction}=await import('../scripts/database-baseline.mjs')
 const {migrationFiles,migrationTransaction}=await import('../scripts/migration-contract.mjs')
 assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),contract.sha256)
 assert.doesNotMatch(sql,/COPY\s+[^;]+FROM\s+stdin|^INSERT INTO|CREATE ROLE|PASSWORD\s+'/im)
 try{
  // Provider-owned schemas are a test fixture, not a replacement for Auth/Storage.
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role authenticator;
   create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
   create table auth.mfa_factors(user_id uuid,status text);create table auth.sessions(id uuid,user_id uuid);
   create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create schema storage;create table storage.objects(id uuid);alter table storage.objects enable row level security;
   create schema cron;create table cron.job(jobname text,active boolean,schedule text);
   create schema vault;create table vault.secrets(name text);create table vault.decrypted_secrets(name text,decrypted_secret text);
   create schema extensions;create schema net;`)
  await db.exec(baselineTransaction())
  await db.exec('set search_path=public')
  for(const file of migrationFiles().filter(file=>file.version>contract.through))await db.exec(migrationTransaction(file))
  assert.equal((await db.query('select application_migrations_ready($1) as ready',[migrationFiles().map(({version,sha256})=>({version,sha256}))])).rows[0].ready,true)
  assert.equal((await db.query('select application_auth_ready() as ready')).rows[0].ready,true)
  assert.equal((await db.query('select application_defaults_ready() as ready')).rows[0].ready,true)
  assert.ok((await db.query("select count(*)::int n from pg_tables where schemaname in ('public','private')")).rows[0].n>50)
  await db.exec("create table bootstrap_sentinel(title text);insert into bootstrap_sentinel values('preserve me')")
  await assert.rejects(db.exec(sql),/APPLICATION_DATABASE_NOT_EMPTY/)
  await db.exec('rollback')
  assert.equal((await db.query('select title from bootstrap_sentinel')).rows[0].title,'preserve me')
  await db.exec("create function future_private_rpc() returns int language sql security definer as 'select 42';create table future_private_table(value text)")
  await db.exec('set role anon')
  await assert.rejects(db.query('select future_private_rpc()'),/permission denied/)
  await assert.rejects(db.query('select * from future_private_table'),/permission denied/)
  await assert.rejects(db.query('select * from private.maintenance_tickets'),/permission denied/)
  assert.equal((await db.query('select application_auth_ready() as ready')).rows[0].ready,true,'explicit existing grants are preserved')
 }finally{await db.close()}
})
