const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue')
const {parse,compileScript}=require('@vue/compiler-sfc')
const {renderToString}=require('@vue/server-renderer')
const {JSDOM}=require('jsdom')
const dom=new JSDOM('')
const purifier=require('dompurify')(dom.window)
function load(source,dependencies={},globals={}) {
  const exports={}
  // Tiptap's configuration merge requires plain objects from the same JS realm.
  const environment={exports,require:name=>dependencies[name]||require(name),console,URL,...globals}
  vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,Object.keys(environment))(...Object.values(environment))
  return exports
}
const notes=load(fs.readFileSync('src/lib/noteContent.ts','utf8'),{'dompurify':{default:purifier}})
test('shared rich text removes executable markup while preserving formatting and images',()=>{
  const cleaned=notes.sanitizeNoteHtml('<script>alert(1)</script><img src="https://example.test/photo.png" onerror="alert(1)"><a href="javascript:alert(1)">Link</a><svg onload="alert(1)"></svg><iframe srcdoc="evil"></iframe><form><input autofocus onfocus="alert(1)"></form><strong>Keep</strong><span style="color:var(--tt-color-text-red)">Color</span>')
  const document=new JSDOM(cleaned).window.document
  assert.equal(document.querySelector('script,svg,iframe,form,input'),null)
  assert.equal(document.querySelector('img').getAttribute('onerror'),null)
  assert.equal(document.querySelector('a').getAttribute('href'),null)
  assert.equal(document.querySelector('strong').textContent,'Keep')
  assert.equal(document.querySelector('img').src,'https://example.test/photo.png')
  assert.match(document.querySelector('span').getAttribute('style'),/--tt-color-text-red/)
})
function component(file,role,props,extra={}) {
  const access={useModuleAccess:()=>({canWrite:vue.computed(()=>role!=='viewer')})}
  const dependencies={'@/lib/workspaceScope':access,'@/stores/ui':{useUIStore:()=>({addToast(){}})},
    'vue-i18n':{useI18n:()=>({t:key=>key})},
    '../stores/periodicTasks':{isCompletedForPeriod:()=>false},
    '@/lib/noteContent':notes,...extra}
  const descriptor=parse(fs.readFileSync(file,'utf8')).descriptor
  const result=load(compileScript(descriptor,{id:'permissions-test',inlineTemplate:true}).content,dependencies).default
  const app=vue.createSSRApp(result,props)
  app.config.globalProperties.$t=key=>key
  return renderToString(app).then(html=>new JSDOM(html).window.document)
}
test('viewer quick notes keep copy available and hide deletion',async()=>{
  const props={note:{id:'note',content:'Shared note',completed:false}}
  const viewer=await component('src/features/quick_notes/components/QuickNoteItem.vue','viewer',props)
  const editor=await component('src/features/quick_notes/components/QuickNoteItem.vue','editor',props)
  assert.equal(viewer.querySelectorAll('button').length,1)
  assert.equal(editor.querySelectorAll('button').length,2)
  assert.match(viewer.body.textContent,/Shared note/)
})
function reminderFormFixture(editTask=null) {
  const descriptor=parse(fs.readFileSync('src/features/PeriodicTasks/components/PeriodicTaskForm.vue','utf8')).descriptor
  const result=load(compileScript(descriptor,{id:'reminder-form'}).content,{
    '@/lib/workspaceScope':{useWorkspaceDraft:(_key,value)=>vue.ref(value)},
    '@/components/ui/CustomSelect.vue':{default:{}},
    'vue-i18n':{useI18n:()=>({t:key=>key,locale:vue.ref('tr')})},
  }).default
  const events=[],props=vue.reactive({editTask,loading:false})
  let state,exposed
  const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  const app=renderer.createApp({setup(){state=result.setup(props,{expose:value=>exposed=value,emit:(...args)=>events.push(args)});return()=>vue.h('div')}})
  app.mount({})
  return {state,props,events,reset:()=>exposed.resetForm(),close:()=>app.unmount()}
}

