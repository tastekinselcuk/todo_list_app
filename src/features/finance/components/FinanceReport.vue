<template>
  <section class="space-y-4" :aria-label="t('finance.analysis')">
    <div class="flex flex-wrap items-center justify-between gap-2"><p class="text-xs text-muted-foreground">{{ t('finance.analysisHint') }}</p><input v-model="month" type="month" min="1900-01" max="2100-12" :aria-label="t('finance.month')" class="finance-input !h-8 !w-36 !text-xs" /></div>
    <p v-if="error" class="workspace-card bg-card/40 p-4 text-sm" role="alert">{{ t(`finance.${error}`) }}<button type="button" class="ml-2 text-primary" @click="load">{{ t('finance.refresh') }}</button></p>
    <div v-else-if="!summary" class="workspace-card h-40 animate-pulse bg-muted/30 motion-reduce:animate-none" role="status" :aria-label="t('app.loading')" />
    <template v-else>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4"><div v-for="metric in metrics" :key="metric.label" class="workspace-card min-w-0 bg-card/40 p-4"><span class="text-xs text-muted-foreground">{{ metric.label }}</span><strong class="mt-2 block truncate text-lg font-semibold tabular-nums">{{ formatMoney(metric.value) }}</strong></div></div>
      <div class="workspace-card bg-card/40 p-4"><div class="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 class="text-sm font-medium">{{ t('finance.monthlyFlow') }}</h2><span class="text-[11px] text-muted-foreground">{{ t('finance.lastTwelve') }} · {{ summary.currency }}</span></div><AnalyticsChart :rows="rows" :series="series" :label="t('finance.monthlyFlow')" :format-value="compactMoney" @select="selectMonth" /></div>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div class="workspace-card bg-card/40 p-4">
          <h2 class="text-sm font-medium">{{ t('finance.categorySpending') }}</h2>
          <p v-if="!summary.categories.length" class="py-8 text-center text-xs text-muted-foreground">{{ t('finance.noChartData') }}</p>
          <div v-else class="mt-4 space-y-4">
            <button v-for="category in summary.categories" :key="category.category_id || 'uncategorized'" type="button" class="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" @click="selectCategory(category.category_id || 'uncategorized')">
              <span class="mb-2 flex justify-between gap-3 text-xs"><span class="min-w-0 truncate">{{ category.category || t('finance.uncategorized') }}</span><span class="shrink-0 tabular-nums">{{ formatMoney(category.amount) }}</span></span>
              <span class="block h-1.5 overflow-hidden rounded-full bg-muted/60"><span class="block h-full rounded-full bg-primary/60" :style="{width:`${Number(summary.expense)>0?Number(category.amount)/Number(summary.expense)*100:0}%`}" /></span>
            </button>
          </div>
        </div>
        <div v-for="chart in distributions" :key="chart.title" class="workspace-card bg-card/40 p-4">
          <h2 class="text-sm font-medium">{{ chart.title }}</h2>
          <p v-if="!chart.items.length" class="py-8 text-center text-xs text-muted-foreground">{{ t('finance.noChartData') }}</p>
          <div v-else class="mt-4 flex flex-wrap items-center gap-5">
            <svg viewBox="0 0 120 120" class="h-28 w-28 shrink-0 -rotate-90" role="img" :aria-label="chart.title"><title>{{ chart.title }}</title><circle cx="60" cy="60" r="44" fill="none" stroke="hsl(var(--muted))" stroke-width="13" /><circle v-for="(item,index) in chart.items" :key="index" cx="60" cy="60" r="44" fill="none" :stroke="chartColors[index%chartColors.length]" stroke-width="13" pathLength="100" :stroke-dasharray="`${item.share} ${100-item.share}`" :stroke-dashoffset="-chart.items.slice(0,index).reduce((sum,row)=>sum+row.share,0)"><title>{{ item.label }}: {{ formatMoney(item.amount) }} · {{ item.share.toFixed(1) }}%</title></circle></svg>
            <ul class="min-w-0 flex-1 space-y-2"><li v-for="(item,index) in chart.items" :key="item.label" class="flex items-center gap-2 text-xs"><span class="h-2 w-2 shrink-0 rounded-full" :style="{backgroundColor:chartColors[index%chartColors.length]}" /><span class="min-w-0 flex-1 break-words">{{ item.label }}</span><span class="shrink-0 tabular-nums">{{ formatMoney(item.amount) }}</span><span class="w-10 shrink-0 text-right text-[11px] text-muted-foreground">{{ Math.round(item.share) }}%</span></li></ul>
          </div>
        </div>
      </div>
      <section v-if="selectedCategory" class="workspace-card bg-card/30 p-4" :aria-label="t('finance.categoryTransactions')">
        <div class="mb-3 flex items-center justify-between gap-3"><h3 class="text-sm font-medium">{{ selectedCategoryName }}</h3><button type="button" class="text-xs text-muted-foreground hover:underline" @click="closeCategory">{{ t('finance.closeDetails') }}</button></div>
        <p v-if="detailLoading" role="status" class="text-xs text-muted-foreground">{{ t('app.loading') }}</p>
        <p v-if="detailError" role="alert" class="text-xs text-destructive">{{ t(`finance.${detailError}`) }} <button type="button" class="underline" @click="loadCategory(false)">{{ t('finance.refresh') }}</button></p>
        <ul class="divide-y divide-border/40"><li v-for="row in detailRows" :key="row.id" class="flex justify-between gap-3 py-2.5 text-sm"><span class="min-w-0"><span class="block truncate">{{ ['income','expense'].includes(row.title)?t(`finance.${row.kind}`):row.title }}</span><time class="text-xs text-muted-foreground" :datetime="row.occurred_on">{{ new Date(`${row.occurred_on}T12:00:00Z`).toLocaleDateString(locale,{timeZone:'UTC'}) }}</time></span><span class="shrink-0 tabular-nums">{{ formatMoney(row.amount) }}</span></li></ul>
        <button v-if="detailMore" type="button" class="mt-3 text-xs underline underline-offset-4" :disabled="detailLoading" @click="loadCategory(true)">{{ t('finance.more') }}</button>
      </section>
      <div class="workspace-card bg-card/30 p-4 text-xs leading-6 text-muted-foreground"><p>{{ t('finance.cashInsight',{rate:expenseRatio}) }}</p><p>{{ t('finance.portfolioInsight',{value:formatMoney(summary.portfolio.cost),gain:formatMoney(summary.portfolio.gain)}) }}</p><p v-if="summary.portfolio.missing || summary.portfolio.stale">{{ t('finance.coverageHint',{missing:summary.portfolio.missing,stale:summary.portfolio.stale}) }}</p><p>{{ t('finance.valuationHint') }}</p></div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AnalyticsChart from '@/features/analytics/components/AnalyticsChart.vue'
