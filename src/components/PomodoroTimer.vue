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
        <div class="text-6xl font-bold tabular-nums tracking-tight text-foreground">
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
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Timer } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme'

interface Props {
  userEmail?: string
}

interface Emits {
  logout: []
  expand: []
  collapse: []
}

defineProps<Props>()
const emit = defineEmits<Emits>()
const themeStore = useThemeStore()

const modes = [
  { name: 'Focus', duration: 25 * 60 },
  { name: 'Short Break', duration: 5 * 60 },
  { name: 'Long Break', duration: 15 * 60 },
]

const currentMode = ref(modes[0])
const timeLeft = ref(currentMode.value.duration)
const isRunning = ref(false)
const isExpanded = ref(false)
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null)
let endTimestamp: number | null = null
let visibilityListenerAdded = false
const originalTitle = typeof document !== 'undefined' ? document.title || 'Pomodoro Timer' : 'Pomodoro Timer'

const formattedTime = computed(() => {
  const minutes = Math.floor(timeLeft.value / 60)
  const seconds = timeLeft.value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

const canReset = computed(() => {
  return timeLeft.value !== currentMode.value.duration || isRunning.value
})

const setMode = (mode: typeof modes[0]) => {
  currentMode.value = mode
  resetTimer()
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

/* Smooth hover effects */
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

