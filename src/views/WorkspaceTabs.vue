<template>
  <div
    class="bg-card/60 backdrop-blur-3xl text-card-foreground px-5 pb-5 pt-4 sm:px-8 sm:pb-8 sm:pt-6 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 dark:border-white/5 space-y-6 relative overflow-hidden"
    :style="{ '--workspace-content-max': settingsStore.isFullScreen ? 'none' : undefined }"
  >
    
    <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

    <div class="relative z-10 flex items-center gap-2">
      <WorkspaceTabStrip v-model="activeTab" :tabs="stripTabs" class="min-w-0 flex-1" />
      <button
        type="button"
        class="shrink-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        :title="widthToggleLabel"
        :aria-label="widthToggleLabel"
        :aria-pressed="settingsStore.isFullScreen"
        @click="settingsStore.isFullScreen = !settingsStore.isFullScreen"
      >
        <Shrink v-if="settingsStore.isFullScreen" class="w-4 h-4" />
        <Expand v-else class="w-4 h-4" />
      </button>
    </div>

    <div class="relative z-10 animate-in fade-in zoom-in-95 duration-500">
      <KeepAlive>
        <component :is="currentComponent" />
      </KeepAlive>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useI18n } from 'vue-i18n'
import { Expand, Shrink } from 'lucide-vue-next'
import WorkspaceTabStrip from '@/components/ui/WorkspaceTabStrip.vue'

// TÜM MODÜLLERİ DİNAMİK (LAZY) OLARAK YÜKLEYELİM
const Plans = defineAsyncComponent(() => import('@/features/plans/components/Plans.vue'))
const TodoBoard = defineAsyncComponent(() => import('@/features/todos/components/TodoBoard.vue'))
const QuickNotes = defineAsyncComponent(() => import('@/features/quick_notes/components/QuickNotes.vue'))
const SecureNotes = defineAsyncComponent(() => import('@/features/secure_notes/components/SecureNotes.vue'))
const CodeSnippets = defineAsyncComponent(() => import('@/features/code_snippets/components/CodeSnippets.vue'))
const LearningTracker = defineAsyncComponent(() => import('@/features/learning/components/LearningTracker.vue'))
const Flashcards = defineAsyncComponent(() => import('@/features/flashcards/components/Flashcards.vue'))
const WorkoutTracker = defineAsyncComponent(() => import('@/features/workout/components/WorkoutTracker.vue'))

const PeriodicTasks = defineAsyncComponent(() => import('@/features/PeriodicTasks/components/PeriodicTasks.vue'))
const ActivityLists = defineAsyncComponent(() => import('@/features/activity_lists/components/ActivityLists.vue'))

const settingsStore = useSettingsStore()
const { t } = useI18n()
const widthToggleLabel = computed(() => t(settingsStore.isFullScreen ? 'workspace.collapseWorkspace' : 'workspace.expandWorkspace'))

const props = defineProps<{
  initialTab?: string
}>()

const activeTab = ref(props.initialTab || 'plans')

const componentMap: Record<string, any> = {
  plans: Plans,
  detailed: TodoBoard,
  quick: QuickNotes,
  secure: SecureNotes,
  code: CodeSnippets,
  learning: LearningTracker,
  flashcards: Flashcards,
  workout: WorkoutTracker,
  periodic: PeriodicTasks,
  activities: ActivityLists,
}

const allTabs = [
  { id: 'plans' },
  { id: 'detailed' },
  { id: 'quick' },
  { id: 'secure' },
  { id: 'code' },
  { id: 'learning' },
  { id: 'flashcards' },
  { id: 'workout' },
  { id: 'periodic' },
  { id: 'activities' },
]

const activeModules = computed(() => {
  return allTabs.filter(tab => settingsStore.isModuleActive(tab.id))
})

const stripTabs = computed(() => activeModules.value.map(tab => ({ id: tab.id, label: t(`workspace.modules.${tab.id}Name`) })))

const currentComponent = computed(() => {
  return componentMap[activeTab.value] || null
})

watch(() => props.initialTab, (newVal) => {
  if (newVal && activeModules.value.find(t => t.id === newVal)) {
    activeTab.value = newVal
  }
})

watch(activeModules, (newTabs) => {
  const isCurrentTabStillActive = newTabs.find(t => t.id === activeTab.value)
  if (!isCurrentTabStillActive && newTabs.length > 0) {
    activeTab.value = newTabs[0].id
  }
}, { immediate: true })
</script>
