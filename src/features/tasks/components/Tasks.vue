<template>
  <section class="workspace-content space-y-4" style="--workspace-default-max:76rem">
    <div v-if="view!=='calendar'" class="workspace-toolbar space-y-3">
      <form class="flex items-center gap-2" @submit.prevent="createTask">
        <input v-model="draftTitle" maxlength="180" required class="finance-input !h-11 flex-1" :placeholder="t('tasks.placeholder')" :aria-label="t('tasks.title')" :disabled="busy||!store.ready||activeProjectArchived" />
        <button type="submit" class="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40" :disabled="busy||!store.ready||!draftTitle.trim()||activeProjectArchived"><Loader2 v-if="store.saving" class="h-4 w-4 animate-spin motion-reduce:animate-none" /><span v-else>{{ t('tasks.add') }}</span></button>
      </form>
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div class="flex items-center gap-0.5 rounded-xl bg-muted/35 p-0.5" role="group" :aria-label="t('tasks.view')"><button v-for="item in views" :key="item.id" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :class="view===item.id?'bg-background text-foreground shadow-sm ring-1 ring-border/50':'text-muted-foreground hover:bg-background/40 hover:text-foreground'" :aria-pressed="view===item.id" :disabled="busy" @click="view=item.id"><component :is="item.icon" class="h-3.5 w-3.5" />{{ item.label }}</button></div>
        <div class="flex min-w-0 items-center gap-1.5"><CustomSelect :model-value="store.project" :options="projectOptions" class="w-40 min-w-0 sm:w-48" :disabled="busy||store.loading" size="sm" :aria-label="t('tasks.project')" @update:model-value="store.selectProject" /><button type="button" class="finance-icon" :aria-expanded="projectsOpen" :aria-label="t('tasks.manageProjects')" :title="t('tasks.manageProjects')" @click="projectsOpen=!projectsOpen"><FolderCog class="h-4 w-4" /></button><button type="button" class="finance-icon" :disabled="store.loading||store.calendarLoading||busy" :aria-label="t('tasks.refresh')" :title="t('tasks.refresh')" @click="refresh"><RefreshCw class="h-3.5 w-3.5" :class="(store.loading||store.calendarLoading)&&'animate-spin motion-reduce:animate-none'" /></button></div>
      </div>
    </div>

    <div v-if="projectsOpen" class="workspace-card space-y-3 bg-card/20 p-3">
      <form class="flex items-center gap-2" @submit.prevent="saveProject"><input v-model="projectName" required maxlength="100" class="finance-input !h-9 flex-1 !text-xs" :placeholder="t('tasks.projectName')" :aria-label="t('tasks.projectName')" :disabled="busy" /><button v-if="editingProject" type="button" class="finance-icon" :disabled="busy" :aria-label="t('common.cancel')" @click="editingProject=null;projectName=''"><X class="h-3.5 w-3.5" /></button><button type="submit" class="h-9 rounded-xl bg-primary/10 px-3 text-xs font-medium text-primary disabled:opacity-40" :disabled="busy||!projectName.trim()">{{ t(editingProject?'common.save':'tasks.addProject') }}</button></form>
      <div v-if="store.projects.length" class="max-h-48 space-y-1 overflow-y-auto overscroll-contain"><div v-for="project in store.projects" :key="project.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5" :class="project.archived&&'text-muted-foreground'"><button type="button" class="min-w-0 flex-1 truncate text-left text-xs hover:text-primary disabled:opacity-40" :disabled="busy" @click="store.selectProject(project.id)">{{ project.name }}<span v-if="project.archived" class="ml-2 text-[10px]">{{ t('tasks.archived') }}</span></button><button type="button" class="finance-icon !h-7 !w-7" :disabled="busy" :aria-label="`${t('common.edit')}: ${project.name}`" @click="editingProject=project;projectName=project.name"><Pencil class="h-3 w-3" /></button><button type="button" class="finance-icon !h-7 !w-7" :disabled="busy" :aria-label="`${t(project.archived?'tasks.restoreProject':'tasks.archiveProject')}: ${project.name}`" @click="store.mutate('project','update',project.id,{archived:!project.archived},project.version)"><ArchiveRestore v-if="project.archived" class="h-3.5 w-3.5" /><Archive v-else class="h-3.5 w-3.5" /></button></div></div>
      <p v-else class="text-xs text-muted-foreground">{{ t('tasks.noProjects') }}</p>
    </div>
    <div v-if="store.error&&!editor" role="alert" class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{{ t(`tasks.${store.error}`) }}</span><button type="button" class="text-primary underline-offset-2 hover:underline disabled:opacity-40" :disabled="busy||store.loading" @click="refresh">{{ t('tasks.retry') }}</button></div>
    <p v-if="activeProjectArchived" class="text-xs text-muted-foreground">{{ t('tasks.projectArchived') }}</p>
    <template v-if="store.ready">
      <div v-if="view!=='calendar'" class="flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground"><span>{{ t('tasks.progress',{done:store.counts.done,total:store.total}) }}</span><button v-if="view==='list'" type="button" class="inline-flex items-center gap-1.5" :aria-pressed="showCompleted" @click="showCompleted=!showCompleted"><Check class="h-3 w-3" />{{ t('tasks.showCompleted') }}<span class="h-3.5 w-6 rounded-full p-0.5 transition-colors" :class="showCompleted?'bg-primary':'bg-muted'"><span class="block h-2.5 w-2.5 rounded-full transition-transform" :class="showCompleted?'translate-x-2.5 bg-primary-foreground':'bg-muted-foreground/60'" /></span></button></div>
      <div v-if="view==='list'" class="space-y-2"><TaskRow v-for="task in visibleTasks" :key="task.id" :task="task" :project-name="projectNameFor(task.project_id)" :busy="busy" @edit="editTask(task)" @toggle="setStatus(task,task.status==='done'?'todo':'done')" @schedule="schedule(task)" @remove="remove('tasks',task)" /><p v-if="!visibleTasks.length&&!store.loading" class="py-9 text-center text-xs text-muted-foreground">{{ t(store.total?'tasks.noVisible':'tasks.empty') }}</p></div>
      <div v-else-if="view==='board'" class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <section v-for="status in taskStatuses" :key="status" class="min-w-0 space-y-2 rounded-xl bg-muted/15 p-2 transition-colors" :class="dragOver===status&&'ring-1 ring-primary/40 bg-primary/5'" @dragover.prevent="dragOver=status" @dragleave.self="dragOver=''" @drop.prevent="drop($event,status)">
          <h3 class="flex items-center justify-between px-1 py-1.5 text-xs font-medium"><span>{{ t(`tasks.${status}`) }}</span><span class="text-[10px] font-normal tabular-nums text-muted-foreground">{{ store.counts[status] }}</span></h3>
          <div v-for="task in store.tasks.filter(row=>row.status===status)" :key="task.id" :draggable="!busy" @dragstart="dragStart($event,task)" @dragend="dragOver=''" class="cursor-grab active:cursor-grabbing"><TaskRow :task="task" :project-name="projectNameFor(task.project_id)" :busy="busy" compact @edit="editTask(task)" @toggle="setStatus(task,task.status==='done'?'todo':'done')" @schedule="schedule(task)" @remove="remove('tasks',task)" @status="value=>setStatus(task,value)" /></div>
          <p v-if="!store.tasks.some(row=>row.status===status)" class="rounded-xl border border-dashed border-border/50 px-3 py-5 text-center text-[11px] text-muted-foreground">{{ t('tasks.emptyColumn') }}</p>
        </section>
      </div>
      <template v-else>
        <p v-if="store.calendarError" role="alert" class="text-xs text-muted-foreground">{{ t(`tasks.${store.calendarError}`) }}</p>
        <WorkCalendar v-model:task-draft="draftTitle" :can-create-task="store.ready&&!activeProjectArchived" :blocks="store.blocks" :tasks="store.tasks" :deadlines="store.deadlines" :busy="busy" :loading="store.calendarLoading" :failed="!!store.calendarError" :paging="store.paging" :has-more="store.hasMore" :save-move="moveBlock" @range="rangeChanged" @create="createBlock" @edit="editBlock" @task="openTask" @schedule="schedule" @drop-task="dropSchedule" @toggle-task="toggleCalendarTask" @add-task="createTask" @more="store.load(true)">
          <template #toolbar>
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
              <div class="flex items-center gap-0.5 rounded-xl bg-muted/35 p-0.5" role="group" :aria-label="t('tasks.view')"><button v-for="item in views" :key="item.id" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :class="view===item.id?'bg-background text-foreground shadow-sm ring-1 ring-border/50':'text-muted-foreground hover:bg-background/40 hover:text-foreground'" :aria-pressed="view===item.id" :disabled="busy" @click="view=item.id"><component :is="item.icon" class="h-3.5 w-3.5" />{{ item.label }}</button></div>
              <div class="flex min-w-0 items-center gap-1.5"><CustomSelect :model-value="store.project" :options="projectOptions" class="w-36 min-w-0 sm:w-44" :disabled="busy||store.loading" size="sm" :aria-label="t('tasks.project')" @update:model-value="store.selectProject" /><button type="button" class="finance-icon" :aria-expanded="projectsOpen" :aria-label="t('tasks.manageProjects')" :title="t('tasks.manageProjects')" @click="projectsOpen=!projectsOpen"><FolderCog class="h-4 w-4" /></button><button type="button" class="finance-icon" :disabled="store.loading||store.calendarLoading||busy" :aria-label="t('tasks.refresh')" :title="t('tasks.refresh')" @click="refresh"><RefreshCw class="h-3.5 w-3.5" :class="(store.loading||store.calendarLoading)&&'animate-spin motion-reduce:animate-none'" /></button></div>
            </div>
          </template>
        </WorkCalendar>
      </template>
      <button v-if="view!=='calendar'&&store.hasMore" type="button" class="w-full rounded-xl border border-border/60 py-2 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-40" :disabled="store.loading||store.paging||busy" @click="store.load(true)">{{ t('tasks.more') }}</button>
    </template>
    <div v-else-if="store.loading" class="space-y-2" role="status" :aria-label="t('app.loading')"><div v-for="n in 2" :key="n" class="workspace-card h-16 animate-pulse bg-muted/20 motion-reduce:animate-none" /></div>
    <WorkEditor v-if="editor" :key="editor.id" :mode="editor.mode" :task="editor.task" :block="editor.block" :tasks="store.tasks" :projects="store.projects" :blocks="store.blocks" :saving="busy" :error="store.error" @save="saveEditor" @close="editor=null;store.error=''" @remove="removeEditorBlock" />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onActivated, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Archive, ArchiveRestore, CalendarDays, Check, Columns3, FolderCog, List, Loader2, Pencil, RefreshCw, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useModuleLoad } from '@/lib/workspaceScope'
