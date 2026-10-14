<template>
  <div class="settings-page mx-auto w-full max-w-5xl space-y-5 pb-8">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-lg font-semibold tracking-tight">{{ t('app.settings') }}</h1>
      <span class="text-xs text-muted-foreground">{{ t('settingsPage.autoSave') }}</span>
    </header>

    <div class="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <WorkspaceManager />

      <section class="min-w-0 rounded-2xl border border-border/60 bg-card/60 shadow-sm" aria-labelledby="general-preferences">
        <header class="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
          <h2 id="general-preferences" class="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal class="h-4 w-4 text-muted-foreground" />{{ t('workspace.general') }}</h2>
        </header>
        <div class="divide-y divide-border/40 px-4">
          <div class="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <Globe class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="text-sm">{{ t('workspace.language') }}</span>
            </div>
            <CustomSelect :model-value="locale" :options="languageOptions" :aria-label="t('workspace.language')" size="sm" class="w-28 shrink-0" @update:model-value="handleLanguageChange" />
          </div>
          <div class="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <Palette class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="text-sm">{{ t('settingsPage.appearance') }}</span>
            </div>
            <div class="flex shrink-0 gap-0.5 rounded-xl border border-border/50 bg-muted/40 p-0.5" role="group" :aria-label="t('settingsPage.appearance')">
              <button v-for="option in themeOptions" :key="option.value" type="button" class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors" :aria-pressed="themeStore.theme === option.value" :class="themeStore.theme === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="themeStore.theme = option.value">
                <component :is="option.icon" class="h-3.5 w-3.5" />{{ t(option.label) }}
              </button>
            </div>
          </div>
          <div class="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
            <div class="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" class="h-4 w-4 shrink-0 rounded-full border border-primary/30 bg-primary/15" />
              <span class="text-sm">{{ t('settingsPage.colorPalette') }}</span>
            </div>
            <CustomSelect :model-value="themeStore.palette" :options="paletteOptions" :aria-label="t('settingsPage.colorPalette')" size="sm" class="w-40 shrink-0" @update:model-value="handlePaletteChange">
              <template #value="{ option }">
                <span class="inline-flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" class="inline-flex shrink-0 -space-x-1"><span v-for="(color, index) in paletteSwatches(option?.value)" :key="index" class="h-3 w-3 rounded-full border border-foreground/15" :style="{ backgroundColor: `hsl(${color})` }" /></span>
                  <span class="truncate">{{ option?.label }}</span>
                </span>
              </template>
              <template #option="{ option }">
                <span aria-hidden="true" class="inline-flex shrink-0 -space-x-1"><span v-for="(color, index) in paletteSwatches(option.value)" :key="index" class="h-3 w-3 rounded-full border border-foreground/15" :style="{ backgroundColor: `hsl(${color})` }" /></span>
                <span class="truncate">{{ option.label }}</span>
              </template>
            </CustomSelect>
          </div>
        </div>
      </section>
    </div>

    <section aria-labelledby="workspace-tools">
      <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id="workspace-tools" class="text-sm font-semibold">{{ t('settingsPage.tools') }}</h2>
          <span class="max-w-60 truncate rounded-lg bg-muted/60 px-2 py-1 text-xs text-muted-foreground" :title="workspaces.active?.name">{{ workspaces.active?.name }}</span>
        </div>
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
          <button type="button" class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground" @click="sharing.showJoin()"><Link2 class="h-3.5 w-3.5" />{{ t('sharing.addShared') }}</button>
          <span role="status" aria-live="polite" :class="saveStatus === 'error' ? 'text-destructive' : ''">
            <span v-if="saveStatus === 'saving'" class="inline-flex items-center gap-1.5"><Loader2 class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ t('settingsPage.saving') }}</span>
            <span v-else-if="saveStatus === 'saved'" class="inline-flex items-center gap-1"><Check class="h-3 w-3" />{{ t('settingsPage.saved') }}</span>
            <span v-else-if="saveStatus === 'error'">{{ t('settingsPage.saveFailed') }}</span>
          </span>
          <span class="tabular-nums">{{ t('settingsPage.enabledCount', { count: enabledCount, total: availableModules.length }) }}</span>
        </div>
      </header>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="module in availableModules"
          :key="module.id"
          class="relative isolate flex min-h-[96px] min-w-0 rounded-2xl border p-3.5 transition-colors"
          :class="settingsStore.isModuleActive(module.id) ? [module.theme.border, 'bg-card/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-card/70'] : 'border-border/50 bg-card/30 hover:bg-muted/40'"
        >
        <div v-if="settingsStore.isModuleActive(module.id)" aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
          <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-[60px]" :class="module.theme.accent" />
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="settingsStore.isModuleActive(module.id)"
          :aria-label="t(`workspace.modules.${module.id}Name`)"
          :aria-describedby="`settings-module-${module.id}`"
          :disabled="module.isRequired || Boolean(pendingModuleId) || workspaces.busy"
          :title="module.isRequired ? t('settingsPage.required') : undefined"
          class="flex w-full min-w-0 items-start gap-2.5 rounded-xl pr-11 text-left disabled:cursor-default"
          @click="toggleModule(module.id, module.isRequired)"
        >
          <span :class="['flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', settingsStore.isModuleActive(module.id) ? module.theme.icon : 'bg-muted/60 text-muted-foreground']"><component :is="module.icon" class="h-4 w-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium leading-5">
              {{ t(`workspace.modules.${module.id}Name`) }}
              <span v-if="module.isRequired" class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{{ t('workspace.core') }}</span>
            </span>
            <span :id="`settings-module-${module.id}`" class="mt-1 block text-xs leading-5 text-muted-foreground">{{ t(`settingsPage.modules.${module.id}`) }}</span>
          </span>
          <span aria-hidden="true" :class="['absolute right-3.5 top-3.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors', settingsStore.isModuleActive(module.id) ? module.theme.accent : 'bg-muted-foreground/25']">
            <span :class="['h-4 w-4 rounded-full shadow-sm transition-transform', settingsStore.isModuleActive(module.id) ? 'translate-x-4 bg-white' : 'translate-x-0 bg-white/70']" />
          </span>
        </button>
        <button v-if="canShare(module.id)" type="button" class="absolute bottom-2 right-3 inline-flex h-7 w-9 items-center justify-center rounded-lg transition-colors hover:bg-primary/10 disabled:opacity-40" :class="workspaces.binding(module.id)?.shared ? 'text-primary' : 'text-muted-foreground hover:text-foreground'" :aria-label="`${t('sharing.title')}: ${t(`workspace.modules.${module.id}Name`)}`" :title="workspaces.binding(module.id)?.shared ? t('sharing.manage') : t('sharing.shareTab')" :disabled="workspaces.busy" @click="sharing.showManage(module.id)"><Users v-if="workspaces.binding(module.id)?.shared" class="h-3.5 w-3.5" /><Link2 v-else class="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <p class="mt-3 text-xs leading-5 text-muted-foreground">{{ t('settingsPage.toolsHint') }}</p>
    </section>

    <AccountSettings :focus-request="focusAccount" @logout="emit('logout', $event)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, CheckSquare, Clapperboard, Code2, Dumbbell, Globe, Layers, Link2, ListTodo, Loader2, Moon, Palette, Repeat, ShieldCheck, SlidersHorizontal, Sun, Target, Timer, Users, Wallet, Zap } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import WorkspaceManager from '@/components/WorkspaceManager.vue'
