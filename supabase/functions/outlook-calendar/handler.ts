type Provider='outlook'|'google';
interface OAuthClient {clientId:string;clientSecret:string;redirectUri:string}
export interface OutlookConfig extends OAuthClient { encryptionKey:string; origins:string[]; google?:OAuthClient }
export interface CalendarDependencies {
 config:OutlookConfig; authenticate(token:string):Promise<string|null>;
 rpc(user:string|null,operation:string,id?:string|null,payload?:Record<string,unknown>):Promise<any>;
 fetch:typeof fetch; now?:()=>number;
}
const graph='https://graph.microsoft.com/v1.0',authority='https://login.microsoftonline.com/common/oauth2/v2.0';
// ReadBasic omits bodies, attachments and extensions. These aren't needed for an overlay.
const scopes='offline_access User.Read Calendars.ReadBasic';
const googleScopes=['https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly'];
const googleBase='https://www.googleapis.com/calendar/v3';
export function googleDate(value:any,allDay=false):string {
 if(allDay){if(typeof value?.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.date))throw Error('PROVIDER_ERROR');return value.date}
 // Google returns explicit offsets for timed instances. Never assume the server's timezone.
 if(typeof value?.dateTime!=='string'||!/Z$|[+-]\d{2}:\d{2}$/.test(value.dateTime))throw Error('PROVIDER_ERROR');
 const date=new Date(value.dateTime);if(!Number.isFinite(date.getTime()))throw Error('PROVIDER_ERROR');return date.toISOString();
}
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
export function safeEventUrl(value:unknown,provider:Provider='outlook'){
 try{const url=new URL(String(value));const hosts=provider==='google'?['calendar.google.com','www.google.com']:['outlook.live.com','outlook.office.com','outlook.office365.com'];return url.protocol==='https:'&&!url.username&&!url.password&&hosts.includes(url.hostname)&&(provider!=='google'||url.pathname.startsWith('/calendar/'))?url.href:null}catch{return null}
}
function nextGraph(value:string){const url=new URL(value);if(url.origin!=='https://graph.microsoft.com'||url.username||url.password||!url.pathname.startsWith('/v1.0/'))throw Error('PROVIDER_ERROR');return url.href}
// The Supabase relay removes /functions/v1 before forwarding the request.
// Compare canonical paths, retaining the exact function and provider route.
const callbackPath=(pathname:string)=>pathname.replace(/^\/functions\/v1(?=\/)/,'');
export function outlookCalendarHandler(deps:CalendarDependencies){
 const {config,rpc}=deps,now=deps.now||Date.now;
 const client=(provider:Provider):OAuthClient=>provider==='google'?(config.google||{clientId:'',clientSecret:'',redirectUri:''}):config;
 const ready=(provider:Provider)=>{try{const c=client(provider);return Boolean(c.clientId&&c.clientSecret&&new URL(c.redirectUri).protocol==='https:'&&atob(config.encryptionKey).length===32&&config.origins.length)}catch{return false}};
 const providers={outlook:ready('outlook'),google:ready('google')},configured=providers.outlook||providers.google;
 const context=(uid:string,kind:string,provider:Provider='outlook')=>`${provider}:${uid}:${kind}`;
 async function requestJSON(url:string,options:RequestInit={}){
  const response=await deps.fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.status===429)throw Error('RATE_LIMITED');
  const data=await response.json().catch(()=>({}));
  if(response.status===403&&data.error?.errors?.some((error:any)=>['rateLimitExceeded','userRateLimitExceeded','quotaExceeded'].includes(error.reason)))throw Error('RATE_LIMITED');
  if(response.status===403&&(data.error?.errors?.some((error:any)=>error.reason==='accessNotConfigured')||data.error?.details?.some((detail:any)=>detail.reason==='SERVICE_DISABLED')))throw Error('SETUP_REQUIRED');
  if(!response.ok)throw Error(data.error==='invalid_grant'||response.status===401||response.status===403?'REAUTH_REQUIRED':'PROVIDER_ERROR');
  return data;
 }
 async function token(form:Record<string,string>,provider:Provider='outlook'){
  const c=client(provider);
  const data=await requestJSON(provider==='google'?'https://oauth2.googleapis.com/token':authority+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,...(provider==='outlook'?{scope:scopes}:{}),...form})});
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
 async function googlePages(path:string,access:string,limit:number){
  // Only opaque page tokens are accepted; the provider cannot redirect credentials to another URL.
  const items:any[]=[];let page='';
  for(let index=0;index<10;index++){
   const url=new URL(googleBase+path);if(page)url.searchParams.set('pageToken',page);
   const data=await requestJSON(url.href,{headers:{Authorization:`Bearer ${access}`}});
   if(data.items!==undefined&&!Array.isArray(data.items))throw Error('PROVIDER_ERROR');items.push(...(data.items||[]));
   if(items.length>limit)throw Error('TOO_MANY_EVENTS');if(!data.nextPageToken)return items;
   if(typeof data.nextPageToken!=='string'||data.nextPageToken.length>4096)throw Error('PROVIDER_ERROR');page=data.nextPageToken;
  }throw Error('TOO_MANY_EVENTS');
 }
 async function calendars(access:string,provider:Provider='outlook'){
  if(provider==='google'){
   const query=new URLSearchParams({maxResults:'100',minAccessRole:'reader',showDeleted:'false',fields:'nextPageToken,items(id,summary,summaryOverride,backgroundColor,primary,deleted)'});
   const items=await googlePages('/users/me/calendarList?'+query,access,100);
   return items.filter(item=>!item.deleted&&typeof item.id==='string').map(item=>({id:item.id,name:String(item.summaryOverride||item.summary||'Google Calendar').slice(0,150),color:/^#[0-9a-f]{6}$/i.test(item.backgroundColor)?item.backgroundColor:'#4285F4',default:item.primary===true}));
  }
  const items=await pages('/me/calendars?$select=id,name,hexColor,isDefaultCalendar&$top=100',access,100);
  return items.map((item:any)=>({id:String(item.id),name:String(item.name||'Outlook').slice(0,150),color:/^#[0-9a-f]{6}$/i.test(item.hexColor)?item.hexColor:'#64748B',default:item.isDefaultCalendar===true}));
 }
 async function encrypted(uid:string,data:any,refresh:string,provider:Provider='outlook'){return {access:await seal(data.access_token,config.encryptionKey,context(uid,'access',provider)),refresh:await seal(data.refresh_token||refresh,config.encryptionKey,context(uid,'refresh',provider)),expires_at:new Date(now()+Number(data.expires_in)*1000).toISOString()}}
 async function access(uid:string,id:string,provider:Provider='outlook'){
  if(!providers[provider])throw Error('SETUP_REQUIRED');
  let stored=await rpc(uid,'tokens',id);if(!stored||stored.status==='reauth')throw Error('REAUTH_REQUIRED');
  if((stored.provider||'outlook')!==provider)throw Error('CALENDAR_ACCESS_DENIED');
  if(new Date(stored.expires_at).getTime()>now()+60000)return unseal(stored.access_cipher,config.encryptionKey,context(uid,'access',provider));
  if(!await rpc(uid,'lock',id,{version:stored.version})){
   // Another isolate owns the refresh; never race two refresh-token writes.
   for(let i=0;i<4;i++){await new Promise(resolve=>setTimeout(resolve,200));stored=await rpc(uid,'tokens',id);if(stored&&new Date(stored.expires_at).getTime()>now()+60000)return unseal(stored.access_cipher,config.encryptionKey,context(uid,'access',provider))}
   throw Error('BUSY');
  }
  try{
   const refresh=await unseal(stored.refresh_cipher,config.encryptionKey,context(uid,'refresh',provider));
   const data=await token({grant_type:'refresh_token',refresh_token:refresh},provider);
   if(!await rpc(uid,'refreshed',id,{...await encrypted(uid,data,refresh,provider),version:stored.version}))throw Error('BUSY');return data.access_token;
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
   const provider:Provider=url.pathname.endsWith('/google/callback')?'google':'outlook';
   let state:any,canRedirect=false;
   const redirect=(result:string)=>{const target=new URL(state.return_url);target.searchParams.set('calendar_connection',result);return new Response(null,{status:303,headers:{...security,Location:target.href}})};
   try{
    const nonce=url.searchParams.get('state');if(!providers[provider]||callbackPath(url.pathname)!==callbackPath(new URL(client(provider).redirectUri).pathname)||!nonce||nonce.length>128)return json(400,{error:'INVALID_STATE'});
    state=await rpc(null,'consume',null,{hash:await digest(nonce),provider});
    if(!state?.user_id||(state.provider||'outlook')!==provider||!config.origins.includes(new URL(state.return_url).origin))return json(400,{error:'INVALID_STATE'});
    canRedirect=true;
    if(url.searchParams.has('error'))return redirect('cancelled');
    const code=url.searchParams.get('code');if(!code||code.length>8192)return redirect('failed');
    const verifier=await unseal(state.verifier_cipher,config.encryptionKey,context(state.user_id,'pkce',provider));
    const data=await token({grant_type:'authorization_code',code,redirect_uri:client(provider).redirectUri,code_verifier:verifier},provider);
    if(typeof data.refresh_token!=='string')throw Error('REAUTH_REQUIRED');
    if(provider==='google'&&(!data.scope||!googleScopes.every(scope=>String(data.scope).split(' ').includes(scope))))throw Error('REAUTH_REQUIRED');
    const [me,sources]=await Promise.all([provider==='google'?requestJSON('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${data.access_token}`}}):graphJSON('/me?$select=id,displayName,mail,userPrincipalName',data.access_token),calendars(data.access_token,provider)]);
    const account=provider==='google'?me.sub:me.id;if(typeof account!=='string'||!account)throw Error('PROVIDER_ERROR');
    const label=provider==='google'?(me.email_verified===true&&me.email||me.name||'Google Calendar'):(me.mail||me.userPrincipalName||me.displayName||'Outlook');
    await rpc(state.user_id,'complete',null,{provider,account_key:account,label,...await encrypted(state.user_id,data,'',provider),calendars:sources});
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
   if(action==='list')return json(200,{...await rpc(uid,'list'),configured,providers});
   if(action==='connect'){
    const provider:Provider=body.provider??'outlook';if(!['outlook','google'].includes(provider))return json(400,{error:'INVALID_REQUEST'});
    if(!providers[provider])return json(503,{error:'SETUP_REQUIRED'});
    const target=new URL(body.return_url);if(!config.origins.includes(target.origin))return json(400,{error:'INVALID_RETURN'});
    const nonce=random(),verifier=random();
    await rpc(uid,'begin',null,{provider,hash:await digest(nonce),verifier:await seal(verifier,config.encryptionKey,context(uid,'pkce',provider)),return_url:target.origin+'/'});
    const c=client(provider),query=new URLSearchParams({client_id:c.clientId,response_type:'code',redirect_uri:c.redirectUri,...(provider==='outlook'?{response_mode:'query'}:{}),scope:provider==='google'?'openid email '+googleScopes.join(' '):scopes,state:nonce,code_challenge:await digest(verifier),code_challenge_method:'S256',prompt:provider==='google'?'consent select_account':'select_account',...(provider==='google'?{access_type:'offline'}:{})});
    return json(200,{url:(provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':authority+'/authorize')+'?'+query});
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
    const list=await rpc(uid,'list'),connection=list.connections.find((row:any)=>row.id===body.id);if(!connection)throw Error('CALENDAR_ACCESS_DENIED');
    const provider:Provider=connection.provider||'outlook';if(!['outlook','google'].includes(provider))throw Error('PROVIDER_ERROR');
    try{await rpc(uid,'sync',body.id,{calendars:await calendars(await access(uid,body.id,provider),provider)})}catch(error){if((error as Error).message==='REAUTH_REQUIRED')await rpc(uid,'reauth',body.id);throw error}
    return json(200,await rpc(uid,'list'));
   }
   const start=new Date(body.start),end=new Date(body.end);
   if(typeof body.start!=='string'||typeof body.end!=='string'||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>63*86400000)return json(400,{error:'INVALID_RANGE'});
   const list=await rpc(uid,'list'),events:any[]=[],issues:string[]=[];
   for(const connection of list.connections){
    const selected=await rpc(uid,'sources',connection.id);if(!selected.length)continue;
    try{
     const provider:Provider=connection.provider||'outlook';if(!['outlook','google'].includes(provider))throw Error('PROVIDER_ERROR');
     const bearer=await access(uid,connection.id,provider);
     for(const source of selected){
      if(provider==='google'){
       const query=new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',showDeleted:'false',timeZone:'UTC',maxResults:'250',fields:'nextPageToken,items(id,status,summary,start,end,visibility,location,htmlLink)'});
       const rows=await googlePages(`/calendars/${encodeURIComponent(source.remote_id)}/events?${query}`,bearer,2000);
       for(const item of rows){if(item.status==='cancelled')continue;if(events.length>=2000)throw Error('TOO_MANY_EVENTS');const privateEvent=item.visibility==='private'||item.visibility==='confidential',allDay=typeof item.start?.date==='string';
        events.push({id:`google:${source.id}:${item.id}`,provider,source_id:source.id,calendar_name:source.name,color:source.color,title:privateEvent?'':String(item.summary||'').slice(0,500),private:privateEvent,start:googleDate(item.start,allDay),end:googleDate(item.end,allDay),allDay,location:privateEvent?'':String(item.location||'').slice(0,300),url:privateEvent?null:safeEventUrl(item.htmlLink,provider)});
       }continue;
      }
      const query=new URLSearchParams({startDateTime:start.toISOString(),endDateTime:end.toISOString(),'$select':'id,subject,start,end,isAllDay,isCancelled,sensitivity,location,webLink,showAs','$top':'250'});
      const rows=await pages(`/me/calendars/${encodeURIComponent(source.remote_id)}/calendarView?${query}`,bearer,2000);
      for(const item of rows){if(item.isCancelled)continue;if(events.length>=2000)throw Error('TOO_MANY_EVENTS');const privateEvent=item.sensitivity==='private'||item.sensitivity==='confidential';
       events.push({id:`outlook:${source.id}:${item.id}`,provider,source_id:source.id,calendar_name:source.name,color:source.color,title:privateEvent?'':String(item.subject||'').slice(0,500),private:privateEvent,start:graphDate(item.start,item.isAllDay),end:graphDate(item.end,item.isAllDay),allDay:item.isAllDay===true,location:privateEvent?'':String(item.location?.displayName||'').slice(0,300),url:privateEvent?null:safeEventUrl(item.webLink)});
      }
     }
    }catch(error){const message=(error as Error).message;if(message==='REAUTH_REQUIRED')await rpc(uid,'reauth',connection.id);issues.push(['REAUTH_REQUIRED','TOO_MANY_EVENTS','RATE_LIMITED','BUSY','SETUP_REQUIRED'].includes(message)?message:'PROVIDER_ERROR')}
   }
   return json(200,{events,issues:[...new Set(issues)]});
  }catch(error){
   const message=(error as Error).message;
   const safe=['AUTH_REQUIRED','RATE_LIMITED','SETUP_REQUIRED','REAUTH_REQUIRED','BUSY','TOO_MANY_EVENTS','PROVIDER_ERROR'];
   return json(message==='RATE_LIMITED'?429:message==='AUTH_REQUIRED'?401:message==='REAUTH_REQUIRED'?409:message==='BUSY'?409:message==='CALENDAR_ACCESS_DENIED'?403:message==='CALENDAR_SELECTION_INVALID'?400:500,{error:safe.includes(message)?message:message==='CALENDAR_SELECTION_INVALID'?'INVALID_REQUEST':message==='CALENDAR_ACCESS_DENIED'?'ACCESS_DENIED':'UNAVAILABLE'});
  }
 };
}