import { useSearchReveal } from '@/lib/searchNavigation'
import { workspaceNavigationKey, workspaceActiveViewKey } from '@/lib/workspaceNavigation'
import { useWorkspacesStore } from '@/stores/workspaces'
import { moveToTrash, type TrashModule } from '@/lib/workspaceTrash'
import { browserTimezone, taskStatuses, workError, type TaskStatus, type WorkBlock, type WorkProject, type WorkTask } from '../lib/tasks'
import { useTasksStore } from '../stores/tasks'
import TaskRow from './TaskRow.vue'
import WorkEditor from './WorkEditor.vue'
const WorkCalendar=defineAsyncComponent(()=>import('./WorkCalendar.vue'))
const {t}=useI18n(),store=useTasksStore(),spaces=useWorkspacesStore(),scope=spaces.sessionKey,wid=spaces.activeId,owner=spaces.userId
const view=ref('calendar'),draftTitle=ref(''),showCompleted=ref(false)
const moduleActive=ref(true)
watch([view,moduleActive],([mode,active])=>{void store.setCalendarActive(active&&mode==='calendar')},{immediate:true})
onActivated(()=>{moduleActive.value=true;if(view.value==='calendar'&&store.calendarReady)void store.loadCalendar(undefined,undefined,true)})
onDeactivated(()=>{draftTitle.value='';moduleActive.value=false;view.value='calendar';showCompleted.value=false;editor.value=null;projectsOpen.value=false;editingProject.value=null;dragOver.value=''})
const navigation=inject(workspaceNavigationKey,ref(null))
watch(navigation,intent=>{if(intent?.module==='tasks'&&['list','board','calendar'].includes(intent.view))view.value=intent.view},{immediate:true})
const reportView=inject(workspaceActiveViewKey,undefined)
watch(view,value=>reportView?.('tasks',value),{immediate:true})
const views=computed(()=>[{id:'list',label:t('tasks.list'),icon:List},{id:'board',label:t('tasks.board'),icon:Columns3},{id:'calendar',label:t('tasks.calendar'),icon:CalendarDays}])
const moving=ref(false),busy=computed(()=>moving.value||store.saving),dragOver=ref(''),projectsOpen=ref(false),projectName=ref(''),editingProject=ref<WorkProject|null>(null)
const editor=ref<{id:string;mode:'task'|'block';task?:WorkTask;block?:Partial<WorkBlock> }|null>(null)
const visibleTasks=computed(()=>store.tasks.filter(row=>showCompleted.value||row.status!=='done'))
const projectOptions=computed(()=>[{value:'',label:t('tasks.allProjects')},...store.projects.map(row=>({value:row.id,label:row.name+(row.archived?` · ${t('tasks.archived')}`:'')}))])
const activeProjectArchived=computed(()=>!!store.projects.find(row=>row.id===store.project)?.archived)
const projectNameFor=(id:string|null)=>store.projects.find(row=>row.id===id)?.name
let createId=crypto.randomUUID(),projectCreateId=crypto.randomUUID()
async function createTask(){if(busy.value||!draftTitle.value.trim()||!store.ready||activeProjectArchived.value)return;const result=await store.mutate('task','create',createId,{title:draftTitle.value.trim(),project_id:store.project||null});if(result&&spaces.sessionKey===scope){draftTitle.value='';createId=crypto.randomUUID()}}
async function saveProject(){if(busy.value||!projectName.value.trim())return;const project=editingProject.value,result=await store.mutate('project',project?'update':'create',project?.id||projectCreateId,{name:projectName.value.trim()},project?.version);if(result&&spaces.sessionKey===scope){projectName.value='';editingProject.value=null;projectCreateId=crypto.randomUUID()}}
function editTask(task:WorkTask){if(busy.value)return;store.error='';editor.value={id:task.id,mode:'task',task}}
function editBlock(block:WorkBlock){if(busy.value)return;store.error='';editor.value={id:block.id,mode:'block',block}}
function createBlock(date=new Date(),end?:Date){if(busy.value)return;const start=new Date(date);if(!end){start.setSeconds(0,0);start.setMinutes(Math.ceil(start.getMinutes()/15)*15)}store.error='';editor.value={id:crypto.randomUUID(),mode:'block',block:{starts_at:start.toISOString(),ends_at:(end||new Date(start.getTime()+30*60000)).toISOString(),timezone:browserTimezone()}}}
function schedule(task:WorkTask,date?:Date){if(busy.value||task.status==='done')return;createBlock(date);if(editor.value?.block)Object.assign(editor.value.block,{task_id:task.id,task_title:task.title,ends_at:new Date(new Date(editor.value.block.starts_at!).getTime()+task.estimate_minutes*60000).toISOString()})}
async function saveEditor(payload:Record<string,unknown>){const current=editor.value;if(!current||busy.value)return;const existing=current.mode==='task'?current.task:current.block?.id?current.block:null;const result=await store.mutate(current.mode==='task'?'task':'block',existing?'update':'create',current.id,payload,existing?.version);if(result&&spaces.sessionKey===scope)editor.value=null}
async function setStatus(task:WorkTask,status:TaskStatus){if(busy.value||status===task.status)return;await store.mutate('task','update',task.id,{status},task.version)}
function dragStart(event:DragEvent,task:WorkTask){event.dataTransfer?.setData('application/x-work-task',task.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move'}
async function drop(event:DragEvent,status:TaskStatus){dragOver.value='';const id=event.dataTransfer?.getData('application/x-work-task'),task=store.tasks.find(row=>row.id===id);if(task)await setStatus(task,status)}
async function moveBlock(block:WorkBlock,start:string,end:string){return Boolean(await store.mutate('block','update',block.id,{starts_at:start,ends_at:end},block.version))}
async function dropSchedule(task:WorkTask,date:Date){if(busy.value||task.status==='done')return;await store.mutate('block','create',crypto.randomUUID(),{task_id:task.id,title:'',starts_at:date.toISOString(),ends_at:new Date(date.getTime()+task.estimate_minutes*60000).toISOString(),timezone:browserTimezone()})}
async function toggleCalendarTask(id:string){if(busy.value)return;const task=store.tasks.find(row=>row.id===id)||await store.findTask(id);if(task&&spaces.sessionKey===scope)await setStatus(task,task.status==='done'?'todo':'done')}
async function remove(module:TrashModule,row:WorkTask|WorkBlock){if(busy.value)return false;moving.value=true;store.error='';try{await moveToTrash(wid,module,row.id,row.version,owner);return spaces.sessionKey===scope}catch(error){if(spaces.sessionKey===scope)store.error=workError(error);return false}finally{moving.value=false}}
async function removeEditorBlock(){const block=editor.value?.block;if(block?.id&&await remove('calendar',block as WorkBlock))editor.value=null}
function rangeChanged(start:string,end:string){void store.loadCalendar(start,end)}
async function openTask(id:string){const task=store.tasks.find(row=>row.id===id)||await store.findTask(id);if(task&&spaces.sessionKey===scope)editTask(task)}
async function refresh(){await store.load();if(view.value==='calendar')await store.loadCalendar(undefined,undefined,true)}
useModuleLoad(()=>store.project&&!store.saving?store.selectProject(''):store.load())
useSearchReveal('tasks',async(hit,isCurrent)=>{const task=await store.findTask(hit.record_id);if(!task||!isCurrent())throw Error('Unavailable');view.value='list';showCompleted.value=task.status==='done'||showCompleted.value;if(store.project&&store.project!==task.project_id)await store.selectProject('');if(!isCurrent())return;if(!store.tasks.some(row=>row.id===task.id))store.tasks.unshift(task)})
</script>
