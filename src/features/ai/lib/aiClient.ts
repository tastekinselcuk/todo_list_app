import { supabase } from '@/lib/supabase'
import {
  htmlToStructuredMarkdown,
  structuredMarkdownToSafeHtml,
  notePlainTextPreview,
  applyNoteWriteMode,
  type NoteWriteMode,
  type NoteTargetFormat,
} from '@/lib/aiNoteFormat'

type PlanPeriod = 'timeless' | 'daily' | 'weekly' | 'monthly' | 'yearly'

function periodStart(period: PlanPeriod, date = new Date()): string {
  if (period === 'timeless') return '1970-01-01'
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (period === 'weekly') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (period === 'monthly') start.setDate(1)
  if (period === 'yearly') start.setMonth(0, 1)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

export type AiProviderId = 'gemini' | 'openai' | 'anthropic'
export type AiWriteMode = 'ask_before_write' | 'auto_apply'
export type AiNoteWriteMode = NoteWriteMode
export type AiTransformInstruction =
  | 'summarize'
  | 'expand'
  | 'action_items'
  | 'fix_grammar'
  | 'translate'
  | 'structure'

export interface ProposedAiAction {
  module: string
  operation: string
  target_id?: string | null
  write_mode?: AiNoteWriteMode
  section_heading?: string | null
  expected_version?: number
  risk_level?: 'low' | 'medium' | 'high'
  requires_confirmation?: boolean
  title?: string
  summary?: string
  payload: Record<string, unknown>
}

export interface AiInsightItem {
  title: string
  detail: string
  severity: 'info' | 'warning' | 'success'
  module: string
}

export interface AiRecommendationItem {
  title: string
  reason: string
  suggested_action?: ProposedAiAction | null
}

export interface AiSettingsState {
  provider: AiProviderId
  model: string
  write_mode: AiWriteMode
  configured_providers: Record<AiProviderId, boolean>
  key_hints: Record<AiProviderId, string | null>
}

export interface AiActionRunRecord {
  id: string
  provider: string
  model: string
  mode: string
  status: 'applied' | 'undone' | 'failed'
  prompt_summary: string
  target_modules: string[]
  applied_changes: Array<Record<string, unknown>>
  created_at: string
  undone_at?: string | null
}

export interface AiWorkspaceDigest {
  workspace_id: string
  generated_at: string
  plans?: {
    pending_count: number
    completed_count: number
    overdue_count: number
    upcoming: Array<Record<string, unknown>>
  }
  tasks?: {
    pending_count: number
    completed_count: number
    overdue_count: number
    high_priority: Array<Record<string, unknown>>
    calendar_blocks?: Array<{
      id?: string
      task_id?: string | null
      title: string
      task_title?: string
      starts_at?: string
      ends_at?: string
      version?: number
    }>
  }
  quick_notes?: {
    total_count: number
    recent: Array<Record<string, unknown>>
  }
  todos?: {
    active_count: number
    recent: Array<Record<string, unknown>>
  }
  periodic_tasks?: {
    total_count: number
    items: Array<Record<string, unknown>>
  }
  learning?: {
    active_topics: number
    unresolved_mistakes: number
    recent_mistakes: Array<Record<string, unknown>>
    subjects?: Array<Record<string, unknown>>
  }
  finance?: {
    recent_transactions_30d: number
    expense_30d: number
    income_30d: number
    recent_items?: Array<Record<string, unknown>>
    position_count?: number
    positions?: Array<Record<string, unknown>>
    budgets?: Array<Record<string, unknown>>
    recurring_count?: number
    recurring?: Array<Record<string, unknown>>
    categories?: Array<Record<string, unknown>>
  }
  activities?: {
    want_count: number
    done_count: number
    recent_want: Array<Record<string, unknown>>
  }
  workouts?: {
    total_count: number
    items: Array<Record<string, unknown>>
  }
  flashcards?: {
    total_count: number
    items: Array<Record<string, unknown>>
  }
  code_snippets?: {
    total_count: number
    items: Array<Record<string, unknown>>
  }
  recommendations_signals?: Record<string, number>
}

export interface AiConversationTurn {
  role: 'user' | 'assistant'
  content: string
  scopeLabels?: string[]
  clarificationQuestion?: string
  clarificationOptions?: Array<{ id: string; label: string; module: string }>
}

export interface AiClarificationOption {
  id: string
  label: string
  description?: string
  action: ProposedAiAction
}

export interface AiClarificationPrompt {
  question: string
  options: AiClarificationOption[]
  resolvedOptionId?: string | null
}

export interface AiAssistantRequest {
  workspace_id: string
  mode: 'analyze' | 'recommend' | 'write' | 'transform_note' | 'chat'
  prompt?: string
  scope?: AiPromptScope | null
  history?: AiConversationTurn[]
  timezone?: string
  locale?: string
  conversation_id?: string
  request_id?: string
  auto_execute?: boolean
  provider?: AiProviderId
  model?: string
  write_mode?: AiWriteMode
  targets?: Array<{ module: string; ids?: string[]; limit?: number }>
  actions?: ProposedAiAction[]
  note_context?: {
    module?: string
    target_id?: string
    field?: string
    text: string
    instruction: AiTransformInstruction
    target_format?: NoteTargetFormat
    write_mode?: AiNoteWriteMode
    section_heading?: string
  }
}

export interface AiAssistantResponse {
  ok: boolean
  provider: string
  model: string
  write_mode: AiWriteMode
  reply: string
  insights: AiInsightItem[]
  recommendations: AiRecommendationItem[]
  proposed_actions: ProposedAiAction[]
  clarification?: AiClarificationPrompt | null
  applied_run?: {
    run_id: string
    status: string
    applied_count: number
    applied_changes: Array<Record<string, unknown>>
  } | null
  transformed_text?: string
  transformed_markdown?: string
  digest?: AiWorkspaceDigest | null
  tool_trace?: Array<{ step: number; tool: string; ok: boolean; duration_ms: number }>
  error_code?: string
}

export const PROVIDER_MODELS: Record<AiProviderId, Array<{ id: string; label: string }>> = {
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Hızlı & Dengeli)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Derin Analiz)' },
  ],
  openai: [
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (Hızlı & Verimli)' },
    { id: 'gpt-4.1', label: 'GPT-4.1 (Kapsamlı Akıl Yürütme)' },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Hızlı)' },
    { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet (Derin Analiz)' },
  ],
}

const AI_LOCAL_SETTINGS_KEY = 'ai_assistant_local_settings_v1'
const AI_LOCAL_HISTORY_KEY = 'ai_assistant_local_history_v1'

interface LocalSettingsRecord {
  provider: AiProviderId
  model: string
  write_mode: AiWriteMode
  api_keys: Partial<Record<AiProviderId, string>>
}

interface LocalRunSnapshot {
  table: string
  id: string
  existed: boolean
  module: string
  row?: Record<string, unknown> | null
}

interface LocalHistoryRecord extends AiActionRunRecord {
  workspace_id: string
  before_snapshots?: LocalRunSnapshot[]
}

const memoryStorage = new Map<string, string>()

function safeStorageGet(key: string): string | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage.getItem(key)
    }
  } catch {
    // Fall back to in-memory cache when storage is restricted
  }
  return memoryStorage.get(key) ?? null
}

function safeStorageSet(key: string, value: string): void {
  memoryStorage.set(key, value)
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.setItem(key, value)
    }
  } catch {
    // Ignore storage quota or sandbox errors
  }
}

function readLocalSettings(): LocalSettingsRecord {
  const defaults: LocalSettingsRecord = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    write_mode: 'ask_before_write',
    api_keys: {},
  }
  try {
    const raw = safeStorageGet(AI_LOCAL_SETTINGS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<LocalSettingsRecord>
    const provider: AiProviderId =
      parsed.provider && ['gemini', 'openai', 'anthropic'].includes(parsed.provider)
        ? parsed.provider
        : defaults.provider
    const write_mode: AiWriteMode =
      parsed.write_mode === 'auto_apply' ? 'auto_apply' : 'ask_before_write'
    const api_keys: Partial<Record<AiProviderId, string>> = {}
    if (parsed.api_keys && typeof parsed.api_keys === 'object') {
      for (const p of ['gemini', 'openai', 'anthropic'] as const) {
        const val = parsed.api_keys[p]
        if (typeof val === 'string' && val.trim().length > 0) {
          api_keys[p] = val.trim()
        }
      }
    }
    return {
      provider,
      model: String(parsed.model || PROVIDER_MODELS[provider][0].id),
      write_mode,
      api_keys,
    }
  } catch {
    return defaults
  }
}

function writeLocalSettings(next: LocalSettingsRecord): void {
  safeStorageSet(AI_LOCAL_SETTINGS_KEY, JSON.stringify(next))
}

function formatKeyHint(key: string | null | undefined): string | null {
  const trimmed = String(key || '').trim()
  if (!trimmed) return null
  return trimmed.length >= 4 ? `••••${trimmed.slice(-4)}` : '••••'
}

function localSettingsToState(local: LocalSettingsRecord): AiSettingsState {
  return {
    provider: local.provider,
    model: local.model,
    write_mode: local.write_mode,
    configured_providers: {
      gemini: Boolean(local.api_keys.gemini),
      openai: Boolean(local.api_keys.openai),
      anthropic: Boolean(local.api_keys.anthropic),
    },
    key_hints: {
      gemini: formatKeyHint(local.api_keys.gemini),
      openai: formatKeyHint(local.api_keys.openai),
      anthropic: formatKeyHint(local.api_keys.anthropic),
    },
  }
}

function readLocalHistory(workspaceId?: string): LocalHistoryRecord[] {
  try {
    const raw = safeStorageGet(AI_LOCAL_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is LocalHistoryRecord =>
        Boolean(item && typeof item === 'object' && (!workspaceId || item.workspace_id === workspaceId)),
    )
  } catch {
    return []
  }
}

function writeLocalHistory(records: LocalHistoryRecord[]): void {
  safeStorageSet(AI_LOCAL_HISTORY_KEY, JSON.stringify(records.slice(0, 50)))
}

export function defaultAiSettings(): AiSettingsState {
  return {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    write_mode: 'ask_before_write',
    configured_providers: {
      gemini: false,
      openai: false,
      anthropic: false,
    },
    key_hints: {
      gemini: null,
      openai: null,
      anthropic: null,
    },
  }
}

export function isMissingSchemaRpcError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }
  const code = String(e.code || '').trim()
  if (code === 'PGRST202' || code === 'PGRST204' || code === '42883' || code === '42P01' || code === '42703') {
    return true
  }
  const text = `${String(e.message || '')} ${String(e.details || '')} ${String(e.hint || '')}`
  return /Could not find the function|schema cache|does not exist/i.test(text)
}

export function isSecureVaultPrompt(prompt: string): boolean {
  const text = String(prompt || '').trim()
  if (!text) return false
  return /(?:^|[^\p{L}\p{N}_])(?:güvenli\s+not\p{L}*|şifreli\s+not\p{L}*|kasa(?:m|n|mız|nız)?(?:da(?:ki)?|dan|ya|yı|ı)?|secure\s*notes?|secure\s*vault)(?=$|[^\p{L}\p{N}_])/iu.test(
    text,
  )
}

function assertNotSecureTarget(input: string): void {
  const normalized = String(input || '').trim().toLowerCase()
  if (normalized === 'secure' || normalized === 'secure_notes') {
    throw new Error('AI_SECURE_MODULE_FORBIDDEN')
  }
}

export function transformNoteLocally(
  rawText: string,
  instruction: AiTransformInstruction,
  targetFormat: NoteTargetFormat = 'html',
  customPrompt = '',
): { transformed_text: string; transformed_markdown: string; reply: string } {
  const markdown = htmlToStructuredMarkdown(rawText || '')
  const plain = notePlainTextPreview(rawText || '', 4000)
  const lines = markdown
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  let resultMd = ''
  let reply = ''

  switch (instruction) {
    case 'summarize': {
      const bulletPoints = lines.slice(0, 4).map(line => `- ${line.replace(/^[-*#>\d.\s]+/, '').trim()}`)
      resultMd = [
        '### AI Özeti',
        ...(bulletPoints.length ? bulletPoints : [`- ${plain || 'Özetlenecek içerik bulunamadı.'}`]),
      ].join('\n')
      reply = 'Not içeriği ana maddeler halinde özetlendi.'
      break
    }
    case 'action_items': {
      const candidates = lines.length ? lines.slice(0, 6) : [plain || 'Yeni aksiyon maddesi']
      resultMd = [
        '### Aksiyon Maddeleri',
        ...candidates.map(item => `- [ ] ${item.replace(/^[-*#>\[\]xX\d.\s]+/, '').trim()}`),
      ].join('\n')
      reply = 'Not içindeki ifadelerden uygulanabilir görev listesi çıkarıldı.'
      break
    }
    case 'expand': {
      const base = markdown || plain || customPrompt || 'Not'
      resultMd = [
        base,
        '',
        '### Detaylandırma ve Alt Adımlar',
        '- **Hedef ve Kapsam:** Bu notun temel çıktısını netleştirin ve başarı kriterini belirleyin.',
        '- **Uygulama Adımları:** İlk hazırlık, uygulama ve kontrol aşamalarını sırayla tamamlayın.',
        '- **Risk ve Notlar:** Olası darboğazları ve bağımlılıkları takip edin.',
      ].join('\n')
      reply = 'Not kapsamı alt başlıklar ve uygulama adımlarıyla genişletildi.'
      break
    }
    case 'fix_grammar': {
      const cleaned = (markdown || plain)
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      resultMd = cleaned
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : ''
      reply = 'İmla ve noktalama düzenlemesi tamamlandı.'
      break
    }
    case 'translate': {
      const isTurkish = /[çğıöşüÇĞİÖŞÜ]|(\bve\b|\biçin\b|\bile\b|\bolarak\b)/i.test(plain)
      resultMd = isTurkish
        ? `### English Translation\n\n${markdown || plain}`
        : `### Türkçe Çeviri\n\n${markdown || plain}`
      reply = isTurkish ? 'Not İngilizce yapıya dönüştürüldü.' : 'Not Türkçe yapıya dönüştürüldü.'
      break
    }
    case 'structure':
    default: {
      const bodyItems = lines.length
        ? lines.map(line => (line.startsWith('-') || line.startsWith('#') ? line : `- ${line}`))
        : ['- Yapılandırılmış not maddesi']
      resultMd = [
        '## Yapılandırılmış Not',
        '',
        ...bodyItems,
      ].join('\n')
      reply = 'Not başlık ve maddeler halinde yapılandırıldı.'
      break
    }
  }

  const formatted =
    targetFormat === 'html'
      ? structuredMarkdownToSafeHtml(resultMd)
      : targetFormat === 'plain'
        ? notePlainTextPreview(resultMd, 8000)
        : resultMd

  return {
    transformed_text: formatted,
    transformed_markdown: resultMd,
    reply,
  }
}

function cleanTurkishNoteTitle(raw: string, fallback: string): string {
  let cleaned = String(raw || '').trim()
  cleaned = cleaned.replace(/["'“”‘’]/g, '').trim()
  cleaned = cleaned
    .replace(
      /^(?:öncelikle\s+|lütfen\s+|acaba\s+|hemen\s+)*(?:benim\s+için\s+)?(?:ideal\s+bir\s+|uygun\s+bir\s+|detaylı\s+bir\s+|kapsamlı\s+bir\s+|yeni\s+bir\s+)?/iu,
      '',
    )
    .replace(/(?:için\s+)?araştırma\s+yap(?:ıp|\s+ve\s+(?:daha\s+sonra\s+)?)?/giu, '')
    .replace(/(?:uygun\s+bir\s+|buna\s+göre\s+|hazırlayarak\s+)/giu, '')
    .replace(
      /(?:^|[^\p{L}\p{N}_])(?:antrenman\s+takipçis\p{L}*|(?:çalışma|bilgi|kelime)\s+kart\p{L}*|kart\s+(?:destes\p{L}*|koleksiyon\p{L}*)|takvim\p{L}*|görev\p{L}*|detaylı\s+not\p{L}*|hızlı\s+not\p{L}*|plan\p{L}*|periyodik\s+(?:iş\p{L}*|görev\p{L}*|rutin\p{L}*)|öğrenme\s+takipçis\p{L}*|kod\s+(?:parçacığ\p{L}*|kütüphanes\p{L}*)|listeler\p{L}*)(?:\s+(?:kısmın\p{L}*|alanın\p{L}*|sekmesin\p{L}*|modülün\p{L}*|bölümün\p{L}*))?\s*/giu,
      ' ',
    )
    .replace(/^(?:bugün|yarın)\s+için\s+/iu, '')
    .trim()
  cleaned = cleaned
    .replace(
      /(?:^|\s+)(?:ekle(?:yip|yebilir\p{L}*|yin|yelim)?|oluştur\p{L}*|yaz(?:abilir\p{L}*|ın|alım)?|kaydet\p{L}*|gir(?:ebilir\p{L}*|in|elim)?|not\s+al\p{L}*|aktar\p{L}*)[.!?]*$/iu,
      '',
    )
    .trim()
  cleaned = cleaned.replace(/\s+(?:isimli|adlı|başlıklı)\s+(?:bir\s+)?(?:not|görev|kayıt|etkinlik|koleksiyon|deste).*$/iu, '').trim()
  cleaned = cleaned.replace(/\bverisini$/iu, 'verisi')
  cleaned = cleaned.replace(/\bkaydını$/iu, 'kaydı')
  cleaned = cleaned.replace(/\bnotunu$/iu, 'notu')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  return cleaned.slice(0, 140) || fallback
}

interface WorkoutExerciseSpec {
  name: string
  catalogId: string
  equipment: string
  muscles: string[]
  sets: number
  reps: string
  restSeconds: number
  tempo: string
  notes: string
  imageUrl: string
  isCompleted: boolean
}

function parseWorkoutDay(text: string): string {
  const lower = text.toLocaleLowerCase('tr')
  if (lower.includes('pazartesi')) return 'Monday'
  if (lower.includes('salı')) return 'Tuesday'
  if (lower.includes('çarşamba')) return 'Wednesday'
  if (lower.includes('perşembe')) return 'Thursday'
  if (lower.includes('cuma')) return 'Friday'
  if (lower.includes('cumartesi')) return 'Saturday'
  if (lower.includes('pazar')) return 'Sunday'
  return 'Any'
}

function buildWorkoutProgramForPrompt(text: string): {
  title: string
  dayOfWeek: string
  exercises: WorkoutExerciseSpec[]
  researchReply: string
} {
  const lower = text.toLocaleLowerCase('tr')
  const dayOfWeek = parseWorkoutDay(text)

  if (/(sırt|kanat|\blat\b|barfiks|çekiş|pull|deadlift|row)/iu.test(lower)) {
    const exercises: WorkoutExerciseSpec[] = [
      {
        name: 'Pullups',
        catalogId: 'Pullups',
        equipment: 'body only',
        muscles: ['lats'],
        sets: 4,
        reps: '6-10',
        restSeconds: 120,
        tempo: '2-1-2',
        notes: 'Dikey çekiş (genişlik): Kürek kemiklerini aşağı bastırarak göğsü bara yaklaştırın.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Barbell Deadlift',
        catalogId: 'Barbell_Deadlift',
        equipment: 'barbell',
        muscles: ['lower back'],
        sets: 3,
        reps: '6-8',
        restSeconds: 150,
        tempo: '2-0-1',
        notes: 'Arka zincir ve alt sırt gücü: Nötr omurga ve sıkı karın kası ile kalçadan menteşe.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Wide-Grip Lat Pulldown',
        catalogId: 'Wide-Grip_Lat_Pulldown',
        equipment: 'cable',
        muscles: ['lats'],
        sets: 4,
        reps: '10-12',
        restSeconds: 90,
        tempo: '2-1-2',
        notes: 'Latissimus dorsi genişliği: Dirsekleri belinize doğru çekip alt noktada 1 sn sıkıştırın.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Seated Cable Rows',
        catalogId: 'Seated_Cable_Rows',
        equipment: 'cable',
        muscles: ['middle back'],
        sets: 4,
        reps: '10-12',
        restSeconds: 90,
        tempo: '2-1-2',
        notes: 'Orta sırt kalınlığı (Rhomboid & Trapez): Belden ivme almadan kürek kemiklerini birbirine yaklaştırın.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'One-Arm Dumbbell Row',
        catalogId: 'One-Arm_Dumbbell_Row',
        equipment: 'dumbbell',
        muscles: ['middle back'],
        sets: 3,
        reps: '10-12',
        restSeconds: 75,
        tempo: '2-1-2',
        notes: 'Tek taraflı denge: Sağ ve sol sırt simetrisi için tam esneme ile kontrollü çekiş.',
        imageUrl: '',
        isCompleted: false,
      },
    ]
    const researchReply = [
      '### Sırt Antrenmanı Bilimsel Araştırma & Program Özeti',
      '- **Biyomekanik Denge:** İdeal sırt gelişimi için **dikey çekiş** (kanat genişliği: `Pullups`, `Wide-Grip Lat Pulldown`), **yatay çekiş** (orta sırt/rhomboid kalınlığı: `Seated Cable Rows`, `One-Arm Dumbbell Row`) ve **arka zincir kuvveti** (`Barbell Deadlift`) birlikte planlanmalıdır.',
      '- **Hacim ve Progresyon:** Haftalık 15–18 çalışma seti, büyük bileşik hareketlerde **120–150 sn**, izole/makara çekişlerde **75–90 sn** dinlenme ile optimal mekanik gerilim sağlar.',
      '- **Hazırlanan Program (Antrenman Takipçisi):** `İdeal Sırt Antrenmanı Programı (Genişlik & Kalınlık)` (5 egzersiz, katalog görselli ve tempo/not detaylı) eklenecek şekilde yapılandırıldı.',
    ].join('\n')
    return {
      title: 'İdeal Sırt Antrenmanı Programı (Genişlik & Kalınlık)',
      dayOfWeek,
      exercises,
      researchReply,
    }
  }

  if (/(göğüs|chest|bench|push|şınav)/iu.test(lower)) {
    const exercises: WorkoutExerciseSpec[] = [
      {
        name: 'Barbell Bench Press - Medium Grip',
        catalogId: 'Barbell_Bench_Press_-_Medium_Grip',
        equipment: 'barbell',
        muscles: ['chest'],
        sets: 4,
        reps: '6-8',
        restSeconds: 150,
        tempo: '3-1-1',
        notes: 'Ana bileşik itiş: Kürek kemikleri geriye/aşağı sabitlenmiş kontrollü iniş.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Incline Dumbbell Press',
        catalogId: 'Incline_Dumbbell_Press',
        equipment: 'dumbbell',
        muscles: ['chest'],
        sets: 4,
        reps: '8-12',
        restSeconds: 90,
        tempo: '2-1-2',
        notes: 'Üst göğüs (clavicular head) odaklı 30 derece eğimli pres.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Dumbbell Shoulder Press',
        catalogId: 'Dumbbell_Shoulder_Press',
        equipment: 'dumbbell',
        muscles: ['shoulders'],
        sets: 3,
        reps: '8-10',
        restSeconds: 90,
        tempo: '2-0-1',
        notes: 'Ön omuz ve üst itiş stabilitesi.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Triceps Pushdown',
        catalogId: 'Triceps_Pushdown',
        equipment: 'cable',
        muscles: ['triceps'],
        sets: 3,
        reps: '12-15',
        restSeconds: 60,
        tempo: '2-1-2',
        notes: 'Dirsekler sabit arka kol izolasyonu.',
        imageUrl: '',
        isCompleted: false,
      },
    ]
    return {
      title: 'İdeal Göğüs & İtiş Antrenmanı Programı',
      dayOfWeek,
      exercises,
      researchReply:
        '### Göğüs & İtiş Araştırması\n- Yatay + eğimli (incline) pres kombinasyonu ve yardımcı arka kol izolasyonuyla 4 egzersizlik itiş programı hazırlandı.',
    }
  }

  if (/(bacak|leg|squat|kalça|quad)/iu.test(lower)) {
    const exercises: WorkoutExerciseSpec[] = [
      {
        name: 'Barbell Full Squat',
        catalogId: 'Barbell_Full_Squat',
        equipment: 'barbell',
        muscles: ['quadriceps'],
        sets: 4,
        reps: '6-8',
        restSeconds: 150,
        tempo: '3-1-1',
        notes: 'Derin çömelme mekaniği: Diz-parmak ucu hizalamasını koruyun.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Leg Press',
        catalogId: 'Leg_Press',
        equipment: 'machine',
        muscles: ['quadriceps'],
        sets: 4,
        reps: '10-12',
        restSeconds: 90,
        tempo: '2-1-2',
        notes: 'Ön bacak hipertrofisi: Beli koltuktan kaldırmadan tam hareket açıklığı.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Barbell Deadlift',
        catalogId: 'Barbell_Deadlift',
        equipment: 'barbell',
        muscles: ['lower back'],
        sets: 3,
        reps: '6-8',
        restSeconds: 120,
        tempo: '2-0-1',
        notes: 'Arka bacak ve kalça aktivasyonu.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Plank',
        catalogId: 'Plank',
        equipment: 'body only',
        muscles: ['abdominals'],
        sets: 3,
        reps: '45-60 sn',
        restSeconds: 60,
        tempo: 'Izometrik',
        notes: 'Gövde stabilitesi ve omurga koruması.',
        imageUrl: '',
        isCompleted: false,
      },
    ]
    return {
      title: 'Alt Vücut & Güç Antrenmanı Programı',
      dayOfWeek,
      exercises,
      researchReply:
        '### Bacak & Alt Vücut Araştırması\n- Squat, hip hinge ve makine hacim dengesiyle 4 egzersizlik bacak programı hazırlandı.',
    }
  }

  if (/(omuz|kol|biceps|triceps|shoulder|arm)/iu.test(lower)) {
    const exercises: WorkoutExerciseSpec[] = [
      {
        name: 'Dumbbell Shoulder Press',
        catalogId: 'Dumbbell_Shoulder_Press',
        equipment: 'dumbbell',
        muscles: ['shoulders'],
        sets: 4,
        reps: '8-10',
        restSeconds: 90,
        tempo: '2-1-1',
        notes: 'Omuz kütlesi için temel dikey itiş.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Side Lateral Raise',
        catalogId: 'Side_Lateral_Raise',
        equipment: 'dumbbell',
        muscles: ['shoulders'],
        sets: 4,
        reps: '12-15',
        restSeconds: 60,
        tempo: '2-1-2',
        notes: 'Yan omuz genişliği için kontrollü açış.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Dumbbell Bicep Curl',
        catalogId: 'Dumbbell_Bicep_Curl',
        equipment: 'dumbbell',
        muscles: ['biceps'],
        sets: 3,
        reps: '10-12',
        restSeconds: 60,
        tempo: '2-1-2',
        notes: 'Ön kol izolasyonu.',
        imageUrl: '',
        isCompleted: false,
      },
      {
        name: 'Triceps Pushdown',
        catalogId: 'Triceps_Pushdown',
        equipment: 'cable',
        muscles: ['triceps'],
        sets: 3,
        reps: '10-12',
        restSeconds: 60,
        tempo: '2-1-2',
        notes: 'Arka kol izolasyonu.',
        imageUrl: '',
        isCompleted: false,
      },
    ]
    return {
      title: 'Omuz & Kol Gelişim Programı',
      dayOfWeek,
      exercises,
      researchReply:
        '### Omuz & Kol Antrenmanı Araştırması\n- Dikey itiş, yan omuz açışı ve kol antagonist süperset yapısıyla 4 egzersiz hazırlandı.',
    }
  }

  const exercises: WorkoutExerciseSpec[] = [
    {
      name: 'Barbell Full Squat',
      catalogId: 'Barbell_Full_Squat',
      equipment: 'barbell',
      muscles: ['quadriceps'],
      sets: 3,
      reps: '8-10',
      restSeconds: 120,
      tempo: '2-1-1',
      notes: 'Alt vücut temel bileşik egzersiz.',
      imageUrl: '',
      isCompleted: false,
    },
    {
      name: 'Barbell Bench Press - Medium Grip',
      catalogId: 'Barbell_Bench_Press_-_Medium_Grip',
      equipment: 'barbell',
      muscles: ['chest'],
      sets: 3,
      reps: '8-10',
      restSeconds: 120,
      tempo: '2-1-1',
      notes: 'Üst vücut temel itiş.',
      imageUrl: '',
      isCompleted: false,
    },
    {
      name: 'Bent Over Barbell Row',
      catalogId: 'Bent_Over_Barbell_Row',
      equipment: 'barbell',
      muscles: ['middle back'],
      sets: 3,
      reps: '8-10',
      restSeconds: 90,
      tempo: '2-1-2',
      notes: 'Üst vücut temel çekiş.',
      imageUrl: '',
      isCompleted: false,
    },
    {
      name: 'Plank',
      catalogId: 'Plank',
      equipment: 'body only',
      muscles: ['abdominals'],
      sets: 3,
      reps: '45 sn',
      restSeconds: 60,
      tempo: 'Izometrik',
      notes: 'Core stabilizasyonu.',
      imageUrl: '',
      isCompleted: false,
    },
  ]
  return {
    title: 'Dengeli Tüm Vücut Antrenman Programı',
    dayOfWeek,
    exercises,
    researchReply:
      '### Antrenman Programı Araştırması\n- Temel çömelme, yatay itiş, yatay çekiş ve core stabilitesi hareketlerinden oluşan dengeli program hazırlandı.',
  }
}

function parseCalendarEventFromPrompt(text: string): {
  title: string
  description: string
  dueOn: string
  dateDisplay: string
  startsAt: string
  endsAt: string
  startTimeStr: string
  endTimeStr: string
  timezone: string
  estimateMinutes: number
} {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1
  let day = now.getDate()

  const trDateMatch = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
  const isoDateMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (trDateMatch) {
    day = Math.min(31, Math.max(1, Number(trDateMatch[1])))
    month = Math.min(12, Math.max(1, Number(trDateMatch[2])))
    year = Number(trDateMatch[3])
  } else if (isoDateMatch) {
    year = Number(isoDateMatch[1])
    month = Math.min(12, Math.max(1, Number(isoDateMatch[2])))
    day = Math.min(31, Math.max(1, Number(isoDateMatch[3])))
  } else if (/\byarın\b/iu.test(text)) {
    const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    year = tmr.getFullYear()
    month = tmr.getMonth() + 1
    day = tmr.getDate()
  } else if (/\böbür\s+gün\b/iu.test(text)) {
    const next2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
    year = next2.getFullYear()
    month = next2.getMonth() + 1
    day = next2.getDate()
  }

  let startHour = 9
  let startMin = 0
  let durationMinutes = 60

  const rangeMatch = text.match(/(?:saat\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–]\s*([01]?\d|2[0-3])[:.]([0-5]\d)/iu)
  const saatMatch = text.match(/\bsaat\s*([01]?\d|2[0-3])(?:[:.]([0-5]\d))?/iu)
  const colonMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)

  if (rangeMatch) {
    startHour = Number(rangeMatch[1])
    startMin = Number(rangeMatch[2])
    const endHour = Number(rangeMatch[3])
    const endMin = Number(rangeMatch[4])
    const diff = endHour * 60 + endMin - (startHour * 60 + startMin)
    if (diff > 0) durationMinutes = diff
  } else if (saatMatch) {
    startHour = Number(saatMatch[1])
    startMin = saatMatch[2] ? Number(saatMatch[2]) : 0
  } else if (colonMatch) {
    startHour = Number(colonMatch[1])
    startMin = Number(colonMatch[2])
  }

  const startDate = new Date(year, month - 1, day, startHour, startMin, 0, 0)
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000)

  const pad = (n: number) => String(n).padStart(2, '0')
  const dueOn = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`
  const dateDisplay = `${pad(startDate.getDate())}.${pad(startDate.getMonth() + 1)}.${startDate.getFullYear()}`
  const startTimeStr = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`
  const endTimeStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`
  const timezone =
    typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC'

  let title = ''
  const namedMatch = text.match(
    /(.+?)\s+(?:isimli|adlı|başlıklı)\s+(?:bir\s+)?(?:not|görev|etkinlik|kayıt|randevu|toplantı)/iu,
  )
  if (namedMatch?.[1]) {
    title = namedMatch[1]
      .replace(/^(?:takvim(?:e|de)?|bugün|yarın|için|lütfen|\s)+/giu, '')
      .replace(/\b(?:takvim(?:e|de)?|bugün|yarın)\s+için\b/giu, '')
      .trim()
  }

  let description = ''
  const trailingNoteMatch =
    text.match(/.*\biçin\s+(.+?)\s+(?:ekle|oluştur|yaz|kaydet|gir)[.!?]*$/iu) ||
    text.match(/saat\s*\d{1,2}(?:[:.]\d{2})?(?:\s*[-–]\s*\d{1,2}(?:[:.]\d{2}))?\s+için\s+(.+?)[.!?]*$/iu)
  if (trailingNoteMatch?.[1]) {
    const candidate = trailingNoteMatch[1].trim()
    if (!/(?:isimli|adlı|başlıklı)/iu.test(candidate)) {
      description = candidate
    }
  }

  if (!title) {
    title = cleanTurkishNoteTitle(
      text
        .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g, '')
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
        .replace(/\bsaat\s*\d{1,2}(?:[:.]\d{2})?(?:\s*[-–]\s*\d{1,2}(?:[:.]\d{2}))?/giu, ''),
      'Takvim Etkinliği',
    )
  }

  if (!description) {
    description = title
  }

  return {
    title: title.slice(0, 140),
    description: description.slice(0, 2000),
    dueOn,
    dateDisplay,
    startsAt: startDate.toISOString(),
    endsAt: endDate.toISOString(),
    startTimeStr,
    endTimeStr,
    timezone,
    estimateMinutes: durationMinutes,
  }
}

const CREATE_VERB_RE =
  /(?:^|[^\p{L}\p{N}_])(ekle(?:yip|yebilir\p{L}*|yin|yelim)?|oluştur\p{L}*|yaz(?:abilir\p{L}*|ın|alım)?|kaydet\p{L}*|gir(?:ebilir\p{L}*|in|elim)?|not\s+al\p{L}*|aktar\p{L}*|hazırla\p{L}*|programla\p{L}*|planla\p{L}*)(?=$|[^\p{L}\p{N}_])/iu

const ESSENTIAL_EN_TR_CARDS: Array<{ front: string; back: string }> = [
  { front: 'Time (noun)', back: 'Zaman — Örn: "Time is valuable." (Zaman değerlidir.)' },
  { front: 'People (noun)', back: 'İnsanlar — Örn: "Many people work together." (Birçok insan birlikte çalışır.)' },
  { front: 'Work (noun / verb)', back: 'İş / Çalışmak — Örn: "I finish my work early." (İşimi erken bitiririm.)' },
  { front: 'Learn (verb)', back: 'Öğrenmek — Örn: "We learn something new every day." (Her gün yeni bir şey öğreniriz.)' },
  { front: 'Think (verb)', back: 'Düşünmek — Örn: "Think before you decide." (Karar vermeden önce düşün.)' },
  { front: 'Understand (verb)', back: 'Anlamak — Örn: "I understand the plan clearly." (Planı net anlıyorum.)' },
  { front: 'Important (adjective)', back: 'Önemli — Örn: "This step is very important." (Bu adım çok önemlidir.)' },
  { front: 'Because (conjunction)', back: 'Çünkü / ...dığı için — Örn: "I stayed because it rained." (Yağmur yağdığı için kaldım.)' },
  { front: 'Before / After (prep.)', back: 'Önce / Sonra — Örn: "Review before and after practice." (Pratik öncesi ve sonrası tekrar et.)' },
  { front: 'Goal (noun)', back: 'Hedef / Amaç — Örn: "Focus on one clear goal today." (Bugün tek bir net hedefe odaklan.)' },
  { front: 'Improve (verb)', back: 'Geliştirmek — Örn: "Daily practice improves memory." (Günlük pratik hafızayı geliştirir.)' },
  { front: 'Question (noun)', back: 'Soru — Örn: "Ask a clear question." (Net bir soru sor.)' },
  { front: 'Answer (noun / verb)', back: 'Cevap / Yanıtlamak — Örn: "Check the right answer." (Doğru cevabı kontrol et.)' },
  { front: 'Change (noun / verb)', back: 'Değişiklik / Değiştirmek — Örn: "Small changes matter." (Küçük değişiklikler önemlidir.)' },
  { front: 'Remember (verb)', back: 'Hatırlamak — Örn: "Remember key examples." (Temel örnekleri hatırla.)' },
  { front: 'Today (adverb / noun)', back: 'Bugün — Örn: "Start studying today." (Çalışmaya bugün başla.)' },
  { front: 'Habit (noun)', back: 'Alışkanlık — Örn: "Build a reading habit." (Okuma alışkanlığı kazan.)' },
  { front: 'Create (verb)', back: 'Oluşturmak / Yaratmak — Örn: "Create your study deck." (Çalışma desteni oluştur.)' },
  { front: 'Need (noun / verb)', back: 'İhtiyaç / İhtiyaç duymak — Örn: "What do you need?" (Neye ihtiyacın var?)' },
  { front: 'Success (noun)', back: 'Başarı — Örn: "Consistency leads to success." (İstikrar başarıya götürür.)' },
]

function buildFlashcardDeckForPrompt(text: string): {
  title: string
  cards: Array<{ front: string; back: string }>
  researchReply: string
} {
  const lower = text.toLocaleLowerCase('tr')
  const countMatch =
    text.match(/\b(\d{1,2})\s*(?:tane|adet|kelime|kart|madde|soru|ingilizce|english)\b/iu) ||
    text.match(/(?:ilk|en\s+önemli|temel)\s+(\d{1,2})\b/iu)
  const isEnglishVocab =
    /(ingilizce|english)/iu.test(lower) && /(kelime|sözcük|türkçe|word|vocabulary|temel)/iu.test(lower)

  const requestedCount = countMatch
    ? Math.max(1, Math.min(20, Number(countMatch[1])))
    : isEnglishVocab
      ? 10
      : 5

  if (isEnglishVocab) {
    const cards = ESSENTIAL_EN_TR_CARDS.slice(0, requestedCount)
    const title = `Temel İngilizce - Türkçe Kelime Kartları (İlk ${cards.length})`
    const previewLines = cards
      .slice(0, 6)
      .map((card, idx) => `${idx + 1}. **${card.front}** → ${card.back}`)
    const researchReply = [
      `### Bilgi Kartları Koleksiyonu Hazırlandı`,
      `- **Koleksiyon:** \`${title}\``,
      `- **Kart Sayısı:** ${cards.length} İngilizce ↔ Türkçe kart (en sık kullanılan günlük ve akademik temel kelimeler + örnek cümleler)`,
      ...previewLines,
      cards.length > 6 ? `- ...ve **${cards.length - 6}** kart daha onaylandığında eklenecektir.` : '',
    ]
      .filter(Boolean)
      .join('\n')
    return { title, cards, researchReply }
  }

  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*+•\d.)\s]+/, '').trim())
    .filter((l) => l.length >= 3 && !/^bilgi\s+kartlar/iu.test(l))
  if (rawLines.length >= 2) {
    const parsedCards = rawLines.slice(0, 15).map((line, idx) => {
      const sepMatch = line.match(/^([^:—–-]{2,80})\s*[:—–-]\s*(.+)$/)
      if (sepMatch?.[1] && sepMatch?.[2]) {
        return { front: sepMatch[1].trim(), back: sepMatch[2].trim() }
      }
      return { front: `Kavram ${idx + 1}: ${line.slice(0, 60)}`, back: line }
    })
    const deckTitle = cleanTurkishNoteTitle(rawLines[0] || 'Not Özeti', 'Not Kartları')
    const title = `${deckTitle} Bilgi Kartları (${parsedCards.length} Kart)`
    const researchReply = [
      `### Bilgi Kartları Koleksiyonu Hazırlandı`,
      `- **Koleksiyon:** \`${title}\``,
      `- **Kart Sayısı:** ${parsedCards.length} nottan çıkarılmış soru-cevap kartı`,
    ].join('\n')
    return { title, cards: parsedCards, researchReply }
  }

  const strippedTopic = cleanTurkishNoteTitle(
    text.replace(/(?:yeni\s+bir\s+)?(?:koleksiyon|deste)\s*(?:ekle|oluştur)?/giu, ' '),
    'Çalışma Konusu',
  )
  const topicLabel = strippedTopic || 'Genel Tekrar'
  const cards = Array.from({ length: requestedCount }, (_, idx) => ({
    front: `${topicLabel} — Soru ${idx + 1}`,
    back: `${topicLabel} temel kavramı ve kısa açıklama (${idx + 1}/${requestedCount})`,
  }))
  const title = `${topicLabel} Bilgi Kartları (${cards.length} Kart)`
  const researchReply = [
    `### Bilgi Kartları Koleksiyonu Hazırlandı`,
    `- **Koleksiyon:** \`${title}\``,
    `- **Kart Sayısı:** ${cards.length} yapılandırılmış soru-cevap kartı`,
  ].join('\n')
  return { title, cards, researchReply }
}

