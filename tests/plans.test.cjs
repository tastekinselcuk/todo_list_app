const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { createPinia, setActivePinia } = require('pinia')

function loadTS(path, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => dependencies[name] || require(name), Date, console })
  return exports
}
const dates = loadTS('src/features/plans/lib/periods.ts')

test('calendar boundaries use Monday weeks and local dates', () => {
  const sunday = new Date(2026, 9, 4, 0, 1)
  assert.equal(dates.periodStart('daily', sunday), '2026-10-04')
  assert.equal(dates.periodStart('weekly', sunday), '2026-09-28')
  assert.equal(dates.periodStart('monthly', sunday), '2026-10-01')
  assert.equal(dates.periodStart('yearly', sunday), '2026-01-01')
  assert.equal(dates.periodStart('weekly', new Date(2026, 9, 5)), '2026-10-05')
})
test('period stepping handles leap years and year boundaries', () => {
  assert.equal(dates.nextPeriod('daily', '2024-02-28'), '2024-02-29')
  assert.equal(dates.nextPeriod('daily', '2024-02-29'), '2024-03-01')
  assert.equal(dates.nextPeriod('weekly', '2025-12-29'), '2026-01-05')
  assert.equal(dates.nextPeriod('monthly', '2025-12-01'), '2026-01-01')
  assert.equal(dates.nextPeriod('yearly', '2025-01-01'), '2026-01-01')
})
test('opening chooses the shortest populated current period, excluding old records', () => {
  const date = new Date(2026, 9, 4)
  const plans = [
    { period: 'daily', period_date: '2026-10-03' },
    { period: 'monthly', period_date: '2026-10-01' },
    { period: 'yearly', period_date: '2026-01-01' },
  ]
  assert.equal(dates.firstPopulatedPeriod(plans, date), 'monthly')
  plans.push({ period: 'weekly', period_date: '2026-09-28' })
  assert.equal(dates.firstPopulatedPeriod(plans, date), 'weekly')
  plans.push({ period: 'daily', period_date: '2026-10-04' })
  assert.equal(dates.firstPopulatedPeriod(plans, date), 'daily')
  assert.equal(dates.firstPopulatedPeriod([], date), 'daily')
})