test('minimal reminder form validates time and recurrence, and retains the draft until a confirmed save',async()=>{
  const f=reminderFormFixture()
  try {
    f.state.form.title='  Pay the bill  '
    f.state.submit()
    assert.equal(f.events[0][1].title,'Pay the bill');assert.equal(f.events[0][1].category,'other')
    assert.equal(f.events[0][1].notifyBrowser,true);assert.equal(f.state.form.title,'  Pay the bill  ','an emitted request may fail, so its draft must remain')
    f.state.form.reminderTime='25:00';f.state.submit();assert.equal(f.events.length,1)
    f.state.form.reminderTime='08:30';f.state.setFrequency('weekly');await vue.nextTick()
    assert.equal(f.state.form.daysOfWeek.length,1,'weekly reminders default to today')
    f.state.toggleDay(f.state.form.daysOfWeek[0]);f.state.submit();assert.equal(f.events.length,1)
    f.state.toggleDay(1);f.state.toggleDay(3);f.state.submit();assert.deepEqual(Array.from(f.events[1][1].daysOfWeek),[1,3])
    f.state.setFrequency('custom');f.state.form.intervalDays=0;f.state.submit();assert.equal(f.events.length,2)
    f.state.form.intervalDays=366;f.state.submit();assert.equal(f.events.length,2)
    f.state.form.intervalDays=7;f.state.submit();assert.equal(f.events[2][1].intervalDays,7)
    f.state.setFrequency('yearly');f.state.form.monthOfYear=2;f.state.form.dayOfMonth=31;await vue.nextTick()
    assert.equal(f.state.form.dayOfMonth,29);assert.equal(f.state.dayOptions.value.length,29)
    f.props.loading=true;f.state.submit();assert.equal(f.events.length,3)
    f.reset();assert.equal(f.state.form.title,'')
  }finally{f.close()}
})

test('editing an existing reminder preserves its old notes, category, interval anchor and personal delivery preferences',()=>{
  const f=reminderFormFixture({id:'existing',title:'Read',notes:'Older additional detail',category:'work',frequency:'custom',interval_days:5,anchor_date:'2026-10-01',reminder_time:'10:45',notify_browser:false,notify_email:true})
  try{
    f.state.form.title='Read chapter two';f.state.submit()
    const input=f.events[0][1]
    assert.equal(input.notes,'Older additional detail');assert.equal(input.category,'work');assert.equal(input.anchorDate,'2026-10-01')
    assert.equal(input.notifyBrowser,false);assert.equal(input.notifyEmail,true);assert.equal(input.reminderTime,'10:45')
    f.state.setDelivery('both');assert.equal(f.state.form.notifyBrowser,true);assert.equal(f.state.form.notifyEmail,true)
  }finally{f.close()}
})

test('viewer routines keep their content but disable completion and hide edit and delete',async()=>{
  const props={task:{id:'task',title:'Routine',frequency:'daily',category:'habit'}}
  const viewer=await component('src/features/PeriodicTasks/components/PeriodicTaskItem.vue','viewer',props)
  assert.equal(viewer.querySelectorAll('button').length,2)
  assert.equal(viewer.querySelectorAll('button:disabled').length,2)
  const editor=await component('src/features/PeriodicTasks/components/PeriodicTaskItem.vue','editor',props)
  assert.equal(editor.querySelectorAll('button').length,4)
  assert.equal(editor.querySelectorAll('button:disabled').length,0)
})
test('shared vault URLs permit only HTTP(S) and viewer note controls retain copying',async()=>{
  const file='src/features/secure_notes/components/SecureNoteItem.vue'
  const props={note:{id:'note',title:'Private',type:'password',username:'User',created_at:'2026-10-09',url:'javascript:alert(1)'}}
  const viewer=await component(file,'viewer',props)
  assert.equal(viewer.querySelector('a'),null)
  assert.equal(viewer.querySelectorAll('button').length,3)
  const editor=await component(file,'editor',{note:{...props.note,url:'https://example.test'}})
  assert.equal(editor.querySelectorAll('button').length,5)
  assert.equal(editor.querySelector('a'),null,'URLs appear in the expanded details')
})
function installNoteEditorDOM() {
  for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,DOMParser:dom.window.DOMParser,Event:dom.window.Event,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:callback=>setTimeout(callback,0),cancelAnimationFrame:clearTimeout}))
    Object.defineProperty(globalThis,name,{value,writable:true,configurable:true})
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{}
  dom.window.Range.prototype.getClientRects=()=>[]
  dom.window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0})
}
function noteExtensions(){
  return load(fs.readFileSync('src/lib/noteEditor.ts','utf8'),{'./noteContent':notes},{document:dom.window.document}).createNoteExtensions()
}
function makeNoteEditor(html,editable=true){
  installNoteEditorDOM()
  return new (require('@tiptap/core').Editor)({element:dom.window.document.createElement('div'),extensions:noteExtensions(),content:notes.sanitizeNoteHtml(html),editable})
}

test('rich-note HTML keeps tasks, tables, safe colors and private image references while removing executable and overlay markup',()=>{
  const path='10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000003.webp'
  const clean=notes.sanitizeNoteHtml('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>Done</p></div></li></ul><details><summary>Section</summary><div data-type="detailsContent"><p>Body</p></div></details><table><tr><td colspan="2" colwidth="100,100">Cell</td></tr></table><img data-note-image="'+path+'" src="https://example.test/signed?token=private" data-width="50"><p class="fixed inset-0" style="position:fixed;background-image:url(https://evil.test);color:var(--tt-color-text-blue)">Safe</p><a href="javascript:alert(1)">Bad</a>')
  const doc=new JSDOM(clean).window.document
  assert.equal(doc.querySelector('input'),null);assert.equal(doc.querySelector('li').dataset.checked,'true')
  assert.equal(doc.querySelector('td').getAttribute('colwidth'),'100,100');assert.equal(doc.querySelector('td').colSpan,2)
  assert.equal(doc.querySelector('details summary').textContent,'Section')
  const image=doc.querySelector('img');assert.equal(image.dataset.noteImage,path);assert.equal(image.dataset.width,'50');assert.equal(image.getAttribute('src'),null)
  assert.ok(!clean.includes('token=private'));assert.ok(!clean.includes('position:'));assert.ok(!clean.includes('background-image'));assert.ok(!clean.includes('class="fixed'))
  assert.match(clean,/var\(--tt-color-text-blue\)/);assert.equal(doc.querySelector('a').getAttribute('href'),null)
})

