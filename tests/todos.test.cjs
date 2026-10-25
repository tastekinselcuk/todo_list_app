const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const vue = require('vue'), pinia = require('pinia')
const { parse, compileScript } = require('@vue/compiler-sfc')
const { renderToString } = require('@vue/server-renderer')
const copy = value => JSON.parse(JSON.stringify(value))
function load(source, dependencies = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require: name => dependencies[name] || (name === '@/lib/utils' ? load(fs.readFileSync('src/lib/utils.ts','utf8'), {}, globals) : null) || (name === '@/lib/searchNavigation' ? load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'), {vue}, globals) : null) || (name === '@/lib/storage' ? load(fs.readFileSync('src/lib/storage.ts', 'utf8'), {}, globals) : name === '@/lib/moduleCatalog' ? load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'), {}, globals) : require(name)), console: { error() {} }, setTimeout, clearTimeout, ...globals,
  })
  return exports
}
function fixture({ cache = new Map(), workspace = 'personal', viewer = false } = {}) {
  pinia.setActivePinia(pinia.createPinia())
  const rows = {
    todos: [
      { id: 'a', title: 'İş notu', description: '<b>Rapor</b>', category_id: 'work', priority: 'high', completed: false, version: 3, created_at: '2026-10-04', updated_at: '2026-10-04' },
      { id: 'b', title: 'Personal note', description: '', category_id: 'personal', priority: 'low', completed: false, version: 1, created_at: '2026-10-03' },
      { id: 'c', title: 'Work two', description: '<img src="https://example.test/photo.jpg">', category_id: 'work', priority: 'medium', completed: false, version: 1, created_at: '2026-10-02' },
      { id: 'd', title: 'Completed', description: '', category_id: null, priority: 'low', completed: true, version: 1, created_at: '2026-10-01' },
    ],
    categories: [{ id: 'work', name: 'İş', color: '#3B82F6' }, { id: 'personal', name: 'Kişisel', color: '#10B981' }],
  }
  const failures = new Set(), calls = []
  let held, release
  const client = {
    canWrite: () => !viewer, listen() {},
    async removeCategory(id) {
      if(viewer)throw Error('READ_ONLY')
      calls.push({table:'categories',operation:'delete',id})
      if(held)await held
      if(failures.has('delete'))throw Error('OFFLINE')
      const category=rows.categories.find(row=>row.id===id)
      const notes=rows.todos.filter(row=>row.category_id===id)
      notes.forEach(row=>{row.category_id=null;row.version++})
      rows.categories.splice(rows.categories.indexOf(category),1)
      return {id,notes:notes.map(row=>({id:row.id,version:row.version}))}
    },
    from(table) {
      let operation = 'select', payload, single = false, sorted = false
      const filters = []
      const query = {
        select() { return query }, order() { sorted = true; return query }, single() { single = true; return query },
        eq(column, value) { filters.push([column, value]); return query },
        update(value) { if (viewer) throw new Error('READ_ONLY'); operation = 'update'; payload = copy(value); return query },
        insert(value) { if (viewer) throw new Error('READ_ONLY'); operation = 'insert'; payload = copy(value); return query },
        delete() { if (viewer) throw new Error('READ_ONLY'); operation = 'delete'; return query },
        then(resolve, reject) {
          calls.push({ table, operation, payload, filters })
          return (async () => {
            if (held) await held
            if (failures.has(operation) || failures.has(table + ':' + operation)) return { data: null, error: new Error('OFFLINE') }
            let data = rows[table].filter(row => filters.every(([key, value]) => row[key] === value))
            if (operation === 'update') data.forEach(row => Object.assign(row, payload, { version: row.version + 1 }))
            if (operation === 'delete') data.forEach(row => rows[table].splice(rows[table].indexOf(row), 1))
            if (operation === 'insert') { data = payload.map((record, index) => ({ ...record, id: 'new-' + calls.length + '-' + index, version: 1, created_at: '2026-10-10' })); rows[table].push(...data) }
            if (sorted) data.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
            return { data: copy(single ? data[0] : data), error: null }
          })().then(resolve, reject)
        },
      }
      return query
    },
  }
  const useTodoStore = load(fs.readFileSync('src/features/todos/stores/todo.ts', 'utf8'), {
    '@/lib/workspaceScope': { defineWorkspaceStore: pinia.defineStore, useWorkspaceClient: () => client, workspaceStorageKey: key => workspace + ':' + key },
    '../../../stores/auth': { useAuthStore: () => ({ user: { id: 'owner' } }) },
  }, { localStorage: { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) } }).useTodoStore
  return { store: useTodoStore(), rows, calls, failures, cache,
    hold() { held = new Promise(resolve => { release = resolve }) }, resume() { held = undefined; release() } }
}
const ids = store => copy(store.todos.map(todo => todo.id))

