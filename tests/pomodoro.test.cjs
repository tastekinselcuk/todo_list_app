const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue'),pinia=require('pinia'),crypto=require('node:crypto').webcrypto
const source=path=>fs.readFileSync(path,'utf8')
function evaluate(path,dependencies={},globals={}) {
 const exports={}
 vm.runInNewContext(ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports,Date,console,crypto,require:name=>dependencies[name]||require(name),...globals})
 return exports
}
const {FocusJournal}=evaluate('src/features/analytics/lib/focusJournal.ts')
function cache() {
 const map=new Map()
 return {map,get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}
}
function fixture(options={}) {
 pinia.setActivePinia(pinia.createPinia())
 let clock=options.clock||Date.parse('2026-10-11T08:00:00Z'),server=null,offline=false,reject=null,held=null,writeHeld=null
 const uid=options.owner||'owner',wid=options.wid||'work'
 const auth=vue.reactive({user:{id:uid}}),workspaces=vue.reactive({userId:uid,activeId:wid,sessionKey:`${uid}:${wid}`,sharingAvailable:true})
 const settings=vue.reactive({pomodoroDurations:{focus:25,shortBreak:5,longBreak:15}})
 const storage=options.storage||cache(),intervals=new Map(),listeners=new Map(),sent=[],requests=[]
 const broadcasts=[]
 const journals=new Map();let next=0
 const globals={localStorage:storage,crypto,Date:class extends Date {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}},
  setInterval:callback=>{const id=++next;intervals.set(id,callback);return id},clearInterval:id=>intervals.delete(id),
  window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
  document:{title:'Todo',addEventListener(){},removeEventListener(){}}}
 if(options.broadcast)globals.BroadcastChannel=class {
  constructor(){if(options.broadcast==='blocked')throw Error('SecurityError')}
  postMessage(value){broadcasts.push(structuredClone(value))}
  close(){}
 }
 const storageLib=evaluate('src/lib/storage.ts',{},globals)
 const client={async rpc(name,args){
  requests.push({name,args:structuredClone(args)})
  if(held)await held
  if(offline)return {error:{message:'TypeError: Failed to fetch',code:''}}
  if(reject)return {error:reject}
  if(options.rpc)return options.rpc(name,args)
  if(name==='end_focus_session'){
   if(server?.id===args.session_id)server={...server,status:'ended',lease:crypto.randomUUID()}
   return {data:{status:'stopped',session_id:args.session_id}}
  }
  if(name==='focus_context')return {data:{version:1,active:server&&['running','paused'].includes(server.status)?structuredClone(server):null,closed:server&&['ended','completed'].includes(server.status)?[server.id]:[]}}
  if(name==='claim_focus_session'){
   if(server&&['running','paused'].includes(server.status)&&server.client_id!==args.client_id&&!args.takeover)return {data:{status:'busy',active:structuredClone(server)}}
   const proposal=args.takeover&&server&&['running','paused'].includes(server.status)?{...server,status:'paused'}:args.payload
   if(!proposal)return {data:{status:'idle'}}
   server={...structuredClone(proposal),client_id:args.client_id,lease:crypto.randomUUID(),task_title:proposal.task_id||null}
   return {data:{status:'claimed',active:structuredClone(server)}}
  }
 }}
 const dependencies={'@/stores/auth':{useAuthStore:()=>auth},'@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'@/stores/settings':{useSettingsStore:()=>settings},'@/lib/storage':storageLib,'@/lib/supabase':{supabase:client},
  '@/features/analytics/lib/focusService':{focusJournal(uid){
   if(!journals.has(uid))journals.set(uid,new FocusJournal(uid,storage,'tab',async payload=>{
    if(writeHeld)await writeHeld
    if(offline||auth.user?.id!==uid)throw Error('OFFLINE')
    sent.push(structuredClone(payload))
    if(options.write){await options.write(payload);return}
    if(!server||payload.id!==server.id||(!server.lease||payload.lease===server.lease))server={...structuredClone(payload),task_title:payload.task_id||null}
   },()=>clock,()=>crypto.randomUUID()))
   return journals.get(uid)
  }}}
 const module=evaluate('src/features/pomodoro/stores/pomodoro.ts',dependencies,globals),store=module.usePomodoroStore()
 return {store,auth,workspaces,storage,sent,requests,intervals,listeners,journals,broadcasts,
  async advance(ms){clock+=ms;for(const fn of [...intervals.values()])fn();await settle()},
  get clock(){return clock},setOffline(value){offline=value},setReject(value){reject=value},setServer(value){server=value},
  hold(){let release;held=new Promise(resolve=>release=resolve);return ()=>{held=null;release()}},
  holdWrites(){let release;writeHeld=new Promise(resolve=>release=resolve);return ()=>{writeHeld=null;release()}},
  cleanup(){store.shutdown();store.$dispose()}}
}
async function settle(){await new Promise(resolve=>setImmediate(resolve));await vue.nextTick()}
const target=(id='A',seconds=600)=>({id,collection_id:'collection',workspace_id:'work',title:id,estimated_sessions:5,focus_seconds:seconds})

