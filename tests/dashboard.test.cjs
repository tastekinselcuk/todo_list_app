const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')
const vue = require('vue')

function load(source, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => dependencies[name] || (name === '@/lib/searchNavigation' ? load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'), {vue}, globals) : null) || (name === '@/lib/storage' ? load(fs.readFileSync('src/lib/storage.ts', 'utf8'), {}, globals) : name === '@/lib/moduleCatalog' ? load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'), {}, globals) : require(name)), Date, console, ...globals })
  return exports
}
const dates = load(fs.readFileSync('src/features/plans/lib/periods.ts', 'utf8'))
const overview = load(fs.readFileSync('src/features/dashboard/lib/overview.ts', 'utf8'), { '@/features/plans/lib/periods': dates })
const localDate = new Date(2026, 9, 8, 0, 15)

test('home retains readable modules while suppressing capture and completion for viewers', async () => {
  const f=fixture({readonly:['quick','plans','detailed','periodic']})
  await settle()
  assert.equal(f.state.captureOptions.value.length,0)
  assert.equal(f.state.modules.value.length,4)
  f.state.draft.value='Blocked'
  await f.state.capture()
  await f.state.completePlan({id:'plan',completed:false})
  await f.state.completeAgenda({id:'todo',module:'detailed'})
  assert.equal(f.calls.filter(Array.isArray).length,0)
  f.close()
})

test('plan progress counts only the selected current period, excluding old completions', () => {
  const summary = overview.summarizePlans([
    { id: 'pending', period: 'monthly', period_date: '2026-10-01', completed: false },
    { id: 'done', period: 'monthly', period_date: '2026-10-01', completed: true },
    { id: 'old', period: 'monthly', period_date: '2026-09-01', completed: true },
    { id: 'other', period: 'yearly', period_date: '2026-01-01', completed: false },
  ], 'monthly', localDate)
  assert.equal(summary.total, 2)
  assert.equal(summary.completed, 1)
  assert.equal(summary.percent, 50)
  assert.deepEqual(Array.from(summary.pending, row => row.id), ['pending'])
  assert.equal(overview.summarizePlans([], 'daily', localDate).percent, 0)
})

test('today excludes future, undated and completed notes and sorts overdue notes then timed routines', () => {
  const note = (id, dueDate, extra = {}) => ({ id, title: id, dueDate, completed: false, priority: 'medium', ...extra })
  const items = overview.buildAgenda([
    note('today-low', '2026-10-08', { priority: 'low' }), note('today-high', '2026-10-08', { priority: 'high' }),
    note('overdue', '2026-10-07'), note('future', '2026-10-09'), note('undated', null), note('done', '2026-10-08', { completed: true }),
  ], [
    { id: 'late-routine', title: 'Late', reminder_time: '20:00' },
    { id: 'morning-routine', title: 'Morning', reminder_time: '08:00' },
  ], localDate)
  assert.deepEqual(Array.from(items, row => row.id), ['overdue', 'morning-routine', 'late-routine', 'today-high', 'today-low'])
  assert.equal(items[0].overdue, true)
  assert.ok(items.slice(1).every(item => !item.overdue))
})

function fixture({ active = ['plans', 'quick', 'detailed', 'periodic'], failures = [], saved = {}, planRows = [], readonly = [] } = {}) {
  const memory = new Map(Object.entries(saved))
  const calls = []
  const events = []
  const toasts = []
  const drafts = new Map()
  const loader = id => async () => { calls.push(id); return !failures.includes(id) }
  let saveSucceeds = true
  let gate
  const plans = vue.reactive({
    plans: planRows, load: loader('plans'), isSaving: () => false,
    async add(title, period) { calls.push(['add-plan', title, period]); if (gate) await gate; return saveSucceeds },
    async update(plan, changes) { calls.push(['complete-plan', plan.id]); if (gate) await gate; if (saveSucceeds) Object.assign(plan, changes); return saveSucceeds },
  })
  const todos = vue.reactive({
    todos: [], quickNotes: [], codeSnippets: [],
    fetchTodos: loader('detailed'), fetchQuickNotes: loader('quick'), fetchCodeSnippets: loader('code'),
    async addQuickNote(title) { calls.push(['add-quick', title]); if (gate) await gate; return { success: saveSucceeds } },
    async toggleTodo(id) { calls.push(['complete-todo', id]); if (gate) await gate; return saveSucceeds },
  })
  const periodic = vue.reactive({ tasks: [], loadTasks: loader('periodic'), async toggleTask() { return saveSucceeds } })
  const dependencies = {
    'vue-i18n': { useI18n: () => ({ t: key => key, locale: vue.ref('tr') }) },
    'lucide-vue-next': {},
    '@/components/ui/CustomSelect.vue': { default: {} }, '@/components/ui/WorkspacePicker.vue': { default: {} },
    '@/features/analytics/components/WeeklyAnalytics.vue': { default: {} },
    '@/lib/workspaceScope': { useModuleAccess: id => ({canWrite:vue.ref(!readonly.includes(id))}), workspaceStorageKey: key => key, useWorkspaceDraft(key, initial) {
      const draft = vue.ref(memory.has(key) ? JSON.parse(memory.get(key)) : initial)
      drafts.set(key, draft)
      vue.watch(draft, value => memory.set(key, JSON.stringify(value)), { flush: 'sync' })
      return draft
    } },
    '@/stores/settings': { useSettingsStore: () => ({ isModuleActive: id => active.includes(id), isFullScreen: false }) },
    '@/stores/ui': { useUIStore: () => ({ addToast: (...args) => toasts.push(args) }) },
    '@/features/todos/stores/todo': { useTodoStore: () => todos },
    '@/features/plans/stores/plans': { usePlansStore: () => plans },
    '@/features/plans/lib/periods': dates,
    '@/features/dashboard/lib/overview': overview,
    '@/features/learning/stores/learning': { useLearningStore: () => ({ subjects: [], fetchSubjects: loader('learning') }) },
    '@/features/workout/stores/workout': { useWorkoutStore: () => ({ routines: [], fetchRoutines: loader('workout') }) },
    '@/features/flashcards/stores/flashcards': { useFlashcardStore: () => ({ decks: [], fetchDecks: loader('flashcards') }) },
    '@/features/PeriodicTasks/stores/periodicTasks': { usePeriodicTasksStore: () => periodic, isTaskDueOn: () => true, isCompletedForPeriod: () => false },
    '@/features/activity_lists/stores/activityLists': { useActivityListsStore: () => ({ wantCount: 0, loadItems: loader('activities') }) },
  }
  const descriptor = parse(fs.readFileSync('src/views/DashboardHome.vue', 'utf8')).descriptor
  const component = load(compileScript(descriptor, { id: 'dashboard-test' }).content, dependencies, {
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    setInterval: () => 1, clearInterval() {},
  }).default
  // Mount setup in Vue's lifecycle without needing a browser or a database session.
  const renderer = vue.createRenderer({
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode() {}, nextSibling() {},
  })
  let state
  const app = renderer.createApp({ setup() { state = component.setup({}, { expose() {}, emit: (...args) => events.push(args) }); return () => vue.h('div') } })
  app.mount({})
  return { state, calls, events, toasts, memory, plans, todos, periodic, close: () => app.unmount(), failSave: () => { saveSucceeds = false }, pauseSave() { let release; gate = new Promise(resolve => { release = resolve }); return release } }
}
async function settle() { await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }

