// src/stores/ui.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}

export const useUIStore = defineStore('ui', () => {
  // ==========================================
  // 🍞 TOAST NOTIFICATION SİSTEMİ
  // ==========================================
  const toasts = ref<Toast[]>([])

  const addToast = (message: string, type: Toast['type'] = 'info', duration = 3000) => {
    // Benzersiz bir ID oluşturuyoruz
    const id = Math.random().toString(36).substring(2, 9)
    toasts.value.push({ id, message, type, duration })

    // Süre dolunca bildirimi otomatik kaldır
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  const removeToast = (id: string) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  // ==========================================
  // 🛑 CONFIRM MODAL SİSTEMİ
  // ==========================================
  const confirmState = ref({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    resolvePromise: null as ((value: boolean) => void) | null,
  })

  // Bu fonksiyon bir Promise döndürür, böylece await ile bekleyebiliriz!
  // Örn: const isConfirmed = await showConfirm("Sil?", "Emin misin?")
  const showConfirm = (title: string, message: string, confirmText = 'Confirm', cancelText = 'Cancel'): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmState.value = {
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        resolvePromise: resolve
      }
    })
  }

  const resolveConfirm = (result: boolean) => {
    if (confirmState.value.resolvePromise) {
      confirmState.value.resolvePromise(result)
    }
    confirmState.value.isOpen = false
  }

  return {
    toasts,
    addToast,
    removeToast,
    confirmState,
    showConfirm,
    resolveConfirm
  }
})