test('rich-note engine edits task checkboxes and tables, unfolds toggles, and round-trips old formatted text and inline images',()=>{
  const editor=makeNoteEditor('<p><b>Legacy</b> <span style="color:var(--tt-color-text-blue)">Blue</span><img src="data:image/png;base64,AA=="></p>')
  try{
    assert.match(editor.getHTML(),/<strong>Legacy<\/strong>/);assert.match(editor.getHTML(),/var\(--tt-color-text-blue\)/)
    assert.match(editor.getHTML(),/data:image\/png;base64,AA==/)
    editor.commands.setContent('<p>Task</p>',{emitUpdate:false});editor.commands.toggleTaskList()
    let input=editor.view.dom.querySelector('input[type=checkbox]');input.checked=true;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))
    assert.equal(editor.getJSON().content[0].content[0].attrs.checked,true)
    const task=notes.sanitizeNoteHtml(editor.getHTML());editor.commands.setContent(task,{emitUpdate:false})
    assert.equal(editor.getJSON().content[0].content[0].attrs.checked,true,'sanitization must preserve the task state without stored inputs')
    editor.setEditable(false);input=editor.view.dom.querySelector('input[type=checkbox]');input.checked=false;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))
    assert.equal(input.checked,true);assert.equal(editor.getJSON().content[0].content[0].attrs.checked,true,'viewer checkbox clicks must not change the document')
    editor.setEditable(true);editor.commands.setContent('<p>Table</p>',{emitUpdate:false});editor.commands.insertTable({rows:2,cols:2,withHeaderRow:true})
    const table=()=>editor.getJSON().content.find(node=>node.type==='table')
    assert.equal(table().content.length,2);editor.commands.addRowAfter();editor.commands.addColumnAfter()
    assert.equal(table().content.length,3);assert.equal(table().content[0].content.length,3)
    editor.commands.setContent(notes.sanitizeNoteHtml(editor.getHTML()),{emitUpdate:false});assert.equal(table().content.length,3)
    editor.commands.setContent('<details><summary>Section</summary><div data-type="detailsContent"><p>Nested</p></div></details>',{emitUpdate:false})
    const toggle=editor.view.dom.querySelector('[data-type="details"] > button'),content=editor.view.dom.querySelector('[data-type="detailsContent"]')
    assert.equal(content.hidden,true);toggle.click();assert.equal(content.hidden,false)
    const clean=notes.sanitizeNoteHtml(editor.getHTML());editor.commands.setContent(clean,{emitUpdate:false})
    assert.match(editor.getText(),/Section/);assert.match(editor.getText(),/Nested/)
  }finally{editor.destroy()}
})

test('disabled rich text sanitizes incoming changes and ignores mutation, paste, drop and image upload',async()=>{
  installNoteEditorDOM()
  const extensionModule={createNoteExtensions:()=>noteExtensions()}
  const descriptor=parse(fs.readFileSync('src/features/todos/components/RichTextEditor.vue','utf8')).descriptor
  let core
  const result=load(compileScript(descriptor,{id:'readonly-editor'}).content,{
    '@/lib/noteContent':notes,'@/lib/noteEditor':extensionModule,
    '@/lib/noteImages':{uploadNoteImage:()=>assert.fail('readonly editors must not upload'),resolveNoteImage:async()=>''},
    '@/components/ui/CustomSelect.vue':{default:{}},'vue-i18n':{useI18n:()=>({t:key=>key})},
    '@tiptap/vue-3':{EditorContent:{},useEditor:options=>{core=new (require('@tiptap/core').Editor)(options);vue.onBeforeUnmount(()=>core.destroy());return vue.shallowRef(core)}},
  },{document:dom.window.document,window:dom.window}).default
  const props=vue.reactive({modelValue:'Original',disabled:true}),emitted=[]
  const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  let state
  const app=renderer.createApp({setup(){state=result.setup(props,{expose(){},emit:(...args)=>emitted.push(args)});return()=>vue.h('div')}})
  app.mount({})
  try{
    props.modelValue='<img src=x onerror=alert(1)><b>Safe</b>';await vue.nextTick()
    assert.ok(!core.getHTML().includes('onerror'));assert.match(core.getHTML(),/<strong>Safe<\/strong>/)
    const before=core.getHTML();state.run('bold');state.tableAction('addRowAfter');state.emitChange()
    let prevented=0;state.handlePaste({preventDefault(){prevented++}});state.handleDrop({preventDefault(){prevented++}})
    assert.equal(await state.processImageFiles([]),false);assert.equal(core.getHTML(),before);assert.equal(prevented,2);assert.equal(emitted.length,0)
  }finally{app.unmount()}
})

