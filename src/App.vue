<template>
  <div v-if="authStore.isLoading" class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      <p class="text-slate-600 mt-4 font-medium">Loading...</p>
    </div>
  </div>

  <LoginSignup v-else-if="!authStore.isAuthenticated" />

  <div v-else class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 relative">
    
    <div class="fixed top-6 right-6 z-40 flex items-center gap-4 bg-white/60 backdrop-blur-md px-5 py-2.5 rounded-full shadow-sm border border-slate-200/60 hover:bg-white/80 hover:shadow-md transition-all duration-300">
      <div class="text-right hidden sm:block cursor-default">
        <p class="text-sm font-semibold text-slate-800">{{ userEmail }}</p>
      </div>
      
      <div class="w-px h-5 bg-slate-300 hidden sm:block"></div>
      
      <button
        @click="handleLogout"
        class="text-sm font-medium text-slate-600 hover:text-red-600 transition-colors duration-200"
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
import TodoList from '@/components/TodoList.vue'
import AddTodoDialog from '@/components/AddTodoDialog.vue'
import LoginSignup from '@/components/LoginSignup.vue'
import PomodoroTimer from '@/components/PomodoroTimer.vue'

const authStore = useAuthStore()
const showAddTodoDialog = ref(false)
const isNavbarExpanded = ref(false)

// Extract just email local part for display (user@example.com -> user)
const userEmail = computed(() => {
  const email = authStore.user?.email || ''
  return email.split('@')[0] || email
})

onMounted(async () => {
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

<style>
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.bg-primary {
  background-color: #3b82f6;
}

.text-primary {
  color: #3b82f6;
}

.hover\:bg-primary\/90:hover {
  background-color: rgb(59 130 246 / 0.9);
}

.bg-accent {
  background-color: rgb(243 244 246);
}

.text-accent-foreground {
  color: rgb(17 24 39);
}

.border-input {
  border-color: rgb(229 231 235);
}
</style>