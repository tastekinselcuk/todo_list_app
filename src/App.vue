<template>
  <div v-if="authStore.isLoading" class="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p class="text-muted-foreground mt-4 font-medium">{{ $t('app.loading') }}</p>
    </div>
  </div>

  <LoginSignup v-else-if="!authStore.isAuthenticated" />

  <div v-else class="min-h-screen bg-gradient-to-br from-background to-muted relative selection:bg-primary/30">
    
    <div
      v-if="!isNavbarExpanded"
      :class="[
        'fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-card/60 backdrop-blur-2xl px-2 py-2 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/20 dark:border-white/10 transition-all duration-500 ease-out',
        isNavbarVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-24 opacity-0 scale-95 pointer-events-none'
      ]"
    >
      <div class="flex items-center gap-1 bg-muted/40 p-1 rounded-full border border-border/50">
        <button
          @click="currentView = 'dashboard'"
          class="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300"
          :class="currentView === 'dashboard' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
        >
          <LayoutDashboard class="w-4 h-4" /> <span class="hidden sm:inline">{{ $t('app.home') }}</span>
        </button>
        
        <button
          @click="currentView = 'workspace'"
          class="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300"
          :class="currentView === 'workspace' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
        >
          <Briefcase class="w-4 h-4" /> <span class="hidden sm:inline">{{ $t('app.workspace') }}</span>
        </button>
        
        <button
          @click="currentView = 'settings'"
          class="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300"
          :class="currentView === 'settings' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
        >
          <Settings2 class="w-4 h-4" /> <span class="hidden sm:inline">{{ $t('app.settings') }}</span>
        </button>
      </div>

      <div class="w-px h-6 bg-border mx-2"></div>

      <button
        @click="themeStore.toggleTheme"
        class="p-2.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <svg v-if="themeStore.theme === 'light'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
        <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.536l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm5.657-9.193a1 1 0 00-1.414 0l-.707.707A1 1 0 005.05 6.464l.707-.707a1 1 0 001.414 0zm2.828 9.193a1 1 0 011.414-1.414l.707.707a1 1 0 11-1.414 1.414l-.707-.707zM3 11a1 1 0 100-2H2a1 1 0 100 2h1z" clip-rule="evenodd"></path></svg>
      </button>
      
      <button
        @click="handleLogout"
        class="p-2.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        :title="$t('app.signOut')"
      >
        <LogOut class="w-4 h-4" />
      </button>
    </div>

    <div :class="['pb-8 px-4 sm:px-6 transition-all duration-300', isNavbarExpanded ? 'pt-24' : 'pt-28']">
      
      <transition name="fade-slide" mode="out-in">
        
        <DashboardHome 
          v-if="currentView === 'dashboard'" 
          @enter-workspace="goToWorkspace" 
        />

        <div v-else-if="currentView === 'settings'" class="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <WorkspaceCustomizer />
        </div>

        <div 
          v-else-if="currentView === 'workspace'" 
          :class="[
            'mx-auto animate-in fade-in slide-in-from-bottom-4 transition-all duration-700 ease-out',
            settingsStore.isFullScreen ? 'max-w-[98%]' : 'max-w-5xl'
          ]"
        >
          <div class="space-y-8">
            <PomodoroTimer 
              v-if="settingsStore.isModuleActive('pomodoro')"
              :userEmail="userEmail"
              @logout="handleLogout"
              @expand="isNavbarExpanded = true"
              @collapse="isNavbarExpanded = false"
            />
            
            <WorkspaceTabs :initialTab="targetWorkspaceTab" />
            
          </div>
        </div>

      </transition>
    </div>

    <ToastContainer />
    <ConfirmModal />
    
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue' 
import { Settings2, LayoutDashboard, Briefcase, LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

import DashboardHome from '@/views/DashboardHome.vue'
import WorkspaceTabs from '@/views/WorkspaceTabs.vue'
import LoginSignup from '@/views/LoginSignup.vue'
import PomodoroTimer from "@/features/pomodoro/components/PomodoroTimer.vue"
import WorkspaceCustomizer from '@/views/WorkspaceCustomizer.vue'
import ToastContainer from '@/components/ui/ToastContainer.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const uiStore = useUIStore()
const { t } = useI18n()

const isNavbarExpanded = ref(false)
const currentView = ref<'dashboard' | 'workspace' | 'settings'>('dashboard')
const targetWorkspaceTab = ref('detailed')
const isNavbarVisible = ref(true)
let lastScrollPosition = 0

const handleScroll = () => {
  const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop
  if (currentScrollPosition < 0) return
  if (Math.abs(currentScrollPosition - lastScrollPosition) < 15) return

  if (currentScrollPosition > lastScrollPosition && currentScrollPosition > 50) {
    isNavbarVisible.value = false
  } else {
    isNavbarVisible.value = true
  }
  lastScrollPosition = currentScrollPosition
}

const userEmail = computed(() => {
  const email = authStore.user?.email || ''
  return email.split('@')[0] || email
})

const goToWorkspace = (moduleId: string) => {
  targetWorkspaceTab.value = moduleId
  currentView.value = 'workspace'
}

onMounted(async () => {
  themeStore.initializeTheme()
  await authStore.initializeAuth()
  authStore.setupAuthListener()
  if (authStore.isAuthenticated) {
    await settingsStore.loadSettings()
  }
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

watch(() => authStore.isAuthenticated, async (isAuth) => {
  if (isAuth) {
    await settingsStore.loadSettings()
  }
})

const handleLogout = async () => {
  const isConfirmed = await uiStore.showConfirm(
    t('app.signOut'),
    t('app.signOutConfirmDesc'),
    t('app.signOut'),
    t('common.cancel')
  )

  if (isConfirmed) {
    await authStore.logout()
    settingsStore.activeModules = ['detailed', 'quick', 'secure', 'code', 'pomodoro']
    settingsStore.isFullScreen = false
    currentView.value = 'dashboard'
    isNavbarVisible.value = true 
    
    uiStore.addToast(t('app.signOutSuccess'), 'success')
  }
}
</script>

<style>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.98);
}
</style>