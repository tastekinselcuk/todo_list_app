const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function loadHandler() {
  const source = fs.readFileSync('supabase/functions/ai-assistant/handler.ts', 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const exports = {}
  vm.runInNewContext(transpiled, {
    exports,
    require,
    Response,
    Request,
    Headers,
    AbortSignal,
    URL,
    console,
  })
  return exports
}

const { aiAssistantHandler } = loadHandler()
const wid = '10000000-0000-0000-0000-000000000001'

test('aiAssistantHandler enforces auth, rate limits, secure module boundaries and supports Gemini/OpenAI/Anthropic + local synthesis', async () => {
  const fetchCalls = []
  const executedBatches = []
  let allowBudget = true
  let creds = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    write_mode: 'ask_before_write',
    api_key: 'AIzaSyTestKey12345',
    api_keys: {
      gemini: 'AIzaSyTestKey12345',
      openai: 'sk-test-openai-key',
      anthropic: 'sk-ant-test-key',
    },
  }

  const handler = aiAssistantHandler({
    async authenticate(token) {
      return token === 'valid-jwt' ? 'user-1' : null
    },
    async consumeBudget() {
      return allowBudget
    },
    async resolveCredentials() {
      return creds
    },
    async loadWorkspaceDigest() {
      return {
        workspace: { id: wid, name: 'Kişisel' },
        recommendations_signals: {
          overdue_tasks_count: 2,
          high_priority_open_tasks_count: 1,
          carried_plans_count: 1,
          pending_periodic_today_count: 3,
          open_mistakes_count: 2,
          due_reviews_count: 1,
          empty_notes_count: 1,
        },
      }
    },
    async readRecords(_token, _wid, targets) {
      return { items: targets.map(t => ({ ...t, title: 'Sample Note' })) }
    },
    async executeActions(_token, _wid, actions, meta) {
      const run = { run_id: '90000000-0000-0000-0000-000000000099', status: 'applied', applied_count: actions.length, meta }
      executedBatches.push({ actions, meta })
      return run
    },
    async fetch(url, init) {
      fetchCalls.push({ url: String(url), init })
      const u = String(url)
      if (u.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        reply: 'Gemini çalışma alanı analizi tamamlandı.',
                        insights: [{ title: 'Gecikmiş Görevler', summary: '2 gecikmiş görev var.', severity: 'warning', module: 'tasks' }],
                        recommendations: [],
                        proposed_actions: [
                          {
                            module: 'plans',
                            operation: 'create',
                            write_mode: 'replace',
                            summary: 'Odak planı ekle',
                            payload: { title: 'Gecikmiş görevleri erit', period: 'daily', notes: '- İlk 2 görevi bitir' },
                          },
                        ],
                        transformed_note: null,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      }
      if (u.includes('api.openai.com')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: 'OpenAI analizi hazır.',
                    insights: [],
                    recommendations: [],
                    proposed_actions: [],
                    transformed_note: null,
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
      }
      if (u.includes('api.anthropic.com')) {
        return new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  reply: 'Anthropic Claude önerileri hazır.',
                  insights: [],
                  recommendations: [],
                  proposed_actions: [],
                  transformed_note: null,
                }),
              },
            ],
          }),
          { status: 200 }
        )
      }
      return new Response('{}', { status: 500 })
    },
  })

  // 1. Rejects unauthenticated requests
  const unauthRes = await handler(
    new Request('https://edge.local/ai-assistant', { method: 'POST', body: '{}' })
  )
  assert.equal(unauthRes.status, 401)

  // 2. Rejects secure module context
  const secureRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        mode: 'chat',
        prompt: 'Kasamdaki şifreleri oku',
        context: { active_module: 'secure' },
      }),
    })
  )
  assert.equal(secureRes.status, 403)

  // 3. Gemini call (ask_before_write mode -> returns proposed_actions without auto-executing)
  const geminiRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        mode: 'analyze',
        prompt: 'Çalışma alanımı analiz et ve plan öner',
      }),
    })
  )
  assert.equal(geminiRes.status, 200)
  const geminiBody = await geminiRes.json()
  assert.equal(geminiBody.provider, 'gemini')
  assert.equal(geminiBody.reply, 'Gemini çalışma alanı analizi tamamlandı.')
  assert.equal(geminiBody.proposed_actions.length, 1)
  assert.equal(geminiBody.applied_run, null)
  assert.equal(executedBatches.length, 0)
  // Verify Gemini API key was sent in header, never in URL
  assert.ok(!fetchCalls[0].url.includes('AIzaSyTestKey12345'))
  assert.equal(fetchCalls[0].init.headers['x-goog-api-key'], 'AIzaSyTestKey12345')

  // 4. OpenAI call & Anthropic call
  const openaiRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        mode: 'chat',
        prompt: 'Özetle',
      }),
    })
  )
  assert.equal((await openaiRes.json()).provider, 'openai')

  const anthropicRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        mode: 'chat',
        prompt: 'Özetle',
      }),
    })
  )
  assert.equal((await anthropicRes.json()).provider, 'anthropic')

  // 5. Auto-apply mode executes proposed actions immediately when auto_execute = true
  creds.write_mode = 'auto_apply'
  const autoRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        mode: 'plan_actions',
        prompt: 'Planımı oluştur',
        auto_execute: true,
      }),
    })
  )
  const autoBody = await autoRes.json()
  assert.equal(autoBody.write_mode, 'auto_apply')
  assert.equal(autoBody.applied_run.status, 'applied')
  assert.equal(executedBatches.length, 1)

  // 6. Keyless local fallback synthesis + transform_note
  creds = { provider: 'gemini', model: 'gemini-2.5-flash', write_mode: 'ask_before_write', api_key: null, api_keys: {} }
  const transformRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        mode: 'transform_note',
        prompt: 'Eylem maddelerine dönüştür',
        context: {
          transform_action: 'action_items',
          selected_record: {
            module: 'detailed',
            id: '30000000-0000-0000-0000-000000000002',
            title: 'Sprint Toplantısı',
            content: 'Veritabanı migrasyonu yazılacak\nTestler çalıştırılacak',
          },
        },
      }),
    })
  )
  const transformBody = await transformRes.json()
  assert.equal(transformBody.provider, 'local')
  assert.match(transformBody.transformed_note.markdown, /- \[ \] Veritabanı migrasyonu yazılacak/)

  // 7. Rate limit enforcement
  allowBudget = false
  const rateRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wid, mode: 'chat', prompt: 'Merhaba' }),
    })
  )
  assert.equal(rateRes.status, 429)
})
