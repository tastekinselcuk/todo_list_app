<template>
  <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl border shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl min-w-[280px] max-w-sm transition-all duration-300"
        :class="getToastStyle(toast.type)"
      >
        <component :is="getIcon(toast.type)" class="w-5 h-5 shrink-0" />
        <p class="text-sm font-semibold leading-snug flex-1">{{ toast.message }}</p>
        <button 
          @click="uiStore.removeToast(toast.id)" 
          class="p-1.5 rounded-xl opacity-60 hover:opacity-100 transition-all hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useUIStore } from '@/stores/ui'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-vue-next'

const uiStore = useUIStore()

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