test('filtered and grouped reordering preserves hidden notes and current record contents', async () => {
  const h = fixture(); await h.store.fetchTodos()
  const stale = copy(h.store.todos[0]); h.store.todos[0].title = 'Latest content'
  h.store.reorderTodos([h.store.todos[2], stale])
  assert.deepEqual(ids(h.store), ['c', 'b', 'a', 'd'])
  assert.equal(h.store.todos[2].title, 'Latest content')
  h.store.reorderTodos([h.store.todos[3], h.store.todos[1]])
  assert.deepEqual(ids(h.store), ['c', 'd', 'a', 'b'])
  h.store.reorderTodos([h.store.todos[1], h.store.todos[1], { id: 'missing' }])
  assert.equal(h.store.todos.length, 4)
  assert.equal(new Set(ids(h.store)).size, 4)
})

test('manual order survives refresh and reopening while new notes appear first and workspaces stay separate', async () => {
  const h = fixture(); await h.store.fetchTodos()
  h.store.reorderTodos([h.store.todos[2], h.store.todos[0]])
  await vue.nextTick()
  h.rows.todos[2].title = 'Remote change'
  h.rows.todos.unshift({ ...h.rows.todos[0], id: 'new', created_at: '2026-10-10' })
  await h.store.fetchTodos()
  assert.deepEqual(ids(h.store), ['new', 'c', 'b', 'a', 'd'])
  assert.equal(h.store.todos[1].title, 'Remote change')
  await vue.nextTick()
  const reopened = fixture({ cache: h.cache })
  assert.deepEqual(ids(reopened.store), ['new', 'c', 'b', 'a', 'd'])
  const other = fixture({ cache: h.cache, workspace: 'work' })
  assert.deepEqual(ids(other.store), [])
})

test('failed deletion retains notes, reports failure and successful deletion persists truthfully', async () => {
  const h = fixture(); await h.store.fetchTodos()
  h.failures.add('delete')
  assert.equal(await h.store.deleteTodo('a'), false)
  assert.equal(h.store.todos.length, 4)
  h.failures.clear()
  assert.equal(await h.store.deleteTodo('a'), true)
  assert.equal(h.store.todos.length, 3)
})

test('restoring a detailed note preserves its manual position across refreshes and subsequent reordering',async()=>{
 const h=fixture();await h.store.fetchTodos()
 h.store.reorderTodos([h.store.todos[1],h.store.todos[0],h.store.todos[2],h.store.todos[3]])
 const original=copy(h.rows.todos.find(row=>row.id==='a'))
 await h.store.deleteTodo('a');await h.store.fetchTodos()
 h.store.reorderTodos([h.store.todos[2],h.store.todos[0],h.store.todos[1]])
 h.rows.todos.push(original);await h.store.fetchTodos()
 assert.deepEqual(ids(h.store),['d','a','b','c'],'the trashed slot stays in the saved manual order')
})

test('completion captures the new shared version for subsequent editing and failed writes leave it unchanged', async () => {
  const h = fixture(); await h.store.fetchTodos()
  assert.equal(await h.store.toggleTodo('a'), true)
  assert.equal(h.store.todos[0].completed, true)
  assert.equal(h.store.todos[0].version, 4)
  h.failures.add('update')
  assert.equal(await h.store.toggleTodo('a'), false)
  assert.equal(h.store.todos[0].completed, true)
  assert.equal(h.store.todos[0].version, 4)
})

test('viewers cannot reorder locally or send note writes', async () => {
  const h = fixture({ viewer: true }); await h.store.fetchTodos()
  const count = h.calls.length
  h.store.reorderTodos([...h.store.todos].reverse())
  assert.deepEqual(ids(h.store), ['a', 'b', 'c', 'd'])
  assert.equal(await h.store.deleteTodo('a'), false)
  assert.equal(await h.store.toggleTodo('a'), false)
  assert.equal(h.calls.length, count)
})

const renderer = vue.createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode() {}, nextSibling() {} })
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }
function setupState(file, store, props = {}, viewer = false, globals = {}) {
  const toasts = [], events = []
  const dependencies = {
    '@/lib/workspaceScope': { useModuleLoad: callback => vue.onMounted(callback), useModuleAccess: () => ({ canWrite: vue.computed(() => !viewer) }), useWorkspaceDraft: (_key, value) => vue.ref(copy(value)) },
    '@/features/todos/stores/todo': { useTodoStore: () => store, TODO_TITLE_MAX_LENGTH:120 },
    '@/stores/ui': { useUIStore: () => ({ addToast: (...args) => toasts.push(args), showConfirm: async () => assert.fail('note deletion must not open a confirmation') }) },
    'vue-i18n': { useI18n: () => ({ t: key => key, locale: vue.ref('tr') }) },
    '@vueuse/core': { onClickOutside: () => () => {} },
    '@/components/ui/CustomSelect.vue': { default: { setup: () => () => vue.h('div') } },
    '@/components/ui/ColorPalette.vue': { default: {} },
    './CodeSnippetEditor.vue': { default: {} }, 'highlight.js/styles/github-dark.css': {},
    './TodoQuickAdd.vue': { default: {} }, './TodoFilters.vue': { default: {} }, './TodoCard.vue': { default: {} }, './CategoryModal.vue': { default: {} }, './RichTextEditor.vue': { default: {} }, './QuickNoteItem.vue': { default: {} },
  }
  const descriptor = parse(fs.readFileSync(file, 'utf8')).descriptor
  const source = compileScript(descriptor, { id: file }).content
  const component = load(source, dependencies, { document: { addEventListener() {}, removeEventListener() {} }, window:{addEventListener(){},removeEventListener(){},innerWidth:1200,innerHeight:900}, ...globals }).default
  let state
  const app = renderer.createApp({ setup() { state = component.setup(props, { expose() {}, emit: (...args) => events.push(args) }); return () => vue.h('div') } })
  app.mount({})
  return { state, app, events, toasts, dependencies }
}

