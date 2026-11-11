const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{JSDOM}=require('jsdom')
// Install the browser document before Vue loads: this exercises runtime-dom itself.
const dom=new JSDOM('<!doctype html><body><main></main></body>',{url:'http://localhost/',pretendToBeVisual:true})
for(const key of ['window','document','Document','ShadowRoot','Element','HTMLElement','SVGElement','Node','Event','MouseEvent'])global[key]=dom.window[key]
global.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window)
dom.window.matchMedia=()=>({matches:false});dom.window.scrollTo=()=>{}
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false}
const vue=require('vue'),{parse,compileScript,compileTemplate}=require('@vue/compiler-sfc')
function evaluate(source,deps){const exports={};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['exports','require'])(exports,name=>deps[name]||require(name));return exports}
async function fixture({seed=false,checklist=[]}={}){
 document.body.innerHTML='<main></main>'
 const errors=[],warnings=[],rows=[],spaces=vue.reactive({sessionKey:'owner:workspace:1',activeId:'workspace',userId:'owner'}),calls=[],external=[],trash=new Set()
 const row=input=>({description:'',status:'todo',priority:'none',project_id:null,due_on:null,estimate_minutes:30,checklist:[],created_at:new Date().toISOString(),version:1,deleted_at:null,...input})
 const projects=[],blocks=[],pendingCalendar=[],pendingMutations=[];let delayCalendar=false,delayMutation=false,mutationFailure=null
 const today=new Date(),day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-')
 if(seed){rows.push(row({id:'seed-task',title:'Loaded task',due_on:day,checklist}));blocks.push({id:'seed-block',task_id:'seed-task',title:'Loaded event',starts_at:new Date(`${day}T11:00:00`).toISOString(),ends_at:new Date(`${day}T12:00:00`).toISOString(),version:1,timezone:'Europe/Istanbul'})}
 const enrichedBlock=block=>{const task=rows.find(row=>row.id===block.task_id),selected=(task?.checklist||[]).filter(item=>(block.subtask_ids||[]).includes(item.id));return {...block,subtask_ids:block.subtask_ids||[],task_title:task?.title,task_status:selected.length?(selected.every(item=>item.done)?'done':'todo'):task?.status,subtask_titles:(task?.checklist||[]).filter(item=>(block.subtask_ids||[]).includes(item.id)).map(item=>item.title)}}
 const enrichedTask=task=>task?{...task,scheduled_blocks:blocks.filter(block=>!block.deleted_at&&block.task_id===task.id).map(enrichedBlock)}:null
 const rpc=(name,args)=>{calls.push({name,args});const result=Promise.resolve().then(async()=>{
  if(name==='work_load'){const filtered=rows.filter(row=>!args.selected_project||row.project_id===args.selected_project||args.selected_project==='00000000-0000-0000-0000-000000000000'&&!row.project_id);return {data:{projects:[...projects],tasks:{items:filtered.map(enrichedTask),total:filtered.length,counts:{todo:filtered.filter(r=>r.status==='todo').length,doing:filtered.filter(r=>r.status==='doing').length,done:filtered.filter(r=>r.status==='done').length},has_more:false,cursor:null}}}}
  if(name==='work_calendar'){const response={data:{blocks:blocks.filter(row=>!row.deleted_at).map(enrichedBlock),deadlines:rows.filter(r=>r.due_on)}};return delayCalendar?new Promise(resolve=>pendingCalendar.push(()=>resolve(response))):response}
  if(name==='work_mutate'||name==='work_save_details'||name==='work_project_delete'){
   if(delayMutation)await new Promise(resolve=>pendingMutations.push(resolve))
   if(mutationFailure){const message=mutationFailure;mutationFailure=null;return {data:null,error:{message}}}
  }
  if(name==='work_mutate'){
   const target=args.entity==='block'?blocks:args.entity==='project'?projects:rows,existing=target.find(r=>r.id===args.rid)
   if(args.operation==='create'){if(existing)return {data:existing};const saved=row({id:args.rid,...args.payload});target.unshift(saved);return {data:saved}}
   if(args.expected_version!==existing.version)return {data:null,error:{message:'WORK_CONFLICT'}}
   Object.assign(existing,args.payload,{version:existing.version+1});return {data:{...existing}}
  }
  if(name==='work_save_details'){
   let task=rows.find(row=>row.id===args.tid)
   if(task&&task.version!==args.task_version)return {data:null,error:{message:'WORK_CONFLICT'}}
   for(const time of [...args.time_changes,...args.time_removals]){const old=blocks.find(block=>block.id===time.id);if(old&&old.version!==time.version)return {data:null,error:{message:'WORK_CONFLICT'}}}
   if(args.task_payload){if(task)Object.assign(task,args.task_payload,{version:task.version+1});else{task=row({id:args.tid,...args.task_payload});rows.unshift(task)}}
   for(const time of args.time_changes){const old=blocks.find(block=>block.id===time.id);if(old)Object.assign(old,time,{version:old.version+1});else blocks.push({...time,task_id:args.tid,version:1})}
   for(const time of args.time_removals)blocks.find(block=>block.id===time.id).deleted_at=new Date().toISOString()
   return {data:{task:enrichedTask(task),blocks:blocks.filter(block=>!block.deleted_at&&(args.tid?block.task_id===args.tid:args.time_changes.some(time=>time.id===block.id))).map(enrichedBlock)}}
  }
  if(name==='work_project_delete'){const index=projects.findIndex(row=>row.id===args.pid);projects.splice(index,1);rows.filter(row=>row.project_id===args.pid).forEach(row=>{row.project_id=null;row.version++});return {data:true}}
  if(name==='work_task')return {data:enrichedTask(rows.find(r=>r.id===args.tid))}
  throw Error(name)
 });result.abortSignal=()=>result;return result}
 let store
 const deps={vue,'vue-i18n':{useI18n:()=>({t:(key,values={})=>values.count===undefined?key:`${key}:${values.count}`,locale:vue.ref('tr')})},'@/lib/supabase':{supabase:{rpc}},'@/stores/workspaces':{useWorkspacesStore:()=>spaces},'@/lib/workspaceScope':{defineWorkspaceStore:(_name,setup)=>()=>store||(store=vue.reactive(setup())),useModuleLoad:fn=>vue.onMounted(fn)},'@/lib/workspaceTrash':{onTrashChange:fn=>{trash.add(fn);return()=>trash.delete(fn)},moveToTrash:async()=>{}},'@/lib/searchNavigation':{useSearchReveal(){}},'@/lib/workspaceNavigation':{workspaceNavigationKey:Symbol(),workspaceActiveViewKey:Symbol()}}
 deps['../lib/tasks']=evaluate(fs.readFileSync('src/features/tasks/lib/tasks.ts','utf8'),deps)
 const compile=path=>{
  // Match Vite's separate script/template compilation, including hoisted nodes.
  const descriptor=parse(fs.readFileSync(path,'utf8')).descriptor,script=compileScript(descriptor,{id:path})
  const component=evaluate(script.content,deps).default
  const template=compileTemplate({source:descriptor.template.content,filename:path,id:path,compilerOptions:{bindingMetadata:script.bindings,expressionPlugins:['typescript']}})
  assert.deepEqual(template.errors,[]);component.render=evaluate(template.code,deps).render
  return component
 }
 deps['@/lib/utils']=evaluate(fs.readFileSync('src/lib/utils.ts','utf8'),deps)
 deps['@/components/ui/CustomSelect.vue']={default:compile('src/components/ui/CustomSelect.vue')}
 deps['./ExternalCalendars.vue']={default:{emits:['update:events'],setup(_props,{emit,expose}){external.push(value=>emit('update:events',value));expose({openEvent(){}});return()=>vue.h('button','Outlook')}}}
 deps['./CalendarSurface.vue']={default:compile('src/features/tasks/components/CalendarSurface.vue')}
 deps['./CalendarAgenda.vue']={default:compile('src/features/tasks/components/CalendarAgenda.vue')}
 deps['../lib/connectedCalendars']=evaluate(fs.readFileSync('src/features/tasks/lib/connectedCalendars.ts','utf8'),deps)
 deps['./CalendarProviderIcon.vue']={default:compile('src/features/tasks/components/CalendarProviderIcon.vue')}
 const WorkCalendar=compile('src/features/tasks/components/WorkCalendar.vue')
 deps.vue={...vue,defineAsyncComponent:()=>vue.defineAsyncComponent(async()=>WorkCalendar)}
 deps['../stores/tasks']=evaluate(fs.readFileSync('src/features/tasks/stores/tasks.ts','utf8'),deps)
 deps['./ProjectSelect.vue']={default:compile('src/features/tasks/components/ProjectSelect.vue')}
 deps['./TaskRow.vue']={default:compile('src/features/tasks/components/TaskRow.vue')};deps['./WorkEditor.vue']={default:compile('src/features/tasks/components/WorkEditor.vue')}
 deps['./TaskCompletionDialog.vue']={default:compile('src/features/tasks/components/TaskCompletionDialog.vue')}
 const Tasks=compile('src/features/tasks/components/Tasks.vue'),visible=vue.ref(true)
 const scope=vue.effectScope(),app=scope.run(()=>vue.createApp({setup:()=>()=>vue.h(vue.KeepAlive,null,{default:()=>visible.value?vue.h(Tasks):vue.h('p','Other')})}))
 app.config.errorHandler=error=>errors.push(error);app.config.warnHandler=warning=>warnings.push(warning)
 const flush=async()=>{await vue.nextTick();await new Promise(resolve=>setTimeout(resolve,30));await vue.nextTick()}
 app.mount(document.querySelector('main'));await flush();await flush()
 const choose=async name=>{const button=[...document.querySelectorAll('.task-view-navigation button')].find(button=>button.textContent==='tasks.'+name);assert.ok(button);button.click();await flush()}
 return {errors,warnings,rows,blocks,calls,external,store,visible,flush,choose,delayCalendar(value){delayCalendar=value},releaseCalendar(){pendingCalendar.splice(0).forEach(resolve=>resolve())},delayMutation(value){delayMutation=value},releaseMutations(){pendingMutations.splice(0).forEach(resolve=>resolve())},failNextMutation(message){mutationFailure=message},async close(){app.unmount();scope.stop();await flush()}}
}
async function selectListStatus(f,value){
 const trigger=document.querySelector('[data-work-task] .task-status-control .select-trigger');assert.ok(trigger);trigger.focus();trigger.click();await f.flush()
 const option=[...document.querySelectorAll('[data-work-task] .task-status-control .select-option')].find(button=>button.textContent.trim()==='tasks.'+value);assert.ok(option);option.click();await f.flush()
}

