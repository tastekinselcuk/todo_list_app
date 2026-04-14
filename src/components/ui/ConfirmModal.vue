<template>
  <Transition name="fade">
    <div 
      v-if="uiStore.confirmState.isOpen" 
      class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      @click.self="uiStore.resolveConfirm(false)"
    >
      <div class="bg-card/90 backdrop-blur-2xl border border-white/10 dark:border-white/5 rounded-[2rem] p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-300">
        
        <div class="flex flex-col items-center text-center space-y-4">
          <div class="w-14 h-14 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20 shadow-inner mb-2">
            <AlertTriangle class="w-7 h-7" />
          </div>
          
          <div class="space-y-2">
            <h3 class="text-xl font-bold tracking-tight text-foreground">
              {{ uiStore.confirmState.title }}
            </h3>
            <p class="text-sm font-medium text-muted-foreground/80 leading-relaxed">
              {{ uiStore.confirmState.message }}
            </p>
          </div>
        </div>

        <div class="flex gap-3 mt-8">
          <button 
            @click="uiStore.resolveConfirm(false)" 
            class="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-muted/50 hover:bg-muted text-foreground transition-all focus:outline-none focus:ring-2 focus:ring-muted-foreground/40"
          >
            {{ uiStore.confirmState.cancelText }}
          </button>
          
          <button 
            ref="confirmBtn"
            @click="uiStore.resolveConfirm(true)" 
            class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-rose-500 hover:bg-rose-600 text-white shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-rose-500/40 outline-none"
          >
            {{ uiStore.confirmState.confirmText }}
          </button>
        </div>
        
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/ui'
import { AlertTriangle } from 'lucide-vue-next'

const uiStore = useUIStore()
const confirmBtn = ref<HTMLButtonElement | null>(null)

// Klavye Dinleyicisi
const handleKeyDown = (e: KeyboardEvent) => {
  // Sadece modal açıkken dinle
  if (!uiStore.confirmState.isOpen) return

  if (e.key === 'Enter') {
    e.preventDefault() // Sayfanın kaymasını veya başka formların tetiklenmesini önler
    uiStore.resolveConfirm(true)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    uiStore.resolveConfirm(false)
  }
}

// Global klavye event'lerini ekle ve çıkar
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// Modal açıldığında "Onayla" butonuna otomatik focus ol (görsel olarak belli olması için)
watch(() => uiStore.confirmState.isOpen, (isOpen) => {
  if (isOpen) {
    // DOM'un güncellenmesi için ufak bir gecikme
    setTimeout(() => {
      confirmBtn.value?.focus()
    }, 50)
  }
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>