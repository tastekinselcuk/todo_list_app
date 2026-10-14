const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue'),pinia=require('pinia'),{parse,compileScript}=require('@vue/compiler-sfc')
function load(source,dependencies,globals={}) {
 const exports={}
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports,Date,console,require: name => dependencies[name] || (name === '@/lib/searchNavigation' ? load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'), {vue}, globals) : null) ||require(name),...globals})
 return exports
}
const task=id=>({id,title:id,collection_id:'collection',workspace_id:'workspace',estimated_sessions:5,focus_seconds:1500,sessions:2,seconds:3000,completed:false,version:1})
async function settle(){await new Promise(resolve=>setImmediate(resolve));await vue.nextTick()}

test('PomoNotes refresh preserves loaded pages, resets filters and rejects stale workspace results',async()=>{
 pinia.setActivePinia(pinia.createPinia())
 const workspaces=vue.reactive({activeId:'workspace',sessionKey:'owner:workspace'}),requests=[]
 let held=null,failure=null
 const rpc=async(name,args)=>{
  requests.push({name,args});if(held)await held
  if(failure)return {error:failure}
  if(name==='pomonotes_mutate')return {data:{ok:true}}
  if(name==='pomonotes_search_target')return {data:{...task(args.tid),workspace_id:'other-users-origin'}}
  const offset=args.after_item?Number(args.after_item.id):0,end=Math.min(offset+30,75)
  return {data:{items:Array.from({length:end-offset},(_,i)=>({...task(String(offset+i+1)),workspace_id:'other-users-origin'})),total:75,has_more:end<75,cursor:{id:String(end),created_at:'2026-10-11'}}}
 }
 const useStore=load(fs.readFileSync('src/features/pomodoro/stores/pomoNotes.ts','utf8'),{
  '@/lib/workspaceScope':{defineWorkspaceStore:pinia.defineStore,useWorkspaceClient:()=>({listen(){}})},
  '@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'@/lib/supabase':{supabase:{rpc}}
 }).usePomoNotesStore
 const store=useStore()
 await store.load();assert.equal(store.items.length,30)
 assert.ok(store.items.every(item=>item.workspace_id==='workspace'),'shared tasks focus in the viewer’s own bound workspace')
 await store.load(true);assert.equal(store.items.length,60)
 const before=requests.length;await store.load()
 assert.equal(store.items.length,60);assert.equal(requests.length-before,2)
 store.filter='completed';await store.load();assert.equal(store.items.length,30)
 store.revealedId='75';await store.load()
 assert.equal(store.items[0].id,'75');assert.equal(store.items[0].workspace_id,'workspace')
 assert.equal(requests.at(-1).name,'pomonotes_search_target')
 assert.equal(requests.at(-1).args.tid,'75')
 store.revealedId='';store.filter='all';await store.load();assert.equal(store.items.length,30)
 failure={code:'SHARING_CONFLICT',message:'SHARING_CONFLICT'}
 assert.equal(await store.mutate('edit',task('1'),{title:'Draft'}),false)
 assert.equal(store.items.length,30);assert.equal(store.error,'SHARING_CONFLICT')
 assert.equal(requests.at(-1).args.expected_version,1)
 failure=null;let release;held=new Promise(resolve=>release=resolve)
 const pending=store.load();workspaces.sessionKey='owner:other';release();await pending
 assert.equal(store.items.length,30)
 store.$dispose()
})

function componentFixture(viewer=false) {
 const operations=[],intervals=new Map(),historyRequests=new Map(),loads=[];let success=false,counter=0,state
 const store=vue.reactive({status:'ready',saving:false,loading:false,active:false,error:'',filter:'active',search:'',total:0,items:[],
  async load(){loads.push(true);return true},async mutate(...args){operations.push(args);return success},
  history(task){return new Promise(resolve=>historyRequests.set(task.id,resolve))}})
 const timer=vue.reactive({durations:{focus:25},currentTarget:null,queuedTarget:null,syncSequence:0,completionSequence:0,taskStatsSequence:0,
  updateTarget(){},completedTask(){},forgetTask(){},async focusOn(){}})
 const descriptor=parse(fs.readFileSync('src/features/pomodoro/components/PomoNotes.vue','utf8')).descriptor
 const component=load(compileScript(descriptor,{id:'pomonotes-test'}).content,{
  'vue-i18n':{useI18n:()=>({t:key=>key,locale:vue.ref('tr')})},'lucide-vue-next':{},
  '@/components/ui/CustomSelect.vue':{default:{}},'@/lib/workspaceScope':{useWorkspaceDraft:(_key,initial)=>vue.ref(initial),useModuleAccess:()=>({canWrite:vue.ref(!viewer)})},
  '@/stores/ui':{useUIStore:()=>({addToast(){}})},'../stores/pomodoro':{usePomodoroStore:()=>timer},'../stores/pomoNotes':{usePomoNotesStore:()=>store}
 },{setInterval:fn=>{intervals.set(++counter,fn);return counter},clearInterval:id=>intervals.delete(id),setTimeout,clearTimeout,
  document:{addEventListener(){},removeEventListener(){},visibilityState:'visible'},window:{innerWidth:1024}}).default
 const host=()=>({children:[]}),renderer=vue.createRenderer({createElement:host,createText:host,createComment:host,insert:(node,parent)=>parent.children.push(node),remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
 const app=renderer.createApp({setup(){state=component.setup({}, {expose(){}});return()=>vue.h('div')}})
 app.mount(host())
 let opened=false
 state.modal.value={showModal(){opened=true},close(){opened=false}}
 return {state,store,operations,historyRequests,timer,loads,get opened(){return opened},succeed(){success=true},close(){app.unmount()}}
}

test('PomoNotes does not fetch its list for timer heartbeats and refreshes once for acknowledged task statistics',async()=>{
 const f=componentFixture();try{
  const initial=f.loads.length
  f.timer.syncSequence++;f.timer.syncSequence++;f.timer.completionSequence++
  await settle();await new Promise(resolve=>setTimeout(resolve,180))
  assert.equal(f.loads.length,initial)
  f.timer.taskStatsSequence++;f.timer.taskStatsSequence++
  await settle();await new Promise(resolve=>setTimeout(resolve,180))
  assert.equal(f.loads.length,initial+1)
 }finally{f.close()}
})

test('failed addition and conflicting edits retain text and the version captured when editing began',async()=>{
 const f=componentFixture();try {
  f.state.title.value='  A useful task  ';await f.state.add()
  assert.equal(f.state.title.value,'  A useful task  ');assert.equal(f.operations[0][2].title,'A useful task')
  f.succeed();await f.state.add();assert.equal(f.state.title.value,'')
  const original=task('A');await f.state.edit(original);original.version=99;f.state.editTitle.value='Edited draft'
  await f.state.save();assert.equal(f.operations.at(-1)[1].version,1)
 }finally{f.close()}
})

test('readers may edit their goal without mutating the shared title or completion',async()=>{
 const f=componentFixture(true);try {
  await f.state.toggle(task('A'));assert.equal(f.operations.length,0)
  await f.state.edit(task('A'));f.state.editEstimate.value=8;await f.state.save()
  assert.equal(f.operations[0][0],'goal');assert.equal(f.operations[0][2].estimate,8)
  assert.equal(f.opened,true,'failed goal update keeps the editor open')
 }finally{f.close()}
})

test('changing history tasks during an outstanding request displays only the new task history',async()=>{
 const f=componentFixture();try {
  const a=f.state.showHistory(task('A'));await settle()
  const b=f.state.showHistory(task('B'));await settle()
  f.historyRequests.get('A')([{id:'old'}]);await settle();assert.equal(f.state.history.value.length,0);assert.equal(f.state.historyBusy.value,true)
  f.historyRequests.get('B')([{id:'new'}]);await Promise.all([a,b])
  assert.equal(f.state.history.value[0].id,'new')
 }finally{f.close()}
})

test('weekly analytics uses one summary request and legacy fallback is explicit',async()=>{
 const requests=[],workspaces=vue.reactive({userId:'owner',sessionKey:'owner:workspace'}),options={workspace:vue.ref('workspace'),preset:vue.ref('week'),from:vue.ref(''),to:vue.ref(''),personal:vue.ref(true),timezone:vue.ref('UTC'),summary:true,compare:false}
 let missing=false,state
 const reports=load(fs.readFileSync('src/features/analytics/lib/reports.ts','utf8'),{})
 const hook=load(fs.readFileSync('src/features/analytics/composables/useAnalyticsReport.ts','utf8'),{
  '@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'../lib/focusService':{focusJournal:()=>({async flush(){},pending:()=>[],storageFailed:false})},'../lib/reports':reports,
  '@/lib/supabase':{supabase:{async rpc(name,args){requests.push(name);return missing&&name==='analytics_summary'?{error:{code:'PGRST202'}}:{data:{date_from:args.date_from,date_to:args.date_to,daily:[],completed_sessions:0,recording_started_at:'2026-01-01T00:00:00Z'}}}}}
 },{document:{addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},setInterval:()=>1,clearInterval(){}})
 const host=()=>({children:[]}),renderer=vue.createRenderer({createElement:host,createText:host,createComment:host,insert:(node,parent)=>parent.children.push(node),remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
 const app=renderer.createApp({setup(){state=hook.useAnalyticsReport(options);return()=>vue.h('div')}});app.mount(host())
 try {
  await settle();assert.deepEqual(requests,['analytics_summary']);assert.equal(state.previous.value,null);assert.equal(state.report.value.items.length,0)
  missing=true;await state.load();assert.deepEqual(requests.slice(-2),['analytics_summary','analytics_report'])
  await state.load();assert.equal(requests.at(-1),'analytics_report');assert.equal(state.status.value,'ready')
 }finally{app.unmount()}
})