function interactiveEditorFixture({disabled=false,upload=async()=>({path:'10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000003.webp',alt:'Photo'})}={}) {
  installNoteEditorDOM()
  const descriptor=parse(fs.readFileSync('src/features/todos/components/RichTextEditor.vue','utf8')).descriptor
  let core,state
  const compiled=load(compileScript(descriptor,{id:'editor-interactions'}).content,{
    '@/lib/noteContent':notes,'@/lib/noteEditor':{createNoteExtensions:()=>noteExtensions()},
    '@/lib/noteImages':{uploadNoteImage:upload,resolveNoteImage:async()=>'',discardNoteImage:async()=>{}},
    '@/components/ui/CustomSelect.vue':{default:{}},'vue-i18n':{useI18n:()=>({t:key=>key})},
    '@tiptap/vue-3':{EditorContent:{},useEditor:options=>{core=new (require('@tiptap/core').Editor)(options);vue.onBeforeUnmount(()=>core.destroy());return vue.shallowRef(core)}},
  },{document:dom.window.document,window:dom.window}).default
  const events=[],renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  const app=renderer.createApp({setup(){state=compiled.setup(vue.reactive({modelValue:'<p>First</p><p>Second</p>',disabled}),{expose(){},emit:(...args)=>events.push(args)});return()=>vue.h('div')}})
  app.mount({})
  return {core,state:vue.proxyRefs(state),events,close:()=>app.unmount()}
}

test('image descriptions accept continuous typing without losing image selection or input focus',async()=>{
  const f=interactiveEditorFixture(),input=dom.window.document.createElement('input')
  dom.window.document.body.append(input)
  try{
    f.core.commands.setContent('<p><img src="https://example.test/photo.png" alt=""></p>')
    f.core.commands.setNodeSelection(1)
    input.focus()
    for(const letter of 'Resim açıklaması'){
      input.value+=letter;f.state.imageAlt=input.value;f.state.updateImageAlt()
      await vue.nextTick()
      assert.equal(f.core.isActive('image'),true,'the image toolbar must remain mounted')
      assert.equal(f.core.state.selection.node.attrs.alt,input.value)
      assert.equal(dom.window.document.activeElement,input)
    }
    f.state.resizeImage(50)
    assert.equal(f.core.state.selection.node.attrs.displayWidth,50)
    assert.equal(f.core.state.selection.node.attrs.alt,'Resim açıklaması')
    assert.equal(dom.window.document.activeElement,input,'width changes also preserve external focus')
    assert.match(f.events.filter(event=>event[0]==='update:modelValue').at(-1)[1],/alt="Resim açıklaması"/)
    f.core.commands.undo()
    assert.equal(f.core.state.doc.nodeAt(1).attrs.displayWidth,100)
  }finally{input.remove();f.close()}
})

test('editor closes menus outside their trigger and panel, applies colors to the selection and keeps table actions usable',async()=>{
  const f=interactiveEditorFixture()
  const root=dom.window.document.createElement('div')
  root.innerHTML='<button data-editor-menu="color"></button><div class="panel"><button>Color</button></div><div class="content">Editor text</div>'
  dom.window.document.body.append(root)
  f.state.rootRef=root;f.state.panelRef=root.querySelector('.panel')
  try{
    f.state.openMenu('color')
    root.querySelector('button').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}))
    assert.equal(f.state.menu,'color','the trigger must still toggle its own menu')
    root.querySelector('.panel button').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}))
    assert.equal(f.state.menu,'color')
    root.querySelector('.content').dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}))
    assert.equal(f.state.menu,null,'clicking text inside the editor closes the popup')
    f.state.openMenu('color');root.querySelector('.content').dispatchEvent(new dom.window.Event('focusin',{bubbles:true}))
    assert.equal(f.state.menu,null,'keyboard navigation dismisses a popup')
    f.core.commands.setTextSelection({from:1,to:6})
    f.state.openMenu('color');f.state.applyColor('text','blue')
    assert.equal(f.state.menu,null);assert.match(f.core.getHTML(),/color: var\(--tt-color-text-blue\)/)
    f.state.openMenu('color');f.state.applyColor('bg','yellow')
    assert.equal(f.state.menu,null);assert.match(f.core.getHTML(),/background-color: var\(--tt-color-highlight-yellow\)/)
    f.state.setTextMode('h2');f.state.setTextMode('h2');assert.equal(f.state.textMode,'h2','choosing the same heading must not undo it')
    f.core.commands.setContent('<p>Table</p>');f.state.run('table')
    const table=()=>f.core.getJSON().content.find(node=>node.type==='table')
    f.state.tableAction('addRowAfter');f.state.tableAction('addColumnAfter')
    assert.equal(table().content.length,4);assert.equal(table().content[0].content.length,4)
  }finally{root.remove();f.close()}
})

