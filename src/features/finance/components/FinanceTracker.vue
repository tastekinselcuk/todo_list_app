<template>
  <div class="workspace-content space-y-4" style="--workspace-content-limit: 72rem">
    <FinanceEntryForm :key="editing?.id || editingSchedule?.id || draftId" :entity="tab" :record="editing" :schedule="editingSchedule" :currency="store.summary?.currency || 'TRY'" :draft-id="draftId" @cancel="resetForm" @saved="resetForm" />

    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
      <div class="flex items-center gap-1" role="group" :aria-label="t('finance.title')">
        <button v-for="view in ['transaction','position'] as const" :key="view" type="button" :aria-pressed="tab===view" :disabled="store.saving" class="inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors" :class="tab===view?'bg-background text-foreground shadow-sm ring-1 ring-border/50':'text-muted-foreground hover:bg-background/40 hover:text-foreground'" @click="changeTab(view)"><component :is="view==='transaction'?ArrowLeftRight:TrendingUp" class="h-3.5 w-3.5" />{{ t(view==='transaction'?'finance.cashflow':'finance.positions') }}</button>
      </div>
      <div class="flex items-center gap-1.5">
        <input v-if="tab==='transaction'" v-model="store.month" type="month" min="1900-01" max="2100-12" :aria-label="t('finance.month')" class="finance-input !h-8 !w-36 !text-xs" :disabled="store.saving" />
        <CustomSelect v-if="store.summary" :model-value="store.summary.currency" :options="currencyOptions" :aria-label="t('finance.currency')" :disabled="store.summary.locked_currency || store.saving" :title="t('finance.currencyHint')" size="sm" class="w-20" @update:model-value="changeCurrency" />
        <button v-if="openAnalysis" type="button" class="finance-icon" :title="t('finance.analysis')" :aria-label="t('finance.analysis')" @click="openAnalysis"><TrendingUp class="h-3.5 w-3.5" /></button>
        <button type="button" class="finance-icon" :disabled="store.loading || store.pricing || store.saving" :title="t(tab==='position'?'finance.refreshPrices':'finance.refresh')" :aria-label="t(tab==='position'?'finance.refreshPrices':'finance.refresh')" @click="refresh"><RefreshCw class="h-3.5 w-3.5" :class="(store.loading || store.pricing) && 'animate-spin motion-reduce:animate-none'" /></button>
      </div>
    </div>

    <p v-if="store.status==='setup'" role="status" class="text-xs text-muted-foreground">{{ t('finance.setup') }}</p>
    <template v-else-if="store.summary">
      <div class="flex flex-wrap gap-x-7 gap-y-2 px-1 text-xs">
        <div v-for="metric in metrics" :key="metric.label" class="flex items-baseline gap-2"><span class="text-[11px] text-muted-foreground">{{ metric.label }}</span><strong class="font-semibold tabular-nums" :class="metric.color">{{ metric.value }}</strong></div>
      </div>

      <template v-if="tab==='transaction'">
        <details v-if="store.summary.schedules?.length" class="group workspace-card bg-card/20 px-3 py-2.5">
          <summary class="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden"><Repeat2 class="h-3.5 w-3.5" /><span>{{ t('finance.schedules') }}</span><span class="text-[10px]">{{ store.summary.schedules.length }}</span><ChevronDown class="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
          <div class="mt-3 space-y-1 border-t border-border/40 pt-2">
            <article v-for="row in store.summary.schedules" :key="row.id" class="flex items-center gap-3 rounded-lg px-1 py-2" :class="!row.active && 'opacity-60'">
              <div class="min-w-0 flex-1"><p class="truncate text-xs font-medium text-foreground">{{ entryName(row) }}</p><p class="mt-0.5 text-[10px] text-muted-foreground">{{ t(`finance.${row.cadence}`) }} · {{ row.active?t('finance.nextOccurrence',{date:shortDate(row.next_on)}):t('finance.paused') }}</p></div>
              <span class="text-xs font-medium tabular-nums" :class="row.kind==='income'?'text-emerald-700 dark:text-emerald-400':''">{{ row.kind==='income'?'+':'−' }}{{ formatMoney(row.amount) }}</span>
              <div class="flex shrink-0 gap-0.5">
                <button type="button" class="finance-icon !h-7 !w-7" :disabled="store.saving" :title="t('common.edit')" :aria-label="`${t('common.edit')}: ${entryName(row)}`" @click="editSchedule(row)"><Pencil class="h-3.5 w-3.5" /></button>
                <button type="button" class="finance-icon !h-7 !w-7" :disabled="store.saving" :title="t(row.active?'finance.pause':'finance.resume')" :aria-label="t(row.active?'finance.pause':'finance.resume')" @click="store.mutateSchedule(row.active?'pause':'resume',row.id,{},row.version)"><Pause v-if="row.active" class="h-3.5 w-3.5" /><Play v-else class="h-3.5 w-3.5" /></button>
                <button type="button" class="finance-icon !h-7 !w-7 hover:!text-destructive" :disabled="store.saving" :title="t('finance.deleteSchedule')" :aria-label="`${t('finance.deleteSchedule')}: ${entryName(row)}`" @click="removeSchedule(row)"><Trash2 class="h-3.5 w-3.5" /></button>
              </div>
            </article>
            <p class="pt-1 text-[10px] text-muted-foreground">{{ t('finance.scheduleHint') }}</p>
          </div>
        </details>
        <div class="space-y-2">
          <article v-for="row in store.transactions" :key="row.id" class="workspace-card flex items-center gap-3 bg-card/30 px-3.5 py-3 transition-colors hover:bg-background/40">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" :class="row.kind==='income'?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400':'bg-muted/40 text-muted-foreground'"><ArrowDownLeft v-if="row.kind==='income'" class="h-3.5 w-3.5" /><ArrowUpRight v-else class="h-3.5 w-3.5" /></span>
            <div class="min-w-0 flex-1"><p class="flex items-center gap-1.5 text-xs font-medium"><span class="truncate">{{ entryName(row) }}</span><Repeat2 v-if="row.recurring_id" class="h-3 w-3 shrink-0 text-muted-foreground" :aria-label="t('finance.recurringEntry')" /></p><time :datetime="row.occurred_on" class="mt-0.5 block text-[10px] text-muted-foreground">{{ shortDate(row.occurred_on) }}</time></div>
            <span class="shrink-0 text-sm font-medium tabular-nums" :class="row.kind==='income'?'text-emerald-700 dark:text-emerald-400':'text-foreground'">{{ row.kind==='income'?'+':'−' }}{{ formatMoney(row.amount) }}</span>
            <div class="flex shrink-0 gap-0.5"><button type="button" class="finance-icon !h-7 !w-7" :disabled="store.saving" :aria-label="`${t('common.edit')}: ${entryName(row)}`" @click="edit(row)"><Pencil class="h-3.5 w-3.5" /></button><button type="button" class="finance-icon !h-7 !w-7 hover:!text-destructive" :disabled="store.saving" :aria-label="`${t('common.delete')}: ${entryName(row)}`" @click="remove(row)"><Trash2 class="h-3.5 w-3.5" /></button></div>
          </article>
        </div>
      </template>
      <template v-else>
        <p v-if="store.priceIssue || store.summary.portfolio.missing || store.summary.portfolio.stale" role="status" class="text-[11px] leading-5 text-muted-foreground">{{ store.priceIssue?t(`finance.${store.priceIssue}`):'' }} {{ store.summary.portfolio.missing?t('finance.missingPrices',{count:store.summary.portfolio.missing}):'' }} {{ store.summary.portfolio.stale?t('finance.stalePrices',{count:store.summary.portfolio.stale}):'' }}</p>
        <div class="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          <article v-for="row in store.positions" :key="row.id" class="workspace-card min-w-0 space-y-3 bg-card/30 p-3.5 transition-colors hover:bg-background/40">
            <div class="flex items-start gap-3"><div class="min-w-0 flex-1"><h3 class="truncate text-sm font-medium">{{ positionName(row) }}</h3><p class="mt-0.5 text-[10px] text-muted-foreground">{{ Number(row.quantity).toLocaleString(locale,{maximumFractionDigits:8}) }} {{ unitName(row) }} · {{ shortDate(row.purchased_on) }}</p></div><div class="flex shrink-0 gap-0.5"><button type="button" class="finance-icon !h-7 !w-7" :disabled="store.saving" :aria-label="`${t('common.edit')}: ${positionName(row)}`" @click="edit(row)"><Pencil class="h-3.5 w-3.5" /></button><button type="button" class="finance-icon !h-7 !w-7 hover:!text-destructive" :disabled="store.saving" :aria-label="`${t('common.delete')}: ${positionName(row)}`" @click="remove(row)"><Trash2 class="h-3.5 w-3.5" /></button></div></div>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><div><dt class="text-[10px] text-muted-foreground">{{ t('finance.buyPrice') }}</dt><dd class="mt-0.5 tabular-nums">{{ formatMoney(row.buy_price) }}</dd></div><div><dt class="text-[10px] text-muted-foreground">{{ t('finance.currentPrice') }}</dt><dd class="mt-0.5 tabular-nums">{{ formatMoney(row.price) }}</dd></div><div><dt class="text-[10px] text-muted-foreground">{{ t('finance.currentValue') }}</dt><dd class="mt-0.5 font-medium tabular-nums">{{ formatMoney(row.current_value) }}</dd></div><div><dt class="text-[10px] text-muted-foreground">{{ t('finance.unrealizedGain') }}</dt><dd class="mt-0.5 font-medium tabular-nums" :class="gainColor(row.gain)">{{ formatMoney(row.gain) }} <span v-if="row.gain_percent!=null" class="ml-1 text-[10px]">({{ Number(row.gain_percent)>0?'+':'' }}{{ Number(row.gain_percent).toLocaleString(locale,{maximumFractionDigits:2}) }}%)</span></dd></div></dl>
            <div class="flex flex-wrap items-center justify-between gap-1 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
              <span class="inline-flex flex-wrap items-center gap-1.5"><a v-if="source(row)" :href="source(row)!.url" target="_blank" rel="noopener noreferrer" class="underline-offset-2 hover:underline">{{ source(row)!.name }}</a><span v-else-if="row.price_source==='manual'">{{ t('finance.manual') }}</span><span v-if="row.quote_info?.market_status==='closed'">{{ t('finance.marketClosed') }}</span><span v-else-if="row.quote_info?.quality==='reference'">{{ t('finance.referencePrice') }}</span><span v-else-if="row.quote_info?.basis==='spot'">{{ t('finance.spotPrice') }}</span><span v-else-if="row.quote_info?.basis==='buy'">{{ t('finance.buyBasis') }}</span><span v-if="row.stale">· {{ t('finance.lastKnown') }}</span></span>
              <time v-if="row.price_at" :datetime="row.price_at">{{ new Date(row.price_at).toLocaleString(locale,{dateStyle:'short',timeStyle:'short'}) }}</time><span v-else>{{ t('finance.noPrice') }}</span>
            </div>
          </article>
        </div>
      </template>
      <p v-if="!(tab==='transaction'?store.transactions.length:store.positions.length) && !store.loading" class="py-7 text-center text-xs text-muted-foreground">{{ t(tab==='transaction'?'finance.emptyTransactions':'finance.emptyPositions') }}</p>
      <button v-if="store.more[tab]" type="button" :disabled="store.paging || store.loading" class="w-full rounded-xl border border-border/60 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50" @click="store.loadMore(tab)">{{ t('finance.more') }}</button>
    </template>
    <div v-else-if="store.loading" class="space-y-2" role="status" :aria-label="t('app.loading')"><div v-for="n in 2" :key="n" class="workspace-card h-16 animate-pulse bg-muted/20 motion-reduce:animate-none" /></div>
  </div>
