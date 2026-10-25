<template>
  <div :class="['dashboard page-width-transition mx-auto w-full min-w-0 space-y-5 pb-8', settingsStore.isFullScreen ? 'max-w-[98%]' : 'max-w-5xl']">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2"><WorkspaceRail v-model="homeSection" :context="homeNavigation" /><h1 class="text-lg font-semibold tracking-tight">{{ t('dashboard.home.title') }}</h1></div>
        <p class="mt-0.5 text-xs text-muted-foreground">{{ currentDate }}</p>
      </div>
      <div class="flex items-center gap-1.5">
        <WorkspacePicker @manage="emit('manage-workspaces')" />
        <button type="button" class="icon-button" :title="t('dashboard.home.refresh')" :aria-label="t('dashboard.home.refresh')" :disabled="refreshing || saving || pendingActions.size > 0" @click="refresh">
          <RefreshCw :class="['h-4 w-4', refreshing && 'animate-spin motion-reduce:animate-none']" />
        </button>
      </div>
    </header>

    <form v-if="captureOptions.length" class="capture flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/70 p-2 shadow-sm" @submit.prevent="capture">
      <label for="home-capture" class="sr-only">{{ t('dashboard.home.capture') }}</label>
      <input id="home-capture" ref="captureInput" v-model="draft" type="text" autocomplete="off" :placeholder="t('dashboard.home.capture')" :disabled="saving" class="min-w-0 basis-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 sm:flex-1 sm:basis-0" />
      <CustomSelect v-model="destination" :options="captureOptions" :aria-label="t('dashboard.home.destination')" :disabled="saving" size="sm" class="min-w-0 flex-1 sm:w-40 sm:flex-none" />
      <button type="submit" :disabled="!canCapture" class="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
        <Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin" /><Plus v-else class="h-3.5 w-3.5" />
        {{ t('dashboard.home.add') }}
      </button>
    </form>

    <WeeklyAnalytics @open="emit('open-analytics')" />

    <div v-if="hasPlans || hasAgenda" class="context-panel grid grid-cols-1 gap-4" :class="hasPlans && hasAgenda ? 'lg:grid-cols-2' : ''">
      <section v-if="hasPlans" class="overview-panel" :aria-busy="statuses.plans === 'loading'">
        <header class="panel-header">
          <h2 class="flex items-center gap-2 text-sm font-semibold"><ListTodo class="h-4 w-4 text-muted-foreground" />{{ t('workspace.modules.plansName') }}</h2>
          <button type="button" class="text-link" @click="openPlans">{{ t('dashboard.home.viewAll') }}<ArrowUpRight class="h-3.5 w-3.5" /></button>
        </header>
        <div class="flex gap-1 border-b border-border/50 px-4" role="group" :aria-label="t('dashboard.home.period')">
          <button v-for="period in periods" :key="period" type="button" :aria-pressed="selectedPeriod === period" :class="['period-button', selectedPeriod === period ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground']" @click="choosePeriod(period)">{{ t(`dashboard.home.periods.${period}`) }}</button>
        </div>
        <div v-if="statuses.plans === 'loading'" class="panel-placeholder" role="status"><Loader2 class="h-4 w-4 animate-spin" />{{ t('dashboard.home.loading') }}</div>
        <div v-else-if="statuses.plans === 'error'" class="panel-placeholder" role="status"><span>{{ t('dashboard.home.loadError') }}</span><button type="button" class="text-link" @click="refresh">{{ t('dashboard.home.retry') }}</button></div>
        <template v-else>
          <div class="px-4 pt-3">
            <div class="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{{ t('dashboard.home.completed', { done: planSummary.completed, total: planSummary.total }) }}</span><span class="tabular-nums">{{ planSummary.percent }}%</span></div>
            <div class="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" :aria-label="t('dashboard.home.progress')" :aria-valuenow="planSummary.percent" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" :style="{ width: `${planSummary.percent}%` }" /></div>
          </div>
          <ul v-if="planSummary.pending.length" class="px-2 py-2">
            <li v-for="plan in planSummary.pending.slice(0, 4)" :key="plan.id" class="task-row">
              <button type="button" class="check-button" :disabled="!canWriteModule('plans') || plansStore.isSaving(plan.id)" :aria-label="t('dashboard.home.complete', { title: plan.title })" @click="completePlan(plan)"><span class="h-4 w-4 rounded border border-border" /></button>
              <button type="button" class="min-w-0 flex-1 py-2 text-left text-sm leading-5" @click="openPlans"><span class="line-clamp-2 break-words">{{ plan.title }}</span></button>
              <Clock3 v-if="plan.reason" class="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" :aria-label="plan.reason"><title>{{ plan.reason }}</title></Clock3>
            </li>
          </ul>
          <p v-else class="panel-placeholder">{{ planSummary.total ? t('dashboard.home.plansDone') : t(`dashboard.home.emptyPlans.${selectedPeriod}`) }}</p>
          <button v-if="planSummary.pending.length > 4" type="button" class="panel-footer" @click="openPlans">{{ t('dashboard.home.remaining', { count: planSummary.pending.length - 4 }) }}<ArrowRight class="h-3.5 w-3.5" /></button>
        </template>
      </section>

      <section v-if="hasAgenda" class="overview-panel" :aria-busy="agendaLoading">
        <header class="panel-header"><h2 class="flex items-center gap-2 text-sm font-semibold"><CalendarDays class="h-4 w-4 text-muted-foreground" />{{ t('dashboard.home.today') }}<span v-if="!agendaLoading && agenda.length" class="rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">{{ agenda.length }}</span></h2></header>
        <div v-if="agendaLoading" class="panel-placeholder" role="status"><Loader2 class="h-4 w-4 animate-spin" />{{ t('dashboard.home.loading') }}</div>
        <template v-else>
          <div v-if="agendaError" class="mx-4 mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">{{ t('dashboard.home.loadError') }}<button type="button" class="text-link" @click="refresh">{{ t('dashboard.home.retry') }}</button></div>
          <ul v-if="agenda.length" class="px-2 py-2">
            <li v-for="item in agenda.slice(0, agendaLimit)" :key="`${item.module}:${item.id}`" class="task-row">
              <button type="button" class="check-button" :disabled="!canWriteModule(item.module) || pendingActions.has(`${item.module}:${item.id}`)" :aria-label="t('dashboard.home.complete', { title: item.title })" @click="completeAgenda(item)"><Loader2 v-if="pendingActions.has(`${item.module}:${item.id}`)" class="h-4 w-4 animate-spin" /><span v-else class="h-4 w-4 rounded border border-border" /></button>
              <button type="button" class="min-w-0 flex-1 py-2 text-left" @click="emit('enter-workspace', item.module)"><span class="line-clamp-2 break-words text-sm leading-5">{{ item.title }}</span><span class="mt-0.5 block text-[11px] text-muted-foreground">{{ t(`workspace.modules.${item.module}Name`) }}</span></button>
              <span v-if="item.overdue" class="mr-2 shrink-0 rounded-md bg-amber-500/10 px-1.5 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">{{ t('dashboard.home.overdue') }}</span>
              <span v-else-if="item.time" class="mr-2 text-xs tabular-nums text-muted-foreground">{{ item.time }}</span>
            </li>
          </ul>
          <p v-else-if="!agendaError" class="panel-placeholder">{{ t('dashboard.home.emptyToday') }}</p>
          <button v-if="agenda.length > agendaLimit" type="button" class="panel-footer" @click="agendaLimit+=12">{{ t('dashboard.home.remaining', { count: agenda.length - agendaLimit }) }}<ArrowRight class="h-3.5 w-3.5" /></button>
        </template>
      </section>
    </div>

    <section class="context-panel" :aria-label="t('dashboard.home.modules')">
      <div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-xs font-medium text-muted-foreground">{{ t('dashboard.home.modules') }}</h2><button type="button" class="text-link" @click="emit('manage-workspaces')"><Settings2 class="h-3.5 w-3.5" />{{ t('dashboard.home.manage') }}</button></div>
      <div v-if="modules.length" class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <button v-for="module in modules" :key="module.id" type="button" class="module-card group" @click="openModule(module.id)">
          <span :class="['flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', module.color]"><component :is="module.icon" class="h-4 w-4" /></span>
          <span class="min-w-0 flex-1"><span class="block text-sm font-medium leading-5">{{ t(module.id==='pomodoro'?'pomoNotes.tab':`workspace.modules.${module.id}Name`) }}</span><span class="mt-1 block text-xs text-muted-foreground" :class="statuses[module.id] === 'loading' ? 'animate-pulse motion-reduce:animate-none' : ''">{{ moduleMetric(module.id) }}</span></span>
          <ArrowUpRight class="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
        </button>
      </div>
      <div v-else class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-center"><LayoutGrid class="h-5 w-5 text-muted-foreground" /><p class="text-sm text-muted-foreground">{{ t('dashboard.home.emptyModules') }}</p><button type="button" class="text-link" @click="emit('manage-workspaces')">{{ t('dashboard.home.manage') }}<ArrowRight class="h-3.5 w-3.5" /></button></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, ArrowUpRight, CalendarDays, CheckSquare, Clapperboard, Clock3, Code2, Dumbbell, Layers, LayoutGrid, ListTodo, Loader2, Plus, RefreshCw, Repeat, Settings2, Shield, Target, Timer, Wallet, Zap } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import WorkspacePicker from '@/components/ui/WorkspacePicker.vue'
