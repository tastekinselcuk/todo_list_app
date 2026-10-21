<template>
  <article :data-search-record="task.id" class="workspace-card work-task flex min-w-0 items-start gap-2.5 bg-card/30 px-3 py-3 transition-colors hover:bg-background/40" :class="compact&&'flex-wrap'" :data-work-task="task.id">
    <button type="button" class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40" :class="task.status==='done'?'border-primary bg-primary text-primary-foreground':'border-border hover:border-primary/60'" :disabled="busy" :aria-label="t(task.status==='done'?'tasks.reopen':'tasks.complete',{title:task.title})" :aria-pressed="task.status==='done'" @click="$emit('toggle')"><Check v-if="task.status==='done'" class="h-3.5 w-3.5" /><span v-else-if="task.status==='doing'" class="h-2 w-2 rounded-sm bg-primary/60" /></button>
    <button type="button" class="min-w-0 flex-1 text-left focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :disabled="busy" @click="$emit('edit')"><p class="break-words text-sm leading-6" :class="task.status==='done'&&'text-muted-foreground line-through'">{{ task.title }}</p><div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4 text-muted-foreground"><span v-if="projectName">{{ projectName }}</span><time v-if="task.due_on" :datetime="task.due_on" :class="overdue&&'font-medium text-destructive dark:text-rose-300'">{{ shortDate(task.due_on) }}</time><span v-if="task.priority!=='none'" class="inline-flex items-center gap-1"><Flag class="h-2.5 w-2.5" :class="task.priority==='high'&&'text-primary'" />{{ t(`tasks.${task.priority}`) }}</span><span v-if="task.checklist.length">{{ task.checklist.filter(item=>item.done).length }}/{{ task.checklist.length }}</span><span v-if="!compact&&task.status==='doing'">{{ t('tasks.doing') }}</span></div></button>
    <div class="flex shrink-0 items-center gap-0.5" :class="compact&&'ml-auto'"><button type="button" class="finance-icon !h-7 !w-7" :disabled="busy||task.status==='done'" :aria-label="t('tasks.scheduleTask',{title:task.title})" @click="$emit('schedule')"><CalendarPlus class="h-3.5 w-3.5" /></button><button type="button" class="finance-icon !h-7 !w-7 hover:!text-destructive" :disabled="busy" :aria-label="t('tasks.deleteTask',{title:task.title})" @click="$emit('remove')"><Trash2 class="h-3.5 w-3.5" /></button></div>
    <div v-if="compact" class="w-full pl-7"><CustomSelect :model-value="task.status" :options="statusOptions" :disabled="busy" size="sm" :aria-label="t('tasks.status')" @update:model-value="value=>$emit('status',value as TaskStatus)" /></div>
  </article>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarPlus, Check, Flag, Trash2 } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { localDay, taskStatuses, type TaskStatus, type WorkTask } from '../lib/tasks'
const props=defineProps<{task:WorkTask;projectName?:string;busy?:boolean;compact?:boolean}>()
defineEmits<{edit:[];toggle:[];schedule:[];remove:[];status:[value:TaskStatus]}>()
const {t,locale}=useI18n()
const overdue=computed(()=>props.task.status!=='done'&&!!props.task.due_on&&props.task.due_on<localDay())
const shortDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString(locale.value,{month:'short',day:'numeric'})
const statusOptions=computed(()=>taskStatuses.map(value=>({value,label:t(`tasks.${value}`)})))
</script>
