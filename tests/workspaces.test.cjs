const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')
const { nextTick, effectScope, reactive } = require('vue')

function fixture() {
  setActivePinia(createPinia())
  const auth = reactive({ user: { id: 'owner', email: 'owner@example.test' } })
  const rows = {
    workspaces: [
      { id: 'personal', user_id: 'owner', name: 'Personal', active_modules: ['plans','quick','detailed'], archived_at: null, is_default: true },
      { id: 'work', user_id: 'owner', name: 'Work', active_modules: ['plans','code','detailed'], archived_at: null },
    ],
  }
  const requests = []
  const storage = new Map()
  const localStorage = { get length(){return storage.size}, key:index=>[...storage.keys()][index]??null, getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem:key=>storage.delete(key) }
  const holds = new Map()
  const failures = new Set()
  let counter = 0
  const client = {
    async rpc(name,args) {
      if(name==='delete_workspace'){
        requests.push({rpc:name,args});if(holds.has('workspaces:delete'))await holds.get('workspaces:delete')
        if(failures.has('workspaces:delete'))return {data:null,error:{message:'WORKSPACE_SHARED'}}
        const target=rows.workspaces.find(item=>item.id===args.wid),next=rows.workspaces.find(item=>item.id!==args.wid&&!item.archived_at)
        rows.workspaces=rows.workspaces.filter(item=>item!==target)
        if(target.is_default)next.is_default=true
        return {data:{id:target.id,next_workspace:structuredClone(next)},error:null}
      }
      if(name==='trash_change'){requests.push({rpc:name,args});return {data:{id:args.rid,module:args.module_id,version:2,deleted_at:new Date().toISOString()},error:null}}
      return { data: 'personal', error: null }
    },
    from(table) {
      let operation = 'select', payload, single = false
      const filters = []
      const query = {
        select() { return query }, order() { return query },
        eq(column, value) { filters.push([column, value]); return query },
        insert(value) { operation = 'insert'; payload = value; return query },
        update(value) { operation = 'update'; payload = value; return query },
        delete() { operation = 'delete'; return query },
        single() { single = true; return query },
        then(resolve, reject) {
          const held = holds.get(`${table}:${operation}`)
          requests.push({ table, operation, filters: structuredClone(filters), payload: payload && structuredClone(payload) })
          // Take the response snapshot before waiting, to model an old in-flight fetch.
          const existing = (rows[table] || []).filter(row => filters.every(([column, value]) => row[column] === value))
          const snapshot = structuredClone(existing)
          return (async () => {
            if (held) await held
            if (failures.has(`${table}:${operation}`)) return { data: null, error: new Error('offline') }
            rows[table] ||= []
            let data = snapshot
            if (operation === 'insert') {
              const values = Array.isArray(payload) ? payload : [payload]
              data = values.map(value => ({ id: `new-${++counter}`, history: [], completed: false, reason: '', archived_at: null, created_at: new Date().toISOString(), ...structuredClone(value) }))
              rows[table].push(...data)
            } else if (operation === 'update') {
              existing.forEach(row => Object.assign(row, structuredClone(payload)))
              data = structuredClone(existing)
            } else if (operation === 'delete') {
              rows[table] = rows[table].filter(row => !existing.includes(row))
            }
            return { data: single ? data[0] : data, error: null }
          })().then(resolve, reject)
        },
      }
      return query
    },
  }
  const modules = new Map()
  const stubs = { '@/lib/supabase': { supabase: client }, '@/stores/auth': { useAuthStore: () => auth } }
  function load(filename) {
    filename = path.resolve(filename)
    if (filename === path.resolve('src/lib/supabase.ts')) return stubs['@/lib/supabase']
    if (filename === path.resolve('src/stores/auth.ts')) return stubs['@/stores/auth']
    if (modules.has(filename)) return modules.get(filename)
    const exports = {}
    modules.set(filename, exports)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    vm.runInNewContext(code, {
      exports, Date, console, localStorage,
      require(name) {
        if (stubs[name]) return stubs[name]
        if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
        if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`))
        return require(name)
      },
    }, { filename })
    return exports
  }
  const workspaces = load('src/stores/workspaces.ts').useWorkspacesStore()
  return {
    auth, rows, requests, storage, load, workspaces,
    hold(table, operation) {
      let release
      holds.set(`${table}:${operation}`, new Promise(resolve => { release = resolve }))
      return () => { holds.delete(`${table}:${operation}`); release() }
    },
    fail(table, operation) { failures.add(`${table}:${operation}`) },
  }
}

test('last workspace is scoped to the signed-in user, and create opens an empty workspace', async () => {
  const f = fixture()
  f.storage.set('active-workspace:owner', 'work')
  await f.workspaces.load()
  assert.equal(f.workspaces.activeId, 'work')
  assert.equal(await f.workspaces.create('  Projects  '), true)
  assert.equal(f.workspaces.active.name, 'Projects')
  assert.equal(f.storage.get('active-workspace:owner'), f.workspaces.activeId)
  assert.ok(f.workspaces.active.active_modules.includes('plans'))
  assert.equal(f.rows.plans, undefined, 'creating a workspace must not copy existing notes')
})

test('workspace deletion updates selection only after success, cleans its own drafts and ignores stale account responses',async()=>{
 const f=fixture();await f.workspaces.load()
 f.storage.set('workspace:owner:personal:code-draft','secret draft');f.storage.set('workspace:owner:work:code-draft','keep')
 const release=f.hold('workspaces','delete'),pending=f.workspaces.remove('personal','Personal')
 assert.equal(f.workspaces.items.length,2);assert.equal(await f.workspaces.remove('personal','Personal'),false)
 release();assert.equal(await pending,true)
 assert.equal(f.workspaces.activeId,'work');assert.equal(f.workspaces.active.is_default,true)
 assert.equal(f.storage.has('workspace:owner:personal:code-draft'),false);assert.equal(f.storage.get('workspace:owner:work:code-draft'),'keep')
 assert.equal(await f.workspaces.remove('work','Work'),false);assert.equal(f.workspaces.error,'LAST_WORKSPACE')
 const failed=fixture();await failed.workspaces.load();failed.fail('workspaces','delete')
 assert.equal(await failed.workspaces.remove('personal','Personal'),false);assert.equal(failed.workspaces.items.length,2);assert.equal(failed.workspaces.activeId,'personal')
 const stale=fixture();await stale.workspaces.load();const finish=stale.hold('workspaces','delete'),deleting=stale.workspaces.remove('personal','Personal')
 stale.auth.user={id:'other'};stale.workspaces.reset();finish()
 assert.equal(await deleting,false);assert.equal(stale.workspaces.items.length,0);assert.equal(stale.workspaces.activeId,'')
})

test('every module scopes reads, updates and deletes, and stamps inserts with its captured owner/workspace', async () => {
  const f = fixture()
  await f.workspaces.load()
  const client = f.load('src/lib/workspaceScope.ts').useWorkspaceClient()
  const tables = ['categories','todos','quick_notes','code_snippets','password_sessions','secure_notes','plans','periodic_tasks','activity_items','learning_subjects','flashcard_decks','workout_routines']
  for (const table of tables) {
    await client.from(table).select('*')
    await client.from(table).update({ title: 'changed' }).eq('id', 'one')
    await client.from(table).delete().eq('id', 'one')
    await client.from(table).insert({ title: 'new', workspace_id: 'work', user_id: 'intruder', created_by: 'intruder' })
    const calls = f.requests.filter(request => request.table === table)
    const ownerField = ['categories','todos','quick_notes','code_snippets','password_sessions','secure_notes'].includes(table) ? 'created_by' : 'user_id'
    const soft=['todos','quick_notes','code_snippets','plans','periodic_tasks','activity_items','learning_subjects','flashcard_decks','workout_routines'].includes(table)
    for (const call of calls.slice(0,soft?2:3)) {
      assert.ok(call.filters.some(([key,value]) => key === 'workspace_id' && value === 'personal'),JSON.stringify({table,call}))
      assert.ok(call.filters.some(([key,value]) => key === ownerField && value === 'owner'))
    }
    if(soft){const moved=f.requests.find(request=>request.rpc==='trash_change'&&request.args.module_id===f.load('src/lib/sharing.ts').tableModules[table]);assert.equal(moved.args.wid,'personal');assert.equal(moved.args.rid,'one')}
    const inserted=calls[soft?2:3]
    assert.equal(inserted.payload.workspace_id, 'personal')
    assert.equal(inserted.payload[ownerField], 'owner')
  }
  assert.throws(() => client.from('plans').update({ workspace_id: 'work' }), /ownership/)
  f.workspaces.switchTo('work')
  assert.throws(() => client.from('plans'), /Workspace changed/)
})

test('late plan reads cannot populate the next workspace or a later return to the same workspace', async () => {
  const f = fixture()
  f.rows.plans = [
    { id: 'p1', user_id: 'owner', workspace_id: 'personal', title: 'Personal note', period: 'daily', period_date: '2099-01-01', history: [] },
    { id: 'w1', user_id: 'owner', workspace_id: 'work', title: 'Work note', period: 'daily', period_date: '2099-01-01', history: [] },
  ]
  await f.workspaces.load()
  const usePlans = f.load('src/features/plans/stores/plans.ts').usePlansStore
  const personal = usePlans()
  const release = f.hold('plans','select')
  const pending = personal.load()
  await nextTick()
  f.workspaces.switchTo('work')
  release()
  const work = usePlans()
  await work.load()
  await pending
  assert.equal(work.plans.length, 1)
  assert.equal(work.plans[0].title, 'Work note')
  f.workspaces.switchTo('personal')
  const returned = usePlans()
  assert.notEqual(returned, personal)
  assert.equal(returned.plans.length, 0, 'disposed state is not reused')
  await returned.load()
  assert.equal(returned.plans[0].title, 'Personal note')
})

test('a pending save stays in its starting workspace when switching', async () => {
  const f = fixture()
  await f.workspaces.load()
  const usePlans = f.load('src/features/plans/stores/plans.ts').usePlansStore
  const release = f.hold('plans','insert')
  const pending = usePlans().add('Personal draft','monthly')
  await nextTick()
  f.workspaces.switchTo('work')
  const work = usePlans()
  release()
  await pending
  assert.equal(work.plans.length, 0)
  assert.equal(f.rows.plans[0].workspace_id, 'personal')
})

test('drafts, filters and last-tab values are isolated by both workspace and user', async () => {
  const f = fixture()
  await f.workspaces.load()
  const helper = f.load('src/lib/workspaceScope.ts')
  const effects = effectScope()
  try {
    effects.run(() => { helper.useWorkspaceDraft('title','').value = 'Personal draft' })
    f.workspaces.switchTo('work')
    effects.run(() => {
      const draft = helper.useWorkspaceDraft('title','')
      assert.equal(draft.value, '')
      draft.value = 'Work draft'
    })
    f.workspaces.switchTo('personal')
    effects.run(() => assert.equal(helper.useWorkspaceDraft('title','').value, 'Personal draft'))
    f.auth.user = { id: 'other' }
    effects.run(() => assert.equal(helper.useWorkspaceDraft('title','').value, ''))
  } finally { effects.stop() }
})

test('failed module setting writes roll back only their own workspace', async () => {
  const f = fixture()
  await f.workspaces.load()
  const previous = [...f.workspaces.active.active_modules]
  const release = f.hold('workspaces','update')
  f.fail('workspaces','update')
  const pending = f.workspaces.setModules(['detailed'])
  await nextTick()
  f.workspaces.switchTo('work')
  release()
  await pending
  assert.equal(f.workspaces.active.active_modules.join(','), 'plans,code,detailed')
  assert.equal(f.workspaces.items[0].active_modules.join(','), previous.join(','))
})

test('module drafts survive unrelated bindings and migrate compatible legacy keys only',async()=>{
  const f=fixture();await f.workspaces.load()
  f.workspaces.bindings.personal=[{module:'quick',collection_id:'quick-one'},{module:'plans',collection_id:'plans-one'}]
  const legacy='workspace:owner:personal:quick-note:plans:plans-one|quick:quick-one'
  f.storage.set(legacy,JSON.stringify('Existing draft'))
  f.workspaces.bindings.personal.push({module:'pomodoro',collection_id:'focus-one'})
  const helper=f.load('src/lib/workspaceScope.ts'),effects=effectScope()
  try {
    const key=helper.workspaceStorageKey('quick-note')
    effects.run(()=>assert.equal(helper.useWorkspaceDraft('quick-note','').value,'Existing draft'))
    f.workspaces.bindings.personal.find(b=>b.module==='plans').collection_id='plans-two'
    assert.equal(helper.workspaceStorageKey('quick-note'),key)
    f.workspaces.bindings.personal.find(b=>b.module==='quick').collection_id='quick-two'
    effects.run(()=>assert.equal(helper.useWorkspaceDraft('quick-note','').value,''))
    assert.equal(f.storage.get(legacy),JSON.stringify('Existing draft'),'legacy drafts are retained')
  }finally{effects.stop()}
})

test('combined note cache changes only when one of its three collections changes',async()=>{
  const f=fixture();await f.workspaces.load()
  f.workspaces.bindings.personal=[{module:'quick',collection_id:'q'},{module:'detailed',collection_id:'d'},{module:'code',collection_id:'c'},{module:'plans',collection_id:'p'}]
  const helper=f.load('src/lib/workspaceScope.ts'),key=helper.workspaceStorageKey('todo-app-data')
  f.workspaces.bindings.personal.find(b=>b.module==='plans').collection_id='new'
  assert.equal(helper.workspaceStorageKey('todo-app-data'),key)
  f.workspaces.bindings.personal.find(b=>b.module==='detailed').collection_id='new'
  assert.notEqual(helper.workspaceStorageKey('todo-app-data'),key)
})

test('a new personal module retains its setup draft while a shared collection cannot inherit it',async()=>{
  const f=fixture();await f.workspaces.load()
  const helper=f.load('src/lib/workspaceScope.ts'),effects=effectScope()
  try {
    effects.run(()=>{helper.useWorkspaceDraft('pomo-note-title','').value='Setup draft'})
    f.workspaces.bindings.personal=[{module:'pomodoro',collection_id:'own',personal_collection_id:'own',owner_id:'owner',origin_workspace_id:'personal'}]
    effects.run(()=>assert.equal(helper.useWorkspaceDraft('pomo-note-title','').value,'Setup draft'))
    f.workspaces.bindings.personal[0].collection_id='shared'
    effects.run(()=>assert.equal(helper.useWorkspaceDraft('pomo-note-title','').value,''))
  }finally{effects.stop()}
})
