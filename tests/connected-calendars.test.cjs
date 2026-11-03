const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),vue=require('vue')
const exports_={};vm.compileFunction(ts.transpileModule(fs.readFileSync('src/features/tasks/lib/connectedCalendars.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require','URL'])(exports_,name=>name==='vue'?vue:require(name),URL)
const {createConnectedCalendars,calendarReturn}=exports_,copy=value=>JSON.parse(JSON.stringify(value))
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