test('code cards open in focused reading mode, retain failed edits and captured versions, then save back to reading',async()=>{
  const snippet={id:'code-one',title:'Example',language:'plaintext',code:'Original code',version:3,createdAt:'2026-10-22',updatedAt:'2026-10-22'}
  const props=vue.reactive({snippet,languageOptions:[]})
  const f=setupState('src/features/code_snippets/components/CodeSnippetItem.vue',{},props)
  try{
    f.state.openFocusedView();assert.equal(f.state.isOpen.value,true);assert.equal(f.state.isEditing.value,false)
    f.state.copySnippet();assert.deepEqual(f.events.at(-1),['copy','Original code'])
    f.state.handleSave();assert.equal(f.events.filter(event=>event[0]==='update').length,0)
    props.snippet={...snippet,title:'Remote title',version:4};await settle()
    f.state.beginInlineEdit();assert.equal(f.state.editForm.value.title,'Remote title');assert.equal(f.state.baseVersion.value,4)
    f.state.editForm.value.code='Unsaved draft';f.state.closeFocusedView();f.state.openFocusedView();f.state.beginInlineEdit()
    assert.equal(f.state.editForm.value.code,'Unsaved draft','Escape/close retains the draft')
    props.snippet={...props.snippet,code:'Other member code',version:5};await settle()
    assert.equal(f.state.editConflict.value,true);assert.equal(f.state.baseVersion.value,4)
    f.state.handleSave();const failed=f.events.at(-1)
    assert.equal(failed[0],'update');assert.equal(failed[2].version,4)
    f.state.closeFocusedView();assert.equal(f.state.isOpen.value,true,'pending saves keep the focused window open')
    failed[3](false,true);assert.equal(f.state.isEditing.value,true);assert.equal(f.state.editForm.value.code,'Unsaved draft')
    f.state.refreshDraft();f.events.at(-1)[2](5)
    f.state.handleSave();const saved=f.events.at(-1)
    props.snippet={...props.snippet,...saved[2],version:6};saved[3](true,false);await settle()
    assert.equal(f.state.isOpen.value,true);assert.equal(f.state.isEditing.value,false);assert.equal(f.state.baseVersion.value,6)
    assert.equal(props.snippet.code,'Unsaved draft')
    f.state.beginInlineEdit();f.state.editForm.value.code='Discard me';f.state.cancelInlineEdit()
    assert.equal(f.state.isOpen.value,true);assert.equal(f.state.isEditing.value,false);assert.equal(f.state.editForm.value.code,'Unsaved draft')
  }finally{f.app.unmount()}
  const viewer=setupState('src/features/code_snippets/components/CodeSnippetItem.vue',{},props,true)
  try{
    viewer.state.openFocusedView();viewer.state.beginInlineEdit();viewer.state.handleSave();viewer.state.removeSnippet()
    assert.equal(viewer.state.isOpen.value,true);assert.equal(viewer.state.isEditing.value,false);assert.equal(viewer.events.length,0)
    viewer.state.copySnippet();assert.equal(viewer.events[0][0],'copy')
  }finally{viewer.app.unmount()}
})

test('category creation retains failed drafts, blocks duplicate submissions and restores keyboard focus on close',async()=>{
  let release,writes=0,focused=0
  const listeners=new Map(),props=vue.reactive({open:true})
  const pending=new Promise(resolve=>release=resolve)
  const store={async addCategory(payload){writes++;await pending;return{success:false,message:'OFFLINE'}}}
  const document={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),querySelector:()=>({focus(){focused++}})}
  const h=setupState('src/features/todos/components/CategoryModal.vue',store,props,false,{document})
  try{
    h.state.newCategory.value={name:'  Project notes  ',color:'#287755',icon:'folder'}
    const write=h.state.handleSubmit();await h.state.handleSubmit()
    h.state.closeModal(true)
    assert.equal(writes,1)
    assert.equal(h.events.length,0,'a pending save keeps the form open')
    release();await write
    assert.equal(h.state.saving.value,false)
    assert.equal(h.state.newCategory.value.name,'  Project notes  ')
    assert.equal(h.state.newCategory.value.color,'#287755')
    assert.equal(h.events.length,0,'a failed save preserves the editable draft')
    assert.equal(h.toasts.at(-1)[1],'error')
    h.state.closeModal(true)
    assert.deepEqual(h.events.at(-1),['update:open',false])
    assert.equal(focused,1)
    props.open=false;await settle()
    assert.equal(listeners.size,0)
    props.open=true;await settle()
    h.state.resetDraft()
    assert.equal(h.state.newCategory.value.name,'  Project notes  ','a cancelled closing animation must not erase a reopened draft')
  }finally{release();h.app.unmount()}
  assert.equal(listeners.size,0)
})