</template>
<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronDown, TrendingUp, Pause, Pencil, Play, RefreshCw, Repeat2, Trash2 } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import FinanceEntryForm from './FinanceEntryForm.vue'
import { useFinanceStore } from '../stores/finance'
import { financeCurrencies, money, validFinanceDate, openFinanceAnalysisKey, investmentInstrument, quoteSources, type FinanceEntity, type FinanceTransaction, type FinancePosition, type FinanceSchedule } from '../lib/finance'
import { useUIStore } from '@/stores/ui'
import { useWorkspacesStore } from '@/stores/workspaces'
const store=useFinanceStore(),ui=useUIStore(),workspaces=useWorkspacesStore(),{t,locale}=useI18n()
const openAnalysis=inject(openFinanceAnalysisKey)
const tab=ref<FinanceEntity>('transaction'),editing=ref<FinanceTransaction|FinancePosition|null>(null),editingSchedule=ref<FinanceSchedule|null>(null),draftId=ref(crypto.randomUUID())
const currencyOptions=financeCurrencies.map(value=>({value,label:value}))
const formatMoney=(value:number|null)=>money(value,store.summary?.currency || 'TRY',locale.value)
const gainColor=(gain:number|null)=>gain==null?'text-muted-foreground':Number(gain)<0?'text-rose-700 dark:text-rose-400':Number(gain)>0?'text-emerald-700 dark:text-emerald-400':''
const shortDate=(date:string)=>new Date(`${date}T12:00:00Z`).toLocaleDateString(locale.value,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const entryName=(row:{title:string;kind:string})=>['income','expense'].includes(row.title)?t(`finance.${row.kind}`):row.title
const positionName=(row:FinancePosition)=>{const item=investmentInstrument(row);return item && row.price_source!=='manual'?(item.labelKey?t(`finance.${item.labelKey}`):item.label):row.title}
const unitName=(row:FinancePosition)=>{const unit=investmentInstrument(row)?.unit || row.quote_info?.unit;return unit==='g'?t('finance.grams'):unit==='piece'?t('finance.pieces'):t('finance.units')}
const source=(row:FinancePosition)=>quoteSources[row.quote_info?.source || row.price_source]
const metrics=computed(()=>{
 const s=store.summary!
 return tab.value==='transaction'?[
  {label:t('finance.income'),value:formatMoney(s.income),color:'text-emerald-700 dark:text-emerald-400'},
  {label:t('finance.expense'),value:formatMoney(s.expense),color:''},
  {label:t('finance.periodNet'),value:formatMoney(Number(s.income)-Number(s.expense)),color:gainColor(Number(s.income)-Number(s.expense))},
 ]:[{label:t('finance.cost'),value:formatMoney(s.portfolio.cost),color:''},
  {label:t(s.portfolio.missing?'finance.knownValue':'finance.currentValue'),value:formatMoney(s.portfolio.count?s.portfolio.value:0),color:''},
  {label:t('finance.unrealizedGain'),value:formatMoney(s.portfolio.count?s.portfolio.gain:0),color:gainColor(s.portfolio.gain)}]
})
function resetForm(){editing.value=null;editingSchedule.value=null;draftId.value=crypto.randomUUID()}
function edit(row:FinanceTransaction|FinancePosition){resetForm();editing.value=row;store.error=''}
function editSchedule(row:FinanceSchedule){resetForm();editingSchedule.value=row;store.error=''}
function changeTab(view:FinanceEntity){if(store.saving)return;tab.value=view;resetForm();store.error=''}
async function changeCurrency(value:string){if(financeCurrencies.some(code=>code===value))await store.mutate('settings','update',null,{currency:value})}
async function remove(row:FinanceTransaction|FinancePosition) {
 const scope=workspaces.sessionKey,entity=tab.value
 if(!await ui.showConfirm(t('finance.deleteTitle'),t('finance.deleteBody',{title:row.title}),t('common.delete'),t('common.cancel')) || scope!==workspaces.sessionKey)return
 if(await store.mutate(entity,'delete',row.id,{},row.version))resetForm()
}
async function removeSchedule(row:FinanceSchedule) {
 const scope=workspaces.sessionKey
 if(!await ui.showConfirm(t('finance.deleteSchedule'),t('finance.deleteScheduleBody',{title:entryName(row)}),t('common.delete'),t('common.cancel')) || scope!==workspaces.sessionKey)return
 if(await store.mutateSchedule('delete',row.id,{},row.version))resetForm()
}
async function refresh(){await store.load();if(tab.value==='position')await store.refreshPrices()}
watch(()=>store.month,()=>{if(!store.saving && validFinanceDate(`${store.month}-01`))void store.load()})
onMounted(async()=>{if(await store.load())void store.refreshPrices()})
</script>
