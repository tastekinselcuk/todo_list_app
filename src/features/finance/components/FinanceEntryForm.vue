<template>
  <form class="space-y-2.5" @submit.prevent="save">
    <div class="flex flex-wrap items-center gap-1.5">
      <template v-if="entity==='transaction'">
        <input ref="firstInput" v-model="name" maxlength="160" :aria-label="t('finance.description')" :placeholder="t('finance.description')" :disabled="disabled" class="finance-input !w-auto min-w-[180px] flex-1" />
        <div class="relative w-28 shrink-0">
          <input v-model="amount" required inputmode="decimal" :aria-label="t('finance.amount')" :placeholder="t('finance.amount')" :disabled="disabled" class="finance-input !pl-3 !pr-10" />
          <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{{ currency }}</span>
        </div>
        <CustomSelect v-model="kind" :options="kindOptions" :aria-label="t('finance.type')" :disabled="disabled" class="w-fit shrink-0" />
        <CustomSelect v-if="!record || schedule" v-model="cadence" :options="cadenceOptions" :aria-label="t('finance.repeat')" :disabled="disabled" class="w-fit shrink-0" />
      </template>
      <template v-else>
        <CustomSelect v-model="category" :options="categoryOptions" :aria-label="t('finance.category')" :disabled="disabled" class="w-fit max-w-[160px] shrink-0" />
        <CustomSelect v-model="selection" :options="instrumentOptions" :aria-label="t('finance.instrument')" :disabled="disabled" class="w-fit max-w-[220px] shrink-0" />
        <input ref="firstInput" v-model="quantity" required inputmode="decimal" :aria-label="t('finance.quantity')" :placeholder="t(selected?.unit==='g'?'finance.grams':selected?.unit==='piece'?'finance.pieces':'finance.quantity')" :disabled="disabled" class="finance-input !w-24 !pl-3 shrink-0" />
        <div class="relative w-36 shrink-0">
          <input v-model="buyPrice" required inputmode="decimal" :aria-label="t('finance.buyPrice')" :placeholder="t('finance.buyPrice')" :disabled="disabled" class="finance-input !pl-3 !pr-10 !text-xs" />
          <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{{ currency }}</span>
        </div>
      </template>
      <div class="ml-auto flex shrink-0 items-center gap-1.5">
        <button v-if="record || schedule" type="button" class="finance-icon shrink-0" :aria-label="t('common.cancel')" :disabled="store.saving" @click="emit('cancel')"><X class="h-4 w-4" /></button>
        <input v-model="date" required type="date" min="1900-01-01" :max="entity==='position'?today:'2100-12-31'" :aria-label="t(entity==='position'?'finance.purchaseDate':'finance.date')" :disabled="disabled" class="finance-input !w-32 !pl-3 !pr-2 !text-xs shrink-0" />
        <button type="submit" :disabled="disabled || !canSubmit" class="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"><Loader2 v-if="store.saving" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><span>{{ t(record || schedule?'common.save':'quickNotes.add') }}</span></button>
      </div>
    </div>
    <div v-if="legacy" class="flex flex-wrap items-center gap-1.5">
      <input v-if="legacy" v-model="manualPrice" inputmode="decimal" :placeholder="t('finance.currentPrice')" :aria-label="t('finance.currentPrice')" :disabled="disabled" class="finance-input !h-9 !w-40 !text-xs" />
    </div>
    <p v-if="validation || store.error" class="text-xs text-destructive" role="alert">{{ t(`finance.${validation || store.error}`) }}</p>
  </form>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useFinanceStore } from '../stores/finance'
