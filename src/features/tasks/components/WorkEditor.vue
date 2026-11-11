<template>
  <Teleport to="body">
    <dialog ref="dialog" class="work-dialog" :closedby="saving||linking?'none':'closerequest'" :aria-label="t(isTask?'tasks.editTask':'tasks.editBlock')" @dblclick="event=>{if(isDialogBackdropDoubleClick(event))close()}" @cancel.prevent="close" @keydown.esc.stop.prevent="close">
      <form class="work-editor" @submit.prevent="submit">
        <header class="flex shrink-0 items-center justify-between gap-3"><span class="text-xs font-medium text-muted-foreground">{{ t(isTask?'tasks.editTask':'tasks.editBlock') }}</span><button type="button" class="finance-icon" :disabled="saving||linking" :aria-label="t('common.close')" @click="close"><X :size="16" /></button></header>
        <div class="work-editor-scroll">
          <div v-if="canChooseTask" class="mb-4 flex items-center gap-2"><Link2 :size="13" class="text-muted-foreground" /><CustomSelect :model-value="linked?.id||''" :options="taskOptions" :disabled="saving||linking" size="sm" class="min-w-0 flex-1" :aria-label="t('tasks.linkedTask')" @update:model-value="chooseTask" /><Loader2 v-if="linking" :size="13" class="animate-spin" /></div>
          <div class="flex flex-wrap items-center gap-2">
            <input ref="titleInput" v-model="title" required maxlength="180" class="finance-input !h-11 min-w-40 flex-1" :aria-label="t(isTask?'tasks.title':'tasks.blockTitle')" :placeholder="t(isTask?'tasks.placeholder':'tasks.blockTitle')" :disabled="saving||linking" />
            <ProjectSelect v-if="isTask" v-model="projectId" :projects="projects" :disabled="saving||linking" :save-project="saveProject" :delete-project="removeProject" class="w-40" />
          </div>
          <template v-if="isTask">
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <CustomSelect v-model="status" :options="statusOptions" :disabled="saving" size="sm" class="w-36" :aria-label="t('tasks.status')" />
              <CustomSelect v-model="priority" :options="priorityOptions" :disabled="saving" size="sm" class="w-32" :aria-label="t('tasks.priority')" />
              <label class="flex items-center gap-2 rounded-xl border border-border/50 px-2.5 py-1.5 text-[11px] text-muted-foreground"><Flag :size="12" />{{ t('tasks.deadline') }}<input v-model="dueOn" type="date" min="1900-01-01" max="2100-12-31" class="min-w-0 bg-transparent text-foreground outline-none" :aria-label="t('tasks.deadline')" :disabled="saving" /></label>
            </div>
            <div class="mt-3">
              <button type="button" class="editor-text-action" :disabled="saving||linking" :aria-expanded="descriptionOpen" :aria-controls="descriptionId" @click="toggleDescription"><AlignLeft :size="13" />{{ t(descriptionOpen?'tasks.hideDescription':description?'tasks.showDescription':'tasks.addDescription') }}<ChevronDown :size="11" class="transition-transform motion-reduce:transition-none" :class="descriptionOpen&&'rotate-180'" /></button>
              <Transition name="editor-description"><div v-if="descriptionOpen" :id="descriptionId" class="description-region"><div class="min-h-0 overflow-hidden"><textarea ref="descriptionInput" v-model="description" rows="3" maxlength="20000" class="finance-input mt-2 !h-auto resize-y py-3 !text-xs leading-6" :placeholder="t('tasks.description')" :aria-label="t('tasks.description')" :disabled="saving" /></div></div></Transition>
            </div>
            <section class="mt-5 border-t border-border/50 pt-4">
              <div class="mb-2 flex items-center justify-between"><span class="editor-section-label"><ListTodo :size="14" />{{ t('tasks.subtasks') }}</span><span v-if="checklist.length" class="text-[10px] tabular-nums text-muted-foreground">{{ checklist.filter(item=>item.done).length }}/{{ checklist.length }}</span></div>
              <div v-for="(item,index) in checklist" :key="item.id" class="group/step flex items-center gap-2 rounded-xl px-1 py-1">
                <input v-model="item.done" type="checkbox" class="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" :disabled="saving" :aria-label="t('tasks.completeSubtask',{title:item.title})" />
                <input v-model="item.title" maxlength="180" required class="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-2 text-xs outline-none focus:bg-muted/20" :class="item.done&&'text-muted-foreground line-through'" :disabled="saving" :aria-label="t('tasks.subtask')" />
                <button type="button" class="finance-icon !h-7 !w-7" :disabled="saving" :aria-label="t('common.delete')" @click="removeSubtask(index)"><X :size="12" /></button>
              </div>
              <div v-if="checklist.length<50" class="mt-2 flex items-center gap-2"><input v-model="subtaskDraft" maxlength="180" class="finance-input !h-9 flex-1 !px-3 !text-xs" :placeholder="t('tasks.addSubtask')" :aria-label="t('tasks.addSubtask')" :disabled="saving" @keydown.enter.stop.prevent="addSubtask" /><button type="button" class="workspace-add-button !h-9 !min-w-0 !px-3 !text-[11px]" :disabled="saving||!subtaskDraft.trim()" @click="addSubtask">{{ t('common.add') }}</button></div>
            </section>
          </template>
          <section class="mt-5 border-t border-border/50 pt-4">
            <div class="mb-3 flex items-center justify-between gap-3"><span class="editor-section-label"><CalendarClock :size="14" />{{ t('tasks.workTimes') }}<span v-if="times.length" class="text-[10px] opacity-60">{{ times.length }}</span></span><button v-if="isTask" type="button" class="editor-text-action" :disabled="saving||linking||times.length>=100" @click="addTime"><Plus :size="13" />{{ t('tasks.addTime') }}</button></div>
            <div v-if="!times.length" class="rounded-xl border border-dashed border-border/60 px-4 py-5 text-center text-xs text-muted-foreground">{{ t('tasks.noTimes') }}</div>
            <div v-for="row in times" :key="row.id" class="time-card" :class="expandedTime===row.id&&'is-open'">
              <div class="flex items-center gap-2"><button type="button" class="min-w-0 flex-1 px-3 py-2.5 text-left" :aria-expanded="expandedTime===row.id" @click="expandedTime=expandedTime===row.id?'':row.id"><span class="flex items-center gap-2 text-xs"><Clock3 :size="12" class="shrink-0 text-muted-foreground" /><span class="min-w-0 flex-1 truncate">{{ validTime(row)?blockSummary({starts_at:row.starts,ends_at:row.ends},locale):t('tasks.chooseTime') }}</span><ChevronDown :size="12" class="shrink-0 opacity-50" /></span><span v-if="row.subtask_ids.length" class="mt-1 block truncate pl-5 text-[10px] text-muted-foreground">{{ targetName(row) }}</span></button><button v-if="isTask||times.length>1" type="button" class="finance-icon mr-1 !h-7 !w-7 hover:!text-destructive" :disabled="saving" :aria-label="t('tasks.removeTime')" @click="removeTime(row)"><X :size="13" /></button></div>
              <div v-if="expandedTime===row.id" class="space-y-3 border-t border-border/40 px-3 py-3">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2"><label class="space-y-1.5"><span class="finance-label">{{ t('tasks.starts') }}</span><input v-model="row.starts" type="datetime-local" min="1900-01-01T00:00" max="2100-12-31T23:59" class="finance-input !h-10 !px-3 !text-xs" :disabled="saving" required /></label><label class="space-y-1.5"><span class="finance-label">{{ t('tasks.ends') }}</span><input v-model="row.ends" type="datetime-local" :min="row.starts" max="2100-12-31T23:59" class="finance-input !h-10 !px-3 !text-xs" :disabled="saving" required /></label></div>
                <p v-if="!validTime(row)" role="alert" class="text-[11px] text-destructive">{{ t('tasks.invalidTime') }}</p>
                <p v-else class="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 :size="12" />{{ minutes(row) }} {{ t('tasks.min') }}<span v-if="conflicts(row)" class="ml-auto">{{ t('tasks.overlap',{count:conflicts(row)}) }}</span></p>
                <div v-if="isTask&&(availableSubtasks.length||row.subtask_ids.length)" class="border-t border-border/40 pt-2.5"><p class="mb-2 text-[10px] text-muted-foreground">{{ t('tasks.timeTarget') }}</p><div class="flex flex-wrap gap-1.5"><button type="button" class="time-target" :class="!row.subtask_ids.length&&'is-selected'" :disabled="saving" @click="row.subtask_ids=[]">{{ t('tasks.mainTask') }}</button><label v-for="item in availableSubtasks" :key="item.id" class="time-target" :class="row.subtask_ids.includes(item.id)&&'is-selected'"><input type="checkbox" class="h-3 w-3 accent-[hsl(var(--primary))]" :checked="row.subtask_ids.includes(item.id)" :disabled="saving" @change="toggleTarget(row,item.id)" /><span class="max-w-48 truncate">{{ item.title }}</span></label></div></div>
              </div>
            </div>
          </section>
        </div>
        <p v-if="error||loadError" role="alert" class="shrink-0 text-xs text-destructive">{{ t('tasks.'+(error||'failed')) }}</p>
        <footer class="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 pt-3"><button v-if="!isTask&&block?.id" type="button" class="finance-icon mr-auto hover:!text-destructive" :disabled="saving" :aria-label="t('tasks.deleteBlock')" @click="$emit('remove')"><Trash2 :size="15" /></button><button type="button" class="h-9 rounded-xl px-3 text-xs text-muted-foreground hover:bg-muted/30" :disabled="saving||linking" @click="close">{{ t('common.cancel') }}</button><button type="submit" class="workspace-add-button !h-9 !px-4" :disabled="saving||linking||!valid"><Loader2 v-if="saving" :size="12" class="animate-spin" />{{ t('common.save') }}</button></footer>
      </form>
    </dialog>
  </Teleport>
