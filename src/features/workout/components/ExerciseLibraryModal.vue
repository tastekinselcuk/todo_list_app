<template>
  <dialog ref="dialog" class="exercise-dialog rounded-2xl border border-border/60 bg-card p-0 text-card-foreground shadow-2xl" :class="{ 'is-library': mode !== 'edit', 'is-custom': mode === 'custom', 'has-selection': hasSelection }" aria-labelledby="workout-picker-title" @dblclick="event=>{if(isDialogBackdropDoubleClick(event))cancel(event)}" @cancel="cancel" @close="emit('close')">
    <header class="dialog-header flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3">
      <h3 id="workout-picker-title" class="text-sm font-semibold">{{ t(exercise ? 'workout.editExercise' : 'workout.addExercise') }}</h3>
      <button type="button" class="icon-button" :disabled="locked" :aria-label="t('common.close')" @click="emit('close')"><X class="h-4 w-4" /></button>
    </header>
    <div class="dialog-content">
      <div v-if="!exercise" class="source-tabs flex w-fit gap-1 rounded-xl border border-border/40 bg-muted/30 p-1" role="group" :aria-label="t('workout.exerciseSource')">
        <button v-for="tab in ['library', 'custom'] as const" :key="tab" type="button" :disabled="locked" :aria-pressed="mode === tab" class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors" :class="mode === tab ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="switchMode(tab)">{{ t(tab === 'library' ? 'workout.library' : 'workout.customExercise') }}</button>
      </div>
      <button v-else-if="mode !== 'library'" type="button" :disabled="busy" class="self-start rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground" @click="chooseReplacement">{{ t('workout.changeExercise') }}</button>
      <div class="library-layout">
        <section v-if="mode === 'library'" class="library-browser" :aria-label="t('workout.library')">
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input ref="searchInput" v-model="query" type="search" class="field !pl-9" :aria-label="t('workout.searchExercise')" :placeholder="t('workout.searchPlaceholder')" :disabled="busy" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <CustomSelect v-model="group" :options="groupOptions" :aria-label="t('workout.muscleGroup')" :disabled="busy" size="sm" />
            <CustomSelect v-model="equipment" :options="equipmentOptions" :aria-label="t('workout.equipment')" :disabled="busy" size="sm" />
          </div>
          <div class="flex min-h-7 items-center justify-between gap-2">
            <p class="text-[11px] text-muted-foreground" role="status">{{ loading || customLoading ? t('workout.fetching') : t('workout.libraryCount', { count: matches.length }) }}</p>
            <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-muted-foreground/35 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-muted-foreground/55 hover:bg-muted/40 hover:text-foreground disabled:cursor-default disabled:text-muted-foreground/50" :disabled="busy || !hasFilters" @click="resetFilters"><RotateCcw class="h-3 w-3" />{{ t('workout.resetFilters') }}</button>
          </div>
          <div v-if="customError" role="alert" class="flex items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2 text-[11px] text-muted-foreground"><span>{{ t('workout.customLoadFailed') }}</span><button type="button" class="shrink-0 underline" :disabled="customLoading" @click="emit('reload-custom')">{{ t('workout.retry') }}</button></div>
          <div v-if="catalogError" class="rounded-xl border border-border/40 p-4 text-xs text-muted-foreground"><p>{{ t('workout.libraryError') }}</p><button type="button" class="mt-2 text-foreground underline" @click="loadCatalog">{{ t('workout.retry') }}</button></div>
          <div ref="results" class="catalog-results">
            <div class="catalog-grid">
              <button v-for="item in matches.slice(0, limit)" :key="item.id" type="button" :disabled="busy" :aria-pressed="draft.catalogId === item.id && detailsOpen" :aria-expanded="draft.catalogId === item.id && detailsOpen" class="catalog-card" @click="selectExercise(item)">
                <span class="catalog-media"><ExerciseImage :exercise="catalogInput(item)" class="catalog-image" /><span v-if="draft.catalogId === item.id && detailsOpen" class="selection-mark" aria-hidden="true"><Check class="h-3 w-3" /></span></span>
                <span class="catalog-caption"><span class="catalog-name">{{ item.name }}</span><span class="catalog-muscles">{{ item.source === 'custom' ? t('workout.groups.' + item.group) : item.primaryMuscles.map(muscle => muscleLabel(muscle)).join(', ') }}</span></span>
              </button>
            </div>
            <p v-if="!loading && !customLoading && !catalogError && !matches.length" class="py-8 text-center text-xs text-muted-foreground">{{ t('workout.noMatches') }}</p>
            <button v-if="matches.length > limit" type="button" class="mt-3 w-full rounded-xl py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40" @click="limit += 24">{{ t('workout.loadMore') }}</button>
          </div>
        </section>
        <section v-if="mode === 'custom'" class="custom-preview-pane" :aria-label="t('workout.customPreview')">
          <article class="custom-preview-card">
            <div class="custom-preview-media"><ExerciseImage v-if="customPreview.imageUrl" :exercise="customPreview" class="custom-preview-image" /><div v-else class="custom-preview-empty"><ImagePlus :size="30" :stroke-width="1.25" /><p>{{ t('workout.imageLinkHint') }}</p></div></div>
            <div class="custom-preview-caption"><h4>{{ customDraft.name.trim() || t('workout.customPlaceholder') }}</h4><p v-if="customDraft.group || customDraft.equipment"><span v-if="customDraft.group">{{ t('workout.groups.' + customDraft.group) }}</span><span v-if="customDraft.group && customDraft.equipment" aria-hidden="true"> · </span><span v-if="customDraft.equipment">{{ equipmentLabel(customDraft.equipment) }}</span></p></div>
          </article>
        </section>
        <form v-if="mode === 'custom'" class="exercise-editor custom-editor space-y-4" :aria-busy="customSaving" @submit.prevent="saveCustom">
          <label class="label" for="custom-exercise-name">{{ t('workout.exerciseName') }}<input id="custom-exercise-name" v-model="customDraft.name" type="text" maxlength="160" required :disabled="locked" class="field mt-1" :placeholder="t('workout.customPlaceholder')" /></label>
          <label class="label" for="custom-exercise-image">{{ t('workout.customImageLink') }}<input id="custom-exercise-image" v-model="customDraft.imageUrl" type="url" maxlength="2048" required :disabled="locked" class="field mt-1" placeholder="https://…" /><span class="mt-1.5 block leading-5 text-muted-foreground/75">{{ t('workout.imageLinkHint') }}</span></label>
          <label class="label">{{ t('workout.muscleGroup') }}<CustomSelect v-model="customDraft.group" :options="customGroupOptions" :aria-label="t('workout.muscleGroup')" :disabled="locked" size="sm" class="mt-1.5" popover /></label>
          <label class="label">{{ t('workout.equipment') }}<CustomSelect v-model="customDraft.equipment" :options="customEquipmentOptions" :aria-label="t('workout.equipment')" :disabled="locked" size="sm" class="mt-1.5" popover /></label>
          <div class="grid grid-cols-2 gap-2.5">
            <label class="label" for="custom-exercise-sets">{{ t('workout.setsLabel') }}<input id="custom-exercise-sets" v-model.number="draft.sets" type="number" min="1" max="100" step="1" required :disabled="locked" class="field mt-1" /></label>
            <label class="label" for="custom-exercise-reps">{{ t('workout.repsLabel') }}<input id="custom-exercise-reps" v-model="draft.reps" type="text" maxlength="40" required :disabled="locked" class="field mt-1" /></label>
            <label class="label" for="custom-exercise-weight">{{ t('workout.weight') }}<input id="custom-exercise-weight" v-model.number="draft.weightKg" type="number" min="0" max="1000" step="0.5" :disabled="locked" class="field mt-1" :placeholder="t('workout.optional')" /></label>
            <label class="label" for="custom-exercise-rest">{{ t('workout.rest') }}<input id="custom-exercise-rest" v-model.number="draft.restSeconds" type="number" min="0" max="3600" step="1" :disabled="locked" class="field mt-1" /></label>
          </div>
          <details class="rounded-xl border border-border/40">
            <summary class="cursor-pointer px-3 py-2 text-xs text-muted-foreground">{{ t('workout.moreFields') }}</summary>
            <div class="space-y-3 px-3 pb-3">
              <label class="label" for="custom-exercise-tempo">{{ t('workout.tempo') }}<input id="custom-exercise-tempo" v-model="draft.tempo" type="text" maxlength="24" :disabled="locked" class="field mt-1" placeholder="3–1–1" /></label>
              <label class="label" for="custom-exercise-alternative">{{ t('workout.alternative') }}<input id="custom-exercise-alternative" v-model="draft.alternative" type="text" maxlength="160" :disabled="locked" class="field mt-1" /></label>
              <label class="label" for="custom-exercise-notes">{{ t('workout.notes') }}<textarea id="custom-exercise-notes" v-model="draft.notes" rows="3" maxlength="1000" :disabled="locked" class="field mt-1 !h-auto resize-y py-2" /></label>
            </div>
          </details>
          <p v-if="customSaveError" role="alert" class="text-xs text-destructive">{{ t(customProgramError ? 'workout.customProgramFailed' : 'workout.customSaveFailed') }}</p>
          <div class="editor-submit custom-submit">
            <label class="library-opt-in"><input v-model="alsoAddToLibrary" type="checkbox" :disabled="locked" /><span>{{ t('workout.alsoAddToLibrary') }}</span></label>
            <button type="submit" :disabled="locked || !customValid" class="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="customSaving" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Plus v-else class="h-3.5 w-3.5" />{{ t('workout.addMovement') }}</button>
          </div>
        </form>
        <form v-else-if="mode === 'edit' || hasSelection" ref="exerciseForm" class="exercise-editor space-y-3" @submit.prevent="save">
          <div v-if="draft.imageUrl || draft.catalogId" class="editor-preview">
            <ExerciseImage :exercise="draft" controls class="editor-image" />
            <button type="button" class="editor-enlarge icon-button" :aria-label="t('workout.enlargePreview', { name: draft.name })" :title="t('workout.enlargePreview', { name: draft.name })" aria-haspopup="dialog" @click="previewDraft"><Expand class="h-3.5 w-3.5" /></button>
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
          <div class="editor-submit"><button type="submit" :disabled="busy || !valid" class="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Plus v-else-if="!exercise" class="h-3.5 w-3.5" />{{ t(exercise ? 'workout.saveChanges' : 'workout.addToProgram') }}</button></div>
          <div v-if="selectedCustomExercise" class="library-remove">
            <button type="button" :disabled="locked" @click="removeCustom"><Loader2 v-if="customRemoving" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Trash2 v-else class="h-3.5 w-3.5" />{{ t('workout.removeFromLibrary') }}</button>
            <p>{{ t('workout.removeLibraryHint') }}</p>
            <p v-if="customRemoveError" role="alert" class="text-destructive">{{ t('workout.customRemoveFailed') }}</p>
          </div>
        </form>
      </div>
    </div>
  </dialog>
  <ExercisePreview v-if="preview" :exercise="preview" @close="preview = null" />
