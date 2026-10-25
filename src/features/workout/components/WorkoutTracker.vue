<template>
  <div class="workout-view w-full min-w-0 space-y-4">
    <template v-if="!activeRoutine">
      <div class="workspace-toolbar space-y-4">
        <form v-if="canWrite" class="flex flex-wrap items-center gap-2.5" @submit.prevent="createProgram">
          <input v-model="newRoutineTitle" type="text" maxlength="120" required :disabled="store.isSaving || store.isLoading" :aria-label="t('workout.programName')" :placeholder="t('workout.routinePlaceholder')" class="workout-input h-10 min-w-40 flex-1" />
          <CustomSelect v-model="newRoutineDay" :options="dayOptions" :disabled="store.isSaving || store.isLoading" :aria-label="t('workout.programDay')" class="w-36 shrink-0" />
          <button type="submit" :disabled="store.isSaving || store.isLoading || !newRoutineTitle.trim()" class="primary-button h-10"><Plus class="h-3.5 w-3.5" />{{ t('workout.newRoutine') }}</button>
        </form>
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div class="flex items-center gap-2"><h2 class="text-xs font-semibold">{{ t('workout.programs') }}</h2><span class="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{{ store.routines.length }}</span></div>
        </div>
      </div>

      <div v-if="loadFailed" role="alert" class="rounded-2xl border border-border/50 p-5 text-center text-xs text-muted-foreground"><p>{{ t('workout.loadFailed') }}</p><button type="button" class="mt-2 text-foreground underline" @click="loadPrograms">{{ t('workout.retry') }}</button></div>
      <div v-else-if="store.isLoading && !store.routines.length" class="flex justify-center py-10" role="status" :aria-label="t('app.loading')"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /></div>
      <div v-else-if="filtered.length" class="workspace-card-grid">
        <WorkoutRoutineCard v-for="routine in filtered" :key="routine.id" :routine="routine" :data-search-record="routine.id" :disabled="store.isSaving" @open="activeId = $event.id" @edit="editProgram" @duplicate="duplicateProgram" @delete="deleteProgram" />
      </div>
      <div v-else class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-muted/[0.04] px-5 py-10 text-center">
        <Dumbbell class="mb-3 h-6 w-6 text-muted-foreground/40" />
        <p class="text-xs font-medium text-muted-foreground">{{ t(store.routines.length ? 'workout.noProgramMatches' : 'workout.noPrograms') }}</p>
        <p v-if="!store.routines.length && canWrite" class="mt-1.5 text-[11px] text-muted-foreground/70">{{ t('workout.createHint') }}</p>
      </div>
    </template>

    <template v-else>
      <div class="workspace-toolbar space-y-4">
        <header :data-search-record="activeRoutine.id" class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <button type="button" class="icon-button shrink-0" :aria-label="t('workout.back')" :title="t('workout.back')" @click="activeId = ''"><ArrowLeft class="h-4 w-4" /></button>
            <div class="min-w-0"><h2 class="break-words text-sm font-semibold">{{ activeRoutine.title }}</h2><p class="mt-0.5 text-[11px] text-muted-foreground">{{ dayLabel(activeRoutine.day_of_week) }} · {{ t('workout.exercisesCount', { count: activeRoutine.exercises.length }) }}</p></div>
          </div>
          <div v-if="canWrite" class="flex shrink-0 items-center gap-1">
            <button type="button" class="icon-button" :disabled="store.isSaving" :aria-label="t('workout.editProgram')" :title="t('workout.editProgram')" @click="editProgram(activeRoutine)"><Pencil class="h-3.5 w-3.5" /></button>
            <button type="button" class="icon-button" :disabled="store.isSaving" :aria-label="t('workout.duplicateProgram')" :title="t('workout.duplicateProgram')" @click="duplicateProgram(activeRoutine.id)"><Copy class="h-3.5 w-3.5" /></button>
            <button type="button" class="icon-button hover:!bg-destructive/5 hover:!text-destructive" :disabled="store.isSaving" :aria-label="t('common.delete')" :title="t('common.delete')" @click="deleteProgram(activeRoutine.id)"><Trash2 class="h-3.5 w-3.5" /></button>
            <button type="button" class="primary-button ml-2 h-9" :disabled="store.isSaving" @click="editedExercise = null; showLibrary = true"><Plus class="h-3.5 w-3.5" />{{ t('workout.addExercise') }}</button>
          </div>
        </header>
        <div v-if="activeRoutine.exercises.length" class="space-y-2">
          <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span class="tabular-nums">{{ t('workout.completedCount', { completed, total: activeRoutine.exercises.length }) }}</span><button v-if="canWrite && completed" type="button" :disabled="store.isSaving" class="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/50 hover:text-foreground" @click="resetProgram"><RotateCcw class="h-3 w-3" />{{ t('workout.resetRoutine') }}</button></div>
          <div class="h-0.5 overflow-hidden rounded-full bg-border/40"><div class="h-full rounded-full bg-primary/70 transition-[width] duration-300 motion-reduce:transition-none" :style="{ width: progress + '%' }" /></div>
        </div>
      </div>

      <WorkoutSequence v-if="activeRoutine.exercises.length" :key="activeRoutine.id" :routine="activeRoutine" :disabled="store.isSaving" :save-order="saveSequence" @edit="editExercise" @delete="deleteExercise" @toggle="toggleExercise" @preview="previewExercise = $event" />
      <div v-else class="flex flex-col items-center rounded-2xl border border-dashed border-border/40 px-5 py-10 text-center">
        <Dumbbell class="mb-3 h-6 w-6 text-muted-foreground/40" /><p class="text-xs text-muted-foreground">{{ t('workout.emptyProgram') }}</p>
        <button v-if="canWrite" type="button" class="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5" @click="editedExercise = null; showLibrary = true"><Plus class="h-3.5 w-3.5" />{{ t('workout.firstExercise') }}</button>
      </div>
      <p v-if="progress === 100 && activeRoutine.exercises.length" role="status" class="flex items-center gap-2 text-xs text-primary"><CheckCircle2 class="h-4 w-4" />{{ t('workout.workoutComplete') }}</p>
    </template>

    <ExerciseLibraryModal :show="showLibrary && canWrite" :busy="store.isSaving" :exercise="editedExercise" @close="showLibrary = false" @add="addExercise" @update="updateExercise" />
    <ExercisePreview v-if="previewExercise" :exercise="previewExercise" @close="previewExercise = null" />
    <dialog ref="programDialog" class="program-dialog w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-2xl" aria-labelledby="workout-edit-title" @dblclick="event=>{if(!store.isSaving && isDialogBackdropDoubleClick(event))programDialog?.close()}" @cancel="cancelProgramEdit">
      <form v-if="editingProgram" class="space-y-4" @submit.prevent="saveProgram">
        <header class="flex items-center justify-between gap-3"><h3 id="workout-edit-title" class="text-sm font-semibold">{{ t('workout.editProgram') }}</h3><button type="button" :disabled="store.isSaving" class="icon-button" :aria-label="t('common.close')" @click="programDialog?.close()"><X class="h-4 w-4" /></button></header>
        <label class="block text-xs text-muted-foreground" for="workout-program-title">{{ t('workout.programName') }}<input id="workout-program-title" v-model="editingTitle" type="text" maxlength="120" required class="workout-input mt-1.5 h-10 w-full" :disabled="store.isSaving" /></label>
        <label class="block text-xs text-muted-foreground">{{ t('workout.programDay') }}<CustomSelect v-model="editingDay" :options="dayOptions" :aria-label="t('workout.programDay')" :disabled="store.isSaving" class="mt-1.5" /></label>
        <div class="flex justify-end gap-2"><button type="button" class="h-9 rounded-xl px-3 text-xs text-muted-foreground hover:bg-muted/50" :disabled="store.isSaving" @click="programDialog?.close()">{{ t('common.cancel') }}</button><button type="submit" class="primary-button h-9" :disabled="store.isSaving || !editingTitle.trim()">{{ t('workout.saveChanges') }}</button></div>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { useModuleLoad } from '@/lib/workspaceScope'
