import { createI18n } from 'vue-i18n'
import en from './locales/en'
import tr from './locales/tr'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: localStorage.getItem('ui_language') || 'en', 
  fallbackLocale: 'en', 
  messages: {
    en,
    tr
  }
})