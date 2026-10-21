const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue'),pinia=require('pinia')
function load(path,deps={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>deps[name]||require(name),console,Date,Intl,AbortSignal,setTimeout,clearTimeout,...globals});return exports}
const lib=load('src/features/tasks/lib/tasks.ts')
function fixture(handler){
 const scope=vue.effectScope(),spaces=vue.reactive({sessionKey:'owner:workspace:1',activeId:'workspace',userId:'owner'}),calls=[],listeners=new Set()
 pinia.setActivePinia(pinia.createPinia())
 const supabase={rpc(name,args){calls.push({name,args});const promise=Promise.resolve().then(()=>handler(name,args));promise.abortSignal=()=>promise;return promise}}
 const store=scope.run(()=>load('src/features/tasks/stores/tasks.ts',{'vue':vue,'@/lib/workspaceScope':{defineWorkspaceStore:(_,setup)=>()=>vue.reactive(setup())},'@/stores/workspaces':{useWorkspacesStore:()=>spaces},'@/lib/supabase':{supabase},'../lib/tasks':lib,'@/lib/workspaceTrash':{onTrashChange:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}}).useTasksStore())
 return {scope,spaces,calls,store,listeners}
}
const row=(id='one')=>({id,title:id,status:'todo',version:1,project_id:null})
const page=(items=[row()],more=false)=>({data:{projects:[],tasks:{items,total:items.length,counts:{todo:items.length,doing:0,done:0},has_more:more,cursor:more?{id:items.at(-1).id,created_at:'2026-10-01T00:00:00Z'}:null}},error:null})
const tick=()=>new Promise(r=>setTimeout(r,0))
test('calendar interval logic includes cross-midnight overlap and excludes touching endpoints',()=>{
 assert.equal(lib.overlaps({starts_at:'2026-10-18T23:00Z',ends_at:'2026-10-19T02:00Z'},{starts_at:'2026-10-19T00:00Z',ends_at:'2026-10-19T01:00Z'}),true)
 assert.equal(lib.overlaps({starts_at:'2026-10-18T10:00Z',ends_at:'2026-10-18T11:00Z'},{starts_at:'2026-10-18T11:00Z',ends_at:'2026-10-18T12:00Z'}),false)
 for(const [start,end,valid] of [['2026-10-18T10:00Z','2026-10-18T11:00Z',true],['bad','2026-10-18',false],['2026-10-18','2026-10-18',false],['2026-10-18','2026-10-26',false]])assert.equal(lib.validBlock(start,end),valid)
 assert.equal(lib.workError({message:'WORK_CONFLICT'}),'conflict');assert.equal(lib.workError({code:'PGRST202'}),'setup')
})
test('stale workspace and older date-range responses never replace the current data',async()=>{
 const pending=[];const f=fixture((name,args)=>new Promise(resolve=>pending.push({name,args,resolve})))
 try{
  const first=f.store.loadCalendar('2026-10-01','2026-11-01');await tick()
  const second=f.store.loadCalendar('2026-11-01','2026-12-01');await tick()
  pending[1].resolve({data:{blocks:[{id:'november'}],deadlines:[]}});await second
  pending[0].resolve({data:{blocks:[{id:'october'}],deadlines:[]}});await first
  assert.equal(f.store.blocks[0].id,'november')
  const loading=f.store.load();await tick();f.spaces.sessionKey='other:workspace:2';pending[2].resolve(page([row('secret')]));await loading
  assert.equal(f.store.tasks.length,0)
 }finally{f.scope.stop()}
})
test('a committed write remains successful after refresh failure, duplicate submissions are blocked, and list-only edits skip calendar queries',async()=>{
 let finish,refreshFailure=false;const f=fixture((name,args)=>name==='work_mutate'?new Promise(r=>finish=()=>{refreshFailure=true;r({data:{...row(args.rid),title:args.payload.title},error:null})}):refreshFailure?{data:null,error:{message:'offline'}}:page())
 try{
  await f.store.load()
  const saving=f.store.mutate('task','create','new',{title:'Confirmed'});await tick()
  assert.equal(await f.store.mutate('task','create','duplicate',{title:'Duplicate'}),null)
  finish();const result=await saving
  assert.equal(result.title,'Confirmed');assert.equal(f.store.tasks.find(t=>t.id==='new').title,'Confirmed')
  assert.equal(f.store.error,'failed');assert.equal(f.calls.filter(c=>c.name==='work_mutate').length,1)
  assert.equal(f.calls.filter(c=>c.name==='work_calendar').length,0)
 }finally{f.scope.stop()}
})
test('pagination de-duplicates rows and restores refresh only the matching personal workspace',async()=>{
 const f=fixture((name,args)=>name==='work_load'?page(args.after_id?[row('one'),row('two')]:[row('one')],!args.after_id):{data:{blocks:[],deadlines:[]}})
 try{
  await f.store.load();await f.store.load(true)
  assert.deepEqual(Array.from(f.store.tasks,t=>t.id),['one','two']);assert.equal(f.store.hasMore,false)
  const before=f.calls.length
  for(const fn of f.listeners)fn({owner:'foreign',workspace:'workspace',module:'tasks',action:'restore'})
  await tick();assert.equal(f.calls.length,before)
  for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'tasks',action:'restore'})
  await tick();assert.equal(f.calls.length,before+1)
 }finally{f.scope.stop();assert.equal(f.listeners.size,0)}
})

