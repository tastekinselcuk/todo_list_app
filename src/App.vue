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
      v-if="!isTimerDocked"
      :active-view="currentView"
      :visible="isNavbarVisible"
      :docked="isTimerDocked"
      :attached="workspacePinned"
      :header-offset="headerOffset"
      :workspace="true"
      @navigate="navigate"
      @reveal="revealNavigation"
    />

    <UserProfileMenu v-if="!isTimerDocked" :active-view="currentView" :visible="isNavbarVisible" :docked="false" :attached="workspacePinned" :header-offset="headerOffset" @edit="openAccountSettings" @logout="handleLogout('local')" @reveal="revealNavigation" />

    <div class="app-content workspace-layout px-4 sm:px-6" :data-workspace-wide="settingsStore.isFullScreen ? '' : undefined" :data-page-layout="currentView !== 'workspace' ? '' : undefined" :class="currentView === 'workspace' ? 'pb-0' : 'pb-8'" :style="{ paddingTop: isTimerDocked ? '5rem' : isCalendarWorkspace || currentView === 'settings' ? '5.25rem' : '7rem' }">

      <div v-show="showTimerCard || isTimerDocked || hasActiveFocus" class="pomodoro-host mx-auto grid" :style="{ gridTemplateRows: isTimerDocked ? '0fr' : '1fr' }" :class="[isTimerDocked ? 'mb-0' : 'mb-6', settingsStore.isFullScreen ? 'max-w-[98%]' : 'max-w-5xl']">
        <div class="min-h-0 overflow-hidden">
          <PomodoroTimer :navbar-visible="isNavbarVisible" :docked="isTimerDocked" :attached="workspacePinned" :header-offset="headerOffset" @expand="isNavbarExpanded = true" @collapse="restoreTimerCard" @focus-task="openFocusTask">
            <template #navigation><AppNavigation :embedded="true" :active-view="currentView" :visible="isNavbarVisible" :docked="true" @navigate="navigate" @reveal="revealNavigation" /></template>
            <template #profile><UserProfileMenu :embedded="true" :active-view="currentView" :visible="isNavbarVisible" :docked="true" @edit="openAccountSettings" @logout="handleLogout('local')" @reveal="revealNavigation" /></template>
          </PomodoroTimer>
        </div>
      </div>
      
      <transition name="fade-slide" mode="out-in">
        
        <DashboardHome 
          v-if="currentView === 'dashboard'" 
          :key="workspaces.sessionKey"
          @enter-workspace="goToWorkspace" 
          @manage-workspaces="openWorkspaceSettings"
          @open-analytics="navigate('analytics')"
        />

        <AnalyticsView v-else-if="currentView === 'analytics'" :initial-section="analyticsSection" @enter-workspace="goToWorkspace" />

        <div v-else-if="currentView === 'settings'" class="min-w-0">
          <WorkspaceCustomizer :focus-account="accountFocusRequest" :initial-section="settingsSection" @logout="handleLogout" />
        </div>

        <div 
          v-else-if="currentView === 'workspace'" 
          :class="[
            'workspace-width-transition mx-auto w-full min-w-0',
            settingsStore.isFullScreen ? 'max-w-[98%]' : 'max-w-5xl'
          ]"
        >
          <div class="space-y-8">
            <WorkspaceTabs :key="workspaces.sessionKey" :initialTab="targetWorkspaceTab" :initial-view="targetWorkspaceView" :navigation-request="workspaceNavigationRequest" :header-inset="isNavbarVisible ? workspaceHeaderHeight : 0" @pinned="workspacePinned = $event" @header-offset="headerOffset = $event" @active-module="rememberWorkspaceModule" @active-view="rememberWorkspaceView" @manage-workspaces="openWorkspaceSettings" @open-finance-analysis="openFinanceAnalysis" />
            
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
import { createNavigationScrollState, updateNavigationScroll, workspaceHeaderHeight } from '@/lib/navigationScroll'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import { useWorkspacesStore } from '@/stores/workspaces'
import { startWorkspaceReminders } from '@/lib/workspaceReminders'
import { useSharingStore } from '@/stores/sharing'
import { workspaceSectionFor } from '@/lib/workspaceSections'
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
watch(() => `${authStore.user?.id || ''}:${authStore.sessionPersistent}`, () => {
  if (authStore.user && authStore.sessionPersistent === false) uiStore.addToast(t('auth.sessionTemporary'), 'warning')
})

