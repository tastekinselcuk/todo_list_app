import { supabase } from './supabase'

export const trashModules = ['plans','detailed','quick','code','pomodoro','learning','flashcards','workout','periodic','activities'] as const
export type TrashModule = typeof trashModules[number]
export const trashTables:Record<string,TrashModule>={plans:'plans',todos:'detailed',quick_notes:'quick',code_snippets:'code',pomo_tasks:'pomodoro',learning_subjects:'learning',flashcard_decks:'flashcards',workout_routines:'workout',periodic_tasks:'periodic',activity_items:'activities'}
export interface TrashReceipt { id:string; module:TrashModule; collection_id:string; version:number; deleted_at:string|null }
export interface TrashItem extends TrashReceipt { key:string;title:string;can_purge:boolean;deleted_at:string }
export interface TrashChange { owner:string;workspace:string;module:TrashModule;id?:string;action?:'move'|'restore'|'purge';version?:number }
export const trashUndoKey=(change:TrashChange,version:number)=>`${change.owner}:${change.workspace}:${change.module}:${change.id}:${version}`
const moves=new Set<(receipt:TrashReceipt,change:TrashChange)=>void>()
export function onTrashMove(callback:(receipt:TrashReceipt,change:TrashChange)=>void){moves.add(callback);return()=>moves.delete(callback)}
const listeners=new Set<(change:TrashChange)=>void>()
export function onTrashChange(callback:(change:TrashChange)=>void){listeners.add(callback);return()=>listeners.delete(callback)}
export function notifyTrash(change:TrashChange){for(const callback of listeners){try{callback(change)}catch(error){console.error('Trash observer failed',error)}}}
export function trashError(error:unknown):string {
 const e=error as {code?:string;message?:string}
 if(['PGRST202','42883','42P01','42703'].includes(e?.code || ''))return 'setup'
 if(e?.message?.includes('TRASH_FOCUS_ACTIVE'))return 'focusActive'
 if(e?.message?.includes('SHARING_CONFLICT'))return 'conflict'
 if(/TRASH_EXPIRED|TRASH_UNAVAILABLE/.test(e?.message || ''))return 'expired'
 if(e?.code==='42501' || /ACCESS|OWNER_REQUIRED/.test(e?.message || ''))return 'accessDenied'
 return 'failed'
}
export async function changeTrash(workspace:string,module:TrashModule,id:string,action:'move'|'restore'|'purge',version:number,owner:string){
 if(!owner)throw Error('TRASH_ACCESS_DENIED')
 const result=await supabase.rpc('trash_change',{wid:workspace,module_id:module,rid:id,action,expected_version:version})
 if(result.error)throw result.error
 notifyTrash({owner,workspace,module,id,action,version:result.data.version})
 return result.data as TrashReceipt
}
/** A receipt carries the exact deletion version; old Undo actions cannot undo a later deletion. */
export async function moveToTrash(workspace:string,module:TrashModule,id:string,version:number,owner:string,announce=true){
 const receipt=await changeTrash(workspace,module,id,'move',version,owner)
 if(announce)for(const callback of moves){try{callback(receipt,{owner,workspace,module,id})}catch(error){console.error('Trash notification failed',error)}}
 return receipt
}
