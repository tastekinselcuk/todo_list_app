const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto')
const vue = require('vue'), pinia = require('pinia')
const { parse, compileScript } = require('@vue/compiler-sfc')
const { renderToString } = require('@vue/server-renderer')
const catalog = JSON.parse(fs.readFileSync('src/features/workout/data/catalog.json', 'utf8'))
const copy = value => JSON.parse(JSON.stringify(value))
function load(source, dependencies = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => dependencies[name] || (name === '@/lib/utils' ? load(fs.readFileSync('src/lib/utils.ts','utf8'), {}, globals) : null) || (name === '@/lib/searchNavigation' ? load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'), {vue}, globals) : null) || require(name), console: { error() {} }, URL, crypto, ...globals })
  return exports
}
const exercises = load(fs.readFileSync('src/features/workout/lib/exercises.ts', 'utf8'), { '../data/catalog.json': { default: catalog } })
const input = (fields = {}) => ({ name: 'Barbell bench press', sets: 3, reps: '10–12', imageUrl: '', weightKg: 40, restSeconds: 90, tempo: '3–1–1', alternative: 'Dumbbell press', notes: 'Personal note', ...fields })

test('catalog search supports Turkish muscles and equipment and combines filters', async () => {
  const data = await exercises.loadExerciseCatalog()
  assert.equal(data.length, catalog.length)
  assert.ok(data.length > 800)
  assert.equal(data[0].id, 'Barbell_Bench_Press_-_Medium_Grip')
  const matches = exercises.searchCatalog(data, 'göğüs dambıl', 'chest', 'dumbbell')
  assert.ok(matches.length > 0)
  assert.ok(matches.every(item => item.primaryMuscles.includes('chest') && item.equipment === 'dumbbell'))
  assert.ok(exercises.searchCatalog(data, 'ŞINAV').some(item => item.id === 'Pushups'))
  assert.equal(exercises.searchCatalog(data, 'xyz-no-such-exercise', 'legs').length, 0)
})

test('catalog images have valid paths, legacy names resolve and custom images remain preferred', () => {
  for (const item of catalog) for (const path of item.images) assert.ok(exercises.catalogImageUrl(path))
  const sources = exercises.imageCandidates(input({ imageUrl: 'https://static.exercisedb.dev/expired.gif' }), catalog)
  assert.match(sources[0], /Barbell_Bench_Press_-_Medium_Grip\/0.jpg$/)
  assert.match(sources[1], /^https:\/\/cdn.jsdelivr.net\//)
  assert.equal(exercises.imageCandidates(input({ imageUrl: 'https://example.test/my-photo.jpg' }), catalog)[0], 'https://example.test/my-photo.jpg')
  assert.equal(exercises.safeImageUrl('javascript:alert(1)'), '')
  assert.equal(exercises.catalogImageUrl('../private/0.jpg'), '')
  const pose = exercises.imageCandidates({ ...input(), catalogId: 'Pushups' }, catalog, 1)
  assert.match(pose[0], /Pushups\/1.jpg$/)
})

test('custom exercise validation preserves zero values and free-form reps while rejecting invalid numbers', () => {
  const result = exercises.normalizeExerciseInput(input({ reps: '30 sn', weightKg: 0, restSeconds: 0 }))
  assert.equal(result.reps, '30 sn')
  assert.equal(result.weightKg, 0)
  assert.equal(result.restSeconds, 0)
  for (const fields of [{ name: ' ' }, { sets: 0 }, { sets: 2.5 }, { reps: '' }, { weightKg: -1 }, { weightKg: Infinity }, { restSeconds: 4000 }]) {
    assert.throws(() => exercises.normalizeExerciseInput(input(fields)), /INVALID_EXERCISE/)
  }
})

function fixture({ shared = false, viewer = false } = {}) {
  pinia.setActivePinia(pinia.createPinia())
  const rows = [{ id: 'program', user_id: 'owner', title: 'Push', day_of_week: 'Monday', version: 1,
    exercises: [{ ...input(), id: 'exercise', _version: 3, isCompleted: true }] }]
  const calls = [], failures = new Set()
  let held, release
  const client = {
    collection: () => shared ? 'collection' : undefined,
    canWrite: () => !viewer,
    listen() {},
    from() {
      let operation = 'select', payload, single = false
      const filters = []
      const query = {
        select() { return query }, order() { return query }, single() { single = true; return query },
        eq(column, value) { filters.push([column, value]); return query },
        insert(value) { operation = 'insert'; payload = copy(value); return query },
        update(value) { operation = 'update'; payload = copy(value); return query },
        delete() { operation = 'delete'; return query },
        then(resolve, reject) {
          calls.push({ operation, payload: payload && copy(payload), filters })
          return (async () => {
            if (held) await held
            if (failures.has(operation)) return { data: null, error: new Error('OFFLINE') }
            let data = rows.filter(row => filters.every(([key, value]) => row[key] === value))
            if (operation === 'insert') { const row = { id: crypto.randomUUID(), version: 1, ...payload }; rows.push(row); data = [row] }
            if (operation === 'update') data.forEach(row => Object.assign(row, payload, { version: row.version + 1 }))
            if (operation === 'delete') for (const row of [...data]) rows.splice(rows.indexOf(row), 1)
            return { data: copy(single ? data[0] || null : data), error: single && !data.length ? new Error('CONFLICT') : null }
          })().then(resolve, reject)
        },
      }
      return query
    },
    async mutateItem(_module, parentId, operation, item, version) {
      calls.push({ operation: 'rpc:' + operation, item: copy(item), version })
      if (failures.has('rpc:' + operation)) throw new Error('SHARING_CONFLICT')
      const routine = rows.find(row => row.id === parentId)
      if (operation === 'add') routine.exercises.push({ ...copy(item), id: item.id || crypto.randomUUID(), _version: 1 })
      if (operation === 'update' || operation === 'delete') {
        const exercise = routine.exercises.find(row => row.id === item.id)
        if (exercise._version !== version) throw new Error('SHARING_CONFLICT')
        if (operation === 'update') Object.assign(exercise, copy(item), { _version: exercise._version + 1 })
        else routine.exercises = routine.exercises.filter(row => row.id !== item.id)
      }
      if (operation === 'reset') routine.exercises.forEach(exercise => { exercise.isCompleted = false; exercise._version++ })
      if (operation === 'reorder') {
        if (routine.version !== version) throw new Error('SHARING_CONFLICT')
        const byId = new Map(routine.exercises.map(exercise => [exercise.id, exercise]))
        routine.exercises = item.ids.map(id => byId.get(id))
      }
      routine.version++
      return copy(routine)
    },
  }
  const useWorkoutStore = load(fs.readFileSync('src/features/workout/stores/workout.ts', 'utf8'), {
    '@/lib/workspaceScope': { defineWorkspaceStore: pinia.defineStore, useWorkspaceClient: () => client },
    '@/stores/auth': { useAuthStore: () => ({ user: { id: 'owner' } }) }, '../lib/exercises': exercises,
  }).useWorkoutStore
  return { store: useWorkoutStore(), rows, calls, failures,
    hold() { held = new Promise(resolve => { release = resolve }) }, resume() { held = undefined; release() } }
}

test('editing an existing legacy exercise saves custom fields without changing completion or identity', async () => {
  const h = fixture()
  await h.store.fetchRoutines()
  assert.equal(await h.store.updateExercise('program', 'exercise', input({ sets: 5, reps: '6–8', weightKg: 60, restSeconds: 120, alternative: 'Cable press' })), true)
  const exercise = h.store.routines[0].exercises[0]
  assert.equal(exercise.id, 'exercise')
  assert.equal(exercise.isCompleted, true)
  assert.equal(exercise.sets, 5)
  assert.equal(exercise.weightKg, 60)
  assert.equal(exercise.alternative, 'Cable press')
  assert.equal(h.rows[0].exercises[0].notes, 'Personal note')
})

test('failed exercise writes do not optimistically change stored content or completion', async () => {
  const h = fixture()
  await h.store.fetchRoutines()
  const before = copy(h.store.routines)
  h.failures.add('update')
  assert.equal(await h.store.addExerciseToRoutine('program', input()), false)
  assert.equal(await h.store.toggleExerciseCompletion('program', 'exercise'), false)
  assert.equal(await h.store.deleteExercise('program', 'exercise'), false)
  assert.equal(await h.store.updateExercise('program', 'exercise', input({ sets: 8 })), false)
  assert.deepEqual(copy(h.store.routines), before)
  assert.equal(h.store.isSaving, false)
})

test('a pending legacy array write blocks another mutation on the same program', async () => {
  const h = fixture()
  await h.store.fetchRoutines()
  h.hold()
  const pending = h.store.updateExercise('program', 'exercise', input({ reps: '8' }))
  await vue.nextTick()
  assert.equal(h.store.isSaving, true)
  assert.equal(await h.store.toggleExerciseCompletion('program', 'exercise'), false)
  h.resume()
  assert.equal(await pending, true)
  assert.equal(h.store.routines[0].exercises[0].reps, '8')
  assert.equal(h.store.routines[0].exercises[0].isCompleted, true)
})

test('shared edits use the captured child version and preserve content on a conflict', async () => {
  const h = fixture({ shared: true })
  await h.store.fetchRoutines()
  h.rows[0].exercises[0]._version = 4
  h.rows[0].exercises[0].notes = 'Another member edited this'
  assert.equal(await h.store.updateExercise('program', 'exercise', input({ sets: 7 }), 3), false)
  assert.equal(h.calls.at(-1).version, 3)
  assert.equal(h.store.routines[0].exercises[0].sets, 3)
  assert.equal(h.rows[0].exercises[0].notes, 'Another member edited this')
})

test('duplicating shared programs creates independent versioned children and clears only copied checkmarks', async () => {
  const h = fixture({ shared: true })
  await h.store.fetchRoutines()
  const result = await h.store.duplicateRoutine('program', 'Push (Copy)')
  assert.ok(result)
  assert.notEqual(result.id, 'program')
  assert.notEqual(result.exercises[0].id, 'exercise')
  assert.equal(result.exercises[0]._version, 1)
  assert.equal(result.exercises[0].isCompleted, false)
  assert.equal(result.exercises[0].alternative, 'Dumbbell press')
  assert.equal(h.rows[0].exercises[0].isCompleted, true)
  assert.deepEqual(h.calls.find(call => call.operation === 'insert').payload.exercises, [])
  assert.equal(await h.store.updateExercise(result.id, result.exercises[0].id, input({ sets: 4 }), 1), true)
})

test('an interrupted shared copy removes its partial program and preserves the original', async () => {
  const h = fixture({ shared: true })
  await h.store.fetchRoutines()
  h.failures.add('rpc:add')
  assert.equal(await h.store.duplicateRoutine('program', 'Push (Copy)'), false)
  assert.equal(h.rows.length, 1)
  assert.equal(h.store.routines.length, 1)
  assert.equal(h.store.routines[0].id, 'program')
})

test('program metadata edits and duplication also work with the legacy JSON schema', async () => {
  const h = fixture()
  await h.store.fetchRoutines()
  assert.equal(await h.store.updateRoutine('program', '  Pull day  ', 'Friday'), true)
  const result = await h.store.duplicateRoutine('program', 'Pull day (Copy)')
  assert.equal(result.title, 'Pull day (Copy)')
  assert.equal(result.day_of_week, 'Friday')
  assert.equal(result.exercises[0].isCompleted, false)
  assert.notEqual(result.exercises[0].id, 'exercise')
  assert.equal(h.calls.some(call => call.operation.startsWith('rpc:')), false)
})

test('viewer stores reject creation, edits, copies, deletion and completion without requests', async () => {
  const h = fixture({ shared: true, viewer: true })
  await h.store.fetchRoutines()
  const count = h.calls.length
  for (const operation of [() => h.store.addRoutine('New', 'Any'), () => h.store.updateRoutine('program', 'Changed', 'Any'),
    () => h.store.duplicateRoutine('program', 'Copy'), () => h.store.deleteRoutine('program'),
    () => h.store.addExerciseToRoutine('program', input()), () => h.store.updateExercise('program', 'exercise', input()),
    () => h.store.toggleExerciseCompletion('program', 'exercise'), () => h.store.deleteExercise('program', 'exercise'), () => h.store.resetRoutine('program'), () => h.store.reorderExercises('program', ['exercise'])]) assert.equal(await operation(), false)
  assert.equal(h.calls.length, count)
})

function compileComponent(path, dependencies, inlineTemplate = true, globals = {}) {
  const descriptor = parse(fs.readFileSync(path, 'utf8')).descriptor
  return load(compileScript(descriptor, { id: path, inlineTemplate }).content, dependencies, globals).default
}
test('viewer program cards and exercise rows show content without write controls', async () => {
  const dependencies = { '@/lib/workspaceScope': { useModuleAccess: () => ({ canWrite: vue.computed(() => false) }) }, './ExerciseImage.vue': { default: { setup: () => () => vue.h('div') } } }
  const routine = fixture().rows[0]
  const card = vue.createSSRApp(compileComponent('src/features/workout/components/WorkoutRoutineCard.vue', dependencies), { routine })
  card.config.globalProperties.$t = key => key
  const cardHtml = await renderToString(card)
  assert.equal((cardHtml.match(/<button/g) || []).length, 1)
  const row = vue.createSSRApp(compileComponent('src/features/workout/components/WorkoutExerciseRow.vue', dependencies), { exercise: routine.exercises[0] })
  row.config.globalProperties.$t = key => key
  const html = await renderToString(row)
  assert.equal((html.match(/<button/g) || []).length, 1)
  assert.match(html, /Barbell bench press/)
  assert.match(html, /Personal note/)
  assert.match(html, /Dumbbell press/)
  assert.match(html, /3–1–1/)
  assert.match(html, /aria-haspopup="dialog"/)
  assert.doesNotMatch(html, /aria-expanded|noExerciseNotes/)
  assert.doesNotMatch(html, /workout.editExercise|common.delete|workout.toggleExercise/)
})

const stateRenderer = vue.createRenderer({ createElement: () => ({}), createText: () => ({}), createComment: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode() {}, nextSibling() {} })
async function settle() { await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }
function setupState(path, props, dependencies, globals = {}, initialize = () => {}) {
  const component = compileComponent(path, { 'vue-i18n': { useI18n: () => ({ t: key => key }) }, './ExerciseImage.vue': { default: {} }, '@/components/ui/CustomSelect.vue': { default: {} }, '../lib/exercises': exercises, ...dependencies }, false, globals)
  const events = []
  let state
  const app = stateRenderer.createApp({ setup() { state = component.setup(props, { expose() {}, emit: (...event) => events.push(event) }); initialize(state); return () => vue.h('div') } })
  app.mount({})
  return { app, state, events }
}

test('exercise editor retains drafts and original version when another member updates the open item', async () => {
  const original = { ...input(), id: 'exercise', _version: 3, isCompleted: true }
  const props = vue.reactive({ show: false, busy: false, exercise: original })
  const { app, state, events } = setupState('src/features/workout/components/ExerciseLibraryModal.vue', props)
  state.dialog.value = { open: false, showModal() { this.open = true }, close() { this.open = false } }
  props.show = true
  await settle()
  state.draft.value.sets = 4
  state.draft.value.weightKg = ''
  props.exercise = { ...original, _version: 4, sets: 8 }
  await settle()
  state.save()
  assert.equal(events[0][0], 'update')
  assert.equal(events[0][1], 'exercise')
  assert.equal(events[0][2].sets, 4)
  assert.equal(events[0][2].weightKg, null)
  assert.equal(events[0][3], 3)
  assert.equal(original.sets, 3)
  assert.equal(original.isCompleted, true)
  props.busy = true
  state.save()
  let prevented = 0
  state.cancel({ preventDefault() { prevented++ } })
  assert.equal(events.length, 1)
  assert.equal(prevented, 1)
  app.unmount()
})

test('program creation keeps failed drafts and opens exercise selection after successful saving', async () => {
  const h = fixture()
  const drafts = new Map(), toasts = []
  const { app, state } = setupState('src/features/workout/components/WorkoutTracker.vue', {}, {
    '../stores/workout': { useWorkoutStore: () => h.store },
    '@/stores/ui': { useUIStore: () => ({ addToast: (...message) => toasts.push(message) }) },
    '@/lib/workspaceScope': { useModuleLoad: callback => vue.onMounted(callback), useModuleAccess: () => ({ canWrite: vue.computed(() => true) }), useWorkspaceDraft: (key, value) => { const draft = vue.ref(value); drafts.set(key, draft); return draft } },
    './WorkoutRoutineCard.vue': { default: {} }, './WorkoutSequence.vue': { default: {} }, './ExerciseLibraryModal.vue': { default: {} }, './ExercisePreview.vue': { default: {} },
  })
  await settle()
  state.newRoutineTitle.value = 'My custom program'
  state.newRoutineDay.value = 'Friday'
  h.failures.add('insert')
  await state.createProgram()
  assert.equal(state.newRoutineTitle.value, 'My custom program')
  assert.equal(state.showLibrary.value, false)
  assert.equal(toasts.length, 1)
  h.failures.clear()
  await state.createProgram()
  assert.equal(state.newRoutineTitle.value, '')
  assert.equal(state.activeRoutine.value.title, 'My custom program')
  assert.equal(state.activeRoutine.value.day_of_week, 'Friday')
  assert.equal(state.showLibrary.value, true)
  await state.addExercise(input({ name: 'A custom movement', reps: '30 sec' }))
  assert.equal(state.showLibrary.value, false)
  assert.equal(state.activeRoutine.value.exercises[0].reps, '30 sec')
  app.unmount()
})

test('workout order survives reload, preserves exercise data and rejects invalid permutations and stale drags', async () => {
  for (const shared of [false, true]) {
    const h = fixture({ shared })
    h.rows[0].exercises.push({ ...input({ name: 'Squat', notes: 'Keep this note' }), id: 'squat', _version: 2, isCompleted: false })
    await h.store.fetchRoutines()
    const before = copy(h.store.routines[0].exercises), count = h.calls.length
    for (const ids of [[], ['exercise', 'exercise'], ['exercise', 'unknown']]) assert.equal(await h.store.reorderExercises('program', ids, 1), false)
    assert.equal(await h.store.reorderExercises('program', ['squat', 'exercise'], 0), false)
    assert.equal(h.calls.length, count)
    assert.equal(await h.store.reorderExercises('program', ['squat', 'exercise'], 1), true)
    assert.equal(h.store.routines[0].version, h.rows[0].version)
    await h.store.fetchRoutines()
    assert.deepEqual(copy(h.store.routines[0].exercises), [before[1], before[0]])
    if (shared) assert.deepEqual(h.calls.find(call => call.operation === 'rpc:reorder').item, { ids: ['squat', 'exercise'] })
    h.failures.add(shared ? 'rpc:reorder' : 'update')
    const version = h.store.routines[0].version
    assert.equal(await h.store.reorderExercises('program', ['exercise', 'squat'], version), false)
    assert.deepEqual(copy(h.store.routines[0].exercises), [before[1], before[0]])
  }
})

test('a legacy reorder cannot overwrite a change saved after the sequence was opened', async () => {
  const h = fixture()
  h.rows[0].exercises.push({ ...input({ name: 'Squat' }), id: 'squat', isCompleted: false })
  await h.store.fetchRoutines()
  h.rows[0].version++
  h.rows[0].exercises[0].notes = 'Changed in another tab'
  assert.equal(await h.store.reorderExercises('program', ['squat', 'exercise'], 1), false)
  assert.equal(h.rows[0].exercises[0].notes, 'Changed in another tab')
  assert.deepEqual(h.rows[0].exercises.map(e => e.id), ['exercise', 'squat'])
})

test('sequence supports drag and keyboard moves, restores a failed preview and fences changes arriving mid-drag', async () => {
  const routine = vue.reactive({ id: 'program', version: 1, exercises: ['a', 'b', 'c'].map(id => ({ ...input(), id, isCompleted: false })) })
  const calls = [], writable = vue.ref(true)
  let allow = true
  const props = vue.reactive({ routine, disabled: false, async saveOrder(id, ids, version) {
    calls.push({ id, ids: [...ids], version })
    if (!allow || version !== routine.version) return false
    routine.exercises = ids.map(id => routine.exercises.find(e => e.id === id)); routine.version++
    return true
  } })
  const { app, state } = setupState('src/features/workout/components/WorkoutSequence.vue', props, {
    '@/lib/workspaceScope': { useModuleAccess: () => ({ canWrite: writable }) }, './WorkoutExerciseRow.vue': { default: {} },
    vuedraggable: { default: {} },
  }, { window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) } })
  await state.move('a', 1)
  assert.deepEqual(copy(routine.exercises.map(e => e.id)), ['b', 'a', 'c'])
  state.startDrag(); state.ordered.value = [routine.exercises[2], ...routine.exercises.slice(0, 2)]
  await state.finishDrag()
  assert.deepEqual(copy(routine.exercises.map(e => e.id)), ['c', 'b', 'a'])
  allow = false
  state.startDrag(); state.ordered.value.reverse(); await state.finishDrag()
  assert.deepEqual(Array.from(state.ordered.value, e => e.id), ['c', 'b', 'a'])
  allow = true
  state.startDrag(); state.ordered.value.reverse()
  routine.version++; await vue.nextTick(); await state.finishDrag()
  assert.deepEqual(Array.from(state.ordered.value, e => e.id), ['c', 'b', 'a'])
  const count = calls.length
  await state.move('c', -1); props.disabled = true; await state.move('c', 1)
  props.disabled = false; writable.value = false; await state.move('c', 1)
  assert.equal(calls.length, count)
  app.unmount()
})

