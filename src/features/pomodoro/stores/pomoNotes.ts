import { ref } from 'vue'
import { defineWorkspaceStore, useWorkspaceClient } from '@/lib/workspaceScope'
import { useWorkspacesStore } from '@/stores/workspaces'
import { supabase } from '@/lib/supabase'
import type { FocusTarget } from './pomodoro'
export interface PomoTask extends Omit<FocusTarget,'estimated_sessions'|'focus_seconds'> { estimated_sessions:number|null; focus_seconds:number|null; completed:boolean; created_at:string; updated_at:string; version:number; sessions:number; seconds:number; first_estimate_seconds:number|null }
export const usePomoNotesStore=defineWorkspaceStore('pomo-notes',()=>{
  const workspaces=useWorkspacesStore(),client=useWorkspaceClient()
  const wid=workspaces.activeId,scope=workspaces.sessionKey
  const items=ref<PomoTask[]>([]),total=ref(0),hasMore=ref(false),loading=ref(false),saving=ref(false),active=ref(false)
  const status=ref<'idle'|'ready'|'setup'|'error'>('idle'),error=ref(''),filter=ref<'active'|'completed'|'all'>('active'),search=ref('')
  const revealedId=ref('')
  let generation=0,cursor:{created_at:string;id:string}|null=null
  let loadedFilter='',loadedSearch=''
  const current=()=>scope===workspaces.sessionKey
  async function load(append=false) {
    if(append&&(loading.value||!hasMore.value))return false
    const request=++generation
    loading.value=true;error.value=''
    try {
      const requestedFilter=filter.value,requestedSearch=search.value.slice(0,100)
      const retained=loadedFilter===requestedFilter&&loadedSearch===requestedSearch?Math.max(30,items.value.length):30
      let after=append?cursor:null,rows:PomoTask[]=[],page
      do {
        const result=await supabase.rpc('pomonotes_page',{wid,status_filter:requestedFilter,search_text:requestedSearch,after_item:after,page_size:30})
        if(!current()||request!==generation)return false
        if(result.error)throw result.error
        page=result.data
        // Shared rows keep their owner's origin in SQL; focus belongs to this user's bound workspace.
        rows.push(...page.items.map((item:PomoTask)=>({...item,workspace_id:wid})));after=page.cursor
      } while(!append&&page.has_more&&rows.length<retained)
      if(revealedId.value&&!rows.some(row=>row.id===revealedId.value)) {
        const located=await supabase.rpc('pomonotes_search_target',{wid,tid:revealedId.value})
        if(!current()||request!==generation)return false
        if(located.error)throw located.error
        if(located.data)rows.unshift({...located.data,workspace_id:wid})
        else revealedId.value=''
      }
      items.value=append?[...items.value,...rows.filter(item=>!items.value.some(row=>row.id===item.id))]:rows
      total.value=Number(page.total);hasMore.value=page.has_more;cursor=page.cursor;status.value='ready'
      loadedFilter=requestedFilter;loadedSearch=requestedSearch
      return true
    } catch(failure) {
      if(!current()||request!==generation)return false
      const code=failure&&typeof failure==='object'&&'code' in failure?String(failure.code):''
      status.value=['PGRST202','42883','42P01'].includes(code)?'setup':'error'
      error.value=failure&&typeof failure==='object'&&'message' in failure?String(failure.message):'LOAD_FAILED'
      return false
    } finally{if(current()&&request===generation)loading.value=false}
  }
  async function mutate(operation:string,task:PomoTask|null,values:{title?:string;estimate?:number;seconds?:number}={}) {
    if(saving.value||!current())return false
    saving.value=true;error.value=''
    try {
      const result=await supabase.rpc('pomonotes_mutate',{wid,operation,tid:task?.id||null,title:values.title??null,
        estimate:values.estimate??task?.estimated_sessions??1,focus_seconds:values.seconds??task?.focus_seconds??1500,expected_version:task?.version??null})
      if(!current())return false
      if(result.error)throw result.error
      await load()
      return true
    } catch(failure) {
      if(current())error.value=failure&&typeof failure==='object'&&'message' in failure?String(failure.message):'SAVE_FAILED'
      return false
    } finally{saving.value=false}
  }
  async function history(task:PomoTask,before?:{started_at:string;id:string}) {
    const result=await supabase.rpc('pomonotes_history',{wid,tid:task.id,before_time:before?.started_at||null,before_id:before?.id||null})
    if(!current())throw Error('WORKSPACE_CHANGED')
    if(result.error)throw result.error
    return result.data as {id:string;started_at:string;planned_seconds:number;status:string;credited_completed:boolean;credited_segments:[string,string][]}[]
  }
  client.listen({pomo_tasks:()=>load()},()=>!active.value||saving.value)
  return {revealedId,items,total,hasMore,loading,saving,active,status,error,filter,search,load,mutate,history}
})
