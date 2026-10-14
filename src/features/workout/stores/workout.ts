import { defineWorkspaceStore as defineStore, useWorkspaceClient } from '@/lib/workspaceScope'
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { normalizeExerciseInput, type ExerciseInput } from '../lib/exercises'

export interface Exercise extends ExerciseInput {
  _version?: number
  id: string
  isCompleted: boolean
}

export interface Routine {
  version?: number
  id: string
  title: string
  day_of_week: string
  exercises: Exercise[]
}

export const useWorkoutStore = defineStore('workout', () => {
  const authStore = useAuthStore()
  const supabase = useWorkspaceClient()
  const routines = ref<Routine[]>([])
  const isLoading = ref(false)
  const savingChildren = ref(0)
  const isSaving = computed(() => savingChildren.value > 0)
  const pending = new Set<string>()
  async function write<T>(key: string, operation: () => Promise<T>): Promise<T | false> {
    if (!authStore.user || supabase.canWrite?.('workout') === false || pending.has(key)) return false
    pending.add(key)
    savingChildren.value++
    try { return await operation() } catch (error) { console.error('Workout not saved:', error); return false }
    finally { pending.delete(key); savingChildren.value--; }
  }
  async function changeItem(parentId: string, operation: string, item: Record<string, unknown>, version?: number) {
    savingChildren.value++
    try {
      const result = await supabase.mutateItem('workout', parentId, operation, item, version)
      const current = routines.value.find(routine => routine.id === parentId)
      if (current && (current.version ?? 0) <= result.version) Object.assign(current, result)
      return true
    } catch (err) { console.error('Exercise not saved:', err); return false }
    finally { savingChildren.value-- }
  }

  let fetchRoutinesGeneration = 0
  const fetchRoutines = async (targetId?: string) => {
    const request = ++fetchRoutinesGeneration
    if (!authStore.user) return false
    isLoading.value = true
    try {
      let { data, error } = await supabase
        .from('workout_routines')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: true })

      if (request !== fetchRoutinesGeneration) return false
      if (error) throw error
      if (typeof targetId === 'string' && !(data || []).some((row: { id: string }) => row.id === targetId)) {
        const located = await supabase.from('workout_routines').select('*').eq('id', targetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) data = [located.data, ...(data || [])]
      }
      if (request !== fetchRoutinesGeneration) return false
      if (data) routines.value = data.map((routine: Routine) => ({ ...routine, exercises: Array.isArray(routine.exercises) ? routine.exercises : [] }))
      return true
    } catch (err) {
      if (request !== fetchRoutinesGeneration) return false
      console.error('Error fetching routines:', err)
      return false
    } finally {
      if (request === fetchRoutinesGeneration) isLoading.value = false
    }
  }

  const addRoutine = async (title: string, dayOfWeek: string) => {
    if (!title.trim() || title.trim().length > 120) return false
    return write('create', async () => {
      const { data, error } = await supabase.from('workout_routines').insert({ user_id: authStore.user!.id, title: title.trim(), day_of_week: dayOfWeek, exercises: [] }).select().single()
      if (error) throw error
      routines.value.push(data)
      return data as Routine
    })
  }

  const updateRoutine = async (id: string, title: string, dayOfWeek: string, version?: number) => {
    if (!title.trim() || title.trim().length > 120) return false
    return write(id, async () => {
      let query = supabase.from('workout_routines').update({ title: title.trim(), day_of_week: dayOfWeek }).eq('id', id)
      if (version !== undefined && supabase.collection('workout')) query = query.eq('version', version)
      const { data, error } = await query.select().single()
      if (error) throw error
      const index = routines.value.findIndex(r => r.id === id)
      if (index !== -1) routines.value[index] = data
      return true
    })
  }

  const duplicateRoutine = async (id: string, title: string) => {
    const original = routines.value.find(r => r.id === id)
    if (!original) return false
    return write('create', async () => {
      const exercises = original.exercises.map(exercise => ({ ...normalizeExerciseInput(exercise), id: crypto.randomUUID(), isCompleted: false }))
      const shared = Boolean(supabase.collection('workout'))
      const { data, error } = await supabase.from('workout_routines').insert({ user_id: authStore.user!.id, title: title.trim().slice(0, 120), day_of_week: original.day_of_week, exercises: shared ? [] : exercises }).select().single()
      if (error) throw error
      let result = data as Routine
      try {
        // Normalized collections must add children through the existing versioned RPC.
        if (shared) for (const exercise of exercises) result = await supabase.mutateItem('workout', data.id, 'add', exercise)
      } catch (error) {
        const cleanup = await supabase.from('workout_routines').delete().eq('id', data.id)
        if (cleanup.error) await fetchRoutines()
        throw error
      }
      routines.value.push(result)
      return result
    })
  }

  const deleteRoutine = async (id: string) => {
    return write(id, async () => {
      const { error } = await supabase.from('workout_routines').delete().eq('id', id)
      if (error) throw error
      routines.value = routines.value.filter(item => item.id !== id)
      return true
    })
  }

  const syncExercises = async (routineId: string, exercises: Exercise[]) => {
    const { data, error } = await supabase.from('workout_routines').update({ exercises }).eq('id', routineId).select().single()
    if (error) throw error
    if (!data) throw new Error('Workout no longer exists')
    const routine = routines.value.find(r => r.id === routineId)
    if (routine) routine.exercises = data.exercises
    return true
  }

  const addExerciseToRoutine = async (routineId: string, exercise: ExerciseInput) => write(routineId, async () => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return false
    const input = normalizeExerciseInput(exercise)
    if (supabase.collection('workout')) {
      return changeItem(routineId, 'add', { ...input, isCompleted: false })
    }
    return syncExercises(routineId, [...routine.exercises, { ...input, id: crypto.randomUUID(), isCompleted: false }])
  })

  const updateExercise = async (routineId: string, exerciseId: string, input: ExerciseInput, version?: number) => write(routineId, async () => {
    const routine = routines.value.find(r => r.id === routineId)
    const existing = routine?.exercises.find(exercise => exercise.id === exerciseId)
    if (!routine || !existing) return false
    const patch = normalizeExerciseInput(input)
    if (supabase.collection('workout')) return changeItem(routineId, 'update', { ...patch, id: exerciseId }, version ?? existing._version)
    return syncExercises(routineId, routine.exercises.map(exercise => exercise.id === exerciseId ? { ...exercise, ...patch } : exercise))
  })

  const deleteExercise = async (routineId: string, exerciseId: string) => write(routineId, async () => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return false
    if (supabase.collection('workout')) {
      const exercise = routine.exercises.find(e => e.id === exerciseId)
      return changeItem(routineId, 'delete', { id: exerciseId }, exercise?._version)
    }
    return syncExercises(routineId, routine.exercises.filter(e => e.id !== exerciseId))
  })

  const toggleExerciseCompletion = async (routineId: string, exerciseId: string) => write(routineId, async () => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return false
    const exercise = routine.exercises.find(e => e.id === exerciseId)
    if (!exercise) return false
    if (supabase.collection('workout')) {
      return changeItem(routineId, 'update', { id: exerciseId, isCompleted: !exercise.isCompleted }, exercise._version)
    }
    
    return syncExercises(routineId, routine.exercises.map(e => e.id === exerciseId ? { ...e, isCompleted: !e.isCompleted } : e))
  })

  const resetRoutine = async (routineId: string) => write(routineId, async () => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return false
    if (supabase.collection('workout')) {
      return changeItem(routineId, 'reset', {}, routine.version)
    }
    return syncExercises(routineId, routine.exercises.map(exercise => ({ ...exercise, isCompleted: false })))
  })

  supabase.listen?.({ workout_routines: fetchRoutines }, () => isLoading.value || Boolean(savingChildren.value))
  return { routines, isLoading, isSaving, fetchRoutines, addRoutine, updateRoutine, duplicateRoutine, deleteRoutine, addExerciseToRoutine, updateExercise, deleteExercise, toggleExerciseCompletion, resetRoutine }
})
