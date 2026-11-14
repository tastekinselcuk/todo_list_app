const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{PGlite}=require('@electric-sql/pglite')
test('opt-in MFA blocks AAL1 direct data and RPC access, preserves existing RLS and permits verified AAL2',async()=>{
 const db=new PGlite(),uid='10000000-0000-0000-0000-000000000001'
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create role authenticator;
   create schema auth;create table auth.mfa_factors(user_id uuid,status text);
   create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   grant usage on schema auth,public to authenticated;
   create function check_api_budget() returns void language sql as 'select';
   create table private_notes(owner uuid,content text);insert into private_notes values('${uid}','private');
   alter table private_notes enable row level security;
   create policy own_notes on private_notes to authenticated using(owner=auth.uid()) with check(owner=auth.uid());
   grant select,insert on private_notes to authenticated;`)
  const sql=fs.readFileSync('supabase/migrations/202611140011_optional_mfa.sql','utf8')
  await db.exec(sql);await db.exec(sql)
  await db.exec(fs.readFileSync('supabase/migrations/202611140013_mfa_error_response.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/202611140012_auth_release_gate.sql','utf8'))
  assert.equal((await db.query('select application_auth_ready() as ready')).rows[0].ready,true)
  await db.exec('drop policy require_verified_mfa on private_notes')
  assert.equal((await db.query('select application_auth_ready() as ready')).rows[0].ready,false)
  await db.exec(sql);await db.exec(fs.readFileSync('supabase/migrations/202611140013_mfa_error_response.sql','utf8'))
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec("set request.jwt.claims='{"+`"aal":"aal1"`+"}';set role authenticated")
  assert.equal((await db.query('select * from private_notes')).rows.length,1)
  await db.query('select check_session_security()')
  await db.exec('reset role');await db.query("insert into auth.mfa_factors values($1,'verified')",[uid]);await db.exec('set role authenticated')
  assert.equal((await db.query('select * from private_notes')).rows.length,0)
  await assert.rejects(db.query('select check_session_security()'),/MFA_REQUIRED/)
  await assert.rejects(db.query('insert into private_notes values($1,$2)',[uid,'blocked']),/row-level security/)
  await db.exec("set request.jwt.claims='{"+`"aal":"aal2"`+"}'")
  assert.equal((await db.query('select * from private_notes')).rows.length,1)
  await db.query('select check_session_security()')
  await db.exec("set request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'")
  assert.equal((await db.query('select * from private_notes')).rows.length,0)
 }finally{await db.close()}
})
test('verified Edge identities still require the matching signed token to carry AAL2 when MFA is enrolled',()=>{
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/authAssurance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,atob})
 const allowed=exports.verifiedUserHasRequiredAssurance,user={id:'user',factors:[{status:'verified'}]},token=claims=>'head.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature'
 assert.equal(allowed(token({sub:'user',aal:'aal1'}),user),false)
 assert.equal(allowed(token({sub:'user',aal:'aal2'}),user),true)
 assert.equal(allowed(token({sub:'other',aal:'aal2'}),user),false)
 assert.equal(allowed('broken',user),false)
 assert.equal(allowed(token({sub:'user',aal:'aal1'}),{id:'user',factors:[]}),true)
})
