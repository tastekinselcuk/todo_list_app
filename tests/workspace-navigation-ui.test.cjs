const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {parse,compileScript}=require('@vue/compiler-sfc'),vue=require('vue')

function fixture({mobile=false,cache=new Map(),storageFailed=false}={}){
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
 const events=[],drafts=new Map(),props=vue.reactive({module:'plans',view:'',page:'workspace'})
 const workspaces=vue.reactive({userId:'owner',activeId:'personal',available:[{id:'personal',name:'Kişisel'},{id:'team',name:'Ürün ekibi'}],get active(){return this.available.find(item=>item.id===this.activeId)},switchTo(id){if(this.available.some(item=>item.id===id)){this.activeId=id;events.push(['workspace',id])}}})
 const deps={vue:{...vue,Transition:(props,{slots})=>vue.h(vue.BaseTransition,{...props,onLeave(_element,done){queueMicrotask(done)}},slots)},'vue-i18n':{useI18n:()=>({t:key=>key})},'@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'@/lib/workspaceScope':{useWorkspaceDraft:(key,value)=>{if(!drafts.has(key))drafts.set(key,vue.ref(value));return drafts.get(key)}}}
 const drag={}
 deps['vuedraggable']={default:{inheritAttrs:false,props:['modelValue','itemKey','tag'],emits:['start','end','update:modelValue'],setup(props,{attrs,slots,emit}){
  drag.start=()=>emit('start');drag.end=()=>emit('end');drag.update=ids=>emit('update:modelValue',ids.map(id=>props.modelValue.find(item=>item.value===id)||{value:id}))
  return()=>vue.h('div',attrs,props.modelValue.map(element=>slots.item({element})))
 }}}
 deps['@/lib/storage']={readStoredJSON(key,fallback,valid){try{const value=JSON.parse(cache.get(key));return valid(value)?value:fallback}catch{return fallback}},writeStoredJSON(key,value){if(storageFailed)return false;cache.set(key,JSON.stringify(value));return true}}
 const evaluate=source=>{const exports={};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require','document','window','HTMLElement','Node','navigator'])(exports,name=>deps[name]||require(name),doc,dom.window,dom.window.HTMLElement,dom.window.Node,dom.window.navigator);return exports}
 deps['./moduleCatalog']=evaluate(fs.readFileSync('src/lib/moduleCatalog.ts','utf8'));deps['@/lib/moduleCatalog']=deps['./moduleCatalog'];deps['@/lib/workspaceTabOrder']=evaluate(fs.readFileSync('src/lib/workspaceTabOrder.ts','utf8'));deps['@/lib/workspaceSections']=evaluate(fs.readFileSync('src/lib/workspaceSections.ts','utf8'))
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
 return {dom,doc,props,enabled,events,workspaces,flush,drag,cache,get nativeMenus(){return nativeMenus},
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

test('all workspace sections expose direct sibling tabs with consistent active state and keyboard navigation',async()=>{
 const f=fixture();try{
  const tabs=()=>f.doc.querySelector('.workspace-module-tabs'),items=()=>Array.from(tabs().querySelectorAll('[role="tab"]'))
  const choose=async label=>{tabs().querySelector(`[aria-label="${label}"]`).click();await f.flush()}
  const active=()=>items().filter(item=>item.getAttribute('aria-selected')==='true')
  assert.equal(items().length,4);assert.equal(f.doc.querySelector('.workspace-module-picker'),null)
  assert.equal(active().length,1);assert.equal(active()[0].getAttribute('aria-label'),'workspace.modules.plansName')
  await choose('workspace.modules.detailedName');assert.equal(f.props.module,'detailed');assert.equal(active()[0].getAttribute('aria-label'),'workspace.modules.detailedName')
  assert.equal(f.doc.querySelector('.workspace-rail [data-section="notes"]').getAttribute('aria-current'),'page')
  f.doc.querySelector('.workspace-rail [data-section="finance"]').click();await f.flush();assert.equal(items().length,2)
  await choose('finance.positions');assert.deepEqual(f.events.at(-1),['view','finance','position']);assert.equal(active()[0].getAttribute('aria-label'),'finance.positions')
  await choose('finance.cashflow');assert.deepEqual(f.events.at(-1),['view','finance','transaction']);assert.equal(active().length,1)
  f.doc.querySelector('.workspace-rail [data-section="life"]').click();await f.flush();assert.equal(items().length,2)
  await choose('workspace.modules.activitiesName');assert.equal(f.props.module,'activities');assert.equal(active()[0].getAttribute('aria-label'),'workspace.modules.activitiesName')
  f.doc.querySelector('.workspace-rail [data-section="learning"]').click();await f.flush();assert.equal(items().length,3)
  await choose('study.views.mistakes');assert.deepEqual(f.events.at(-1),['view','learning','mistakes']);assert.equal(active()[0].getAttribute('aria-label'),'study.views.mistakes')
  const press=async key=>{active()[0].focus();active()[0].dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));await f.flush();assert.equal(f.doc.activeElement,active()[0]);assert.equal(items().filter(item=>item.tabIndex===0).length,1)}
  await press('ArrowRight');assert.equal(f.props.module,'flashcards')
  await press('ArrowRight');assert.deepEqual(f.events.at(-1),['view','learning','topics'])
  await press('ArrowLeft');assert.equal(f.props.module,'flashcards')
  await press('Home');assert.deepEqual(f.events.at(-1),['view','learning','topics'])
  await press('End');assert.equal(f.props.module,'flashcards')
  f.enabled.value=['learning'];f.props.module='learning';await f.flush();assert.equal(items().length,2);assert.equal(tabs().querySelector('[aria-label="study.views.today"]'),null)
  f.enabled.value=['flashcards'];f.props.module='flashcards';await f.flush();assert.equal(items().length,1)
  f.enabled.value=['tasks','periodic','plans','learning','flashcards'];await f.flush()
  f.doc.querySelector('.workspace-rail [data-section="planning"]').click();await f.flush();assert.equal(items().length,2)
  assert.equal(tabs().textContent.includes('tasks.board'),false);assert.equal(tabs().textContent.includes('tasks.list'),false)
  await choose('tasks.calendar');assert.deepEqual(f.events.at(-1),['module','tasks']);assert.equal(active()[0].getAttribute('aria-label'),'tasks.calendar')
  f.enabled.value=['plans'];f.props.module='plans';f.props.view='';await f.flush();assert.equal(items().length,1);assert.equal(active().length,1)
  f.enabled.value=[];await f.flush();assert.equal(tabs(),null)
 }finally{f.close()}
})

test('mobile sibling tabs remain directly selectable with accessible names',async()=>{
 const f=fixture({mobile:true});try{
  const tabs=f.doc.querySelector('.workspace-module-tabs');assert.equal(tabs.querySelectorAll('[role="tab"]').length,4)
  tabs.querySelector('[aria-label="workspace.modules.codeName"]').click();await f.flush();assert.equal(f.props.module,'code');assert.equal(tabs.querySelector('[aria-selected="true"]').getAttribute('aria-label'),'workspace.modules.codeName')
  assert.equal(f.doc.querySelector('.select-menu'),null);assert.equal(tabs.querySelectorAll('[aria-selected="true"]').length,1)
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


test('every main section can reorder sibling tabs by dragging without changing selection and restores each saved order',async()=>{
 const cache=new Map(),f=fixture({cache})
 const orders={notes:['plans','detailed','secure','code'],planning:['tasks','periodic'],learning:['learning:topics','learning:mistakes','flashcards'],life:['workout','activities'],finance:['finance:transaction','finance:position']}
 try{
  for(const [section,original]of Object.entries(orders)){
   f.props.module=original[0].split(':')[0];f.props.view=original[0].split(':')[1]||'';await f.flush()
   const selected=f.props.module,view=f.props.view,ids=()=>Array.from(f.doc.querySelectorAll('.workspace-module-tabs [role=tab]')).map(tab=>tab.dataset.tabValue)
   assert.deepEqual(ids(),original)
   f.drag.start();f.drag.update([...original].reverse());f.drag.end();await f.flush()
   assert.deepEqual(ids(),[...original].reverse());assert.equal(f.props.module,selected);assert.equal(f.props.view,view)
   f.doc.querySelector('.workspace-module-tabs [role=tab]').click();await f.flush();assert.equal(f.props.module,selected,'a release click must not select the dragged tab')
   assert.deepEqual(JSON.parse(cache.get(`workspace:owner:personal:section-tab-order:${section}:v1`)),[...original].reverse())
  }
 }finally{f.close()}
 const reopened=fixture({cache});try{
  for(const original of Object.values(orders)){
   reopened.props.module=original[0].split(':')[0];await reopened.flush()
   assert.deepEqual(Array.from(reopened.doc.querySelectorAll('.workspace-module-tabs [role=tab]')).map(tab=>tab.dataset.tabValue),[...original].reverse())
  }
 }finally{reopened.close()}
})

test('keyboard reordering preserves focus and activation; hidden modules retain their slots and workspace/account orders stay separate',async()=>{
 const f=fixture();try{
  const ids=()=>Array.from(f.doc.querySelectorAll('.workspace-module-tabs [role=tab]')).map(tab=>tab.dataset.tabValue)
  const press=async(id,key)=>{const tab=f.doc.querySelector(`[data-tab-value="${id}"]`);tab.focus();tab.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key,altKey:true,bubbles:true,cancelable:true}));await f.flush();assert.equal(f.doc.activeElement.dataset.tabValue,id)}
  await press('plans','ArrowRight');assert.deepEqual(ids(),['detailed','plans','secure','code']);assert.equal(f.props.module,'plans')
  await press('code','ArrowRight');assert.deepEqual(ids(),['detailed','plans','secure','code'])
  f.enabled.value=f.enabled.value.filter(id=>id!=='secure');await f.flush()
  f.drag.start();f.drag.update(['code','plans','detailed']);f.drag.end();await f.flush();assert.deepEqual(ids(),['code','plans','detailed'])
  f.enabled.value.push('secure');await f.flush();assert.deepEqual(ids(),['code','plans','secure','detailed'])
  f.workspaces.activeId='team';await f.flush();assert.deepEqual(ids(),['plans','detailed','secure','code'])
  f.workspaces.activeId='personal';await f.flush();assert.deepEqual(ids(),['code','plans','secure','detailed'])
  f.workspaces.userId='other';await f.flush();assert.deepEqual(ids(),['plans','detailed','secure','code'])
 }finally{f.close()}
})

test('invalid or stale drag updates never change order and blocked storage does not break in-session reordering',async()=>{
 const cache=new Map([['workspace:owner:personal:section-tab-order:notes:v1','["code","code","retired",3,"plans"]']]),f=fixture({cache,storageFailed:true})
 try{
  const ids=()=>Array.from(f.doc.querySelectorAll('.workspace-module-tabs [role=tab]')).map(tab=>tab.dataset.tabValue)
  assert.deepEqual(ids(),['code','plans','detailed','secure'])
  f.drag.start();f.drag.update(['code','plans','plans','secure']);await f.flush();assert.deepEqual(ids(),['code','plans','detailed','secure'])
  f.workspaces.activeId='team';await f.flush();f.drag.update(['code','plans','detailed','secure']);f.drag.end();await f.flush();assert.deepEqual(ids(),['plans','detailed','secure','code'])
  f.drag.start();f.drag.update(['code','plans','detailed','secure']);f.drag.end();await f.flush();assert.deepEqual(ids(),['code','plans','detailed','secure'])
  f.props.module='detailed';await f.flush();assert.deepEqual(ids(),['code','plans','detailed','secure'],'a normal tab switch keeps the current order even when storage is unavailable')
 }finally{f.close()}
})