import { investmentCategories, investmentInstruments, investmentInstrument, localFinanceDay, parseFinanceNumber, validFinanceDate, type FinanceEntity, type FinanceTransaction, type FinancePosition, type FinanceSchedule } from '../lib/finance'
const props=defineProps<{entity:FinanceEntity;record:FinanceTransaction|FinancePosition|null;schedule?:FinanceSchedule|null;currency:string;draftId:string}>()
const emit=defineEmits<{saved:[];cancel:[]}>()
const store=useFinanceStore(),{t}=useI18n(),today=localFinanceDay(),firstInput=ref<HTMLInputElement>()
const cash=props.entity==='transaction'?props.record as FinanceTransaction|null:null
const position=props.entity==='position'?props.record as FinancePosition|null:null
const matched=position?investmentInstrument(position):undefined
const category=ref<string>(matched?.category || position?.kind || 'metal')
const selection=ref(matched?.value || (position?'legacy':'market:XAU')),kind=ref(props.schedule?.kind || cash?.kind || 'expense')
const cadence=ref<string>(props.schedule?.cadence || 'once')
const date=ref(props.schedule?.starts_on || cash?.occurred_on || position?.purchased_on || today)
const amount=ref(props.schedule?String(props.schedule.amount):cash?String(cash.amount):'')
const entryTitle=props.schedule?.title || cash?.title || ''
const name=ref(['income','expense'].includes(entryTitle)?'':entryTitle)
const quantity=ref(position?String(position.quantity):''),buyPrice=ref(position?String(position.buy_price):''),manualPrice=ref(position?.manual_price==null?'':String(position.manual_price))
const selected=computed(()=>investmentInstruments.find(item=>item.value===selection.value && item.category===category.value)),legacy=computed(()=>selection.value==='legacy' && position?.kind===category.value)
const validation=ref('')
const disabled=computed(()=>store.saving || store.status!=='ready')
const canSubmit=computed(()=>props.entity==='transaction'?Boolean(amount.value.trim()):Boolean(quantity.value.trim() && buyPrice.value.trim()))
const kindOptions=computed(()=>['expense','income'].map(value=>({value,label:t(`finance.${value}`)})))
const cadenceOptions=computed(()=>(props.schedule?['weekly','monthly','yearly']:['once','weekly','monthly','yearly']).map(value=>({value,label:t(`finance.${value}`)})))
const categoryOptions=computed(()=>[
 ...investmentCategories.map(value=>({value,label:t(`finance.${value}`)})),
 ...(position && !matched && !investmentCategories.some(value=>value===position.kind)?[{value:position.kind,label:t(`finance.${position.kind}`)}]:[]),
])
const instrumentOptions=computed(()=>[
 ...investmentInstruments.filter(item=>item.category===category.value).map(item=>({value:item.value,label:item.labelKey?t(`finance.${item.labelKey}`):item.label!})),
 ...(position && !matched && position.kind===category.value?[{value:'legacy',label:position.title}]:[]),
])
watch(category,()=>{
 validation.value=''
 if(!instrumentOptions.value.some(item=>item.value===selection.value))selection.value=instrumentOptions.value[0]?.value || ''
 quantity.value='';buyPrice.value='';manualPrice.value=''
},{flush:'sync'})
watch(cadence,()=>{validation.value='';if(props.schedule && date.value<today && cadence.value!==props.schedule.cadence)date.value=today})
onMounted(async()=>{if(props.record || props.schedule){await nextTick();firstInput.value?.focus()}})
async function save() {
 validation.value='';store.error=''
 if(!validFinanceDate(date.value) || (props.entity==='position' && date.value>today)){validation.value='invalidInput';return}
 if(props.entity==='transaction') {
  const value=parseFinanceNumber(amount.value)
  if(value===null || value<=0){validation.value='invalidInput';return}
  if(cadence.value!=='once') {
   const payload={title:name.value.trim() || kind.value,kind:kind.value,amount:value,cadence:cadence.value,starts_on:date.value,timezone:props.schedule?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul'}
   if(await store.mutateSchedule(props.schedule?'update':'create',props.schedule?.id || props.draftId,payload,props.schedule?.version || null))emit('saved')
  }else {
   if(await store.mutate('transaction',cash?'update':'create',cash?.id || props.draftId,{title:name.value.trim() || kind.value,kind:kind.value,amount:value,occurred_on:date.value},cash?.version || null))emit('saved')
  }
 }else {
  const units=parseFinanceNumber(quantity.value,8),purchase=parseFinanceNumber(buyPrice.value,8),current=manualPrice.value.trim()?parseFinanceNumber(manualPrice.value,8):null
  if(units===null || units<=0 || units>1e9 || purchase===null || purchase<=0 || purchase>1e9 || units*purchase>1e12 || (!selected.value && (!position || !legacy.value)) || (legacy.value && manualPrice.value.trim() && (current===null || current>1e9))){validation.value='invalidInput';return}
  const item=selected.value
  const payload=item?{title:item.labelKey?t(`finance.${item.labelKey}`):item.label,kind:item.kind,instrument:item.instrument,price_source:item.provider,manual_price:null}
   :{title:position!.title,kind:position!.kind,instrument:position!.instrument,price_source:position!.price_source,manual_price:current}
  if(await store.mutate('position',position?'update':'create',position?.id || props.draftId,{...payload,quantity:units,buy_price:purchase,purchased_on:date.value},position?.version || null)){emit('saved');void store.refreshPrices()}
 }
}
</script>