export type PromptIntentKind = 'update' | 'delete' | 'complete' | 'create' | 'analyze'

export function classifyPromptIntent(prompt: string): PromptIntentKind {
  const text = String(prompt || '').trim()
  if (!text) return 'analyze'

  const hasQuote = /(?:["“][^"”]+["”]|(?:^|[\s(])['‘][^'’]+['’](?=$|[\s.,:;!?)]))/.test(text)
  const hasRecordRef =
    hasQuote ||
    /(?:yazan|başlıklı|isimli|adlı|ifadesini|metnini|notunu|başlığını|kaydını|planını|görevini|içeriğini|adını)/iu.test(
      text,
    )

  const hasTransformPhrase =
    /(?:ifadesini|metnini|notunu|başlığını|kaydını|planını|görevini|içeriğini|adını)\s+.+?\s+olarak\s+(?:güncelle|değiştir|yap|ayarla|çevir|düzenle|düzelt)/iu.test(
      text,
    )
  const hasTargetedAppend =
    /(?:yazan|başlıklı|isimli|adlı)\s+.+?\s+(?:sonuna|altına|başına|içine|üzerine)\s+.+?\s+(?:ekle|yaz)(?:$|\s|[.!?])/iu.test(
      text,
    ) ||
    (hasQuote && /(?:sonuna|altına|başına|içine|üzerine)\s+.+?\s+(?:ekle|yaz)(?:$|\s|[.!?])/iu.test(text))
  const hasUpdateVerb =
    /(?:^|[^\p{L}\p{N}_])(güncelle\p{L}*|değiştir\p{L}*|düzenle\p{L}*|düzelt\p{L}*|revize\s+et\p{L}*|yeniden\s+adlandır\p{L}*)(?=$|[^\p{L}\p{N}_])/iu.test(
      text,
    )
  const hasDeleteVerb =
    /(?:^|[^\p{L}\p{N}_])(sil(?:ebil\p{L}*|in|elim)?|kaldır\p{L}*|çöp\s+kutusuna\s+(?:taşı\p{L}*|at\p{L}*))(?=$|[^\p{L}\p{N}_])/iu.test(
      text,
    )
  const hasCompleteVerb =
    /(?:^|[^\p{L}\p{N}_])(tamamla(?:ndı)?(?:\s+olarak\s+işaretle)?|bitir\p{L}*|yapıldı\s+olarak\s+işaretle)(?=$|[^\p{L}\p{N}_])/iu.test(
      text,
    )

  const isAnalyticalQuestion =
    /(?:analiz\s+et|incele|karşılaştır|raporla|özetle|durumum\s+nedir|neler\s+var|şuan\s+öyle\s+mi)/iu.test(text) &&
    !hasTransformPhrase &&
    !hasTargetedAppend &&
    !hasRecordRef

  if (isAnalyticalQuestion) return 'analyze'
  if (hasTransformPhrase || hasTargetedAppend || (hasUpdateVerb && hasRecordRef)) return 'update'
  if (hasDeleteVerb && hasRecordRef) return 'delete'
  if (hasCompleteVerb && hasRecordRef) return 'complete'
  if (hasUpdateVerb) return 'update'
  if (hasDeleteVerb) return 'delete'
  if (CREATE_VERB_RE.test(text)) return 'create'
  return 'analyze'
}

const MODULE_DISPLAY_TR: Record<string, string> = {
  quick_notes: 'Hızlı Notlar',
  plans: 'Planlar',
  todos: 'Detaylı Notlar',
  tasks: 'Görevler',
  calendar: 'Takvim',
  periodic: 'Periyodik Rutinler',
  workout: 'Antrenman Takipçisi',
  flashcards: 'Bilgi / Çalışma Kartları',
  activities: 'Listelerim',
  finance: 'Finans',
  learning: 'Öğrenme Takipçisi',
  code: 'Kod Parçacıkları',
}

interface SearchableDigestRecord {
  id: string
  module: string
  title: string
  preview: string
  source_table?: string
  version?: number
}

function normalizeTrSearch(value: unknown): string {
  return String(value || '')
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr')
}

function detectExplicitTargetModule(text: string): string | null {
  if (/hızlı\s+not\p{L}*/iu.test(text)) return 'quick_notes'
  if (/detaylı\s+not\p{L}*|zengin\s+not\p{L}*/iu.test(text)) return 'todos'
  if (/periyodik\s+(?:iş\p{L}*|görev\p{L}*|rutin\p{L}*)|(?:^|[^\p{L}])rutin\p{L}*/iu.test(text)) return 'periodic'
  if (/takvim\p{L}*|randevu\p{L}*|etkinlik\p{L}*/iu.test(text)) return 'calendar'
  if (/antrenman\p{L}*|spor\s+program\p{L}*/iu.test(text)) return 'workout'
  if (/(?:bilgi|çalışma|kelime)\s+kart\p{L}*|flashcard\p{L}*/iu.test(text)) return 'flashcards'
  if (/öğrenme\s+takipçis\p{L}*|hata\s+not\p{L}*/iu.test(text)) return 'learning'
  if (/kod\s+(?:parçacığ\p{L}*|kütüphanes\p{L}*)|snippet/iu.test(text)) return 'code'
  if (/listeler\p{L}*|aktivite\p{L}*/iu.test(text)) return 'activities'
  if (/finans\p{L}*/iu.test(text)) return 'finance'
  if (/görev\p{L}*/iu.test(text)) return 'tasks'
  if (/(?:^|[^\p{L}])plan\p{L}*/iu.test(text)) return 'plans'
  return null
}

function extractQuotedSegments(text: string): string[] {
  const results: string[] = []
  const re = /"([^"\n]{1,240})"|“([^”\n]{1,240})”|(?:^|[\s(])'([^'\n]{1,240})'(?=$|[\s.,:;!?)])|(?:^|[\s(])‘([^’\n]{1,240})’(?=$|[\s.,:;!?)])/gu
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const val = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim()
    if (val) results.push(val)
  }
  return results
}

function collectSearchableRecords(digest: AiWorkspaceDigest | null | undefined, moduleFilter: string | null): SearchableDigestRecord[] {
  if (!digest) return []
  const out: SearchableDigestRecord[] = []
  const allow = (mod: string) => !moduleFilter || moduleFilter === mod

  if (allow('quick_notes')) {
    for (const q of digest.quick_notes?.recent || []) {
      if (!q?.id) continue
      out.push({
        id: String(q.id),
        module: 'quick_notes',
        title: String(q.title || q.content || ''),
        preview: String(q.notes_preview || ''),
        source_table: String(q.source_table || 'plans'),
        version: typeof q.version === 'number' ? q.version : undefined,
      })
    }
  }
  if (allow('plans')) {
    for (const p of digest.plans?.upcoming || []) {
      if (!p?.id) continue
      out.push({
        id: String(p.id),
        module: 'plans',
        title: String(p.title || ''),
        preview: String(p.notes_preview || ''),
        source_table: String(p.source_table || 'plans'),
        version: typeof p.version === 'number' ? p.version : undefined,
      })
    }
  }
  if (allow('todos')) {
    for (const t of digest.todos?.recent || []) {
      if (!t?.id) continue
      out.push({
        id: String(t.id),
        module: 'todos',
        title: String(t.title || ''),
        preview: String(t.preview || ''),
        source_table: 'todos',
        version: typeof t.version === 'number' ? t.version : undefined,
      })
    }
  }
  if (allow('tasks') || allow('calendar')) {
    for (const t of digest.tasks?.high_priority || []) {
      if (!t?.id) continue
      out.push({
        id: String(t.id),
        module: 'tasks',
        title: String(t.title || ''),
        preview: String(t.notes_preview || ''),
        source_table: 'work_tasks',
        version: typeof t.version === 'number' ? t.version : undefined,
      })
    }
    for (const b of digest.tasks?.calendar_blocks || []) {
      const bTitle = String(b?.title || '').trim()
      if (b?.task_id && bTitle) {
        const linkedTask = (digest.tasks?.high_priority || []).find(
          t => String(t?.id || '') === String(b.task_id),
        )
        out.push({
          id: String(b.task_id),
          module: 'tasks',
          title: bTitle,
          preview: String(b.task_title || linkedTask?.title || ''),
          source_table: 'work_tasks',
          version: typeof linkedTask?.version === 'number' ? linkedTask.version : undefined,
        })
      } else if (!b?.task_id && b?.id) {
        out.push({
          id: String(b.id),
          module: 'calendar',
          title: bTitle,
          preview: '',
          source_table: 'work_blocks',
          version: typeof b.version === 'number' ? b.version : undefined,
        })
      }
    }
  }
  if (allow('periodic')) {
    for (const p of digest.periodic_tasks?.items || []) {
      if (!p?.id) continue
      out.push({
        id: String(p.id),
        module: 'periodic',
        title: String(p.title || ''),
        preview: String(p.notes_preview || ''),
        source_table: 'periodic_tasks',
        version: typeof p.version === 'number' ? p.version : undefined,
      })
    }
  }
  if (allow('activities')) {
    for (const a of digest.activities?.recent_want || []) {
      if (!a?.id) continue
      out.push({
        id: String(a.id),
        module: 'activities',
        title: String(a.title || ''),
        preview: String(a.notes_preview || ''),
        source_table: 'activity_items',
        version: typeof a.version === 'number' ? a.version : undefined,
      })
    }
  }
  if (allow('workout')) {
    for (const w of digest.workouts?.items || []) {
      if (!w?.id) continue
      out.push({
        id: String(w.id),
        module: 'workout',
        title: String(w.title || ''),
        preview: String(w.day_of_week || ''),
        source_table: 'workout_routines',
        version: typeof w.version === 'number' ? w.version : undefined,
      })
    }
  }
  if (allow('flashcards')) {
    for (const f of digest.flashcards?.items || []) {
      if (!f?.id) continue
      out.push({
        id: String(f.id),
        module: 'flashcards',
        title: String(f.title || ''),
        preview: '',
        source_table: 'flashcard_decks',
        version: typeof f.version === 'number' ? f.version : undefined,
      })
    }
  }
  if (allow('code')) {
    for (const c of digest.code_snippets?.items || []) {
      if (!c?.id) continue
      out.push({
        id: String(c.id),
        module: 'code',
        title: String(c.title || ''),
        preview: String(c.language || ''),
        source_table: 'code_snippets',
        version: typeof c.version === 'number' ? c.version : undefined,
      })
    }
  }
  if (allow('learning')) {
    for (const s of digest.learning?.subjects || []) {
      if (!s?.id) continue
      const topics = Array.isArray(s.topics) ? (s.topics as Array<Record<string, unknown>>) : []
      const topicsText = topics.map(t => String(t?.title || '')).filter(Boolean).join(', ')
      out.push({
        id: String(s.id),
        module: 'learning',
        title: String(s.title || ''),
        preview: topicsText,
        source_table: 'learning_subjects',
        version: typeof s.version === 'number' ? s.version : undefined,
      })
      for (const topic of topics) {
        if (!topic?.id) continue
        out.push({
          id: String(topic.id),
          module: 'learning',
          title: String(topic.title || ''),
          preview: `${String(s.title || '')} ${String(topic.status || 'todo')}`.trim(),
          source_table: 'learning_subjects_items',
          version: typeof topic.version === 'number' ? topic.version : undefined,
        })
      }
    }
    for (const m of digest.learning?.recent_mistakes || []) {
      if (!m?.id) continue
      out.push({
        id: String(m.id),
        module: 'learning',
        title: String(m.title || m.prompt || ''),
        preview: String(m.subject_title || m.topic_title || m.solution || ''),
        source_table: 'learning_mistakes',
        version: typeof m.version === 'number' ? m.version : undefined,
      })
    }
  }
  if (allow('activities')) {
    const actBag = (digest.activities || {}) as Record<string, unknown>
    const rawActItems = [
      ...(Array.isArray(actBag.recent_items) ? (actBag.recent_items as Array<Record<string, unknown>>) : []),
      ...(Array.isArray(actBag.recent_want) ? (actBag.recent_want as Array<Record<string, unknown>>) : []),
    ]
    const seenAct = new Set<string>()
    for (const a of rawActItems) {
      const aid = String(a?.id || '')
      if (!aid || seenAct.has(aid)) continue
      seenAct.add(aid)
      out.push({
        id: aid,
        module: 'activities',
        title: String(a.title || ''),
        preview: `${String(a.type || '')} ${String(a.status || '')}`.trim(),
        source_table: 'activity_items',
        version: typeof a.version === 'number' ? a.version : undefined,
      })
    }
  }
  if (allow('finance')) {
    for (const f of digest.finance?.recent_items || []) {
      if (!f?.id) continue
      out.push({
        id: String(f.id),
        module: 'finance',
        title: String(f.title || ''),
        preview: `${String(f.kind || '')} ${String(f.amount ?? '')} ${String(f.category || '')}`.trim(),
        source_table: 'finance_transactions',
        version: typeof f.version === 'number' ? f.version : undefined,
      })
    }
    for (const pos of digest.finance?.positions || []) {
      if (!pos?.id) continue
      out.push({
        id: String(pos.id),
        module: 'finance',
        title: String(pos.title || ''),
        preview: `${String(pos.kind || '')} ${String(pos.instrument || '')} ${String(pos.quantity ?? '')}`.trim(),
        source_table: 'finance_positions',
        version: typeof pos.version === 'number' ? pos.version : undefined,
      })
    }
    for (const rec of digest.finance?.recurring || []) {
      if (!rec?.id) continue
      out.push({
        id: String(rec.id),
        module: 'finance',
        title: String(rec.title || ''),
        preview: `${String(rec.kind || '')} ${String(rec.cadence || '')} ${String(rec.amount ?? '')}`.trim(),
        source_table: 'finance_recurring',
        version: typeof rec.version === 'number' ? rec.version : undefined,
      })
    }
  }
  return out
}

function buildCodeSnippetForPrompt(prompt: string): {
  title: string
  language: string
  code: string
  description: string
} {
  const lower = prompt.toLowerCase()
  let language = 'typescript'
  if (/\bpython\b|\bpy\b|fastapi|django|pandas/iu.test(lower)) language = 'python'
  else if (/\bsql\b|postgres|postgresql|supabase\s+query|rls/iu.test(lower)) language = 'sql'
  else if (/\bvue\b|composable|pinia/iu.test(lower)) language = 'vue'
  else if (/\breact\b|\btsx\b|\bjsx\b/iu.test(lower)) language = 'tsx'
  else if (/\bjavascript\b|\bjs\b|\bnode\b/iu.test(lower)) language = 'javascript'
  else if (/\bcss\b|tailwind|grid|flexbox/iu.test(lower)) language = 'css'
  else if (/\bbash\b|\bshell\b|powershell|curl|cli/iu.test(lower)) language = 'bash'

  const fenced = prompt.match(/```(?:[a-z0-9_+-]+)?\n([\s\S]*?)```/i)
  const stripped = prompt
    .replace(/^(?:lütfen\s+|rica etsem\s+)?(?:kod\s+kütüphanesine|kod\s+parçacıklarına|kod\s+parçacığı|snippet(?:'lere|'e)?)\s*(?:yeni\s+)?(?:ekle|oluştur|yaz|kaydet)?[:\s-]*/iu, '')
    .replace(/\b(?:kod\s+parçacığı|kod\s+kütüphanesi|snippet)\b/giu, '')
    .trim()
  const title = cleanTurkishNoteTitle(stripped || prompt, 'AI Kod Parçacığı')

  if (fenced?.[1]?.trim()) {
    return { title, language, code: fenced[1].trim(), description: prompt }
  }

  let code = ''
  if (language === 'sql') {
    code = [
      `-- ${title}`,
      'SELECT id, title, created_at',
      'FROM public.items',
      'WHERE workspace_id = :workspace_id',
      'ORDER BY created_at DESC',
      'LIMIT 25;',
    ].join('\n')
  } else if (language === 'python') {
    if (/debounce|rate|retry/iu.test(lower)) {
      code = [
        'import asyncio',
        'from functools import wraps',
        '',
        'def debounce(wait_seconds: float):',
        '    def decorator(fn):',
        '        task = None',
        '        @wraps(fn)',
        '        async def wrapper(*args, **kwargs):',
        '            nonlocal task',
        '            if task and not task.done():',
        '                task.cancel()',
        '            async def _run():',
        '                await asyncio.sleep(wait_seconds)',
        '                return await fn(*args, **kwargs)',
        '            task = asyncio.create_task(_run())',
        '            return task',
        '        return wrapper',
        '    return decorator',
      ].join('\n')
    } else {
      code = [
        `# ${title}`,
        'from typing import Any',
        '',
        'def run_task(payload: dict[str, Any]) -> dict[str, Any]:',
        '    """Process incoming workspace payload cleanly."""',
        '    return {"ok": True, "received": payload}',
      ].join('\n')
    }
  } else if (language === 'vue') {
    code = [
      `<script setup lang="ts">`,
      `import { ref } from 'vue'`,
      ``,
      `// ${title}`,
      `const items = ref<string[]>([])`,
      `</script>`,
      ``,
      `<template>`,
      `  <section class="space-y-2">`,
      `    <h3>${title}</h3>`,
      `  </section>`,
      `</template>`,
    ].join('\n')
  } else if (/debounce/iu.test(lower)) {
    code = [
      `// ${title}`,
      'export function debounce<T extends (...args: unknown[]) => void>(fn: T, waitMs = 300) {',
      '  let timer: ReturnType<typeof setTimeout> | null = null',
      '  return (...args: Parameters<T>) => {',
      '    if (timer) clearTimeout(timer)',
      '    timer = setTimeout(() => fn(...args), waitMs)',
      '  }',
      '}',
    ].join('\n')
  } else if (/jwt|token|auth/iu.test(lower)) {
    code = [
      `// ${title}`,
      'export function parseBearerToken(header?: string | null): string | null {',
      '  if (!header) return null',
      '  const match = /^Bearer\\s+(.+)$/i.exec(header.trim())',
      '  return match?.[1]?.trim() || null',
      '}',
    ].join('\n')
  } else {
    code = [
      `// ${title}`,
      'export async function executeSnippet<T>(input: T): Promise<{ ok: boolean; data: T }> {',
      '  return { ok: true, data: input }',
      '}',
    ].join('\n')
  }

  return { title, language, code, description: prompt }
}

function buildLearningContentForPrompt(
  prompt: string,
  digest?: AiWorkspaceDigest | null,
): {
  kind: 'mistake' | 'subject'
  title: string
  color: string
  topics: string[]
  prompt: string
  solution: string
  subject_id: string | null
  topic_id: string | null
} {
  const isMistake = /(hata|yanlış|yanlis|çözemedi|cozemedi|hata\s+notu|mistake)/iu.test(prompt)
  const subjects = Array.isArray(digest?.learning?.subjects) ? digest!.learning!.subjects : []
  const matchedSubject = subjects.find((s) => {
    const t = String(s?.title || '').trim().toLowerCase()
    return t.length >= 3 && prompt.toLowerCase().includes(t)
  }) || subjects[0]
  const matchedTopics = Array.isArray(matchedSubject?.topics) ? (matchedSubject!.topics as Array<Record<string, unknown>>) : []

  if (isMistake) {
    const clean = cleanTurkishNoteTitle(
      prompt.replace(/^(?:öğrenme(?:\s+takipçisine|\s+takibine|ye)?|hata\s+notu)\s*(?:ekle|oluştur|kaydet)?[:\s-]*/iu, ''),
      'Yeni Öğrenme Hatası',
    )
    const parts = clean.split(/[-–:|]/).map((s) => s.trim()).filter(Boolean)
    const questionPrompt = parts[0] || clean
    const solution = parts.length > 1
      ? parts.slice(1).join(' — ')
      : 'Temel kavramı tekrar et, benzer örnek soruyu adım adım çöz.'
    return {
      kind: 'mistake',
      title: questionPrompt,
      color: '#f43f5e',
      topics: [],
      prompt: questionPrompt,
      solution,
      subject_id: matchedSubject?.id ? String(matchedSubject.id) : null,
      topic_id: matchedTopics[0]?.id ? String(matchedTopics[0].id) : null,
    }
  }

  const stripped = prompt
    .replace(/^(?:öğrenme\s+takipçisine|öğrenme\s+takibine|öğrenmeye|öğrenme\s+konularına|çalışma\s+alanına|çalışma\s+kısmına)\s*/iu, '')
    .replace(/\b(?:öğrenme\s+(?:adına|için)|seviyesinde|bir\s+müfredat|müfredat|çalışma\s+(?:kısmına|alanına|listesine)|konularıyla|konusu|konuları|planı)\b/giu, ' ')
    .replace(/\b(?:hazırla|ekle|oluştur|yaz|kaydet|ekleyebilir\s*misin)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const rawParts = stripped
    .split(/\n|[,;•]+/g)
    .map((s) => s.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 2)

  const lower = prompt.toLocaleLowerCase('tr')
  const levelMatch = prompt.match(/\b(A1|A2|B1|B2|C1|C2)\b/i)
  const level = levelMatch ? levelMatch[1].toUpperCase() : ''
  const isCurriculum = /(müfredat|seviye|konularıyla|roadmap|çalışma\s+planı|\b(?:A1|A2|B1|B2|C1|C2)\b)/iu.test(prompt)

  let title = cleanTurkishNoteTitle(
    rawParts[0]?.split(/\s+(?:ve|için)\s+/i)[0] || stripped || prompt,
    'Yeni Öğrenme Konusu',
  )
  if (/ispanyolca|spanish/iu.test(lower)) {
    title = level ? `İspanyolca ${level} Müfredatı` : 'İspanyolca Çalışma Planı'
  } else if (/ingilizce|english/iu.test(lower)) {
    title = level ? `İngilizce ${level} Müfredatı` : 'İngilizce Çalışma Planı'
  } else if (/almanca|german/iu.test(lower)) {
    title = level ? `Almanca ${level} Müfredatı` : 'Almanca Çalışma Planı'
  } else if (/fransızca|french/iu.test(lower)) {
    title = level ? `Fransızca ${level} Müfredatı` : 'Fransızca Çalışma Planı'
  } else if (level && !title.toUpperCase().includes(level)) {
    title = `${title} (${level})`
  }

  let topics: string[] = []
  if (rawParts.length > 1) {
    topics = rawParts.slice(0, 8)
  } else {
    const colonIdx = stripped.indexOf(':')
    if (colonIdx > 0) {
      topics = stripped
        .slice(colonIdx + 1)
        .split(/[,;]|\bve\b/iu)
        .map((t) => cleanTurkishNoteTitle(t, ''))
        .filter((t) => t.length >= 2)
        .slice(0, 8)
    } else if (/ispanyolca|spanish/iu.test(lower) && (isCurriculum || level === 'A1' || !level)) {
      topics = level && level !== 'A1'
        ? [
            `${level}: Geçmiş Zamanlar (Indefinido & Imperfecto)`,
            `${level}: Dönüşlü Fiiller ve Günlük İfadeler`,
            `${level}: Nesne Zamirleri ve Karşılaştırmalar`,
            `${level}: Gelecek Zaman ve Plan İfadeleri`,
            `${level}: Diyalog, Okuma ve Dinleme Pratiği`,
          ]
        : [
            'Alfabe, Telaffuz ve Temel Selamlaşmalar',
            'Kişi Zamirleri ve Ser / Estar Fiilleri',
            'Şimdiki Zaman (Presente) Düzenli Fiiller',
            'Sayılar, Saatler, Günler ve Alışveriş',
            'Aile, Sıfatlar ve Günlük Rutinler',
            'Yön Tarifi, Restoran ve Seyahat Kalıpları',
          ]
    } else if (/(ingilizce|almanca|fransızca|english|german|french)/iu.test(lower) && (isCurriculum || level)) {
      topics = [
        `${level || 'Temel'}: Alfabe, Telaffuz ve Tanışma Kalıpları`,
        `${level || 'Temel'}: Temel Fiil Çekimleri ve Zamirler`,
        `${level || 'Temel'}: Sayılar, Zaman İfadeleri ve Günlük Rutin`,
        `${level || 'Temel'}: Alışveriş, Yol Tarifi ve Restoran Diyalogları`,
        `${level || 'Temel'}: Kısa Okuma ve Dinleme Tekrarı`,
      ]
    } else if (isCurriculum || /çalışma|plan|konuları/iu.test(prompt)) {
      topics = [
        `${title}: Temel Kavramlar & Giriş`,
        `${title}: Çekirdek Yapılar ve Kurallar`,
        `${title}: Uygulamalı Alıştırmalar`,
        `${title}: Yaygın Hatalar & Tekrar`,
        `${title}: Mini Değerlendirme`,
      ]
    }
  }

  return {
    kind: 'subject',
    title,
    color: '#6366f1',
    topics,
    prompt,
    solution: '',
    subject_id: null,
    topic_id: null,
  }
}

function buildActivityItemForPrompt(prompt: string): {
  title: string
  type: 'book' | 'movie' | 'series' | 'place'
  status: 'want' | 'in_progress' | 'completed'
  notes: string
} {
  const lower = prompt.toLocaleLowerCase('tr')
  let type: 'book' | 'movie' | 'series' | 'place' = 'book'
  if (/(?:^|[^\p{L}])(film\p{L}*|sinema\p{L}*|movie\p{L}*|belgesel\p{L}*)/iu.test(lower)) type = 'movie'
  else if (/(?:^|[^\p{L}])(dizi\p{L}*|series|sezon\p{L}*)/iu.test(lower)) type = 'series'
  else if (/(?:^|[^\p{L}])(mekan\p{L}*|kafe\p{L}*|restoran\p{L}*|cafe|museum|müze\p{L}*)/iu.test(lower)) type = 'place'

  let status: 'want' | 'in_progress' | 'completed' = 'want'
  if (/(?:^|[^\p{L}])(okudum|izledim|bitirdim|tamamladım|gittim)/iu.test(lower)) status = 'completed'
  else if (/(?:^|[^\p{L}])(okuyorum|izliyorum|devam)/iu.test(lower)) status = 'in_progress'

  const stripped = prompt
    .replace(/^(?:aktivite\s+listelerine|aktivitelere|listelerime|izleme\s+listeme|okuma\s+listeme|aktivite)\s*/iu, '')
    .replace(/(?:^|[^\p{L}])(?:kitap\p{L}*|kitab\p{L}*|film\p{L}*|dizi\p{L}*|mekan\p{L}*|belgesel\p{L}*)\s*(?:olarak|listesine)?/giu, ' ')
    .replace(/(?:^|[^\p{L}])(?:olarak|ekle|oluştur|kaydet|izledim|okudum|gittim|izlenecek|okunacak)/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const title = cleanTurkishNoteTitle(stripped || prompt, 'Aktivite Kaydı')
  return {
    title,
    type,
    status,
    notes: prompt,
  }
}

function extractChecklistFromPrompt(prompt: string): string[] {
  const lines = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const bulletLines = lines
    .filter((line) => /^(?:[-*+•]\s+|\d+[.)]\s+|\[[ xX]\]\s+)/.test(line))
    .map((line) => line.replace(/^(?:[-*+•]\s+|\d+[.)]\s+|\[[ xX]\]\s+)/, '').trim())
    .filter((line) => line.length >= 2)
  if (bulletLines.length >= 2) return bulletLines.slice(0, 12)

  const colonIdx = prompt.indexOf(':')
  if (colonIdx > 0 && /(alt\s+madde|alt\s+görev|kontrol\s+listesi|checklist|adım|adımlar|şunları)/iu.test(prompt)) {
    const tail = prompt.slice(colonIdx + 1).trim()
    const splitItems = tail
      .split(/\n|[,;]+/g)
      .map((s) => s.replace(/^[-*+\d.)\s]+/, '').trim())
      .filter((s) => s.length >= 2)
    if (splitItems.length >= 2) return splitItems.slice(0, 12)
  }
  return []
}

