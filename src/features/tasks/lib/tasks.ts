export type TaskStatus = 'todo' | 'doing' | 'done'
export interface WorkProject { id:string; name:string; version:number; archived:boolean; created_at:string }
export interface WorkTask {
  id:string; title:string; description:string; status:TaskStatus; priority:'none'|'low'|'medium'|'high'
  project_id:string|null; due_on:string|null; estimate_minutes:number; checklist:{id:string;title:string;done:boolean}[]
  version:number; created_at:string; deleted_at:string|null
}
export interface WorkBlock {
  id:string; task_id:string|null; title:string; starts_at:string; ends_at:string; timezone:string
  version:number; created_at:string; deleted_at:string|null; task_title?:string; task_status?:TaskStatus; project_id?:string|null
}
export type WorkEntity = 'task'|'project'|'block'
export const taskStatuses:TaskStatus[] = ['todo','doing','done']
export const localDay=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
export function localInput(value:string|Date) {
  const date=new Date(value)
  return `${localDay(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
}
export const browserTimezone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
export function monthRange(date=new Date()) {
  return {start:new Date(date.getFullYear(),date.getMonth(),1).toISOString(),end:new Date(date.getFullYear(),date.getMonth()+1,1).toISOString()}
}
export function validBlock(start:string,end:string) {
  const a=new Date(start).getTime(),b=new Date(end).getTime()
  return Number.isFinite(a)&&Number.isFinite(b)&&b>a&&b-a<=7*86400000
}
export function overlaps(a:Pick<WorkBlock,'starts_at'|'ends_at'>,b:Pick<WorkBlock,'starts_at'|'ends_at'>) {
  return new Date(a.starts_at)<new Date(b.ends_at)&&new Date(b.starts_at)<new Date(a.ends_at)
}
export function workError(failure:unknown):string {
  const error=failure as {code?:string;message?:string}
  if(['PGRST202','42883','42P01','42703'].includes(error?.code||''))return 'setup'
  if(/WORK_CONFLICT|SHARING_CONFLICT/.test(error?.message||''))return 'conflict'
  if(/WORK_PROJECT_ARCHIVED/.test(error?.message||''))return 'projectArchived'
  if(error?.code==='42501'||/ACCESS_DENIED/.test(error?.message||''))return 'accessDenied'
  if(/INVALID_WORK/.test(error?.message||''))return 'invalid'
  return 'failed'
}
