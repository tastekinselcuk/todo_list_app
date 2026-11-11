<template>
  <section class="workspace-content space-y-4" style="--workspace-default-max:76rem">
    <div class="workspace-toolbar space-y-3">
      <div class="task-view-navigation flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div class="flex items-center gap-0.5 rounded-xl bg-muted/35 p-0.5" role="group" :aria-label="t('tasks.view')"><button v-for="item in views" :key="item.id" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :class="view===item.id?'bg-background text-foreground shadow-sm ring-1 ring-border/50':'text-muted-foreground hover:bg-background/40 hover:text-foreground'" :aria-pressed="view===item.id" :disabled="busy" @click="view=item.id"><component :is="item.icon" class="h-3.5 w-3.5" />{{ item.label }}</button></div>
        <div class="flex min-w-0 items-center gap-1.5"><ProjectSelect :model-value="store.project" :projects="store.projects" filter class="w-44" :disabled="busy||store.loading" :save-project="saveProject" :delete-project="store.deleteProject" @update:model-value="store.selectProject" /><button type="button" class="finance-icon" :disabled="store.loading||store.calendarLoading||busy" :aria-label="t('tasks.refresh')" @click="refresh"><RefreshCw class="h-3.5 w-3.5" :class="(store.loading||store.calendarLoading)&&'animate-spin'" /></button></div>
      </div>
      <form v-if="view!=='calendar'" class="flex items-center gap-2" @submit.prevent="createTask">
        <input v-model="draftTitle" maxlength="180" required class="finance-input !h-10 flex-1" :placeholder="t('tasks.placeholder')" :aria-label="t('tasks.title')" :disabled="busy||!store.ready||activeProjectArchived" />
        <button type="submit" class="workspace-add-button" :disabled="busy||!store.ready||!draftTitle.trim()||activeProjectArchived"><Loader2 v-if="store.saving" class="h-4 w-4 animate-spin motion-reduce:animate-none" /><span v-else>{{ t('tasks.add') }}</span></button>
      </form>
    </div>

    <div v-if="store.error&&!editor" role="alert" class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{{ t(`tasks.${store.error}`) }}</span><button type="button" class="text-primary underline-offset-2 hover:underline disabled:opacity-40" :disabled="busy||store.loading" @click="refresh">{{ t('tasks.retry') }}</button></div>
    <p v-if="activeProjectArchived" class="text-xs text-muted-foreground">{{ t('tasks.projectArchived') }}</p>
    <template v-if="store.ready">
      <div v-if="view!=='calendar'" class="flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground"><span>{{ t('tasks.progress',{done:store.counts.done,total:store.total}) }}</span><button v-if="view==='list'" type="button" class="inline-flex items-center gap-1.5" :aria-pressed="showCompleted" @click="showCompleted=!showCompleted"><Check class="h-3 w-3" />{{ t('tasks.showCompleted') }}<span class="h-3.5 w-6 rounded-full p-0.5 transition-colors" :class="showCompleted?'bg-primary':'bg-muted'"><span class="block h-2.5 w-2.5 rounded-full transition-transform" :class="showCompleted?'translate-x-2.5 bg-primary-foreground':'bg-muted-foreground/60'" /></span></button></div>
      <div v-if="view==='list'" class="space-y-2"><TaskRow v-for="task in visibleTasks" :key="task.id" :task="task" :project-name="projectNameFor(task.project_id)" :busy="busy" :save-checklist="saveChecklist" @edit="editTask(task)" @status="value=>setStatus(task,value)" @toggle="setStatus(task,task.status==='done'?'todo':'done')" @schedule="schedule(task)" @open-time="id=>editTask(task,id)" @remove="remove('tasks',task)" /><p v-if="!visibleTasks.length&&!store.loading" class="py-9 text-center text-xs text-muted-foreground">{{ t(store.total?'tasks.noVisible':'tasks.empty') }}</p></div>
      <div v-else-if="view==='board'" class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <section v-for="status in taskStatuses" :key="status" class="min-w-0 space-y-2 rounded-xl bg-muted/15 p-2 transition-colors" :class="dragOver===status&&'ring-1 ring-primary/40 bg-primary/5'" @dragover.prevent="dragOver=status" @dragleave.self="dragOver=''" @drop.prevent="drop($event,status)">
          <h3 class="flex items-center justify-between px-1 py-1.5 text-xs font-medium"><span>{{ t(`tasks.${status}`) }}</span><span class="text-[10px] font-normal tabular-nums text-muted-foreground">{{ store.counts[status] }}</span></h3>
          <div v-for="task in store.tasks.filter(row=>row.status===status)" :key="task.id" :draggable="!busy" @dragstart="dragStart($event,task)" @dragend="dragOver=''" class="cursor-grab active:cursor-grabbing"><TaskRow :task="task" :project-name="projectNameFor(task.project_id)" :busy="busy" :save-checklist="saveChecklist" compact @edit="editTask(task)" @status="value=>setStatus(task,value)" @toggle="setStatus(task,task.status==='done'?'todo':'done')" @schedule="schedule(task)" @open-time="id=>editTask(task,id)" @remove="remove('tasks',task)" /></div>
          <p v-if="!store.tasks.some(row=>row.status===status)" class="rounded-xl border border-dashed border-border/50 px-3 py-5 text-center text-[11px] text-muted-foreground">{{ t('tasks.emptyColumn') }}</p>
        </section>
      </div>
      <template v-else>
        <p v-if="store.calendarError" role="alert" class="text-xs text-muted-foreground">{{ t(`tasks.${store.calendarError}`) }}</p>
        <WorkCalendar v-if="moduleActive" :blocks="store.blocks" :deadlines="store.deadlines" :busy="busy" :loading="store.calendarLoading" :failed="!!store.calendarError" :save-move="moveBlock" @range="rangeChanged" @create="createBlock" @edit="editBlock" @task="openTask" @toggle-task="toggleCalendarTask" @toggle-steps="toggleCalendarSteps">
        </WorkCalendar>
      </template>
      <button v-if="view!=='calendar'&&store.hasMore" type="button" class="w-full rounded-xl border border-border/60 py-2 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-40" :disabled="store.loading||store.paging||busy" @click="store.load(true)">{{ t('tasks.more') }}</button>
    </template>
    <div v-else-if="store.loading" class="space-y-2" role="status" :aria-label="t('app.loading')"><div v-for="n in 2" :key="n" class="workspace-card h-16 animate-pulse bg-muted/20 motion-reduce:animate-none" /></div>
    <WorkEditor v-if="editor" :key="editor.id" :mode="editor.mode" :draft-id="editor.id" :initial-title="editor.initialTitle" :initial-project="editor.initialProject" :load-task="store.findTask" :save-project="saveProject" :delete-project="store.deleteProject" :task="editor.task" :block="editor.block" :tasks="store.tasks" :projects="store.projects" :blocks="store.blocks" :saving="busy" :error="store.error" @save="saveEditor" @close="editor=null;store.error=''" @remove="removeEditorBlock" />
    <TaskCompletionDialog v-if="completion" :title="completion.title" :count="completion.count" @resolve="resolveCompletion" />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarDays, Check, Columns3, List, Loader2, RefreshCw } from 'lucide-vue-next'
