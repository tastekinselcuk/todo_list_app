interface AuthStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// localStorage persists across browser restarts; sessionStorage survives F5 in
// the current tab. Memory is the last resort when both storage areas fail.
export function createAuthStorage(browserStorage: () => AuthStorage = () => localStorage,
  tabStorage: () => AuthStorage = () => sessionStorage) {
  const overrides = new Map<string, string | null>()
  let persistence: 'local' | 'session' | 'memory' = 'local'
  const backupKey = (key: string) => `auth-backup:${key}`
  return {
    get persistent() { return persistence !== 'memory' },
    get persistence() { return persistence },
    getItem(key: string): string | null {
      if (overrides.has(key)) return overrides.get(key) ?? null
      // A fallback written by this tab takes precedence over an older primary
      // value whose removal was denied. Auth events reconcile cross-tab changes.
      try {
        const saved = tabStorage().getItem(backupKey(key))
        if (saved !== null) { persistence = 'session'; return saved }
      } catch { /* Try primary storage before declaring storage unavailable. */ }
      try { const saved = browserStorage().getItem(key); persistence = 'local'; return saved }
      catch { persistence = 'memory'; return null }
    },
    setItem(key: string, value: string) {
      try {
        browserStorage().setItem(key, value)
        try { tabStorage().removeItem(backupKey(key)) } catch {}
        overrides.delete(key)
        persistence = 'local'
      } catch {
        // Do not leave a previous account's persistent session beneath the
        // replacement kept in memory. A denied removal stays fenced locally.
        try { browserStorage().removeItem(key) } catch {}
        try {
          tabStorage().setItem(backupKey(key), value)
          overrides.delete(key)
          persistence = 'session'
        } catch {
          overrides.set(key, value)
          persistence = 'memory'
        }
      }
    },
    removeItem(key: string) {
      // A tombstone prevents an inaccessible old session from reappearing in
      // this client after sign-out. Only the requested auth key is touched.
      overrides.set(key, null)
      let removed = true
      try { browserStorage().removeItem(key) } catch { removed = false }
      try { tabStorage().removeItem(backupKey(key)) } catch { removed = false }
      if (removed) overrides.delete(key)
    },
  }
}