test('a browser BroadcastChannel accepts reactive task selection without aborting start or unlink',async()=>{
 const f=fixture({broadcast:true});try{
  f.store.init();await settle();await f.store.focusOn(target());await settle()
  assert.ok(f.requests.some(r=>r.name==='claim_focus_session'))
  assert.equal(f.store.error,'','successful claims must not become DataCloneError')
  assert.equal(f.store.isRunning,true);assert.equal(f.broadcasts.at(-1).target.id,'A')
  await f.store.clearFocus();await settle()
  assert.equal(f.store.error,'');assert.equal(f.store.currentTarget,null)
  assert.ok(f.requests.some(r=>r.name==='end_focus_session'),'broadcast must not interrupt server stop')
 }finally{f.cleanup()}
})

test('a blocked optional BroadcastChannel does not prevent timer initialization or task focus',async()=>{
 const f=fixture({broadcast:'blocked'});try{
  f.store.init();await settle();await f.store.focusOn(target())
  assert.equal(f.store.error,'');assert.equal(f.store.isRunning,true)
  await f.store.clearFocus();assert.equal(f.store.error,'');assert.equal(f.store.currentTarget,null)
 }finally{f.cleanup()}
})

test('cancel during a pending claim prevents a late response from resurrecting the task',async()=>{
 const f=fixture();try{
  f.store.init();await settle();const release=f.hold(),start=f.store.focusOn(target())
  assert.equal(f.store.starting,true);await f.store.clearFocus();assert.equal(f.store.currentTarget,null)
  release();await start;await settle()
  assert.equal(f.store.isRunning,false);assert.equal(f.store.currentTarget,null);assert.equal(f.store.activeSession,null)
  assert.ok(f.requests.some(r=>r.name==='end_focus_session'))
  await f.store.sync();assert.equal(f.store.remote,false)
 }finally{f.cleanup()}
})

test('remote task can be stopped directly; a failed stop remains retryable',async()=>{
 const f=fixture();try{
  f.setServer({id:'remote-id',workspace_id:'work',started_at:new Date(f.clock-3600_000).toISOString(),segment_started_at:new Date(f.clock).toISOString(),planned_seconds:600,revision:3,status:'running',
   segments:[],association:'task',task_id:'A',collection_id:'collection',estimated_sessions:5,goal_seconds:600,client_id:'other',task_title:'A'})
  f.store.init();await settle();assert.equal(f.store.remote,true);assert.equal(f.store.timeLeft,600,'resumed timer must exclude paused time')
  f.setReject({code:'NETWORK_ERROR',message:'offline'});await f.store.clearFocus()
  assert.equal(f.store.error,'FOCUS_STOP_FAILED');assert.equal(f.store.currentTarget.id,'A');assert.equal(f.store.clearing,false)
  f.setReject(null);await f.store.clearFocus();assert.equal(f.store.remote,false);assert.equal(f.store.currentTarget,null);assert.equal(f.store.isRunning,false)
  f.listeners.get('storage')({key:'focus-owner:owner',newValue:JSON.stringify({client:'other',owner:'owner',updated:f.clock,mode:'focus',deadline:f.clock+600_000,remaining:600,duration:600,running:true,target:target(),session:{id:'remote-id',status:'running'}})})
  assert.equal(f.store.remote,false);assert.equal(f.store.currentTarget,null,'a delayed broadcast cannot revive a stopped session')
  assert.equal(f.requests.filter(r=>r.name==='claim_focus_session').length,0,'stop must not start a session first')
 }finally{f.cleanup()}
})

