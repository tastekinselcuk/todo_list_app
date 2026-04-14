import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface TimerMode {
  name: string
  duration: number
}

export const usePomodoroStore = defineStore('pomodoro', () => {
  const modes: TimerMode[] = [
    { name: 'Focus', duration: 25 * 60 },
    { name: 'Short Break', duration: 5 * 60 },
    { name: 'Long Break', duration: 15 * 60 },
  ]

  const currentMode = ref(modes[0])
  const timeLeft = ref(currentMode.value.duration)
  const isRunning = ref(false)
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let endTimestamp: number | null = null
  let visibilityListenerAdded = false
  const originalTitle = typeof document !== 'undefined' ? document.title || 'Pomodoro Models' : 'Pomodoro Models'

  const formattedTime = computed(() => {
    const minutes = Math.floor(timeLeft.value / 60)
    const seconds = timeLeft.value % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  })

  const updatePageTitle = () => {
    if (isRunning.value) {
      document.title = `${formattedTime.value} - ${originalTitle}`
    } else {
      document.title = originalTitle
    }
  }

  const setMode = (mode: TimerMode) => {
    currentMode.value = mode
    resetTimer()
  }

  const startTimer = () => {
    if (isRunning.value) return
    if (timeLeft.value <= 0) return

    // compute end timestamp from remaining seconds
    endTimestamp = Date.now() + timeLeft.value * 1000
    isRunning.value = true

    // ensure visibilitychange listener updates time/title when switching tabs
    if (!visibilityListenerAdded) {
      visibilityListenerAdded = true
      window.addEventListener('visibilitychange', () => {
        if (isRunning.value && endTimestamp) {
          timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
        }
        updatePageTitle()
      })
    }

    // Use a short interval but compute remaining time from timestamp to avoid throttling issues
    timerInterval = setInterval(() => {
      if (!endTimestamp) return
      const secs = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
      timeLeft.value = secs
      updatePageTitle()
      if (secs <= 0) {
        notifyTimerComplete()
        pauseTimer()
      }
    }, 500)
    updatePageTitle()
    // update immediately so user sees correct title without waiting for first tick
    if (endTimestamp) {
      timeLeft.value = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000))
      updatePageTitle()
    }
    return
  }

  const pauseTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    // calculate remaining seconds based on timestamp
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
    const audio = new Audio('/notification.mp3')
    audio.play()
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Timer Complete!', {
        body: `${currentMode.value.name} session completed!`,
      })
    }
  }

  return {
    modes,
    currentMode,
    timeLeft,
    isRunning,
    formattedTime,
    setMode,
    startTimer,
    pauseTimer,
    resetTimer,
  }
})
