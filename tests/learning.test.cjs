const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),vue=require('vue')
const {parse,compileScript}=require('@vue/compiler-sfc')
function load(source,deps={},globals={}){const exports={},env={exports,require:name=>deps[name]||require(name),console,crypto,Intl,Date,setTimeout,clearTimeout,...globals};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,Object.keys(env))(...Object.values(env));return exports}
const study=load(fs.readFileSync('src/features/learning/lib/study.ts','utf8')),templates=load(fs.readFileSync('src/features/learning/lib/templates.ts','utf8'))
const exams=load(fs.readFileSync('src/features/learning/lib/examTemplates.ts','utf8'),{'./templates':templates})
const copy=value=>JSON.parse(JSON.stringify(value))
test('study filtering keeps archives separate and calendar planning rejects impossible dates',()=>{
 const s={id:'s',title:'Physics',topics:[{id:'1',title:'Waves'},{id:'2',title:'Heat',archived:true},{id:'3',title:'Optics'}]},state=(_sid,id)=>({status:id==='1'?'done':'todo'})
 assert.equal(study.studyTopics(s,'physics','done',state).length,1);assert.equal(study.studyTopics(s,'heat','all',state).length,0);assert.equal(study.studyTopics(s,'heat','all',state,true).length,1)
 assert.equal(study.isStudyDue('2026-10-24','2026-10-23'),false);assert.equal(study.isStudyDue('2026-10-22','2026-10-23'),true);assert.equal(study.isStudyDue(null),false)
 for(const args of [['2026-02-30','09:00',45],['2026-10-23','25:00',45],['2026-10-23','09:00',0]])assert.throws(()=>study.studyPlan(...args))
 const plan=study.studyPlan('2026-10-23','23:45',45);assert.equal(Date.parse(plan.ends_at)-Date.parse(plan.starts_at),45*60000)
})
test('template topic keys remain unique and imports contain only explicitly selected topics',()=>{
 const topics=templates.tytTemplate.subjects.flatMap(s=>s.topics)
 assert.equal(new Set(topics.map(t=>t.key)).size,topics.length);assert.ok(topics.length>100)
 assert.ok(topics.every(topic=>Array.from(topic.title).length<=study.topicNameLimit));assert.ok(templates.tytTemplate.subjects.every(s=>Array.from(s.title).length<=study.studyNameLimit))
 const selected=templates.selectedTemplate(new Set([topics[0].key,topics[1].key]))
 assert.equal(selected.subjects.length,1);assert.equal(selected.subjects[0].topics.length,2);assert.equal(selected.revision,'2026-10')
 assert.equal(templates.selectedTemplate(new Set()).subjects.length,0)
})

test('compact names and visible ordering preserve hidden archive slots',()=>{
 assert.equal(study.validStudyName('  Work  ',80),true);assert.equal(study.validStudyName(' ',80),false)
 assert.equal(study.validStudyName('x'.repeat(81),80),false);assert.equal(study.validStudyName('x'.repeat(100),100),true)
 assert.deepEqual(Array.from(study.mergeStudyOrder(['one','archived','three'],['three','one'])),['three','archived','one'])
 assert.throws(()=>study.mergeStudyOrder(['one'],['foreign']));assert.throws(()=>study.mergeStudyOrder(['one'],['one','one']))
})

test('all eleven exam families have sourced, dated templates within the actual import API limits',()=>{
 assert.equal(exams.examFamilies.length,11);assert.equal(exams.examTemplates.length,17)
 assert.equal(new Set(exams.examTemplates.map(t=>t.key)).size,17)
 for(const family of exams.examFamilies)assert.ok(exams.examTemplates.some(t=>t.family===family))
 for(const template of exams.examTemplates){
  assert.equal(template.checkedAt,'2026-10-24');assert.ok(template.sources.length)
  for(const source of template.sources){const u=new URL(source.url);assert.equal(u.protocol,'https:');assert.ok(['meb.gov.tr','osym.gov.tr','ielts.org','ets.org'].some(domain=>u.hostname===domain||u.hostname.endsWith('.'+domain)));assert.ok(source.label)}
  const payload=exams.selectedExamTemplate(template,exams.allExamTopicKeys(template))
  assert.ok(payload.key.length<=80);assert.ok(payload.revision.length<=40);assert.ok(payload.subjects.length>0&&payload.subjects.length<=20);assert.ok(Buffer.byteLength(JSON.stringify(payload))<150000)
  const ids=payload.subjects.flatMap(s=>s.topics.map(t=>t.key));assert.equal(new Set(ids).size,ids.length,template.key)
  for(const subject of payload.subjects){assert.ok(subject.key.length<=60);assert.ok(study.validStudyName(subject.title,80),subject.title);assert.ok(subject.topics.length>0&&subject.topics.length<=100);for(const topic of subject.topics){assert.ok(topic.key.length<=100);assert.ok(study.validStudyName(topic.title,100),topic.title)}}
 }
})

