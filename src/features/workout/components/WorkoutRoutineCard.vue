<template>
  <div class="workspace-card group relative min-w-0 bg-card/50 hover:bg-card/80">
    <button type="button" class="flex h-full w-full min-w-0 flex-col rounded-xl p-4 text-left" :aria-label="routine.title" :title="routine.title" @click="$emit('open', routine)">
      <span class="flex min-h-7 items-center gap-1.5 pr-24 text-[11px] text-muted-foreground"><CalendarDays class="h-3 w-3 shrink-0" />{{ routine.day_of_week === 'Any' ? $t('workout.anyDay') : $t(`workout.${routine.day_of_week.toLowerCase()}`) }}</span>
      <span class="mt-2 line-clamp-2 min-h-5 text-sm font-semibold text-foreground">{{ routine.title }}</span>
      <span class="mt-3 flex h-11 items-center gap-1.5" aria-hidden="true">
        <ExerciseImage v-for="exercise in routine.exercises.slice(0, 3)" :key="exercise.id" :exercise="exercise" class="h-11 w-11" />
        <span v-if="routine.exercises.length > 3" class="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/50 text-xs text-muted-foreground">+{{ routine.exercises.length - 3 }}</span>
        <span v-if="!routine.exercises.length" class="flex h-11 w-full items-center gap-2 rounded-xl border border-dashed border-border/40 px-3 text-xs text-muted-foreground"><Dumbbell class="h-4 w-4 opacity-50" />{{ $t('workout.emptyProgram') }}</span>
      </span>
      <span class="mt-3 flex w-full items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{{ $t('workout.exercisesCount', { count: routine.exercises.length }) }}<span v-if="totalSets"> · {{ $t('workout.sets', { count: totalSets }) }}</span></span>
        <ArrowUpRight class="h-3.5 w-3.5 transition-colors group-hover:text-teal-500" />
      </span>
      <span v-if="completed" class="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-teal-500/70" :style="{ width: `${completed / routine.exercises.length * 100}%` }" /></span>
    </button>
    <div v-if="canWrite" class="absolute right-2.5 top-3 flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button type="button" class="card-action" :disabled="disabled" :title="$t('workout.editProgram')" :aria-label="$t('workout.editProgram')" @click="$emit('edit', routine)"><Pencil class="h-3.5 w-3.5" /></button>
      <button type="button" class="card-action" :disabled="disabled" :title="$t('workout.duplicateProgram')" :aria-label="$t('workout.duplicateProgram')" @click="$emit('duplicate', routine.id)"><Copy class="h-3.5 w-3.5" /></button>
      <button type="button" class="card-action hover:!bg-destructive/5 hover:!text-destructive" :disabled="disabled" :title="$t('common.delete')" :aria-label="$t('common.delete')" @click="$emit('delete', routine.id)"><Trash2 class="h-3.5 w-3.5" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModuleAccess } from '@/lib/workspaceScope'
import { computed } from 'vue'
import { ArrowUpRight, CalendarDays, Copy, Dumbbell, Pencil, Trash2 } from 'lucide-vue-next'
import type { Routine } from '@/features/workout/stores/workout'
import ExerciseImage from './ExerciseImage.vue'

const props = defineProps<{
  routine: Routine
  disabled?: boolean
}>()

defineEmits<{
  open: [routine: Routine]
  delete: [id: string]
  edit: [routine: Routine]
  duplicate: [id: string]
}>()
const { canWrite } = useModuleAccess('workout')
const totalSets = computed(() => props.routine.exercises.reduce((sum, exercise) => sum + exercise.sets, 0))
const completed = computed(() => props.routine.exercises.filter(exercise => exercise.isCompleted).length)
</script>

<style scoped>
.card-action { display: inline-flex; align-items: center; justify-content: center; height: 1.75rem; width: 1.75rem; border-radius: .5rem; color: hsl(var(--muted-foreground)); transition: color 150ms, background-color 150ms; }
.card-action:hover { background: hsl(var(--muted) / .7); color: hsl(var(--foreground)); }
.card-action:disabled { opacity: .4; cursor: default; }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .4); outline-offset: 2px; }
</style>
