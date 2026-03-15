<template>
  <div class="bg-card/60 backdrop-blur-3xl text-card-foreground px-5 pb-5 pt-4 sm:px-8 sm:pb-8 sm:pt-6 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 dark:border-white/5 space-y-6 relative overflow-hidden">
    
    <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

    <div class="relative z-10 flex justify-center w-full">
      <div class="inline-flex items-center gap-1 p-1 bg-muted/50 backdrop-blur-md rounded-2xl border border-border/50 overflow-x-auto hide-scrollbar max-w-full">
        <button
          v-for="tab in tabs"
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

    <div class="relative z-10">
      <div v-if="activeTab === 'quick'">
        <QuickNotes />
      </div>
      <div v-else-if="activeTab === 'secure'" class="animate-in fade-in zoom-in-95 duration-500">
        <SecureNotes />
      </div>
      <div v-else-if="activeTab === 'code'" class="animate-in fade-in zoom-in-95 duration-500">
        <CodeSnippets />
      </div>
      <div v-else-if="activeTab === 'learning'" class="animate-in fade-in zoom-in-95 duration-500">
        <LearningTracker />
      </div>
      <div v-else-if="activeTab === 'flashcards'" class="animate-in fade-in zoom-in-95 duration-500">
        <Flashcards />
      </div>
      <div v-else-if="activeTab === 'workout'" class="animate-in fade-in zoom-in-95 duration-500">
        <WorkoutTracker />
      </div>
      
      <div v-else class="animate-in fade-in zoom-in-95 duration-500">
        <slot />
      </div>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

// Modülleri içe aktarma
import QuickNotes from './QuickNotes.vue'
import SecureNotes from './SecureNotes.vue'
const LearningTracker = defineAsyncComponent(() => import('./LearningTracker.vue'))
const CodeSnippets = defineAsyncComponent(() => import('./CodeSnippets.vue'))
const Flashcards = defineAsyncComponent(() => import('./Flashcards.vue'))
const WorkoutTracker = defineAsyncComponent(() => import('./WorkoutTracker.vue'))

const settingsStore = useSettingsStore()

const props = defineProps({
  initialTab: {
    type: String,
    default: 'detailed'
  }
})

const activeTab = ref(props.initialTab)

const allTabs = [
  { id: 'detailed' },
  { id: 'quick' },
  { id: 'secure' },
  { id: 'code' },
  { id: 'learning' },
  { id: 'flashcards' },
  { id: 'workout' }
]

const tabs = computed(() => {
  return allTabs.filter(tab => settingsStore.isModuleActive(tab.id))
})

watch(() => props.initialTab, (newVal) => {
  if (tabs.value.find(t => t.id === newVal)) {
    activeTab.value = newVal
  }
})

watch(tabs, (newTabs) => {
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