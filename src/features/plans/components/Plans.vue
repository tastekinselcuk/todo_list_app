<script setup lang="ts">
import { useSearchReveal } from '@/lib/searchNavigation'
import { useModuleAccess, useModuleLoad } from '@/lib/workspaceScope'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { computed, ref, nextTick, onMounted, onActivated, onDeactivated, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, Check, Clock3, Copy, History, Trash2, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { usePlansStore, type Plan } from '../stores/plans'
import { firstPopulatedPeriod, periodStart, periods, type Period } from '../lib/periods'
import { workspaceStorageKey } from '@/lib/workspaceScope'
import { useUIStore } from '@/stores/ui'
import { readStorage } from '@/lib/storage'

const { canWrite } = useModuleAccess('plans')

const store = usePlansStore()
const ui = useUIStore()
const { locale } = useI18n()
const tr = computed(() => locale.value === 'tr')
const copy = computed(() => tr.value ? {
  daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık', yearly: 'Yıllık',
  placeholder: 'Aklında ne var?', add: 'Ekle', archive: 'Geçmişi göster', current: 'Bu dönem',
  done: 'tamamlandı', pending: 'yapılacak', deferred: 'Ertelenenler', defer: 'Ertele',
  reason: 'Neden erteliyorsun?', reasonHint: 'Örn. Önce teklifin gelmesini bekliyorum.',
  save: 'Nedeni kaydet', cancel: 'Vazgeç', carried: 'Önceki dönemden', resume: 'Listeye geri al',
  history: 'Geçmiş dönemler', historyEmpty: 'Henüz geçmiş bir dönem yok.',
  setup: 'Planlar yüklenemedi. Bağlantıyı kontrol et; ilk kurulumda PLANS_SETUP.md dosyasındaki veritabanı adımını tamamla.',
  retry: 'Tekrar dene', complete: 'Tamamla', undo: 'Tamamlanmadı olarak işaretle', progress: 'Dönem ilerlemesi',
  copy: 'Kopyala', copied: 'Kopyalandı', copyFailed: 'Kopyalama başarısız', delete: 'Sil', deleted: 'Plan silindi', deleteFailed: 'Plan silinemedi',
} : {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
  placeholder: 'What’s on your mind?', add: 'Add', archive: 'Show history', current: 'This period',
  done: 'completed', pending: 'to do', deferred: 'Deferred', defer: 'Defer',
  reason: 'Why are you deferring this?', reasonHint: 'e.g. Waiting for the proposal first.',
  save: 'Save reason', cancel: 'Cancel', carried: 'Carried forward', resume: 'Return to list',
  history: 'Past periods', historyEmpty: 'No past periods yet.',
  setup: 'Could not load plans. Check your connection; for first-time setup, complete the database step in PLANS_SETUP.md.',
  retry: 'Retry', complete: 'Complete', undo: 'Mark incomplete', progress: 'Period progress',
  copy: 'Copy', copied: 'Copied', copyFailed: 'Could not copy', delete: 'Delete', deleted: 'Plan deleted', deleteFailed: 'Could not delete plan',
})
const selected = useWorkspaceDraft<Period>('plan-period', 'daily')
if (!periods.includes(selected.value)) selected.value = 'daily'
let periodChosen = readStorage(workspaceStorageKey('plan-period')) !== null
const emptyMessage = computed(() => tr.value
  ? `Henüz ${copy.value[selected.value].toLocaleLowerCase('tr-TR')} plan eklenmedi.`
  : `No ${copy.value[selected.value].toLowerCase()} plans added yet.`)
const inputPeriod = ref<Period>(selected.value)
const periodOptions = computed(() => periods.map(value => ({ value, label: copy.value[value] })))
const title = useWorkspaceDraft('plan-title', '')
const historyKey = workspaceStorageKey('plans-history')
const showHistory = useWorkspaceDraft('plans-history', readStorage(historyKey) === 'true')
const editing = ref<Plan | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
watch(editing, async value => {
  if (value) { await nextTick(); if (!dialog.value?.open) dialog.value?.showModal() }
})
const reason = ref('')
const today = ref(new Date())
const currentPlans = computed(() => store.plans.filter(p => p.period === selected.value && p.period_date === periodStart(p.period, today.value, store.timezone)))
const active = computed(() => currentPlans.value.filter(p => !p.reason && !p.completed).sort((a, b) => b.history.length - a.history.length))
const completed = computed(() => currentPlans.value.filter(p => p.completed))
const deferred = computed(() => currentPlans.value.filter(p => p.reason && !p.completed))
const progress = computed(() => currentPlans.value.length ? Math.round(completed.value.length / currentPlans.value.length * 100) : 0)
const archived = computed(() => {
  const groups = new Map<string, { id: string; title: string; completed: boolean; reason: string }[]>()
  for (const plan of store.plans.filter(p => p.period === selected.value)) {
    const entries = [...plan.history, { date: plan.period_date, completed: plan.completed, reason: plan.reason }]
    for (const entry of entries) {
      if (entry.date >= periodStart(selected.value, today.value, store.timezone)) continue
      const rows = groups.get(entry.date) || []
      rows.push({ id: plan.id, title: plan.title, completed: entry.completed, reason: entry.reason })
      groups.set(entry.date, rows)
    }
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a))
})
function formatDate(value: string, period = selected.value) {
  const date = new Date(`${value}T12:00:00`)
  const language = tr.value ? 'tr-TR' : 'en-GB'
  if (period === 'yearly') return String(date.getFullYear())
  if (period === 'monthly') return date.toLocaleDateString(language, { month: 'long', year: 'numeric' })
  const start = date.toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })
  if (period !== 'weekly') return start
  date.setDate(date.getDate() + 6)
  return `${start} – ${date.toLocaleDateString(language, { day: 'numeric', month: 'long' })}`
}
function count(period: Period) { return store.plans.filter(p => p.period === period && p.period_date === periodStart(period, today.value, store.timezone)).length }
async function refresh(choose = false) {
  today.value = new Date()
  if (await store.load() && choose && !periodChosen) {
    selected.value = firstPopulatedPeriod(store.plans, today.value, store.timezone)
    inputPeriod.value = selected.value
    periodChosen = true
  }
}
async function add() {
  // Refresh boundaries before a mutation, including a tab left open overnight.
  if (!await store.load()) return
  if (await store.add(title.value, inputPeriod.value)) {
    selected.value = inputPeriod.value
    title.value = ''
    today.value = new Date()
  }
}
async function toggle(plan: Plan) {
  if (store.isSaving(plan.id)) return
  if (periodStart('daily', new Date(), store.timezone) !== periodStart('daily', today.value, store.timezone) && !await store.load()) return
  const current = store.plans.find(p => p.id === plan.id)
  if (current) await store.update(current, { completed: !current.completed, reason: '' })
  today.value = new Date()
}
function startDefer(plan: Plan) { editing.value = plan; reason.value = plan.reason }
async function copyPlan(plan: Plan) {
  try {
    await navigator.clipboard.writeText(plan.title)
    ui.addToast(copy.value.copied, 'success')
  } catch {
    ui.addToast(copy.value.copyFailed, 'error')
  }
}
async function deletePlan(plan: Plan) {
  if (store.busy || store.isSaving(plan.id)) return
  if (await store.remove(plan.id)) {
    if (editing.value?.id === plan.id) editing.value = null
  } else {
    ui.addToast(copy.value.deleteFailed, 'error')
  }
}
async function saveReason() {
  if (!editing.value || !reason.value.trim() || !await store.load()) return
  const current = store.plans.find(p => p.id === editing.value?.id)
  if (current && await store.update(current, { reason: reason.value.trim(), completed: false })) editing.value = null
  today.value = new Date()
}
async function resume(plan: Plan) {
  if (!await store.load()) return
  const current = store.plans.find(p => p.id === plan.id)
  if (current && await store.update(current, { reason: '' })) editing.value = null
  today.value = new Date()
}
watch(selected, value => { inputPeriod.value = value; periodChosen = true })
let timer: ReturnType<typeof setInterval> | undefined
function watchDay() { clearInterval(timer); timer = setInterval(() => { if (periodStart('daily', new Date(), store.timezone) !== periodStart('daily', today.value, store.timezone)) void refresh() }, 30000) }
onMounted(watchDay)
onActivated(watchDay)
useModuleLoad(() => refresh(true))
onDeactivated(() => { clearInterval(timer); editing.value = null })
onUnmounted(() => clearInterval(timer))
useSearchReveal('plans', async (hit, isCurrent) => {
  if(periods.includes(hit.meta.period as Period))selected.value=hit.meta.period as Period
  periodChosen=true;today.value=new Date()
  showHistory.value=Boolean(hit.meta.date&&hit.meta.date<periodStart(selected.value,today.value,store.timezone))
  await store.load(hit.record_id)
  if(!isCurrent())return
  const plan=store.plans.find(p=>p.id===hit.record_id)
  if(plan){selected.value=plan.period;showHistory.value=plan.period_date<periodStart(plan.period,today.value,store.timezone)}
})
</script>

