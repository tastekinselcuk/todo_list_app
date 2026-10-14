<template>
  <article class="workspace-card group/task flex w-full items-center gap-3 px-3.5 py-3 transition-colors" :class="done?'bg-muted/20':'bg-card/30 hover:bg-background/40'">
    <button type="button" :disabled="!canWrite || busy" class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-default" :class="done?'border-primary bg-primary':'border-muted-foreground/40 hover:border-primary/50'" :aria-label="t(done?'periodicTasks.undo':'periodicTasks.complete')" :aria-pressed="done" @click="$emit('toggle',task.id)"><Check v-if="done" class="h-3 w-3 text-primary-foreground" /></button>
    <div class="min-w-0 flex-1">
      <button type="button" :disabled="!canWrite || busy" class="w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-default" @click="$emit('toggle',task.id)"><p class="break-words text-sm font-medium leading-snug" :class="done?'text-muted-foreground line-through':'text-foreground'">{{ task.title }}</p></button>
      <p v-if="task.notes" class="mt-1 line-clamp-2 text-xs text-muted-foreground">{{ task.notes }}</p>
      <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span class="inline-flex items-center gap-1"><Repeat class="h-3 w-3" />{{ recurrenceLabel }}</span>
        <span v-if="task.reminder_time" class="inline-flex items-center gap-1 tabular-nums"><Clock3 class="h-3 w-3" />{{ task.reminder_time }}</span>
        <Mail v-if="task.notify_email" class="h-3 w-3" :aria-label="t('periodicTasks.notifyEmail')" :title="t('periodicTasks.notifyEmail')" />
      </div>
    </div>
    <div v-if="canWrite" class="flex shrink-0 items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover/task:opacity-100 sm:group-focus-within/task:opacity-100">
      <button type="button" :disabled="busy" class="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50" :title="t('periodicTasks.edit')" :aria-label="t('periodicTasks.edit')" @click="$emit('edit',task)"><Pencil class="h-3.5 w-3.5" /></button>
      <button type="button" :disabled="busy" class="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50" :title="t('common.delete')" :aria-label="t('common.delete')" @click="$emit('delete',task.id)"><Trash2 class="h-3.5 w-3.5" /></button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, Trash2, Pencil, Repeat, Clock3, Mail } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useModuleAccess } from '@/lib/workspaceScope'
import { type PeriodicTask, isCompletedForPeriod } from '../stores/periodicTasks'
const {canWrite}=useModuleAccess('periodic'),{t}=useI18n()
const props=defineProps<{task:PeriodicTask;busy?:boolean}>()
defineEmits<{toggle:[id:string];delete:[id:string];edit:[task:PeriodicTask]}>()
const done=computed(()=>isCompletedForPeriod(props.task))
const recurrenceLabel=computed(()=>{
 const task=props.task
 if(task.frequency==='daily')return t('periodicTasks.daily')
 if(task.frequency==='weekly' && task.days_of_week?.length){
  const days=['sun','mon','tue','wed','thu','fri','sat'].map(day=>t('days.'+day))
  return task.days_of_week.map(day=>days[day]).join(', ')
 }
 if(task.frequency==='monthly')return t('periodicTasks.monthlyOn',{day:String(task.day_of_month || 1)})
 if(task.frequency==='yearly')return t('periodicTasks.yearlyOn',{day:String(task.day_of_month || 1),month:String(task.month_of_year || 1)})
 if(task.frequency==='custom')return t('periodicTasks.everyNDaysLabel',{n:String(task.interval_days || 1)})
 return t('periodicTasks.'+task.frequency)
})
</script>
