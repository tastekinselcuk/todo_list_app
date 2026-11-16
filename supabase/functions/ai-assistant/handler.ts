export type AiProviderId = 'gemini' | 'openai' | 'anthropic'
export type AiWriteMode = 'ask_before_write' | 'auto_apply'
export type AiNoteWriteMode = 'replace' | 'append' | 'prepend' | 'insert_section'
export type AiRequestMode = 'chat' | 'analyze' | 'recommend' | 'transform_note' | 'plan_actions'

export interface ProposedAiAction {
  module:
    | 'detailed'
    | 'plans'
    | 'quick'
    | 'tasks'
    | 'calendar'
    | 'periodic'
    | 'code'
    | 'learning'
    | 'flashcards'
    | 'workout'
    | 'activities'
    | 'finance'
  entity?: string
  operation: string
  target_id?: string
  write_mode?: AiNoteWriteMode
  section_heading?: string
  expected_version?: number
  summary?: string
  payload: Record<string, unknown>
}

export interface AiInsightItem {
  title: string
  summary: string
  severity: 'info' | 'warning' | 'positive'
  module?: string
}

export interface AiRecommendationItem {
  id: string
  title: string
  reason: string
  module: string
  action?: ProposedAiAction
}

export interface AiRuntimeCredentials {
  provider: AiProviderId
  model: string
  write_mode: AiWriteMode
  api_key: string | null
  api_keys?: Partial<Record<AiProviderId, string>>
}

export interface AiAssistantDependencies {
  authenticate(token: string): Promise<string | null>
  consumeBudget(userId: string): Promise<boolean>
  resolveCredentials(userId: string): Promise<AiRuntimeCredentials>
  loadWorkspaceDigest(token: string, workspaceId: string): Promise<Record<string, unknown>>
  searchWorkspace?(token: string, workspaceId: string, query: string): Promise<Record<string, unknown>>
  readRecords?(
    token: string,
    workspaceId: string,
    targets: Array<{ module: string; id: string }>
  ): Promise<Record<string, unknown>>
  executeActions?(
    token: string,
    workspaceId: string,
    actions: ProposedAiAction[],
    meta: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  fetch: typeof fetch
  defaultKeys?: Partial<Record<AiProviderId, string>>
}

const ALLOWED_PROVIDERS = new Set<AiProviderId>(['gemini', 'openai', 'anthropic'])
const ALLOWED_MODES = new Set<AiRequestMode>([
  'chat',
  'analyze',
  'recommend',
  'transform_note',
  'plan_actions',
])
const ALLOWED_MODULES = new Set([
  'detailed',
  'plans',
  'quick',
  'tasks',
  'calendar',
  'periodic',
  'code',
  'learning',
  'flashcards',
  'workout',
  'activities',
  'finance',
])
const ALLOWED_WRITE_MODES = new Set<AiNoteWriteMode>([
  'replace',
  'append',
  'prepend',
  'insert_section',
])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SECURE_PROMPT_RE =
  /(?:^|[^\p{L}\p{N}_])(?:güvenli\s+not\p{L}*|şifreli\s+not\p{L}*|kasa(?:m|n|mız|nız)?(?:da(?:ki)?|dan|ya|yı|ı)?|secure\s*notes?|secure\s*vault)(?=$|[^\p{L}\p{N}_])/iu

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

function sanitizeProposedActions(raw: unknown): ProposedAiAction[] {
  if (!Array.isArray(raw)) return []
  const cleaned: ProposedAiAction[] = []
  for (const item of raw.slice(0, 15)) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const mod = String(candidate.module || '').trim()
    if (mod === 'secure') {
      throw new Error('AI_SECURE_MODULE_FORBIDDEN')
    }
    if (!ALLOWED_MODULES.has(mod)) continue
    const operation = String(candidate.operation || 'create').trim()
    const writeModeRaw = String(candidate.write_mode || 'replace').trim() as AiNoteWriteMode
    const write_mode: AiNoteWriteMode = ALLOWED_WRITE_MODES.has(writeModeRaw)
      ? writeModeRaw
      : 'replace'
    const payload =
      candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload)
        ? (candidate.payload as Record<string, unknown>)
        : {}
    const target_id =
      typeof candidate.target_id === 'string' && UUID_RE.test(candidate.target_id)
        ? candidate.target_id
        : undefined
    cleaned.push({
      module: mod as ProposedAiAction['module'],
      ...(typeof candidate.entity === 'string' ? { entity: candidate.entity } : {}),
      operation,
      ...(target_id ? { target_id } : {}),
      write_mode,
      ...(typeof candidate.section_heading === 'string'
        ? { section_heading: candidate.section_heading.slice(0, 120) }
        : {}),
      ...(typeof candidate.expected_version === 'number'
        ? { expected_version: candidate.expected_version }
        : {}),
      ...(typeof candidate.summary === 'string' ? { summary: candidate.summary.slice(0, 240) } : {}),
      payload,
    })
  }
  return cleaned
}