test('native Vue mounts the live tasks store, adds visible list rows, and survives repeated kanban/calendar changes',async()=>{
 const f=await fixture();try{
  assert.deepEqual(f.errors.map(e=>e.message),[],'initial async calendar load must not break the renderer')
  for(let i=0;i<4;i++){
   await f.choose('list');const input=document.querySelector('input[aria-label="tasks.title"]');assert.ok(input);input.value='Visible task '+i;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.closest('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush()
   assert.ok(document.querySelector('.work-dialog'));document.querySelector('.work-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush()
   assert.ok([...document.querySelectorAll('[data-work-task]')].some(card=>card.textContent.includes('Visible task '+i)),'a committed task is visible immediately')
   await f.choose('board');assert.equal(document.querySelectorAll('[data-work-task]').length,i+1)
   await f.choose('calendar');assert.ok(document.querySelector('.fc'));f.external.at(-1)([]);await f.flush()
  }
  await f.choose('list');f.visible.value=false;await f.flush();f.visible.value=true;await f.flush();await f.flush();assert.ok(document.querySelector('.fc'))
  await f.choose('list');assert.equal(document.querySelectorAll('[data-work-task]').length,4)
  assert.deepEqual(f.errors.map(e=>e.message),[])
 }finally{await f.close()}
})

test('inline subtasks persist from list to board and editor, prevent duplicate writes and preserve Kanban drag',async()=>{
 const f=await fixture({seed:true});try{
  await f.choose('list')
  const card=()=>document.querySelector('[data-work-task="seed-task"]'),toggle=()=>card().querySelector('.task-steps-toggle')
  assert.equal(toggle().getAttribute('aria-expanded'),'false');assert.equal(card().querySelector('.task-step-input'),null)
  toggle().click();await f.flush()
  let input=card().querySelector('.task-step-input');assert.equal(document.activeElement,input)
  assert.equal(input.closest('form').querySelector('button').disabled,true)
  input.value='  Research  ';input.dispatchEvent(new Event('input',{bubbles:true}));await f.flush()
  f.delayMutation(true)
  const submit=()=>input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
  submit();submit();await f.flush()
  assert.equal(f.calls.filter(call=>['work_mutate','work_save_details'].includes(call.name)).length,1,'pending submissions cannot create two subtasks')
  assert.equal(f.rows[0].checklist.length,0,'the source task is not mutated before the server commits')
  assert.equal(input.disabled,true)
  const request=f.calls.find(call=>call.name==='work_mutate').args
  assert.equal(request.expected_version,1);assert.deepEqual(Object.keys(request.payload),['checklist']);assert.equal(request.payload.checklist[0].title,'Research')
  f.delayMutation(false);f.releaseMutations();await f.flush();await f.flush()
  assert.equal(input.value,'');assert.equal(document.activeElement,input);assert.match(toggle().textContent,/0\/1/)
  input.value='Draft';input.dispatchEvent(new Event('input',{bubbles:true}));await f.flush();input.closest('form').querySelector('button').click();await f.flush();await f.flush()
  const checks=()=>[...card().querySelectorAll('[role="checkbox"]')]
  checks()[0].click();await f.flush();await f.flush()
  assert.equal(checks()[0].getAttribute('aria-checked'),'true');assert.equal(checks()[1].getAttribute('aria-checked'),'false')
  assert.equal(f.rows[0].status,'todo','checking an individual step does not silently complete the task')
  assert.match(toggle().textContent,/1\/2/);assert.equal(document.querySelector('dialog'),null)
  await f.choose('board');toggle().click();await f.flush()
  assert.equal(checks()[0].getAttribute('aria-checked'),'true')
  const values=new Map(),transfer={setData:(key,value)=>values.set(key,value),getData:key=>values.get(key)||''}
  const event=name=>{const event=new Event(name,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:transfer});return event}
  const inputDrag=event('dragstart');card().querySelector('.task-step-input').dispatchEvent(inputDrag)
  assert.equal(inputDrag.defaultPrevented,true);assert.equal(values.size,0,'editing a step cannot accidentally drag the parent card')
  card().closest('[draggable="true"]').dispatchEvent(event('dragstart'))
  const doing=[...document.querySelectorAll('section > h3')].find(node=>node.textContent.includes('tasks.doing')).parentElement
  doing.dispatchEvent(event('drop'));await f.flush();await f.flush()
  assert.equal(f.rows[0].status,'doing');assert.ok(doing.querySelector('[data-work-task="seed-task"]'))
  card().querySelector('.text-left').click();await f.flush()
  const editorChecks=[...document.querySelectorAll('dialog input[type="checkbox"]')]
  assert.equal(editorChecks.length,2);assert.equal(editorChecks[0].checked,true)
  assert.deepEqual(f.errors.map(e=>e.message),[])
 }finally{f.releaseMutations();await f.close()}
})

test('failed inline saves preserve the draft and committed completion state; Escape clears the transient draft',async()=>{
 const f=await fixture({seed:true});try{
  await f.choose('list');const card=document.querySelector('[data-work-task="seed-task"]'),toggle=card.querySelector('.task-steps-toggle')
  toggle.click();await f.flush();const input=card.querySelector('.task-step-input')
  input.value='Keep this step';input.dispatchEvent(new Event('input',{bubbles:true}));await f.flush()
  f.failNextMutation('offline');input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush()
  assert.equal(input.value,'Keep this step');assert.equal(input.disabled,false);assert.equal(f.rows[0].checklist.length,0)
  input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush()
  assert.equal(f.rows[0].checklist.length,1);assert.equal(input.value,'')
  f.failNextMutation('WORK_CONFLICT');card.querySelector('[role="checkbox"]').click();await f.flush();await f.flush()
  assert.equal(card.querySelector('[role="checkbox"]').getAttribute('aria-checked'),'false');assert.equal(f.rows[0].checklist[0].done,false)
  assert.equal(f.store.error,'conflict')
  input.value='Unsaved draft';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await f.flush()
  assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,toggle)
  toggle.click();await f.flush();assert.equal(card.querySelector('.task-step-input').value,'')
  assert.deepEqual(f.errors.map(e=>e.message),[])
 }finally{await f.close()}
})