import { useSearchReveal } from '@/lib/searchNavigation'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, CheckCircle2, Copy, Dumbbell, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useModuleAccess, useWorkspaceDraft } from '@/lib/workspaceScope'
import { useUIStore } from '@/stores/ui'
import { useWorkoutStore, type Exercise, type Routine } from '../stores/workout'
import { fold, type ExerciseInput } from '../lib/exercises'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import WorkoutRoutineCard from './WorkoutRoutineCard.vue'
import WorkoutSequence from './WorkoutSequence.vue'
import ExerciseLibraryModal from './ExerciseLibraryModal.vue'
import ExercisePreview from './ExercisePreview.vue'

const store = useWorkoutStore(), ui = useUIStore(), { t } = useI18n()
const { canWrite } = useModuleAccess('workout')
const days = ['Any', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const dayLabel = (day: string) => t(day === 'Any' ? 'workout.anyDay' : 'workout.' + day.toLowerCase())
const dayOptions = computed(() => days.map(value => ({ value, label: dayLabel(value) })))
const newRoutineTitle = useWorkspaceDraft('routine-title', ''), newRoutineDay = useWorkspaceDraft('routine-day', 'Any')
const activeId = useWorkspaceDraft('workout-active-routine', ''), query = ref('')
const activeRoutine = computed(() => store.routines.find(routine => routine.id === activeId.value))
const filtered = computed(() => store.routines.filter(routine => fold(routine.title).includes(fold(query.value))))
const completed = computed(() => activeRoutine.value?.exercises.filter(exercise => exercise.isCompleted).length || 0)
const progress = computed(() => activeRoutine.value?.exercises.length ? Math.round(completed.value / activeRoutine.value.exercises.length * 100) : 0)
const showLibrary = ref(false), editedExercise = ref<Exercise | null>(null), loadFailed = ref(false)
const previewExercise = ref<Exercise | null>(null)
const programDialog = ref<HTMLDialogElement>(), editingProgram = ref<Routine | null>(null), editingTitle = ref(''), editingDay = ref('Any')
const failed = () => ui.addToast(t('sharing.errors.SAVE_FAILED'), 'error')

async function loadPrograms() { loadFailed.value = !await store.fetchRoutines() }
useModuleLoad(loadPrograms)
watch(() => [store.routines, store.isLoading], () => { if (!store.isLoading && activeId.value && !activeRoutine.value) { activeId.value = ''; showLibrary.value = false } })
watch(canWrite, writable => { if (!writable) { showLibrary.value = false; programDialog.value?.close() } })
watch(activeId, () => { previewExercise.value = null })
async function createProgram() {
  if (!canWrite.value || store.isSaving || store.isLoading || !newRoutineTitle.value.trim()) return
  const title = newRoutineTitle.value
  const saved = await store.addRoutine(title, newRoutineDay.value)
  if (!saved) { failed(); return }
  if (newRoutineTitle.value === title) newRoutineTitle.value = ''
  activeId.value = saved.id
  editedExercise.value = null; showLibrary.value = true
}
async function editProgram(routine: Routine) {
  if (!canWrite.value || store.isSaving) return
  editingProgram.value = { ...routine }
  editingTitle.value = routine.title; editingDay.value = routine.day_of_week
  await nextTick()
  programDialog.value?.showModal()
}
async function saveProgram() {
  const routine = editingProgram.value
  if (!routine || !canWrite.value || store.isSaving) return
  if (!await store.updateRoutine(routine.id, editingTitle.value, editingDay.value, routine.version)) { failed(); return }
  programDialog.value?.close()
}
function cancelProgramEdit(event: Event) { if (store.isSaving) event.preventDefault() }
async function duplicateProgram(id: string) {
  if (!canWrite.value || store.isSaving) return
  const routine = store.routines.find(item => item.id === id)
  if (!routine) return
  const result = await store.duplicateRoutine(id, routine.title + ' (' + t('workout.copySuffix') + ')')
  if (!result) { failed(); return }
  activeId.value = result.id
  ui.addToast(t('workout.programCopied'), 'success')
}
async function deleteProgram(id: string) {
  if (!canWrite.value || store.isSaving) return
  if (!await store.deleteRoutine(id)) { failed(); return }
  if (activeId.value === id) activeId.value = ''
}
function editExercise(exercise: Exercise) {
  if (!canWrite.value || store.isSaving) return
  editedExercise.value = { ...exercise }; showLibrary.value = true
}
async function addExercise(input: ExerciseInput) {
  const routine = activeRoutine.value
  if (!routine || !canWrite.value || store.isSaving) return
  if (!await store.addExerciseToRoutine(routine.id, input)) { failed(); return }
  showLibrary.value = false
}
async function updateExercise(id: string, input: ExerciseInput, version?: number) {
  const routine = activeRoutine.value
  if (!routine || !canWrite.value || store.isSaving) return
  if (!await store.updateExercise(routine.id, id, input, version)) { failed(); return }
  showLibrary.value = false
}
async function deleteExercise(id: string) {
  const routine = activeRoutine.value
  if (!routine || !canWrite.value || store.isSaving) return
  if (!await store.deleteExercise(routine.id, id)) failed()
}
async function toggleExercise(id: string) {
  const routine = activeRoutine.value
  if (!routine || !canWrite.value || store.isSaving) return
  if (!await store.toggleExerciseCompletion(routine.id, id)) failed()
}
async function resetProgram() {
  const routine = activeRoutine.value
  if (!routine || !canWrite.value || store.isSaving) return
  if (!await store.resetRoutine(routine.id)) failed()
}
async function saveSequence(id: string, ids: string[], version?: number) {
  if (!canWrite.value || store.isSaving) return false
  const saved = await store.reorderExercises(id, ids, version)
  if (!saved) { failed(); await loadPrograms() }
  return Boolean(saved)
}
onBeforeUnmount(() => programDialog.value?.close())
useSearchReveal('workout', async (hit, isCurrent) => { await store.fetchRoutines(hit.record_id);if(!isCurrent())return;activeId.value=hit.record_id;query.value='' })
</script>

<style scoped>
.workout-input { border-radius: .75rem; border: 1px solid hsl(var(--border) / .5); background: hsl(var(--background) / .5); padding-inline: 1rem; font-size: .875rem; color: hsl(var(--foreground)); outline: none; box-shadow: 0 1px 2px rgb(0 0 0 / .03); transition: border-color 150ms, background-color 150ms; }
.workout-input::placeholder { color: hsl(var(--muted-foreground) / .6); }
.workout-input:focus { border-color: hsl(var(--primary) / .4); box-shadow: 0 0 0 1px hsl(var(--primary) / .2); background: hsl(var(--background)); }
.primary-button { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; gap: .375rem; border-radius: .75rem; padding-inline: 1rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-size: .75rem; font-weight: 600; transition: background-color 150ms; }
.primary-button:hover { background: hsl(var(--primary) / .9); }
.icon-button { display: inline-flex; align-items: center; justify-content: center; height: 1.875rem; width: 1.875rem; border-radius: .625rem; color: hsl(var(--muted-foreground)); transition: background-color 150ms, color 150ms; }
.icon-button:hover { background: hsl(var(--muted) / .5); color: hsl(var(--foreground)); }
.workout-view button:disabled { cursor: default; opacity: .4; }
.workout-view button:focus-visible { outline: 2px solid hsl(var(--primary) / .4); outline-offset: 2px; }
.program-dialog::backdrop { background: rgb(2 6 23 / .4); backdrop-filter: blur(5px); }
@media (prefers-reduced-motion: reduce) { .workout-view *, .workout-view *::before, .workout-view *::after { transition: none !important; } }
</style>