test('exam selection filters only known topics, preserves legacy TYT IDs and does not mutate catalog data',()=>{
 const tyt=exams.examTemplate('tyt-core'),first=tyt.subjects[0].topics[0]
 assert.equal(JSON.stringify(tyt.subjects.map(s=>[s.key,s.topics.map(t=>t.key)])),JSON.stringify(templates.tytTemplate.subjects.map(s=>[s.key,s.topics.map(t=>t.key)])))
 const payload=exams.selectedExamTemplate(tyt,new Set([first.key,'unknown']))
 assert.equal(payload.subjects.length,1);assert.equal(payload.subjects[0].topics.length,1);assert.equal(payload.subjects[0].topics[0].key,first.key)
 assert.match(payload.subjects[0].title,/^TYT · /);assert.equal(exams.selectedExamTemplate(tyt,new Set()).subjects.length,0)
 payload.subjects[0].topics[0].title='Local edit';assert.notEqual(first.title,'Local edit')
})

test('language templates distinguish IELTS types and use the post-January-2026 TOEFL tasks',()=>{
 const toefl=exams.examTemplate('toefl-ibt-2026'),topics=toefl.subjects.flatMap(s=>s.topics)
 assert.equal(toefl.effectiveFrom,'2026-01-21');assert.equal(topics.length,12)
 assert.ok(topics.some(t=>t.title.includes('Build a Sentence')));assert.ok(topics.some(t=>t.title.includes('Listen and Repeat')));assert.equal(topics.some(t=>/Integrated|Independent/.test(t.title)),false)
 const academic=exams.examTemplate('ielts-academic'),general=exams.examTemplate('ielts-general')
 assert.equal(JSON.stringify(academic.subjects[0]),JSON.stringify(general.subjects[0]));assert.equal(JSON.stringify(academic.subjects[3]),JSON.stringify(general.subjects[3]));assert.notEqual(JSON.stringify(academic.subjects[1]),JSON.stringify(general.subjects[1]));assert.notEqual(JSON.stringify(academic.subjects[2]),JSON.stringify(general.subjects[2]))
 assert.equal(exams.examTemplates.filter(t=>t.family==='kpss').length,4);assert.equal(exams.examTemplates.filter(t=>t.family==='yokdil').length,3)
})
function storeFixture(responder){
 const workspace={sessionKey:'owner:workspace',activeId:'workspace'},auth={user:{id:'owner'}},calls=[],removed=[]
 const chain={eq(k,v){removed.push([k,v]);return this},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)},order(){return this},select(){return this},delete(){return this}}
 const mod=load(fs.readFileSync('src/features/learning/stores/learning.ts','utf8'),{'@/lib/workspaceScope':{defineWorkspaceStore:(_id,setup)=>setup,useWorkspaceClient:()=>({from:()=>chain,listen(){}})},'@/lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push([name,args]);return responder(name,args)}}},'@/stores/workspaces':{useWorkspacesStore:()=>workspace},'@/stores/auth':{useAuthStore:()=>auth}})
 return {state:mod.useLearningStore(),workspace,auth,calls,removed}
}
test('learning coalesces initial reads and ignores late responses after a workspace change',async()=>{
 let release;const f=storeFixture(()=>new Promise(resolve=>release=resolve))
 const a=f.state.fetchSubjects(),b=f.state.fetchSubjects();assert.equal(a,b);assert.equal(f.calls.length,1)
 f.workspace.sessionKey='owner:another';release({data:{subjects:[{id:'old'}],progress:[],due_mistakes:[]},error:null});assert.equal(await a,false);assert.equal(f.state.subjects.value.length,0)
})
test('failed mutations preserve the last server state and stale versions are sent explicitly',async()=>{
 let fail=false
 const f=storeFixture((name,args)=>name==='learning_load'?{data:{subjects:[{id:'s',title:'Original',version:7,topics:[]}],progress:[{subject_id:'s',topic_id:'t',status:'doing',version:3,seconds:60}],due_mistakes:[]}}:fail?{error:{message:'Network offline'}}:{data:{progress:{subject_id:'s',topic_id:'t',status:args.payload.status,version:4,review_on:null,streak:0}}})
 await f.state.fetchSubjects();fail=true
 await assert.rejects(f.state.mutate('progress.update','s','t',{status:'done'},3));assert.equal(f.state.state('s','t').status,'doing');assert.equal(f.state.busy.value,false)
 fail=false;await f.state.mutate('progress.update','s','t',{status:'done'},3);assert.equal(f.state.state('s','t').status,'done');assert.equal(f.state.state('s','t').seconds,60)
 assert.equal(f.calls[2][1].expected_version,3)
 await f.state.deleteSubject('s');assert.ok(f.removed.some(([key,value])=>key==='version'&&value===7),'trash uses the RPC-loaded record version')
})
test('missing learning migration keeps legacy data readable without falling back to unversioned writes',async()=>{
 const f=storeFixture(()=>({error:{code:'PGRST202',message:'Could not find the function'}}))
 await f.state.fetchSubjects();assert.equal(f.state.setupRequired.value,true);assert.equal(f.state.error.value,'setup');assert.equal(f.state.subjects.value.length,0)
})
function trackerFixture(){
 const state=vue.reactive({subjects:[{id:'s',title:'Math',version:1,color:'#64748B',topics:[{id:'t',title:'Numbers',_version:1}]}],progress:[],dueMistakes:[],mistakes:[],busy:false,isLoading:false,setupRequired:false,error:'',state:()=>({status:'todo',version:0,review_on:null,streak:0}),fetchSubjects:async()=>true,fetchMistakes:async()=>true}),calls=[],toasts=[]
 let response=async()=>({subject:state.subjects[0]})
 state.mutate=async(...args)=>{calls.push(args);return response(...args)}
 const noHooks={onMounted(){},onBeforeUnmount(){},onActivated(){},onDeactivated(){}}
 const order=load(fs.readFileSync('src/features/learning/lib/useStudyOrder.ts','utf8'),{'vue':{...vue,...noHooks}})
 const nav={workspaceNavigationKey:Symbol(),workspaceActiveViewKey:Symbol(),workspaceOpenItemKey:Symbol()}
 const compiled=compileScript(parse(fs.readFileSync('src/features/learning/components/LearningTracker.vue','utf8')).descriptor,{id:'study-controller'}).content
 const canWrite=vue.ref(true)
 const mod=load(compiled,{'vue':{...vue,...noHooks,inject:(_key,fallback)=>fallback},'vue-i18n':{useI18n:()=>({t:key=>key})},'lucide-vue-next':{},'vuedraggable':{},'@/components/ui/CustomSelect.vue':{},'./LearningDialog.vue':{},'./LearningSubjectItem.vue':{},'./LearningTitle.vue':{},'./LearningTopicDetails.vue':{},'./LearningTemplatePicker.vue':{},'../stores/learning':{useLearningStore:()=>state,learningError:()=> 'failed'},'../lib/study':study,'../lib/useStudyOrder':order,'../lib/templates':templates,'../lib/images':{},'@/lib/workspaceScope':{useModuleAccess:()=>({canWrite}),useModuleLoad(){},useWorkspaceDraft:(_key,value)=>vue.ref(value)},'@/lib/searchNavigation':{useSearchReveal(){}},'@/lib/workspaceNavigation':nav,'@/stores/ui':{useUIStore:()=>({addToast:(...args)=>toasts.push(args),addUndoToast(){}})},'@/stores/settings':{useSettingsStore:()=>({isModuleActive:()=>true})},'@/features/pomodoro/stores/pomodoro':{usePomodoroStore:()=>({durations:{focus:25}})}})
 const scope=vue.effectScope(),controller=scope.run(()=>mod.default.setup({}, {expose(){}}))
 return {state,controller,calls,toasts,canWrite,respond:fn=>response=fn,stop:()=>scope.stop()}
}
test('inline study creation preserves failed drafts, retries the same ID and never starts focus on mount',async()=>{
 const f=trackerFixture();try{
  assert.equal(f.calls.length,0)
  await f.controller.beginStudy();f.controller.newTitle.value='Algebra';assert.equal(f.controller.panel.value,null)
  f.respond(async()=>{throw Error('offline')});await f.controller.saveSubject()
  assert.equal(f.controller.newStudy.value,true);assert.equal(f.controller.newTitle.value,'Algebra')
  f.respond(async()=>({subject:{id:'created'}}));await f.controller.saveSubject();assert.equal(f.controller.newStudy.value,false);assert.equal(f.calls[0][1],f.calls[1][1],'a retry uses the same idempotency key')
 }finally{f.stop()}
})
test('review retries use the same attempt ID and successful reviews get a new ID next time',async()=>{
 const f=trackerFixture();try{
  f.respond(async()=>{throw Error('offline')});await f.controller.review('s','t',true)
  f.respond(async()=>({}));await f.controller.review('s','t',true);await f.controller.review('s','t',true)
  assert.equal(f.calls[0][3].attempt_id,f.calls[1][3].attempt_id);assert.notEqual(f.calls[1][3].attempt_id,f.calls[2][3].attempt_id)
 }finally{f.stop()}
})

test('exam imports keep the chosen scope on failure and cannot submit an empty or read-only selection',async()=>{
 const f=trackerFixture();try{
  const template=exams.examTemplate('ielts-general'),selection=exams.selectedExamTemplate(template,exams.allExamTopicKeys(template))
  f.controller.openPanel('template');f.controller.templateSelection.value=selection;f.respond(async()=>{throw Error('offline')});await f.controller.importTemplate()
  assert.equal(f.controller.panel.value,'template');assert.equal(f.controller.templateSelection.value.key,'ielts-general');assert.equal(f.calls[0][3].key,'ielts-general')
  f.respond(async()=>({}));await f.controller.importTemplate();assert.equal(f.controller.panel.value,null);assert.equal(f.calls[1][3].key,'ielts-general')
  f.controller.templateSelection.value=exams.selectedExamTemplate(template,new Set());await f.controller.importTemplate();assert.equal(f.calls.length,2)
  f.canWrite.value=false;f.controller.templateSelection.value=selection;await f.controller.importTemplate();assert.equal(f.calls.length,2)
 }finally{f.stop()}
})

test('inline title and topic saves enforce permissions and limits and retain server versions',async()=>{
 const f=trackerFixture();try{
  const s=f.state.subjects[0],topic=s.topics[0]
  await f.controller.rename(s,null,'Updated work',7);await f.controller.rename(s,topic,'Updated topic',4)
  assert.deepEqual(f.calls.map(call=>[call[0],call[3].title,call[4]]),[['subject.update','Updated work',7],['topic.update','Updated topic',4]])
  await f.controller.saveTopics(s,['One','Two']);assert.equal(f.controller.panel.value,null);assert.equal(f.calls[2][0],'topic.add')
  await f.controller.saveTopics(s,['x'.repeat(101)]);await f.controller.rename(s,null,'x'.repeat(81),1);assert.equal(f.calls.length,3)
  f.canWrite.value=false;await f.controller.rename(s,topic,'Blocked',4);await f.controller.saveTopics(s,['Blocked']);await f.controller.beginStudy();assert.equal(f.controller.newStudy.value,false);assert.equal(f.calls.length,3)
 }finally{f.stop()}
})

test('dragging snapshots versions, rolls back failed orders and supports keyboard moves',async()=>{
 const hooks={...vue,onMounted(){},onBeforeUnmount(){}},order=load(fs.readFileSync('src/features/learning/lib/useStudyOrder.ts','utf8'),{vue:hooks})
 const rows=vue.ref([{id:'a',version:1},{id:'b',version:2}]),locked=vue.ref(false),calls=[];let succeeds=false
 const scope=vue.effectScope(),list=scope.run(()=>order.useStudyOrder(()=>rows.value,()=>locked.value,()=>rows.value.map(r=>({id:r.id,version:r.version})),async(ids,context)=>{calls.push({ids,context});if(succeeds)rows.value=ids.map(id=>rows.value.find(r=>r.id===id));return succeeds}))
 try{
  list.start();list.ordered.value.reverse();rows.value=[{id:'a',version:3},{id:'b',version:2}];await vue.nextTick();await list.finish()
  assert.equal(calls[0].context[0].version,1);assert.deepEqual(Array.from(list.ordered.value.map(r=>r.id)),['a','b']);assert.equal(list.announcement.value,'failed')
  succeeds=true;await list.move('b',-1);assert.deepEqual(Array.from(rows.value.map(r=>r.id)),['b','a']);assert.equal(list.announcement.value,'saved')
  locked.value=true;await list.move('a',-1);assert.equal(calls.length,2)
  locked.value=false;list.start();await list.finish();assert.equal(calls.length,2,'clicking a handle without moving does not write')
 }finally{scope.stop()}
})

test('reorder responses are authoritative, failures keep order and account switches discard late responses',async()=>{
 let response,release
 const f=storeFixture(name=>name==='learning_load'?{data:{subjects:[{id:'a',version:1,position:0},{id:'b',version:1,position:1}],progress:[],due_mistakes:[]}}:response())
 await f.state.fetchSubjects();response=async()=>({error:{message:'offline'}})
 await assert.rejects(f.state.reorder(null,['b','a'],{a:1,b:1}));assert.deepEqual(Array.from(f.state.subjects.value.map(s=>s.id)),['a','b'])
 response=async()=>({data:{subjects:[{id:'b',position:1,version:2},{id:'a',position:2,version:2}]}})
 await f.state.reorder(null,['b','a'],{a:1,b:1});assert.deepEqual(Array.from(f.state.subjects.value.map(s=>s.id)),['b','a']);assert.equal(f.calls[2][0],'learning_reorder')
 response=()=>new Promise(resolve=>release=resolve);const pending=f.state.reorder(null,['a','b'],{a:2,b:2});f.workspace.sessionKey='other-account';release({data:{subjects:[{id:'foreign',position:0,version:1}]}})
 await assert.rejects(pending,/LEARNING_ACCESS_DENIED/);assert.equal(f.state.subjects.value.some(s=>s.id==='foreign'),false);assert.equal(f.state.busy.value,false)
})
test('focused study dialogs keep single clicks open, block dismissal while saving and restore page scrolling',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<button id="before">Before</button>'),doc=dom.window.document,runtime=require('@vue/runtime-dom')
 const {HTMLDialogElement}=dom.window;HTMLDialogElement.prototype.showModal=function(){this.open=true};HTMLDialogElement.prototype.close=function(){this.open=false}
 const utils=load(fs.readFileSync('src/lib/utils.ts','utf8'))
 const component=load(compileScript(parse(fs.readFileSync('src/features/learning/components/LearningDialog.vue','utf8')).descriptor,{id:'study-dialog-dom',inlineTemplate:true}).content,{'vue-i18n':{useI18n:()=>({t:key=>key})},'@/lib/utils':utils},{document:doc}).default
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,namespace)=>namespace==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:value=>doc.createTextNode(value),createComment:value=>doc.createComment(value),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 const props=vue.reactive({title:'Study',busy:false}),events=[],target=doc.createElement('div');doc.body.append(target)
 doc.querySelector('#before').focus();doc.body.style.overflow='auto'
 const app=renderer.createApp({setup:()=>()=>vue.h(component,{...props,onClose:()=>events.push('close')},{default:()=>vue.h('input')})})
 try{
  app.mount(target);await vue.nextTick();const dialog=doc.querySelector('dialog');dialog.getBoundingClientRect=()=>({left:100,top:100,right:500,bottom:600})
  assert.equal(dialog.open,true);assert.equal(doc.body.style.overflow,'hidden')
  const send=(type,detail,x=20,y=20)=>dialog.dispatchEvent(new dom.window.MouseEvent(type,{detail,clientX:x,clientY:y,bubbles:true,cancelable:true}))
  send('click',1);send('click',2);send('dblclick',2,200,200);assert.equal(events.length,0)
  props.busy=true;await vue.nextTick();send('dblclick',2);dialog.dispatchEvent(new dom.window.Event('cancel',{cancelable:true}));assert.equal(events.length,0)
  props.busy=false;await vue.nextTick();send('dblclick',2);assert.equal(events.length,1)
  dialog.dispatchEvent(new dom.window.Event('cancel',{cancelable:true}));assert.equal(events.length,2)
 }finally{app.unmount();assert.equal(doc.body.style.overflow,'auto');assert.equal(doc.activeElement.id,'before')}
})