<template>
  <section class="plans-shell" :aria-busy="store.busy">
    <div class="workspace-toolbar">
      <form v-if="canWrite" class="capture" @submit.prevent="add">
        <div class="capture-field">
          <input v-model="title" type="text" :aria-label="copy.placeholder" :placeholder="copy.placeholder" maxlength="1000" />
          <div class="period-select">
            <CustomSelect
              :model-value="inputPeriod"
              @update:model-value="inputPeriod = $event as Period"
              :options="periodOptions"
              variant="ghost"
              size="sm"
              :aria-label="copy.current"
            />
          </div>
        </div>
        <button class="add-button" :disabled="!title.trim() || store.busy">{{ copy.add }}</button>
      </form>

      <div v-if="store.error" role="alert" class="error-message"><p>{{ copy.setup }}</p><button :disabled="store.busy" @click="refresh(true)">{{ copy.retry }}</button></div>
      <div class="period-toolbar">
        <nav class="period-tabs" :aria-label="copy.current"><button v-for="period in periods" :key="period" :class="{ selected: selected === period }" :aria-pressed="selected === period" @click="selected = period">{{ copy[period] }}<span v-if="count(period)">{{ count(period) }}</span></button></nav>
        <button class="history-switch" role="switch" :aria-checked="showHistory" @click="showHistory = !showHistory"><History :size="15" />{{ copy.archive }}<span class="switch-track" :class="{ on: showHistory }"><i></i></span></button>
      </div>

      <div class="progress-track" role="progressbar" :aria-label="copy.progress" :aria-valuenow="progress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ width: `${progress}%` }"></span></div>
      <div class="completion-summary" aria-live="polite">
        <span class="completion-count">{{ progress }}% · {{ completed.length }}/{{ currentPlans.length }} {{ copy.done }}</span>
      </div>
    </div>

    <div v-if="!currentPlans.length && !store.busy && !store.error" class="empty-state"><p>{{ emptyMessage }}</p></div>
    <div class="task-list">
      <article v-for="plan in [...active, ...completed]" :key="plan.id" :data-search-record="plan.id" class="workspace-card task-row" :class="{ completed: plan.completed }" @click="canWrite && toggle(plan)">
        <button :disabled="!canWrite" class="task-check" :aria-disabled="store.busy || store.isSaving(plan.id)" :aria-label="plan.completed ? copy.undo : copy.complete" :aria-pressed="plan.completed" @click.stop="toggle(plan)"><Check v-if="plan.completed" :size="13" /></button>
        <button :disabled="!canWrite" class="task-content" :aria-disabled="store.busy || store.isSaving(plan.id)" :aria-pressed="plan.completed" @click.stop="toggle(plan)"><span>{{ plan.title }}</span><small v-if="plan.history.length && !plan.completed"><ArrowUpRight :size="11" />{{ copy.carried }}</small></button>
        <div class="task-actions" @click.stop>
          <button type="button" class="task-action" :aria-label="copy.copy" :title="copy.copy" @click.stop="copyPlan(plan)"><Copy :size="15" /></button>
          <button v-if="canWrite" type="button" class="task-action" :disabled="store.busy || store.isSaving(plan.id)" :aria-label="copy.defer" :title="copy.defer" @click.stop="startDefer(plan)"><Clock3 :size="15" /></button>
          <button v-if="canWrite" type="button" class="task-action delete-action" :disabled="store.busy || store.isSaving(plan.id)" :aria-label="copy.delete" :title="copy.delete" @click.stop="deletePlan(plan)"><Trash2 :size="15" /></button>
        </div>
      </article>
    </div>

    <section v-if="deferred.length" class="deferred-section"><h3><Clock3 :size="15" />{{ copy.deferred }}<span>{{ deferred.length }}</span></h3>
      <article v-for="plan in deferred" :key="plan.id" class="workspace-card task-row deferred-row" @click="canWrite && toggle(plan)">
        <button :disabled="!canWrite" class="task-check" :aria-disabled="store.busy || store.isSaving(plan.id)" :aria-label="copy.complete" @click.stop="toggle(plan)"></button>
        <div class="task-content"><button :disabled="!canWrite" class="task-title" :aria-disabled="store.busy || store.isSaving(plan.id)" @click.stop="toggle(plan)">{{ plan.title }}</button><button :disabled="!canWrite" class="reason-text" @click.stop="startDefer(plan)">{{ plan.reason }}</button></div>
        <div class="task-actions" @click.stop>
          <button type="button" class="task-action" :aria-label="copy.copy" :title="copy.copy" @click.stop="copyPlan(plan)"><Copy :size="15" /></button>
          <button v-if="canWrite" type="button" class="task-action" :disabled="store.busy || store.isSaving(plan.id)" :aria-label="copy.defer" :title="copy.defer" @click.stop="startDefer(plan)"><Clock3 :size="15" /></button>
          <button v-if="canWrite" type="button" class="task-action delete-action" :disabled="store.busy || store.isSaving(plan.id)" :aria-label="copy.delete" :title="copy.delete" @click.stop="deletePlan(plan)"><Trash2 :size="15" /></button>
        </div>
      </article>
    </section>

    <section v-if="showHistory" class="archive-section"><h3><History :size="16" />{{ copy.history }}</h3>
      <p v-if="!archived.length" class="archive-empty">{{ copy.historyEmpty }}</p>
      <details v-for="[date, rows] in archived" :key="date" class="workspace-card archive-group"><summary>{{ formatDate(date) }}<span>{{ rows.filter(r => r.completed).length }} / {{ rows.length }} {{ copy.done }}</span></summary><div v-for="row in rows" :key="row.id" :data-search-record="row.id" class="archive-row"><Check v-if="row.completed" :size="15" /><Clock3 v-else :size="15" /><div><span :class="{ 'past-done': row.completed }">{{ row.title }}</span><small>{{ row.reason || (row.completed ? copy.done : copy.pending) }}</small></div></div></details>
    </section>

    <Teleport to="body"><dialog v-if="editing" ref="dialog" aria-labelledby="defer-title" class="plan-native-dialog" @cancel.prevent="editing = null" @click.self="editing = null">
      <section class="defer-dialog"><button class="close-dialog" :aria-label="copy.cancel" @click="editing = null"><X :size="18" /></button><Clock3 :size="23" /><h2 id="defer-title">{{ copy.reason }}</h2><p>{{ editing.title }}</p><form @submit.prevent="saveReason"><textarea v-model="reason" :aria-label="copy.reason" :placeholder="copy.reasonHint" rows="3" maxlength="1000" autofocus required></textarea><button v-if="canWrite && (editing.reason)" type="button" class="resume-button" :disabled="store.busy || store.isSaving(editing.id)" @click="resume(editing)">{{ copy.resume }}</button><div class="dialog-actions"><button type="button" @click="editing = null">{{ copy.cancel }}</button><button class="add-button" :disabled="!reason.trim() || store.busy">{{ copy.save }}</button></div></form></section>
    </dialog></Teleport>
  </section>