test('reset ends the server session, preserves partial time and keeps the selected task for a fresh cycle',async()=>{
 const f=fixture({broadcast:true});try{
  f.store.init();await settle();await f.store.focusOn(target());await f.advance(20_000)
  const id=f.store.activeSession.id
  await f.store.resetTimer();await settle()
  assert.equal(f.store.error,'');assert.equal(f.store.isRunning,false);assert.equal(f.store.timeLeft,600)
  assert.equal(f.store.currentTarget.id,'A');assert.equal(f.store.activeSession,null)
  assert.ok(f.requests.some(r=>r.name==='end_focus_session'&&r.args.session_id===id))
  const ended=f.sent.find(s=>s.id===id&&s.status==='ended')
  assert.equal(ended.segments.reduce((n,[a,b])=>n+Date.parse(b)-Date.parse(a),0),20_000)
  await f.store.startTimer();assert.equal(f.store.isRunning,true);assert.notEqual(f.store.activeSession.id,id)
 }finally{f.cleanup()}
})

test('a failed local stop retries the original ID after refresh without discarding its partial time',async()=>{
 const first=fixture();let reloaded
 try{
  first.store.init();await settle();await first.store.focusOn(target());await first.advance(20_000)
  const id=first.store.activeSession.id
  first.setReject({code:'NETWORK_ERROR',message:'offline'})
  await first.store.clearFocus()
  assert.equal(first.store.error,'FOCUS_STOP_FAILED');assert.equal(first.store.currentTarget.id,'A')
  assert.equal(first.store.canReset,true);assert.equal(first.store.isRunning,false)
  const view=JSON.parse(first.storage.getItem('pomodoro-view:owner'));assert.equal(view.pendingStop.id,id)
  reloaded=fixture({storage:first.storage,clock:first.clock})
  reloaded.store.init();await settle()
  assert.ok(reloaded.requests.some(r=>r.name==='end_focus_session'&&r.args.session_id===id))
  assert.equal(reloaded.store.currentTarget,null);assert.equal(reloaded.store.error,'')
  await reloaded.store.startTimer();assert.notEqual(reloaded.store.activeSession.id,id)
 }finally{reloaded?.cleanup();first.cleanup()}
})

test('a mirrored timer resets to its full duration while retaining its task instead of unlinking it',async()=>{
 const f=fixture();try{
  f.setServer({id:'remote-reset',workspace_id:'work',started_at:new Date(f.clock-60_000).toISOString(),planned_seconds:600,revision:3,status:'paused',
   segments:[[new Date(f.clock-60_000).toISOString(),new Date(f.clock).toISOString()]],association:'task',task_id:'A',collection_id:'collection',estimated_sessions:5,goal_seconds:600,client_id:'other',task_title:'A'})
  f.store.init();await settle();assert.equal(f.store.remote,true)
  await f.store.resetTimer()
  assert.equal(f.store.remote,false);assert.equal(f.store.currentTarget.id,'A');assert.equal(f.store.timeLeft,600)
  assert.equal(f.store.isRunning,false);assert.equal(f.store.error,'')
  await f.store.startTimer();assert.notEqual(f.store.activeSession.id,'remote-reset')
 }finally{f.cleanup()}
})

