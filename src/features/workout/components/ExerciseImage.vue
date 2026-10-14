<template>
  <div class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-white">
    <img v-if="source" :key="source" :src="source" :alt="exercise.name" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="h-full w-full object-contain" @error="failed++" />
    <Dumbbell v-else class="h-5 w-5 text-slate-300" :aria-label="$t('workout.imageUnavailable')" />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Dumbbell } from 'lucide-vue-next'
import { imageCandidates, loadExerciseCatalog, type CatalogExercise, type ExerciseInput } from '../lib/exercises'
const props = withDefaults(defineProps<{ exercise: ExerciseInput; pose?: number }>(), { pose: 0 })
const catalog = ref<CatalogExercise[]>([]), failed = ref(0)
const candidates = computed(() => imageCandidates(props.exercise, catalog.value, props.pose))
const source = computed(() => candidates.value[failed.value] || '')
watch(() => candidates.value.join('|'), () => { failed.value = 0 })
onMounted(async () => { try { catalog.value = await loadExerciseCatalog() } catch { /* Existing custom image URLs remain usable. */ } })
</script>
