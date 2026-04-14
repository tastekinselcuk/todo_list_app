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
        <WorkoutRoutineCard
          v-for="routine in store.routines"
          :key="routine.id"
          :routine="routine"
          @open="openRoutine"
          @delete="handleDeleteRoutine"
        />
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

      <button @click="showLibrary = true" class="w-full py-4 border-2 border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-teal-500/50 hover:bg-teal-500/5 transition-all flex items-center justify-center gap-2">
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

    <ExerciseLibraryModal 
      :show="showLibrary" 
      @close="showLibrary = false" 
      @add="handleAddFromLibrary" 
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Dumbbell, Plus, X, Trash2, ArrowLeft, CheckCircle2, Layers, RotateCcw, Search } from 'lucide-vue-next'
import { useWorkoutStore, type Routine } from '@/features/workout/stores/workout'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

import CustomSelect from '@/components/ui/CustomSelect.vue'
import WorkoutRoutineCard from './WorkoutRoutineCard.vue'
import ExerciseLibraryModal from './ExerciseLibraryModal.vue'

const store = useWorkoutStore()
const uiStore = useUIStore()
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

const showAddRoutine = ref(false)
const newRoutineTitle = ref('')
const newRoutineDay = ref('Any')
const activeRoutine = ref<Routine | null>(null)
const showLibrary = ref(false)

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

const handleDeleteRoutine = async (id: string) => {
  const isConfirmed = await uiStore.showConfirm(
    t('common.delete') || 'Delete',
    t('workout.deleteRoutineConfirm'),
    t('common.delete') || 'Delete',
    t('common.cancel') || 'Cancel'
  )
  if (isConfirmed) {
    store.deleteRoutine(id)
    uiStore.addToast(t('common.success') || 'Success', 'info')
  }
}

const openRoutine = (routine: Routine) => {
  activeRoutine.value = routine
}

const handleAddFromLibrary = (ex: any, sets: number, reps: string) => {
  if (!activeRoutine.value) return
  store.addExerciseToRoutine(activeRoutine.value.id, {
    name: ex.name,
    imageUrl: ex.imageUrl,
    sets,
    reps
  })
  uiStore.addToast((t('common.success') || 'Success') + ': ' + ex.name, 'success')
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