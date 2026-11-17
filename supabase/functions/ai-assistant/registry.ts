import type { AiRiskLevel, ProposedAiAction } from './types.ts'

export interface AiModuleCapability {
  id: ProposedAiAction['module']
  aliases: string[]
  labelTr: string
  labelEn: string
  description: string
  operations: string[]
  defaultRisk: AiRiskLevel
  requiresConfirmationAlways?: boolean
}

/**
 * Typed AI Capability Registry aligned with src/lib/moduleCatalog.ts.
 * Note: "secure" (Güvenli Notlar / Kasa) is intentionally excluded from all AI capabilities.
 */
export const AI_CAPABILITY_REGISTRY: AiModuleCapability[] = [
  {
    id: 'plans',
    aliases: ['plan'],
    labelTr: 'Planlar',
    labelEn: 'Plans',
    description: 'Günlük, haftalık, aylık, yıllık ve zamansız (timeless) planlar ve notları.',
    operations: ['create', 'update', 'complete', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'quick',
    aliases: ['quick_notes', 'hizli_not'],
    labelTr: 'Hızlı Notlar',
    labelEn: 'Quick Notes',
    description: 'Anlık, zamansız hızlı notlar.',
    operations: ['create', 'update', 'complete', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'detailed',
    aliases: ['todos', 'detailed_notes'],
    labelTr: 'Detaylı Notlar',
    labelEn: 'Detailed Notes',
    description: 'Zengin metinli (HTML/Markdown) detaylı notlar ve dokümanlar.',
    operations: ['create', 'update', 'complete', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'tasks',
    aliases: ['work_tasks'],
    labelTr: 'Görevler',
    labelEn: 'Tasks',
    description: 'Durum (todo/in_progress/done), öncelik, son tarih, alt görevler (checklist) ve proje bağlı görevler.',
    operations: ['create', 'update', 'complete', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'calendar',
    aliases: ['work_blocks'],
    labelTr: 'Takvim',
    labelEn: 'Calendar',
    description: 'Tarih ve saat aralıklı (starts_at, ends_at) takvim zaman blokları.',
    operations: ['create', 'update', 'delete'],
    defaultRisk: 'high',
    requiresConfirmationAlways: true,
  },
  {
    id: 'periodic',
    aliases: ['routines'],
    labelTr: 'Periyodik Rutinler',
    labelEn: 'Periodic Routines',
    description: 'Günlük, haftalık veya aylık tekrarlayan rutin ve alışkanlıklar.',
    operations: ['create', 'update', 'toggle', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'code',
    aliases: ['code_snippets'],
    labelTr: 'Kod Kütüphanesi',
    labelEn: 'Code Snippets',
    description: 'Dil etiketli kod parçacıkları ve teknik notlar.',
    operations: ['create', 'update', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'learning',
    aliases: ['learning_subjects', 'learning_mistakes'],
    labelTr: 'Öğrenme Takipçisi',
    labelEn: 'Learning Tracker',
    description: 'Öğrenme konuları, alt başlıklar (topics) ve hata notları (mistake.create).',
    operations: ['create', 'update', 'mistake.create', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'flashcards',
    aliases: ['flashcard_decks'],
    labelTr: 'Bilgi Kartları',
    labelEn: 'Flashcards',
    description: 'Ön/arka yüzlü çalışma kartı desteleri (cards: [{front, back}]).',
    operations: ['create', 'update', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'workout',
    aliases: ['workout_routines'],
    labelTr: 'Antrenman Takipçisi',
    labelEn: 'Workout Tracker',
    description: 'Günlere göre egzersiz rutinleri (sets, reps, restSeconds).',
    operations: ['create', 'update', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'activities',
    aliases: ['activity_items'],
    labelTr: 'Listelerim',
    labelEn: 'Activity Lists',
    description: 'Film, kitap, dizi, mekan gibi izleme/okuma listeleri.',
    operations: ['create', 'update', 'delete'],
    defaultRisk: 'low',
  },
  {
    id: 'finance',
    aliases: ['finance_transactions', 'finance_positions', 'finance_budgets'],
    labelTr: 'Finans',
    labelEn: 'Finance',
    description: 'Gelir/gider işlemleri, portföy pozisyonları, bütçe limitleri ve tekrarlayan işlemler.',
    operations: ['create', 'update', 'delete'],
    defaultRisk: 'high',
    requiresConfirmationAlways: true,
  },
]

const ALIAS_MAP = new Map<string, ProposedAiAction['module']>()
for (const cap of AI_CAPABILITY_REGISTRY) {
  ALIAS_MAP.set(cap.id, cap.id)
  for (const alias of cap.aliases) ALIAS_MAP.set(alias, cap.id)
}

export function normalizeModuleId(raw: string): ProposedAiAction['module'] | 'secure' | null {
  const key = String(raw || '').trim().toLowerCase()
  if (key === 'secure' || key === 'secure_notes' || key === 'vault') return 'secure'
  return ALIAS_MAP.get(key) || null
}

export function classifyActionRisk(action: ProposedAiAction, batchSize: number): AiRiskLevel {
  const op = String(action.operation || '').toLowerCase()
  if (op === 'delete' || op === 'purge' || op === 'remove') return 'high'
  if (action.module === 'finance' || action.module === 'calendar') return 'high'
  if (batchSize > 1) return 'high'
  if (op === 'update' || op === 'complete' || op === 'toggle' || op.startsWith('patch')) return 'medium'
  return 'low'
}

export function applyActionRiskPolicy(
  actions: ProposedAiAction[],
  writeMode: 'ask_before_write' | 'auto_apply',
): ProposedAiAction[] {
  const total = actions.length
  return actions.map(act => {
    const risk_level = classifyActionRisk(act, total)
    const requires_confirmation = writeMode !== 'auto_apply' || risk_level === 'high'
    return {
      ...act,
      risk_level,
      requires_confirmation,
    }
  })
}

export function buildApplicationContextSummary(activeModules?: string[]): string {
  const allowedSet = activeModules?.length ? new Set(activeModules) : null
  const lines = AI_CAPABILITY_REGISTRY.filter(cap => {
    if (!allowedSet) return true
    if (cap.id === 'calendar') return allowedSet.has('tasks') || allowedSet.has('calendar')
    return allowedSet.has(cap.id)
  }).map(cap => `- ${cap.id} (${cap.labelTr}): ${cap.description}`)

  return [
    'Pomodolist Aktif Modül Yetenekleri (Güvenli Kasa / "secure" AI erişimine kesinlikle kapalıdır):',
    ...lines,
  ].join('\n')
}
