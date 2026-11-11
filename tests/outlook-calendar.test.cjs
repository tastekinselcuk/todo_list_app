const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const exports_={};vm.compileFunction(ts.transpileModule(fs.readFileSync('supabase/functions/outlook-calendar/handler.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['exports','crypto','fetch','Request','Response','URL','URLSearchParams','TextEncoder','TextDecoder','AbortSignal','btoa','atob','setTimeout'])(exports_,crypto,fetch,Request,Response,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,btoa,atob,setTimeout)
const {outlookCalendarHandler,seal,unseal,digest}=exports_,uid='10000000-0000-4000-8000-000000000001',cid='30000000-0000-4000-8000-000000000003',sid='40000000-0000-4000-8000-000000000004'
function fixture(provider='outlook'){
 const config={clientId:'client',clientSecret:'secret',redirectUri:'https://project.supabase.co/functions/v1/outlook-calendar/callback',encryptionKey:Buffer.alloc(32,7).toString('base64'),origins:['https://app.test']},calls=[],states=new Map(),completed=[]
 let rows=[],budget=true,fetcher=async(url,init)=>{const path=new URL(url).pathname;if(path.endsWith('/token'))return Response.json({access_token:'access',refresh_token:'refresh',expires_in:3600});if(path.endsWith('/me'))return Response.json({id:'account',mail:'user@test.invalid'});if(path.endsWith('/calendars'))return Response.json({value:[{id:'remote/id',name:'Work',hexColor:'#3388FF',isDefaultCalendar:true}]});return Response.json({value:rows})}
 config.google={clientId:'google-client',clientSecret:'google-secret',redirectUri:'https://project.supabase.co/functions/v1/outlook-calendar/google/callback'}
 const graphFetcher=fetcher;fetcher=async(url,init)=>{const uri=new URL(url);if(uri.hostname==='oauth2.googleapis.com')return Response.json({access_token:'google-access',refresh_token:'google-refresh',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly'});if(uri.hostname==='openidconnect.googleapis.com')return Response.json({sub:'google-account',email:'google@example.test',email_verified:true});if(uri.pathname.endsWith('/calendarList'))return Response.json({items:[{id:'work@example.test',summary:'Google Work',primary:true,backgroundColor:'#4285F4'}]});if(uri.hostname==='www.googleapis.com')return Response.json({items:rows});return graphFetcher(url,init)}
 let stored
 const rpc=async(user,op,id,payload={})=>{calls.push([user,op,id,payload]);if(op==='budget')return budget;if(op==='begin'){states.set(payload.hash,{user_id:user,verifier_cipher:payload.verifier,return_url:payload.return_url,provider:payload.provider||'outlook'});return true}if(op==='consume'){const s=states.get(payload.hash);if(s?.provider!==(payload.provider||'outlook'))return null;states.delete(payload.hash);return s||null}if(op==='complete'){completed.push(payload);stored={access_cipher:payload.access,refresh_cipher:payload.refresh,expires_at:payload.expires_at,version:1,status:'connected',provider:payload.provider||'outlook'};return {id:cid}}if(op==='tokens')return stored;if(op==='list')return {connections:stored?[{id:cid,provider:stored.provider,label:'Account',status:'connected',calendars:[{id:sid,selected:true}]}]:[]};if(op==='sources')return [{id:sid,remote_id:'remote/id',name:'Work',color:'#3388FF'}];if(op==='lock')return true;if(op==='refreshed'){stored={...stored,access_cipher:payload.access,refresh_cipher:payload.refresh,expires_at:payload.expires_at,version:stored.version+1};return true}return true}
 const handler=outlookCalendarHandler({config,rpc,authenticate:async token=>token==='valid'?uid:null,fetch:(...args)=>fetcher(...args)})
 const post=(body,auth='valid',origin='https://app.test')=>handler(new Request('https://project.supabase.co/functions/v1/outlook-calendar',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)}))
 async function connect(){const result=await(await post({action:'connect',provider,return_url:'https://app.test/ignored?token=no'})).json();const url=new URL(result.url);const callback=new URL(provider==='google'?config.google.redirectUri:config.redirectUri);callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','authorization-code');return {url,response:await handler(new Request(callback))}}
 return {config,calls,states,completed,handler,post,connect,setRows:value=>rows=value,setBudget:value=>budget=value,setFetch:value=>fetcher=value,expire:()=>{stored.expires_at='2000-01-01'}}
}
test('Outlook OAuth uses read-only PKCE, encrypted server credentials and a one-time state',async()=>{
 const f=fixture(),{url,response}=await f.connect();assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('scope').includes('Calendars.ReadBasic'));assert.ok(!url.searchParams.get('scope').includes('Write'));assert.equal(url.searchParams.get('client_secret'),null)
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://app.test/?calendar_connection=connected');assert.equal(f.completed.length,1)
 const data=f.completed[0];assert.notEqual(data.access,'access');assert.equal(await unseal(data.access,f.config.encryptionKey,'outlook:'+uid+':access'),'access');assert.equal(await unseal(data.refresh,f.config.encryptionKey,'outlook:'+uid+':refresh'),'refresh')
 const begin=f.calls.find(call=>call[1]==='begin')[3],verifier=await unseal(begin.verifier,f.config.encryptionKey,'outlook:'+uid+':pkce');assert.equal(await digest(verifier),url.searchParams.get('code_challenge'))
 await assert.rejects(unseal(data.access,f.config.encryptionKey,'outlook:other:access'))
 const replay=new URL(f.config.redirectUri);replay.searchParams.set('state',url.searchParams.get('state'));replay.searchParams.set('code','authorization-code');assert.equal((await f.handler(new Request(replay))).status,400)
 const list=await(await f.post({action:'list'})).json();assert.equal(JSON.stringify(list).includes('refresh_cipher'),false)
})
test('calendar endpoint checks JWT, origin, redirect destinations, input bounds and budget before Graph calls',async()=>{
 const f=fixture();assert.equal((await f.post({action:'list'},'invalid')).status,401);assert.equal((await f.post({action:'list'},'valid','https://evil.test')).status,403)
 assert.equal((await f.post({action:'connect',return_url:'https://evil.test/'})).status,400);assert.equal((await f.post({action:'select',ids:['foreign']})).status,400)
 assert.equal((await f.post({action:'events',start:'2026-01-01',end:'2026-12-31'})).status,400)
 f.setBudget(false);assert.equal((await f.post({action:'list'})).status,429)
})
test('calendarView renders timed, all-day and recurring instances, omits cancellations and hides private titles',async()=>{
 const f=fixture();await f.connect();f.setRows([
  {id:'timed',subject:'Meeting',start:{dateTime:'2026-11-04T09:00:00.0000000'},end:{dateTime:'2026-11-04T10:00:00'},location:{displayName:'Office'},webLink:'https://outlook.office.com/calendar/item/one'},
  {id:'private',subject:'Sensitive title',sensitivity:'private',start:{dateTime:'2026-11-05T00:00:00'},end:{dateTime:'2026-11-06T00:00:00'},isAllDay:true,location:{displayName:'Secret'},webLink:'https://evil.test'},
  {id:'cancelled',isCancelled:true},
 ])
 const result=await(await f.post({action:'events',start:'2026-11-01T00:00:00Z',end:'2026-12-01T00:00:00Z'})).json();assert.equal(result.events.length,2);assert.equal(result.events[0].start,'2026-11-04T09:00:00.000Z');assert.equal(result.events[0].location,'Office');assert.equal(result.events[1].start,'2026-11-05');assert.equal(result.events[1].end,'2026-11-06');assert.equal(result.events[1].title,'');assert.equal(result.events[1].url,null);assert.equal(result.events[1].location,'')
 f.expire();await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'});assert.ok(f.calls.some(call=>call[1]==='refreshed'))
})
test('pagination cannot send provider tokens to another host and provider errors remain safe',async()=>{
 const f=fixture();await f.connect();let leaked=false;f.setFetch(async url=>{if(new URL(url).origin!=='https://graph.microsoft.com')leaked=true;return Response.json({value:[],'@odata.nextLink':'https://evil.test/stolen'})})
 const result=await(await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'})).json();assert.deepEqual(result.issues,['PROVIDER_ERROR']);assert.equal(leaked,false)
})

test('Google OAuth requests offline read-only access and binds encrypted credentials and state to Google',async()=>{
 const f=fixture('google'),{url,response}=await f.connect()
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.pathname,'/o/oauth2/v2/auth');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('client_secret'),null)
 const scopes=url.searchParams.get('scope').split(' ');assert.ok(scopes.includes('https://www.googleapis.com/auth/calendar.calendarlist.readonly'));assert.ok(scopes.includes('https://www.googleapis.com/auth/calendar.events.readonly'));assert.ok(!scopes.includes('https://www.googleapis.com/auth/calendar'))
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://app.test/?calendar_connection=connected')
 const data=f.completed[0];assert.equal(data.provider,'google');assert.equal(data.account_key,'google-account');assert.equal(data.label,'google@example.test');assert.equal(data.calendars[0].name,'Google Work')
 assert.equal(await unseal(data.refresh,f.config.encryptionKey,'google:'+uid+':refresh'),'google-refresh');await assert.rejects(unseal(data.refresh,f.config.encryptionKey,'outlook:'+uid+':refresh'))
 const result=await(await f.post({action:'list'})).json();assert.deepEqual(result.providers,{outlook:true,google:true});assert.equal(result.connections[0].provider,'google');assert.equal(JSON.stringify(result).includes('cipher'),false)
 const begin=await(await f.post({action:'connect',provider:'google',return_url:'https://app.test/'})).json(),nonce=new URL(begin.url).searchParams.get('state'),wrong=new URL(f.config.redirectUri);wrong.searchParams.set('state',nonce);wrong.searchParams.set('code','code')
 assert.equal((await f.handler(new Request(wrong))).status,400,'Outlook callback cannot consume a Google attempt');assert.equal(f.states.size,1)
 const correct=new URL(f.config.google.redirectUri);correct.searchParams.set('state',nonce);correct.searchParams.set('code','code');assert.equal((await f.handler(new Request(correct))).status,303);assert.equal(f.states.size,0)
 assert.equal((await f.post({action:'connect',provider:'other',return_url:'https://app.test/'})).status,400)
})

test('Google instances preserve offsets and all-day dates, hide private details and renew expired access',async()=>{
 const f=fixture('google');await f.connect();f.setRows([
  {id:'recurrence_20261104',summary:'Meeting',start:{dateTime:'2026-11-04T12:00:00+03:00'},end:{dateTime:'2026-11-04T13:00:00+03:00'},location:'Office',htmlLink:'https://www.google.com/calendar/event?eid=one'},
  {id:'day',summary:'Day off',start:{date:'2026-11-05'},end:{date:'2026-11-07'}},
  {id:'private',summary:'Secret',visibility:'private',start:{dateTime:'2026-11-06T09:00:00Z'},end:{dateTime:'2026-11-06T10:00:00Z'},location:'Secret room',htmlLink:'https://calendar.google.com/calendar/event?eid=secret'},
  {id:'cancelled',status:'cancelled'},
 ])
 const result=await(await f.post({action:'events',start:'2026-11-01T00:00:00Z',end:'2026-12-01T00:00:00Z'})).json()
 assert.equal(result.events.length,3);assert.equal(result.events[0].provider,'google');assert.equal(result.events[0].start,'2026-11-04T09:00:00.000Z');assert.equal(result.events[1].start,'2026-11-05');assert.equal(result.events[1].end,'2026-11-07');assert.equal(result.events[1].allDay,true)
 assert.equal(result.events[2].title,'');assert.equal(result.events[2].location,'');assert.equal(result.events[2].url,null)
 f.expire();await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'});assert.ok(f.calls.some(call=>call[1]==='refreshed'))
 const {safeEventUrl,googleDate}=exports_;assert.equal(safeEventUrl('https://evil.test/calendar/','google'),null);assert.equal(safeEventUrl('https://www.google.com/url?next=evil','google'),null);assert.equal(safeEventUrl('https://outlook.office.com/calendar/','google'),null);assert.throws(()=>googleDate({dateTime:'2026-11-04T10:00:00'}),/PROVIDER_ERROR/)
})

test('Google pagination is bounded, fetches recurring instances, handles empty results and quota responses safely',async()=>{
 const f=fixture('google');await f.connect();const requests=[]
 f.setFetch(async(url,init)=>{requests.push([url,init]);const query=new URL(url).searchParams;return Response.json(query.has('pageToken')?{items:[{id:'second',summary:'Second instance',start:{date:'2026-11-05'},end:{date:'2026-11-06'}}]}:{items:[],nextPageToken:'opaque-page'})})
 const result=await(await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'})).json();assert.equal(result.events.length,1);assert.equal(requests.length,2)
 for(const [url,init]of requests){const parsed=new URL(url);assert.equal(parsed.origin,'https://www.googleapis.com');assert.equal(parsed.searchParams.get('singleEvents'),'true');assert.equal(parsed.searchParams.get('timeZone'),'UTC');assert.equal(init.headers.Authorization,'Bearer google-access');assert.ok(!parsed.searchParams.get('fields').includes('description'))}
 f.setFetch(async()=>Response.json({}));assert.equal((await(await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'})).json()).events.length,0)
 f.setFetch(async()=>Response.json({error:{errors:[{reason:'rateLimitExceeded'}]}},{status:403}));assert.deepEqual((await(await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'})).json()).issues,['RATE_LIMITED'])
 f.setFetch(async()=>Response.json({error:{errors:[{reason:'accessNotConfigured'}]}},{status:403}));assert.deepEqual((await(await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'})).json()).issues,['SETUP_REQUIRED'])
 f.setFetch(async()=>Response.json({items:[],nextPageToken:'repeat'}));assert.deepEqual((await(await f.post({action:'events',start:'2026-11-01',end:'2026-11-08'})).json()).issues,['TOO_MANY_EVENTS'])
})

test('a declined Google scope or missing refresh credential does not create a partial connection',async()=>{
 for(const missing of ['scope','refresh_token']){
  const f=fixture('google');f.setFetch(async()=>Response.json({access_token:'access',expires_in:3600,...(missing==='scope'?{refresh_token:'refresh'}:{scope:'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly'})}))
  const {response}=await f.connect();assert.equal(response.headers.get('location'),'https://app.test/?calendar_connection=failed');assert.equal(f.completed.length,0)
 }
})

test('an unconfigured Google connection cannot block Outlook events or send credentials to Google',async()=>{
 const config={clientId:'outlook-client',clientSecret:'secret',redirectUri:'https://project.supabase.co/functions/v1/outlook-calendar/callback',encryptionKey:Buffer.alloc(32,7).toString('base64'),origins:['https://app.test']}
 const encrypted=await seal('outlook-access',config.encryptionKey,'outlook:'+uid+':access'),googleId='50000000-0000-4000-8000-000000000005',calls=[]
 const handler=outlookCalendarHandler({config,authenticate:async()=>uid,async rpc(_user,op,id){if(op==='budget')return true;if(op==='list')return {connections:[{id:cid,provider:'outlook'},{id:googleId,provider:'google'}]};if(op==='tokens')return {provider:'outlook',access_cipher:encrypted,expires_at:'2099-01-01',status:'connected'};if(op==='sources')return [{id:sid,remote_id:'remote',name:'Work',color:'#3388FF'}];throw Error('unexpected operation')},async fetch(url,init){calls.push([url,init]);assert.equal(new URL(url).origin,'https://graph.microsoft.com');return Response.json({value:[{id:'one',subject:'Outlook meeting',start:{dateTime:'2026-11-04T09:00:00'},end:{dateTime:'2026-11-04T10:00:00'}}]})}})
 const post=body=>handler(new Request('https://project.supabase.co/functions/v1/outlook-calendar',{method:'POST',headers:{origin:'https://app.test',authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify(body)}))
 const result=await(await post({action:'events',start:'2026-11-01',end:'2026-11-08'})).json();assert.equal(result.events.length,1);assert.equal(result.events[0].provider,'outlook');assert.deepEqual(result.issues,['SETUP_REQUIRED']);assert.equal(calls.length,1)
 const list=await(await post({action:'list'})).json();assert.deepEqual(list.providers,{outlook:true,google:false});assert.equal((await post({action:'connect',provider:'google',return_url:'https://app.test/'})).status,503)
})

test('Supabase callback routes accept the gateway-stripped path while rejecting other functions and preserving state checks',async()=>{
 for(const provider of ['google','outlook']){
  const f=fixture(provider),begin=await(await f.post({action:'connect',provider,return_url:'https://app.test/'})).json()
  const configured=new URL(provider==='google'?f.config.google.redirectUri:f.config.redirectUri),state=new URL(begin.url).searchParams.get('state')
  const callback=new URL(configured);callback.searchParams.set('state',state);callback.searchParams.set('code','code');callback.pathname=callback.pathname.replace('/functions/v1','')
  const wrong=new URL(callback);wrong.pathname='/other'+callback.pathname
  assert.equal((await f.handler(new Request(wrong))).status,400);assert.equal(f.states.size,1,'a mismatched route must not consume the valid attempt')
  const result=await f.handler(new Request(callback));assert.equal(result.status,303);assert.equal(result.headers.get('location'),'https://app.test/?calendar_connection=connected')
  assert.equal((await f.handler(new Request(callback))).status,400,'stripping the gateway prefix must not weaken replay protection')
 }
})
