import { moduleCatalog, type ModuleId } from './moduleCatalog'

export type SearchModule = Exclude<ModuleId, 'secure' | 'finance'>
export interface SearchHit {
  module: SearchModule
  record_id: string
  child_id: string | null
  title: string
  preview: string
  meta: { period?: string; date?: string }
}
export interface SearchGroup { module: SearchModule; total: number; items: SearchHit[] }
const safeModules = new Set<string>(moduleCatalog.filter(m => m.id !== 'secure' && m.id !== 'finance').map(m => m.id))
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const searchHitKey = (hit: SearchHit) => `${hit.module}:${hit.record_id}:${hit.child_id || ''}`

// Fail closed if an unexpected module/payload is returned. No full row JSON
// is retained, and previews are always rendered as text, never HTML.
export function parseSearchGroups(value: unknown, enabled: string[]): SearchGroup[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { groups?: unknown }).groups)) return []
  const groups = (value as { groups: unknown[] }).groups
  const output: SearchGroup[] = []
  for (const module of moduleCatalog) {
    if (!safeModules.has(module.id) || !enabled.includes(module.id)) continue
    const group = groups.find(g => g && typeof g === 'object' && (g as SearchGroup).module === module.id) as SearchGroup | undefined
    if (!group || !Array.isArray(group.items) || !Number.isSafeInteger(group.total) || group.total < 0) continue
    const items: SearchHit[] = []
    for (const item of group.items.slice(0, 30)) {
      if (!item || item.module !== module.id || (typeof item.record_id !== 'string' || !uuid.test(item.record_id)) || typeof item.title !== 'string' || typeof item.preview !== 'string') continue
      if (item.child_id !== null && (typeof item.child_id !== 'string' || !item.child_id || item.child_id.length > 160)) continue
      const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
      items.push({ module: module.id as SearchModule, record_id: item.record_id, child_id: item.child_id, title: item.title.slice(0, 180),
        preview: item.preview.slice(0, 220), meta: { period: typeof meta.period === 'string' ? meta.period : undefined, date: typeof meta.date === 'string' ? meta.date : undefined } })
    }
    output.push({ module: module.id as SearchModule, total: group.total, items })
  }
  return output
}
