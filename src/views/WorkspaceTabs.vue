<template>
  <div ref="workspaceStage" class="workspace-stage relative">
    <div
      ref="workspaceShell"
      class="workspace-shell group/workspace bg-card/60 text-card-foreground px-4 pb-5 pt-3 sm:px-6 sm:pb-6 rounded-[1.75rem] shadow-[0_6px_24px_rgb(0,0,0,0.025)] border border-border/60 relative"
      :style="{ '--workspace-content-max': settingsStore.isFullScreen ? 'none' : undefined }"
    >

      <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"><div class="absolute -top-10 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/[0.025] rounded-full blur-3xl pointer-events-none"></div></div>

      <div ref="workspaceNavigation" class="workspace-navigation relative !mt-0">
        <div class="relative z-20 flex min-w-0 items-center gap-1 pr-16 !mt-0">
          <WorkspaceRail :model-value="activeTab" :active-view="reportedView?.module===activeTab?reportedView.view:'topics'" :enabled="activeModules.map(tab=>tab.id)" :workspace-name="workspaces.active?.name" @update:model-value="selectModule" @navigate="selectModuleView" @search="openTabSearch" @trash="trashOpen = true" @manage="$emit('manage-workspaces')" />
          <WorkspacePicker @trash="trashOpen = true" @manage="$emit('manage-workspaces')" />
        </div>

        <button ref="searchTrigger" type="button" class="absolute top-0 right-8 z-20 !m-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :title="`${t('search.title')} (Ctrl/⌘ K)`" :aria-label="t('search.title')" aria-haspopup="dialog" @click="openTabSearch"><Search class="h-4 w-4" /></button>

        <button
          type="button"
          class="absolute top-0 right-0 z-20 !m-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-all duration-300 opacity-0 scale-90 pointer-events-none group-hover/workspace:opacity-100 group-hover/workspace:scale-100 group-hover/workspace:pointer-events-auto focus-visible:opacity-100 focus-visible:scale-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [@media(hover:none)]:opacity-100 [@media(hover:none)]:scale-100 [@media(hover:none)]:pointer-events-auto"
          :title="widthToggleLabel"
          :aria-label="widthToggleLabel"
          :aria-pressed="settingsStore.isFullScreen"
          @click="settingsStore.isFullScreen = !settingsStore.isFullScreen"
        >
          <Shrink v-if="settingsStore.isFullScreen" class="w-4 h-4" />
          <Expand v-else class="w-4 h-4" />
        </button>
      </div>

      <div ref="moduleViewport" class="workspace-viewport relative z-10">
        <div ref="moduleContent" class="workspace-module-content">
          <Transition name="module-switch" mode="out-in" appear @after-enter="workspaceScroll?.settle()">
            <KeepAlive :max="moduleCatalog.length">
              <WorkspaceModulePane v-if="currentComponent" :key="activeTab" :tab-id="activeTab" :module-component="currentComponent" />
            </KeepAlive>
          </Transition>
          <div v-if="!activeModules.length" class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/50 p-4 text-center">
            <p class="text-sm text-muted-foreground">{{ t('workspace.noEnabledTabs') }}</p>
            <button type="button" class="rounded-xl border border-border/50 px-3 py-2 text-xs hover:bg-muted/50" @click="$emit('manage-workspaces')">{{ t('app.settings') }}</button>
          </div>
        </div>
      </div>

      <WorkspaceTrash v-if="trashOpen" @close="trashOpen = false" />
      <WorkspaceSearch ref="contentSearch" :enabled="activeModules.map(tab => tab.id)" @select="selectSearchHit" />

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, defineAsyncComponent, defineComponent, h, onMounted, onBeforeUnmount, ref, nextTick, shallowReactive, provide, type Component } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useI18n } from 'vue-i18n'
import { Expand, Search, Shrink } from 'lucide-vue-next'
import WorkspacePicker from '@/components/ui/WorkspacePicker.vue'
import WorkspaceRail from '@/components/ui/WorkspaceRail.vue'
import { workspaceNavigationKey, workspaceActiveViewKey, workspaceOpenItemKey, type WorkspaceNavigationIntent } from '@/lib/workspaceNavigation'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import WorkspaceSearch from '@/components/ui/WorkspaceSearch.vue'
import { searchDestinationKey, searchRevealErrorKey, searchScrollKey, type SearchDestination } from '@/lib/searchNavigation'
import { useUIStore } from '@/stores/ui'
import type { SearchHit } from '@/lib/workspaceSearch'
import { useWorkspacesStore } from '@/stores/workspaces'
import WorkspaceModulePane from '@/components/ui/WorkspaceModulePane.vue'
import WorkspaceModuleFeedback from '@/components/ui/WorkspaceModuleFeedback.vue'
import { moduleCatalog } from '@/lib/moduleCatalog'
import { openFinanceAnalysisKey } from '@/features/finance/lib/finance'
import { createWorkspaceScroll } from '@/lib/workspaceScroll'
import { changeTrash, onTrashMove, onTrashChange, trashUndoKey, trashError } from '@/lib/workspaceTrash'