function buildSynthesizedAnalysis(
  digest: Record<string, unknown>,
  prompt: string,
  mode: AiRequestMode,
  lang: 'tr' | 'en',
  context?: Record<string, unknown>
) {
  const signals = (digest.recommendations_signals || {}) as Record<string, number>
  const overdueTasks = Number(signals.overdue_tasks_count || 0)
  const highPriorityTasks = Number(signals.high_priority_open_tasks_count || 0)
  const carriedPlans = Number(signals.carried_plans_count || 0)
  const pendingPeriodic = Number(signals.pending_periodic_today_count || 0)
  const openMistakes = Number(signals.open_mistakes_count || 0)
  const dueReviews = Number(signals.due_reviews_count || 0)
  const emptyNotes = Number(signals.empty_notes_count || 0)

  const insights: AiInsightItem[] = []
  const recommendations: AiRecommendationItem[] = []
  const proposed_actions: ProposedAiAction[] = []

  if (mode === 'transform_note' && context?.selected_record) {
    const rec = context.selected_record as Record<string, unknown>
    const content = String(rec.content || '').trim()
    const transformAction = String(context.transform_action || 'summarize')
    const lines = content
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)

    let markdown = content
    if (transformAction === 'summarize') {
      const summaryPoints = lines.slice(0, 4).map(l => `- ${l.replace(/^[-*•]\s*/, '')}`)
      markdown =
        (lang === 'tr' ? '### AI Özeti\n' : '### AI Summary\n') +
        (summaryPoints.length ? summaryPoints.join('\n') : `- ${content.slice(0, 200)}`)
    } else if (transformAction === 'action_items') {
      const items = lines.slice(0, 5).map(l => `- [ ] ${l.replace(/^[-*•]\s*/, '')}`)
      markdown =
        (lang === 'tr' ? '### Eylem Maddeleri\n' : '### Action Items\n') +
        (items.length ? items.join('\n') : `- [ ] ${content.slice(0, 160)}`)
    } else if (transformAction === 'structure') {
      markdown =
        `## ${String(rec.title || (lang === 'tr' ? 'Yapılandırılmış Not' : 'Structured Note'))}\n\n` +
        lines.map(l => (l.startsWith('#') || l.startsWith('-') ? l : `- ${l}`)).join('\n')
    } else if (transformAction === 'expand') {
      markdown =
        content +
        '\n\n' +
        (lang === 'tr'
          ? '### Detaylandırma ve Sonraki Adımlar\n- Mevcut kapsam gözden geçirilecek.\n- Öncelikli çıktılar tamamlanacak.'
          : '### Elaboration & Next Steps\n- Review current scope.\n- Complete high-priority deliverables.')
    }

    return {
      reply:
        lang === 'tr'
          ? 'Not içeriği seçtiğiniz dönüşüm moduna göre yapılandırıldı.'
          : 'Note content has been structured according to your selected transformation.',
      insights,
      recommendations,
      proposed_actions,
      transformed_note: {
        markdown,
        action: transformAction,
      },
    }
  }

  if (overdueTasks > 0 || highPriorityTasks > 0) {
    insights.push({
      title: lang === 'tr' ? 'Görev Yükü ve Gecikmeler' : 'Task Load & Overdue Items',
      summary:
        lang === 'tr'
          ? `${overdueTasks} gecikmiş görev ve ${highPriorityTasks} yüksek öncelikli açık görev bulunuyor.`
          : `You have ${overdueTasks} overdue tasks and ${highPriorityTasks} high-priority open tasks.`,
      severity: overdueTasks > 0 ? 'warning' : 'info',
      module: 'tasks',
    })
  }

  if (carriedPlans > 0) {
    insights.push({
      title: lang === 'tr' ? 'Devreden Planlar' : 'Carried-Over Plans',
      summary:
        lang === 'tr'
          ? `${carriedPlans} plan önceki dönemlerden devretmiş durumda. Küçük alt adımlara bölünmesi önerilir.`
          : `${carriedPlans} plans have rolled over from previous periods. Breaking them into smaller steps is recommended.`,
      severity: 'warning',
      module: 'plans',
    })
  }

  if (openMistakes > 0 || dueReviews > 0) {
    insights.push({
      title: lang === 'tr' ? 'Öğrenme ve Tekrar Durumu' : 'Learning & Review Status',
      summary:
        lang === 'tr'
          ? `${openMistakes} açık hata sorusu ve ${dueReviews} tekrar zamanı gelmiş konu mevcut.`
          : `${openMistakes} open mistake items and ${dueReviews} due topic reviews found.`,
      severity: 'info',
      module: 'learning',
    })
  }

  if (pendingPeriodic > 0) {
    insights.push({
      title: lang === 'tr' ? 'Günlük Rutinler' : 'Daily Routines',
      summary:
        lang === 'tr'
          ? `Bugün tamamlanmayı bekleyen ${pendingPeriodic} periyodik görev var.`
          : `There are ${pendingPeriodic} periodic tasks awaiting completion today.`,
      severity: 'info',
      module: 'periodic',
    })
  }

  if (emptyNotes > 0) {
    recommendations.push({
      id: 'rec-enrich-empty-notes',
      title: lang === 'tr' ? 'Boş Notları Yapılandır' : 'Structure Empty Notes',
      reason:
        lang === 'tr'
          ? `${emptyNotes} detaylı notun açıklaması boş; AI ile alt başlık ve kontrol listesi ekleyebilirsiniz.`
          : `${emptyNotes} detailed notes have empty descriptions; you can populate them with headings and checklists.`,
      module: 'detailed',
    })
  }

  // Check if user prompt asks to create/add/write a note, plan, task, or routine
  const lowerPrompt = prompt.toLowerCase()
  if (
    mode === 'plan_actions' ||
    /(ekle|oluştur|yaz|not al|planla|görev|create|add|write|note)/i.test(lowerPrompt)
  ) {
    const cleanTitle = prompt.replace(/^(bana|lütfen|ai|yapay zeka)\s+/i, '').slice(0, 120)
    if (/(plan|günlük|haftalık)/i.test(lowerPrompt)) {
      const action: ProposedAiAction = {
        module: 'plans',
        operation: 'create',
        write_mode: 'replace',
        summary: lang === 'tr' ? `Yeni plan oluştur: "${cleanTitle}"` : `Create plan: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          period: /haftalık|weekly/i.test(lowerPrompt) ? 'weekly' : 'daily',
          notes:
            lang === 'tr'
              ? `### Hedef ve Adımlar\n- ${cleanTitle}\n- Öncelikli odak bloğu ayrılacak.`
              : `### Goal & Steps\n- ${cleanTitle}\n- Allocate primary focus block.`,
        },
      }
      proposed_actions.push(action)
    } else if (/(görev|task|todo)/i.test(lowerPrompt)) {
      const action: ProposedAiAction = {
        module: 'tasks',
        operation: 'create',
        write_mode: 'replace',
        summary: lang === 'tr' ? `Yeni görev oluştur: "${cleanTitle}"` : `Create task: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          description:
            lang === 'tr'
              ? `AI tarafından oluşturulan görev detayı:\n- ${cleanTitle}`
              : `AI generated task details:\n- ${cleanTitle}`,
          priority: 'medium',
          status: 'todo',
        },
      }
      proposed_actions.push(action)
    } else {
      const action: ProposedAiAction = {
        module: 'detailed',
        entity: 'note',
        operation: 'create',
        write_mode: 'replace',
        summary:
          lang === 'tr' ? `Detaylı not oluştur: "${cleanTitle}"` : `Create detailed note: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          description: `<p>${cleanTitle}</p><ul><li>${
            lang === 'tr' ? 'Ana noktalar ve eylem adımları' : 'Key points and action items'
          }</li></ul>`,
          priority: 'medium',
        },
      }
      proposed_actions.push(action)
    }
  }

  const reply =
    lang === 'tr'
      ? `Çalışma alanı verileriniz analiz edildi (${overdueTasks} gecikmiş görev, ${carriedPlans} devreden plan, ${pendingPeriodic} bekleyen rutin, ${openMistakes} açık öğrenme hatası).`
      : `Your workspace data has been analyzed (${overdueTasks} overdue tasks, ${carriedPlans} carried plans, ${pendingPeriodic} pending routines, ${openMistakes} open learning mistakes).`

  return {
    reply,
    insights,
    recommendations,
    proposed_actions,
    transformed_note: null,
  }
}

