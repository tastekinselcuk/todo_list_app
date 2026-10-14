import { createI18n } from 'vue-i18n'
import en from './locales/en'
import tr from './locales/tr'
import { supportedLanguage } from '@/lib/storage'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: supportedLanguage(),
  fallbackLocale: 'en', 
  messages: {
    en,
    tr
  }
})
