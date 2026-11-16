const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const createDOMPurify = require('dompurify')
const { parse, compileScript } = require('@vue/compiler-sfc')
const vue = require('vue')
const pinia = require('pinia')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const purifier = createDOMPurify(dom.window)

function loadTs(filePath, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(filePath, 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
  const exports = {}
  const module = { exports }
  vm.runInNewContext(
    code,
    {
      exports,
      module,
      require: name => {
        if (name in dependencies) return dependencies[name]
        return require(name)
      },
      Date,
      console,
      CustomEvent: dom.window.CustomEvent,
      window: dom.window,
      ...globals,
    },
    { filename: filePath },
  )
  return module.exports
}

const noteContent = loadTs('src/lib/noteContent.ts', {
  dompurify: { default: purifier },
})

const aiNoteFormat = loadTs('src/lib/aiNoteFormat.ts', {
  './noteContent': noteContent,
  '@/lib/noteContent': noteContent,
})

function createStorageStub() {
  const store = new Map()
  return {
    readStorage(key) {
      return store.has(key) ? store.get(key) : null
    },
    writeStorage(key, value) {
      if (value === null) store.delete(key)
      else store.set(key, value)
      return true
    },
  }
}

function createMockSupabase() {
  const rpcCalls = []
  const runs = []
  let settingsState = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    write_mode: 'ask_before_write',
    configured_providers: { gemini: false, openai: false, anthropic: false },
    key_hints: { gemini: null, openai: null, anthropic: null },
  }

  const supabase = {
    rpcCalls,
    async rpc(name, args = {}) {
      rpcCalls.push({ name, args })
      if (name === 'ai_settings_get') {
        return { data: settingsState, error: null }
      }
      if (name === 'ai_settings_save') {
        assert.equal('p_provider' in args, false, 'ai_settings_save must not pass p_provider')
        assert.equal('p_api_key' in args, false, 'ai_settings_save must not pass p_api_key')
        const provider = args.provider || settingsState.provider
        const clearTarget = args.clear_provider === provider
        const hasKey = clearTarget ? false : Boolean(args.api_key || settingsState.configured_providers[provider])
        const hint = clearTarget
          ? null
          : args.api_key
            ? `••••${String(args.api_key).slice(-4)}`
            : settingsState.key_hints[provider]
        settingsState = {
          provider,
          model: args.model || settingsState.model,
          write_mode: args.write_mode || settingsState.write_mode,
          configured_providers: {
            ...settingsState.configured_providers,
            [provider]: hasKey,
          },
          key_hints: {
            ...settingsState.key_hints,
            [provider]: hint,
          },
        }
        return { data: settingsState, error: null }
      }
      if (name === 'ai_workspace_digest') {
        return {
          data: {
            workspace_id: args.wid,
            generated_at: '2026-11-15T00:00:00Z',
            plans: { pending_count: 4, completed_count: 2, overdue_count: 2, upcoming: [] },
            tasks: { pending_count: 5, completed_count: 3, overdue_count: 1, high_priority: [] },
            quick_notes: { total_count: 3, recent: [] },
            todos: { active_count: 2, recent: [] },
            periodic_tasks: { total_count: 2, items: [] },
            learning: { active_topics: 3, unresolved_mistakes: 2, recent_mistakes: [] },
            finance: { recent_transactions_30d: 4, expense_30d: 1250, income_30d: 4500 },
            activities: { want_count: 3, done_count: 1, recent_want: [] },
          },
          error: null,
        }
      }
      if (name === 'ai_execute_actions') {
        const runId = `run-${runs.length + 1}`
        const appliedChanges = (args.actions || []).map((a, idx) => ({
          module: a.module,
          operation: a.operation,
          target_id: a.target_id || `rec-${idx + 1}`,
          write_mode: a.write_mode || 'append',
        }))
        runs.unshift({
          id: runId,
          provider: args.meta?.provider || 'gemini',
          model: args.meta?.model || 'gemini-2.5-flash',
          mode: args.meta?.mode || 'ask_before_write',
          status: 'applied',
          prompt_summary: args.meta?.prompt_summary || 'AI Veri Girişi',
          target_modules: appliedChanges.map(c => c.module),
          applied_changes: appliedChanges,
          created_at: '2026-11-15T00:00:00Z',
          undone_at: null,
        })
        return {
          data: {
            run_id: runId,
            status: 'applied',
            applied_count: appliedChanges.length,
            applied_changes: appliedChanges,
          },
          error: null,
        }
      }
      if (name === 'ai_undo_action_run') {
        assert.equal('p_run_id' in args, false, 'ai_undo_action_run must not pass p_run_id')
        const found = runs.find(r => r.id === args.run_id)
        if (found) {
          found.status = 'undone'
          found.undone_at = '2026-11-15T00:05:00Z'
        }
        return {
          data: {
            run_id: args.run_id,
            status: 'undone',
            restored_count: found ? found.applied_changes.length : 1,
          },
          error: null,
        }
      }
      if (name === 'ai_action_history') {
        return { data: [...runs], error: null }
      }
      if (name === 'ai_read_records') {
        return { data: { items: [{ module: 'plans', records: [{ id: 'p-1', title: 'Plan 1', notes: '<p>Not</p>' }] }] }, error: null }
      }
      return { data: null, error: null }
    },
  }

  return supabase
}

test('aiClient synthesizes cross-module insights, builds module write actions, transforms notes, and blocks secure vault access', async () => {
  const mockSupabase = createMockSupabase()
  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: mockSupabase },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/lib/storage': createStorageStub(),
  })

  // 1. Cross-module analysis
  const digest = await aiClient.fetchAiWorkspaceDigest('ws-1', {}, mockSupabase)
  const analysis = aiClient.synthesizeWorkspaceAnalysis(digest, 'Günlük plana odak değerlendirme notu ekle')
  assert.ok(analysis.reply.includes('bekleyen plan'))
  assert.ok(analysis.insights.some(item => item.severity === 'warning'))
  assert.ok(analysis.recommendations.length >= 2)
  assert.equal(analysis.proposed_actions.length, 1)
  assert.equal(analysis.proposed_actions[0].module, 'plans')
  assert.equal(analysis.proposed_actions[0].operation, 'save_plan')

  // 2. Prompt-based write action detection across modules
  const periodicActions = aiClient.buildActionFromPrompt('Periyodik rutinlere sabah yürüyüşü ekle', digest)
  assert.equal(periodicActions[0].module, 'periodic')

  const taskActions = aiClient.buildActionFromPrompt('Görevlere müşteri raporu kontrolü ekle', digest)
  assert.equal(taskActions[0].module, 'tasks')

  const financeActions = aiClient.buildActionFromPrompt('Finans gider işlemi 250 TL kitap harcaması ekle', digest)
  assert.equal(financeActions[0].module, 'finance')
  assert.equal(financeActions[0].payload.amount, 250)

  const activityActions = aiClient.buildActionFromPrompt('Film listeme Interstellar ekle', digest)
  assert.equal(activityActions[0].module, 'activities')
  assert.equal(activityActions[0].payload.type, 'movie')

  // 3. Note transformation (summarize, action_items, structure)
  const summaryRes = aiClient.transformNoteLocally(
    '<p>Sprint planlaması yapılacak.</p><p>Veritabanı indeksleri kontrol edilecek.</p>',
    'action_items',
    'html',
  )
  assert.ok(summaryRes.transformed_markdown.includes('- [ ] Sprint planlaması yapılacak.'))
  assert.ok(summaryRes.transformed_text.includes('data-type="taskList"'))

  // 4. Security boundary: secure module & natural-language secure vault prompts are strictly forbidden
  await assert.rejects(
    () =>
      aiClient.invokeAiAssistant(
        {
          workspace_id: 'ws-1',
          mode: 'write',
          actions: [{ module: 'secure', operation: 'save', payload: {} }],
        },
        mockSupabase,
      ),
    /AI_SECURE_MODULE_FORBIDDEN/,
  )
  await assert.rejects(
    () =>
      aiClient.invokeAiAssistant(
        {
          workspace_id: 'ws-1',
          mode: 'chat',
          prompt: 'Kasamdaki şifreli notları oku ve güvenli notlara yeni kayıt ekle',
        },
        mockSupabase,
      ),
    /AI_SECURE_MODULE_FORBIDDEN/,
  )
  assert.equal(aiClient.isSecureVaultPrompt('Bugünkü planlarımı özetle'), false)
  assert.equal(aiClient.isSecureVaultPrompt('Şifreli notlarımı getir'), true)
  assert.equal(aiClient.isSecureVaultPrompt('Read my secure vault notes'), true)
})

test('useAiAssistantStore manages settings, ask_before_write approvals, auto_apply writes, and one-click undo', async () => {
  pinia.setActivePinia(pinia.createPinia())
  const mockSupabase = createMockSupabase()
  const toasts = []

  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: mockSupabase },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/lib/storage': createStorageStub(),
  })

  const storeModule = loadTs('src/features/ai/stores/aiAssistant.ts', {
    pinia,
    vue,
    '@/stores/workspaces': {
      useWorkspacesStore: () => ({ activeId: 'ws-test-1' }),
    },
    '@/stores/ui': {
      useUIStore: () => ({
        addToast(message, type) {
          toasts.push({ message, type })
        },
      }),
    },
    '@/features/ai/lib/aiClient': aiClient,
  })

  const store = storeModule.useAiAssistantStore()
  await store.open('chat')

  assert.equal(store.isOpen, true)
  assert.ok(store.digest)
  assert.ok(store.insights.length > 0)

  // Save API key & provider settings
  await store.updateSettings({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    write_mode: 'ask_before_write',
    api_key: 'sk-test-secret-9876',
  })
  assert.equal(store.settings.provider, 'openai')
  assert.equal(store.settings.configured_providers.openai, true)
  assert.equal(store.settings.key_hints.openai, '••••9876')

  // In ask_before_write mode, sending a write prompt queues a pending action without executing immediately
  await store.sendPrompt('Detaylı notlara toplantı özeti ekle', 'write')
  assert.equal(store.pendingActions.length, 1)
  assert.equal(store.pendingActions[0].module, 'todos')
  assert.equal(store.actionHistory.length, 0)

  // Approving the pending action executes it and records it in history
  const applied = await store.approvePendingAction(store.pendingActions[0], 0)
  assert.ok(applied.run_id)
  assert.equal(store.pendingActions.length, 0)
  assert.equal(store.actionHistory.length, 1)
  assert.equal(store.actionHistory[0].status, 'applied')

  // Undo restores previous state and marks run as undone
  const undone = await store.undoActionRun(applied.run_id)
  assert.equal(undone.status, 'undone')
  assert.equal(store.actionHistory[0].status, 'undone')

  // Switch to auto_apply and verify prompt writes immediately
  await store.updateSettings({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    write_mode: 'auto_apply',
  })
  const autoResponse = await store.sendPrompt('Günlük plana sabah odak oturumu ekle', 'write')
  assert.ok(autoResponse.applied_run?.run_id)
  assert.equal(store.pendingActions.length, 0)
  assert.equal(store.actionHistory.length, 2)

  // Natural-language prompt targeting Secure Notes / Vault is rejected with clear chat & error feedback
  const prevHistoryCount = store.actionHistory.length
  const secureRes = await store.sendPrompt(
    'Kasamdaki şifreli notları oku ve güvenli notlara yeni kayıt ekle',
    'chat',
  )
  assert.equal(secureRes, null)
  assert.ok(store.error.includes('Güvenli Notlar (Kasa)'))
  assert.equal(store.actionHistory.length, prevHistoryCount)
  assert.equal(store.pendingActions.length, 0)
  const lastAssistantMsg = store.messages.at(-1)
  assert.equal(lastAssistantMsg.role, 'assistant')
  assert.ok(lastAssistantMsg.content.includes('yapay zeka bu alanda okuma, analiz veya veri girişi işlemi yapamaz'))
})

