import { periodStart, type Period } from '@/features/plans/lib/periods'
import type { Plan } from '@/features/plans/stores/plans'
import type { Todo } from '@/features/todos/stores/todo'

export function summarizePlans(plans: Plan[], period: Period, date = new Date(), timezone?: string) {
  const current = plans.filter(plan => plan.period === period && plan.period_date === periodStart(period, date, timezone))
  const completed = current.filter(plan => plan.completed).length
  return {
    total: current.length,
    completed,
    percent: current.length ? Math.round(completed / current.length * 100) : 0,
    pending: current.filter(plan => !plan.completed),
  }
}

export interface AgendaItem {
  id: string
  title: string
  module: 'detailed' | 'periodic'
  overdue: boolean
  time: string | null
}

// Routines are already filtered for today's schedule and completion by the caller.
export function buildAgenda(todos: Todo[], routines: { id: string; title: string; reminder_time: string | null }[], date = new Date()): AgendaItem[] {
  const today = periodStart('daily', date)
  const priority = { high: 0, medium: 1, low: 2 }
  const due = todos.filter(todo => !todo.completed && todo.dueDate && todo.dueDate <= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || priority[a.priority] - priority[b.priority])
    .map(todo => ({ id: todo.id, title: todo.title, module: 'detailed' as const, overdue: todo.dueDate! < today, time: null }))
  const scheduled = [...routines].sort((a, b) => (a.reminder_time || '99:99').localeCompare(b.reminder_time || '99:99'))
    .map(task => ({ id: task.id, title: task.title, module: 'periodic' as const, overdue: false, time: task.reminder_time }))
  return [...due.filter(item => item.overdue), ...scheduled, ...due.filter(item => !item.overdue)]
}