test('real SQL claim accepts the global timer task payload and pause/resume writes',async()=>{
 const {projectDB}=require('./helpers/project-db.cjs')
 const dbf=await projectDB(['202610110002_pomonotes','202610110003_focus_repair']);await dbf.as(dbf.owner)
 const task=await dbf.rpc("select pomonotes_mutate($1,'create',null,'Integration',2,60) as result",[dbf.wid])
 const connection={owner:dbf.owner,wid:dbf.wid,
  rpc:async(name,args)=>{
   try{
    const sql=name==='focus_context'?'select focus_context($1) as result':name==='end_focus_session'?'select end_focus_session($1) as result':'select claim_focus_session($1,$2,$3) as result'
    const params=name==='focus_context'?[args.client_id]:name==='end_focus_session'?[args.session_id]:[args.client_id,args.payload?JSON.stringify(args.payload):null,args.takeover]
    return {data:await dbf.rpc(sql,params)}
   }catch(error){return {error:{message:error.message,code:error.code}}}
  },write:payload=>dbf.rpc('select record_focus_session($1) as result',[JSON.stringify(payload)])}
 const f=fixture({...connection,clock:Date.now()});let reloaded
 try{
  f.store.init();await f.store.sync();await settle()
  await f.store.focusOn({...task,workspace_id:dbf.wid,estimated_sessions:2,focus_seconds:60})
  assert.equal(f.store.error,'');assert.equal(f.store.isRunning,true)
  f.store.pauseTimer();await settle();await f.store.startTimer()
  assert.equal(f.store.error,'');assert.equal(f.store.isRunning,true)
  const original=f.store.activeSession.id
  await f.store.resetTimer()
  assert.equal(f.store.error,'');assert.equal(f.store.currentTarget.id,task.id);assert.equal(f.store.timeLeft,60)
  assert.equal((await dbf.rpc('select focus_context($1) as result',['00000000-0000-0000-0000-000000000009'])).active,null)
  await f.store.startTimer();assert.equal(f.store.error,'');assert.notEqual(f.store.activeSession.id,original)
  const resumed=f.store.activeSession.id
  f.listeners.get('pagehide')();await settle()
  reloaded=fixture({...connection,storage:f.storage,clock:f.clock})
  reloaded.store.init();await settle()
  assert.equal(reloaded.store.isRunning,false);assert.equal(reloaded.requests.filter(r=>r.name==='claim_focus_session').length,0)
  await reloaded.store.toggleTimer();assert.equal(reloaded.store.error,'');assert.equal(reloaded.store.activeSession.id,resumed)
  assert.equal(reloaded.store.isRunning,true)
  await reloaded.store.clearFocus();assert.equal(reloaded.store.error,'');assert.equal(reloaded.store.currentTarget,null)
 }finally{reloaded?.cleanup();f.cleanup();await settle();await dbf.db.close()}
})

test('one global timer freezes workspace and duration; configuration changes only future sessions',async()=>{
 const f=fixture();try {
  f.store.init();await settle();await f.store.focusOn(target())
  const id=f.store.activeSession.id
  await f.advance(60_000);f.workspaces.activeId='personal';f.store.configure({focus:40,shortBreak:6,longBreak:20})
  assert.equal(f.store.timeLeft,540);assert.equal(f.store.activeSession.workspace_id,'work');assert.equal(f.store.sessionSeconds,600)
  f.store.pauseTimer();await settle();await f.advance(900_000);await f.store.startTimer()
  assert.equal(f.store.activeSession.id,id);assert.equal(f.store.timeLeft,540);assert.equal(f.intervals.size,1)
  await f.advance(540_000)
  assert.equal(f.store.completionSequence,1);assert.equal(f.store.modeKey,'shortBreak');assert.equal(f.store.timeLeft,360)
  assert.equal(f.sent.filter(row=>row.id===id&&row.status==='completed').length,1)
  assert.equal(f.sent.find(row=>row.id===id&&row.status==='completed').segments.reduce((sum,[a,b])=>sum+Date.parse(b)-Date.parse(a),0),600_000)
  await f.advance(10_000);assert.equal(f.store.completionSequence,1)
  await f.store.startTimer();await f.advance(360_000)
  assert.equal(f.sent.filter(row=>row.status==='completed').length,1,'breaks create no focus record')
 } finally {f.cleanup()}
})

