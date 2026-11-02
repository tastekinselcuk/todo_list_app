<template>
  <section class="workspace-card overflow-hidden bg-card/30" :aria-label="t('finance.budgets')">
    <div class="flex items-center gap-2 px-4 py-3">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium" :aria-expanded="expanded" @click="expanded=!expanded">
        <ChevronDown class="h-4 w-4 text-muted-foreground transition-transform" :class="!expanded && '-rotate-90'" />
        {{ t('finance.budgets') }}
        <span v-if="overspent" class="ml-auto text-xs font-normal text-rose-700 dark:text-rose-400">{{ t('finance.budgetOverCount',{count:overspent}) }}</span>
      </button>
      <button type="button" class="finance-icon" :disabled="store.loading||store.saving" :aria-label="t('finance.manageBudgets')" :title="t('finance.manageBudgets')" @click="open()"><SlidersHorizontal class="h-4 w-4" /></button>
    </div>
    <div v-if="expanded" class="border-t border-border/50 px-4 pb-3">
      <div v-if="!budgetRows.length" class="flex flex-wrap items-center justify-between gap-2 py-4">
        <p class="text-sm text-muted-foreground">{{ t('finance.budgetEmpty') }}</p>
        <button type="button" class="text-sm font-medium underline underline-offset-4" :disabled="store.loading||store.saving" @click="open()">{{ t('finance.setLimit') }}</button>
      </div>
      <div v-for="row in visibleRows" :key="row.id" class="border-b border-border/40 py-3 last:border-0">
        <div class="flex items-baseline justify-between gap-3">
          <button type="button" class="min-w-0 truncate text-left text-sm font-medium hover:underline focus-visible:underline" :disabled="store.saving||store.loading" @click="$emit('filter',row.id)">{{ row.name }}<span v-if="row.archived" class="ml-1 text-xs font-normal text-muted-foreground">({{ t('finance.archivedCategory') }})</span></button>
          <span class="shrink-0 text-xs tabular-nums" :class="budgetProgress(row.spent,row.budget).state==='over'?'text-rose-700 dark:text-rose-400':'text-muted-foreground'">{{ t(budgetProgress(row.spent,row.budget).state==='over'?'finance.overLimit':'finance.leftInBudget',{amount:format(Math.abs(budgetProgress(row.spent,row.budget).remaining!))}) }}</span>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60" role="meter" :aria-label="row.name" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="budgetProgress(row.spent,row.budget).percent" :aria-valuetext="`${format(row.spent)} / ${format(row.budget)}`">
            <div class="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none" :class="barColor(row)" :style="{width:`${budgetProgress(row.spent,row.budget).percent}%`}" />
          </div>
          <button type="button" class="shrink-0 text-xs tabular-nums text-muted-foreground underline-offset-4 hover:underline" :disabled="store.saving||store.loading" :aria-label="`${t('finance.editLimit')}: ${row.name}`" @click="open(row.id)">{{ format(row.spent) }} / {{ format(row.budget) }}</button>
        </div>
      </div>
      <button v-if="budgetRows.length>4" type="button" class="mt-2 text-xs text-muted-foreground hover:text-foreground" @click="showAll=!showAll">{{ t(showAll?'finance.showLess':'finance.showAllBudgets',{count:budgetRows.length}) }}</button>
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>{{ t('finance.budgetHint') }}</span>
        <span v-if="unbudgeted>0">{{ t('finance.unbudgetedSpend',{amount:format(unbudgeted)}) }}</span>
        <button v-if="Number(store.summary?.uncategorized_expense)>0" type="button" class="underline underline-offset-4" :disabled="store.saving||store.loading" @click="$emit('filter','uncategorized')">{{ t('finance.uncategorizedSpend',{amount:format(store.summary?.uncategorized_expense || 0)}) }}</button>
      </div>
    </div>
    <Teleport to="body">
      <dialog ref="dialog" class="finance-budget-dialog" :aria-label="t('finance.manageBudgets')" @cancel="cancelDialog" @click="backdrop">
        <form class="space-y-5 p-5 sm:p-6" @submit.prevent="save">
          <header class="flex items-center justify-between gap-3"><div><h2 class="text-base font-semibold">{{ t('finance.manageBudgets') }}</h2><p class="mt-1 text-xs text-muted-foreground">{{ monthLabel }}</p></div><button type="button" class="finance-icon" :disabled="store.saving" :aria-label="t('common.close')" @click="close"><X class="h-4 w-4" /></button></header>
          <label class="block space-y-2"><span class="text-xs text-muted-foreground">{{ t('finance.category') }}</span><CustomSelect v-model="selectedId" :options="categoryOptions" :disabled="store.saving" :aria-label="t('finance.category')" popover /></label>
          <div v-if="!selectedId" class="space-y-2">
            <label class="block text-xs text-muted-foreground" for="finance-new-category">{{ t('finance.categoryName') }}</label>
            <div class="flex gap-2"><input id="finance-new-category" v-model="newName" class="finance-input" maxlength="60" :disabled="store.saving" :placeholder="t('finance.categoryExample')" @keydown.enter.prevent="createCategory" /><button type="button" class="shrink-0 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40" :disabled="store.saving||!newName.trim()" @click="createCategory">{{ t('finance.addCategory') }}</button></div>
          </div>
          <template v-else-if="selected">
            <div class="space-y-2"><label for="finance-category-name" class="block text-xs text-muted-foreground">{{ t('finance.categoryName') }}</label><div class="flex gap-2"><input id="finance-category-name" v-model="rename" class="finance-input" maxlength="60" :disabled="store.saving" /><button type="button" class="finance-icon !h-10 !w-10" :disabled="store.saving||!rename.trim()||rename.trim()===selected.name" :aria-label="t('finance.renameCategory')" :title="t('finance.renameCategory')" @click="renameCategory"><Check class="h-4 w-4" /></button><button type="button" class="finance-icon !h-10 !w-10" :disabled="store.saving" :aria-label="t(selected.archived?'finance.restoreCategory':'finance.archiveCategory')" :title="t(selected.archived?'finance.restoreCategory':'finance.archiveCategory')" @click="archiveCategory"><ArchiveRestore v-if="selected.archived" class="h-4 w-4" /><Archive v-else class="h-4 w-4" /></button></div></div>
            <label class="block space-y-2"><span class="text-xs text-muted-foreground">{{ t('finance.monthlyLimit') }} · {{ store.summary?.currency }}</span><input v-model="amount" inputmode="decimal" class="finance-input" :disabled="store.saving" :placeholder="t('finance.noLimit')" /><span class="block text-xs leading-5 text-muted-foreground">{{ t('finance.limitHelp') }}</span></label>
            <label class="block space-y-2"><span class="text-xs text-muted-foreground">{{ t('finance.applyTo') }}</span><CustomSelect v-model="applyScope" :options="scopeOptions" :disabled="store.saving" :aria-label="t('finance.applyTo')" popover /><span class="block text-xs leading-5 text-muted-foreground">{{ t('finance.limitScopeHint') }}</span></label>
          </template>
          <p v-if="validation||store.error" role="alert" class="text-sm text-destructive">{{ t(`finance.${validation||store.error}`) }}</p>
          <footer class="flex justify-end gap-2 border-t border-border/50 pt-4"><button type="button" class="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40" :disabled="store.saving" @click="close">{{ t('common.cancel') }}</button><button type="submit" class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40" :disabled="store.saving||!selected">{{ t('common.save') }}</button></footer>
        </form>
      </dialog>
    </Teleport>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Archive, ArchiveRestore, Check, ChevronDown, SlidersHorizontal, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useFinanceStore } from '../stores/finance'
