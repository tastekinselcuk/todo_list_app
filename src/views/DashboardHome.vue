<template>
  <div class="min-h-[85vh] py-8 px-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
    
    <div class="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-6">
      <div class="space-y-1">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-3 border border-primary/20">
          <Sparkles class="w-4 h-4" />
          <span>{{ greeting }}</span>
        </div>
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          {{ $t('dashboard.welcome') }}, <span class="text-primary">{{ userName }}</span>
        </h1>
        <p class="text-sm text-muted-foreground font-medium">
          {{ currentDate }} — {{ $t('dashboard.overviewSubtitle') }}
        </p>
      </div>
    </div>

    <div class="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 w-full">
      
      <div v-if="activeModulesCount === 0" class="col-span-full py-16 flex flex-col items-center justify-center text-center bg-background/40 backdrop-blur-md rounded-2xl border border-dashed border-border/60">
        <LayoutGrid class="w-12 h-12 text-muted-foreground opacity-40 mb-4" />
        <h3 class="text-lg font-semibold">{{ $t('dashboard.welcomeModule.title') }}</h3>
        <p class="text-sm text-muted-foreground mt-1 max-w-sm">{{ $t('dashboard.welcomeModule.desc') }}</p>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('detailed')" 
        @click="$emit('enter-workspace', 'detailed')" 
        class="col-span-1 md:col-span-2 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-blue-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-blue-500/10"></div>
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"><CheckSquare class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.detailedName') }}</h3>
          </div>
          <ArrowRight class="w-5 h-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
        </div>
        <div class="relative z-10 flex items-baseline gap-3">
          <div class="text-4xl font-bold tracking-tight text-foreground">{{ pendingTasks }}</div>
          <div class="flex flex-col">
            <span class="text-sm font-medium text-muted-foreground">{{ $t('dashboard.tasks.pending') }}</span>
            <span v-if="tasksDueToday > 0" class="text-xs font-semibold text-blue-500 mt-0.5">
              {{ tasksDueToday }} {{ $t('dashboard.tasks.dueToday') }}
            </span>
          </div>
        </div>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('quick')" 
        @click="$emit('enter-workspace', 'quick')" 
        class="col-span-1 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-amber-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20"><Zap class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.quickName') }}</h3>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl font-bold tracking-tight text-foreground">{{ todoStore.quickNotes.length }}</div>
          <p class="text-xs font-medium text-muted-foreground mt-1">{{ $t('dashboard.quickNotes.saved') }}</p>
        </div>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('code')" 
        @click="$emit('enter-workspace', 'code')" 
        class="col-span-1 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-violet-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-violet-500/10 text-violet-500 border border-violet-500/20"><Code2 class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.codeName') }}</h3>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl font-bold tracking-tight text-foreground">{{ todoStore.codeSnippets.length }}</div>
          <p class="text-xs font-medium text-muted-foreground mt-1">{{ $t('dashboard.code.snippets') }}</p>
        </div>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('secure')" 
        @click="$emit('enter-workspace', 'secure')" 
        class="col-span-1 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-emerald-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><Shield class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.secureName') }}</h3>
          </div>
        </div>
        <div class="relative z-10 mt-auto">
          <div class="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs bg-emerald-500/10 w-max px-3 py-1.5 rounded-lg border border-emerald-500/20">
            <Lock class="w-3.5 h-3.5" /> {{ $t('dashboard.secureVault.locked') }}
          </div>
        </div>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('learning')" 
        @click="$emit('enter-workspace', 'learning')" 
        class="col-span-1 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"><Target class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.learningName') }}</h3>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl font-bold tracking-tight text-foreground">{{ learningStore.subjects.length }}</div>
          <p class="text-xs font-medium text-muted-foreground mt-1">{{ $t('dashboard.learning.subjects') }}</p>
        </div>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('flashcards')" 
        @click="$emit('enter-workspace', 'flashcards')" 
        class="col-span-1 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-orange-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20"><Layers class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.flashcardsName') }}</h3>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl font-bold tracking-tight text-foreground">{{ flashcardStore.decks.length }}</div>
          <p class="text-xs font-medium text-muted-foreground mt-1">{{ $t('dashboard.flashcards.decks') }}</p>
        </div>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('workout')" 
        @click="$emit('enter-workspace', 'workout')" 
        class="col-span-1 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-teal-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-teal-500/10 text-teal-500 border border-teal-500/20"><Dumbbell class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.workoutName') }}</h3>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl font-bold tracking-tight text-foreground">{{ workoutStore.routines.length }}</div>
          <p class="text-xs font-medium text-muted-foreground mt-1">{{ $t('dashboard.workout.routines') }}</p>
        </div>
      </div>

      <div 
        v-if="settingsStore.isModuleActive('periodic')" 
        @click="$emit('enter-workspace', 'periodic')" 
        class="col-span-1 group relative overflow-hidden bg-background/50 backdrop-blur-xl rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md hover:border-pink-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        <div class="flex items-start justify-between mb-8 relative z-10">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-pink-500/10 text-pink-500 border border-pink-500/20"><Repeat class="w-5 h-5" /></div>
            <h3 class="text-base font-semibold text-foreground">{{ $t('workspace.modules.periodicName') }}</h3>
          </div>
        </div>
        <div class="relative z-10">
          <div class="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            {{ periodicTaskCount }}
          </div>
          <p class="text-xs font-medium text-muted-foreground mt-1">{{ $t('dashboard.periodic.routines') }}</p>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
// İkonlar arasına Repeat eklendi
import { CheckSquare, Zap, Shield, Target, Layers, Dumbbell, ArrowRight, LayoutGrid, Lock, Sparkles, Code2, Repeat } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useLearningStore } from '@/features/learning/stores/learning'
import { useWorkoutStore } from '@/features/workout/stores/workout'
import { useFlashcardStore } from '@/features/flashcards/stores/flashcards'

defineEmits(['enter-workspace'])

const { t } = useI18n()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const todoStore = useTodoStore()
const learningStore = useLearningStore()
const workoutStore = useWorkoutStore()
const flashcardStore = useFlashcardStore()

const userName = computed(() => {
  const email = authStore.user?.email || ''
  const name = email.split('@')[0] || 'User'
  return name.charAt(0).toUpperCase() + name.slice(1)
})

// activeModulesCount dizisine 'periodic' dahil edildi
const activeModulesCount = computed(() => {
  return ['detailed', 'quick', 'secure', 'code', 'learning', 'flashcards', 'workout', 'periodic']
    .filter(mod => settingsStore.isModuleActive(mod)).length
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return t('dashboard.goodMorning')
  if (hour < 18) return t('dashboard.goodAfternoon')
  return t('dashboard.goodEvening')
})

const currentDate = computed(() => {
  const lang = t('workspace.language') === 'Dil' ? 'tr-TR' : 'en-US'
  return new Date().toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' })
})

const pendingTasks = computed(() => todoStore.todos.filter(t => !t.completed).length)

const tasksDueToday = computed(() => {
  const todayStr = new Date().toISOString().split('T')[0]
  return todoStore.todos.filter(t => !t.completed && t.dueDate === todayStr).length
})

// İleride store entegrasyonu yapıldığında bu veriyi ilgili storedan çekeceksiniz.
const periodicTaskCount = computed(() => 0) 
</script>