test('selecting B queues it; explicit switching keeps A partial and begins a different session',async()=>{
 const f=fixture();try {
  f.store.init();await settle();await f.store.focusOn(target('A'))
  const a=f.store.activeSession.id;await f.advance(31_000)
  await f.store.focusOn(target('B'));assert.equal(f.store.currentTarget.id,'A');assert.equal(f.store.queuedTarget.id,'B');assert.equal(f.store.activeSession.id,a)
  await f.store.focusOn(target('B'),true);await settle()
  assert.equal(f.store.currentTarget.id,'B');assert.notEqual(f.store.activeSession.id,a);assert.equal(f.store.queuedTarget,null)
  const ended=f.sent.find(row=>row.id===a&&row.status==='ended')
  assert.ok(ended);assert.equal(ended.task_id,'A');assert.equal(ended.segments.reduce((sum,[a,b])=>sum+Date.parse(b)-Date.parse(a),0),31_000)
 }finally{f.cleanup()}
})

test('missing setup and permission failures block task starts; offline time remains provisional',async()=>{
 const f=fixture();try {
  f.setReject({code:'PGRST202',message:'missing function'});f.store.init();await settle()
  await f.store.focusOn(target());assert.equal(f.store.isRunning,false);assert.equal(f.store.error,'SETUP_REQUIRED')
  f.setReject(null);f.store.capability='unknown';f.setReject({code:'42501',message:'FOCUS_TARGET_UNAVAILABLE'})
  await f.store.focusOn(target());assert.equal(f.store.isRunning,false)
  f.setReject(null);f.setOffline(true);await f.store.focusOn(target());assert.equal(f.store.isRunning,true)
  await f.advance(60_000);f.store.pauseTimer();await settle();assert.ok(f.journals.get('owner').pending().length)
  f.setOffline(false);await f.store.sync();assert.equal(f.journals.get('owner').pending().length,0)
 }finally{f.cleanup()}
})

test('a remote session is mirrored and explicitly resumed here without creating another ID',async()=>{
 const f=fixture();try {
  f.setServer({id:'remote-id',workspace_id:'work',started_at:new Date(f.clock-60_000).toISOString(),planned_seconds:600,revision:3,status:'paused',
   segments:[[new Date(f.clock-60_000).toISOString(),new Date(f.clock).toISOString()]],association:'task',task_id:'A',collection_id:'collection',estimated_sessions:5,goal_seconds:600,client_id:'other',task_title:'A'})
  f.store.init();await settle();assert.equal(f.store.remote,true);assert.equal(f.store.timeLeft,540)
  await f.store.startTimer(true);assert.equal(f.store.remote,false);assert.equal(f.store.isRunning,true);assert.equal(f.store.activeSession.id,'remote-id')
  assert.equal(f.store.timeLeft,540)
 }finally{f.cleanup()}
})

test('account changes reject late claims and corrupted saved state does not break initialization',async()=>{
 const f=fixture();try {
  f.storage.setItem('pomodoro-view:owner',JSON.stringify({mode:'focus',remaining:100,duration:'bad',target:{id:'wrong'}}))
  f.store.init();await settle();assert.equal(f.store.timeLeft,1500)
  const release=f.hold(),start=f.store.startTimer();f.auth.user={id:'next'};f.workspaces.userId='next';await settle();release();await start;await settle()
  assert.equal(f.store.isRunning,false);assert.equal(f.store.currentTarget,null)
 }finally{f.cleanup()}
})

