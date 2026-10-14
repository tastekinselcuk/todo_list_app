import { supabase } from '@/lib/supabase'
import type { PeriodicTask } from '../stores/periodicTasks'
import { isCompletedForPeriod, isTaskDueOn } from '../stores/periodicTasks'
import { readStoredJSON, writeStoredJSON } from '@/lib/storage'

const NOTIFIED_SESSION_KEY = 'periodic_notified_session'

function getSessionNotified(): Set<string> {
  return new Set(readStoredJSON<string[]>(NOTIFIED_SESSION_KEY, [], value => Array.isArray(value) && value.every(item => typeof item === 'string'), 'session'))
}

function saveSessionNotified(set: Set<string>) {
  writeStoredJSON(NOTIFIED_SESSION_KEY, [...set], 'session')
}

function notificationKey(task: PeriodicTask, dateStr: string): string {
  return `${task.user_id}:${task.workspace_id}:${task.id}:${dateStr}:${task.reminder_time || 'none'}`
}

function wasNotifiedToday(task: PeriodicTask, dateStr: string): boolean {
  if (!task.last_notified_at) return false
  const date = new Date(task.last_notified_at)
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` === dateStr
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
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  try {
    new Notification(task.title, {
      body,
      tag: `periodic-${task.id}`,
      requireInteraction: true,
    })
    return true
  } catch (err) {
    console.error('Browser notification failed:', err)
    return false
  }
}

/**
 * Optional email via Supabase Edge Function + Resend free tier.
 * A failed delivery remains eligible for retry; browser and email acknowledgements are separate.
 */
async function sendEmailReminder(task: PeriodicTask) {

  try {
    const { data, error } = await supabase.functions.invoke('send-periodic-reminder', {
      body: {
        taskId: task.id,
        workspaceId: task.workspace_id,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    })
    return !error && data?.ok === true
  } catch (err) {
    console.warn('Email reminder pending:', err)
    return false
  }
}

export interface ReminderCheckOptions {
  tasks: PeriodicTask[]
  userEmail?: string
  onNotified?: (taskId: string) => void | Promise<void>
  t?: (key: string, params?: Record<string, string>) => string
  workspaceName?: string
  isCurrent?: () => boolean
}

/**
 * Checks due routines and fires browser / email reminders.
 * Call every ~30–60s while the module is open.
 */
export async function checkAndFireReminders(options: ReminderCheckOptions) {
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const session = getSessionNotified()

  for (const task of options.tasks) {
    if (options.isCurrent && !options.isCurrent()) return
    if (!isTaskDueOn(task, now)) continue
    if (isCompletedForPeriod(task, now)) continue
    if (!task.notify_browser && !task.notify_email) continue
    if (!isReminderDueNow(task, now)) continue

    const key = notificationKey(task, dateStr)

    const reminderBody =
      options.t?.('periodicTasks.reminderBody', { title: task.title }) ||
      (task.notes?.trim() || 'Hatırlatma zamanı geldi')
    const body = options.workspaceName ? `${options.workspaceName} · ${reminderBody}` : reminderBody

    if (task.notify_browser && !session.has(`${key}:browser`) && !wasNotifiedToday(task, dateStr)) {
      if (showBrowserNotification(task, body)) {
        session.add(`${key}:browser`)
        saveSessionNotified(session)
        await options.onNotified?.(task.id)
      }
    }
    if (task.notify_email && !session.has(`${key}:email`)) {
      if (options.isCurrent && !options.isCurrent()) return
      if (await sendEmailReminder(task)) {
        session.add(`${key}:email`)
        saveSessionNotified(session)
      }
    }

  }
}
