<template>
  <article class="workspace-card min-w-0 p-3" :class="exercise.isCompleted ? 'bg-primary/[0.04]' : 'bg-card/40 hover:bg-card/70'">
    <div class="flex items-center gap-2 sm:gap-3">
      <slot name="leading" />
      <button v-if="canWrite && showCompletion" type="button" class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40" :class="exercise.isCompleted ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary'" :aria-label="$t('workout.toggleExercise', { name: exercise.name })" :aria-pressed="exercise.isCompleted" :disabled="disabled" @click="$emit('toggle', exercise.id)"><Check v-if="exercise.isCompleted" class="h-3 w-3" /></button>
      <button type="button" class="exercise-preview group" :aria-label="$t('workout.enlargePreview', { name: exercise.name })" :title="$t('workout.enlargePreview', { name: exercise.name })" aria-haspopup="dialog" @click="$emit('preview', exercise)">
        <span class="absolute inset-0"><ExerciseImage :exercise="exercise" class="h-full w-full" /></span>
        <span class="preview-zoom" aria-hidden="true"><Expand class="h-3 w-3" /></span>
      </button>
      <div class="min-w-0 flex-1 py-1">
        <h3 class="break-words text-sm font-medium leading-5" :class="exercise.isCompleted ? 'text-muted-foreground' : 'text-foreground'">{{ exercise.name }}</h3>
        <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span class="font-medium tabular-nums">{{ exercise.sets }} × {{ exercise.reps }}</span>
          <span v-if="exercise.weightKg != null" class="tabular-nums">{{ exercise.weightKg }} kg</span>
          <span v-if="exercise.restSeconds != null" class="inline-flex items-center gap-1 tabular-nums"><Timer class="h-3 w-3" />{{ $t('workout.seconds', { count: exercise.restSeconds }) }}</span>
        </p>
        <dl v-if="exercise.tempo || exercise.alternative || exercise.notes" class="exercise-notes mt-1.5">
          <div v-if="exercise.tempo"><dt>{{ $t('workout.tempo') }}</dt><dd class="tabular-nums">{{ exercise.tempo }}</dd></div>
          <div v-if="exercise.alternative"><dt>{{ $t('workout.alternative') }}</dt><dd>{{ exercise.alternative }}</dd></div>
          <div v-if="exercise.notes" class="w-full"><dt>{{ $t('workout.notes') }}</dt><dd class="whitespace-pre-wrap">{{ exercise.notes }}</dd></div>
        </dl>
      </div>
      <div class="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row">
        <button v-if="canWrite" type="button" class="row-action" :disabled="disabled" :aria-label="$t('workout.editExercise')" :title="$t('workout.editExercise')" @click="$emit('edit', exercise)"><Pencil class="h-3.5 w-3.5" /></button>
        <button v-if="canWrite" type="button" class="row-action hover:!bg-destructive/5 hover:!text-destructive" :disabled="disabled" :aria-label="$t('common.delete')" :title="$t('common.delete')" @click="$emit('delete', exercise.id)"><Trash2 class="h-3.5 w-3.5" /></button>
      </div>
    </div>
  </article>
</template>
<script setup lang="ts">
import { Check, Expand, Pencil, Timer, Trash2 } from 'lucide-vue-next'
import { useModuleAccess } from '@/lib/workspaceScope'
import type { Exercise } from '../stores/workout'
import ExerciseImage from './ExerciseImage.vue'
withDefaults(defineProps<{ exercise: Exercise; disabled?: boolean; showCompletion?: boolean }>(), { showCompletion: true })
defineEmits<{ edit: [exercise: Exercise]; delete: [id: string]; toggle: [id: string]; preview: [exercise: Exercise] }>()
const { canWrite } = useModuleAccess('workout')
</script>
<style scoped>
.exercise-preview { position: relative; display: block; flex-shrink: 0; width: 4rem; height: 3rem; border-radius: .75rem; cursor: zoom-in; }
.preview-zoom { position: absolute; right: .125rem; bottom: .125rem; display: inline-flex; align-items: center; justify-content: center; width: 1.125rem; height: 1.125rem; border-radius: .375rem; background: hsl(var(--card) / .95); color: hsl(var(--foreground)); opacity: 0; transition: opacity 150ms; }
.exercise-preview:hover .preview-zoom, .exercise-preview:focus-visible .preview-zoom { opacity: 1; }
.exercise-notes { display: flex; flex-wrap: wrap; gap: .25rem .75rem; font-size: .6875rem; line-height: 1.6; overflow-wrap: anywhere; }
.exercise-notes > div { display: flex; min-width: 0; gap: .375rem; }
.exercise-notes dt { flex-shrink: 0; color: hsl(var(--muted-foreground)); }
.exercise-notes dd { color: hsl(var(--foreground) / .85); }
@media (min-width: 640px) { .exercise-preview { width: 5rem; height: 4rem; } }
.row-action { display: inline-flex; align-items: center; justify-content: center; height: 1.75rem; width: 1.75rem; border-radius: .5rem; color: hsl(var(--muted-foreground)); transition: background-color 150ms, color 150ms; }
.row-action:hover { background: hsl(var(--muted) / .6); color: hsl(var(--foreground)); }
.row-action:disabled { opacity: .4; }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .4); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .preview-zoom { transition: none; } }
</style>