test('two-pose preview waits for both images, keeps a usable fallback and pauses when hidden or motion is reduced', async () => {
  const doc = new EventTarget(); doc.visibilityState = 'visible'
  const media = new EventTarget(); media.matches = false
  let observe, disconnected = false
  const props = vue.reactive({ exercise: input({ catalogId: 'Pushups' }), animated: true, controls: true })
  const { app, state } = setupState('src/features/workout/components/ExerciseImage.vue', props, {}, {
    document: doc, window: { matchMedia: () => media },
    IntersectionObserver: class { constructor(callback) { observe = callback } observe() {} disconnect() { disconnected = true } },
  }, state => { state.host.value = {} })
  await settle()
  observe([{ isIntersecting: true }])
  const first = state.sources.value[0], second = state.sources.value[1]
  state.loaded(0, first)
  assert.equal(state.hasMotion.value, false)
  state.failed(1, second)
  assert.match(state.sources.value[1], /cdn.jsdelivr.net/)
  state.loaded(1, second) // An obsolete response cannot enable animation.
  assert.equal(state.hasMotion.value, false)
  state.loaded(1, state.sources.value[1])
  assert.equal(state.playing.value, true)
  assert.equal(state.stillFrame.value, 0)
  state.paused.value = true; assert.equal(state.playing.value, false)
  state.paused.value = false
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(state.playing.value, false)
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'))
  media.matches = true; media.dispatchEvent(new Event('change'))
  assert.equal(state.hasMotion.value, false)
  media.matches = false; media.dispatchEvent(new Event('change'))
  observe([{ isIntersecting: false }]); assert.equal(state.playing.value, false)
  props.animated = false; await vue.nextTick()
  assert.equal(state.sources.value.length, 1)
  assert.equal(state.ready.value[0], true)
  props.exercise = input({ imageUrl: 'https://example.test/one-photo.jpg' }); props.animated = true
  await vue.nextTick()
  assert.equal(state.sources.value.length, 1)
  state.loaded(0, state.sources.value[0]); assert.equal(state.hasMotion.value, false)
  app.unmount()
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(state.pageVisible.value, true) // Listener was removed.
  assert.equal(disconnected, true)
})

