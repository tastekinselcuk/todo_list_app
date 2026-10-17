const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const vue = require('vue'), { parse, compileScript } = require('@vue/compiler-sfc')
const { projectDB } = require('./helpers/project-db.cjs')
const migration = fs.readFileSync('supabase/migrations/202610120003_workspace_search.sql', 'utf8')
function load(source, dependencies = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => dependencies[name] || require(name), console, setTimeout, clearTimeout, AbortController, ...globals })
  return exports
}
const catalog = load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'))
const search = load(fs.readFileSync('src/lib/workspaceSearch.ts', 'utf8'), { './moduleCatalog': catalog })
const hit = (module = 'quick', id = '70000000-0000-0000-0000-000000000007') => ({ module, record_id: id, child_id: null, title: 'Toplantı', preview: 'Kısa açıklama', meta: {} })

test('client search projection excludes vaults, disabled modules, malformed targets and unknown fields', () => {
  const item = { ...hit(), password: 'secret', meta: { password: 'secret', date: '2026-10-12' } }
  const parsed = search.parseSearchGroups({ groups: [
    { module: 'secure', total: 1, items: [hit('secure')] },
    { module: 'finance', total: 1, items: [hit('finance')] },
    { module: 'quick', total: 3, items: [item, { ...hit(), record_id: '<script>' }, { ...hit(), child_id: {} }] },
    { module: 'detailed', total: 1, items: [hit('detailed')] },
  ] }, ['secure', 'finance', 'quick'])
  assert.equal(parsed.length, 1);assert.equal(parsed[0].items.length, 1)
  assert.equal(parsed[0].module, 'quick');assert.equal(parsed[0].items[0].password, undefined)
  assert.equal(parsed[0].items[0].meta.password, undefined)
})