async function callClientSideNoteTransform(
  provider: AiProviderId,
  model: string,
  apiKey: string,
  ctx: NonNullable<AiAssistantRequest['note_context']>,
  customPrompt = '',
): Promise<{ transformed_text: string; transformed_markdown: string; reply: string } | null> {
  if (!apiKey || typeof globalThis.fetch !== 'function') return null
  const sourceMd = (htmlToStructuredMarkdown(ctx.text) || String(ctx.text || '')).trim().slice(0, 12000)
  if (!sourceMd) return null

  const instructionGuide: Record<string, string> = {
    summarize: 'Notu ana fikirleri, kararları ve kritik ayrıntıları kaybetmeden kısa, net Markdown özetine dönüştür.',
    expand: 'Mevcut maddeleri koruyarak uygulanabilir adımlar, net alt başlıklar ve kısa örneklerle geliştir.',
    action_items: 'Metindeki tüm aksiyonları `- [ ] Görev` formatında Markdown kontrol listesine çevir.',
    fix_grammar: 'Yazım, noktalama ve ifade akıcılığını düzelt; özgün dilini ve anlamını koru.',
    translate: 'Metin Türkçe ağırlıklıysa doğal İngilizceye, İngilizce ağırlıklıysa doğal Türkçeye çevir.',
    structure: 'Metni temiz Markdown başlıkları, madde işaretleri ve okunabilir bölümlerle yeniden düzenle.',
  }
  const taskPrompt = instructionGuide[ctx.instruction] || instructionGuide.structure
  const systemText = [
    'Sen çalışma alanı not editörüsün.',
    'Yalnızca geçerli JSON döndür: {"markdown":"...","reply":"..."}',
    'markdown alanında düzenli ve temiz Markdown kullan; gereksiz dış kod bloğu sarmalaması ekleme.',
    'reply alanında yapılan değişikliği Türkçe 1 kısa cümleyle özetle.',
  ].join('\n')
  const userText = [
    `İşlem: ${ctx.instruction}`,
    `Talimat: ${taskPrompt}`,
    customPrompt.trim() ? `Ek kullanıcı isteği: ${customPrompt.trim()}` : '',
    `Mevcut not içeriği (Markdown):\n${sourceMd}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    let rawText = ''
    if (provider === 'gemini') {
      const m = model || 'gemini-2.5-flash'
      const res = await globalThis.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.25 },
          }),
        },
      )
      if (!res.ok) return null
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
      }
      const parts = json?.candidates?.[0]?.content?.parts || []
      rawText = parts
        .filter((p) => p && !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('\n')
    } else if (provider === 'openai') {
      const m = model || 'gpt-4o-mini'
      const res = await globalThis.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: m,
          temperature: 0.25,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemText },
            { role: 'user', content: userText },
          ],
        }),
      })
      if (!res.ok) return null
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      rawText = String(json?.choices?.[0]?.message?.content || '')
    } else if (provider === 'anthropic') {
      const m = model || 'claude-3-5-sonnet-latest'
      const res = await globalThis.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: m,
          max_tokens: 2048,
          system: systemText,
          messages: [{ role: 'user', content: userText }],
        }),
      })
      if (!res.ok) return null
      const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> }
      rawText = (json?.content || [])
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
    }

    const parsed = parseJsonFromLlmText(rawText) as { markdown?: string; reply?: string } | null
    const md = String(parsed?.markdown || (!parsed && rawText ? rawText.replace(/^```(?:markdown|md)?\n?/i, '').replace(/```$/i, '') : '')).trim()
    if (!md) return null

    const targetFormat = ctx.target_format || 'html'
    const transformed_text =
      targetFormat === 'html'
        ? structuredMarkdownToSafeHtml(md)
        : targetFormat === 'plain'
          ? notePlainTextPreview(md, 0)
          : md
    return {
      transformed_text,
      transformed_markdown: md,
      reply: String(parsed?.reply || `Not içeriği ${provider.toUpperCase()} ile dönüştürüldü.`),
    }
  } catch {
    return null
  }
}

function resolveExistingRecordMutation(
  prompt: string,
  digest?: AiWorkspaceDigest | null,
): { handled: boolean; actions: ProposedAiAction[]; reply: string } {
  const text = String(prompt || '').trim()
  if (/(bütçe\s+limit\p{L}*|aylık\s+limit\p{L}*|kategori\s+limit\p{L}*)/iu.test(text)) {
    return { handled: false, actions: [], reply: '' }
  }
  const intent = classifyPromptIntent(text)
  if (intent !== 'update' && intent !== 'delete' && intent !== 'complete') {
    return { handled: false, actions: [], reply: '' }
  }

  const targetModule = detectExplicitTargetModule(text)
  const moduleDisplay = targetModule ? MODULE_DISPLAY_TR[targetModule] || targetModule : 'Çalışma Alanı'
  const quoted = extractQuotedSegments(text)

  let searchTarget = ''
  let newValue = ''
  let writeMode: AiNoteWriteMode = 'replace'

  if (intent === 'update') {
    const appendMatch = text.match(/(?:sonuna|altına|başına|içine|üzerine)\s+(.+?)\s+(?:ekle|yaz)[.!?]*$/iu)
    if (appendMatch?.[1] && quoted.length >= 1) {
      writeMode = /başına/iu.test(text) ? 'prepend' : 'append'
      searchTarget = quoted[0]
      newValue = (quoted.length >= 2 ? quoted[1] : appendMatch[1]).replace(/["'“”‘’]/g, '').trim()
    } else if (quoted.length >= 2) {
      searchTarget = quoted[0]
      newValue = quoted[1]
    } else {
      const replaceMatch = text.match(
        /(?:^|.*?\b(?:yazan|olan|başlıklı|isimli|adlı)\s+|(?:hızlı|detaylı)\s+not\p{L}*\s+|plan\p{L}*\s+|görev\p{L}*\s+)(.+?)\s+(?:ifadesini|metnini|notunu|başlığını|kaydını|planını|görevini|içeriğini|adını)\s+(?:sadece\s+|yalnızca\s+)?(.+?)\s+(?:olarak\s+)?(?:güncelle\p{L}*|değiştir\p{L}*|yap\p{L}*|ayarla\p{L}*|düzenle\p{L}*|düzelt\p{L}*)[.!?]*$/iu,
      )
      if (replaceMatch) {
        searchTarget = replaceMatch[1]
          .replace(/^(?:hızlı\s+not\p{L}*|detaylı\s+not\p{L}*|plan\p{L}*|görev\p{L}*)\s+(?:yazan|olan|ki)?\s*/iu, '')
          .replace(/["'“”‘’]/g, '')
          .trim()
        newValue = replaceMatch[2]
          .replace(/^(?:sadece|yalnızca)\s+/iu, '')
          .replace(/["'“”‘’]/g, '')
          .trim()
      } else if (quoted.length === 1) {
        searchTarget = quoted[0]
      }
    }
  } else {
    if (quoted.length >= 1) {
      searchTarget = quoted[0]
    } else {
      searchTarget = text
        .replace(
          /^(?:lütfen\s+)?(?:hızlı\s+not\p{L}*|detaylı\s+not\p{L}*|plan\p{L}*|görev\p{L}*|takvim\p{L}*|periyodik\s+\p{L}*|listeler\p{L}*)\s*(?:üzerindeki|içindeki|yazan|olan)?\s*/iu,
          '',
        )
        .replace(
          /\s*(?:ifadesini|metnini|notunu|başlığını|kaydını|planını|görevini|etkinliğini)?\s*(?:sil\p{L}*|kaldır\p{L}*|çöp\s+kutusuna\s+(?:taşı\p{L}*|at\p{L}*)|tamamla\p{L}*|tamamlandı\s+olarak\s+işaretle|bitir\p{L}*|yapıldı\s+olarak\s+işaretle)[.!?]*$/iu,
          '',
        )
        .trim()
    }
  }

  const candidates = collectSearchableRecords(digest, targetModule)
  const normSearch = normalizeTrSearch(searchTarget)

  if (!normSearch || (intent === 'update' && !newValue.trim())) {
    const sampleList = candidates
      .slice(0, 5)
      .map(c => `\`${c.title}\``)
      .join(', ')
    return {
      handled: true,
      actions: [],
      reply: [
        `### Düzenleme Hedefi Netleştirilemedi`,
        `Bu komut mevcut bir kaydı düzenleme/güncelleme niyeti taşıyor; yeni not olarak eklenmedi.`,
        `Lütfen tırnak içinde hedef kayıt başlığını ve yeni değerini açıkça yazın (ör. \`hızlı notlarda yazan "test notu" ifadesini sadece "test" olarak güncelle\`).`,
        sampleList ? `**${moduleDisplay} içindeki son kayıtlar:** ${sampleList}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    }
  }

  let best: { rec: SearchableDigestRecord; score: number; matchedField: 'title' | 'notes' } | null = null
  for (const rec of candidates) {
    const normTitle = normalizeTrSearch(rec.title)
    const normPreview = normalizeTrSearch(rec.preview)
    let score = 0
    let matchedField: 'title' | 'notes' = 'title'
    if (normTitle === normSearch) {
      score = 3
    } else if (normSearch.length >= 2 && normTitle.includes(normSearch)) {
      score = 2
    } else if (normSearch.length >= 2 && normPreview.includes(normSearch)) {
      score = 1
      matchedField = 'notes'
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { rec, score, matchedField }
    }
  }

  if (!best) {
    const sampleList = candidates
      .slice(0, 5)
      .map(c => `\`${c.title}\``)
      .join(', ')
    return {
      handled: true,
      actions: [],
      reply: [
        `### Eşleşen Kayıt Bulunamadı`,
        `**${moduleDisplay}** alanında \`"${searchTarget}"\` ifadesiyle eşleşen mevcut bir kayıt bulunamadı. Yanlışlıkla yeni bir kayıt oluşturulmaması için işlem durduruldu.`,
        sampleList ? `**${moduleDisplay} içindeki son kayıtlar:** ${sampleList}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    }
  }

  const matched = best.rec
  const modDisplay = MODULE_DISPLAY_TR[matched.module] || matched.module

  if (intent === 'delete') {
    return {
      handled: true,
      actions: [
        {
          module: matched.module,
          operation: 'delete',
          target_id: matched.id,
          write_mode: 'replace',
          title: matched.title,
          summary: `${modDisplay} kaydını sil: "${matched.title}"`,
          payload: {
            id: matched.id,
            title: matched.title,
            ...(matched.source_table ? { source_table: matched.source_table } : {}),
            ...(matched.version !== undefined ? { expected_version: matched.version } : {}),
          },
        },
      ],
      reply: [
        `### Kayıt Silme Önizlemesi Hazır`,
        `- **Hedef Modül:** ${modDisplay}`,
        `- **Silinecek Kayıt:** "${matched.title}"`,
        `Onayladığınızda kayıt kaldırılacak; **Geçmiş & Geri Al** sekmesinden tek tıkla geri getirilebilir.`,
      ].join('\n'),
    }
  }

  if (intent === 'complete') {
    const learningSubject =
      matched.source_table === 'learning_subjects_items'
        ? (digest?.learning?.subjects || []).find(
            s => Array.isArray(s.topics) && s.topics.some((tp: any) => String(tp?.id || '') === matched.id),
          )
        : undefined
    return {
      handled: true,
      actions: [
        {
          module: matched.module,
          operation: 'complete',
          target_id: matched.id,
          write_mode: 'replace',
          title: matched.title,
          summary: `${modDisplay} kaydını tamamlandı işaretle: "${matched.title}"`,
          payload: {
            id: matched.id,
            title: matched.title,
            completed: true,
            status: 'done',
            ...(learningSubject?.id ? { subject_id: String(learningSubject.id) } : {}),
            ...(matched.source_table ? { source_table: matched.source_table } : {}),
            ...(matched.version !== undefined ? { expected_version: matched.version } : {}),
          },
        },
      ],
      reply: [
        `### Kayıt Tamamlama Hazırlandı`,
        `- **Hedef Modül:** ${modDisplay}`,
        `- **Kayıt:** "${matched.title}" → Tamamlandı`,
      ].join('\n'),
    }
  }

  // intent === 'update'
  const learningSubject =
    matched.source_table === 'learning_subjects_items'
      ? (digest?.learning?.subjects || []).find(
          s => Array.isArray(s.topics) && s.topics.some((tp: any) => String(tp?.id || '') === matched.id),
        )
      : undefined
  const updatePayload: Record<string, unknown> = {
    ...(learningSubject?.id ? { subject_id: String(learningSubject.id) } : {}),
    ...(matched.source_table ? { source_table: matched.source_table } : {}),
    ...(matched.version !== undefined ? { expected_version: matched.version } : {}),
  }

  if (matched.module === 'tasks' && /(alt\s*madde|alt\s*görev|checklist|altına\s+.+?\s+ekle)/iu.test(text) && writeMode !== 'replace') {
    updatePayload.checklist_append = newValue
  } else if (matched.module === 'flashcards' && (writeMode !== 'replace' || /(kart|front|back|->|:)/iu.test(text))) {
    updatePayload.card_patch = newValue
    updatePayload.card_mode = writeMode
  } else if (matched.module === 'workout' && (writeMode !== 'replace' || /(egzersiz|set|tekrar|\d+\s*[x×]\s*\d+)/iu.test(text))) {
    updatePayload.exercise_patch = newValue
    updatePayload.exercise_mode = writeMode
  } else if (writeMode !== 'replace' || best.matchedField === 'notes') {
    updatePayload.title = matched.title
    updatePayload.notes =
      matched.module === 'todos' ? structuredMarkdownToSafeHtml(newValue) : newValue
    updatePayload.description = updatePayload.notes
    updatePayload.write_mode = writeMode
  } else {
    updatePayload.title = newValue
    if (matched.module === 'quick_notes') {
      updatePayload.text = newValue
    }
  }

  return {
    handled: true,
    actions: [
      {
        module: matched.module,
        operation: 'update',
        target_id: matched.id,
        write_mode: writeMode,
        title: writeMode === 'replace' && best.matchedField === 'title' ? newValue : matched.title,
        summary:
          writeMode === 'replace' && best.matchedField === 'title'
            ? `${modDisplay} kaydını güncelle: "${matched.title}" → "${newValue}"`
            : `${modDisplay} notunu güncelle: "${matched.title}"`,
        payload: updatePayload,
      },
    ],
    reply: [
      `### Kayıt Güncelleme Hazırlandı`,
      `- **Hedef Modül:** ${modDisplay}`,
      `- **Mevcut Kayıt:** "${matched.title}"`,
      `- **Yeni Değer (${writeMode}):** "${newValue}"`,
      `Onayladığınızda mevcut kayıt doğrudan güncellenecek; dilerseniz tek tıkla geri alınabilir.`,
    ].join('\n'),
  }
}

function detectUnsupportedCapabilityReply(prompt: string): string | null {
  const text = String(prompt || '').trim()
  if (!text) return null
  if (/(çöp\s+kutusu|\btrash\b|paylaşım\s*(?:ayar|yetki)|üye\s+ekle|yetki\s+ver)/iu.test(text)) {
    return 'Çöp Kutusu yönetimi veya çalışma alanı paylaşım / üye yetkileri üzerinde AI ile doğrudan işlem yapılamıyor.'
  }
  if (/(outlook|harici\s+takvim|google\s+calendar)/iu.test(text)) {
    return 'Harici takvim (Outlook) etkinlikleri salt okunurdur; AI yalnızca çalışma alanınızdaki yerel görevleri ve takvim bloklarını yönetebilir.'
  }
  return null
}

function splitCompoundPromptClauses(prompt: string): string[] {
  const text = String(prompt || '').trim()
  if (!text) return []
  const hemMatch = text.match(/^(?:hem\s+)?(.+?)\s+hem(?:\s+de)?\s+(.+)$/iu)
  if (hemMatch?.[1] && hemMatch?.[2]) {
    return [hemMatch[1].trim(), hemMatch[2].trim()].filter(c => c.length >= 6)
  }
  const semi = text.split(/\s*;\s*/).map(s => s.trim()).filter(s => s.length >= 6)
  if (semi.length > 1) return semi
  return [text]
}

function buildFinancePositionPayload(text: string): {
  title: string
  kind: 'forex' | 'crypto' | 'metal' | 'stock' | 'other'
  instrument: string
  price_source: 'manual' | 'frankfurter' | 'coingecko' | 'market'
  quantity: number
  buy_price: number
  purchased_on: string
} {
  const lower = text.toLocaleLowerCase('tr')
  const today = new Date().toISOString().slice(0, 10)
  const nums = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)/g)).map(m => Number(m[1].replace(',', '.')))
  const quantity = nums.length >= 1 && Number.isFinite(nums[0]) && nums[0] > 0 ? nums[0] : 1
  const buyPrice = nums.length >= 2 && Number.isFinite(nums[1]) && nums[1] >= 0 ? nums[1] : 1

  let kind: 'forex' | 'crypto' | 'metal' | 'stock' | 'other' = 'other'
  let instrument = ''
  let priceSource: 'manual' | 'frankfurter' | 'coingecko' | 'market' = 'manual'

  if (/\b(usd|dolar)\b/iu.test(lower)) {
    kind = 'forex'
    instrument = 'USD'
    priceSource = 'frankfurter'
  } else if (/\b(eur|euro)\b/iu.test(lower)) {
    kind = 'forex'
    instrument = 'EUR'
    priceSource = 'frankfurter'
  } else if (/\b(gbp|sterlin)\b/iu.test(lower)) {
    kind = 'forex'
    instrument = 'GBP'
    priceSource = 'frankfurter'
  } else if (/\b(btc|bitcoin)\b/iu.test(lower)) {
    kind = 'crypto'
    instrument = 'bitcoin'
    priceSource = 'coingecko'
  } else if (/\b(eth|ethereum)\b/iu.test(lower)) {
    kind = 'crypto'
    instrument = 'ethereum'
    priceSource = 'coingecko'
  } else if (/\b(sol|solana)\b/iu.test(lower)) {
    kind = 'crypto'
    instrument = 'solana'
    priceSource = 'coingecko'
  } else if (/(altın|gram\s+altın|\bxau\b)/iu.test(lower)) {
    kind = 'metal'
    instrument = 'XAU'
    priceSource = 'market'
  } else if (/(hisse|bist|nasdaq)/iu.test(lower)) {
    kind = 'stock'
    priceSource = 'manual'
  }

  const title = cleanTurkishNoteTitle(
    text.replace(/^(?:finans(?:a|lara)?|portföy(?:e|üme)?|pozisyon(?:a|lara)?)\s*/iu, ''),
    instrument ? `${instrument} Pozisyonu` : 'AI Pozisyon Kaydı',
  )

  return {
    title,
    kind,
    instrument,
    price_source: priceSource,
    quantity,
    buy_price: buyPrice,
    purchased_on: today,
  }
}

