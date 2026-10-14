<template>
  <div
    class="group/workspace bg-card/60 backdrop-blur-3xl text-card-foreground px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 dark:border-white/5 space-y-4 relative overflow-hidden"
    :style="{ '--workspace-content-max': settingsStore.isFullScreen ? 'none' : undefined }"
  >
    
    <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

    <div class="relative z-20 pr-16 !mt-0"><WorkspacePicker @manage="$emit('manage-workspaces')" /></div>

    <button ref="searchTrigger" type="button" class="absolute top-4 right-12 z-20 !m-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :title="`${t('search.title')} (Ctrl/⌘ K)`" :aria-label="t('search.title')" aria-haspopup="dialog" @click="openTabSearch"><Search class="h-4 w-4" /></button>

    <div class="relative z-10 pr-7">
      <WorkspaceTabStrip v-model="activeTab" :tabs="stripTabs" />
    </div>

    <button
      type="button"
      class="absolute top-4 right-4 z-20 !m-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-all duration-300 opacity-0 scale-90 pointer-events-none group-hover/workspace:opacity-100 group-hover/workspace:scale-100 group-hover/workspace:pointer-events-auto focus-visible:opacity-100 focus-visible:scale-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [@media(hover:none)]:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:pointer-events-auto"
      :title="widthToggleLabel"
      :aria-label="widthToggleLabel"
      :aria-pressed="settingsStore.isFullScreen"
      @click="settingsStore.isFullScreen = !settingsStore.isFullScreen"
    >
      <Shrink v-if="settingsStore.isFullScreen" class="w-4 h-4" />
      <Expand v-else class="w-4 h-4" />
    </button>

    <div class="relative z-10">
      <Transition name="module-switch" mode="out-in" appear>
        <KeepAlive :max="moduleCatalog.length">
          <WorkspaceModulePane v-if="currentComponent" :key="activeTab" :tab-id="activeTab" :module-component="currentComponent" />
        </KeepAlive>
      </Transition>
      <div v-if="!activeModules.length" class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/50 p-4 text-center">
        <p class="text-sm text-muted-foreground">{{ t('workspace.noEnabledTabs') }}</p>
        <button type="button" class="rounded-xl border border-border/50 px-3 py-2 text-xs hover:bg-muted/50" @click="$emit('manage-workspaces')">{{ t('app.settings') }}</button>
      </div>
    </div>

    <WorkspaceSearch ref="contentSearch" :enabled="activeModules.map(tab => tab.id)" @select="selectSearchHit" />
    
  </div>
</template>

<script setup lang="ts">
import { computed, watch, defineAsyncComponent, defineComponent, h, onMounted, onBeforeUnmount, ref, shallowReactive, provide, type Component } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useI18n } from 'vue-i18n'
import { Expand, Search, Shrink } from 'lucide-vue-next'
import WorkspaceTabStrip from '@/components/ui/WorkspaceTabStrip.vue'
import WorkspacePicker from '@/components/ui/WorkspacePicker.vue'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import WorkspaceSearch from '@/components/ui/WorkspaceSearch.vue'
import { searchDestinationKey, searchRevealErrorKey, type SearchDestination } from '@/lib/searchNavigation'
import { useUIStore } from '@/stores/ui'
import type { SearchHit } from '@/lib/workspaceSearch'
import { useWorkspacesStore } from '@/stores/workspaces'
import WorkspaceModulePane from '@/components/ui/WorkspaceModulePane.vue'
import WorkspaceModuleFeedback from '@/components/ui/WorkspaceModuleFeedback.vue'
import { moduleCatalog } from '@/lib/moduleCatalog'
import { openFinanceAnalysisKey } from '@/features/finance/lib/finance'

