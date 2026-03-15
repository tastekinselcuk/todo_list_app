<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <div class="h-8 w-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
          <Dumbbell class="h-4 w-4 text-teal-500" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-foreground">{{ $t('workout.title') }}</h2>
          <p class="text-xs text-muted-foreground">{{ $t('workout.subtitle') }}</p>
        </div>
      </div>
      
      <button
        v-if="!activeRoutine"
        @click="showAddRoutine = !showAddRoutine"
        class="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
      >
        <Plus v-if="!showAddRoutine" class="h-4 w-4" />
        <X v-else class="h-4 w-4" />
        <span>{{ showAddRoutine ? $t('workout.cancel') : $t('workout.newRoutine') }}</span>
      </button>
    </div>

    <div v-if="!activeRoutine" class="space-y-6">
      <transition name="slide-fade">
        <div v-if="showAddRoutine" class="p-4 rounded-xl border border-border bg-card shadow-sm flex items-center gap-3">
          <input
            v-model="newRoutineTitle"
            type="text"
            :placeholder="$t('workout.routinePlaceholder')"
            class="flex-1 h-10 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <CustomSelect v-model="newRoutineDay" :options="dayOptions" />
          <button
            @click="handleAddRoutine"
            :disabled="!newRoutineTitle.trim()"
            class="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {{ $t('workout.create') }}
          </button>
        </div>
      </transition>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="routine in store.routines"
          :key="routine.id"
          class="relative p-5 rounded-2xl border border-border bg-card hover:border-teal-500/30 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[140px]"
          @click="openRoutine(routine)"
        >
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold px-2 py-1 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                {{ routine.day_of_week === 'Any' ? $t('workout.anyDay') : $t(`workout.${routine.day_of_week.toLowerCase()}`) }}
              </span>
              <button @click.stop="handleDeleteRoutine(routine.id)" class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
            <h3 class="text-lg font-bold text-foreground">{{ routine.title }}</h3>
          </div>
          
          <div class="mt-4 flex items-center justify-between">
            <p class="text-sm text-muted-foreground">{{ $t('workout.exercisesCount', { count: routine.exercises.length }) }}</p>
            <div class="flex items-center gap-1 text-teal-500 font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 duration-300">
              {{ $t('workout.start') }} <ArrowRight class="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="space-y-6">
      <div class="flex items-center justify-between border-b border-border pb-4">
        <button @click="activeRoutine = null" class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft class="w-4 h-4" /> {{ $t('workout.back') }}
        </button>
        <div class="text-right">
          <h2 class="text-xl font-bold text-foreground">{{ activeRoutine.title }}</h2>
          <p class="text-xs text-muted-foreground">{{ $t('workout.completedCount', { completed: getCompletedCount(), total: activeRoutine.exercises.length }) }}</p>
        </div>
      </div>

      <div class="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div class="h-full bg-teal-500 transition-all duration-500" :style="{ width: `${getProgress()}%` }"></div>
      </div>

      <button @click="openLibrary" class="w-full py-4 border-2 border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-teal-500/50 hover:bg-teal-500/5 transition-all flex items-center justify-center gap-2">
        <Search class="w-5 h-5" /> {{ $t('workout.searchDatabase') }}
      </button>

      <div class="space-y-4">
        <div
          v-for="exercise in activeRoutine.exercises"
          :key="exercise.id"
          @click="store.toggleExerciseCompletion(activeRoutine!.id, exercise.id)"
          class="flex items-center gap-4 p-3 rounded-2xl border transition-all duration-300 cursor-pointer group"
          :class="exercise.isCompleted ? 'bg-teal-500/10 border-teal-500/40 shadow-sm' : 'bg-card border-border hover:border-muted-foreground/30'"
        >
          <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-white shrink-0 relative border border-border/50 flex items-center justify-center p-1">
            <img :src="exercise.imageUrl" :alt="exercise.name" class="w-full h-full object-contain transition-opacity duration-300" :class="exercise.isCompleted ? 'opacity-30 grayscale' : 'opacity-100'" />
            <div class="absolute inset-0 transition-all duration-300 flex items-center justify-center pointer-events-none" :class="exercise.isCompleted ? 'bg-teal-500/20 backdrop-blur-[1px] opacity-100' : 'opacity-0'">
              <CheckCircle2 class="w-10 h-10 text-teal-600 dark:text-teal-400 drop-shadow-md" />
            </div>
          </div>

          <div class="flex-1 py-2">
            <h4 class="font-bold text-lg text-foreground transition-all duration-300 capitalize" :class="{ 'line-through opacity-60 text-teal-700 dark:text-teal-400': exercise.isCompleted }">{{ exercise.name }}</h4>
            <div class="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span class="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md"><Layers class="w-4 h-4"/> {{ $t('workout.sets', { count: exercise.sets }) }}</span>
              <span class="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md"><RotateCcw class="w-4 h-4"/> {{ $t('workout.reps', { count: exercise.reps }) }}</span>
            </div>
          </div>

          <div class="pr-4">
            <button v-if="!exercise.isCompleted" @click.stop="store.deleteExercise(activeRoutine!.id, exercise.id)" class="p-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="getProgress() === 100 && activeRoutine.exercises.length > 0" class="p-6 bg-teal-500/10 border border-teal-500/30 rounded-2xl text-center space-y-3 mt-8">
        <h3 class="text-teal-600 dark:text-teal-400 font-bold text-xl">{{ $t('workout.workoutComplete') }}</h3>
        <p class="text-sm text-muted-foreground">{{ $t('workout.greatJob') }}</p>
        <button @click="store.resetRoutine(activeRoutine!.id)" class="text-sm font-medium text-teal-600 dark:text-teal-400 underline hover:text-teal-700 mt-2">{{ $t('workout.resetRoutine') }}</button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showLibrary" class="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
        <div class="bg-card w-full max-w-5xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col h-[90vh] sm:h-[85vh] animate-in zoom-in-95 duration-200">
          
          <div class="p-6 border-b border-border bg-muted/30 space-y-4">
            <div class="flex justify-between items-center">
              <div>
                <h3 class="text-2xl font-bold text-foreground">{{ $t('workout.exerciseDatabase') }}</h3>
                <p class="text-sm text-muted-foreground mt-1">{{ $t('workout.searchAPI') }}</p>
              </div>
              <button @click="showLibrary = false" class="p-2 hover:bg-accent rounded-full transition-colors"><X class="w-6 h-6"/></button>
            </div>
            
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input 
                v-model="searchQuery" 
                @keyup.enter="searchExercises"
                type="text" 
                :placeholder="$t('workout.searchPlaceholder')" 
                class="w-full h-12 pl-10 pr-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all"
                autofocus
              />
              <button 
                @click="searchExercises" 
                :disabled="isSearching || !searchQuery"
                class="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-4 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {{ $t('workout.searchBtn') }}
              </button>
            </div>
          </div>
          
          <div class="overflow-y-auto p-6 flex-1 bg-muted/10 relative">
            
            <div v-if="isSearching" class="absolute inset-0 flex flex-col items-center justify-center bg-muted/10 backdrop-blur-sm z-10">
              <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500 mb-4"></div>
              <p class="text-muted-foreground text-sm font-medium">{{ $t('workout.fetching') }}</p>
            </div>

            <div v-if="!isSearching && apiExercises.length === 0" class="h-full flex flex-col items-center justify-center text-muted-foreground text-center">
              <Dumbbell class="w-16 h-16 opacity-20 mb-4" />
              <p>{{ $t('workout.noExercises') }}</p>
              <p class="text-xs mt-2 opacity-70">{{ $t('workout.searchExample') }}</p>
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div v-for="ex in apiExercises" :key="ex.name" class="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-teal-500/50 transition-all duration-300 flex flex-col">
                
                <div class="w-full h-48 sm:h-56 bg-white relative overflow-hidden flex items-center justify-center p-4">
                  <img :src="ex.imageUrl" class="w-auto h-full object-contain group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none"></div>
                  
                  <div class="absolute top-3 left-3 px-2.5 py-1 bg-background/90 backdrop-blur-md rounded-md text-[10px] font-bold uppercase tracking-wider text-foreground shadow-sm border border-border/50">
                    {{ ex.target }}
                  </div>
                  
                  <h4 class="absolute bottom-3 left-4 font-bold text-xl text-white drop-shadow-lg capitalize">{{ ex.name }}</h4>
                </div>
                
                <div class="p-4 flex flex-col gap-3">
                  <p class="text-xs text-muted-foreground mb-1">{{ $t('workout.quickAdd') }}</p>
                  <div class="flex items-center gap-2">
                    <button @click="addFromLibrary(ex, 3, '10-12')" class="flex-1 py-2.5 bg-muted hover:bg-teal-500 hover:text-white rounded-xl text-sm font-semibold transition-colors duration-200">
                      {{ $t('workout.addSets', { sets: 3, reps: '10-12' }) }}
                    </button>
                    <button @click="addFromLibrary(ex, 4, '8-10')" class="flex-1 py-2.5 bg-muted hover:bg-teal-500 hover:text-white rounded-xl text-sm font-semibold transition-colors duration-200">
                      {{ $t('workout.addSets', { sets: 4, reps: '8-10' }) }}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Dumbbell, Plus, X, Trash2, ArrowRight, ArrowLeft, CheckCircle2, Layers, RotateCcw, Search } from 'lucide-vue-next'
