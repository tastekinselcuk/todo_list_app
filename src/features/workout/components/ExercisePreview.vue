<template>
  <Teleport to="body">
    <dialog ref="dialog" class="exercise-viewer" :aria-labelledby="titleId" @cancel.prevent="dismiss" @close="dismiss" @click="backdrop">
      <header class="viewer-header">
        <h3 :id="titleId" class="min-w-0 flex-1 truncate text-sm font-medium">{{ exercise.name }}</h3>
        <button ref="closeButton" type="button" class="viewer-close" :aria-label="$t('common.close')" :title="$t('common.close')" @click="dismiss"><X class="h-4 w-4" /></button>
      </header>
      <div class="viewer-canvas">
        <ExerciseImage :exercise="exercise" controls class="h-full w-full !rounded-none !border-0" />
      </div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import type { ExerciseInput } from '../lib/exercises'
import ExerciseImage from './ExerciseImage.vue'

defineProps<{ exercise: ExerciseInput }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>(), closeButton = ref<HTMLButtonElement>()
const titleId = `exercise-preview-${crypto.randomUUID()}`
let previous: HTMLElement | null = null, scroll: { body: string; root: string; gutter: string } | undefined, closed = false
function release() {
  dialog.value?.close()
  if (scroll) {
    document.body.style.overflow = scroll.body
    document.documentElement.style.overflow = scroll.root
    document.documentElement.style.scrollbarGutter = scroll.gutter
    scroll = undefined
  }
  if (previous?.isConnected) previous.focus({ preventScroll: true })
  previous = null
}
function dismiss() {
  if (closed) return
  closed = true
  release()
  emit('close')
}
function backdrop(event: MouseEvent) {
  if (event.target !== dialog.value || event.button !== 0) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss()
}
onMounted(() => {
  previous = document.activeElement as HTMLElement | null
  scroll = { body: document.body.style.overflow, root: document.documentElement.style.overflow, gutter: document.documentElement.style.scrollbarGutter }
  document.documentElement.style.scrollbarGutter = 'stable'
  document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'
  dialog.value?.showModal()
  closeButton.value?.focus({ preventScroll: true })
})
onDeactivated(dismiss)
onBeforeUnmount(release)
</script>

<style scoped>
.exercise-viewer { position: fixed; inset: 0; margin: auto; width: min(960px, calc(100vw - 2rem)); max-width: none; max-height: calc(100dvh - 2rem); padding: 0; overflow: hidden; border: 1px solid hsl(var(--border) / .7); border-radius: 1.25rem; background: hsl(var(--card)); color: hsl(var(--foreground)); box-shadow: 0 24px 90px rgb(0 0 0 / .25); }
.exercise-viewer[open] { display: flex; flex-direction: column; animation: viewer-in 180ms cubic-bezier(.2,.7,.2,1); }
.exercise-viewer::backdrop { background: rgb(2 6 23 / .5); backdrop-filter: blur(6px); }
.viewer-header { display: flex; flex-shrink: 0; align-items: center; gap: .75rem; min-height: 3.25rem; padding: .5rem .75rem .5rem 1rem; border-bottom: 1px solid hsl(var(--border) / .5); }
.viewer-close { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: .625rem; color: hsl(var(--muted-foreground)); }
.viewer-close:hover { background: hsl(var(--muted) / .6); color: hsl(var(--foreground)); }
.viewer-close:focus-visible { outline: 2px solid hsl(var(--primary) / .5); outline-offset: 2px; }
.viewer-canvas { height: min(72dvh, 46rem); min-height: 0; min-width: 0; --exercise-image-padding: clamp(.5rem, 2vw, 1.25rem); }
@keyframes viewer-in { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .exercise-viewer[open] { animation: none; } }
</style>
