import {createClient} from 'npm:@supabase/supabase-js@2'
import {maintenanceHandler} from './handler.ts'
import {vaultEmailConfig} from '../vault-security/emailConfig.ts'
import {escapeHtml} from '../send-periodic-reminder/handler.ts'
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
// Respect the already configured sandbox recipient until a production sender exists.
const mail=vaultEmailConfig(Deno.env.toObject())
async function rpc(name:string,args:Record<string,unknown>={}){const {data,error}=await admin.rpc(name,args);if(error)throw new Error('BACKGROUND_DATABASE_ERROR');return data}
Deno.serve(maintenanceHandler({
 secret:Deno.env.get('OPERATIONS_CRON_SECRET')||'',mailConfigured:mail.configured,
 async consumeTicket(id,issued){return await rpc('consume_maintenance_ticket',{ticket:id,issued_at:issued})===true},
 async claim(){return await rpc('claim_due_periodic_emails',{batch_size:5,recipient_filter:Deno.env.get('VAULT_MAIL_MODE')==='test'?Deno.env.get('VAULT_TEST_EMAIL'):null})||[]},
 async finish(id,lease,success){await rpc('finish_periodic_email',{did:id,token:lease,success})},
 async send(key,message){
  if(!mail.recipientAllowed(message.to))throw new Error('RECIPIENT_NOT_ALLOWED')
  const result=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),
   headers:{Authorization:`Bearer ${mail.key}`,'Content-Type':'application/json','Idempotency-Key':key},
   body:JSON.stringify({from:mail.from,to:[message.to],subject:`Hatırlatma: ${message.title}`,
    html:`<div style="font-family:system-ui,sans-serif"><h2>${escapeHtml(message.title)}</h2>${message.notes?`<p>${escapeHtml(message.notes)}</p>`:''}<p>${escapeHtml(message.workspaceName)} · ${escapeHtml(message.reminderTime)}</p></div>`})})
  if(!result.ok)throw new Error('EMAIL_PROVIDER_UNAVAILABLE')
 },
 async cleanup(){
  await rpc('purge_expired_trash',{batch_size:200});await rpc('vault_cleanup',{batch_size:200})
  const paths=await rpc('trash_cleanup_images',{ack:[]})||[]
  if(paths.length){const {error}=await admin.storage.from('note-images').remove(paths);if(error)throw new Error('STORAGE_CLEANUP_FAILED');await rpc('trash_cleanup_images',{ack:paths})}
  await rpc('cleanup_operational_metrics')
 },
 async record(status){await admin.from('background_run_status').insert(status).throwOnError()},
}))