test('large exercise preview opens with focus and scroll locked, ignores image clicks and releases everything on close or unmount', () => {
  const { JSDOM } = require('jsdom'), dom = new JSDOM('<button id="trigger">Preview</button>')
  const document = dom.window.document, trigger = document.getElementById('trigger')
  document.body.style.overflow = 'auto'; document.documentElement.style.overflow = 'scroll'; document.documentElement.style.scrollbarGutter = 'auto'
  function mount() {
    trigger.focus()
    const dialog = document.createElement('dialog'), button = document.createElement('button')
    document.body.append(dialog); dialog.append(button)
    dialog.showModal = function () { this.open = true }
    dialog.close = function () { this.open = false }
    dialog.getBoundingClientRect = () => ({ left: 100, top: 50, right: 900, bottom: 650 })
    const f = setupState('src/features/workout/components/ExercisePreview.vue', { exercise: input() }, {}, { document }, state => {
      state.dialog.value = dialog; state.closeButton.value = button
    })
    return { ...f, dialog, button }
  }
  const f = mount()
  assert.equal(f.dialog.open, true); assert.equal(document.activeElement, f.button)
  assert.equal(document.body.style.overflow, 'hidden'); assert.equal(document.documentElement.style.overflow, 'hidden')
  f.state.backdrop({ target: f.dialog, button: 0, clientX: 200, clientY: 100 })
  f.state.backdrop({ target: f.button, button: 0, clientX: 20, clientY: 20 })
  assert.equal(f.dialog.open, true)
  f.state.backdrop({ target: f.dialog, button: 0, clientX: 20, clientY: 20 })
  assert.equal(f.dialog.open, false); assert.equal(document.activeElement, trigger)
  assert.equal(document.body.style.overflow, 'auto'); assert.equal(document.documentElement.style.overflow, 'scroll')
  assert.equal(document.documentElement.style.scrollbarGutter, 'auto')
  f.state.dismiss(); assert.equal(f.events.length, 1)
  f.app.unmount(); f.dialog.remove()
  const reopened = mount(); reopened.app.unmount()
  assert.equal(reopened.dialog.open, false); assert.equal(document.activeElement, trigger)
  assert.equal(document.body.style.overflow, 'auto'); assert.equal(document.documentElement.style.overflow, 'scroll')
  dom.window.close()
})
