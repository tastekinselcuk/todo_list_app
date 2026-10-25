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

export interface SharedAuthStorage {
  read(key: string): Promise<{ value: string | null } | undefined>
  write(key: string, value: string | null): Promise<void>
  migrate(key: string, value: string | null): Promise<{ value: string | null }>
}

// IndexedDB has a separate quota from Web Storage and is shared by same-origin
// tabs. Wait for transaction completion, not merely a successful put request.
export function createIndexedAuthStorage(resolve: () => IDBFactory = () => indexedDB): SharedAuthStorage {
  let opening: Promise<IDBDatabase> | undefined
  function open() {
    if (!opening) opening = new Promise<IDBDatabase>((accept, reject) => {
      let settled = false
      const timer = setTimeout(() => finish(undefined, Error('AUTH_STORAGE_UNAVAILABLE')), 2500)
      function finish(db?: IDBDatabase, error?: unknown) {
        if (settled) { db?.close(); return }
        settled = true; clearTimeout(timer)
        if (db) accept(db); else reject(error)
      }
      try {
        const request = resolve().open('promptvault-auth', 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions')
        }
        request.onsuccess = () => {
          const db = request.result
          db.onversionchange = () => { db.close(); opening = undefined }
          db.onclose = () => { opening = undefined }
          finish(db)
        }
        request.onerror = () => finish(undefined, request.error)
        request.onblocked = () => finish(undefined, Error('AUTH_STORAGE_BLOCKED'))
      } catch (error) { finish(undefined, error) }
    }).catch(error => { opening = undefined; throw error })
    return opening
  }
  async function transaction(key: string, value?: { value: string | null }, migrate = false) {
    const db = await open()
    return new Promise<{ value: string | null } | undefined>((accept, reject) => {
      const tx = db.transaction('sessions', value ? 'readwrite' : 'readonly')
      const store = tx.objectStore('sessions')
      const request = value && !migrate ? store.put(value, key) : store.get(key)
      const timer = setTimeout(() => { try { tx.abort() } catch {}; reject(Error('AUTH_STORAGE_TIMEOUT')) }, 2500)
      let result: { value: string | null } | undefined
      if (migrate) request.onsuccess = () => {
        result = request.result
        if (result === undefined) { result = value; store.put(value, key) }
      }
      tx.oncomplete = () => { clearTimeout(timer); accept(migrate ? result : value ? undefined : request.result) }
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(tx.error || Error('AUTH_STORAGE_UNAVAILABLE')) }
    })
  }
  return {
    read: key => transaction(key),
    async write(key, value) { await transaction(key, { value }) },
    async migrate(key, value) { return (await transaction(key, { value }, true))! },
  }
}

// The SDK owns serialization, refresh coordination and cross-tab broadcasts.
// This adapter never broadcasts tokens or promotes an old tab backup above an
// existing shared record. A null record fences legacy sessions after logout.
export function createSharedAuthStorage(
  shared: SharedAuthStorage = createIndexedAuthStorage(),
  browserStorage: () => AuthStorage = () => localStorage,
  tabStorage: () => AuthStorage = () => sessionStorage,
  primaryKey?: string,
) {
  const fallback = createAuthStorage(browserStorage, tabStorage)
  const overrides = new Map<string, string | null>()
  type Persistence = 'indexeddb' | 'local' | 'session' | 'memory'
  let mode: Persistence = 'indexeddb'
  const modes = new Map<string, Persistence>()
  function setMode(key: string, value: Persistence) { mode = value; modes.set(key, value) }
  function currentMode() { return primaryKey ? modes.get(primaryKey) ?? 'indexeddb' : mode }
  const fence = (key: string) => `auth-fallback:${key}`
  function pendingFence(key: string) {
    try { return browserStorage().getItem(fence(key)) } catch { return null }
  }
  function clearLegacy(key: string) {
    try { browserStorage().removeItem(key); browserStorage().removeItem(fence(key)) } catch {}
    try { tabStorage().removeItem(`auth-backup:${key}`) } catch {}
  }
  async function commit(key: string, value: string | null) {
    await shared.write(key, value)
    clearLegacy(key); overrides.delete(key); setMode(key, 'indexeddb')
  }
  return {
    get persistence() { return currentMode() },
    get persistent() { return ['indexeddb', 'local'].includes(currentMode()) },
    async getItem(key: string): Promise<string | null> {
      if (modes.get(key) === 'memory' && overrides.has(key)) return overrides.get(key) ?? null
      try {
        const pending = pendingFence(key)
        if (pending) {
          // A different tab's old sessionStorage backup must not override a
          // newer local fallback or a sign-out fence.
          const value = pending === 'local' ? browserStorage().getItem(key) : overrides.get(key) ?? null
          overrides.set(key, value)
          await commit(key, value)
          return value
        }
        const saved = await shared.read(key)
        if (saved !== undefined) { clearLegacy(key); overrides.delete(key); setMode(key, 'indexeddb'); return saved.value }
        const value = fallback.getItem(key)
        // Another tab may sign in/out between our read and migration. The
        // transaction must preserve that newer record, including a tombstone.
        const migrated = await shared.migrate(key, value)
        clearLegacy(key); setMode(key, 'indexeddb')
        return migrated.value
      } catch {
        const value = overrides.has(key) ? overrides.get(key) ?? null : fallback.getItem(key); setMode(key, fallback.persistence)
        return value
      }
    },
    async setItem(key: string, value: string) {
      try { await commit(key, value) }
      catch {
        fallback.setItem(key, value); setMode(key, fallback.persistence)
        overrides.set(key, value)
        // A small shared fence keeps an older IndexedDB record from winning
        // after a runtime failure. Never remove unrelated browser data.
        try { browserStorage().setItem(fence(key), modes.get(key) === 'local' ? 'local' : 'blocked') } catch { setMode(key, 'memory') }
      }
    },
    async removeItem(key: string) {
      overrides.set(key, null)
      fallback.removeItem(key)
      try { await commit(key, null) }
      catch {
        setMode(key, 'memory')
        try { browserStorage().setItem(fence(key), 'signed-out') } catch {}
      }
    },
  }
}
