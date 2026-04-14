<template>
  <transition name="teleportLift">
    <div
      v-if="!isExpanded"
      key="compact"
      data-teleport="compact"
      class="bg-card/50 backdrop-blur-xl text-card-foreground p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border/50 relative max-w-sm mx-auto w-full transition-all duration-300 group/pomodoro flex flex-col items-center"
    >
      <div class="w-full flex flex-col items-center gap-4 mb-6">        
        <div class="flex gap-1 p-1 bg-muted/50 rounded-full border border-border/50 items-center justify-center">
          <button
            v-for="mode in modes"
            :key="mode.name"
            @click="setMode(mode)"
            @context-menu.prevent="openCustomizeDialog"
            :title="$t('pomodoro.rightClickSetup')"
            class="px-3.5 py-1 text-[11px] font-semibold rounded-full transition-all duration-300 tabular-nums"
            :class="[
              currentMode.name === mode.name
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            ]"
          >
            {{ mode.name }}
          </button>
        </div>
      </div>

      <div class="flex flex-col items-center justify-center py-2 w-full border-y border-border/30 mb-5">
        <div
          class="text-6xl font-thin tabular-nums tracking-tighter text-foreground cursor-pointer select-none transition-colors hover:text-primary duration-300"
          @click="clickTimerCustomize"
          :title="$t('pomodoro.clickSetup')"
        >
          {{ formattedTime }}
        </div>
      </div>

      <div class="flex justify-center gap-3 w-full">
        <button
          @click="toggleTimer"
          class="flex-1 py-2.5 rounded-xl font-semibold transition-all duration-300 shadow-sm flex items-center justify-center gap-2 text-xs"
          :class="[
            isRunning 
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/30' 
              : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md'
          ]"
        >
          {{ isRunning ? $t('pomodoro.pause') : $t('pomodoro.start') }}
        </button>
        <button
          @click="resetTimer"
          class="flex-1 py-2.5 rounded-xl border border-input bg-background/50 text-foreground hover:bg-muted transition-all duration-300 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!canReset"
        >
          {{ $t('pomodoro.reset') }}
        </button>
      </div>

      <button
        @click="() => { isExpanded = true; emit('expand') }"
        class="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-all duration-300 opacity-0 group-hover/pomodoro:opacity-100 scale-90 group-hover/pomodoro:scale-100"
        :title="$t('pomodoro.expandToNavbar')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
    </div>

    <div
      v-else
      key="expanded"
      data-teleport="expanded"
      :class="[
        'fixed left-0 right-0 bg-card/60 backdrop-blur-2xl border-b border-border shadow-sm z-40 transition-all duration-500 ease-in-out',
        isNavbarVisible ? 'top-0 translate-y-0' : 'top-0 -translate-y-full'
      ]"
    >
      <div class="max-w-full px-5 py-2 flex items-center justify-between gap-6 relative">
        <div class="flex items-center gap-3 flex-shrink-0">
          <div class="p-1.5 bg-primary/10 text-primary rounded-lg ring-1 ring-primary/20">
            <Timer class="h-4 w-4" />
          </div>
          <div class="flex items-center gap-2">
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-0.5">{{ $t('pomodoro.focusTime') }}</p>
            <p class="text-xl font-medium tracking-tight text-foreground tabular-nums">{{ formattedTime }}</p>
          </div>
        </div>

        <div class="flex gap-1 p-0.5 bg-muted/40 backdrop-blur-md rounded-full border border-border/50 hidden lg:flex items-center">
          <button
            v-for="mode in modes"
            :key="mode.name"
            @click="setMode(mode)"
            @context-menu.prevent="openCustomizeDialog"
            :title="$t('pomodoro.rightClickSetup')"
            class="px-3 py-1 text-[10px] font-semibold rounded-full transition-all duration-300"
            :class="[
              currentMode.name === mode.name
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/30'
            ]"
          >
            {{ mode.name }}
          </button>
        </div>

        <div class="flex items-center gap-3 flex-shrink-0">
          <div class="flex items-center gap-1.5 bg-muted/40 rounded-full p-0.5 border border-border/50">
            <button
              @click="toggleTimer"
              class="px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-300"
              :class="[
                isRunning 
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 ring-1 ring-amber-500/30' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              ]"
            >
              {{ isRunning ? $t('pomodoro.pause') : $t('pomodoro.start') }}
            </button>
            <button
              @click="resetTimer"
              class="px-3 py-1 rounded-full text-[11px] font-medium bg-transparent text-foreground hover:bg-background transition-colors disabled:opacity-40"
              :disabled="!canReset"
            >
              {{ $t('pomodoro.reset') }}
            </button>
            <button
              @click="() => { isExpanded = false; emit('collapse') }"
              class="p-1.5 hover:bg-background rounded-full transition-colors text-muted-foreground hover:text-foreground"
              :title="$t('pomodoro.collapse')"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>

          <div class="flex items-center gap-3 bg-muted/40 p-0.5 rounded-full border border-border/50 hidden sm:flex text-xs">
            <div class="pl-2.5 pr-1.5 cursor-default font-semibold text-foreground border-r border-border/50">
              {{ userEmail || 'User' }}
            </div>
            <button
              @click="themeStore.toggleTheme"
              class="p-1.5 rounded-full hover:bg-background transition-colors text-muted-foreground"
            >
              <svg v-if="themeStore.theme === 'light'" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.536l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm5.657-9.193a1 1 0 00-1.414 0l-.707.707A1 1 0 005.05 6.464l.707-.707a1 1 0 001.414 0zm2.828 9.193a1 1 0 011.414-1.414l.707.707a1 1 0 11-1.414 1.414l-.707-.707zM3 11a1 1 0 100-2H2a1 1 0 100 2h1z" clip-rule="evenodd"></path>
              </svg>
            </button>
            <button
              @click="emit('logout')"
              class="pr-3 pl-1 text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors"
              :title="$t('app.signOut')"
            >
              {{ $t('app.signOut') }}
            </button>
          </div>
        </div>
      </div>
      
      <div class="absolute bottom-0 left-0 w-full h-[3px] bg-transparent overflow-hidden">
        <div 
          class="h-full transition-all duration-1000 ease-linear"
          :class="isRunning ? 'bg-primary' : 'bg-muted-foreground/30'"
          :style="{ width: `${progressPercentage}%` }"
        ></div>
      </div>
    </div>
  </transition>

  <dialog
    ref="customizeDialog"
    class="pomodoro-dialog w-[90vw] max-w-sm rounded-3xl border border-border/50 bg-card/80 backdrop-blur-2xl text-card-foreground shadow-2xl overflow-hidden"
  >
    <div class="p-6 space-y-5">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
        <h2 class="text-base font-bold tracking-tight text-foreground">{{ $t('pomodoro.timerPresets') }}</h2>
        <button
          @click="customizeDialog?.close()"
          class="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="space-y-1.5">
        <button
          v-for="preset in presetCards"
          :key="preset.id"
          type="button"
          @click="selectDraftPreset(preset.id)"
          class="w-full text-left rounded-xl border px-3.5 py-2.5 transition-all duration-200 flex items-center gap-3"
          :class="
            draftPreset === preset.id
              ? 'border-primary bg-primary/5 shadow-inner'
              : 'border-border/50 bg-background/30 hover:border-primary/30 hover:bg-background/50'
          "
        >
          <span class="preset-radio" :data-selected="draftPreset === preset.id ? 'true' : 'false'"></span>
          <span class="flex-1 flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-foreground">{{ preset.name }}</span>
            <span class="text-[10px] font-medium text-muted-foreground tabular-nums bg-muted px-2 py-0.5 rounded">{{ preset.summary }}</span>
          </span>
        </button>
      </div>

      <transition name="customPanel">
        <div
          v-if="draftPreset === 'custom'"
          class="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-4"
        >
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-muted-foreground">{{ $t('pomodoro.focus') }}</span>
              <span class="font-bold text-foreground tabular-nums bg-background px-2 py-0.5 rounded border border-border/50">{{ draftCustomDurations.focus }}m</span>
            </div>
            <input
              id="custom-focus"
              v-model.number="draftCustomDurations.focus"
              type="range"
              min="10"
              max="90"
              step="1"
              class="modern-range"
              :style="`--range-progress: ${(draftCustomDurations.focus - 10) / (90 - 10) * 100}%`"
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-muted-foreground">{{ $t('pomodoro.shortBreak') }}</span>
              <span class="font-bold text-foreground tabular-nums bg-background px-2 py-0.5 rounded border border-border/50">{{ draftCustomDurations.shortBreak }}m</span>
            </div>
            <input
              id="custom-short-break"
              v-model.number="draftCustomDurations.shortBreak"
              type="range"
              min="3"
              max="30"
              step="1"
              class="modern-range"
              :style="`--range-progress: ${(draftCustomDurations.shortBreak - 3) / (30 - 3) * 100}%`"
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-muted-foreground">{{ $t('pomodoro.longBreak') }}</span>
              <span class="font-bold text-foreground tabular-nums bg-background px-2 py-0.5 rounded border border-border/50">{{ draftCustomDurations.longBreak }}m</span>
            </div>
            <input
              id="custom-long-break"
              v-model.number="draftCustomDurations.longBreak"
              type="range"
              min="5"
              max="45"
              step="1"
              class="modern-range"
              :style="`--range-progress: ${(draftCustomDurations.longBreak - 5) / (45 - 5) * 100}%`"
            />
          </div>
        </div>
      </transition>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
        <button
          @click="customizeDialog?.close()"
          class="px-4 py-2 rounded-full text-xs font-medium hover:bg-muted transition-colors"
        >
          {{ $t('pomodoro.cancel') }}
        </button>
        <button
          @click="saveTimerConfiguration"
          class="px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-sm"
        >
          {{ $t('pomodoro.apply') }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Timer, X } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme'
