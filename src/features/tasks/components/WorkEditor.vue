<template>
  <Teleport to="body">
    <dialog ref="dialog" class="work-dialog" :closedby="saving?'none':'closerequest'" :aria-label="t(mode==='task'?'tasks.editTask':'tasks.editBlock')" @cancel.prevent="close" @keydown.esc.stop.prevent="close">
      <form class="work-editor" @submit.prevent="submit">
        <header class="flex shrink-0 items-center justify-between gap-3"><span class="text-xs font-medium text-muted-foreground">{{ t(mode==='task'?'tasks.editTask':'tasks.editBlock') }}</span><button type="button" class="finance-icon" :disabled="saving" :aria-label="t('common.close')" @click="close"><X class="h-4 w-4" /></button></header>
        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5 pb-2">
          <input ref="titleInput" v-model="title" class="finance-input" :class="mode==='block'&&'!h-12 !text-sm !font-medium'" maxlength="180" :required="mode==='task'||!taskId" :placeholder="mode==='block'&&linkedTaskTitle?linkedTaskTitle:t(mode==='task'?'tasks.placeholder':'tasks.blockTitle')" :aria-label="t(mode==='task'?'tasks.title':'tasks.blockTitle')" :disabled="saving" />
          <template v-if="mode==='task'">
            <textarea v-model="description" rows="5" maxlength="20000" class="finance-input !h-auto resize-y py-3 leading-relaxed" :placeholder="t('tasks.description')" :aria-label="t('tasks.description')" :disabled="saving" />
            <div class="grid grid-cols-2 gap-3">
              <label class="space-y-1.5"><span class="finance-label">{{ t('tasks.project') }}</span><CustomSelect v-model="projectId" :options="projectOptions" :disabled="saving" size="sm" :aria-label="t('tasks.project')" /></label>
              <label class="space-y-1.5"><span class="finance-label">{{ t('tasks.status') }}</span><CustomSelect v-model="status" :options="statusOptions" :disabled="saving" size="sm" :aria-label="t('tasks.status')" /></label>
              <label class="space-y-1.5"><span class="finance-label">{{ t('tasks.deadline') }}</span><input v-model="dueOn" type="date" min="1900-01-01" max="2100-12-31" class="finance-input !h-9 !px-2.5 !text-xs" :disabled="saving" /></label>
              <label class="space-y-1.5"><span class="finance-label">{{ t('tasks.priority') }}</span><CustomSelect v-model="priority" :options="priorityOptions" :disabled="saving" size="sm" :aria-label="t('tasks.priority')" /></label>
              <label class="space-y-1.5"><span class="finance-label">{{ t('tasks.estimate') }}</span><input v-model.number="estimate" type="number" min="5" max="1440" step="1" required class="finance-input !h-9 !text-xs" :disabled="saving" /></label>
            </div>
            <div class="space-y-2 border-t border-border/50 pt-3">
              <span class="finance-label">{{ t('tasks.subtasks') }}</span>
              <div v-for="(item,index) in checklist" :key="item.id" class="flex items-center gap-2"><input v-model="item.done" type="checkbox" class="h-4 w-4 accent-[hsl(var(--primary))]" :disabled="saving" :aria-label="t('tasks.completeSubtask',{title:item.title})" /><input v-model="item.title" maxlength="180" required class="finance-input !h-8 flex-1 !px-2.5 !text-xs" :disabled="saving" :aria-label="t('tasks.subtask')" /><button type="button" class="finance-icon !h-7 !w-7" :disabled="saving" :aria-label="t('common.delete')" @click="checklist.splice(index,1)"><X class="h-3.5 w-3.5" /></button></div>
              <button v-if="checklist.length<50" type="button" class="inline-flex h-7 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40" :disabled="saving" @click="addSubtask"><Plus class="h-3 w-3" />{{ t('tasks.addSubtask') }}</button>
            </div>
          </template>
          <template v-else>
            <div class="block-timing space-y-3">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label class="block space-y-2"><span class="finance-label">{{ t('tasks.starts') }}</span><input v-model="starts" type="datetime-local" :min="minimumTime" :max="maximumTime" class="finance-input !h-11 !px-3 !text-xs" :disabled="saving" required /></label>
                <label class="block space-y-2"><span class="finance-label">{{ t('tasks.ends') }}</span><input v-model="ends" type="datetime-local" :min="minimumEnd" :max="maximumEnd" class="finance-input !h-11 !px-3 !text-xs" :disabled="saving" required /></label>
              </div>
              <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p class="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 class="h-3.5 w-3.5" /><span>{{ t('tasks.duration') }}</span><span class="ml-0.5 font-medium tabular-nums text-foreground">{{ validTimes?durationText:'—' }}</span></p>
                <div class="flex items-center gap-1" role="group" :aria-label="t('tasks.duration')"><button v-for="minutes in quickDurations" :key="minutes" type="button" class="duration-preset" :class="durationMinutes===minutes&&'duration-preset-active'" :disabled="saving||!canSetDuration(minutes)" :aria-label="t('tasks.quickDuration',{minutes})" :aria-pressed="durationMinutes===minutes" @click="setDuration(minutes)">{{ minutes }} <span class="font-normal opacity-70">{{ t('tasks.min') }}</span></button></div>
              </div>
            </div>
            <p class="text-[10px] text-muted-foreground">{{ t('tasks.timezone',{zone:browserTimezone()}) }}</p>
            <details class="block-task-link rounded-xl border border-border/60 px-3 py-2.5" :open="!!taskId">
              <summary class="flex cursor-pointer list-none items-center gap-2 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><Link2 class="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span class="min-w-0 flex-1 truncate" :class="!taskId&&'text-muted-foreground'">{{ taskId?linkedTaskTitle:t('tasks.linkTaskOptional') }}</span><ChevronDown class="link-chevron h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform" /></summary>
              <div class="mt-3 space-y-2"><CustomSelect v-model="taskId" :options="taskOptions" :disabled="saving" size="sm" :aria-label="t('tasks.linkedTask')" /><p class="text-[10px] leading-5 text-muted-foreground">{{ t('tasks.blockHint') }}</p></div>
            </details>
            <p v-if="starts&&ends&&!validTimes" role="alert" class="text-xs text-destructive dark:text-rose-300">{{ t('tasks.invalidTime') }}</p>
            <p v-else-if="conflicts" class="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">{{ t('tasks.overlap',{count:conflicts}) }}</p>
          </template>
        </div>
        <p v-if="error" role="alert" class="shrink-0 text-xs text-destructive dark:text-rose-300">{{ t(`tasks.${error}`) }}</p>
        <footer class="flex shrink-0 justify-end gap-2 border-t border-border/50 pt-3"><button v-if="mode==='block'&&block?.id" type="button" class="finance-icon mr-auto hover:!text-destructive" :disabled="saving" :aria-label="t('tasks.deleteBlock')" @click="$emit('remove')"><Trash2 class="h-4 w-4" /></button><button type="button" class="h-9 rounded-xl px-3 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-40" :disabled="saving" @click="close">{{ t('common.cancel') }}</button><button type="submit" class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-40" :disabled="saving||!valid"><Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />{{ t('common.save') }}</button></footer>
      </form>
    </dialog>
  </Teleport>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, Clock3, Link2, Loader2, Plus, Trash2, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { browserTimezone, localInput, overlaps, taskStatuses, validBlock, type WorkBlock, type WorkProject, type WorkTask } from '../lib/tasks'