test('clipboard and drop images keep their intended location while uploading, with balanced busy state',async()=>{
  const uploads=[]
  const f=interactiveEditorFixture({upload:file=>new Promise(resolve=>uploads.push({file,resolve}))})
  try{
    f.core.commands.setTextSelection(3)
    const photo={type:'image/png',name:'photo.png'}
    let prevented=0
    assert.equal(f.state.handlePaste({clipboardData:{items:[{kind:'file',getAsFile:()=>photo}]},preventDefault(){prevented++}}),true)
    assert.equal(prevented,1);assert.equal(f.state.uploading,true)
    f.core.commands.insertContentAt(1,'New ')
    uploads[0].resolve({path:'10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000003.webp',alt:'photo'})
    await new Promise(resolve=>setTimeout(resolve,10))
    assert.equal(f.core.schema.nodes.image.isInline,true,'image schema inline: '+JSON.stringify(f.core.extensionManager.extensions.find(e=>e.name==='image').options))
    assert.match(f.core.getHTML(),/New Fi<img[^>]+>rst/,'the insertion bookmark follows intervening edits')
    assert.deepEqual(f.events.filter(e=>e[0]==='busy-change').map(e=>e[1]),[true,false])
    f.core.commands.setContent('<p>First</p><p>Second</p>')
    f.core.view.posAtCoords=()=>({pos:9,inside:-1})
    assert.equal(f.state.handleDrop({clientX:20,clientY:50,dataTransfer:{files:[photo]},preventDefault(){prevented++}}),true)
    uploads[1].resolve({path:'10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000004.webp',alt:'drop'})
    await new Promise(resolve=>setTimeout(resolve,10))
    assert.match(f.core.getHTML(),/<p>First<\/p><p>S<img[^>]+>econd<\/p>/)
    assert.equal(f.state.uploading,false)
  }finally{f.close()}
})

test('toolbar dropdown dismisses on outside pointer and keyboard focus, preserving editor selection when configured',async()=>{
  installNoteEditorDOM()
  const descriptor=parse(fs.readFileSync('src/components/ui/CustomSelect.vue','utf8')).descriptor
  const component=load(compileScript(descriptor,{id:'toolbar-dropdown'}).content,{}, {document:dom.window.document,window:dom.window}).default
  const props=vue.reactive({modelValue:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}],size:'sm',variant:'ghost',preserveFocus:true,disabled:false}),events=[]
  const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  let state
  const app=renderer.createApp({setup(){state=vue.proxyRefs(component.setup(props,{expose(){},emit:(...args)=>events.push(args)}));return()=>vue.h('div')}})
  app.mount({})
  const root=dom.window.document.createElement('div'),outside=dom.window.document.createElement('input')
  root.innerHTML='<button>Trigger</button><div><button>A</button><button>B</button></div>'
  dom.window.document.body.append(root,outside)
  state.containerRef=root;state.triggerRef=root.querySelector('button');state.dropdownRef=root.querySelector('div')
  try{
    state.toggle();assert.equal(state.isOpen,true)
    outside.dispatchEvent(new dom.window.Event('pointerdown',{bubbles:true}));assert.equal(state.isOpen,false)
    state.toggle();outside.dispatchEvent(new dom.window.Event('focusin',{bubbles:true}));assert.equal(state.isOpen,false)
    state.handleKeydown({key:'ArrowDown',preventDefault(){}});await vue.nextTick()
    assert.equal(dom.window.document.activeElement,state.dropdownRef.querySelector('button'))
    state.handleKeydown({key:'ArrowUp',preventDefault(){}});await vue.nextTick()
    assert.equal(dom.window.document.activeElement,state.dropdownRef.querySelectorAll('button')[1])
    state.selectOption(props.options[1]);assert.equal(state.isOpen,false)
    assert.notEqual(dom.window.document.activeElement,state.triggerRef,'toolbar commands must not steal focus back from the editor')
    assert.ok(events.some(e=>e[0]==='update:modelValue' && e[1]==='b'))
    state.toggle();props.disabled=true;await vue.nextTick();assert.equal(state.isOpen,false)
  }finally{root.remove();outside.remove();app.unmount()}
})

