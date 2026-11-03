const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),vue=require('vue')
const {parse,compileScript}=require('@vue/compiler-sfc')

test('the same task view navigation stays above capture forms across list, board and calendar',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main></main>'),doc=dom.window.document,runtime=require('@vue/runtime-dom'),calls=[]
 const previous=new Map(['Document','ShadowRoot'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const key of previous.keys())globalThis[key]=dom.window[key]
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,ns)=>ns==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:text=>doc.createTextNode(text),createComment:text=>doc.createComment(text),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 const store=vue.reactive({ready:true,project:'',projects:[{id:'p',name:'Work',archived:false}],tasks:[],blocks:[],deadlines:[],counts:{todo:0,doing:0,done:0},total:0,hasMore:false,loading:false,saving:false,calendarReady:true,error:'',calendarError:'',calendarLoading:false,
  async setCalendarActive(active){calls.push(['calendar',active])},async selectProject(value){this.project=value},async load(){},async loadCalendar(){},async mutate(...args){calls.push(['mutate',...args]);return true}})
 store.selectProject=async value=>{store.project=value}
 const navigation=vue.ref(null),navigationKey=Symbol(),reportKey=Symbol(),reports=[]
 const Calendar={setup:()=>()=>vue.h('div',{class:'work-calendar'},[vue.h('div',{class:'calendar-chrome'},'Calendar controls'),vue.h('div',{class:'calendar-grid'},'Calendar')])}
 const dependencies={vue:{...vue,defineAsyncComponent:()=>Calendar},'vue-i18n':{useI18n:()=>({t:key=>key})},'../stores/tasks':{useTasksStore:()=>store},'../lib/tasks':{taskStatuses:['todo','doing','done']},'@/stores/workspaces':{useWorkspacesStore:()=>({sessionKey:'scope',activeId:'workspace',userId:'user'})},'@/lib/workspaceScope':{useModuleLoad(){}},'@/lib/searchNavigation':{useSearchReveal(){}},'@/lib/workspaceNavigation':{workspaceNavigationKey:navigationKey,workspaceActiveViewKey:reportKey},'@/lib/workspaceTrash':{},'./TaskRow.vue':{},'./WorkEditor.vue':{},'@/components/ui/CustomSelect.vue':{default:{props:['modelValue','options','disabled'],emits:['update:modelValue'],setup:(p,{emit})=>()=>vue.h('select',{value:p.modelValue,disabled:p.disabled,onChange:event=>emit('update:modelValue',event.target.value)},p.options.map(option=>vue.h('option',{value:option.value},option.label)))}}}
 const exports={};vm.compileFunction(ts.transpileModule(compileScript(parse(fs.readFileSync('src/features/tasks/components/Tasks.vue','utf8')).descriptor,{id:'tasks-navigation-dom',inlineTemplate:true}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require','crypto'])(exports,name=>dependencies[name]||require(name),require('node:crypto').webcrypto)
 const app=renderer.createApp(exports.default);app.provide(navigationKey,navigation);app.provide(reportKey,(...args)=>reports.push(args))
 const flush=async()=>{await vue.nextTick();await new Promise(setImmediate);await vue.nextTick()}
 try{
  app.mount(doc.querySelector('main'));await flush()
  const toolbar=doc.querySelector('.workspace-toolbar'),nav=toolbar.firstElementChild,views=nav.querySelector('[aria-label="tasks.view"]'),project=nav.querySelector('select')
  assert.equal(views.querySelectorAll('button').length,3);assert.equal(doc.querySelectorAll('[aria-label="tasks.view"]').length,1)
  assert.ok(doc.querySelector('.work-calendar'));assert.equal(toolbar.querySelector('form'),null)
  for(const mode of ['list','board','calendar','list']){
   Array.from(views.querySelectorAll('button')).find(button=>button.textContent==='tasks.'+mode).click();await flush()
   assert.equal(toolbar.firstElementChild,nav,'switching views never moves or recreates navigation');assert.equal(doc.querySelectorAll('[aria-label="tasks.view"]').length,1)
   assert.deepEqual(reports.at(-1),['tasks',mode]);assert.equal(doc.querySelector('.workspace-toolbar'),toolbar)
   if(mode==='calendar'){assert.ok(doc.querySelector('.work-calendar'));assert.equal(toolbar.querySelector('form'),null)}
   else {assert.equal(nav.nextElementSibling,toolbar.querySelector('form'));assert.ok(toolbar.querySelector('input[aria-label="tasks.title"]'))}
  }
  project.value='p';project.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await flush();assert.equal(store.project,'p')
  const form=toolbar.querySelector('form'),input=form.querySelector('input');input.value='Prepare proposal';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await flush()
  form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush();const write=calls.find(call=>call[0]==='mutate');assert.equal(write[1],'task');assert.equal(write[4].title,'Prepare proposal');assert.equal(write[4].project_id,'p');assert.equal(input.value,'')
  navigation.value={module:'tasks',view:'calendar'};await flush();assert.equal(toolbar.firstElementChild,nav);assert.ok(doc.querySelector('.work-calendar'))
  store.saving=true;await flush();assert.ok(Array.from(views.querySelectorAll('button')).every(button=>button.disabled))
 }finally{app.unmount();dom.window.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})
