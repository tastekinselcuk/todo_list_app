import { vaultSecurityHandler } from './handler.ts'
import { vaultEmailConfig } from './emailConfig.ts'
const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const {key,from,configured,recipientAllowed}=vaultEmailConfig(Object.fromEntries(['RESEND_API_KEY','VAULT_FROM_EMAIL','VAULT_MAIL_MODE','VAULT_TEST_EMAIL'].map(name=>[name,Deno.env.get(name)])))
Deno.serve(vaultSecurityHandler({
  origins:(Deno.env.get('VAULT_ALLOWED_ORIGINS')||'https://pomodolist.netlify.app,http://localhost:5173').split(',').map(x=>x.trim()).filter(Boolean),
  secret:Deno.env.get('VAULT_OTP_SECRET')||'',configured,recipientAllowed,
  async authenticate(token){
    const response=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)})
    if(!response.ok)return null
    const user=await response.json()
    if(!user.id||!user.email||!user.email_confirmed_at)return null
    const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
    if(!claims.session_id||claims.sub!==user.id)return null
    return {id:user.id,email:user.email,session:claims.session_id,mfaRequired:user.factors?.some((f:any)=>f.status==='verified')&&claims.aal!=='aal2'}
  },
  async rpc(name,args){
    const response=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)})
    if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.message||'UNAVAILABLE')}
    return response.status===204?null:response.json()
  },
  async send(email,code,action,id){
    const labels:Record<string,string>={password:'kasa parolasını değiştirme',recover:'kasa erişimini kurtarma',reset:'kasa içeriğini silerek sıfırlama',delete:'kasayı ve tüm içeriğini silme'}
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':id},
      body:JSON.stringify({from,to:[email],subject:'Pomodolist · Güvenli kasa doğrulama kodu',text:`${labels[action]} işlemi için doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir. Bu işlemi siz başlatmadıysanız kodu paylaşmayın; hesap güvenliğinizi kontrol edin. Pomodolist sizden kasa parolanızı veya kurtarma anahtarınızı e-posta ile istemez.`})})
    if(!response.ok)throw Error('EMAIL_UNAVAILABLE')
  }
}))
