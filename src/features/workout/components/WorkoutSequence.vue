<template>
  <section ref="root" :aria-label="t('workout.sequence')">
    <p :id="hintId" class="sr-only">{{ t('workout.reorderHint') }}</p>
    <draggable v-model="ordered" tag="ol" item-key="id" class="exercise-path" handle=".exercise-drag-handle"
      :disabled="locked || !canWrite" :animation="reducedMotion ? 0 : 180" :delay="150" :delay-on-touch-only="true"
      :touch-start-threshold="5" :force-fallback="true" :fallback-on-body="true" :fallback-tolerance="5"
      ghost-class="exercise-ghost" fallback-class="exercise-dragging" :aria-busy="saving" @start="startDrag" @end="finishDrag">
      <template #item="{ element, index }">
        <li class="exercise-step" :class="{ 'step-complete': element.isCompleted, 'step-current': element.id === nextId }" :aria-current="element.id === nextId ? 'step' : undefined">
          <button v-if="canWrite" type="button" class="step-marker" :disabled="locked" :aria-label="t('workout.toggleExercise', { name: element.name })" :aria-pressed="element.isCompleted" @click="emit('toggle', element.id)">
            <Check v-if="element.isCompleted" class="h-3.5 w-3.5" /><span v-else>{{ index + 1 }}</span>
          </button>
          <span v-else class="step-marker"><Check v-if="element.isCompleted" class="h-3.5 w-3.5" /><span v-else>{{ index + 1 }}</span></span>
          <WorkoutExerciseRow :exercise="element" :show-completion="false" :disabled="locked" class="min-w-0 flex-1"
            :data-search-record="routine.id" :data-search-child="element.id" @edit="emit('edit', $event)" @delete="emit('delete', $event)" @preview="emit('preview', $event)">
            <template v-if="canWrite && ordered.length > 1" #leading>
              <button type="button" class="exercise-drag-handle" :disabled="locked" :data-workout-handle="element.id"
                :title="t('workout.reorderHint')" :aria-label="t('workout.reorderExercise', { name: element.name, position: index + 1, total: ordered.length })"
                :aria-describedby="hintId" aria-keyshortcuts="ArrowUp ArrowDown"
                @keydown.up.prevent="move(element.id, -1)" @keydown.down.prevent="move(element.id, 1)"><GripVertical class="h-4 w-4" /></button>
            </template>
          </WorkoutExerciseRow>
        </li>
      </template>
    </draggable>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, GripVertical } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import { useI18n } from 'vue-i18n'
import { useModuleAccess } from '@/lib/workspaceScope'
import type { Exercise, Routine } from '../stores/workout'
import WorkoutExerciseRow from './WorkoutExerciseRow.vue'

const props = defineProps<{ routine: Routine; disabled?: boolean; saveOrder: (routineId: string, ids: string[], version?: number) => Promise<boolean> }>()
const emit = defineEmits<{ edit: [exercise: Exercise]; delete: [id: string]; toggle: [id: string]; preview: [exercise: Exercise] }>()
const { t } = useI18n(), { canWrite } = useModuleAccess('workout')
const root = ref<HTMLElement>(), ordered = ref<Exercise[]>([...props.routine.exercises])
const dragging = ref(false), saving = ref(false), reducedMotion = ref(false), announcement = ref('')
const hintId = `workout-sequence-${props.routine.id}`
const locked = computed(() => Boolean(props.disabled || saving.value))
const nextId = computed(() => ordered.value.find(exercise => !exercise.isCompleted)?.id)
let dragContext: { id: string; version?: number; ids: string[] } | undefined
const sync = () => { ordered.value = [...props.routine.exercises] }
watch(() => [props.routine.id, props.routine.exercises, props.routine.version], () => { if (!dragging.value && !saving.value) sync() })

