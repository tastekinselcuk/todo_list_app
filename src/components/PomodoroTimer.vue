<template>
  <transition name="teleportLift">
    <!-- Compact Card View -->
    <div
      v-if="!isExpanded"
      key="compact"
      data-teleport="compact"
      class="bg-card text-card-foreground p-6 rounded-lg shadow-sm border border-border relative max-w-lg mx-auto w-full"
    >
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <h2 class="text-lg font-semibold flex items-center gap-2 text-foreground">
        <Timer class="h-5 w-5" />
        Pomodoro Timer
      </h2>
      <div class="flex gap-2">
        <button
          v-for="mode in modes"
          :key="mode.name"
          @click="setMode(mode)"
          @context-menu.prevent="openCustomizeDialog"
          :title="'Right-click to open modern duration setup'"
          class="px-3 py-1 text-xs rounded-md transition-colors text-muted-foreground"
          :class="[
            currentMode.name === mode.name
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent'
          ]"
        >
          {{ mode.name }}
        </button>
      </div>
    </div>

    <div class="flex items-center justify-center py-8">
      <div class="text-center">
        <div
          class="text-6xl font-bold tabular-nums tracking-tight text-foreground cursor-pointer select-none"
          @click="clickTimerCustomize"
          :title="'Click to open modern duration setup'"
        >
          {{ formattedTime }}
        </div>
        <div class="flex justify-center gap-4 mt-4">
          <button
            @click="toggleTimer"
            class="px-6 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {{ isRunning ? 'Pause' : 'Start' }}
          </button>
          <button
            @click="resetTimer"
            class="px-6 py-2 rounded-md border border-input bg-background text-foreground hover:bg-accent transition-colors"
            :disabled="!canReset"
          >
            Reset
          </button>
        </div>
      </div>
    </div>

    <!-- Expand Button (bottom-right) -->
    <button
      @click="() => { isExpanded = true; emit('expand') }"
      class="absolute bottom-6 right-6 p-2 hover:bg-accent rounded-lg transition-all duration-300 hover:scale-110 group"
      title="Expand to navbar"
    >
      <svg class="w-6 h-6 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    </button>
    </div>

    <!-- Expanded Navbar View - Fixed at top -->
    <div
      v-else
      key="expanded"
      data-teleport="expanded"
      class="fixed top-0 left-0 right-0 bg-card border-b border-border shadow-md z-40"
    >
      <div class="max-w-full px-6 py-3 flex items-center justify-between gap-6">
        <!-- Left: Logo & Timer Display (fixed width) -->
        <div class="flex items-center gap-4 flex-shrink-0">
          <div class="p-2 bg-muted rounded-lg">
            <Timer class="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p class="text-xs text-muted-foreground font-medium">Focus Time</p>
            <p class="text-2xl font-bold text-foreground tabular-nums">{{ formattedTime }}</p>
          </div>
        </div>

        <!-- Center: Mode Buttons (grows to fill) -->
        <div class="flex gap-2 justify-center flex-1">
          <button
            v-for="mode in modes"
            :key="mode.name"
            @click="setMode(mode)"
            @context-menu.prevent="openCustomizeDialog"
            :title="'Right-click to open modern duration setup'"
            class="px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-200"
            :class="[
              currentMode.name === mode.name
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            ]"
          >
            {{ mode.name }}
          </button>
        </div>

        <!-- Right: Controls & User (fixed width, stuck right) -->
        <div class="flex items-center gap-3 flex-shrink-0">
          <!-- Timer Controls (Light Container) -->
          <div class="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
            <button
              @click="toggleTimer"
              class="px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
            >
              {{ isRunning ? 'Pause' : 'Start' }}
            </button>
            <button
              @click="resetTimer"
              class="px-2 py-1 rounded-md border border-input bg-background text-foreground hover:bg-accent transition-colors text-xs font-medium"
              :disabled="!canReset"
            >
              Reset
            </button>
            <button
              @click="() => { isExpanded = false; emit('collapse') }"
              class="p-1 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              title="Collapse"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          </div>

          <!-- User Info (Light Translucent Container) -->
          <div class="flex items-center gap-4 bg-card/70 backdrop-blur-md px-5 py-2.5 rounded-full shadow-sm border border-border/70 hover:bg-card/90 hover:shadow-md transition-all duration-300">
            <div class="text-right hidden sm:block cursor-default">
              <p class="text-sm font-semibold text-foreground">{{ userEmail || 'User' }}</p>
            </div>
            <div class="w-px h-5 bg-border hidden sm:block"></div>
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
              @click="emit('logout')"
              class="text-sm font-medium text-muted-foreground hover:text-destructive transition-colors"
              title="Sign out"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Customization Dialog -->
  </transition>

    <dialog
      ref="customizeDialog"
      class="pomodoro-dialog w-[92vw] max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-xl backdrop:bg-black/60"
    >
      <div class="p-4 sm:p-5 bg-card space-y-3.5">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold tracking-tight text-foreground">Timer Presets</h2>
          <button
            @click="customizeDialog?.close()"
            class="p-1 rounded-md hover:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-1.5">
          <button
            v-for="preset in presetCards"
            :key="preset.id"
            type="button"
            @click="selectDraftPreset(preset.id)"
            class="w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150 flex items-center gap-2"
            :class="
              draftPreset === preset.id
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/40'
            "
          >
            <span class="preset-radio" :data-selected="draftPreset === preset.id ? 'true' : 'false'"></span>
            <span class="flex-1 flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-foreground">{{ preset.name }}</span>
              <span class="text-xs text-muted-foreground tabular-nums">{{ preset.summary }}</span>
            </span>
          </button>
        </div>

        <transition name="customPanel">
          <div
            v-if="draftPreset === 'custom'"
            class="rounded-lg border border-border/70 bg-muted/35 p-3 space-y-2.5"
          >
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">Pomodoro</span>
                <span class="font-semibold text-foreground tabular-nums">{{ draftCustomDurations.focus }}m</span>
              </div>
              <input
                id="custom-focus"
                v-model.number="draftCustomDurations.focus"
                type="range"
                min="10"
                max="90"
                step="1"
                aria-label="Custom pomodoro duration"
                class="modern-range"
              />
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">Rest</span>
                <span class="font-semibold text-foreground tabular-nums">{{ draftCustomDurations.shortBreak }}m</span>
              </div>
              <input
                id="custom-short-break"
                v-model.number="draftCustomDurations.shortBreak"
                type="range"
                min="3"
                max="30"
                step="1"
                aria-label="Custom short rest duration"
                class="modern-range"
              />
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">Long Rest</span>
                <span class="font-semibold text-foreground tabular-nums">{{ draftCustomDurations.longBreak }}m</span>
              </div>
              <input
                id="custom-long-break"
                v-model.number="draftCustomDurations.longBreak"
                type="range"
                min="5"
                max="45"
                step="1"
                aria-label="Custom long rest duration"
                class="modern-range"
              />
            </div>
          </div>
        </transition>

        <div class="flex items-center justify-end gap-2 pt-1.5">
          <div class="flex items-center gap-2">
            <button
              @click="customizeDialog?.close()"
              class="px-3 py-1.5 rounded-md text-xs hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              @click="saveTimerConfiguration"
              class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </dialog>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Timer, X } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme'