// TÜM MODÜLLERİ DİNAMİK (LAZY) OLARAK YÜKLEYELİM
const loaders = {
  plans: () => import('@/features/plans/components/Plans.vue'),
  detailed: () => import('@/features/todos/components/TodoBoard.vue'),
  quick: () => import('@/features/quick_notes/components/QuickNotes.vue'),
  secure: () => import('@/features/secure_notes/components/SecureNotes.vue'),
  code: () => import('@/features/code_snippets/components/CodeSnippets.vue'),
  pomodoro: () => import('@/features/pomodoro/components/PomoNotes.vue'),
  learning: () => import('@/features/learning/components/LearningTracker.vue'),
  flashcards: () => import('@/features/flashcards/components/Flashcards.vue'),
  workout: () => import('@/features/workout/components/WorkoutTracker.vue'),
  periodic: () => import('@/features/PeriodicTasks/components/PeriodicTasks.vue'),
  activities: () => import('@/features/activity_lists/components/ActivityLists.vue'),
  finance: () => import('@/features/finance/components/FinanceTracker.vue'),
}
function createModule(id: keyof typeof loaders): Component {
  return defineAsyncComponent<Component>({
    loader: async () => (await loaders[id]()).default, delay: 120, timeout: 20_000,
    loadingComponent: WorkspaceModuleFeedback,
    errorComponent: defineComponent({ setup: () => () => h(WorkspaceModuleFeedback, { error: true, onRetry: () => { componentMap[id] = createModule(id) } }) }),
  })
}

const settingsStore = useSettingsStore()
const { t } = useI18n()
const widthToggleLabel = computed(() => t(settingsStore.isFullScreen ? 'workspace.collapseWorkspace' : 'workspace.expandWorkspace'))

const props = defineProps<{
  initialTab?: string
}>()

const emit=defineEmits<{ 'manage-workspaces': []; 'open-finance-analysis': [] }>()
provide(openFinanceAnalysisKey,()=>emit('open-finance-analysis'))
const activeTab = useWorkspaceDraft('last-tab', props.initialTab || 'plans')
if (props.initialTab) activeTab.value = props.initialTab

const componentMap = shallowReactive<Record<string, Component>>(Object.fromEntries(Object.keys(loaders).map(id => [id, createModule(id as keyof typeof loaders)])))

const allTabs = moduleCatalog.map(module => ({id:module.id}))

const activeModules = computed(() => {
  return allTabs.filter(tab => settingsStore.isModuleActive(tab.id))
})

const stripTabs = computed(() => activeModules.value.map(tab => ({ id: tab.id, label: t(tab.id==='pomodoro'?'pomoNotes.tab':`workspace.modules.${tab.id}Name`) })))

const currentComponent = computed(() => {
  return activeModules.value.some(tab => tab.id === activeTab.value) ? componentMap[activeTab.value] : null
})

const contentSearch = ref<InstanceType<typeof WorkspaceSearch>>()
const searchTrigger = ref<HTMLButtonElement>()
const destination = ref<SearchDestination | null>(null)
provide(searchDestinationKey, destination)
const ui = useUIStore()
provide(searchRevealErrorKey, () => ui.addToast(t('search.unavailable'), 'info'))
let searchSequence = 0
const workspaces = useWorkspacesStore()
watch(() => workspaces.sessionKey, () => { destination.value = null;contentSearch.value?.close() })
async function openTabSearch() { await contentSearch.value?.open() }
function selectSearchHit(hit: SearchHit) {
  if (hit.module === ('secure' as string) || !activeModules.value.some(tab => tab.id === hit.module)) return
  destination.value = { ...hit, sequence: ++searchSequence }
  activeTab.value = hit.module
}
function handleShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
    if (document.querySelector('dialog[open]') && !document.querySelector('.workspace-search[open]')) return
    event.preventDefault()
    void openTabSearch()
  }
}
onMounted(() => window.addEventListener('keydown', handleShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut))

watch(() => props.initialTab, (newVal) => {
  if (newVal && activeModules.value.find(t => t.id === newVal)) {
    activeTab.value = newVal
  }
})

watch(activeModules, (newTabs) => {
  const isCurrentTabStillActive = newTabs.find(t => t.id === activeTab.value)
  if (!isCurrentTabStillActive) {
    activeTab.value = newTabs[0]?.id || ''
  }
}, { immediate: true })
</script>

<style scoped>
.module-switch-enter-active { transition: opacity 280ms ease-out, transform 280ms cubic-bezier(.22,1,.36,1); }
.module-switch-enter-from { opacity: 0; transform: translateY(12px); }
.module-switch-enter-to { opacity: 1; transform: translateY(0); }
.module-switch-leave-active { transition: none; }
.module-switch-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .module-switch-enter-active, .module-switch-leave-active { transition: none; }
  .module-switch-enter-from, .module-switch-enter-to { transform: none; }
}
</style>