export function buildActionFromPrompt(prompt: string, digest?: AiWorkspaceDigest | null, allowSplit = true): ProposedAiAction[] {
  const text = String(prompt || '').trim()
  if (!text) return []

  const lower = text.toLocaleLowerCase('tr')
  if (isSecureVaultPrompt(text) || lower.includes('secure')) {
    return []
  }
  if (detectUnsupportedCapabilityReply(text)) {
    return []
  }

  if (allowSplit) {
    const clauses = splitCompoundPromptClauses(text)
    if (clauses.length > 1) {
      const combined = clauses.flatMap(clause => buildActionFromPrompt(clause, digest, false))
      const distinctModules = new Set(combined.map(a => a.module))
      if (distinctModules.size >= 2) {
        return combined
      }
    }
  }

  // Handle update/delete/complete intents on existing records BEFORE any creation heuristic
  const existingResolution = resolveExistingRecordMutation(text, digest)
  if (existingResolution.handled) {
    return existingResolution.actions
  }

  const actions: ProposedAiAction[] = []
  const hasWriteVerb = CREATE_VERB_RE.test(text)
  const explicitTargetNote =
    /(detaylı\s+not\p{L}*|detaylılar\p{L}*|hızlı\s+not\p{L}*|günlük\s+plan\p{L}*|haftalık\s+plan\p{L}*|aylık\s+plan\p{L}*|yıllık\s+plan\p{L}*|bugünkü\s+plan\p{L}*)/iu.test(
      text,
    )

  // 0. Pomodoro Focus Timer control
  if (/(pomodoro|odak\s+sayac\p{L}*|zamanlayıcı\p{L}*|\btimer\b)/iu.test(text)) {
    let command: 'start' | 'pause' | 'reset' | 'mode' = 'start'
    let mode: 'focus' | 'shortBreak' | 'longBreak' | undefined
    if (/(durdur|duraklat|beklet|pause)/iu.test(lower)) command = 'pause'
    else if (/(sıfırla|iptal|bitir|reset)/iu.test(lower)) command = 'reset'
    else if (/(kısa\s+mola|short\s*break)/iu.test(lower)) {
      command = 'mode'
      mode = 'shortBreak'
    } else if (/(uzun\s+mola|long\s*break)/iu.test(lower)) {
      command = 'mode'
      mode = 'longBreak'
    } else if (/(odak\s+mod|focus\s+mode)/iu.test(lower)) {
      command = 'mode'
      mode = 'focus'
    }
    const minMatch = text.match(/(\d{1,2})\s*(?:dk|dakika)/iu)
    const minutes = minMatch ? Math.min(90, Math.max(10, Number(minMatch[1]))) : undefined
    const labelMap = {
      start: 'Pomodoro zamanlayıcısını başlat',
      pause: 'Pomodoro zamanlayıcısını duraklat',
      reset: 'Pomodoro zamanlayıcısını sıfırla',
      mode: mode === 'shortBreak' ? 'Kısa Mola moduna geç' : mode === 'longBreak' ? 'Uzun Mola moduna geç' : 'Odak moduna geç',
    }
    actions.push({
      module: 'pomodoro',
      operation: 'control',
      write_mode: 'replace',
      title: labelMap[command],
      summary: minutes ? `${labelMap[command]} (${minutes} dk)` : labelMap[command],
      payload: {
        command,
        ...(mode ? { mode } : {}),
        ...(minutes ? { minutes } : {}),
      },
    })
    return actions
  }

  // 1. Workout Tracker ("antrenman takipçisi", "sırt antrenmanı", "spor programı", ...)
  if (
    /(antrenman|egzersiz|spor\s+programı|fitness|sırt\s+antrenmanı|göğüs\s+antrenmanı|bacak\s+antrenmanı|omuz\s+antrenmanı|kol\s+antrenmanı|workout)/iu.test(
      text,
    ) &&
    hasWriteVerb
  ) {
    const program = buildWorkoutProgramForPrompt(text)
    actions.push({
      module: 'workout',
      operation: 'save_routine',
      write_mode: 'append',
      title: program.title,
      summary: `Antrenman Takipçisine program ekle: "${program.title}" (${program.exercises.length} egzersiz)`,
      payload: {
        title: program.title,
        day_of_week: program.dayOfWeek,
        exercises: program.exercises,
      },
    })
  } else if (
    // 2. Calendar / Time Block ("takvime ...", explicit date + saat, or randevu/etkinlik when not targeting another note module)
    (/(takvim|takvime|takvimde)/iu.test(text) ||
      (!explicitTargetNote &&
        (/(randevu|etkinlik)/iu.test(text) ||
          (/toplantı/iu.test(text) && !/toplantı\s+(özeti|notu|notları)/iu.test(text)) ||
          /(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2}|\bbugün\b|\byarın\b).*?\bsaat\s*\d{1,2}/iu.test(text)))) &&
    hasWriteVerb
  ) {
    const cal = parseCalendarEventFromPrompt(text)
    actions.push({
      module: 'calendar',
      operation: 'save_event',
      write_mode: 'append',
      title: cal.title,
      summary: `Takvime etkinlik ve not ekle: "${cal.title}" (${cal.dateDisplay} · ${cal.startTimeStr}–${cal.endTimeStr})`,
      payload: {
        title: cal.title,
        description: cal.description,
        due_on: cal.dueOn,
        starts_at: cal.startsAt,
        ends_at: cal.endsAt,
        timezone: cal.timezone,
        estimate_minutes: cal.estimateMinutes,
        status: 'todo',
        priority: 'medium',
      },
    })
  } else if (
    /(bilgi\s+kart\p{L}*|çalışma\s+kart\p{L}*|kelime\s+kart\p{L}*|flashcard\p{L}*|kart\s+(?:destes\p{L}*|koleksiyon\p{L}*))/iu.test(
      text,
    ) &&
    hasWriteVerb
  ) {
    const deck = buildFlashcardDeckForPrompt(text)
    actions.push({
      module: 'flashcards',
      operation: 'save_deck',
      write_mode: 'append',
      title: deck.title,
      summary: `Bilgi Kartlarına yeni koleksiyon ekle: "${deck.title}" (${deck.cards.length} kart)`,
      payload: {
        title: deck.title,
        color: '#6366f1',
        cards: deck.cards,
      },
    })
  } else if (/(öğrenme\s+takip|öğrenme\s+konu|öğrenmeye|öğrenme\s+(?:adına|için|planı|müfredat)|müfredat|çalışma\s+(?:kısmına|alanına|listesine|konu|planı)|hata\s+notu|mistake)/iu.test(text) && hasWriteVerb) {
    const built = buildLearningContentForPrompt(text, digest)
    if (built.kind === 'mistake') {
      actions.push({
        module: 'learning',
        operation: 'mistake.create',
        write_mode: 'append',
        title: built.title,
        summary: `Öğrenme Takipçisine hata notu ekle: "${built.title}"`,
        payload: {
          entity: 'mistake',
          title: built.title,
          prompt: built.prompt,
          solution: built.solution,
          ...(built.subject_id ? { subject_id: built.subject_id } : {}),
          ...(built.topic_id ? { topic_id: built.topic_id } : {}),
        },
      })
    } else {
      actions.push({
        module: 'learning',
        operation: 'save_topic',
        write_mode: 'append',
        title: built.title,
        summary: built.topics.length
          ? `Öğrenme Takipçisine "${built.title}" konusu ve ${built.topics.length} alt başlık ekle`
          : `Öğrenme Takipçisine yeni konu ekle: "${built.title}"`,
        payload: {
          title: built.title,
          color: built.color,
          ...(built.topics.length ? { topics: built.topics } : {}),
          notes: text,
        },
      })
    }
  } else if (/(kod\s+parçacığı|kod\s+kütüphanesi|snippet|fonksiyon\s+yaz|script\s+yaz)/iu.test(text) && hasWriteVerb) {
    const snippet = buildCodeSnippetForPrompt(text)
    actions.push({
      module: 'code',
      operation: 'save_snippet',
      write_mode: 'append',
      title: snippet.title,
      summary: `Kod Parçacıklarına (${snippet.language}) kayıt ekle: "${snippet.title}"`,
      payload: {
        title: snippet.title,
        language: snippet.language,
        code: snippet.code,
        description: snippet.description,
      },
    })
  } else if (/(?:hızlı\s+not(?:a|lara|uma|u)?|quick\s*notes?)/iu.test(text) && hasWriteVerb) {
    const stripped = text.replace(/^(?:yeni\s+)?(?:bir\s+)?(?:hızlı\s+not(?:a|lara|uma|u)?|quick\s*notes?)[:\s-]*/iu, '')
    const cleanTitle = cleanTurkishNoteTitle(stripped, 'Hızlı Not')
    actions.push({
      module: 'quick_notes',
      operation: 'save_note',
      write_mode: 'append',
      title: cleanTitle,
      summary: `Hızlı Notlar alanına yeni kayıt: "${cleanTitle}"`,
      payload: {
        title: cleanTitle,
        text: cleanTitle,
        period: 'timeless',
        notes: cleanTitle,
      },
    })
  } else if (/(detaylı\s+not|zengin\s+not|doküman|todo)/iu.test(text) && hasWriteVerb) {
    const stripped = text.replace(/^(?:yeni\s+)?(?:detaylı\s+not(?:a|lara)?|zengin\s+not(?:a|lara)?|doküman(?:a|lara)?|todo(?:ya|lara)?)[:\s-]*/iu, '')
    const cleanTitle = cleanTurkishNoteTitle(stripped, text.slice(0, 90))
    actions.push({
      module: 'todos',
      operation: 'save_todo',
      write_mode: 'append',
      title: cleanTitle,
      summary: `Detaylı Notlar modülüne zengin metinli kayıt: "${cleanTitle}"`,
      payload: {
        title: cleanTitle,
        priority: 'medium',
        description: structuredMarkdownToSafeHtml(`## ${cleanTitle}\n\n- ${text}\n- [ ] İlk kontrol adımını tamamla`),
        notes: structuredMarkdownToSafeHtml(`## ${cleanTitle}\n\n- ${text}\n- [ ] İlk kontrol adımını tamamla`),
      },
    })
  } else if (
    /(^|\s)(plan\p{L}*|(?:günlük|haftalık|aylık|yıllık)\s+(?:plan\p{L}*|kısm\p{L}*|kısım|sekme\p{L}*|alan\p{L}*|bölüm\p{L}*))(\s|$|[.,!?:;])/iu.test(
      text,
    ) &&
    /(ekle|oluştur|yaz|kaydet|gir|not|hazırla)/iu.test(text)
  ) {
    const quotedText = extractQuotedSegments(text)[0]
    const stripped = text
      .replace(
        /^(?:yeni\s+)?(?:plan\p{L}*\s+(?:alanındaki|içindeki|üzerindeki|sekmesindeki)?\s*)?(?:(?:hızlı\s+not|günlük|haftalık|aylık|yıllık)\s+(?:plan\p{L}*|kısm\p{L}*|kısım|sekme\p{L}*|alan\p{L}*|bölüm\p{L}*)?\s*)?/iu,
        '',
      )
      .replace(/^(?:yeni\s+)?(?:günlük\s+|haftalık\s+|aylık\s+|yıllık\s+)?plan\p{L}*[:\s-]*/iu, '')
    const cleanTitle = quotedText ? quotedText.trim() : cleanTurkishNoteTitle(stripped, 'AI Plan Önerisi')
    const period: PlanPeriod = /(hızlı\s+not|timeless)/iu.test(lower)
      ? 'timeless'
      : lower.includes('haftalık')
        ? 'weekly'
        : lower.includes('aylık')
          ? 'monthly'
          : lower.includes('yıllık')
            ? 'yearly'
            : 'daily'
    actions.push({
      module: 'plans',
      operation: 'save_plan',
      write_mode: 'append',
      title: cleanTitle,
      summary: `Planlar (${period}) modülüne yeni plan kaydı: "${cleanTitle}"`,
      payload: {
        title: cleanTitle,
        period,
        period_date: periodStart(period, new Date()),
        scope: period === 'weekly' ? 'weekly' : 'daily',
        priority: lower.includes('acil') || lower.includes('yüksek') ? 'high' : 'medium',
        notes: cleanTitle,
      },
    })
  } else if (/(periyodik|rutin|hatırlatma|alışkanlık)/iu.test(text) && hasWriteVerb) {
    const stripped = text.replace(/^(?:yeni\s+)?(?:periyodik\s+|rutin(?:e|lere)?\s+|hatırlatma(?:ya)?\s+)*/iu, '')
    const cleanTitle = cleanTurkishNoteTitle(stripped, 'AI Rutin Önerisi')
    actions.push({
      module: 'periodic',
      operation: 'save_task',
      write_mode: 'append',
      title: cleanTitle,
      summary: `Periyodik görevlere yeni rutin kaydı: "${cleanTitle}"`,
      payload: {
        title: cleanTitle,
        category: 'habit',
        frequency: 'daily',
        notes: `AI Rutin Notu: ${text}`,
      },
    })
  } else if (/(görev|göreve|görevlere|task|yapılacak)/iu.test(text) && hasWriteVerb) {
    const checklist = extractChecklistFromPrompt(text)
    const stripped = text.replace(/^(?:yeni\s+)?(?:görev(?:e|lere)?|task|yapılacak)(?:l?a?r?a?)?\s*(?:şu\s+nottan\s+)?(?:alt\s+maddeli\s+)?(?:yeni\s+bir\s+görev\s+)?(?:ekle|oluştur|yaz|gir)?[:\s-]*/iu, '')
    const firstLine = (stripped.split(/\r?\n/)[0] || stripped).trim()
    const cleanTitle = cleanTurkishNoteTitle(
      checklist.length ? firstLine.split(':')[0] || firstLine : firstLine,
      'AI Görev Kaydı',
    )
    const descLines = [`### Görev Detayı`, `- ${firstLine || text}`]
    if (checklist.length) {
      descLines.push('', '### Alt Maddeler', ...checklist.map((item) => `- [ ] ${item}`))
    }
    actions.push({
      module: 'tasks',
      operation: 'upsert_task',
      write_mode: 'append',
      title: cleanTitle,
      summary: checklist.length
        ? `Görevler modülüne ${checklist.length} alt maddeli görev ekle: "${cleanTitle}"`
        : `Görevler modülüne açıklamalı görev kaydı: "${cleanTitle}"`,
      payload: {
        title: cleanTitle,
        status: 'todo',
        priority: lower.includes('acil') || lower.includes('yüksek') ? 'high' : 'medium',
        description: descLines.join('\n'),
        ...(checklist.length ? { checklist } : {}),
      },
    })
  } else if (/(pozisyon\p{L}*|portföy\p{L}*|hisse\p{L}*|kripto\p{L}*|altın|döviz|\b(?:usd|eur|btc|eth|xau)\b)/iu.test(text) && hasWriteVerb) {
    const pos = buildFinancePositionPayload(text)
    actions.push({
      module: 'finance',
      operation: 'save_position',
      write_mode: 'append',
      title: pos.title,
      summary: `Finans Pozisyonlarına ekle: "${pos.title}" (${pos.quantity} adet @ ${pos.buy_price})`,
      payload: {
        entity: 'position',
        ...pos,
      },
    })
  } else if (/(bütçe\s+limit\p{L}*|aylık\s+limit\p{L}*|kategori\s+limit\p{L}*)/iu.test(text) && (hasWriteVerb || /ayarla|belirle|koy/iu.test(text))) {
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/)
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 1000
    const catMatch = text.match(/(?:için|kategoris\p{L}*|bütçe\s+limit\p{L}*)\s+([a-zçğıöşü0-9\s-]{2,30})/iu)
    const categoryName = cleanTurkishNoteTitle(catMatch?.[1] || text, 'Genel')
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
    actions.push({
      module: 'finance',
      operation: 'set_budget',
      write_mode: 'replace',
      title: `${categoryName} Bütçe Limiti`,
      summary: `Finans Bütçe Limitini ayarla: ${categoryName} (${amount} TL)`,
      payload: {
        entity: 'budget',
        category: categoryName,
        amount,
        scope: /ileri|her\s+ay|sürekli/iu.test(lower) ? 'forward' : 'month',
        month: monthStart,
      },
    })
  } else if (/(tekrarlayan\s+işlem\p{L}*|otomatik\s+ödeme\p{L}*|abonelik\p{L}*|her\s+(?:ay|hafta|yıl)\s+)/iu.test(text) && hasWriteVerb) {
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/)
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 100
    const isIncome = /(gelir|maaş|tahsilat|kira\s+gelir)/iu.test(text)
    const cadence = /hafta/iu.test(lower) ? 'weekly' : /yıl/iu.test(lower) ? 'yearly' : 'monthly'
    const recTitle = cleanTurkishNoteTitle(
      text.replace(/^(?:tekrarlayan\s+işlem\p{L}*|finans(?:a|lara)?)\s*/iu, ''),
      isIncome ? 'Tekrarlayan Gelir' : 'Tekrarlayan Gider',
    )
    actions.push({
      module: 'finance',
      operation: 'save_recurring',
      write_mode: 'append',
      title: recTitle,
      summary: `Tekrarlayan Finans İşlemi ekle: "${recTitle}" (${amount} TL / ${cadence})`,
      payload: {
        entity: 'recurring',
        title: recTitle,
        kind: isIncome ? 'income' : 'expense',
        amount,
        cadence,
        starts_on: new Date().toISOString().slice(0, 10),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul',
      },
    })
  } else if (/(harcama|gelir|gider|finans|bütçe|fatura|işlem)/iu.test(text) && hasWriteVerb) {
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/)
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 100
    const isIncome = /(gelir|maaş|tahsilat)/iu.test(text)
    const finTitle = cleanTurkishNoteTitle(
      text
        .replace(/^(?:finans(?:a|lara)?|harcama|gelir|gider|işlem)\s*(?:olarak)?\s*/iu, '')
        .replace(/\b(?:ekle|oluştur|kaydet|gir|yaz)\b/giu, ''),
      isIncome ? 'AI Gelir Kaydı' : 'AI Gider Kaydı',
    )
    actions.push({
      module: 'finance',
      operation: 'save_transaction',
      write_mode: 'append',
      title: finTitle,
      summary: `Finans modülüne "${finTitle}" (${amount} TL, ${isIncome ? 'Gelir' : 'Gider'})`,
      payload: {
        title: finTitle,
        kind: isIncome ? 'income' : 'expense',
        amount,
        category: isIncome ? 'other_income' : 'general',
        note: text,
      },
    })
  } else if (/(film|dizi|kitap|mekan|aktivite|listelerim)/iu.test(text) && hasWriteVerb) {
    const act = buildActivityItemForPrompt(text)
    actions.push({
      module: 'activities',
      operation: 'save_item',
      write_mode: 'append',
      title: act.title,
      summary: `Listelerim modülüne (${act.type}) kayıt: "${act.title}"`,
      payload: {
        title: act.title,
        type: act.type,
        status: act.status,
        notes: act.notes,
      },
    })
  } else if (hasWriteVerb && /\bnot(?:a|lara|u|unu)?\b/iu.test(text)) {
    const cleanTitle = cleanTurkishNoteTitle(text, 'Hızlı Not')
    actions.push({
      module: 'quick_notes',
      operation: 'save_note',
      write_mode: 'append',
      title: cleanTitle,
      summary: `Hızlı Notlar alanına yeni kayıt: "${cleanTitle}"`,
      payload: {
        title: cleanTitle,
        text: cleanTitle,
        period: 'timeless',
        notes: text,
      },
    })
  }

  return actions
}

const CONVERSATIONAL_GREETING_RE =
  /(?:^|[^\p{L}\p{N}_])(merhaba|selam|slm|hey|günaydın|iyi\s+akşamlar|iyi\s+geceler|nasılsın\p{L}*|naber|ne\s+haber|iyi\s+misin|teşekkür\p{L}*|sağ\s+ol|eyvallah|kimsin|kendini\s+tanıt)(?=$|[^\p{L}\p{N}_])/iu

const CONVERSATIONAL_NEGATION_RE =
  /(?:^|[^\p{L}\p{N}_])(hiçbirine|ekleme|yazma|kaydetme|vazgeç\p{L}*|iptal\s+et|olmasın|boşver|gerek\s+yok)(?=$|[^\p{L}\p{N}_])/iu

const CONVERSATIONAL_QUESTION_RE =
  /\?|(?:^|[^\p{L}\p{N}_])(saat\s+kaç|ayın\s+kaçı|hangi\s+gün|günlerden\s+ne|tarih\s+ne\p{L}*|hava\s+durumu|nasıl|neler\p{L}*|ne\s+ekleyebilir\p{L}*|ne\s+yapabilir\p{L}*|ne\s+önerir\p{L}*|fikir\s+ver\p{L}*|ne\s+dersin|hangisi|acaba|yardım\s+et|anlat\p{L}*)(?=$|[^\p{L}\p{N}_])/iu

export function isConversationalOnlyPrompt(prompt: string): boolean {
  const text = String(prompt || '').trim()
  if (!text) return false
  if (CONVERSATIONAL_NEGATION_RE.test(text)) return true
  if (CONVERSATIONAL_QUESTION_RE.test(text)) return true
  const hasStructuredData = /\d{1,2}[:.]\d{2}|\d+\s*(?:tl|₺|lira|dolar|eur|\$|€)/iu.test(text)
  if (CONVERSATIONAL_GREETING_RE.test(text) && !hasStructuredData && text.split(/\s+/).length <= 8) {
    return true
  }
  return false
}

export function buildConversationalReply(prompt: string, digest?: AiWorkspaceDigest | null): string {
  const text = String(prompt || '').trim()
  const lower = text.toLocaleLowerCase('tr')
  const hasNegation = CONVERSATIONAL_NEGATION_RE.test(text)
  const hasQuestion = CONVERSATIONAL_QUESTION_RE.test(text)
  const pendingPlans = Number(digest?.plans?.pending_count || 0)
  const pendingTasks = Number(digest?.tasks?.pending_count || 0)

  const prefix = hasNegation ? 'Tamam, hiçbir yere eklemedim. ' : ''

  if (hasQuestion) {
    if (/(hava\s+durumu|sıcaklık|yağmur|kaç\s+derece|hava\s+nasıl)/iu.test(lower)) {
      return `${prefix}Canlı hava durumu tahmini için Edge Function + internet aracı (\`get_weather_forecast\`) gerekir; şu an çevrimdışı yerel sentez modundayım ve internete çıkamıyorum.`
    }
    if (/(saat\s+kaç|ayın\s+kaçı|hangi\s+gün|günlerden\s+ne|tarih\s+ne)/iu.test(lower)) {
      const now = new Date()
      const timeStr = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
      const dateStr = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(now)
      if (/yarın/iu.test(lower)) {
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        const tomorrowStr = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(tomorrow)
        return `${prefix}Yarın **${tomorrowStr}**. (Şu an saat **${timeStr}** — ${dateStr})`
      }
      return `${prefix}Şu an saat **${timeStr}** — **${dateStr}**.`
    }
    if (/(takvim|tkavim|randevu|zaman\s+bloğ)/iu.test(lower)) {
      return (
        `${prefix}Takvim alanına günlük akışını netleştirecek pek çok şey ekleyebiliriz:\n` +
        `- **Saatli Zaman Blokları:** Toplantılar, randevular, odaklanma veya ders çalışma saatleri (ör. *"Yarın 14:00–15:30 proje sunumu"*)\n` +
        `- **Son Tarihli Görevler:** Takvimde tarih bazlı takip etmek istediğin işler ve alt görevleri\n` +
        `- **Periyodik Rutinler:** Her gün veya haftalık tekrar eden alışkanlıkların\n\n` +
        `İstersen aklındaki etkinliği saat/gün belirterek doğal bir cümleyle yazabilir ya da \`/Takvim\` seçip doğrudan gönderebilirsin.`
      )
    }
    if (/(plan|günlük|haftalık|aylık|yıllık|hızlı\s+not)/iu.test(lower)) {
      return (
        `${prefix}Planlar bölümünde fikirlerini zamana göre organize edebiliriz:\n` +
        `- **Hızlı Not:** Aklına gelen anlık fikir ve notlar\n` +
        `- **Günlük / Haftalık / Aylık / Yıllık:** Kısa ve uzun vadeli hedefler (ör. \`/Notlar › Planlar › Yıllık\` seçerek doğrudan ilgili sekmeye yazdırabilirsin).\n\n` +
        `Şu an **${pendingPlans}** bekleyen planın var; istersen birlikte gözden geçirebilir veya yenisini ekleyebiliriz.`
      )
    }
    if (/(finans|bütçe|harcama|gelir|gider)/iu.test(lower)) {
      return (
        `${prefix}Finans alanında gelir/gider işlemlerini, aylık kategori bütçe limitlerini, yatırım pozisyonlarını ve tekrarlayan ödemelerini takip edebiliriz. Doğal bir cümleyle (ör. *"Bugün markete 450 TL harcadım"*) yazman yeterli.`
      )
    }
    if (/(öğrenme|ders|müfredat|bilgi\s+kart)/iu.test(lower)) {
      return (
        `${prefix}Öğrenme alanında yeni konu ve müfredatlar oluşturabilir, hata notları tutabilir ve pratik yapmak için Bilgi Kartları desteleri hazırlayabiliriz. Hangi konu üzerinde çalışmak istersin?`
      )
    }
    return (
      `${prefix}Elbette! Seninle doğal şekilde sohbet edebilir, çalışma alanındaki (**${pendingPlans}** plan, **${pendingTasks}** görev) verileri analiz edebilir ya da not, takvim bloğu, görev, öğrenme konusu ve finans kaydı oluşturabilirim. Ne üzerine konuşmak veya planlamak istersin?`
    )
  }

  if (hasNegation) {
    return 'Tamam, hiçbir işlem yapmadım ve hiçbir yere eklemedim. Nasıl devam etmek istersin?'
  }

  if (CONVERSATIONAL_GREETING_RE.test(text)) {
    if (/teşekkür|sağ\s+ol|eyvallah/iu.test(lower)) {
      return 'Rica ederim! Her zaman buradayım, başka bir şey planlamak veya sormak istersen söylemen yeterli.'
    }
    if (/kimsin|kendini\s+tanıt/iu.test(lower)) {
      return 'Ben çalışma alanı asistanınım. Notlarını, planlarını, takvimini, görevlerini, öğrenme konularını ve finans takibini düzenlemene yardımcı olurum; ayrıca aklındakileri birlikte konuşup netleştirebiliriz.'
    }
    return `Selam! İyiyim, teşekkürler; seninle çalışmaya hazırım. Şu an ${pendingPlans} bekleyen planın ve ${pendingTasks} görevin görünüyor. Bugün neler yapmak istersin?`
  }

  return 'Anladım. İstediğin zaman bir soru sorabilir veya eklemek/düzenlemek istediğin bir şeyi doğal cümleyle paylaşabilirsin.'
}

/**
 * Semantic fallback scorer for local mode: when a natural-language prompt lacks
 * explicit module keywords (e.g. "yarın 14:00 dişçi", "aylık 5000 TL market",
 * "react hooks çalış"), scores plausible destination modules and returns 2-4
 * clickable clarification options instead of failing or dumping to quick_notes.
 */
export function buildClarificationForAmbiguousPrompt(
  prompt: string,
  _digest?: AiWorkspaceDigest | null,
  scope?: AiPromptScope | null,
): AiClarificationPrompt | null {
  const text = String(prompt || '').trim()
  if (!text || text.length < 2) return null
  if (scope?.module) return null
  if (isSecureVaultPrompt(text) || isConversationalOnlyPrompt(text)) return null
  if (detectUnsupportedCapabilityReply(text)) return null

  const lower = text.toLocaleLowerCase('tr')
  const cleanTitle = cleanTurkishNoteTitle(text, text.slice(0, 60))
  const todayIso = periodStart('daily', new Date())
  const options: AiClarificationOption[] = []
  const seenKeys = new Set<string>()

  const pushOption = (opt: AiClarificationOption) => {
    const key = `${opt.action.module}:${opt.action.operation}:${String(opt.action.payload?.period || opt.action.payload?.entity || '')}`
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    options.push(opt)
  }

  const hasTimeOrScheduleCue =
    /(?:^|[^\p{L}\p{N}_])(?:\d{1,2}[:.]\d{2}|yarın|bugün|öbür\s+gün|haftaya|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|randevu|toplantı|buluşma|etkinlik)(?=$|[^\p{L}\p{N}_])/iu.test(
      lower,
    )
  const hasMoneyCue =
    /\d+\s*(?:tl|₺|lira|dolar|eur|euro|\$|€)(?=$|[^\p{L}\p{N}_])|(?:^|[^\p{L}\p{N}_])(?:bütçe|harcama|fatura|maaş|gelir|gider|ödeme|market|kira|sınır)(?=$|[^\p{L}\p{N}_])/iu.test(
      lower,
    )
  const hasLearningCue =
    /(?:^|[^\p{L}\p{N}_])(?:öğren\p{L}*|çalış\p{L}*|tekrar\p{L}*|konu\p{L}*|müfredat|kelime|sınav|ders|ingilizce|ispanyolca|almanca|fransızca)(?=$|[^\p{L}\p{N}_])/iu.test(
      lower,
    )
  const hasCodeCue =
    /(?:^|[^\p{L}\p{N}_])(?:kod|snippet|fonksiyon|sql|regex|script|typescript|javascript|python|vue|react|api|hata\s+çözüm)(?=$|[^\p{L}\p{N}_])/iu.test(
      lower,
    )
  const hasWorkoutCue =
    /(?:^|[^\p{L}\p{N}_])(?:spor|koşu|yürüyüş|fitness|egzersiz|antrenman|kardiyo|squat|bench|deadlift)(?=$|[^\p{L}\p{N}_])/iu.test(
      lower,
    )

  if (hasTimeOrScheduleCue) {
    const cal = parseCalendarEventFromPrompt(text)
    pushOption({
      id: 'opt-calendar',
      label: 'Takvime Zaman Bloğu Olarak Ekle',
      description: `${cal.dateDisplay} · ${cal.startTimeStr}–${cal.endTimeStr}`,
      action: {
        module: 'calendar',
        operation: 'upsert_task',
        write_mode: 'append',
        title: cal.title || cleanTitle,
        summary: `Takvime zaman bloğu ekle: "${cal.title || cleanTitle}"`,
        payload: {
          title: cal.title || cleanTitle,
          description: text,
          due_on: cal.dueOn,
          starts_at: cal.startsAt,
          ends_at: cal.endsAt,
          estimate_minutes: cal.estimateMinutes,
          status: 'todo',
          priority: 'medium',
        },
      },
    })
    pushOption({
      id: 'opt-tasks',
      label: 'Görevlere Ekle',
      description: 'Yapılacaklar listesinde takip et',
      action: {
        module: 'tasks',
        operation: 'upsert_task',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Görevler modülüne ekle: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          description: text,
          due_on: cal.dueOn || todayIso,
          status: 'todo',
          priority: 'medium',
        },
      },
    })
    pushOption({
      id: 'opt-plans-daily',
      label: 'Günlük Plana Ekle',
      description: 'Bugünün plan akışına not düş',
      action: {
        module: 'plans',
        operation: 'save_plan',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Planlar (daily) modülüne ekle: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          period: 'daily',
          period_date: periodStart('daily', new Date()),
          scope: 'daily',
          priority: 'medium',
          notes: text,
        },
      },
    })
  }

  if (hasMoneyCue) {
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/)
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '.')) : 0
    const isIncome = /\b(?:gelir|maaş|kazanç|tahsilat|prim)\b/iu.test(lower)
    const isBudgetCue = /\b(?:bütçe|limit|sınır|aşma|aylık)\b/iu.test(lower)
    if (isBudgetCue) {
      pushOption({
        id: 'opt-finance-budget',
        label: 'Finans Bütçe Limiti Ayarla',
        description: amount ? `Aylık limit: ${amount} TL` : 'Kategori / aylık bütçe sınırı tanımla',
        action: {
          module: 'finance',
          operation: 'save_budget',
          write_mode: 'append',
          title: cleanTitle,
          summary: `Bütçe limiti ayarla: "${cleanTitle}"`,
          payload: {
            entity: 'budget',
            category: cleanTitle,
            limit_amount: amount || 1000,
            period: 'monthly',
          },
        },
      })
    }
    pushOption({
      id: 'opt-finance-tx',
      label: isIncome ? 'Finans Gelir İşlemi Kaydet' : 'Finans Gider İşlemi Kaydet',
      description: amount ? `Tutar: ${amount} TL` : 'Gelir / Gider kaydı oluştur',
      action: {
        module: 'finance',
        operation: 'save_transaction',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Finans (${isIncome ? 'Gelir' : 'Gider'}) kaydı: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          kind: isIncome ? 'income' : 'expense',
          amount,
          occurred_at: new Date().toISOString(),
        },
      },
    })
  }

  if (hasLearningCue) {
    pushOption({
      id: 'opt-learning',
      label: 'Öğrenme Takipçisine Konu Ekle',
      description: 'Konular ve ilerleme takibinde yer alır',
      action: {
        module: 'learning',
        operation: 'subject.create',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Öğrenme Takipçisine konu ekle: "${cleanTitle}"`,
        payload: {
          name: cleanTitle,
          title: cleanTitle,
          topics: [cleanTitle],
          notes: text,
        },
      },
    })
    pushOption({
      id: 'opt-flashcards',
      label: 'Bilgi Kartları Destesi Oluştur',
      description: 'Tekrar kartları olarak kaydet',
      action: {
        module: 'flashcards',
        operation: 'save_deck',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Bilgi Kartlarına deste ekle: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          color: '#6366f1',
          cards: [{ front: cleanTitle, back: text }],
        },
      },
    })
  }

  if (hasCodeCue) {
    pushOption({
      id: 'opt-code',
      label: 'Kod Kütüphanesine Kaydet',
      description: 'Kod parçacığı ve açıklama olarak sakla',
      action: {
        module: 'code',
        operation: 'save_snippet',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Kod Kütüphanesine ekle: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          language: 'typescript',
          code: `// ${cleanTitle}\n`,
          notes: text,
        },
      },
    })
  }

  if (hasWorkoutCue) {
    const program = buildWorkoutProgramForPrompt(text)
    pushOption({
      id: 'opt-workout',
      label: 'Antrenman Takipçisine Ekle',
      description: 'Egzersiz programı / rutin olarak kaydet',
      action: {
        module: 'workout',
        operation: 'save_routine',
        write_mode: 'append',
        title: program.title || cleanTitle,
        summary: `Antrenman Takipçisine ekle: "${program.title || cleanTitle}"`,
        payload: {
          title: program.title || cleanTitle,
          day_of_week: program.dayOfWeek || 'Any',
          exercises: program.exercises,
        },
      },
    })
  }

  // Ensure at least 2-3 clear options by rounding out with general destinations
  if (options.length < 3) {
    pushOption({
      id: 'opt-plans-daily-fallback',
      label: 'Günlük Plana Ekle',
      description: 'Planlar › Günlük sekmesine kaydeder',
      action: {
        module: 'plans',
        operation: 'save_plan',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Planlar (daily) modülüne ekle: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          period: 'daily',
          period_date: periodStart('daily', new Date()),
          scope: 'daily',
          priority: 'medium',
          notes: text,
        },
      },
    })
  }
  if (options.length < 3) {
    pushOption({
      id: 'opt-tasks-fallback',
      label: 'Görev Olarak Ekle',
      description: 'Takvim › Görevler listesine ekler',
      action: {
        module: 'tasks',
        operation: 'upsert_task',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Görevler modülüne ekle: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          description: text,
          status: 'todo',
          priority: 'medium',
        },
      },
    })
  }
  if (options.length < 3) {
    pushOption({
      id: 'opt-quick-notes-fallback',
      label: 'Hızlı Notlara Ekle',
      description: 'Planlar › Hızlı Not alanına ekler',
      action: {
        module: 'quick_notes',
        operation: 'create',
        write_mode: 'append',
        title: cleanTitle,
        summary: `Hızlı Notlara ekle: "${cleanTitle}"`,
        payload: {
          title: cleanTitle,
          text,
          period: 'timeless',
        },
      },
    })
  }

  const finalOptions = options.slice(0, 4)
  if (finalOptions.length < 2) return null

  return {
    question: `"${cleanTitle}" ifadesini hangi modüle uygulamamı istersiniz? Aşağıdan bir seçenek belirleyebilirsiniz:`,
    options: finalOptions,
  }
}

