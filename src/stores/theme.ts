import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

type Theme = 'light' | 'dark'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>('light')

  // Initialize theme from localStorage
  const initializeTheme = () => {
    const savedTheme = localStorage.getItem('app-theme') as Theme | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    if (savedTheme) {
      theme.value = savedTheme
    } else if (prefersDark) {
      theme.value = 'dark'
    } else {
      theme.value = 'light'
    }

    applyTheme(theme.value)
  }

  // Apply theme to DOM
  const applyTheme = (newTheme: Theme) => {
    const html = document.documentElement
    
    if (newTheme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }

    localStorage.setItem('app-theme', newTheme)
  }

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme.value === 'light' ? 'dark' : 'light'
    theme.value = newTheme
    applyTheme(newTheme)
  }

  // Watch for system theme changes
  watch(
    () => theme.value,
    (newTheme) => {
      applyTheme(newTheme)
    }
  )

  return {
    theme,
    initializeTheme,
    toggleTheme,
    applyTheme,
  }
})
