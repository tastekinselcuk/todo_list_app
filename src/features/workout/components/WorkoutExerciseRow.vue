<template>
  <article class="workspace-card min-w-0 p-3" :class="[exercise.isCompleted ? 'bg-teal-500/[0.04]' : 'bg-card/40 hover:bg-card/70', { 'is-expanded': expanded }]">
    <div class="flex items-center gap-3">
      <button v-if="canWrite" type="button" class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40" :class="exercise.isCompleted ? 'border-teal-500 bg-teal-500 text-white' : 'border-muted-foreground/30 hover:border-teal-500'" :aria-label="$t('workout.toggleExercise', { name: exercise.name })" :aria-pressed="exercise.isCompleted" :disabled="disabled" @click="$emit('toggle', exercise.id)"><Check v-if="exercise.isCompleted" class="h-3 w-3" /></button>
      <ExerciseImage :exercise="exercise" class="h-14 w-14 sm:h-16 sm:w-16" />
      <button type="button" class="min-w-0 flex-1 rounded-lg py-1 text-left" :aria-expanded="expanded" :aria-label="$t('workout.exerciseDetails', { name: exercise.name })" @click="expanded = !expanded">
        <span class="block text-sm font-medium leading-5" :class="exercise.isCompleted ? 'text-muted-foreground' : 'text-foreground'">{{ exercise.name }}</span>
        <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span class="font-medium tabular-nums">{{ exercise.sets }} × {{ exercise.reps }}</span>
          <span v-if="exercise.weightKg != null">{{ exercise.weightKg }} kg</span>
          <span v-if="exercise.restSeconds != null" class="inline-flex items-center gap-1"><Timer class="h-3 w-3" />{{ $t('workout.seconds', { count: exercise.restSeconds }) }}</span>
        </span>
      </button>
      <div class="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row">
        <button v-if="canWrite" type="button" class="row-action" :disabled="disabled" :aria-label="$t('workout.editExercise')" :title="$t('workout.editExercise')" @click="$emit('edit', exercise)"><Pencil class="h-3.5 w-3.5" /></button>
        <button v-if="canWrite" type="button" class="row-action hover:!bg-destructive/5 hover:!text-destructive" :disabled="disabled" :aria-label="$t('common.delete')" :title="$t('common.delete')" @click="$emit('delete', exercise.id)"><Trash2 class="h-3.5 w-3.5" /></button>
        <button type="button" class="row-action hidden sm:inline-flex" :aria-expanded="expanded" :aria-label="$t('workout.exerciseDetails', { name: exercise.name })" @click="expanded = !expanded"><ChevronDown class="h-3.5 w-3.5 transition-transform" :class="{ 'rotate-180': expanded }" /></button>
      </div>
    </div>
    <div v-if="expanded" class="mt-3 grid gap-3 border-t border-border/40 pt-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <div class="space-y-1.5">
        <ExerciseImage :exercise="exercise" :pose="pose" class="h-28 w-full" />
        <div v-if="exercise.catalogId || (exercise.images?.length || 0) > 1" class="flex justify-center gap-1" role="group" :aria-label="$t('workout.imagePose')"><button v-for="index in [0, 1]" :key="index" type="button" class="rounded-md px-2 py-0.5 text-[10px]" :class="pose === index ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'" :aria-pressed="pose === index" @click="pose = index">{{ $t(index === 0 ? 'workout.poseStart' : 'workout.poseEnd') }}</button></div>
      </div>
      <dl class="space-y-2 text-xs leading-5">
        <div v-if="exercise.tempo"><dt class="text-muted-foreground">{{ $t('workout.tempo') }}</dt><dd>{{ exercise.tempo }}</dd></div>
        <div v-if="exercise.alternative"><dt class="text-muted-foreground">{{ $t('workout.alternative') }}</dt><dd>{{ exercise.alternative }}</dd></div>
        <div v-if="exercise.notes"><dt class="text-muted-foreground">{{ $t('workout.notes') }}</dt><dd class="whitespace-pre-wrap break-words">{{ exercise.notes }}</dd></div>
        <p v-if="!exercise.tempo && !exercise.alternative && !exercise.notes" class="text-muted-foreground">{{ $t('workout.noExerciseNotes') }}</p>
      </dl>
    </div>
  </article>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { Check, ChevronDown, Pencil, Timer, Trash2 } from 'lucide-vue-next'
import { useModuleAccess } from '@/lib/workspaceScope'
import type { Exercise } from '../stores/workout'
import ExerciseImage from './ExerciseImage.vue'
defineProps<{ exercise: Exercise; disabled?: boolean }>()
defineEmits<{ edit: [exercise: Exercise]; delete: [id: string]; toggle: [id: string] }>()
const { canWrite } = useModuleAccess('workout')
const expanded = ref(false), pose = ref(0)
</script>
<style scoped>
.row-action { display: inline-flex; align-items: center; justify-content: center; height: 1.75rem; width: 1.75rem; border-radius: .5rem; color: hsl(var(--muted-foreground)); transition: background-color 150ms, color 150ms; }
.row-action:hover { background: hsl(var(--muted) / .6); color: hsl(var(--foreground)); }
.row-action:disabled { opacity: .4; }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .4); outline-offset: 2px; }
</style>
