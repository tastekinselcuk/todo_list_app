<template>
  <div class="bg-white p-6 rounded-lg shadow-sm border">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold flex items-center gap-2">
        <Timer class="h-5 w-5" />
        Pomodoro Timer
      </h2>
      <div class="flex gap-2">
        <button
          v-for="mode in modes"
          :key="mode.name"
          @click="setMode(mode)"
          class="px-3 py-1 text-xs rounded-md transition-colors"
          :class="[
            currentMode.name === mode.name
              ? 'bg-primary text-white'
              : 'hover:bg-accent'
          ]"
        >
          {{ mode.name }}
        </button>
      </div>
    </div>

    <div class="flex items-center justify-center py-8">
      <div class="text-center">
        <div class="text-6xl font-bold tabular-nums tracking-tight">
          {{ formattedTime }}
        </div>
        <div class="flex justify-center gap-4 mt-4">
          <button
            @click="toggleTimer"
            class="px-6 py-2 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            {{ isRunning ? 'Pause' : 'Start' }}
          </button>
          <button
            @click="resetTimer"
            class="px-6 py-2 rounded-md border hover:bg-accent transition-colors"
            :disabled="!canReset"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Timer } from 'lucide-vue-next'

const modes = [
  { name: 'Focus', duration: 25 * 60 },
  { name: 'Short Break', duration: 5 * 60 },
  { name: 'Long Break', duration: 15 * 60 },
]

const currentMode = ref(modes[0])
const timeLeft = ref(currentMode.value.duration)
const isRunning = ref(false)
const timerInterval = ref<number | null>(null)

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

const startTimer = () => {
  if (timeLeft.value > 0) {
    isRunning.value = true
    timerInterval.value = setInterval(() => {
      if (timeLeft.value > 0) {
        timeLeft.value--
      } else {
        notifyTimerComplete()
        pauseTimer()
      }
    }, 1000)
  }
}

const pauseTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }
  isRunning.value = false
}

const resetTimer = () => {
  pauseTimer()
  timeLeft.value = currentMode.value.duration
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
})
</script>