const isNavbarExpanded = computed({ get: () => settingsStore.isPomodoroDocked, set: value => { settingsStore.isPomodoroDocked = value } })
const currentView = ref<'dashboard' | 'workspace' | 'analytics' | 'settings'>('workspace')
const currentWorkspaceModule = ref('plans')
const currentWorkspaceView = ref<string>()
const isCalendarWorkspace=computed(()=>currentView.value==='workspace' && currentWorkspaceModule.value==='tasks' && currentWorkspaceView.value==='calendar')
function rememberWorkspaceModule(module:string){
  if(currentWorkspaceModule.value!==module){currentWorkspaceView.value=undefined;targetWorkspaceView.value=undefined}
  currentWorkspaceModule.value=module
  targetWorkspaceTab.value=undefined
}
function rememberWorkspaceView(module:string,view:string){if(currentWorkspaceModule.value===module){currentWorkspaceView.value=view;targetWorkspaceView.value=undefined}}
const workspacePinned = ref(false)
const headerOffset = ref(workspaceHeaderHeight)
const analyticsSection=ref<'activity'|'finance'>('activity')
function openFinanceAnalysis(){navigate('analytics');analyticsSection.value='finance'}
const hasActiveFocus = computed(() => focusTimer.canReset || focusTimer.starting || focusTimer.clearing)
const showTimerCard = computed(() => currentView.value === 'workspace' && settingsStore.isModuleActive('pomodoro') && ['notes','learning'].includes(workspaceSectionFor(currentWorkspaceModule.value) || ''))
const isTimerDocked = computed(() => (isNavbarExpanded.value && settingsStore.isModuleActive('pomodoro')) || (hasActiveFocus.value && !showTimerCard.value))
const targetWorkspaceTab = ref<string | undefined>()
const targetWorkspaceView = ref<string>()
const workspaceNavigationRequest = ref(0)
const accountFocusRequest = ref(0)
const settingsSection=ref('general')
function openAccountSettings() { accountFocusRequest.value++; navigate('settings');settingsSection.value='account' }
function openWorkspaceSettings() { navigate('settings');settingsSection.value='workspaces' }
const isNavbarVisible = ref(true)
const workspaceScrollDistances = { reveal: 40, hide: 56 }
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
    const focused = Boolean(document.activeElement?.matches(':focus-visible') && document.activeElement.closest('[data-app-navigation], [data-pomodoro-navigation], [data-user-profile], [data-workspace-rail]'))
    isNavbarVisible.value = updateNavigationScroll(navigationScroll, window.scrollY, focused, currentView.value === 'workspace' ? workspaceScrollDistances : undefined)
  })
}
function handleNavigationKey(event: KeyboardEvent) {
  if (event.key === 'Tab') revealNavigation()
}
function handleSharingConflict() { uiStore.addToast(t('sharing.conflict'), 'warning') }
function handleSharingSaveError() { uiStore.addToast(t('sharing.errors.SAVE_FAILED'), 'error') }
function navigate(view: 'dashboard' | 'workspace' | 'analytics' | 'settings') {
  if(view==='analytics')analyticsSection.value='activity'
  if(view==='settings')settingsSection.value='general'
  revealNavigation()
  currentView.value = view
}
function restoreTimerCard() {isNavbarExpanded.value=false;if(!showTimerCard.value)goToWorkspace('pomodoro')}
watch(isNavbarExpanded, revealNavigation)
watch(currentView, async () => {
  workspacePinned.value = false
  revealNavigation()
  await nextTick()
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
})

