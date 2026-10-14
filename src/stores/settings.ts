import { defineStore } from 'pinia'
import { computed, ref, readonly, watch, onScopeDispose } from 'vue'
import { useWorkspacesStore } from './workspaces'
import { defaultModules } from '@/lib/workspaceDefaults'
import { isThemePaletteId, type ThemePaletteId } from '@/lib/themePalettes'
import { i18n } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { readStorage, writeStorage, readStoredJSON, writeStoredJSON, supportedLanguage } from '@/lib/storage'

export interface UserPreferences {
  workspaceWide: boolean
  pomodoroPlacement: 'card' | 'navbar'
  language: 'en' | 'tr'
  theme: 'light' | 'dark'
  themePalette: ThemePaletteId
  pomodoroDurations: { focus: number; shortBreak: number; longBreak: number }
}
type PreferencePatch = Partial<UserPreferences>
const keys = ['workspaceWide', 'pomodoroPlacement', 'language', 'theme', 'themePalette', 'pomodoroDurations'] as const
const systemDefaults = (): UserPreferences => ({ workspaceWide: false, pomodoroPlacement: 'card', language: 'en',
  theme: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  themePalette: 'classic',
  pomodoroDurations: { focus: 25, shortBreak: 5, longBreak: 15 } })
export function normalizePreferences(input: unknown, defaults = systemDefaults()): UserPreferences {
  const value = input && typeof input === 'object' ? input as PreferencePatch : {}
  const durations = value.pomodoroDurations
  const validDurations = durations && Number.isInteger(durations.focus) && durations.focus >= 10 && durations.focus <= 90
    && Number.isInteger(durations.shortBreak) && durations.shortBreak >= 3 && durations.shortBreak <= 30
    && Number.isInteger(durations.longBreak) && durations.longBreak >= 5 && durations.longBreak <= 45
  return { workspaceWide: typeof value.workspaceWide === 'boolean' ? value.workspaceWide : defaults.workspaceWide,
    pomodoroPlacement: value.pomodoroPlacement === 'card' || value.pomodoroPlacement === 'navbar' ? value.pomodoroPlacement : defaults.pomodoroPlacement,
    language: value.language === 'en' || value.language === 'tr' ? value.language : defaults.language,
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : defaults.theme,
    themePalette: isThemePaletteId(value.themePalette) ? value.themePalette : defaults.themePalette,
    pomodoroDurations: { ...(validDurations ? durations : defaults.pomodoroDurations) } }
}

