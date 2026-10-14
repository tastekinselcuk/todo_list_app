export interface AnalyticsDay { day: string; seconds: number; created: number; completed: number; reopened: number; deleted: number; pending: number | null }
export interface AnalyticsItem { module: 'quick' | 'detailed' | 'plans' | 'pomodoro'; record_id: string; item_created_at: string; completed: boolean; period: string | null; carry_count: number; title: string; workspace_id?:string }
export interface AnalyticsReport {
  recording_started_at: string; timezone: string; date_from: string; date_to: string
  daily: AnalyticsDay[]; items: AnalyticsItem[]; completed_sessions: number
  focus_breakdown?: Partial<Record<'free'|'task'|'unavailable',number>>
}
export type DatePreset = 'week' | 'month' | 'custom'
export function localDay(date: Date, timezone: string) {
  const parts=new Intl.DateTimeFormat('en',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
  const part=(key:string)=>parts.find(p=>p.type===key)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function shiftDay(day: string, days: number) {
  const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days)
  return date.toISOString().slice(0,10)
}
export function dayDistance(a: string, b: string) { return Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000) }
export function validDay(day: string) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0,10)===day }
export function reportRange(preset: DatePreset, timezone: string, now=new Date(), from='', to='') {
  const today=localDay(now,timezone)
  if (preset==='week') {
    const weekday=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7
    from=shiftDay(today,-weekday);to=today
  } else if (preset==='month') { from=`${today.slice(0,7)}-01`;to=today }
  if (!validDay(from) || !validDay(to) || from>to || to>today || dayDistance(from,to)>365) throw new Error('INVALID_DATE_RANGE')
  const length=dayDistance(from,to)+1
  return {from,to,previousFrom:shiftDay(from,-length),previousTo:shiftDay(from,-1),length}
}
export function totals(report: AnalyticsReport) {
  return report.daily.reduce((sum,day)=>({seconds:sum.seconds+Number(day.seconds),created:sum.created+Number(day.created),completed:sum.completed+Number(day.completed),reopened:sum.reopened+Number(day.reopened),deleted:sum.deleted+Number(day.deleted)}),{seconds:0,created:0,completed:0,reopened:0,deleted:0})
}
export function itemAge(item: AnalyticsItem, today: string, timezone: string) { return Math.max(0,dayDistance(localDay(new Date(item.item_created_at),timezone),today)) }
export function ageBuckets(items: AnalyticsItem[], today: string, timezone: string) {
  return [0,8,31,91].map((min,index)=>({min,max:[7,30,90,Infinity][index],count:items.filter(i=>!i.completed && itemAge(i,today,timezone)>=min && itemAge(i,today,timezone)<=[7,30,90,Infinity][index]).length}))
}
export function comparisonAvailable(report: AnalyticsReport) { return report.date_from>localDay(new Date(report.recording_started_at),report.timezone) }
export function percentChange(value: number, previous: number) { return previous>0 ? Math.round((value-previous)/previous*100) : null }