</template>

<style scoped>
.plan-native-dialog {
  --plan-accent:hsl(var(--primary));
  background:transparent;
  border:0;
  padding:0;
  max-width:calc(100% - 40px);
  color:hsl(var(--foreground))
}
.plan-native-dialog::backdrop {
  background:#0006;
  backdrop-filter:blur(4px)
}
.plans-shell {
  --plan-accent:hsl(var(--primary));
  padding:0;
  color:hsl(var(--foreground))
}
.plans-shell > .workspace-toolbar {
  margin-bottom:16px
}
.capture {
  display:flex;
  align-items:center;
  gap:10px;
  width:100%
}
.capture-field {
  display:flex;
  align-items:center;
  flex:1;
  min-width:0;
  height:40px;
  border:1px solid hsl(var(--border)/.5);
  border-radius:12px;
  background:hsl(var(--background)/.5);
  backdrop-filter:blur(4px);
  box-shadow:0 1px 2px #0000000d;
  transition:border-color .2s,background .2s,box-shadow .2s
}
.capture-field:hover {
  border-color:hsl(var(--border)/.8);
  background:hsl(var(--background)/.7)
}
.capture-field:focus-within {
  border-color:hsl(var(--primary)/.4);
  background:hsl(var(--background));
  box-shadow:0 0 0 1px hsl(var(--primary)/.3)
}
.capture input {
  min-width:0;
  width:100%;
  flex:1;
  height:100%;
  background:transparent;
  outline:none;
  font-size:14px;
  padding:0 12px 0 16px;
  border-radius:12px 0 0 12px
}
.capture input::placeholder {
  color:hsl(var(--muted-foreground)/.6)
}
.period-select {
  display:flex;
  align-items:center;
  position:relative;
  flex-shrink:0;
  border-left:1px solid hsl(var(--border)/.5);
  padding:0 4px;
  color:hsl(var(--muted-foreground));
  font-size:12px
}
.period-select :deep(.absolute) {
  right:0
}
.add-button {
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  height:40px;
  background:hsl(var(--primary));
  color:hsl(var(--primary-foreground));
  font-size:12px;
  font-weight:600;
  padding:0 20px;
  border-radius:12px;
  box-shadow:0 1px 2px #0000000d;
  transition:background .2s,box-shadow .2s
}
.add-button:hover:not(:disabled) {
  background:hsl(var(--primary)/.9)
}
.add-button:disabled {
  opacity:.45;
  cursor:not-allowed
}
.period-toolbar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  margin:16px 0 0;
  padding-bottom:10px;
  flex-wrap:wrap
}
.period-tabs {
  display:flex;
  gap:5px;
  flex-wrap:wrap
}
.period-tabs button {
  display:flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  padding:7px 12px;
  border-radius:8px;
  color:hsl(var(--muted-foreground))
}
.period-tabs button.selected {
  background:color-mix(in srgb,var(--plan-accent) 12%,transparent);
  color:var(--plan-accent);
  font-weight:600
}
.period-tabs button span {
  font-size:10px;
  opacity:.7
}
.history-switch {
  display:flex;
  align-items:center;
  gap:7px;
  font-size:11px;
  color:hsl(var(--muted-foreground))
}
.switch-track {
  width:28px;
  height:16px;
  border-radius:20px;
  background:hsl(var(--muted));
  padding:3px
}
.switch-track i {
  display:block;
  width:10px;
  height:10px;
  background:hsl(var(--muted-foreground));
  border-radius:50%;
  transition:transform .2s
}
.switch-track.on {
  background:var(--plan-accent)
}
.switch-track.on i {
  transform:translateX(12px);
  background:hsl(var(--primary-foreground))
}
.completion-summary {
  display:flex;
  justify-content:flex-end;
  padding:8px 0 0
}
.completion-count {
  font-size:11px;
  color:hsl(var(--muted-foreground));
  white-space:nowrap
}
.progress-track {
  height:1px;
  background:hsl(var(--border));
  border-radius:1px;
  overflow:hidden
}
.progress-track span {
  display:block;
  height:100%;
  background:var(--plan-accent);
  transition:width .3s
}
.task-row {
  display:flex;
  align-items:center;
  gap:13px;
  padding:10px 12px;
  background:hsl(var(--card)/.4);
  cursor:pointer
}
.task-list {
  display:grid;
  gap:6px
}
.task-row:hover,.task-row:focus-within {
  background:hsl(var(--muted)/.5)
}
.task-row.completed {
  background:hsl(var(--muted)/.25)
}
.task-row.completed:hover,.task-row.completed:focus-within {
  background:hsl(var(--muted)/.5)
}
.task-check {
  height:19px;
  width:19px;
  border:1px solid hsl(var(--muted-foreground)/.4);
  border-radius:6px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0
}
.completed .task-check {
  background:var(--plan-accent);
  border-color:var(--plan-accent);
  color:hsl(var(--primary-foreground))
}
.task-content {
  flex:1;
  min-width:0;
  overflow-wrap:anywhere;
  font-size:13px;
  text-align:left;
  cursor:pointer
}
.task-title {
  display:block;
  width:100%;
  text-align:left;
  overflow-wrap:anywhere
}
.task-content small {
  display:flex;
  align-items:center;
  gap:3px;
  font-size:10px;
  color:var(--plan-accent);
  margin-top:5px
}
.completed .task-content>span {
  color:hsl(var(--muted-foreground));
  text-decoration:line-through
}
.task-actions {
  display:flex;
  align-items:center;
  gap:2px;
  flex-shrink:0
}
.task-action {
  display:flex;
  align-items:center;
  justify-content:center;
  color:hsl(var(--muted-foreground));
  width:28px;
  height:28px;
  padding:6px;
  border-radius:6px;
  transition:background .18s,color .18s
}
.task-action:hover:not(:disabled) {
  background:hsl(var(--muted));
  color:hsl(var(--foreground))
}
.delete-action:hover:not(:disabled) {
  background:hsl(var(--destructive)/.1);
  color:hsl(var(--destructive))
}
.task-action:disabled {
  opacity:.4
}
.resume-button {
  font-size:11px;
  color:var(--plan-accent);
  margin-top:8px
}
.resume-button:hover:not(:disabled) {
  text-decoration:underline
}
.deferred-section {
  margin-top:18px;
  padding:14px 16px;
  background:color-mix(in srgb,var(--plan-accent) 5%,transparent);
  border:1px solid hsl(var(--border)/.7);
  border-radius:12px
}
.deferred-section h3,.archive-section>h3 {
  font-size:12px;
  display:flex;
  gap:8px;
  align-items:center;
  font-weight:500;
  color:hsl(var(--muted-foreground))
}
.deferred-section h3 span {
  margin-left:auto;
  font-size:11px
}
.deferred-row:last-child {
  margin-bottom:0
}
.deferred-row {
  margin-top:8px
}
.reason-text {
  display:block;
  text-align:left;
  font-size:11px;
  color:hsl(var(--muted-foreground));
  margin-top:5px;
  overflow-wrap:anywhere
}
.reason-text:hover {
  text-decoration:underline
}
.empty-state {
  text-align:center;
  padding:28px 12px;
  border:1px dashed hsl(var(--border)/.4);
  border-radius:12px;
  background:hsl(var(--muted)/.05)
}
.empty-state p {
  font-size:12px;
  color:hsl(var(--muted-foreground))
}
.archive-section {
  margin-top:20px;
  border-top:1px solid hsl(var(--border));
  padding-top:16px
}
.archive-empty {
  font-size:11px;
  color:hsl(var(--muted-foreground));
  margin:10px 0 16px
}
.archive-group {
  margin-top:10px;
  overflow:hidden
}
.archive-group summary {
  cursor:pointer;
  font-size:12px;
  padding:15px
}
.archive-group summary span {
  float:right;
  font-size:10px;
  color:hsl(var(--muted-foreground))
}
.archive-row {
  display:flex;
  gap:12px;
  padding:12px 18px;
  font-size:12px;
  border-top:1px solid hsl(var(--border)/.7);
  transition:background .18s
}
.archive-row:hover {
  background:hsl(var(--muted)/.35)
}
.archive-row svg {
  color:var(--plan-accent);
  flex-shrink:0
}
.archive-row small {
  display:block;
  font-size:10px;
  color:hsl(var(--muted-foreground));
  margin-top:3px
}
.past-done {
  text-decoration:line-through
}
.error-message {
  font-size:12px;
  margin-top:16px;
  padding:16px;
  border-radius:10px;
  background:hsl(var(--destructive)/.08);
  color:hsl(var(--destructive))
}
.error-message button {
  margin-top:8px;
  text-decoration:underline
}
.defer-dialog {
  position:relative;
  background:hsl(var(--background));
  border:1px solid hsl(var(--border));
  border-radius:20px;
  width:440px;
  max-width:100%;
  padding:28px;
  box-shadow:0 24px 80px #0002
}
.defer-dialog>svg {
  color:var(--plan-accent)
}
.defer-dialog h2 {
  font-size:20px;
  margin:16px 0 8px
}
.defer-dialog p {
  font-size:12px;
  color:hsl(var(--muted-foreground));
  overflow-wrap:anywhere
}
.defer-dialog textarea {
  width:100%;
  background:hsl(var(--muted)/.4);
  border:1px solid hsl(var(--border));
  border-radius:10px;
  padding:12px;
  font-size:13px;
  margin-top:20px;
  resize:vertical
}
.close-dialog {
  position:absolute;
  top:20px;
  right:20px;
  color:hsl(var(--muted-foreground))
}
.dialog-actions {
  display:flex;
  justify-content:flex-end;
  gap:16px;
  align-items:center;
  margin-top:16px;
  font-size:12px
}
button:focus-visible,summary:focus-visible,textarea:focus-visible {
  outline:2px solid var(--plan-accent);
  outline-offset:4px
}
.capture input:focus-visible {
  outline:none
}
button:disabled {
  cursor:not-allowed
}
@media(max-width:640px) {
  .period-toolbar {
    gap:10px
  }
  .period-tabs {
    gap:2px
  }
  .period-tabs button {
    padding:6px 9px
  }
  .history-switch {
    margin-left:auto
  }
  .archive-group summary span {
    float:none;
    display:block;
    margin-top:6px
  }
  .deferred-section {
    padding:12px
  }
}
@media(max-width:380px) {
  .capture {
    flex-wrap:wrap
  }
  .capture-field {
    flex-basis:100%
  }
  .capture>.add-button {
    margin-left:auto
  }
}
@media(prefers-reduced-motion:reduce) {
  * {
    transition:none!important
  }
}
</style>
