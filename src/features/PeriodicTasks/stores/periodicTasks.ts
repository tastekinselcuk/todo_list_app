import { defineWorkspaceStore as defineStore, useWorkspaceClient } from '@/lib/workspaceScope'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export type TaskCategory = 'work' | 'health' | 'habit' | 'goal' | 'other'
export type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

export interface PeriodicTask {
  id: string
  user_id: string
  workspace_id: string
  title: string
  notes: string | null
  category: TaskCategory
  frequency: TaskFrequency
  days_of_week: number[] | null
  day_of_month: number | null
  month_of_year: number | null
  interval_days: number | null
  anchor_date: string | null
  reminder_time: string | null
  notify_browser: boolean
  notify_email: boolean
  completed_date: string | null
  last_notified_at: string | null
  created_at: string
  updated_at: string
}

export interface PeriodicTaskInput {
  title: string
  notes?: string
  category?: TaskCategory
  frequency: TaskFrequency
  daysOfWeek?: number[]
  dayOfMonth?: number
  monthOfYear?: number
  intervalDays?: number
  anchorDate?: string
  reminderTime?: string | null
  notifyBrowser?: boolean
  notifyEmail?: boolean
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(a: Date, b: Date): number {
  const ms = 24 * 60 * 60 * 1000
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.floor((utcB - utcA) / ms)
}

export function isTaskDueOn(task: PeriodicTask, date: Date = new Date()): boolean {
  const dayOfWeek = date.getDay()
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1

  switch (task.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return !!task.days_of_week?.includes(dayOfWeek)
    case 'monthly': {
      if (!task.day_of_month) return false
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
      return dayOfMonth === Math.min(task.day_of_month, lastDay)
    }
    case 'yearly': {
      if (!task.day_of_month || !task.month_of_year) return false
      return month === task.month_of_year && dayOfMonth === task.day_of_month
    }
    case 'custom': {
      const interval = task.interval_days && task.interval_days > 0 ? task.interval_days : 1
      const anchor = parseDate(task.anchor_date || task.created_at.split('T')[0])
      const diff = daysBetween(anchor, date)
      return diff >= 0 && diff % interval === 0
    }
    default:
      return false
  }
}

export function isCompletedForPeriod(task: PeriodicTask, date: Date = new Date()): boolean {
  if (!task.completed_date) return false
  const completed = parseDate(task.completed_date)
  const today = toDateString(date)

  switch (task.frequency) {
    case 'daily':
    case 'weekly':
    case 'custom':
      return task.completed_date === today
    case 'monthly':
      return (
        completed.getFullYear() === date.getFullYear() &&
        completed.getMonth() === date.getMonth()
      )
    case 'yearly':
      return completed.getFullYear() === date.getFullYear()
    default:
      return task.completed_date === today
  }
}

function normalizeTask(row: Record<string, unknown>): PeriodicTask {
  const reminder = row.reminder_time != null ? String(row.reminder_time).slice(0, 5) : null
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    workspace_id: String(row.workspace_id),
    title: String(row.title),
    notes: (row.notes as string | null) ?? null,
    category: (row.category as TaskCategory) || 'other',
    frequency: (row.frequency as TaskFrequency) || 'daily',
    days_of_week: (row.days_of_week as number[] | null) ?? null,
    day_of_month: (row.day_of_month as number | null) ?? null,
    month_of_year: (row.month_of_year as number | null) ?? null,
    interval_days: (row.interval_days as number | null) ?? null,
    anchor_date: (row.anchor_date as string | null) ?? null,
    reminder_time: reminder,
    notify_browser: row.notify_browser !== false,
    notify_email: Boolean(row.notify_email),
    completed_date: (row.completed_date as string | null) ?? null,
    last_notified_at: (row.last_notified_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function buildInsertPayload(userId: string, input: PeriodicTaskInput) {
  const frequency = input.frequency
  return {
    user_id: userId,
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    category: input.category || 'other',
    frequency,
    days_of_week:
      frequency === 'weekly'
        ? input.daysOfWeek || []
        : frequency === 'daily'
          ? [0, 1, 2, 3, 4, 5, 6]
          : null,
    day_of_month:
      frequency === 'monthly' || frequency === 'yearly'
        ? input.dayOfMonth || 1
        : null,
    month_of_year: frequency === 'yearly' ? input.monthOfYear || 1 : null,
    interval_days: frequency === 'custom' ? input.intervalDays || 1 : null,
    anchor_date:
      frequency === 'custom'
        ? input.anchorDate || toDateString(new Date())
        : null,
    reminder_time: input.reminderTime || null,
    notify_browser: input.notifyBrowser ?? true,
    notify_email: input.notifyEmail ?? false,
  }
}

export const usePeriodicTasksStore = defineStore('periodicTasks', () => {
  const authStore = useAuthStore()
  const supabase = useWorkspaceClient()

  const tasks = ref<PeriodicTask[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const getTodayDateString = (): string => toDateString(new Date())
  const getTodayDayOfWeek = (): number => new Date().getDay()

  const todaysTasks = computed(() =>
    tasks.value.filter((task) => isTaskDueOn(task, new Date()))
  )

  const todaysPending = computed(() =>
    todaysTasks.value.filter((task) => !isCompletedForPeriod(task))
  )

  const todaysCompletedCount = computed(
    () => todaysTasks.value.filter((task) => isCompletedForPeriod(task)).length
  )

  const progressPercent = computed(() => {
    if (todaysTasks.value.length === 0) return 0
    return Math.round((todaysCompletedCount.value / todaysTasks.value.length) * 100)
  })

  const tasksByCategory = computed(() => {
    const map: Record<TaskCategory, PeriodicTask[]> = {
      work: [],
      health: [],
      habit: [],
      goal: [],
      other: [],
    }
    for (const task of tasks.value) {
      map[task.category]?.push(task)
    }
    return map
  })

  let loadTasksGeneration = 0
  const loadTasks = async (targetId?: string) => {
    const request = ++loadTasksGeneration
    if (!authStore.user) return false

    isLoading.value = true
    error.value = null

    try {
      let { data, error: supabaseError } = await supabase
        .from('periodic_tasks')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: false })

      if (request !== loadTasksGeneration) return false
      if (supabaseError) throw supabaseError
      if (typeof targetId === 'string' && !(data || []).some((row: { id: string }) => row.id === targetId)) {
        const located = await supabase.from('periodic_tasks').select('*').eq('id', targetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) data = [located.data, ...(data || [])]
      }
      if (request !== loadTasksGeneration) return false
      tasks.value = (data || []).map((row: Record<string, unknown>) => normalizeTask(row))
      return true
    } catch (err) {
      if (request !== loadTasksGeneration) return false
      error.value = err instanceof Error ? err.message : 'Failed to load tasks'
      console.error('Error loading periodic tasks:', err)
      return false
    } finally {
      if (request === loadTasksGeneration) isLoading.value = false
    }
  }

  const addTask = async (input: PeriodicTaskInput) => {
    if (!authStore.user || !input.title.trim()) return null

    isLoading.value = true
    error.value = null

    try {
      const payload = buildInsertPayload(authStore.user.id, input)
      const { data, error: supabaseError } = await supabase
        .from('periodic_tasks')
        .insert([payload])
        .select()

      if (supabaseError) throw supabaseError

      if (data?.[0]) {
        const created = normalizeTask(data[0] as Record<string, unknown>)
        tasks.value.unshift(created)
        return created
      }
      return null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add task'
      console.error('Error adding periodic task:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  const updateTask = async (taskId: string, input: Partial<PeriodicTaskInput>) => {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task || !authStore.user) return false

    isLoading.value = true
    error.value = null

    try {
      const merged: PeriodicTaskInput = {
        title: input.title ?? task.title,
        notes: input.notes ?? task.notes ?? undefined,
        category: input.category ?? task.category,
        frequency: input.frequency ?? task.frequency,
        daysOfWeek: input.daysOfWeek ?? task.days_of_week ?? undefined,
        dayOfMonth: input.dayOfMonth ?? task.day_of_month ?? undefined,
        monthOfYear: input.monthOfYear ?? task.month_of_year ?? undefined,
        intervalDays: input.intervalDays ?? task.interval_days ?? undefined,
        anchorDate: input.anchorDate ?? task.anchor_date ?? undefined,
        reminderTime:
          input.reminderTime !== undefined ? input.reminderTime : task.reminder_time,
        notifyBrowser: input.notifyBrowser ?? task.notify_browser,
        notifyEmail: input.notifyEmail ?? task.notify_email,
      }

      const payload = {
        ...buildInsertPayload(authStore.user.id, merged),
        updated_at: new Date().toISOString(),
      }
      delete (payload as { user_id?: string }).user_id

      const { data, error: supabaseError } = await supabase
        .from('periodic_tasks')
        .update(payload)
        .eq('id', taskId)
        .select()

      if (supabaseError) throw supabaseError

      if (data?.[0]) {
        const idx = tasks.value.findIndex((t) => t.id === taskId)
        if (idx !== -1) tasks.value[idx] = normalizeTask(data[0] as Record<string, unknown>)
      }
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update task'
      console.error('Error updating periodic task:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const toggleTask = async (taskId: string) => {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return false

    const today = getTodayDateString()
    const currentlyDone = isCompletedForPeriod(task)
    const newCompletedDate = currentlyDone ? null : today

    isLoading.value = true
    error.value = null

    try {
      const { error: supabaseError } = await supabase
        .from('periodic_tasks')
        .update({
          completed_date: newCompletedDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (supabaseError) throw supabaseError
      task.completed_date = newCompletedDate
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to toggle task'
      console.error('Error toggling periodic task:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const markNotified = async (taskId: string) => {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    const now = new Date().toISOString()
    try {
      if (supabase.collection('periodic')) {
        await supabase.markNotified(taskId)
        task.last_notified_at = now
        return
      }
      await supabase
        .from('periodic_tasks')
        .update({ last_notified_at: now })
        .eq('id', taskId)
      task.last_notified_at = now
    } catch (err) {
      console.error('Error marking notified:', err)
    }
  }

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
      error.value = err instanceof Error ? err.message : 'Failed to delete task'
    } finally {
      isLoading.value = false
    }
  }

  supabase.listen?.({ periodic_tasks: loadTasks }, () => isLoading.value)
  return {
    tasks,
    isLoading,
    error,
    todaysTasks,
    todaysPending,
    todaysCompletedCount,
    progressPercent,
    tasksByCategory,
    loadTasks,
    addTask,
    updateTask,
    toggleTask,
    markNotified,
    deleteTask,
    getTodayDateString,
    getTodayDayOfWeek,
    isCompletedForPeriod: (task: PeriodicTask) => isCompletedForPeriod(task),
    isTaskDueOn: (task: PeriodicTask, date?: Date) => isTaskDueOn(task, date),
  }
})