interface Props {
  userEmail?: string
}

interface Emits {
  logout: []
  expand: []
  collapse: []
}

interface TimerMode {
  key: 'focus' | 'shortBreak' | 'longBreak'
  name: string
  label: string
  duration: number
}

interface TimerDurations {
  focus: number
  shortBreak: number
  longBreak: number
}

type TimerPresetId = 'baby-step' | 'popular' | 'medium' | 'extended' | 'custom'

interface TimerPreset {
  id: Exclude<TimerPresetId, 'custom'>
  name: string
  focus: number
  shortBreak: number
  longBreak: number
}

defineProps<Props>()
const emit = defineEmits<Emits>()
const themeStore = useThemeStore()

const timerPresets: TimerPreset[] = [
  { id: 'baby-step', name: 'Baby Step', focus: 10, shortBreak: 5, longBreak: 10 },
  { id: 'popular', name: 'Popular', focus: 25, shortBreak: 5, longBreak: 15 },
  { id: 'medium', name: 'Medium', focus: 40, shortBreak: 8, longBreak: 20 },
  { id: 'extended', name: 'Extended', focus: 60, shortBreak: 10, longBreak: 25 },
]

const defaultCustomDurations: TimerDurations = {
  focus: 31,
  shortBreak: 8,
  longBreak: 10,
}

