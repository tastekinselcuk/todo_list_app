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
  let timerInterval: number | null = null

  const formattedTime = computed(() => {
    const minutes = Math.floor(timeLeft.value / 60)
    const seconds = timeLeft.value % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  })

  const updatePageTitle = () => {
    if (isRunning.value) {
      document.title = `${formattedTime.value} - Pomodoro Models`
    } else {
      document.title = 'Pomodoro Models'
    }
  }

  const setMode = (mode: TimerMode) => {
    currentMode.value = mode
    resetTimer()
  }

  const startTimer = () => {
    if (timeLeft.value > 0) {
      isRunning.value = true
      timerInterval = setInterval(() => {
        if (timeLeft.value > 0) {
          timeLeft.value--
          updatePageTitle()
        } else {
          notifyTimerComplete()
          pauseTimer()
        }
      }, 1000)
    }
  }

  const pauseTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    isRunning.value = false
    updatePageTitle()
  }

  const resetTimer = () => {
    pauseTimer()
    timeLeft.value = currentMode.value.duration
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
