const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto')
const cryptoApi={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/vaultCrypto.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:cryptoApi,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Uint32Array,btoa,atob,JSON})
const fixtureModule={exports:{}}
vm.compileFunction(fs.readFileSync('tests/sharing-sql.test.cjs','utf8').split("test('modules migration")[0]+'\nmodule.exports={fixture,owner,outsider}', ['require','module'])(require,fixtureModule)
test('vault write RPCs enforce acknowledgement, ownership, parent and note versions while keeping ciphertext and history intact',async()=>{
 const {fixture,owner,outsider}=fixtureModule.exports,{db,as,ow,xw}=await fixture('vault',true)
 try{
  await db.exec("create role service_role;create table auth.sessions(id uuid primary key,user_id uuid);create function session_mfa_satisfied() returns boolean language sql as 'select true'")
  await db.exec(fs.readFileSync('supabase/migrations/202611110001_vault_security.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/202611120001_vault_simplification.sql','utf8'))
  await as(owner)
  const session=(await db.query('select * from password_sessions')).rows[0],old=(await db.query('select * from secure_notes')).rows[0],sealed=await cryptoApi.createRecoverableVault('strong vault password')
  const cipher=async(id,title)=>({...await cryptoApi.encryptVaultValue(sealed.key,{title,content:'Private'},session.id+':'+id),key_id:cryptoApi.vaultKeyId(sealed.metadata)})
  await db.query('select vault_acknowledge()')
  await db.query('select seal_vault($1,$2,$3,$4,1,$5)',[session.id,session.password_hash,sealed.metadata,JSON.stringify([{id:old.id,version:old.version,encrypted_payload:await cipher(old.id,'Original')}]),session.name])
  await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/202611140004_vault_storage_constraints.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/202611140016_vault_write_rpcs.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/202611140017_vault_import_scope.sql','utf8'));await as(owner)
  assert.ok((await db.query('select vault_import($1,$2,$3,$4) as id',[ow,'New',sealed.metadata,'[]'])).rows[0].id)
  await db.exec('reset role');await db.query("update workspace_module_bindings set collection_id=$1 where workspace_id=$2 and module='secure'",[session.collection_id,xw]);await as(owner)
  await assert.rejects(db.query('select vault_import($1,$2,$3,$4)',[xw,'Wrong workspace',sealed.metadata,'[]']),/ACCESS_DENIED/)
  const version=(await db.query('select version from password_sessions where id=$1',[session.id])).rows[0].version
  const renamed=(await db.query('select vault_rename($1,$2,$3) as row',[session.id,version,'Renamed'])).rows[0].row
  await assert.rejects(db.query('select vault_rename($1,$2,$3)',[session.id,version,'Stale']),/SHARING_CONFLICT/)
  const id='aaaaaaaa-0000-0000-0000-000000000001',payload=await cipher(id,'Only encrypted')
  const save=(value,noteVersion=null,parentVersion=renamed.version)=>db.query('select vault_note_save($1,$2,$3,$4,$5) as row',[session.id,id,value,noteVersion,parentVersion])
  await assert.rejects(save({...payload,plaintext:'must not be stored'}),/VAULT_INVALID_DATA/)
  await assert.rejects(save(payload,null,version),/SHARING_CONFLICT/)
  const created=(await save(payload)).rows[0].row
  assert.equal(created.title,'Encrypted note');assert.equal(created.content,null);assert.equal(created.created_by,owner)
  assert.equal((await save(payload)).rows[0].row.version,created.version,'the same creation request is idempotent')
  const changed=(await save(await cipher(id,'Changed'),created.version)).rows[0].row
  await assert.rejects(save(await cipher(id,'Stale write'),created.version),/SHARING_CONFLICT/)
  assert.equal((await cryptoApi.decryptVaultValue(sealed.key,changed.encrypted_payload,session.id+':'+id)).title,'Changed')
  assert.equal((await db.query('select count(*)::int n from vault_note_history where note_id=$1',[id])).rows[0].n,1)
  await as(outsider);await assert.rejects(save(payload),/ACCESS_DENIED/)
  await db.exec("reset role;create or replace function session_mfa_satisfied() returns boolean language sql as 'select false'");await as(owner);await assert.rejects(save(payload),/ACCESS_DENIED/)
 }finally{await db.close()}
})