test('real SQL searches safe fields, groups and pages all modules, and enforces current workspace permissions', async () => {
  const f = await projectDB(['202610110002_pomonotes'])
  const { db, wid, gwid, owner, guest, as, rpc } = f
  try {
    await db.exec(`alter table todos add column description text;
      alter table code_snippets add column title text;
      alter table activity_items add column title text, add column subtitle text, add column notes text;
      create table secure_notes(id uuid default gen_random_uuid(),title text,password_encrypted text,content text);
      insert into secure_notes(title,password_encrypted,content) values('VaultNeedle','VaultPasswordNeedle','VaultBodyNeedle');`)
    await db.exec(migration)
    await db.query("update workspaces set active_modules=array['detailed','quick','plans','code','pomodoro','learning','flashcards','workout','periodic','activities','secure'] where id=$1", [wid])
    await as(owner)
    const add = async (table, fields) => {
      const b = (await db.query('select collection_id from workspace_module_bindings where workspace_id=$1 and module=$2', [wid, fields.module])).rows[0]
      const values = { ...fields };delete values.module
      const creator = ['todos','quick_notes','code_snippets','pomo_tasks'].includes(table) ? 'created_by' : 'user_id'
      values[creator] = owner;values.workspace_id = wid;values.collection_id = b.collection_id
      const cols = Object.keys(values), args = Object.values(values)
      const row = (await db.query(`insert into ${table}(${cols.join(',')}) values(${args.map((_, i) => '$' + (i + 1)).join(',')}) returning id`, args)).rows[0]
      return row.id
    }
    const todo = await add('todos', { module: 'detailed', title: 'İş GÖRÜŞMESİ', description: '<p>Toplantı hazırlığı</p><script>HiddenScriptNeedle</script><img alt="HiddenAttributeNeedle">' })
    for (let i = 0; i < 8; i++) await add('quick_notes', { module: 'quick', content: 'Toplantı ' + i })
    await add('quick_notes', { module: 'quick', content: 'Günlük kayıt\npassword: PrivatePasswordNeedle\nsonraki satır' })
    await add('code_snippets', { module: 'code', title: 'Toplantı bileşeni', code: 'CodeBodyNeedle' })
    await add('plans', { module: 'plans', title: 'Toplantı planı', period: 'yearly', period_date: '2025-01-01', completed: true, reason: 'Tatil' })
    await add('learning_subjects', { module: 'learning', title: 'Toplantı dersi', topics: JSON.stringify([{ id: 'topic', title: 'Özel alt konu' }]) })
    await add('flashcard_decks', { module: 'flashcards', title: 'Toplantı kartları', cards: JSON.stringify([{ id: 'card', front: 'Kart sorusu', back: 'UniqueCardAnswer' }]) })
    await add('workout_routines', { module: 'workout', title: 'Toplantı sonrası spor', exercises: JSON.stringify([{ id: 'exercise', name: 'Bench press', notes: 'UniqueExerciseNote', imageUrl: 'ImageUrlNeedle', token: 'UnknownJsonNeedle' }]) })
    await add('periodic_tasks', { module: 'periodic', title: 'Toplantı rutini', notes: 'UniqueRoutineNote' })
    await add('activity_items', { module: 'activities', title: 'Toplantı kitabı', notes: 'UniqueActivityNote' })
    const task = await rpc("select pomonotes_mutate($1,'create',null,'Toplantı odağı',3,1500) as result", [wid])
    const found = await rpc('select search_workspace($1,$2) as result', [wid, 'toplanti'])
    assert.deepEqual(found.groups.map(g => g.module).sort(), ['activities','code','detailed','flashcards','learning','periodic','plans','pomodoro','quick','workout'].sort())
    const quick = found.groups.find(g => g.module === 'quick');assert.equal(quick.total, 8);assert.equal(quick.items.length, 5)
    const second = await rpc("select search_workspace($1,'toplanti',5,5,'quick') as result", [wid])
    assert.equal(second.groups[0].items.length, 3)
    assert.ok(second.groups[0].items.every(item => !quick.items.some(old => old.record_id === item.record_id)))
    assert.equal((await rpc("select search_workspace($1,'is gorusmesi') as result", [wid])).groups[0].items[0].record_id, todo)
    const plan = found.groups.find(g => g.module === 'plans').items[0]
    assert.equal(plan.meta.period, 'yearly');assert.equal(plan.meta.date, '2025-01-01')
    assert.equal((await rpc("select search_workspace($1,'UniqueCardAnswer') as result", [wid])).groups[0].items[0].child_id, 'card')
    assert.equal((await rpc("select search_workspace($1,'UniqueExerciseNote') as result", [wid])).groups[0].items[0].child_id, 'exercise')
    for (const needle of ['VaultNeedle','VaultPasswordNeedle','VaultBodyNeedle','CodeBodyNeedle','HiddenScriptNeedle','HiddenAttributeNeedle','PrivatePasswordNeedle','ImageUrlNeedle','UnknownJsonNeedle']) {
      assert.equal((await rpc('select search_workspace($1,$2) as result', [wid, needle])).groups.length, 0, needle + ' must be excluded')
    }
    const context = await rpc('select workspace_search_context($1) as result', [wid])
    assert.equal(context.counts.find(c => c.module === 'quick').records, 10)
    assert.ok(!JSON.stringify(context).includes('Needle'))
    assert.equal((await rpc('select pomonotes_search_target($1,$2) as result', [wid, task.id])).estimated_sessions, 3)
    await assert.rejects(rpc('select workspace_search_documents($1) as result', [wid]), /permission denied/)
    await assert.rejects(rpc('select search_workspace($1,$2) as result', [wid, 'x'.repeat(121)]), /INVALID_SEARCH/)
    await as(guest)
    await assert.rejects(rpc("select search_workspace($1,'toplanti') as result", [wid]), /ACCESS_DENIED/)
    assert.equal((await rpc("select search_workspace($1,'toplanti') as result", [gwid])).groups.length, 0)
    assert.equal(await rpc('select pomonotes_search_target($1,$2) as result', [gwid, task.id]), null)
    await as(owner)
    const invitation = await rpc("select create_collection_invite($1,'detailed','viewer') as result", [wid])
    await as(guest);await rpc('select accept_collection_invite($1,$2) as result', [invitation.token, gwid])
    assert.equal((await rpc("select search_workspace($1,'toplanti') as result", [gwid])).groups[0].module, 'detailed')
    await db.exec('reset role')
    await db.query("delete from collection_members where user_id=$1 and collection_id=(select collection_id from workspace_module_bindings where workspace_id=$2 and module='detailed')", [guest, gwid])
    await as(guest);assert.equal((await rpc("select search_workspace($1,'toplanti') as result", [gwid])).groups.length, 0)
    await as(owner);await db.query("update workspaces set active_modules=array['detailed'] where id=$1", [wid])
    assert.equal((await rpc("select search_workspace($1,'toplanti') as result", [wid])).groups.length, 1)
    await as(null, 'anon');await assert.rejects(rpc("select search_workspace($1,'x') as result", [wid]), /permission denied/)
    await db.exec('reset role');await db.exec(migration)
  } finally { await db.close() }
})

