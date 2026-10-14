import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useWorkspacesStore } from '@/stores/workspaces'
import { focusJournal } from '../lib/focusService'
import { reportRange, type AnalyticsReport, type DatePreset } from '../lib/reports'

export function useAnalyticsReport(options: {workspace: Ref<string>;preset: Ref<DatePreset>;from: Ref<string>;to: Ref<string>;personal: Ref<boolean>;timezone: Ref<string>;summary?:boolean;compare?:boolean;enabled?:Ref<boolean>}) {
  const workspaces=useWorkspacesStore()
  const report=ref<AnalyticsReport | null>(null), previous=ref<AnalyticsReport | null>(null)
  const status=ref<'loading'|'ready'|'setup'|'error'>('loading')
  const error=ref(''), refreshing=ref(false), pending=ref(0), storageFailed=ref(false)
  let generation=0,disposed=false,interval: ReturnType<typeof setInterval> | undefined
  let lastScope=''
  let summaryAvailable=true
  async function load() {
    if(options.enabled?.value===false){generation++;refreshing.value=false;return}
    const request=++generation,owner=workspaces.userId
    refreshing.value=true;error.value=''
    // Hide old-scope data immediately; never show a previous workspace's report.
    const scope=JSON.stringify([owner,options.enabled?.value,options.workspace.value,options.preset.value,options.from.value,options.to.value,options.personal.value,options.timezone.value,workspaces.sessionKey])
    if(scope!==lastScope) {report.value=null;previous.value=null;status.value='loading';lastScope=scope}
    try {
      const range=reportRange(options.preset.value,options.timezone.value,new Date(),options.from.value,options.to.value)
      const journal=focusJournal(owner)
      await journal.flush()
      pending.value=journal.pending().length;storageFailed.value=journal.storageFailed
      const args={wid:options.workspace.value || null,report_timezone:options.timezone.value,personal:options.personal.value}
      async function fetchRange(date_from:string,date_to:string,summary:boolean) {
        let response=await supabase.rpc(summary&&summaryAvailable?'analytics_summary':'analytics_report',{...args,date_from,date_to})
        if(summary&&summaryAvailable&&['PGRST202','42883'].includes(response.error?.code||'')) {
          summaryAvailable=false
          response=await supabase.rpc('analytics_report',{...args,date_from,date_to})
        }
        return response
      }
      const responses=await Promise.all([
        fetchRange(range.from,range.to,options.summary===true),
        options.compare===false?Promise.resolve(null):fetchRange(range.previousFrom,range.previousTo,true),
      ])
      if (request!==generation || disposed || owner!==workspaces.userId) return
      for(const response of responses) if(response?.error) throw response.error
      report.value={...responses[0]!.data,items:responses[0]!.data.items||[]} as AnalyticsReport
      previous.value=responses[1]?.data ? {...responses[1].data,items:responses[1].data.items||[]} as AnalyticsReport:null
      status.value='ready'
    } catch(err) {
      if (request!==generation || disposed || owner!==workspaces.userId) return
      const failure=err as {code?:string;message?:string}
      status.value=['PGRST202','42883','42P01'].includes(failure.code || '') ? 'setup' : 'error'
      error.value=failure.message==='INVALID_DATE_RANGE' ? 'range' : 'load'
    } finally { if (request===generation) refreshing.value=false }
  }
  watch(()=>[options.enabled?.value,options.workspace.value,options.preset.value,options.from.value,options.to.value,options.personal.value,options.timezone.value,workspaces.sessionKey],()=>{void load()},{immediate:true})
  const wake=()=>{if(document.visibilityState==='visible') void load()}
  onMounted(()=>{
    document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake)
    interval=setInterval(()=>{if(document.visibilityState==='visible' && !refreshing.value) void load()},60_000)
  })
  onBeforeUnmount(()=>{disposed=true;generation++;if(interval)clearInterval(interval);document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake)})
  return {report,previous,status,error,refreshing,pending,storageFailed,load}
}
