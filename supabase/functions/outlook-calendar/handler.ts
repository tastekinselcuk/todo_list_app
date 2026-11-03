export interface OutlookConfig { clientId:string; clientSecret:string; redirectUri:string; encryptionKey:string; origins:string[] }
export interface CalendarDependencies {
 config:OutlookConfig; authenticate(token:string):Promise<string|null>;
 rpc(user:string|null,operation:string,id?:string|null,payload?:Record<string,unknown>):Promise<any>;
 fetch:typeof fetch; now?:()=>number;
}
const graph='https://graph.microsoft.com/v1.0',authority='https://login.microsoftonline.com/common/oauth2/v2.0';
// ReadBasic omits bodies, attachments and extensions. These aren't needed for an overlay.
const scopes='offline_access User.Read Calendars.ReadBasic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
export async function digest(value:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}
export async function seal(value:string,key:string,context:string){
 const secret=await crypto.subtle.importKey('raw',Uint8Array.from(atob(key),c=>c.charCodeAt(0)),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},secret,new TextEncoder().encode(value));
 return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}
export async function unseal(value:string,key:string,context:string){
 const [iv,data]=value.split('.'),secret=await crypto.subtle.importKey('raw',Uint8Array.from(atob(key),c=>c.charCodeAt(0)),'AES-GCM',false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode(context)},secret,Uint8Array.from(atob(data),c=>c.charCodeAt(0))));
}
export function graphDate(value:any,allDay=false):string {
 if(typeof value?.dateTime!=='string')throw Error('PROVIDER_ERROR');
 if(allDay)return value.dateTime.slice(0,10);
 const raw=value.dateTime,iso=/Z$|[+-]\d{2}:\d{2}$/.test(raw)?raw:raw+'Z';
 const date=new Date(iso);if(!Number.isFinite(date.getTime()))throw Error('PROVIDER_ERROR');return date.toISOString();
}
export function safeEventUrl(value:unknown){
 try{const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password&&['outlook.live.com','outlook.office.com','outlook.office365.com'].includes(url.hostname)?url.href:null}catch{return null}
}
function nextGraph(value:string){const url=new URL(value);if(url.origin!=='https://graph.microsoft.com'||url.username||url.password||!url.pathname.startsWith('/v1.0/'))throw Error('PROVIDER_ERROR');return url.href}
export function outlookCalendarHandler(deps:CalendarDependencies){
 const {config,rpc}=deps,now=deps.now||Date.now;
 let configured=false;try{configured=Boolean(config.clientId&&config.clientSecret&&new URL(config.redirectUri).protocol==='https:'&&atob(config.encryptionKey).length===32&&config.origins.length)}catch{}
 const context=(uid:string,kind:string)=>`outlook:${uid}:${kind}`;
 async function requestJSON(url:string,options:RequestInit={}){
  const response=await deps.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.status===429)throw Error('RATE_LIMITED');
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error==='invalid_grant'||response.status===401||response.status===403?'REAUTH_REQUIRED':'PROVIDER_ERROR');
  return data;
 }
 async function token(form:Record<string,string>){
  const data=await requestJSON(authority+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,scope:scopes,...form})});
  if(typeof data.access_token!=='string'||(!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0||Number(data.expires_in)>86400))throw Error('PROVIDER_ERROR');return data;
 }
 async function graphJSON(path:string,access:string){return requestJSON(path.startsWith('https:')?nextGraph(path):graph+path,{headers:{Authorization:`Bearer ${access}`,Prefer:'outlook.timezone="UTC"'}})}
 async function pages(path:string,access:string,limit:number){
  const items:any[]=[];let next=path;
  for(let i=0;next;i++){
   if(i>=10)throw Error('TOO_MANY_EVENTS');
   const data=await graphJSON(next,access);if(!Array.isArray(data.value))throw Error('PROVIDER_ERROR');items.push(...data.value);
   if(items.length>limit)throw Error('TOO_MANY_EVENTS');next=data['@odata.nextLink']||'';
  }return items;
 }
 async function calendars(access:string){
  const items=await pages('/me/calendars?$select=id,name,hexColor,isDefaultCalendar&$top=100',access,100);
  return items.map((item:any)=>({id:String(item.id),name:String(item.name||'Outlook').slice(0,150),color:/^#[0-9a-f]{6}$/i.test(item.hexColor)?item.hexColor:'#64748B',default:item.isDefaultCalendar===true}));
 }
 async function encrypted(uid:string,data:any,refresh:string){return {access:await seal(data.access_token,config.encryptionKey,context(uid,'access')),refresh:await seal(data.refresh_token||refresh,config.encryptionKey,context(uid,'refresh')),expires_at:new Date(now()+Number(data.expires_in)*1000).toISOString()}}
 async function access(uid:string,id:string){
  let stored=await rpc(uid,'tokens',id);if(!stored||stored.status==='reauth')throw Error('REAUTH_REQUIRED');
  if(new Date(stored.expires_at).getTime()>now()+60000)return unseal(stored.access_cipher,config.encryptionKey,context(uid,'access'));
  if(!await rpc(uid,'lock',id,{version:stored.version})){
   // Another isolate owns the refresh; never race two refresh-token writes.
   for(let i=0;i<4;i++){await new Promise(resolve=>setTimeout(resolve,200));stored=await rpc(uid,'tokens',id);if(new Date(stored.expires_at).getTime()>now()+60000)return unseal(stored.access_cipher,config.encryptionKey,context(uid,'access'))}
   throw Error('BUSY');
  }
  try{
   const refresh=await unseal(stored.refresh_cipher,config.encryptionKey,context(uid,'refresh'));
   const data=await token({grant_type:'refresh_token',refresh_token:refresh});
   if(!await rpc(uid,'refreshed',id,{...await encrypted(uid,data,refresh),version:stored.version}))throw Error('BUSY');return data.access_token;
  }catch(error){if((error as Error).message==='REAUTH_REQUIRED')await rpc(uid,'reauth',id);throw error}
  finally{await rpc(uid,'unlock',id,{version:stored.version}).catch(()=>{})}
 }
 const security={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 return async(request:Request)=>{
  const url=new URL(request.url),origin=request.headers.get('origin')||'',allowed=config.origins.includes(origin);
  const headers={...security,...(allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  const json=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json',...(status===429?{'Retry-After':'60'}:{})}});
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
  if(request.method==='GET'&&url.pathname.endsWith('/callback')){
   let state:any,canRedirect=false;
   const redirect=(result:string)=>{const target=new URL(state.return_url);target.searchParams.set('calendar_connection',result);return new Response(null,{status:303,headers:{...security,Location:target.href}})};
   try{
    const nonce=url.searchParams.get('state');if(!configured||!nonce||nonce.length>128)return json(400,{error:'INVALID_STATE'});
    state=await rpc(null,'consume',null,{hash:await digest(nonce)});
    if(!state?.user_id||!config.origins.includes(new URL(state.return_url).origin))return json(400,{error:'INVALID_STATE'});
    canRedirect=true;
    if(url.searchParams.has('error'))return redirect('cancelled');
    const code=url.searchParams.get('code');if(!code||code.length>8192)return redirect('failed');
    const verifier=await unseal(state.verifier_cipher,config.encryptionKey,context(state.user_id,'pkce'));
    const data=await token({grant_type:'authorization_code',code,redirect_uri:config.redirectUri,code_verifier:verifier});
    if(typeof data.refresh_token!=='string')throw Error('REAUTH_REQUIRED');
    const [me,sources]=await Promise.all([graphJSON('/me?$select=id,displayName,mail,userPrincipalName',data.access_token),calendars(data.access_token)]);
    if(!me.id)throw Error('PROVIDER_ERROR');
    await rpc(state.user_id,'complete',null,{account_key:me.id,label:me.mail||me.userPrincipalName||me.displayName||'Outlook',...await encrypted(state.user_id,data,''),calendars:sources});
    return redirect('connected');
   }catch{return canRedirect?redirect('failed'):json(400,{error:'INVALID_STATE'})}
  }
  if(request.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
  if(origin&&!allowed)return json(403,{error:'ORIGIN_DENIED'});
  try{
   const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
   const uid=bearer&&bearer.length<8192?await deps.authenticate(bearer):null;if(!uid)return json(401,{error:'AUTH_REQUIRED'});
   const reader=request.body?.getReader();let raw='',size=0;
   if(reader)try{const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();return json(413,{error:'INVALID_REQUEST'})}raw+=decoder.decode(part.value,{stream:true})}raw+=decoder.decode()}finally{reader.releaseLock()}
   let body:any;try{body=JSON.parse(raw)}catch{return json(400,{error:'INVALID_REQUEST'})}
   if(!body||typeof body!=='object'||Array.isArray(body))return json(400,{error:'INVALID_REQUEST'});
   const action=body.action;
   if(!['list','connect','select','disconnect','sync','events'].includes(action))return json(400,{error:'INVALID_REQUEST'});
   if(!await rpc(uid,'budget',null,{action}))return json(429,{error:'RATE_LIMITED'});
   if(action==='list')return json(200,{...await rpc(uid,'list'),configured});
   if(action==='connect'){
    if(!configured)return json(503,{error:'SETUP_REQUIRED'});
    const target=new URL(body.return_url);if(!config.origins.includes(target.origin))return json(400,{error:'INVALID_RETURN'});
    const nonce=random(),verifier=random();
    await rpc(uid,'begin',null,{hash:await digest(nonce),verifier:await seal(verifier,config.encryptionKey,context(uid,'pkce')),return_url:target.origin+'/'});
    const query=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:config.redirectUri,response_mode:'query',scope:scopes,state:nonce,code_challenge:await digest(verifier),code_challenge_method:'S256',prompt:'select_account'});
    return json(200,{url:authority+'/authorize?'+query});
   }
   if(action==='select'){
    if(!Array.isArray(body.ids)||body.ids.length>10||!body.ids.every((id:unknown)=>typeof id==='string'&&uuid.test(id)))return json(400,{error:'INVALID_REQUEST'});
    await rpc(uid,'select',null,{ids:[...new Set(body.ids)]});return json(200,await rpc(uid,'list'));
   }
   if(action==='disconnect'){
    if(!uuid.test(body.id))return json(400,{error:'INVALID_REQUEST'});await rpc(uid,'disconnect',body.id);return json(200,await rpc(uid,'list'));
   }
   if(!configured)return json(503,{error:'SETUP_REQUIRED'});
   if(action==='sync'){
    if(!uuid.test(body.id))return json(400,{error:'INVALID_REQUEST'});
    try{await rpc(uid,'sync',body.id,{calendars:await calendars(await access(uid,body.id))})}catch(error){if((error as Error).message==='REAUTH_REQUIRED')await rpc(uid,'reauth',body.id);throw error}
    return json(200,await rpc(uid,'list'));
   }
   const start=new Date(body.start),end=new Date(body.end);
   if(typeof body.start!=='string'||typeof body.end!=='string'||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>63*86400000)return json(400,{error:'INVALID_RANGE'});
   const list=await rpc(uid,'list'),events:any[]=[],issues:string[]=[];
   for(const connection of list.connections){
    const selected=await rpc(uid,'sources',connection.id);if(!selected.length)continue;
    try{
     const bearer=await access(uid,connection.id);
     for(const source of selected){
      const query=new URLSearchParams({startDateTime:start.toISOString(),endDateTime:end.toISOString(),'$select':'id,subject,start,end,isAllDay,isCancelled,sensitivity,location,webLink,showAs','$top':'250'});
      const rows=await pages(`/me/calendars/${encodeURIComponent(source.remote_id)}/calendarView?${query}`,bearer,2000);
      for(const item of rows){if(item.isCancelled)continue;if(events.length>=2000)throw Error('TOO_MANY_EVENTS');const privateEvent=item.sensitivity==='private'||item.sensitivity==='confidential';
       events.push({id:`outlook:${source.id}:${item.id}`,source_id:source.id,calendar_name:source.name,color:source.color,title:privateEvent?'':String(item.subject||'').slice(0,500),private:privateEvent,start:graphDate(item.start,item.isAllDay),end:graphDate(item.end,item.isAllDay),allDay:item.isAllDay===true,location:privateEvent?'':String(item.location?.displayName||'').slice(0,300),url:privateEvent?null:safeEventUrl(item.webLink)});
      }
     }
    }catch(error){const message=(error as Error).message;if(message==='REAUTH_REQUIRED')await rpc(uid,'reauth',connection.id);issues.push(['REAUTH_REQUIRED','TOO_MANY_EVENTS','RATE_LIMITED','BUSY'].includes(message)?message:'PROVIDER_ERROR')}
   }
   return json(200,{events,issues:[...new Set(issues)]});
  }catch(error){
   const message=(error as Error).message;
   const safe=['AUTH_REQUIRED','RATE_LIMITED','SETUP_REQUIRED','REAUTH_REQUIRED','BUSY','TOO_MANY_EVENTS','PROVIDER_ERROR'];
   return json(message==='RATE_LIMITED'?429:message==='AUTH_REQUIRED'?401:message==='REAUTH_REQUIRED'?409:message==='BUSY'?409:message==='CALENDAR_ACCESS_DENIED'?403:message==='CALENDAR_SELECTION_INVALID'?400:500,{error:safe.includes(message)?message:message==='CALENDAR_SELECTION_INVALID'?'INVALID_REQUEST':message==='CALENDAR_ACCESS_DENIED'?'ACCESS_DENIED':'UNAVAILABLE'});
  }
 };
}