export function synthesizeWorkspaceAnalysis(
  digest: AiWorkspaceDigest,
  prompt = '',
  scope?: AiPromptScope | null,
): {
  reply: string
  insights: AiInsightItem[]
  recommendations: AiRecommendationItem[]
  proposed_actions: ProposedAiAction[]
  clarification?: AiClarificationPrompt | null
} {
  const pendingTasks = Number(digest.tasks?.pending_count || 0)
  const overdueTasks = Number(digest.tasks?.overdue_count || 0)
  const pendingPlans = Number(digest.plans?.pending_count || 0)
  const overduePlans = Number(digest.plans?.overdue_count || 0)
  const activeTodos = Number(digest.todos?.active_count || 0)
  const quickNotesCount = Number(digest.quick_notes?.total_count || 0)
  const unresolvedMistakes = Number(digest.learning?.unresolved_mistakes || 0)
  const activeTopics = Number(digest.learning?.active_topics || 0)
  const periodicTotal = Number(digest.periodic_tasks?.total_count || 0)
  const expense30d = Number(digest.finance?.expense_30d || 0)
  const income30d = Number(digest.finance?.income_30d || 0)
  const wantActivities = Number(digest.activities?.want_count || 0)

  const insights: AiInsightItem[] = []
  const recommendations: AiRecommendationItem[] = []

  if (overdueTasks > 0 || overduePlans > 0) {
    insights.push({
      title: 'Gecikmiş İş Yükü Tespit Edildi',
      detail: `Çalışma alanında ${overdueTasks} gecikmiş görev ve ${overduePlans} gecikmiş plan bulunuyor.`,
      severity: 'warning',
      module: overdueTasks >= overduePlans ? 'tasks' : 'plans',
    })
    recommendations.push({
      title: 'Gecikmiş Görev ve Planları Yeniden Önceliklendirin',
      reason: 'Biriken gecikmiş kayıtlar odak dağılmasına yol açar; en kritik 3 maddeyi bugünkü plana taşıyın.',
      suggested_action: {
        module: 'plans',
        operation: 'save_plan',
        write_mode: 'append',
        title: 'Gecikmiş Görev Toparlanma Oturumu',
        summary: 'Bugünkü planlara 1 odak oturumu ekle',
        payload: {
          title: 'Gecikmiş Görev Toparlanma Oturumu',
          period: 'daily',
          scope: 'daily',
          priority: 'high',
          notes: `Toparlanma Adımları: ${overdueTasks} gecikmiş görevi ve ${overduePlans} devreden planı gözden geçir.`,
        },
      },
    })
  } else {
    insights.push({
      title: 'Plan ve Görev Takvimi Dengeli',
      detail: `${pendingTasks} aktif görev ve ${pendingPlans} bekleyen plan zamanında ilerliyor.`,
      severity: 'success',
      module: 'plans',
    })
  }

  if (unresolvedMistakes > 0) {
    insights.push({
      title: 'Çözülmemiş Öğrenme Hataları Var',
      detail: `Öğrenme modülünde ${activeTopics} aktif konu ve ${unresolvedMistakes} çözülmemiş hata kaydı mevcut.`,
      severity: 'info',
      module: 'learning',
    })
    recommendations.push({
      title: 'Hata Çözüm Notlarını Zenginleştirin',
      reason: `${unresolvedMistakes} çözülmemiş hata için adım adım çözüm notu yazmak kalıcı öğrenmeyi hızlandırır.`,
      suggested_action: {
        module: 'todos',
        operation: 'save_todo',
        write_mode: 'append',
        title: 'Öğrenme Hataları Tekrar Notu',
        summary: 'Detaylı Notlar modülüne hata tekrar şablonu ekle',
        payload: {
          title: 'Öğrenme Hataları Tekrar Notu',
          priority: 'medium',
          description: structuredMarkdownToSafeHtml(
            `### Tekrar Edilecek Hatalar (${unresolvedMistakes})\n- [ ] Hata nedenini kendi cümlelerinle özetle\n- [ ] Doğru çözüm örneğini not alanına ekle`,
          ),
          notes: structuredMarkdownToSafeHtml(
            `### Tekrar Edilecek Hatalar (${unresolvedMistakes})\n- [ ] Hata nedenini kendi cümlelerinle özetle\n- [ ] Doğru çözüm örneğini not alanına ekle`,
          ),
        },
      },
    })
  }

  if (expense30d > 0 || income30d > 0) {
    const net = income30d - expense30d
    insights.push({
      title: 'Son 30 Gün Finans Özeti',
      detail: `Son 30 günde gelir: ${income30d.toFixed(2)}, gider: ${expense30d.toFixed(2)} (Net: ${net.toFixed(2)}).`,
      severity: net >= 0 ? 'info' : 'warning',
      module: 'finance',
    })
  }
  const positionCount = digest.finance?.position_count ?? digest.finance?.positions?.length ?? 0
  const recurringCount = digest.finance?.recurring_count ?? digest.finance?.recurring?.length ?? 0
  const budgetCount = digest.finance?.budgets?.length ?? 0
  if (positionCount > 0 || recurringCount > 0 || budgetCount > 0) {
    insights.push({
      title: 'Portföy ve Tekrarlayan Finans Durumu',
      detail: `${positionCount} aktif pozisyon, ${recurringCount} tekrarlayan işlem ve ${budgetCount} kategori bütçe limiti izleniyor.`,
      severity: 'info',
      module: 'finance',
    })
  }

  if (periodicTotal > 0 || wantActivities > 0 || activeTodos > 0 || quickNotesCount > 0) {
    insights.push({
      title: 'Not ve Rutin Ekosistemi Özeti',
      detail: `${activeTodos} detaylı not, ${quickNotesCount} hızlı not, ${periodicTotal} periyodik rutin ve ${wantActivities} bekleyen aktivite kaydı bulunuyor.`,
      severity: 'info',
      module: 'todos',
    })
  }

  const upcomingBlocks = digest.tasks?.calendar_blocks || []
  if (upcomingBlocks.length === 0 && pendingTasks > 0) {
    insights.push({
      title: 'Zaman Bloku Planlanmamış Görevler',
      detail: `Bekleyen ${pendingTasks} görevinize karşılık takvimde zaman bloku bulunmuyor.`,
      severity: 'info',
      module: 'calendar_blocks',
    })
    recommendations.push({
      title: 'Bekleyen Görev İçin Takvime Odak Bloku Ekle',
      reason: 'Takvim zaman blokları bekleyen görevlerin zamanında tamamlanmasını hızlandırır.',
    })
  } else if (upcomingBlocks.length > 0) {
    insights.push({
      title: 'Takvim Zaman Blokları Planlı',
      detail: `Yaklaşan ${upcomingBlocks.length} takvim zaman bloku aktif.`,
      severity: 'success',
      module: 'calendar_blocks',
    })
  }

  const workoutCount = digest.workouts?.total_count ?? digest.workouts?.items?.length ?? 0
  if (workoutCount > 0) {
    insights.push({
      title: 'Antrenman Programları Hazır',
      detail: `${workoutCount} kayıtlı antrenman rutini takip için hazır.`,
      severity: 'info',
      module: 'workouts',
    })
  }

  const deckCount = digest.flashcards?.total_count ?? digest.flashcards?.items?.length ?? 0
  if (deckCount > 0) {
    insights.push({
      title: 'Bilgi Kartı Desteleri',
      detail: `${deckCount} aktif bilgi kartı destesi çalışma için hazır.`,
      severity: 'info',
      module: 'flashcards',
    })
  }

  const scopedPrompt = applyPromptScope(prompt, scope)
  const mutationResolution = resolveExistingRecordMutation(scopedPrompt, digest)
  const rawActions = mutationResolution.handled
    ? mutationResolution.actions
    : buildActionFromPrompt(scopedPrompt, digest)
  const proposed_actions = enforceScopeOnActions(rawActions, scope, prompt)

  const summaryParts = [
    `Çalışma alanınız analiz edildi: **${pendingPlans}** bekleyen plan (${overduePlans} devreden), **${pendingTasks}** bekleyen görev (${overdueTasks} gecikmiş), **${activeTodos}** detaylı not ve **${quickNotesCount}** hızlı not bulundu.`,
  ]
  if (unresolvedMistakes > 0) {
    summaryParts.push(`Öğrenme takipçisinde **${unresolvedMistakes}** çözülmemiş hata tekrar bekliyor.`)
  }
  if (proposed_actions.length > 0) {
    summaryParts.push(
      mutationResolution.handled
        ? `İsteğinize uygun **${proposed_actions.length}** düzenleme/güncelleme aksiyonu hazırlandı.`
        : `İsteğinize uygun **${proposed_actions.length}** veri girişi/not aksiyonu hazırlandı.`,
    )
  }

  let domainReply = ''
  if (mutationResolution.handled) {
    domainReply = mutationResolution.reply
  } else if (proposed_actions[0]?.module === 'workout') {
    domainReply = buildWorkoutProgramForPrompt(prompt).researchReply
  } else if (proposed_actions[0]?.module === 'flashcards') {
    domainReply = buildFlashcardDeckForPrompt(prompt).researchReply
  } else if (proposed_actions[0]?.module === 'calendar') {
    const cal = parseCalendarEventFromPrompt(prompt)
    domainReply = [
      `### Takvim Etkinliği & Not Planlandı`,
      `- **Başlık:** ${cal.title}`,
      `- **Tarih & Saat:** ${cal.dateDisplay} · ${cal.startTimeStr}–${cal.endTimeStr} (${cal.timezone})`,
      `- **Not:** ${cal.description}`,
      `Onayladığınızda **Görevler / Takvim** modülüne zaman bloğu ve not olarak eklenecektir.`,
    ].join('\n')
  } else if (proposed_actions[0]?.module === 'code') {
    const snippet = proposed_actions[0]
    domainReply = [
      `### Kod Parçacığı Hazırlandı`,
      `- **Başlık:** \`${snippet.title}\``,
      `- **Dil:** ${String(snippet.payload?.language || 'typescript')}`,
      `Onayladığınızda **Kod Parçacıkları** kütüphanenize eklenecektir.`,
    ].join('\n')
  } else if (proposed_actions[0]?.module === 'learning') {
    const act = proposed_actions[0]
    const topics = Array.isArray(act.payload?.topics) ? act.payload.topics : []
    domainReply = [
      `### Öğrenme Kaydı Hazırlandı`,
      `- **Başlık:** \`${act.title}\``,
      topics.length ? `- **Alt Konular:** ${topics.join(', ')}` : `- **Tür:** ${act.operation === 'mistake.create' ? 'Hata Notu' : 'Konu Kaydı'}`,
      `Onayladığınızda **Öğrenme Takipçisi** modülüne eklenecektir.`,
    ].join('\n')
  } else if (proposed_actions[0]?.module === 'activities') {
    const act = proposed_actions[0]
    domainReply = [
      `### Aktivite Listesi Kaydı Hazırlandı`,
      `- **Başlık:** \`${act.title}\``,
      `- **Kategori:** ${String(act.payload?.type || 'book')}`,
      `Onayladığınızda **Aktiviteler & Listeler** modülüne eklenecektir.`,
    ].join('\n')
  } else if (proposed_actions[0]?.module === 'finance') {
    const act = proposed_actions[0]
    domainReply = [
      `### Finans İşlemi Hazırlandı`,
      `- **Başlık:** \`${act.title}\` (${String(act.payload?.amount ?? 0)} TL)`,
      `- **Tür:** ${act.payload?.kind === 'income' ? 'Gelir' : 'Gider'}`,
      `Onayladığınızda **Finans** modülüne kaydedilecektir.`,
    ].join('\n')
  }

  const isAnalysisPrompt =
    !prompt.trim() ||
    (!/(hava\s+durumu)/iu.test(prompt) &&
      /(?:^|[^\p{L}\p{N}_])(analiz|özet|rapor|durumum|durumu\s+nedir|neler\s+var|incele|istatistik|özetle|öneri\s+ver)(?=$|[^\p{L}\p{N}_])/iu.test(
        prompt,
      ))

  let clarification: AiClarificationPrompt | null = null
  let finalReply: string
  if (domainReply) {
    finalReply = proposed_actions.length > 0 ? `${domainReply}\n\n${summaryParts.join(' ')}` : domainReply
  } else if (proposed_actions.length > 0 || isAnalysisPrompt) {
    finalReply = summaryParts.join(' ')
  } else {
    const unsupportedReply = detectUnsupportedCapabilityReply(prompt)
    if (unsupportedReply) {
      finalReply = unsupportedReply
    } else if (isConversationalOnlyPrompt(prompt)) {
      finalReply = buildConversationalReply(prompt, digest)
    } else {
      clarification = buildClarificationForAmbiguousPrompt(prompt, digest, scope)
      finalReply =
        clarification?.question ||
        'Bu komut için doğrudan uygulanabilir bir işlem eşleştirilemedi veya talep ettiğiniz özellik henüz AI tarafından desteklenmiyor. Desteklenen modüllerden birini (**Görevler**, **Takvim**, **Öğrenme Konusu / Müfredat**, **Hızlı / Detaylı Notlar**, **Kod Parçacıkları**, **Finans Gelir/Gider**, **Aktiviteler**, **Bilgi Kartları**, **Antrenman**) belirterek veya `/` ile dizin seçerek komutu netleştirebilirsiniz.'
    }
  }

  return {
    reply: finalReply,
    insights,
    recommendations,
    proposed_actions,
    clarification,
  }
}

export async function fetchAiSettings(client: any = supabase): Promise<AiSettingsState> {
  const local = readLocalSettings()
  const { data, error } = await client.rpc('ai_settings_get')
  if (error) {
    if (isMissingSchemaRpcError(error)) {
      return localSettingsToState(local)
    }
    throw error
  }
  const defaults = defaultAiSettings()
  if (!data || typeof data !== 'object') return localSettingsToState(local)
  const provider = (
    ['gemini', 'openai', 'anthropic'].includes(data.provider) ? data.provider : defaults.provider
  ) as AiProviderId
  return {
    provider,
    model: String(data.model || defaults.model),
    write_mode: (data.write_mode === 'auto_apply' ? 'auto_apply' : 'ask_before_write') as AiWriteMode,
    configured_providers: {
      gemini: Boolean(data.configured_providers?.gemini || local.api_keys.gemini),
      openai: Boolean(data.configured_providers?.openai || local.api_keys.openai),
      anthropic: Boolean(data.configured_providers?.anthropic || local.api_keys.anthropic),
    },
    key_hints: {
      gemini: data.key_hints?.gemini || formatKeyHint(local.api_keys.gemini),
      openai: data.key_hints?.openai || formatKeyHint(local.api_keys.openai),
      anthropic: data.key_hints?.anthropic || formatKeyHint(local.api_keys.anthropic),
    },
  }
}

export async function saveAiSettings(
  payload: {
    provider: AiProviderId
    model: string
    write_mode: AiWriteMode
    api_key?: string | null
    clear_key?: boolean
  },
  client: any = supabase,
): Promise<AiSettingsState> {
  const local = readLocalSettings()
  const trimmedKey = payload.api_key ? payload.api_key.trim() : null
  const updatedKeys: Partial<Record<AiProviderId, string>> = { ...local.api_keys }
  if (payload.clear_key) {
    delete updatedKeys[payload.provider]
  } else if (trimmedKey) {
    updatedKeys[payload.provider] = trimmedKey
  }
  const nextLocal: LocalSettingsRecord = {
    provider: payload.provider,
    model: payload.model,
    write_mode: payload.write_mode,
    api_keys: updatedKeys,
  }
  writeLocalSettings(nextLocal)

  const { data, error } = await client.rpc('ai_settings_save', {
    provider: payload.provider,
    model: payload.model,
    write_mode: payload.write_mode,
    api_key: trimmedKey,
    clear_provider: payload.clear_key ? payload.provider : null,
  })
  if (error) {
    if (isMissingSchemaRpcError(error)) {
      return localSettingsToState(nextLocal)
    }
    throw error
  }
  // Once server-side credentials are confirmed in private.user_ai_credentials, clear plaintext keys from localStorage.
  if (data?.configured_providers?.[payload.provider]) {
    writeLocalSettings({
      provider: payload.provider,
      model: payload.model,
      write_mode: payload.write_mode,
      api_keys: {},
    })
  }
  const defaults = defaultAiSettings()
  return {
    provider: (data?.provider || payload.provider) as AiProviderId,
    model: String(data?.model || payload.model || defaults.model),
    write_mode: (data?.write_mode === 'auto_apply' ? 'auto_apply' : 'ask_before_write') as AiWriteMode,
    configured_providers: {
      gemini: Boolean(data?.configured_providers?.gemini || updatedKeys.gemini),
      openai: Boolean(data?.configured_providers?.openai || updatedKeys.openai),
      anthropic: Boolean(data?.configured_providers?.anthropic || updatedKeys.anthropic),
    },
    key_hints: {
      gemini: data?.key_hints?.gemini || formatKeyHint(updatedKeys.gemini),
      openai: data?.key_hints?.openai || formatKeyHint(updatedKeys.openai),
      anthropic: data?.key_hints?.anthropic || formatKeyHint(updatedKeys.anthropic),
    },
  }
}

function normalizeDigest(raw: any, workspaceId: string): AiWorkspaceDigest {
  if (!raw || typeof raw !== 'object') {
    return { workspace_id: workspaceId, generated_at: new Date().toISOString() }
  }
  const plansRaw = raw.plans || {}
  const plansItems = Array.isArray(plansRaw.items) ? plansRaw.items : Array.isArray(plansRaw.upcoming) ? plansRaw.upcoming : []
  const quickItems = plansItems.filter((p: any) => p?.period === 'timeless')

  const tasksRaw = raw.tasks || {}
  const taskCounts = tasksRaw.counts || {}
  const tasksPending =
    tasksRaw.pending_count ??
    (Number(taskCounts.todo || 0) + Number(taskCounts.doing || 0))

  const detailedRaw = raw.detailed_notes || raw.todos || {}
  const periodicRaw = raw.periodic_tasks || raw.periodic || {}
  const learningRaw = raw.learning || {}
  const financeRaw = raw.finance || {}
  const activitiesRaw = raw.activities || {}
  const quickNotesRaw = raw.quick_notes || {}
  const workoutsRaw = raw.workouts || {}
  const flashcardsRaw = raw.flashcards || {}
  const codeRaw = raw.code_snippets || raw.code || {}

  return {
    workspace_id: String(raw.workspace_id || raw.workspace?.id || workspaceId),
    generated_at: String(raw.generated_at || raw.workspace?.generated_at || new Date().toISOString()),
    plans: {
      pending_count: Number(plansRaw.pending_count ?? plansRaw.active_count ?? 0),
      completed_count: Number(plansRaw.completed_count ?? 0),
      overdue_count: Number(plansRaw.overdue_count ?? plansRaw.carried_count ?? 0),
      upcoming: plansItems,
    },
    tasks: {
      pending_count: Number(tasksPending),
      completed_count: Number(tasksRaw.completed_count ?? taskCounts.done ?? 0),
      overdue_count: Number(tasksRaw.overdue_count ?? taskCounts.overdue ?? 0),
      high_priority: Array.isArray(tasksRaw.high_priority)
        ? tasksRaw.high_priority
        : Array.isArray(tasksRaw.items)
          ? tasksRaw.items
          : [],
      calendar_blocks: Array.isArray(tasksRaw.calendar_blocks)
        ? tasksRaw.calendar_blocks
        : Array.isArray(raw.calendar?.upcoming_blocks)
          ? raw.calendar.upcoming_blocks
          : [],
    },
    quick_notes: {
      total_count: Number(quickNotesRaw.total_count ?? quickItems.length),
      recent: Array.isArray(quickNotesRaw.recent) ? quickNotesRaw.recent : quickItems,
    },
    todos: {
      active_count: Number(detailedRaw.active_count ?? detailedRaw.total_count ?? 0),
      recent: Array.isArray(detailedRaw.recent)
        ? detailedRaw.recent
        : Array.isArray(detailedRaw.recent_items)
          ? detailedRaw.recent_items
          : [],
    },
    periodic_tasks: {
      total_count: Number(periodicRaw.total_count ?? 0),
      items: Array.isArray(periodicRaw.items) ? periodicRaw.items : [],
    },
    learning: {
      active_topics: Number(learningRaw.active_topics ?? learningRaw.subjects_count ?? 0),
      unresolved_mistakes: Number(learningRaw.unresolved_mistakes ?? learningRaw.open_mistakes_count ?? 0),
      recent_mistakes: Array.isArray(learningRaw.recent_mistakes)
        ? learningRaw.recent_mistakes
        : Array.isArray(learningRaw.open_mistakes)
          ? learningRaw.open_mistakes
          : [],
      subjects: Array.isArray(learningRaw.subjects) ? learningRaw.subjects : [],
    },
    finance: {
      recent_transactions_30d: Number(
        financeRaw.recent_transactions_30d ??
          (Array.isArray(financeRaw.recent_transactions) ? financeRaw.recent_transactions.length : 0),
      ),
      expense_30d: Number(financeRaw.expense_30d ?? financeRaw.month_expense ?? 0),
      income_30d: Number(financeRaw.income_30d ?? financeRaw.month_income ?? 0),
      recent_items: Array.isArray(financeRaw.recent_items)
        ? financeRaw.recent_items
        : Array.isArray(financeRaw.recent_transactions)
          ? financeRaw.recent_transactions
          : [],
      position_count: Number(
        financeRaw.position_count ?? (Array.isArray(financeRaw.positions) ? financeRaw.positions.length : 0),
      ),
      positions: Array.isArray(financeRaw.positions) ? financeRaw.positions : [],
      budgets: Array.isArray(financeRaw.budgets) ? financeRaw.budgets : [],
      recurring_count: Number(
        financeRaw.recurring_count ?? (Array.isArray(financeRaw.recurring) ? financeRaw.recurring.length : 0),
      ),
      recurring: Array.isArray(financeRaw.recurring) ? financeRaw.recurring : [],
      categories: Array.isArray(financeRaw.categories) ? financeRaw.categories : [],
    },
    activities: {
      want_count: Number(activitiesRaw.want_count ?? 0),
      done_count: Number(activitiesRaw.done_count ?? 0),
      recent_want: Array.isArray(activitiesRaw.recent_want)
        ? activitiesRaw.recent_want
        : Array.isArray(activitiesRaw.recent_items)
          ? activitiesRaw.recent_items
          : [],
    },
    workouts: {
      total_count: Number(workoutsRaw.total_count ?? (Array.isArray(workoutsRaw.items) ? workoutsRaw.items.length : 0)),
      items: Array.isArray(workoutsRaw.items) ? workoutsRaw.items : [],
    },
    flashcards: {
      total_count: Number(flashcardsRaw.total_count ?? (Array.isArray(flashcardsRaw.items) ? flashcardsRaw.items.length : 0)),
      items: Array.isArray(flashcardsRaw.items) ? flashcardsRaw.items : [],
    },
    code_snippets: {
      total_count: Number(codeRaw.total_count ?? (Array.isArray(codeRaw.items) ? codeRaw.items.length : 0)),
      items: Array.isArray(codeRaw.items) ? codeRaw.items : [],
    },
    recommendations_signals: raw.recommendations_signals,
  }
}

async function safeSelectRows(
  client: any,
  table: string,
  workspaceId: string,
  limit = 60,
  collectionId?: string,
): Promise<any[]> {
  try {
    if (!client || typeof client.from !== 'function') return []
    let result = await client.from(table).select('*').eq('workspace_id', workspaceId).limit(limit)
    if (result?.error && isMissingSchemaRpcError(result.error)) {
      if (collectionId) {
        result = await client.from(table).select('*').eq('collection_id', collectionId).limit(limit)
      }
      if (!collectionId || (result?.error && isMissingSchemaRpcError(result.error))) {
        result = await client.from(table).select('*').limit(limit)
      }
    } else if (!result?.error && Array.isArray(result?.data) && result.data.length === 0 && collectionId) {
      const byCollection = await client.from(table).select('*').eq('collection_id', collectionId).limit(limit)
      if (!byCollection?.error && Array.isArray(byCollection?.data)) {
        result = byCollection
      }
    }
    if (result?.error || !Array.isArray(result?.data)) return []
    return result.data
      .filter((row: any) => !row?.deleted_at)
      .sort((a: any, b: any) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))
  } catch {
    return []
  }
}

async function buildDigestFromTables(workspaceId: string, client: any): Promise<AiWorkspaceDigest> {
  const todayStr = new Date().toISOString().slice(0, 10)
  const monthStart = `${todayStr.slice(0, 7)}-01`

  const bindingMap = new Map<string, string>()
  try {
    if (typeof client?.rpc === 'function') {
      const ctx = await client.rpc('sharing_context', { wid: workspaceId })
      if (Array.isArray(ctx?.data)) {
        for (const b of ctx.data) {
          if (b?.module && b?.collection_id) {
            bindingMap.set(String(b.module), String(b.collection_id))
          }
        }
      }
    }
  } catch {
    // Ignore when sharing_context is unavailable
  }

  let planEntriesFromRpc: any[] | null = null
  try {
    if (typeof client?.rpc === 'function') {
      const planRes = await client.rpc('plan_entries_load', { wid: workspaceId })
      if (!planRes?.error && Array.isArray(planRes?.data) && planRes.data.length > 0) {
        planEntriesFromRpc = planRes.data
      }
    }
  } catch {
    // Fallback to direct table selects
  }

  const [
    fallbackPlans,
    fallbackQuickNotes,
    todos,
    workTasks,
    workBlocks,
    periodic,
    subjects,
    subjectTopics,
    learningProgress,
    mistakes,
    financeTx,
    financePositions,
    financeBudgets,
    financeRecurring,
    financeCategories,
    activities,
    workouts,
    flashcards,
    codeSnippets,
  ] = await Promise.all([
    planEntriesFromRpc ? Promise.resolve([]) : safeSelectRows(client, 'plans', workspaceId, 80, bindingMap.get('plans')),
    planEntriesFromRpc
      ? Promise.resolve([])
      : safeSelectRows(client, 'quick_notes', workspaceId, 80, bindingMap.get('quick') || bindingMap.get('quick_notes')),
    safeSelectRows(client, 'todos', workspaceId, 60, bindingMap.get('detailed') || bindingMap.get('todos')),
    safeSelectRows(client, 'work_tasks', workspaceId, 60),
    safeSelectRows(client, 'work_blocks', workspaceId, 60),
    safeSelectRows(client, 'periodic_tasks', workspaceId, 50, bindingMap.get('periodic')),
    safeSelectRows(client, 'learning_subjects', workspaceId, 40, bindingMap.get('learning')),
    safeSelectRows(client, 'learning_subjects_items', workspaceId, 120, bindingMap.get('learning')),
    safeSelectRows(client, 'learning_progress', workspaceId, 120),
    safeSelectRows(client, 'learning_mistakes', workspaceId, 40),
    safeSelectRows(client, 'finance_transactions', workspaceId, 60),
    safeSelectRows(client, 'finance_positions', workspaceId, 40),
    safeSelectRows(client, 'finance_budget_limits', workspaceId, 40),
    safeSelectRows(client, 'finance_recurring', workspaceId, 40),
    safeSelectRows(client, 'finance_categories', workspaceId, 40),
    safeSelectRows(client, 'activity_items', workspaceId, 50, bindingMap.get('activities')),
    safeSelectRows(client, 'workout_routines', workspaceId, 40, bindingMap.get('workout')),
    safeSelectRows(client, 'flashcard_decks', workspaceId, 40, bindingMap.get('flashcards')),
    safeSelectRows(client, 'code_snippets', workspaceId, 40, bindingMap.get('code')),
  ])

  const plans = planEntriesFromRpc
    ? planEntriesFromRpc.filter(p => p?.source !== 'quick')
    : fallbackPlans
  const quickNotes = planEntriesFromRpc
    ? planEntriesFromRpc.filter(p => p?.source === 'quick')
    : fallbackQuickNotes

  const timelessPlans = plans.filter(p => p.period === 'timeless')
  const datedPlans = plans.filter(p => p.period !== 'timeless')
  const openPlans = plans.filter(p => !p.completed)
  const donePlans = plans.filter(p => p.completed)
  const carriedPlans = openPlans.filter(p => Array.isArray(p.history) && p.history.length > 0)

  const openTasks = workTasks.filter(t => t.status !== 'done')
  const doneTasks = workTasks.filter(t => t.status === 'done')
  const overdueTasks = openTasks.filter(t => typeof t.due_on === 'string' && t.due_on < todayStr)

  const unresolvedMistakes = mistakes.filter(m => !m.resolved)
  const monthTx = financeTx.filter(tx => typeof tx.occurred_on === 'string' && tx.occurred_on >= monthStart)
  const expense30d = monthTx
    .filter(tx => tx.kind === 'expense')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
  const income30d = monthTx
    .filter(tx => tx.kind === 'income')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

  const wantItems = activities.filter(a => a.status === 'want')
  const doneItems = activities.filter(a => a.status === 'done')

  const combinedQuickItems = [
    ...quickNotes.map(q => ({
      id: q.id,
      title: String(q.title || q.content || ''),
      notes_preview: notePlainTextPreview(q.notes || '', 180),
      source_table: 'quick_notes',
      version: q.version,
      created_at: q.created_at,
    })),
    ...timelessPlans.map(p => ({
      id: p.id,
      title: String(p.title || ''),
      notes_preview: notePlainTextPreview(p.notes || '', 180),
      source_table: 'plans',
      version: p.version,
      created_at: p.created_at,
    })),
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

  return {
    workspace_id: workspaceId,
    generated_at: new Date().toISOString(),
    plans: {
      pending_count: openPlans.length,
      completed_count: donePlans.length,
      overdue_count: carriedPlans.length,
      upcoming: datedPlans.concat(timelessPlans).slice(0, 40).map(p => ({
        id: p.id,
        title: p.title,
        period: p.period,
        period_date: p.period_date,
        notes_preview: notePlainTextPreview(p.notes || '', 180),
        source_table: 'plans',
        version: p.version,
      })),
    },
    tasks: {
      pending_count: openTasks.length,
      completed_count: doneTasks.length,
      overdue_count: overdueTasks.length,
      high_priority: openTasks.slice(0, 40).map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_on: t.due_on,
        checklist: Array.isArray(t.checklist) ? t.checklist : [],
        notes_preview: notePlainTextPreview(t.description || '', 180),
        version: t.version,
      })),
      calendar_blocks: workBlocks.slice(0, 30).map(b => {
        const linkedTask = b.task_id ? workTasks.find(t => String(t.id) === String(b.task_id)) : undefined
        return {
          id: String(b.id || ''),
          task_id: b.task_id ? String(b.task_id) : null,
          title: String(b.title || ''),
          task_title: linkedTask ? String(linkedTask.title || '') : '',
          starts_at: String(b.starts_at || ''),
          ends_at: String(b.ends_at || ''),
          version: typeof b.version === 'number' ? b.version : 1,
        }
      }),
    },
    quick_notes: {
      total_count: quickNotes.length + timelessPlans.length,
      recent: combinedQuickItems.slice(0, 50),
    },
    todos: {
      active_count: todos.filter(t => !t.completed).length,
      recent: todos.slice(0, 40).map(t => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        priority: t.priority,
        preview: notePlainTextPreview(t.description || '', 200),
        version: t.version,
      })),
    },
    periodic_tasks: {
      total_count: periodic.length,
      items: periodic.slice(0, 35).map(p => ({
        id: p.id,
        title: p.title,
        frequency: p.frequency,
        category: p.category,
        notes_preview: notePlainTextPreview(p.notes || '', 180),
        version: p.version,
      })),
    },
    learning: {
      active_topics: subjects.length,
      unresolved_mistakes: unresolvedMistakes.length,
      recent_mistakes: unresolvedMistakes.slice(0, 20).map(m => ({
        id: m.id,
        title: m.title,
        prompt: notePlainTextPreview(m.prompt || '', 180),
        solution: notePlainTextPreview(m.solution || '', 180),
        subject_id: m.subject_id,
        topic_id: m.topic_id,
        resolved: m.resolved,
        version: m.version,
      })),
      subjects: subjects.slice(0, 20).map(s => {
        const inlineTopics = Array.isArray(s.topics) ? s.topics : []
        const joinedTopics = subjectTopics
          .filter((item: any) => String(item.parent_id || '') === String(s.id))
          .map((item: any) => {
            const dataObj = item?.data && typeof item.data === 'object' ? item.data : {}
            const prog = learningProgress.find((p: any) => String(p.topic_id || '') === String(item.id))
            return {
              id: item.id,
              title: String(dataObj.title || item.title || ''),
              status: String(prog?.status || 'todo'),
              version: typeof prog?.version === 'number' ? prog.version : typeof item.version === 'number' ? item.version : 1,
            }
          })
        return {
          id: s.id,
          title: s.title,
          color: s.color,
          version: s.version,
          topics: joinedTopics.length > 0 ? joinedTopics : inlineTopics,
        }
      }),
    },
    finance: {
      recent_transactions_30d: monthTx.length,
      expense_30d: expense30d,
      income_30d: income30d,
      recent_items: monthTx.slice(0, 20).map(t => ({
        id: t.id,
        title: t.title,
        kind: t.kind,
        category: t.category,
        amount: t.amount,
        occurred_on: t.occurred_on,
        note: notePlainTextPreview(t.note || '', 180),
        version: t.version,
      })),
      position_count: financePositions.length,
      positions: financePositions.slice(0, 20).map(pos => ({
        id: pos.id,
        title: pos.title,
        kind: pos.kind,
        instrument: pos.instrument,
        price_source: pos.price_source,
        quantity: pos.quantity,
        buy_price: pos.buy_price,
        purchased_on: pos.purchased_on,
        manual_price: pos.manual_price,
        version: pos.version,
      })),
      budgets: financeBudgets.slice(0, 20).map(b => ({
        category_id: b.category_id,
        month: b.month,
        scope: b.scope,
        amount: b.amount,
      })),
      recurring_count: financeRecurring.length,
      recurring: financeRecurring.slice(0, 20).map(r => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        amount: r.amount,
        cadence: r.cadence,
        starts_on: r.starts_on,
        active: r.active,
        version: r.version,
      })),
      categories: financeCategories.slice(0, 20).map(c => ({
        id: c.id,
        name: c.name,
        budget_version: c.budget_version,
      })),
    },
    activities: {
      want_count: wantItems.length,
      done_count: doneItems.length,
      recent_want: wantItems.slice(0, 30).map(a => ({
        id: a.id,
        title: a.title,
        type: a.type,
        notes_preview: notePlainTextPreview(a.notes || '', 160),
        version: a.version,
      })),
    },
    workouts: {
      total_count: workouts.length,
      items: workouts.slice(0, 25).map(w => ({
        id: w.id,
        title: w.title,
        day_of_week: w.day_of_week,
        version: w.version,
      })),
    },
    flashcards: {
      total_count: flashcards.length,
      items: flashcards.slice(0, 25).map(f => ({
        id: f.id,
        title: f.title,
        version: f.version,
      })),
    },
    code_snippets: {
      total_count: codeSnippets.length,
      items: codeSnippets.slice(0, 25).map(c => ({
        id: c.id,
        title: c.title,
        language: c.language,
        version: c.version,
      })),
    },
  }
}

export async function fetchAiWorkspaceDigest(
  workspaceId: string,
  options: Record<string, unknown> = {},
  client: any = supabase,
): Promise<AiWorkspaceDigest> {
  const { data, error } = await client.rpc('ai_workspace_digest', {
    wid: workspaceId,
    options,
  })
  if (error) {
    if (isMissingSchemaRpcError(error)) {
      return await buildDigestFromTables(workspaceId, client)
    }
    throw error
  }
  return normalizeDigest(data, workspaceId)
}

export async function readAiWorkspaceRecords(
  workspaceId: string,
  targets: Array<Record<string, unknown>>,
  client: any = supabase,
): Promise<Array<Record<string, unknown>>> {
  for (const target of targets || []) {
    assertNotSecureTarget(String(target?.module || ''))
  }
  const { data, error } = await client.rpc('ai_read_records', {
    wid: workspaceId,
    targets,
  })
  if (error) {
    if (isMissingSchemaRpcError(error)) return []
    throw error
  }
  return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
}