import WorkspaceRail from '@/components/ui/WorkspaceRail.vue'
import { getPageNavigation, resolvePageSection } from '@/lib/workspaceSections'
import WeeklyAnalytics from '@/features/analytics/components/WeeklyAnalytics.vue'
import { useWorkspaceDraft, workspaceStorageKey, useModuleAccess } from '@/lib/workspaceScope'
import { readStorage, writeStorage } from '@/lib/storage'
import { moduleCatalog } from '@/lib/moduleCatalog'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { useTodoStore } from '@/features/todos/stores/todo'
import { usePlansStore, type Plan } from '@/features/plans/stores/plans'
import { firstPopulatedPeriod, periods, periodStart, type Period } from '@/features/plans/lib/periods'
import { summarizePlans, buildAgenda, type AgendaItem } from '@/features/dashboard/lib/overview'
import { useLearningStore } from '@/features/learning/stores/learning'
import { useWorkoutStore } from '@/features/workout/stores/workout'
import { useFlashcardStore } from '@/features/flashcards/stores/flashcards'
import { usePeriodicTasksStore, isTaskDueOn, isCompletedForPeriod } from '@/features/PeriodicTasks/stores/periodicTasks'
import { useActivityListsStore } from '@/features/activity_lists/stores/activityLists'

