<template>
  <div
    class="group/task flex items-start gap-3 py-3 px-4 rounded-2xl border transition-all duration-300 w-full"
    :class="[
      done
        ? 'bg-muted/25 border-border/30 opacity-75'
        : 'bg-card/50 border-border/40 hover:border-primary/25 hover:shadow-sm'
    ]"
  >
    <button
      type="button"
      class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all"
      :class="done ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary/50'"
      :aria-label="done ? 'Undo' : 'Complete'"
      @click="$emit('toggle', task.id)"
    >
      <Check v-if="done" class="w-3 h-3 text-primary-foreground" />
    </button>

    <div class="flex-1 min-w-0 space-y-1">
      <div class="flex items-start justify-between gap-2">
        <button
          type="button"
          class="text-left min-w-0"
          @click="$emit('toggle', task.id)"
        >
          <p
            class="text-sm font-semibold leading-snug break-words"
            :class="done ? 'line-through text-muted-foreground' : 'text-foreground'"
          >
            {{ task.title }}
          </p>
        </button>

        <div class="flex items-center gap-0.5 opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            :title="$t('periodicTasks.edit')"
            @click="$emit('edit', task)"
          >
            <Pencil class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            :title="$t('common.delete')"
            @click="$emit('delete', task.id)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p v-if="task.notes" class="text-xs text-muted-foreground/80 line-clamp-2">
        {{ task.notes }}
      </p>

      <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
          :class="categoryClass"
        >
          <component :is="categoryIcon" class="w-2.5 h-2.5" />
          {{ $t(`periodicTasks.categories.${task.category}`) }}
        </span>
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted/60 text-muted-foreground">
          <Repeat class="w-2.5 h-2.5" />
          {{ recurrenceLabel }}
        </span>
        <span
          v-if="task.reminder_time"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted/60 text-muted-foreground"
        >
          <Bell class="w-2.5 h-2.5" />
          {{ task.reminder_time }}
        </span>
        <span
          v-if="task.notify_email"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted/60 text-muted-foreground"
        >
          <Mail class="w-2.5 h-2.5" />
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Check, Trash2, Pencil, Repeat, Bell, Mail,
  Briefcase, HeartPulse, Leaf, Target, CircleDot,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  type PeriodicTask,
  isCompletedForPeriod,
} from '../stores/periodicTasks'

const props = defineProps<{
  task: PeriodicTask
}>()

defineEmits<{
  toggle: [id: string]
  delete: [id: string]
  edit: [task: PeriodicTask]
}>()

const { t } = useI18n()

const done = computed(() => isCompletedForPeriod(props.task))

const categoryIcon = computed(() => {
  const map = {
    work: Briefcase,
    health: HeartPulse,
    habit: Leaf,
    goal: Target,
    other: CircleDot,
  }
  return map[props.task.category] || CircleDot
})

const categoryClass = computed(() => {
  const map: Record<string, string> = {
    work: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    health: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    habit: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    goal: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    other: 'bg-muted text-muted-foreground',
  }
  return map[props.task.category] || map.other
})

const recurrenceLabel = computed(() => {
  const task = props.task
  if (task.frequency === 'daily') return t('periodicTasks.daily')
  if (task.frequency === 'weekly' && task.days_of_week?.length) {
    const daysMap = [
      t('days.sun'), t('days.mon'), t('days.tue'), t('days.wed'),
      t('days.thu'), t('days.fri'), t('days.sat'),
    ]
    return `${t('periodicTasks.weeklyOn')} ${task.days_of_week.map((d) => daysMap[d]).join(', ')}`
  }
  if (task.frequency === 'monthly') {
    return t('periodicTasks.monthlyOn', { day: String(task.day_of_month || 1) })
  }
  if (task.frequency === 'yearly') {
    return t('periodicTasks.yearlyOn', {
      day: String(task.day_of_month || 1),
      month: String(task.month_of_year || 1),
    })
  }
  if (task.frequency === 'custom') {
    return t('periodicTasks.everyNDaysLabel', { n: String(task.interval_days || 1) })
  }
  return t(`periodicTasks.${task.frequency}`)
})
</script>