test('quick and detailed notes delete immediately, deduplicate repeated clicks and retain rows on failure',async()=>{
  const h=fixture()
  h.rows.quick_notes=[{id:'quick-one',content:'Quick note',completed:false,created_at:'2026-10-17'}]
  const board=setupState('src/features/todos/components/TodoBoard.vue',h.store)
  const quick=setupState('src/features/quick_notes/components/QuickNotes.vue',h.store)
  try{
    await settle()
    for(const [table,id,view,handler] of [['todos','a',board,'handleDeleteTodo'],['quick_notes','quick-one',quick,'handleDeleteQuickNote']]){
      h.hold();h.failures.add('delete')
      const pending=view.state[handler](id)
      await view.state[handler](id);await settle()
      assert.equal(h.calls.filter(call=>call.table===table&&call.operation==='delete').length,1)
      assert.ok(h.rows[table].some(row=>row.id===id),'the row stays visible until the request succeeds')
      h.resume();await pending
      assert.ok(h.rows[table].some(row=>row.id===id));assert.equal(view.toasts.at(-1)[1],'error')
      h.failures.clear();await view.state[handler](id)
      assert.equal(h.rows[table].some(row=>row.id===id),false)
      assert.equal(view.toasts.filter(toast=>toast[1]==='info').length,0,'the shared Undo notification replaces a plain success toast')
    }
  }finally{board.app.unmount();quick.app.unmount()}
})

test('board combines search, categories and completion without legacy priority filtering', async () => {
  const h = fixture()
  const { state, app } = setupState('src/features/todos/components/TodoBoard.vue', h.store)
  await settle()
  assert.equal(state.loading.value, false)
  assert.equal(state.groupedTodos.value.reduce((count, group) => count + group.todos.length, 0), 4)
  state.query.value = 'İŞ'; state.selectedCategories.value = ['work']; state.showCompleted.value = false
  assert.deepEqual(state.filteredTodosArray.value.map(todo => todo.id), ['a'])
  state.query.value = 'rapor'
  assert.deepEqual(state.filteredTodosArray.value.map(todo => todo.id), ['a'])
  state.clearFilters(); assert.equal(state.filteredTodosArray.value.length, 4)
  app.unmount()
})

test('category dropdown keeps multiple selections open and filters the board until All clears only categories', async () => {
  const h = fixture()
  const board = setupState('src/features/todos/components/TodoBoard.vue', h.store)
  await settle()
  const props = vue.reactive({ selectedCategories: [], selectedPriority: 'high', showCompleted: false, isGrouped: true })
  const filters = setupState('src/features/todos/components/TodoFilters.vue', h.store, props)
  const applySelection = () => {
    const [name, value] = filters.events.at(-1)
    assert.equal(name, 'update:selectedCategories')
    props.selectedCategories = value
    board.state.selectedCategories.value = value
  }
  assert.equal(filters.state.categoryLabel.value, 'todo.all')
  filters.state.handleCategoryMenuToggle({ newState: 'open' })
  filters.state.handleCategoryToggle('work'); applySelection()
  assert.equal(filters.state.categoryLabel.value, 'İş')
  assert.deepEqual(board.state.filteredTodosArray.value.map(todo => todo.id), ['a', 'c'])
  filters.state.handleCategoryToggle('personal'); applySelection()
  assert.equal(filters.state.categoryOpen.value, true)
  assert.equal(filters.state.categoryLabel.value, 'İş, Kişisel')
  assert.deepEqual(board.state.filteredTodosArray.value.map(todo => todo.id), ['a', 'b', 'c'])
  filters.state.handleCategoryToggle('work'); applySelection()
  assert.deepEqual(board.state.filteredTodosArray.value.map(todo => todo.id), ['b'])
  filters.state.handleCategoryMenuToggle({ newState: 'closed' })
  assert.equal(filters.state.categoryOpen.value, false)
  assert.deepEqual(copy(props.selectedCategories), ['personal'])
  assert.deepEqual(board.state.filteredTodosArray.value.map(todo => todo.id), ['b'])
  filters.state.handleCategoryMenuToggle({ newState: 'open' })
  filters.state.clearCategorySelection(); applySelection()
  assert.equal(filters.state.categoryLabel.value, 'todo.all')
  assert.equal(board.state.filteredTodosArray.value.length, 4)
  assert.equal(props.selectedPriority, 'high')
  assert.equal(props.showCompleted, false)
  assert.equal(props.isGrouped, true)
  assert.equal(filters.events.every(([name]) => name === 'update:selectedCategories'), true)
  filters.state.handleCategoryMenuToggle({ newState: 'closed' })
  assert.equal(filters.state.categoryOpen.value, false)
  assert.deepEqual(copy(props.selectedCategories), [])
  filters.app.unmount(); board.app.unmount()
})