const emit = defineEmits<{ 'enter-workspace': [id: string]; 'manage-workspaces': []; 'open-analytics': [] }>()
const { t, locale } = useI18n()
const settingsStore = useSettingsStore()
const ui = useUIStore()
const writable = Object.fromEntries(['quick', 'plans', 'detailed', 'periodic'].map(id => [id, useModuleAccess(id).canWrite]))
const canWriteModule = (id: string) => writable[id]?.value === true
const todoStore = useTodoStore()
const plansStore = usePlansStore()
const learningStore = useLearningStore()
const workoutStore = useWorkoutStore()
const flashcardStore = useFlashcardStore()
const periodicStore = usePeriodicTasksStore()
const activityStore = useActivityListsStore()
const now = ref(new Date())
const currentDate = computed(() => now.value.toLocaleDateString(locale.value === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
const moduleIcons={ListTodo,CalendarDays,CheckSquare,Zap,ShieldCheck:Shield,Code2,Timer,Target,Layers,Dumbbell,Repeat,Clapperboard,Wallet}
const moduleDefinitions=moduleCatalog.map(module=>({id:module.id,icon:moduleIcons[module.icon],
  color:module.id==='plans'?'bg-primary/10 text-primary':module.theme.icon}))
const modules = computed(() => moduleDefinitions.filter(module => settingsStore.isModuleActive(module.id)))
type LoadStatus = 'loading' | 'ready' | 'error'
const statuses = ref<Record<string, LoadStatus>>(Object.fromEntries(moduleDefinitions.map(module => [module.id, ['secure','pomodoro','finance'].includes(module.id) ? 'ready' : 'loading'])))
const refreshing = ref(false)
const saving = ref(false)
const pendingActions = ref(new Set<string>())
const captureInput = ref<HTMLInputElement>()
const draft = useWorkspaceDraft('dashboard-capture', '')
const destination = useWorkspaceDraft('dashboard-destination', 'quick')
const selectedPeriod = useWorkspaceDraft<Period>('dashboard-plan-period', 'daily')
const homeSection=useWorkspaceDraft('dashboard-section','overview'),agendaLimit=ref(4)
const homeNavigation=computed(()=>getPageNavigation('dashboard'))
watch(homeSection,value=>{const section=resolvePageSection('dashboard',value)||'overview';if(section!==value)homeSection.value=section},{immediate:true})
let periodChosen = false
try {
  periodChosen = periods.includes(selectedPeriod.value) && readStorage(workspaceStorageKey('dashboard-plan-period')) !== null
} catch { /* Browser preferences are optional. */ }
if (!periods.includes(selectedPeriod.value)) selectedPeriod.value = 'daily'
const captureOptions = computed(() => [
  ...(settingsStore.isModuleActive('quick') && canWriteModule('quick') ? [{ value: 'quick', label: t('workspace.modules.quickName') }] : []),
  ...(settingsStore.isModuleActive('plans') && canWriteModule('plans') ? periods.map(period => ({ value: period, label: t(`dashboard.home.periods.${period}`) })) : []),
])
if (!captureOptions.value.some(option => option.value === destination.value)) destination.value = captureOptions.value[0]?.value || ''
const canCapture = computed(() => captureOptions.value.some(option => option.value === destination.value) && Boolean(draft.value.trim()) && !saving.value && statuses.value[destination.value === 'quick' ? 'quick' : 'plans'] === 'ready')
const hasPlans = computed(() => settingsStore.isModuleActive('plans'))
const hasAgenda = computed(() => settingsStore.isModuleActive('detailed') || settingsStore.isModuleActive('periodic'))
const planSummary = computed(() => summarizePlans(plansStore.plans, selectedPeriod.value, now.value, plansStore.timezone))
const currentPlansCount = computed(() => plansStore.plans.filter(plan => !plan.completed && plan.period_date === periodStart(plan.period, now.value, plansStore.timezone)).length)
const pendingRoutines = computed(() => periodicStore.tasks.filter(task => isTaskDueOn(task, now.value) && !isCompletedForPeriod(task, now.value)))
const agenda = computed(() => buildAgenda(
  settingsStore.isModuleActive('detailed') && statuses.value.detailed === 'ready' ? todoStore.todos : [],
  settingsStore.isModuleActive('periodic') && statuses.value.periodic === 'ready' ? pendingRoutines.value : [],
  now.value,
))
const agendaModuleIds = computed(() => ['detailed', 'periodic'].filter(id => settingsStore.isModuleActive(id)))
const agendaLoading = computed(() => agendaModuleIds.value.some(id => statuses.value[id] === 'loading'))
const agendaError = computed(() => agendaModuleIds.value.some(id => statuses.value[id] === 'error'))

async function refresh() {
  if (refreshing.value || saving.value || pendingActions.value.size) return
  refreshing.value = true
  const loaders: Record<string, () => Promise<boolean>> = {
    plans: () => plansStore.load(), detailed: () => todoStore.fetchTodos(), quick: () => todoStore.fetchQuickNotes(),
    code: () => todoStore.fetchCodeSnippets(), learning: () => learningStore.fetchSubjects(),
    flashcards: () => flashcardStore.fetchDecks(), workout: () => workoutStore.fetchRoutines(),
    periodic: () => periodicStore.loadTasks(), activities: () => activityStore.loadItems(),
  }
  try {
    await Promise.allSettled(modules.value.filter(module => loaders[module.id]).map(async module => {
      statuses.value[module.id] = 'loading'
      try { statuses.value[module.id] = await loaders[module.id]() ? 'ready' : 'error' }
      catch { statuses.value[module.id] = 'error' }
      if (module.id === 'plans' && statuses.value.plans === 'ready' && !periodChosen) selectedPeriod.value = firstPopulatedPeriod(plansStore.plans, now.value, plansStore.timezone)
    }))
  } finally { refreshing.value = false }
}

function choosePeriod(period: Period) { periodChosen = true; selectedPeriod.value = period }
function openPlans() {
  writeStorage(workspaceStorageKey('plan-period'), JSON.stringify(selectedPeriod.value))
  emit('enter-workspace', 'plans')
}
function openModule(id: string) { if (id === 'plans') openPlans(); else emit('enter-workspace', id) }

async function capture() {
  if (!canCapture.value) return
  saving.value = true
  const title = draft.value.trim()
  const target = destination.value
  try {
    const success = target === 'quick' ? (await todoStore.addQuickNote(title)).success : await plansStore.add(title, target as Period)
    if (!success) throw new Error('Save failed')
    draft.value = ''
    if (target !== 'quick') choosePeriod(target as Period)
    ui.addToast(t('dashboard.home.saved'), 'success')
  } catch { ui.addToast(t('dashboard.home.saveError'), 'error') }
  finally { saving.value = false; captureInput.value?.focus() }
}

async function completePlan(plan: Plan) {
  if (!canWriteModule('plans')) return
  const key = `plans:${plan.id}`
  if (statuses.value.plans !== 'ready' || pendingActions.value.has(key)) return
  pendingActions.value.add(key)
  try { if (!await plansStore.update(plan, { completed: true, reason: '' })) ui.addToast(t('dashboard.home.saveError'), 'error') }
  finally { pendingActions.value.delete(key) }
}
async function completeAgenda(item: AgendaItem) {
  if (!canWriteModule(item.module)) return
  const key = `${item.module}:${item.id}`
  if (statuses.value[item.module] !== 'ready' || pendingActions.value.has(key)) return
  pendingActions.value.add(key)
  try {
    const success = item.module === 'detailed' ? await todoStore.toggleTodo(item.id) : await periodicStore.toggleTask(item.id)
    if (!success) ui.addToast(t('dashboard.home.saveError'), 'error')
  } finally { pendingActions.value.delete(key) }
}

function moduleMetric(id: string) {
  if (id === 'tasks') return t('workspace.modules.tasksDesc')
  if (id === 'secure') return t('dashboard.home.protected')
  if (id === 'pomodoro') return t('pomoNotes.dashboardHint')
  if (id === 'finance') return t('finance.dashboardHint')
  if (statuses.value[id] === 'loading') return t('dashboard.home.loading')
  if (statuses.value[id] === 'error') return t('dashboard.home.loadError')
  const metrics: Record<string, [number, string]> = {
    plans: [currentPlansCount.value, 'dashboard.home.pendingPlans'],
    detailed: [todoStore.todos.filter(todo => !todo.completed).length, 'dashboard.tasks.pending'],
    quick: [todoStore.quickNotes.length, 'dashboard.quickNotes.saved'],
    code: [todoStore.codeSnippets.length, 'dashboard.code.snippets'],
    learning: [learningStore.subjects.length, 'dashboard.learning.subjects'],
    flashcards: [flashcardStore.decks.length, 'dashboard.flashcards.decks'],
    workout: [workoutStore.routines.length, 'dashboard.workout.routines'],
    periodic: [pendingRoutines.value.length, 'dashboard.home.pendingRoutines'],
    activities: [activityStore.wantCount, 'dashboard.activities.want'],
  }
  const metric = metrics[id]
  return metric ? `${metric[0]} ${t(metric[1])}` : ''
}

let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void refresh()
  ticker = setInterval(() => {
    const previousDay = periodStart('daily', now.value)
    now.value = new Date()
    if (periodStart('daily', now.value) !== previousDay) void refresh()
  }, 60_000)
})
onUnmounted(() => clearInterval(ticker))
</script>