import { useI18n } from 'vue-i18n'

interface Props { userEmail?: string }
interface Emits { logout: []; expand: []; collapse: [] }
interface TimerMode { key: 'focus' | 'shortBreak' | 'longBreak'; name: string; label: string; duration: number }
interface TimerDurations { focus: number; shortBreak: number; longBreak: number }
type TimerPresetId = 'baby-step' | 'popular' | 'medium' | 'extended' | 'custom'
interface TimerPreset { id: Exclude<TimerPresetId, 'custom'>; name: string; focus: number; shortBreak: number; longBreak: number }

defineProps<Props>()
const emit = defineEmits<Emits>()
const themeStore = useThemeStore()
const { t } = useI18n()

const timerPresets: TimerPreset[] = [
  { id: 'baby-step', name: 'Baby Step', focus: 10, shortBreak: 5, longBreak: 10 },
  { id: 'popular', name: 'Popular', focus: 25, shortBreak: 5, longBreak: 15 },
  { id: 'medium', name: 'Medium', focus: 40, shortBreak: 8, longBreak: 20 },
  { id: 'extended', name: 'Extended', focus: 60, shortBreak: 10, longBreak: 25 },
]

const defaultCustomDurations: TimerDurations = { focus: 31, shortBreak: 8, longBreak: 10 }

