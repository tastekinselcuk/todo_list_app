const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {PGlite}=require('@electric-sql/pglite')
const upgrade=fs.readFileSync('supabase/migrations/202610120001_workspace_rpc_permissions.sql','utf8')
const base=fs.readFileSync('supabase/migrations/workspaces.sql','utf8')

test('default API function grants are repaired without changing workspace data or the RPC body',async()=>{
 const db=new PGlite()
 const uid='10000000-0000-0000-0000-000000000001',wid='20000000-0000-0000-0000-000000000002'
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema public,auth to authenticated,anon;
    alter default privileges in schema public grant execute on functions to anon;
    create table public.workspaces(id uuid primary key default gen_random_uuid(),user_id uuid,name text,is_default boolean,archived_at timestamptz,created_at timestamptz default now());
    insert into workspaces(id,user_id,name,is_default) values('${wid}','${uid}','Preserved',true);`)
  // Reproduce the old migration on a project with a direct default anon grant.
  const definition=base.slice(base.indexOf('create or replace function public.ensure_default_workspace()'),base.lastIndexOf('commit;'))
  await db.exec(definition.replace('from public, anon;','from public;'))
  const privileges=async()=>(await db.query("select has_function_privilege('anon','public.ensure_default_workspace()','EXECUTE') as anon,has_function_privilege('authenticated','public.ensure_default_workspace()','EXECUTE') as authenticated")).rows[0]
  assert.equal((await privileges()).anon,true,'REVOKE PUBLIC does not remove a direct default anon grant')
  const source=(await db.query("select prosrc from pg_proc where oid='public.ensure_default_workspace()'::regprocedure")).rows[0].prosrc
  await db.exec(upgrade);assert.deepEqual(await privileges(),{anon:false,authenticated:true})
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated')
  assert.equal((await db.query('select ensure_default_workspace() as id')).rows[0].id,wid)
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role anon')
  await assert.rejects(db.query('select ensure_default_workspace()'),/permission denied/)
  await db.exec('reset role;revoke execute on function ensure_default_workspace() from authenticated')
  await db.exec(upgrade);await db.exec(upgrade)
  assert.deepEqual(await privileges(),{anon:false,authenticated:true})
  assert.equal((await db.query('select count(*)::int as n from workspaces')).rows[0].n,1)
  assert.equal((await db.query("select prosrc from pg_proc where oid='public.ensure_default_workspace()'::regprocedure")).rows[0].prosrc,source)
  await db.exec(definition);assert.deepEqual(await privileges(),{anon:false,authenticated:true},'fresh setup also revokes the direct anon grant')
 }finally{await db.close()}
})