import { useWorkoutStore, type Routine } from '@/stores/workout'
import { useI18n } from 'vue-i18n' // <-- YENİ EKLENDİ

// ==========================================
// KULLANICININ RAPID API ANAHTARI
// ==========================================
const RAPID_API_KEY = '1bd59db26fmsha1a081f8ce096c3p15e53djsnf1f74c1bed0d'

import CustomSelect from './ui/CustomSelect.vue'

const store = useWorkoutStore()
const { t } = useI18n()

const dayOptions = computed(() => [
  { value: 'Any', label: t('workout.anyDay') },
  { value: 'Monday', label: t('workout.monday') },
  { value: 'Tuesday', label: t('workout.tuesday') },
  { value: 'Wednesday', label: t('workout.wednesday') },
  { value: 'Thursday', label: t('workout.thursday') },
  { value: 'Friday', label: t('workout.friday') },
  { value: 'Saturday', label: t('workout.saturday') },
  { value: 'Sunday', label: t('workout.sunday') },
])

// State
const showAddRoutine = ref(false)
const newRoutineTitle = ref('')
const newRoutineDay = ref('Any')
const activeRoutine = ref<Routine | null>(null)
const showLibrary = ref(false)

// API Search States
const searchQuery = ref('')
const isSearching = ref(false)
const apiExercises = ref<any[]>([])