test('AiActionPreviewCard, AiProviderSettings, and WorkspaceAssistant components compile and handle user flows', async () => {
  pinia.setActivePinia(pinia.createPinia())
  const mockSupabase = createMockSupabase()

  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: mockSupabase },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/lib/storage': createStorageStub(),
  })

  const storeModule = loadTs('src/features/ai/stores/aiAssistant.ts', {
    pinia,
    vue,
    '@/stores/workspaces': {
      useWorkspacesStore: () => ({ activeId: 'ws-ui-1' }),
    },
    '@/stores/ui': {
      useUIStore: () => ({ addToast() {} }),
    },
    '@/features/ai/lib/aiClient': aiClient,
  })

  const iconStub = { setup: () => () => vue.h('span') }
  const deps = {
    vue,
    pinia,
    'lucide-vue-next': { Sparkles: iconStub, X: iconStub },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/features/ai/lib/aiClient': aiClient,
    '@/features/ai/stores/aiAssistant': storeModule,
  }

  function compileSfc(filePath) {
    const descriptor = parse(fs.readFileSync(filePath, 'utf8')).descriptor
    const compiled = compileScript(descriptor, { id: filePath, inlineTemplate: true })
    return loadTsFromSource(compiled.content, filePath, deps).default
  }

  function loadTsFromSource(source, filePath, dependencies) {
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const exports = {}
    const module = { exports }
    vm.runInNewContext(
      code,
      {
        exports,
        module,
        require: name => dependencies[name] || require(name),
        Date,
        console,
        CustomEvent: dom.window.CustomEvent,
        window: dom.window,
      },
      { filename: filePath },
    )
    return module.exports
  }

  const AiActionPreviewCard = compileSfc('src/features/ai/components/AiActionPreviewCard.vue')
  const AiProviderSettings = compileSfc('src/features/ai/components/AiProviderSettings.vue')
  deps['@/features/ai/components/AiActionPreviewCard.vue'] = { default: AiActionPreviewCard }
  deps['@/features/ai/components/AiProviderSettings.vue'] = { default: AiProviderSettings }
  const WorkspaceAssistant = compileSfc('src/features/ai/components/WorkspaceAssistant.vue')

  assert.ok(AiActionPreviewCard)
  assert.ok(AiProviderSettings)
  assert.ok(WorkspaceAssistant)
})

test('aiClient falls back cleanly on PGRST202 missing RPCs for settings, digest, "hızlı nota test verisini gir", and undo', async () => {
  const storageStub = createStorageStub()
  const tables = {
    plans: [{ id: 'plan-1', title: 'Mevcut plan', period: 'timeless', period_date: '1970-01-01', completed: false }],
    todos: [],
    work_tasks: [{ id: 'wt-1', title: 'Raporlama', completed: false, priority: 'high', deadline: '2026-11-10' }],
    periodic_tasks: [],
    learning_subjects: [{ id: 'ls-1', name: 'SQL' }],
    learning_mistakes: [{ id: 'lm-1', subject_id: 'ls-1', description: 'Null check', resolved: false }],
    finance_transactions: [{ id: 'ft-1', type: 'expense', amount: 250, occurred_at: '2026-11-14T10:00:00Z' }],
    activity_items: [{ id: 'act-1', title: 'Dune', category: 'film', status: 'want' }],
  }
  const insertedPlans = []
  const deletedPlans = []

  const fallbackSupabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-fallback-1' } }, error: null }
      },
    },
    async rpc(name) {
      if (name === 'sharing_context') {
        return { data: [{ module: 'plans', collection_id: 'col-plans-1' }], error: null }
      }
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: `Could not find the function public.${name} in the schema cache`,
        },
      }
    },
    from(tableName) {
      const filters = []
      let pendingInsert = null
      let pendingDelete = false
      let pendingUpdate = null
      const rowsRef = tables[tableName] || []

      const builder = {
        select() {
          return builder
        },
        eq(col, val) {
          filters.push([col, val])
          return builder
        },
        in() {
          return builder
        },
        is() {
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        insert(payload) {
          pendingInsert = payload
          return builder
        },
        update(payload) {
          pendingUpdate = payload
          return builder
        },
        delete() {
          pendingDelete = true
          return builder
        },
        async single() {
          if (pendingInsert) {
            if (tableName === 'plans' && 'notes' in pendingInsert) {
              return {
                data: null,
                error: {
                  code: 'PGRST204',
                  message: "Could not find the 'notes' column of 'plans' in the schema cache",
                },
              }
            }
            const created = { id: `${tableName}-${insertedPlans.length + 2}`, ...pendingInsert }
            rowsRef.unshift(created)
            if (tableName === 'plans') insertedPlans.push(created)
            return { data: created, error: null }
          }
          return { data: rowsRef[0] || null, error: null }
        },
        then(resolve) {
          if (pendingDelete) {
            const idFilter = filters.find(([col]) => col === 'id')?.[1]
            if (tableName === 'plans' && idFilter) {
              const idx = rowsRef.findIndex(r => r.id === idFilter)
              if (idx >= 0) rowsRef.splice(idx, 1)
              deletedPlans.push(idFilter)
            }
            return Promise.resolve(resolve({ data: null, error: null }))
          }
          if (pendingUpdate) {
            return Promise.resolve(resolve({ data: null, error: null }))
          }
          return Promise.resolve(resolve({ data: [...rowsRef], error: null }))
        },
      }
      return builder
    },
  }

  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: fallbackSupabase },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/lib/storage': storageStub,
  })

  // 1. Settings + API key save must succeed even when ai_settings_save RPC is missing (PGRST202)
  const saved = await aiClient.saveAiSettings(
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      write_mode: 'ask_before_write',
      api_key: 'AIzaSyTestFallbackKey9876',
    },
    fallbackSupabase,
  )
  assert.equal(saved.provider, 'gemini')
  assert.equal(saved.configured_providers.gemini, true)
  assert.equal(saved.key_hints.gemini, '••••9876')

  const loaded = await aiClient.fetchAiSettings(fallbackSupabase)
  assert.equal(loaded.configured_providers.gemini, true)
  assert.equal(loaded.key_hints.gemini, '••••9876')

  // 2. Digest fallback must read live tables cleanly when ai_workspace_digest RPC is missing
  const digest = await aiClient.fetchAiWorkspaceDigest('ws-fb-1', {}, fallbackSupabase)
  assert.equal(digest.workspace_id, 'ws-fb-1')
  assert.equal(digest.quick_notes.total_count, 1)
  assert.equal(digest.tasks.pending_count, 1)
  assert.equal(digest.learning.unresolved_mistakes, 1)

  // 3. "hızlı nota test verisini gir" extracts clean title and executes into plans(period='timeless') + local history + undo
  const built = aiClient.buildActionFromPrompt('hızlı nota test verisini gir', digest)
  assert.equal(built.length, 1)
  assert.equal(built[0].module, 'quick_notes')
  assert.equal(built[0].title, 'test verisi')

  const execRes = await aiClient.executeAiActions(
    'ws-fb-1',
    built,
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      mode: 'ask_before_write',
      prompt_summary: 'hızlı nota test verisini gir',
    },
    fallbackSupabase,
  )
  assert.equal(execRes.status, 'applied')
  assert.equal(execRes.applied_count, 1)
  assert.equal(insertedPlans.length, 1)
  assert.equal(insertedPlans[0].title, 'test verisi')
  assert.equal(insertedPlans[0].period, 'timeless')
  assert.equal(insertedPlans[0].collection_id, 'col-plans-1')

  const historyAfterWrite = await aiClient.fetchAiActionHistory('ws-fb-1', 20, fallbackSupabase)
  assert.equal(historyAfterWrite.length, 1)
  assert.equal(historyAfterWrite[0].id, execRes.run_id)
  assert.equal(historyAfterWrite[0].status, 'applied')

  const undoRes = await aiClient.undoAiActionRun('ws-fb-1', execRes.run_id, fallbackSupabase)
  assert.equal(undoRes.status, 'undone')
  assert.deepEqual(deletedPlans, [insertedPlans[0].id])

  const historyAfterUndo = await aiClient.fetchAiActionHistory('ws-fb-1', 20, fallbackSupabase)
  assert.equal(historyAfterUndo[0].status, 'undone')
})