<style scoped>
.dashboard :is(button, input):focus-visible { outline: 2px solid hsl(var(--primary) / 0.55); outline-offset: 3px; border-radius: 0.75rem; }
.capture:focus-within { border-color: hsl(var(--primary) / 0.35); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.05); }
.capture input:focus-visible { outline: none; }
.icon-button { @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40; }
.overview-panel { @apply min-w-0 rounded-2xl border border-border/60 bg-card/60 shadow-sm; }
.panel-header { @apply flex min-h-12 items-center justify-between gap-3 px-4 py-3; }
.text-link { @apply inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground; }
.period-button { @apply min-h-10 border-b-2 px-2.5 text-xs font-medium transition-colors; }
.panel-placeholder { @apply flex min-h-28 flex-wrap items-center justify-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground; }
.task-row { @apply flex items-center gap-1 rounded-xl px-1 transition-colors hover:bg-muted/50; }
.check-button { @apply inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/5 disabled:opacity-40; }
.panel-footer { @apply flex w-full items-center justify-between gap-2 border-t border-border/40 px-4 py-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground; }
.module-card { @apply flex min-w-0 items-center gap-3 rounded-2xl border border-border/50 bg-card/50 p-3.5 text-left transition-colors hover:border-border hover:bg-muted/40; }
@media (prefers-reduced-motion: reduce) { .dashboard *, .dashboard *::before, .dashboard *::after { transition-duration: 0s !important; animation: none !important; } }
</style>