</template>

<script setup lang="ts">
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Expand, ImagePlus, Loader2, Plus, RotateCcw, Search, Trash2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import ExerciseImage from './ExerciseImage.vue'
import ExercisePreview from './ExercisePreview.vue'
import type { Exercise } from '../stores/workout'
import { catalogInput, equipmentTypes, loadExerciseCatalog, muscleGroups, normalizeCustomExercise, normalizeExerciseInput, safeImageUrl, searchCatalog, type CatalogExercise, type CustomExerciseInput, type ExerciseInput } from '../lib/exercises'
const props = defineProps<{ show: boolean; busy?: boolean; exercise?: Exercise | null; customExercises?: CatalogExercise[]; customLoading?: boolean; customError?: boolean; saveCustomExercise: (input: CustomExerciseInput, requestId: string) => Promise<CatalogExercise | false>; removeCustomExercise: (id: string) => Promise<boolean>; addCustomToProgram: (input: ExerciseInput) => Promise<boolean> }>()
const emit = defineEmits<{ close: []; add: [exercise: ExerciseInput]; update: [id: string, exercise: ExerciseInput, version?: number]; 'reload-custom': [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>(), searchInput = ref<HTMLInputElement>()
const exerciseForm = ref<HTMLFormElement>()
const results = ref<HTMLElement>(), preview = ref<Exercise | null>(null)
const mode = ref<'library' | 'custom' | 'edit'>('library'), catalog = ref<CatalogExercise[]>([]), query = ref(''), group = ref('all'), equipment = ref('all')
const loading = ref(false), catalogError = ref(false), formError = ref(false), limit = ref(24)
const blank = (): ExerciseInput => ({ name: '', sets: 3, reps: '10–12', imageUrl: '', weightKg: null, restSeconds: 90, tempo: '', alternative: '', notes: '' })
const draft = ref<ExerciseInput>(blank())
const detailsOpen = ref(false)
const hasSelection = computed(() => Boolean(draft.value.catalogId || props.exercise) && detailsOpen.value)
const capturedVersion = ref<number>(), capturedId = ref('')
const blankCustom = (): CustomExerciseInput => ({ name: '', imageUrl: '', group: '', equipment: '' })
const customDraft = ref<CustomExerciseInput>(blankCustom()), customSaving = ref(false), customSaveError = ref(false)
const alsoAddToLibrary = ref(false), customProgramError = ref(false), customInstanceId = ref('')
const customRemoving = ref(false), customRemoveError = ref(false)
const selectedCustomExercise = computed(() => props.customExercises?.find(item => item.source === 'custom' && item.id === draft.value.catalogId))
const customImageUrl = ref('')
let imagePreviewTimer: ReturnType<typeof setTimeout> | undefined
watch(() => customDraft.value.imageUrl, value => {
  clearTimeout(imagePreviewTimer)
  const url = safeImageUrl(value.trim())
  if (!url || url.length > 2048 || new URL(url).username || new URL(url).password) { customImageUrl.value = ''; return }
  imagePreviewTimer = setTimeout(() => { customImageUrl.value = url }, 200)
})
const locked = computed(() => Boolean(props.busy || customSaving.value || customRemoving.value))
let customRequest: { payload: string; id: string } | undefined
const customValid = computed(() => { try { customProgramInput(normalizeCustomExercise(customDraft.value, alsoAddToLibrary.value)); return true } catch { return false } })
const customPreview = computed<ExerciseInput>(() => ({ ...blank(), name: customDraft.value.name.trim() || t('workout.customExercise'), catalogId: 'custom:preview', imageUrl: customImageUrl.value }))
const valid = computed(() => Boolean(draft.value.name.trim() && draft.value.reps.trim() && Number.isInteger(draft.value.sets) && draft.value.sets >= 1 && draft.value.sets <= 100))
const matches = computed(() => searchCatalog([...(props.customExercises || []), ...catalog.value], query.value, group.value, equipment.value))
const hasFilters = computed(() => Boolean(query.value.trim() || group.value !== 'all' || equipment.value !== 'all'))
function resetFilters() { query.value = ''; group.value = 'all'; equipment.value = 'all'; limit.value = 24 }
const groupOptions = computed(() => [{ value: 'all', label: t('workout.allMuscles') }, ...muscleGroups.map(value => ({ value, label: t('workout.groups.' + value) }))])
const equipmentOptions = computed(() => [{ value: 'all', label: t('workout.allEquipment') }, ...equipmentTypes.map(value => ({ value, label: t('workout.equipmentNames.' + value.replace(/ /g, '_').replace(/-/g, '_')) }))])
const customGroupOptions = computed(() => [{ value: '', label: t('workout.chooseMuscleGroup'), disabled: true }, ...groupOptions.value.slice(1)])
const customEquipmentOptions = computed(() => [{ value: '', label: t('workout.chooseEquipment'), disabled: true }, ...equipmentOptions.value.slice(1)])
const equipmentLabel = (value: string) => equipmentOptions.value.find(option => option.value === value)?.label || value
const muscleLabel = (muscle: string) => t('workout.muscles.' + muscle.replace(/ /g, '_'))
async function loadCatalog() {
  loading.value = true; catalogError.value = false
  try { catalog.value = await loadExerciseCatalog() } catch { catalogError.value = true } finally { loading.value = false }
}
watch(() => props.show, async show => {
  if (!show) { clearTimeout(imagePreviewTimer); preview.value = null; if (dialog.value?.open) dialog.value.close(); return }
  resetFilters()
  customDraft.value = blankCustom(); alsoAddToLibrary.value = false; customInstanceId.value = crypto.randomUUID(); customSaveError.value = false; customProgramError.value = false; customRemoveError.value = false; customRequest = undefined
  const original = props.exercise
  mode.value = original ? 'edit' : 'library'
  draft.value = original ? { ...blank(), ...original } : blank()
  detailsOpen.value = Boolean(original)
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
  if (locked.value) return
  customRemoveError.value = false
  if (draft.value.catalogId === exercise.id) {
    detailsOpen.value = !detailsOpen.value
    if (!detailsOpen.value) return
  } else {
    const previous = draft.value
    draft.value = { ...catalogInput(exercise), sets: previous.sets, reps: previous.reps, weightKg: previous.weightKg, restSeconds: previous.restSeconds, tempo: previous.tempo, alternative: previous.alternative, notes: previous.notes }
    detailsOpen.value = true
  }
  formError.value = false
  await nextTick()
  revealEditor()
}
function revealEditor() {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 959px)').matches) exerciseForm.value?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  else results.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' })
}
function previewDraft() { preview.value = { ...draft.value, id: capturedId.value || draft.value.catalogId || 'preview', isCompleted: false } }
async function chooseReplacement() {
  mode.value = 'library'
  await nextTick()
  void loadCatalog()
  searchInput.value?.focus()
}
function cancel(event: Event) { if (locked.value) event.preventDefault(); else emit('close') }
async function removeCustom() {
  const selected = selectedCustomExercise.value
  if (!selected || locked.value) return
  customRemoving.value = true; customRemoveError.value = false
  try {
    const removed = await props.removeCustomExercise(selected.id)
    if (!props.show) return
    if (!removed) { customRemoveError.value = true; return }
    if (mode.value === 'library' && draft.value.catalogId === selected.id) {
      detailsOpen.value = false
      draft.value = { ...draft.value, name: '', catalogId: '', imageUrl: '', images: [], equipment: '', muscles: [] }
      preview.value = null; formError.value = false
    }
  } catch { if (props.show) customRemoveError.value = true }
  finally { customRemoving.value = false }
}
async function saveCustom() {
  if (locked.value || !customValid.value) return
  const input = normalizeCustomExercise(customDraft.value, alsoAddToLibrary.value)
  const programInput = customProgramInput(input)
  customSaving.value = true; customSaveError.value = false; customProgramError.value = false
  try {
    if (alsoAddToLibrary.value) {
      const payload = JSON.stringify(input)
      if (customRequest?.payload !== payload) customRequest = { payload, id: crypto.randomUUID() }
      const saved = await props.saveCustomExercise(input, customRequest.id)
      if (!props.show) return
      if (!saved) { customSaveError.value = true; return }
      programInput.catalogId = saved.id
    }
    customProgramError.value = true
    const added = await props.addCustomToProgram(programInput)
    if (!props.show) return
    if (!added) { customSaveError.value = true; return }
    emit('close')
  } catch { if (props.show) customSaveError.value = true }
  finally { customSaving.value = false }
}
const optionalNumber = (value: unknown) => value == null || value === '' ? null : Number(value)
function customProgramInput(input: CustomExerciseInput): ExerciseInput {
  return normalizeExerciseInput({ ...draft.value, name: input.name, imageUrl: input.imageUrl, images: [input.imageUrl],
    catalogId: 'custom:instance:' + customInstanceId.value, equipment: input.equipment, muscles: input.group ? [input.group] : [],
    weightKg: optionalNumber(draft.value.weightKg), restSeconds: optionalNumber(draft.value.restSeconds) })
}
function save() {
  if (locked.value || mode.value === 'custom') return
  try {
    const input = normalizeExerciseInput({ ...draft.value, weightKg: optionalNumber(draft.value.weightKg), restSeconds: optionalNumber(draft.value.restSeconds) })
    if (props.exercise) emit('update', capturedId.value, input, capturedVersion.value)
    else emit('add', input)
  } catch { formError.value = true }
}
onBeforeUnmount(() => { clearTimeout(imagePreviewTimer); dialog.value?.close() })
</script>