function studyDOM(){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main></main>'),doc=dom.window.document,runtime=require('@vue/runtime-dom')
 const previous=new Map(['Document','ShadowRoot'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const key of previous.keys())globalThis[key]=dom.window[key]
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,namespace)=>namespace==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:value=>doc.createTextNode(value),createComment:value=>doc.createComment(value),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 const compile=(name,deps={})=>load(compileScript(parse(fs.readFileSync(`src/features/learning/components/${name}.vue`,'utf8')).descriptor,{id:name,inlineTemplate:true}).content,{'vue-i18n':{useI18n:()=>({t:key=>key})},'../lib/study':study,...deps},{document:doc,window:dom.window}).default
 return {dom,doc,renderer,compile,close:()=>{dom.window.close();for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}},flush:async()=>{await new Promise(setImmediate);await vue.nextTick()}}
}

test('inline title editing focuses the input, retains failed drafts and saves the version captured before editing',async()=>{
 const {dom,doc,renderer,compile,flush,close}=studyDOM(),Title=compile('LearningTitle'),calls=[];let succeed=false
 const props=vue.reactive({title:'Professional growth',version:4,limit:80,label:'Study name',editable:true,disabled:false,save:async(title,version)=>{calls.push([title,version]);if(succeed)props.title=title;return succeed}})
 const app=renderer.createApp({setup:()=>()=>vue.h(Title,props)})
 try{
  app.mount(doc.querySelector('main'));doc.querySelector('button').click();await flush()
  const input=doc.querySelector('input');assert.equal(doc.activeElement,input);assert.equal(input.maxLength,80)
  input.value='Personal growth';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));props.version=5;await flush()
  doc.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush()
  assert.equal(doc.querySelector('input').value,'Personal growth');assert.equal(doc.activeElement,doc.querySelector('input'));assert.deepEqual(calls,[['Personal growth',4]])
  succeed=true;doc.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush()
  assert.equal(doc.querySelector('input'),null);assert.match(doc.querySelector('button').textContent,/Personal growth/)
  doc.querySelector('button').click();await flush();doc.querySelector('input').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await flush()
  assert.equal(doc.querySelector('input'),null);assert.equal(calls.length,2)
  props.editable=false;await flush();assert.equal(doc.querySelector('button'),null);assert.match(doc.querySelector('span').textContent,/Personal growth/)
 }finally{app.unmount();close()}
})