const modes = computed<TimerMode[]>(() => [
  { key: 'focus', name: t('pomodoro.focus'), label: 'Pomodoro', duration: 25 * 60 },
  { key: 'shortBreak', name: t('pomodoro.shortBreak'), label: 'Rest', duration: 5 * 60 },
  { key: 'longBreak', name: t('pomodoro.longBreak'), label: 'Long Rest', duration: 15 * 60 },
])

const currentMode = ref(modes.value[0])

watch(modes, (newModes) => {
  const updatedMode = newModes.find(m => m.key === currentMode.value.key)
  if (updatedMode) {
    currentMode.value = { ...currentMode.value, name: updatedMode.name }
  }
})

const timeLeft = ref(currentMode.value.duration)
const isRunning = ref(false)
const isExpanded = ref(false)
const customizeDialog = ref<HTMLDialogElement | null>(null)
const customDurations = ref<TimerDurations>({ ...defaultCustomDurations })
const draftCustomDurations = ref<TimerDurations>({ ...defaultCustomDurations })
const draftPreset = ref<TimerPresetId>('popular')
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null)
let endTimestamp: number | null = null
let visibilityListenerAdded = false
const originalTitle = typeof document !== 'undefined' ? document.title || 'Pomodoro Timer' : 'Pomodoro Timer'

// YENİ: İlerleme Çubuğu (Progress Bar) Hesaplaması
const progressPercentage = computed(() => {
  const totalDuration = currentMode.value.duration
  const elapsedTime = totalDuration - timeLeft.value
  return (elapsedTime / totalDuration) * 100
})

const isNavbarVisible = ref(true)
let lastScrollPosition = 0

const handleScroll = () => {
  if (!isExpanded.value) return
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

watch(isExpanded, (newVal) => {
  if (newVal) {
    isNavbarVisible.value = true
    lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop
  }
})

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))

