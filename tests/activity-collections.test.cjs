const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),vue=require('vue')
const {parse,compileScript}=require('@vue/compiler-sfc'),{renderToString}=require('@vue/server-renderer'),{JSDOM}=require('jsdom')
function load(source,deps={},globals={}){const exports={},env={exports,require:name=>deps[name]||require(name),console,crypto,Intl,Date,URL,AbortController,setTimeout,clearTimeout,...globals};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,Object.keys(env))(...Object.values(env));return exports}
const lib=load(fs.readFileSync('src/features/activity_lists/lib/collections.ts','utf8'))
const item=(id,type='book',status='want')=>({id,type,status,title:'Title '+id,user_id:'owner',version:1,created_at:'2026-10-24',meta:{},image_url:null})
const group=id=>({id,name:'Collection '+id,color:'#64748B',version:1,archived_at:null,created_at:'2026-10-24'})
const copy=value=>JSON.parse(JSON.stringify(value))
test('General contains existing unassigned cards, mixed collections share one card and archived memberships stay intact',()=>{
 const items=[item('1'),item('2','movie'),item('3','place')],links=[{group_id:'a',item_id:'1'},{group_id:'a',item_id:'2'},{group_id:'b',item_id:'1'}]
 assert.deepEqual(lib.collectionItems(items,links,'general').map(i=>i.id),['3'])
 assert.deepEqual(lib.collectionItems(items,links,'a').map(i=>i.type),['book','movie'])
 assert.equal(lib.collectionItems(items,links,'a')[0],lib.collectionItems(items,links,'b')[0])
 for(const url of ['javascript:alert(1)','data:image/svg+xml,svg','https://user:pass@example.com/image'])assert.equal(lib.activityImage(url),null)
 assert.equal(lib.activityImage('https://example.com/image.jpg'),'https://example.com/image.jpg')
})
function storeFixture(responder){
 const workspace=vue.reactive({activeId:'workspace',sessionKey:'owner:workspace'}),auth={user:{id:'owner'}},calls=[],trashed=[]
 const legacy={select(){return this},eq(){return this},order:async()=>({data:[item('legacy')],error:null})}
 const module=load(fs.readFileSync('src/features/activity_lists/stores/activityLists.ts','utf8'),{'@/lib/workspaceScope':{defineWorkspaceStore:(_id,setup)=>setup,useWorkspaceClient:()=>({from:()=>legacy,listen(){},trash:async(...args)=>{trashed.push(args)}})},'@/stores/auth':{useAuthStore:()=>auth},'@/stores/workspaces':{useWorkspacesStore:()=>workspace},'@/lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push([name,args]);return responder(name,args)}}},'../lib/collections':lib})
 return {state:module.useActivityListsStore(),workspace,auth,calls,trashed}
}
test('library reads coalesce and a late response cannot reveal a previous workspace',async()=>{
 let resolve;const f=storeFixture(()=>new Promise(done=>resolve=done))
 const a=f.state.loadItems(),b=f.state.loadItems();assert.equal(a,b);assert.equal(f.calls.length,1)
 f.workspace.sessionKey='owner:new';resolve({data:{items:[item('old')],collections:[],memberships:[]}});assert.equal(await a,false);assert.equal(f.state.items.value.length,0)
})
test('status writes are versioned, failures preserve the saved state and trash receives the actual version',async()=>{
 let failed=true
 const f=storeFixture((name,args)=>name==='activity_library_load'?{data:{items:[item('1')],collections:[],memberships:[]}}:failed?{error:{message:'offline'}}:{data:{item:{...item('1'),status:args.payload.status,version:2},group_ids:[]}})
 await f.state.loadItems();assert.equal(await f.state.toggleStatus('1'),false);assert.equal(f.state.items.value[0].status,'want')
 failed=false;assert.equal(await f.state.toggleStatus('1'),true);assert.equal(f.state.items.value[0].status,'done');assert.equal(f.calls[2][1].expected_version,1)
 await f.state.deleteItem('1');assert.deepEqual(f.trashed,[['activities','1',2]]);assert.equal(f.state.items.value.length,0)
})
test('adding an existing card to another collection merges memberships without duplicating the card',async()=>{
 const f=storeFixture(name=>name==='activity_library_load'?{data:{items:[item('1')],collections:[group('a'),group('b')],memberships:[{group_id:'a',item_id:'1'}]}}:{data:{item:{...item('1'),version:2},group_ids:['a','b'],already_exists:false}})
 await f.state.loadItems();await f.state.addFromSearch({type:'book',title:'Title 1',externalId:'one',externalSource:'openlibrary'},'b','request')
 assert.equal(f.state.items.value.length,1);assert.equal(f.state.inCollection('a').length,1);assert.equal(f.state.inCollection('b').length,1);assert.equal(f.state.inCollection('general').length,0)
})
test('adding an already organized card from General reveals its existing collection instead of claiming a new General membership',async()=>{
 const f=controllerFixture();try{
  f.state.opened.value='general';await vue.nextTick();f.respond(async()=>({already_exists:true,group_ids:['a']}))
  await f.state.addResult({type:'book',title:'Title 1',externalSource:'openlibrary',externalId:'1'});assert.equal(f.state.opened.value,'a');assert.equal(f.toasts[0][0],'activities.alreadyExists')
 }finally{f.stop()}
})
test('duplicate clicks share one write and old-account mutation responses are discarded',async()=>{
 let release;const f=storeFixture(()=>new Promise(resolve=>release=resolve))
 const a=f.state.mutate('collection.create','request',{name:'A'}),b=f.state.mutate('collection.create','request',{name:'A'})
 assert.equal(a,b);assert.equal(f.calls.length,1);assert.deepEqual(copy(f.state.pending.value),['request'])
 f.workspace.sessionKey='different';release({data:{collection:group('old')}});await assert.rejects(a,/ACCESS_DENIED/);assert.equal(f.state.collections.value.length,0);assert.equal(f.state.busy.value,false)
})
test('before the collection migration, existing cards remain available inside General',async()=>{
 const f=storeFixture(()=>({error:{code:'PGRST202'}}));await f.state.loadItems()
 assert.equal(f.state.setupRequired.value,true);assert.equal(f.state.inCollection('general')[0].id,'legacy')
})
test('cards expose type-specific completion checks and viewers cannot alter them',async()=>{
 for(const type of ['book','movie','series','place'])for(const role of ['editor','viewer']){
  const compiled=compileScript(parse(fs.readFileSync('src/features/activity_lists/components/ActivityCard.vue','utf8')).descriptor,{id:'library-card',inlineTemplate:true}).content
  const component=load(compiled,{'vue-i18n':{useI18n:()=>({t:key=>key})},'@/lib/workspaceScope':{useModuleAccess:()=>({canWrite:vue.computed(()=>role==='editor')})},'../lib/collections':lib}).default
  const doc=new JSDOM(await renderToString(vue.createSSRApp(component,{item:item('1',type)}))).window.document
  const checkbox=doc.querySelector('[role=checkbox]');assert.equal(checkbox.getAttribute('aria-checked'),'false');assert.match(checkbox.textContent,new RegExp(`states.${type}.want`));assert.equal(checkbox.disabled,role==='viewer')
  assert.equal(doc.querySelectorAll('button').length,role==='viewer'?1:3)
 }
})
function controllerFixture(){
 const store=vue.reactive({items:[item('1'),item('2','movie')],collections:[group('a')],memberships:[{group_id:'a',item_id:'1'}],isLoading:false,busy:false,setupRequired:false,pending:[],error:null,loadItems:async()=>true})
 store.inCollection=id=>lib.collectionItems(store.items,store.memberships,id)
 const calls=[],toasts=[],reveals=[],scrolls=[],drafts=new Map(),workspace={sessionKey:'owner:workspace'}
 let respond=async()=>({collection:group('new')}),search=async()=>[]
 store.mutate=async(...args)=>{calls.push(args);return respond(...args)}
 store.addFromSearch=async(...args)=>{calls.push(args);return respond(...args)}
 const hooks={onDeactivated(){},onBeforeUnmount(){}}
 const component=load(compileScript(parse(fs.readFileSync('src/features/activity_lists/components/ActivityLists.vue','utf8')).descriptor,{id:'library-controller'}).content,{vue:{...vue,...hooks,inject:()=>((...args)=>scrolls.push(args))},'vue-i18n':{useI18n:()=>({t:key=>key})},'lucide-vue-next':{},'@/components/ui/CustomSelect.vue':{},'@/lib/workspaceScope':{useModuleAccess:()=>({canWrite:vue.ref(true)}),useModuleLoad(){},useWorkspaceDraft:(key,value)=>{const state=vue.ref(value);drafts.set(key,state);return state}},'@/lib/searchNavigation':{searchScrollKey:Symbol(),useSearchReveal:(_module,callback)=>reveals.push(callback)},'@/stores/ui':{useUIStore:()=>({addToast:(...args)=>toasts.push(args),addUndoToast(){}})},'@/stores/workspaces':{useWorkspacesStore:()=>workspace},'../stores/activityLists':{useActivityListsStore:()=>store},'../lib/collections':lib,'../lib/providers':{isTmdbConfigured:()=>true,searchActivities:(...args)=>search(...args)},'./ActivityCard.vue':{},'./ActivityCollectionEditor.vue':{}}).default
 const scope=vue.effectScope(),state=scope.run(()=>component.setup({}, {expose(){}}))
 return {state,store,calls,toasts,scrolls,workspace,respond:fn=>respond=fn,search:fn=>search=fn,reveal:reveals[0],stop:()=>scope.stop()}
}
test('library starts with collections and global search opens the specific collection containing the card',async()=>{
 const f=controllerFixture();try{
  assert.equal(f.state.opened.value,'');assert.deepEqual(copy(f.state.shownCollections.value.map(g=>g.id)),['general','a'])
  await f.reveal({record_id:'1'},()=>true);assert.equal(f.state.opened.value,'a');assert.equal(f.state.filteredItems.value[0].id,'1')
  await f.reveal({record_id:'2'},()=>true);assert.equal(f.state.opened.value,'general')
 }finally{f.stop()}
})
test('failed creation retains the draft and retries with the same ID; manual adds also retain failed input',async()=>{
 const f=controllerFixture();try{
  f.state.newName.value='Favorites';f.respond(async()=>{throw Error('offline')});await f.state.createCollection();assert.equal(f.state.newName.value,'Favorites')
  f.respond(async()=>({collection:group('new')}));await f.state.createCollection();assert.equal(f.calls[0][1],f.calls[1][1]);assert.equal(f.state.opened.value,'new');assert.equal(f.state.newName.value,'')
  await vue.nextTick();f.state.searchQuery.value='Cosmos';f.respond(async()=>{throw Error('offline')});await f.state.addManual();assert.equal(f.state.searchQuery.value,'Cosmos')
  f.respond(async()=>({already_exists:false}));await f.state.addManual();assert.equal(f.state.searchQuery.value,'');assert.equal(f.calls[2][2],f.calls[3][2])
 }finally{f.stop()}
})
test('stale catalog responses are discarded after switching collection or content type',async()=>{
 const f=controllerFixture();try{
  f.state.opened.value='a';await vue.nextTick();f.state.searchQuery.value='A';let release
  f.search(()=>new Promise(resolve=>release=resolve));const pending=f.state.runSearch();f.state.selectedType.value='book';await vue.nextTick();release([{title:'Old movie'}]);await pending
  assert.equal(f.state.searchResults.value.length,0);assert.equal(f.state.isSearching.value,false)
 }finally{f.stop()}
})
test('catalog cancellation reaches provider requests and deployed CSP allows only the needed catalog hosts',async()=>{
 const requested=[],source=fs.readFileSync('src/features/activity_lists/lib/providers.ts','utf8').replace('import.meta.env.VITE_TMDB_API_KEY',"'public-test-key'")
 const provider=load(source,{}, {fetch:async(url,options)=>{requested.push([url,options]);return {ok:true,json:async()=>url.includes('openlibrary')?{docs:[]}:{results:[]}}}})
 const abort=new AbortController();await provider.searchActivities('book','Cosmos',abort.signal);await provider.searchActivities('movie','Arrival',abort.signal)
 assert.equal(requested.length,2);assert.ok(requested.every(([,options])=>options.signal===abort.signal))
 const csp=fs.readFileSync('netlify.toml','utf8').match(/connect-src ([^;]+)/)[1]
 for(const host of ['https://openlibrary.org','https://api.themoviedb.org','https://photon.komoot.io','https://en.wikipedia.org'])assert.ok(csp.includes(host))
 assert.ok(!csp.includes(' https: ')&&!csp.includes(' *'),'catalog access does not open arbitrary connection destinations')
})
test('entering a collection starts at its toolbar when already scrolled inside the workspace',async()=>{
 const f=controllerFixture();try{
  const toolbar={},root={querySelector:()=>toolbar,getBoundingClientRect:()=>({top:-300})};f.state.libraryRoot.value=root
  f.state.opened.value='a';await vue.nextTick();await vue.nextTick();assert.deepEqual(f.scrolls,[[toolbar,'smooth']])
  root.getBoundingClientRect=()=>({top:200});f.state.opened.value='general';await vue.nextTick();await vue.nextTick();assert.equal(f.scrolls.length,1,'opening a collection at the top does not scroll the page unnecessarily')
 }finally{f.stop()}
})
test('opt-in top-layer dropdowns escape the workspace clipping and close on outside scroll',async()=>{
 const mounted=[],unmounted=[],listeners=new Map(),document={activeElement:null,addEventListener:(type,callback)=>listeners.set(type,callback),removeEventListener:type=>listeners.delete(type)},window={innerWidth:800,innerHeight:600,addEventListener:(type,callback)=>listeners.set(type,callback),removeEventListener:type=>listeners.delete(type)}
 const component=load(compileScript(parse(fs.readFileSync('src/components/ui/CustomSelect.vue','utf8')).descriptor,{id:'activity-floating-select'}).content,{vue:{...vue,onMounted:callback=>mounted.push(callback),onBeforeUnmount:callback=>unmounted.push(callback)},'lucide-vue-next':{}},{document,window}).default
 const props=vue.reactive({popover:true,options:[{value:'book',label:'Book'}],modelValue:'book',disabled:false}),scope=vue.effectScope(),state=scope.run(()=>component.setup(props,{expose(){},emit(){}}));let shown=0,hidden=0
 try{
  state.containerRef.value={getBoundingClientRect:()=>({width:120,left:700,top:150,bottom:182}),contains:()=>false}
  state.dropdownRef.value={offsetHeight:80,showPopover(){shown++},hidePopover(){hidden++},contains:()=>false};state.triggerRef.value={focus(){}}
  mounted.forEach(callback=>callback());state.toggle();await vue.nextTick();assert.equal(shown,1);assert.equal(state.floatingStyle.value.position,'fixed');assert.equal(state.floatingStyle.value.left,'632px')
  listeners.get('scroll')({target:{}});assert.equal(state.isOpen.value,false);assert.equal(hidden,1)
 }finally{unmounted.forEach(callback=>callback());scope.stop();assert.equal(listeners.size,0)}
})
test('collection dialog retains typed names on errors, supports multiple memberships and ignores accidental backdrop clicks',async()=>{
 const dom=new JSDOM('<button id="before">Before</button>'),doc=dom.window.document,runtime=require('@vue/runtime-dom')
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false}
 const component=load(compileScript(parse(fs.readFileSync('src/features/activity_lists/components/ActivityCollectionEditor.vue','utf8')).descriptor,{id:'activity-editor-dom',inlineTemplate:true}).content,{'vue-i18n':{useI18n:()=>({t:key=>key})},'@/components/ui/ColorPalette.vue':{default:{setup:()=>()=>vue.h('div')}},'@/lib/utils':load(fs.readFileSync('src/lib/utils.ts','utf8')),'../lib/collections':lib},{document:doc}).default
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,namespace)=>namespace==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:value=>doc.createTextNode(value),createComment:value=>doc.createComment(value),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 for(const mode of ['collection','memberships']){
  const props=vue.reactive({mode,collections:[group('a'),group('b')],groupIds:['a'],busy:false,error:null}),events=[],target=doc.createElement('div');doc.body.append(target);doc.querySelector('#before').focus();doc.body.style.overflow='auto'
  const app=renderer.createApp({setup:()=>()=>vue.h(component,{...props,onSave:payload=>events.push(['save',payload]),onClose:()=>events.push(['close'])})})
  try{
   app.mount(target);await vue.nextTick();const dialog=doc.querySelector('dialog');dialog.getBoundingClientRect=()=>({left:100,top:100,right:500,bottom:600})
   assert.equal(doc.body.style.overflow,'hidden');dialog.click();assert.equal(events.length,0)
   if(mode==='collection'){const input=dialog.querySelector('input');input.value='Favorites';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));props.error='failed';await vue.nextTick();assert.equal(input.value,'Favorites')}
   else{const checks=dialog.querySelectorAll('input[type=checkbox]');assert.equal(checks[0].checked,true);checks[1].click()}
   await vue.nextTick();const save=[...dialog.querySelectorAll('button')].find(button=>button.textContent==='common.save');save.click();await vue.nextTick()
   assert.equal(events[0][0],'save');if(mode==='collection')assert.equal(events[0][1].name,'Favorites');else assert.deepEqual(events[0][1].group_ids,['a','b'])
   props.busy=true;await vue.nextTick();dialog.dispatchEvent(new dom.window.Event('cancel',{cancelable:true}));assert.equal(events.length,1)
   props.busy=false;await vue.nextTick();dialog.dispatchEvent(new dom.window.MouseEvent('dblclick',{detail:2,clientX:20,clientY:20,bubbles:true}));assert.equal(events[1][0],'close')
  }finally{app.unmount();target.remove();assert.equal(doc.body.style.overflow,'auto');assert.equal(doc.activeElement.id,'before')}
 }
})