test('topic cards open details on row click, edit names only inside details and isolate controls from toggling',async()=>{
 const {dom,doc,renderer,compile,flush,close}=studyDOM(),Title=compile('LearningTitle'),events=[],created=[],renamed=[];let save=false
 const order=load(fs.readFileSync('src/features/learning/lib/useStudyOrder.ts','utf8'),{}, {window:dom.window})
 const Drag=vue.defineComponent({props:['modelValue'],setup:(p,{slots})=>()=>vue.h('div',p.modelValue.map((element,index)=>slots.item({element,index})))})
 const Select=vue.defineComponent({props:['modelValue','options'],emits:['update:modelValue'],setup:(p,{emit})=>()=>vue.h('select',{value:p.modelValue,onChange:event=>emit('update:modelValue',event.target.value)},p.options.map(option=>vue.h('option',{value:option.value},option.label)))})
 const Subject=compile('LearningSubjectItem',{'vuedraggable':{default:Drag},'@/components/ui/CustomSelect.vue':{default:Select},'./LearningTitle.vue':{default:Title},'../lib/useStudyOrder':order,'../stores/learning':{useLearningStore:()=>({state:()=>({status:'todo'})})}})
 const topic={id:'t',title:'Work topic',_version:1},second={id:'t2',title:'Second topic',_version:1},subject={id:'s',title:'Work study',version:1,topics:[topic,second]}
 const props=vue.reactive({subject,topics:[topic,second],isExpanded:true,canWrite:true,disabled:false,canReorder:true,archivedView:false,createTopics:async titles=>{created.push(Array.from(titles));return save},saveOrder:async()=>true})
 const app=renderer.createApp({setup:()=>()=>vue.h(Subject,{...props,onManage:()=>events.push('details'),onDelete:()=>events.push('delete'),onArchive:()=>events.push('archive'),onStatus:(_topic,status)=>events.push(status)},{details:({topic})=>vue.h('div',{class:'topic-tools'},[vue.h(Title,{title:topic.title,version:topic._version,limit:100,label:'Topic name',editable:props.canWrite&&!topic.archived,disabled:props.disabled,save:async(title,version)=>{renamed.push([title,version]);props.topics[0].title=title;return true}}),vue.h('button',{class:'detail-action',onClick:()=>events.push('tool')},'Topic actions')])})})
 try{
  app.mount(doc.querySelector('main'));await flush();assert.equal(doc.querySelector('dialog'),null)
  assert.equal(doc.querySelector('.title-pencil'),null,'cards do not offer inline rename')
  assert.equal(doc.querySelector('.study-topic .study-topic-actions button:not(.is-delete)'),null,'there is no topic ellipsis')
  doc.querySelector('[aria-label="study.manageSubject"]').click();doc.querySelector('[aria-label="study.deleteSubject"]').click();assert.deepEqual(events,['details','delete'])
  const row=doc.querySelector('.study-topic'),open=row.querySelector('.study-topic-open')
  row.querySelector('.study-topic-handle').click();await flush();assert.equal(open.getAttribute('aria-expanded'),'false')
  row.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await flush();assert.ok(doc.querySelector('.topic-tools'));assert.equal(doc.querySelector('dialog'),null);assert.equal(open.getAttribute('aria-expanded'),'true')
  doc.querySelector('[aria-label="study.archive"]').click();assert.equal(events[2],'archive')
  row.querySelector('.study-topic-actions').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));doc.querySelector('.detail-action').click();await flush();assert.equal(open.getAttribute('aria-expanded'),'true','actions do not collapse details')
  doc.querySelector('.topic-tools .study-title').click();await flush();let name=doc.querySelector('.topic-tools input');assert.equal(name.maxLength,100)
  name.value='Renamed topic';name.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await flush();doc.querySelector('.topic-tools form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush()
  assert.deepEqual(renamed,[['Renamed topic',1]]);assert.equal(open.textContent,'Renamed topic');assert.equal(open.getAttribute('aria-expanded'),'true')
  open.click();await flush();assert.equal(doc.querySelector('.title-pencil'),null);props.disabled=true;await flush();row.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await flush();assert.equal(open.getAttribute('aria-expanded'),'false');props.disabled=false;await flush()
  doc.querySelector('.study-add-topic').click();await flush();let field=doc.querySelector('textarea');assert.equal(field.maxLength,100);assert.equal(doc.activeElement,field)
  field.value='Next topic';field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await flush();field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await flush()
  assert.equal(doc.querySelector('textarea').value,'Next topic');save=true;doc.querySelector('form.study-topic-create').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush()
  assert.equal(doc.querySelector('textarea').value,'');assert.equal(doc.activeElement,doc.querySelector('textarea'));assert.deepEqual(created,[['Next topic'],['Next topic']])
  props.canWrite=false;await flush();assert.equal(doc.querySelector('.study-topic-create'),null);assert.equal(doc.querySelector('[aria-label="study.archive"]'),null);assert.equal(doc.querySelector('[aria-label="study.deleteSubject"]'),null)
  open.click();await flush();assert.ok(doc.querySelector('.topic-tools'));assert.equal(doc.querySelector('.title-pencil'),null)
  const select=doc.querySelector('select');select.value='done';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.equal(events.at(-1),'done')
 }finally{app.unmount();close()}
})

