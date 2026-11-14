import fs from 'node:fs'
import {createClient} from '@supabase/supabase-js'
const environment={...process.env}
if(fs.existsSync('.env.local'))for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){
 const entry=line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
 if(entry&&!environment[entry[1]])environment[entry[1]]=entry[2].replace(/^(['"])(.*)\1$/,'$2')
}
async function main(){
 const url=environment.VITE_SUPABASE_URL,key=environment.VITE_SUPABASE_ANON_KEY
 if(!url||!key||new URL(url).protocol!=='https:')throw Error('Monitoring requires the public HTTPS project URL and publishable/anon key')
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
 const result=await client.rpc('application_operations_ready',{}, {get:true}).abortSignal(AbortSignal.timeout(20000))
 if(result.error||result.data!==true)throw Error('Operational health failed: verify worker freshness, cleanup and active Cron jobs in Supabase.')
 console.log('Operational health passed. No user data or credentials were fetched.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
