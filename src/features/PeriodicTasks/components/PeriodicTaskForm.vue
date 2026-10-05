<template>
  <form class="space-y-4" @submit.prevent="submit">
    <!-- Quick templates -->
    <div v-if="!editId" class="flex flex-wrap gap-2">
      <button
        v-for="tpl in templates"
        :key="tpl.category"
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
        :class="form.category === tpl.category
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background/60 border-border/50 text-muted-foreground hover:text-foreground hover:border-border'"
        @click="applyTemplate(tpl)"
      >
        <component :is="tpl.icon" class="w-3.5 h-3.5" />
        {{ tpl.label }}
      </button>
    </div>

    <div class="space-y-3">
      <input
        v-model="form.title"
        type="text"
        required
        maxlength="200"
        :placeholder="titlePlaceholder"
        class="w-full h-11 px-4 rounded-xl border border-border/50 bg-background/70 text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/30 focus:border-primary/40 outline-none transition-all"
      />

      <textarea
        v-model="form.notes"
        rows="2"
        maxlength="500"
        :placeholder="$t('periodicTasks.notesPlaceholder')"
        class="w-full px-4 py-2.5 rounded-xl border border-border/50 bg-background/70 text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/30 focus:border-primary/40 outline-none resize-none transition-all"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {{ $t('periodicTasks.frequency') }}
        </span>
        <select
          v-model="form.frequency"
          class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option value="daily">{{ $t('periodicTasks.daily') }}</option>
          <option value="weekly">{{ $t('periodicTasks.weekly') }}</option>
          <option value="monthly">{{ $t('periodicTasks.monthly') }}</option>
          <option value="yearly">{{ $t('periodicTasks.yearly') }}</option>
          <option value="custom">{{ $t('periodicTasks.custom') }}</option>
        </select>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {{ $t('periodicTasks.reminderTime') }}
        </span>
        <input
          v-model="form.reminderTime"
          type="time"
          class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/30"
        />
      </label>
    </div>

    <!-- Weekly days -->
    <div v-if="form.frequency === 'weekly'" class="flex flex-wrap gap-1.5">
      <button
        v-for="day in weekDays"
        :key="day.value"
        type="button"
        class="w-9 h-9 rounded-full text-[11px] font-medium border transition-all"
        :class="form.daysOfWeek.includes(day.value)
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background/50 text-muted-foreground border-border/50 hover:bg-muted'"
        @click="toggleDay(day.value)"
      >
        {{ day.label }}
      </button>
    </div>

    <!-- Monthly -->
    <label v-if="form.frequency === 'monthly'" class="flex flex-col gap-1.5 max-w-[160px]">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {{ $t('periodicTasks.dayOfMonth') }}
      </span>
      <input
        v-model.number="form.dayOfMonth"
        type="number"
        min="1"
        max="31"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/30"
      />
    </label>

    <!-- Yearly -->
    <div v-if="form.frequency === 'yearly'" class="grid grid-cols-2 gap-3 max-w-sm">
      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {{ $t('periodicTasks.month') }}
        </span>
        <select
          v-model.number="form.monthOfYear"
          class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none"
        >
          <option v-for="m in 12" :key="m" :value="m">{{ monthLabel(m) }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {{ $t('periodicTasks.dayOfMonth') }}
        </span>
        <input
          v-model.number="form.dayOfMonth"
          type="number"
          min="1"
          max="31"
          class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none"
        />
      </label>
    </div>

    <!-- Custom interval -->
    <label v-if="form.frequency === 'custom'" class="flex flex-col gap-1.5 max-w-[200px]">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {{ $t('periodicTasks.everyNDays') }}
      </span>
      <input
        v-model.number="form.intervalDays"
        type="number"
        min="1"
        max="365"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/30"
      />
    </label>

    <!-- Notifications -->
    <div class="flex flex-wrap gap-4 pt-1">
      <label class="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
        <input v-model="form.notifyBrowser" type="checkbox" class="rounded border-border" />
        {{ $t('periodicTasks.notifyBrowser') }}
      </label>
      <label class="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
        <input v-model="form.notifyEmail" type="checkbox" class="rounded border-border" />
        {{ $t('periodicTasks.notifyEmail') }}
      </label>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <button
        type="submit"
        class="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
        :disabled="!canSubmit || loading"
      >
        {{ editId ? $t('periodicTasks.save') : $t('periodicTasks.add') }}
      </button>
      <button
        v-if="editId"
        type="button"
        class="h-10 px-4 rounded-xl border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        @click="$emit('cancel')"
      >
        {{ $t('common.cancel') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Briefcase, HeartPulse, Leaf, Target, CircleDot } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { PeriodicTask, PeriodicTaskInput, TaskCategory, TaskFrequency } from '../stores/periodicTasks'

const props = defineProps<{
  editTask?: PeriodicTask | null
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [input: PeriodicTaskInput]
  cancel: []
}>()

const { t, locale } = useI18n()

const form = reactive({
  title: '',
  notes: '',
  category: 'other' as TaskCategory,
  frequency: 'daily' as TaskFrequency,
  daysOfWeek: [] as number[],
  dayOfMonth: new Date().getDate(),
  monthOfYear: new Date().getMonth() + 1,
  intervalDays: 3,
  reminderTime: '09:00',
  notifyBrowser: true,
  notifyEmail: false,
})

const editId = computed(() => props.editTask?.id || null)

const templates = computed(() => [
  { category: 'work' as TaskCategory, label: t('periodicTasks.categories.work'), icon: Briefcase, title: t('periodicTasks.templates.work'), frequency: 'weekly' as TaskFrequency, days: [1, 2, 3, 4, 5], time: '09:00' },
  { category: 'health' as TaskCategory, label: t('periodicTasks.categories.health'), icon: HeartPulse, title: t('periodicTasks.templates.health'), frequency: 'daily' as TaskFrequency, days: [], time: '08:00' },
  { category: 'habit' as TaskCategory, label: t('periodicTasks.categories.habit'), icon: Leaf, title: t('periodicTasks.templates.habit'), frequency: 'daily' as TaskFrequency, days: [], time: '07:30' },
  { category: 'goal' as TaskCategory, label: t('periodicTasks.categories.goal'), icon: Target, title: t('periodicTasks.templates.goal'), frequency: 'weekly' as TaskFrequency, days: [1], time: '18:00' },
  { category: 'other' as TaskCategory, label: t('periodicTasks.categories.other'), icon: CircleDot, title: '', frequency: 'daily' as TaskFrequency, days: [], time: '09:00' },
])

const weekDays = computed(() => [
  { label: t('days.mon'), value: 1 },
  { label: t('days.tue'), value: 2 },
  { label: t('days.wed'), value: 3 },
  { label: t('days.thu'), value: 4 },
  { label: t('days.fri'), value: 5 },
  { label: t('days.sat'), value: 6 },
  { label: t('days.sun'), value: 0 },
])

const titlePlaceholder = computed(() => {
  const map: Record<TaskCategory, string> = {
    work: t('periodicTasks.placeholders.work'),
    health: t('periodicTasks.placeholders.health'),
    habit: t('periodicTasks.placeholders.habit'),
    goal: t('periodicTasks.placeholders.goal'),
    other: t('periodicTasks.placeholder'),
  }
  return map[form.category]
})

const canSubmit = computed(() => {
  if (!form.title.trim()) return false
  if (form.frequency === 'weekly' && form.daysOfWeek.length === 0) return false
  if (form.frequency === 'custom' && (!form.intervalDays || form.intervalDays < 1)) return false
  return true
})

function applyTemplate(tpl: (typeof templates.value)[number]) {
  form.category = tpl.category
  form.frequency = tpl.frequency
  form.daysOfWeek = [...tpl.days]
  form.reminderTime = tpl.time
  if (!form.title.trim() && tpl.title) form.title = tpl.title
}

function toggleDay(day: number) {
  const idx = form.daysOfWeek.indexOf(day)
  if (idx === -1) form.daysOfWeek.push(day)
  else form.daysOfWeek.splice(idx, 1)
}

function monthLabel(m: number) {
  const date = new Date(2024, m - 1, 1)
  return date.toLocaleString(locale.value === 'tr' ? 'tr-TR' : 'en-US', { month: 'long' })
}

function resetForm() {
  form.title = ''
  form.notes = ''
  form.category = 'other'
  form.frequency = 'daily'
  form.daysOfWeek = []
  form.dayOfMonth = new Date().getDate()
  form.monthOfYear = new Date().getMonth() + 1
  form.intervalDays = 3
  form.reminderTime = '09:00'
  form.notifyBrowser = true
  form.notifyEmail = false
}

function hydrateFromTask(task: PeriodicTask) {
  form.title = task.title
  form.notes = task.notes || ''
  form.category = task.category || 'other'
  form.frequency = task.frequency
  form.daysOfWeek = [...(task.days_of_week || [])]
  form.dayOfMonth = task.day_of_month || new Date().getDate()
  form.monthOfYear = task.month_of_year || new Date().getMonth() + 1
  form.intervalDays = task.interval_days || 3
  form.reminderTime = task.reminder_time || '09:00'
  form.notifyBrowser = task.notify_browser ?? true
  form.notifyEmail = task.notify_email ?? false
}

watch(
  () => props.editTask,
  (task) => {
    if (task) hydrateFromTask(task)
    else resetForm()
  },
  { immediate: true }
)

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    title: form.title.trim(),
    notes: form.notes.trim(),
    category: form.category,
    frequency: form.frequency,
    daysOfWeek: [...form.daysOfWeek],
    dayOfMonth: form.dayOfMonth,
    monthOfYear: form.monthOfYear,
    intervalDays: form.intervalDays,
    reminderTime: form.reminderTime || null,
    notifyBrowser: form.notifyBrowser,
    notifyEmail: form.notifyEmail,
  })
  if (!editId.value) resetForm()
}
</script>
