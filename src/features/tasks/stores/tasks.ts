import { onScopeDispose, ref } from 'vue'
import { defineWorkspaceStore } from '@/lib/workspaceScope'
import { useWorkspacesStore } from '@/stores/workspaces'
import { supabase } from '@/lib/supabase'
import { onTrashChange } from '@/lib/workspaceTrash'
import { monthRange, workError, type WorkBlock, type WorkEntity, type WorkProject, type WorkTask } from '../lib/tasks'

export const useTasksStore=defineWorkspaceStore('work-tasks',()=>{
  const spaces=useWorkspacesStore(),scope=spaces.sessionKey,wid=spaces.activeId
  const projects=ref<WorkProject[]>([]),tasks=ref<WorkTask[]>([]),blocks=ref<WorkBlock[]>([])
  const deadlines=ref<Pick<WorkTask,'id'|'title'|'due_on'|'status'>[]>([])
  const project=ref(''),range=ref(monthRange()),loading=ref(false),calendarLoading=ref(false),saving=ref(false),paging=ref(false)
  const error=ref(''),calendarError=ref(''),ready=ref(false),calendarReady=ref(false),calendarActive=ref(false),calendarDirty=ref(true),hasMore=ref(false),total=ref(0)
  const counts=ref({todo:0,doing:0,done:0})
  let disposed=false,generation=0,calendarGeneration=0,cursor:{id:string;created_at:string}|null=null
  let calendarRequested=false,calendarProject='',calendarRequest:{key:string;generation:number;promise:Promise<boolean>}|undefined
  let trashRefreshPending=false,trashTasksPending=false
  const current=()=>!disposed&&spaces.sessionKey===scope
  function applyPage(page:any,append=false,preserve=false){
    if(append)tasks.value=[...tasks.value,...page.items.filter((row:WorkTask)=>!tasks.value.some(item=>item.id===row.id))]
    else if(preserve)tasks.value=[...page.items,...tasks.value.filter(row=>!page.items.some((item:WorkTask)=>item.id===row.id)&&(!project.value||row.project_id===project.value))]
    else tasks.value=page.items
    cursor=preserve?(cursor||page.cursor):page.cursor
    hasMore.value=preserve?tasks.value.length<page.total:page.has_more;total.value=page.total;counts.value=page.counts
  }
  async function load(append=false,preserve=false){
    if(!current()||append&&(loading.value||paging.value||!hasMore.value))return false
    const request=append?generation:++generation,selected=project.value
    if(append)paging.value=true;else{loading.value=true;error.value=''}
    try{
      const result=await supabase.rpc('work_load',{wid,selected_project:selected||null,after_created:append?cursor?.created_at:null,after_id:append?cursor?.id:null}).abortSignal(AbortSignal.timeout(20000))
      if(!current()||request!==generation||selected!==project.value)return false
      if(result.error)throw result.error
      projects.value=result.data.projects;applyPage(result.data.tasks,append,preserve);ready.value=true;return true
    }catch(failure){if(current()&&request===generation)error.value=workError(failure);return false}
    finally{if(current()&&request===generation){loading.value=false;paging.value=false}}
  }
  function invalidateCalendar(clear=false){
    calendarDirty.value=true;calendarGeneration++;calendarRequest=undefined;calendarLoading.value=false
    if(clear){blocks.value=[];deadlines.value=[];calendarReady.value=false}
  }
  async function loadCalendar(start=range.value.start,end=range.value.end,force=false):Promise<boolean>{
    if(!current())return false
    const selected=project.value,key=JSON.stringify([selected,start,end])
    if(calendarRequest?.key===key&&calendarRequest.generation===calendarGeneration)return calendarRequest.promise
    const unchanged=range.value.start===start&&range.value.end===end
    range.value={start,end};calendarRequested=true
    if(!force&&unchanged&&calendarReady.value&&!calendarDirty.value&&calendarProject===selected)return true
    const request=++calendarGeneration
    calendarLoading.value=true;calendarDirty.value=true;calendarError.value=''
    const promise=Promise.resolve().then(async()=>{
      try{
        const result=await supabase.rpc('work_calendar',{wid,range_start:start,range_end:end,selected_project:selected||null}).abortSignal(AbortSignal.timeout(20000))
        if(!current()||request!==calendarGeneration||selected!==project.value)return false
        if(result.error)throw result.error
        blocks.value=result.data.blocks;deadlines.value=result.data.deadlines;calendarProject=selected;calendarReady.value=true;calendarDirty.value=false;return true
      }catch(failure){if(current()&&request===calendarGeneration)calendarError.value=workError(failure);return false}
      finally{if(current()&&request===calendarGeneration){calendarLoading.value=false;calendarRequest=undefined}}
    })
    calendarRequest={key,generation:request,promise}
    return promise
  }
  async function setCalendarActive(active:boolean){
    calendarActive.value=active
    if(!active||!calendarRequested||!calendarDirty.value)return false
    return loadCalendar()
  }
  async function selectProject(id:string){
    if(!current()||saving.value||project.value===id)return
    project.value=id;tasks.value=[];hasMore.value=false;cursor=null
    invalidateCalendar(true)
    await Promise.allSettled([load(),...(calendarActive.value&&calendarRequested?[loadCalendar()]:[])])
  }
  async function mutate(entity:WorkEntity,operation:string,id:string,payload:Record<string,unknown>,version:number|null=null){
    if(!current()||saving.value)return null
    saving.value=true;error.value=''
    try{
      const result=await supabase.rpc('work_mutate',{wid,entity,operation,rid:id,payload,expected_version:version}).abortSignal(AbortSignal.timeout(20000))
      if(!current())return null
      if(result.error)throw result.error
      // A committed write is successful even when a later refresh fails.
      if(entity==='task'){
        const index=tasks.value.findIndex(row=>row.id===id)
        if(index>=0)tasks.value[index]=result.data
        else if(!project.value||result.data.project_id===project.value)tasks.value.unshift(result.data)
        blocks.value=blocks.value.map(row=>row.task_id===id?{...row,task_title:result.data.title,task_status:result.data.status,project_id:result.data.project_id}:row)
        deadlines.value=deadlines.value.filter(row=>row.id!==id)
        if(result.data.due_on)deadlines.value.push({id,title:result.data.title,due_on:result.data.due_on,status:result.data.status})
      }else if(entity==='project'){
        const index=projects.value.findIndex(row=>row.id===id)
        if(index>=0)projects.value[index]=result.data;else projects.value.push(result.data)
      }else{
        const index=blocks.value.findIndex(row=>row.id===id)
        const task=tasks.value.find(row=>row.id===result.data.task_id)
        const previous=index>=0&&blocks.value[index]?.task_id===result.data.task_id?blocks.value[index]:undefined
        const enriched={...result.data,task_title:task?.title??previous?.task_title,task_status:task?.status??previous?.task_status,project_id:task?.project_id??previous?.project_id??null}
        if(index>=0)blocks.value[index]={...blocks.value[index],...enriched}
        else blocks.value.push(enriched)
      }
      if(entity!=='project')invalidateCalendar()
      await Promise.allSettled([...(entity==='task'?[load(false,true)]:[]),...(calendarActive.value&&calendarRequested&&entity!=='project'?[loadCalendar()]:[])])
      return result.data
    }catch(failure){if(current())error.value=workError(failure);return null}
    finally{saving.value=false}
  }
  async function findTask(id:string){
    if(!current())return null
    try{
      const result=await supabase.rpc('work_task',{wid,tid:id}).abortSignal(AbortSignal.timeout(20000))
      if(!current())return null
      if(result.error)throw result.error
      return result.data as WorkTask|null
    }catch(failure){if(current())error.value=workError(failure);return null}
  }
  const stop=onTrashChange(change=>{
    if(change.owner!==spaces.userId||change.workspace!==wid||!['tasks','calendar'].includes(change.module)||!current())return
    if(change.module==='tasks'&&(change.action==='move'||change.action==='purge')){
      tasks.value=tasks.value.filter(row=>row.id!==change.id)
      blocks.value=blocks.value.filter(row=>row.task_id!==change.id)
      deadlines.value=deadlines.value.filter(row=>row.id!==change.id)
    }
    if(change.module==='calendar'&&(change.action==='move'||change.action==='purge'))blocks.value=blocks.value.filter(row=>row.id!==change.id)
    invalidateCalendar()
    if(change.module==='tasks')trashTasksPending=true
    if(trashRefreshPending)return
    trashRefreshPending=true
    void Promise.resolve().then(()=>{
      trashRefreshPending=false
      const reloadTasks=trashTasksPending;trashTasksPending=false
      if(!current())return
      return Promise.allSettled([...(reloadTasks?[load(false,true)]:[]),...(calendarActive.value&&calendarRequested?[loadCalendar()]:[])])
    })
  })
  onScopeDispose(()=>{disposed=true;generation++;calendarGeneration++;stop()})
  return {projects,tasks,blocks,deadlines,project,range,loading,calendarLoading,saving,paging,error,calendarError,ready,calendarReady,calendarActive,calendarDirty,hasMore,total,counts,load,loadCalendar,setCalendarActive,selectProject,mutate,findTask}
})
