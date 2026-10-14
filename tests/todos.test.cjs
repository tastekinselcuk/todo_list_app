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
    exports, require: name => dependencies[name] || (name === '@/lib/searchNavigation' ? load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'), {vue}, globals) : null) || (name === '@/lib/storage' ? load(fs.readFileSync('src/lib/storage.ts', 'utf8'), {}, globals) : name === '@/lib/moduleCatalog' ? load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'), {}, globals) : require(name)), console: { error() {} }, setTimeout, clearTimeout, ...globals,
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
function setupState(file, store, props = {}, viewer = false) {
  const toasts = [], events = []
  const dependencies = {
    '@/lib/workspaceScope': { useModuleAccess: () => ({ canWrite: vue.computed(() => !viewer) }), useWorkspaceDraft: (_key, value) => vue.ref(copy(value)) },
    '@/features/todos/stores/todo': { useTodoStore: () => store, TODO_TITLE_MAX_LENGTH:120 },
    '@/stores/ui': { useUIStore: () => ({ addToast: (...args) => toasts.push(args), showConfirm: async () => true }) },
    'vue-i18n': { useI18n: () => ({ t: key => key, locale: vue.ref('tr') }) },
    '@vueuse/core': { onClickOutside: () => () => {} },
    '@/components/ui/CustomSelect.vue': { default: { setup: () => () => vue.h('div') } },
    './TodoQuickAdd.vue': { default: {} }, './TodoFilters.vue': { default: {} }, './TodoCard.vue': { default: {} }, './CategoryModal.vue': { default: {} }, './RichTextEditor.vue': { default: {} },
  }
  const descriptor = parse(fs.readFileSync(file, 'utf8')).descriptor
  const source = compileScript(descriptor, { id: file }).content
  const component = load(source, dependencies, { document: { addEventListener() {}, removeEventListener() {} } }).default
  let state
  const app = renderer.createApp({ setup() { state = component.setup(props, { expose() {}, emit: (...args) => events.push(args) }); return () => vue.h('div') } })
  app.mount({})
  return { state, app, events, toasts, dependencies }
}

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
  filters.app.unmount()
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

test('completion progress follows category and search scope even when completed cards are hidden',async()=>{
  const h=fixture()
  const {state,app}=setupState('src/features/todos/components/TodoBoard.vue',h.store)
  try{
    await settle()
    assert.equal(state.completedCount.value,1);assert.equal(state.scopedTodos.value.length,4);assert.equal(state.completionPercent.value,25)
    state.showCompleted.value=false
    assert.equal(state.filteredTodosArray.value.length,3);assert.equal(state.completionPercent.value,25)
    state.selectedCategories.value=['work'];assert.equal(state.completionPercent.value,0);assert.equal(state.scopedTodos.value.length,2)
    state.selectedCategories.value=[];state.query.value='Completed'
    assert.equal(state.filteredTodosArray.value.length,0);assert.equal(state.completionPercent.value,100)
    state.query.value='missing';assert.equal(state.completionPercent.value,0)
  }finally{app.unmount()}
})