test('loaded events, deadlines and late requests cannot break task editing or a newly mounted calendar',async()=>{
 const f=await fixture({seed:true});try{
  assert.ok([...document.querySelectorAll('.fc-event-title')].some(node=>node.textContent.includes('Loaded event')),JSON.stringify({errors:f.errors.map(e=>e.message),blocks:f.store.blocks,titles:[...document.querySelectorAll('.fc-event-title')].map(n=>n.textContent)}))
  assert.ok(document.querySelector('.work-deadline'))
  // A genuine user interaction rebuilds the day header content/options.
  document.querySelector('.calendar-weekday').click();await f.flush()
  f.external.at(-1)([{id:'outlook',title:'Meeting',start:new Date().toISOString(),end:new Date(Date.now()+1800000).toISOString(),calendar_name:'Work',color:'#3355aa'}]);await f.flush()
  assert.ok(document.querySelector('.work-external-event'))
  await f.choose('list')
  document.querySelector('[data-work-task] .text-left').click();await f.flush()
  const editor=document.querySelector('dialog input[aria-label="tasks.title"]');assert.ok(editor);editor.value='Updated task';editor.dispatchEvent(new Event('input',{bubbles:true}));editor.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush()
  assert.equal(document.querySelector('dialog'),null);assert.match(document.querySelector('[data-work-task]').textContent,/Updated task/)
  await f.choose('calendar');assert.ok(document.querySelector('.fc-event-title'))
  f.delayCalendar(true);const request=f.store.loadCalendar(undefined,undefined,true);await f.flush()
  await f.choose('board');assert.match(document.querySelector('[data-work-task]').textContent,/Updated task/)
  f.visible.value=false;await f.flush();f.releaseCalendar();await request;await f.flush()
  f.delayCalendar(false);f.visible.value=true;await f.flush();await f.flush()
  assert.equal(document.querySelectorAll('.fc').length,1)
  assert.ok(document.querySelector('.work-deadline'))
  await f.choose('list');assert.match(document.querySelector('[data-work-task]').textContent,/Updated task/)
  assert.deepEqual(f.errors.map(e=>e.message),[])
 }finally{f.releaseCalendar();await f.close()}
})