test('image sizing by handle and keyboard persists safe widths and viewers cannot resize',()=>{
  const editor=makeNoteEditor('<p><img src="https://example.test/photo.png" data-width="50"></p>')
  try{
    const image=editor.view.dom.querySelector('.note-image-node'),handle=image.querySelector('.note-image-resize')
    const pos=()=>{let found;editor.state.doc.descendants((node,position)=>{if(node.type.name==='image')found=position});return found}
    handle.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))
    assert.equal(editor.state.doc.nodeAt(pos()).attrs.displayWidth,55)
    assert.match(notes.sanitizeNoteHtml(editor.getHTML()),/data-width="55"/)
    image.parentElement.getBoundingClientRect=()=>({width:400})
    handle.dispatchEvent(new dom.window.MouseEvent('pointerdown',{clientX:100,bubbles:true}))
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointermove',{clientX:180,bubbles:true}))
    dom.window.document.dispatchEvent(new dom.window.MouseEvent('pointerup',{clientX:180,bubbles:true}))
    assert.equal(editor.state.doc.nodeAt(pos()).attrs.displayWidth,75)
    editor.commands.undo();assert.equal(editor.state.doc.nodeAt(pos()).attrs.displayWidth,55,'resizing is a single undoable change')
    editor.commands.redo()
    editor.setEditable(false);handle.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}))
    assert.equal(editor.state.doc.nodeAt(pos()).attrs.displayWidth,75)
    for(const width of ['0','24','101','500','NaN','25px'])assert.ok(!notes.sanitizeNoteHtml('<img src="https://example.test/a" data-width="'+width+'">').includes('data-width'))
  }finally{editor.destroy()}
})

test('private image nodes fetch while hidden and recover from stalled or failed display loads',async()=>{
  installNoteEditorDOM()
  let timerId=0,requests=[]
  const timers=new Map()
  const extensions=load(fs.readFileSync('src/lib/noteEditor.ts','utf8'),{'./noteContent':notes},{
    document:dom.window.document,
    setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id},
    clearTimeout:id=>timers.delete(id),
  }).createNoteExtensions({
    resolveImage:async(path,force)=>{requests.push({path,force});return 'https://project.test/private.webp?token='+requests.length},
    imageLoading:'Loading',imageError:'Retry',
  })
  const path='10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000003.webp'
  const editor=new (require('@tiptap/core').Editor)({element:dom.window.document.createElement('div'),extensions,content:'<p><img data-note-image="'+path+'"></p>'})
  try{
    await new Promise(resolve=>setImmediate(resolve))
    const initialRequests=requests.length
    const image=editor.view.dom.querySelector('.note-image-node img'),status=editor.view.dom.querySelector('.note-image-status')
    await Promise.resolve()
    assert.equal(image.loading,'eager','a hidden lazy image can wait forever for visibility')
    assert.equal(image.hidden,true);assert.ok(image.src.endsWith('token='+initialRequests));assert.equal(status.disabled,true)
    assert.equal([...timers.values()][0].ms,15000)
    ;[...timers.values()][0].callback()
    assert.equal(status.textContent,'Retry');assert.equal(status.disabled,false);assert.equal(timers.size,0)
    status.click();await Promise.resolve()
    assert.equal(requests.length,initialRequests+1);assert.equal(requests.at(-1).force,true)
    image.onload(new dom.window.Event('load'))
    assert.equal(image.hidden,false);assert.equal(status.hidden,true);assert.equal(timers.size,0)
    assert.ok(!editor.getHTML().includes('token='),'signed URLs must still remain outside saved content')
    image.onerror(new dom.window.Event('error'))
    assert.equal(status.hidden,false);assert.equal(status.disabled,false);assert.equal(timers.size,0)
    status.click();await Promise.resolve();assert.equal(timers.size,1)
  }finally{editor.destroy()}
  assert.equal(timers.size,0,'unmounting cancels the pending display timeout')
})

test('reader image previews respond to click and keyboard without mutating notes, while editing keeps image selection',async()=>{
  installNoteEditorDOM()
  const calls=[],extensions=load(fs.readFileSync('src/lib/noteEditor.ts','utf8'),{'./noteContent':notes},{document:dom.window.document}).createNoteExtensions({onImagePreview:(src,alt)=>calls.push({src,alt})})
  const editor=new (require('@tiptap/core').Editor)({element:dom.window.document.createElement('div'),extensions,editable:false,content:'<p><img src="https://example.test/photo.png" alt="Roadmap"></p>'})
  try{
    await new Promise(resolve=>setImmediate(resolve))
    const image=editor.view.dom.querySelector('.note-image-node img')
    Object.defineProperty(image,'naturalWidth',{value:640});image.onload(new dom.window.Event('load'))
    const before=editor.getHTML()
    assert.equal(image.getAttribute('role'),'button');assert.equal(image.tabIndex,0)
    image.click();image.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
    assert.equal(calls.length,2);assert.equal(calls[0].alt,'Roadmap');assert.equal(editor.getHTML(),before)
    editor.setEditable(true);image.click();assert.equal(calls.length,2)
  }finally{editor.destroy()}
})

