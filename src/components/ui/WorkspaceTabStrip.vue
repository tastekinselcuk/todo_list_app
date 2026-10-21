<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useTabStrip } from './useTabStrip'

const props = defineProps<{ tabs: { id: string; label: string }[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { locale } = useI18n()
const shell = ref<HTMLElement | null>(null)
const bar = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
const labels = ref<number[]>([])
const available = ref(0)
const desktop = ref(false)
const selected = computed(() => props.tabs.findIndex(tab => tab.id === props.modelValue))
const { first, layout, offset, visibleWidth, canGoLeft, canGoRight, move } = useTabStrip(labels, available, desktop, selected)
const ready = computed(() => labels.value.length === props.tabs.length && available.value > 0)
let observer: ResizeObserver | undefined
let disposed = false

function navigate(direction: -1 | 1) {
  const nextSelection = move(direction)
  if (nextSelection !== undefined && props.tabs[nextSelection]) {
    emit('update:modelValue', props.tabs[nextSelection].id)
  }
}

async function measure() {
  await nextTick()
  if (disposed || !shell.value || !bar.value || !track.value) return
  const style = getComputedStyle(bar.value)
  const edgeSpace = 2 * (parseFloat(style.getPropertyValue('--arrow-width'))
    + parseFloat(style.columnGap) + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth)) + 4
  // Measure the full workspace independently of the bar's fitted width.
  available.value = Math.max(0, shell.value.getBoundingClientRect().width - edgeSpace)
  desktop.value = shell.value.getBoundingClientRect().width >= 840
  const widths = Array.from(track.value.querySelectorAll('.tab-label'), label => {
    const range = document.createRange()
    range.selectNodeContents(label)
    return range.getBoundingClientRect().width
  })
  if (widths.length !== labels.value.length || widths.some((width, index) => width !== labels.value[index])) labels.value = widths
}
async function selectFromKeyboard(index: number) {
  if (!props.tabs.length) return
  const next = (index + props.tabs.length) % props.tabs.length
  emit('update:modelValue', props.tabs[next].id)
  await nextTick()
  track.value?.querySelectorAll<HTMLButtonElement>('.strip-tab')[next]?.focus()
}
onMounted(() => {
  void measure()
  if (shell.value) {
    observer = new ResizeObserver(() => { void measure() })
    observer.observe(shell.value)
  }
  void document.fonts.ready.then(() => { if (!disposed) void measure() })
})
watch(() => props.tabs, () => { void measure() }, { deep: true })
onBeforeUnmount(() => { disposed = true; observer?.disconnect() })
</script>

<template>
  <div ref="shell" class="relative z-10 flex justify-center w-full">
    <div
      ref="bar"
      class="workspace-strip bg-muted/30 backdrop-blur-md rounded-2xl border border-border/40"
      :style="{ '--tab-padding': `${layout.padding}px`, '--tab-gap': `${layout.gap}px`, '--tab-max-width': available ? `${available}px` : 'none' }"
    >
      <div class="arrow-slot">
        <button v-if="canGoLeft" type="button" class="strip-arrow text-muted-foreground hover:text-foreground hover:bg-background/40"
          :aria-label="locale === 'tr' ? 'Önceki sekmeleri göster' : 'Show previous tabs'" @click="navigate(-1)">
          <ChevronLeft :size="16" />
        </button>
      </div>
      <div class="strip-frame">
        <div class="strip-viewport" :style="{ width: ready ? `${visibleWidth + 4}px` : '100%', visibility: ready ? 'visible' : 'hidden' }">
          <div ref="track" class="strip-track" role="tablist" :aria-label="locale === 'tr' ? 'Çalışma alanı sekmeleri' : 'Workspace tabs'" :style="{ transform: `translateX(-${offset}px)` }">
            <button
              v-for="(tab, index) in tabs" :key="tab.id" type="button"
              :id="`workspace-tab-${tab.id}`" role="tab" :aria-controls="`workspace-panel-${tab.id}`" :tabindex="modelValue === tab.id ? 0 : -1"
              :inert="index < first || index >= first + layout.count"
              class="strip-tab relative py-2 text-[13px] font-medium rounded-xl transition-colors duration-200 whitespace-nowrap"
              :class="modelValue === tab.id ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground hover:bg-background/40'"
              :aria-selected="modelValue === tab.id" :title="tab.label" @click="emit('update:modelValue', tab.id)"
              @keydown.right.prevent="selectFromKeyboard(index + 1)" @keydown.left.prevent="selectFromKeyboard(index - 1)" @keydown.home.prevent="selectFromKeyboard(0)" @keydown.end.prevent="selectFromKeyboard(tabs.length - 1)">
              <span class="tab-label">{{ tab.label }}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="arrow-slot">
        <button v-if="canGoRight" type="button" class="strip-arrow text-muted-foreground hover:text-foreground hover:bg-background/40"
          :aria-label="locale === 'tr' ? 'Sonraki sekmeleri göster' : 'Show next tabs'" @click="navigate(1)">
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-strip { --arrow-width: 16px; display: inline-grid; grid-template-columns: var(--arrow-width) minmax(0, max-content) var(--arrow-width); width: max-content; max-width: 100%; align-items: center; gap: 2px; padding: 3px; }
.arrow-slot { display: flex; align-items: center; justify-content: center; width: var(--arrow-width); height: 36px; }
.strip-arrow { display: flex; align-items: center; justify-content: center; width: var(--arrow-width); height: 28px; border-radius: 9px; transition: background-color 160ms, color 160ms; }
.strip-frame { min-width: 0; }
.strip-viewport { max-width: 100%; overflow: hidden; padding: 1px 2px; transition: width 220ms ease-out; }
.strip-track { display: flex; gap: var(--tab-gap); width: max-content; transition: transform 220ms ease-out; }
.strip-tab { flex: 0 0 auto; max-width: var(--tab-max-width); padding-left: var(--tab-padding); padding-right: var(--tab-padding); line-height: 20px; height: 36px; }
.tab-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.strip-arrow:focus-visible, .strip-tab:focus-visible { outline: 2px solid hsl(var(--primary) / .4); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .strip-track, .strip-viewport, .strip-arrow, .strip-tab { transition: none; } }
</style>
