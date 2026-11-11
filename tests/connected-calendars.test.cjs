const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),vue=require('vue')
const exports_={};vm.compileFunction(ts.transpileModule(fs.readFileSync('src/features/tasks/lib/connectedCalendars.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require','URL'])(exports_,name=>name==='vue'?vue:require(name),URL)
const {createConnectedCalendars,calendarReturn,calendarAuthorizationUrl,calendarProvider,calendarProviderName}=exports_,copy=value=>JSON.parse(JSON.stringify(value))
const meta=(selected=true)=>({configured:true,connections:[{id:'account',provider:'outlook',label:'Personal',status:'connected',calendars:[{id:'calendar',name:'Work',color:'#64748B',selected}]}]})
test('calendar range changes discard late responses and identical range loads share one request',async()=>{
 const pending=[],calls=[];let active=true
 const controller=createConnectedCalendars(async body=>{calls.push(body);if(body.action==='list')return meta();return new Promise(resolve=>pending.push(resolve))},()=>active)
 await controller.load();const first=controller.loadEvents('2026-11-01','2026-11-08'),same=controller.loadEvents('2026-11-01','2026-11-08');assert.equal(pending.length,1)
 const second=controller.loadEvents('2026-11-08','2026-11-15');pending[1]({events:[{id:'new'}],issues:[]});await second;pending[0]({events:[{id:'old'}],issues:[]});await Promise.all([first,same]);assert.deepEqual(copy(controller.events.value),[{id:'new'}])
 active=false;controller.suspend();await controller.loadEvents('2026-12-01','2026-12-08');assert.equal(pending.length,2);assert.equal(controller.events.value.length,0)
})
test('calendar preferences remain consistent if the visible date changes while saving',async()=>{
 let saving;const calls=[],controller=createConnectedCalendars(async body=>{calls.push(body);if(body.action==='list')return meta();if(body.action==='select')return new Promise(resolve=>saving=resolve);return {events:[{id:body.start}],issues:[]}},()=>true)
 await controller.load();await controller.loadEvents('2026-11-01','2026-11-08');assert.equal(controller.events.value.length,1)
 const pending=controller.mutate('select',{ids:[]});assert.equal(controller.events.value.length,0)
 await controller.loadEvents('2026-11-08','2026-11-15');saving(meta(false));await pending
 assert.equal(controller.selected.value.length,0);assert.equal(controller.events.value.length,0);assert.equal(controller.busy.value,false)
 controller.reset();assert.equal(controller.connections.value.length,0);assert.equal(controller.configured.value,false)
})
test('an old account response cannot repopulate calendars after reset and provider failures are retryable',async()=>{
 let resolve,active=true,fail=false
 const controller=createConnectedCalendars(async body=>{if(body.action==='list')return new Promise(done=>resolve=done);if(fail)throw Error('REAUTH_REQUIRED');return {events:[],issues:[]}},()=>active)
 const pending=controller.load();active=false;controller.reset();resolve(meta());await pending;assert.equal(controller.connections.value.length,0)
 active=true;const reloaded=controller.load();resolve(meta());await reloaded;fail=true;await controller.loadEvents('2026-11-01','2026-11-08');assert.equal(controller.eventError.value,'REAUTH_REQUIRED');fail=false;await controller.loadEvents('2026-11-01','2026-11-08');assert.equal(controller.eventError.value,'')
 assert.equal(calendarReturn('https://app.test/?calendar_connection=connected'),'connected');assert.equal(calendarReturn('https://app.test/?calendar_connection=javascript:alert(1)'),null)
})


test('suspended calendar metadata and range refreshes do not make requests or revive cleared events',async()=>{
 let active=true,calls=0
 const controller=createConnectedCalendars(async()=>{calls++;return {configured:true,connections:[]}},()=>active)
 await controller.load();assert.equal(calls,1)
 active=false;controller.suspend();await controller.load();await controller.loadEvents('2026-11-01','2026-11-08',true)
 assert.equal(calls,1);assert.equal(controller.events.value.length,0);assert.equal(controller.loading.value,false)
 active=true;await controller.load();assert.equal(calls,2)
})

test('provider readiness is independent and legacy Outlook responses cannot enable Google accidentally',async()=>{
 let data=meta();const controller=createConnectedCalendars(async()=>data,()=>true)
 await controller.load();assert.deepEqual(copy(controller.providers.value),{outlook:true,google:false})
 data={...meta(),providers:{outlook:false,google:true}};await controller.load();assert.deepEqual(copy(controller.providers.value),{outlook:false,google:true});assert.equal(controller.configured.value,true)
 data={connections:[]};await controller.mutate('select',{ids:[]});assert.equal(controller.providers.value.google,true,'a mutation without readiness metadata must not reset the provider flags')
 controller.reset();assert.deepEqual(copy(controller.providers.value),{outlook:false,google:false})
})

test('authorization redirects must match the chosen provider and calendar sources keep the correct label',()=>{
 assert.ok(calendarAuthorizationUrl('https://accounts.google.com/o/oauth2/v2/auth?state=one','google'))
 assert.ok(calendarAuthorizationUrl('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=one','outlook'))
 for(const value of ['https://accounts.google.com.evil.test/o/oauth2/v2/auth','https://accounts.google.com/other','https://user:secret@accounts.google.com/o/oauth2/v2/auth','javascript:alert(1)','https://login.microsoftonline.com/common/oauth2/v2.0/authorize'])assert.throws(()=>calendarAuthorizationUrl(value,'google'))
 assert.throws(()=>calendarAuthorizationUrl('https://accounts.google.com/o/oauth2/v2/auth','outlook'))
 assert.equal(calendarProvider({id:'google:one'}),'google');assert.equal(calendarProvider({id:'legacy'}),'outlook');assert.equal(calendarProviderName('google'),'Google Calendar')
})