function startDrag() {
  dragging.value = true
  dragContext = { id: props.routine.id, version: props.routine.version, ids: ordered.value.map(exercise => exercise.id) }
}
async function persist(id: string, ids: string[], version?: number) {
  if (locked.value || !canWrite.value) { sync(); return }
  saving.value = true
  try {
    const saved = await props.saveOrder(id, ids, version)
    announcement.value = t(saved ? 'workout.orderSaved' : 'workout.orderFailed')
  } finally { saving.value = false; sync() }
}
async function finishDrag() {
  const context = dragContext
  dragContext = undefined
  await nextTick()
  dragging.value = false
  const ids = ordered.value.map(exercise => exercise.id)
  if (!context || context.id !== props.routine.id || ids.every((id, index) => context.ids[index] === id)) { sync(); return }
  await persist(context.id, ids, context.version)
}
async function move(id: string, direction: number) {
  if (locked.value || dragging.value || !canWrite.value) return
  const index = ordered.value.findIndex(exercise => exercise.id === id), destination = index + direction
  if (index < 0 || destination < 0 || destination >= ordered.value.length) return
  const ids = ordered.value.map(exercise => exercise.id)
  ids.splice(destination, 0, ids.splice(index, 1)[0])
  await persist(props.routine.id, ids, props.routine.version)
  await nextTick()
  Array.from(root.value?.querySelectorAll<HTMLButtonElement>('[data-workout-handle]') || []).find(button => button.dataset.workoutHandle === id)?.focus()
}
let motion: MediaQueryList | undefined
function updateMotion() { reducedMotion.value = Boolean(motion?.matches) }
onMounted(() => { motion = window.matchMedia('(prefers-reduced-motion: reduce)'); updateMotion(); motion.addEventListener('change', updateMotion) })
onBeforeUnmount(() => motion?.removeEventListener('change', updateMotion))
</script>

<style scoped>
.exercise-path { display: flex; flex-direction: column; gap: .75rem; list-style: none; padding: 0; margin: 0; }
.exercise-step { position: relative; display: flex; align-items: flex-start; gap: .75rem; }
.exercise-step:not(:last-child)::after { content: ''; position: absolute; z-index: 0; left: 13px; top: 55px; bottom: -38px; width: 1px; background: hsl(var(--border) / .7); }
.step-marker { position: relative; z-index: 1; display: flex; flex: 0 0 28px; align-items: center; justify-content: center; width: 28px; height: 28px; margin-top: 26px; border: 1px solid hsl(var(--border) / .8); border-radius: 50%; background: hsl(var(--card)); color: hsl(var(--muted-foreground)); font-size: .6875rem; font-weight: 500; font-variant-numeric: tabular-nums; transition: color 180ms, background-color 180ms, border-color 180ms; }
.step-current .step-marker { border-color: hsl(var(--primary)); background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.step-complete .step-marker { border-color: hsl(var(--primary) / .25); background: hsl(var(--secondary)); color: hsl(var(--primary)); }
.step-complete:not(:last-child)::after { background: hsl(var(--primary) / .25); }
.exercise-drag-handle { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 1.25rem; height: 2.25rem; margin-inline: -.25rem; border-radius: .375rem; color: hsl(var(--muted-foreground) / .45); cursor: grab; touch-action: none; }
.exercise-drag-handle:hover { color: hsl(var(--foreground)); background: hsl(var(--muted) / .6); }
.exercise-drag-handle:active { cursor: grabbing; }
.exercise-ghost { opacity: .3; }
.exercise-dragging { opacity: .95; filter: drop-shadow(0 8px 14px rgb(0 0 0 / .12)); }
.exercise-dragging::after { display: none; }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .5); outline-offset: 3px; }
@media (min-width: 640px) { .step-marker { margin-top: 30px; } .exercise-step:not(:last-child)::after { top: 59px; bottom: -42px; } }
@media (prefers-reduced-motion: reduce) { .step-marker { transition: none; } }
</style>