test('completion asks once before any write from list, Kanban, calendar and the detail editor',async t=>{
 for(const entry of ['list','board','calendar','editor'])await t.test(entry,async()=>{
  const checklist=[{id:'open-one',title:'Research',done:false},{id:'finished',title:'Outline',done:true},{id:'open-two',title:'Draft',done:false}]
  const f=await fixture({seed:true,checklist});try{
   const trigger=async()=>{
    if(entry==='editor'){
     const editor=document.querySelector('.work-dialog')
     if(!editor){await f.choose('list');document.querySelector('[data-work-task] .text-left').click();await f.flush()
      const title=document.querySelector('.work-dialog input[aria-label="tasks.title"]');title.value='Edited title';title.dispatchEvent(new Event('input',{bubbles:true}))
      document.querySelector('.work-dialog button[aria-label="tasks.status"]').click();await f.flush()
      ;[...document.querySelectorAll('.work-dialog .select-option')].find(button=>button.textContent.trim()==='tasks.done').click();await f.flush()
     }
     document.querySelector('.work-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
    }else if(entry==='board'){
     await f.choose('board');const target=[...document.querySelectorAll('section > h3')].find(node=>node.textContent.includes('tasks.done')).parentElement
     const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{getData:()=>f.rows[0].id}});target.dispatchEvent(event)
    }else{
     await f.choose(entry);if(entry==='list')await selectListStatus(f,'done');else{const button=document.querySelector('.inspector-complete');assert.ok(button);button.focus();button.click()}
    }
    await f.flush()
   }
   await trigger()
   const prompt=()=>document.querySelector('.task-completion-dialog')
   assert.ok(prompt());assert.match(prompt().textContent,/tasks.completeAllBody:2/)
   assert.equal(document.activeElement,prompt().querySelector('button'),'cancel is the initially focused choice')
   assert.equal(f.calls.filter(call=>['work_mutate','work_save_details'].includes(call.name)).length,0);assert.equal(f.rows[0].status,'todo')
   prompt().querySelector('button').click();await f.flush()
   assert.equal(prompt(),null);assert.equal(f.rows[0].status,'todo');assert.equal(f.rows[0].checklist.filter(item=>!item.done).length,2)
   if(entry==='editor'){assert.equal(document.querySelector('.work-dialog input[aria-label="tasks.title"]').value,'Edited title');assert.equal(document.body.style.overflow,'hidden')}
   await trigger();f.delayMutation(true);prompt().querySelector('.workspace-add-button').click();await f.flush()
   assert.equal(f.rows[0].status,'todo');assert.equal(f.rows[0].checklist.filter(item=>!item.done).length,2)
   const writes=f.calls.filter(call=>['work_mutate','work_save_details'].includes(call.name));assert.equal(writes.length,1)
   const args=writes[0].args,payload=args.task_payload||args.payload;assert.equal(args.task_version??args.expected_version,1);assert.equal(payload.status,'done');assert.ok(payload.checklist.every(item=>item.done))
   f.delayMutation(false);f.releaseMutations();await f.flush();await f.flush()
   assert.equal(f.rows[0].status,'done');assert.ok(f.rows[0].checklist.every(item=>item.done));assert.equal(document.querySelector('dialog'),null)
   assert.equal(document.body.style.overflow,'')
   if(entry==='editor')assert.equal(f.rows[0].title,'Edited title')
   assert.deepEqual(f.errors.map(error=>error.message),[])
  }finally{f.releaseMutations();await f.close()}
 })
})