import { supabase } from '@/lib/supabase'
import { useWorkspacesStore } from '@/stores/workspaces'
import { financeError, financeMonths, localFinanceDay, money, validFinanceDate, type FinanceSummary, type FinanceTransaction } from '../lib/finance'
const props=defineProps<{workspaceId:string;initialMonth?:string}>(),{t,locale}=useI18n(),workspaces=useWorkspacesStore()
const month=ref(props.initialMonth && validFinanceDate(`${props.initialMonth}-01`)?props.initialMonth:localFinanceDay().slice(0,7)),summary=ref<FinanceSummary|null>(null),error=ref('')
watch(()=>props.initialMonth,value=>{if(value && validFinanceDate(`${value}-01`))month.value=value})
let generation=0,disposed=false
const selectedCategory=ref(''),detailRows=ref<FinanceTransaction[]>([]),detailMore=ref(false),detailLoading=ref(false),detailError=ref('')
let detailGeneration=0,detailCursor:{date:string;id:string}|null=null
const selectedCategoryName=computed(()=>summary.value?.categories.find(row=>(row.category_id || 'uncategorized')===selectedCategory.value)?.category || t('finance.uncategorized'))
function closeCategory(){detailGeneration++;selectedCategory.value='';detailRows.value=[];detailMore.value=false;detailLoading.value=false;detailError.value='';detailCursor=null}
function selectCategory(id:string){closeCategory();selectedCategory.value=id;void loadCategory(false)}
async function loadCategory(append:boolean){
 const request=++detailGeneration,owner=workspaces.userId,wid=props.workspaceId,category=selectedCategory.value
 if(!category)return
 detailLoading.value=true;detailError.value=''
 try{
  const result=await supabase.rpc('finance_query',{wid,month_start:`${month.value}-01`,filters:{category,kind:'expense'},after_date:append?detailCursor?.date:undefined,after_id:append?detailCursor?.id:undefined}).abortSignal(AbortSignal.timeout(20_000))
  if(disposed||request!==detailGeneration||owner!==workspaces.userId||wid!==props.workspaceId)return
  if(result.error)throw result.error
  detailRows.value=append?[...detailRows.value,...result.data.items]:result.data.items;detailMore.value=result.data.has_more;detailCursor=result.data.cursor
 }catch(failure){if(!disposed&&request===detailGeneration)detailError.value=financeError(failure)}
 finally{if(request===detailGeneration)detailLoading.value=false}
}
async function load() {
  const request=++generation,owner=workspaces.userId,wid=props.workspaceId
  summary.value=null;error.value=''
  if(!wid){error.value='selectWorkspace';return}
  if(!validFinanceDate(`${month.value}-01`)){error.value='invalidInput';return}
  try {
    const result=await supabase.rpc('finance_summary',{wid,month_start:`${month.value}-01`}).abortSignal(AbortSignal.timeout(20_000))
    if(disposed || request!==generation || owner!==workspaces.userId)return
    if(result.error)throw result.error
    summary.value=result.data
  } catch(failure){if(!disposed && request===generation)error.value=financeError(failure)}
}
watch(()=>[props.workspaceId,workspaces.userId,month.value],()=>{closeCategory();void load()},{immediate:true})
onBeforeUnmount(()=>{disposed=true;generation++})
const formatMoney=(value:number|null)=>money(value,summary.value?.currency || 'TRY',locale.value)
const compactMoney=(value:number)=>new Intl.NumberFormat(locale.value,{notation:'compact',maximumFractionDigits:1}).format(value)
const expenseRatio=computed(()=>summary.value && Number(summary.value.income)>0?`${Math.round(Number(summary.value.expense)/Number(summary.value.income)*100)}%`:'—')
const rows=computed(()=>financeMonths(month.value).map(day=>({day,income:Number(summary.value?.monthly.find(row=>row.day===day)?.income || 0),expense:Number(summary.value?.monthly.find(row=>row.day===day)?.expense || 0)})))
const series=computed(()=>[{key:'income',label:t('finance.income'),color:'hsl(var(--primary))'},{key:'expense',label:t('finance.expense'),color:'hsl(var(--muted-foreground) / .65)'}])
const metrics=computed(()=>{
  const s=summary.value!
  return [{label:t('finance.income'),value:s.income},{label:t('finance.expense'),value:s.expense},{label:t('finance.periodNet'),value:Number(s.income)-Number(s.expense)},
    {label:t(s.portfolio.missing?'finance.knownValue':'finance.currentValue'),value:s.portfolio.count?s.portfolio.value:0}]
})
const chartColors=['hsl(var(--primary))','#64748b','#0d9488','#a78bfa','#d97706','#e87994']
const distributions=computed(()=>{
  const s=summary.value!
  function split(items:{label:string;amount:number}[]) {
    const positive=items.filter(item=>Number(item.amount)>0).map(item=>({...item,amount:Number(item.amount)})),total=positive.reduce((sum,item)=>sum+item.amount,0)
    // Bound legend size while preserving the exact sum in the remaining slice.
    const top=positive.slice(0,5),rest=positive.slice(5).reduce((sum,item)=>sum+item.amount,0)
    if(rest)top.push({label:t('finance.other'),amount:rest})
    return top.map(item=>({...item,share:item.amount/total*100}))
  }
  return [{title:t('finance.assetDistribution'),items:split(s.allocation.map(row=>({label:t(`finance.${row.kind}`),amount:row.amount})))}]
})
function selectMonth(day:string){month.value=day.slice(0,7)}
</script>