<style scoped>
.exercise-dialog { width: min(480px, calc(100vw - 2rem)); max-width: none; max-height: min(90dvh, 56rem); overflow: hidden; }
.exercise-dialog[open] { display: flex; flex-direction: column; }
.exercise-dialog.is-library { width: min(1240px, calc(100vw - 3rem)); height: min(86dvh, 54rem); }
.dialog-header { flex-shrink: 0; }
.dialog-content { display: flex; flex-direction: column; min-height: 0; gap: 16px; padding: 16px 20px 20px; overflow-y: auto; }
.is-library .dialog-content { flex: 1; }
.source-tabs { flex-shrink: 0; }
.library-layout { display: grid; min-height: 0; min-width: 0; gap: 20px; }
.is-library .library-layout { flex: 1; }
.library-browser { display: flex; flex-direction: column; min-height: 0; min-width: 0; gap: 12px; }
.library-browser > :not(.catalog-results) { flex-shrink: 0; }
.catalog-results { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: hsl(var(--border) / .7) transparent; padding: 2px 4px 4px 2px; }
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr)); gap: 12px; align-items: start; }
.catalog-card { min-width: 0; padding: 5px; overflow: hidden; border: 1px solid hsl(var(--border) / .65); border-radius: 14px; background: hsl(var(--background) / .5); text-align: left; transition: border-color 160ms, background-color 160ms, box-shadow 160ms; }
.catalog-card:hover:not(:disabled) { border-color: hsl(var(--primary) / .3); background: hsl(var(--muted) / .3); }
.catalog-card[aria-pressed=true] { border-color: hsl(var(--primary) / .55); background: hsl(var(--primary) / .04); box-shadow: 0 0 0 1px hsl(var(--primary) / .12); }
.catalog-card:disabled { opacity: .5; }
.catalog-media { position: relative; display: block; width: 100%; }
.catalog-image { width: 100%; aspect-ratio: 3 / 2; border: 0; border-radius: 9px; }
.catalog-caption { display: block; min-width: 0; padding: 10px 7px 7px; }
.catalog-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 36px; font-size: 13px; line-height: 18px; font-weight: 500; }
.catalog-muscles { display: block; overflow: hidden; margin-top: 4px; color: hsl(var(--muted-foreground)); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.selection-mark { position: absolute; top: 7px; right: 7px; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); box-shadow: 0 1px 4px #0001; }
.exercise-editor { min-width: 0; min-height: 0; padding: 2px; }
.editor-preview { position: relative; }
.editor-image { width: 100%; aspect-ratio: 3 / 2; }
.editor-enlarge { position: absolute; top: 8px; right: 8px; background: hsl(var(--card) / .95); border: 1px solid hsl(var(--border) / .6); box-shadow: 0 1px 3px #0001; }
.editor-submit { position: sticky; z-index: 1; bottom: -2px; padding: 8px 0 2px; background: hsl(var(--card)); }
.library-opt-in { display: flex; align-items: center; gap: 8px; padding: 4px 0 10px; color: hsl(var(--muted-foreground)); font-size: 12px; cursor: pointer; }
.library-opt-in input { width: 15px; height: 15px; flex-shrink: 0; accent-color: hsl(var(--primary)); }
.library-opt-in input:focus-visible { outline: 2px solid hsl(var(--primary) / .4); outline-offset: 3px; }
.library-remove { padding-top: 12px; border-top: 1px solid hsl(var(--border) / .45); }
.library-remove > button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 34px; padding: 7px 10px; border: 1px solid hsl(var(--destructive) / .2); border-radius: 10px; color: hsl(var(--destructive)); font-size: 11px; transition: background-color 150ms, border-color 150ms; }
.library-remove > button:hover:not(:disabled) { border-color: hsl(var(--destructive) / .35); background: hsl(var(--destructive) / .05); }
.library-remove > button:disabled { opacity: .45; }
.library-remove p { margin-top: 7px; color: hsl(var(--muted-foreground)); font-size: 10px; line-height: 1.6; }
.library-remove p[role=alert] { color: hsl(var(--destructive)); }
.custom-preview-pane { display: flex; align-items: flex-start; justify-content: center; min-width: 0; min-height: 0; overflow-y: auto; padding: 2px; }
.custom-preview-card { width: 100%; max-width: 560px; overflow: hidden; border: 1px solid hsl(var(--border) / .65); border-radius: 16px; background: hsl(var(--background) / .5); }
.custom-preview-media { position: relative; aspect-ratio: 3 / 2; background: hsl(var(--muted) / .2); }
.custom-preview-image { position: absolute; inset: 0; height: 100%; width: 100%; border: 0; border-radius: 0; }
.custom-preview-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; color: hsl(var(--muted-foreground) / .65); }
.custom-preview-empty p { max-width: 240px; font-size: 12px; line-height: 1.6; }
.custom-preview-caption { padding: 16px; }
.custom-preview-caption h4 { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.custom-preview-caption p { margin-top: 6px; font-size: 12px; color: hsl(var(--muted-foreground)); }
@media (min-width: 960px) {
  .is-library .dialog-content { overflow: hidden; }
  .is-library.has-selection .library-layout, .is-custom .library-layout { grid-template-columns: minmax(0, 1fr) minmax(280px, 320px); }
  .is-library .exercise-editor { overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: hsl(var(--border) / .7) transparent; padding-inline: 2px 5px; }
}
@media (max-width: 959px) {
  .exercise-dialog.is-library { width: calc(100vw - 1.5rem); height: min(90dvh, 54rem); }
  .dialog-content { padding: 14px; }
  .is-library .library-layout { flex: none; }
  .catalog-results { max-height: 52dvh; }
  .catalog-grid { gap: 10px; }
  .catalog-caption { padding-inline: 4px; }
  .catalog-name { font-size: 12px; }
  .exercise-editor { scroll-margin-top: 14px; }
  .editor-image { max-height: 34dvh; }
}
@media (max-width: 575px) {
  .catalog-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
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