test('aiClient & store route workout research and calendar events cleanly, write via fallback/RPCs, undo, and replace stale pendingActions', async () => {
  const storageStub = createStorageStub()
  const insertedRoutines = []
  const deletedRoutines = []
  const workSaveCalls = []
  const workPurgeCalls = []

  const routingSupabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-route-1' } }, error: null }
      },
    },
    async rpc(name, args) {
      if (name === 'sharing_context') {
        return { data: [{ module: 'workout', collection_id: 'col-workout-1' }], error: null }
      }
      if (name === 'mutate_collection_item') {
        return { data: { ok: true }, error: null }
      }
      if (name === 'work_save_details') {
        workSaveCalls.push(args)
        return {
          data: {
            task: { id: args.tid, version: 1 },
            blocks: [{ id: `blk-${workSaveCalls.length}`, version: 1 }],
          },
          error: null,
        }
      }
      if (name === 'work_mutate' && args.operation === 'purge') {
        workPurgeCalls.push(args)
        return { data: { ok: true }, error: null }
      }
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: `Could not find the function public.${name} in the schema cache`,
        },
      }
    },
    from(tableName) {
      const filters = []
      let pendingInsert = null
      let pendingDelete = false
      let pendingUpdate = null
      const builder = {
        select() {
          return builder
        },
        eq(col, val) {
          filters.push([col, val])
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null })
        },
        insert(payload) {
          pendingInsert = payload
          return builder
        },
        update(payload) {
          pendingUpdate = payload
          return builder
        },
        delete() {
          pendingDelete = true
          return builder
        },
        single() {
          if (pendingInsert) {
            const row = { id: `${tableName}-${insertedRoutines.length + 1}`, ...pendingInsert }
            if (tableName === 'workout_routines') {
              insertedRoutines.push(row)
            }
            return Promise.resolve({ data: row, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
        then(resolve) {
          if (pendingDelete && tableName === 'workout_routines') {
            const idFilter = filters.find(([col]) => col === 'id')?.[1]
            if (idFilter) deletedRoutines.push(idFilter)
            return Promise.resolve(resolve({ data: null, error: null }))
          }
          if (pendingUpdate) {
            return Promise.resolve(resolve({ data: null, error: null }))
          }
          return Promise.resolve(resolve({ data: [], error: null }))
        },
      }
      return builder
    },
  }

  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: routingSupabase },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/lib/storage': storageStub,
  })

  const digest = {
    workspace_id: 'ws-route-1',
    generated_at: '2026-11-15T00:00:00Z',
    plans: { pending_count: 3, completed_count: 1, carry_over_count: 0, sample_titles: ['Sprint Hedefi'] },
    tasks: { pending_count: 1, overdue_count: 0, completed_count: 2, sample_titles: [] },
    todos: { total_count: 0, pinned_count: 0, sample_titles: [] },
    periodic: { total_count: 0, done_today: 0 },
    learning: { subjects_count: 0, unresolved_mistakes: 0 },
    finance: { recent_count: 0, recent_expense_total: 0, recent_income_total: 0 },
    activities: { total_count: 0, want_count: 0 },
    quick_notes: { total_count: 0 },
    excluded_modules: ['secure_notes'],
  }

  // 1. Workout research & routine generation
  const workoutPrompt =
    'öncelikle benim için ideal bir sırt antrenmanı için araştırma yap ve daha sonra uygun bir sırt programını hazırlayarak antrenman takipçisi alanına ekle'
  const workoutActions = aiClient.buildActionFromPrompt(workoutPrompt, digest)
  assert.equal(workoutActions.length, 1)
  assert.equal(workoutActions[0].module, 'workout')
  assert.equal(workoutActions[0].title, 'İdeal Sırt Antrenmanı Programı (Genişlik & Kalınlık)')
  assert.equal(workoutActions[0].payload.exercises.length, 5)
  assert.deepEqual(
    Array.from(workoutActions[0].payload.exercises, ex => ex.name),
    ['Pullups', 'Barbell Deadlift', 'Wide-Grip Lat Pulldown', 'Seated Cable Rows', 'One-Arm Dumbbell Row'],
  )

  const workoutAnalysis = aiClient.synthesizeWorkspaceAnalysis(digest, workoutPrompt)
  assert.ok(workoutAnalysis.reply.includes('Sırt Antrenmanı'))
  assert.ok(workoutAnalysis.reply.includes('bekleyen plan'))

  const workoutRun = await aiClient.executeAiActions(
    'ws-route-1',
    workoutActions,
    { provider: 'gemini', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: workoutPrompt },
    routingSupabase,
  )
  assert.equal(workoutRun.status, 'applied')
  assert.equal(insertedRoutines.length, 1)
  assert.equal(insertedRoutines[0].title, 'İdeal Sırt Antrenmanı Programı (Genişlik & Kalınlık)')

  const workoutUndo = await aiClient.undoAiActionRun('ws-route-1', workoutRun.run_id, routingSupabase)
  assert.equal(workoutUndo.status, 'undone')
  assert.deepEqual(deletedRoutines, [insertedRoutines[0].id])

  // 2. Calendar date/time/title/note extraction + work_save_details + work_mutate purge undo
  const calPrompt = 'takvime bugün için test isimli bir not ekle 15.11.2026 saat 18.00 için test notu ekle'
  const calActions = aiClient.buildActionFromPrompt(calPrompt, digest)
  assert.equal(calActions.length, 1)
  assert.equal(calActions[0].module, 'calendar')
  assert.equal(calActions[0].title, 'test')
  assert.equal(calActions[0].payload.due_on, '2026-11-15')
  assert.equal(calActions[0].payload.description, 'test notu')
  assert.equal(new Date(calActions[0].payload.starts_at).getHours(), 18)

  const calRun = await aiClient.executeAiActions(
    'ws-route-1',
    calActions,
    { provider: 'gemini', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: calPrompt },
    routingSupabase,
  )
  assert.equal(calRun.status, 'applied')
  assert.equal(workSaveCalls.length, 1)
  assert.equal(workSaveCalls[0].task_payload.title, 'test')
  assert.equal(workSaveCalls[0].task_payload.due_on, '2026-11-15')
  assert.equal(workSaveCalls[0].task_payload.description, 'test notu')
  assert.equal(workSaveCalls[0].time_changes[0].title, '')

  const calUndo = await aiClient.undoAiActionRun('ws-route-1', calRun.run_id, routingSupabase)
  assert.equal(calUndo.status, 'undone')
  assert.equal(workPurgeCalls.length, 2)
  assert.ok(workPurgeCalls.every(c => c.operation === 'purge'))

  // 3. Store replaces stale pendingActions across prompts and supports clearPendingActions()
  pinia.setActivePinia(pinia.createPinia())
  const storeModule = loadTs('src/features/ai/stores/aiAssistant.ts', {
    pinia,
    vue,
    '@/stores/workspaces': { useWorkspacesStore: () => ({ activeId: 'ws-route-1' }) },
    '@/stores/ui': { useUIStore: () => ({ addToast() {} }) },
    '@/features/ai/lib/aiClient': aiClient,
  })
  const store = storeModule.useAiAssistantStore()
  await store.sendPrompt(workoutPrompt, 'chat')
  assert.equal(store.pendingActions.length, 1)
  assert.equal(store.pendingActions[0].module, 'workout')

  await store.sendPrompt(calPrompt, 'chat')
  assert.equal(store.pendingActions.length, 1)
  assert.equal(store.pendingActions[0].module, 'calendar')

  store.clearPendingActions()
  assert.equal(store.pendingActions.length, 0)
})