const modes = ref<TimerMode[]>([
  { key: 'focus', name: 'Focus', label: 'Pomodoro', duration: 25 * 60 },
  { key: 'shortBreak', name: 'Short Break', label: 'Rest', duration: 5 * 60 },
  { key: 'longBreak', name: 'Long Break', label: 'Long Rest', duration: 15 * 60 },
])

const currentMode = ref(modes.value[0])
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

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, Math.round(value)))
}

const normalizeDurations = (durations: TimerDurations): TimerDurations => {
  return {
    focus: clamp(durations.focus, 10, 90),
    shortBreak: clamp(durations.shortBreak, 3, 30),
    longBreak: clamp(durations.longBreak, 5, 45),
  }
}

const getCurrentDurations = (): TimerDurations => {
  return {
    focus: Math.round(modes.value[0].duration / 60),
    shortBreak: Math.round(modes.value[1].duration / 60),
    longBreak: Math.round(modes.value[2].duration / 60),
  }
}

const findPresetId = (durations: TimerDurations): TimerPresetId => {
  const matchedPreset = timerPresets.find((preset) => {
    return (
      preset.focus === durations.focus
      && preset.shortBreak === durations.shortBreak
      && preset.longBreak === durations.longBreak
    )
  })

  return matchedPreset?.id ?? 'custom'
}

const formatDurationTriplet = (durations: TimerDurations) => {
  return `${durations.focus}m / ${durations.shortBreak}m / ${durations.longBreak}m`
}

const customPreviewDurations = computed(() => {
  return draftPreset.value === 'custom'
    ? normalizeDurations(draftCustomDurations.value)
    : customDurations.value
})

const presetCards = computed(() => {
  return [
    ...timerPresets.map((preset) => ({
      id: preset.id as TimerPresetId,
      name: preset.name,
      summary: formatDurationTriplet({
        focus: preset.focus,
        shortBreak: preset.shortBreak,
        longBreak: preset.longBreak,
      }),
    })),
    {
      id: 'custom' as TimerPresetId,
      name: 'Custom',
      summary: formatDurationTriplet(customPreviewDurations.value),
    },
  ]
})

const formattedTime = computed(() => {
  const minutes = Math.floor(timeLeft.value / 60)
  const seconds = timeLeft.value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const canReset = computed(() => {
  return timeLeft.value !== currentMode.value.duration || isRunning.value
})

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

  if (detectedPreset === 'custom') {
    customDurations.value = { ...liveDurations }
  }

  draftPreset.value = detectedPreset
  draftCustomDurations.value = detectedPreset === 'custom'
    ? { ...customDurations.value }
    : { ...liveDurations }

  customizeDialog.value?.showModal()
}

const selectDraftPreset = (presetId: TimerPresetId) => {
  if (presetId === 'custom') {
    draftPreset.value = 'custom'
    draftCustomDurations.value = { ...customDurations.value }
    return
  }

  const selectedPreset = timerPresets.find((preset) => preset.id === presetId)
  if (!selectedPreset) {
    return
  }

  draftPreset.value = presetId
  draftCustomDurations.value = {
    focus: selectedPreset.focus,
    shortBreak: selectedPreset.shortBreak,
    longBreak: selectedPreset.longBreak,
  }
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
  if (!selectedPreset) {
    customizeDialog.value?.close()
    return
  }

  applyDurationsToModes({
    focus: selectedPreset.focus,
    shortBreak: selectedPreset.shortBreak,
    longBreak: selectedPreset.longBreak,
  })

  customizeDialog.value?.close()
}

const clickTimerCustomize = () => {
  openCustomizeDialog()
}

const toggleTimer = () => {
  if (isRunning.value) {
    pauseTimer()
  } else {
    startTimer()
  }
}

const updatePageTitle = () => {
  if (isRunning.value) {
    document.title = `${formattedTime.value} - ${originalTitle}`
  } else {
    document.title = originalTitle
  }
}

const startTimer = () => {
  if (isRunning.value) return
  if (timeLeft.value <= 0) return

  endTimestamp = Date.now() + timeLeft.value * 1000
  isRunning.value = true

  if (!visibilityListenerAdded) {
    visibilityListenerAdded = true
    window.addEventListener('visibilitychange', () => {
      if (isRunning.value && endTimestamp) {
        timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
      }
      updatePageTitle()
    })
  }

  timerInterval.value = setInterval(() => {
    if (!endTimestamp) return
    const secs = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
    timeLeft.value = secs
    updatePageTitle()
    if (secs <= 0) {
      notifyTimerComplete()
      pauseTimer()
    }
  }, 500)

  // immediate update
  timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
  updatePageTitle()
}

const pauseTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }
  if (endTimestamp) {
    timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
  }
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
  // Play sound
  const audio = new Audio('/notification.mp3')
  audio.play()
  
  // Show notification if supported
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Timer Complete!', {
      body: `${currentMode.value.name} session completed!`,
    })
  }
}

