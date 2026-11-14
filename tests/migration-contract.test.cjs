const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite')
test('tracked SQL and its checksum commit together; failed upgrades leave neither data nor a false history record',async()=>{
 const {migrationFiles,migrationTransaction}=await import('../scripts/migration-contract.mjs'),files=migrationFiles(),bootstrap=files.find(file=>file.version==='202611140010')
 assert.equal(new Set(files.map(file=>file.version)).size,files.length)
 for(const file of files)assert.ok(migrationTransaction(file).endsWith('commit;'))
 const db=new PGlite()
 try{
  await db.exec('create role anon;create role authenticated;create role service_role')
  await db.exec(migrationTransaction(bootstrap))
  const check=async required=>(await db.query('select application_migrations_ready($1) as ready',[required])).rows[0].ready
  const required=[{version:bootstrap.version,sha256:bootstrap.sha256}]
  assert.equal(await check(required),true)
  assert.equal(await check([{...required[0],sha256:'0'.repeat(64)}]),false)
  assert.equal(await check([]),false);assert.equal(await check({}),false)
  const failed={name:'202611140099_failed.sql',version:'202611140099',sha256:'a'.repeat(64),sql:'begin;create table should_rollback(id int);insert into should_rollback(missing) values(1);commit;'}
  await assert.rejects(db.exec(migrationTransaction(failed)),/missing/)
  await db.exec('rollback')
  assert.equal((await db.query("select to_regclass('should_rollback') is null as absent")).rows[0].absent,true)
  assert.equal((await db.query('select count(*)::int as count from supabase_migrations.schema_migrations')).rows[0].count,1)
  await db.exec('set role anon');assert.equal(await check(required),true)
  await assert.rejects(db.query('select * from supabase_migrations.schema_migrations'),/permission denied/)
 }finally{await db.close()}
})