const normalizeDurations = (durations: TimerDurations): TimerDurations => ({
  focus: clamp(durations.focus, 10, 90), shortBreak: clamp(durations.shortBreak, 3, 30), longBreak: clamp(durations.longBreak, 5, 45)
})

const getCurrentDurations = (): TimerDurations => ({
  focus: Math.round(modes.value[0].duration / 60), shortBreak: Math.round(modes.value[1].duration / 60), longBreak: Math.round(modes.value[2].duration / 60)
})

const findPresetId = (durations: TimerDurations): TimerPresetId => {
  const matchedPreset = timerPresets.find((preset) => preset.focus === durations.focus && preset.shortBreak === durations.shortBreak && preset.longBreak === durations.longBreak)
  return matchedPreset?.id ?? 'custom'
}

const formatDurationTriplet = (durations: TimerDurations) => `${durations.focus}m / ${durations.shortBreak}m / ${durations.longBreak}m`

const customPreviewDurations = computed(() => draftPreset.value === 'custom' ? normalizeDurations(draftCustomDurations.value) : customDurations.value)

const presetCards = computed(() => [
  ...timerPresets.map((preset) => ({ 
    id: preset.id as TimerPresetId, 
    name: t(`pomodoro.presets.${preset.id}`),
    summary: formatDurationTriplet({ focus: preset.focus, shortBreak: preset.shortBreak, longBreak: preset.longBreak }) 
  })),
  { id: 'custom' as TimerPresetId, name: t('pomodoro.custom'), summary: formatDurationTriplet(customPreviewDurations.value) }
])

const formattedTime = computed(() => {
  const minutes = Math.floor(timeLeft.value / 60)
  const seconds = timeLeft.value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const canReset = computed(() => timeLeft.value !== currentMode.value.duration || isRunning.value)

const setMode = (mode: (typeof modes.value)[0]) => {
  currentMode.value = mode
  resetTimer()
}

const applyDurationsToModes = (durations: TimerDurations) => {
  const normalized = normalizeDurations(durations)
  modes.value[0].duration = normalized.focus * 60
  modes.value[1].duration = normalized.shortBreak * 60
  modes.value[2].duration = normalized.longBreak * 60
  resetTimer()
}

const openCustomizeDialog = () => {
  const liveDurations = getCurrentDurations()
  const detectedPreset = findPresetId(liveDurations)
  if (detectedPreset === 'custom') customDurations.value = { ...liveDurations }
  draftPreset.value = detectedPreset
  draftCustomDurations.value = detectedPreset === 'custom' ? { ...customDurations.value } : { ...liveDurations }
  customizeDialog.value?.showModal()
}

const selectDraftPreset = (presetId: TimerPresetId) => {
  if (presetId === 'custom') { draftPreset.value = 'custom'; draftCustomDurations.value = { ...customDurations.value }; return }
  const selectedPreset = timerPresets.find((preset) => preset.id === presetId)
  if (!selectedPreset) return
  draftPreset.value = presetId
  draftCustomDurations.value = { focus: selectedPreset.focus, shortBreak: selectedPreset.shortBreak, longBreak: selectedPreset.longBreak }
}

const saveTimerConfiguration = () => {
  if (draftPreset.value === 'custom') {
    const normalizedCustomDurations = normalizeDurations(draftCustomDurations.value)
    customDurations.value = { ...normalizedCustomDurations }
    applyDurationsToModes(normalizedCustomDurations)
    customizeDialog.value?.close()
    return
  }
  const selectedPreset = timerPresets.find((preset) => preset.id === draftPreset.value)
  if (!selectedPreset) { customizeDialog.value?.close(); return }
  applyDurationsToModes({ focus: selectedPreset.focus, shortBreak: selectedPreset.shortBreak, longBreak: selectedPreset.longBreak })
  customizeDialog.value?.close()
}

const clickTimerCustomize = () => openCustomizeDialog()

const toggleTimer = () => isRunning.value ? pauseTimer() : startTimer()

const updatePageTitle = () => document.title = isRunning.value ? `${formattedTime.value} - ${originalTitle}` : originalTitle

const startTimer = () => {
  if (isRunning.value) return
  if (timeLeft.value <= 0) return

  endTimestamp = Date.now() + timeLeft.value * 1000
  isRunning.value = true

  if (!visibilityListenerAdded) {
    visibilityListenerAdded = true
    window.addEventListener('visibilitychange', () => {
      if (isRunning.value && endTimestamp) timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
      updatePageTitle()
    })
  }

  timerInterval.value = setInterval(() => {
    if (!endTimestamp) return
    const secs = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
    timeLeft.value = secs
    updatePageTitle()
    if (secs <= 0) { notifyTimerComplete(); pauseTimer() }
  }, 500)

  timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
  updatePageTitle()
}

const pauseTimer = () => {
  if (timerInterval.value) { clearInterval(timerInterval.value); timerInterval.value = null }
  if (endTimestamp) timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
  endTimestamp = null
  isRunning.value = false
  updatePageTitle()
}

const resetTimer = () => {
  pauseTimer()
  timeLeft.value = currentMode.value.duration
  endTimestamp = null
  updatePageTitle()
}

const notifyTimerComplete = () => {
  const audio = new Audio('/notification.mp3')
  audio.play()
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(t('pomodoro.timerComplete'), { body: t('pomodoro.sessionCompleted', { mode: currentMode.value.name }) })
  }
}

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll) 
  if (timerInterval.value) clearInterval(timerInterval.value)
  document.title = originalTitle
})
</script>

