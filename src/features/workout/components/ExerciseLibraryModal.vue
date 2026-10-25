<template>
  <dialog ref="dialog" class="exercise-dialog w-[calc(100%-2rem)] rounded-2xl border border-border/60 bg-card p-0 text-card-foreground shadow-2xl" :class="mode === 'library' ? 'max-w-4xl' : 'max-w-md'" aria-labelledby="workout-picker-title" @dblclick="event=>{if(isDialogBackdropDoubleClick(event))cancel(event)}" @cancel="cancel" @close="emit('close')">
    <header class="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
      <h3 id="workout-picker-title" class="text-sm font-semibold">{{ t(exercise ? 'workout.editExercise' : 'workout.addExercise') }}</h3>
      <button type="button" class="icon-button" :disabled="busy" :aria-label="t('common.close')" @click="emit('close')"><X class="h-4 w-4" /></button>
    </header>
    <div class="max-h-[80dvh] overflow-y-auto p-4">
      <div v-if="!exercise" class="mb-4 flex w-fit gap-1 rounded-xl border border-border/40 bg-muted/30 p-1" role="group" :aria-label="t('workout.exerciseSource')">
        <button v-for="tab in ['library', 'custom'] as const" :key="tab" type="button" :disabled="busy" :aria-pressed="mode === tab" class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors" :class="mode === tab ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="switchMode(tab)">{{ t(tab === 'library' ? 'workout.library' : 'workout.customExercise') }}</button>
      </div>
      <button v-else-if="mode !== 'library'" type="button" :disabled="busy" class="mb-3 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground" @click="chooseReplacement">{{ t('workout.changeExercise') }}</button>
      <div class="grid min-w-0 gap-4" :class="mode === 'library' ? 'md:grid-cols-[minmax(0,1fr)_18rem]' : ''">
        <section v-if="mode === 'library'" class="min-w-0 space-y-3">
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input ref="searchInput" v-model="query" type="search" class="field !pl-9" :aria-label="t('workout.searchExercise')" :placeholder="t('workout.searchPlaceholder')" :disabled="busy" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <CustomSelect v-model="group" :options="groupOptions" :aria-label="t('workout.muscleGroup')" :disabled="busy" size="sm" />
            <CustomSelect v-model="equipment" :options="equipmentOptions" :aria-label="t('workout.equipment')" :disabled="busy" size="sm" />
          </div>
          <p class="text-[11px] text-muted-foreground" role="status">{{ loading ? t('workout.fetching') : t('workout.libraryCount', { count: matches.length }) }}</p>
          <div v-if="catalogError" class="rounded-xl border border-border/40 p-4 text-xs text-muted-foreground"><p>{{ t('workout.libraryError') }}</p><button type="button" class="mt-2 text-foreground underline" @click="loadCatalog">{{ t('workout.retry') }}</button></div>
          <div v-else class="max-h-[42dvh] overflow-y-auto pr-1">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button v-for="item in matches.slice(0, limit)" :key="item.id" type="button" :disabled="busy" :aria-pressed="draft.catalogId === item.id" class="flex min-w-0 items-center gap-2 rounded-xl border p-2 text-left transition-colors disabled:opacity-50" :class="draft.catalogId === item.id ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/40 bg-background/30 hover:bg-muted/40'" @click="selectExercise(item)">
                <ExerciseImage :exercise="catalogInput(item)" :animated="false" class="h-14 w-14" />
                <span class="min-w-0"><span class="line-clamp-2 block text-xs font-medium leading-4">{{ item.name }}</span><span class="mt-1 block truncate text-[10px] text-muted-foreground">{{ item.primaryMuscles.map(muscle => muscleLabel(muscle)).join(', ') }}</span></span>
              </button>
            </div>
            <p v-if="!loading && !matches.length" class="py-8 text-center text-xs text-muted-foreground">{{ t('workout.noMatches') }}</p>
            <button v-if="matches.length > limit" type="button" class="mt-3 w-full rounded-xl py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40" @click="limit += 24">{{ t('workout.loadMore') }}</button>
          </div>
        </section>
        <form v-if="mode !== 'library' || draft.name" ref="exerciseForm" class="min-w-0 space-y-3" @submit.prevent="save">
          <div v-if="draft.imageUrl || draft.catalogId" class="flex items-center gap-3 rounded-xl border border-border/40 bg-background/30 p-2">
            <ExerciseImage :exercise="draft" controls class="h-24 w-24" />
            <div class="min-w-0"><p class="text-xs font-medium leading-5">{{ draft.name }}</p></div>
          </div>
          <label class="label" for="exercise-name">{{ t('workout.exerciseName') }}<input id="exercise-name" v-model="draft.name" type="text" maxlength="160" required :disabled="busy" class="field mt-1" :placeholder="t('workout.customPlaceholder')" /></label>
          <div class="grid grid-cols-2 gap-2.5">
            <label class="label" for="exercise-sets">{{ t('workout.setsLabel') }}<input id="exercise-sets" v-model.number="draft.sets" type="number" min="1" max="100" step="1" required :disabled="busy" class="field mt-1" /></label>
            <label class="label" for="exercise-reps">{{ t('workout.repsLabel') }}<input id="exercise-reps" v-model="draft.reps" type="text" maxlength="40" required :disabled="busy" class="field mt-1" :placeholder="t('workout.repsPlaceholder')" /></label>
            <label class="label" for="exercise-weight">{{ t('workout.weight') }}<input id="exercise-weight" v-model.number="draft.weightKg" type="number" min="0" max="1000" step="0.5" :disabled="busy" class="field mt-1" :placeholder="t('workout.optional')" /></label>
            <label class="label" for="exercise-rest">{{ t('workout.rest') }}<input id="exercise-rest" v-model.number="draft.restSeconds" type="number" min="0" max="3600" step="1" :disabled="busy" class="field mt-1" /></label>
          </div>
          <details class="rounded-xl border border-border/40">
            <summary class="cursor-pointer px-3 py-2 text-xs text-muted-foreground">{{ t('workout.moreFields') }}</summary>
            <div class="space-y-3 px-3 pb-3">
              <label class="label" for="exercise-tempo">{{ t('workout.tempo') }}<input id="exercise-tempo" v-model="draft.tempo" type="text" maxlength="24" :disabled="busy" class="field mt-1" placeholder="3–1–1" /></label>
              <label class="label" for="exercise-alternative">{{ t('workout.alternative') }}<input id="exercise-alternative" v-model="draft.alternative" type="text" maxlength="160" :disabled="busy" class="field mt-1" :placeholder="t('workout.alternativePlaceholder')" /></label>
              <label class="label" for="exercise-notes">{{ t('workout.notes') }}<textarea id="exercise-notes" v-model="draft.notes" rows="3" maxlength="1000" :disabled="busy" class="field mt-1 !h-auto resize-y py-2" :placeholder="t('workout.notesPlaceholder')" /></label>
              <label v-if="!draft.catalogId" class="label" for="exercise-image">{{ t('workout.imageLink') }}<input id="exercise-image" v-model="draft.imageUrl" type="url" :disabled="busy" class="field mt-1" placeholder="https://…" /></label>
            </div>
          </details>
          <p v-if="formError" role="alert" class="text-xs text-destructive">{{ t('workout.invalidExercise') }}</p>
          <button type="submit" :disabled="busy || !valid" class="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Plus v-else-if="!exercise" class="h-3.5 w-3.5" />{{ t(exercise ? 'workout.saveChanges' : 'workout.addToProgram') }}</button>
        </form>
        <div v-else class="hidden min-h-64 items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/10 px-6 text-center text-xs leading-5 text-muted-foreground md:flex">{{ t('workout.selectExercise') }}</div>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Loader2, Plus, Search, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import ExerciseImage from './ExerciseImage.vue'
