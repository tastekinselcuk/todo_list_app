const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue'),runtime=require('@vue/runtime-dom'),{JSDOM}=require('jsdom'),{parse,compileScript}=require('@vue/compiler-sfc')
function load(source,deps={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>deps[name]||require(name),console,Date,...globals});return exports}
const periods=load(fs.readFileSync('src/features/plans/lib/periods.ts','utf8'))
async function fixture(){
 const dom=new JSDOM('<main></main>',{url:'http://localhost/'}),doc=dom.window.document
 const names=['window','document','Element','HTMLElement','SVGElement','Node'],previous=new Map(names.map(name=>[name,globalThis[name]]));for(const name of names)globalThis[name]=dom.window[name]
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false}
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,ns)=>ns==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:text=>doc.createTextNode(text),createComment:text=>doc.createComment(text),querySelector:q=>doc.querySelector(q),insertStaticContent(content,parent,anchor){const t=doc.createElement('template');t.innerHTML=content;const first=t.content.firstChild,last=t.content.lastChild;parent.insertBefore(t.content,anchor);return[first,last]}})
 const calls=[],timers=new Map();let nextTimer=0
 const rows=periods.periods.map((period,index)=>({id:'plan-'+index,title:'Title '+period,period,period_date:periods.periodStart(period),completed:false,history:[],source:index===0?'quick':'plans',can_write:true}))
 const store=vue.reactive({plans:rows,busy:false,error:'',isSaving:()=>false,isFocusing:()=>false,async load(){return true},async add(title,period){calls.push(['add',title,period]);return true},async update(plan,updates){Object.assign(plan,updates);calls.push(['update',plan.id,updates]);return true},async remove(id,source){calls.push(['remove',id,source]);this.plans=this.plans.filter(p=>p.id!==id);return true},async prepareFocus(plan,seconds,estimate){calls.push(['focus',plan.id,plan.source,seconds,estimate]);plan.focus={id:'target-'+plan.id,sessions:0,estimated_sessions:estimate||1,focus_seconds:seconds||1500};return {...plan.focus,title:plan.title,workspace_id:'workspace',collection_id:'collection'}}})
 const timer=vue.reactive({durations:{focus:25},currentTarget:null,queuedTarget:null,isRunning:false,modeKey:'focus',starting:false,clearing:false,remote:false,error:'',taskStatsSequence:0,async focusOn(target){this.currentTarget=target;this.isRunning=true},pauseTimer(){this.isRunning=false},completedTask(id){calls.push(['complete',id]);this.currentTarget={...this.currentTarget,completed:true}},async clearFocus(){calls.push(['clear']);this.currentTarget=null;this.isRunning=false},forgetTask(id){calls.push(['forget',id])},updateTarget(target){if(this.currentTarget?.id===target.id)this.currentTarget=target}})
 const settings=vue.reactive({enabled:true,isModuleActive(){return this.enabled}}),canWrite=vue.ref(true)
 const deps={vue,'vue-i18n':{useI18n:()=>({locale:vue.ref('en'),t:key=>key})},'@/lib/workspaceScope':{useModuleAccess:()=>({canWrite}),useModuleLoad:fn=>vue.onMounted(fn)},'@/lib/workspaceNavigation':{workspaceNavigationKey:Symbol(),workspaceActiveViewKey:Symbol()},'@/lib/searchNavigation':{useSearchReveal(){}},'@/lib/utils':{isDialogBackdropDoubleClick:()=>false},'@/features/pomodoro/stores/pomodoro':{usePomodoroStore:()=>timer},'@/stores/settings':{useSettingsStore:()=>settings},'@/stores/ui':{useUIStore:()=>({addToast(...args){calls.push(['toast',...args])}})},'../stores/plans':{usePlansStore:()=>store},'../lib/periods':periods,'@/components/ui/CustomSelect.vue':{default:{props:['modelValue','options'],emits:['update:modelValue'],setup(props,{emit}){return()=>vue.h('select',{value:props.modelValue,onChange:event=>emit('update:modelValue',event.target.value)},props.options.map(o=>vue.h('option',{value:o.value},o.label)))}}}}
 const descriptor=parse(fs.readFileSync('src/features/plans/components/Plans.vue','utf8')).descriptor
 const Component=load(compileScript(descriptor,{id:'plans-focus',inlineTemplate:true}).content,deps,{document:doc,navigator:{clipboard:{async writeText(){}}},setInterval:fn=>{timers.set(++nextTimer,fn);return nextTimer},clearInterval:id=>timers.delete(id)}).default
 const visible=vue.ref(true),app=renderer.createApp({setup:()=>()=>vue.h(vue.KeepAlive,null,{default:()=>visible.value?vue.h(Component):vue.h('div','Other')})})
 app.mount(doc.querySelector('main'));const flush=async()=>{await vue.nextTick();await new Promise(resolve=>setImmediate(resolve));await vue.nextTick()};await flush()
 return {doc,store,timer,settings,calls,canWrite,visible,flush,timers,async close(){app.unmount();await flush();dom.window.close();for(const [name,value]of previous)globalThis[name]=value}}
}
test('Timeless is first and has no history or deferral; every dated period keeps history and focus',async()=>{
 const f=await fixture();try{
  const tabs=()=>Array.from(f.doc.querySelectorAll('.period-tabs button'))
  assert.deepEqual(tabs().map(b=>b.childNodes[0].textContent),['Timeless','Daily','Weekly','Monthly','Yearly'])
  assert.equal(f.doc.querySelector('.history-switch'),null);assert.equal(f.doc.querySelector('.deferred-section'),null)
  for(let index=0;index<5;index++){
   tabs()[index].click();await f.flush();assert.equal(Boolean(f.doc.querySelector('.history-switch')),index>0)
   const play=f.doc.querySelector('[aria-label="Focus"]');assert.ok(play);play.click();await f.flush()
   assert.equal(f.timer.currentTarget.id,'target-plan-'+index)
   assert.equal(f.doc.querySelector('.task-check').getAttribute('aria-pressed'),'false','starting focus does not complete a plan')
   f.timer.isRunning=false
  }
  assert.equal(f.calls.filter(c=>c[0]==='focus').length,5);assert.equal(f.calls.find(c=>c[0]==='focus')[2],'quick','legacy quick focus uses the original authorized source')
  tabs()[0].click();await f.flush();assert.equal(f.doc.querySelector('.history-switch'),null)
 }finally{await f.close()}
})
test('focus pause, personal goal, completion and deletion work without changing the plan lifecycle',async()=>{
 const f=await fixture();try{
  f.doc.querySelector('[aria-label="Focus"]').click();await f.flush();assert.equal(f.timer.isRunning,true)
  f.doc.querySelector('[aria-label="Pause"]').click();await f.flush();assert.equal(f.timer.isRunning,false)
  f.doc.querySelector('.focus-goal').click();await f.flush();const dialog=f.doc.querySelector('dialog');assert.ok(dialog.open)
  const inputs=dialog.querySelectorAll('input');inputs[0].value='3';inputs[0].dispatchEvent(new window.Event('input'));inputs[1].value='30';inputs[1].dispatchEvent(new window.Event('input'))
  dialog.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await f.flush()
  assert.equal(f.doc.querySelector('dialog'),null);assert.equal(f.store.plans[0].focus.estimated_sessions,3);assert.equal(f.store.plans[0].focus.focus_seconds,1800)
  f.doc.querySelector('.task-check').click();await f.flush();assert.equal(f.store.plans[0].completed,true);assert.equal(f.doc.querySelector('.focus-action').disabled,true)
  f.doc.querySelector('[aria-label="Delete"]').click();await f.flush();assert.deepEqual(f.calls.find(c=>c[0]==='remove'),['remove','plan-0','quick']);assert.ok(f.calls.some(c=>c[0]==='clear'))
 }finally{await f.close()}
})
test('a shared viewer can focus personally but cannot complete/delete; leaving clears capture and dialogs',async()=>{
 const f=await fixture();try{
  f.canWrite.value=false;f.store.plans[0].can_write=false;await f.flush()
  assert.equal(f.doc.querySelector('.task-check').disabled,true);assert.equal(f.doc.querySelector('[aria-label="Delete"]'),null)
  f.doc.querySelector('[aria-label="Focus"]').click();await f.flush();assert.equal(f.timer.isRunning,true)
  f.doc.querySelector('.focus-goal').click();await f.flush();assert.ok(f.doc.querySelector('dialog').open)
  f.visible.value=false;await f.flush();assert.equal(f.doc.querySelector('dialog'),null);assert.equal(f.timers.size,0)
  f.visible.value=true;await f.flush();assert.equal(f.timers.size,1)
  f.settings.enabled=false;await f.flush();assert.equal(f.doc.querySelector('.focus-action'),null)
 }finally{await f.close()}
})
