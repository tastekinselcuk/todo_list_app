import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { defaultModules } from '@/lib/workspaceDefaults'
import { disposeWorkspaceStores } from '@/lib/workspaceScope'
import type { ModuleBinding } from '@/lib/sharing'

export interface Workspace {
  id: string
  user_id: string
  name: string
  active_modules: string[]
  archived_at: string | null
  is_default: boolean
  created_at: string
}

export const useWorkspacesStore = defineStore('workspaces', () => {
  const auth = useAuthStore()
  const items = ref<Workspace[]>([])
  const activeId = ref('')
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref('')
  const revision = ref(0)
  const sharingAvailable = ref(false)
  const sharingError = ref('')
  const scopeReady = ref(true)
  const bindings = ref<Record<string, ModuleBinding[]>>({})
  let bindingsGeneration = 0
  const userId = computed(() => auth.user?.id || '')
  const sessionKey = computed(() => `${userId.value}:${activeId.value}:${revision.value}`)
  const active = computed(() => items.value.find(item => item.id === activeId.value) || null)
  const available = computed(() => items.value.filter(item => !item.archived_at))
  const lastKey = (id: string) => `active-workspace:${id}`
  let loadGeneration = 0
  let settingsQueue = Promise.resolve()

  function reset() {
    loadGeneration++
    disposeWorkspaceStores()
    items.value = []
    activeId.value = ''
    loaded.value = false
    busy.value = false
    error.value = ''
    revision.value++
    bindingsGeneration++
    bindings.value = {}
    sharingAvailable.value = false
    sharingError.value = ''
    scopeReady.value = true
  }

  async function refreshBindings(wid = activeId.value, force = false) {
    if (!wid || !userId.value) return false
    if (loaded.value && !sharingAvailable.value && !force) return true
    const owner = userId.value
    const generation = ++bindingsGeneration
    let personalMode = false
    if (wid === activeId.value && !bindings.value[wid]) scopeReady.value = false
    try {
      const result = await supabase.rpc('sharing_context', { wid })
      if (generation !== bindingsGeneration || owner !== userId.value) return false
      if (result.error) {
        if (['PGRST202','42883'].includes(result.error.code)) {
          sharingAvailable.value = false
          sharingError.value = 'SETUP_REQUIRED'
          personalMode = true
          return true
        }
        throw result.error
      }
      if (!Array.isArray(result.data)) { personalMode = true; return true } // Older installations keep personal mode.
      const before = (bindings.value[wid] || []).map(b => `${b.module}:${b.collection_id}:${b.epoch}:${b.role}:${b.shared}:${b.timezone}`).join('|')
      const after = result.data.map((b: ModuleBinding) => `${b.module}:${b.collection_id}:${b.epoch}:${b.role}:${b.shared}:${b.timezone}`).join('|')
      bindings.value[wid] = result.data
      sharingAvailable.value = true
      sharingError.value = ''
      if (result.data[0]?.active_modules) {
        const workspace = items.value.find(w => w.id === wid)
        if (workspace) workspace.active_modules = result.data[0].active_modules
      }
      if (before !== after && wid === activeId.value) { disposeWorkspaceStores(); revision.value++ }
      return true
    } catch (err) {
      if (generation === bindingsGeneration) sharingError.value = (err as Error).message
      return false
    } finally {
      if (generation === bindingsGeneration && wid === activeId.value) scopeReady.value = Boolean(bindings.value[wid]) || personalMode
    }
  }

  function binding(module: string, wid = activeId.value) { return bindings.value[wid]?.find(b => b.module === module) }

  function switchTo(id: string) {
    const workspace = available.value.find(item => item.id === id)
    if (!workspace || id === activeId.value) return
    disposeWorkspaceStores()
    activeId.value = id
    revision.value++
    try { localStorage.setItem(lastKey(userId.value), id) } catch { /* optional preference */ }
    if (loaded.value) void refreshBindings(id)
  }

  async function load() {
    const owner = userId.value
    if (!owner) return false
    const generation = ++loadGeneration
    busy.value = true
    error.value = ''
    try {
      const bootstrap = await supabase.rpc('ensure_default_workspace')
      if (bootstrap.error) throw bootstrap.error
      const result = await supabase.from('workspaces').select('*').eq('user_id', owner).order('created_at')
      if (result.error) throw result.error
      if (generation !== loadGeneration || owner !== userId.value) return false
      items.value = result.data || []
      let saved = ''
      try { saved = localStorage.getItem(lastKey(owner)) || '' } catch { /* optional preference */ }
      const candidate = available.value.find(item => item.id === activeId.value)
        || available.value.find(item => item.id === saved)
        || available.value.find(item => item.is_default) || available.value[0]
      if (!candidate) throw new Error('No active workspace')
      switchTo(candidate.id)
      await refreshBindings(candidate.id, true)
      if (generation !== loadGeneration || owner !== userId.value) return false
      loaded.value = true
      return true
    } catch (err) {
      if (generation === loadGeneration) error.value = (err as Error).message
      return false
    } finally { if (generation === loadGeneration) busy.value = false }
  }

  async function create(name: string) {
    if (!name.trim() || !userId.value || busy.value) return false
    const owner = userId.value
    busy.value = true
    error.value = ''
    try {
      const result = await supabase.from('workspaces')
        .insert({ user_id: owner, name: name.trim(), active_modules: [...defaultModules] }).select().single()
      if (result.error) throw result.error
      if (owner !== userId.value) return false
      items.value.push(result.data)
      switchTo(result.data.id)
      return true
    } catch (err) { if (owner === userId.value) error.value = (err as Error).message; return false }
    finally { if (owner === userId.value) busy.value = false }
  }

  async function configure(id: string, changes: { name?: string; archived_at?: string | null }) {
    if (!userId.value || busy.value) return false
    const owner = userId.value
    busy.value = true
    error.value = ''
    try {
      const result = await supabase.from('workspaces').update(changes)
        .eq('id', id).eq('user_id', owner).select().single()
      if (result.error) throw result.error
      if (owner !== userId.value) return false
      const index = items.value.findIndex(item => item.id === id)
      if (index !== -1) Object.assign(items.value[index], { ...result.data, active_modules: items.value[index].active_modules })
      if (!available.value.some(item => item.id === activeId.value)) switchTo(available.value[0].id)
      return true
    } catch (err) { if (owner === userId.value) error.value = (err as Error).message; return false }
    finally { if (owner === userId.value) busy.value = false }
  }

  function setModules(modules: string[]) {
    const workspace = active.value
    const owner = userId.value
    if (!workspace || !owner) return Promise.resolve(false)
    const previous = [...workspace.active_modules]
    const next = [...modules]
    workspace.active_modules = next
    error.value = ''
    // Serialize rapid toggles so an older request cannot overwrite the newest preference.
    settingsQueue = settingsQueue.then(async () => {
      const result = await supabase.from('workspaces').update({ active_modules: next })
        .eq('id', workspace.id).eq('user_id', owner)
      if (result.error && owner === userId.value) {
        if (workspace.active_modules.join(',') === next.join(',')) workspace.active_modules = previous
        error.value = result.error.message
      }
    }).catch(err => { if (owner === userId.value) error.value = String(err) })
    return settingsQueue.then(() => !error.value)
  }

  return { items, activeId, active, available, loaded, busy, error, userId, sessionKey, sharingAvailable, sharingError, scopeReady, bindings, binding, refreshBindings, load, reset, switchTo, create, configure, setModules }
})
