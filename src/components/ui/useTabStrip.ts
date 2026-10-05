import { computed, ref, watch, type Ref } from 'vue'

export function tabLayout(labels: number[], available: number, desktop: boolean) {
  let count = Math.min(7, labels.length)
  const widestWindow = (size: number) => {
    let widest = 0
    for (let start = 0; start + size <= labels.length; start++) {
      widest = Math.max(widest, labels.slice(start, start + size).reduce((sum, width) => sum + width, 0))
    }
    return widest
  }
  // Small screens keep the original padding and show fewer complete tabs.
  if (!desktop) {
    while (count > 1 && widestWindow(count) + count * 40 + (count - 1) * 4 > available) count--
  }
  if (!count) return { count: 0, padding: 20, gap: 4 }
  const textWidth = widestWindow(count)
  // Keep natural button widths whenever possible; reduce empty spacing only as needed.
  const gap = count > 1 ? Math.max(0, Math.min(4, (available - textWidth - count * 40) / (count - 1))) : 4
  const padding = desktop ? Math.max(4, Math.min(20, (available - textWidth - (count - 1) * gap) / (count * 2))) : 20
  return { count, padding, gap }
}

export function useTabStrip(labels: Ref<number[]>, available: Ref<number>, desktop: Ref<boolean>, selected: Ref<number>) {
  const first = ref(0)
  const layout = computed(() => tabLayout(labels.value, available.value, desktop.value))
  const widths = computed(() => labels.value.map(label => Math.min(available.value, label + layout.value.padding * 2)))
  const last = computed(() => Math.max(0, labels.value.length - layout.value.count))
  const offset = computed(() => widths.value.slice(0, first.value).reduce((sum, size) => sum + size + layout.value.gap, 0))
  const visibleWidth = computed(() => widths.value.slice(first.value, first.value + layout.value.count)
    .reduce((sum, size) => sum + size, 0) + Math.max(0, layout.value.count - 1) * layout.value.gap)
  const canGoLeft = computed(() => first.value > 0)
  const canGoRight = computed(() => first.value < last.value)
  function move(direction: -1 | 1): number | undefined {
    const nextFirst = Math.max(0, Math.min(last.value, first.value + direction))
    const leavingLeft = direction === 1 && nextFirst > first.value && selected.value === first.value
    const leavingRight = direction === -1 && nextFirst < first.value && selected.value === first.value + layout.value.count - 1
    const nextSelection = leavingLeft || leavingRight ? selected.value + direction : undefined
    first.value = nextFirst
    return nextSelection
  }
  watch([layout, selected], () => {
    first.value = Math.max(0, Math.min(last.value, first.value))
    if (selected.value < 0 || !layout.value.count) return
    if (selected.value < first.value) first.value = selected.value
    else if (selected.value >= first.value + layout.value.count) first.value = selected.value - layout.value.count + 1
    first.value = Math.max(0, Math.min(last.value, first.value))
  }, { immediate: true, flush: 'sync' })
  return { first, layout, offset, visibleWidth, canGoLeft, canGoRight, move }
}
