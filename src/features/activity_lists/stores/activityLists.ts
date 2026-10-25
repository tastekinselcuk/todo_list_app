import { defineWorkspaceStore as defineStore,useWorkspaceClient } from '@/lib/workspaceScope'
import { computed,ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useWorkspacesStore } from '@/stores/workspaces'
import { supabase } from '@/lib/supabase'
import { activityLibraryError,collectionItems,generalCollection,type ActivityCollection,type ActivityMembership } from '../lib/collections'
import type { ActivitySource,ActivityType,SearchResult } from '../lib/providers'
export type ActivityStatus='want'|'done'
export interface ActivityItem {
 id:string;user_id:string;type:ActivityType;title:string;subtitle:string|null;image_url:string|null;
 external_id:string|null;external_source:ActivitySource|string|null;meta:Record<string,unknown>;status:ActivityStatus;
 notes:string|null;created_at:string;updated_at:string;version:number
}
export const useActivityListsStore=defineStore('activityLists',()=>{
 const auth=useAuthStore(),workspaces=useWorkspacesStore(),client=useWorkspaceClient()
 const owner=auth.user?.id,wid=workspaces.activeId,scope=workspaces.sessionKey,current=()=>owner===auth.user?.id&&scope===workspaces.sessionKey
 const items=ref<ActivityItem[]>([]),collections=ref<ActivityCollection[]>([]),memberships=ref<ActivityMembership[]>([]),isLoading=ref(false),saving=ref(0),error=ref<string|null>(null),setupRequired=ref(false)
 const pending=ref<string[]>([]),flights=new Map<string,Promise<any>>()
 const busy=computed(()=>saving.value>0)
 const availableItems=computed(()=>{const active=new Set(collections.value.filter(c=>!c.archived_at).map(c=>c.id)),assigned=new Map<string,string[]>();for(const m of memberships.value)assigned.set(m.item_id,[...(assigned.get(m.item_id)||[]),m.group_id]);return items.value.filter(i=>!assigned.has(i.id)||assigned.get(i.id)!.some(id=>active.has(id)))})
 const wantCount=computed(()=>availableItems.value.filter(i=>i.status==='want').length),doneCount=computed(()=>availableItems.value.filter(i=>i.status==='done').length)
 const itemsByType=computed(()=>{const result:Record<ActivityType,ActivityItem[]>={movie:[],series:[],place:[],book:[]};for(const item of availableItems.value)result[item.type]?.push(item);return result})
 const inCollection=(id:string)=>collectionItems(items.value,memberships.value,id)
 let loading:Promise<boolean>|undefined
 async function load(){
  if(!owner||!current())return false
  isLoading.value=true
  try{
   const {data,error:failure}=await supabase.rpc('activity_library_load',{wid});if(failure)throw failure;if(!current())return false
   items.value=data.items||[];collections.value=data.collections||[];memberships.value=data.memberships||[];error.value=null;setupRequired.value=false;return true
  }catch(failure){
   if(!current())return false;error.value=activityLibraryError(failure);setupRequired.value=error.value==='setup'
   if(setupRequired.value){const response=await client.from('activity_items').select('*').eq('user_id',owner).order('created_at',{ascending:false});if(current()&&!response.error){items.value=response.data||[];collections.value=[];memberships.value=[]}}
   return false
  }finally{isLoading.value=false}
 }
 function loadItems(_targetId?:string){if(busy.value)return Promise.resolve(false);if(!loading)loading=load().finally(()=>{loading=undefined});return loading}
 function putItem(row:ActivityItem){const i=items.value.findIndex(item=>item.id===row.id);if(i<0)items.value.unshift(row);else if(items.value[i]!.version<=row.version)items.value[i]=row}
 function putCollection(row:ActivityCollection){const i=collections.value.findIndex(c=>c.id===row.id);if(i<0)collections.value.push(row);else if(collections.value[i]!.version<=row.version)collections.value[i]=row}
 async function write(operation:string,rid:string,payload:Record<string,unknown>,version?:number){
  if(loading)await loading
  if(!current())throw Error('ACTIVITY_ACCESS_DENIED')
  saving.value++;pending.value.push(rid)
  try{
   const {data,error:failure}=await supabase.rpc('activity_library_mutate',{wid,operation,rid,payload,expected_version:version??null})
   if(failure)throw failure;if(!current())throw Error('ACTIVITY_ACCESS_DENIED')
   if(data.item){putItem(data.item);memberships.value=[...memberships.value.filter(m=>m.item_id!==data.item.id),...(data.group_ids||[]).map((group_id:string)=>({group_id,item_id:data.item.id}))]}
   if(data.collection)putCollection(data.collection);error.value=null;return data
  }catch(failure){if(current())error.value=activityLibraryError(failure);throw failure}
  finally{saving.value--;pending.value=pending.value.filter(id=>id!==rid)}
 }
 function mutate(operation:string,rid:string,payload:Record<string,unknown>={},version?:number){
  if(flights.has(rid))return flights.get(rid)!
  const flight=write(operation,rid,payload,version).finally(()=>flights.delete(rid));flights.set(rid,flight);return flight
 }
 function addFromSearch(result:SearchResult,groupId=generalCollection,requestId:string=crypto.randomUUID()){
  return mutate('item.add',requestId,{group_id:groupId===generalCollection?null:groupId,type:result.type,title:result.title,subtitle:result.subtitle||null,image_url:result.imageUrl,external_id:result.externalSource==='manual'?null:result.externalId,external_source:result.externalSource,meta:result.meta||{}})
 }
 async function toggleStatus(id:string){
  if(pending.value.includes(id))return false
  const item=items.value.find(i=>i.id===id);if(!item||!current())return false
  const status:ActivityStatus=item.status==='done'?'want':'done'
  try{
   if(setupRequired.value){saving.value++;pending.value.push(id)
    try{const {data,error:failure}=await client.from('activity_items').update({status}).eq('id',id).eq('version',item.version).select().single();if(failure)throw failure;if(current()&&data)putItem(data)}finally{saving.value--;pending.value=pending.value.filter(key=>key!==id)}
   }else await mutate('item.status',id,{status},item.version)
   error.value=null;return true
  }catch(failure){if(current()){error.value=activityLibraryError(failure);if(error.value==='conflict')void loadItems()}return false}
 }
 async function deleteItem(id:string){
  if(loading)await loading
  if(pending.value.includes(id))return false
  const item=items.value.find(i=>i.id===id);if(!item||!current())return false
  saving.value++;pending.value.push(id)
  try{await client.trash('activities',id,item.version);if(current()){items.value=items.value.filter(i=>i.id!==id);memberships.value=memberships.value.filter(m=>m.item_id!==id)}error.value=null;return true}
  catch(failure){if(current())error.value=activityLibraryError(failure);return false}
  finally{saving.value--;pending.value=pending.value.filter(key=>key!==id)}
 }
 client.listen({activity_items:loadItems},()=>isLoading.value||busy.value)
 return {items,collections,memberships,isLoading,busy,pending,error,setupRequired,wantCount,doneCount,itemsByType,inCollection,loadItems,mutate,addFromSearch,toggleStatus,deleteItem}
})
