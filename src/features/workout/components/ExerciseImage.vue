<template>
  <div ref="host" class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-white">
    <div class="absolute inset-0" :class="{ 'has-motion': hasMotion }" :style="{ '--pose-play-state': playing ? 'running' : 'paused' }" role="img" :aria-label="exercise.name">
      <template v-for="(source, index) in sources" :key="index">
        <img v-if="source" :key="source" :src="source" alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer"
          class="pose-frame" :class="[{ 'pose-ready': ready[index], 'pose-still': index === stillFrame }, `pose-${index}`]"
          @load="loaded(index, source)" @error="failed(index, source)" />
      </template>
    </div>
    <Dumbbell v-if="!ready.some(Boolean)" class="h-5 w-5 text-slate-300" :aria-label="$t('workout.imageUnavailable')" />
    <button v-if="controls && hasMotion" type="button" class="pose-control" :title="$t(paused ? 'workout.playPreview' : 'workout.pausePreview')"
      :aria-label="$t(paused ? 'workout.playPreview' : 'workout.pausePreview')" :aria-pressed="paused" @click.stop="paused = !paused">
      <Play v-if="paused" class="h-3 w-3" /><Pause v-else class="h-3 w-3" />
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Dumbbell, Pause, Play } from 'lucide-vue-next'
import { imageCandidates, loadExerciseCatalog, safeImageUrl, type CatalogExercise, type ExerciseInput } from '../lib/exercises'
const props = withDefaults(defineProps<{ exercise: ExerciseInput; animated?: boolean; controls?: boolean }>(), { animated: true, controls: false })
const host = ref<HTMLElement>(), catalog = ref<CatalogExercise[]>([])
const attempts = ref([0, 0]), loadedSources = ref(new Set<string>()), paused = ref(false)
const visible = ref(false), pageVisible = ref(true), reducedMotion = ref(false)
const candidates = computed(() => {
  const custom = !props.exercise.catalogId && safeImageUrl(props.exercise.images?.[0] || props.exercise.imageUrl) && !/exercisedb|rapidapi/i.test(props.exercise.images?.[0] || props.exercise.imageUrl)
  // A lone custom photo must not alternate with an unrelated catalog pose.
  const pair = props.animated && (!custom || Boolean(props.exercise.images?.[1]))
  return [imageCandidates(props.exercise, catalog.value, 0), ...(pair ? [imageCandidates(props.exercise, catalog.value, 1)] : [])]
})
const sources = computed(() => candidates.value.map((choices, index) => choices[attempts.value[index]] || ''))
const ready = computed(() => sources.value.map(source => Boolean(source && loadedSources.value.has(source))))
const stillFrame = computed(() => ready.value[0] ? 0 : ready.value[1] ? 1 : -1)
const hasMotion = computed(() => props.animated && !reducedMotion.value && ready.value.every(Boolean) && sources.value.length === 2 && sources.value[0] !== sources.value[1])
const playing = computed(() => hasMotion.value && visible.value && pageVisible.value && !paused.value)
watch(() => candidates.value.map(choices => choices.join('|')).join('\n'), () => { attempts.value = [0, 0]; paused.value = false })
function loaded(index: number, source: string) { if (sources.value[index] === source) loadedSources.value.add(source) }
function failed(index: number, source: string) {
  if (sources.value[index] !== source) return
  loadedSources.value.delete(source)
  attempts.value[index]++
}
let observer: IntersectionObserver | undefined, motion: MediaQueryList | undefined, disposed = false
function updateVisibility() { pageVisible.value = document.visibilityState !== 'hidden' }
function updateMotion() { reducedMotion.value = Boolean(motion?.matches) }
onMounted(async () => {
  updateVisibility()
  document.addEventListener('visibilitychange', updateVisibility)
  motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  updateMotion(); motion.addEventListener('change', updateMotion)
  if (typeof IntersectionObserver !== 'undefined' && host.value) {
    observer = new IntersectionObserver(entries => { visible.value = entries.some(entry => entry.isIntersecting) })
    observer.observe(host.value)
  } else visible.value = true
  try { const data = await loadExerciseCatalog(); if (!disposed) catalog.value = data } catch { /* Custom image URLs remain usable offline. */ }
})
onBeforeUnmount(() => {
  disposed = true; observer?.disconnect()
  document.removeEventListener('visibilitychange', updateVisibility)
  motion?.removeEventListener('change', updateMotion)
})
</script>

<style scoped>
.pose-frame { position: absolute; inset: 0; width: 100%; height: 100%; padding: var(--exercise-image-padding, 0); object-fit: contain; object-position: center; opacity: 0; }
.pose-ready.pose-still { opacity: 1; }
/* Both loaded frames stay mounted. A 2.4 s loop holds each pose for 1.2 s;
   changing a frame never starts another image request or changes the card's size. */
.has-motion .pose-0 { animation: workout-pose 2.4s steps(1, end) infinite; animation-play-state: var(--pose-play-state, paused); }
.has-motion .pose-1 { animation: workout-pose 2.4s steps(1, end) -1.2s infinite; animation-play-state: var(--pose-play-state, paused); }
@keyframes workout-pose { 0%, 49.99% { opacity: 1; } 50%, 100% { opacity: 0; } }
.pose-control { position: absolute; bottom: .25rem; right: .25rem; display: flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border: 1px solid hsl(var(--border) / .7); border-radius: .5rem; background: hsl(var(--card) / .95); color: hsl(var(--foreground)); box-shadow: 0 1px 3px rgb(0 0 0 / .06); }
.pose-control:focus-visible { outline: 2px solid hsl(var(--primary) / .5); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .pose-frame { animation: none !important; } }
</style>
