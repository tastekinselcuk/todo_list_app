import type { AiTimeContext } from './types.ts'

export function validateIanaTimezone(candidate?: string | null): { timezone: string; valid: boolean } {
  const raw = typeof candidate === 'string' ? candidate.trim() : ''
  if (!raw || raw.length > 80) {
    return { timezone: 'UTC', valid: false }
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw }).format(new Date(0))
    return { timezone: raw, valid: true }
  } catch {
    return { timezone: 'UTC', valid: false }
  }
}

function formatDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

function formatTimeInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00'
  return `${get('hour')}:${get('minute')}`
}

export function resolveAuthoritativeTime(
  requestedTimezone?: string | null,
  nowFn: () => Date = () => new Date(),
): AiTimeContext {
  const now = nowFn()
  const { timezone, valid } = validateIanaTimezone(requestedTimezone)
  const local_date = formatDateInZone(now, timezone)
  const local_time = formatTimeInZone(now, timezone)
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrow_date = formatDateInZone(tomorrow, timezone)
  const weekday_tr = new Intl.DateTimeFormat('tr-TR', { timeZone: timezone, weekday: 'long' }).format(now)
  const weekday_en = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(now)

  return {
    now_utc: now.toISOString(),
    timezone,
    timezone_valid: valid,
    local_date,
    local_time,
    tomorrow_date,
    weekday_tr,
    weekday_en,
  }
}
