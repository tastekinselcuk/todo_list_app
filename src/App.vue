<template>
  <div v-if="authStore.isLoading" class="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      <p class="text-muted-foreground mt-4 font-medium">Loading...</p>
    </div>
  </div>

  <LoginSignup v-else-if="!authStore.isAuthenticated" />

  <div v-else class="min-h-screen bg-gradient-to-br from-background to-muted relative">
    
    <div
      v-if="!isNavbarExpanded"
      class="fixed top-6 right-6 z-40 flex items-center gap-4 bg-card/70 backdrop-blur-md px-5 py-2.5 rounded-full shadow-sm border border-border/70 hover:bg-card/90 hover:shadow-md transition-all duration-300"
    >
      <div class="text-right hidden sm:block cursor-default">
        <p class="text-sm font-semibold text-foreground">{{ userEmail }}</p>
      </div>
      
      <div class="w-px h-5 bg-border hidden sm:block"></div>

      <!-- Theme Toggle Button -->
      <button
        @click="themeStore.toggleTheme"
        class="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
        :title="`Switch to ${themeStore.theme === 'light' ? 'dark' : 'light'} mode`"
      >
        <svg v-if="themeStore.theme === 'light'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
        </svg>
        <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.536l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm5.657-9.193a1 1 0 00-1.414 0l-.707.707A1 1 0 005.05 6.464l.707-.707a1 1 0 001.414 0zm2.828 9.193a1 1 0 011.414-1.414l.707.707a1 1 0 11-1.414 1.414l-.707-.707zM3 11a1 1 0 100-2H2a1 1 0 100 2h1z" clip-rule="evenodd"></path>
        </svg>
      </button>
      
      <button
        @click="handleLogout"
        class="text-sm font-medium text-muted-foreground hover:text-destructive transition-colors duration-200"
        title="Sign out"
      >
        Sign Out
      </button>
    </div>

    <div :class="['pb-8 px-6 transition-all duration-300', isNavbarExpanded ? 'pt-24' : 'pt-6']">
      <div class="max-w-4xl mx-auto space-y-8">
        <PomodoroTimer 
          :userEmail="userEmail"
          @logout="handleLogout"
          @expand="isNavbarExpanded = true"
          @collapse="isNavbarExpanded = false"
        />
        <TodoList />
        
        <AddTodoDialog
          v-model:open="showAddTodoDialog"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import TodoList from '@/components/TodoList.vue'
import AddTodoDialog from '@/components/AddTodoDialog.vue'
import LoginSignup from '@/components/LoginSignup.vue'
import PomodoroTimer from '@/components/PomodoroTimer.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const showAddTodoDialog = ref(false)
const isNavbarExpanded = ref(false)

// Extract just email local part for display (user@example.com -> user)
const userEmail = computed(() => {
  const email = authStore.user?.email || ''
  return email.split('@')[0] || email
})

onMounted(async () => {
  // Initialize theme from localStorage and system preference
  themeStore.initializeTheme()
  
  // Initialize auth state
  await authStore.initializeAuth()
  // Setup auth listener for session changes
  authStore.setupAuthListener()
})

const handleLogout = async () => {
  await authStore.logout()
  // Auth state change will trigger app to show LoginSignup component
}
</script>