function normalizeActionForSqlRpc(action: ProposedAiAction): ProposedAiAction {
  const modRaw = String(action.module || '').trim()
  const opRaw = String(action.operation || 'create').trim()
  const rawPayload = { ...(action.payload || {}) }

  let mod = modRaw
  let op = opRaw
  if (mod === 'todos') {
    mod = 'detailed'
  }
  if (mod === 'quick_notes') {
    if (action.target_id) {
      mod = rawPayload.source_table === 'plans' ? 'plans' : 'quick'
    } else {
      mod = 'plans'
      rawPayload.period = 'timeless'
      rawPayload.period_date = '1970-01-01'
      rawPayload.title = rawPayload.title || rawPayload.text || action.title || 'Hızlı Not'
    }
  }

  if (op.startsWith('save_') || op.startsWith('upsert_') || op === 'create') {
    op = action.target_id ? 'update' : 'create'
  } else if (op === 'complete') {
    op = action.target_id ? 'update' : 'create'
    rawPayload.completed = true
    rawPayload.status = 'done'
  }

  if (mod === 'detailed') {
    if (rawPayload.notes && !rawPayload.description) {
      rawPayload.description = rawPayload.notes
    }
    if (!rawPayload.title && !action.target_id) {
      rawPayload.title = action.title || 'AI Notu'
    }
  } else if (mod === 'plans') {
    const isTimelessSource =
      rawPayload.source_table === 'plans' || rawPayload.period === 'timeless' || modRaw === 'quick_notes'
    const resolvedPeriod = (rawPayload.period || rawPayload.scope || (isTimelessSource ? 'timeless' : 'daily')) as string
    const validPeriod: PlanPeriod = ['timeless', 'daily', 'weekly', 'monthly', 'yearly'].includes(resolvedPeriod)
      ? (resolvedPeriod as PlanPeriod)
      : 'daily'
    rawPayload.period = validPeriod
    rawPayload.period_date =
      validPeriod === 'timeless'
        ? '1970-01-01'
        : String(rawPayload.period_date || periodStart(validPeriod, new Date()))
    if (!rawPayload.title && !action.target_id) {
      rawPayload.title = action.title || 'AI Planı'
    }
  } else if (mod === 'periodic') {
    rawPayload.frequency = rawPayload.frequency || 'daily'
    rawPayload.category = rawPayload.category || 'habit'
  } else if (mod === 'finance') {
    if (!rawPayload.title) {
      rawPayload.title = action.title || (rawPayload.kind === 'income' ? 'AI Gelir' : 'AI Gider')
    }
    rawPayload.occurred_on = rawPayload.occurred_on || new Date().toISOString().slice(0, 10)
  } else if (mod === 'activities') {
    if (op === 'create') op = 'item.add'
    else if (op === 'update' || op === 'notes') op = 'item.notes'
  } else if (mod === 'learning') {
    if (op === 'create') op = 'subject.create'
    else if (op === 'update') op = 'subject.update'
  } else if (mod === 'workout') {
    if (!rawPayload.title) {
      rawPayload.title = action.title || 'AI Antrenman Programı'
    }
    rawPayload.day_of_week = rawPayload.day_of_week || 'Any'
    if (!Array.isArray(rawPayload.exercises)) {
      rawPayload.exercises = []
    }
  } else if (mod === 'calendar') {
    if (!rawPayload.title) {
      rawPayload.title = action.title || 'Takvim Etkinliği'
    }
    if (!rawPayload.starts_at) {
      const start = new Date()
      start.setMinutes(0, 0, 0)
      rawPayload.starts_at = start.toISOString()
      rawPayload.ends_at = new Date(start.getTime() + 60 * 60000).toISOString()
    } else if (!rawPayload.ends_at) {
      const start = new Date(String(rawPayload.starts_at))
      rawPayload.ends_at = new Date(start.getTime() + 60 * 60000).toISOString()
    }
    rawPayload.timezone =
      rawPayload.timezone ||
      (typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC')
  } else if (mod === 'flashcards') {
    if (!rawPayload.title) {
      rawPayload.title = action.title || 'AI Çalışma Destesi'
    }
    rawPayload.color = rawPayload.color || '#6366f1'
  }

  return {
    ...action,
    module: mod,
    operation: op,
    payload: rawPayload,
  }
}

async function resolveCurrentUserId(client: any): Promise<string | null> {
  try {
    const res = await client?.auth?.getSession?.()
    if (res?.data?.session?.user?.id) return String(res.data.session.user.id)
  } catch {
    // Ignore session lookup error
  }
  try {
    const res = await client?.auth?.getUser?.()
    if (res?.data?.user?.id) return String(res.data.user.id)
  } catch {
    // Ignore user lookup error
  }
  return null
}

async function insertWithOptionalColumnRetry(
  client: any,
  table: string,
  row: Record<string, unknown>,
  optionalColumns: string[],
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { ...row }
  let res = await client.from(table).insert(payload).select().single()

  for (let attempt = 0; attempt < optionalColumns.length; attempt += 1) {
    if (!res?.error || !isMissingSchemaRpcError(res.error)) break
    const msg = String(res.error?.message || '')
    const matched = optionalColumns.filter((col) => col in payload && msg.includes(col))
    if (matched.length > 0) {
      for (const col of matched) {
        delete payload[col]
      }
    } else {
      const nextCol = optionalColumns.find((col) => col in payload)
      if (!nextCol) break
      delete payload[nextCol]
    }
    res = await client.from(table).insert({ ...payload }).select().single()
  }

  if (res?.error) throw res.error
  return (res?.data && typeof res.data === 'object' ? res.data : payload) as Record<string, unknown>
}

const TRASH_MODULE_BY_TABLE: Record<string, string> = {
  plans: 'plans',
  todos: 'detailed',
  quick_notes: 'quick',
  code_snippets: 'code',
  flashcard_decks: 'flashcards',
  workout_routines: 'workout',
  periodic_tasks: 'periodic',
  activity_items: 'activities',
  work_tasks: 'tasks',
  work_blocks: 'calendar',
}

const MUTABLE_UNDO_FIELDS = [
  'title',
  'content',
  'notes',
  'description',
  'completed',
  'priority',
  'status',
  'due_on',
  'note',
  'category',
  'frequency',
  'code',
  'language',
  'day_of_week',
  'exercises',
  'cards',
  'color',
  'starts_at',
  'ends_at',
  'timezone',
  'prompt',
  'solution',
  'resolved',
  'amount',
  'kind',
  'occurred_on',
  'type',
  'checklist',
  'quantity',
  'buy_price',
  'purchased_on',
  'manual_price',
  'instrument',
  'price_source',
  'cadence',
  'starts_on',
  'active',
  'data',
] as const

function tableCandidatesForAction(mod: string, sourceTable?: string): string[] {
  const defaults: Record<string, string[]> = {
    plans: ['plans', 'quick_notes'],
    quick: ['quick_notes', 'plans'],
    quick_notes: ['plans', 'quick_notes'],
    detailed: ['todos'],
    todos: ['todos'],
    periodic: ['periodic_tasks'],
    code: ['code_snippets'],
    workout: ['workout_routines'],
    flashcards: ['flashcard_decks'],
    activities: ['activity_items'],
    tasks: ['work_tasks'],
    calendar: ['work_blocks'],
    finance: ['finance_transactions', 'finance_positions', 'finance_recurring'],
    learning: ['learning_subjects', 'learning_subjects_items', 'learning_mistakes'],
  }
  const base = defaults[mod] || ['plans']
  if (sourceTable && typeof sourceTable === 'string') {
    return Array.from(new Set([sourceTable, ...base]))
  }
  return base
}

async function resolveTargetTableAndRow(
  client: any,
  mod: string,
  targetId: string,
  sourceTable?: string,
): Promise<{ targetTable: string; beforeRow: Record<string, unknown> | null }> {
  const candidates = tableCandidatesForAction(mod, sourceTable)
  if (!client?.from) {
    return { targetTable: candidates[0], beforeRow: null }
  }
  for (const tbl of candidates) {
    try {
      const q = client.from(tbl).select('*').eq('id', targetId)
      const res = typeof q?.maybeSingle === 'function' ? await q.maybeSingle() : await q
      if (res?.error) {
        if (isMissingSchemaRpcError(res.error)) continue
      }
      const row = Array.isArray(res?.data) ? res.data[0] : res?.data
      if (row && typeof row === 'object') {
        const snapshot = (() => {
          try {
            return JSON.parse(JSON.stringify(row))
          } catch {
            return { ...row }
          }
        })()
        return { targetTable: tbl, beforeRow: snapshot as Record<string, unknown> }
      }
    } catch {
      // Try next candidate table
    }
  }
  return { targetTable: candidates[0], beforeRow: null }
}

async function updateTableRowWithOptionalNotesRetry(
  client: any,
  table: string,
  targetId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  if (!Object.keys(updates).length) return
  let res = await client.from(table).update({ ...updates }).eq('id', targetId)
  if (res?.error && isMissingSchemaRpcError(res.error) && 'notes' in updates) {
    const fallbackPatch = { ...updates }
    delete fallbackPatch.notes
    if (Object.keys(fallbackPatch).length > 0) {
      res = await client.from(table).update(fallbackPatch).eq('id', targetId)
    } else {
      return
    }
  }
  if (res?.error) throw res.error
}

async function executeFallbackActions(
  workspaceId: string,
  rawActions: ProposedAiAction[],
  meta: Record<string, unknown>,
  client: any,
): Promise<{
  run_id: string
  status: string
  applied_count: number
  applied_changes: Array<Record<string, unknown>>
}> {
  const userId = await resolveCurrentUserId(client)
  if (!userId) {
    throw new Error('AI_AUTH_REQUIRED')
  }

  const runId = `local-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`
  const appliedChanges: Array<Record<string, unknown>> = []
  const snapshots: LocalRunSnapshot[] = []

  // Resolve collection bindings when workspace sharing schema is active
  const bindingMap = new Map<string, string>()
  try {
    const ctx = await client.rpc('sharing_context', { wid: workspaceId })
    if (Array.isArray(ctx?.data)) {
      for (const b of ctx.data) {
        if (b?.module && b?.collection_id) {
          bindingMap.set(String(b.module), String(b.collection_id))
        }
      }
    }
  } catch {
    // Personal mode without sharing bindings
  }

  const today = new Date().toISOString().slice(0, 10)

  for (const rawAction of rawActions) {
    const norm = normalizeActionForSqlRpc(rawAction)
    assertNotSecureTarget(norm.module)
    const p = norm.payload || {}
    const mod = norm.module
    const rawOp = String(rawAction.operation || 'create').trim().toLowerCase()

    if (rawAction.target_id) {
      const targetId = String(rawAction.target_id)
      const sourceTable = typeof p.source_table === 'string' ? p.source_table : undefined
      const { targetTable, beforeRow } = await resolveTargetTableAndRow(client, mod, targetId, sourceTable)
      const beforeVer =
        typeof beforeRow?.version === 'number'
          ? Number(beforeRow.version)
          : typeof p.expected_version === 'number'
            ? Number(p.expected_version)
            : 1

      if (rawOp === 'delete') {
        const trashMod = TRASH_MODULE_BY_TABLE[targetTable]
        let movedToTrash = false
        if (trashMod) {
          const trashRes = await client.rpc('trash_change', {
            wid: workspaceId,
            module_id: trashMod,
            rid: targetId,
            action: 'move',
            expected_version: beforeVer,
          })
          if (!trashRes?.error) {
            movedToTrash = true
          } else if (!isMissingSchemaRpcError(trashRes.error)) {
            throw trashRes.error
          }
        }

        if (movedToTrash) {
          snapshots.push({
            table: targetTable,
            id: targetId,
            existed: true,
            module: trashMod,
            row: { ...(beforeRow || { id: targetId }), deleted_via_trash: true, deleted_version: beforeVer + 1 },
          })
        } else if (targetTable === 'work_tasks' || targetTable === 'work_blocks') {
          const entity = targetTable === 'work_blocks' ? 'block' : 'task'
          const { error } = await client.rpc('work_mutate', {
            wid: workspaceId,
            entity,
            operation: 'purge',
            rid: targetId,
            payload: {},
            expected_version: beforeVer,
          })
          if (error) throw error
          snapshots.push({
            table: targetTable,
            id: targetId,
            existed: true,
            module: rawAction.module,
            row: { ...(beforeRow || { id: targetId }), deleted_directly: true },
          })
        } else if (targetTable === 'finance_transactions') {
          const { error } = await client.rpc('finance_mutate', {
            wid: workspaceId,
            entity: 'transaction',
            operation: 'delete',
            rid: targetId,
            payload: {},
            expected_version: beforeVer,
          })
          if (error) throw error
          snapshots.push({
            table: targetTable,
            id: targetId,
            existed: true,
            module: rawAction.module,
            row: { ...(beforeRow || { id: targetId }), deleted_directly: true },
          })
        } else {
          const delRes = await client.from(targetTable).delete().eq('id', targetId)
          if (delRes?.error) throw delRes.error
          snapshots.push({
            table: targetTable,
            id: targetId,
            existed: true,
            module: rawAction.module,
            row: { ...(beforeRow || { id: targetId }), deleted_directly: true },
          })
        }

        appliedChanges.push({
          module: rawAction.module,
          operation: 'delete',
          target_id: targetId,
          title: String(p.title || beforeRow?.title || beforeRow?.content || rawAction.title || ''),
        })
        continue
      }

      // Physical update / complete
      const isComplete =
        rawOp === 'complete' || p.completed === true || String(p.status || '').toLowerCase() === 'done'
      const writeMode = (rawAction.write_mode || p.write_mode || 'replace') as AiNoteWriteMode
      const sectionHeading = rawAction.section_heading ?? undefined

      if (targetTable === 'work_tasks') {
        const nextDesc =
          p.description !== undefined || p.notes !== undefined
            ? applyNoteWriteMode(
                String(beforeRow?.description || ''),
                String(p.description ?? p.notes ?? ''),
                writeMode,
                'markdown',
                sectionHeading,
              )
            : undefined
        let nextChecklist: Array<{ id: string; title: string; done: boolean }> | undefined
        if (typeof p.checklist_append === 'string' && p.checklist_append.trim()) {
          const existingList = Array.isArray(beforeRow?.checklist) ? beforeRow.checklist : []
          const newItemId =
            typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chk-${Date.now()}`
          nextChecklist = [
            ...existingList,
            { id: newItemId, title: p.checklist_append.trim().slice(0, 180), done: false },
          ]
        } else if (Array.isArray(p.checklist)) {
          nextChecklist = p.checklist as Array<{ id: string; title: string; done: boolean }>
        }
        const taskPayload: Record<string, unknown> = {
          ...(p.title ? { title: String(p.title).trim() } : {}),
          ...(nextDesc !== undefined ? { description: nextDesc } : {}),
          ...(nextChecklist !== undefined ? { checklist: nextChecklist } : {}),
          ...(isComplete ? { status: 'done' } : p.status ? { status: String(p.status) } : {}),
          ...(p.priority ? { priority: String(p.priority) } : {}),
          ...(p.due_on !== undefined ? { due_on: p.due_on } : {}),
        }
        const { error } = await client.rpc('work_mutate', {
          wid: workspaceId,
          entity: 'task',
          operation: 'update',
          rid: targetId,
          payload: taskPayload,
          expected_version: beforeVer,
        })
        if (error) throw error
        if (p.title) {
          try {
            const { data: linkedBlocks } = await client
              .from('work_blocks')
              .select('*')
              .eq('task_id', targetId)
            for (const lb of Array.isArray(linkedBlocks) ? linkedBlocks : []) {
              if (!lb || lb.deleted_at || String(lb.task_id || '') !== targetId) continue
              if (!lb.title || !String(lb.title).trim()) continue
              const lbId = String(lb.id)
              snapshots.push({
                table: 'work_blocks',
                id: lbId,
                existed: true,
                module: 'calendar',
                row: JSON.parse(JSON.stringify(lb)),
              })
              const lbVer = typeof lb.version === 'number' ? lb.version : 1
              const { error: lbRpcErr } = await client.rpc('work_mutate', {
                wid: workspaceId,
                entity: 'block',
                operation: 'update',
                rid: lbId,
                payload: { title: '' },
                expected_version: lbVer,
              })
              if (lbRpcErr) {
                await client.from('work_blocks').update({ title: '' }).eq('id', lbId)
              }
            }
          } catch {
            // ignore if work_blocks query is unavailable in mock
          }
        }
      } else if (targetTable === 'work_blocks') {
        const linkedTaskId = beforeRow?.task_id ? String(beforeRow.task_id) : ''
        if (linkedTaskId && p.title) {
          try {
            const taskQ = client.from('work_tasks').select('*').eq('id', linkedTaskId)
            const taskRes = typeof taskQ?.maybeSingle === 'function' ? await taskQ.maybeSingle() : await taskQ
            const parentTask = Array.isArray(taskRes?.data) ? taskRes.data[0] : taskRes?.data
            if (parentTask && typeof parentTask === 'object') {
              snapshots.push({
                table: 'work_tasks',
                id: linkedTaskId,
                existed: true,
                module: 'tasks',
                row: JSON.parse(JSON.stringify(parentTask)),
              })
              const parentVer = typeof parentTask.version === 'number' ? parentTask.version : 1
              const { error: taskRpcErr } = await client.rpc('work_mutate', {
                wid: workspaceId,
                entity: 'task',
                operation: 'update',
                rid: linkedTaskId,
                payload: { title: String(p.title).trim() },
                expected_version: parentVer,
              })
              if (taskRpcErr) {
                await client.from('work_tasks').update({ title: String(p.title).trim() }).eq('id', linkedTaskId)
              }
            }
          } catch {
            // ignore if work_tasks query is unavailable in mock
          }
        }
        const blockPayload: Record<string, unknown> = {
          ...(linkedTaskId ? (p.title ? { title: '' } : {}) : p.title ? { title: String(p.title).trim() } : {}),
          ...(p.starts_at ? { starts_at: String(p.starts_at) } : {}),
          ...(p.ends_at ? { ends_at: String(p.ends_at) } : {}),
        }
        const { error } = await client.rpc('work_mutate', {
          wid: workspaceId,
          entity: 'block',
          operation: 'update',
          rid: targetId,
          payload: blockPayload,
          expected_version: beforeVer,
        })
        if (error) throw error
      } else if (targetTable === 'finance_transactions') {
        const finPayload: Record<string, unknown> = {
          ...(p.title ? { title: String(p.title).trim() } : {}),
          ...(p.note !== undefined ? { note: String(p.note) } : {}),
          ...(p.amount !== undefined ? { amount: Number(p.amount) } : {}),
          ...(p.kind ? { kind: p.kind === 'income' ? 'income' : 'expense' } : {}),
          ...(p.category ? { category: String(p.category) } : {}),
          ...(p.occurred_on ? { occurred_on: String(p.occurred_on) } : {}),
        }
        const { error } = await client.rpc('finance_mutate', {
          wid: workspaceId,
          entity: 'transaction',
          operation: 'update',
          rid: targetId,
          payload: finPayload,
          expected_version: beforeVer,
        })
        if (error) {
          if (isMissingSchemaRpcError(error)) {
            await updateTableRowWithOptionalNotesRetry(client, targetTable, targetId, finPayload)
          } else {
            throw error
          }
        }
      } else if (targetTable === 'activity_items') {
        const actPayload: Record<string, unknown> = {
          ...(p.title ? { title: String(p.title).trim() } : {}),
          ...(p.notes !== undefined
            ? {
                notes: applyNoteWriteMode(
                  String(beforeRow?.notes || ''),
                  String(p.notes || ''),
                  writeMode,
                  'markdown',
                  sectionHeading,
                ),
              }
            : {}),
          ...(isComplete ? { status: 'completed' } : p.status ? { status: String(p.status) } : {}),
        }
        const actRes = await client.rpc('activity_library_mutate', {
          wid: workspaceId,
          operation: 'item.notes',
          rid: targetId,
          payload: actPayload,
          expected_version: beforeVer,
        })
        if (actRes?.error) {
          if (isMissingSchemaRpcError(actRes.error)) {
            await updateTableRowWithOptionalNotesRetry(client, targetTable, targetId, actPayload)
          } else {
            throw actRes.error
          }
        }
      } else {
        // Direct table-backed modules (plans, quick_notes, todos, periodic_tasks, code_snippets, workout_routines, flashcard_decks, learning_subjects)
        const updates: Record<string, unknown> = {}
        if (targetTable === 'quick_notes') {
          const nextContent = p.text ?? p.content ?? p.title
          if (nextContent !== undefined && String(nextContent).trim()) {
            updates.content = String(nextContent).trim()
          }
        } else if (targetTable === 'todos') {
          if (p.title !== undefined && String(p.title).trim()) {
            updates.title = String(p.title).trim()
          }
          const incomingNote = p.description ?? p.notes
          if (incomingNote !== undefined) {
            updates.description = applyNoteWriteMode(
              String(beforeRow?.description || ''),
              String(incomingNote || ''),
              writeMode,
              'html',
              sectionHeading,
            )
          }
          if (isComplete) updates.completed = true
          else if (typeof p.completed === 'boolean') updates.completed = p.completed
          if (p.priority) updates.priority = String(p.priority)
        } else if (targetTable === 'plans') {
          if (p.title !== undefined && String(p.title).trim()) {
            updates.title = String(p.title).trim()
          }
          if (p.notes !== undefined) {
            updates.notes = applyNoteWriteMode(
              String(beforeRow?.notes || ''),
              String(p.notes || ''),
              writeMode,
              'markdown',
              sectionHeading,
            )
          }
          if (isComplete) updates.completed = true
          else if (typeof p.completed === 'boolean') updates.completed = p.completed
        } else if (targetTable === 'learning_mistakes') {
          const mistakeUpdates: Record<string, unknown> = {}
          if (p.title !== undefined && String(p.title).trim()) {
            mistakeUpdates.title = String(p.title).trim()
          }
          if (p.prompt !== undefined && String(p.prompt).trim()) {
            mistakeUpdates.prompt = String(p.prompt).trim()
          }
          if (p.solution !== undefined) {
            mistakeUpdates.solution = String(p.solution || '').trim()
          }
          if (isComplete) {
            mistakeUpdates.resolved = true
          } else if (typeof p.resolved === 'boolean') {
            mistakeUpdates.resolved = p.resolved
          }
          const rpcRes = await client.rpc('learning_mutate', {
            wid: workspaceId,
            operation: isComplete && Object.keys(mistakeUpdates).length <= 1 ? 'mistake.resolve' : 'mistake.update',
            sid: String(beforeRow?.subject_id || p.subject_id || ''),
            tid: beforeRow?.topic_id ? String(beforeRow.topic_id) : null,
            payload: { id: targetId, ...mistakeUpdates },
            expected_version: beforeVer,
          })
          if (rpcRes?.error) {
            if (isMissingSchemaRpcError(rpcRes.error)) {
              await updateTableRowWithOptionalNotesRetry(client, targetTable, targetId, mistakeUpdates)
            } else {
              throw rpcRes.error
            }
          }
        } else if (targetTable === 'learning_subjects_items') {
          const subjectId = String(beforeRow?.parent_id || p.subject_id || '')
          if (isComplete || p.status) {
            const nextStatus = isComplete ? 'done' : String(p.status || 'doing')
            const progRes = await client.rpc('learning_mutate', {
              wid: workspaceId,
              operation: 'progress.update',
              sid: subjectId,
              tid: targetId,
              payload: { status: nextStatus },
              expected_version: beforeVer,
            })
            if (progRes?.error && !isMissingSchemaRpcError(progRes.error)) {
              throw progRes.error
            }
          } else if (p.title) {
            const topicRes = await client.rpc('learning_mutate', {
              wid: workspaceId,
              operation: 'topic.update',
              sid: subjectId,
              tid: targetId,
              payload: { title: String(p.title).trim() },
              expected_version: beforeVer,
            })
            if (topicRes?.error && isMissingSchemaRpcError(topicRes.error)) {
              await updateTableRowWithOptionalNotesRetry(client, targetTable, targetId, {
                data: { ...(beforeRow?.data && typeof beforeRow.data === 'object' ? beforeRow.data : {}), title: String(p.title).trim() },
              })
            } else if (topicRes?.error) {
              throw topicRes.error
            }
          }
        } else if (targetTable === 'finance_positions') {
          const posUpdates: Record<string, unknown> = {}
          if (p.title) posUpdates.title = String(p.title).trim()
          if (p.quantity !== undefined) posUpdates.quantity = Number(p.quantity)
          if (p.buy_price !== undefined) posUpdates.buy_price = Number(p.buy_price)
          if (p.manual_price !== undefined) posUpdates.manual_price = Number(p.manual_price)
          const posRes = await client.rpc('finance_mutate', {
            wid: workspaceId,
            entity: 'position',
            operation: 'update',
            rid: targetId,
            payload: posUpdates,
            expected_version: beforeVer,
          })
          if (posRes?.error) {
            if (isMissingSchemaRpcError(posRes.error)) {
              await updateTableRowWithOptionalNotesRetry(client, targetTable, targetId, posUpdates)
            } else {
              throw posRes.error
            }
          }
        } else if (targetTable === 'finance_recurring') {
          const recUpdates: Record<string, unknown> = {}
          if (p.title) recUpdates.title = String(p.title).trim()
          if (p.amount !== undefined) recUpdates.amount = Number(p.amount)
          const recRes = await client.rpc('finance_schedule_mutate', {
            wid: workspaceId,
            operation: p.active === false ? 'pause' : p.active === true ? 'resume' : 'update',
            rid: targetId,
            payload: recUpdates,
            expected_version: beforeVer,
          })
          if (recRes?.error) {
            if (isMissingSchemaRpcError(recRes.error)) {
              await updateTableRowWithOptionalNotesRetry(client, targetTable, targetId, recUpdates)
            } else {
              throw recRes.error
            }
          }
        } else {
          if (p.title !== undefined && String(p.title).trim()) {
            updates.title = String(p.title).trim()
          }
          if (p.notes !== undefined) {
            updates.notes = applyNoteWriteMode(
              String(beforeRow?.notes || ''),
              String(p.notes || ''),
              writeMode,
              'markdown',
              sectionHeading,
            )
          }
          if (p.code !== undefined) updates.code = String(p.code)
          if (p.language !== undefined) updates.language = String(p.language)
          if (Array.isArray(p.exercises)) {
            updates.exercises = p.exercises
          } else if (typeof p.exercise_patch === 'string' && p.exercise_patch.trim()) {
            const existingExercises = Array.isArray(beforeRow?.exercises) ? [...beforeRow.exercises] : []
            const patchText = p.exercise_patch.trim()
            const srMatch = patchText.match(/(\d+)\s*[x×]\s*(\d+)/iu)
            const sets = srMatch ? Number(srMatch[1]) : 3
            const reps = srMatch ? srMatch[2] : '10'
            const cleanName = patchText.replace(/\d+\s*[x×]\s*\d+/iu, '').trim() || 'Yeni Egzersiz'
            const matchIdx = existingExercises.findIndex((ex: any) =>
              normalizeTrSearch(String(ex?.name || '')).includes(normalizeTrSearch(cleanName)) ||
              normalizeTrSearch(cleanName).includes(normalizeTrSearch(String(ex?.name || ''))),
            )
            if (matchIdx >= 0 && srMatch) {
              existingExercises[matchIdx] = { ...existingExercises[matchIdx], sets, reps }
            } else {
              existingExercises.push({
                id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ex-${Date.now()}`,
                name: cleanName,
                sets,
                reps,
              })
            }
            updates.exercises = existingExercises
          }
          if (Array.isArray(p.cards)) {
            updates.cards = p.cards
          } else if (typeof p.card_patch === 'string' && p.card_patch.trim()) {
            const existingCards = Array.isArray(beforeRow?.cards) ? [...beforeRow.cards] : []
            const parts = p.card_patch.split(/\s*(?:->|:|=>|\|)\s*/).map(s => s.trim()).filter(Boolean)
            const front = parts[0] || p.card_patch.trim()
            const back = parts[1] || ''
            const matchIdx = existingCards.findIndex((c: any) =>
              normalizeTrSearch(String(c?.front || '')) === normalizeTrSearch(front),
            )
            if (matchIdx >= 0 && back) {
              existingCards[matchIdx] = { ...existingCards[matchIdx], back }
            } else {
              existingCards.push({
                id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `card-${Date.now()}`,
                front,
                back,
              })
            }
            updates.cards = existingCards
          }
          if (p.day_of_week) updates.day_of_week = String(p.day_of_week)
        }

        if (
          targetTable !== 'learning_mistakes' &&
          targetTable !== 'learning_subjects_items' &&
          targetTable !== 'finance_positions' &&
          targetTable !== 'finance_recurring'
        ) {
          await updateTableRowWithOptionalNotesRetry(client, targetTable, targetId, updates)
        }
      }

      snapshots.push({
        table: targetTable,
        id: targetId,
        existed: true,
        module: rawAction.module,
        row: beforeRow || { id: targetId },
      })
      appliedChanges.push({
        module: rawAction.module,
        operation: isComplete ? 'complete' : 'update',
        target_id: targetId,
        title: String(p.title || p.text || beforeRow?.title || beforeRow?.content || rawAction.title || ''),
      })
      continue
    }

    if (mod === 'pomodoro') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('workspace-pomodoro-command', { detail: p }))
      }
      appliedChanges.push({
        module: 'pomodoro',
        operation: 'control',
        title: String(rawAction.title || 'Pomodoro Kontrolü'),
      })
    } else if (mod === 'plans' || mod === 'quick') {
      const rawPeriod = String(p.period || p.scope || 'timeless')
      const period: PlanPeriod = ['timeless', 'daily', 'weekly', 'monthly', 'yearly'].includes(rawPeriod)
        ? (rawPeriod as PlanPeriod)
        : 'timeless'
      const periodDate = period === 'timeless' ? '1970-01-01' : String(p.period_date || periodStart(period, new Date()))
      const cid = bindingMap.get('plans')
      const inserted = await insertWithOptionalColumnRetry(
        client,
        'plans',
        {
          user_id: userId,
          workspace_id: workspaceId,
          ...(cid ? { collection_id: cid } : {}),
          title: String(p.title || rawAction.title || 'AI Notu').trim(),
          period,
          period_date: periodDate,
          completed: false,
          ...(p.notes ? { notes: String(p.notes) } : {}),
        },
        ['notes', 'collection_id'],
      )
      snapshots.push({ table: 'plans', id: String(inserted.id), existed: false, module: 'plans' })
      appliedChanges.push({ module: rawAction.module, operation: 'create', target_id: inserted.id, title: inserted.title })
    } else if (mod === 'detailed') {
      const cid = bindingMap.get('detailed')
      const inserted = await insertWithOptionalColumnRetry(
        client,
        'todos',
        {
          created_by: userId,
          workspace_id: workspaceId,
          ...(cid ? { collection_id: cid } : {}),
          title: String(p.title || rawAction.title || 'AI Detaylı Notu').trim(),
          description: String(p.description || p.notes || ''),
          completed: false,
          priority: String(p.priority || 'medium'),
        },
        ['collection_id'],
      )
      snapshots.push({ table: 'todos', id: String(inserted.id), existed: false, module: 'detailed' })
      appliedChanges.push({ module: 'todos', operation: 'create', target_id: inserted.id, title: inserted.title })
    } else if (mod === 'periodic') {
      const cid = bindingMap.get('periodic')
      const inserted = await insertWithOptionalColumnRetry(
        client,
        'periodic_tasks',
        {
          user_id: userId,
          workspace_id: workspaceId,
          ...(cid ? { collection_id: cid } : {}),
          title: String(p.title || rawAction.title || 'AI Rutin').trim(),
          category: String(p.category || 'habit'),
          frequency: String(p.frequency || 'daily'),
          days_of_week: [0, 1, 2, 3, 4, 5, 6],
          notes: p.notes ? String(p.notes) : null,
        },
        ['collection_id'],
      )
      snapshots.push({ table: 'periodic_tasks', id: String(inserted.id), existed: false, module: 'periodic' })
      appliedChanges.push({ module: 'periodic', operation: 'create', target_id: inserted.id, title: inserted.title })
    } else if (mod === 'code') {
      const cid = bindingMap.get('code')
      const inserted = await insertWithOptionalColumnRetry(
        client,
        'code_snippets',
        {
          created_by: userId,
          workspace_id: workspaceId,
          ...(cid ? { collection_id: cid } : {}),
          title: String(p.title || rawAction.title || 'AI Kod').trim(),
          language: String(p.language || 'typescript'),
          code: String(p.code || ''),
        },
        ['collection_id'],
      )
      snapshots.push({ table: 'code_snippets', id: String(inserted.id), existed: false, module: 'code' })
      appliedChanges.push({ module: 'code', operation: 'create', target_id: inserted.id, title: inserted.title })
    } else if (mod === 'tasks') {
      const rid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const taskPayload = {
        title: String(p.title || rawAction.title || 'AI Görevi').trim(),
        status: String(p.status || 'todo'),
        priority: String(p.priority || 'medium'),
        description: String(p.description || p.notes || ''),
        ...(p.due_on ? { due_on: String(p.due_on) } : {}),
      }
      const { data, error } = await client.rpc('work_mutate', {
        wid: workspaceId,
        entity: 'task',
        operation: 'create',
        rid,
        payload: taskPayload,
        expected_version: null,
      })
      let createdTask = data
      if (error) {
        if (!isMissingSchemaRpcError(error)) throw error
        const inserted = await insertWithOptionalColumnRetry(
          client,
          'work_tasks',
          {
            id: rid,
            workspace_id: workspaceId,
            user_id: userId,
            ...taskPayload,
            version: 1,
          },
          ['user_id', 'due_on'],
        )
        createdTask = inserted
      }
      const createdId = String(createdTask?.id || rid)
      const checklistItems = Array.isArray(p.checklist)
        ? p.checklist.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : []
      if (checklistItems.length) {
        for (const itemTitle of checklistItems) {
          const chkId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const subRes = await client.rpc('work_mutate', {
            wid: workspaceId,
            entity: 'checklist',
            operation: 'checklist_add',
            rid: chkId,
            payload: { task_id: createdId, title: itemTitle },
            expected_version: null,
          })
          if (subRes.error && isMissingSchemaRpcError(subRes.error)) {
            await client.from('work_checklists').insert({
              id: chkId,
              task_id: createdId,
              workspace_id: workspaceId,
              title: itemTitle,
              done: false,
            })
          }
        }
      }
      snapshots.push({
        table: 'work_tasks',
        id: createdId,
        existed: false,
        module: 'tasks',
        row: createdTask || { version: 1 },
      })
      appliedChanges.push({ module: 'tasks', operation: 'create', target_id: createdId, title: p.title || rawAction.title })
    } else if (mod === 'calendar') {
      const taskId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}`
      const blockId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`
      const title = String(p.title || rawAction.title || 'Takvim Etkinliği').trim()
      const description = String(p.description || p.notes || title)
      const timezone = String(
        p.timezone ||
          (typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC'),
      )
      const startsAt = String(p.starts_at || new Date().toISOString())
      const endsAt = String(p.ends_at || new Date(new Date(startsAt).getTime() + 60 * 60000).toISOString())
      const dueOn = p.due_on ? String(p.due_on) : startsAt.slice(0, 10)
      const estimateMinutes = Number(p.estimate_minutes || 60)

      const detailsRes = await client.rpc('work_save_details', {
        wid: workspaceId,
        tid: taskId,
        task_payload: {
          title,
          description,
          status: String(p.status || 'todo'),
          priority: String(p.priority || 'medium'),
          project_id: null,
          due_on: dueOn,
          estimate_minutes: estimateMinutes,
          checklist: [],
        },
        task_version: null,
        time_changes: [
          {
            id: blockId,
            title: '',
            starts_at: startsAt,
            ends_at: endsAt,
            timezone,
            subtask_ids: [],
          },
        ],
        time_removals: [],
      })

      if (!detailsRes?.error && detailsRes?.data) {
        const createdBlock = Array.isArray(detailsRes.data.blocks) ? detailsRes.data.blocks[0] : null
        const createdTask = detailsRes.data.task || null
        snapshots.push({
          table: 'work_blocks',
          id: String(createdBlock?.id || blockId),
          existed: false,
          module: 'calendar',
          row: createdBlock || { version: 1 },
        })
        snapshots.push({
          table: 'work_tasks',
          id: String(createdTask?.id || taskId),
          existed: false,
          module: 'tasks',
          row: createdTask || { version: 1 },
        })
        appliedChanges.push({
          module: 'calendar',
          operation: 'create',
          target_id: createdBlock?.id || blockId,
          title,
        })
      } else {
        if (detailsRes?.error && !isMissingSchemaRpcError(detailsRes.error)) {
          throw detailsRes.error
        }
        const { data, error } = await client.rpc('work_mutate', {
          wid: workspaceId,
          entity: 'block',
          operation: 'create',
          rid: blockId,
          payload: {
            title,
            starts_at: startsAt,
            ends_at: endsAt,
            timezone,
          },
          expected_version: null,
        })
        if (error) throw error
        snapshots.push({
          table: 'work_blocks',
          id: String(data?.id || blockId),
          existed: false,
          module: 'calendar',
          row: data || { version: 1 },
        })
        appliedChanges.push({
          module: 'calendar',
          operation: 'create',
          target_id: data?.id || blockId,
          title,
        })
      }
    } else if (mod === 'workout') {
      const cid = bindingMap.get('workout')
      const title = String(p.title || rawAction.title || 'AI Antrenman Programı').trim().slice(0, 120)
      const dayOfWeek = String(p.day_of_week || 'Any')
      const rawExercises = Array.isArray(p.exercises) ? p.exercises : []
      const normalizedExercises = rawExercises.map((ex: any, idx: number) => ({
        id: String(ex?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ex-${Date.now()}-${idx}`)),
        name: String(ex?.name || 'Egzersiz').trim().slice(0, 160),
        sets: Math.max(1, Math.min(20, Number(ex?.sets || 3))),
        reps: String(ex?.reps || '10-12').slice(0, 40),
        imageUrl: String(ex?.imageUrl || ''),
        catalogId: String(ex?.catalogId || ''),
        images: Array.isArray(ex?.images) ? ex.images : [],
        equipment: String(ex?.equipment || ''),
        muscles: Array.isArray(ex?.muscles) ? ex.muscles : [],
        weightKg: ex?.weightKg ?? null,
        restSeconds: ex?.restSeconds ?? 90,
        tempo: String(ex?.tempo || ''),
        alternative: String(ex?.alternative || ''),
        notes: String(ex?.notes || ''),
        isCompleted: false,
      }))

      const inserted = await insertWithOptionalColumnRetry(
        client,
        'workout_routines',
        {
          user_id: userId,
          workspace_id: workspaceId,
          ...(cid ? { collection_id: cid } : {}),
          title,
          day_of_week: dayOfWeek,
          exercises: cid ? [] : normalizedExercises,
        },
        ['workspace_id', 'collection_id'],
      )

      if (cid && inserted.id && normalizedExercises.length > 0) {
        let collectionItemsSaved = true
        for (const exercise of normalizedExercises) {
          const itemRes = await client.rpc('mutate_collection_item', {
            cid,
            pid: inserted.id,
            module_id: 'workout',
            operation: 'add',
            item: exercise,
            expected_version: null,
          })
          if (itemRes?.error) {
            collectionItemsSaved = false
            break
          }
        }
        if (!collectionItemsSaved) {
          await client.from('workout_routines').update({ exercises: normalizedExercises }).eq('id', inserted.id)
        }
      }

      snapshots.push({ table: 'workout_routines', id: String(inserted.id), existed: false, module: 'workout' })
      appliedChanges.push({ module: 'workout', operation: 'create', target_id: inserted.id, title: inserted.title || title })
    } else if (mod === 'flashcards') {
      const cid = bindingMap.get('flashcards')
      const title = String(p.title || rawAction.title || 'AI Çalışma Destesi').trim()
      const color = String(p.color || '#6366f1')
      const rawCards = Array.isArray(p.cards) ? p.cards : []
      const normalizedCards = rawCards.map((card: any, idx: number) => ({
        id: String(card?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `card-${Date.now()}-${idx}`)),
        front: String(card?.front || title),
        back: String(card?.back || ''),
      }))
      const inserted = await insertWithOptionalColumnRetry(
        client,
        'flashcard_decks',
        {
          user_id: userId,
          workspace_id: workspaceId,
          ...(cid ? { collection_id: cid } : {}),
          title,
          color,
          cards: cid ? [] : normalizedCards,
        },
        ['workspace_id', 'collection_id'],
      )
      if (cid && inserted.id && normalizedCards.length > 0) {
        let collectionCardsSaved = true
        for (const card of normalizedCards) {
          const itemRes = await client.rpc('mutate_collection_item', {
            cid,
            pid: inserted.id,
            module_id: 'flashcards',
            operation: 'add',
            item: card,
            expected_version: null,
          })
          if (itemRes?.error) {
            collectionCardsSaved = false
            break
          }
        }
        if (!collectionCardsSaved) {
          await client.from('flashcard_decks').update({ cards: normalizedCards }).eq('id', inserted.id)
        }
      }
      snapshots.push({ table: 'flashcard_decks', id: String(inserted.id), existed: false, module: 'flashcards' })
      appliedChanges.push({ module: 'flashcards', operation: 'create', target_id: inserted.id, title })
    } else if (mod === 'finance') {
      const entity = String(p.entity || '')
      if (entity === 'position' || rawOp === 'save_position') {
        const rid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        const posPayload = {
          title: String(p.title || rawAction.title || 'AI Pozisyon').trim(),
          kind: String(p.kind || 'other'),
          instrument: String(p.instrument || ''),
          price_source: String(p.price_source || 'manual'),
          quantity: Number(p.quantity || 1),
          buy_price: Number(p.buy_price || 1),
          purchased_on: String(p.purchased_on || today),
        }
        const { data, error } = await client.rpc('finance_mutate', {
          wid: workspaceId,
          entity: 'position',
          operation: 'create',
          rid,
          payload: posPayload,
          expected_version: null,
        })
        let createdId = String(data?.id || rid)
        if (error) {
          if (!isMissingSchemaRpcError(error)) throw error
          const insertRes = await client
            .from('finance_positions')
            .insert({ id: rid, workspace_id: workspaceId, user_id: userId, ...posPayload, version: 1 })
            .select('id')
            .single()
          if (insertRes.error) throw insertRes.error
          createdId = String(insertRes.data?.id || rid)
        }
        snapshots.push({ table: 'finance_positions', id: createdId, existed: false, module: 'finance' })
        appliedChanges.push({ module: 'finance', operation: 'save_position', target_id: createdId, title: posPayload.title })
      } else if (entity === 'recurring' || rawOp === 'save_recurring') {
        const rid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        const recPayload = {
          title: String(p.title || rawAction.title || 'Tekrarlayan İşlem').trim(),
          kind: p.kind === 'income' ? 'income' : 'expense',
          amount: Number(p.amount || 100),
          cadence: ['weekly', 'monthly', 'yearly'].includes(String(p.cadence)) ? String(p.cadence) : 'monthly',
          starts_on: String(p.starts_on || today),
          timezone: String(p.timezone || 'Europe/Istanbul'),
        }
        const { data, error } = await client.rpc('finance_schedule_mutate', {
          wid: workspaceId,
          operation: 'create',
          rid,
          payload: recPayload,
          expected_version: null,
        })
        let createdId = String(data?.id || rid)
        if (error) {
          if (!isMissingSchemaRpcError(error)) throw error
          const insertRes = await client
            .from('finance_recurring')
            .insert({ id: rid, workspace_id: workspaceId, user_id: userId, ...recPayload, version: 1 })
            .select('id')
            .single()
          if (insertRes.error) throw insertRes.error
          createdId = String(insertRes.data?.id || rid)
        }
        snapshots.push({ table: 'finance_recurring', id: createdId, existed: false, module: 'finance' })
        appliedChanges.push({ module: 'finance', operation: 'save_recurring', target_id: createdId, title: recPayload.title })
      } else if (entity === 'budget' || rawOp === 'set_budget') {
        const catName = String(p.category || 'Genel').trim()
        const monthStart = String(p.month || `${today.slice(0, 7)}-01`)
        const scope = p.scope === 'forward' ? 'forward' : 'month'
        const limitAmount = Number(p.amount || 1000)
        const catRows = await safeSelectRows(client, 'finance_categories', workspaceId, 50)
        let matchedCat = catRows.find((c: any) => normalizeTrSearch(String(c?.name || '')) === normalizeTrSearch(catName))
        if (!matchedCat) {
          const newCatId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
          const catRes = await client.rpc('finance_category_mutate', {
            wid: workspaceId,
            operation: 'create',
            rid: newCatId,
            payload: { name: catName },
            expected_version: null,
          })
          matchedCat = catRes?.data || { id: newCatId, name: catName, budget_version: 1 }
        }
        const { error } = await client.rpc('finance_budget_set', {
          wid: workspaceId,
          cid: matchedCat.id,
          month_start: monthStart,
          limit_amount: limitAmount,
          apply_scope: scope,
          expected_version: typeof matchedCat.budget_version === 'number' ? matchedCat.budget_version : 1,
        })
        if (error && !isMissingSchemaRpcError(error)) throw error
        appliedChanges.push({ module: 'finance', operation: 'set_budget', target_id: matchedCat.id, title: `${catName} (${limitAmount})` })
      } else {
        const rid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        const finPayload = {
          title: String(p.title || rawAction.title || 'AI İşlemi').trim(),
          kind: p.kind === 'income' ? 'income' : 'expense',
          category: String(p.category || 'general'),
          amount: Number(p.amount || 100),
          occurred_on: String(p.occurred_on || today),
          ...(p.note ? { note: String(p.note) } : {}),
        }
        const { data, error } = await client.rpc('finance_mutate', {
          wid: workspaceId,
          entity: 'transaction',
          operation: 'create',
          rid,
          payload: finPayload,
          expected_version: null,
        })
        let createdId = String(data?.id || rid)
        if (error) {
          if (!isMissingSchemaRpcError(error)) throw error
          const insertRes = await client
            .from('finance_transactions')
            .insert({
              id: rid,
              workspace_id: workspaceId,
              user_id: userId,
              ...finPayload,
              version: 1,
            })
            .select('id')
            .single()
          if (insertRes.error) throw insertRes.error
          createdId = String(insertRes.data?.id || rid)
        }
        snapshots.push({ table: 'finance_transactions', id: createdId, existed: false, module: 'finance' })
        appliedChanges.push({ module: 'finance', operation: 'create', target_id: createdId })
      }
    } else if (mod === 'activities') {
      const rid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const actPayload = {
        title: String(p.title || rawAction.title || 'AI Listesi').trim(),
        type: String(p.type || 'book'),
        status: String(p.status || 'want'),
        notes: p.notes ? String(p.notes) : '',
      }
      const { data, error } = await client.rpc('activity_library_mutate', {
        wid: workspaceId,
        operation: 'item.add',
        rid,
        payload: actPayload,
        expected_version: null,
      })
      let createdId = String(data?.item?.id || rid)
      if (error) {
        if (!isMissingSchemaRpcError(error)) throw error
        const insertRes = await client
          .from('activity_items')
          .insert({
            id: rid,
            workspace_id: workspaceId,
            user_id: userId,
            ...actPayload,
            version: 1,
          })
          .select('id')
          .single()
        if (insertRes.error) throw insertRes.error
        createdId = String(insertRes.data?.id || rid)
      }
      snapshots.push({ table: 'activity_items', id: createdId, existed: false, module: 'activities' })
      appliedChanges.push({ module: 'activities', operation: 'create', target_id: createdId })
    } else if (mod === 'learning') {
      const isMistakeCreate = rawAction.operation === 'mistake.create' || p.entity === 'mistake' || Boolean(p.prompt && p.solution)
      if (isMistakeCreate) {
        let subjectId = p.subject_id ? String(p.subject_id) : ''
        if (!subjectId) {
          const existingSubjects = await safeSelectRows(client, 'learning_subjects', workspaceId, 10)
          subjectId = existingSubjects[0]?.id ? String(existingSubjects[0].id) : ''
          if (!subjectId) {
            subjectId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sub-${Date.now()}`
            const subRpc = await client.rpc('learning_mutate', {
              wid: workspaceId,
              operation: 'subject.create',
              sid: subjectId,
              tid: null,
              payload: { title: 'Genel Öğrenme', color: '#6366f1' },
              expected_version: null,
            })
            if (subRpc.error) {
              if (!isMissingSchemaRpcError(subRpc.error)) throw subRpc.error
              await client.from('learning_subjects').insert({
                id: subjectId,
                workspace_id: workspaceId,
                user_id: userId,
                title: 'Genel Öğrenme',
                color: '#6366f1',
                version: 1,
              })
            }
          }
        }
        let topicId = p.topic_id ? String(p.topic_id) : ''
        if (!topicId) {
          const existingTopics = await client
            .from('learning_subjects_items')
            .select('id')
            .eq('parent_id', subjectId)
            .limit(1)
          topicId = existingTopics.data?.[0]?.id ? String(existingTopics.data[0].id) : ''
          if (!topicId) {
            const topRpc = await client.rpc('learning_mutate', {
              wid: workspaceId,
              operation: 'topic.add',
              sid: subjectId,
              tid: null,
              payload: { titles: ['Genel Hatalar'] },
              expected_version: null,
            })
            if (!topRpc.error) {
              const afterTopics = await client
                .from('learning_subjects_items')
                .select('id')
                .eq('parent_id', subjectId)
                .limit(1)
              topicId = afterTopics.data?.[0]?.id ? String(afterTopics.data[0].id) : ''
            } else if (!isMissingSchemaRpcError(topRpc.error)) {
              throw topRpc.error
            } else {
              const tidFallback = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `top-${Date.now()}`
              const learningCid = bindingMap.get('learning')
              await client.from('learning_subjects_items').insert({
                id: tidFallback,
                parent_id: subjectId,
                ...(learningCid ? { collection_id: learningCid } : {}),
                data: { title: 'Genel Hatalar', learn: false, practice: false, master: false },
                position: 1,
              })
              topicId = tidFallback
            }
          }
        }
        const mistakePayload = {
          title: String(p.title || rawAction.title || 'AI Hata Notu').trim(),
          prompt: String(p.prompt || p.title || rawAction.title || 'Hata kaydı').trim(),
          solution: String(p.solution || 'Tekrar gözden geçirilecek').trim(),
        }
        const mRpc = await client.rpc('learning_mutate', {
          wid: workspaceId,
          operation: 'mistake.create',
          sid: subjectId,
          tid: topicId || null,
          payload: mistakePayload,
          expected_version: null,
        })
        let createdMistakeId = String((mRpc.data as Record<string, unknown> | null)?.id || '')
        if (mRpc.error) {
          if (!isMissingSchemaRpcError(mRpc.error)) throw mRpc.error
          const mid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `mist-${Date.now()}`
          const mIns = await client
            .from('learning_mistakes')
            .insert({
              id: mid,
              workspace_id: workspaceId,
              user_id: userId,
              subject_id: subjectId,
              ...(topicId ? { topic_id: topicId } : {}),
              ...mistakePayload,
              resolved: false,
              version: 1,
            })
            .select('id')
            .single()
          if (mIns.error) throw mIns.error
          createdMistakeId = String(mIns.data?.id || mid)
        }
        snapshots.push({ table: 'learning_mistakes', id: createdMistakeId || subjectId, existed: false, module: 'learning' })
        appliedChanges.push({ module: 'learning', operation: 'mistake.create', target_id: createdMistakeId || subjectId })
      } else {
        const sid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        const subPayload = {
          title: String(p.title || rawAction.title || 'AI Konusu').trim(),
          color: String(p.color || '#6366f1'),
        }
        const { error } = await client.rpc('learning_mutate', {
          wid: workspaceId,
          operation: 'subject.create',
          sid,
          tid: null,
          payload: subPayload,
          expected_version: null,
        })
        let createdSid = sid
        if (error) {
          if (!isMissingSchemaRpcError(error)) throw error
          const sIns = await client
            .from('learning_subjects')
            .insert({
              id: sid,
              workspace_id: workspaceId,
              user_id: userId,
              ...subPayload,
              version: 1,
            })
            .select('id')
            .single()
          if (sIns.error) throw sIns.error
          createdSid = String(sIns.data?.id || sid)
        }
        const topicTitles = Array.isArray(p.topics)
          ? p.topics.map((t: unknown) => String(t || '').trim()).filter(Boolean)
          : []
        if (topicTitles.length) {
          const topRpc = await client.rpc('learning_mutate', {
            wid: workspaceId,
            operation: 'topic.add',
            sid: createdSid,
            tid: null,
            payload: { titles: topicTitles },
            expected_version: null,
          })
          if (topRpc.error) {
            if (!isMissingSchemaRpcError(topRpc.error)) throw topRpc.error
            const learningCid = bindingMap.get('learning')
            let pos = 1
            for (const title of topicTitles) {
              const tidFallback = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `top-${Date.now()}-${pos}`
              await client.from('learning_subjects_items').insert({
                id: tidFallback,
                parent_id: createdSid,
                ...(learningCid ? { collection_id: learningCid } : {}),
                data: { title, learn: false, practice: false, master: false },
                position: pos++,
              })
            }
          }
        }
        snapshots.push({ table: 'learning_subjects', id: createdSid, existed: false, module: 'learning' })
        appliedChanges.push({ module: 'learning', operation: 'create', target_id: createdSid })
      }
    }
  }

  const history = readLocalHistory()
  history.unshift({
    id: runId,
    workspace_id: workspaceId,
    provider: String(meta.provider || 'gemini'),
    model: String(meta.model || 'gemini-2.5-flash'),
    mode: String(meta.mode || 'ask_before_write'),
    status: 'applied',
    prompt_summary: String(meta.prompt_summary || meta.prompt || 'AI Veri Girişi'),
    target_modules: appliedChanges.map(c => String(c.module)),
    applied_changes: appliedChanges,
    created_at: new Date().toISOString(),
    undone_at: null,
    before_snapshots: snapshots,
  })
  writeLocalHistory(history)

  return {
    run_id: runId,
    status: 'applied',
    applied_count: appliedChanges.length,
    applied_changes: appliedChanges,
  }
}

