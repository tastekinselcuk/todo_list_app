import { defineWorkspaceStore as defineStore, useWorkspaceClient } from '@/lib/workspaceScope'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useAuthStore } from '@/stores/auth'

export type StudyStatus = 'todo' | 'doing' | 'done'
export interface Topic { id:string; title:string; learn:boolean; practice:boolean; master:boolean; archived?:boolean; _version?:number }
export interface Subject { id:string; title:string; color:string; topics:Topic[]; version?:number; position?:number; template_key?:string }
export interface Progress { subject_id:string; topic_id:string; status:StudyStatus; version:number; review_on:string|null; streak:number; seconds?:number; note_id?:string; deck_id?:string; pomo_task_id?:string }
export interface Mistake { id:string; subject_id:string; topic_id:string; prompt:string; solution:string; source:string; reason:string; image_path:string|null; resolved:boolean; review_on:string|null; attempts:number; version:number; created_at:string; deleted_at:string|null }
export type LearningView = 'topics' | 'today' | 'mistakes'
export function learningError(error:unknown) {
 const text=String((error as {message?:string})?.message || error),code=(error as {code?:string})?.code
 if(['setup','conflict','permission','templateTrash','unavailable','nameLimit','failed'].includes(text))return text
 if(code==='PGRST202'||code==='42883'||/Could not find the function|learning_.*does not exist/i.test(text))return 'setup'
 if(/CONFLICT/.test(text))return 'conflict'
 if(/ACCESS_DENIED|permission denied|row-level security/i.test(text))return 'permission'
 if(/TEMPLATE_IN_TRASH/.test(text))return 'templateTrash'
 if(/UNAVAILABLE/.test(text))return 'unavailable'
 if(/INVALID_LEARNING_NAME/.test(text))return 'nameLimit'
 if(/INVALID_LEARNING_ORDER/.test(text))return 'conflict'
 return 'failed'
}
export const useLearningStore=defineStore('learning',()=>{
 const workspaces=useWorkspacesStore(),auth=useAuthStore(),client=useWorkspaceClient()
 // Captured once: late responses from a previous account/workspace cannot update this store.
 const scope=workspaces.sessionKey,wid=workspaces.activeId,owner=auth.user?.id
 const current=()=>scope===workspaces.sessionKey&&owner===auth.user?.id
 const subjects=ref<Subject[]>([]),progress=ref<Progress[]>([]),dueMistakes=ref<Mistake[]>([]),mistakes=ref<Mistake[]>([])
 const isLoading=ref(false),savingChildren=ref(0),error=ref(''),setupRequired=ref(false),mistakesLoading=ref(false),hasMore=ref(false),total=ref(0)
 const busy=computed(()=>savingChildren.value>0)
 let flight:Promise<boolean>|undefined,request=0,pageRequest=0,filter='open'
 const progressKey=(sid:string,tid:string)=>`${sid}:${tid}`
 const progressMap=computed(()=>new Map(progress.value.map(p=>[progressKey(p.subject_id,p.topic_id),p])))
 function state(sid:string,tid:string):Progress {return progressMap.value.get(progressKey(sid,tid))||{subject_id:sid,topic_id:tid,status:'todo',version:0,review_on:null,streak:0}}
 function putSubject(row:Subject){const i=subjects.value.findIndex(s=>s.id===row.id);if(i<0)subjects.value.push(row);else if((subjects.value[i]!.version||0)<=(row.version||0))subjects.value[i]=row;subjects.value.sort((a,b)=>(a.position||0)-(b.position||0))}
 function putProgress(row:Progress){const i=progress.value.findIndex(p=>p.subject_id===row.subject_id&&p.topic_id===row.topic_id);if(i<0)progress.value.push(row);else if(progress.value[i]!.version<=row.version)progress.value[i]={...progress.value[i],...row}}
 async function load(){
  const generation=++request;isLoading.value=true
  try{
   const {data,error:failure}=await supabase.rpc('learning_load',{wid});if(failure)throw failure
   if(!current()||generation!==request)return false
   subjects.value=data.subjects||[];progress.value=data.progress||[];dueMistakes.value=data.due_mistakes||[];error.value='';setupRequired.value=false;return true
  }catch(failure){
   if(!current()||generation!==request)return false
   error.value=learningError(failure);setupRequired.value=error.value==='setup'
   // Existing subjects remain readable before the upgrade. No unsafe whole-array writes.
   if(setupRequired.value){const result=await client.from('learning_subjects').select('*').eq('user_id',owner).order('created_at');if(current()&&!result.error)subjects.value=result.data||[]}
   return false
  }finally{if(generation===request)isLoading.value=false}
 }
 function fetchSubjects(_targetId?:string){if(!flight)flight=load().finally(()=>{flight=undefined});return flight}
 async function mutate(operation:string,sid:string|null=null,tid:string|null=null,payload:Record<string,unknown>={},version:number|null=null){
  if(!current())throw Error('LEARNING_ACCESS_DENIED')
  savingChildren.value++
  try{
   const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'
   const {data,error:failure}=await supabase.rpc('learning_mutate',{wid,operation,sid,tid,payload:{...payload,timezone},expected_version:version})
   if(failure)throw failure;if(!current())throw Error('LEARNING_ACCESS_DENIED')
   if(data.subject)putSubject(data.subject);if(data.subjects)data.subjects.forEach(putSubject);if(data.progress)putProgress(data.progress)
   if(data.mistake){const m:Mistake=data.mistake;const i=mistakes.value.findIndex(row=>row.id===m.id);if(i>=0)mistakes.value[i]=m
    dueMistakes.value=dueMistakes.value.filter(row=>row.id!==m.id);if(!m.deleted_at&&!m.resolved)dueMistakes.value.push(m)}
   if(data.reload)await fetchSubjects();error.value='';return data
  }catch(failure){if(current()){error.value=learningError(failure);if(error.value==='conflict')void fetchSubjects()}throw failure}
  finally{savingChildren.value--}
 }
 async function addSubject(title:string,color:string){try{await mutate('subject.create',crypto.randomUUID(),null,{title,color});return true}catch{return false}}
 async function deleteSubject(id:string){savingChildren.value++;try{const {error:failure}=await client.from('learning_subjects').delete().eq('id',id).eq('version',subjects.value.find(s=>s.id===id)?.version);if(failure)throw failure;if(current())subjects.value=subjects.value.filter(s=>s.id!==id);return true}catch(failure){error.value=learningError(failure);return false}finally{savingChildren.value--}}
 async function reorder(sid:string|null,ids:string[],versions:Record<string,number|undefined>){
  if(!current())throw Error('LEARNING_ACCESS_DENIED')
  savingChildren.value++
  try{
   const {data,error:failure}=await supabase.rpc('learning_reorder',{wid,sid,ordered_ids:ids,expected_versions:versions})
   if(failure)throw failure;if(!current())throw Error('LEARNING_ACCESS_DENIED')
   if(data.subject)putSubject(data.subject);if(data.subjects)data.subjects.forEach(putSubject)
   error.value='';return data
  }catch(failure){if(current()){error.value=learningError(failure);if(error.value==='conflict')await fetchSubjects()}throw failure}finally{savingChildren.value--}
 }
 async function fetchMistakes(nextFilter='open',more=false){
  if(mistakesLoading.value)return false
  const generation=++pageRequest;mistakesLoading.value=true
  try{
   const last=more&&nextFilter===filter?mistakes.value[mistakes.value.length-1]:undefined
   const {data,error:failure}=await supabase.rpc('learning_mistakes_page',{wid,filter:nextFilter,after_time:last?.created_at||null,after_id:last?.id||null})
   if(failure)throw failure;if(!current()||generation!==pageRequest)return false
   mistakes.value=last?[...mistakes.value,...data.items]:data.items;filter=nextFilter;hasMore.value=data.has_more;total.value=data.total;return true
  }catch(failure){if(current())error.value=learningError(failure);return false}finally{mistakesLoading.value=false}
 }
 client.listen?.({learning_subjects:fetchSubjects},()=>isLoading.value||busy.value)
 return {subjects,progress,dueMistakes,mistakes,isLoading,busy,error,setupRequired,hasMore,total,mistakesLoading,state,fetchSubjects,addSubject,deleteSubject,mutate,reorder,fetchMistakes}
})