test('category deletion in the dropdown closes it and removes only the deleted category from the selected filters', async () => {
  const h = fixture(); await h.store.fetchTodos(); await h.store.fetchCategories()
  const props = vue.reactive({ selectedCategories: ['work', 'personal'], selectedPriority: 'all', showCompleted: true, isGrouped: false })
  const filters = setupState('src/features/todos/components/TodoFilters.vue', h.store, props)
  filters.state.handleCategoryMenuToggle({ newState: 'open' })
  await filters.state.handleDeleteCategory('work')
  assert.equal(filters.state.categoryOpen.value, false)
  assert.deepEqual(copy(filters.events.at(-1)), ['update:selectedCategories', ['personal']])
  assert.deepEqual(copy(h.store.categories.map(category => category.id)), ['personal'])
  assert.equal(h.store.todos.some(todo => todo.id === 'b'), true)
  assert.equal(h.store.todos.length,4,'deleting a category preserves its notes')
  assert.equal(h.store.todos.find(todo=>todo.id==='a').categoryId,null)
  assert.equal(h.store.todos.find(todo=>todo.id==='a').version,4)
  await h.store.toggleTodo('a')
  assert.equal(h.store.todos.find(todo=>todo.id==='a').version,5,'subsequent edits use the new version')
  filters.app.unmount()
})

test('a failed category deletion preserves categories and notes and reports failure',async()=>{
 const h=fixture();await h.store.fetchTodos();await h.store.fetchCategories()
 h.failures.add('delete')
 const result=await h.store.deleteCategory('work')
 assert.equal(result.success,false);assert.equal(h.store.categories.length,2);assert.equal(h.store.todos.length,4)
 assert.equal(h.store.todos.find(todo=>todo.id==='a').categoryId,'work')
})

test('composer prevents duplicate submits, retains failed drafts and saves categorized rich notes without a deadline', async () => {
  const h = fixture(); await h.store.fetchCategories()
  const { state, app, toasts } = setupState('src/features/todos/components/TodoQuickAdd.vue', h.store)
  state.quickTodoTitle.value = '  My note  '; state.quickTodoDescription.value = '<b>Rich</b><img src="https://example.test/image.jpg">'; state.isDraftingTodo.value = true
  h.hold(); h.failures.add('insert')
  const pending = state.saveDraft(); await state.saveDraft(); await vue.nextTick()
  assert.equal(state.saving.value, true)
  assert.equal(h.calls.filter(call => call.operation === 'insert').length, 1)
  h.resume(); await pending
  assert.equal(state.quickTodoTitle.value, '  My note  ')
  assert.equal(state.isDraftingTodo.value, true)
  assert.equal(toasts.at(-1)[1], 'error')
  h.failures.clear(); await state.saveDraft()
  assert.equal(h.store.todos[0].title, 'My note')
  assert.equal(h.store.todos[0].dueDate, null)
  assert.equal(h.store.todos[0].priority, 'low')
  assert.match(h.store.todos[0].description, /<b>Rich<\/b><img/)
  assert.equal(state.quickTodoTitle.value, '')
  assert.equal(state.isDraftingTodo.value, false)
  app.unmount()
})

