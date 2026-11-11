const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {webcrypto}=require('node:crypto')
function load(file,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Uint32Array,JSON,btoa,atob,Request,Response,...extra});return exports}
const crypto=load('src/lib/vaultCrypto.ts'),edge=load('supabase/functions/vault-security/handler.ts')
const {vaultEmailConfig}=load('supabase/functions/vault-security/emailConfig.ts')
test('mail policy requires explicit sandbox mode and allows only the verified test account address',()=>{
 const base={RESEND_API_KEY:'test-key',VAULT_FROM_EMAIL:'Pomodolist <onboarding@resend.dev>'}
 assert.equal(vaultEmailConfig(base).configured,false)
 assert.equal(vaultEmailConfig({...base,VAULT_MAIL_MODE:'test'}).configured,false)
 const sandbox=vaultEmailConfig({...base,VAULT_MAIL_MODE:'test',VAULT_TEST_EMAIL:' Tester@Example.com '})
 assert.equal(sandbox.configured,true);assert.equal(sandbox.recipientAllowed('tester@example.com'),true)
 assert.equal(sandbox.recipientAllowed('another@example.com'),false)
 assert.equal(vaultEmailConfig({...base,VAULT_MAIL_MODE:'unknown'}).configured,false)
 const production=vaultEmailConfig({RESEND_API_KEY:'test-key',VAULT_FROM_EMAIL:'Security <security@example.com>'})
 assert.equal(production.configured,true);assert.equal(production.recipientAllowed('another@example.com'),true)
})
test('v2 password rewrapping preserves record ciphertext, recovery rotates its secret and old secrets fail',async()=>{
 const original=await crypto.createRecoverableVault('long vault password')
 const note=await crypto.encryptVaultValue(original.key,{content:'Secret'},'vault:record')
 assert.equal(original.key.extractable,false);assert.equal(original.metadata.includes(original.recoveryCode),false)
 await assert.rejects(crypto.createRecoverableVault('short'))
 await assert.rejects(crypto.createRecoverableVault('            '))
 const changed=await crypto.changeVaultPassword('long vault password',original.metadata,'a different long password')
 assert.equal(crypto.vaultKeyId(changed.metadata),crypto.vaultKeyId(original.metadata))
 assert.equal((await crypto.decryptVaultValue(changed.key,note,'vault:record')).content,'Secret')
 await assert.rejects(crypto.unlockVaultKey('long vault password',changed.metadata))
 const recovered=await crypto.recoverVault('another strong password',changed.metadata,original.recoveryCode)
 assert.notEqual(recovered.recoveryCode,original.recoveryCode)
 assert.equal((await crypto.decryptVaultValue(recovered.key,note,'vault:record')).content,'Secret')
 await assert.rejects(crypto.recoverVault('another strong password',recovered.metadata,original.recoveryCode))
 await assert.rejects(crypto.decryptVaultValue(recovered.key,note,'different:record'))
 await assert.rejects(webcrypto.subtle.exportKey('raw',recovered.key))
})
test('v1 upgrade preserves encrypted history and rolls back incomplete history or malformed imports',async()=>{
 const {fixture,owner}=fixtureModule.exports,{db,as,ow}=await fixture('vault',true)
 try{
  await as(owner)
  const session=(await db.query('select * from password_sessions')).rows[0],note=(await db.query('select * from secure_notes')).rows[0],v1=await crypto.createVaultKey('old password')
  const oldPayload={...await crypto.encryptVaultValue(v1.key,{title:'Before edit'},session.id+':'+note.id),key_id:crypto.vaultKeyId(v1.metadata)}
  await db.query('select seal_vault($1,$2,$3,$4,1,$5)',[session.id,session.password_hash,v1.metadata,JSON.stringify([{id:note.id,version:1,encrypted_payload:oldPayload}]),session.name])
  await db.exec('reset role;create role service_role')
  await db.exec(fs.readFileSync('supabase/migrations/202611110001_vault_security.sql','utf8'))
  await as(owner);await db.query('select vault_acknowledge()')
  const edited={...await crypto.encryptVaultValue(v1.key,{title:'After edit'},session.id+':'+note.id),key_id:crypto.vaultKeyId(v1.metadata)}
  await db.query('update secure_notes set encrypted_payload=$1 where id=$2',[edited,note.id])
  const history=(await db.query('select * from vault_note_history')).rows[0],n=(await db.query('select * from secure_notes')).rows[0],s=(await db.query('select * from password_sessions')).rows[0]
  const v2=await crypto.createRecoverableVault('new strong password'),next={...await crypto.encryptVaultValue(v2.key,{title:'After edit'},session.id+':'+note.id),key_id:crypto.vaultKeyId(v2.metadata)}
  const proposed=[{id:note.id,version:n.version,encrypted_payload:next}]
  await assert.rejects(db.query('select seal_vault($1,$2,$3,$4,$5,$6)',[s.id,s.password_hash,v2.metadata,JSON.stringify(proposed),s.version,s.name]),/SHARING_CONFLICT/)
  assert.equal((await db.query('select password_hash from password_sessions')).rows[0].password_hash,v1.metadata)
  proposed[0].history=[{id:history.id,encrypted_payload:{...await crypto.encryptVaultValue(v2.key,{title:'Before edit'},session.id+':'+note.id),key_id:crypto.vaultKeyId(v2.metadata)}}]
  await db.query('select seal_vault($1,$2,$3,$4,$5,$6)',[s.id,s.password_hash,v2.metadata,JSON.stringify(proposed),s.version,s.name])
  const upgraded=(await db.query('select * from vault_note_history')).rows[0]
  assert.equal((await crypto.decryptVaultValue(v2.key,upgraded.encrypted_payload,session.id+':'+note.id)).title,'Before edit')
  const version=(await db.query('select version from secure_notes')).rows[0].version
  await db.query("select vault_record_action($1,$2,'history',$3)",[note.id,version,history.id])
  assert.equal((await crypto.decryptVaultValue(v2.key,(await db.query('select encrypted_payload from secure_notes')).rows[0].encrypted_payload,session.id+':'+note.id)).title,'Before edit')
  const before=(await db.query('select count(*)::int n from password_sessions')).rows[0].n,newSid=webcrypto.randomUUID()
  const invalid=[{id:webcrypto.randomUUID(),session_id:newSid,encrypted_payload:next},{id:webcrypto.randomUUID(),session_id:webcrypto.randomUUID(),encrypted_payload:next}]
  await assert.rejects(db.query('select vault_import($1,$2,$3,$4)',[ow,'Imported',v2.metadata,JSON.stringify(invalid)]),/VAULT_INVALID_DATA/)
  assert.equal((await db.query('select count(*)::int n from password_sessions')).rows[0].n,before)
 }finally{await db.close()}
})
test('encrypted portable backups reject wrong passwords, tampering and oversized files',async()=>{
 const backup=await crypto.encryptVaultBackup('independent backup password',{format:'vault-records-v1',records:[{title:'Private title',content:'Secret'}]})
 assert.equal(backup.includes('Private'),false)
 assert.equal((await crypto.decryptVaultBackup('independent backup password',backup)).records[0].content,'Secret')
 await assert.rejects(crypto.decryptVaultBackup('incorrect',backup))
 const corrupt=JSON.parse(backup);corrupt.payload.iv=btoa('abcdefghijkl')
 await assert.rejects(crypto.decryptVaultBackup('independent backup password',JSON.stringify(corrupt)))
 await assert.rejects(crypto.decryptVaultBackup('password','x'.repeat(10000001)))
})
const uid='10000000-0000-0000-0000-000000000001',sid='aaaaaaaa-0000-0000-0000-000000000001'
test('security endpoint verifies identity, ignores supplied recipients and stores no plaintext OTP',async()=>{
 const calls=[],sent=[],deps={origins:['https://app.test'],secret:'x'.repeat(64),configured:true,authenticate:async()=>({id:uid,email:'verified@example.test',session:'session-1',mfaRequired:false}),rpc:async(name,args)=>{calls.push([name,args]);return name==='vault_security_budget'?true:{ok:true}},send:async(...args)=>sent.push(args)}
 const handle=edge.vaultSecurityHandler(deps)
 const request=(body,token='valid',origin='https://app.test')=>new Request('https://edge.test',{method:'POST',headers:{origin,authorization:token?'Bearer '+token:'','content-type':'application/json'},body:JSON.stringify(body)})
 assert.equal((await handle(request({},''))).status,401)
 assert.equal((await handle(request({},'valid','https://evil.test'))).status,403)
 const result=await handle(request({action:'start',vaultId:sid,operation:'delete',version:1,email:'attacker@test',uid:'attacker'}))
 assert.equal(result.status,200);assert.equal(sent[0][0],'verified@example.test')
 const start=calls.find(([name])=>name==='vault_challenge_start')[1]
 assert.equal(start.uid,uid);assert.equal(start.jwt_session,'session-1');assert.equal(start.otp_hash.length,64);assert.equal(JSON.stringify(start).includes(sent[0][1]),false)
 const response=await result.json()
 await handle(request({action:'finish',challenge:response.challenge,code:sent[0][1]}))
 assert.equal(calls.find(([name])=>name==='vault_challenge_finish')[1].otp_hash,start.otp_hash)
 deps.recipientAllowed=()=>false
 const before=calls.length
 assert.equal((await handle(request({action:'start',vaultId:sid,operation:'delete',version:1}))).status,403)
 assert.equal(calls.length,before);assert.equal(sent.length,1,'another account is blocked without forwarding its code to the test inbox')
 deps.recipientAllowed=()=>true
 deps.authenticate=async()=>({id:uid,email:'verified@example.test',session:'session-1',mfaRequired:true})
 assert.equal((await handle(request({}))).status,403)
})
// Reuse the real existing sharing fixture without registering that file's tests.
const fixtureModule={exports:{}}
vm.compileFunction(fs.readFileSync('tests/sharing-sql.test.cjs','utf8').split("test('modules migration")[0]+'\nmodule.exports={fixture,owner,editor,outsider}', ['require','module'])(require,fixtureModule)
test('database enforces owner email step-up, persisted acknowledgement, bounded codes, atomic recovery, history and soft delete',async()=>{
 const {fixture,owner,editor}=fixtureModule.exports,{db,as,ow,rpc}=await fixture('vault',true)
 try{
  await db.exec("create role service_role; create table auth.sessions(id uuid primary key,user_id uuid); insert into auth.sessions values('dddddddd-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');")
  await db.exec(fs.readFileSync('supabase/migrations/202611110001_vault_security.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/202611110001_vault_security.sql','utf8'))
  await as(owner)
  const row=(await db.query('select * from password_sessions')).rows[0],note=(await db.query('select * from secure_notes')).rows[0]
  const sealed=await crypto.createRecoverableVault('secure vault password')
  const envelope={...await crypto.encryptVaultValue(sealed.key,{title:'Private'},row.id+':'+note.id),key_id:crypto.vaultKeyId(sealed.metadata)}
  await assert.rejects(db.query('select seal_vault($1,$2,$3,$4,1,$5)',[row.id,row.password_hash,sealed.metadata,JSON.stringify([{id:note.id,version:1,encrypted_payload:envelope}]),row.name]),/VAULT_ACK_REQUIRED/)
  await db.query('select vault_acknowledge()')
  await db.query('select vault_acknowledge()')
  assert.equal((await db.query('select count(*)::int n from vault_acknowledgements')).rows[0].n,1)
  await db.query('select seal_vault($1,$2,$3,$4,1,$5)',[row.id,row.password_hash,sealed.metadata,JSON.stringify([{id:note.id,version:1,encrypted_payload:envelope}]),row.name])
  await assert.rejects(db.query('delete from password_sessions where id=$1',[row.id]),/VAULT_EMAIL_REQUIRED/)
  await assert.rejects(db.query('update password_sessions set password_hash=$1 where id=$2',[sealed.metadata+' ',row.id]),/VAULT_EMAIL_REQUIRED/)
  const n=(await db.query('select * from secure_notes where id=$1',[note.id])).rows[0]
  const next={...await crypto.encryptVaultValue(sealed.key,{title:'Updated'},row.id+':'+note.id),key_id:envelope.key_id}
  await db.query('update secure_notes set encrypted_payload=$1 where id=$2',[next,n.id])
  assert.equal((await db.query('select count(*)::int n from vault_note_history')).rows[0].n,1)
  let v=(await db.query('select version from secure_notes where id=$1',[n.id])).rows[0].version
  await db.query("select vault_record_action($1,$2,'trash')",[n.id,v])
  await assert.rejects(db.query("select vault_record_action($1,$2,'restore')",[n.id,v]),/SHARING_CONFLICT/)
  await db.query("select vault_record_action($1,$2,'restore')",[n.id,v+1])
  const changed=await crypto.changeVaultPassword('secure vault password',sealed.metadata,'changed secure password'),challenge='bbbbbbbb-0000-0000-0000-000000000001'
  v=(await db.query('select version from password_sessions where id=$1',[row.id])).rows[0].version
  await db.exec('reset role')
  await db.query("select vault_challenge_start($1,$2,$3,'password','dddddddd-0000-0000-0000-000000000001','mailmailmailmailmailmailmailmailmailmailmailmailmailmailmailmail','hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash',$4,$5)",[owner,row.id,challenge,v,{metadata:changed.metadata}])
  let result=await rpc("select vault_challenge_finish($1,$2,'different','mailmailmailmailmailmailmailmailmailmailmailmailmailmailmailmail','hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash') result",[owner,challenge]);assert.equal(result.error,'INVALID_CODE')
  for(let i=0;i<5;i++)await db.query("select vault_challenge_finish($1,$2,'dddddddd-0000-0000-0000-000000000001','mailmailmailmailmailmailmailmailmailmailmailmailmailmailmailmail','bad')",[owner,challenge])
  result=await rpc("select vault_challenge_finish($1,$2,'dddddddd-0000-0000-0000-000000000001','mailmailmailmailmailmailmailmailmailmailmailmailmailmailmailmail','hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash') result",[owner,challenge]);assert.equal(result.error,'INVALID_CODE')
  assert.equal((await db.query('select password_hash from password_sessions where id=$1',[row.id])).rows[0].password_hash,sealed.metadata)
  await db.query("update vault_security_challenges set attempts=0 where id=$1",[challenge])
  result=await rpc("select vault_challenge_finish($1,$2,'dddddddd-0000-0000-0000-000000000001','mailmailmailmailmailmailmailmailmailmailmailmailmailmailmailmail','hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash') result",[owner,challenge]);assert.equal(result.ok,true)
  assert.equal((await db.query('select password_hash from password_sessions where id=$1',[row.id])).rows[0].password_hash,changed.metadata)
  result=await rpc("select vault_challenge_finish($1,$2,'dddddddd-0000-0000-0000-000000000001','mailmailmailmailmailmailmailmailmailmailmailmailmailmailmailmail','hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash') result",[owner,challenge]);assert.equal(result.error,'INVALID_CODE')
  await as(editor);await assert.rejects(db.query('select vault_challenge_finish($1,$2,$3,$4,$5)',[owner,challenge,'dddddddd-0000-0000-0000-000000000001','x','y']),/permission denied/)
  assert.equal((await db.query('select * from vault_note_history')).rows.length,0)
 }finally{await db.close()}
})
