const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const path = require('node:path')

function loadHandler() {
  const baseDir = path.resolve('supabase/functions/ai-assistant')
  const cache = new Map()
  function loadTsModule(filePath) {
    const abs = path.resolve(filePath)
    if (cache.has(abs)) return cache.get(abs).exports
    const source = fs.readFileSync(abs, 'utf8')
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const mod = { exports: {} }
    cache.set(abs, mod)
    vm.runInNewContext(
      transpiled,
      {
        exports: mod.exports,
        module: mod,
        require: id => {
          if (id.startsWith('./') || id.startsWith('../')) {
            const target = path.resolve(path.dirname(abs), id)
            return loadTsModule(target.endsWith('.ts') ? target : `${target}.ts`)
          }
          return require(id)
        },
        Response,
        Request,
        Headers,
        AbortSignal,
        URL,
        Intl,
        console,
      },
      { filename: abs },
    )
    return mod.exports
  }
  return loadTsModule(path.join(baseDir, 'handler.ts'))
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

test('agent loop executes multi-step tool calls across Gemini/OpenAI/Anthropic, enforces risk policy, and surfaces provider errors', async () => {
  const searchCalls = []
  const metricCalls = []
  const readCalls = []
  const executed = []
  let providerMode = 'gemini-tools'

  const handler = aiAssistantHandler({
    async authenticate(token) {
      return token === 'valid-jwt' ? 'user-1' : null
    },
    async consumeBudget() {
      return true
    },
    async resolveCredentials() {
      return {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        write_mode: 'auto_apply',
        api_key: 'gem-secret',
        api_keys: { gemini: 'gem-secret', openai: 'oai-secret', anthropic: 'ant-secret' },
      }
    },
    async loadWorkspaceDigest() {
      return { workspace: { id: wid, active_modules: ['plans', 'tasks', 'finance'] }, recommendations_signals: {} }
    },
    async searchWorkspace(_t, _w, query, onlyModule) {
      searchCalls.push({ query, onlyModule })
      return { groups: [{ module: 'plans', items: [{ record_id: '20000000-0000-0000-0000-000000000001', title: 'Sprint' }] }] }
    },
    async readRecords(_t, _w, targets) {
      readCalls.push(targets)
      return { items: [{ id: targets[0].id, module: targets[0].module, title: 'Sprint', version: 3 }] }
    },
    async queryMetrics(_t, _w, metric, params) {
      metricCalls.push({ metric, params })
      return { metric, this_month_expense: 4200, last_month_expense: 3100 }
    },
    async executeActions(_t, _w, actions) {
      executed.push(actions)
      return { run_id: 'run-1', status: 'applied', applied_count: actions.length }
    },
    now: () => new Date('2026-11-18T21:30:00.000Z'),
    async fetch(url, init) {
      const u = String(url)
      const body = JSON.parse(String(init.body || '{}'))

      if (providerMode === 'weather-tool' && u.includes('generativelanguage')) {
        const hasToolResp = Array.isArray(body.contents) && body.contents.some(c => c.parts?.some(p => p.functionResponse))
        if (!hasToolResp) {
          return new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ functionCall: { name: 'get_weather_forecast', args: { location: 'Beykoz', date: '2026-11-19' } } }] } }],
            }),
            { status: 200 },
          )
        }
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Beykoz için yarın 07:00–09:00 arası 11°C ve parçalı bulutlu.' }) }] } }],
          }),
          { status: 200 },
        )
      }
      if (u.includes('geocoding-api.open-meteo.com')) {
        return new Response(JSON.stringify({ results: [{ name: 'Beykoz', admin1: 'İstanbul', country: 'Türkiye', latitude: 41.13, longitude: 29.09 }] }), { status: 200 })
      }
      if (u.includes('api.open-meteo.com')) {
        return new Response(
          JSON.stringify({
            hourly: {
              time: ['2026-11-19T07:00', '2026-11-19T08:00', '2026-11-19T09:00'],
              temperature_2m: [10.5, 11.2, 12.0],
              precipitation_probability: [10, 15, 10],
              weather_code: [2, 2, 1],
              wind_speed_10m: [12, 14, 15],
            },
          }),
          { status: 200 },
        )
      }
      if (providerMode === 'auth-401') {
        return new Response('{}', { status: 401 })
      }
      if (providerMode === 'rate-429') {
        return new Response('{}', { status: 429 })
      }
      if (providerMode === 'secure-tool' && u.includes('generativelanguage')) {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ functionCall: { name: 'search_workspace_records', args: { query: 'pin', module: 'secure' } } }] } }],
          }),
          { status: 200 },
        )
      }

      if (u.includes('generativelanguage')) {
        // Verify Gemini strict OpenAPI schema compliance: no empty properties: {} on OBJECT parameters
        const decls = body?.tools?.[0]?.functionDeclarations || []
        for (const decl of decls) {
          if (decl.parameters) {
            assert.ok(
              decl.parameters.properties && Object.keys(decl.parameters.properties).length > 0,
              `Gemini tool ${decl.name} must not have empty properties: {}`,
            )
          }
        }
        const hasToolResp = Array.isArray(body.contents) && body.contents.some(c => c.parts?.some(p => p.functionResponse))
        if (!hasToolResp) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      { thought: true, text: 'internal reasoning' },
                      {
                        functionCall: { name: 'search_workspace_records', args: { query: 'Sprint', module: 'plans' } },
                        thoughtSignature: 'sig-123',
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        reply: 'Sprint planı bulundu; finans/silme yüksek riskli olduğu için onayınıza sunuldu.',
                        proposed_actions: [
                          {
                            module: 'finance',
                            operation: 'create',
                            summary: '4200 TL gider ekle',
                            payload: { title: 'Market', kind: 'expense', amount: 4200 },
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        )
      }

      if (u.includes('api.openai.com')) {
        const hasToolMsg = Array.isArray(body.messages) && body.messages.some(m => m.role === 'tool')
        if (!hasToolMsg) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        id: 'tc-1',
                        type: 'function',
                        function: { name: 'query_workspace_metrics', arguments: JSON.stringify({ metric: 'finance_monthly_comparison', days: 30 }) },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: 'Bu ay harcamanız geçen aya göre 1100 TL arttı.',
                    proposed_actions: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      }

      if (u.includes('api.anthropic.com')) {
        const hasToolResult =
          Array.isArray(body.messages) &&
          body.messages.some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'tool_result'))
        if (!hasToolResult) {
          return new Response(
            JSON.stringify({
              content: [
                {
                  type: 'tool_use',
                  id: 'tu-1',
                  name: 'read_workspace_records',
                  input: { targets: [{ module: 'plans', id: '20000000-0000-0000-0000-000000000001' }] },
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  reply: 'Kayıt sürüm 3 olarak okundu.',
                  proposed_actions: [],
                }),
              },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('{}', { status: 500 })
    },
  })

  // 1. Gemini tool call + authoritative Europe/Istanbul timezone + high-risk finance confirmation gate
  const gemRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        mode: 'chat',
        prompt: 'Dün konuştuğumuz Sprint planını bul',
        timezone: 'Europe/Istanbul',
        auto_execute: true,
        history: [{ role: 'user', content: 'Önceki mesaj' }],
      }),
    }),
  )
  assert.equal(gemRes.status, 200)
  const gemBody = await gemRes.json()
  assert.equal(gemBody.time.timezone, 'Europe/Istanbul')
  assert.equal(gemBody.time.local_date, '2026-11-19')
  assert.equal(gemBody.time.tomorrow_date, '2026-11-20')
  assert.equal(searchCalls.length, 1)
  assert.equal(searchCalls[0].query, 'Sprint')
  assert.equal(gemBody.tool_trace[0].tool, 'search_workspace_records')
  // High-risk finance action must require confirmation even with auto_apply + auto_execute
  assert.equal(gemBody.proposed_actions[0].risk_level, 'high')
  assert.equal(gemBody.proposed_actions[0].requires_confirmation, true)
  assert.equal(gemBody.applied_run, null)
  assert.equal(executed.length, 0)

  // 2. OpenAI tool call (query_workspace_metrics)
  const oaiRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        mode: 'chat',
        prompt: 'Bu ay geçen aya göre hangi giderim arttı?',
      }),
    }),
  )
  assert.equal(oaiRes.status, 200)
  const oaiBody = await oaiRes.json()
  assert.equal(metricCalls.length, 1)
  assert.equal(metricCalls[0].metric, 'finance_monthly_comparison')
  assert.match(oaiBody.reply, /1100 TL/)

  // 3. Anthropic tool call (read_workspace_records)
  const antRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: wid,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        mode: 'chat',
        prompt: 'Sprint kaydını oku',
      }),
    }),
  )
  assert.equal(antRes.status, 200)
  assert.equal(readCalls.length, 1)

  // 4. Secure tool call blocked (403)
  providerMode = 'secure-tool'
  const secRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wid, mode: 'chat', prompt: 'notları ara' }),
    }),
  )
  assert.equal(secRes.status, 403)

  // 5. Transparent provider errors (401 / 429) — no fake local success
  providerMode = 'auth-401'
  const authErrRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wid, mode: 'chat', prompt: 'Selam' }),
    }),
  )
  assert.equal(authErrRes.status, 401)
  assert.equal((await authErrRes.json()).error, 'PROVIDER_AUTH')

  providerMode = 'rate-429'
  const rateErrRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wid, mode: 'chat', prompt: 'Selam' }),
    }),
  )
  // 6. Live weather tool call (Open-Meteo Beykoz hourly forecast)
  providerMode = 'weather-tool'
  const wxRes = await handler(
    new Request('https://edge.local/ai-assistant', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: wid, mode: 'chat', prompt: 'yarın sabah beykoz hava durumu nasıl', timezone: 'Europe/Istanbul' }),
    }),
  )
  assert.equal(wxRes.status, 200)
  const wxBody = await wxRes.json()
  assert.equal(wxBody.tool_trace[0].tool, 'get_weather_forecast')
  assert.equal(wxBody.tool_trace[0].ok, true)
  assert.match(wxBody.reply, /Beykoz/)
})
