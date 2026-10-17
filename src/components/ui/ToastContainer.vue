<template>
  <Teleport :to="toastTarget">
  <div ref="toastHost" :popover="supportsPopover ? 'manual' : undefined" class="toast-host fixed z-[100] flex flex-col gap-3 pointer-events-none">
    <TransitionGroup name="toast" @after-leave="hideWhenEmpty">
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl border shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl min-w-[280px] max-w-sm transition-all duration-300"
        :class="getToastStyle(toast.type)"
        :role="toast.type === 'error' ? 'alert' : 'status'"
        aria-atomic="true"
        @mouseenter="uiStore.pauseToast(toast.id)"
        @mouseleave="uiStore.resumeToast(toast.id)"
        @focusin="uiStore.pauseToast(toast.id,'focus')"
        @focusout="event=>{if(!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node|null))uiStore.resumeToast(toast.id,'focus')}"
      >
        <component :is="getIcon(toast.type)" class="w-5 h-5 shrink-0" />
        <p class="text-sm font-semibold leading-snug flex-1">{{ toast.message }}</p>
        <button v-if="toast.action" type="button" :disabled="toast.pending" :aria-busy="toast.pending" class="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold underline underline-offset-4 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:opacity-50 dark:hover:bg-white/10" @click="uiStore.runToastAction(toast.id)">{{ toast.action.label }}</button>
        <button 
          type="button"
          :aria-label="t('common.close')"
          :disabled="toast.pending"
          @click="uiStore.removeToast(toast.id)" 
          class="p-1.5 rounded-xl opacity-60 hover:opacity-100 transition-all hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useUIStore } from '@/stores/ui'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-vue-next'
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

const uiStore = useUIStore()
const { t } = useI18n()
const toastHost = ref<HTMLElement | null>(null)
const toastTarget = ref<string | HTMLElement>('body')
const supportsPopover = ref(false)
let observer: MutationObserver | undefined
let modalOrder: HTMLDialogElement[] = []
let disposed = false

// Popovers escape dialog backdrops and transformed containing blocks. Keeping the
// host inside the active modal also keeps the dismiss button out of inert content.
function isModal(dialog: HTMLDialogElement) {
  try { return dialog.matches(':modal') } catch { return dialog.open }
}
function syncModalTarget(records: MutationRecord[] = []) {
  for (const record of records) {
    if (record.type !== 'attributes' || !(record.target instanceof HTMLDialogElement)) continue
    modalOrder = modalOrder.filter(dialog => dialog !== record.target)
    if (record.target.open && isModal(record.target)) modalOrder.push(record.target)
  }
  modalOrder = modalOrder.filter(dialog => dialog.isConnected && dialog.open && isModal(dialog))
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
    if (isModal(dialog) && !modalOrder.includes(dialog)) modalOrder.push(dialog)
  }
  toastTarget.value = modalOrder[modalOrder.length - 1] || document.body
}

async function promoteToasts() {
  await nextTick()
  if (disposed || !uiStore.toasts.length || !supportsPopover.value || !toastHost.value?.isConnected) return
  const host = toastHost.value
  if (host.matches(':popover-open')) host.hidePopover()
  host.showPopover()
}

function hideWhenEmpty() {
  if (!uiStore.toasts.length && supportsPopover.value && toastHost.value?.matches(':popover-open')) toastHost.value.hidePopover()
}

watch([() => uiStore.toasts.length, toastTarget], () => { if (uiStore.toasts.length) void promoteToasts() }, { flush: 'post' })
onMounted(() => {
  supportsPopover.value = typeof toastHost.value?.showPopover === 'function'
  syncModalTarget()
  observer = new MutationObserver(records => {
    const dialogChanged = records.some(record => record.type === 'attributes'
      || [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('dialog') || node.querySelector('dialog'))))
    if (dialogChanged) syncModalTarget(records)
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
  if (uiStore.toasts.length) void promoteToasts()
})
onBeforeUnmount(() => { disposed = true; observer?.disconnect() })

// Bildirim tipine göre renk teması
const getToastStyle = (type: string) => {
  switch (type) {
    case 'success': return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
    case 'error': return 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400'
    case 'warning': return 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
    default: return 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400' // info
  }
}

// Bildirim tipine göre ikon
const getIcon = (type: string) => {
  switch (type) {
    case 'success': return CheckCircle2
    case 'error': return AlertCircle
    case 'warning': return AlertTriangle
    default: return Info
  }
}
</script>

<style scoped>
.toast-host {
  inset:auto 1.5rem 1.5rem auto;
  width:min(24rem,calc(100vw - 2rem));
  margin:0;
  padding:0;
  border:0;
  background:transparent;
  color:inherit;
  overflow:visible;
}
.toast-host[popover]:not(:popover-open) { display:none; }
.toast-host::backdrop { background:transparent; pointer-events:none; }
@media(max-width:639px){.toast-host{right:1rem}}
.toast-host > div { min-width:0; }
@media(prefers-reduced-motion:reduce){.toast-enter-active,.toast-leave-active{transition:none!important}}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(50px) scale(0.9);
}
.toast-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
