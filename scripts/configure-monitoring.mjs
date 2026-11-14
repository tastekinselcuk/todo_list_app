import path from 'node:path'
import {spawnSync} from 'node:child_process'
const [project,repository]=process.argv.slice(2)
if(!/^[a-z0-9]{16,24}$/.test(project||'')||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')){
 console.error('Usage: npm run monitoring:configure -- <project-ref> <owner/repository>');process.exit(1)
}
async function main(){
 const windows=process.platform==='win32',npx=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npx-cli.js')
 const args=['--yes','supabase@3.0.0','projects','api-keys','--remote='+project,'--reveal','--output','json']
 const result=spawnSync(windows?process.execPath:'npx',windows?[npx,...args]:args,{encoding:'utf8',windowsHide:true})
 if(result.status!==0)throw Error('Supabase CLI authentication is required')
 const key=JSON.parse(result.stdout).find(item=>item.name==='anon')?.api_key
 if(!key)throw Error('The public anon key was not found')
 if(!key.startsWith('sb_publishable_')){
  const claims=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString())
  if(claims.role!=='anon')throw Error('Monitoring never accepts an administrative key')
 }
 let token=process.env.GITHUB_TOKEN
 if(!token){
  const owner=repository.split('/')[0]
  const credential=spawnSync('git',['-c','credential.username='+owner,'credential','fill'],{input:'protocol=https\nhost=github.com\nusername='+owner+'\n\n',encoding:'utf8',windowsHide:true})
  token=credential.stdout?.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9)
 }
 if(!token)throw Error('GitHub authentication is required')
 for(const [name,value] of Object.entries({VITE_SUPABASE_URL:'https://'+project+'.supabase.co',VITE_SUPABASE_ANON_KEY:key})){
  const base='https://api.github.com/repos/'+repository+'/actions/variables'
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}
  const existing=await fetch(base+'/'+name,{headers,signal:AbortSignal.timeout(15000)})
  if(![200,404].includes(existing.status))throw Error('GitHub repository variable access was denied')
  const saved=await fetch(existing.status===200?base+'/'+name:base,{method:existing.status===200?'PATCH':'POST',headers,body:JSON.stringify({name,value}),signal:AbortSignal.timeout(15000)})
  if(!saved.ok)throw Error('GitHub monitoring variable update failed')
 }
 console.log('Public monitoring variables configured. No admin keys or credentials were published.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