test('completed or deleted tasks preserve the current focus but are not selected for the next cycle',async()=>{
 const f=fixture();try {
  f.store.init();await settle();await f.store.focusOn(target())
  const id=f.store.activeSession.id;f.store.completedTask('A')
  assert.equal(f.store.isRunning,true);assert.equal(f.store.activeSession.id,id)
  await f.advance(600_000);await f.store.startTimer();await f.advance(300_000)
  assert.equal(f.store.modeKey,'focus');assert.equal(f.store.currentTarget,null)
 }finally{f.cleanup()}
})

test('malformed outbox entries cannot hide valid pending focus records',()=>{
 const storage=cache(),journal=new FocusJournal('owner',storage,'tab',async()=>{},()=>Date.now(),()=> 'session')
 storage.setItem('analytics-focus:owner:outbox:bad','{broken')
 journal.start('work',600)
 assert.equal(journal.pending().length,1)
 storage.setItem('analytics-focus:owner:active:corrupt',JSON.stringify({session:{id:'bad',planned_seconds:100,segments:[['bad','bad']]},deadline:'bad'}))
 assert.equal(new FocusJournal('owner',storage,'corrupt',async()=>{}).session,null)
})

test('a copied tab mirrors ownership; a released page reload waits for an explicit continue click',async()=>{
 const first=fixture();let clone,reloaded
 try {
  first.store.init();await settle();await first.store.focusOn(target());await first.advance(60_000)
  const original=structuredClone(first.journals.get('owner').session)
  clone=fixture({storage:first.storage,clock:first.clock});clone.setServer(original);clone.store.init();await settle()
  assert.equal(clone.store.remote,true);assert.equal(clone.store.timeLeft,540)
  assert.equal(clone.sent.length,0,'a copied active pointer does not checkpoint the leader')
  clone.cleanup();clone=null
  first.listeners.get('pagehide')();await settle();first.intervals.clear()
  reloaded=fixture({storage:first.storage,clock:first.clock});reloaded.setServer(structuredClone(first.journals.get('owner').session))
  reloaded.store.init();await settle()
  assert.equal(reloaded.store.isRunning,false)
  assert.equal(reloaded.requests.filter(r=>r.name==='claim_focus_session').length,0,'F5 must not claim or resume')
  assert.equal(reloaded.store.activeSession.id,original.id);assert.equal(reloaded.store.timeLeft,540)
  await reloaded.advance(120_000);assert.equal(reloaded.store.isRunning,false);assert.equal(reloaded.store.timeLeft,540)
  await reloaded.store.toggleTimer();assert.equal(reloaded.store.error,'');assert.equal(reloaded.store.isRunning,true)
  assert.equal(reloaded.store.activeSession.id,original.id);assert.equal(reloaded.store.timeLeft,540)
 }finally{clone?.cleanup();reloaded?.cleanup();first.cleanup()}
})

test('reload keeps a paused task and a break idle without any automatic claim',async()=>{
 for(const mode of ['focus','shortBreak']){
  const first=fixture();let reloaded
  try{
   first.store.init();await settle()
   if(mode==='focus'){await first.store.focusOn(target());await first.advance(20_000);first.store.pauseTimer();await settle()}
   else{await first.store.setMode('shortBreak');await first.store.startTimer();await first.advance(20_000)}
   const remaining=first.store.timeLeft
   first.listeners.get('pagehide')();await settle()
   reloaded=fixture({storage:first.storage,clock:first.clock+120_000});reloaded.store.init();await settle()
   assert.equal(reloaded.store.modeKey,mode);assert.equal(reloaded.store.isRunning,false);assert.equal(reloaded.store.timeLeft,remaining)
   assert.equal(reloaded.requests.filter(r=>r.name==='claim_focus_session').length,0)
  }finally{reloaded?.cleanup();first.cleanup()}
 }
})