async function callExternalProvider(
  fetchFn: typeof fetch,
  provider: AiProviderId,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPayload: string
): Promise<Record<string, unknown>> {
  const signal = AbortSignal.timeout(25_000)

  if (provider === 'gemini') {
    const res = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPayload }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      }
    )
    if (!res.ok) throw new Error(`GEMINI_HTTP_${res.status}`)
    const data = await res.json()
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : []
    const rawText =
      parts
        .filter((p: { thought?: boolean; text?: string }) => !p?.thought && typeof p?.text === 'string')
        .map((p: { text?: string }) => p.text)
        .join('') ||
      parts[0]?.text ||
      '{}'
    return JSON.parse(rawText)
  }

  if (provider === 'openai') {
    const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPayload },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OPENAI_HTTP_${res.status}`)
    const data = await res.json()
    const rawText = data?.choices?.[0]?.message?.content || '{}'
    return JSON.parse(rawText)
  }

  // Anthropic
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPayload }],
    }),
  })
  if (!res.ok) throw new Error(`ANTHROPIC_HTTP_${res.status}`)
  const data = await res.json()
  const textBlock = Array.isArray(data?.content)
    ? data.content.find((c: { type?: string; text?: string }) => c?.type === 'text')?.text
    : '{}'
  return JSON.parse(textBlock || '{}')
}

export function aiAssistantHandler(deps: AiAssistantDependencies) {
  const response = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      },
    })

  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' })

    try {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
      if (!token) return response(401, { error: 'AUTH_REQUIRED' })
      const userId = await deps.authenticate(token)
      if (!userId) return response(401, { error: 'AUTH_REQUIRED' })

      if (!(await deps.consumeBudget(userId))) {
        return response(429, { error: 'RATE_LIMITED' })
      }

      if (Number(request.headers.get('content-length')) > 65536) {
        return response(413, { error: 'PAYLOAD_TOO_LARGE' })
      }

      const rawBody = await request.text()
      if (rawBody.length > 65536) {
        return response(413, { error: 'PAYLOAD_TOO_LARGE' })
      }

      let body: Record<string, unknown>
      try {
        body = JSON.parse(rawBody)
      } catch {
        return response(400, { error: 'INVALID_AI_REQUEST' })
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return response(400, { error: 'INVALID_AI_REQUEST' })
      }

      const workspaceId = String(body.workspace_id || '').trim()
      const mode = String(body.mode || 'chat').trim() as AiRequestMode
      const prompt = String(body.prompt || '').trim()
      const lang: 'tr' | 'en' = body.language === 'en' ? 'en' : 'tr'
      const context =
        body.context && typeof body.context === 'object' && !Array.isArray(body.context)
          ? (body.context as Record<string, unknown>)
          : undefined

      if (!UUID_RE.test(workspaceId) || !ALLOWED_MODES.has(mode) || prompt.length < 1 || prompt.length > 8000) {
        return response(400, { error: 'INVALID_AI_REQUEST' })
      }

      if (
        context?.active_module === 'secure' ||
        (context?.selected_record as Record<string, unknown> | undefined)?.module === 'secure' ||
        SECURE_PROMPT_RE.test(prompt)
      ) {
        return response(403, { error: 'AI_SECURE_MODULE_FORBIDDEN' })
      }

      const creds = await deps.resolveCredentials(userId)
      const requestedProvider =
        typeof body.provider === 'string' && ALLOWED_PROVIDERS.has(body.provider as AiProviderId)
          ? (body.provider as AiProviderId)
          : creds.provider || 'gemini'
      const requestedModel =
        typeof body.model === 'string' && body.model.trim().length > 0
          ? body.model.trim().slice(0, 120)
          : creds.model || 'gemini-2.5-flash'
      const writeMode: AiWriteMode = creds.write_mode === 'auto_apply' ? 'auto_apply' : 'ask_before_write'

      const apiKey =
        creds.api_keys?.[requestedProvider] ||
        (requestedProvider === creds.provider ? creds.api_key : null) ||
        deps.defaultKeys?.[requestedProvider] ||
        null

      const digest = await deps.loadWorkspaceDigest(token, workspaceId)

      let extraRecords: Record<string, unknown> | null = null
      if (
        deps.readRecords &&
        context?.selected_record &&
        typeof (context.selected_record as Record<string, unknown>).module === 'string' &&
        typeof (context.selected_record as Record<string, unknown>).id === 'string'
      ) {
        const sel = context.selected_record as { module: string; id: string }
        if (sel.module === 'secure') {
          return response(403, { error: 'AI_SECURE_MODULE_FORBIDDEN' })
        }
        if (UUID_RE.test(sel.id)) {
          extraRecords = await deps.readRecords(token, workspaceId, [{ module: sel.module, id: sel.id }])
        }
      }

      let resultPayload = buildSynthesizedAnalysis(digest, prompt, mode, lang, context)
      let activeProvider: AiProviderId | 'local' = 'local'

      if (apiKey) {
        const systemPrompt = [
          'You are the intelligent Workspace AI Assistant for a multi-module productivity and note-taking application.',
          'Never access or reference encrypted vault ("secure") records.',
          'Respond strictly with a valid JSON object matching this schema:',
          '{"reply": string, "insights": [{"title": string, "summary": string, "severity": "info"|"warning"|"positive", "module"?: string}], "recommendations": [{"id": string, "title": string, "reason": string, "module": string, "action"?: ProposedAiAction}], "proposed_actions": [ProposedAiAction], "transformed_note": {"markdown": string, "action": string} | null}',
          'Each ProposedAiAction must have: {"module": "detailed"|"plans"|"quick"|"tasks"|"calendar"|"periodic"|"code"|"learning"|"flashcards"|"workout"|"activities"|"finance", "entity"?: string, "operation": "create"|"update"|"append"|"prepend"|"insert_section"|"toggle", "target_id"?: uuid, "write_mode": "replace"|"append"|"prepend"|"insert_section", "section_heading"?: string, "summary": string, "payload": object}.',
          `User language: ${lang}.`,
        ].join('\n')

        const userPayload = JSON.stringify({
          mode,
          prompt,
          context: context || null,
          selected_records: extraRecords?.items || [],
          workspace_digest: digest,
        })

        try {
          const llmRaw = await callExternalProvider(
            deps.fetch,
            requestedProvider,
            requestedModel,
            apiKey,
            systemPrompt,
            userPayload
          )
          const sanitizedActions = sanitizeProposedActions(llmRaw.proposed_actions)
          resultPayload = {
            reply:
              typeof llmRaw.reply === 'string' && llmRaw.reply.trim()
                ? llmRaw.reply.trim()
                : resultPayload.reply,
            insights: Array.isArray(llmRaw.insights)
              ? (llmRaw.insights.slice(0, 8) as AiInsightItem[])
              : resultPayload.insights,
            recommendations: Array.isArray(llmRaw.recommendations)
              ? (llmRaw.recommendations.slice(0, 8) as AiRecommendationItem[])
              : resultPayload.recommendations,
            proposed_actions: sanitizedActions,
            transformed_note:
              llmRaw.transformed_note && typeof llmRaw.transformed_note === 'object'
                ? {
                    markdown: String(
                      (llmRaw.transformed_note as Record<string, unknown>).markdown || ''
                    ),
                    action: String(
                      (llmRaw.transformed_note as Record<string, unknown>).action ||
                        context?.transform_action ||
                        'summarize'
                    ),
                  }
                : resultPayload.transformed_note,
          }
          activeProvider = requestedProvider
        } catch (err) {
          if (err instanceof Error && err.message === 'AI_SECURE_MODULE_FORBIDDEN') {
            return response(403, { error: 'AI_SECURE_MODULE_FORBIDDEN' })
          }
          // Fall back gracefully to deterministic synthesis if external provider fails
        }
      }

      let applied_run: Record<string, unknown> | null = null
      if (
        writeMode === 'auto_apply' &&
        body.auto_execute === true &&
        resultPayload.proposed_actions.length > 0 &&
        deps.executeActions
      ) {
        applied_run = await deps.executeActions(
          token,
          workspaceId,
          resultPayload.proposed_actions,
          {
            prompt,
            provider: activeProvider,
            model: requestedModel,
            write_mode: writeMode,
          }
        )
      }

      return response(200, {
        provider: activeProvider,
        model: requestedModel,
        write_mode: writeMode,
        ...resultPayload,
        applied_run,
      })
    } catch (err) {
      if (err instanceof Error && err.message === 'AI_SECURE_MODULE_FORBIDDEN') {
        return response(403, { error: 'AI_SECURE_MODULE_FORBIDDEN' })
      }
      return response(503, { error: 'AI_SERVICE_UNAVAILABLE' })
    }
  }
}