export async function executeAiActions(
  workspaceId: string,
  actions: ProposedAiAction[],
  meta: Record<string, unknown> = {},
  client: any = supabase,
): Promise<{
  run_id: string
  status: string
  applied_count: number
  applied_changes: Array<Record<string, unknown>>
}> {
  for (const action of actions || []) {
    assertNotSecureTarget(action.module)
  }

  const normalizedActions = (actions || []).map(normalizeActionForSqlRpc)
  const normalizedMeta = {
    ...meta,
    prompt: meta.prompt || meta.prompt_summary || '',
  }

  const { data, error } = await client.rpc('ai_execute_actions', {
    wid: workspaceId,
    actions: normalizedActions,
    meta: normalizedMeta,
  })
  if (error) {
    if (isMissingSchemaRpcError(error)) {
      return await executeFallbackActions(workspaceId, actions, normalizedMeta, client)
    }
    throw error
  }
  return {
    run_id: data?.run_id || '',
    status: data?.status || 'applied',
    applied_count: Number(data?.applied_count ?? normalizedActions.length),
    applied_changes: Array.isArray(data?.applied_changes)
      ? data.applied_changes
      : Array.isArray(data?.results)
        ? data.results
        : [],
  }
}

export async function undoAiActionRun(
  workspaceId: string,
  runId: string,
  client: any = supabase,
): Promise<{
  run_id: string
  status: string
  restored_count: number
}> {
  if (String(runId).startsWith('local-')) {
    const history = readLocalHistory()
    const entry = history.find(item => item.id === runId && item.workspace_id === workspaceId)
    let restoredCount = 0
    if (entry && entry.status === 'applied' && Array.isArray(entry.before_snapshots)) {
      for (const snap of entry.before_snapshots) {
        if (!snap.existed) {
          const ver = typeof (snap.row as any)?.version === 'number' ? Number((snap.row as any).version) : 1
          if (snap.table === 'work_tasks') {
            await client.rpc('work_mutate', { wid: workspaceId, entity: 'task', operation: 'purge', rid: snap.id, payload: {}, expected_version: ver }).catch(() => null)
          } else if (snap.table === 'work_blocks') {
            await client.rpc('work_mutate', { wid: workspaceId, entity: 'block', operation: 'purge', rid: snap.id, payload: {}, expected_version: ver }).catch(() => null)
          } else if (snap.table === 'finance_transactions') {
            await client.rpc('finance_mutate', { wid: workspaceId, entity: 'transaction', operation: 'delete', rid: snap.id, payload: {}, expected_version: ver }).catch(() => null)
          } else if (snap.table === 'finance_positions') {
            await client.rpc('finance_mutate', { wid: workspaceId, entity: 'position', operation: 'delete', rid: snap.id, payload: {}, expected_version: ver }).catch(() => null)
          } else if (snap.table === 'finance_recurring') {
            await client.rpc('finance_schedule_mutate', { wid: workspaceId, operation: 'delete', rid: snap.id, payload: {}, expected_version: ver }).catch(() => null)
          } else if (client?.from) {
            await client.from(snap.table).delete().eq('id', snap.id)
          }
          restoredCount++
        } else if (snap.row) {
          const row = snap.row as Record<string, unknown>
          if (row.deleted_via_trash) {
            const trashMod = TRASH_MODULE_BY_TABLE[snap.table] || snap.module
            const expectedVer =
              typeof row.deleted_version === 'number'
                ? Number(row.deleted_version)
                : typeof row.version === 'number'
                  ? Number(row.version) + 1
                  : 2
            await client
              .rpc('trash_change', {
                wid: workspaceId,
                module_id: trashMod,
                rid: snap.id,
                action: 'restore',
                expected_version: expectedVer,
              })
              .catch(() => null)
            restoredCount++
          } else if (row.deleted_directly) {
            const copy = { ...row }
            delete copy.deleted_directly
            delete copy.deleted_via_trash
            delete copy.deleted_version
            if (client?.from) {
              await client.from(snap.table).insert(copy)
              restoredCount++
            }
          } else {
            const restorePatch: Record<string, unknown> = {}
            for (const field of MUTABLE_UNDO_FIELDS) {
              if (field in row && row[field] !== undefined) {
                restorePatch[field] = row[field]
              }
            }
            const nextVer = typeof row.version === 'number' ? Number(row.version) + 1 : null
            if (snap.table === 'work_tasks') {
              const res = await client
                .rpc('work_mutate', {
                  wid: workspaceId,
                  entity: 'task',
                  operation: 'update',
                  rid: snap.id,
                  payload: restorePatch,
                  expected_version: nextVer,
                })
                .catch(() => null)
              if (res?.error && isMissingSchemaRpcError(res.error) && client?.from && Object.keys(restorePatch).length > 0) {
                await updateTableRowWithOptionalNotesRetry(client, snap.table, snap.id, restorePatch)
              }
              restoredCount++
            } else if (snap.table === 'work_blocks') {
              const res = await client
                .rpc('work_mutate', {
                  wid: workspaceId,
                  entity: 'block',
                  operation: 'update',
                  rid: snap.id,
                  payload: restorePatch,
                  expected_version: nextVer,
                })
                .catch(() => null)
              if (res?.error && isMissingSchemaRpcError(res.error) && client?.from && Object.keys(restorePatch).length > 0) {
                await updateTableRowWithOptionalNotesRetry(client, snap.table, snap.id, restorePatch)
              }
              restoredCount++
            } else if (snap.table === 'finance_transactions') {
              const res = await client
                .rpc('finance_mutate', {
                  wid: workspaceId,
                  entity: 'transaction',
                  operation: 'update',
                  rid: snap.id,
                  payload: restorePatch,
                  expected_version: nextVer,
                })
                .catch(() => null)
              if (res?.error && isMissingSchemaRpcError(res.error) && client?.from && Object.keys(restorePatch).length > 0) {
                await updateTableRowWithOptionalNotesRetry(client, snap.table, snap.id, restorePatch)
              }
              restoredCount++
            } else if (snap.table === 'finance_positions') {
              const res = await client
                .rpc('finance_mutate', {
                  wid: workspaceId,
                  entity: 'position',
                  operation: 'update',
                  rid: snap.id,
                  payload: restorePatch,
                  expected_version: nextVer,
                })
                .catch(() => null)
              if (res?.error && isMissingSchemaRpcError(res.error) && client?.from && Object.keys(restorePatch).length > 0) {
                await updateTableRowWithOptionalNotesRetry(client, snap.table, snap.id, restorePatch)
              }
              restoredCount++
            } else if (client?.from && Object.keys(restorePatch).length > 0) {
              await updateTableRowWithOptionalNotesRetry(client, snap.table, snap.id, restorePatch)
              restoredCount++
            }
          }
        }
      }
      entry.status = 'undone'
      entry.undone_at = new Date().toISOString()
      writeLocalHistory(history)
    }
    return { run_id: runId, status: 'undone', restored_count: restoredCount }
  }

  const { data, error } = await client.rpc('ai_undo_action_run', {
    wid: workspaceId,
    run_id: runId,
  })
  if (error) throw error
  return data
}

export async function fetchAiActionHistory(
  workspaceId: string,
  limit = 20,
  client: any = supabase,
): Promise<AiActionRunRecord[]> {
  const localRows = readLocalHistory(workspaceId)
  const { data, error } = await client.rpc('ai_action_history', {
    wid: workspaceId,
    lim: limit,
  })
  if (error) {
    if (isMissingSchemaRpcError(error)) {
      return localRows.slice(0, limit)
    }
    throw error
  }
  const serverRows: AiActionRunRecord[] = Array.isArray(data)
    ? data.map((row: any) => ({
        id: String(row.id),
        provider: String(row.provider || 'local'),
        model: String(row.model || ''),
        mode: String(row.mode || row.write_mode || 'ask_before_write'),
        status: (row.status || 'applied') as 'applied' | 'undone' | 'failed',
        prompt_summary: String(row.prompt_summary || row.prompt || 'AI Veri Girişi'),
        target_modules: Array.isArray(row.target_modules)
          ? row.target_modules
          : Array.isArray(row.actions)
            ? row.actions.map((a: any) => String(a?.module || '')).filter(Boolean)
            : [],
        applied_changes: Array.isArray(row.applied_changes)
          ? row.applied_changes
          : Array.isArray(row.after_snapshots)
            ? row.after_snapshots
            : [],
        created_at: String(row.created_at || new Date().toISOString()),
        undone_at: row.undone_at || null,
      }))
    : []

  const seen = new Set(serverRows.map(r => r.id))
  return [...serverRows, ...localRows.filter(r => !seen.has(r.id))].slice(0, limit)
}

function parseJsonFromLlmText(text: string): Record<string, unknown> {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  const parsed = JSON.parse(slice)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_LLM_JSON')
  }
  return parsed as Record<string, unknown>
}