test('home loads enabled modules only and reports failed fetches rather than zero', async () => {
  const f = fixture({ active: ['plans', 'code', 'secure'], failures: ['plans'] })
  await settle()
  assert.deepEqual(f.calls, ['plans', 'code'])
  assert.equal(f.state.statuses.value.plans, 'error')
  assert.equal(f.state.moduleMetric('plans'), 'dashboard.home.loadError')
  assert.equal(f.state.moduleMetric('secure'), 'dashboard.home.protected')
  assert.equal(f.state.refreshing.value, false)
  f.close()
})

test('home opens shortest populated period, remembers choice and hands it to Plans', async () => {
  const today = new Date()
  const f = fixture({ planRows: [{ id: 'monthly', period: 'monthly', period_date: dates.periodStart('monthly', today), completed: false }] })
  await settle()
  assert.equal(f.state.selectedPeriod.value, 'monthly')
  f.state.choosePeriod('yearly')
  await f.state.refresh()
  assert.equal(f.state.selectedPeriod.value, 'yearly')
  f.state.openPlans()
  assert.equal(f.memory.get('plan-period'), '"yearly"')
  assert.deepEqual(f.events, [['enter-workspace', 'plans']])
  f.close()
})

test('quick capture trims content, prevents duplicate submits and clears the successful draft', async () => {
  const f = fixture()
  await settle()
  f.state.draft.value = '  A quick note  '
  const release = f.pauseSave()
  const saving = f.state.capture()
  assert.equal(f.state.saving.value, true)
  await f.state.capture()
  release()
  await saving
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'add-quick').length, 1)
  assert.deepEqual(f.calls.find(call => Array.isArray(call)), ['add-quick', 'A quick note'])
  assert.equal(f.state.draft.value, '')
  assert.equal(f.state.saving.value, false)
  f.close()
})

test('plan capture uses selected period and preserves text on save failure', async () => {
  const f = fixture({ active: ['plans'] })
  await settle()
  assert.equal(f.state.destination.value, 'daily')
  f.state.destination.value = 'yearly'
  f.state.draft.value = 'Annual goal'
  f.failSave()
  await f.state.capture()
  assert.deepEqual(f.calls.find(call => Array.isArray(call)), ['add-plan', 'Annual goal', 'yearly'])
  assert.equal(f.state.draft.value, 'Annual goal')
  assert.equal(f.toasts.at(-1)[1], 'error')
  f.close()
})

test('completing a plan clears its deferral and prevents duplicate completion requests', async () => {
  const f = fixture()
  await settle()
  const plan = { id: 'one', completed: false, reason: 'Waiting' }
  const release = f.pauseSave()
  const completing = f.state.completePlan(plan)
  await f.state.completePlan(plan)
  release()
  await completing
  assert.equal(plan.completed, true)
  assert.equal(plan.reason, '')
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'complete-plan').length, 1)
  assert.equal(f.state.pendingActions.value.size, 0)
  f.close()
})

test('agenda excludes disabled or failed modules even if cached records exist', async () => {
  const f = fixture({ active: ['detailed'], failures: ['detailed'] })
  f.todos.todos.push({ id: 'cached', title: 'Cached', dueDate: dates.periodStart('daily'), priority: 'high', completed: false })
  f.periodic.tasks.push({ id: 'hidden', title: 'Hidden', reminder_time: null })
  await settle()
  assert.equal(f.state.agenda.value.length, 0)
  assert.equal(f.state.agendaError.value, true)
  f.close()
})
