import type { ActivityItem } from '../stores/activityLists'
import type { ActivityType } from './providers'
export interface ActivityCollection { id:string; collection_id:string; name:string; color:string; version:number; created_at:string; archived_at:string|null }
export interface ActivityMembership { group_id:string; item_id:string }
export const generalCollection='general'
export const activityTypes:ActivityType[]=['movie','series','book','place']
export const collectionColors=['#64748B','#8265A7','#4E8467','#AB8252','#4C809F','#AE657B'].map(color=>({value:color,color,label:color}))
export function collectionItems(items:ActivityItem[],memberships:ActivityMembership[],id:string){
 const assigned=new Set(memberships.filter(m=>id===generalCollection||m.group_id===id).map(m=>m.item_id))
 return items.filter(item=>id===generalCollection?!assigned.has(item.id):assigned.has(item.id))
}
export function activityImage(source:string|null|undefined){if(!source)return null;try{const url=new URL(source);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}}
export function activityLibraryError(error:unknown){
 const e=error as {message?:string;code?:string},message=String(e?.message||error)
 if(['setup','conflict','permission','archived','inTrash','duplicate','failed'].includes(message))return message
 if(['PGRST202','42883','42P01'].includes(e?.code||''))return 'setup'
 if(e?.code==='23505')return 'duplicate'
 if(message.includes('CONFLICT'))return 'conflict'
 if(message.includes('IN_TRASH'))return 'inTrash'
 if(message.includes('ARCHIVED'))return 'archived'
 if(e?.code==='42501'||/ACCESS|READ_ONLY/.test(message))return 'permission'
 return 'failed'
}