async function callClientSideProvider(
  provider: AiProviderId,
  model: string,
  apiKey: string,
  digest: AiWorkspaceDigest,
  request: AiAssistantRequest,
): Promise<{
  reply: string
  insights: AiInsightItem[]
  recommendations: AiRecommendationItem[]
  proposed_actions: ProposedAiAction[]
  clarification?: AiClarificationPrompt | null
}> {
  const fetchFn = globalThis.fetch
  if (typeof fetchFn !== 'function') {
    throw new Error('FETCH_UNAVAILABLE')
  }

  const systemPrompt = [
    'Sen kullanıcının samimi, zeki ve doğal konuşan kişisel çalışma alanı asistanısın. Daima sıcak, akıcı ve insansı bir Türkçe ile yanıt ver; asla mekanik/şablon bir bot gibi konuşma.',
    'Güvenli Notlar / Kasa ("secure") verilerine asla erişme, okuma veya yazma.',
    'SOHBET VE ANLAMSAL AKIL YÜRÜTME:',
    '- Kullanıcı selam veriyorsa ("selam nasılsın"), sohbet ediyorsa, soru soruyorsa ("takvime neler ekleyebiliriz?"), fikir danışıyorsa veya "hiçbirine ekleme / vazgeç" diyorsa ASLA "clarification" üretme ve ASLA aksiyon eklemeye çalışma. Doğrudan doğal bir insan asistan gibi sohbet et, fikir ver ve çalışma alanındaki verilerden (workspace_digest) örneklerle yardımcı ol.',
    '- Kullanıcının illa "plan", "görev", "ekle" gibi anahtar kelimeler kullanmasını bekleme. ChatGPT gibi doğal konuşma dilini, bağlamı, zaman/tutar/konu ipuçlarını ve "conversation_history" içindeki önceki konuşmaları anlamlandır.',
    'AKSİYON VE NETLEŞTİRME AKIŞI (YALNIZCA KULLANICI VERİ KAYDETMEK / DEĞİŞTİRMEK İSTEDİĞİNDE):',
    '1) NETLEŞTİRME (CLARIFICATION): Kullanıcı açıkça bir bilgi kaydetmek, planlamak veya düzenlemek istiyor ama hangi modüle/kayda gideceği birden fazla mantıklı seçenek arasında belirsizse (ve "/" ile kesin bir kapsam seçmemişse): "proposed_actions": [] döndür ve "clarification" alanında 2–4 somut seçenek sun. Her seçeneğin "action" objesi doğrudan uygulanabilir tam şemada olmalıdır.',
    '2) ÇOK TURLU DEVAM: "conversation_history" içinde bir önceki turda seçenek sunduysan ve kullanıcı şimdi "1. seçenek", "takvime koy", "plan olsun" gibi yanıt verdiyse artık soru sorma, doğrudan "proposed_actions" üret ve "clarification": null döndür. Kullanıcı "hiçbirine ekleme" dediyse aksiyon üretme, doğal biçimde onaylayıp sohbete devam et.',
    '3) GÜNCELLEME / SİLME / TAMAMLAMA: "workspace_digest" içinde ilgili kaydı ara. Eşleşen kaydın "id" değerini "target_id" olarak ve "operation": "update" | "delete" | "complete" şeklinde aksiyon üret ("payload.source_table" bilgisini koru). Birden fazla yakın eşleşme varsa "clarification" ile hangisini kastettiğini sor. Hiç eşleşme yoksa "proposed_actions": [] döndür ve kaydın bulunamadığını açıkla.',
    '4) ARAŞTIRMA & DOĞRUDAN YAZMA: Niyet ve hedef modül netse önce "reply" alanında açıklayıcı ve doğal yanıtını yaz, sonra "proposed_actions" içinde doğru hedef modülü hedefleyen temiz başlık ve yapılandırılmış payload oluştur.',
    'Sadece geçerli JSON döndür:',
    '{"reply": string, "insights": [{"title": string, "detail": string, "severity": "info"|"warning"|"success", "module": string}], "recommendations": [{"title": string, "reason": string, "suggested_action": {"module": string, "operation": string, "target_id"?: string, "write_mode": "append"|"prepend"|"replace"|"insert_section", "title": string, "summary": string, "payload": object} | null}], "proposed_actions": [{"module": string, "operation": string, "target_id"?: string, "write_mode": "append"|"prepend"|"replace"|"insert_section", "title": string, "summary": string, "payload": object}], "clarification": {"question": string, "options": [{"id": string, "label": string, "description": string, "action": {"module": string, "operation": string, "target_id"?: string, "write_mode": "append"|"prepend"|"replace"|"insert_section", "title": string, "summary": string, "payload": object}}]} | null}',
    'Desteklenen modüller ve payload formatları:',
    '- "workout" (Antrenman Takipçisi): payload {"title": string, "day_of_week": "Any"|"Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday"|"Saturday"|"Sunday", "exercises": [{"name": string, "sets": number, "reps": string, "restSeconds": number, "tempo": string, "notes": string}]}',
    '- "flashcards" (Bilgi Kartları): payload {"title": string, "color": string, "cards": [{"front": string, "back": string}]} — kullanıcı 10 kelime/kart isterse 10 öğenin tamamını "cards" dizisine koy.',
    '- "calendar" (Takvim Zaman Bloğu + Görev Notu): payload {"title": string, "description": string, "due_on": "YYYY-MM-DD", "starts_at": ISO8601, "ends_at": ISO8601, "estimate_minutes": number}',
    '- "tasks" (Görevler): payload {"title": string, "description": string, "status": "todo"|"done", "priority": "low"|"medium"|"high", "due_on": "YYYY-MM-DD"|null}',
    '- "plans" (Planlar): payload {"title": string, "period": "daily"|"weekly"|"monthly"|"yearly"|"timeless", "notes": string}',
    '- "quick_notes" (Hızlı Notlar): payload {"title": string, "text": string, "period": "timeless", "source_table"?: "plans"|"quick_notes"}',
    '- "todos" (Detaylı Notlar): payload {"title": string, "description": string, "priority": "medium"}',
    '- "periodic", "activities", "finance", "learning", "code".',
  ].join('\n')

  const userPayload = JSON.stringify({
    mode: request.mode,
    target_intent: request.prompt ? classifyPromptIntent(request.prompt) : 'analyze',
    active_scope: request.scope || null,
    conversation_history: Array.isArray(request.history) ? request.history.slice(-10) : [],
    now_local: new Date().toString(),
    timezone:
      typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC',
    prompt: request.prompt || '',
    workspace_digest: digest,
  })

  let rawText = ''
  if (provider === 'gemini') {
    const candidates = Array.from(
      new Set([model || 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash']),
    )
    let lastError = 'GEMINI_HTTP_ERROR'
    let succeeded = false
    for (const candidateModel of candidates) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPayload }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.55,
            maxOutputTokens: 2048,
          },
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as any
        const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
          ? data.candidates[0].content.parts
          : []
        const outputText = parts
          .filter((part: any) => part && !part.thought && typeof part.text === 'string')
          .map((part: any) => part.text)
          .join('')
        rawText = outputText || parts.find((part: any) => typeof part?.text === 'string')?.text || '{}'
        try {
          parseJsonFromLlmText(rawText)
          succeeded = true
          break
        } catch {
          lastError = 'INVALID_LLM_JSON'
          continue
        }
      }
      lastError = `GEMINI_HTTP_${res.status}`
      if (res.status === 401 || res.status === 403) break
    }
    if (!succeeded) throw new Error(lastError)
  } else if (provider === 'openai') {
    const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4.1-mini',
        temperature: 0.55,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPayload },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OPENAI_HTTP_${res.status}`)
    const data = (await res.json()) as any
    rawText = data?.choices?.[0]?.message?.content || '{}'
  } else {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-haiku-latest',
        max_tokens: 2048,
        temperature: 0.55,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPayload }],
      }),
    })
    if (!res.ok) throw new Error(`ANTHROPIC_HTTP_${res.status}`)
    const data = (await res.json()) as any
    const block = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === 'text') : null
    rawText = block?.text || '{}'
  }

  const parsed = parseJsonFromLlmText(rawText)
  const proposedRaw = Array.isArray(parsed.proposed_actions) ? parsed.proposed_actions : []
  const proposed_actions: ProposedAiAction[] = []
  for (const act of proposedRaw) {
    if (!act || typeof act !== 'object') continue
    const a = act as Record<string, unknown>
    assertNotSecureTarget(String(a.module || ''))
    proposed_actions.push({
      module: String(a.module || 'quick_notes'),
      operation: String(a.operation || 'create'),
      write_mode: (['replace', 'append', 'prepend', 'insert_section'].includes(String(a.write_mode))
        ? String(a.write_mode)
        : 'append') as AiNoteWriteMode,
      ...(a.target_id ? { target_id: String(a.target_id) } : {}),
      ...(a.title ? { title: String(a.title) } : {}),
      ...(a.summary ? { summary: String(a.summary) } : {}),
      payload: a.payload && typeof a.payload === 'object' ? (a.payload as Record<string, unknown>) : {},
    })
  }

  const insights: AiInsightItem[] = Array.isArray(parsed.insights)
    ? parsed.insights.slice(0, 8).map((item: any) => ({
        title: String(item?.title || 'Analiz'),
        detail: String(item?.detail || item?.summary || ''),
        severity: item?.severity === 'warning' ? 'warning' : item?.severity === 'success' || item?.severity === 'positive' ? 'success' : 'info',
        module: String(item?.module || 'plans'),
      }))
    : []

  const recommendations: AiRecommendationItem[] = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.slice(0, 6).map((rec: any) => ({
        title: String(rec?.title || 'Öneri'),
        reason: String(rec?.reason || ''),
        suggested_action: rec?.suggested_action || rec?.action || null,
      }))
    : []

  let clarification: AiClarificationPrompt | null = null
  if (parsed.clarification && typeof parsed.clarification === 'object') {
    const rawClar = parsed.clarification as Record<string, unknown>
    const rawOpts = Array.isArray(rawClar.options) ? rawClar.options : []
    const validOpts: AiClarificationOption[] = []
    for (let i = 0; i < rawOpts.length && validOpts.length < 4; i += 1) {
      const opt = rawOpts[i] as Record<string, unknown>
      if (!opt || typeof opt !== 'object' || !opt.action || typeof opt.action !== 'object') continue
      const act = opt.action as Record<string, unknown>
      const mod = String(act.module || '')
      if (!mod) continue
      assertNotSecureTarget(mod)
      const normalizedAct: ProposedAiAction = {
        module: mod,
        operation: String(act.operation || 'create'),
        write_mode: (['replace', 'append', 'prepend', 'insert_section'].includes(String(act.write_mode))
          ? String(act.write_mode)
          : 'append') as AiNoteWriteMode,
        ...(act.target_id ? { target_id: String(act.target_id) } : {}),
        ...(act.title ? { title: String(act.title) } : {}),
        ...(act.summary ? { summary: String(act.summary) } : {}),
        payload: act.payload && typeof act.payload === 'object' ? (act.payload as Record<string, unknown>) : {},
      }
      const scopedAct = request.scope
        ? enforceScopeOnActions([normalizedAct], request.scope, request.prompt || '')[0] || normalizedAct
        : normalizedAct
      validOpts.push({
        id: String(opt.id || `opt-${i + 1}`),
        label: String(opt.label || normalizedAct.summary || normalizedAct.title || mod),
        ...(opt.description ? { description: String(opt.description) } : {}),
        action: scopedAct,
      })
    }
    if (validOpts.length >= 2) {
      clarification = {
        question:
          typeof rawClar.question === 'string' && rawClar.question.trim()
            ? rawClar.question.trim()
            : 'İşlemi hangi alana uygulamamı istersiniz?',
        options: validOpts,
      }
    }
  }

  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : clarification?.question || 'Analiz tamamlandı.',
    insights,
    recommendations,
    proposed_actions,
    clarification,
  }
}

const EDGE_EXPLICIT_ERROR_CODES = new Set([
  'AI_SECURE_MODULE_FORBIDDEN',
  'PROVIDER_AUTH',
  'PROVIDER_RATE_LIMIT',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_JSON',
  'RATE_LIMITED',
  'AUTH_REQUIRED',
  'AI_SERVICE_UNAVAILABLE',
])

function isHighRiskAction(action: ProposedAiAction, batchSize: number): boolean {
  const op = String(action.operation || '').toLowerCase()
  if (op === 'delete' || op === 'purge' || op === 'remove') return true
  if (action.module === 'finance' || action.module === 'calendar') return true
  if (batchSize > 1) return true
  return false
}

export async function invokeAiAssistant(
  request: AiAssistantRequest,
  client: any = supabase,
): Promise<AiAssistantResponse> {
  if (request.prompt && isSecureVaultPrompt(request.prompt)) {
    throw new Error('AI_SECURE_MODULE_FORBIDDEN')
  }
  for (const target of request.targets || []) {
    assertNotSecureTarget(target.module)
  }
  for (const action of request.actions || []) {
    assertNotSecureTarget(action.module)
  }
  if (request.note_context?.module) {
    assertNotSecureTarget(request.note_context.module)
  }

  const resolvedTimezone =
    request.timezone ||
    (typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC')
  const generatedRequestId =
    request.request_id ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)

  const edgePayload: AiAssistantRequest = {
    ...request,
    timezone: resolvedTimezone,
    locale: request.locale || 'tr',
    request_id: generatedRequestId,
    auto_execute: request.auto_execute ?? request.write_mode === 'auto_apply',
  }

  // Try Edge Function first when available
  if (client?.functions && typeof client.functions.invoke === 'function') {
    try {
      const { data, error } = await client.functions.invoke('ai-assistant', {
        body: edgePayload,
      })
      if (!error && data && typeof data === 'object' && data.ok !== false && !data.error) {
        return data as AiAssistantResponse
      }
      let errBody: Record<string, unknown> | null =
        data && typeof data === 'object' ? (data as Record<string, unknown>) : null
      if (!errBody && error?.context && typeof error.context.json === 'function') {
        errBody = await error.context.json().catch(() => null)
      }
      const errCode = String(errBody?.error || error?.message || '')
      if (errCode.includes('AI_SECURE_MODULE_FORBIDDEN')) {
        throw new Error('AI_SECURE_MODULE_FORBIDDEN')
      }
      if (EDGE_EXPLICIT_ERROR_CODES.has(errCode)) {
        throw new Error(errCode)
      }
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (EDGE_EXPLICIT_ERROR_CODES.has(msg) || msg.includes('AI_SECURE_MODULE_FORBIDDEN')) {
        throw err
      }
      // Otherwise fall back to direct provider BYOK / local synthesis + RPC execution
    }
  }

  const localSettings = readLocalSettings()
  const writeMode: AiWriteMode = request.write_mode || localSettings.write_mode || 'ask_before_write'
  const provider: AiProviderId = request.provider || localSettings.provider || 'gemini'
  const model = request.model || localSettings.model || PROVIDER_MODELS[provider][0].id

  // Mode: transform_note
  if (request.mode === 'transform_note' && request.note_context) {
    const ctx = request.note_context
    const targetFormat = ctx.target_format || 'html'
    const apiKey = typeof localSettings?.api_keys?.[provider] === 'string' ? localSettings.api_keys[provider] : ''
    let transformed: { transformed_text: string; transformed_markdown: string; reply: string } | null = null
    if (apiKey) {
      transformed = await callClientSideNoteTransform(provider, model, apiKey, ctx, request.prompt || '')
    }
    if (!transformed) {
      transformed = transformNoteLocally(
        ctx.text,
        ctx.instruction,
        targetFormat,
        request.prompt || '',
      )
    }
    const mergedText = applyNoteWriteMode(
      ctx.text,
      transformed.transformed_text,
      ctx.write_mode || 'replace',
      targetFormat,
      ctx.section_heading,
    )

    return {
      ok: true,
      provider,
      model,
      write_mode: writeMode,
      reply: transformed.reply,
      insights: [],
      recommendations: [],
      proposed_actions: [],
      transformed_text: mergedText,
      transformed_markdown: transformed.transformed_markdown,
    }
  }

  if (request.scope?.module) {
    assertNotSecureTarget(request.scope.module)
  }

  const digest = await fetchAiWorkspaceDigest(request.workspace_id, {}, client)
  let synthesis = synthesizeWorkspaceAnalysis(digest, request.prompt || '', request.scope)
  let activeProvider: string = 'local'

  const clientApiKey = localSettings.api_keys[provider]
  if (clientApiKey && !request.actions?.length) {
    try {
      const scopedRequest = request.scope
        ? {
            ...request,
            prompt: `${scopeDirectiveFor(request.scope)}\n${request.prompt || ''}`.trim(),
          }
        : request
      const llmOutput = await callClientSideProvider(provider, model, clientApiKey, digest, scopedRequest)
      const promptIntent = request.prompt ? classifyPromptIntent(request.prompt) : 'analyze'
      const fallbackSpecific = synthesis.proposed_actions.filter(a => a.module !== 'quick_notes')

      let combinedActions: ProposedAiAction[]
      let finalReply = llmOutput.reply
      let finalClarification: AiClarificationPrompt | null = llmOutput.clarification || null

      const isConversational = request.prompt ? isConversationalOnlyPrompt(request.prompt) : false

      if (isConversational && !llmOutput.proposed_actions.length) {
        combinedActions = []
        finalClarification = null
      } else if (finalClarification?.options?.length && !llmOutput.proposed_actions.length) {
        combinedActions = []
      } else if (promptIntent === 'update' || promptIntent === 'delete' || promptIntent === 'complete') {
        const validLlmMutations = llmOutput.proposed_actions
          .filter(a => Boolean(a.target_id) && String(a.operation || '').toLowerCase() !== 'create')
          .map(act => {
            const detMatch = synthesis.proposed_actions.find(s => s.target_id === act.target_id)
            if (detMatch?.payload?.source_table && !act.payload?.source_table) {
              return {
                ...act,
                payload: { ...(act.payload || {}), source_table: detMatch.payload.source_table },
              }
            }
            return act
          })
        if (validLlmMutations.length > 0) {
          combinedActions = validLlmMutations
        } else {
          combinedActions = synthesis.proposed_actions
          if (synthesis.proposed_actions.length === 0 && llmOutput.proposed_actions.length > 0) {
            finalReply = synthesis.reply
          }
        }
      } else {
        combinedActions = llmOutput.proposed_actions.length
          ? llmOutput.proposed_actions
          : synthesis.proposed_actions
        if (
          fallbackSpecific.length > 0 &&
          (!llmOutput.proposed_actions.length ||
            llmOutput.proposed_actions.every(a => a.module === 'quick_notes'))
        ) {
          combinedActions = synthesis.proposed_actions
        } else {
          combinedActions = combinedActions.map(act => {
            if (
              act.module === 'workout' &&
              (!Array.isArray(act.payload?.exercises) || !act.payload.exercises.length)
            ) {
              const match = fallbackSpecific.find(f => f.module === 'workout')
              if (match) return match
            }
            if (
              act.module === 'flashcards' &&
              (!Array.isArray(act.payload?.cards) || act.payload.cards.length < 2)
            ) {
              const match = fallbackSpecific.find(f => f.module === 'flashcards')
              if (match) return match
            }
            if (act.module === 'calendar' && !act.payload?.starts_at) {
              const match = fallbackSpecific.find(f => f.module === 'calendar')
              if (match) return match
            }
            if (
              act.module === 'learning' &&
              act.operation !== 'mistake.create' &&
              (!Array.isArray(act.payload?.topics) || !act.payload.topics.length)
            ) {
              const match = fallbackSpecific.find(
                f => f.module === 'learning' && Array.isArray(f.payload?.topics) && f.payload.topics.length,
              )
              if (match) return match
            }
            return act
          })
        }
      }

      const scopedActions = enforceScopeOnActions(combinedActions, request.scope, request.prompt || '')
      synthesis = {
        reply: finalReply,
        insights: llmOutput.insights.length ? llmOutput.insights : synthesis.insights,
        recommendations: llmOutput.recommendations.length ? llmOutput.recommendations : synthesis.recommendations,
        proposed_actions: scopedActions,
        clarification: scopedActions.length ? null : finalClarification,
      }
      activeProvider = provider
    } catch (err: any) {
      if (String(err?.message || '').includes('AI_SECURE_MODULE_FORBIDDEN')) {
        throw err
      }
      // Graceful fallback to deterministic workspace synthesis
    }
  }

  const actionsToHandle = request.actions?.length ? request.actions : synthesis.proposed_actions
  const allAutoEligible =
    actionsToHandle.length > 0 &&
    actionsToHandle.every(act => !isHighRiskAction(act, actionsToHandle.length))

  let appliedRun: AiAssistantResponse['applied_run'] = null
  if (
    actionsToHandle.length > 0 &&
    ((writeMode === 'auto_apply' && allAutoEligible) || (request.mode === 'write' && request.actions?.length))
  ) {
    appliedRun = await executeAiActions(
      request.workspace_id,
      actionsToHandle,
      {
        provider: activeProvider,
        model,
        mode: writeMode,
        prompt: String(request.prompt || 'AI veri girişi').slice(0, 240),
        prompt_summary: String(request.prompt || 'AI veri girişi').slice(0, 240),
      },
      client,
    )
  }

  return {
    ok: true,
    provider: activeProvider,
    model,
    write_mode: writeMode,
    reply: synthesis.reply,
    insights: synthesis.insights,
    recommendations: synthesis.recommendations,
    proposed_actions: appliedRun ? [] : actionsToHandle,
    clarification: appliedRun ? null : (synthesis.clarification ?? null),
    applied_run: appliedRun,
    digest,
  }
}

// ---------------------------------------------------------------------------
// Hierarchical "/" scope mentions (Section › Module › View)
// ---------------------------------------------------------------------------

export interface AiScopeNode {
  id: string
  label: string
  icon?: string
  description?: string
  module?: string
  view?: string
  aliases?: string[]
  disabled?: boolean
  disabledReason?: string
  children?: AiScopeNode[]
}

export interface AiPromptScope {
  /** Node ids from the root to the selected node, e.g. ['notes','plans','yearly'] */
  path: string[]
  /** Human readable labels for the same path, e.g. ['Notlar','Planlar','Yıllık'] */
  labels: string[]
  /** Deepest selected module (aiClient module id), e.g. 'plans' */
  module?: string
  /** Deepest selected view/sub-tab, e.g. 'yearly' */
  view?: string
}

const planViews: AiScopeNode[] = [
  { id: 'timeless', label: 'Hızlı Not', icon: 'Zap', module: 'plans', view: 'timeless', aliases: ['hizli', 'quick', 'not'] },
  { id: 'daily', label: 'Günlük', icon: 'Sun', module: 'plans', view: 'daily', aliases: ['gunluk', 'daily', 'bugün'] },
  { id: 'weekly', label: 'Haftalık', icon: 'CalendarRange', module: 'plans', view: 'weekly', aliases: ['haftalik', 'weekly'] },
  { id: 'monthly', label: 'Aylık', icon: 'CalendarDays', module: 'plans', view: 'monthly', aliases: ['aylik', 'monthly'] },
  { id: 'yearly', label: 'Yıllık', icon: 'CalendarClock', module: 'plans', view: 'yearly', aliases: ['yillik', 'yearly'] },
]

export const AI_SCOPE_TREE: AiScopeNode[] = [
  {
    id: 'notes',
    label: 'Notlar',
    icon: 'NotebookPen',
    description: 'Planlar, detaylı notlar ve kod kütüphanesi',
    aliases: ['notes', 'not'],
    children: [
      { id: 'plans', label: 'Planlar', icon: 'ListChecks', module: 'plans', description: 'Hızlı not, günlük, haftalık, aylık, yıllık', aliases: ['plan'], children: planViews },
      { id: 'detailed', label: 'Detaylı Notlar', icon: 'FileText', module: 'todos', description: 'Zengin metinli notlar', aliases: ['detayli', 'todos'] },
      { id: 'code', label: 'Kod Kütüphanesi', icon: 'Code2', module: 'code', description: 'Kod parçacıkları', aliases: ['kod', 'snippet', 'code'] },
      { id: 'secure', label: 'Güvenli Kasa', icon: 'ShieldCheck', disabled: true, disabledReason: 'Uçtan uca şifreli; AI erişimine kapalı', aliases: ['kasa', 'secure'] },
    ],
  },
  {
    id: 'planning',
    label: 'Takvim',
    icon: 'CalendarDays',
    description: 'Görevler, takvim blokları ve periyodik rutinler',
    aliases: ['planning', 'calendar', 'gorev'],
    children: [
      {
        id: 'tasks',
        label: 'Görevler',
        icon: 'ListTodo',
        module: 'tasks',
        description: 'Liste, pano ve takvim görünümleri',
        aliases: ['gorev', 'task'],
        children: [
          { id: 'list', label: 'Liste', icon: 'List', module: 'tasks', view: 'list' },
          { id: 'board', label: 'Pano', icon: 'Columns3', module: 'tasks', view: 'board', aliases: ['kanban'] },
          { id: 'calendar', label: 'Takvim', icon: 'CalendarClock', module: 'calendar', view: 'calendar', aliases: ['etkinlik', 'randevu'] },
        ],
      },
      { id: 'periodic', label: 'Periyodik Rutinler', icon: 'Repeat2', module: 'periodic', description: 'Tekrarlayan rutinler', aliases: ['rutin', 'periyodik'] },
    ],
  },
  {
    id: 'learning',
    label: 'Öğrenme',
    icon: 'BookOpen',
    description: 'Öğrenme takipçisi ve bilgi kartları',
    aliases: ['ogrenme', 'learning'],
    children: [
      {
        id: 'learning',
        label: 'Öğrenme Takipçisi',
        icon: 'GraduationCap',
        module: 'learning',
        description: 'Konular / müfredat ve hata notları',
        aliases: ['takipci', 'mufredat'],
        children: [
          { id: 'topics', label: 'Konular', icon: 'BookOpen', module: 'learning', view: 'topics', aliases: ['mufredat', 'konu'] },
          { id: 'mistakes', label: 'Hata Notları', icon: 'NotebookPen', module: 'learning', view: 'mistakes', aliases: ['hata', 'mistake'] },
        ],
      },
      { id: 'flashcards', label: 'Bilgi Kartları', icon: 'Layers', module: 'flashcards', description: 'Çalışma kartı desteleri', aliases: ['kart', 'flashcard'] },
    ],
  },
  {
    id: 'life',
    label: 'Yaşam',
    icon: 'Heart',
    description: 'Antrenman ve kişisel listeler',
    aliases: ['life', 'yasam'],
    children: [
      { id: 'workout', label: 'Antrenman Takipçisi', icon: 'Dumbbell', module: 'workout', description: 'Antrenman programları', aliases: ['antrenman', 'spor', 'workout'] },
      { id: 'activities', label: 'Listelerim', icon: 'Clapperboard', module: 'activities', description: 'Film, dizi, kitap, mekan', aliases: ['liste', 'film', 'kitap'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finans',
    icon: 'Wallet',
    description: 'Gelir/gider, pozisyon, bütçe ve tekrarlayan işlemler',
    aliases: ['finance', 'para'],
    children: [
      { id: 'transaction', label: 'Gelir / Gider', icon: 'ArrowLeftRight', module: 'finance', view: 'transaction', aliases: ['islem', 'harcama', 'gelir', 'gider'] },
      { id: 'position', label: 'Pozisyonlar', icon: 'TrendingUp', module: 'finance', view: 'position', aliases: ['portfoy', 'hisse', 'kripto'] },
      { id: 'budget', label: 'Bütçe Limitleri', icon: 'PiggyBank', module: 'finance', view: 'budget', aliases: ['butce', 'limit'] },
      { id: 'recurring', label: 'Tekrarlayan İşlemler', icon: 'Repeat', module: 'finance', view: 'recurring', aliases: ['abonelik', 'tekrarlayan'] },
    ],
  },
]

function foldScopeText(value: string): string {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim()
}

/** Children offered after the next "/" for the current selection (roots when nothing is selected). */
export function getScopeChildren(path: AiScopeNode[]): AiScopeNode[] {
  if (!path.length) return AI_SCOPE_TREE
  return path[path.length - 1].children || []
}

/** Resolves a list of node ids to nodes, stopping at the first unknown id. */
export function resolveScopePath(ids: string[]): AiScopeNode[] {
  const out: AiScopeNode[] = []
  let level = AI_SCOPE_TREE
  for (const id of ids) {
    const node = level.find(n => n.id === id)
    if (!node) break
    out.push(node)
    level = node.children || []
  }
  return out
}

/** Filters options by label/alias using Turkish-insensitive prefix + substring matching. */
export function filterScopeOptions(options: AiScopeNode[], query: string): AiScopeNode[] {
  const q = foldScopeText(query)
  if (!q) return options
  const scored = options
    .map(node => {
      const haystack = [node.label, node.id, ...(node.aliases || [])].map(foldScopeText)
      const score = haystack.some(h => h.startsWith(q)) ? 2 : haystack.some(h => h.includes(q)) ? 1 : 0
      return { node, score }
    })
    .filter(item => item.score > 0)
  return scored.sort((a, b) => b.score - a.score).map(item => item.node)
}

/** Builds the structured scope sent with a prompt from the selected chip path. */
export function buildPromptScope(path: AiScopeNode[]): AiPromptScope | null {
  const usable = path.filter(n => !n.disabled)
  if (!usable.length) return null
  let module: string | undefined
  let view: string | undefined
  for (const node of usable) {
    if (node.module) module = node.module
    if (node.view) view = node.view
  }
  return { path: usable.map(n => n.id), labels: usable.map(n => n.label), module, view }
}

/** Section-only scopes (e.g. "Notlar") restrict the module family without forcing one module. */
function scopeModuleFamily(scope: AiPromptScope): string[] {
  if (scope.module) {
    if (scope.module === 'plans') return ['plans', 'quick_notes', 'quick']
    if (scope.module === 'tasks') return scope.view === 'calendar' ? ['calendar', 'tasks'] : ['tasks', 'calendar']
    if (scope.module === 'calendar') return ['calendar', 'tasks']
    if (scope.module === 'todos') return ['todos', 'detailed']
    return [scope.module]
  }
  const root = AI_SCOPE_TREE.find(n => n.id === scope.path[0])
  const family = new Set<string>()
  const walk = (node: AiScopeNode) => {
    if (node.module && !node.disabled) family.add(node.module)
    for (const child of node.children || []) walk(child)
  }
  if (root) walk(root)
  if (family.has('plans')) {
    family.add('quick_notes')
    family.add('quick')
  }
  if (family.has('todos')) family.add('detailed')
  return Array.from(family)
}

const SCOPE_HINTS: Record<string, string> = {
  'plans:timeless': 'hızlı nota',
  'plans:daily': 'günlük plana',
  'plans:weekly': 'haftalık plana',
  'plans:monthly': 'aylık plana',
  'plans:yearly': 'yıllık plana',
  plans: 'günlük plana',
  todos: 'detaylı notlara',
  code: 'kod parçacığı olarak',
  'tasks:list': 'görevlere',
  'tasks:board': 'görevlere',
  tasks: 'görevlere',
  'calendar:calendar': 'takvime',
  calendar: 'takvime',
  periodic: 'periyodik rutinlere',
  'learning:topics': 'öğrenme konusu olarak',
  'learning:mistakes': 'hata notu olarak',
  learning: 'öğrenme konusu olarak',
  flashcards: 'bilgi kartlarına',
  workout: 'antrenman takipçisine',
  activities: 'listelerime',
  'finance:transaction': 'finans işlemi olarak',
  'finance:position': 'portföye pozisyon olarak',
  'finance:budget': 'bütçe limiti olarak',
  'finance:recurring': 'tekrarlayan işlem olarak',
  finance: 'finans işlemi olarak',
}

export function scopeHintFor(scope: AiPromptScope | null | undefined): string {
  if (!scope?.module) return ''
  return SCOPE_HINTS[`${scope.module}:${scope.view || ''}`] || SCOPE_HINTS[scope.module] || ''
}

const SCOPE_ANALYTIC_RE = /(analiz|incele|özetle|karşılaştır|raporla|nedir|neler|kaç\s|hangi|listele|göster|\?)/iu
const SCOPE_ACTION_VERB_RE =
  /(ekle|oluştur|yaz|kaydet|gir|hazırla|planla|ayarla|güncelle|değiştir|düzenle|düzelt|sil|kaldır|tamamla|bitir|başlat|durdur|sıfırla)/iu

/**
 * Rewrites a scoped prompt into the canonical phrase the deterministic parser understands,
 * e.g. scope Notlar › Planlar › Yıllık + "selçuk" → "yıllık plana selçuk ekle".
 */
export function applyPromptScope(prompt: string, scope: AiPromptScope | null | undefined): string {
  const text = String(prompt || '').trim()
  if (!scope || !text) return text
  const hint = scopeHintFor(scope)
  if (!hint) return text
  const needsVerb = !SCOPE_ACTION_VERB_RE.test(text) && !SCOPE_ANALYTIC_RE.test(text)
  return `${hint} ${text}${needsVerb ? ' ekle' : ''}`.trim()
}

/** Directive line given to LLM providers so they operate only inside the selected directory. */
export function scopeDirectiveFor(scope: AiPromptScope | null | undefined): string {
  if (!scope) return ''
  const parts = [`module=${scope.module || scopeModuleFamily(scope).join('|')}`]
  if (scope.view) parts.push(`view=${scope.view}`)
  if (scope.module === 'plans' && scope.view) {
    parts.push(`period=${scope.view}`, `period_date=${periodStart(scope.view as PlanPeriod, new Date())}`)
  }
  return `[Hedef Dizin: ${scope.labels.join(' › ')} | ${parts.join(' | ')}] Yalnızca bu dizinde okuma/yazma yap; başka modüle kayıt önerme.`
}

/** Keeps only actions inside the scope and forces sub-tab specific fields (plan period, finance entity ...). */
export function enforceScopeOnActions(
  actions: ProposedAiAction[],
  scope: AiPromptScope | null | undefined,
  originalPrompt = '',
): ProposedAiAction[] {
  if (!scope) return actions
  const family = scopeModuleFamily(scope)
  const inScope = actions.filter(a => family.includes(String(a.module || '')))
  const result = inScope.map(action => {
    const payload = { ...(action.payload || {}) }
    let module = action.module
    if (scope.module === 'plans' && scope.view && !action.target_id) {
      const period = scope.view as PlanPeriod
      payload.period = period
      payload.period_date = periodStart(period, new Date())
      payload.scope = period === 'weekly' ? 'weekly' : 'daily'
      if (period !== 'timeless' && module === 'quick_notes') {
        module = 'plans'
        payload.title = payload.title || payload.text || action.title
      }
    }
    return { ...action, module, payload }
  })
  if (result.length > 0 || actions.length > 0) return result
  // Nothing produced: build a minimal scoped write for plan/note style directories.
  const text = String(originalPrompt || '').trim()
  if (!text || SCOPE_ANALYTIC_RE.test(text) || /(güncelle|değiştir|düzenle|sil|kaldır|tamamla)/iu.test(text)) return []
  const quoted = extractQuotedSegments(text)[0]
  const title = (quoted || cleanTurkishNoteTitle(text, 'AI Kaydı')).trim()
  if (scope.module === 'plans') {
    const period = (scope.view || 'daily') as PlanPeriod
    return [
      {
        module: 'plans',
        operation: 'save_plan',
        write_mode: 'append',
        title,
        summary: `${scope.labels.join(' › ')} alanına yeni kayıt: "${title}"`,
        payload: { title, period, period_date: periodStart(period, new Date()), notes: title },
      },
    ]
  }
  if (scope.module === 'todos') {
    return [
      {
        module: 'todos',
        operation: 'save_todo',
        write_mode: 'append',
        title,
        summary: `${scope.labels.join(' › ')} alanına yeni not: "${title}"`,
        payload: { title, priority: 'medium', description: structuredMarkdownToSafeHtml(text), notes: structuredMarkdownToSafeHtml(text) },
      },
    ]
  }
  return []
}