test('an interrupted unload restores the last checkpoint paused without crediting absence',async()=>{
 const first=fixture();let reloaded
 try{
  first.store.init();await settle();await first.store.focusOn(target());await first.advance(20_000)
  const id=first.store.activeSession.id
  reloaded=fixture({storage:first.storage,clock:first.clock+120_000})
  reloaded.store.init();await settle()
  assert.equal(reloaded.store.isRunning,false);assert.equal(reloaded.store.timeLeft,580)
  assert.equal(reloaded.store.activeSession.id,id);assert.equal(reloaded.store.activeSession.status,'paused')
  assert.equal(reloaded.requests.filter(r=>r.name==='claim_focus_session').length,0)
 }finally{reloaded?.cleanup();first.cleanup()}
})

test('ordinary heartbeats do not invalidate PomoNotes; acknowledged pauses and completions do',async()=>{
 const f=fixture();try{
  f.store.init();await settle();await f.store.focusOn(target());await settle()
  assert.equal(f.store.taskStatsSequence,0)
  await f.advance(20_000);await f.advance(20_000);assert.equal(f.store.taskStatsSequence,0)
  f.store.pauseTimer();await settle();assert.equal(f.store.taskStatsSequence,1)
  await f.store.sync();await f.store.sync();assert.equal(f.store.taskStatsSequence,1)
  await f.store.startTimer();await f.advance(560_000);assert.equal(f.store.taskStatsSequence,2)
 }finally{f.cleanup()}
})

test('unlinking a task preserves partial time and permits a standalone focus session',async()=>{
 const f=fixture();try {
  f.store.init();await settle();await f.store.focusOn(target());await f.advance(20_000)
  const linked=f.store.activeSession.id;f.store.clearFocus();await settle()
  assert.equal(f.store.currentTarget,null);assert.equal(f.store.isRunning,false)
  await f.store.startTimer();assert.equal(f.store.activeSession.association,'free');assert.notEqual(f.store.activeSession.id,linked)
  assert.equal(f.sent.find(s=>s.id===linked&&s.status==='ended').segments.reduce((n,[a,b])=>n+Date.parse(b)-Date.parse(a),0),20_000)
 }finally{f.cleanup()}
})

test('personal goal edits affect the next cycle while a running session keeps its duration',async()=>{
 const f=fixture();try {
  f.store.init();await settle();await f.store.focusOn(target());await f.advance(60_000)
  f.store.updateTarget({...target(),focus_seconds:1200,estimated_sessions:8})
  assert.equal(f.store.sessionSeconds,600);assert.equal(f.store.timeLeft,540)
  assert.equal(f.store.activeSession.goal_seconds,600)
  await f.advance(540_000);f.store.setMode('focus')
  assert.equal(f.store.sessionSeconds,1200)
 }finally{f.cleanup()}
})

test('queued work is selected when skipping a break; a task play button starts focus from an idle break',async()=>{
 const f=fixture();try {
  f.store.init();await settle();await f.store.focusOn(target('A'))
  await f.store.focusOn(target('B'));await f.advance(600_000)
  f.store.setMode('focus');assert.equal(f.store.currentTarget.id,'B');assert.equal(f.store.queuedTarget,null)
  f.store.setMode('shortBreak');await f.store.focusOn(target('C'))
  assert.equal(f.store.modeKey,'focus');assert.equal(f.store.currentTarget.id,'C');assert.equal(f.store.isRunning,true)
 }finally{f.cleanup()}
})

test('a full completion drains a newer revision after a slow older upload without another clock tick',async()=>{
 const f=fixture();try {
  f.store.init();await settle();await f.store.focusOn(target());await settle()
  const id=f.store.activeSession.id,release=f.holdWrites()
  await f.advance(599_000);await f.advance(1000)
  assert.equal(f.store.isRunning,false);assert.ok(f.journals.get('owner').pending().length)
  release();await new Promise(resolve=>setImmediate(resolve));await settle()
  assert.equal(f.journals.get('owner').pending().length,0)
  assert.equal(f.sent.filter(row=>row.id===id&&row.status==='completed').length,1)
 }finally{f.cleanup()}
})