test('image preview modal validates sources, locks scroll while open, and releases it on close or unmount',async()=>{
  const f=interactiveEditorFixture({disabled:true})
  const dialog={open:false,showModal(){this.open=true},close(){this.open=false}}
  f.state.imageDialogRef=dialog
  const previous=dom.window.document.body.style.overflow
  try{
    await f.state.openImagePreview('javascript:alert(1)','Bad');assert.equal(f.state.imagePreview,null)
    await f.state.openImagePreview('https://example.test/photo.png','Roadmap')
    assert.equal(dialog.open,true);assert.equal(f.state.imagePreview.alt,'Roadmap')
    assert.equal(dom.window.document.body.style.overflow,'hidden')
    assert.equal(f.events.filter(e=>e[0]==='update:modelValue').length,0)
    f.state.closeImagePreview();assert.equal(dialog.open,false);assert.equal(f.state.imagePreview,null)
    assert.equal(dom.window.document.body.style.overflow,previous)
    await f.state.openImagePreview('https://example.test/photo.png','Roadmap')
  }finally{f.close()}
  assert.equal(dialog.open,false);assert.equal(dom.window.document.body.style.overflow,previous)
})

test('secure cards hide secrets until revealed, reset visibility when collapsed, and allow only web URLs',async()=>{
  const descriptor=parse(fs.readFileSync('src/features/secure_notes/components/SecureNoteItem.vue','utf8')).descriptor
  const dependencies={
    '@/lib/workspaceScope':{useModuleAccess:()=>({canWrite:vue.ref(false)})},'@/stores/ui':{useUIStore:()=>({addToast(){}})},'vue-i18n':{useI18n:()=>({t:key=>key})},
  }
  const component=load(compileScript(descriptor,{id:'secure-card-state'}).content,dependencies).default
  let state
  const props=vue.reactive({note:{id:'private',type:'secret',content:'sensitive text',url:'javascript:alert(1)',created_at:'2026-01-01'}})
  const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  const app=renderer.createApp({setup(){state=vue.proxyRefs(component.setup(props,{expose(){},emit(){}}));return()=>vue.h('div')}})
  app.mount({})
  try{
    assert.equal(state.showPassword,false);assert.equal(state.safeUrl,'')
    state.isExpanded=true;await vue.nextTick();state.showPassword=true
    state.isExpanded=false;await vue.nextTick();assert.equal(state.showPassword,false)
    props.note.url='https://example.test';await vue.nextTick();assert.equal(state.safeUrl,'https://example.test/')
    const rendered=load(compileScript(descriptor,{id:'secure-card-render',inlineTemplate:true}).content,dependencies).default
    const ssr=vue.createSSRApp(rendered,props);ssr.config.globalProperties.$t=key=>key
    const doc=await renderToString(ssr)
    assert.ok(!doc.includes('sensitive text'),'collapsed secret cards must not render their sensitive contents')
    assert.ok(!doc.includes('secure.deleteNoteTitle'))
  }finally{app.unmount()}
})

test('private image signing batches duplicates, caches per user, and rejects malformed or unauthenticated paths',async()=>{
  const owner='10000000-0000-0000-0000-000000000001',collection='30000000-0000-0000-0000-000000000003',paths=[1,2].map(n=>collection+'/'+owner+'/40000000-0000-0000-0000-'+String(n).padStart(12,'0')+'.webp')
  let user=owner,fail=false
  const calls=[]
  const storage={from(bucket){return {async createSignedUrls(selected,ttl){
    calls.push({bucket,selected,ttl})
    if(fail)return {error:Error('denied')}
    return {data:selected.map(path=>({path,signedUrl:'https://project.test/'+path+'?token=temporary'}))}
  }}}}
  const images=load(fs.readFileSync('src/lib/noteImages.ts','utf8'),{
    '@/stores/auth':{useAuthStore:()=>({user:user?{id:user}:null})},
    '@/stores/workspaces':{useWorkspacesStore:()=>({sessionKey:'scope',binding:()=>({collection_id:collection,role:'editor'})})},
    '@/lib/supabase':{supabase:{storage}},
  },{queueMicrotask,setTimeout,clearTimeout,File:globalThis.File})
  const values=await Promise.all([images.resolveNoteImage(paths[0]),images.resolveNoteImage(paths[0]),images.resolveNoteImage(paths[1])])
  assert.equal(calls.length,1);assert.equal(calls[0].selected.length,2);assert.equal(calls[0].ttl,300);assert.equal(values[0],values[1])
  await images.resolveNoteImage(paths[0]);assert.equal(calls.length,1)
  await assert.rejects(images.resolveNoteImage('../../foreign'),/imageUnavailable/)
  user='20000000-0000-0000-0000-000000000002';fail=true
  await assert.rejects(images.resolveNoteImage(paths[0]),/imageUnavailable/);assert.equal(calls.length,2,'another account cannot reuse the first account cache')
  user=null;await assert.rejects(images.resolveNoteImage(paths[0]),/imageUnavailable/);assert.equal(calls.length,2)
  await assert.rejects(images.uploadNoteImage({type:'image/png',size:1}),/imagePermission/)
  user=owner
  await assert.rejects(images.uploadNoteImage({type:'image/svg+xml',size:10}),/imageType/)
  await assert.rejects(images.uploadNoteImage({type:'image/png',size:6*1024*1024}),/imageSizeError/)
})