test('saving an older paginated task retains the loaded window and block edits do not refetch task pages',async()=>{
 const f=fixture((name,args)=>name==='work_mutate'?{data:{...row(args.rid),...args.payload,version:2}}:name==='work_calendar'?{data:{blocks:[],deadlines:[]}}:page([row('first')],false))
 try{
  await f.store.load();f.store.tasks.push(row('older'))
  await f.store.mutate('task','update','older',{title:'Updated'},1)
  assert.equal(f.store.tasks.find(t=>t.id==='older').title,'Updated')
  await f.store.setCalendarActive(true);await f.store.loadCalendar()
  const before=f.calls.length
  await f.store.mutate('block','update','block',{starts_at:'2026-10-18T09:00Z',ends_at:'2026-10-18T10:00Z'},1)
  assert.deepEqual(Array.from(f.calls.slice(before),c=>c.name),['work_mutate','work_calendar'])
  f.store.blocks.push({id:'linked',task_id:'older'});f.store.deadlines.push({id:'older',title:'Old deadline'})
  for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'tasks',action:'move',id:'older'})
  assert.equal(f.store.blocks.some(b=>b.task_id==='older'),false);assert.equal(f.store.deadlines.some(t=>t.id==='older'),false)
  await tick()
 }finally{f.scope.stop()}
})

test('calendar activation waits for its real visible range and deduplicates pending and clean range requests',async()=>{
 const pending=[],f=fixture((name,args)=>new Promise(resolve=>pending.push({name,args,resolve})))
 try{
  await f.store.setCalendarActive(true)
  assert.equal(f.calls.length,0,'activation must not fetch the default month before FullCalendar supplies its range')
  const first=f.store.loadCalendar('2026-10-19','2026-10-26'),same=f.store.loadCalendar('2026-10-19','2026-10-26')
  await tick();assert.equal(pending.length,1)
  pending[0].resolve({data:{blocks:[{id:'week'}],deadlines:[]}})
  assert.equal(await first,true);assert.equal(await same,true)
  assert.equal(f.store.calendarDirty,false)
  await f.store.loadCalendar('2026-10-19','2026-10-26')
  assert.equal(f.calls.length,1,'datesSet repeating a clean range reuses the current result')
  const refresh=f.store.loadCalendar(undefined,undefined,true);await tick()
  assert.equal(f.calls.length,2,'manual refresh can explicitly revalidate a clean range')
  pending[1].resolve({data:{blocks:[{id:'refreshed'}],deadlines:[]}});await refresh
  assert.equal(f.store.blocks[0].id,'refreshed')
 }finally{f.scope.stop()}
})

test('switching project during the first calendar request starts the new scope and rejects the late old result',async()=>{
 const pending=[],f=fixture((name,args)=>name==='work_calendar'?new Promise(resolve=>pending.push({args,resolve})):page())
 try{
  await f.store.setCalendarActive(true)
  const initial=f.store.loadCalendar('2026-10-01','2026-11-01');await tick()
  assert.equal(f.store.calendarReady,false)
  const switching=f.store.selectProject('new-project');await tick()
  assert.equal(pending.length,2)
  assert.equal(pending[1].args.selected_project,'new-project')
  pending[0].resolve({data:{blocks:[{id:'old-project'}],deadlines:[]}})
  assert.equal(await initial,false)
  assert.equal(f.store.blocks.length,0)
  assert.equal(f.store.calendarLoading,true,'the discarded request cannot clear the new request loading state')
  pending[1].resolve({data:{blocks:[{id:'new-project'}],deadlines:[]}});await switching
  assert.equal(f.store.blocks[0].id,'new-project');assert.equal(f.store.calendarDirty,false)
  assert.equal(f.store.calendarLoading,false)
 }finally{f.scope.stop()}
})

