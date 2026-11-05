import { defineWorkspaceStore as defineStore, useWorkspaceClient } from '@/lib/workspaceScope'
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { FocusTarget } from '@/features/pomodoro/stores/pomodoro'
import { nextPeriod, periodStart, type Period } from '../lib/periods'

export interface Snapshot { date: string; completed: boolean }
export interface Plan {
  version?: number
  id: string
  user_id: string
  title: string
  period: Period
  period_date: string
  completed: boolean
  history: Snapshot[]
  created_at: string
  source?: 'plans'|'quick'
  can_write?: boolean
  focus?: {id:string;estimated_sessions:number;focus_seconds:number;sessions:number}|null
}

export const usePlansStore = defineStore('plans', () => {
  const auth = useAuthStore()
  const supabase = useWorkspaceClient()
  const timezone = supabase.timezone?.('plans')
  const plans = ref<Plan[]>([])
  const busy = ref(false)
  const savingIds = ref<string[]>([])
  const error = ref('')
  const focusError = ref('')
  const focusingIds = ref<string[]>([])
  const key=(plan:Plan)=>`${plan.source||'plans'}:${plan.id}`
  let searchTargetId = ''
  watch(() => auth.user?.id, () => { plans.value = []; error.value = '' })

  async function load(targetId?: string) {
    if (typeof targetId === 'string') searchTargetId = targetId
    if (busy.value || savingIds.value.length || !auth.user) return false
    const userId = auth.user.id
    busy.value = true
    error.value = ''
    try {
      if(supabase.loadPlanEntries){const data=await supabase.loadPlanEntries();if(auth.user?.id!==userId)return false;plans.value=data;return true}
      const serverRollover = await supabase.rolloverPlans?.()
      const result = await supabase.from('plans').select('*').eq('user_id', userId).order('created_at')
      if (result.error) throw result.error
      if (searchTargetId && !(result.data || []).some((row: { id: string }) => row.id === searchTargetId)) {
        const located = await supabase.from('plans').select('*').eq('id', searchTargetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) result.data = [located.data, ...(result.data || [])]
      }
      if (auth.user?.id !== userId) return false
      plans.value = result.data || []
      // Keep a snapshot for every elapsed period, including periods without a login.
      for (const plan of serverRollover ? [] : plans.value) {
        const current = periodStart(plan.period, new Date(), timezone)
        if (plan.period==='timeless' || plan.completed || plan.period_date >= current) continue
        const history = [...plan.history]
        let date = plan.period_date
        while (date < current) {
          history.push({ date, completed: false })
          date = nextPeriod(plan.period, date)
        }
        const { error: saveError } = await supabase.from('plans')
          .update({ period_date: current, history }).eq('id', plan.id).eq('user_id', userId)
          .eq('period_date', plan.period_date).eq('completed', false)
          .select().single()
        if (saveError) throw saveError
        if (auth.user?.id !== userId) return false
        Object.assign(plan, { period_date: current, history })
      }
      return true
    } catch (err) {
      error.value = (err as Error).message
      return false
    } finally { busy.value = false }
  }

  async function add(title: string, period: Period) {
    if (!title.trim() || busy.value || !auth.user) return false
    busy.value = true
    error.value = ''
    try {
      const userId = auth.user.id
      const result = await supabase.from('plans').insert({
        user_id: userId, title: title.trim(), period, period_date: periodStart(period, new Date(), timezone),
      }).select().single()
      if (result.error) throw result.error
      if (auth.user?.id !== userId) return false
      plans.value.push(result.data)
      return true
    } catch (err) { error.value = (err as Error).message; return false }
    finally { busy.value = false }
  }

  async function update(plan: Plan, updates: Partial<Pick<Plan, 'completed'>>) {
    if (busy.value || savingIds.value.includes(plan.id) || !auth.user) return false
    const userId = auth.user.id
    const previous = { completed: plan.completed }
    savingIds.value.push(plan.id)
    error.value = ''
    // Render immediately, then restore the previous state if the write fails.
    Object.assign(plan, updates)
    try {
      let query = supabase.from(plan.source==='quick'?'quick_notes':'plans').update({ ...updates, ...(plan.version === undefined ? {} : { version: plan.version }) })
        .eq('id', plan.id).eq(plan.source==='quick'?'created_by':'user_id', userId)
      if(plan.source!=='quick')query=query.eq('period_date',plan.period_date)
      const result=await query.select().single()
      if (result.error) throw result.error
      if (auth.user?.id !== userId) return false
      Object.assign(plan, plan.source==='quick'?{completed:result.data.completed,version:result.data.version}:result.data)
      return true
    } catch (err) {
      Object.assign(plan, previous)
      if (auth.user?.id === userId) error.value = (err as Error).message
      return false
    } finally { savingIds.value = savingIds.value.filter(id => id !== plan.id) }
  }
  async function remove(id: string, source:'plans'|'quick'='plans') {
    if (busy.value || savingIds.value.includes(id) || !auth.user) return false
    const userId = auth.user.id
    savingIds.value.push(id)
    error.value = ''
    try {
      const result = await supabase.from(source==='quick'?'quick_notes':'plans').delete()
        .eq('id', id).eq(source==='quick'?'created_by':'user_id', userId).select('id').single()
      if (result.error) throw result.error
      if (auth.user?.id !== userId) return false
      plans.value = plans.value.filter(plan => plan.id !== id || (plan.source||'plans')!==source)
      return true
    } catch (err) {
      if (auth.user?.id === userId) error.value = (err as Error).message
      return false
    } finally { savingIds.value = savingIds.value.filter(savingId => savingId !== id) }
  }
  const isSaving = (id: string) => savingIds.value.includes(id)
  async function prepareFocus(plan:Plan,seconds?:number,estimate?:number):Promise<FocusTarget|null>{
    const itemKey=key(plan)
    if(focusingIds.value.includes(itemKey)||plan.completed||!auth.user)return null
    const owner=auth.user.id;focusingIds.value.push(itemKey);focusError.value=''
    try{
      if(!supabase.preparePlanFocus)throw Error('PLAN_SETUP_REQUIRED')
      const target=await supabase.preparePlanFocus(plan.source||'plans',plan.id,seconds??null,estimate??null)
      if(auth.user?.id!==owner)return null
      plan.focus={id:target.id,estimated_sessions:target.estimated_sessions,focus_seconds:target.focus_seconds,sessions:plan.focus?.sessions||0}
      return target
    }catch(failure){if(auth.user?.id===owner)focusError.value=(failure as Error).message;return null}
    finally{focusingIds.value=focusingIds.value.filter(value=>value!==itemKey)}
  }
  const isFocusing=(plan:Plan)=>focusingIds.value.includes(key(plan))
  supabase.listen?.({ plans: load,quick_notes:load }, () => busy.value || Boolean(savingIds.value.length))
  return { plans, busy, error, focusError, load, add, update, remove, isSaving, prepareFocus, isFocusing, timezone }
})
