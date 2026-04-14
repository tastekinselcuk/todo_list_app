<template>
  <div class="bg-card/60 backdrop-blur-3xl text-card-foreground px-5 pb-5 pt-4 sm:px-8 sm:pb-8 sm:pt-6 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 dark:border-white/5 space-y-6 relative overflow-hidden">
    
    <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

    <div class="relative z-10 flex justify-center w-full">
      <div class="inline-flex items-center gap-1 p-1 bg-muted/50 backdrop-blur-md rounded-2xl border border-border/50 overflow-x-auto hide-scrollbar max-w-full">
        <button
          v-for="tab in activeModules"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="relative px-5 py-2 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap"
          :class="[
            activeTab === tab.id
              ? 'text-foreground shadow-sm ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
          ]"
        >
          <div 
            v-if="activeTab === tab.id" 
            class="absolute inset-0 bg-background rounded-xl -z-10 transition-all duration-300 shadow-sm"
          ></div>
          <span class="relative z-10">{{ $t(`workspace.modules.${tab.id}Name`) }}</span>
        </button>
      </div>
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

// TÜM MODÜLLERİ DİNAMİK (LAZY) OLARAK YÜKLEYELİM
const TodoBoard = defineAsyncComponent(() => import('@/features/todos/components/TodoBoard.vue'))
const QuickNotes = defineAsyncComponent(() => import('@/features/quick_notes/components/QuickNotes.vue'))
const SecureNotes = defineAsyncComponent(() => import('@/features/secure_notes/components/SecureNotes.vue'))
const CodeSnippets = defineAsyncComponent(() => import('@/features/code_snippets/components/CodeSnippets.vue'))
const LearningTracker = defineAsyncComponent(() => import('@/features/learning/components/LearningTracker.vue'))
const Flashcards = defineAsyncComponent(() => import('@/features/flashcards/components/Flashcards.vue'))
const WorkoutTracker = defineAsyncComponent(() => import('@/features/workout/components/WorkoutTracker.vue'))

const PeriodicTasks = defineAsyncComponent(() => import('@/features/PeriodicTasks/components/PeriodicTasks.vue'))

const settingsStore = useSettingsStore()

const props = defineProps<{
  initialTab?: string
}>()

const activeTab = ref(props.initialTab || 'detailed')

const componentMap: Record<string, any> = {
  detailed: TodoBoard,
  quick: QuickNotes,
  secure: SecureNotes,
  code: CodeSnippets,
  learning: LearningTracker,
  flashcards: Flashcards,
  workout: WorkoutTracker,
  periodic: PeriodicTasks // YENİ
}

const allTabs = [
  { id: 'detailed' },
  { id: 'quick' },
  { id: 'secure' },
  { id: 'code' },
  { id: 'learning' },
  { id: 'flashcards' },
  { id: 'workout' },
  { id: 'periodic' } // YENİ
]

const activeModules = computed(() => {
  return allTabs.filter(tab => settingsStore.isModuleActive(tab.id))
})

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
})
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>