test('study and topic detail headings support versioned renaming without changing dialog dismissal',async()=>{
 const {dom,doc,renderer,compile,flush,close}=studyDOM(),utils=load(fs.readFileSync('src/lib/utils.ts','utf8')),Dialog=compile('LearningDialog',{'@/lib/utils':utils}),Title=compile('LearningTitle'),calls=[],closed=[]
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false}
 const props=vue.reactive({title:'Professional study',version:7,editable:true,disabled:false,limit:80})
 const app=renderer.createApp({setup:()=>()=>vue.h(Dialog,{title:props.title,busy:props.disabled,onClose:()=>closed.push(true)},{title:()=>vue.h(Title,{...props,class:'study-detail-title',label:'Study name',save:async(title,version)=>{calls.push([title,version]);props.title=title;props.version++;return true}}),default:()=>vue.h('p','Study details')})})
 try{
  app.mount(doc.querySelector('main'));await flush();const dialog=doc.querySelector('dialog'),heading=doc.getElementById(dialog.getAttribute('aria-labelledby'))
  assert.equal(heading.textContent,'Professional study');assert.ok(doc.querySelector('.study-dialog-heading .title-pencil'))
  doc.querySelector('.study-dialog-heading .study-title').click();await flush();let input=doc.querySelector('.study-dialog-heading input');assert.equal(input.maxLength,80)
  input.value='My professional study';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await flush();doc.querySelector('.study-dialog-heading form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush()
  assert.deepEqual(calls,[['My professional study',7]]);assert.equal(heading.textContent,'My professional study');assert.equal(dialog.open,true)
  props.title='Topic title';props.limit=100;await flush();doc.querySelector('.study-dialog-heading .study-title').click();await flush();assert.equal(doc.querySelector('.study-dialog-heading input').maxLength,100)
  doc.querySelector('.study-dialog-heading input').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await flush();assert.equal(closed.length,0);assert.equal(doc.querySelector('.study-dialog-heading input'),null)
  props.editable=false;await flush();assert.equal(doc.querySelector('.study-dialog-heading .title-pencil'),null);assert.equal(dialog.open,true)
 }finally{app.unmount();close()}
})