const goToWorkspace = (moduleId: string) => {
  if(currentWorkspaceModule.value!==moduleId)currentWorkspaceView.value=undefined
  currentWorkspaceModule.value = moduleId
  targetWorkspaceTab.value = moduleId
  targetWorkspaceView.value = undefined
  workspaceNavigationRequest.value++
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

watch(() => authStore.user?.id, async (id, previous) => {
  if (previous && previous !== id) uiStore.clearUndoToasts()
  workspaces.reset()
  targetWorkspaceTab.value = undefined
  targetWorkspaceView.value = undefined;currentWorkspaceView.value=undefined
  if (id) await workspaces.load()
}, { immediate: true, flush: 'sync' })
watch(() => workspaces.activeId, (id,previous) => {
  const enabled=workspaces.available?.find(item=>item.id===id)?.active_modules || []
  const carry=Boolean(previous&&id&&enabled.includes(currentWorkspaceModule.value))
  targetWorkspaceTab.value=carry?currentWorkspaceModule.value:undefined
  targetWorkspaceView.value=carry?currentWorkspaceView.value:undefined
  if(!carry){currentWorkspaceModule.value='plans';currentWorkspaceView.value=undefined}
  uiStore.resolveConfirm(false)
}, {flush:'sync'})

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
:root { --workspace-rail-open-width:224px; }
.app-content { transition: padding-top 260ms cubic-bezier(.22,1,.36,1), padding-left 240ms cubic-bezier(.22,1,.36,1), padding-right 240ms cubic-bezier(.22,1,.36,1); }
.workspace-width-transition, .page-width-transition { transition: max-width 300ms cubic-bezier(.22,1,.36,1); }
.pomodoro-host { transition: grid-template-rows 240ms cubic-bezier(.22,1,.36,1), margin-bottom 240ms cubic-bezier(.22,1,.36,1); }
@media (min-width:1024px) {
  body:has([data-workspace-rail]) { --workspace-sidebar-inset:104px; --workspace-content-shift:calc((var(--workspace-sidebar-inset) - 24px) / 2); }
  /* Third width: the pinned rail's 12px offset + its width + a 16px gap, mirrored on the right. */
  body:has(.workspace-layout[data-workspace-wide]):has([data-workspace-rail][data-pinned-open]),
  body:has(.workspace-layout[data-page-layout]):has([data-workspace-rail][data-pinned-open]) {
    --workspace-sidebar-inset:calc(var(--workspace-rail-open-width) + 28px);
    --workspace-right-inset:var(--workspace-sidebar-inset);
    --workspace-content-shift:0px;
    --workspace-wide-max:100%;
  }
  .app-content.workspace-layout { padding-left:var(--workspace-sidebar-inset,104px); padding-right:var(--workspace-right-inset,24px); }
  .workspace-layout[data-workspace-wide] .workspace-width-transition,
  .workspace-layout[data-workspace-wide] .page-width-transition,
  .workspace-layout[data-workspace-wide] .pomodoro-host { max-width:var(--workspace-wide-max,98%); }
  body:has(.workspace-layout[data-workspace-wide]):has([data-workspace-rail][data-pinned-open]) .pomodoro-dock,
  body:has(.workspace-layout[data-page-layout]):has([data-workspace-rail][data-pinned-open]) .pomodoro-dock { right:var(--workspace-right-inset); }
  body:has([data-workspace-rail]) #pomodoro-dock-controls { left:calc(var(--workspace-sidebar-inset,104px) + 20px); }
}
.fade-slide-enter-active { transition: opacity 220ms ease, transform 220ms cubic-bezier(.22,1,.36,1); }
.fade-slide-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.fade-slide-enter-from { opacity: 0; transform: translateY(8px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-5px); }
@media (prefers-reduced-motion: reduce) {
  .app-content, .workspace-width-transition, .page-width-transition, .pomodoro-host, .fade-slide-enter-active, .fade-slide-leave-active { transition: none; }
  .fade-slide-enter-from, .fade-slide-leave-to { transform: none; }
}
</style>
