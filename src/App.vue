<template>
  <div v-if="initializingAuth" class="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p class="text-muted-foreground mt-4 font-medium">{{ $t('app.loading') }}</p>
    </div>
  </div>

  <LoginSignup v-else-if="!authStore.isAuthenticated" />

  <div v-else-if="!workspaces.loaded || workspaces.scopeReady === false" class="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-6">
    <div class="max-w-md space-y-4 text-center">
      <p class="text-sm text-muted-foreground">{{ workspaces.error || workspaces.sharingError ? $t('workspaces.loadFailed') : $t('app.loading') }}</p>
      <button v-if="workspaces.error || workspaces.sharingError" type="button" :disabled="workspaces.busy" class="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground" @click="workspaces.loaded ? workspaces.refreshBindings(workspaces.activeId, true) : workspaces.load()">{{ $t('workspaces.retry') }}</button>
      <button v-if="workspaces.error || workspaces.sharingError" type="button" class="ml-3 text-xs text-muted-foreground" @click="authStore.logout()">{{ $t('app.signOut') }}</button>
    </div>
  </div>

  <div v-else class="min-h-screen bg-gradient-to-br from-background to-muted relative selection:bg-primary/30">
    
    <AppNavigation
      :active-view="currentView"
      :visible="isNavbarVisible"
      :docked="isTimerDocked"
      @navigate="navigate"
      @reveal="revealNavigation"
    />

    <UserProfileMenu :active-view="currentView" :visible="isNavbarVisible" :docked="isTimerDocked" @edit="openAccountSettings" @logout="handleLogout('local')" @reveal="revealNavigation" />

    <div class="app-content pb-8 px-4 sm:px-6" :style="{ paddingTop: isTimerDocked ? '5.5rem' : '7rem' }">

      <div v-show="(currentView === 'workspace' && settingsStore.isModuleActive('pomodoro')) || isTimerDocked || hasActiveFocus" class="pomodoro-host mx-auto grid" :style="{ gridTemplateRows: isTimerDocked ? '0fr' : '1fr' }" :class="[isTimerDocked ? 'mb-0' : 'mb-6', settingsStore.isFullScreen ? 'max-w-[98%]' : 'max-w-5xl']">
        <div class="min-h-0 overflow-hidden">
          <PomodoroTimer :navbar-visible="isNavbarVisible" :docked="isTimerDocked" @expand="isNavbarExpanded = true" @collapse="restoreTimerCard" @focus-task="openFocusTask" />
        </div>
      </div>
      
      <transition name="fade-slide" mode="out-in">
        
        <DashboardHome 
          v-if="currentView === 'dashboard'" 
          :key="workspaces.sessionKey"
          @enter-workspace="goToWorkspace" 
          @manage-workspaces="currentView = 'settings'"
          @open-analytics="navigate('analytics')"
        />

        <AnalyticsView v-else-if="currentView === 'analytics'" :initial-section="analyticsSection" @enter-workspace="goToWorkspace" />

        <div v-else-if="currentView === 'settings'" class="min-w-0">
          <WorkspaceCustomizer :focus-account="accountFocusRequest" @logout="handleLogout" />
        </div>

        <div 
          v-else-if="currentView === 'workspace'" 
          :class="[
            'mx-auto min-w-0 transition-[max-width] duration-300 ease-out motion-reduce:transition-none',
            settingsStore.isFullScreen ? 'max-w-[98%]' : 'max-w-5xl'
          ]"
        >
          <div class="space-y-8">
            <WorkspaceTabs :key="workspaces.sessionKey" :initialTab="targetWorkspaceTab" @manage-workspaces="currentView = 'settings'" @open-finance-analysis="openFinanceAnalysis" />
            
          </div>
        </div>

      </transition>
    </div>

    <ToastContainer />
    <ConfirmModal />
    <SharingDialog />
    
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import AppNavigation from '@/components/ui/AppNavigation.vue'
import UserProfileMenu from '@/components/ui/UserProfileMenu.vue'
import { createNavigationScrollState, updateNavigationScroll } from '@/lib/navigationScroll'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import { useWorkspacesStore } from '@/stores/workspaces'
import { startWorkspaceReminders } from '@/lib/workspaceReminders'
import { useSharingStore } from '@/stores/sharing'
import SharingDialog from '@/components/SharingDialog.vue'

import DashboardHome from '@/views/DashboardHome.vue'
import AnalyticsView from '@/views/AnalyticsView.vue'
import WorkspaceTabs from '@/views/WorkspaceTabs.vue'
import LoginSignup from '@/views/LoginSignup.vue'
import PomodoroTimer from "@/features/pomodoro/components/PomodoroTimer.vue"
import { usePomodoroStore } from '@/features/pomodoro/stores/pomodoro'
import WorkspaceCustomizer from '@/views/WorkspaceCustomizer.vue'
import ToastContainer from '@/components/ui/ToastContainer.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

const authStore = useAuthStore()
const initializingAuth = ref(true)
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const uiStore = useUIStore()
const workspaces = useWorkspacesStore()
const focusTimer = usePomodoroStore()
const sharing = useSharingStore()
const { t } = useI18n()