<style scoped>
.teleportLift-enter-active, .teleportLift-leave-active { will-change: transform, opacity, filter; backface-visibility: hidden; }
.teleportLift-leave-active[data-teleport='compact'] { transform-origin: center top; animation: beamOutUp 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.teleportLift-enter-active[data-teleport='expanded'] { animation: materializeTop 560ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.teleportLift-leave-active[data-teleport='expanded'] { animation: dissolveTop 380ms cubic-bezier(0.4, 0, 1, 1) both; }
.teleportLift-enter-active[data-teleport='compact'] { transform-origin: center top; animation: landFromBeam 500ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes beamOutUp { 0% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } 38% { opacity: 0.95; transform: translateY(-10px) scale(0.99); filter: blur(0.5px); } 100% { opacity: 0; transform: translateY(-72px) scale(0.94); filter: blur(8px); } }
@keyframes materializeTop { 0% { opacity: 0; transform: translateY(-115%) scale(1.02); filter: blur(10px); } 55% { opacity: 0.9; transform: translateY(-6%) scale(1.005); filter: blur(2px); } 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
@keyframes dissolveTop { 0% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } 100% { opacity: 0; transform: translateY(-46px) scale(0.985); filter: blur(6px); } }
@keyframes landFromBeam { 0% { opacity: 0; transform: translateY(-40px) scale(0.96); filter: blur(8px); } 65% { opacity: 1; transform: translateY(4px) scale(1.01); filter: blur(1px); } 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
.pomodoro-dialog { overflow: hidden; }
.pomodoro-dialog::backdrop { background: rgb(2 6 23 / 0.5); backdrop-filter: blur(8px); }
.preset-radio { width: 1.1rem; height: 1.1rem; border-radius: 9999px; border: 1.5px solid hsl(var(--border)); background: hsl(var(--card)); position: relative; flex-shrink: 0; transition: border-color 160ms ease, box-shadow 160ms ease; }
.preset-radio::after { content: ''; position: absolute; inset: 3px; border-radius: inherit; background: hsl(var(--primary)); transform: scale(0); opacity: 0; transition: transform 160ms ease, opacity 160ms ease; }
.preset-radio[data-selected='true'] { border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1); }
.preset-radio[data-selected='true']::after { transform: scale(1); opacity: 1; }

.modern-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  background: hsl(var(--muted));
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    to right, 
    hsl(var(--primary)) 0%, 
    hsl(var(--primary)) var(--range-progress, 0%), 
    hsl(var(--muted)) var(--range-progress, 0%), 
    hsl(var(--muted)) 100%
  );
}
.modern-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: hsl(var(--card));
  border: 2px solid hsl(var(--primary));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
}
.modern-range::-webkit-slider-thumb:hover { transform: scale(1.1); }
.modern-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: hsl(var(--card));
  border: 2px solid hsl(var(--primary));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.customPanel-enter-active, .customPanel-leave-active { transition: opacity 150ms ease, transform 150ms ease; }
.customPanel-enter-from, .customPanel-leave-to { opacity: 0; transform: translateY(-5px); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>