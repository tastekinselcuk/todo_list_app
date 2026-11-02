<template>
  <section class="space-y-3" :aria-label="t('finance.transactions')">
    <div class="flex flex-wrap items-center gap-2">

      <CustomSelect :model-value="store.filters.kind" :options="kindOptions" :disabled="store.saving" :aria-label="t('finance.type')" size="sm" class="w-28" @update:model-value="store.setFilters({kind:$event})" />
      <CustomSelect :model-value="store.filters.category" :options="categoryOptions" :disabled="store.saving" :aria-label="t('finance.category')" size="sm" class="w-40 max-w-full" @update:model-value="store.setFilters({category:$event})" />
      <CustomSelect :model-value="store.filters.recurring" :options="repeatOptions" :disabled="store.saving" :aria-label="t('finance.repeat')" size="sm" class="w-32" @update:model-value="store.setFilters({recurring:$event})" />
      <button v-if="store.filtered" type="button" class="finance-icon" :disabled="store.saving" :aria-label="t('finance.clearFilters')" :title="t('finance.clearFilters')" @click="clear"><X class="h-4 w-4" /></button>
    </div>
    <p v-if="store.filtered && !store.loading" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" role="status"><span>{{ t('finance.filteredCount',{count:store.filteredTotals.count}) }}</span><span>{{ t('finance.income') }} {{ format(store.filteredTotals.income) }}</span><span>{{ t('finance.expense') }} {{ format(store.filteredTotals.expense) }}</span><span>{{ t('finance.periodNet') }} {{ format(Number(store.filteredTotals.income)-Number(store.filteredTotals.expense)) }}</span></p>
    <p v-if="store.loading" role="status" class="py-3 text-xs text-muted-foreground">{{ t('app.loading') }}</p>
    <div v-else class="workspace-card bg-card/20">
      <section v-for="group in groups" :key="group.day">
        <h3 class="border-b border-border/40 bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground"><time :datetime="group.day">{{ date(group.day) }}</time></h3>
        <article v-for="row in group.items" :key="row.id" class="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-0 sm:px-4">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2.5 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :disabled="store.saving" :aria-label="`${t('common.edit')}: ${entryName(row)}`" @click="$emit('edit',row)">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" :class="row.kind==='income'?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400':'bg-muted/50 text-muted-foreground'"><ArrowDownLeft v-if="row.kind==='income'" class="h-4 w-4" /><ArrowUpRight v-else class="h-4 w-4" /></span>
            <span class="min-w-0 flex-1"><span class="flex items-center gap-1.5 text-sm font-medium"><span class="truncate">{{ entryName(row) }}</span><Repeat2 v-if="row.recurring_id" class="h-3 w-3 shrink-0 text-muted-foreground" :aria-label="t('finance.recurringEntry')" /></span><span class="mt-1 block truncate text-xs text-muted-foreground">{{ row.category_id?row.category:t('finance.uncategorized') }}</span></span>
            <span class="shrink-0 text-sm font-medium tabular-nums" :class="row.kind==='income'?'text-emerald-700 dark:text-emerald-400':'text-foreground'">{{ row.kind==='income'?'+':'−' }}{{ format(row.amount) }}</span>
          </button>
          <details class="relative shrink-0">
            <summary class="finance-icon cursor-pointer list-none [&::-webkit-details-marker]:hidden" :aria-label="`${t('finance.entryActions')}: ${entryName(row)}`"><MoreHorizontal class="h-4 w-4" /></summary>
            <div class="absolute right-0 top-full z-20 w-36 rounded-xl border border-border bg-card p-1 shadow-lg">
              <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-muted/50" :disabled="store.saving" @click="action($event,'edit',row)">{{ t('common.edit') }}</button>
              <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-xs text-destructive hover:bg-muted/50" :disabled="store.saving" @click="action($event,'remove',row)">{{ t('common.delete') }}</button>
            </div>
          </details>
        </article>
      </section>
      <p v-if="!groups.length" class="px-4 py-8 text-center text-sm text-muted-foreground">{{ t(store.filtered?'finance.noMatches':'finance.emptyTransactions') }}</p>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Repeat2, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useFinanceStore } from '../stores/finance'
import { money, type FinanceTransaction } from '../lib/finance'
const emit=defineEmits<{edit:[row:FinanceTransaction];remove:[row:FinanceTransaction]}>()
const store=useFinanceStore(),{t,locale}=useI18n()
function clear(){void store.setFilters({search:'',kind:'',category:'',recurring:''})}
const kindOptions=computed(()=>[{value:'',label:t('finance.allTypes')},...['expense','income'].map(value=>({value,label:t(`finance.${value}`)}))])
const categoryOptions=computed(()=>[{value:'',label:t('finance.allCategories')},{value:'uncategorized',label:t('finance.uncategorized')},...(store.summary?.budget_categories || []).map(row=>({value:row.id,label:row.name}))])
const repeatOptions=computed(()=>[{value:'',label:t('finance.allEntries')},{value:'yes',label:t('finance.schedules')},{value:'no',label:t('finance.once')}])
const groups=computed(()=>{
 const result:{day:string;items:FinanceTransaction[]}[]=[]
 for(const row of store.transactions){let group=result[result.length-1];if(!group || group.day!==row.occurred_on){group={day:row.occurred_on,items:[]};result.push(group)}group.items.push(row)}
 return result
})
const format=(value:number)=>money(value,store.summary?.currency || 'TRY',locale.value)
const date=(day:string)=>new Date(`${day}T12:00:00Z`).toLocaleDateString(locale.value,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
const entryName=(row:FinanceTransaction)=>['income','expense'].includes(row.title)?t(`finance.${row.kind}`):row.title
function action(event:Event,type:'edit'|'remove',row:FinanceTransaction){(event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');if(type==='edit')emit('edit',row);else emit('remove',row)}
</script>
