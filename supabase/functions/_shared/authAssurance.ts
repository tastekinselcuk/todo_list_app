// Call only after Auth has verified this exact token and returned this user.
// Never use decoding alone to authenticate an incoming request.
export function verifiedUserHasRequiredAssurance(token:string,user:{id?:string;factors?:{status?:string}[]}):boolean{
 if(!user.id)return false
 if(!user.factors?.some(factor=>factor.status==='verified'))return true
 try{
  const payload=token.split('.')[1]
  const claims=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')))
  return claims.sub===user.id&&claims.aal==='aal2'
 }catch{return false}
}
