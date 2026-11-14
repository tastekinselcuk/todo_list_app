import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
const project=process.argv[2],rotate=process.argv.includes('--rotate')
if(!/^[a-z0-9]{16,24}$/.test(project||'')){console.error('Provide the project ref: npm run maintenance:configure -- <project-ref> [--rotate]');process.exit(1)}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pomodolist-maintenance-'))
function cli(args){
 const windows=process.platform==='win32'
 const npxEntry=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npx-cli.js')
 if(windows&&!fs.existsSync(npxEntry))throw new Error('Cannot locate the installed npm CLI')
 const result=spawnSync(windows?process.execPath:'npx',windows?[npxEntry,'--yes','supabase@3.0.0',...args]:['--yes','supabase@3.0.0',...args],{encoding:'utf8',windowsHide:true,maxBuffer:4000000})
 if(result.status!==0)throw new Error('Maintenance configuration failed; no credentials were printed. Verify migrations and CLI access before retrying.')
 return result.stdout
}
function query(sql){const filename=path.join(directory,'query.sql');fs.writeFileSync(filename,sql,{mode:0o600});return JSON.parse(cli(['db','query','--remote='+project,'--file',filename,'--yes'])).rows}
try{
 if(process.platform==='win32'){
  const identity=spawnSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true})
  const sid=identity.stdout.match(/S-1-[0-9-]+/)?.[0]
  if(!sid)throw new Error('Cannot secure the provisioning directory')
  const acl=spawnSync('icacls.exe',[directory,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,encoding:'utf8'})
  if(acl.status!==0)throw new Error('Cannot secure the provisioning directory')
 }
 const existing=query("select id,decrypted_secret from vault.decrypted_secrets where name='operations_cron_secret'")[0]
 const secret=rotate||!existing?crypto.randomBytes(32).toString('hex'):existing.decrypted_secret
 if(!/^[a-f0-9]{64}$/.test(secret))throw new Error('Existing maintenance key is invalid; use --rotate after checking the target')
 const envFile=path.join(directory,'worker.env')
 fs.writeFileSync(envFile,'OPERATIONS_CRON_SECRET='+secret+'\n',{mode:0o600})
 cli(['secrets','set','--remote='+project,'--env-file',envFile,'--yes'])
 if(!existing)query("select vault.create_secret('"+secret+"','operations_cron_secret','Scheduled worker signing key')")
 else if(rotate){
  if(!/^[a-f0-9-]{36}$/.test(existing.id))throw new Error('Invalid Vault identifier')
  query("select vault.update_secret('"+existing.id+"','"+secret+"')")
 }
 query("insert into private.background_dispatch_config(singleton,endpoint) values(true,'https://"+project+".supabase.co/functions/v1/scheduled-maintenance') on conflict(singleton) do update set endpoint=excluded.endpoint; select cron.schedule('scheduled-maintenance','* * * * *','select public.enqueue_scheduled_maintenance();')")
 console.log('Worker signing key and named schedule configured. No credentials were printed.')
}catch(error){console.error(error.message);process.exitCode=1}
finally{
 const resolved=path.resolve(directory)
 if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('pomodolist-maintenance-'))fs.rmSync(resolved,{recursive:true,force:true})
}
