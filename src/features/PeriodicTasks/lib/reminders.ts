import { supabase } from '@/lib/supabase'
import type { PeriodicTask } from '../stores/periodicTasks'
import { isCompletedForPeriod, isTaskDueOn } from '../stores/periodicTasks'

const NOTIFIED_SESSION_KEY = 'periodic_notified_session'

function getSessionNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_SESSION_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveSessionNotified(set: Set<string>) {
  sessionStorage.setItem(NOTIFIED_SESSION_KEY, JSON.stringify([...set]))
}

function notificationKey(task: PeriodicTask, dateStr: string): string {
  return `${task.id}:${dateStr}:${task.reminder_time || 'none'}`
}

function wasNotifiedToday(task: PeriodicTask, dateStr: string): boolean {
  if (!task.last_notified_at) return false
  return task.last_notified_at.startsWith(dateStr)
}

function isReminderDueNow(task: PeriodicTask, now: Date): boolean {
  if (!task.reminder_time) return false
  const [h, m] = task.reminder_time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return false

  const reminderMinutes = h * 60 + m
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  // Fire within a 2-minute window after reminder time
  return nowMinutes >= reminderMinutes && nowMinutes < reminderMinutes + 2
}

export async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export function getBrowserPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

function showBrowserNotification(task: PeriodicTask, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(task.title, {
      body,
      tag: `periodic-${task.id}`,
      requireInteraction: true,
    })
  } catch (err) {
    console.error('Browser notification failed:', err)
  }
}

/**
 * Optional email via Supabase Edge Function + Resend free tier.
 * Fails silently if the function is not deployed.
 */
async function sendEmailReminder(task: PeriodicTask, userEmail: string | undefined) {
  if (!task.notify_email || !userEmail) return

  try {
    const { error } = await supabase.functions.invoke('send-periodic-reminder', {
      body: {
        to: userEmail,
        title: task.title,
        notes: task.notes,
        category: task.category,
        reminderTime: task.reminder_time,
      },
    })
    if (error) {
      console.warn('Email reminder unavailable (deploy edge function + Resend):', error.message)
    }
  } catch (err) {
    console.warn('Email reminder skipped:', err)
  }
}

export interface ReminderCheckOptions {
  tasks: PeriodicTask[]
  userEmail?: string
  onNotified?: (taskId: string) => void | Promise<void>
  t?: (key: string, params?: Record<string, string>) => string
}

/**
 * Checks due routines and fires browser / email reminders.
 * Call every ~30–60s while the module is open.
 */
export async function checkAndFireReminders(options: ReminderCheckOptions) {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const session = getSessionNotified()

  for (const task of options.tasks) {
    if (!isTaskDueOn(task, now)) continue
    if (isCompletedForPeriod(task, now)) continue
    if (!task.notify_browser && !task.notify_email) continue
    if (!isReminderDueNow(task, now)) continue

    const key = notificationKey(task, dateStr)
    if (session.has(key) || wasNotifiedToday(task, dateStr)) continue

    const body =
      options.t?.('periodicTasks.reminderBody', { title: task.title }) ||
      (task.notes?.trim() || 'Hatırlatma zamanı geldi')

    if (task.notify_browser) {
      showBrowserNotification(task, body)
    }
    if (task.notify_email) {
      await sendEmailReminder(task, options.userEmail)
    }

    session.add(key)
    saveSessionNotified(session)
    await options.onNotified?.(task.id)
  }
}
