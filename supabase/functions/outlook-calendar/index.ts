import { outlookCalendarHandler } from './handler.ts'
const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
Deno.serve(outlookCalendarHandler({
 config:{clientId:Deno.env.get('OUTLOOK_CLIENT_ID')||'',clientSecret:Deno.env.get('OUTLOOK_CLIENT_SECRET')||'',encryptionKey:Deno.env.get('CALENDAR_ENCRYPTION_KEY')||'',redirectUri:Deno.env.get('OUTLOOK_REDIRECT_URI')||'',origins:(Deno.env.get('CALENDAR_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)},
 async authenticate(token){const response=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});if(!response.ok)return null;const user=await response.json();return user?.id||null},
 async rpc(uid,operation,record_id=null,payload={}){
  const response=await fetch(base+'/rest/v1/rpc/external_calendar_service',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({uid,operation,record_id,payload}),signal:AbortSignal.timeout(10000)});
  if(!response.ok){const failure=await response.json().catch(()=>({}));throw Error(['CALENDAR_ACCESS_DENIED','CALENDAR_SELECTION_INVALID','CALENDAR_LIMIT'].includes(failure.message)?failure.message:'UNAVAILABLE')}
  return response.json();
 },fetch,
}))
