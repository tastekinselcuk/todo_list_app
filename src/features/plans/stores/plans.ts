import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { nextPeriod, periodStart, type Period } from '../lib/periods'

export interface Snapshot { date: string; completed: boolean; reason: string }
export interface Plan {
  id: string
  user_id: string
  title: string
  period: Period
  period_date: string
  completed: boolean
  reason: string
  history: Snapshot[]
  created_at: string
}

export const usePlansStore = defineStore('plans', () => {
  const auth = useAuthStore()
  const plans = ref<Plan[]>([])
  const busy = ref(false)
  const savingIds = ref<string[]>([])
  const error = ref('')
  watch(() => auth.user?.id, () => { plans.value = []; error.value = '' })

  async function load() {
    if (busy.value || savingIds.value.length || !auth.user) return false
    const userId = auth.user.id
    busy.value = true
    error.value = ''
    try {
      const result = await supabase.from('plans').select('*').eq('user_id', userId).order('created_at')
      if (result.error) throw result.error
      if (auth.user?.id !== userId) return false
      plans.value = result.data || []
      // Keep a snapshot for every elapsed period, including periods without a login.
      for (const plan of plans.value) {
        const current = periodStart(plan.period)
        if (plan.completed || plan.period_date >= current) continue
        const history = [...plan.history]
        let date = plan.period_date
        while (date < current) {
          history.push({ date, completed: false, reason: plan.reason })
          date = nextPeriod(plan.period, date)
        }
        const { error: saveError } = await supabase.from('plans')
          .update({ period_date: current, history }).eq('id', plan.id).eq('user_id', userId)
          .eq('period_date', plan.period_date).eq('completed', false).eq('reason', plan.reason)
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
        user_id: userId, title: title.trim(), period, period_date: periodStart(period),
      }).select().single()
      if (result.error) throw result.error
      if (auth.user?.id !== userId) return false
      plans.value.push(result.data)
      return true
    } catch (err) { error.value = (err as Error).message; return false }
    finally { busy.value = false }
  }

  async function update(plan: Plan, updates: Partial<Pick<Plan, 'completed' | 'reason'>>) {
    if (busy.value || savingIds.value.includes(plan.id) || !auth.user) return false
    const userId = auth.user.id
    const previous = { completed: plan.completed, reason: plan.reason }
    savingIds.value.push(plan.id)
    error.value = ''
    // Render immediately, then restore the previous state if the write fails.
    Object.assign(plan, updates)
    try {
      const result = await supabase.from('plans').update(updates)
        .eq('id', plan.id).eq('user_id', userId).eq('period_date', plan.period_date).select().single()
      if (result.error) throw result.error
      if (auth.user?.id !== userId) return false
      Object.assign(plan, result.data)
      return true
    } catch (err) {
      Object.assign(plan, previous)
      if (auth.user?.id === userId) error.value = (err as Error).message
      return false
    } finally { savingIds.value = savingIds.value.filter(id => id !== plan.id) }
  }
  async function remove(id: string) {
    if (busy.value || savingIds.value.includes(id) || !auth.user) return false
    const userId = auth.user.id
    savingIds.value.push(id)
    error.value = ''
    try {
      const result = await supabase.from('plans').delete()
        .eq('id', id).eq('user_id', userId).select('id').single()
      if (result.error) throw result.error
      if (auth.user?.id !== userId) return false
      plans.value = plans.value.filter(plan => plan.id !== id)
      return true
    } catch (err) {
      if (auth.user?.id === userId) error.value = (err as Error).message
      return false
    } finally { savingIds.value = savingIds.value.filter(savingId => savingId !== id) }
  }
  const isSaving = (id: string) => savingIds.value.includes(id)
  return { plans, busy, error, load, add, update, remove, isSaving }
})