test('failed completion is atomic, a reopened child reopens its parent, and already finished steps need no prompt',async()=>{
 const f=await fixture({seed:true,checklist:[{id:'step',title:'Research',done:false}]});try{
  await f.choose('board');const card=()=>document.querySelector('[data-work-task="seed-task"]')
  card().querySelector('button[aria-label="tasks.complete"]').click();await f.flush()
  f.failNextMutation('WORK_CONFLICT');document.querySelector('.task-completion-dialog .workspace-add-button').click();await f.flush();await f.flush()
  assert.equal(f.rows[0].status,'todo');assert.equal(f.rows[0].checklist[0].done,false);assert.equal(f.store.error,'conflict')
  card().querySelector('button[aria-label="tasks.complete"]').click();await f.flush();document.querySelector('.task-completion-dialog .workspace-add-button').click();await f.flush();await f.flush()
  assert.equal(f.rows[0].status,'done');assert.equal(f.rows[0].checklist[0].done,true)
  card().querySelector('.task-steps-toggle').click();await f.flush();card().querySelector('[role="checkbox"]').click();await f.flush();await f.flush()
  assert.equal(f.rows[0].status,'todo');assert.equal(f.rows[0].checklist[0].done,false)
  const reopen=f.calls.filter(call=>['work_mutate','work_save_details'].includes(call.name)).at(-1).args.payload;assert.equal(reopen.status,'todo');assert.equal(reopen.checklist[0].done,false)
  card().querySelector('.task-steps-toggle').click();await f.flush();card().querySelector('[role="checkbox"]').click();await f.flush();await f.flush()
  assert.equal(f.rows[0].status,'todo');assert.equal(f.rows[0].checklist[0].done,true)
  card().querySelector('button[aria-label="tasks.complete"]').click();await f.flush();await f.flush()
  assert.equal(document.querySelector('.task-completion-dialog'),null);assert.equal(f.rows[0].status,'done')
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})

test('leaving the module cancels a pending completion without writing or leaving a scroll lock',async()=>{
 const f=await fixture({seed:true,checklist:[{id:'step',title:'Research',done:false}]});try{
  await f.choose('list');await selectListStatus(f,'done');await f.flush()
  assert.ok(document.querySelector('.task-completion-dialog'));f.visible.value=false;await f.flush()
  assert.equal(document.querySelector('.task-completion-dialog'),null);assert.equal(document.body.style.overflow,'')
  assert.equal(f.calls.filter(call=>['work_mutate','work_save_details'].includes(call.name)).length,0)
  f.visible.value=true;await f.flush();await f.flush();assert.equal(document.querySelector('.task-completion-dialog'),null)
  assert.equal(f.rows[0].status,'todo');assert.equal(f.rows[0].checklist[0].done,false)
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})


test('one focused editor schedules subtasks, displays every time on the card and never allows relinking an existing task',async()=>{
 const f=await fixture({seed:true,checklist:[{id:'research',title:'Research',done:false}]});try{
  document.querySelector('.inspector-add').click();await f.flush()
  assert.ok(document.querySelector('.work-dialog button[aria-label="tasks.linkedTask"]'))
  document.querySelector('.work-dialog button[aria-label="tasks.linkedTask"]').click();await f.flush()
  ;[...document.querySelectorAll('.work-dialog .select-option')].find(button=>button.textContent.includes('Loaded task')).click();await f.flush();await f.flush()
  assert.equal(document.querySelector('.work-dialog input[aria-label="tasks.title"]').value,'Loaded task')
  assert.equal(document.querySelectorAll('.time-card').length,2)
  const target=document.querySelector('.time-target input');assert.ok(target);target.click();await f.flush()
  document.querySelector('.work-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush()
  const saved=f.calls.filter(call=>call.name==='work_save_details').at(-1).args
  assert.equal(saved.tid,'seed-task');assert.equal(saved.time_changes.length,1);assert.deepEqual(Array.from(saved.time_changes[0].subtask_ids),['research'])
  assert.ok([...document.querySelectorAll('.fc-event-title')].some(node=>node.textContent.includes('Research')))
  await f.choose('list');const card=document.querySelector('[data-work-task="seed-task"]')
  assert.equal(card.querySelectorAll('button .shrink-0.tabular-nums').length,2,'both times appear directly on the card')
  const buttons=[...card.querySelectorAll('button')].filter(button=>button.textContent.includes('Research')&&button.querySelector('.tabular-nums'))
  buttons[0].click();await f.flush();await f.flush()
  assert.equal(document.querySelector('.work-dialog button[aria-label="tasks.linkedTask"]'),null,'a task opened from its card cannot be assigned to another task')
  assert.equal(document.querySelectorAll('.work-dialog .time-card').length,2)
  assert.equal(document.querySelector('.work-dialog input[type="number"]'),null,'there is no estimate field')
  document.querySelector('.work-dialog button[aria-label="common.close"]').click();await f.flush()
  await f.choose('calendar');const stepButton=[...document.querySelectorAll('.inspector-event')].find(node=>node.textContent.includes('Research'))?.querySelector('.inspector-complete')
  assert.ok(stepButton);stepButton.click();await f.flush();await f.flush();assert.equal(f.rows[0].checklist[0].done,true);assert.equal(f.rows[0].status,'todo')
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})

test('project creation selects it, Enter opens an unsaved task draft, and deleting the project preserves its task',async()=>{
 const f=await fixture();try{
  await f.choose('list');document.querySelector('.project-trigger').click();await f.flush()
  ;[...document.querySelectorAll('.project-menu button')].find(button=>button.textContent.trim()==='tasks.addProject').click();await f.flush()
  const name=document.querySelector('.project-dialog input');name.value='Launch';name.dispatchEvent(new Event('input',{bubbles:true}));name.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush()
  const project=f.store.projects[0];assert.equal(project.name,'Launch');assert.equal(f.store.project,project.id)
  const title=document.querySelector('.workspace-toolbar input[aria-label="tasks.title"]');title.value='New task';title.dispatchEvent(new Event('input',{bubbles:true}));title.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush()
  assert.equal(f.rows.length,0);assert.ok(document.querySelector('.work-dialog'));assert.equal(document.querySelector('.work-dialog .project-trigger').textContent.includes('Launch'),true)
  document.querySelector('.work-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await f.flush();await f.flush();assert.equal(f.rows[0].project_id,project.id)
  document.querySelector('.project-trigger').click();await f.flush();document.querySelector('.project-menu button[aria-label="tasks.deleteProject: Launch"]').click();await f.flush()
  document.querySelector('.project-dialog .workspace-add-button').click();await f.flush();await f.flush()
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].project_id,null);assert.equal(f.store.projects.length,0);assert.equal(document.body.style.overflow,'')
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})


test('list status menu selects all three states, supports keyboard dismissal and keeps Kanban free of status menus',async()=>{
 const f=await fixture({seed:true});try{
  await f.choose('list')
  ;[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='tasks.showCompleted').click();await f.flush()
  const trigger=()=>document.querySelector('.task-status-control .select-trigger')
  trigger().focus();trigger().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));await f.flush()
  assert.equal(document.querySelectorAll('.task-status-control .select-option').length,3)
  assert.equal(f.calls.filter(call=>call.name==='work_mutate').length,0,'opening the menu does not change the task')
  document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await f.flush()
  assert.equal(trigger().getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,trigger())
  await selectListStatus(f,'doing');assert.equal(f.rows[0].status,'doing');assert.equal(document.querySelector('dialog'),null)
  await selectListStatus(f,'todo');assert.equal(f.rows[0].status,'todo')
  await selectListStatus(f,'done');assert.equal(f.rows[0].status,'done')
  await selectListStatus(f,'todo');assert.equal(f.rows[0].status,'todo')
  const before=f.calls.filter(call=>call.name==='work_mutate').length;await selectListStatus(f,'todo');assert.equal(f.calls.filter(call=>call.name==='work_mutate').length,before,'reselecting the current state does not write')
  f.failNextMutation('WORK_CONFLICT');await selectListStatus(f,'doing');assert.equal(f.rows[0].status,'todo');assert.equal(f.store.error,'conflict')
  await f.choose('board');assert.equal(document.querySelector('.task-status-control'),null);assert.ok(document.querySelector('[data-work-task] button[aria-label="tasks.complete"]'))
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})


test('agenda removes duplicate controls, marks the selected day button, and scrolls the selected day without moving the page',async()=>{
 const f=await fixture({seed:true});try{
  const selected=new Date(),earlier=new Date(selected),later=new Date(selected);earlier.setDate(earlier.getDate()-2);later.setDate(later.getDate()+3)
  const localDay=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
  const add=(date,id,title)=>{const start=new Date(date);start.setHours(12,0,0,0);f.blocks.push({id,title,starts_at:start.toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),version:1,timezone:'Europe/Istanbul'})}
  add(earlier,'previous','Previous event');add(later,'later','Later event');await f.store.loadCalendar(undefined,undefined,true);await f.flush()
  assert.equal(document.querySelector('.calendar-add'),null);assert.equal(document.querySelector('.inspector-tabs'),null);assert.equal(document.querySelector('.inspector-task-list'),null);assert.ok(document.querySelector('.inspector-add'))
  document.querySelector('button[aria-label="tasks.calendarPeriod"]').click();await f.flush()
  ;[...document.querySelectorAll('.select-option')].find(button=>button.textContent.trim()==='tasks.agenda').click();await f.flush();await f.flush()
  const agenda=document.querySelector('.calendar-agenda');assert.ok(agenda);assert.equal(document.querySelector('.fc'),null)
  const selectedHeader=agenda.querySelector(`[data-agenda-day="${localDay(selected)}"] .agenda-day-heading`)
  assert.ok(selectedHeader);assert.ok(selectedHeader.textContent.includes(new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long'}).format(selected)))
  assert.equal(selectedHeader.getAttribute('aria-pressed'),'true');assert.ok(selectedHeader.classList.contains('is-selected'))
  assert.ok(agenda.textContent.includes('Previous event'));assert.ok(agenda.textContent.includes('Later event'))
  const laterSection=agenda.querySelector(`[data-agenda-day="${localDay(later)}"]`)
  agenda.getBoundingClientRect=()=>({top:0});laterSection.getBoundingClientRect=()=>({top:800-agenda.scrollTop})
  laterSection.querySelector('.agenda-day-heading').click();await f.flush();assert.equal(agenda.scrollTop,800,'only the internal list scrolls to the newly selected day')
  assert.equal(selectedHeader.getAttribute('aria-pressed'),'false');assert.equal(laterSection.querySelector('.agenda-day-heading').getAttribute('aria-pressed'),'true');assert.equal(agenda.querySelectorAll('.agenda-day-heading.is-selected').length,1)
  assert.equal(document.documentElement.scrollTop,0);assert.equal(document.body.scrollTop,0)
  laterSection.querySelector('.agenda-event').click();await f.flush();await f.flush()
  assert.equal(document.querySelector('.work-dialog input[aria-label="tasks.blockTitle"]').value,'Later event')
  document.querySelector('.work-dialog button[aria-label="common.close"]').click();await f.flush()
  document.querySelector('button[aria-label="tasks.calendarPeriod"]').click();await f.flush()
  ;[...document.querySelectorAll('.select-option')].find(button=>button.textContent.trim()==='tasks.week').click();await f.flush();await f.flush()
  assert.ok(document.querySelector('.fc'));assert.equal(document.querySelector('.calendar-agenda'),null)
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})