</template>
<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,onDeactivated,onMounted,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlignLeft,CalendarClock,ChevronDown,Clock3,Flag,Link2,ListTodo,Loader2,Plus,Trash2,X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import ProjectSelect from './ProjectSelect.vue'
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { blockSummary,browserTimezone,localInput,overlaps,taskStatuses,validBlock,type WorkBlock,type WorkDetailsDraft,type WorkProject,type WorkTask,type WorkTimeChange } from '../lib/tasks'
const props=defineProps<{mode:'task'|'block';draftId?:string;initialTitle?:string;initialProject?:string;task?:WorkTask;block?:Partial<WorkBlock>;tasks:WorkTask[];projects:WorkProject[];blocks:WorkBlock[];saving:boolean;error:string;loadTask:(id:string)=>Promise<WorkTask|null>;saveProject:(name:string,id:string,version?:number,archived?:boolean)=>Promise<WorkProject|null>;deleteProject:(project:WorkProject)=>Promise<boolean>}>()
const emit=defineEmits<{close:[];save:[draft:WorkDetailsDraft];remove:[]}>(),{t,locale}=useI18n()
type TimeDraft={id:string;version?:number;title:string;starts:string;ends:string;timezone:string;subtask_ids:string[]}
const linked=ref(props.task),isTask=computed(()=>props.mode==='task'||!!linked.value),canChooseTask=props.mode==='block'&&!props.task&&!props.block?.id
const newTaskId=props.draftId||crypto.randomUUID(),title=ref(props.task?.title||props.initialTitle||props.block?.title||''),description=ref(props.task?.description||''),descriptionOpen=ref(!!props.task?.description)
const descriptionInput=ref<HTMLTextAreaElement>(),descriptionId=`${newTaskId}-description`
const projectId=ref(props.task?.project_id||props.initialProject||''),status=ref(props.task?.status||'todo'),priority=ref(props.task?.priority||'none'),dueOn=ref(props.task?.due_on||''),checklist=ref<WorkTask['checklist']>((props.task?.checklist||[]).map(item=>({...item}))),subtaskDraft=ref('')
const linking=ref(false),loadError=ref(false),times=ref<TimeDraft[]>([]),removed=ref<{id:string;version:number}[]>([]),expandedTime=ref('')
const availableSubtasks=computed(()=>checklist.value.filter(item=>!item.done&&item.title.trim()))
let originals=new Map<string,WorkBlock>(),disposed=false,linkRevision=0
async function toggleDescription(){if(props.saving||linking.value)return;descriptionOpen.value=!descriptionOpen.value;if(descriptionOpen.value){await nextTick();if(!disposed)descriptionInput.value?.focus({preventScroll:true})}}
function draftTime(block:Partial<WorkBlock>):TimeDraft{return{id:block.id||crypto.randomUUID(),version:block.version,title:block.title||'',starts:localInput(block.starts_at||new Date()),ends:localInput(block.ends_at||new Date(Date.now()+30*60000)),timezone:block.timezone||browserTimezone(),subtask_ids:[...(block.subtask_ids||[])]}}
function initialize(task?:WorkTask){
 const rows=task?(task.scheduled_blocks||props.blocks.filter(row=>row.task_id===task.id)):props.block?.id?[props.block as WorkBlock]:[]
 originals=new Map(rows.map(row=>[row.id,{...row,subtask_ids:[...(row.subtask_ids||[])]}]))
 times.value=rows.map(draftTime)
 if(props.block&&!props.block.id){const row=draftTime(props.block);times.value.push(row);expandedTime.value=row.id}
 else expandedTime.value=props.block?.id||''
}
initialize(props.task)
function addSubtask(){const value=subtaskDraft.value.trim();if(props.saving||!value||value.length>180||checklist.value.length>=50)return;checklist.value.push({id:crypto.randomUUID(),title:value,done:false});subtaskDraft.value=''}
function removeSubtask(index:number){const id=checklist.value[index].id;checklist.value.splice(index,1);times.value.forEach(row=>{row.subtask_ids=row.subtask_ids.filter(value=>value!==id)})}
watch(checklist,items=>{if(status.value==='done'&&items.some(item=>!item.done))status.value='todo'},{deep:true,flush:'sync'})
const statusOptions=computed(()=>taskStatuses.map(value=>({value,label:t('tasks.'+value)}))),priorityOptions=computed(()=>['none','low','medium','high'].map(value=>({value,label:t('tasks.'+value)})))
const taskOptions=computed(()=>[{value:'',label:t('tasks.independentEvent')},...props.tasks.filter(row=>row.status!=='done'||row.id===linked.value?.id).map(row=>({value:row.id,label:row.title}))])
async function removeProject(project:WorkProject){
 const previous=linked.value
 const result=await props.deleteProject(project)
 if(result&&previous?.project_id===project.id){
  const latest=await props.loadTask(previous.id)
  // This deletion changes only the project and increments the task version once.
  // Unrelated concurrent edits must still be rejected by the normal version check.
  if(!disposed&&latest?.version===previous.version+1&&latest.project_id===null)linked.value={...previous,project_id:null,version:latest.version}
 }
 return result
}
async function chooseTask(id:string){
 if(!canChooseTask||props.saving)return
 const revision=++linkRevision;linking.value=true;loadError.value=false
 try{const task=id?await props.loadTask(id):null;if(disposed||revision!==linkRevision)return;if(id&&!task){loadError.value=true;return}linked.value=task||undefined;title.value=task?.title||props.initialTitle||props.block?.title||'';description.value=task?.description||'';descriptionOpen.value=!!description.value;projectId.value=task?.project_id||'';status.value=task?.status||'todo';priority.value=task?.priority||'none';dueOn.value=task?.due_on||'';checklist.value=(task?.checklist||[]).map(item=>({...item}));removed.value=[];initialize(task||undefined)}finally{if(!disposed&&revision===linkRevision)linking.value=false}
}
function addTime(){if(props.saving)return;const now=new Date();now.setSeconds(0,0);now.setMinutes(Math.ceil(now.getMinutes()/15)*15);const row=draftTime({starts_at:now.toISOString(),ends_at:new Date(now.getTime()+30*60000).toISOString()});times.value.push(row);expandedTime.value=row.id}
function removeTime(row:TimeDraft){if(props.saving)return;if(row.version!==undefined)removed.value.push({id:row.id,version:row.version});times.value=times.value.filter(item=>item.id!==row.id)}
function toggleTarget(row:TimeDraft,id:string){if(props.saving||!availableSubtasks.value.some(item=>item.id===id))return;row.subtask_ids=row.subtask_ids.includes(id)?row.subtask_ids.filter(value=>value!==id):[...row.subtask_ids,id]}
function targetName(row:TimeDraft){return checklist.value.filter(item=>row.subtask_ids.includes(item.id)).map(item=>item.title).join(' · ')}
function validTime(row:TimeDraft){return row.starts>='1900-01-01T00:00'&&row.ends<='2100-12-31T23:59'&&validBlock(row.starts,row.ends)}
function minutes(row:TimeDraft){return Math.round((new Date(row.ends).getTime()-new Date(row.starts).getTime())/60000)}
function conflicts(row:TimeDraft){return [...props.blocks.filter(item=>!times.value.some(time=>time.id===item.id)&&!removed.value.some(time=>time.id===item.id)),...times.value.filter(item=>item.id!==row.id).map(item=>({starts_at:item.starts,ends_at:item.ends}))].filter(item=>validBlock(item.starts_at,item.ends_at)&&overlaps(item,{starts_at:row.starts,ends_at:row.ends})).length}
const valid=computed(()=>!!title.value.trim()&&title.value.trim().length<=180&&checklist.value.every(item=>item.title.trim())&&times.value.every(validTime)&&(isTask.value||times.value.length>0))
function serialize(row:TimeDraft):WorkTimeChange{const original=originals.get(row.id);return{id:row.id,version:row.version,title:isTask.value?row.title:title.value.trim(),starts_at:original&&localInput(original.starts_at)===row.starts?original.starts_at:new Date(row.starts).toISOString(),ends_at:original&&localInput(original.ends_at)===row.ends?original.ends_at:new Date(row.ends).toISOString(),timezone:row.timezone,subtask_ids:isTask.value?row.subtask_ids.filter(id=>checklist.value.some(item=>item.id===id)):[]}}
function submit(){if(props.saving||linking.value||!valid.value)return;const changes=times.value.map(serialize).filter(row=>{const original=originals.get(row.id);return !original||row.title!==original.title||new Date(row.starts_at).getTime()!==new Date(original.starts_at).getTime()||new Date(row.ends_at).getTime()!==new Date(original.ends_at).getTime()||row.timezone!==original.timezone||JSON.stringify(row.subtask_ids)!==JSON.stringify(original.subtask_ids||[])})
 emit('save',{task:isTask.value?{title:title.value.trim(),description:description.value,project_id:projectId.value||null,status:status.value,priority:priority.value,due_on:dueOn.value||null,checklist:checklist.value.map(item=>({...item,title:item.title.trim()}))}:null,taskId:isTask.value?(linked.value?.id||newTaskId):null,taskVersion:linked.value?.version,times:changes,removed:removed.value.map(item=>({...item}))})}