import AccountSettings from '@/components/AccountSettings.vue'
import { useSettingsStore } from '@/stores/settings'
import { useThemeStore } from '@/stores/theme'
import { useUIStore } from '@/stores/ui'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useSharingStore } from '@/stores/sharing'
import { shareableModules } from '@/lib/sharing'
import { moduleCatalog } from '@/lib/moduleCatalog'
import { getThemePalette, isThemePaletteId, themePalettes } from '@/lib/themePalettes'

const settingsStore = useSettingsStore()
withDefaults(defineProps<{ focusAccount?: number }>(), { focusAccount: 0 })
const emit = defineEmits<{ logout: [scope: 'local' | 'global'] }>()
const themeStore = useThemeStore()
const workspaces = useWorkspacesStore()
const sharing = useSharingStore()
const canShare = (id: string) => shareableModules.some(module => module === id) && (!workspaces.sharingAvailable || Boolean(workspaces.binding(id)))
const ui = useUIStore()
const { t, locale } = useI18n()
const pendingModuleId = ref('')
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const languageOptions = [{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]
const themeOptions = [
  { value: 'light' as const, label: 'settingsPage.light', icon: Sun },
  { value: 'dark' as const, label: 'settingsPage.dark', icon: Moon },
]
const paletteOptions = computed(() => themePalettes.map(palette => ({ value: palette.id, label: palette.name[locale.value === 'tr' ? 'tr' : 'en'] })))
function paletteSwatches(id: unknown) {
  const colors = getThemePalette(id).colors[themeStore.theme]
  return [colors.background, colors.muted, colors.primary]
}
function handlePaletteChange(value: string) {
  if (isThemePaletteId(value)) themeStore.palette = value
}
const moduleIcons = { ListTodo, CheckSquare, Zap, ShieldCheck, Code2, Timer, Target, Layers, Dumbbell, Repeat, Clapperboard, Wallet }
const availableModules = moduleCatalog.map(module=>({ ...module, icon:moduleIcons[module.icon],isRequired:module.required }))
const enabledCount = computed(() => availableModules.filter(module => settingsStore.isModuleActive(module.id)).length)

function handleLanguageChange(language: string) {
  if (!languageOptions.some(option => option.value === language)) return
  locale.value = language
  settingsStore.language = language as 'en' | 'tr'
}

async function toggleModule(id: string, required: boolean) {
  if (required || pendingModuleId.value || workspaces.busy) return
  const workspaceId = workspaces.activeId
  pendingModuleId.value = id
  saveStatus.value = 'saving'
  try {
    const saved = await settingsStore.toggleModule(id, required)
    if (workspaces.activeId !== workspaceId) return
    saveStatus.value = saved ? 'saved' : 'error'
    if (!saved) ui.addToast(t('settingsPage.saveFailed'), 'error')
  } catch {
    if (workspaces.activeId === workspaceId) {
      saveStatus.value = 'error'
      ui.addToast(t('settingsPage.saveFailed'), 'error')
    }
  } finally { pendingModuleId.value = '' }
}

watch(() => workspaces.activeId, () => { saveStatus.value = 'idle' })
</script>

<style scoped>
.settings-page :is(button, input):focus-visible { outline: 2px solid hsl(var(--primary) / 0.55); outline-offset: 3px; border-radius: 0.75rem; }
@media (prefers-reduced-motion: reduce) { .settings-page *, .settings-page *::before, .settings-page *::after { transition-duration: 0s !important; animation: none !important; } }
</style>
