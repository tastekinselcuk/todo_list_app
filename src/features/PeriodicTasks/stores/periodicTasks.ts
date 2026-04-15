import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// ==========================================
// TYPES (Supabase tablosu ile birebir aynı)
// ==========================================
export interface PeriodicTask {
  id: string
  user_id: string
  title: string
  frequency: 'daily' | 'weekly'
  days_of_week?: number[] 
  completed_date?: string | null // completed yerine bunu kullanıyoruz
  created_at: string
  updated_at: string
}

// ==========================================
// STORE
// ==========================================
export const usePeriodicTasksStore = defineStore('periodicTasks', () => {
  const authStore = useAuthStore()

  const tasks = ref<PeriodicTask[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Get today's date in YYYY-MM-DD format
  const getTodayDateString = (): string => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  }

  // Get today's day of week (0-6, Sunday-Saturday)
  const getTodayDayOfWeek = (): number => {
    return new Date().getDay()
  }

  // Filter tasks that should appear today
  const todaysTasks = computed(() => {
    const dayOfWeek = getTodayDayOfWeek()

    return tasks.value.filter((task) => {
      if (task.frequency === 'daily') {
        return true
      }
      if (task.frequency === 'weekly' && task.days_of_week) {
        return task.days_of_week.includes(dayOfWeek)
      }
      return false
    })
  })

  // Load tasks from Supabase
  const loadTasks = async () => {
    if (!authStore.user) return

    isLoading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('periodic_tasks')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: false })

      if (supabaseError) throw supabaseError

      tasks.value = data || []
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tasks'
      error.value = errorMessage
      console.error('Error loading periodic tasks:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Add new periodic task
  const addTask = async (
    title: string,
    frequency: 'daily' | 'weekly',
    daysOfWeek: number[] = []
  ) => {
    if (!authStore.user) return

    isLoading.value = true
    error.value = null

    try {
      // Veritabanına gönderilecek veri (Supabase sütun isimleriyle birebir aynı olmalı)
      const newTask = {
        user_id: authStore.user.id,
        title: title.trim(),
        frequency: frequency,
        days_of_week: frequency === 'weekly' ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
      }

      const { data, error: supabaseError } = await supabase
        .from('periodic_tasks')
        .insert([newTask])
        .select()

      if (supabaseError) throw supabaseError

      if (data && data[0]) {
        tasks.value.unshift(data[0])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add task'
      error.value = errorMessage
      console.error('Error adding periodic task:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Toggle task completion for today
  const toggleTask = async (taskId: string) => {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    const today = getTodayDateString()
    const newCompletedState = task.completed_date !== today 

    isLoading.value = true
    error.value = null

    try {
      const updateData = {
        completed_date: newCompletedState ? today : null,
        updated_at: new Date().toISOString(),
      }

      const { error: supabaseError } = await supabase
        .from('periodic_tasks')
        .update(updateData)
        .eq('id', taskId)

      if (supabaseError) throw supabaseError

      // Update local state
      task.completed_date = newCompletedState ? today : null
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle task'
      error.value = errorMessage
      console.error('Error toggling periodic task:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Delete task
  const deleteTask = async (taskId: string) => {
    isLoading.value = true
    error.value = null

    try {
      const { error: supabaseError } = await supabase
        .from('periodic_tasks')
        .delete()
        .eq('id', taskId)

      if (supabaseError) throw supabaseError

      tasks.value = tasks.value.filter((t) => t.id !== taskId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete task'
      error.value = errorMessage
    } finally {
      isLoading.value = false
    }
  }

  return {
    tasks,
    isLoading,
    error,
    todaysTasks,
    loadTasks,
    addTask,
    toggleTask,
    deleteTask,
    getTodayDateString,
    getTodayDayOfWeek,
  }
})