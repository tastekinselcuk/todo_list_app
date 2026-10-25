type Area = 'local' | 'session'

// Browser preferences are optional. Accessing the Storage object itself can throw.
export function readStorage(key: string, area: Area = 'local'): string | null {
  try { return (area === 'local' ? localStorage : sessionStorage).getItem(key) }
  catch { return null }
}
export function writeStorage(key: string, value: string, area: Area = 'local'): boolean {
  try { (area === 'local' ? localStorage : sessionStorage).setItem(key, value); return true }
  catch { return false }
}
export function readStoredJSON<T>(key: string, fallback: T, valid: (value: unknown) => boolean, area: Area = 'local'): T {
  try {
    const raw = readStorage(key, area)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return valid(value) ? value as T : fallback
  } catch { return fallback }
}
export function writeStoredJSON(key: string, value: unknown, area: Area = 'local'): boolean {
  try { return writeStorage(key, JSON.stringify(value), area) } catch { return false }
}
export function storageKeys(prefix: string): string[] {
  try {
    const keys: string[]=[]
    for(let index=0;index<localStorage.length;index++) {
      const key=localStorage.key(index)
      if(key?.startsWith(prefix))keys.push(key)
    }
    return keys
  } catch { return [] }
}

/** Retire only unsaved form drafts; saved data, preferences, auth and outboxes stay intact. */
export function discardStoredInputDrafts(owner: string) {
  if (!owner) return
  const prefix = `workspace:${owner}:`
  const draftName = /^(?:todo-(?:title|input-category|description|edit:[^:]+)|quick-note|plan-title|code-(?:draft|edit:[^:]+|edit-version:[^:]+)|pomo-note-title|tasks-title|deck-title|card-(?:front|back)|routine-(?:title|day|form:[^:]+))(?::|$)/
  for (const key of storageKeys(prefix)) {
    const workspaceEnd = key.indexOf(':', prefix.length)
    if (workspaceEnd < 0 || !draftName.test(key.slice(workspaceEnd + 1))) continue
    try { localStorage.removeItem(key) } catch { /* Storage remains optional. */ }
  }
}
export function supportedLanguage(): 'en' | 'tr' {
  return readStorage('ui_language') === 'tr' ? 'tr' : 'en'
}
