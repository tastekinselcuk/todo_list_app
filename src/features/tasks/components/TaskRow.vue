<template>
  <article :data-search-record="task.id" class="workspace-card work-task min-w-0 bg-card/30 px-3 py-3 transition-colors hover:bg-background/40" :data-work-task="task.id">
    <div class="flex min-w-0 items-start gap-2.5">
    <CustomSelect v-if="!compact" :model-value="task.status" :options="statusOptions" :disabled="busy" size="sm" variant="ghost" popover class="task-status-control mt-0.5 w-[34px] shrink-0" :title="t('tasks.'+task.status)" :aria-label="t('tasks.changeStatus',{title:task.title,status:t('tasks.'+task.status)})" :button-style="{height:'24px',padding:'0 2px',gap:'2px',borderRadius:'7px'}" @update:model-value="value=>$emit('status',value as TaskStatus)">
      <template #value><component :is="statusIcon(task.status)" class="h-3.5 w-3.5 shrink-0" :class="task.status==='todo'?'text-muted-foreground/70':'text-primary'" :stroke-width="1.7" /></template>
      <template #option="{option}"><component :is="statusIcon(option.value)" class="h-3.5 w-3.5 shrink-0" :class="option.value==='todo'?'text-muted-foreground':'text-primary'" :stroke-width="1.7" /><span>{{ option.label }}</span></template>
    </CustomSelect>
    <button v-else type="button" class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40" :class="task.status==='done'?'border-primary bg-primary text-primary-foreground':'border-border hover:border-primary/60'" :disabled="busy" :aria-label="t(task.status==='done'?'tasks.reopen':'tasks.complete',{title:task.title})" :aria-pressed="task.status==='done'" @click="$emit('toggle')"><Check v-if="task.status==='done'" class="h-3.5 w-3.5" /><span v-else-if="task.status==='doing'" class="h-2 w-2 rounded-sm bg-primary/60" /></button>
    <div class="min-w-0 flex-1">
      <button type="button" class="w-full text-left focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :disabled="busy" @click="$emit('edit')"><p class="break-words text-sm leading-6" :class="task.status==='done'&&'text-muted-foreground line-through'">{{ task.title }}</p></button>
      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-muted-foreground">
        <button ref="checklistToggle" type="button" class="task-steps-toggle" :class="expanded&&'is-open'" :aria-expanded="expanded" :aria-controls="checklistId" :aria-label="t('tasks.toggleSubtasks',{title:task.title})" @click="toggleExpanded"><Loader2 v-if="pending" :size="12" class="animate-spin motion-reduce:animate-none" /><ListTodo v-else :size="12" /><span v-if="task.checklist.length" class="tabular-nums">{{ completed }}/{{ task.checklist.length }}</span><span v-else>{{ t('tasks.addSubtask') }}</span><ChevronDown :size="10" class="transition-transform motion-reduce:transition-none" :class="expanded&&'rotate-180'" /></button>
        <span v-if="projectName">{{ projectName }}</span><time v-if="task.due_on" :datetime="task.due_on" :class="overdue&&'font-medium text-destructive dark:text-rose-300'">{{ shortDate(task.due_on) }}</time><span v-if="task.priority!=='none'" class="inline-flex items-center gap-1"><Flag class="h-2.5 w-2.5" :class="task.priority==='high'&&'text-primary'" />{{ t(`tasks.${task.priority}`) }}</span>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-0.5" :class="compact&&'ml-auto'"><button type="button" class="finance-icon !h-7 !w-7" :disabled="busy||task.status==='done'" :aria-label="t('tasks.scheduleTask',{title:task.title})" @click="$emit('schedule')"><CalendarPlus class="h-3.5 w-3.5" /></button><button type="button" class="finance-icon !h-7 !w-7 hover:!text-destructive" :disabled="busy" :aria-label="t('tasks.deleteTask',{title:task.title})" @click="$emit('remove')"><Trash2 class="h-3.5 w-3.5" /></button></div>
    </div>
    <div v-if="task.scheduled_blocks?.length" class="mt-2 max-h-32 space-y-1 overflow-y-auto overscroll-contain border-t border-border/40 pt-2" :class="compact?'ml-[30px]':'ml-11'" :aria-label="t('tasks.workTimes')" :draggable="false" @dragstart.stop.prevent>
      <button v-for="block in task.scheduled_blocks" :key="block.id" type="button" class="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[10px] text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground" :disabled="busy" @click="$emit('open-time',block.id)"><Clock3 :size="11" class="shrink-0" /><span class="shrink-0 tabular-nums">{{ blockSummary(block,locale) }}</span><span v-if="block.subtask_titles?.length||(block.title&&block.title!==task.title)" class="min-w-0 flex-1 truncate">{{ block.subtask_titles?.join(' \u00b7 ')||block.title }}</span></button>
    </div>
    <Transition name="task-steps">
      <div v-if="expanded" :id="checklistId" class="task-steps" :draggable="false" @dragstart.stop.prevent @keydown.esc.stop="collapse(true)">
        <div class="min-h-0 overflow-hidden">
          <div class="mt-3 space-y-1 border-t border-border/50 pt-2.5" :class="compact?'ml-[30px]':'ml-11'" role="group" :aria-label="t('tasks.subtasks')" :aria-busy="pending">
            <div v-for="item in task.checklist" :key="item.id" class="flex min-w-0 items-start gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-muted/20">
              <button type="button" role="checkbox" class="task-step-check" :class="item.done&&'is-done'" :aria-checked="item.done" :aria-label="t(item.done?'tasks.reopenSubtask':'tasks.completeSubtask',{title:item.title})" :disabled="locked" @click="toggleSubtask(item.id)"><Check v-if="item.done" :size="10" :stroke-width="2.5" /></button>
              <span class="min-w-0 flex-1 break-words text-xs leading-5" :class="item.done?'text-muted-foreground line-through':'text-foreground'">{{ item.title }}</span>
            </div>
            <form v-if="task.checklist.length<50" class="flex items-center gap-1.5 pt-1" @submit.prevent="addSubtask">
              <input ref="subtaskInput" v-model="draft" class="task-step-input" maxlength="180" :placeholder="t('tasks.addSubtask')" :aria-label="t('tasks.subtask')" :disabled="locked" />
              <button type="submit" class="workspace-add-button !h-8 !min-w-0 !rounded-lg !px-2.5 !text-[11px]" :disabled="locked||!draft.trim()">{{ t('common.add') }}</button>
            </form>
            <p v-else class="px-1 py-1 text-[10px] text-muted-foreground">{{ t('tasks.subtaskLimit',{count:50}) }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </article>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarPlus, Check, CheckCircle2, ChevronDown, Circle, CircleDot, Clock3, Flag, ListTodo, Loader2, Trash2 } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { blockSummary,localDay,taskStatuses, type TaskStatus, type WorkTask } from '../lib/tasks'
