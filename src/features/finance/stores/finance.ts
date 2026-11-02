import { ref, computed, onScopeDispose } from 'vue'
import { defineWorkspaceStore } from '@/lib/workspaceScope'
import { useWorkspacesStore } from '@/stores/workspaces'
import { supabase } from '@/lib/supabase'
import { financeError, localFinanceDay, type FinanceEntity, type FinanceSummary, type FinanceTransaction, type FinancePosition, type FinanceFilters } from '../lib/finance'

export const useFinanceStore=defineWorkspaceStore('finance',()=>{
  const workspaces=useWorkspacesStore(),scope=workspaces.sessionKey,wid=workspaces.activeId
  const month=ref(localFinanceDay().slice(0,7)),summary=ref<FinanceSummary|null>(null)
  const filters=ref<FinanceFilters>({search:'',kind:'',category:'',recurring:''})
  const filtered=computed(()=>Object.values(filters.value).some(Boolean))
  const filteredTotals=ref({count:0,income:0,expense:0})
  const transactions=ref<FinanceTransaction[]>([]),positions=ref<FinancePosition[]>([])
  const loading=ref(false),saving=ref(false),pricing=ref(false),error=ref(''),priceIssue=ref(''),status=ref<'idle'|'ready'|'setup'|'error'>('idle')
  const more=ref({transaction:false,position:false}),paging=ref(false)
  let disposed=false,generation=0,lastPriceCheck=0,lastPriceScope='',loadedMonth='',loadedFilter=''
  const cursors:{transaction:{date:string;id:string}|null;position:{date:string;id:string}|null}={transaction:null,position:null}
  const current=()=>!disposed && scope===workspaces.sessionKey
  onScopeDispose(()=>{disposed=true;generation++})
  async function load() {
    if(!current())return false
    const request=++generation,selected=month.value,filterKey=JSON.stringify(filters.value),query={...filters.value}
    if(selected!==loadedMonth){summary.value=null;transactions.value=[];positions.value=[]}
    if(filterKey!==loadedFilter){transactions.value=[];filteredTotals.value={count:0,income:0,expense:0}}
    loading.value=true;error.value=''
    try {
      const args={wid,month_start:`${selected}-01`}
      const result=await supabase.rpc('finance_load',args).abortSignal(AbortSignal.timeout(20_000))
      if(!current() || request!==generation || selected!==month.value)return false
      if(result.error)throw result.error
      if(!Array.isArray(result.data.summary?.schedules) || !Array.isArray(result.data.summary?.budget_categories))throw {code:'PGRST202'}
      if(Object.values(query).some(Boolean)) {
        const page=await supabase.rpc('finance_query',{...args,filters:query}).abortSignal(AbortSignal.timeout(20_000))
        if(!current() || request!==generation || selected!==month.value)return false
        if(page.error)throw page.error
        result.data.transactions=page.data
      }
      summary.value=result.data.summary
      transactions.value=result.data.transactions.items;positions.value=result.data.positions.items
      filteredTotals.value=result.data.transactions.totals || {count:summary.value!.count,income:summary.value!.income,expense:summary.value!.expense}
      for(const entity of ['transaction','position'] as const) {
        const page=entity==='transaction'?result.data.transactions:result.data.positions
        more.value[entity]=page.has_more;cursors[entity]=page.cursor
      }
      loadedMonth=selected;loadedFilter=filterKey;status.value='ready';return true
    } catch(failure) {
      if(current() && request===generation) {error.value=financeError(failure);status.value=error.value==='setup'?'setup':'error'}
      return false
    } finally {if(current() && request===generation)loading.value=false}
  }
  async function loadMore(entity:FinanceEntity) {
    if(!current() || loading.value || paging.value || !more.value[entity])return
    const selected=month.value,request=generation,after=cursors[entity]
    paging.value=true
    try {
      const result=await supabase.rpc(entity==='transaction'?'finance_query':'finance_page',{
        wid,month_start:`${selected}-01`,after_date:after?.date,after_id:after?.id,
        ...(entity==='transaction'?{filters:{...filters.value}}:{entity}),
      }).abortSignal(AbortSignal.timeout(20_000))
      if(!current() || selected!==month.value || request!==generation)return
      if(result.error)throw result.error
      if(entity==='transaction')transactions.value.push(...result.data.items.filter((row:FinanceTransaction)=>!transactions.value.some(item=>item.id===row.id)))
      else positions.value.push(...result.data.items.filter((row:FinancePosition)=>!positions.value.some(item=>item.id===row.id)))
      more.value[entity]=result.data.has_more;cursors[entity]=result.data.cursor
    } catch(failure) {if(current() && selected===month.value && request===generation)error.value=financeError(failure)}
    finally{paging.value=false}
  }
  async function mutate(entity:FinanceEntity|'settings',operation:string,id:string|null,payload:Record<string,unknown>,version:number|null=null) {
    if(!current() || saving.value)return false
    saving.value=true;error.value=''
    try {
      const result=await supabase.rpc('finance_mutate',{wid,entity,operation,rid:id,payload,expected_version:version}).abortSignal(AbortSignal.timeout(20_000))
      if(!current())return false
      if(result.error)throw result.error
      // Apply confirmed writes immediately; a failed refresh never pretends that a committed write failed.
      if(entity==='transaction') {
        transactions.value=transactions.value.filter(item=>item.id!==id)
        if(!filtered.value && operation!=='delete' && result.data.occurred_on?.startsWith(month.value))transactions.value.unshift(result.data)
      } else if(entity==='position' && operation==='delete')positions.value=positions.value.filter(item=>item.id!==id)
      if(entity==='transaction' && operation!=='delete')month.value=result.data.occurred_on.slice(0,7)
      if(!await load() && current())error.value='refreshFailed'
      return true
    } catch(failure) {if(current())error.value=financeError(failure);return false}
    finally{saving.value=false}
  }
  async function mutateSchedule(operation:string,id:string,payload:Record<string,unknown>,version:number|null=null) {
    if(!current() || saving.value)return false
    saving.value=true;error.value=''
    try {
      const result=await supabase.rpc('finance_schedule_mutate',{wid,operation,rid:id,payload,expected_version:version}).abortSignal(AbortSignal.timeout(20_000))
      if(!current())return false
      if(result.error)throw result.error
      if(!await load() && current())error.value='refreshFailed'
      return true
    } catch(failure) {if(current())error.value=financeError(failure);return false}
    finally {saving.value=false}
  }
  async function refreshPrices() {
    if(!current() || pricing.value || !summary.value?.quote_requests.length)return
    const currency=summary.value.currency,requests=summary.value.quote_requests
    const priceScope=JSON.stringify([currency,requests])
    if(priceScope===lastPriceScope && Date.now()-lastPriceCheck<60_000)return
    lastPriceScope=priceScope
    pricing.value=true;priceIssue.value='';lastPriceCheck=Date.now()
    try {
      const result=await supabase.functions.invoke('finance-prices',{body:{currency,instruments:requests},timeout:35_000})
      if(!current())return
      if(result.error)throw result.error
      if(result.data.issues?.length)priceIssue.value=result.data.issues.includes('CRYPTO_SETUP_REQUIRED')?'cryptoSetup':result.data.issues.includes('MARKET_SETUP_REQUIRED')?'marketSetup':result.data.issues.every((issue:string)=>issue==='MARKET_REFERENCE')?'referencePrices':'priceUnavailable'
      await load()
    } catch {if(current())priceIssue.value='priceUnavailable'}
    finally{pricing.value=false}
  }
  async function setFilters(value:Partial<FinanceFilters>) {
    filters.value={...filters.value,...value}
    return load()
  }
  async function configure(rpc:string,args:Record<string,unknown>) {
    if(!current() || saving.value)return false
    saving.value=true;error.value=''
    try {
      const result=await supabase.rpc(rpc,{wid,...args}).abortSignal(AbortSignal.timeout(20_000))
      if(!current())return false
      if(result.error)throw result.error
      if(!await load() && current())error.value='refreshFailed'
      return true
    }catch(failure){if(current())error.value=financeError(failure);return false}
    finally{saving.value=false}
  }
  const mutateCategory=(operation:string,id:string,payload:Record<string,unknown>,version:number|null=null)=>configure('finance_category_mutate',{operation,rid:id,payload,expected_version:version})
  const setBudget=(id:string,amount:number|null,scope:'month'|'forward',version:number)=>configure('finance_budget_set',{cid:id,month_start:`${month.value}-01`,limit_amount:amount,apply_scope:scope,expected_version:version})
  return {month,summary,transactions,positions,more,loading,paging,saving,pricing,error,priceIssue,status,filters,filtered,filteredTotals,setFilters,mutateCategory,setBudget,load,loadMore,mutate,mutateSchedule,refreshPrices}
})