test('creating a note moves the same editor into the fitted dialog and back, preserves failed saves and releases page scroll', async () => {
  const {JSDOM}=require('jsdom'),runtime=require('@vue/runtime-dom')
  const dom=new JSDOM('<!doctype html><body><main id="app"></main></body>',{pretendToBeVisual:true}),doc=dom.window.document
  const keys=['document','window','Document','ShadowRoot','Element','HTMLElement','SVGElement','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'],previous=new Map(keys.map(key=>[key,global[key]]))
  Object.assign(global,{document:doc,window:dom.window,Document:dom.window.Document,ShadowRoot:dom.window.ShadowRoot,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,SVGElement:dom.window.SVGElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout})
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('input')?.focus()}
  dom.window.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new dom.window.Event('close'))}}
  const h=fixture();await h.store.fetchCategories()
  let editorMounts=0
  const Editor={props:['modelValue','disabled','fitHeight'],emits:['focus','update:modelValue','busy-change'],setup(props,{emit,expose}){
    editorMounts++;const node=vue.ref()
    expose({focus:()=>node.value?.focus()})
    return()=>vue.h('div',{'data-note-editor':''},vue.h('div',{ref:node,contenteditable:'true',tabindex:0,'data-editor-body':'',innerHTML:props.modelValue,onFocus:()=>emit('focus'),onInput:event=>emit('update:modelValue',event.target.innerHTML)}))
  }}
  const dependencies={
    vue:{...vue,Transition:(_props,{slots})=>slots.default?.()},
    '@/lib/workspaceScope':{useWorkspaceDraft:(_key,value)=>vue.ref(value)},
    '@/features/todos/stores/todo':{useTodoStore:()=>h.store,TODO_TITLE_MAX_LENGTH:120},
    '@/stores/ui':{useUIStore:()=>({addToast(){}})},'vue-i18n':{useI18n:()=>({t:key=>key})},
    '@/components/ui/CustomSelect.vue':{default:{setup:()=>()=>vue.h('span','Category')}},'./RichTextEditor.vue':{__esModule:true,default:Editor},
  }
  const component=load(compileScript(parse(fs.readFileSync('src/features/todos/components/TodoQuickAdd.vue','utf8')).descriptor,{id:'composer-dom',inlineTemplate:true}).content,dependencies,{document:doc}).default
  const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,
    createElement:(tag,namespace)=>namespace==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),
    createText:value=>doc.createTextNode(value),createComment:value=>doc.createComment(value),querySelector:selector=>doc.querySelector(selector),
    insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]},
  })
  const app=renderer.createApp(component)
  try{
    app.mount(doc.getElementById('app'));await settle()
    const title=doc.querySelector('input');title.value='Focused draft';title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));title.focus()
    await settle();await settle()
    const editor=doc.querySelector('[data-editor-body]'),dialog=doc.querySelector('dialog'),origin=doc.querySelector('[data-shared-editing]')
    assert.equal(dialog.open,false,'typing a title only expands the inline details')
    assert.equal(doc.querySelector('button[aria-label="todo.addTodo"]'),null,'the duplicate plus action stays removed')
    editor.innerHTML='<p>Keep this rich draft</p>';editor.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await settle()
    origin.getBoundingClientRect=()=>({height:240})
    editor.focus();await settle();await settle()
    assert.equal(dialog.open,true);assert.ok(dialog.contains(editor));assert.equal(origin.style.height,'240px')
    assert.equal(editorMounts,1,'opening the dialog moves the editor instead of recreating its undo and selection state')
    assert.equal(doc.body.style.overflow,'hidden')
    dialog.click();await settle()
    assert.equal(dialog.open,true,'backdrop clicks must not dismiss an unsaved focused draft')
    assert.equal(doc.body.style.overflow,'hidden');assert.equal(editorMounts,1)
    dialog.getBoundingClientRect=()=>({left:100,top:100,right:800,bottom:700})
    dialog.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,detail:2,clientX:20,clientY:20}));await settle()
    editor.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true,detail:2,clientX:200,clientY:200}));await settle()
    assert.equal(dialog.open,true,'separate clicks and double-clicking text preserve the focused editor')
    dialog.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true,detail:2,clientX:20,clientY:20}));await settle();await settle()
    assert.equal(dialog.open,false,'a deliberate double-click on the backdrop returns the same draft to the page')
    assert.equal(title.value,'Focused draft');assert.equal(editorMounts,1)
    editor.focus();await settle();await settle()
    dialog.querySelector('button[aria-label="common.close"]').click();await settle();await settle()
    assert.equal(dialog.open,false);assert.ok(origin.contains(editor));assert.equal(title.value,'Focused draft')
    assert.match(editor.innerHTML,/Keep this rich draft/);assert.equal(editorMounts,1);assert.equal(doc.body.style.overflow,'')
    editor.focus();await settle();await settle();h.failures.add('insert')
    dialog.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle()
    assert.equal(dialog.open,true,'failed saves keep the focused draft available')
    assert.equal(title.value,'Focused draft');assert.match(editor.innerHTML,/Keep this rich draft/)
    h.failures.clear();dialog.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle()
    assert.equal(dialog.open,false);assert.equal(doc.body.style.overflow,'');assert.equal(title.value,'')
    assert.match(h.store.todos[0].description,/Keep this rich draft/)
  }finally{app.unmount();for(const[key,value]of previous){if(value===undefined)delete global[key];else global[key]=value}dom.window.close()}
})

test('category color strip stays beside its trigger, fits narrow screens and closes after a valid selection',async()=>{
  const props=vue.reactive({open:true})
  const viewport={innerWidth:1200,innerHeight:900,addEventListener(){},removeEventListener(){}}
  const f=setupState('src/features/todos/components/CategoryModal.vue',{},props,false,{window:viewport})
  let shown=0,hidden=0
  f.state.colorTriggerRef.value={getBoundingClientRect:()=>({top:200,bottom:240,left:100,right:140})}
  f.state.colorMenuRef.value={showPopover(){shown++},hidePopover(){hidden++}}
  try{
    f.state.toggleColorMenu();assert.equal(shown,1);assert.equal(f.state.colorPosition.value.left,'146px');assert.equal(f.state.colorPosition.value.top,'200px')
    f.state.colorOpen.value=true;f.state.chooseColor('#AABBCC')
    assert.equal(f.state.newCategory.value.color,'#AABBCC');assert.equal(f.state.colorOpen.value,false);assert.equal(hidden,1)
    f.state.chooseColor('invalid');assert.equal(f.state.newCategory.value.color,'#AABBCC')
    viewport.innerWidth=320;viewport.innerHeight=280;f.state.toggleColorMenu()
    assert.equal(f.state.colorPosition.value.left,'8px');assert.equal(f.state.colorPosition.value.top,'202px')
  }finally{f.app.unmount()}
})

test('quick notes group by the local calendar day instead of the UTC timestamp prefix',async()=>{
  const f=setupState('src/features/quick_notes/components/QuickNotes.vue',{quickNotes:[],fetchQuickNotes:async()=>{}})
  try{
    for(const date of [new Date(2026,9,22,0,15),new Date(2026,9,22,23,45)])
      assert.equal(f.state.getDateKey(date.toISOString()),'2026-10-22','notes near either end of the local day must stay in that day')
    assert.equal(f.state.formatDateHeader(f.state.getTodayKey()),'todo.today')
    const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1)
    assert.equal(f.state.formatDateHeader(f.state.localDateKey(yesterday)),'todo.yesterday')
  }finally{f.app.unmount()}
})