function componentFixture() {
  const requests = [], emitted = [], timers = new Map();let timerId = 0, state
  const workspaces = vue.reactive({ sessionKey: 'owner:workspace:one', activeId: 'one', active: { name: 'Kişisel' } })
  const dependencies = { vue, 'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@/stores/workspaces': { useWorkspacesStore: () => workspaces }, '@/lib/workspaceSearch': search,
    '@/lib/supabase': { supabase: { rpc(name, args) {
      let resolve;const promise = new Promise(r => resolve = r)
      const entry = { name, args, resolve };requests.push(entry)
      promise.abortSignal = signal => { entry.signal = signal;return promise };return promise
    } } } }
  const descriptor = parse(fs.readFileSync('src/components/ui/WorkspaceSearch.vue', 'utf8')).descriptor
  const component = load(compileScript(descriptor, { id: 'workspace-search-test' }).content, dependencies, {
    setTimeout: cb => { const id = ++timerId;timers.set(id, cb);return id }, clearTimeout: id => timers.delete(id),
  }).default
  const host = () => ({ children: [] })
  const renderer = vue.createRenderer({ createElement: host, createText: host, createComment: host, insert(n, p) { p.children.push(n) }, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode() {}, nextSibling() {} })
  const props = vue.reactive({ enabled: ['quick', 'detailed'] })
  const app = renderer.createApp({ setup() { state = component.setup(props, { expose() {}, emit: (...args) => emitted.push(args) });return () => vue.h('div') } })
  app.mount(host())
  state.dialog.value = { open: false, showModal() { this.open = true }, close() { this.open = false }, querySelector() { return null } }
  state.input.value = { focus() {} }
  return { state, requests, emitted, workspaces, props, close: () => app.unmount(), timers }
}
const settle = () => vue.nextTick()

test('search cancels stale queries and scope responses, pages one group and does not persist note excerpts', async () => {
  const f = componentFixture(), s = f.state
  try {
    await s.open();s.query.value = 'Toplantı';await settle()
    const first = s.search();s.query.value = 'İş';await settle();const next = s.search()
    assert.equal(f.requests[0].signal.aborted, true)
    f.requests[1].resolve({ data: { groups: [{ module: 'quick', total: 8, items: [hit()] }] } });await next
    f.requests[0].resolve({ data: { groups: [{ module: 'detailed', total: 1, items: [hit('detailed')] }] } });await first
    assert.equal(s.groups.value[0].module, 'quick')
    const more = s.search('quick');assert.equal(f.requests[2].args.page_offset, 1)
    f.requests[2].resolve({ data: { groups: [{ module: 'quick', total: 8, items: [hit('quick','80000000-0000-0000-0000-000000000008')] }] } });await more
    assert.equal(s.groups.value[0].items.length, 2)
    s.select(s.groups.value[0].items[1]);assert.equal(f.emitted[0][0], 'select');assert.equal(s.groups.value.length, 0)
    await s.open();s.query.value = 'Eski';await settle();const pending = s.search()
    f.workspaces.sessionKey = 'owner:workspace:two';await settle()
    assert.equal(f.requests[3].signal.aborted, true)
    f.requests[3].resolve({ data: { groups: [{ module: 'quick', total: 1, items: [hit()] }] } });await pending
    assert.equal(s.groups.value.length, 0);assert.equal(s.opened.value, false)
  } finally { f.close() }
})

