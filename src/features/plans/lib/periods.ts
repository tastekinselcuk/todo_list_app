export const periods = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type Period = typeof periods[number]

export function firstPopulatedPeriod(plans: { period: Period; period_date: string }[], date = new Date()): Period {
  return periods.find(period => plans.some(plan => plan.period === period && plan.period_date === periodStart(period, date))) || 'daily'
}

// Calendar boundaries in the user's local timezone; weeks start on Monday.
export function periodStart(period: Period, date = new Date()): string {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (period === 'weekly') start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  if (period === 'monthly') start.setDate(1)
  if (period === 'yearly') start.setMonth(0, 1)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
}

export function nextPeriod(period: Period, value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (period === 'daily') date.setDate(date.getDate() + 1)
  if (period === 'weekly') date.setDate(date.getDate() + 7)
  if (period === 'monthly') date.setMonth(date.getMonth() + 1)
  if (period === 'yearly') date.setFullYear(date.getFullYear() + 1)
  return periodStart(period, date)
}
