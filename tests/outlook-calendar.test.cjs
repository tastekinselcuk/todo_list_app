const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const exports_={};vm.compileFunction(ts.transpileModule(fs.readFileSync('supabase/functions/outlook-calendar/handler.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['exports','crypto','fetch','Request','Response','URL','URLSearchParams','TextEncoder','TextDecoder','AbortSignal','btoa','atob','setTimeout'])(exports_,crypto,fetch,Request,Response,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,btoa,atob,setTimeout)
const {outlookCalendarHandler,seal,unseal,digest}=exports_,uid='10000000-0000-4000-8000-000000000001',cid='30000000-0000-4000-8000-000000000003',sid='40000000-0000-4000-8000-000000000004'
function fixture(){
 const config={clientId:'client',clientSecret:'secret',redirectUri:'https://project.supabase.co/functions/v1/outlook-calendar/callback',encryptionKey:Buffer.alloc(32,7).toString('base64'),origins:['https://app.test']},calls=[],states=new Map(),completed=[]
 let rows=[],budget=true,fetcher=async(url,init)=>{const path=new URL(url).pathname;if(path.endsWith('/token'))return Response.json({access_token:'access',refresh_token:'refresh',expires_in:3600});if(path.endsWith('/me'))return Response.json({id:'account',mail:'user@test.invalid'});if(path.endsWith('/calendars'))return Response.json({value:[{id:'remote/id',name:'Work',hexColor:'#3388FF',isDefaultCalendar:true}]});return Response.json({value:rows})}
 let stored
 const rpc=async(user,op,id,payload={})=>{calls.push([user,op,id,payload]);if(op==='budget')return budget;if(op==='begin'){states.set(payload.hash,{user_id:user,verifier_cipher:payload.verifier,return_url:payload.return_url});return true}if(op==='consume'){const s=states.get(payload.hash);states.delete(payload.hash);return s||null}if(op==='complete'){completed.push(payload);stored={access_cipher:payload.access,refresh_cipher:payload.refresh,expires_at:payload.expires_at,version:1,status:'connected'};return {id:cid}}if(op==='tokens')return stored;if(op==='list')return {connections:stored?[{id:cid,label:'Account',status:'connected',calendars:[{id:sid,selected:true}]}]:[]};if(op==='sources')return [{id:sid,remote_id:'remote/id',name:'Work',color:'#3388FF'}];if(op==='lock')return true;if(op==='refreshed'){stored={...stored,access_cipher:payload.access,refresh_cipher:payload.refresh,expires_at:payload.expires_at,version:stored.version+1};return true}return true}
 const handler=outlookCalendarHandler({config,rpc,authenticate:async token=>token==='valid'?uid:null,fetch:(...args)=>fetcher(...args)})
 const post=(body,auth='valid',origin='https://app.test')=>handler(new Request('https://project.supabase.co/functions/v1/outlook-calendar',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)}))
 async function connect(){const result=await(await post({action:'connect',return_url:'https://app.test/ignored?token=no'})).json();const url=new URL(result.url);const callback=new URL(config.redirectUri);callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','authorization-code');return {url,response:await handler(new Request(callback))}}
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