test('search distinguishes missing database setup from transient errors and remains retryable', async () => {
  const f = componentFixture(), s = f.state
  try {
    await s.open();s.query.value = 'test';await settle()
    let pending = s.search();f.requests[0].resolve({ error: { code: 'PGRST202' } });await pending
    assert.equal(s.error.value, 'search.setup');assert.equal(s.busy.value, false)
    pending = s.search();f.requests[1].resolve({ error: { code: 'NETWORK' } });await pending
    assert.equal(s.error.value, 'search.failed');assert.equal(s.busy.value, false)
  } finally { f.close() }
})

test('navigation reveals the specific child in its own tab without clicking or mutating it, then removes the marker', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<body><section id="workspace-panel-quick"><article data-search-record="record"></article></section><section id="workspace-panel-flashcards"><article data-search-record="record" data-search-child="card-a"></article><article data-search-record="record" data-search-child="card-b"></article></section></body>')
  const timers = new Map();let timer = 0, clicked = 0, prepared = 0, scrolled = 0
  const target = dom.window.document.querySelector('[data-search-child="card-b"]')
  target.addEventListener('click', () => clicked++)
  target.scrollIntoView = () => scrolled++
  const nav = load(fs.readFileSync('src/lib/searchNavigation.ts', 'utf8'), { vue }, {
    document: dom.window.document, window: { matchMedia: () => ({ matches: true }) }, MutationObserver: dom.window.MutationObserver,
    setTimeout: fn => { const id = ++timer;timers.set(id, fn);return id }, clearTimeout: id => timers.delete(id),
  })
  const destination = vue.ref({ ...hit('flashcards'), record_id: 'record', child_id: 'card-b', sequence: 1 })
  const child = { setup() { nav.useSearchReveal('flashcards', async (item, current) => { assert.equal(item.child_id, 'card-b');assert.equal(current(), true);prepared++ });return () => vue.h('div') } }
  const host = () => ({ children: [] })
  const renderer = vue.createRenderer({ createElement: host, createText: host, createComment: host, insert(n, p) { p.children.push(n) }, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode() {}, nextSibling() {} })
  const app = renderer.createApp({ setup() { vue.provide(nav.searchDestinationKey, destination);return () => vue.h(child) } })
  app.mount(host())
  try {
    await new Promise(resolve => setImmediate(resolve));await vue.nextTick()
    assert.equal(prepared, 1);assert.equal(scrolled, 1);assert.equal(clicked, 0)
    assert.equal(dom.window.document.activeElement, target);assert.ok(target.classList.contains('search-revealed'))
    assert.ok(!dom.window.document.querySelector('[data-search-child="card-a"]').classList.contains('search-revealed'))
    for (const fn of [...timers.values()]) fn()
    assert.ok(!target.classList.contains('search-revealed'))
  } finally { app.unmount();dom.window.close() }
})

