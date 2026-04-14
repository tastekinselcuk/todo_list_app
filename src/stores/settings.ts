import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './auth'
import { i18n } from '@/i18n'
import { supabase } from '@/lib/supabase'

export const useSettingsStore = defineStore('settings', () => {
  const authStore = useAuthStore()

  // ==========================================
  // 1. YEREL AYARLAR (LocalStorage)
  // ==========================================
  
  // Tarayıcı hafızasından ayarları çek (Yenilemede kaybolmaması için)
  const isFullScreen = ref(localStorage.getItem('ui_fullScreen') === 'true')
  const language = ref(localStorage.getItem('ui_language') || 'en')

  // Değişiklik anında otomatik olarak LocalStorage'a kaydet
  watch(isFullScreen, (newVal) => {
    localStorage.setItem('ui_fullScreen', String(newVal))
  })

  watch(language, (newVal) => {
    localStorage.setItem('ui_language', newVal)
    // Vue-i18n locale'i güncelle
    if (i18n.global) {
      i18n.global.locale.value = newVal
    }
  })


  // ==========================================
  // 2. MODÜL AYARLARI (Supabase)
  // ==========================================

  // Varsayılan modüller (Yeni kayıt olanlar veya veritabanında ayarı olmayanlar için)
  const defaultModules = [
    'detailed', 
    'quick', 
    'secure', 
    'code', 
    'pomodoro', 
    'learning', 
    'flashcards', 
    'workout',
    'periodic'
  ]
  const activeModules = ref<string[]>([...defaultModules])
  const isSettingsLoaded = ref(false)

  // Supabase'den ayarları yükle
  const loadSettings = async () => {
    if (!authStore.user) return
    
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('active_modules')
        .eq('user_id', authStore.user.id)
        .single()

      // PGRST116 hatası "Kayıt bulunamadı" demektir, bu ilk giriştir, normaldir.
      if (error && error.code !== 'PGRST116') throw error

      if (data && data.active_modules) {
        // Veritabanında ayar varsa onu kullan
        activeModules.value = data.active_modules
      } else {
        // Veritabanında ayar yoksa (ilk giriş), varsayılanları kaydet
        activeModules.value = [...defaultModules]
        await saveSettingsToDb([...defaultModules])
      }
    } catch (err) {
      console.error('Ayarlar yüklenirken hata oluştu:', err)
    } finally {
      isSettingsLoaded.value = true
    }
  }

  // Arka planda sessizce Supabase'e kaydet (Optimistic UI için)
  const saveSettingsToDb = async (modules: string[]) => {
    if (!authStore.user) return
    
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ 
          user_id: authStore.user.id, 
          active_modules: modules,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
    } catch (err) {
      console.error('Ayarlar kaydedilirken hata oluştu:', err)
    }
  }

  // Modülü Aç / Kapat
  const toggleModule = (id: string, isRequired = false) => {
    if (isRequired) return // Zorunlu modüller kapatılamaz
    
    const index = activeModules.value.indexOf(id)
    if (index > -1) {
      activeModules.value.splice(index, 1) // Kapat
    } else {
      activeModules.value.push(id) // Aç
    }

    // Arayüz anında güncellenir, biz de arka planda veritabanına yollarız
    saveSettingsToDb(activeModules.value)
  }

  // Belirli bir modül açık mı?
  const isModuleActive = (id: string) => activeModules.value.includes(id)

  return { 
    // State
    activeModules, 
    isSettingsLoaded,
    isFullScreen,
    language,
    
    // Actions
    loadSettings, 
    toggleModule, 
    isModuleActive 
  }
})