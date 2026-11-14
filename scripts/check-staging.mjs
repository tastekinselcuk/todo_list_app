import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {baselineTransaction} from './database-baseline.mjs'
import {migrationFiles,migrationTransaction} from './migration-contract.mjs'
// No hosted credentials, production data or externally reachable ports are used.
const id='pomodolist-check-'+crypto.randomBytes(6).toString('hex'),directory=fs.mkdtempSync(path.join(os.tmpdir(),id+'-'))
const secret=crypto.randomBytes(40).toString('hex'),password=crypto.randomBytes(32).toString('hex'),containers=[]
const images={db:'public.ecr.aws/supabase/postgres:17.11.0.018@sha256:7c31363a3f7434ff14945f1b8a4880e6eca8b362e197e88b87c476c77aa3cf8c',auth:'supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',rest:'postgrest/postgrest:v14.18@sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf',storage:'supabase/storage-api:v1.89.12@sha256:8526956cb462e9f7d392e9848ec77133b2769982ed614e9753cc687e8e4339a6'}
const proof={database:false,authentication:false,isolation:false,mfa:false,storage:false,cleaned:false}
let networkCreated=false,stage='initialization',diagnostic='',cancelled=false
process.once('SIGINT',()=>{cancelled=true});process.once('SIGTERM',()=>{cancelled=true})
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:8000000,timeout:180000});if(r.status!==0){diagnostic=r.stderr||r.error?.message||'';throw Error('STAGING_DOCKER_FAILED')}return r.stdout.trim()}
function jwt(role){const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),body=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url')}
const service=jwt('service_role'),anon=jwt('anon')
function sql(query){return docker(['exec','-i',id+'-db','psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-At'],query)}
function run(name,image,env,port){
 const file=path.join(directory,name+'.env');fs.writeFileSync(file,Object.entries(env).map(([k,v])=>k+'='+v).join('\n'),{mode:0o600})
 const args=['run','--detach','--name',id+'-'+name,'--label','pomodolist.check='+id,'--network',id,'--network-alias',name,'--env-file',file]
 args.push(image);containers.push(id+'-'+name);docker(args)
 if(!port)return ''
 const info=JSON.parse(docker(['inspect',id+'-'+name]))[0]
 if(Object.keys(info.HostConfig.PortBindings||{}).length)throw Error('STAGING_PORT_NOT_PRIVATE')
 return 'http://'+name+':'+port
}
async function fetch(url,options={}){
 if(cancelled)throw Error('STAGING_CANCELLED')
 const input={url,method:options.method||'GET',headers:options.headers||{},body:options.body===undefined?null:Buffer.from(options.body).toString('base64')}
 const worker=`let text='';for await(const chunk of process.stdin)text+=chunk;const q=JSON.parse(text);const r=await fetch(q.url,{method:q.method,headers:q.headers,body:q.body===null?undefined:Buffer.from(q.body,'base64'),signal:AbortSignal.timeout(15000)});process.stdout.write(JSON.stringify({status:r.status,body:Buffer.from(await r.arrayBuffer()).toString('base64')}))`
 const data=JSON.parse(docker(['exec','-i',id+'-client','node','--input-type=module','-e',worker],JSON.stringify(input)))
 return new Response([204,304].includes(data.status)?null:Buffer.from(data.body,'base64'),{status:data.status})
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function wait(url){const deadline=Date.now()+90000;for(let i=0;i<90&&Date.now()<deadline;i++){
 if(cancelled)throw Error('STAGING_CANCELLED')
 const name=id+'-'+new URL(url).hostname
 if(containers.includes(name)&&docker(['inspect','--format','{{.State.Running}}',name])!=='true')throw Error('STAGING_SERVICE_STOPPED')
 try{const r=await fetch(url);if(r.status<500)return}catch{}await pause(500)
 }throw Error('STAGING_SERVICE_NOT_READY')}
async function request(base,route,token,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,apikey:anon,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
 return {status:response.status,data}
}
function requireStatus(result,status){if(result.status!==status)throw Error('STAGING_HTTP_EXPECTATION_FAILED');return result.data}
function otp(seed){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const ch of seed.replace(/=+$/,''))bits+=alphabet.indexOf(ch).toString(2).padStart(5,'0');const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',key).update(counter).digest();return ((h.readUInt32BE(h.at(-1)&15)&0x7fffffff)%1000000).toString().padStart(6,'0')}
try{
 if(process.platform==='win32'){
  const identity=spawnSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).stdout.match(/S-1-[0-9-]+/)?.[0]
  if(!identity||spawnSync('icacls.exe',[directory,'/inheritance:r','/grant:r','*'+identity+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,encoding:'utf8'}).status!==0)throw Error('STAGING_DIRECTORY_NOT_PRIVATE')
 }else fs.chmodSync(directory,0o700)
 docker(['network','create','--internal','--label','pomodolist.check='+id,id]);networkCreated=true
 containers.push(id+'-client');docker(['run','--detach','--name',id+'-client','--label','pomodolist.check='+id,'--network',id,'--entrypoint','node',images.storage,'-e','setInterval(()=>{},1000)'])
 stage='database startup';run('db',images.db,{POSTGRES_PASSWORD:password})
 for(let i=0;;i++){
  try{if(cancelled)throw Error('STAGING_CANCELLED');const logs=docker(['logs',id+'-db']);if(!logs.includes('PostgreSQL init process complete'))throw Error('INITIALIZING');sql('select 1');break}
  catch{if(i>=120)throw Error('STAGING_DATABASE_NOT_READY');await pause(500)}
 }
 sql(`do $$ declare r text;begin foreach r in array array['anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin'] loop if not exists(select 1 from pg_roles where rolname=r)then execute format('create role %I',r);end if;end loop;end $$;
 alter role service_role bypassrls;alter role authenticator login noinherit password '${password}';
 alter role supabase_auth_admin login createrole password '${password}';alter role supabase_storage_admin login createrole password '${password}';
 grant anon,authenticated,service_role to authenticator,supabase_storage_admin;
 create schema if not exists auth authorization supabase_auth_admin;alter schema auth owner to supabase_auth_admin;
 create schema if not exists storage authorization supabase_storage_admin;alter schema storage owner to supabase_storage_admin;
 alter role supabase_auth_admin set search_path=auth,public;alter role supabase_storage_admin set search_path=storage,public;
 create or replace function auth.uid() returns uuid language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claim.sub'',true),''''),(nullif(current_setting(''request.jwt.claims'',true),'''')::jsonb->>''sub''))::uuid';
 create or replace function auth.role() returns text language sql stable as 'select nullif(current_setting(''request.jwt.claims'',true),'''')::jsonb->>''role''';
 create or replace function auth.jwt() returns jsonb language sql stable as 'select nullif(current_setting(''request.jwt.claims'',true),'''')::jsonb';
 create or replace function auth.email() returns text language sql stable as 'select nullif(current_setting(''request.jwt.claims'',true),'''')::jsonb->>''email''';
 alter function auth.uid() owner to supabase_auth_admin;alter function auth.role() owner to supabase_auth_admin;
 alter function auth.jwt() owner to supabase_auth_admin;alter function auth.email() owner to supabase_auth_admin;
 grant usage on schema auth,public to anon,authenticated,service_role,supabase_storage_admin;
 create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;`)
 stage='Auth startup';const auth=run('auth',images.auth,{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:'http://auth:9999',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${password}@db:5432/postgres`,GOTRUE_SITE_URL:'http://localhost',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:3600,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_MFA_TOTP_ENROLL_ENABLED:'true',GOTRUE_MFA_TOTP_VERIFY_ENABLED:'true'},9999)
 await wait(auth+'/health')
 stage='REST startup';const rest=run('rest',images.rest,{PGRST_DB_URI:`postgres://authenticator:${password}@db:5432/postgres`,PGRST_DB_SCHEMAS:'public,storage',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_USE_LEGACY_GUCS:'false'},3000)
 stage='Storage startup';const storage=run('storage',images.storage,{ANON_KEY:anon,SERVICE_KEY:service,POSTGREST_URL:'http://rest:3000',AUTH_JWT_SECRET:secret,DATABASE_URL:`postgres://supabase_storage_admin:${password}@db:5432/postgres`,STORAGE_PUBLIC_URL:'http://localhost',STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',GLOBAL_S3_BUCKET:'local',TENANT_ID:'local',REGION:'local',ENABLE_IMAGE_TRANSFORMATION:'false',FILE_SIZE_LIMIT:10485760},5000)
 await wait(storage+'/status')
 stage='application schema';sql(baselineTransaction())
 const contract=JSON.parse(fs.readFileSync(new URL('../supabase/bootstrap/contract.json',import.meta.url)))
 for(const file of migrationFiles().filter(f=>f.version>contract.through))sql(migrationTransaction(file))
 sql("notify pgrst,'reload schema';notify pgrst,'reload config'")
 await pause(1000);await wait(rest+'/')
 if(requireStatus(await request(rest,'/rpc/application_auth_ready',anon,{}),200)!==true)throw Error('STAGING_MFA_GATE_FAILED');proof.database=true
 stage='authentication and isolation'
 const userPassword=crypto.randomBytes(24).toString('base64url')
 const create=async name=>requireStatus(await request(auth,'/admin/users',service,{email:name+'@example.invalid',password:userPassword,email_confirm:true}),200)
 const first=await create('first'),second=await create('second')
 const signin=async name=>requireStatus(await request(auth,'/token?grant_type=password',anon,{email:name+'@example.invalid',password:userPassword}),200)
 const signed=await signin('first'),other=await signin('second');proof.authentication=Boolean(first.id&&second.id&&signed.access_token)
 const wid=requireStatus(await request(rest,'/rpc/ensure_default_workspace',signed.access_token,{}),200)
 const own=requireStatus(await request(rest,'/workspaces?select=id&id=eq.'+wid,signed.access_token),200)
 const foreign=requireStatus(await request(rest,'/workspaces?select=id&id=eq.'+wid,other.access_token),200)
 if(own.length!==1||foreign.length!==0)throw Error('STAGING_USER_ISOLATION_FAILED');proof.isolation=true
 stage='MFA'
 const factor=requireStatus(await request(auth,'/factors',signed.access_token,{factor_type:'totp',issuer:'Pomodolist staging'}),200)
 const challenge=requireStatus(await request(auth,`/factors/${factor.id}/challenge`,signed.access_token,{}),200)
 const verified=requireStatus(await request(auth,`/factors/${factor.id}/verify`,signed.access_token,{challenge_id:challenge.id,code:otp(factor.totp.secret)}),200)
 const blocked=await request(rest,'/workspaces?select=id',signed.access_token)
 if(blocked.status!==403||blocked.data.code!=='MFA_REQUIRED')throw Error('STAGING_MFA_NOT_ENFORCED')
 requireStatus(await request(rest,'/workspaces?select=id',verified.access_token),200);proof.mfa=true
 stage='Storage round trip'
 requireStatus(await request(storage,'/bucket',service,{id:'restore-check',name:'restore-check',public:false}),200)
 const bytes=crypto.randomBytes(1024),object='/object/restore-check/proof.bin'
 const uploaded=await fetch(storage+object,{method:'POST',headers:{Authorization:'Bearer '+service,'Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(15000)})
 if(!uploaded.ok)throw Error('STAGING_STORAGE_UPLOAD_FAILED')
 const downloaded=await fetch(storage+object,{headers:{Authorization:'Bearer '+service},signal:AbortSignal.timeout(15000)})
 if(!downloaded.ok||!Buffer.from(await downloaded.arrayBuffer()).equals(bytes))throw Error('STAGING_STORAGE_RESTORE_FAILED')
 const denied=await fetch(storage+object,{headers:{Authorization:'Bearer '+anon},signal:AbortSignal.timeout(15000)})
 if(denied.ok)throw Error('STAGING_PRIVATE_STORAGE_EXPOSED');proof.storage=true
 if(!['database','authentication','isolation','mfa','storage'].every(key=>proof[key]))throw Error('STAGING_INCOMPLETE')
}catch(error){
 proof.failedStage=stage;proof.error=error.message
 const safe=text=>text.replaceAll(password,'[redacted]').replaceAll(secret,'[redacted]').replaceAll(service,'[redacted]').replaceAll(anon,'[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token]').slice(-2000)
 proof.diagnostic=safe(diagnostic)
 proof.services={}
 for(const name of ['auth','storage'])if(containers.includes(id+'-'+name)){
  const logs=spawnSync('docker',['logs','--tail','5',id+'-'+name],{encoding:'utf8',windowsHide:true});proof.services[name]=safe((logs.stdout||'')+(logs.stderr||''))
 }
 process.exitCode=1
}
finally{
 let cleaned=true
 for(const container of containers.reverse())try{
  const found=spawnSync('docker',['inspect','--format','{{index .Config.Labels "pomodolist.check"}}',container],{encoding:'utf8',windowsHide:true})
  if(found.status!==0&&/No such (object|container)/i.test(found.stderr))continue
  if(found.status!==0||found.stdout.trim()!==id)throw Error('CLEANUP_OWNERSHIP_MISMATCH');docker(['rm','--force','--volumes',container])
 }catch{cleaned=false}
 if(networkCreated)try{if(docker(['network','inspect','--format','{{index .Labels "pomodolist.check"}}',id])!==id)throw Error('CLEANUP_OWNERSHIP_MISMATCH');docker(['network','rm',id])}catch{cleaned=false}
 const resolved=path.resolve(directory);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith(id+'-'))fs.rmSync(resolved,{recursive:true,force:true});else cleaned=false
 proof.cleaned=cleaned;if(!cleaned)process.exitCode=1
 console.log(JSON.stringify(proof))
}
