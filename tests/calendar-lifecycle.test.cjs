const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue'),{parse,compileScript}=require('@vue/compiler-sfc'),{JSDOM}=require('jsdom')
async function fixture(withTasks=false){
 const dom=new JSDOM('<main></main>',{url:'http://localhost/',pretendToBeVisual:true}),doc=dom.window.document
 const keys=['window','document','Document','ShadowRoot','Element','HTMLElement','SVGElement','Node','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'],prior=new Map(keys.map(key=>[key,global[key]]))
 const frames=new Map();let frameId=0
 const globals={window:dom.window,document:doc,Document:dom.window.Document,ShadowRoot:dom.window.ShadowRoot,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,Node:dom.window.Node,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id)}
 Object.assign(global,globals);Object.defineProperty(dom.window.HTMLElement.prototype,'offsetWidth',{get(){return this.isConnected?1100:0}});Object.defineProperty(dom.window.HTMLElement.prototype,'offsetHeight',{get(){return this.isConnected?500:0}});dom.window.matchMedia=()=>({matches:false});dom.window.scrollTo=()=>{}
 const errors=[],warnings=[],external=[],locale=vue.ref('en'),view=vue.ref('calendar'),active=vue.ref(true)
 const props=vue.reactive({blocks:[],tasks:[],deadlines:[],busy:false,loading:false,failed:false,hasMore:false,saveMove:async()=>true})
 const runtime=require('@vue/runtime-dom'),renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,ns)=>ns==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:text=>doc.createTextNode(text),createComment:text=>doc.createComment(text),querySelector:q=>doc.querySelector(q),insertStaticContent(content,parent,anchor){const node=doc.createElement('template');node.innerHTML=content;const first=node.content.firstChild,last=node.content.lastChild;parent.insertBefore(node.content,anchor);return[first,last]}})
 const deps={vue,'vue-i18n':{useI18n:()=>({t:key=>key,locale})},'@/components/ui/CustomSelect.vue':{default:{props:['modelValue','options'],emits:['update:modelValue'],setup(props,{emit}){return()=>vue.h('select',{class:'period-select',value:props.modelValue,onChange:e=>emit('update:modelValue',e.target.value)},props.options.map(o=>vue.h('option',{value:o.value},o.label)))}}},'./ExternalCalendars.vue':{default:{emits:['update:events'],setup(_props,{emit,expose}){external.push(events=>emit('update:events',events));expose({openEvent(){}});return()=>vue.h('span','External calendars')}}}}
 const load=source=>{const exports={};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['exports','require',...Object.keys(globals)])(exports,name=>deps[name]||require(name),...Object.values(globals));return exports}
 deps['../lib/tasks']=load(fs.readFileSync('src/features/tasks/lib/tasks.ts','utf8'))
 deps['../lib/connectedCalendars']=load(fs.readFileSync('src/features/tasks/lib/connectedCalendars.ts','utf8'))
 deps['./CalendarProviderIcon.vue']={default:load(compileScript(parse(fs.readFileSync('src/features/tasks/components/CalendarProviderIcon.vue','utf8')).descriptor,{id:'calendar-provider-icon',inlineTemplate:true}).content).default}
 deps['./CalendarSurface.vue']={default:load(compileScript(parse(fs.readFileSync('src/features/tasks/components/CalendarSurface.vue','utf8')).descriptor,{id:'calendar-surface',inlineTemplate:true}).content).default}
 deps['./CalendarAgenda.vue']={default:load(compileScript(parse(fs.readFileSync('src/features/tasks/components/CalendarAgenda.vue','utf8')).descriptor,{id:'calendar-agenda',inlineTemplate:true}).content).default}
 const descriptor=parse(fs.readFileSync('src/features/tasks/components/WorkCalendar.vue','utf8')).descriptor
 const WorkCalendar=load(compileScript(descriptor,{id:'calendar-lifecycle',inlineTemplate:true}).content).default
 const SimpleHost={setup:()=>()=>vue.h('div',[vue.h('button',{class:'list-view',onClick:()=>view.value='list'},'List'),vue.h('button',{class:'calendar-view',onClick:()=>view.value='calendar'},'Calendar'),view.value==='calendar'?vue.h(WorkCalendar,props):vue.h('p',{class:'task-list'},'Task list')])}
 const store=vue.reactive({ready:true,tasks:[],projects:[],blocks:[],deadlines:[],project:'',counts:{todo:0,doing:0,done:0},total:0,hasMore:false,loading:false,calendarLoading:false,calendarReady:false,saving:false,error:'',calendarError:'',async setCalendarActive(){},async load(){return true},async loadCalendar(){return true}})
 deps['vue']={...vue,defineAsyncComponent:()=>vue.defineAsyncComponent(async()=>WorkCalendar)}
 deps['@/lib/workspaceScope']={useModuleLoad:fn=>vue.onMounted(fn)}
 deps['@/lib/searchNavigation']={useSearchReveal(){}}
 deps['@/lib/workspaceNavigation']={workspaceNavigationKey:Symbol(),workspaceActiveViewKey:Symbol()}
 deps['@/stores/workspaces']={useWorkspacesStore:()=>({sessionKey:'owner:workspace',activeId:'workspace',userId:'owner'})}
 deps['@/lib/workspaceTrash']={moveToTrash:async()=>{}}
 deps['../stores/tasks']={useTasksStore:()=>store}
 deps['./TaskRow.vue']={default:{props:['task'],setup:props=>()=>vue.h('p',props.task.title)}}
 deps['./WorkEditor.vue']={default:{setup:()=>()=>null}}
 deps['./ProjectSelect.vue']={default:{setup:()=>()=>vue.h('button','Projects')}}
 deps['./TaskCompletionDialog.vue']={default:{setup:()=>()=>null}}
 const Tasks=load(compileScript(parse(fs.readFileSync('src/features/tasks/components/Tasks.vue','utf8')).descriptor,{id:'real-tasks-lifecycle',inlineTemplate:true}).content).default
 const Host=withTasks?Tasks:SimpleHost

 const app=renderer.createApp({setup:()=>()=>vue.h(vue.KeepAlive,null,{default:()=>active.value?vue.h(Host):vue.h('p','Other module')})})
 app.config.errorHandler=error=>errors.push(error);app.config.warnHandler=message=>warnings.push(message)
 const flush=async()=>{await vue.nextTick();await new Promise(setImmediate);for(const [id,fn]of [...frames]){frames.delete(id);fn()};await vue.nextTick();await new Promise(setImmediate)}
 app.mount(doc.querySelector('main'));await flush()
 return {dom,doc,store,errors,warnings,external,props,locale,view,active,frames,flush,async close(){app.unmount();await flush();dom.window.close();for(const[key,value]of prior){if(value===undefined)delete global[key];else global[key]=value}}}
}
test('real Vue FullCalendar survives pending external events, resizing and repeated calendar/list teardown',async()=>{
 const f=await fixture();try{
  assert.ok(f.doc.querySelector('.fc'))
  for(let i=0;i<6;i++){
   const select=f.doc.querySelector('.period-select');select.value=['dayGridMonth','timeGridDay','listWeek'][i%3];select.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));await f.flush()
   f.locale.value=i%2?'en':'tr'
   const publish=f.external.at(-1)
   f.props.blocks=[{id:'block-'+i,title:'Work',starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),task_status:'todo'}]
   publish([{id:'external-'+i,start:new Date().toISOString(),end:new Date(Date.now()+1800000).toISOString(),title:'Meeting',calendar_name:'Outlook',color:'#3355aa'}])
   f.dom.window.dispatchEvent(new f.dom.window.Event('resize'))
   f.doc.querySelector('.list-view').click();await f.flush()
   assert.ok(f.doc.querySelector('.task-list'));assert.equal(f.doc.querySelector('.fc'),null)
   publish([]);await f.flush()
   f.doc.querySelector('.calendar-view').click();await f.flush();assert.ok(f.doc.querySelector('.fc'))
  }
  assert.deepEqual(f.errors.map(error=>error.message),[])
  f.active.value=false;await f.flush();f.props.loading=true;f.external.at(-1)([]);await f.flush();f.active.value=true;await f.flush();assert.ok(f.doc.querySelector('.fc'))
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})

test('leaving Tasks from its list must not construct a hidden calendar, and returning restores one live calendar',async()=>{
 const f=await fixture(true);try{
  const button=view=>Array.from(f.doc.querySelectorAll('.task-view-navigation button')).find(button=>button.textContent==='tasks.'+view)
  await f.flush();assert.ok(f.doc.querySelector('.fc'))
  button('list').click();await f.flush();assert.equal(f.doc.querySelector('.fc'),null)
  const instances=f.external.length
  f.active.value=false;await f.flush();assert.equal(f.external.length,instances,'deactivating a list cannot mount FullCalendar inside KeepAlive storage')
  f.external.at(-1)([]);await f.flush();f.active.value=true;await f.flush();await f.flush()
  assert.ok(f.doc.querySelector('.fc'));assert.equal(f.external.length,instances+1)
  button('list').click();await f.flush();button('calendar').click();await f.flush();await f.flush();assert.ok(f.doc.querySelector('.fc'))
  assert.deepEqual(f.errors.map(error=>error.message),[])
 }finally{await f.close()}
})
