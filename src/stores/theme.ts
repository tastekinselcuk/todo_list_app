import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { useSettingsStore } from './settings'
import { applyThemeAppearance, type ThemePaletteId } from '@/lib/themePalettes'

type Theme = 'light' | 'dark'

export const useThemeStore = defineStore('theme', () => {
  const settings = useSettingsStore()
  const theme = computed({ get: () => settings.theme, set: value => { settings.theme = value } })
  const palette = computed({ get: () => settings.themePalette, set: (value: ThemePaletteId) => { settings.themePalette = value } })

  // Preferences hydrate locally first, then synchronize with the account.
  const initializeTheme = () => {
    applyTheme(theme.value)
  }

  // Apply theme to DOM
  const applyTheme = (newTheme: Theme) => {
    if (typeof document !== 'undefined') applyThemeAppearance(document.documentElement, newTheme, palette.value)
  }

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme.value === 'light' ? 'dark' : 'light'
    theme.value = newTheme
    applyTheme(newTheme)
  }

  // Apply changes from either the controls or account synchronization.
  watch(
    [() => theme.value, () => palette.value],
    () => { applyTheme(theme.value) }, { immediate: true, flush: 'sync' }
  )

  return {
    theme,
    palette,
    initializeTheme,
    toggleTheme,
    applyTheme,
  }
})