// TÜM MODÜLLERİ DİNAMİK (LAZY) OLARAK YÜKLEYELİM
const loaders = {
  plans: () => import('@/features/plans/components/Plans.vue'),
  tasks: () => import('@/features/tasks/components/Tasks.vue'),
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

const WorkspaceTrash = defineAsyncComponent(() => import('@/components/ui/WorkspaceTrash.vue'))
const trashOpen = ref(false)
const settingsStore = useSettingsStore()
const { t } = useI18n()
const widthToggleLabel = computed(() => t(settingsStore.isFullScreen ? 'workspace.collapseWorkspace' : 'workspace.expandWorkspace'))

const props = defineProps<{
  initialTab?: string
  initialView?: string
  navigationRequest?: number
  headerInset?: number
}>()

const emit=defineEmits<{ 'manage-workspaces': []; 'open-finance-analysis': []; 'active-module': [module:string]; 'active-view':[module:string,view:string]; pinned: [pinned:boolean]; 'header-offset': [offset:number] }>()
provide(openFinanceAnalysisKey,()=>emit('open-finance-analysis'))
const activeTab = useWorkspaceDraft('last-tab', props.initialTab || 'plans')
if (props.initialTab && settingsStore.isModuleActive(props.initialTab)) activeTab.value = props.initialTab
const navigationIntent = ref<WorkspaceNavigationIntent|null>(null)
let navigationSequence = 0
provide(workspaceNavigationKey,navigationIntent)
const reportedView=ref<{module:string;view:string}|null>(null)
provide(workspaceActiveViewKey,(module,view)=>{reportedView.value={module,view};emit('active-view',module,view)})
function applyInitialView(){
  const allowed:Record<string,string[]>={tasks:['list','board','calendar'],finance:['transaction','position'],learning:['topics','today','mistakes']}
  if(allowed[activeTab.value]?.includes(props.initialView||''))navigationIntent.value={module:activeTab.value,view:props.initialView!,sequence:++navigationSequence}
}
applyInitialView()
function selectModule(module:string) {
  if(!activeModules.value.some(tab=>tab.id===module))return
  activeTab.value=module
  navigationIntent.value=module==='tasks'?{module,view:'calendar',sequence:++navigationSequence}:null
}
function selectModuleView(module:string,view:string) {
  if(!activeModules.value.some(tab=>tab.id===module))return
  const allowed:Record<string,string[]>={finance:['transaction','position'],learning:['topics','today','mistakes']}
  if(!allowed[module]?.includes(view))return
  activeTab.value=module
  navigationIntent.value={module,view,sequence:++navigationSequence}
}

const componentMap = shallowReactive<Record<string, Component>>(Object.fromEntries(Object.keys(loaders).map(id => [id, createModule(id as keyof typeof loaders)])))

// One stable frame uses document scrolling as its sole navigation range.
const workspaceStage = ref<HTMLElement>()
const workspaceShell = ref<HTMLElement>()
const workspaceNavigation = ref<HTMLElement>()
const moduleViewport = ref<HTMLElement>()
const moduleContent = ref<HTMLElement>()
let workspaceScroll: ReturnType<typeof createWorkspaceScroll> | undefined
provide(searchScrollKey, (element, behavior) => workspaceScroll?.reveal(element, behavior))
onMounted(() => {
  if (workspaceStage.value && workspaceShell.value && workspaceNavigation.value && moduleViewport.value && moduleContent.value) {
    workspaceScroll = createWorkspaceScroll(workspaceStage.value, workspaceShell.value, workspaceNavigation.value, moduleViewport.value, moduleContent.value, { headerInset: props.headerInset, onPinned: pinned => emit('pinned', pinned), onHeaderOffset: offset => emit('header-offset', offset) })
  }
})
onBeforeUnmount(() => workspaceScroll?.dispose())
watch(() => props.headerInset, value => workspaceScroll?.setHeaderInset(value || 0))
watch(activeTab, () => {
  workspaceScroll?.reset()
  void nextTick(() => workspaceScroll?.refresh())
})

const allTabs = moduleCatalog.map(module => ({id:module.id}))

const activeModules = computed(() => {
  return allTabs.filter(tab => settingsStore.isModuleActive(tab.id))
})

watch(() => [settingsStore.isFullScreen, settingsStore.isPomodoroDocked, activeModules.value.length], () => { void nextTick(() => workspaceScroll?.refresh()) })

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
const stopTrashMoves=onTrashMove((receipt,change)=>{
  if(change.owner!==workspaces.userId||change.workspace!==workspaces.activeId)return
  ui.addUndoToast(count=>t(count===1?'trash.moved':'trash.movedMany',{count}),t('trash.undo'),async()=>{
    try{await changeTrash(change.workspace,change.module,receipt.id,'restore',receipt.version,change.owner)}
    catch(error){ui.addToast(t('trash.'+trashError(error)),'error');throw error}
  },`trash:${change.owner}:${change.workspace}`,trashUndoKey(change,receipt.version))
})
const stopTrashChanges=onTrashChange(change=>{if(change.owner===workspaces.userId&&change.id&&change.version&&change.action!=='move')ui.discardUndo(trashUndoKey(change,change.version-(change.action==='restore'?1:0)))})
onBeforeUnmount(()=>{stopTrashMoves();stopTrashChanges()})
watch(() => workspaces.sessionKey, () => { destination.value = null;contentSearch.value?.close() })
async function openTabSearch() { await contentSearch.value?.open() }
function selectSearchHit(hit: SearchHit) {
  if (['secure','finance'].includes(hit.module) || !activeModules.value.some(tab => tab.id === hit.module)) return
  destination.value = { ...hit, sequence: ++searchSequence }
  activeTab.value = hit.module
}
provide(workspaceOpenItemKey,selectSearchHit)
function handleShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
    if (document.querySelector('dialog[open]') && !document.querySelector('.workspace-search[open]')) return
    event.preventDefault()
    void openTabSearch()
  }
}
onMounted(() => window.addEventListener('keydown', handleShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut))

watch([() => props.initialTab, () => props.navigationRequest, () => props.initialView], ([newVal]) => {
  if (newVal && activeModules.value.find(t => t.id === newVal)) {
    activeTab.value = newVal
    applyInitialView()
  }
})

watch(activeModules, (newTabs) => {
  const isCurrentTabStillActive = newTabs.find(t => t.id === activeTab.value)
  if (!isCurrentTabStillActive) {
    activeTab.value = newTabs[0]?.id || ''
  }
}, { immediate: true })
watch(activeTab,module=>emit('active-module',module),{immediate:true})
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