test('shared color palette validates custom colors before emitting and preserves preset selection', async()=>{
  const props=vue.reactive({modelValue:'#287755',options:[{value:'#287755',label:'Forest',color:'#287755'}],allowCustom:true})
  const f=setupState('src/components/ui/ColorPalette.vue',{},props)
  try{
    assert.equal(f.state.selected('#287755'),true)
    f.state.customHex.value='invalid';f.state.applyCustom();assert.equal(f.events.length,0)
    f.state.customHex.value=' aabbcc ';f.state.applyCustom();assert.deepEqual(f.events[0],['update:modelValue','#AABBCC'])
    props.modelValue='#102B35';await vue.nextTick();assert.equal(f.state.customHex.value,'#102B35')
  }finally{f.app.unmount()}
})

test('open edit preserves rich text and the captured version on conflict and refreshes without losing the draft', async () => {
  const h = fixture(); await h.store.fetchTodos()
  const props = vue.reactive({ todo: copy(h.store.todos[0]), color: '#3B82F6', categoryName: 'Work' })
  const { state, app } = setupState('src/features/todos/components/TodoCard.vue', h.store, props)
  state.startEdit(); state.editForm.value.title = 'My draft'; state.editForm.value.description = '<b>My changes</b>'
  props.todo = { ...props.todo, version: 4, title: 'Other member' }
  await settle()
  assert.equal(state.editConflict.value, true)
  assert.equal(state.editForm.value.title, 'My draft')
  assert.equal(state.editForm.value.version, 3)
  h.rows.todos[0].version = 4
  await state.refreshDraftVersion()
  assert.equal(state.editForm.value.version, 4)
  assert.equal(state.editForm.value.description, '<b>My changes</b>')
  state.cancelEdit()
  assert.equal(state.editForm.value.title, 'Other member')
  assert.equal(state.isEditing.value, false)
  assert.equal(state.isExpanded.value, true)
  app.unmount()
})

