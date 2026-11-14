import {supabase} from './supabase'
export async function mfaState(remote=false){
 const session=await supabase.auth.getSession()
 if(session.error||!session.data.session)throw new Error('AUTH_REQUIRED')
 const level=await supabase.auth.mfa.getAuthenticatorAssuranceLevel(remote?session.data.session.access_token:undefined)
 if(level.error||!level.data)throw new Error('MFA_UNAVAILABLE')
 const required=level.data.nextLevel==='aal2'&&level.data.currentLevel!=='aal2'
 if(!required)return {userId:session.data.session.user.id,required:false,factors:[]}
 const factors=await supabase.auth.mfa.listFactors()
 if(factors.error)throw new Error('MFA_UNAVAILABLE')
 return {userId:session.data.session.user.id,required:true,factors:factors.data.totp}
}
export async function verifyMfaCode(factorId:string,code:string){
 if(!factorId||!/^\d{6}$/.test(code))throw new Error('MFA_CODE_INVALID')
 const result=await supabase.auth.mfa.challengeAndVerify({factorId,code})
 if(result.error)throw result.error
 // Auth has already committed the new session. A disconnected socket must not
 // turn successful verification into a false failure or discard the session.
 try{if(result.data?.access_token)await supabase.realtime.setAuth(result.data.access_token)}catch{/* Channels also read the current token on reconnect. */}
}