export const useSettingsStore = defineStore('settings', () => {
  const workspaces = useWorkspacesStore()
  const legacy = (): UserPreferences => normalizePreferences({ workspaceWide: readStorage('ui_fullScreen') === 'true',
    language: supportedLanguage(), theme: readStorage('app-theme') as UserPreferences['theme'] })
  const preferences = ref<UserPreferences>(legacy())
  const preferenceSyncStatus = ref<'local' | 'loading' | 'saved' | 'pending' | 'setup'>('local')
  let owner = '', generation = 0, dirty: PreferencePatch = {}, disposed = false, editRevision = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let activeWrite: Promise<void> | undefined
  const fieldRevisions = new Map<string, number>()
  const key = (id = owner) => 'user-preferences:v1:' + (id || 'device')
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  function cache() { writeStoredJSON(key(), { version: 1, preferences: preferences.value, dirty }) }
  function apply(values: UserPreferences) {
    preferences.value = values
    // Compatibility keys preserve the last device language/theme before login.
    writeStorage('ui_language', values.language)
    writeStorage('app-theme', values.theme)
    writeStorage('ui_fullScreen', String(values.workspaceWide))
    i18n.global.locale.value = values.language
  }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer)
    if (!owner || preferenceSyncStatus.value === 'setup' || disposed) return
    saveTimer = setTimeout(() => { saveTimer = undefined; void flushPreferences() }, 400)
  }
  function patchPreferences(patch: PreferencePatch) {
    const next = normalizePreferences(patch, preferences.value)
    for (const field of keys) {
      if (!same(next[field], preferences.value[field])) {
        Object.assign(dirty, { [field]: next[field] });fieldRevisions.set(field, ++editRevision)
      }
    }
    apply(next);cache()
    if (Object.keys(dirty).length) {
      if (preferenceSyncStatus.value !== 'setup') preferenceSyncStatus.value = owner ? 'pending' : 'local'
      scheduleSave()
    }
  }
  async function savePending() {
    if (!owner || disposed || !Object.keys(dirty).length || preferenceSyncStatus.value === 'setup') return
    const capturedOwner = owner, capturedGeneration = generation, patch = JSON.parse(JSON.stringify(dirty)) as PreferencePatch
    let reschedule = false
    try {
      const result = await supabase.rpc('save_user_preferences', { expected_user_id: capturedOwner, patch })
      if (capturedOwner !== owner || capturedGeneration !== generation || disposed) return
      if (result.error) throw result.error
      for (const field of keys) if (field in patch && same(dirty[field], patch[field])) delete dirty[field]
      apply(normalizePreferences({ ...result.data, ...dirty }, preferences.value));cache()
      reschedule = Object.keys(dirty).length > 0
      preferenceSyncStatus.value = reschedule ? 'pending' : 'saved'
    } catch (failure) {
      if (capturedOwner !== owner || capturedGeneration !== generation || disposed) return
      const code = (failure as { code?: string })?.code
      preferenceSyncStatus.value = ['PGRST202', '42P01', '42883'].includes(code || '') ? 'setup' : 'pending'
      cache() // Failed edits survive reconnection and the next sign-in.
    } finally { if (reschedule && capturedGeneration === generation) scheduleSave() }
  }
  async function flushPreferences() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined
    const capturedGeneration = generation
    while (activeWrite) await activeWrite
    if (capturedGeneration !== generation || disposed) return
    const writing = savePending();activeWrite = writing
    await writing
    if (activeWrite === writing) activeWrite = undefined
  }
  async function loadPreferences() {
    if (!owner || disposed) return
    const capturedOwner = owner, capturedGeneration = generation, capturedRevision = editRevision
    preferenceSyncStatus.value = 'loading'
    try {
      const result = await supabase.from('user_preferences').select('preferences').eq('user_id', capturedOwner).maybeSingle()
      if (capturedOwner !== owner || capturedGeneration !== generation || disposed) return
      if (result.error) throw result.error
      if (!result.data) dirty = { ...preferences.value, ...dirty }
      const recent: PreferencePatch = { ...dirty }
      for (const field of keys) if ((fieldRevisions.get(field) || 0) > capturedRevision) Object.assign(recent, { [field]: preferences.value[field] })
      apply(normalizePreferences({ ...result.data?.preferences, ...recent }, preferences.value));cache()
      preferenceSyncStatus.value = Object.keys(dirty).length ? 'pending' : 'saved'
      if (Object.keys(dirty).length) scheduleSave()
    } catch (failure) {
      if (capturedOwner !== owner || capturedGeneration !== generation || disposed) return
      const code = (failure as { code?: string })?.code
      preferenceSyncStatus.value = ['PGRST205', '42P01'].includes(code || '') ? 'setup' : 'pending'
    }
  }
  watch(() => workspaces.userId || '', id => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined;owner = id;generation++;dirty = {};activeWrite = undefined;fieldRevisions.clear();editRevision = 0
    const claimed = readStorage('preferences-legacy-owner')
    const defaults = !id || !claimed || claimed === id ? legacy() : systemDefaults()
    if (id) defaults.pomodoroDurations = normalizePreferences({ pomodoroDurations: readStoredJSON('pomodoro-durations:' + id, defaults.pomodoroDurations, value => Boolean(value && typeof value === 'object')) }, defaults).pomodoroDurations
    const saved = readStoredJSON<{ preferences: unknown; dirty?: PreferencePatch } | null>(key(), null,
      value => Boolean(value && typeof value === 'object' && (value as { version?: number }).version === 1))
    if (saved) {
      const values = normalizePreferences(saved.preferences, defaults)
      const pending = normalizePreferences(saved.dirty, values)
      for (const field of keys) if (saved.dirty && field in saved.dirty) Object.assign(dirty, { [field]: pending[field] })
      apply(values)
    } else apply(defaults)
    if (id && !claimed) writeStorage('preferences-legacy-owner', id)
    preferenceSyncStatus.value = 'local';cache()
    if (id) void loadPreferences()
  }, { immediate: true, flush: 'sync' })
  const onOnline = () => { void loadPreferences() }
  const onPageHide = () => { cache();void flushPreferences() }
  if (typeof window !== 'undefined') { window.addEventListener('online', onOnline);window.addEventListener('pagehide', onPageHide) }
  onScopeDispose(() => {
    disposed = true
    if (saveTimer) clearTimeout(saveTimer)
    if (typeof window !== 'undefined') { window.removeEventListener('online', onOnline);window.removeEventListener('pagehide', onPageHide) }
  })
  const isFullScreen = computed({ get: () => preferences.value.workspaceWide, set: value => patchPreferences({ workspaceWide: value }) })
  const isPomodoroDocked = computed({ get: () => preferences.value.pomodoroPlacement === 'navbar', set: value => patchPreferences({ pomodoroPlacement: value ? 'navbar' : 'card' }) })
  const language = computed({ get: () => preferences.value.language, set: value => patchPreferences({ language: value }) })
  const theme = computed({ get: () => preferences.value.theme, set: value => patchPreferences({ theme: value }) })
  const themePalette = computed({ get: () => preferences.value.themePalette, set: value => patchPreferences({ themePalette: value }) })
  const pomodoroDurations = computed({ get: () => preferences.value.pomodoroDurations, set: value => patchPreferences({ pomodoroDurations: value }) })
  const activeModules = computed({ get: () => workspaces.active?.active_modules || [...defaultModules],
    set: (modules: string[]) => { void workspaces.setModules(modules) } })
  const isSettingsLoaded = computed(() => workspaces.loaded)
  const loadSettings = async () => { if (!workspaces.loaded) await workspaces.load() }
  const toggleModule = (id: string, isRequired = false) => {
    if (isRequired) return Promise.resolve(false)
    const modules = [...activeModules.value], index = modules.indexOf(id)
    if (index >= 0) modules.splice(index, 1)
    else modules.push(id)
    return workspaces.setModules(modules)
  }
  const isModuleActive = (id: string) => activeModules.value.includes(id)
  return { activeModules, isSettingsLoaded, isFullScreen, isPomodoroDocked, language, theme, themePalette, pomodoroDurations,
    preferences: computed(() => readonly(preferences.value)), preferenceSyncStatus, patchPreferences, loadPreferences, flushPreferences,
    loadSettings, toggleModule, isModuleActive }
})
