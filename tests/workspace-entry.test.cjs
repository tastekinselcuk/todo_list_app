const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const vue=require('vue'),{parse,compileScript}=require('@vue/compiler-sfc')
const settle=async()=>{await vue.nextTick();await new Promise(setImmediate);await vue.nextTick()}
function evaluate(source,deps={}){
 const exports={}
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>deps[name]||require(name),crypto,console,AbortController,document:{addEventListener(){},removeEventListener(){},visibilityState:'visible'}})
 return exports
}
function cachedController(path,dependencies={},saved={}){
 const drafts=new Map(),reveals=[]
 const deps={vue,'vue-i18n':{useI18n:()=>({t:key=>key,locale:vue.ref('tr')})},'lucide-vue-next':{},
  '@/lib/utils':{isDialogBackdropDoubleClick:()=>false},'@/components/ui/CustomSelect.vue':{},
  '@/lib/searchNavigation':{useSearchReveal:(_module,callback)=>reveals.push(callback),searchScrollKey:Symbol()},
  '@/lib/workspaceScope':{useModuleLoad(){},useModuleAccess:()=>({canWrite:vue.ref(true)}),useWorkspaceDraft(key,initial){if(!drafts.has(key))drafts.set(key,vue.ref(key in saved?saved[key]:initial));return drafts.get(key)}},
  '@/stores/ui':{useUIStore:()=>({addToast(){},addUndoToast(){}})},...dependencies}
 const descriptor=parse(fs.readFileSync(path,'utf8')).descriptor
 const Component=evaluate(compileScript(descriptor,{id:'entry-test'}).content,deps).default
 const node=()=>({children:[],parent:null})
 const renderer=vue.createRenderer({createElement:node,createText:node,createComment:node,insert(child,parent,anchor){if(child.parent){const at=child.parent.children.indexOf(child);if(at>=0)child.parent.children.splice(at,1)}child.parent=parent;const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,child)},remove(child){if(child.parent){const at=child.parent.children.indexOf(child);if(at>=0)child.parent.children.splice(at,1);child.parent=null}},setText(){},setElementText(){},patchProp(){},parentNode:child=>child.parent,nextSibling(child){return child.parent?.children[child.parent.children.indexOf(child)+1]}})
 let state,mounts=0
 const visible=vue.ref(true),Panel={setup(){mounts++;state=Component.setup({}, {expose(){}});return()=>vue.h('section')}},Other={setup:()=>()=>vue.h('aside')}
 const app=renderer.createApp({setup:()=>()=>vue.h(vue.KeepAlive,null,{default:()=>visible.value?vue.h(Panel,{key:'panel'}):vue.h(Other,{key:'other'})})})
 app.mount(node())
 return {get state(){return state},get mounts(){return mounts},drafts,reveals,async leave(){visible.value=false;await settle()},async return(){visible.value=true;await settle()},close(){app.unmount()}}
}
function workoutFixture(){
 const routines=[{id:'routine',title:'Push',day_of_week:'Monday',exercises:[{id:'exercise',isCompleted:true}]}]
 let create=async()=>null
 const store=vue.reactive({routines,isSaving:false,isLoading:false,async fetchRoutines(){return true},addRoutine(...args){return create(...args)}})
 const f=cachedController('src/features/workout/components/WorkoutTracker.vue',{
  '../stores/workout':{useWorkoutStore:()=>store},'../lib/exercises':{fold:value=>value.toLowerCase()},
  './WorkoutRoutineCard.vue':{},'./WorkoutSequence.vue':{},'./ExerciseLibraryModal.vue':{},'./ExercisePreview.vue':{},
 },{'workout-active-routine':'routine'})
 return {...f,state:f.state,get mounts(){return f.mounts},store,create:callback=>create=callback}
}
test('a cached workout returns to programs, ignores the previously saved detail and preserves completion and unfinished input',async()=>{
 const f=workoutFixture();try{
  assert.equal(f.state.activeRoutine.value,undefined,'legacy saved detail does not choose the entry screen')
  f.state.activeId.value='routine';f.state.showLibrary.value=true;f.state.query.value='Push';f.state.newRoutineTitle.value='Unfinished program'
  await f.leave();await f.return()
  assert.equal(f.mounts,1,'the cached component stays mounted')
  assert.equal(f.state.activeRoutine.value,undefined);assert.equal(f.state.showLibrary.value,false);assert.equal(f.state.query.value,'')
  assert.equal(f.state.newRoutineTitle.value,'Unfinished program');assert.equal(f.store.routines[0].exercises[0].isCompleted,true)
  await f.reveals[0]({record_id:'routine'},()=>true);assert.equal(f.state.activeRoutine.value.id,'routine','an explicit search result still opens its target')
 }finally{f.close()}
})
test('a program saved after leaving its tab cannot reopen its detail or exercise modal on the next visit',async()=>{
 const f=workoutFixture();let resolve
 try{
  f.create(()=>new Promise(done=>resolve=done));f.state.newRoutineTitle.value='New program'
  const pending=f.state.createProgram();await f.leave();await f.return()
  const saved={id:'new',title:'New program',exercises:[]};f.store.routines.push(saved);resolve(saved);await pending
  assert.equal(f.state.activeId.value,'');assert.equal(f.state.showLibrary.value,false);assert.equal(f.state.newRoutineTitle.value,'')
 }finally{f.close()}
})
test('flashcard navigation leaves a test on the deck overview without modifying its cards or the new-card draft',async()=>{
 const deck={id:'deck',cards:[{id:'card',front:'Question',back:'Answer'}]},store=vue.reactive({decks:[deck]})
 const f=cachedController('src/features/flashcards/components/Flashcards.vue',{'@/features/flashcards/stores/flashcards':{useFlashcardStore:()=>store},'./FlashcardTest.vue':{},'./FlashcardMemoryGame.vue':{}})
 try{
  f.state.openDeck(deck);f.state.startTest();f.state.newCardFront.value='Unfinished question'
  await f.leave();await f.return()
  assert.equal(f.mounts,1);assert.equal(f.state.currentView.value,'decks');assert.equal(f.state.activeDeck.value,null)
  assert.equal(f.state.newCardFront.value,'Unfinished question');assert.equal(store.decks[0].cards[0].back,'Answer')
 }finally{f.close()}
})
test('detailed-note filters start clear and reset after leaving while the saved notes remain intact',async()=>{
 const store=vue.reactive({todos:[{id:'note',title:'Note',description:'Detail',completed:true,categoryId:'category'}],categories:[{id:'category',name:'Work'}]})
 const f=cachedController('src/features/todos/components/TodoBoard.vue',{'@/features/todos/stores/todo':{useTodoStore:()=>store},vuedraggable:{},'./TodoQuickAdd.vue':{},'./TodoFilters.vue':{},'./TodoCard.vue':{},'./CategoryModal.vue':{}},{'todo-categories':['old-category'],'todo-show-completed':false})
 try{
  assert.equal(f.state.filteredTodosArray.value.length,1,'old stored filters cannot hide notes on entry')
  f.state.selectedCategories.value=['other'];f.state.showCompleted.value=false;f.state.query.value='missing';f.state.isGrouped.value=true;f.state.showCategoryDialog.value=true
  assert.equal(f.state.filteredTodosArray.value.length,0)
  await f.leave();await f.return()
  assert.equal(f.mounts,1);assert.equal(f.state.filteredTodosArray.value.length,1);assert.equal(f.state.isGrouped.value,false);assert.equal(f.state.showCategoryDialog.value,false)
  assert.equal(store.todos[0].completed,true)
 }finally{f.close()}
})
test('returning to lists shows collections with clear filters, while explicit search can still reveal a collection',async()=>{
 const lib=evaluate(fs.readFileSync('src/features/activity_lists/lib/collections.ts','utf8'))
 const store=vue.reactive({collections:[{id:'collection',name:'Books'}],items:[{id:'book',type:'book',status:'done'}],memberships:[{item_id:'book',group_id:'collection'}],inCollection(id){return lib.collectionItems(this.items,this.memberships,id)},async loadItems(){return true}})
 const f=cachedController('src/features/activity_lists/components/ActivityLists.vue',{'@/stores/workspaces':{useWorkspacesStore:()=>({sessionKey:'owner:workspace'})},'../stores/activityLists':{useActivityListsStore:()=>store},'../lib/collections':lib,'../lib/providers':{},'./ActivityCard.vue':{},'./ActivityCollectionEditor.vue':{}},{'activity-open-collection':'collection','activity-search':'stale query'})
 try{
  assert.equal(f.state.opened.value,'');assert.equal(f.state.searchQuery.value,'')
  f.state.opened.value='collection';await settle();f.state.typeFilter.value='movie';f.state.statusFilter.value='want';f.state.searchQuery.value='old';f.state.showArchived.value=true
  await f.leave();await f.return()
  assert.equal(f.mounts,1);assert.equal(f.state.opened.value,'');assert.equal(f.state.typeFilter.value,'all');assert.equal(f.state.statusFilter.value,'all');assert.equal(f.state.searchQuery.value,'');assert.equal(f.state.showArchived.value,false)
  assert.equal(store.items[0].status,'done');await f.reveals[0]({record_id:'book'},()=>true);assert.equal(f.state.opened.value,'collection')
 }finally{f.close()}
})
test('learning returns to topics with collapsed studies and clear filters without changing saved progress',async()=>{
 const study=evaluate(fs.readFileSync('src/features/learning/lib/study.ts','utf8'))
 const progress={status:'done',seconds:1500},subject={id:'subject',title:'Professional development',topics:[{id:'topic',title:'Communication'}]}
 const store=vue.reactive({subjects:[subject],dueMistakes:[],mistakes:[],busy:false,isLoading:false,setupRequired:false,state:()=>progress,async fetchSubjects(){},async fetchMistakes(){}})
 const f=cachedController('src/features/learning/components/LearningTracker.vue',{
  '../stores/learning':{useLearningStore:()=>store},'../lib/study':study,'../lib/images':{},
  '../lib/useStudyOrder':{useStudyOrder:()=>({ordered:vue.ref([])})},
  '@/lib/workspaceNavigation':{workspaceNavigationKey:Symbol(),workspaceActiveViewKey:Symbol(),workspaceOpenItemKey:Symbol()},
  '@/features/pomodoro/stores/pomodoro':{usePomodoroStore:()=>vue.reactive({taskStatsSequence:0,durations:{focus:25}})},
  vuedraggable:{},'./LearningDialog.vue':{},'./LearningSubjectItem.vue':{},'./LearningTitle.vue':{},'./LearningTopicDetails.vue':{},'./LearningTemplatePicker.vue':{},
 },{'subject-view':'mistakes'})
 try{
  assert.equal(f.state.view.value,'topics');f.state.view.value='mistakes';f.state.expanded.value='subject';f.state.status.value='done';f.state.showArchive.value=true;f.state.mistakeFilter.value='resolved';await settle();f.state.query.value='old search'
  await f.leave();await f.return()
  assert.equal(f.mounts,1);assert.equal(f.state.view.value,'topics');assert.equal(f.state.expanded.value,null);assert.equal(f.state.query.value,'');assert.equal(f.state.status.value,'all');assert.equal(f.state.mistakeFilter.value,'open');assert.equal(f.state.showArchive.value,false)
  assert.equal(store.state().seconds,1500);assert.equal(store.state().status,'done')
  await f.reveals[0]({record_id:'subject'},()=>true);assert.equal(f.state.expanded.value,'subject')
 }finally{f.close()}
})
test('a learning subject does not reopen its old topic detail or add form after returning to the module',async()=>{
 const f=cachedController('src/features/learning/components/LearningSubjectItem.vue',{
  '../stores/learning':{useLearningStore:()=>({})},'../lib/study':{},'../lib/useStudyOrder':{useStudyOrder:()=>({ordered:vue.ref([])})},vuedraggable:{},
 })
 try{
  f.state.detailTopic.value='old-topic';f.state.adding.value=true;f.state.singleDraft.value='Unfinished topic'
  await f.leave();await f.return()
  assert.equal(f.mounts,1);assert.equal(f.state.detailTopic.value,'');assert.equal(f.state.adding.value,false);assert.equal(f.state.singleDraft.value,'Unfinished topic')
 }finally{f.close()}
})