test('aiClient resolves update/not-found intents, multi-card flashcards, Gemini thought parts, and physical update/undo', async () => {
  const planRows = [
    {
      id: 'quick-plan-1',
      workspace_id: 'ws-mut-1',
      title: 'test notu',
      period: 'timeless',
      period_date: '1970-01-01',
      completed: false,
      notes: '',
      version: 1,
      created_at: '2026-11-15T10:00:00Z',
    },
  ]

  function createQueryBuilder(table) {
    const state = { filters: [] }
    const rows = () => (table === 'plans' ? planRows : [])
    const applyFilters = () =>
      rows().filter(row => state.filters.every(([k, v]) => String(row[k] ?? '') === String(v ?? '')))
    const builder = {
      select() {
        return builder
      },
      eq(k, v) {
        state.filters.push([k, v])
        return builder
      },
      order() {
        return builder
      },
      limit() {
        return Promise.resolve({ data: applyFilters(), error: null })
      },
      async maybeSingle() {
        const hit = applyFilters()[0] || null
        return { data: hit, error: null }
      },
      update(patch) {
        return {
          eq(k, v) {
            const target = rows().find(r => String(r[k]) === String(v))
            if (target) {
              Object.assign(target, patch)
            }
            return Promise.resolve({ data: target ? [target] : [], error: null })
          },
        }
      },
      insert(row) {
        const inserted = { id: `row-${rows().length + 1}`, ...row }
        if (table === 'plans') planRows.push(inserted)
        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: inserted, error: null })
              },
            }
          },
        }
      },
      delete() {
        return {
          eq() {
            return Promise.resolve({ data: [], error: null })
          },
        }
      },
      then(resolve, reject) {
        return Promise.resolve({ data: applyFilters(), error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  const mutationSupabase = {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'u-mut-1' } } } }
      },
    },
    from(table) {
      return createQueryBuilder(table)
    },
    async rpc(fnName) {
      if (fnName === 'ai_workspace_digest' || fnName === 'ai_execute_actions') {
        return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fnName} in the schema cache` } }
      }
      if (fnName === 'ai_settings_get') {
        return { data: { provider: 'gemini', model: 'gemini-2.5-flash', write_mode: 'ask_before_write' }, error: null }
      }
      if (fnName === 'sharing_context' || fnName === 'plan_entries_load') {
        return { data: [], error: null }
      }
      return { data: [], error: null }
    },
  }

  let activeFetch = null
  const aiClient = loadTs(
    'src/features/ai/lib/aiClient.ts',
    {
      '@/lib/supabase': { supabase: mutationSupabase },
      '@/lib/aiNoteFormat': aiNoteFormat,
      '@/lib/storage': createStorageStub(),
    },
    {
      fetch: (...args) => {
        if (typeof activeFetch === 'function') return activeFetch(...args)
        throw new Error('UNEXPECTED_FETCH')
      },
    },
  )

  // 1. Fetch digest and resolve quoted update command -> physical update + undo
  const digest = await aiClient.fetchAiWorkspaceDigest('ws-mut-1', {}, mutationSupabase)
  const updatePrompt = 'hızlı notlarda yazan "test notu" ifadesini sadece "test" olarak güncelle'
  const updateAnalysis = aiClient.synthesizeWorkspaceAnalysis(digest, updatePrompt)
  assert.equal(updateAnalysis.proposed_actions.length, 1)
  assert.equal(updateAnalysis.proposed_actions[0].operation, 'update')
  assert.equal(updateAnalysis.proposed_actions[0].target_id, 'quick-plan-1')
  assert.equal(updateAnalysis.proposed_actions[0].payload.title, 'test')

  const updateRun = await aiClient.executeAiActions(
    'ws-mut-1',
    updateAnalysis.proposed_actions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: updatePrompt },
    mutationSupabase,
  )
  assert.equal(updateRun.status, 'applied')
  assert.equal(planRows[0].title, 'test')

  const updateUndo = await aiClient.undoAiActionRun('ws-mut-1', updateRun.run_id, mutationSupabase)
  assert.equal(updateUndo.status, 'undone')
  assert.equal(planRows[0].title, 'test notu')

  // 2. Non-existent target for update command -> 0 actions, explanatory reply (no accidental quick note)
  const missingPrompt = 'hızlı notlarda yazan "olmayan kayıt" ifadesini "test" olarak güncelle'
  const missingAnalysis = aiClient.synthesizeWorkspaceAnalysis(digest, missingPrompt)
  assert.equal(missingAnalysis.proposed_actions.length, 0)
  assert.ok(missingAnalysis.reply.includes('Eşleşen Kayıt Bulunamadı'))

  // 3. Multi-card flashcards generation (10 essential EN-TR words)
  const flashPrompt =
    'bilgi kartları kısmına yeni bir koleksiyon ekle ve bilinmesi gereken ilk 10 ingilizce kelimeyi Türkçe İngilizce olarak ekle'
  const flashActions = aiClient.buildActionFromPrompt(flashPrompt, digest)
  assert.equal(flashActions.length, 1)
  assert.equal(flashActions[0].module, 'flashcards')
  assert.equal(flashActions[0].title, 'Temel İngilizce - Türkçe Kelime Kartları (İlk 10)')
  assert.ok(Array.isArray(flashActions[0].payload.cards))
  assert.equal(flashActions[0].payload.cards.length, 10)
  assert.ok(String(flashActions[0].payload.cards[0].front).startsWith('Time'))

  // 4. Gemini 2.5 response containing { thought: true } before JSON output
  await aiClient.saveAiSettings(
    { provider: 'gemini', model: 'gemini-2.5-flash', write_mode: 'ask_before_write', api_key: 'AIzaTestThoughtKey' },
    mutationSupabase,
  )
  let fetchedUrl = ''
  activeFetch = async (url) => {
    fetchedUrl = String(url)
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: 'Kullanıcının talebini analiz ediyorum...' },
                  {
                    text: JSON.stringify({
                      reply: 'Gerçek Gemini yanıtı başarıyla işlendi.',
                      insights: [],
                      recommendations: [],
                      proposed_actions: [],
                    }),
                  },
                ],
              },
            },
          ],
        }
      },
    }
  }
  const llmRes = await aiClient.invokeAiAssistant(
    { workspace_id: 'ws-mut-1', mode: 'chat', prompt: 'Çalışma alanımı kısaca özetle' },
    mutationSupabase,
  )
  assert.ok(fetchedUrl.includes('gemini-2.5-flash'))
  assert.equal(llmRes.provider, 'gemini')
  assert.equal(llmRes.reply, 'Gerçek Gemini yanıtı başarıyla işlendi.')
})

test('aiClient keeps work_tasks and linked work_blocks titles synchronized on task and calendar updates', async () => {
  const workTasksRows = [
    {
      id: 'task-sync-1',
      workspace_id: 'ws-sync-1',
      title: 'test başlığında not ekle bugün için',
      description: 'yapılacaklar açıklama',
      status: 'todo',
      priority: 'medium',
      due_on: '2026-11-15',
      version: 1,
      created_at: '2026-11-15T08:00:00Z',
    },
  ]
  const workBlockRows = [
    {
      id: 'block-sync-1',
      workspace_id: 'ws-sync-1',
      task_id: 'task-sync-1',
      title: 'test başlığında not ekle bugün için',
      starts_at: '2026-11-15T09:00:00Z',
      ends_at: '2026-11-15T10:00:00Z',
      timezone: 'Europe/Istanbul',
      version: 1,
      created_at: '2026-11-15T08:00:00Z',
    },
  ]

  function makeBuilder(table) {
    const filters = []
    const getRows = () => (table === 'work_tasks' ? workTasksRows : table === 'work_blocks' ? workBlockRows : [])
    const apply = () => getRows().filter(r => filters.every(([k, v]) => String(r[k] ?? '') === String(v ?? '')))
    const builder = {
      select() {
        return builder
      },
      eq(k, v) {
        filters.push([k, v])
        return builder
      },
      order() {
        return builder
      },
      limit() {
        return Promise.resolve({ data: apply(), error: null })
      },
      async maybeSingle() {
        return { data: apply()[0] || null, error: null }
      },
      update(patch) {
        return {
          eq(k, v) {
            const target = getRows().find(r => String(r[k]) === String(v))
            if (target) Object.assign(target, patch)
            return Promise.resolve({ data: target ? [target] : [], error: null })
          },
        }
      },
      then(resolve, reject) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  const syncSupabase = {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'u-sync-1' } } } }
      },
    },
    from(table) {
      return makeBuilder(table)
    },
    async rpc(fnName, args) {
      if (fnName === 'ai_workspace_digest' || fnName === 'ai_execute_actions') {
        return {
          data: null,
          error: { code: 'PGRST202', message: `Could not find the function public.${fnName} in the schema cache` },
        }
      }
      if (fnName === 'work_mutate' && args?.operation === 'update') {
        const list = args.entity === 'block' ? workBlockRows : workTasksRows
        const row = list.find(r => r.id === args.rid)
        if (!row || (args.expected_version != null && row.version !== args.expected_version)) {
          return { data: null, error: { message: 'WORK_CONFLICT' } }
        }
        Object.assign(row, args.payload, { version: row.version + 1 })
        return { data: row, error: null }
      }
      if (fnName === 'ai_settings_get') {
        return { data: { provider: 'local', model: 'gemini-2.5-flash', write_mode: 'ask_before_write' }, error: null }
      }
      return { data: [], error: null }
    },
  }

  const tasksLib = loadTs('src/features/tasks/lib/tasks.ts')
  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: syncSupabase },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/lib/storage': createStorageStub(),
  })

  // 1. Digest includes both work_tasks and work_blocks (calendar_blocks)
  const digest = await aiClient.fetchAiWorkspaceDigest('ws-sync-1', {}, syncSupabase)
  assert.equal(digest.tasks.calendar_blocks.length, 1)
  assert.equal(digest.tasks.calendar_blocks[0].title, 'test başlığında not ekle bugün için')

  // 2. Updating the task clears stale title on linked work_blocks
  const updatePrompt = 'görevlerdeki "test başlığında not ekle bugün için" kaydını "yapılacaklar" olarak güncelle'
  const analysis = aiClient.synthesizeWorkspaceAnalysis(digest, updatePrompt)
  assert.equal(analysis.proposed_actions.length, 1)
  const run = await aiClient.executeAiActions(
    'ws-sync-1',
    analysis.proposed_actions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: updatePrompt },
    syncSupabase,
  )
  assert.equal(run.status, 'applied')
  assert.equal(workTasksRows[0].title, 'yapılacaklar')
  assert.equal(workBlockRows[0].title, '')
  assert.equal(
    tasksLib.blockTitle({ ...workBlockRows[0], task_title: workTasksRows[0].title }),
    'yapılacaklar',
  )

  // 3. Undoing restores both work_tasks title and work_blocks title
  const undone = await aiClient.undoAiActionRun('ws-sync-1', run.run_id, syncSupabase)
  assert.equal(undone.status, 'undone')
  assert.equal(workTasksRows[0].title, 'test başlığında not ekle bugün için')
  assert.equal(workBlockRows[0].title, 'test başlığında not ekle bugün için')

  // 4. Targeting a stale calendar block title via prompt still updates parent work_tasks and clears block title
  const refreshedDigest = await aiClient.fetchAiWorkspaceDigest('ws-sync-1', {}, syncSupabase)
  workTasksRows[0].title = 'kısmi güncelleme'
  const calUpdatePrompt = 'takvimdeki "test başlığında not ekle bugün için" etkinliğini "yapılacaklar" olarak güncelle'
  const calAnalysis = aiClient.synthesizeWorkspaceAnalysis(refreshedDigest, calUpdatePrompt)
  assert.equal(calAnalysis.proposed_actions.length, 1)
  assert.equal(calAnalysis.proposed_actions[0].target_id, 'task-sync-1')
  const calRun = await aiClient.executeAiActions(
    'ws-sync-1',
    calAnalysis.proposed_actions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: calUpdatePrompt },
    syncSupabase,
  )
  assert.equal(calRun.status, 'applied')
  assert.equal(workTasksRows[0].title, 'yapılacaklar')
  assert.equal(workBlockRows[0].title, '')
})

test('aiClient covers code/learning/activities/finance/tasks generators, multiline flashcards, cross-module insights, and UI edit hooks', async () => {

  const tables = {
    learning_subjects: [
      {
        id: 'sub-existing-1',
        workspace_id: 'ws-full-1',
        title: 'Veritabanı',
        color: '#0ea5e9',
        version: 1,
        created_at: '2026-11-10T10:00:00Z',
      },
    ],
    learning_subjects_items: [],
    learning_mistakes: [
      {
        id: 'mist-1',
        workspace_id: 'ws-full-1',
        subject_id: 'sub-existing-1',
        topic_id: 'top-1',
        title: 'SQL JOIN Hatası',
        prompt: 'SQL JOIN Hatası',
        solution: '',
        resolved: false,
        version: 2,
        created_at: '2026-11-12T10:00:00Z',
      },
    ],
    finance_transactions: [
      {
        id: 'fin-1',
        workspace_id: 'ws-full-1',
        title: 'Elektrik Faturası',
        kind: 'expense',
        category: 'utilities',
        amount: 450,
        occurred_on: new Date().toISOString().slice(0, 10),
        note: '',
        version: 1,
        created_at: '2026-11-14T10:00:00Z',
      },
    ],
    activity_items: [],
    work_tasks: [],
    work_blocks: [
      {
        id: 'blk-full-1',
        workspace_id: 'ws-full-1',
        task_id: null,
        title: 'Odak Oturumu',
        starts_at: new Date(Date.now() + 3600000).toISOString(),
        ends_at: new Date(Date.now() + 7200000).toISOString(),
        deleted_at: null,
        version: 1,
      },
    ],
    work_checklists: [],
    workout_routines: [{ id: 'wk-1', workspace_id: 'ws-full-1', title: 'Üst Vücut', exercises: [], deleted_at: null, version: 1 }],
    flashcard_decks: [{ id: 'fc-1', workspace_id: 'ws-full-1', title: 'Temel Kartlar', cards: [{ front: 'Q', back: 'A' }], deleted_at: null, version: 1 }],
  }
  const workChecklistCalls = []

  const makeBuilder = table => {
    const filters = []
    let pendingInsert = null
    let pendingUpdate = null
    let pendingDelete = false
    const getRows = () => (tables[table] ||= [])
    const matchRows = () =>
      getRows().filter(r => filters.every(([k, v]) => String(r?.[k] ?? '') === String(v ?? '')))

    const builder = {
      select() {
        return builder
      },
      eq(k, v) {
        filters.push([k, v])
        return builder
      },
      is() {
        return builder
      },
      in() {
        return builder
      },
      gte() {
        return builder
      },
      order() {
        return builder
      },
      limit() {
        return builder
      },
      insert(payload) {
        pendingInsert = payload
        return builder
      },
      update(payload) {
        pendingUpdate = payload
        return builder
      },
      delete() {
        pendingDelete = true
        return builder
      },
      maybeSingle() {
        const hit = matchRows()[0] || null
        return Promise.resolve({ data: hit, error: null })
      },
      single() {
        if (pendingInsert) {
          const arr = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert]
          const row = { id: `${table}-${getRows().length + 1}`, ...arr[0] }
          getRows().push(row)
          return Promise.resolve({ data: row, error: null })
        }
        return Promise.resolve({ data: matchRows()[0] || null, error: null })
      },
      then(resolve, reject) {
        if (pendingInsert) {
          const arr = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert]
          const inserted = arr.map((item, idx) => ({ id: item.id || `${table}-${getRows().length + idx + 1}`, ...item }))
          getRows().push(...inserted)
          return Promise.resolve({ data: inserted, error: null }).then(resolve, reject)
        }
        if (pendingUpdate) {
          const hits = matchRows()
          for (const row of hits) Object.assign(row, pendingUpdate)
          return Promise.resolve({ data: hits, error: null }).then(resolve, reject)
        }
        if (pendingDelete) {
          const list = getRows()
          const remaining = list.filter(r => !filters.every(([k, v]) => String(r?.[k] ?? '') === String(v ?? '')))
          tables[table] = remaining
          return Promise.resolve({ data: [], error: null }).then(resolve, reject)
        }
        return Promise.resolve({ data: matchRows(), error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  const fullSupabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'u-full-1' } }, error: null }
      },
    },
    from(table) {
      return makeBuilder(table)
    },
    async rpc(fnName, args) {
      if (fnName === 'sharing_context') {
        return { data: [], error: null }
      }
      if (fnName === 'work_mutate' && args?.entity === 'task' && args?.operation === 'create') {
        const created = { id: args.rid || 'task-full-1', ...args.payload, version: 1 }
        tables.work_tasks.push(created)
        return { data: created, error: null }
      }
      if (fnName === 'work_mutate' && args?.entity === 'checklist' && args?.operation === 'checklist_add') {
        workChecklistCalls.push(args.payload)
        tables.work_checklists.push({ id: args.rid, ...args.payload, done: false })
        return { data: { ok: true }, error: null }
      }
      return {
        data: null,
        error: { code: 'PGRST202', message: `Could not find the function public.${fnName} in the schema cache` },
      }
    },
  }

  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: fullSupabase },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/lib/storage': createStorageStub(),
  })

  const digest = await aiClient.fetchAiWorkspaceDigest('ws-full-1', {}, fullSupabase)
  assert.ok(Array.isArray(digest.learning.subjects) && digest.learning.subjects.length === 1)
  assert.ok(Array.isArray(digest.finance.recent_items) && digest.finance.recent_items.length === 1)

  // 1. Cross-module insights cover calendar_blocks, workouts, flashcards
  const insightAnalysis = aiClient.synthesizeWorkspaceAnalysis(digest, 'Durumu özetle')
  const modulesCovered = new Set(insightAnalysis.insights.map(i => i.module))
  assert.ok(modulesCovered.has('calendar_blocks'))
  assert.ok(modulesCovered.has('workouts'))
  assert.ok(modulesCovered.has('flashcards'))

  // 2. Code snippet generation detects Python and SQL templates
  const pyCodeActions = aiClient.buildActionFromPrompt('kod kütüphanesine python debounce helper script yaz', digest)
  assert.equal(pyCodeActions[0].module, 'code')
  assert.equal(pyCodeActions[0].payload.language, 'python')
  assert.ok(pyCodeActions[0].payload.code.includes('def debounce'))

  const sqlCodeActions = aiClient.buildActionFromPrompt('kod parçacığına sql aktif kayıt sorgusu ekle', digest)
  assert.equal(sqlCodeActions[0].payload.language, 'sql')
  assert.ok(sqlCodeActions[0].payload.code.includes('SELECT'))

  // 3. Learning subject + topics creation and undo under PGRST202 fallback
  const learnSubjectActions = aiClient.buildActionFromPrompt('öğrenme takibine TypeScript çalışma konuları oluştur', digest)
  assert.equal(learnSubjectActions[0].module, 'learning')
  assert.equal(learnSubjectActions[0].operation, 'save_topic')
  assert.ok(Array.isArray(learnSubjectActions[0].payload.topics) && learnSubjectActions[0].payload.topics.length >= 2)

  const learnRun = await aiClient.executeAiActions(
    'ws-full-1',
    learnSubjectActions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: 'ts learning' },
    fullSupabase,
  )
  assert.equal(learnRun.status, 'applied')
  assert.equal(tables.learning_subjects.length, 2)
  assert.ok(tables.learning_subjects_items.length >= 2)
  assert.ok(tables.learning_subjects_items.every(item => item.parent_id && item.data?.title))
  await aiClient.undoAiActionRun('ws-full-1', learnRun.run_id, fullSupabase)
  assert.equal(tables.learning_subjects.length, 1)

  // 4. Learning mistake creation & natural-language resolution
  const mistakeActions = aiClient.buildActionFromPrompt(
    'öğrenme takipçisine hata notu ekle: Async await hata yakalama - Try/catch bloğu eklenmeli',
    digest,
  )
  assert.equal(mistakeActions[0].operation, 'mistake.create')
  const mistakeRun = await aiClient.executeAiActions(
    'ws-full-1',
    mistakeActions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: 'mistake' },
    fullSupabase,
  )
  assert.equal(mistakeRun.status, 'applied')
  assert.equal(tables.learning_mistakes.length, 2)

  const resolveAnalysis = aiClient.synthesizeWorkspaceAnalysis(
    digest,
    'öğrenme hatalarındaki "SQL JOIN Hatası" kaydını tamamlandı olarak işaretle',
  )
  assert.equal(resolveAnalysis.proposed_actions[0].target_id, 'mist-1')
  const resolveRun = await aiClient.executeAiActions(
    'ws-full-1',
    resolveAnalysis.proposed_actions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: 'resolve' },
    fullSupabase,
  )
  assert.equal(resolveRun.status, 'applied')
  assert.equal(tables.learning_mistakes[0].resolved, true)

  // 5. Activities item parsing & fallback execution
  const actActions = aiClient.buildActionFromPrompt('aktivitelere Dune filmi izlenecek olarak ekle', digest)
  assert.equal(actActions[0].module, 'activities')
  assert.equal(actActions[0].payload.type, 'movie')
  assert.equal(actActions[0].payload.status, 'want')
  const actRun = await aiClient.executeAiActions(
    'ws-full-1',
    actActions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: 'movie' },
    fullSupabase,
  )
  assert.equal(actRun.status, 'applied')
  assert.equal(tables.activity_items.length, 1)
  assert.equal(tables.activity_items[0].type, 'movie')

  // 6. Finance natural-language update & undo via table fallback
  const finUpdate = aiClient.synthesizeWorkspaceAnalysis(
    digest,
    'finanstaki "Elektrik Faturası" kaydını "Su Faturası" olarak güncelle',
  )
  assert.equal(finUpdate.proposed_actions[0].module, 'finance')
  assert.equal(finUpdate.proposed_actions[0].target_id, 'fin-1')
  const finRun = await aiClient.executeAiActions(
    'ws-full-1',
    finUpdate.proposed_actions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: 'fin update' },
    fullSupabase,
  )
  assert.equal(finRun.status, 'applied')
  assert.equal(tables.finance_transactions[0].title, 'Su Faturası')
  await aiClient.undoAiActionRun('ws-full-1', finRun.run_id, fullSupabase)
  assert.equal(tables.finance_transactions[0].title, 'Elektrik Faturası')

  // 7. Multiline tasks checklist extraction & execution
  const taskChecklistPrompt = 'Görevlere alt maddeli yeni bir görev oluştur: Sürüm Hazırlığı\n- Migrasyon kontrolü\n- Build alma'
  const taskActions = aiClient.buildActionFromPrompt(taskChecklistPrompt, digest)
  assert.equal(taskActions[0].module, 'tasks')
  assert.equal(taskActions[0].title, 'Sürüm Hazırlığı')
  assert.deepEqual(Array.from(taskActions[0].payload.checklist), ['Migrasyon kontrolü', 'Build alma'])
  const taskRun = await aiClient.executeAiActions(
    'ws-full-1',
    taskActions,
    { provider: 'local', model: 'gemini-2.5-flash', mode: 'ask_before_write', prompt_summary: 'task checklist' },
    fullSupabase,
  )
  assert.equal(taskRun.status, 'applied')
  assert.equal(workChecklistCalls.length, 2)

  // 8. Multiline note-to-flashcards deck conversion
  const cardActions = aiClient.buildActionFromPrompt(
    'Bilgi kartlarına şu nottan yeni bir deste ve kartlar oluştur:\n- Closure: İç fonksiyonun dış kapsamı hatırlaması\n- Hoisting: Değişken bildirimlerinin yukarı taşınması',
    digest,
  )
  assert.equal(cardActions[0].module, 'flashcards')
  assert.equal(cardActions[0].payload.cards.length, 2)
  assert.equal(cardActions[0].payload.cards[0].front, 'Closure')

  // 9. Source verification of UI editing hooks and inline AI transform wiring
  const previewSrc = fs.readFileSync('src/features/ai/components/AiActionPreviewCard.vue', 'utf8')
  assert.ok(previewSrc.includes('data-ai-action-edit') && previewSrc.includes('updateAction'))
  const richEditorSrc = fs.readFileSync('src/features/todos/components/RichTextEditor.vue', 'utf8')
  assert.ok(richEditorSrc.includes('to_flashcards') && richEditorSrc.includes('to_task'))
  const flashcardsSrc = fs.readFileSync('src/features/flashcards/components/Flashcards.vue', 'utf8')
  assert.ok(flashcardsSrc.includes('startEditDeck') && flashcardsSrc.includes('startEditCard'))
  const tabsSrc = fs.readFileSync('src/views/WorkspaceTabs.vue', 'utf8')
  assert.ok(tabsSrc.includes("activeTab.value === 'secure'") && tabsSrc.includes('aiStore.transformNote') && tabsSrc.includes('aiStore.error'))

  // 10. Spanish A1 curriculum prompt creates learning subject + structured A1 topics, and unsupported prompts do NOT dump generic stats
  const spanishPrompt = 'ispanyolca öğrenme adına a1 seviyesinde bir müfredat hazırla çalışma kısmına konularıyla ekle'
  const spanishAnalysis = aiClient.synthesizeWorkspaceAnalysis(digest, spanishPrompt)
  assert.equal(spanishAnalysis.proposed_actions.length, 1)
  assert.equal(spanishAnalysis.proposed_actions[0].module, 'learning')
  assert.equal(spanishAnalysis.proposed_actions[0].title, 'İspanyolca A1 Müfredatı')
  assert.ok(Array.isArray(spanishAnalysis.proposed_actions[0].payload.topics))
  assert.ok(spanishAnalysis.proposed_actions[0].payload.topics.length >= 5)
  assert.ok(spanishAnalysis.reply.includes('İspanyolca A1 Müfredatı'))

  const trashAnalysis = aiClient.synthesizeWorkspaceAnalysis(digest, 'çöp kutusunu boşalt')
  assert.equal(trashAnalysis.proposed_actions.length, 0)
  assert.ok(!trashAnalysis.reply.includes('Çalışma alanınız analiz edildi'))
  assert.ok(trashAnalysis.reply.includes('Çöp Kutusu'))

  // 11. P1: Finance position, budget limit, and recurring transaction support
  const posActions = aiClient.buildActionFromPrompt('portföye 2 adet bitcoin 60000 fiyatla ekle', digest)
  assert.equal(posActions.length, 1)
  assert.equal(posActions[0].module, 'finance')
  assert.equal(posActions[0].operation, 'save_position')
  assert.equal(posActions[0].payload.instrument, 'bitcoin')
  assert.equal(posActions[0].payload.quantity, 2)

  const budgetActions = aiClient.buildActionFromPrompt('Market kategorisi için aylık 5000 bütçe limiti ayarla', digest)
  assert.equal(budgetActions.length, 1)
  assert.equal(budgetActions[0].operation, 'set_budget')
  assert.equal(budgetActions[0].payload.amount, 5000)

  const recActions = aiClient.buildActionFromPrompt('her ay 12000 kira gideri tekrarlayan işlem ekle', digest)
  assert.equal(recActions.length, 1)
  assert.equal(recActions[0].operation, 'save_recurring')
  assert.equal(recActions[0].payload.cadence, 'monthly')

  // 12. P2: Learning topic progress completion & Task checklist item append
  const learningTopicDigest = {
    ...digest,
    learning: {
      active_topics: 1,
      unresolved_mistakes: 0,
      recent_mistakes: [],
      subjects: [
        {
          id: 'subj-es',
          title: 'İspanyolca A1',
          version: 1,
          topics: [{ id: 'topic-1', title: 'Selamlaşma ve Tanışma', status: 'todo', version: 1 }],
        },
      ],
    },
    tasks: {
      ...digest.tasks,
      high_priority: [
        { id: 'task-1', title: 'Sprint Hazırlığı', status: 'todo', priority: 'high', checklist: [], version: 1 },
      ],
    },
  }
  const topicDone = aiClient.buildActionFromPrompt('öğrenmedeki "Selamlaşma ve Tanışma" konusunu tamamlandı yap', learningTopicDigest)
  assert.equal(topicDone.length, 1)
  assert.equal(topicDone[0].module, 'learning')
  assert.equal(topicDone[0].operation, 'complete')
  assert.equal(topicDone[0].target_id, 'topic-1')
  assert.equal(topicDone[0].payload.subject_id, 'subj-es')

  const chkActions = aiClient.buildActionFromPrompt('görevlerdeki "Sprint Hazırlığı" altına "Testleri kontrol et" ekle', learningTopicDigest)
  assert.equal(chkActions.length, 1)
  assert.equal(chkActions[0].module, 'tasks')
  assert.equal(chkActions[0].target_id, 'task-1')
  assert.equal(chkActions[0].payload.checklist_append, 'Testleri kontrol et')

  // 13. P3: WorkEditor.vue inline AI transform hooks (without top-level static imports)
  const workEditorSrc = fs.readFileSync('src/features/tasks/components/WorkEditor.vue', 'utf8')
  assert.ok(workEditorSrc.includes('workspace-ai-transform') && workEditorSrc.includes('triggerDescriptionAi'))

  // 14. P4: Flashcard single-card & Workout single-exercise partial edit
  const fcWorkoutDigest = {
    ...digest,
    flashcards: { total_count: 1, items: [{ id: 'deck-1', title: 'JS Temelleri', version: 1 }] },
    workouts: { total_count: 1, items: [{ id: 'wo-1', title: 'Sırt Günü', day_of_week: 'Pazartesi', version: 1 }] },
  }
  const fcPatch = aiClient.buildActionFromPrompt('bilgi kartlarındaki "JS Temelleri" altına "Hoisting -> Bildirimlerin yukarı taşınması" ekle', fcWorkoutDigest)
  assert.equal(fcPatch.length, 1)
  assert.equal(fcPatch[0].module, 'flashcards')
  assert.equal(fcPatch[0].target_id, 'deck-1')
  assert.ok(String(fcPatch[0].payload.card_patch || '').includes('Hoisting'))

  const woPatch = aiClient.buildActionFromPrompt('antrenmandaki "Sırt Günü" altına "Barbell Row 4x10" ekle', fcWorkoutDigest)
  assert.equal(woPatch.length, 1)
  assert.equal(woPatch[0].module, 'workout')
  assert.equal(woPatch[0].target_id, 'wo-1')
  assert.ok(String(woPatch[0].payload.exercise_patch || '').includes('4x10'))

  // 15. P5: Pomodoro AI control & AnalyticsView AI insight hook
  const pomoStart = aiClient.buildActionFromPrompt('pomodoro sayacını 25 dakika başlat', digest)
  assert.equal(pomoStart.length, 1)
  assert.equal(pomoStart[0].module, 'pomodoro')
  assert.equal(pomoStart[0].payload.command, 'start')
  assert.equal(pomoStart[0].payload.minutes, 25)

  const analyticsSrc = fs.readFileSync('src/views/AnalyticsView.vue', 'utf8')
  assert.ok(analyticsSrc.includes('generateAiInsight') && analyticsSrc.includes('AI ile Yorumla'))

  // 16. P6: Compound multi-module prompt splitting ("hem ... hem ...")
  const compound = aiClient.buildActionFromPrompt('hem hızlı nota "Su iç" ekle hem de görevlere "Rapor yaz" ekle', digest)
  assert.equal(compound.length, 2)
  assert.equal(compound[0].module, 'quick_notes')
  assert.equal(compound[1].module, 'tasks')

  // 17. Yearly/Monthly/Weekly/Daily/Timeless plan sub-tab routing & periodStart alignment
  const yearlyQuoted = aiClient.buildActionFromPrompt('planlar alanındaki yıllık kısmına "selçuk" ekle', digest)
  assert.equal(yearlyQuoted.length, 1)
  assert.equal(yearlyQuoted[0].module, 'plans')
  assert.equal(yearlyQuoted[0].title, 'selçuk')
  assert.equal(yearlyQuoted[0].payload.period, 'yearly')
  assert.match(String(yearlyQuoted[0].payload.period_date || ''), /^\d{4}-01-01$/)

  const weeklyPlan = aiClient.buildActionFromPrompt('planlardaki haftalık sekmesine "sprint" ekle', digest)
  assert.equal(weeklyPlan.length, 1)
  assert.equal(weeklyPlan[0].payload.period, 'weekly')
  assert.equal(weeklyPlan[0].title, 'sprint')

  const monthlyActions = aiClient.buildActionFromPrompt('aylık plana "bütçe gözden geçir" ekle', digest)
  assert.equal(monthlyActions.length, 1)
  assert.equal(monthlyActions[0].payload.period, 'monthly')
  assert.match(String(monthlyActions[0].payload.period_date || ''), /^\d{4}-\d{2}-01$/)

  const dailyPlan = aiClient.buildActionFromPrompt('planlar günlük kısmına "koşu" ekle', digest)
  assert.equal(dailyPlan.length, 1)
  assert.equal(dailyPlan[0].payload.period, 'daily')
  assert.equal(dailyPlan[0].title, 'koşu')

  const timelessPlan = aiClient.buildActionFromPrompt('planlar alanındaki hızlı not kısmına "fikir" ekle', digest)
  assert.equal(timelessPlan.length, 1)
  assert.ok(timelessPlan[0].module === 'quick_notes' || timelessPlan[0].payload.period === 'timeless')
  assert.ok(String(timelessPlan[0].title || '').includes('fikir'))

  const assistantStoreSrc = fs.readFileSync('src/features/ai/stores/aiAssistant.ts', 'utf8')
  assert.ok(
    assistantStoreSrc.includes('refreshAffectedModuleStores') &&
      assistantStoreSrc.includes('usePlansStore') &&
      assistantStoreSrc.includes('useTasksStore') &&
      assistantStoreSrc.includes('useFinanceStore'),
  )
})

test('hierarchical / slash directory tree, scope enforcement, and WorkspaceAssistant slash picker UI work end-to-end', async () => {
  const aiClient = loadTs('src/features/ai/lib/aiClient.ts', {
    '@/lib/supabase': { supabase: {} },
    '@/lib/noteContent': noteContent,
    '@/lib/aiNoteFormat': aiNoteFormat,
  })

  // 1. Top-level outer tabs & drill-down tree
  const topLevel = aiClient.getScopeChildren([])
  assert.equal(topLevel.map(n => n.id).join(','), 'notes,planning,learning,life,finance')
  assert.equal(topLevel.map(n => n.label).join(','), 'Notlar,Takvim,Öğrenme,Yaşam,Finans')

  const notesNode = topLevel.find(n => n.id === 'notes')
  const notesChildren = aiClient.getScopeChildren([notesNode])
  assert.equal(notesChildren.map(n => n.id).join(','), 'plans,detailed,code,secure')
  const secureNode = notesChildren.find(n => n.id === 'secure')
  assert.equal(secureNode.disabled, true)

  const plansNode = notesChildren.find(n => n.id === 'plans')
  const planSubTabs = aiClient.getScopeChildren([notesNode, plansNode])
  assert.equal(planSubTabs.map(n => n.id).join(','), 'timeless,daily,weekly,monthly,yearly')

  // 2. Turkish-aware filtering
  const filteredPlanSubs = aiClient.filterScopeOptions(planSubTabs, 'yıl')
  assert.equal(filteredPlanSubs.map(n => n.id).join(','), 'yearly')
  const filteredTop = aiClient.filterScopeOptions(topLevel, 'öğren')
  assert.equal(filteredTop.map(n => n.id).join(','), 'learning')

  // 3. Scope enforcement on synthesizeWorkspaceAnalysis
  const yearlyNode = planSubTabs.find(n => n.id === 'yearly')
  const yearlyScope = aiClient.buildPromptScope([notesNode, plansNode, yearlyNode])
  assert.equal(yearlyScope.module, 'plans')
  assert.equal(yearlyScope.view, 'yearly')
  assert.equal(yearlyScope.labels.join(' > '), 'Notlar > Planlar > Yıllık')

  const digest = {
    workspace_id: 'ws-scope-1',
    generated_at: new Date().toISOString(),
    modules: {
      plans: { total_count: 0, completed_count: 0, pending_count: 0, overdue_count: 0, by_period: {}, recent: [] },
      todos: { total_count: 0, active_count: 0, recent: [] },
      tasks: { total_count: 0, completed_count: 0, pending_count: 0, overdue_count: 0, recent: [] },
      periodic_tasks: { total_count: 0, active_count: 0, recent: [] },
      learning: { total_subjects: 0, unresolved_mistakes: 0, subjects: [], recent_mistakes: [] },
      flashcards: { total_count: 0, items: [] },
      workouts: { total_count: 0, items: [] },
      activities: { total_count: 0, items: [] },
      finance: {
        transaction_count: 0,
        income_total: 0,
        expense_total: 0,
        net_balance: 0,
        position_count: 0,
        recent_transactions: [],
      },
      code: { total_count: 0, items: [] },
    },
  }

  const scopedSynthesis = aiClient.synthesizeWorkspaceAnalysis(digest, 'selçuk', yearlyScope)
  assert.equal(scopedSynthesis.proposed_actions.length, 1)
  assert.equal(scopedSynthesis.proposed_actions[0].module, 'plans')
  assert.equal(scopedSynthesis.proposed_actions[0].payload.period, 'yearly')
  assert.match(String(scopedSynthesis.proposed_actions[0].payload.period_date || ''), /^\d{4}-01-01$/)
  assert.equal(scopedSynthesis.proposed_actions[0].title, 'selçuk')

  // 4. Secure scope blocked at invokeAiAssistant boundary
  await assert.rejects(
    () =>
      aiClient.invokeAiAssistant(
        {
          workspace_id: 'ws-scope-1',
          mode: 'chat',
          prompt: 'şifreleri oku',
          scope: { path: ['notes', 'secure'], labels: ['Notlar', 'Güvenli Kasa'], module: 'secure' },
        },
        {},
      ),
    /AI_SECURE_MODULE_FORBIDDEN/,
  )

  // 5. WorkspaceAssistant.vue interactive / slash picker & drill-down with text in between
  const sendCalls = []
  const storeMock = vue.reactive({
    isOpen: true,
    activeTab: 'chat',
    busy: false,
    error: '',
    providerLabel: 'Yerel',
    hasApiKey: false,
    messages: [],
    pendingActions: [],
    actionHistory: [],
    digest: null,
    settings: { provider: 'local', model: 'local-deterministic', write_mode: 'ask_before_write' },
    open: async () => {},
    sendPrompt: async (text, mode, scope) => {
      sendCalls.push({ text, mode, scope })
    },
    applyPendingActions: async () => {},
    rejectPendingActions: () => {},
    undoActionRun: async () => {},
  })

  const { parse: parseSfc, compileScript: compileSfcScript, compileTemplate } = require('@vue/compiler-sfc')
  function compileComponent(filePath, deps) {
    const source = fs.readFileSync(filePath, 'utf8')
    const { descriptor } = parseSfc(source, { filename: filePath })
    const templateContent = descriptor.template.content
      .replace(/<Teleport[^>]*>/gi, '')
      .replace(/<\/Teleport>/gi, '')
    const script = compileSfcScript(descriptor, { id: filePath, inlineTemplate: false })
    const tpl = compileTemplate({
      source: templateContent,
      filename: filePath,
      id: filePath,
      compilerOptions: { bindingMetadata: script.bindings },
    })
    const compiledScript = ts.transpileModule(script.content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const compiledTpl = ts.transpileModule(tpl.code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const mod = { exports: {} }
    vm.runInNewContext(
      compiledScript,
      {
        exports: mod.exports,
        module: mod,
        require: name => (name in deps ? deps[name] : require(name)),
      },
      { filename: filePath },
    )
    const tplMod = { exports: {} }
    vm.runInNewContext(
      compiledTpl,
      {
        exports: tplMod.exports,
        module: tplMod,
        require: name => (name in deps ? deps[name] : require(name)),
      },
      { filename: filePath + '.tpl' },
    )
    const comp = mod.exports.default || mod.exports
    comp.render = tplMod.exports.render
    return comp
  }

  const iconStub = { render: () => vue.h('span') }
  const deps = {
    vue,
    'lucide-vue-next': { Sparkles: iconStub, X: iconStub },
    '@/features/ai/stores/aiAssistant': { useAiAssistantStore: () => storeMock },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/features/ai/lib/aiClient': aiClient,
    '@/features/ai/components/AiActionPreviewCard.vue': { default: { render: () => vue.h('div') } },
    '@/features/ai/components/AiProviderSettings.vue': { default: { render: () => vue.h('div') } },
  }
  const WorkspaceAssistantComp = compileComponent('src/features/ai/components/WorkspaceAssistant.vue', deps)

  const testDom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
  const doc = testDom.window.document
  const customRenderer = vue.createRenderer({
    patchProp(el, key, _prev, next) {
      if (key.startsWith('on')) {
        const evtName = key.slice(2).toLowerCase()
        if (_prev) el.removeEventListener(evtName, _prev)
        if (next) el.addEventListener(evtName, next)
      } else if (key === 'value') {
        el.value = next ?? ''
      } else if (key === 'disabled') {
        el.disabled = Boolean(next)
      } else if (next == null || next === false) {
        el.removeAttribute(key)
      } else if (key !== 'ref') {
        el.setAttribute(key, next === true ? '' : String(next))
      }
    },
    insert(child, parent, anchor) {
      parent.insertBefore(child, anchor || null)
    },
    remove(child) {
      child.parentNode?.removeChild(child)
    },
    createElement(tag) {
      return doc.createElement(tag)
    },
    createText(text) {
      return doc.createTextNode(text)
    },
    createComment(text) {
      return doc.createComment(text)
    },
    setText(node, text) {
      node.nodeValue = text
    },
    setElementText(el, text) {
      el.textContent = text
    },
    parentNode(node) {
      return node.parentNode
    },
    nextSibling(node) {
      return node.nextSibling
    },
    insertStaticContent(content, parent, anchor) {
      const tmp = doc.createElement('div')
      tmp.innerHTML = content
      const first = tmp.firstChild
      const last = tmp.lastChild
      while (tmp.firstChild) parent.insertBefore(tmp.firstChild, anchor || null)
      return [first, last]
    },
  })

  const WorkspaceAssistantMountedComp = compileComponent('src/features/ai/components/WorkspaceAssistant.vue', deps)

  const prevDocument = global.Document
  global.Document = testDom.window.Document
  const app = customRenderer.createApp(WorkspaceAssistantMountedComp)
  try {
    app.mount(doc.getElementById('app'))
    await vue.nextTick()

    const input = doc.querySelector('[data-assistant-prompt-input]')
    assert.ok(input, 'prompt input must exist')

    // Step A: type '/' -> top-level menu opens
    input.value = '/'
    input.dispatchEvent(new testDom.window.Event('input'))
    await vue.nextTick()
    let menu = doc.querySelector('[data-slash-scope-menu]')
    assert.ok(menu, 'slash scope menu should open on "/"')
    assert.ok(menu.querySelector('[data-slash-option="notes"]'))
    assert.ok(menu.querySelector('[data-slash-option="planning"]'))
    assert.ok(menu.querySelector('[data-slash-option="learning"]'))

    // Select Notlar
    menu.querySelector('[data-slash-option="notes"]').dispatchEvent(new testDom.window.MouseEvent('mousedown', { bubbles: true }))
    await vue.nextTick()
    assert.equal(input.value, '')
    assert.ok(doc.querySelector('[data-selected-scope-chips]').textContent.includes('Notlar'))

    // Step B: type free text then '/' -> offers Notlar children (Planlar, Detaylı Notlar, Güvenli Kasa disabled)
    input.value = 'proje hakkında /'
    input.dispatchEvent(new testDom.window.Event('input'))
    await vue.nextTick()
    menu = doc.querySelector('[data-slash-scope-menu]')
    assert.ok(menu, 'drill-down menu should open even with text before "/"')
    assert.ok(menu.querySelector('[data-slash-option="plans"]'))
    assert.equal(menu.querySelector('[data-slash-option="secure"]').disabled, true)

    // Select Planlar
    menu.querySelector('[data-slash-option="plans"]').dispatchEvent(new testDom.window.MouseEvent('mousedown', { bubbles: true }))
    await vue.nextTick()
    assert.equal(input.value, 'proje hakkında ')

    // Step C: type '/yıl' -> filters Planlar sub-tabs to Yıllık
    input.value = 'proje hakkında /yıl'
    input.dispatchEvent(new testDom.window.Event('input'))
    await vue.nextTick()
    menu = doc.querySelector('[data-slash-scope-menu]')
    assert.ok(menu)
    const yearlyBtn = menu.querySelector('[data-slash-option="yearly"]')
    assert.ok(yearlyBtn)
    assert.equal(menu.querySelector('[data-slash-option="daily"]'), null)

    // Select Yıllık
    yearlyBtn.dispatchEvent(new testDom.window.MouseEvent('mousedown', { bubbles: true }))
    await vue.nextTick()
    const chipText = doc.querySelector('[data-selected-scope-chips]').textContent
    assert.ok(chipText.includes('Notlar') && chipText.includes('Planlar') && chipText.includes('Yıllık'))

    // Submit form
    input.value = 'selçuk'
    input.dispatchEvent(new testDom.window.Event('input'))
    await vue.nextTick()
    doc.querySelector('form').dispatchEvent(new testDom.window.Event('submit', { cancelable: true }))
    await vue.nextTick()

    assert.equal(sendCalls.length, 1)
    assert.equal(sendCalls[0].text, 'selçuk')
    assert.equal(sendCalls[0].scope.module, 'plans')
    assert.equal(sendCalls[0].scope.view, 'yearly')
    assert.equal(sendCalls[0].scope.labels.join(' > '), 'Notlar > Planlar > Yıllık')
    assert.equal(doc.querySelector('[data-selected-scope-chips]'), null)

    app.unmount()
  } finally {
    global.Document = prevDocument
  }
})

test('semantic reasoning, local disambiguation, multi-turn history, and interactive clarification UI work end-to-end', async () => {
  const storageStub = createStorageStub()
  let capturedLlmBodies = []
  const mockFetch = async (_url, opts) => {
    const body = JSON.parse(opts.body)
    capturedLlmBodies.push(body)
    const userPayloadText = body?.contents?.[0]?.parts?.[0]?.text || '{}'
    const payloadObj = JSON.parse(userPayloadText)
    const historyLen = Array.isArray(payloadObj.conversation_history) ? payloadObj.conversation_history.length : 0

    if (historyLen === 0) {
      return {
        ok: true,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        reply: 'Yarın 14:00 için dişçi randevunuzu nereye kaydetmemi istersiniz?',
                        insights: [],
                        recommendations: [],
                        proposed_actions: [],
                        clarification: {
                          question: 'Yarın 14:00 için dişçi randevunuzu nereye kaydetmemi istersiniz?',
                          options: [
                            {
                              id: 'opt-cal',
                              label: 'Takvime Zaman Bloğu Ekle',
                              description: '14:00–15:00 arası takvim bloğu',
                              action: {
                                module: 'calendar',
                                operation: 'upsert_task',
                                write_mode: 'append',
                                title: 'Dişçi randevusu',
                                summary: 'Takvime ekle: Dişçi randevusu',
                                payload: {
                                  title: 'Dişçi randevusu',
                                  due_on: '2026-11-17',
                                  starts_at: '2026-11-17T14:00:00+03:00',
                                  ends_at: '2026-11-17T15:00:00+03:00',
                                  estimate_minutes: 60,
                                },
                              },
                            },
                            {
                              id: 'opt-plan',
                              label: 'Günlük Plana Ekle',
                              description: 'Planlar › Günlük sekmesi',
                              action: {
                                module: 'plans',
                                operation: 'save_plan',
                                write_mode: 'append',
                                title: 'Dişçi randevusu',
                                summary: 'Günlük plana ekle: Dişçi randevusu',
                                payload: { title: 'Dişçi randevusu', period: 'daily', notes: '14:00' },
                              },
                            },
                          ],
                        },
                      }),
                    },
                  ],
                },
              },
            ],
          }
        },
      }
    }

    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: 'Takvime eklendi.',
                      insights: [],
                      recommendations: [],
                      proposed_actions: [
                        {
                          module: 'calendar',
                          operation: 'upsert_task',
                          write_mode: 'append',
                          title: 'Dişçi randevusu',
                          summary: 'Takvime ekle: Dişçi randevusu',
                          payload: {
                            title: 'Dişçi randevusu',
                            due_on: '2026-11-17',
                            starts_at: '2026-11-17T14:00:00+03:00',
                            ends_at: '2026-11-17T15:00:00+03:00',
                            estimate_minutes: 60,
                          },
                        },
                      ],
                      clarification: null,
                    }),
                  },
                ],
              },
            },
          ],
        }
      },
    }
  }

  const aiClient = loadTs(
    'src/features/ai/lib/aiClient.ts',
    {
      '@/lib/supabase': { supabase: {} },
      '@/lib/noteContent': noteContent,
      '@/lib/aiNoteFormat': aiNoteFormat,
    },
    { localStorage: storageStub, fetch: mockFetch },
  )

  const emptyDigest = {
    workspace_id: 'ws-sem-1',
    generated_at: new Date().toISOString(),
    modules: {
      plans: { total_count: 0, completed_count: 0, pending_count: 0, overdue_count: 0, by_period: {}, recent: [] },
      todos: { total_count: 0, active_count: 0, recent: [] },
      tasks: { total_count: 0, completed_count: 0, pending_count: 0, overdue_count: 0, recent: [] },
      periodic_tasks: { total_count: 0, active_count: 0, recent: [] },
      learning: { total_subjects: 0, unresolved_mistakes: 0, subjects: [], recent_mistakes: [] },
      flashcards: { total_count: 0, items: [] },
      workouts: { total_count: 0, items: [] },
      activities: { total_count: 0, items: [] },
      finance: { transaction_count: 0, income_total: 0, expense_total: 0, net_balance: 0, position_count: 0, recent_transactions: [] },
      code: { total_count: 0, items: [] },
    },
  }

  // 1. Local mode disambiguation without explicit keywords
  const scheduleSyn = aiClient.synthesizeWorkspaceAnalysis(emptyDigest, 'yarın 14:00 dişçi randevusu')
  assert.equal(scheduleSyn.proposed_actions.length, 0)
  assert.ok(scheduleSyn.clarification && scheduleSyn.clarification.options.length >= 2)
  assert.ok(scheduleSyn.clarification.options.some(o => o.action.module === 'calendar'))
  assert.ok(scheduleSyn.clarification.options.some(o => o.action.module === 'tasks'))

  const budgetSyn = aiClient.synthesizeWorkspaceAnalysis(emptyDigest, 'aylık 5000 TL market sınırı')
  assert.ok(budgetSyn.clarification && budgetSyn.clarification.options.some(o => o.action.module === 'finance'))

  const learnSyn = aiClient.synthesizeWorkspaceAnalysis(emptyDigest, 'react hooks çalış')
  assert.ok(learnSyn.clarification && learnSyn.clarification.options.some(o => o.action.module === 'learning'))

  // Greeting & natural conversation should never trigger clarification buttons
  const greetSyn = aiClient.synthesizeWorkspaceAnalysis(emptyDigest, 'merhaba')
  assert.equal(greetSyn.clarification, null)
  assert.equal(greetSyn.proposed_actions.length, 0)

  const greetMultiSyn = aiClient.synthesizeWorkspaceAnalysis(emptyDigest, 'selam nasılsın')
  assert.equal(greetMultiSyn.clarification, null)
  assert.equal(greetMultiSyn.proposed_actions.length, 0)
  assert.ok(greetMultiSyn.reply.includes('Selam'))

  const cancelAndAskSyn = aiClient.synthesizeWorkspaceAnalysis(
    emptyDigest,
    'hiçbirine ekleme tkavime neler ekleyebiliriz?',
  )
  assert.equal(cancelAndAskSyn.clarification, null)
  assert.equal(cancelAndAskSyn.proposed_actions.length, 0)
  assert.ok(cancelAndAskSyn.reply.includes('hiçbir yere eklemedim'))
  assert.ok(cancelAndAskSyn.reply.includes('Takvim'))

  // 2. LLM-first semantic clarification + multi-turn history preservation
  await aiClient.saveAiSettings(
    { provider: 'gemini', model: 'gemini-2.5-flash', write_mode: 'ask_before_write', api_key: 'test-key-123456' },
    { rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) },
  )
  const fallbackClient = {
    auth: { async getUser() { return { data: { user: { id: 'u1' } }, error: null } } },
    async rpc() { return { data: null, error: { code: 'PGRST202' } } },
    from() {
      const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, then: r => r({ data: [], error: null }) }
      return b
    },
  }
  const turn1 = await aiClient.invokeAiAssistant(
    { workspace_id: 'ws-sem-1', mode: 'chat', prompt: 'yarın 14:00 dişçi randevusu', history: [] },
    fallbackClient,
  )
  assert.equal(turn1.proposed_actions.length, 0)
  assert.ok(turn1.clarification && turn1.clarification.options.length === 2)
  assert.equal(turn1.clarification.options[0].action.module, 'calendar')

  const turn2 = await aiClient.invokeAiAssistant(
    {
      workspace_id: 'ws-sem-1',
      mode: 'chat',
      prompt: '1. seçenek olsun',
      history: [
        { role: 'user', content: 'yarın 14:00 dişçi randevusu' },
        { role: 'assistant', content: turn1.reply, clarificationQuestion: turn1.clarification.question },
      ],
    },
    fallbackClient,
  )
  assert.equal(turn2.proposed_actions.length, 1)
  assert.equal(turn2.proposed_actions[0].module, 'calendar')
  assert.equal(turn2.clarification, null)
  assert.equal(capturedLlmBodies.length, 2)

  // 3. WorkspaceAssistant.vue renders clarification options & triggers selectClarificationOption
  const selectedCalls = []
  const storeMock = vue.reactive({
    isOpen: true,
    activeTab: 'chat',
    busy: false,
    error: '',
    providerLabel: 'Gemini',
    hasApiKey: true,
    messages: [
      {
        id: 'assistant-clar-1',
        role: 'assistant',
        content: turn1.reply,
        createdAt: new Date().toISOString(),
        clarification: turn1.clarification,
      },
    ],
    pendingActions: [],
    actionHistory: [],
    digest: null,
    settings: { provider: 'gemini', model: 'gemini-2.5-flash', write_mode: 'ask_before_write' },
    open: async () => {},
    sendPrompt: async () => {},
    selectClarificationOption: async (msgId, optId) => {
      selectedCalls.push({ msgId, optId })
    },
    approvePendingAction: async () => {},
    approveAllPendingActions: async () => {},
    rejectPendingAction: () => {},
    undoActionRun: async () => {},
  })

  const { parse: parseSfc, compileScript: compileSfcScript, compileTemplate } = require('@vue/compiler-sfc')
  const source = fs.readFileSync('src/features/ai/components/WorkspaceAssistant.vue', 'utf8')
  const { descriptor } = parseSfc(source, { filename: 'src/features/ai/components/WorkspaceAssistant.vue' })
  const templateContent = descriptor.template.content
    .replace(/<Teleport[^>]*>/gi, '')
    .replace(/<\/Teleport>/gi, '')
  const script = compileSfcScript(descriptor, { id: 'ws-clar-test', inlineTemplate: false })
  const tpl = compileTemplate({
    source: templateContent,
    filename: 'src/features/ai/components/WorkspaceAssistant.vue',
    id: 'ws-clar-test',
    compilerOptions: { bindingMetadata: script.bindings },
  })
  const iconStub = { render: () => vue.h('span') }
  const deps = {
    vue,
    'lucide-vue-next': { Sparkles: iconStub, X: iconStub },
    '@/features/ai/stores/aiAssistant': { useAiAssistantStore: () => storeMock },
    '@/lib/aiNoteFormat': aiNoteFormat,
    '@/features/ai/lib/aiClient': aiClient,
    '@/features/ai/components/AiActionPreviewCard.vue': { default: { render: () => vue.h('div') } },
    '@/features/ai/components/AiProviderSettings.vue': { default: { render: () => vue.h('div') } },
  }
  const mod = { exports: {} }
  vm.runInNewContext(
    ts.transpileModule(script.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports: mod.exports, module: mod, require: name => (name in deps ? deps[name] : require(name)) },
  )
  const tplMod = { exports: {} }
  vm.runInNewContext(
    ts.transpileModule(tpl.code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports: tplMod.exports, module: tplMod, require: name => (name in deps ? deps[name] : require(name)) },
  )
  const Comp = mod.exports.default || mod.exports
  Comp.render = tplMod.exports.render

  const testDom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
  const doc = testDom.window.document
  const customRenderer = vue.createRenderer({
    patchProp(el, key, _prev, next) {
      if (key.startsWith('on')) {
        const evtName = key.slice(2).toLowerCase()
        if (_prev) el.removeEventListener(evtName, _prev)
        if (next) el.addEventListener(evtName, next)
      } else if (key === 'disabled') el.disabled = Boolean(next)
      else if (next == null || next === false) el.removeAttribute(key)
      else if (key !== 'ref') el.setAttribute(key, next === true ? '' : String(next))
    },
    insert: (c, p, a) => p.insertBefore(c, a || null),
    remove: c => c.parentNode?.removeChild(c),
    createElement: tag => doc.createElement(tag),
    createText: text => doc.createTextNode(text),
    createComment: text => doc.createComment(text),
    setText: (n, t) => { n.nodeValue = t },
    setElementText: (el, t) => { el.textContent = t },
    parentNode: n => n.parentNode,
    nextSibling: n => n.nextSibling,
    insertStaticContent(content, parent, anchor) {
      const tmp = doc.createElement('div')
      tmp.innerHTML = content
      const first = tmp.firstChild
      const last = tmp.lastChild
      while (tmp.firstChild) parent.insertBefore(tmp.firstChild, anchor || null)
      return [first, last]
    },
  })

  const prevDocument = global.Document
  global.Document = testDom.window.Document
  const app = customRenderer.createApp(Comp)
  try {
    app.mount(doc.getElementById('app'))
    await vue.nextTick()
    const clarBox = doc.querySelector('[data-clarification-options]')
    assert.ok(clarBox, 'clarification options container should render')
    const calOpt = clarBox.querySelector('[data-clarification-option="opt-cal"]')
    assert.ok(calOpt)
    calOpt.click()
    await vue.nextTick()
    assert.equal(selectedCalls.length, 1)
    assert.equal(selectedCalls[0].msgId, 'assistant-clar-1')
    assert.equal(selectedCalls[0].optId, 'opt-cal')
    app.unmount()
  } finally {
    global.Document = prevDocument
  }
})
