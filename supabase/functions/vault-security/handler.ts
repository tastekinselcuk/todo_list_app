export interface VaultIdentity { id:string; email:string; session:string; mfaRequired:boolean }
export interface VaultDependencies {
  origins:string[]; secret:string; configured:boolean
  authenticate(token:string):Promise<VaultIdentity|null>
  rpc(name:string,args:Record<string,unknown>):Promise<any>
  send(email:string,code:string,action:string,id:string):Promise<void>
  recipientAllowed?(email:string):boolean
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
const operations=['password','recover','delete']
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('')
async function hmac(secret:string,value:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))
}
export function vaultSecurityHandler(deps:VaultDependencies){return async(request:Request)=>{
  const origin=request.headers.get('origin')||''
  const allowed=deps.origins.includes(origin)
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'}
  if(allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'})
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers})
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405)
  if(origin&&!allowed)return reply({error:'ORIGIN_DENIED'},403)
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if(!token)return reply({error:'AUTH_REQUIRED'},401)
  try{
    const user=await deps.authenticate(token)
    if(!user)return reply({error:'AUTH_REQUIRED'},401)
    if(user.mfaRequired)return reply({error:'MFA_REQUIRED'},403)
    if(!deps.configured||deps.secret.length<32)return reply({error:'EMAIL_CONFIGURATION_REQUIRED'},503)
    if(deps.recipientAllowed&&!deps.recipientAllowed(user.email))return reply({error:'TEST_RECIPIENT_ONLY'},403)
    const reader=request.body?.getReader();if(!reader)return reply({error:'INVALID_INPUT'},400)
    const chunks:Uint8Array[]=[];let length=0
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>24000){await reader.cancel();return reply({error:'INVALID_INPUT'},413)}chunks.push(value)}}finally{reader.releaseLock()}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    const body=JSON.parse(new TextDecoder().decode(bytes))
    const mail_hash=await hmac(deps.secret,'email:'+user.email.toLowerCase())
    if(!await deps.rpc('vault_security_budget',{uid:user.id}))return reply({error:'RATE_LIMITED'},429)
    if(body.action==='start'){
      if(!uuid(body.vaultId)||!operations.includes(body.operation)||!Number.isInteger(body.version)||body.version<1)return reply({error:'INVALID_INPUT'},400)
      const challenge=crypto.randomUUID()
      let n=crypto.getRandomValues(new Uint32Array(1))[0]
      while(n>=4_200_000_000)n=crypto.getRandomValues(new Uint32Array(1))[0]
      const code=String(n%100_000_000).padStart(8,'0')
      await deps.rpc('vault_challenge_start',{uid:user.id,sid:body.vaultId,challenge,operation:body.operation,jwt_session:user.session,mail_hash,
        otp_hash:await hmac(deps.secret,challenge+':'+code),expected_version:body.version,prepared:body.operation==='delete'?{}:{metadata:body.metadata}})
      try{await deps.send(user.email,code,body.operation,challenge)}catch{await deps.rpc('vault_challenge_cancel',{uid:user.id,challenge});return reply({error:'EMAIL_UNAVAILABLE'},503)}
      return reply({challenge,expiresIn:600})
    }
    if(body.action==='finish'&&uuid(body.challenge)&&typeof body.code==='string'&&/^\d{8}$/.test(body.code)){
      const result=await deps.rpc('vault_challenge_finish',{uid:user.id,challenge:body.challenge,jwt_session:user.session,mail_hash,otp_hash:await hmac(deps.secret,body.challenge+':'+body.code)})
      return reply(result,result?.error?400:200)
    }
    return reply({error:'INVALID_INPUT'},400)
  }catch(error){
    const message=error instanceof Error?error.message:''
    const safe=['RATE_LIMITED','SHARING_CONFLICT','ACCESS_DENIED','VAULT_INVALID_DATA'].find(code=>message.includes(code))
    return reply({error:safe||'UNAVAILABLE'},safe==='RATE_LIMITED'?429:400)
  }
}}