import type { Exercise } from '../stores/workout'
import { catalogInput, equipmentTypes, loadExerciseCatalog, muscleGroups, normalizeExerciseInput, searchCatalog, type CatalogExercise, type ExerciseInput } from '../lib/exercises'
const props = defineProps<{ show: boolean; busy?: boolean; exercise?: Exercise | null }>()
const emit = defineEmits<{ close: []; add: [exercise: ExerciseInput]; update: [id: string, exercise: ExerciseInput, version?: number] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>(), searchInput = ref<HTMLInputElement>()
const exerciseForm = ref<HTMLFormElement>()
const mode = ref<'library' | 'custom' | 'edit'>('library'), catalog = ref<CatalogExercise[]>([]), query = ref(''), group = ref('all'), equipment = ref('all')
const loading = ref(false), catalogError = ref(false), formError = ref(false), limit = ref(24)
const blank = (): ExerciseInput => ({ name: '', sets: 3, reps: '10–12', imageUrl: '', weightKg: null, restSeconds: 90, tempo: '', alternative: '', notes: '' })
const draft = ref<ExerciseInput>(blank())
const capturedVersion = ref<number>(), capturedId = ref('')
const valid = computed(() => Boolean(draft.value.name.trim() && draft.value.reps.trim() && Number.isInteger(draft.value.sets) && draft.value.sets >= 1 && draft.value.sets <= 100))
const matches = computed(() => searchCatalog(catalog.value, query.value, group.value, equipment.value))
const groupOptions = computed(() => [{ value: 'all', label: t('workout.allMuscles') }, ...muscleGroups.map(value => ({ value, label: t('workout.groups.' + value) }))])
const equipmentOptions = computed(() => [{ value: 'all', label: t('workout.allEquipment') }, ...equipmentTypes.map(value => ({ value, label: t('workout.equipmentNames.' + value.replace(/ /g, '_').replace(/-/g, '_')) }))])
const muscleLabel = (muscle: string) => t('workout.muscles.' + muscle.replace(/ /g, '_'))
async function loadCatalog() {
  loading.value = true; catalogError.value = false
  try { catalog.value = await loadExerciseCatalog() } catch { catalogError.value = true } finally { loading.value = false }
}
watch(() => props.show, async show => {
  if (!show) { if (dialog.value?.open) dialog.value.close(); return }
  const original = props.exercise
  mode.value = original ? 'edit' : 'library'
  draft.value = original ? { ...blank(), ...original } : blank()
  capturedVersion.value = original?._version; capturedId.value = original?.id || ''
  formError.value = false
  await nextTick()
  if (!props.show) return
  if (!dialog.value?.open) dialog.value?.showModal()
  if (!original) { void loadCatalog(); searchInput.value?.focus() }
}, { immediate: true })
watch([query, group, equipment], () => { limit.value = 24 })
function switchMode(value: 'library' | 'custom') { mode.value = value; draft.value = blank(); formError.value = false }
async function selectExercise(exercise: CatalogExercise) {
  const previous = draft.value
  draft.value = { ...catalogInput(exercise), sets: previous.sets, reps: previous.reps, weightKg: previous.weightKg, restSeconds: previous.restSeconds, tempo: previous.tempo, alternative: previous.alternative, notes: previous.notes }
  formError.value = false
  await nextTick()
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) exerciseForm.value?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
async function chooseReplacement() {
  mode.value = 'library'
  await nextTick()
  void loadCatalog()
  searchInput.value?.focus()
}
function cancel(event: Event) { if (props.busy) event.preventDefault(); else emit('close') }
const optionalNumber = (value: unknown) => value == null || value === '' ? null : Number(value)
function save() {
  if (props.busy) return
  try {
    const input = normalizeExerciseInput({ ...draft.value, weightKg: optionalNumber(draft.value.weightKg), restSeconds: optionalNumber(draft.value.restSeconds) })
    if (props.exercise) emit('update', capturedId.value, input, capturedVersion.value)
    else emit('add', input)
  } catch { formError.value = true }
}
onBeforeUnmount(() => dialog.value?.close())
</script>

<style scoped>
.exercise-dialog::backdrop { background: rgb(2 6 23 / .4); backdrop-filter: blur(5px); }
.field { height: 2.25rem; width: 100%; min-width: 0; border-radius: .75rem; border: 1px solid hsl(var(--border) / .5); background: hsl(var(--background) / .5); padding-inline: .75rem; font-size: .75rem; color: hsl(var(--foreground)); outline: none; transition: border-color 150ms, background-color 150ms; }
.field:focus { border-color: hsl(var(--primary) / .4); box-shadow: 0 0 0 1px hsl(var(--primary) / .15); }
.field:disabled { opacity: .5; }
.label { display: block; font-size: .6875rem; color: hsl(var(--muted-foreground)); }
.icon-button { display: inline-flex; align-items: center; justify-content: center; height: 1.75rem; width: 1.75rem; border-radius: .5rem; color: hsl(var(--muted-foreground)); }
.icon-button:hover { background: hsl(var(--muted) / .5); }
button:focus-visible, summary:focus-visible { outline: 2px solid hsl(var(--primary) / .4); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
