import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {baselineTransaction} from './database-baseline.mjs'
const [project,mode]=process.argv.slice(2)
if(!/^[a-z0-9]{16,24}$/.test(project||'')||mode!=='--initialize-empty'){
 console.error('Usage: npm run db:initialize -- <project-ref> --initialize-empty. Existing application tables are never replaced.');process.exit(1)
}
fs.mkdirSync('tmp',{recursive:true})
const file=path.join('tmp','initialize-'+crypto.randomUUID()+'.sql')
try{
 fs.writeFileSync(file,baselineTransaction())
 const args=['--yes','supabase@3.0.0','db','query','--remote='+project,'--file',file,'--yes']
 const result=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npx.cmd '+args.join(' ')],{encoding:'utf8',windowsHide:true,maxBuffer:4000000}):spawnSync('npx',args,{encoding:'utf8',maxBuffer:4000000})
 if(result.status!==0)throw Error('Initialization rejected or failed. Existing application tables must not be present; the transaction was not committed.')
 const upgrade=spawnSync(process.execPath,['scripts/apply-database-migrations.mjs',project],{stdio:'inherit',windowsHide:true})
 if(upgrade.status!==0)throw Error('Baseline installed; pending upgrades failed. Run db:migrate before deploying the app.')
 console.log('Empty application schema initialized. Configure Edge secrets and maintenance before running the deployment gate.')
}catch(error){console.error(error.message);process.exitCode=1}finally{if(fs.existsSync(file))fs.unlinkSync(file)}
