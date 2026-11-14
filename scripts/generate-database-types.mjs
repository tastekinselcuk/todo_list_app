import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
const project=process.argv[2]||process.env.SUPABASE_PROJECT_REF
if(!/^[a-z0-9]{16,24}$/.test(project||'')){
 console.error('Provide the project ref: npm run types:database -- <project-ref>')
 process.exit(1)
}
const command=['--yes','supabase@3.0.0','gen','types','--remote='+project,'--schema','public']
const result=process.platform==='win32'
 ?spawnSync('cmd.exe',['/d','/s','/c','npx.cmd '+command.join(' ')],{encoding:'utf8',windowsHide:true,maxBuffer:8000000})
 :spawnSync('npx',command,{encoding:'utf8',maxBuffer:8000000})
if(result.status!==0||!result.stdout.startsWith('export type Json')){
 console.error('Database type generation failed; the existing type file was preserved.')
 process.exit(1)
}
fs.writeFileSync(new URL('../src/lib/database.types.ts',import.meta.url),result.stdout)
console.log('Public database types updated. No application data was exported.')