const isNavbarExpanded = computed({ get: () => settingsStore.isPomodoroDocked, set: value => { settingsStore.isPomodoroDocked = value } })
const currentView = ref<'dashboard' | 'workspace' | 'analytics' | 'settings'>('workspace')
const analyticsSection=ref<'activity'|'finance'>('activity')
function openFinanceAnalysis(){navigate('analytics');analyticsSection.value='finance'}
const hasActiveFocus = computed(() => focusTimer.isRunning || focusTimer.remote || focusTimer.activeSession?.status === 'paused')
const isTimerDocked = computed(() => (isNavbarExpanded.value && settingsStore.isModuleActive('pomodoro')) || (hasActiveFocus.value && currentView.value !== 'workspace'))
const targetWorkspaceTab = ref<string | undefined>()
const accountFocusRequest = ref(0)
function openAccountSettings() { accountFocusRequest.value++; navigate('settings') }
const isNavbarVisible = ref(true)
let navigationScroll = createNavigationScrollState()
let scrollFrame = 0
let stopReminders: (() => void) | undefined
let stopAuthListener: (() => void) | undefined
watch(() => `${authStore.user?.id || ''}:${workspaces.loaded}:${workspaces.sharingAvailable}`, () => {
  stopReminders?.()
  sharing.stop()
  if (workspaces.loaded) sharing.start()
  stopReminders = workspaces.loaded ? startWorkspaceReminders((key, params) => t(key, params || {})) : undefined
})

function revealNavigation() {
  navigationScroll = createNavigationScrollState(window.scrollY)
  isNavbarVisible.value = true
}
function handleScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const focused = Boolean(document.activeElement?.matches(':focus-visible') && document.activeElement.closest('[data-app-navigation], [data-pomodoro-navigation], [data-user-profile]'))
    isNavbarVisible.value = updateNavigationScroll(navigationScroll, window.scrollY, focused)
  })
}
function handleNavigationKey(event: KeyboardEvent) {
  if (event.key === 'Tab') revealNavigation()
}
function handleSharingConflict() { uiStore.addToast(t('sharing.conflict'), 'warning') }
function handleSharingSaveError() { uiStore.addToast(t('sharing.errors.SAVE_FAILED'), 'error') }
function navigate(view: 'dashboard' | 'workspace' | 'analytics' | 'settings') {
  if(view==='analytics')analyticsSection.value='activity'
  revealNavigation()
  if (view === 'workspace') targetWorkspaceTab.value = undefined
  currentView.value = view
}
function restoreTimerCard() {isNavbarExpanded.value=false;if(currentView.value!=='workspace')navigate('workspace')}
watch(isNavbarExpanded, revealNavigation)
watch(currentView, async () => {
  revealNavigation()
  await nextTick()
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
})

const goToWorkspace = (moduleId: string) => {
  targetWorkspaceTab.value = moduleId
  currentView.value = 'workspace'
}
async function openFocusTask(wid: string) {
  if (!workspaces.available.some(item => item.id === wid)) return
  workspaces.switchTo(wid)
  await nextTick()
  goToWorkspace('pomodoro')
}

onMounted(async () => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('keydown', handleNavigationKey)
  window.addEventListener('sharing-conflict', handleSharingConflict)
  window.addEventListener('sharing-save-error', handleSharingSaveError)
  themeStore.initializeTheme()
  try {
    stopAuthListener = authStore.setupAuthListener()
    await authStore.initializeAuth()
  } finally { initializingAuth.value = false }
})

onUnmounted(() => {
  stopAuthListener?.()
  stopReminders?.()
  sharing.stop()
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('keydown', handleNavigationKey)
  window.removeEventListener('sharing-conflict', handleSharingConflict)
  window.removeEventListener('sharing-save-error', handleSharingSaveError)
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
})

watch(() => authStore.user?.id, async (id) => {
  workspaces.reset()
  targetWorkspaceTab.value = undefined
  if (id) await workspaces.load()
}, { immediate: true, flush: 'sync' })
watch(() => workspaces.activeId, () => { targetWorkspaceTab.value = undefined; uiStore.resolveConfirm(false) })

const handleLogout = async (scope: 'local' | 'global' = 'local') => {
  const isConfirmed = await uiStore.showConfirm(
    t('app.signOut'),
    t(scope === 'global' ? 'account.signOutAllConfirm' : 'app.signOutConfirmDesc'),
    t('app.signOut'),
    t('common.cancel')
  )

  if (isConfirmed) {
    void settingsStore.flushPreferences()
    const result = await authStore.logout(scope)
    if (!result.success) { uiStore.addToast(t('account.errors.SIGN_OUT_FAILED'), 'error'); return }
    currentView.value = 'dashboard'
    isNavbarVisible.value = true 
    
    uiStore.addToast(t('app.signOutSuccess'), 'success')
  }
}
</script>

<style>
.app-content { transition: padding-top 260ms cubic-bezier(.22,1,.36,1); }
.pomodoro-host { transition: grid-template-rows 240ms cubic-bezier(.22,1,.36,1), margin-bottom 240ms cubic-bezier(.22,1,.36,1); }
.fade-slide-enter-active { transition: opacity 220ms ease, transform 220ms cubic-bezier(.22,1,.36,1); }
.fade-slide-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.fade-slide-enter-from { opacity: 0; transform: translateY(8px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-5px); }
@media (prefers-reduced-motion: reduce) {
  .app-content, .pomodoro-host, .fade-slide-enter-active, .fade-slide-leave-active { transition: none; }
  .fade-slide-enter-from, .fade-slide-leave-to { transform: none; }
}
</style>
