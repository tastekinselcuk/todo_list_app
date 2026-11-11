/** Keep known hidden tabs in place and append newly introduced tabs in registry order. */
export function normalizeTabOrder(known: readonly string[], saved: unknown): string[] {
  const allowed = new Set(known), seen = new Set<string>()
  const ordered = Array.isArray(saved) ? saved.filter((id): id is string => {
    if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  }) : []
  return [...ordered, ...known.filter(id => !seen.has(id))]
}

/** Reorder only visible slots, so disabling a module does not erase its preference. */
export function reorderVisibleTabs(order: readonly string[], visible: readonly string[], next: readonly string[]): string[] | null {
  const visibleIds = new Set(visible)
  if (next.length !== visible.length || new Set(next).size !== visible.length || next.some(id => !visibleIds.has(id))) return null
  let cursor = 0
  return order.map(id => visibleIds.has(id) ? next[cursor++]! : id)
}
