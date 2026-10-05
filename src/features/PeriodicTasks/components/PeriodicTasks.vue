<template>
  <div style="--workspace-default-max:48rem" class="workspace-content mx-auto space-y-5 animate-in fade-in duration-500">
    <!-- Header + today's progress -->
    <header class="space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold tracking-tight text-foreground">
            {{ $t('periodicTasks.title') }}
          </h2>
          <p class="text-sm text-muted-foreground mt-0.5">
            {{ $t('periodicTasks.subtitle') }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium transition-all"
          :class="showForm
            ? 'bg-muted border-border text-foreground'
            : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'"
          @click="showForm = !showForm; editingTask = null"
        >
          <Plus v-if="!showForm" class="w-3.5 h-3.5" />
          <X v-else class="w-3.5 h-3.5" />
          {{ showForm ? $t('common.cancel') : $t('periodicTasks.add') }}
        </button>
      </div>

      <div class="rounded-2xl border border-border/40 bg-card/40 p-4 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-medium text-muted-foreground">
            {{ $t('periodicTasks.todayProgress') }}
          </span>
          <span class="font-semibold text-foreground">
            {{ taskStore.todaysCompletedCount }}/{{ taskStore.todaysTasks.length }}
            · {{ taskStore.progressPercent }}%
          </span>
        </div>
        <div class="h-2 rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            :style="{ width: `${taskStore.progressPercent}%` }"
          />
        </div>
      </div>
    </header>

    <!-- Browser notification banner -->
    <div
      v-if="browserPermission !== 'granted' && browserPermission !== 'unsupported'"
      class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3"
    >
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-foreground">{{ $t('periodicTasks.enableNotificationsTitle') }}</p>
        <p class="text-xs text-muted-foreground mt-0.5">{{ $t('periodicTasks.enableNotificationsDesc') }}</p>
      </div>
      <button
        type="button"
        class="h-9 px-4 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 shrink-0"
        @click="enableBrowserNotifications"
      >
        {{ $t('periodicTasks.enableNotifications') }}
      </button>
    </div>

    <!-- Create / Edit form -->
    <div
      v-if="showForm || editingTask"
      class="rounded-2xl border border-border/40 bg-card/50 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {{ editingTask ? $t('periodicTasks.edit') : $t('periodicTasks.newRoutine') }}
      </p>
      <PeriodicTaskForm
        :edit-task="editingTask"
        :loading="taskStore.isLoading"
        @submit="handleSubmit"
        @cancel="closeForm"
      />
    </div>

    <!-- Filters + view toggle -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="cat in categoryFilters"
          :key="cat.id"
          type="button"
          class="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all"
          :class="categoryFilter === cat.id
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background/50 border-border/50 text-muted-foreground hover:text-foreground'"
          @click="categoryFilter = cat.id"
        >
          {{ cat.label }}
        </button>
      </div>

      <div class="flex rounded-xl border border-border/50 p-0.5 bg-muted/30 self-start">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          :class="viewMode === 'today' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
          @click="viewMode = 'today'"
        >
          {{ $t('periodicTasks.todayTasks') }}
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          :class="viewMode === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
          @click="viewMode = 'all'"
        >
          {{ $t('periodicTasks.allRoutines') }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="taskStore.isLoading && taskStore.tasks.length === 0" class="flex justify-center py-16">
      <span class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>

    <!-- Task list -->
    <div v-else class="space-y-2">
      <PeriodicTaskItem
        v-for="task in visibleTasks"
        :key="task.id"
        :task="task"
        @toggle="toggleTask"
        @delete="deleteTask"
        @edit="startEdit"
      />

      <div
        v-if="visibleTasks.length === 0"
        class="text-center py-12 px-4 rounded-3xl border border-dashed border-border/40 bg-muted/5"
      >
        <div class="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
          <CalendarCheck class="w-5 h-5 text-muted-foreground/70" />
        </div>
        <p class="text-sm font-medium text-muted-foreground">
          {{ emptyMessage }}
        </p>
        <button
          v-if="!showForm"
          type="button"
          class="mt-3 text-xs font-semibold text-primary hover:underline"
          @click="showForm = true"
        >
          {{ $t('periodicTasks.addFirst') }}
        </button>
      </div>
    </div>

    <!-- Free notification note -->
    <p class="text-[11px] text-muted-foreground/70 leading-relaxed px-1">
      {{ $t('periodicTasks.notificationNote') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Plus, X, CalendarCheck } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import {
  usePeriodicTasksStore,
  type PeriodicTask,
  type PeriodicTaskInput,
  type TaskCategory,
} from '../stores/periodicTasks'
import PeriodicTaskItem from './PeriodicTaskItem.vue'
import PeriodicTaskForm from './PeriodicTaskForm.vue'
import {
  checkAndFireReminders,
  getBrowserPermission,
  requestBrowserPermission,
} from '../lib/reminders'

const { t } = useI18n()
const uiStore = useUIStore()
const authStore = useAuthStore()
const taskStore = usePeriodicTasksStore()

const showForm = ref(false)
const editingTask = ref<PeriodicTask | null>(null)
const viewMode = ref<'today' | 'all'>('today')
const categoryFilter = ref<'all' | TaskCategory>('all')
const browserPermission = ref(getBrowserPermission())

let reminderTimer: ReturnType<typeof setInterval> | null = null

const categoryFilters = computed(() => [
  { id: 'all' as const, label: t('periodicTasks.filters.all') },
  { id: 'work' as const, label: t('periodicTasks.categories.work') },
  { id: 'health' as const, label: t('periodicTasks.categories.health') },
  { id: 'habit' as const, label: t('periodicTasks.categories.habit') },
  { id: 'goal' as const, label: t('periodicTasks.categories.goal') },
  { id: 'other' as const, label: t('periodicTasks.categories.other') },
])

const visibleTasks = computed(() => {
  const base = viewMode.value === 'today' ? taskStore.todaysTasks : taskStore.tasks
  if (categoryFilter.value === 'all') return base
  return base.filter((task) => task.category === categoryFilter.value)
})

const emptyMessage = computed(() => {
  if (viewMode.value === 'today') return t('periodicTasks.noTasksToday')
  return t('periodicTasks.noRoutines')
})

onMounted(async () => {
  await taskStore.loadTasks()
  browserPermission.value = getBrowserPermission()
  runReminderCheck()
  reminderTimer = setInterval(runReminderCheck, 30_000)
})

onUnmounted(() => {
  if (reminderTimer) clearInterval(reminderTimer)
})

async function runReminderCheck() {
  await checkAndFireReminders({
    tasks: taskStore.tasks,
    userEmail: authStore.user?.email,
    onNotified: (id) => taskStore.markNotified(id),
    t: (key, params) => t(key, params || {}),
  })
}

async function enableBrowserNotifications() {
  const result = await requestBrowserPermission()
  browserPermission.value = result
  if (result === 'granted') {
    uiStore.addToast(t('periodicTasks.notificationsEnabled'), 'success')
  } else {
    uiStore.addToast(t('periodicTasks.notificationsDenied'), 'error')
  }
}

function closeForm() {
  showForm.value = false
  editingTask.value = null
}

function startEdit(task: PeriodicTask) {
  editingTask.value = task
  showForm.value = false
}

async function handleSubmit(input: PeriodicTaskInput) {
  if (editingTask.value) {
    const ok = await taskStore.updateTask(editingTask.value.id, input)
    if (ok) {
      uiStore.addToast(t('periodicTasks.updated'), 'success')
      closeForm()
    } else if (taskStore.error) {
      uiStore.addToast(taskStore.error, 'error')
    }
    return
  }

  if (input.frequency === 'weekly' && (!input.daysOfWeek || input.daysOfWeek.length === 0)) {
    uiStore.addToast(t('periodicTasks.selectDayError'), 'error')
    return
  }

  if (input.notifyBrowser && getBrowserPermission() === 'default') {
    await requestBrowserPermission()
    browserPermission.value = getBrowserPermission()
  }

  const created = await taskStore.addTask(input)
  if (created) {
    uiStore.addToast(t('periodicTasks.added'), 'success')
    showForm.value = false
  } else if (taskStore.error) {
    uiStore.addToast(taskStore.error, 'error')
  }
}

async function toggleTask(taskId: string) {
  await taskStore.toggleTask(taskId)
}

async function deleteTask(taskId: string) {
  const ok = await uiStore.showConfirm(
    t('periodicTasks.deleteConfirmTitle'),
    t('periodicTasks.deleteConfirmDesc'),
    t('common.delete'),
    t('common.cancel')
  )
  if (!ok) return
  await taskStore.deleteTask(taskId)
  if (!taskStore.error) {
    uiStore.addToast(t('periodicTasks.deleted'), 'info')
    if (editingTask.value?.id === taskId) closeForm()
  }
}
</script>
