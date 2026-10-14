<template>
  <div :class="['mx-auto min-w-0 space-y-5 pb-8', settings.isFullScreen ? 'max-w-[98%]' : 'max-w-5xl']">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-lg font-semibold tracking-tight">{{ t('analytics.title') }}</h1><p class="mt-1 text-xs text-muted-foreground">{{ t('analytics.subtitle') }}</p></div>
      <div class="flex flex-wrap items-center gap-2">
        <CustomSelect v-model="workspace" :options="workspaceOptions" :aria-label="t('analytics.workspace')" size="sm" class="w-40" />
        <CustomSelect v-if="section==='activity'" v-model="preset" :options="presetOptions" :aria-label="t('analytics.period')" size="sm" class="w-32" />
        <button v-if="section==='activity'" type="button" class="analytics-icon" :disabled="refreshing" :title="t('analytics.refresh')" :aria-label="t('analytics.refresh')" @click="load"><RefreshCw :class="['h-3.5 w-3.5', refreshing && 'animate-spin motion-reduce:animate-none']" /></button>
        <button v-if="section==='activity'" type="button" class="analytics-icon" :disabled="!report" :title="t('analytics.export')" :aria-label="t('analytics.export')" @click="exportReport"><Download class="h-3.5 w-3.5" /></button>
      </div>
    </header>
    <div class="inline-flex gap-1 rounded-xl border border-border/60 bg-card/50 p-1" role="group" :aria-label="t('analytics.title')"><button v-for="view in ['activity','finance'] as const" :key="view" type="button" :aria-pressed="section===view" class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors" :class="section===view?'bg-background text-foreground shadow-sm':'text-muted-foreground hover:text-foreground'" @click="section=view">{{ t(view==='finance'?'finance.title':'finance.productivity') }}</button></div>
    <FinanceReport v-if="section==='finance'" :workspace-id="workspace" />
    <template v-else>
    <div class="flex flex-wrap items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1" role="group" :aria-label="t('analytics.activityScope')">
        <button v-for="choice in [true,false]" :key="String(choice)" type="button" :aria-pressed="personal===choice" :class="['rounded-lg px-3 py-1.5 transition-colors',personal===choice ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground']" @click="personal=choice">{{ t(choice ? 'analytics.myActivity' : 'analytics.areaActivity') }}</button>
      </div>
      <div v-if="preset==='custom'" class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-muted-foreground">{{ t('analytics.from') }}<input v-model="from" type="date" :max="today" class="analytics-date" /></label>
        <label class="flex items-center gap-2 text-muted-foreground">{{ t('analytics.to') }}<input v-model="to" type="date" :max="today" class="analytics-date" /></label>
      </div>
      <span v-else class="text-muted-foreground">{{ dateLabel }} · {{ timezone }}</span>
    </div>

    <div v-if="status==='setup'" class="workspace-card bg-card/40 p-5 text-sm" role="status"><h2 class="font-medium">{{ t('analytics.setupTitle') }}</h2><p class="mt-2 max-w-xl text-xs leading-6 text-muted-foreground">{{ t('analytics.setupBody') }}</p></div>
    <div v-else-if="status==='error'" class="workspace-card flex flex-wrap items-center justify-between gap-3 bg-card/40 p-5 text-sm" role="alert"><span>{{ t(error==='range' ? 'analytics.invalidRange' : 'analytics.loadError') }}</span><button type="button" class="text-xs font-medium text-primary" @click="load">{{ t('analytics.retry') }}</button></div>
    <div v-else-if="!report" class="grid grid-cols-2 gap-3 sm:grid-cols-4" role="status" :aria-label="t('analytics.loading')"><div v-for="n in 4" :key="n" class="workspace-card h-24 animate-pulse bg-muted/30 motion-reduce:animate-none" /></div>
    <template v-else>
      <p v-if="!fullCoverage" class="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />{{ t('analytics.coverage', { date: recordingLabel }) }}</p>
      <p v-if="pending || storageFailed" class="text-xs leading-5 text-amber-700 dark:text-amber-400" role="status">{{ t(storageFailed ? 'analytics.storageIssue' : 'analytics.pendingSync',{count:pending}) }}</p>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button v-for="metric in metrics" :key="metric.key" type="button" class="workspace-card bg-card/40 px-4 py-3.5 text-left" @click="chooseMetric(metric.key)">
          <span class="flex items-center justify-between gap-2 text-xs text-muted-foreground">{{ metric.label }}<component :is="metric.icon" class="h-3.5 w-3.5" /></span>
          <span class="mt-2 block text-xl font-semibold tracking-tight tabular-nums">{{ metric.value }}</span>
          <span class="mt-1 block text-[11px] leading-4 text-muted-foreground">{{ metric.hint }}</span>
        </button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <section ref="focusPanel" class="workspace-card min-w-0 bg-card/40 p-4">
          <div class="mb-4 flex items-center justify-between gap-2"><h2 class="text-sm font-medium">{{ t('analytics.focusTrend') }}</h2><span class="text-[11px] text-muted-foreground">{{ t('analytics.minutes') }}</span></div>
          <AnalyticsChart :rows="focusRows" :series="focusSeries" :label="t('analytics.focusTrend')" :selected="selectedDay" @select="selectDay" />
          <p v-if="sum.seconds===0" class="mt-3 text-xs leading-5 text-muted-foreground">{{ t(historyKnown ? 'analytics.focusEmpty' : 'analytics.historyEmpty') }}</p>
          <div v-if="focusAllocation.length" class="mt-4 space-y-2.5 border-t border-border/50 pt-3" :aria-label="t('pomoNotes.privateFocus')">
            <div v-for="allocation in focusAllocation" :key="allocation.key" class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[11px]">
              <span class="text-muted-foreground">{{ allocation.label }}</span><span class="tabular-nums">{{ duration(allocation.seconds) }}</span>
              <div class="col-span-2 h-1 overflow-hidden rounded-full bg-muted/70"><div class="h-full rounded-full bg-primary/65" :style="{width:`${allocation.share}%`}" /></div>
            </div>
          </div>
        </section>
        <section class="workspace-card min-w-0 bg-card/40 p-4">
          <div class="mb-4 flex items-center justify-between gap-2"><h2 class="text-sm font-medium">{{ t('analytics.taskFlow') }}</h2><span class="text-[11px] text-muted-foreground">{{ t('analytics.itemsUnit') }}</span></div>
          <AnalyticsChart :rows="taskRows" :series="taskSeries" :label="t('analytics.taskFlow')" :selected="selectedDay" @select="selectDay" />
          <p class="mt-3 text-[11px] leading-5 text-muted-foreground">{{ t('analytics.stockHint') }}</p>
        </section>
      </div>

      <section v-if="insights.length" class="workspace-card bg-card/30 px-4 py-3">
        <h2 class="mb-2 text-xs font-medium">{{ t('analytics.findings') }}</h2>
        <ul class="flex flex-col gap-2 text-xs leading-5 text-muted-foreground"><li v-for="insight in insights" :key="insight.key"><button type="button" class="flex items-start gap-2 text-left hover:text-foreground" @click="chooseMetric(insight.target)"><span class="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" />{{ insight.text }}</button></li></ul>
      </section>

      <section ref="detailsPanel" class="workspace-card overflow-hidden bg-card/40">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <div class="flex gap-1" role="group" :aria-label="t('analytics.details')"><button v-for="tab in ['backlog','plans','daily'] as const" :key="tab" type="button" :aria-pressed="detail===tab" :class="['rounded-lg px-3 py-1.5 text-xs transition-colors', detail===tab ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground']" @click="detail=tab; limit=12">{{ t(`analytics.${tab}`) }}</button></div>
          <span class="text-[11px] text-muted-foreground">{{ detail==='daily' ? (selectedDay ? formatDate(selectedDay) : dateLabel) : t('analytics.currentState') }}</span>
        </header>
        <template v-if="detail==='backlog'">
          <div class="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <button v-for="(bucket,index) in buckets" :key="bucket.min" type="button" :aria-pressed="ageFilter===index" :class="['rounded-xl border px-3 py-2.5 text-left transition-colors', ageFilter===index ? 'border-primary/40 bg-primary/5' : 'border-border/60 hover:bg-muted/40']" @click="ageFilter=ageFilter===index ? null : index; limit=12">
              <span class="text-[11px] text-muted-foreground">{{ t(`analytics.age${index}`) }}</span><span class="mt-1 block text-sm font-semibold tabular-nums">{{ bucket.count }}</span><span class="mt-2 block h-1 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-primary/60" :style="{width:`${bucket.count/Math.max(1,...buckets.map(b=>b.count))*100}%`}" /></span>
            </button>
          </div>
        </template>
        <div v-if="detail==='plans'" class="grid gap-3 border-b border-border/50 p-4 sm:grid-cols-2">
          <div v-for="period in periods" :key="period.key"><div class="mb-1.5 flex justify-between text-xs"><span>{{ t(`dashboard.home.periods.${period.key}`) }}</span><span class="text-muted-foreground">{{ t('analytics.planCompleted',{done:period.done,total:period.total}) }}</span></div><div class="flex h-1.5 overflow-hidden rounded-full bg-muted"><span class="bg-primary/65" :style="{width:`${period.done/Math.max(1,period.total)*100}%`}" /><span class="bg-amber-500/55" :style="{width:`${period.carried/Math.max(1,period.total)*100}%`}" /></div></div>
          <p class="text-[11px] text-muted-foreground sm:col-span-2">{{ t('analytics.planLegend') }}</p>
        </div>
        <div v-if="detail==='daily'" class="overflow-x-auto">
          <table class="w-full text-left text-xs"><caption class="sr-only">{{ t('analytics.daily') }}</caption><thead class="text-muted-foreground"><tr><th v-for="key in ['day','focus','created','completed','reopened','deleted','pending']" :key="key" class="whitespace-nowrap px-4 py-3 font-normal">{{ t(`analytics.${key}`) }}</th></tr></thead><tbody><tr v-for="day in visibleDays" :key="day.day" class="border-t border-border/40 hover:bg-muted/30"><td class="whitespace-nowrap px-4 py-3">{{ formatDate(day.day) }}</td><td class="px-4 py-3 tabular-nums">{{ knownDay(day.day) || day.seconds>0 ? `${Math.round(Number(day.seconds)/60)} ${t('analytics.minShort')}` : '—' }}</td><td v-for="key in ['created','completed','reopened','deleted','pending'] as const" :key="key" class="px-4 py-3 tabular-nums">{{ knownDay(day.day) ? day[key] ?? '—' : '—' }}</td></tr></tbody></table>
          <button v-if="selectedDay" type="button" class="m-4 text-xs text-primary" @click="selectedDay=null">{{ t('analytics.allDays') }}</button>
        </div>
        <template v-else>
          <ul v-if="detailItems.length" class="divide-y divide-border/40 px-4">
            <li v-for="item in detailItems.slice(0,limit)" :key="`${item.module}:${item.record_id}`" class="flex items-center justify-between gap-4 py-3"><div class="min-w-0"><p class="truncate text-sm">{{ item.title || t('analytics.untitled') }}</p><p class="mt-1 text-[11px] text-muted-foreground">{{ moduleLabel(item.module) }} · {{ t('analytics.daysOld',{count:itemAge(item,today,timezone)}) }}<span v-if="item.carry_count"> · {{ t('analytics.carriedTimes',{count:item.carry_count}) }}</span></p></div><button type="button" class="analytics-icon shrink-0" :disabled="!canOpen(item)" :title="!canOpen(item) ? t('analytics.unavailableModule') : undefined" :aria-label="t('analytics.openModule',{module:moduleLabel(item.module)})" @click="openItem(item)"><ArrowUpRight class="h-3.5 w-3.5" /></button></li>
          </ul>
          <p v-else class="p-6 text-center text-xs text-muted-foreground">{{ t(detail==='plans' ? 'analytics.plansEmpty' : 'analytics.backlogEmpty') }}</p>
          <button v-if="detailItems.length>limit" type="button" class="w-full border-t border-border/40 py-3 text-xs text-muted-foreground hover:text-foreground" @click="limit+=12">{{ t('analytics.more',{count:detailItems.length-limit}) }}</button>
        </template>
      </section>
      <p class="text-[11px] leading-5 text-muted-foreground">{{ t('analytics.privacy') }}</p>
    </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ArrowUpRight, Clock3, Download, Info, ListTodo, RefreshCw, Repeat2, Timer } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import AnalyticsChart from '@/features/analytics/components/AnalyticsChart.vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useSettingsStore } from '@/stores/settings'