test('hidden task writes and trash events defer calendar work until one reactivation fetch',async()=>{
 let hold=false,release;const f=fixture((name,args)=>{
  if(name==='work_load')return page()
  if(name==='work_mutate')return {data:{...row(args.rid),...args.payload,version:2}}
  if(hold)return new Promise(resolve=>release=()=>resolve({data:{blocks:[{id:'current'}],deadlines:[]}}))
  return {data:{blocks:[{id:'original'}],deadlines:[]}}
 })
 try{
  await f.store.load();await f.store.setCalendarActive(true);await f.store.loadCalendar()
  await f.store.setCalendarActive(false)
  await f.store.mutate('task','update','one',{title:'Updated'},1)
  for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'tasks',action:'restore',id:'restored'})
  await tick()
  assert.equal(f.calls.filter(call=>call.name==='work_calendar').length,1)
  assert.equal(f.store.calendarDirty,true)
  hold=true
  const activating=f.store.setCalendarActive(true),duplicate=f.store.setCalendarActive(true),range=f.store.loadCalendar()
  await tick();assert.equal(f.calls.filter(call=>call.name==='work_calendar').length,2)
  release();await Promise.all([activating,duplicate,range])
  assert.equal(f.store.blocks[0].id,'current');assert.equal(f.store.calendarDirty,false)
  await f.store.setCalendarActive(false);await f.store.setCalendarActive(true)
  assert.equal(f.calls.filter(call=>call.name==='work_calendar').length,2,'unchanged local data does not need another fetch')
 }finally{f.scope.stop()}
})

test('a project change while the calendar is hidden loads its saved range only after activation',async()=>{
 const f=fixture((name,args)=>name==='work_load'?page():{data:{blocks:[{id:args.selected_project||'all'}],deadlines:[]}})
 try{
  await f.store.setCalendarActive(true);await f.store.loadCalendar('2026-10-19','2026-10-26')
  await f.store.setCalendarActive(false)
  await f.store.selectProject('project-two')
  assert.equal(f.calls.filter(call=>call.name==='work_calendar').length,1)
  assert.equal(f.store.calendarReady,false);assert.equal(f.store.calendarDirty,true)
  await f.store.setCalendarActive(true)
  const calendarCalls=f.calls.filter(call=>call.name==='work_calendar')
  assert.equal(calendarCalls.length,2);assert.equal(calendarCalls[1].args.selected_project,'project-two')
  assert.equal(calendarCalls[1].args.range_start,'2026-10-19');assert.equal(calendarCalls[1].args.range_end,'2026-10-26')
  assert.equal(f.store.blocks[0].id,'project-two')
 }finally{f.scope.stop()}
})

test('trash refresh preserves the loaded task window and block trash never refetches task pages',async()=>{
 let removed=false;const f=fixture((name,args)=>{
  if(name==='work_calendar')return {data:{blocks:[],deadlines:[]}}
  const result=page(args.after_id?[row('older'),row('oldest')]:[row('first')],!args.after_id&&!removed)
  result.data.tasks.total=removed?2:3
  return result
 })
 try{
  await f.store.load();await f.store.load(true)
  assert.deepEqual(Array.from(f.store.tasks,task=>task.id),['first','older','oldest'])
  removed=true
  for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'tasks',action:'move',id:'oldest'})
  await tick()
  assert.deepEqual(Array.from(f.store.tasks,task=>task.id),['first','older'])
  assert.equal(f.store.hasMore,false);assert.equal(f.store.total,2)
  await f.store.setCalendarActive(true);await f.store.loadCalendar()
  const before=f.calls.length
  for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'calendar',action:'move',id:'block'})
  await tick()
  assert.deepEqual(Array.from(f.calls.slice(before),call=>call.name),['work_calendar'])
  await f.store.setCalendarActive(false)
  const hiddenBefore=f.calls.length
  for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'calendar',action:'restore',id:'block'})
  await tick();assert.equal(f.calls.length,hiddenBefore);assert.equal(f.store.calendarDirty,true)
 }finally{f.scope.stop()}
})

test('a hidden mutation invalidates an older calendar request and its late response cannot mark stale data fresh',async()=>{
 let pendingCalendar;const f=fixture((name,args)=>name==='work_calendar'?new Promise(resolve=>pendingCalendar=resolve):name==='work_mutate'?{data:{...row(args.rid),...args.payload,version:2}}:page())
 try{
  await f.store.load();await f.store.setCalendarActive(true)
  const pending=f.store.loadCalendar();await tick()
  await f.store.setCalendarActive(false)
  await f.store.mutate('task','update','one',{title:'Updated'},1)
  pendingCalendar({data:{blocks:[{id:'stale'}],deadlines:[]}})
  assert.equal(await pending,false);assert.equal(f.store.calendarDirty,true);assert.equal(f.store.blocks.length,0)
  assert.equal(f.store.calendarLoading,false)
 }finally{f.scope.stop()}
})

test('a batch of trash notifications refreshes each visible data source only once',async()=>{
 const f=fixture(name=>name==='work_calendar'?{data:{blocks:[],deadlines:[]}}:page())
 try{
  await f.store.load();await f.store.setCalendarActive(true);await f.store.loadCalendar()
  const before=f.calls.length
  for(const id of ['one','two','three'])for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'tasks',action:'restore',id})
  for(const fn of f.listeners)fn({owner:'owner',workspace:'workspace',module:'calendar',action:'restore',id:'block'})
  await tick()
  assert.deepEqual(Array.from(f.calls.slice(before),call=>call.name),['work_load','work_calendar'])
 }finally{f.scope.stop()}
})