test('exam picker preserves per-scope selection, shows official sources and locks changes during import',async()=>{
 const {dom,doc,renderer,compile,flush,close}=studyDOM(),emitted=[]
 const Select=vue.defineComponent({props:['modelValue','options','disabled'],emits:['update:modelValue'],setup:(p,{emit})=>()=>vue.h('select',{value:p.modelValue,disabled:p.disabled,onChange:event=>emit('update:modelValue',event.target.value)},p.options.map(option=>vue.h('option',{value:option.value},option.label)))})
 const Picker=compile('LearningTemplatePicker',{'@/components/ui/CustomSelect.vue':{default:Select},'../lib/examTemplates':exams,'vue-i18n':{useI18n:()=>({locale:vue.ref('tr'),t:(key,params)=>key==='study.checkedAt'?params.date:key})}})
 const props=vue.reactive({busy:false}),app=renderer.createApp({setup:()=>()=>vue.h(Picker,{...props,'onUpdate:selection':value=>emitted.push(value)})})
 const choose=async(index,value)=>{const select=doc.querySelectorAll('select')[index];select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await flush()}
 try{
  app.mount(doc.querySelector('main'));await flush();assert.equal(doc.querySelector('select').options.length,11);assert.equal(emitted.at(-1).key,'tyt-core');assert.match(doc.querySelector('.template-meta').textContent,/24.*2026/)
  await choose(0,'yokdil');assert.equal(doc.querySelectorAll('select').length,2);assert.equal(doc.querySelectorAll('select')[1].options.length,3)
  await choose(1,'yokdil-health');doc.querySelector('.template-selection button:nth-child(2)').click();await flush();assert.equal(emitted.at(-1).subjects.length,0)
  doc.querySelector('.template-subject').open=true;doc.querySelector('.template-topics input').click();await flush();assert.equal(emitted.at(-1).subjects[0].topics.length,1);assert.match(emitted.at(-1).subjects[0].title,/Sağlık Bilimleri/)
  await choose(1,'yokdil-science');await choose(1,'yokdil-health');assert.equal(emitted.at(-1).subjects[0].topics.length,1,'switching scope preserves its selection')
  await choose(0,'ielts');await choose(1,'ielts-general');assert.equal(emitted.at(-1).key,'ielts-general')
  const a=doc.querySelector('.template-sources a');assert.match(a.href,/^https:\/\/ielts.org\//);assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer')
  props.busy=true;await flush();const count=emitted.length;await choose(0,'tyt');doc.querySelector('.template-selection button:nth-child(2)').click();doc.querySelector('.template-topics input').dispatchEvent(new dom.window.Event('change',{bubbles:true}));await flush()
  assert.equal(emitted.length,count);assert.equal(emitted.at(-1).key,'ielts-general');assert.equal(doc.querySelectorAll('dialog').length,0)
 }finally{app.unmount();close()}
})