const props=defineProps<{mode:'task'|'block';task?:WorkTask;block?:Partial<WorkBlock>;tasks:WorkTask[];projects:WorkProject[];blocks:WorkBlock[];saving:boolean;error:string}>()
const emit=defineEmits<{close:[];save:[payload:Record<string,unknown>];remove:[]}>(),{t}=useI18n()
const title=ref(props.mode==='task'?props.task?.title||'':props.block?.title||'')
const description=ref(props.task?.description||''),projectId=ref(props.task?.project_id||''),status=ref(props.task?.status||'todo'),priority=ref(props.task?.priority||'none')
const dueOn=ref(props.task?.due_on||''),estimate=ref(props.task?.estimate_minutes||30),checklist=ref(props.task?.checklist.map(row=>({...row}))||[])
function addSubtask(){checklist.value.push({id:crypto.randomUUID(),title:'',done:false})}
const taskId=ref(props.block?.task_id||'')
const starts=ref(localInput(props.block?.starts_at||new Date())),ends=ref(localInput(props.block?.ends_at||new Date(Date.now()+30*60000)))
const minimumTime='1900-01-01T00:00',maximumTime='2100-12-31T23:59',quickDurations=[15,30,60,90]
const durationMinutes=computed(()=>Math.round((new Date(ends.value).getTime()-new Date(starts.value).getTime())/60000))
const validTimes=computed(()=>starts.value>=minimumTime&&ends.value<=maximumTime&&validBlock(starts.value,ends.value))
const minimumEnd=computed(()=>Number.isFinite(new Date(starts.value).getTime())?localInput(new Date(new Date(starts.value).getTime()+60000)):minimumTime)
const maximumEnd=computed(()=>Number.isFinite(new Date(starts.value).getTime())?[maximumTime,localInput(new Date(new Date(starts.value).getTime()+7*86400000))].sort()[0]:maximumTime)
const durationText=computed(()=>{const hours=Math.floor(durationMinutes.value/60),minutes=durationMinutes.value%60;return [hours?`${hours} ${t('tasks.hourShort')}`:'',minutes?`${minutes} ${t('tasks.min')}`:''].filter(Boolean).join(' ')})
const linkedTaskTitle=computed(()=>taskId.value?(props.tasks.find(row=>row.id===taskId.value)?.title||(taskId.value===props.block?.task_id?props.block?.task_title:'')||t('tasks.linkedTask')):'')
function canSetDuration(minutes:number){if(!Number.isFinite(new Date(starts.value).getTime())||starts.value<minimumTime||starts.value>maximumTime)return false;return localInput(new Date(new Date(starts.value).getTime()+minutes*60000))<=maximumTime}
function setDuration(minutes:number){if(props.saving||!canSetDuration(minutes))return;ends.value=localInput(new Date(new Date(starts.value).getTime()+minutes*60000))}
watch(starts,(value,previous)=>{if(props.mode!=='block'||props.saving||!validBlock(previous,ends.value)||!Number.isFinite(new Date(value).getTime()))return;const duration=new Date(ends.value).getTime()-new Date(previous).getTime();ends.value=localInput(new Date(new Date(value).getTime()+duration))})
const statusOptions=computed(()=>taskStatuses.map(value=>({value,label:t(`tasks.${value}`)})))
const priorityOptions=computed(()=>['none','low','medium','high'].map(value=>({value,label:t(`tasks.${value}`)})))
const projectOptions=computed(()=>[{value:'',label:t('tasks.noProject')},...props.projects.filter(row=>!row.archived||row.id===projectId.value).map(row=>({value:row.id,label:row.name,disabled:row.archived&&row.id!==props.task?.project_id}))])
const taskOptions=computed(()=>{
  const options=props.tasks.filter(row=>row.status!=='done'||row.id===taskId.value).map(row=>({value:row.id,label:row.title}))
  if(taskId.value&&!options.some(row=>row.value===taskId.value))options.push({value:taskId.value,label:props.block?.task_title||t('tasks.linkedTask')})
  return [{value:'',label:t('tasks.independentEvent')},...options]
})
const conflicts=computed(()=>props.blocks.filter(row=>row.id!==props.block?.id&&overlaps(row,{starts_at:starts.value,ends_at:ends.value})).length)
const valid=computed(()=>props.mode==='task'?Boolean(title.value.trim()&&Number.isInteger(estimate.value)&&estimate.value>=5&&estimate.value<=1440&&checklist.value.every(row=>row.title.trim())):Boolean((title.value.trim()||taskId.value)&&validTimes.value))
function submit(){if(!valid.value||props.saving)return;emit('save',props.mode==='task'?{title:title.value.trim(),description:description.value,project_id:projectId.value||null,status:status.value,priority:priority.value,due_on:dueOn.value||null,estimate_minutes:estimate.value,checklist:checklist.value.map(row=>({...row,title:row.title.trim()}))}:{title:title.value.trim(),task_id:taskId.value||null,starts_at:new Date(starts.value).toISOString(),ends_at:new Date(ends.value).toISOString(),timezone:browserTimezone()})}
const dialog=ref<HTMLDialogElement>(),titleInput=ref<HTMLInputElement>()
let disposed=false,scroll:{body:string;root:string;gutter:string}|null=null,previousFocus:HTMLElement|null=null
function release(){if(scroll){document.body.style.overflow=scroll.body;document.documentElement.style.overflow=scroll.root;document.documentElement.style.scrollbarGutter=scroll.gutter;scroll=null}}
function close(){if(!props.saving)emit('close')}
onMounted(async()=>{await nextTick();if(disposed||!dialog.value)return;previousFocus=document.activeElement as HTMLElement;scroll={body:document.body.style.overflow,root:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter};document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';document.documentElement.style.scrollbarGutter='stable';try{dialog.value.showModal();titleInput.value?.focus({preventScroll:true})}catch{release();emit('close')}})
onDeactivated(()=>{dialog.value?.close();release();emit('close')})
onBeforeUnmount(()=>{disposed=true;dialog.value?.close();release();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})})
</script>
<style scoped>
.work-dialog{width:calc(100vw - 32px);max-width:620px;max-height:calc(100dvh - 40px);margin:auto;padding:0;border:1px solid hsl(var(--border)/.6);border-radius:18px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 80px rgb(0 0 0/.2);overflow:hidden}
.work-dialog::backdrop{background:hsl(var(--background)/.8);backdrop-filter:blur(6px)}
.work-editor{display:flex;flex-direction:column;gap:16px;max-height:calc(100dvh - 42px);padding:20px}
.duration-preset{height:28px;padding:0 8px;border:1px solid hsl(var(--border)/.6);border-radius:8px;font-size:10px;color:hsl(var(--muted-foreground));transition:background-color .15s,border-color .15s,color .15s}
.duration-preset:hover{background:hsl(var(--muted)/.4);color:hsl(var(--foreground))}
.duration-preset-active{border-color:hsl(var(--primary)/.3);background:hsl(var(--primary)/.08);color:hsl(var(--primary));font-weight:500}
.duration-preset:focus-visible{outline:2px solid hsl(var(--primary)/.35);outline-offset:2px}
.duration-preset:disabled{opacity:.4}
.block-task-link summary::-webkit-details-marker{display:none}
.block-task-link:not([open]) .link-chevron{transform:rotate(-90deg)}
@media(max-width:639px){.work-dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}.work-editor{padding:16px;max-height:calc(100dvh - 18px)}}
@media(prefers-reduced-motion:no-preference){.work-dialog[open]{animation:work-enter 180ms ease-out}@keyframes work-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}}
</style>