test('read-only detailed cards and category filters retain content and hide destructive controls', async () => {
  const h = fixture({ viewer: true }); await h.store.fetchTodos(); await h.store.fetchCategories()
  for (const file of ['TodoCard.vue', 'TodoFilters.vue']) {
    const props = file === 'TodoCard.vue' ? { todo: h.store.todos[0], color: '#3B82F6', categoryName: 'İş' } : { selectedCategories: [], selectedPriority: 'all', showCompleted: true, isGrouped: false }
    const prepared = setupState('src/features/todos/components/' + file, h.store, vue.reactive(props), true)
    prepared.app.unmount()
    const descriptor = parse(fs.readFileSync('src/features/todos/components/' + file, 'utf8')).descriptor
    const component = load(compileScript(descriptor, { id: file, inlineTemplate: true }).content, prepared.dependencies).default
    const html = await renderToString(vue.createSSRApp(component, props))
    assert.doesNotMatch(html, /todo.deleteTask|todo.deleteCategory|drag-handle/)
    if (file === 'TodoCard.vue') { assert.match(html, /İş notu/); assert.match(html, /disabled[^>]*aria-label="todo.toggleCompletion/); assert.match(html, /todo.viewNote/) }
  }
})

test('new or changed detailed-note titles are bounded without truncating legacy notes or losing their content',async()=>{
  const h=fixture();await h.store.fetchTodos();await h.store.fetchCategories()
  const count=h.calls.length
  const input={title:'x'.repeat(121),description:'Keep this content',categoryId:'work',priority:'low',dueDate:null,completed:false}
  assert.equal((await h.store.addTodo(input)).success,false)
  assert.equal(await h.store.updateTodo({...h.store.todos[0],title:input.title}),false)
  assert.equal(h.calls.length,count,'invalid new titles must not be written')
  const composer=setupState('src/features/todos/components/TodoQuickAdd.vue',h.store)
  composer.state.quickTodoTitle.value=input.title
  await composer.state.saveDraft()
  assert.equal(composer.toasts.at(-1)[0],'todo.titleTooLong');assert.equal(h.calls.length,count)
  composer.app.unmount()
  h.store.todos[0].title='Existing long title '.repeat(20)
  const old=h.store.todos[0].title
  assert.equal(await h.store.updateTodo({...h.store.todos[0],description:'Updated full note'}),true)
  assert.equal(h.store.todos[0].title,old);assert.equal(h.store.todos[0].description,'Updated full note')
  assert.equal((await h.store.addTodo({...input,title:'x'.repeat(120)})).success,true)
})

test('notes open in reading mode, enter editing explicitly and retain failed changes before returning to reading after save',async()=>{
  const h=fixture();await h.store.fetchTodos()
  const props=vue.reactive({todo:copy(h.store.todos[0]),color:'#64748b',categoryName:'Work'})
  const {state,app}=setupState('src/features/todos/components/TodoCard.vue',h.store,props)
  try{
    const count=h.calls.length
    state.onCardClick()
    assert.equal(state.isExpanded.value,true);assert.equal(state.isEditing.value,false)
    props.todo={...props.todo,title:'Remote updated title',version:4}
    await settle()
    assert.equal(state.editForm.value.title,'Remote updated title')
    await state.saveEdit();assert.equal(h.calls.length,count,'reading does not write changes')
    state.startEdit();state.editForm.value.description='<p>A detailed draft</p>'
    h.failures.add('update');await state.saveEdit()
    assert.equal(state.isEditing.value,true);assert.equal(state.editForm.value.description,'<p>A detailed draft</p>')
    h.failures.clear();await state.saveEdit()
    assert.equal(state.isExpanded.value,true);assert.equal(state.isEditing.value,false)
    assert.equal(h.store.todos[0].description,'<p>A detailed draft</p>')
    state.closeEdit();assert.equal(state.isExpanded.value,false)
  }finally{app.unmount()}
  const viewer=setupState('src/features/todos/components/TodoCard.vue',h.store,props,true)
  viewer.state.onCardClick();viewer.state.startEdit()
  assert.equal(viewer.state.isExpanded.value,true);assert.equal(viewer.state.isEditing.value,false)
  viewer.app.unmount()
})

test('cards toggle from the summary and padding while expanded details, selection and controls stay open',async()=>{
  const {JSDOM}=require('jsdom'),dom=new JSDOM('<article><div class="note-summary"><p>Preview text</p></div><div class="note-reveal"><div class="note-reveal-body"><p>Readable text</p><time>Today</time><a href="https://example.test">Link</a><button>Edit</button><summary>Toggle</summary><img src="https://example.test/photo.png"></div></div></article>')
  const h=fixture();await h.store.fetchTodos()
  const props=vue.reactive({todo:copy(h.store.todos[0]),color:'#64748b',categoryName:'Work',disabled:false})
  const f=setupState('src/features/todos/components/TodoCard.vue',h.store,props,false,{window:dom.window})
  const article=dom.window.document.querySelector('article'),paragraph=article.querySelector('.note-summary p')
  f.state.itemRef.value=article
  const click=target=>f.state.onCardClick({target})
  try{
    click(article);assert.equal(f.state.isExpanded.value,true)
    click(paragraph);assert.equal(f.state.isExpanded.value,false,'preview text closes the card')
    click(paragraph);assert.equal(f.state.isExpanded.value,true)
    for(const element of article.querySelectorAll('.note-reveal,.note-reveal-body,.note-reveal p,time')){
      click(element);assert.equal(f.state.isExpanded.value,true,'reading text or clicking blank detail space must not close the note')
    }
    for(const element of article.querySelectorAll('a,button,summary,img')){
      click(element);assert.equal(f.state.isExpanded.value,true,'interactive content must keep its own behavior')
    }
    const selection=dom.window.getSelection(),range=dom.window.document.createRange()
    range.selectNodeContents(paragraph);selection.addRange(range)
    click(paragraph);assert.equal(f.state.isExpanded.value,true,'selecting text must not close the note')
    selection.removeAllRanges();click(article);assert.equal(f.state.isExpanded.value,false)
    props.disabled=true;click(article);assert.equal(f.state.isExpanded.value,false)
    props.disabled=false;f.state.mediaBusy.value=true;click(article);assert.equal(f.state.isExpanded.value,false)
    f.state.mediaBusy.value=false;f.state.startEdit();click(article)
    assert.equal(f.state.isEditing.value,true);assert.equal(f.state.isExpanded.value,true)
    assert.equal(f.events.length,0,'body clicks must not complete or delete notes')
  }finally{f.app.unmount();dom.window.close()}
})

test('editing dialog locks the page, protects in-flight changes and restores scroll styles when leaving or unmounting',async()=>{
  const h=fixture();await h.store.fetchTodos()
  const browser={body:{style:{overflow:'auto'}},documentElement:{style:{overflow:'scroll',scrollbarGutter:'auto'}}}
  const props=vue.reactive({todo:copy(h.store.todos[0]),color:'#64748b',categoryName:'Work'})
  const f=setupState('src/features/todos/components/TodoCard.vue',h.store,props,false,{document:browser})
  const dialog={open:false,opens:0,showModal(){this.open=true;this.opens++},close(){this.open=false}}
  f.state.editDialogRef.value=dialog
  try{
    f.state.startEdit();await settle()
    assert.equal(dialog.open,true);assert.equal(browser.body.style.overflow,'hidden');assert.equal(browser.documentElement.style.overflow,'hidden')
    f.state.editForm.value.title='A retained draft'
    f.state.saving.value=true;f.state.leaveEditing();assert.equal(f.state.isEditing.value,true)
    f.state.saving.value=false;f.state.mediaBusy.value=true;f.state.leaveEditing();assert.equal(f.state.isEditing.value,true)
    f.state.mediaBusy.value=false;f.state.leaveEditing();await settle()
    assert.equal(dialog.open,false);assert.equal(f.state.isExpanded.value,true)
    assert.equal(f.state.editForm.value.title,'A retained draft')
    assert.equal(browser.body.style.overflow,'auto');assert.equal(browser.documentElement.style.overflow,'scroll')
    assert.equal(browser.documentElement.style.scrollbarGutter,'auto')
    f.state.startEdit();await settle()
    assert.equal(dialog.open,true)
  }finally{f.app.unmount()}
  assert.equal(dialog.open,false);assert.equal(browser.body.style.overflow,'auto')
})