import { useAnalyticsReport } from '@/features/analytics/composables/useAnalyticsReport'
import { ageBuckets, comparisonAvailable, itemAge, localDay, percentChange, reportRange, totals, type AnalyticsItem, type DatePreset } from '@/features/analytics/lib/reports'
const emit=defineEmits<{'enter-workspace':[id:string]}>()
const {t,locale}=useI18n(),workspaces=useWorkspacesStore(),settings=useSettingsStore()
const FinanceReport=defineAsyncComponent(()=>import('@/features/finance/components/FinanceReport.vue'))
const props=defineProps<{initialSection?:'activity'|'finance'}>()
const section=ref<'activity'|'finance'>(props.initialSection || 'activity'),activityEnabled=computed(()=>section.value==='activity')
const workspace=ref(workspaces.activeId),preset=ref<DatePreset>('week'),personal=ref(true)
const timezone=ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
const today=computed(()=>localDay(new Date(),timezone.value))
const initial=reportRange('week',timezone.value),from=ref(initial.from),to=ref(initial.to)
const {report,previous,status,error,refreshing,pending,storageFailed,load}=useAnalyticsReport({workspace,preset,from,to,personal,timezone,enabled:activityEnabled})
const workspaceOptions=computed(()=>[...(section.value==='finance'?[]:[{value:'',label:t('analytics.allWorkspaces')}]),...workspaces.items.map(w=>({value:w.id,label:w.name+(w.archived_at ? ` · ${t('analytics.archived')}` : '')}))])
watch(section,value=>{if(value==='finance' && !workspace.value)workspace.value=workspaces.activeId})
const presetOptions=computed(()=>['week','month','custom'].map(value=>({value,label:t(`analytics.${value}`)})))
const formatDate=(day:string)=>new Date(`${day}T12:00:00Z`).toLocaleDateString(locale.value,{day:'numeric',month:'short',timeZone:'UTC'})
const dateLabel=computed(()=>report.value ? `${formatDate(report.value.date_from)} – ${formatDate(report.value.date_to)}` : '')
const recordingLabel=computed(()=>report.value ? new Date(report.value.recording_started_at).toLocaleString(locale.value,{timeZone:timezone.value,dateStyle:'medium',timeStyle:'short'}) : '')
const fullCoverage=computed(()=>report.value ? comparisonAvailable(report.value) : false)
const knownDay=(day:string)=>Boolean(report.value && day>=localDay(new Date(report.value.recording_started_at),timezone.value))
const historyKnown=computed(()=>report.value ? knownDay(report.value.date_to) : false)
const sum=computed(()=>report.value ? totals(report.value) : {seconds:0,created:0,completed:0,reopened:0,deleted:0})
const comparison=computed(()=>previous.value && comparisonAvailable(previous.value) ? totals(previous.value) : null)
const focusDelta=computed(()=>comparison.value ? percentChange(sum.value.seconds,comparison.value.seconds) : null)
const openItems=computed(()=>report.value?.items.filter(i=>!i.completed) || [])
const oldItems=computed(()=>openItems.value.filter(i=>itemAge(i,today.value,timezone.value)>30))
const carried=computed(()=>openItems.value.filter(i=>i.module==='plans' && i.carry_count>0))
const duration=(seconds:number)=>`${Math.floor(Math.round(seconds/60)/60)} ${t('analytics.hourShort')} ${Math.round(seconds/60)%60} ${t('analytics.minShort')}`
const focusAllocation=computed(()=>{
  const allocation=report.value?.focus_breakdown
  if(!allocation)return []
  const total=Object.values(allocation).reduce((sum,seconds)=>sum+Number(seconds||0),0)
  return (['task','free','unavailable'] as const).filter(key=>Number(allocation[key])>0).map(key=>({key,seconds:Number(allocation[key]),share:total?Number(allocation[key])/total*100:0,
    label:t(`pomoNotes.${key==='task'?'linkedFocus':key==='free'?'freeFocus':'unknownFocus'}`)}))
})
const metrics=computed(()=>[
  {key:'focus',label:t('analytics.recordedFocus'),icon:Timer,value:historyKnown.value || sum.value.seconds>0 ? duration(sum.value.seconds) : '—',hint:focusDelta.value===null ? t('analytics.focusHint') : t('analytics.comparison',{value:`${focusDelta.value>0 ? '+' : ''}${focusDelta.value}%`})},
  {key:'daily',label:t('analytics.completed'),icon:ListTodo,value:historyKnown.value ? sum.value.completed : '—',hint:t('analytics.uniqueHint')},
  {key:'backlog',label:t('analytics.olderThan30'),icon:Clock3,value:oldItems.value.length,hint:t('analytics.currentState')},
  {key:'plans',label:t('analytics.carried'),icon:Repeat2,value:carried.value.length,hint:t('analytics.carriedHint')},
])
const selectedDay=ref<string|null>(null),detail=ref<'backlog'|'plans'|'daily'>('backlog'),ageFilter=ref<number|null>(null),limit=ref(12)
const focusPanel=ref<HTMLElement>(),detailsPanel=ref<HTMLElement>()
watch(()=>[workspace.value,preset.value,from.value,to.value,personal.value],()=>{selectedDay.value=null;ageFilter.value=null;limit.value=12})
const focusRows=computed(()=>report.value?.daily.map((d,index)=>({day:d.day,current:knownDay(d.day) || d.seconds>0 ? Number(d.seconds)/60 : null,previous:comparison.value ? Number(previous.value?.daily[index]?.seconds || 0)/60 : null})) || [])
const focusSeries=computed(()=>[...(comparison.value ? [{key:'previous',label:t('analytics.previousPeriod'),color:'hsl(var(--muted-foreground) / .25)'}] : []),{key:'current',label:t('analytics.selectedPeriod'),color:'hsl(var(--primary))'}])
const taskRows=computed(()=>report.value?.daily.map(d=>({day:d.day,created:knownDay(d.day) ? d.created : null,completed:knownDay(d.day) ? d.completed : null,pending:d.pending})) || [])
const taskSeries=computed(()=>[{key:'created',label:t('analytics.created'),color:'hsl(var(--muted-foreground) / .35)'},{key:'completed',label:t('analytics.completed'),color:'hsl(var(--primary))'},{key:'pending',label:t('analytics.pending'),color:'hsl(var(--foreground) / .65)',type:'line' as const}])
const buckets=computed(()=>ageBuckets(report.value?.items || [],today.value,timezone.value))
const detailItems=computed(()=>{
  const items=detail.value==='plans' ? carried.value : openItems.value
  return [...items].filter(i=>detail.value!=='backlog' || ageFilter.value===null || (itemAge(i,today.value,timezone.value)>=buckets.value[ageFilter.value].min && itemAge(i,today.value,timezone.value)<=buckets.value[ageFilter.value].max)).sort((a,b)=>a.item_created_at.localeCompare(b.item_created_at))
})
const periods=computed(()=>['daily','weekly','monthly','yearly'].map(key=>{const items=report.value?.items.filter(i=>i.module==='plans' && i.period===key) || [];return {key,total:items.length,done:items.filter(i=>i.completed).length,carried:items.filter(i=>!i.completed && i.carry_count>0).length}}))
const visibleDays=computed(()=>report.value?.daily.filter(d=>!selectedDay.value || d.day===selectedDay.value) || [])
const insights=computed(()=>{
  const list=[]
  if (historyKnown.value && sum.value.created>sum.value.completed) list.push({key:'flow',target:'daily',text:t('analytics.flowFinding',{created:sum.value.created,completed:sum.value.completed})})
  if (oldItems.value.length) list.push({key:'age',target:'backlog',text:t('analytics.ageFinding',{count:oldItems.value.length,days:Math.max(...oldItems.value.map(i=>itemAge(i,today.value,timezone.value)))})})
  if (carried.value.length) list.push({key:'carry',target:'plans',text:t('analytics.carryFinding',{count:carried.value.length})})
  return list.slice(0,3)
})
const moduleLabel=(module:string)=>t(module==='pomodoro'?'pomoNotes.tab':`workspace.modules.${module}Name`)
function scroll(panel?:HTMLElement) {panel?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})}
function chooseMetric(key:string) {if(key==='focus'){scroll(focusPanel.value);return}detail.value=key as 'backlog'|'plans'|'daily';ageFilter.value=null;limit.value=12;scroll(detailsPanel.value)}
function selectDay(day:string) {selectedDay.value=selectedDay.value===day ? null : day;detail.value='daily'}
function canOpen(item:AnalyticsItem) {return workspaces.available.some(w=>w.id===(item.workspace_id || workspace.value) && w.active_modules.includes(item.module))}
function openItem(item:AnalyticsItem) {
  if(!canOpen(item))return
  const wid=item.workspace_id || workspace.value
  if(wid!==workspaces.activeId)workspaces.switchTo(wid)
  emit('enter-workspace',item.module)
}
function exportReport() {
  if(!report.value)return
  const lines=['day,focus_seconds,created,completed_unique,reopened,deleted,pending']
  for(const d of report.value.daily) lines.push([d.day,knownDay(d.day) || d.seconds>0 ? d.seconds : '',...(knownDay(d.day) ? [d.created,d.completed,d.reopened,d.deleted,d.pending ?? ''] : ['','','','',''])].join(','))
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}))
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`analytics-${report.value.date_from}-${report.value.date_to}.csv`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
</script>

<style scoped>
.analytics-icon { display:flex; align-items:center; justify-content:center; height:2rem; width:2rem; border-radius:.65rem; color:hsl(var(--muted-foreground)); transition:background 150ms,color 150ms; }
.analytics-icon:hover { background:hsl(var(--muted)/.6);color:hsl(var(--foreground)); }
.analytics-icon:disabled { opacity:.4; }
.analytics-date { height:2rem; max-width:10rem; padding:0 .6rem; border:1px solid hsl(var(--border)/.6); border-radius:.65rem; background:hsl(var(--card)/.6); color:hsl(var(--foreground)); color-scheme:light; }
:global(.dark) .analytics-date { color-scheme:dark; }
button:focus-visible,.analytics-date:focus-visible { outline:2px solid hsl(var(--primary)/.45);outline-offset:3px; }
section { scroll-margin-top:7rem; }
@media(prefers-reduced-motion:reduce) { * {transition:none !important;} }
</style>