onUnmounted(() => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  document.title = originalTitle
})
</script>

<style scoped>
/* Teleport-like, upward fluid transition between card and navbar */
.teleportLift-enter-active,
.teleportLift-leave-active {
  will-change: transform, opacity, filter;
  backface-visibility: hidden;
}

.teleportLift-leave-active[data-teleport='compact'] {
  transform-origin: center top;
  animation: beamOutUp 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.teleportLift-enter-active[data-teleport='expanded'] {
  animation: materializeTop 560ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.teleportLift-leave-active[data-teleport='expanded'] {
  animation: dissolveTop 380ms cubic-bezier(0.4, 0, 1, 1) both;
}

.teleportLift-enter-active[data-teleport='compact'] {
  transform-origin: center top;
  animation: landFromBeam 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes beamOutUp {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
  38% {
    opacity: 0.95;
    transform: translateY(-10px) scale(0.99);
    filter: blur(0.5px);
  }
  100% {
    opacity: 0;
    transform: translateY(-72px) scale(0.94);
    filter: blur(8px);
  }
}

@keyframes materializeTop {
  0% {
    opacity: 0;
    transform: translateY(-115%) scale(1.02);
    filter: blur(10px);
  }
  55% {
    opacity: 0.9;
    transform: translateY(-6%) scale(1.005);
    filter: blur(2px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

@keyframes dissolveTop {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-46px) scale(0.985);
    filter: blur(6px);
  }
}

@keyframes landFromBeam {
  0% {
    opacity: 0;
    transform: translateY(-40px) scale(0.96);
    filter: blur(8px);
  }
  65% {
    opacity: 1;
    transform: translateY(4px) scale(1.01);
    filter: blur(1px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

.pomodoro-dialog {
  overflow: hidden;
}

.pomodoro-dialog::backdrop {
  background: rgb(2 6 23 / 0.58);
  backdrop-filter: blur(2px);
}

.preset-radio {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 1.25px solid hsl(var(--border));
  background: hsl(var(--card));
  position: relative;
  flex-shrink: 0;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.preset-radio::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  background: hsl(var(--primary));
  transform: scale(0);
  opacity: 0;
  transition: transform 160ms ease, opacity 160ms ease;
}

.preset-radio[data-selected='true'] {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.16);
}

.preset-radio[data-selected='true']::after {
  transform: scale(1);
  opacity: 1;
}

.modern-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 0.35rem;
  border-radius: 9999px;
  background: hsl(var(--muted));
  cursor: pointer;
}

.modern-range::-webkit-slider-runnable-track {
  height: 0.35rem;
  border-radius: 9999px;
  background: linear-gradient(
    90deg,
    hsl(var(--primary) / 0.78) 0%,
    hsl(var(--primary) / 0.52) 35%,
    hsl(var(--muted)) 100%
  );
}

.modern-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 0.92rem;
  height: 0.92rem;
  margin-top: -0.28rem;
  border-radius: 9999px;
  background: hsl(var(--primary));
  border: 1.5px solid hsl(var(--card));
  box-shadow: 0 4px 10px -7px hsl(var(--primary) / 0.85);
}

.modern-range::-moz-range-track {
  height: 0.35rem;
  border-radius: 9999px;
  background: hsl(var(--muted));
}

.modern-range::-moz-range-progress {
  height: 0.35rem;
  border-radius: 9999px;
  background: linear-gradient(
    90deg,
    hsl(var(--primary) / 0.78) 0%,
    hsl(var(--primary) / 0.52) 100%
  );
}

.modern-range::-moz-range-thumb {
  width: 0.92rem;
  height: 0.92rem;
  border-radius: 9999px;
  background: hsl(var(--primary));
  border: 1.5px solid hsl(var(--card));
  box-shadow: 0 4px 10px -7px hsl(var(--primary) / 0.85);
}

.customPanel-enter-active,
.customPanel-leave-active {
  transition: opacity 200ms ease, transform 220ms ease;
}

.customPanel-enter-from,
.customPanel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Smooth hover effects */
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

