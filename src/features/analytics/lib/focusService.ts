import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { FocusJournal } from './focusJournal'

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
    let storage: Storage
    try { storage=localStorage } catch {
      storage={length:0,key:()=>null,getItem:()=>null,removeItem:()=>{},clear:()=>{},setItem:()=>{throw new Error('STORAGE_UNAVAILABLE')}}
    }
    journal=new FocusJournal(owner,storage,tabId,async payload=>{
      if (useAuthStore().user?.id!==owner) throw new Error('SESSION_CHANGED')
      const result=await supabase.rpc('record_focus_session',{payload})
      if (result.error) throw result.error
    })
    journals.set(owner,journal)
  }
  return journal
}