import ProjectSelect from './ProjectSelect.vue'
import { useModuleLoad } from '@/lib/workspaceScope'
import { useSearchReveal } from '@/lib/searchNavigation'
import { workspaceNavigationKey, workspaceActiveViewKey } from '@/lib/workspaceNavigation'
import { useWorkspacesStore } from '@/stores/workspaces'
import { moveToTrash, type TrashModule } from '@/lib/workspaceTrash'
import { browserTimezone, taskStatuses, unassignedProject, workError, type WorkDetailsDraft, type TaskStatus, type WorkBlock, type WorkProject, type WorkTask } from '../lib/tasks'
import { useTasksStore } from '../stores/tasks'
import TaskRow from './TaskRow.vue'
import WorkEditor from './WorkEditor.vue'
import TaskCompletionDialog from './TaskCompletionDialog.vue'
const WorkCalendar=defineAsyncComponent(()=>import('./WorkCalendar.vue'))
const {t}=useI18n(),store=useTasksStore(),spaces=useWorkspacesStore(),scope=spaces.sessionKey,wid=spaces.activeId,owner=spaces.userId
const view=ref('calendar'),draftTitle=ref(''),showCompleted=ref(false)
const moduleActive=ref(true)
watch([view,moduleActive],([mode,active])=>{void store.setCalendarActive(active&&mode==='calendar')},{immediate:true})
onActivated(()=>{moduleActive.value=true;if(view.value==='calendar'&&store.calendarReady)void store.loadCalendar(undefined,undefined,true)})
onDeactivated(()=>{editorRevision++;resolveCompletion(false);draftTitle.value='';moduleActive.value=false;view.value='calendar';showCompleted.value=false;editor.value=null;opening.value=false;dragOver.value=''})
onBeforeUnmount(()=>{editorRevision++;moduleActive.value=false;resolveCompletion(false)})
const navigation=inject(workspaceNavigationKey,ref(null))
watch(navigation,intent=>{if(intent?.module==='tasks'&&['list','board','calendar'].includes(intent.view))view.value=intent.view},{immediate:true})
const reportView=inject(workspaceActiveViewKey,undefined)
watch(view,value=>reportView?.('tasks',value),{immediate:true})
const views=computed(()=>[{id:'list',label:t('tasks.list'),icon:List},{id:'board',label:t('tasks.board'),icon:Columns3},{id:'calendar',label:t('tasks.calendar'),icon:CalendarDays}])
const completion=ref<{title:string;count:number;resolve:(confirmed:boolean)=>void}|null>(null)
const moving=ref(false),opening=ref(false),busy=computed(()=>moving.value||opening.value||store.saving||!!completion.value),dragOver=ref('')
const editor=ref<{id:string;mode:'task'|'block';task?:WorkTask;block?:Partial<WorkBlock>;initialTitle?:string;initialProject?:string }|null>(null)
let editorRevision=0
const visibleTasks=computed(()=>store.tasks.filter(row=>showCompleted.value||row.status!=='done'))
const activeProjectArchived=computed(()=>!!store.projects.find(row=>row.id===store.project)?.archived)
const projectNameFor=(id:string|null)=>store.projects.find(row=>row.id===id)?.name
function createTask(){if(busy.value||!draftTitle.value.trim()||!store.ready||activeProjectArchived.value)return;store.error='';editor.value={id:crypto.randomUUID(),mode:'task',initialTitle:draftTitle.value.trim(),initialProject:store.project===unassignedProject?'':store.project};draftTitle.value=''}
async function saveProject(name:string,id:string,version?:number,archived?:boolean):Promise<WorkProject|null>{return store.mutate('project',version===undefined?'create':'update',id,{name,...(archived===undefined?{}:{archived})},version)}
async function loadEditorTask(task:WorkTask,block?:Partial<WorkBlock>){
 if(busy.value)return
 const revision=++editorRevision;opening.value=true;store.error=''
 try{const current=await store.findTask(task.id);if(current&&revision===editorRevision&&spaces.sessionKey===scope&&moduleActive.value)editor.value={id:current.id,mode:'task',task:current,block}}finally{if(revision===editorRevision)opening.value=false}
}
async function editTask(task:WorkTask,timeId?:string){await loadEditorTask(task,timeId?task.scheduled_blocks?.find(row=>row.id===timeId):undefined)}
async function editBlock(block:WorkBlock){if(busy.value)return;if(block.task_id){const task=store.tasks.find(row=>row.id===block.task_id)||{id:block.task_id} as WorkTask;await loadEditorTask(task,block)}else{store.error='';editor.value={id:block.id,mode:'block',block}}}
function createBlock(date=new Date(),end?:Date){if(busy.value)return;const start=new Date(date);if(!end){start.setSeconds(0,0);start.setMinutes(Math.ceil(start.getMinutes()/15)*15)}store.error='';editor.value={id:crypto.randomUUID(),mode:'block',block:{starts_at:start.toISOString(),ends_at:(end||new Date(start.getTime()+30*60000)).toISOString(),timezone:browserTimezone()}}}
async function schedule(task:WorkTask,date?:Date){if(busy.value||task.status==='done')return;const start=new Date(date||new Date());start.setSeconds(0,0);start.setMinutes(Math.ceil(start.getMinutes()/15)*15);await loadEditorTask(task,{starts_at:start.toISOString(),ends_at:new Date(start.getTime()+30*60000).toISOString(),timezone:browserTimezone()})}
function resolveCompletion(confirmed:boolean){const request=completion.value;completion.value=null;request?.resolve(confirmed)}
async function persistTask(id:string,payload:Record<string,unknown>,task?:WorkTask){
  if(busy.value||spaces.sessionKey!==scope||!moduleActive.value)return null
  const changes={...payload},checklist=(changes.checklist??task?.checklist??[]) as WorkTask['checklist']
  const remaining=checklist.filter(item=>!item.done).length
  if(changes.status==='done'&&remaining){
    const confirmed=await new Promise<boolean>(resolve=>{completion.value={title:String(changes.title??task?.title??''),count:remaining,resolve}})
    if(!confirmed||busy.value||spaces.sessionKey!==scope||!moduleActive.value)return null
    // Status and steps are committed in the same version-checked transaction.
    changes.checklist=checklist.map(item=>({...item,done:true}))
  }else if(task?.status==='done'&&remaining&&changes.status===undefined){
    // Reopening/adding an unfinished step reopens its completed parent.
    changes.status='todo'
  }
  return store.mutate('task',task?'update':'create',id,changes,task?.version)
}
async function saveEditor(draft:WorkDetailsDraft){
 const current=editor.value;if(!current||busy.value)return
 const value={...draft,task:draft.task?{...draft.task}:null}
 if(value.task?.status==='done'){
  const checklist=value.task.checklist as WorkTask['checklist'],remaining=checklist.filter(item=>!item.done).length
  if(remaining){const confirmed=await new Promise<boolean>(resolve=>{completion.value={title:String(value.task!.title),count:remaining,resolve}});if(!confirmed||busy.value||!moduleActive.value||spaces.sessionKey!==scope)return;value.task.checklist=checklist.map(item=>({...item,done:true}))}
 }
 const result=await store.saveDetails(value);if(result&&spaces.sessionKey===scope)editor.value=null
}
async function setStatus(task:WorkTask,status:TaskStatus){if(busy.value||status===task.status)return;await persistTask(task.id,{status},task)}
async function saveChecklist(task:WorkTask,checklist:WorkTask['checklist']){
  if(busy.value||spaces.sessionKey!==scope)return false
  return Boolean(await persistTask(task.id,{checklist},task))
}
function dragStart(event:DragEvent,task:WorkTask){event.dataTransfer?.setData('application/x-work-task',task.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move'}
async function drop(event:DragEvent,status:TaskStatus){dragOver.value='';const id=event.dataTransfer?.getData('application/x-work-task'),task=store.tasks.find(row=>row.id===id);if(task)await setStatus(task,status)}
async function moveBlock(block:WorkBlock,start:string,end:string){return Boolean(await store.mutate('block','update',block.id,{starts_at:start,ends_at:end},block.version))}
async function toggleCalendarSteps(block:WorkBlock){
 if(busy.value||!block.task_id||!block.subtask_ids?.length)return
 const task=await store.findTask(block.task_id);if(!task||spaces.sessionKey!==scope||!moduleActive.value)return
 const targets=new Set(block.subtask_ids),selected=task.checklist.filter(item=>targets.has(item.id));if(!selected.length)return
 const done=!selected.every(item=>item.done)
 await persistTask(task.id,{checklist:task.checklist.map(item=>targets.has(item.id)?{...item,done}:item)},task)
}
async function toggleCalendarTask(id:string){if(busy.value)return;const task=store.tasks.find(row=>row.id===id)||await store.findTask(id);if(task&&spaces.sessionKey===scope)await setStatus(task,task.status==='done'?'todo':'done')}
async function remove(module:TrashModule,row:WorkTask|WorkBlock){if(busy.value)return false;moving.value=true;store.error='';try{await moveToTrash(wid,module,row.id,row.version,owner);return spaces.sessionKey===scope}catch(error){if(spaces.sessionKey===scope)store.error=workError(error);return false}finally{moving.value=false}}
async function removeEditorBlock(){const block=editor.value?.block;if(block?.id&&await remove('calendar',block as WorkBlock))editor.value=null}
function rangeChanged(start:string,end:string){void store.loadCalendar(start,end)}
async function openTask(id:string){const task=store.tasks.find(row=>row.id===id)||await store.findTask(id);if(task&&spaces.sessionKey===scope)editTask(task)}
async function refresh(){await store.load();if(view.value==='calendar')await store.loadCalendar(undefined,undefined,true)}
useModuleLoad(()=>store.project&&!store.saving?store.selectProject(''):store.load())
useSearchReveal('tasks',async(hit,isCurrent)=>{const task=await store.findTask(hit.record_id);if(!task||!isCurrent())throw Error('Unavailable');view.value='list';showCompleted.value=task.status==='done'||showCompleted.value;if(store.project&&store.project!==task.project_id)await store.selectProject('');if(!isCurrent())return;if(!store.tasks.some(row=>row.id===task.id))store.tasks.unshift(task)})
</script>