onMounted(async () => {
  await store.fetchRoutines()
})

const handleAddRoutine = async () => {
  if (!newRoutineTitle.value.trim()) return
  await store.addRoutine(newRoutineTitle.value.trim(), newRoutineDay.value)
  newRoutineTitle.value = ''
  newRoutineDay.value = 'Any'
  showAddRoutine.value = false
}

const handleDeleteRoutine = (id: string) => {
  // <-- ÇEVİRİ EKLENDİ
  if (confirm(t('workout.deleteRoutineConfirm'))) {
    store.deleteRoutine(id)
  }
}

const openRoutine = (routine: Routine) => {
  activeRoutine.value = routine
}

const openLibrary = () => {
  showLibrary.value = true
  if (apiExercises.value.length === 0) {
    searchQuery.value = ''
  }
}

// 🌐 API FETCH FUNCTION
const searchExercises = async () => {
  if (!searchQuery.value.trim()) return

  isSearching.value = true
  try {
    const response = await fetch(`https://exercisedb.p.rapidapi.com/exercises/name/${searchQuery.value.toLowerCase()}?limit=15`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPID_API_KEY,
        'x-rapidapi-host': 'exercisedb.p.rapidapi.com'
      }
    })

    const data = await response.json()
    
    if (Array.isArray(data)) {
      apiExercises.value = data.map((ex: any) => ({
        name: ex.name,
        target: ex.target,
        imageUrl: ex.gifUrl 
      }))
    } else {
      apiExercises.value = []
    }
  } catch (error) {
    console.error('Error fetching from ExerciseDB:', error)
    alert(t('workout.apiError')) // <-- ÇEVİRİ EKLENDİ
  } finally {
    isSearching.value = false
  }
}

const addFromLibrary = (ex: any, sets: number, reps: string) => {
  if (!activeRoutine.value) return
  store.addExerciseToRoutine(activeRoutine.value.id, {
    name: ex.name,
    imageUrl: ex.imageUrl,
    sets,
    reps
  })
}

const getCompletedCount = () => {
  if (!activeRoutine.value) return 0
  return activeRoutine.value.exercises.filter(e => e.isCompleted).length
}

const getProgress = () => {
  if (!activeRoutine.value || activeRoutine.value.exercises.length === 0) return 0
  return (getCompletedCount() / activeRoutine.value.exercises.length) * 100
}
</script>

<style scoped>
.slide-fade-enter-active { transition: all 0.3s ease-out; }
.slide-fade-leave-active { transition: all 0.2s ease-in; }
.slide-fade-enter-from, .slide-fade-leave-to {
  transform: translateY(-10px); opacity: 0;
}
</style>