import { budgetProgress, money, parseFinanceNumber, type FinanceBudgetCategory } from '../lib/finance'
defineEmits<{filter:[id:string]}>()
const store=useFinanceStore(),{t,locale}=useI18n()
const expanded=ref(true),showAll=ref(false),dialog=ref<HTMLDialogElement>(),selectedId=ref(''),newName=ref(''),rename=ref(''),amount=ref(''),applyScope=ref<'month'|'forward'>('month'),validation=ref('')
let newId=crypto.randomUUID()
const categories=computed(()=>store.summary?.budget_categories || [])
const budgetRows=computed(()=>categories.value.filter(row=>row.budget!==null))
const visibleRows=computed(()=>showAll.value?budgetRows.value:budgetRows.value.slice(0,4))
const overspent=computed(()=>budgetRows.value.filter(row=>Number(row.spent)>Number(row.budget)).length)
const unbudgeted=computed(()=>categories.value.filter(row=>row.budget===null).reduce((sum,row)=>sum+Number(row.spent),0))
const selected=computed(()=>categories.value.find(row=>row.id===selectedId.value))
const format=(value:number|null)=>money(value,store.summary?.currency || 'TRY',locale.value)
const monthLabel=computed(()=>new Date(`${store.month}-01T12:00:00Z`).toLocaleDateString(locale.value,{month:'long',year:'numeric',timeZone:'UTC'}))
const categoryOptions=computed(()=>[{value:'',label:t('finance.newCategory')},...categories.value.map(row=>({value:row.id,label:row.name+(row.archived?` · ${t('finance.archivedCategory')}`:'')}))])
const scopeOptions=computed(()=>[{value:'month',label:t('finance.onlyThisMonth')},{value:'forward',label:t('finance.thisAndFuture')}])
const barColor=(row:FinanceBudgetCategory)=>({over:'bg-rose-500',near:'bg-amber-500',used:'bg-amber-500',normal:'bg-primary/65',none:'bg-muted'})[budgetProgress(row.spent,row.budget).state]
function fill(){rename.value=selected.value?.name || '';amount.value=selected.value?.budget==null?'':String(selected.value.budget);applyScope.value=selected.value?.budget==null?'forward':'month';validation.value=''}
watch(selectedId,fill)
async function open(id?:string){store.error='';selectedId.value=typeof id==='string'?id:categories.value.find(row=>!row.archived)?.id || '';fill();await nextTick();dialog.value?.showModal()}
function close(){if(!store.saving)dialog.value?.close()}
function cancelDialog(event:Event){if(store.saving)event.preventDefault()}
function backdrop(event:MouseEvent){if(event.target===dialog.value){const rect=dialog.value!.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close()}}
onDeactivated(()=>dialog.value?.close())
async function createCategory(){if(!newName.value.trim())return;const id=newId;if(await store.mutateCategory('create',id,{name:newName.value.trim()})){selectedId.value=id;newName.value='';newId=crypto.randomUUID()}}
async function renameCategory(){if(selected.value)await store.mutateCategory('update',selected.value.id,{name:rename.value.trim()},selected.value.version)}
async function archiveCategory(){if(selected.value)await store.mutateCategory('update',selected.value.id,{archived:!selected.value.archived},selected.value.version)}
async function save(){
 validation.value='';if(!selected.value)return
 const limit=amount.value.trim()?parseFinanceNumber(amount.value):null
 if(amount.value.trim() && limit===null){validation.value='invalidLimit';return}
 if(await store.setBudget(selected.value.id,limit,applyScope.value,selected.value.budget_version))dialog.value?.close()
}
defineExpose({open})
</script>
<style scoped>
.finance-budget-dialog{width:calc(100vw - 32px);max-width:480px;max-height:calc(100dvh - 32px);overflow-y:auto;margin:auto;padding:0;border:1px solid hsl(var(--border));border-radius:18px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 80px rgb(0 0 0 / .18)}
.finance-budget-dialog::backdrop{background:hsl(var(--background)/.75);backdrop-filter:blur(4px)}
</style>
