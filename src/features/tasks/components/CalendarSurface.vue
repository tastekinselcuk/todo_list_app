<template><div ref="host" /></template>

<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { Calendar, type CalendarOptions } from '@fullcalendar/core'

const props = defineProps<{ options: CalendarOptions }>()
const host = ref<HTMLElement>()
// Keep the imperative calendar out of Vue's reactive graph. Vue owns only the
// empty host; FullCalendar exclusively owns every node inside it (no Vue slots
// or fragment anchors that a calendar redraw could remove).
let calendar: Calendar | undefined
let active = true
let disposed = false

onMounted(() => {
  if (!host.value || disposed) return
  calendar = new Calendar(host.value, props.options)
  calendar.render()
})

watch(() => props.options, options => {
  if (!disposed && active && calendar) calendar.resetOptions(options)
}, { flush: 'post' })

onDeactivated(() => {
  active = false
  calendar?.pauseRendering()
})
onActivated(() => {
  if (disposed || active) return
  active = true
  calendar?.resetOptions(props.options)
  calendar?.resumeRendering()
  calendar?.updateSize()
})
onBeforeUnmount(() => {
  disposed = true
  active = false
  calendar?.destroy()
  calendar = undefined
})

defineExpose({ getApi: () => calendar! })
</script>