const dialog=ref<HTMLDialogElement>(),titleInput=ref<HTMLInputElement>()
let previous:HTMLElement|null=null,scroll:{body:string;root:string;gutter:string}|null=null
function release(){if(scroll){document.body.style.overflow=scroll.body;document.documentElement.style.overflow=scroll.root;document.documentElement.style.scrollbarGutter=scroll.gutter;scroll=null}}
function close(){if(!props.saving&&!linking.value)emit('close')}
onMounted(async()=>{await nextTick();if(disposed||!dialog.value)return;previous=document.activeElement as HTMLElement;scroll={body:document.body.style.overflow,root:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter};document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';document.documentElement.style.scrollbarGutter='stable';try{dialog.value.showModal();titleInput.value?.focus({preventScroll:true})}catch{release();emit('close')}})
onDeactivated(()=>{dialog.value?.close();release();emit('close')})
onBeforeUnmount(()=>{disposed=true;linkRevision++;dialog.value?.close();release();if(previous?.isConnected)previous.focus({preventScroll:true})})
</script>
<style scoped>
.work-dialog{width:min(820px,calc(100vw - 32px));max-height:calc(100dvh - 48px);margin:auto;padding:0;border:1px solid hsl(var(--border)/.65);border-radius:22px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 80px rgb(0 0 0/.18);overflow:hidden}.work-dialog::backdrop{background:hsl(var(--background)/.72);backdrop-filter:blur(6px)}.work-editor{display:flex;flex-direction:column;gap:16px;max-height:calc(100dvh - 50px);padding:22px}.work-editor-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:1px 3px 6px;scrollbar-width:thin;scrollbar-color:hsl(var(--border)) transparent}.editor-section-label{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:500;color:hsl(var(--muted-foreground))}.editor-text-action{display:inline-flex;align-items:center;gap:5px;border-radius:7px;padding:4px 3px;font-size:11px;color:hsl(var(--muted-foreground))}.editor-text-action:hover{color:hsl(var(--foreground));background:hsl(var(--muted)/.2)}.time-card{margin-top:8px;border:1px solid hsl(var(--border)/.65);border-radius:12px;overflow:hidden}.time-card.is-open{border-color:hsl(var(--primary)/.22);background:hsl(var(--primary)/.015)}.time-target{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid hsl(var(--border)/.6);border-radius:8px;font-size:10px}.time-target.is-selected{border-color:hsl(var(--primary)/.25);background:hsl(var(--primary)/.06);color:hsl(var(--primary))}.editor-text-action:focus-visible,.time-target:focus-visible{outline:2px solid hsl(var(--primary)/.25);outline-offset:2px}
.description-region{display:grid;grid-template-rows:1fr;transition:grid-template-rows .18s ease,opacity .18s ease}.editor-description-enter-from,.editor-description-leave-to{grid-template-rows:0fr;opacity:0}
@media(prefers-reduced-motion:reduce){.description-region{transition:none}}
@media(max-width:639px){.work-dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 20px)}.work-editor{padding:16px;max-height:calc(100dvh - 22px)}}
@media(prefers-reduced-motion:no-preference){.work-dialog[open]{animation:work-enter .18s ease-out}@keyframes work-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}}
</style>