function fixture(rows) {
  setActivePinia(createPinia())
  const calls = []
  const deletions = []
  let fail = false
  let updateGate
  const auth = { user: { id: 'owner' } }
  const client = { from() {
    let updates, inserted, deleting = false
    let id
    let userId
    const query = {
      select() { return query },
      eq(key, value) { if (key === 'id') id = value; if (key === 'user_id') userId = value; return query },
      async order() { return fail ? { error: new Error('offline') } : { data: structuredClone(rows) } },
      insert(value) { inserted = value; return query },
      update(value) { updates = value; return query },
      delete() { deleting = true; return query },
      async single() {
        if (updateGate) await updateGate
        if (fail) return { error: new Error('offline') }
        if (deleting) {
          const index = rows.findIndex(r => r.id === id && r.user_id === userId)
          if (index === -1) return { error: new Error('not found') }
          deletions.push({ id, userId })
          rows.splice(index, 1)
          return { data: { id } }
        }
        if (inserted) {
          const row = { ...inserted, id: 'new', completed: false, reason: '', history: [], created_at: new Date().toISOString() }
          rows.push(row)
          return { data: structuredClone(row) }
        }
        const row = rows.find(r => r.id === id)
        calls.push(structuredClone(updates))
        Object.assign(row, updates)
        return { data: structuredClone(row) }
      },
      then(resolve) {
        if (fail) return Promise.resolve({ error: new Error('offline') }).then(resolve)
        calls.push(structuredClone(updates))
        Object.assign(rows.find(r => r.id === id), updates)
        return Promise.resolve({ error: null }).then(resolve)
      },
    }
    return query
  } }
  const module = loadTS('src/features/plans/stores/plans.ts', {
    '@/lib/supabase': { supabase: client },
    '@/stores/auth': { useAuthStore: () => auth },
    '../lib/periods': dates,
  })
  return {
    store: module.usePlansStore(), calls, deletions, fail: () => { fail = true }, rows,
    pauseWrites: () => {
      let release
      updateGate = new Promise(resolve => { release = resolve })
      return release
    },
  }
}
function oldPlan(extra = {}) {
  const current = new Date()
  current.setMonth(current.getMonth() - 2, 1)
  return { id: 'one', user_id: 'owner', title: 'A plan', period: 'monthly', period_date: dates.periodStart('monthly', current), completed: false, reason: 'Waiting', history: [], created_at: current.toISOString(), ...extra }
}
test('unfinished plans carry across every elapsed period with reasons intact', async () => {
  const { store, calls } = fixture([oldPlan()])
  assert.equal(await store.load(), true)
  const plan = store.plans[0]
  assert.equal(plan.period_date, dates.periodStart('monthly'))
  assert.equal(plan.history.length, 2)
  assert.ok(plan.history.every(row => row.completed === false && row.reason === 'Waiting'))
  assert.equal(plan.reason, 'Waiting')
  assert.equal(calls.length, 1)
  await store.load()
  assert.equal(store.plans[0].history.length, 2)
  assert.equal(calls.length, 1, 'reloading must not duplicate history')
})
test('completed plans stay in their original period', async () => {
  const row = oldPlan({ completed: true, reason: '' })
  const originalDate = row.period_date
  const { store, calls } = fixture([row])
  await store.load()
  assert.equal(store.plans[0].period_date, originalDate)
  assert.equal(calls.length, 0)
})
test('completing a deferred plan removes its current reason and preserves history', async () => {
  const { store } = fixture([oldPlan()])
  await store.load()
  const plan = store.plans[0]
  assert.equal(await store.update(plan, { completed: true, reason: '' }), true)
  assert.equal(plan.completed, true)
  assert.equal(plan.reason, '')
  assert.ok(plan.history.every(row => row.reason === 'Waiting'))
})
test('quick add records the selected current period and trims the title', async () => {
  const { store } = fixture([])
  assert.equal(await store.add('  New yearly plan  ', 'yearly'), true)
  assert.equal(store.plans[0].title, 'New yearly plan')
  assert.equal(store.plans[0].period_date, dates.periodStart('yearly'))
  assert.equal(store.plans[0].period, 'yearly')
  assert.equal(await store.add('   ', 'daily'), false)
})
test('failed updates leave saved state intact and expose the error', async () => {
  const { store, fail } = fixture([oldPlan({ completed: true })])
  await store.load()
  fail()
  const plan = store.plans[0]
  assert.equal(await store.update(plan, { completed: false }), false)
  assert.equal(plan.completed, true)
  assert.equal(store.error, 'offline')
  assert.equal(store.busy, false)
})
test('completion appears immediately while saving and permits other notes to save', async () => {
  const currentDate = dates.periodStart('monthly')
  const { store, pauseWrites } = fixture([
    oldPlan({ period_date: currentDate }),
    oldPlan({ id: 'two', period_date: currentDate, reason: '' }),
  ])
  await store.load()
  const release = pauseWrites()
  const first = store.plans[0]
  const second = store.plans[1]
  const saveFirst = store.update(first, { completed: true, reason: '' })
  assert.equal(first.completed, true, 'render completion before the server responds')
  assert.equal(first.reason, '')
  assert.equal(store.isSaving(first.id), true)
  assert.equal(store.busy, false, 'saving one note must not lock the whole list')
  const saveSecond = store.update(second, { completed: true })
  assert.equal(second.completed, true)
  assert.equal(await store.update(first, { completed: false }), false, 'prevent duplicate writes on the same note')
  release()
  assert.equal(await saveFirst, true)
  assert.equal(await saveSecond, true)
  assert.equal(store.isSaving(first.id), false)
  assert.equal(store.isSaving(second.id), false)
})
test('failed optimistic completion restores both status and deferral reason', async () => {
  const { store, pauseWrites, fail } = fixture([oldPlan({ period_date: dates.periodStart('monthly') })])
  await store.load()
  const release = pauseWrites()
  const plan = store.plans[0]
  const save = store.update(plan, { completed: true, reason: '' })
  assert.equal(plan.completed, true)
  assert.equal(plan.reason, '')
  fail()
  release()
  assert.equal(await save, false)
  assert.equal(plan.completed, false)
  assert.equal(plan.reason, 'Waiting')
  assert.equal(store.isSaving(plan.id), false)
  assert.equal(store.error, 'offline')
})

test('deleting a plan removes only that owned plan and its period history', async () => {
  const { store, rows, deletions } = fixture([
    oldPlan({ completed: true, history: [{ date: '2025-01-01', completed: false, reason: 'Waiting' }] }),
    oldPlan({ id: 'two', completed: true }),
  ])
  await store.load()
  assert.equal(await store.remove('one'), true)
  assert.deepEqual(deletions, [{ id: 'one', userId: 'owner' }])
  assert.equal(store.plans.length, 1)
  assert.equal(store.plans[0].id, 'two')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'two')
  assert.equal(store.isSaving('one'), false)
})

test('failed deletion preserves the plan and unlocks its actions', async () => {
  const { store, rows, fail } = fixture([oldPlan({ completed: true })])
  await store.load()
  fail()
  assert.equal(await store.remove('one'), false)
  assert.equal(store.plans.length, 1)
  assert.equal(rows.length, 1)
  assert.equal(store.isSaving('one'), false)
  assert.equal(store.error, 'offline')
})

test('pending deletion blocks duplicate writes and reloads until the result arrives', async () => {
  const { store, deletions, pauseWrites } = fixture([oldPlan({ completed: true })])
  await store.load()
  const release = pauseWrites()
  const plan = store.plans[0]
  const removing = store.remove(plan.id)
  assert.equal(store.isSaving(plan.id), true)
  assert.equal(store.plans.length, 1, 'keep the plan until deletion is confirmed')
  assert.equal(await store.remove(plan.id), false)
  assert.equal(await store.update(plan, { completed: false }), false)
  assert.equal(await store.load(), false)
  release()
  assert.equal(await removing, true)
  assert.equal(deletions.length, 1)
  assert.equal(store.plans.length, 0)
  assert.equal(store.isSaving(plan.id), false)
})