const props=defineProps<{task:WorkTask;projectName?:string;busy?:boolean;compact?:boolean;saveChecklist:(task:WorkTask,checklist:WorkTask['checklist'])=>Promise<boolean>}>()
defineEmits<{edit:[];toggle:[];schedule:[];remove:[];'open-time':[id:string];status:[value:TaskStatus]}>()
const {t,locale}=useI18n()
const statusOptions=computed(()=>taskStatuses.map(value=>({value,label:t('tasks.'+value)})))
const statusIcons={todo:Circle,doing:CircleDot,done:CheckCircle2}
const statusIcon=(value:string)=>statusIcons[value as TaskStatus]||Circle
const expanded=ref(false),draft=ref(''),pending=ref(false),subtaskInput=ref<HTMLInputElement>(),checklistToggle=ref<HTMLButtonElement>()
const checklistId=`task-checklist-${props.task.id}`
const completed=computed(()=>props.task.checklist.filter(item=>item.done).length)
const locked=computed(()=>!!props.busy||pending.value)
let disposed=false
onBeforeUnmount(()=>{disposed=true})
function collapse(restoreFocus=false){expanded.value=false;draft.value='';if(restoreFocus)checklistToggle.value?.focus({preventScroll:true})}
async function toggleExpanded(){
  if(expanded.value){collapse();return}
  expanded.value=true
  if(!props.task.checklist.length){await nextTick();if(!disposed&&expanded.value)subtaskInput.value?.focus({preventScroll:true})}
}
async function saveChecklist(checklist:WorkTask['checklist']){
  if(locked.value)return false
  pending.value=true
  try{return await props.saveChecklist(props.task,checklist)}finally{pending.value=false}
}
async function toggleSubtask(id:string){
  if(!props.task.checklist.some(item=>item.id===id))return
  await saveChecklist(props.task.checklist.map(item=>({...item,done:item.id===id?!item.done:item.done})))
}
async function addSubtask(){
  const title=draft.value.trim()
  if(locked.value||!title||title.length>180||props.task.checklist.length>=50)return
  const saved=await saveChecklist([...props.task.checklist.map(item=>({...item})),{id:crypto.randomUUID(),title,done:false}])
  if(saved&&!disposed){draft.value='';await nextTick();if(expanded.value)(subtaskInput.value||checklistToggle.value)?.focus({preventScroll:true})}
}
const overdue=computed(()=>props.task.status!=='done'&&!!props.task.due_on&&props.task.due_on<localDay())
const shortDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString(locale.value,{month:'short',day:'numeric'})
</script>
<style scoped>
.task-steps-toggle{display:inline-flex;align-items:center;gap:5px;min-height:24px;padding:2px 6px;border:1px solid hsl(var(--border)/.6);border-radius:7px;background:hsl(var(--muted)/.12);transition:background-color .15s,border-color .15s,color .15s}
.task-steps-toggle:hover,.task-steps-toggle.is-open{border-color:hsl(var(--primary)/.22);background:hsl(var(--primary)/.055);color:hsl(var(--foreground))}
.task-steps{display:grid;grid-template-rows:1fr;transition:grid-template-rows .2s ease,opacity .18s ease}
.task-steps-enter-from,.task-steps-leave-to{grid-template-rows:0fr;opacity:0}
.task-step-check{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:16px;height:16px;margin-top:2px;border:1px solid hsl(var(--border));border-radius:5px;transition:background-color .15s,border-color .15s}
.task-step-check:hover{border-color:hsl(var(--primary)/.55)}
.task-step-check.is-done{border-color:hsl(var(--primary)/.3);background:hsl(var(--primary)/.1);color:hsl(var(--primary))}
.task-step-input{min-width:0;width:100%;height:32px;flex:1;border:1px solid hsl(var(--border)/.7);border-radius:8px;padding:0 9px;background:hsl(var(--background)/.5);font-size:12px;transition:border-color .15s,box-shadow .15s}
.task-step-input::placeholder{color:hsl(var(--muted-foreground)/.75)}
.task-step-input:focus{outline:none;border-color:hsl(var(--primary)/.3);box-shadow:0 0 0 2px hsl(var(--primary)/.06)}
.task-steps-toggle:focus-visible,.task-step-check:focus-visible{outline:2px solid hsl(var(--primary)/.3);outline-offset:2px}
.task-step-check:disabled,.task-step-input:disabled{opacity:.45;cursor:default}
@media(prefers-reduced-motion:reduce){.task-steps{transition:none}}
</style>
