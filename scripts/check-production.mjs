import {execFileSync} from 'node:child_process'
import path from 'node:path'
export async function checkProduction(site,expected,request=fetch){
 const base=new URL(site)
 if(base.protocol!=='https:'||base.username||base.password)throw new Error('Use an HTTPS application URL without credentials')
 const response=await request(new URL('/release.json',base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw new Error('Production release metadata is unavailable')
 let release
 try{release=await response.json()}catch{throw new Error('Production release metadata is unavailable')}
 if(release.revision!==expected)throw new Error('The expected revision is not deployed yet')
 if(!Number.isFinite(Date.parse(release.builtAt)))throw new Error('Production release metadata is invalid')
 return release
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/check-production.mjs')){
 const site=process.argv[2]||'https://pomodolist.netlify.app'
 const revision=process.argv[3]||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
 checkProduction(site,revision).then(()=>console.log('Production serves the expected revision.')).catch(error=>{console.error(error.message);process.exitCode=1})
}
