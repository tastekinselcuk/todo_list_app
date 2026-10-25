import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { FocusJournal, type JournalStorage } from './focusJournal'

// Resolve browser storage on every operation: an initial denial must not turn
// into a permanently broken adapter after the browser allows access again.
export function createFocusStorage(owner:string,resolve:()=>JournalStorage=()=>localStorage):JournalStorage {
  const quotaExceeded=(error:unknown)=>{
    if(!error || typeof error!=='object')return false
    const failure=error as {name?:string;message?:string;code?:number}
    return failure.name==='QuotaExceededError' || [22,1014].includes(failure.code||0) || /quota/i.test(failure.message||'')
  }
  return {
    get length(){return resolve().length},
    key:index=>resolve().key(index),
    getItem:key=>resolve().getItem(key),
    removeItem:key=>resolve().removeItem(key),
    setItem(key,value){
      const storage=resolve()
      try{storage.setItem(key,value)}catch(error){
        if(!quotaExceeded(error))throw error
        // Reclaim only this account's server-backed note snapshots. Preserve
        // manual order, categories, drafts, auth, preferences and focus outboxes.
        const keys:string[]=[]
        for(let index=0;index<storage.length;index++){
          const candidate=storage.key(index)
          if(candidate?.startsWith(`workspace:${owner}:`) && /:todo-app-data(?::|$)/.test(candidate))keys.push(candidate)
        }
        for(const candidate of keys){
          let reclaimed=false
          try{
            const raw=storage.getItem(candidate),snapshot=JSON.parse(raw||'null')
            if(!snapshot || typeof snapshot!=='object' || !['todos','quickNotes','codeSnippets'].some(field=>Array.isArray(snapshot[field]) && snapshot[field].length))continue
            const compact=JSON.stringify({...snapshot,todos:[],quickNotes:[],codeSnippets:[]})
            if(raw && compact.length<raw.length){storage.setItem(candidate,compact);reclaimed=true}
          }catch{/* Unknown/malformed device data is never deleted. */}
          if(reclaimed){
            try{storage.setItem(key,value);return}
            catch(retry){if(!quotaExceeded(retry))throw retry}
          }
        }
        throw error
      }
    },
  }
}

const journals = new Map<string, FocusJournal>()
let tabId = ''
export function focusJournal(owner: string) {
  if (!tabId) {
    try {
      tabId=sessionStorage.getItem('analytics-focus-tab') || crypto.randomUUID()
      sessionStorage.setItem('analytics-focus-tab',tabId)
    } catch { tabId=crypto.randomUUID() }
  }
  let journal=journals.get(owner)
  if (!journal) {
    journal=new FocusJournal(owner,createFocusStorage(owner),tabId,async payload=>{
      if (useAuthStore().user?.id!==owner) throw new Error('SESSION_CHANGED')
      const result=await supabase.rpc('record_focus_session',{payload})
      if (result.error) throw result.error
    })
    journals.set(owner,journal)
  }
  return journal
}
