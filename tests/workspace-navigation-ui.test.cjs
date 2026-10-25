const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {parse,compileScript}=require('@vue/compiler-sfc'),vue=require('vue')

function fixture({mobile=false}={}){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main></main><button id="outside">Outside</button>',{url:'http://localhost/'}),doc=dom.window.document,runtime=require('@vue/runtime-dom')
 const previous=new Map(['Document','ShadowRoot'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const key of previous.keys())globalThis[key]=dom.window[key]
 dom.window.matchMedia=query=>({matches:query.includes('min-width')?!mobile:true,addEventListener(){},removeEventListener(){}})
 Object.defineProperty(dom.window,'innerWidth',{value:mobile?390:1280});dom.window.scrollTo=()=>{}
 let nativeMenus=0
 dom.window.HTMLElement.prototype.showPopover=function(){nativeMenus++;this.dataset.shown='true'}
 dom.window.HTMLElement.prototype.hidePopover=function(){delete this.dataset.shown}
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,namespace)=>namespace==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:text=>doc.createTextNode(text),createComment:text=>doc.createComment(text),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 const events=[],drafts=new Map(),props=vue.reactive({module:'quick',view:'',page:'workspace'})
 const workspaces=vue.reactive({activeId:'personal',available:[{id:'personal',name:'Kişisel'},{id:'team',name:'Ürün ekibi'}],get active(){return this.available.find(item=>item.id===this.activeId)},switchTo(id){if(this.available.some(item=>item.id===id)){this.activeId=id;events.push(['workspace',id])}}})
 const deps={vue:{...vue,Transition:(props,{slots})=>vue.h(vue.BaseTransition,{...props,onLeave(_element,done){queueMicrotask(done)}},slots)},'vue-i18n':{useI18n:()=>({t:key=>key})},'@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'@/lib/workspaceScope':{useWorkspaceDraft:(key,value)=>{if(!drafts.has(key))drafts.set(key,vue.ref(value));return drafts.get(key)}}}
 const evaluate=source=>{const exports={};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require','document','window','HTMLElement','Node','navigator'])(exports,name=>deps[name]||require(name),doc,dom.window,dom.window.HTMLElement,dom.window.Node,dom.window.navigator);return exports}
 deps['./moduleCatalog']=evaluate(fs.readFileSync('src/lib/moduleCatalog.ts','utf8'));deps['@/lib/workspaceSections']=evaluate(fs.readFileSync('src/lib/workspaceSections.ts','utf8'))
 const compile=name=>evaluate(compileScript(parse(fs.readFileSync(`src/components/ui/${name}.vue`,'utf8')).descriptor,{id:name,inlineTemplate:true}).content).default
 deps['./CustomSelect.vue']={default:compile('CustomSelect')};deps['./WorkspacePicker.vue']={default:compile('WorkspacePicker')}
 const Rail=compile('WorkspaceRail'),Picker=compile('WorkspaceModulePicker'),enabled=vue.ref(deps['./moduleCatalog'].moduleCatalog.map(item=>item.id))
 const choose=module=>{props.page='workspace';events.push(['module',module]);props.module=module;props.view=''}
 const app=renderer.createApp({setup:()=>()=>vue.h('header',[
  vue.h(Rail,{modelValue:props.module,activePage:props.page,enabled:enabled.value,workspaceName:workspaces.active?.name,'onUpdate:modelValue':choose,onSearch:()=>events.push(['search']),onTrash:()=>events.push(['trash']),onManage:()=>events.push(['manage']),onAnalytics:()=>{props.page='analytics';events.push(['analytics'])},onSettings:()=>{props.page='settings';events.push(['settings'])}}),
  vue.h(Picker,{modelValue:props.module,enabled:enabled.value,activeView:props.view,'onUpdate:modelValue':choose,onNavigate:(module,view)=>{props.module=module;props.view=view;events.push(['view',module,view])}}),
 ])})
 app.mount(doc.querySelector('main'))
 const flush=async()=>{await vue.nextTick();await new Promise(setImmediate);await vue.nextTick()}
 return {dom,doc,props,enabled,events,workspaces,flush,get nativeMenus(){return nativeMenus},
  async hover(type='pointerenter'){const event=new dom.window.Event(type);Object.defineProperty(event,'pointerType',{value:'mouse'});doc.querySelector('.workspace-rail').dispatchEvent(event);await flush()},
  close(){app.unmount();dom.window.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
 }
}

test('the rail has only main sections and a searchable workspace picker that survives leaving the preview',async()=>{
 const f=fixture();try{
  await f.hover();const rail=f.doc.querySelector('.workspace-rail')
  assert.equal(rail.querySelectorAll('.rail-category').length,5);assert.equal(rail.querySelector('.rail-modules,.rail-finance-views'),null)
  const trigger=rail.querySelector('[aria-label="workspaces.switch"]');assert.ok(trigger);assert.match(trigger.textContent,/Kişisel/)
  trigger.click();await f.flush();await f.hover('pointerleave');assert.ok(rail.classList.contains('is-expanded'))
  const menu=f.doc.querySelector('.workspace-picker-menu');assert.ok(menu);assert.equal(menu.querySelector('.lucide-trash-2-icon'),null);assert.equal(menu.textContent.includes('trash.title'),false)
  const input=menu.querySelector('input');input.value='Ürün';input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await f.flush();assert.equal(menu.querySelectorAll('[data-workspace]').length,1)
  input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));await f.flush();assert.equal(f.doc.activeElement,menu.querySelector('[data-workspace]'))
  menu.querySelector('[data-workspace]').click();await f.flush();assert.equal(f.workspaces.activeId,'team');assert.deepEqual(f.events,[['workspace','team']])
  await f.hover();rail.querySelector('[aria-label="workspaceNav.search"]').click();await f.flush();assert.deepEqual(f.events.at(-1),['search']);assert.ok(rail.querySelector('[aria-label="workspaceNav.trash"]'))
 }finally{f.close()}
})

test('the header picker selects sibling notes and existing finance, learning and calendar views',async()=>{
 const f=fixture();try{
  const open=async()=>{f.doc.querySelector('.workspace-module-picker>button').click();await f.flush();return f.doc.querySelector('.workspace-module-picker [popover]')}
  let menu=await open();assert.equal(menu.querySelectorAll('button').length,6);assert.equal(menu.dataset.shown,'true');assert.ok(f.nativeMenus>0)
  Array.from(menu.querySelectorAll('button')).find(button=>button.textContent.includes('workspace.modules.detailedName')).click();await f.flush();assert.equal(f.props.module,'detailed')
  assert.equal(f.doc.querySelector('.workspace-rail [data-section="notes"]').getAttribute('aria-current'),'page')
  f.doc.querySelector('.workspace-rail [data-section="finance"]').click();await f.flush();menu=await open();assert.equal(menu.querySelectorAll('button').length,2)
  Array.from(menu.querySelectorAll('button')).find(button=>button.textContent.includes('finance.positions')).click();await f.flush();assert.deepEqual(f.events.at(-1),['view','finance','position']);assert.ok(f.doc.querySelector('.workspace-module-picker>button').textContent.includes('finance.positions'))
  f.doc.querySelector('.workspace-rail [data-section="learning"]').click();await f.flush();menu=await open();assert.equal(menu.querySelectorAll('button').length,4)
  Array.from(menu.querySelectorAll('button')).find(button=>button.textContent.includes('study.views.mistakes')).click();await f.flush();assert.deepEqual(f.events.at(-1),['view','learning','mistakes'])
  f.doc.querySelector('.workspace-rail [data-section="planning"]').click();await f.flush();menu=await open();assert.equal(menu.querySelectorAll('button').length,2)
  assert.equal(menu.textContent.includes('tasks.board'),false);assert.equal(menu.textContent.includes('tasks.list'),false)
  Array.from(menu.querySelectorAll('button')).find(button=>button.textContent.includes('tasks.calendar')).click();await f.flush();assert.deepEqual(f.events.at(-1),['module','tasks'])
  assert.ok(f.doc.querySelector('.workspace-module-picker>button').textContent.includes('tasks.calendar'))
  f.enabled.value=['quick'];f.props.module='quick';f.props.view='';await f.flush();menu=await open();assert.equal(menu.querySelectorAll('button').length,1)
 }finally{f.close()}
})

test('mobile navigation stays simple and its workspace menu is rendered inside the native drawer',async()=>{
 const f=fixture({mobile:true});try{
  const trigger=f.doc.querySelector('.rail-mobile-trigger');trigger.focus();trigger.click();await f.flush()
  const drawer=f.doc.querySelector('.rail-drawer');assert.equal(drawer.open,true);assert.equal(drawer.querySelectorAll('.drawer-sections [data-section]').length,5);assert.equal(drawer.querySelector('.drawer-section'),null)
  drawer.querySelector('[aria-label="workspaces.switch"]').click();await f.flush();const menu=drawer.querySelector('.workspace-picker-menu');assert.ok(menu,'workspace choices remain in the modal top layer')
  Array.from(menu.querySelectorAll('[data-workspace]')).find(button=>button.textContent.includes('Ürün ekibi')).click();await f.flush();assert.equal(f.workspaces.activeId,'team');assert.equal(drawer.open,false);assert.equal(f.doc.body.style.overflow,'');assert.equal(f.doc.activeElement,trigger)
 }finally{f.close()}
})


test('the same desktop rail keeps its pin and entries while only the active page changes',async()=>{
 const f=fixture();try{
  const rail=f.doc.querySelector('.workspace-rail'),buttons=()=>Array.from(rail.querySelectorAll('nav button,.rail-footer button'))
  const labels=buttons().map(button=>button.getAttribute('aria-label'))
  assert.deepEqual(labels.slice(-2),['app.analytics','app.settings'])
  rail.querySelector('.rail-mark').click();await f.flush();assert.equal(rail.hasAttribute('data-pinned-open'),true)
  for(const page of ['analytics','settings']){
   rail.querySelector(`[aria-label="app.${page}"]`).click();await f.flush()
   assert.equal(f.doc.querySelector('.workspace-rail'),rail)
   assert.deepEqual(buttons().map(button=>button.getAttribute('aria-label')),labels)
   assert.equal(rail.querySelectorAll('[aria-current="page"]').length,1)
   assert.equal(rail.querySelector('[aria-current="page"]').getAttribute('aria-label'),`app.${page}`)
   assert.equal(rail.hasAttribute('data-pinned-open'),true)
  }
  rail.querySelector('[data-section="notes"]').click();await f.flush()
  assert.equal(rail.querySelector('[aria-current="page"]').getAttribute('data-section'),'notes')
 }finally{f.close()}
})

test('mobile analytics and settings actions close the drawer and highlight the chosen page',async()=>{
 const f=fixture({mobile:true});try{
  const trigger=f.doc.querySelector('.rail-mobile-trigger'),drawer=f.doc.querySelector('.rail-drawer')
  for(const page of ['analytics','settings']){
   trigger.focus();trigger.click();await f.flush()
   const button=Array.from(drawer.querySelectorAll('.drawer-footer button')).find(button=>button.textContent.includes(`app.${page}`))
   button.click();await f.flush()
   assert.equal(drawer.open,false);assert.equal(f.doc.body.style.overflow,'');assert.equal(f.doc.activeElement,trigger)
   assert.equal(drawer.querySelectorAll('[aria-current="page"]').length,1)
   assert.equal(button.getAttribute('aria-current'),'page')
  }
 }finally{f.close()}
})
