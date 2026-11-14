import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {migrationFiles,migrationTransaction} from './migration-contract.mjs'
const project=process.argv[2]
if(!/^[a-z0-9]{16,24}$/.test(project||'')){console.error('Provide the project ref: npm run db:migrate -- <project-ref>');process.exit(1)}
fs.mkdirSync('tmp',{recursive:true})
const temporary=path.join('tmp','database-migration-'+crypto.randomUUID()+'.sql')
function query(sql){
 fs.writeFileSync(temporary,sql)
 const args=['--yes','supabase@3.0.0','db','query','--remote='+project,'--file',temporary,'--yes']
 const result=process.platform==='win32'
  ?spawnSync('cmd.exe',['/d','/s','/c','npx.cmd '+args.join(' ')],{encoding:'utf8',windowsHide:true,maxBuffer:4000000})
  :spawnSync('npx',args,{encoding:'utf8',maxBuffer:4000000})
 if(result.status!==0)throw new Error('Migration query failed; deployment stopped. Inspect the target before retrying.')
 return JSON.parse(result.stdout).rows
}
try{
 const files=migrationFiles(),bootstrap=files.find(file=>file.version==='202611140010')
 const exists=query("select to_regclass('supabase_migrations.schema_migrations') is not null as present")[0].present
 if(!exists){query(migrationTransaction(bootstrap));console.log('Migration registry initialized')}
 const registry=query('select version,checksum from supabase_migrations.schema_migrations')
 for(const file of files){
  const previous=registry.find(row=>row.version===file.version)
  if(previous){if(previous.checksum!==file.sha256)throw new Error('An applied migration was modified: '+file.name);continue}
  // On first installation the bootstrap itself has already been recorded.
  if(file===bootstrap&&!exists)continue
  query(migrationTransaction(file));console.log('Applied and recorded '+file.name)
 }
 console.log('Tracked migrations are current. Older unversioned history still requires baseline reconciliation.')
}catch(error){console.error(error.message);process.exitCode=1}
finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
