<template>
  <div
    @click="$emit('toggle', task.id)"
    class="flex items-center justify-between py-2.5 px-4 rounded-xl border transition-all duration-300 cursor-pointer group/task w-full"
    :class="[
      isCompletedToday 
        ? 'bg-muted/30 border-border/30 opacity-80' 
        : 'bg-card/40 dark:bg-muted/5 border-border/40 hover:border-primary/20 hover:shadow-md hover:bg-card/70'
    ]"
  >
    <div class="flex items-center gap-3 flex-1 pr-3 min-w-0">
      
      <div 
        class="flex-shrink-0 w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all duration-200"
        :class="isCompletedToday ? 'bg-primary border-primary' : 'border-muted-foreground/40 group-hover/task:border-primary/50'"
      >
        <svg v-if="isCompletedToday" class="w-3 h-3 text-primary-foreground animate-in zoom-in duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      
      <div class="flex flex-col min-w-0 flex-1">
        <span 
          :class="[
            'font-semibold text-sm leading-snug transition-all duration-300 break-words w-full', 
            isCompletedToday ? 'line-through text-muted-foreground/80' : 'text-foreground'
          ]"
        >
          {{ task.title }}
        </span>
        <span class="text-[10px] font-medium text-muted-foreground/60 mt-0.5 flex items-center gap-1">
          <Repeat class="w-3 h-3" />
          {{ getRecurrenceLabel(task) }}
        </span>
      </div>
    </div>

    <button
      @click.stop="$emit('delete', task.id)"
      class="opacity-0 group-hover/task:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all flex-shrink-0 ml-2"
      title="Rutini Sil"
    >
      <Trash2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Trash2, Repeat } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { usePeriodicTasksStore, type PeriodicTask } from '../stores/periodicTasks';

const { t } = useI18n()
const taskStore = usePeriodicTasksStore()

// Props tipini doğrudan Store'daki ana tip ile eşitledik
const props = defineProps<{
  task: PeriodicTask
}>()

defineEmits<{
  toggle: [id: string]
  delete: [id: string]
}>()

// Görev bugüne ait tarihte mi tamamlanmış kontrolü
const isCompletedToday = computed(() => {
  return props.task.completed_date === taskStore.getTodayDateString()
})

const getRecurrenceLabel = (task: PeriodicTask) => {
  if (task.frequency === 'daily') return t('periodicTasks.daily') || 'Daily'
  
  if (task.frequency === 'weekly' && task.days_of_week) {
    const daysMap = [
      t('days.sun') || 'Sun',
      t('days.mon') || 'Mon', 
      t('days.tue') || 'Tue', 
      t('days.wed') || 'Wed', 
      t('days.thu') || 'Thu', 
      t('days.fri') || 'Fri', 
      t('days.sat') || 'Sat'
    ]
    const selectedDays = task.days_of_week.map((d: number) => daysMap[d]).join(', ')
    return `${t('periodicTasks.weeklyOn') || 'Weekly on'} ${selectedDays}`
  }
  return ''
}
</script>