test('a late destination prepare cannot reveal a previous selection or report an error in another workspace', async () => {
  let release, currentAtEnd, errors = 0
  const gate = new Promise(resolve => release = resolve)
  const nav = load(fs.readFileSync('src/lib/searchNavigation.ts', 'utf8'), { vue }, {
    document: { getElementById() { assert.fail('stale navigation must not touch the DOM') } },
  })
  const destination = vue.ref({ ...hit(), sequence: 1 })
  const child = { setup() { nav.useSearchReveal('quick', async (_hit, current) => { await gate;currentAtEnd = current() });return () => vue.h('div') } }
  const host = () => ({ children: [] })
  const renderer = vue.createRenderer({ createElement: host, createText: host, createComment: host, insert(n, p) { p.children.push(n) }, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode() {}, nextSibling() {} })
  const app = renderer.createApp({ setup() { vue.provide(nav.searchDestinationKey, destination);vue.provide(nav.searchRevealErrorKey, () => errors++);return () => vue.h(child) } })
  app.mount(host());destination.value = null;release()
  try { await new Promise(resolve => setImmediate(resolve));assert.equal(currentAtEnd, false);assert.equal(errors, 0) }
  finally { app.unmount() }
})

test('search uses the workspace viewport navigator and respects reduced motion', async () => {
  const {JSDOM}=require('jsdom')
  const dom=new JSDOM('<section id="workspace-panel-quick"><article data-search-record="record"></article></section>')
  const card=dom.window.document.querySelector('article'), calls=[], timers=new Map()
  card.scrollIntoView=()=>assert.fail('nested workspace search must use its single document scroll range')
  const nav=load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'),{vue},{
    document:dom.window.document,window:{matchMedia:()=>({matches:true})},MutationObserver:dom.window.MutationObserver,
    setTimeout:fn=>{timers.set(1,fn);return 1},clearTimeout:id=>timers.delete(id),
  })
  const destination=vue.ref({...hit(),record_id:'record',sequence:1})
  const child={setup(){nav.useSearchReveal('quick',async()=>{});return()=>vue.h('div')}}
  const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  const app=renderer.createApp({setup(){
    vue.provide(nav.searchDestinationKey,destination)
    vue.provide(nav.searchScrollKey,(element,behavior)=>calls.push({element,behavior}))
    return()=>vue.h(child)
  }})
  app.mount({})
  try {
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(calls.length,1);assert.equal(calls[0].element,card);assert.equal(calls[0].behavior,'instant')
    assert.equal(dom.window.document.activeElement,card)
  } finally {app.unmount();dom.window.close()}
})

test('opening an older note fetches that specific record, and a late first-page response cannot remove it', async () => {
  const pinia = require('pinia');pinia.setActivePinia(pinia.createPinia())
  const requests = [], located = []
  const older = { id: 'older', title: 'Older note', description: 'Body', created_at: '2020-01-01' }
  const client = { listen() {}, from(table) {
    let id
    const builder = { select() { return builder }, eq(_key, value) { id = value;return builder },
      order() { return new Promise(resolve => requests.push({ table, resolve })) },
      async maybeSingle() { located.push({ table, id });return { data: older } },
    };return builder
  } }
  const useStore = load(fs.readFileSync('src/features/todos/stores/todo.ts','utf8'), {
    '@/lib/workspaceScope': { defineWorkspaceStore: pinia.defineStore, useWorkspaceClient: () => client, workspaceStorageKey: key => key },
    '../../../stores/auth': { useAuthStore: () => ({ user: { id: 'owner' } }) },
    '@/lib/storage': { readStoredJSON: (_key, fallback) => fallback, writeStoredJSON() {} },
  }).useTodoStore
  const store = useStore()
  try {
    const initial = store.fetchTodos(), opening = store.fetchTodos('older')
    requests[1].resolve({ data: [{ id: 'newer', title: 'New note' }] });assert.equal(await opening, true)
    assert.deepEqual(located, [{ table: 'todos', id: 'older' }]);assert.equal(store.todos[0].id, 'older')
    requests[0].resolve({ data: [{ id: 'stale', title: 'Stale page' }] });assert.equal(await initial, false)
    assert.ok(store.todos.some(item => item.id === 'older'));assert.ok(!store.todos.some(item => item.id === 'stale'))
  } finally { store.$dispose() }
})