test('image upload distinguishes missing setup from write permissions without bypassing private storage',async()=>{
  const owner='10000000-0000-0000-0000-000000000001',collection='30000000-0000-0000-0000-000000000003'
  let failure={message:'Bucket not found',statusCode:'404'}
  const images=load(fs.readFileSync('src/lib/noteImages.ts','utf8'),{
    '@/stores/auth':{useAuthStore:()=>({user:{id:owner}})},
    '@/stores/workspaces':{useWorkspacesStore:()=>({sessionKey:'scope',binding:()=>({collection_id:collection,role:'editor'})})},
    '@/lib/supabase':{supabase:{storage:{from:bucket=>{assert.equal(bucket,'note-images');return {upload:async(path,blob,options)=>{assert.ok(path.startsWith(collection+'/'+owner+'/'));assert.equal(options.upsert,false);return {error:failure}}}}}}},
  },{queueMicrotask,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto})
  const image={type:'image/gif',size:10,name:'photo.gif'}
  await assert.rejects(images.uploadNoteImage(image),/imageSetup/)
  failure={message:'new row violates row-level security policy',statusCode:'403'}
  await assert.rejects(images.uploadNoteImage(image),/imagePermission/)
  failure={message:'Network request failed'}
  await assert.rejects(images.uploadNoteImage(image),/imageUploadFailed/)
})

test('note image storage confines reads to members, writes to editors, and uploaded paths to their actual author',async()=>{
  const savedDOM=new Map(['window','document','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
  for(const name of savedDOM.keys())delete globalThis[name]
  const {projectDB}=require('./helpers/project-db.cjs'),f=await projectDB()
  const {db,wid,gwid,owner,guest,as,rpc}=f
  try{
    await db.exec(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;
      create policy existing_broad_read on storage.objects for select to public using(true);
      create policy existing_broad_write on storage.objects for all to authenticated using(true) with check(true);`)
    const migration=fs.readFileSync('supabase/migrations/202610140002_note_images.sql','utf8')
    await db.exec(migration)
    const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='detailed'",[wid])).rows[0].collection_id
    const quick=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='quick'",[wid])).rows[0].collection_id
    const path=cid+'/'+owner+'/40000000-0000-0000-0000-000000000004.webp'
    const guestPath=cid+'/'+guest+'/50000000-0000-0000-0000-000000000005.webp'
    const insert=name=>db.query("insert into storage.objects(bucket_id,name) values('note-images',$1)",[name])
    await as(owner);await insert(path)
    assert.equal((await db.query('select * from storage.objects')).rows.length,1)
    await assert.rejects(insert(quick+'/'+owner+'/40000000-0000-0000-0000-000000000004.webp'),/row-level security/)
    await assert.rejects(insert('../../private.svg'),/row-level security/)
    await as(guest);assert.equal((await db.query('select * from storage.objects')).rows.length,0)
    await as(owner,'anon');assert.equal((await db.query('select * from storage.objects')).rows.length,0)
    await as(owner);const invite=await rpc("select create_collection_invite($1,'detailed','viewer') as result",[wid])
    await as(guest);await rpc('select accept_collection_invite($1,$2) as result',[invite.token,gwid])
    assert.equal((await db.query('select * from storage.objects')).rows.length,1)
    await assert.rejects(insert(guestPath),/row-level security/)
    await db.exec('reset role');await db.query("update collection_members set role='editor' where collection_id=$1 and user_id=$2",[cid,guest]);await as(guest)
    await insert(guestPath)
    assert.equal((await db.query('update storage.objects set name=name where name=$1 returning *',[guestPath])).rows.length,0,'private images cannot be overwritten by a broad existing update policy')
    await assert.rejects(insert(cid+'/'+owner+'/60000000-0000-0000-0000-000000000006.webp'),/row-level security/)
    assert.equal((await db.query('delete from storage.objects where name=$1 returning *',[path])).rows.length,0)
    assert.equal((await db.query('delete from storage.objects where name=$1 returning *',[guestPath])).rows.length,1)
    await db.exec('reset role');await db.exec(migration)
    assert.equal((await db.query("select public from storage.buckets where id='note-images'")).rows[0].public,false)
    await db.query("insert into workspaces(user_id,name) values($1,'Reserve')",[guest]);await db.query('update workspaces set archived_at=now() where id=$1',[gwid]);await as(guest)
    assert.equal((await db.query('select * from storage.objects')).rows.length,0)
  }finally{await db.close();for(const [name,descriptor] of savedDOM)if(descriptor)Object.defineProperty(globalThis,name,descriptor)}
})
