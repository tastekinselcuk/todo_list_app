import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export interface Exercise {
  id: string
  name: string
  sets: number
  reps: string
  imageUrl: string
  isCompleted: boolean
}

export interface Routine {
  id: string
  title: string
  day_of_week: string
  exercises: Exercise[]
}

export const useWorkoutStore = defineStore('workout', () => {
  const authStore = useAuthStore()
  const routines = ref<Routine[]>([])
  const isLoading = ref(false)

  const fetchRoutines = async () => {
    if (!authStore.user) return
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('workout_routines')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (data) routines.value = data
    } catch (err) {
      console.error('Error fetching routines:', err)
    } finally {
      isLoading.value = false
    }
  }

  const addRoutine = async (title: string, day_of_week: string) => {
    if (!authStore.user) return
    const tempId = 'temp-' + Date.now()
    const newRoutine: Routine = { id: tempId, title, day_of_week, exercises: [] }
    routines.value.push(newRoutine)

    try {
      const { data, error } = await supabase
        .from('workout_routines')
        .insert({ user_id: authStore.user.id, title, day_of_week, exercises: [] })
        .select().single()

      if (error) throw error
      const index = routines.value.findIndex(r => r.id === tempId)
      if (index !== -1) routines.value[index] = data
    } catch (err) {
      routines.value = routines.value.filter(r => r.id !== tempId)
    }
  }

  const deleteRoutine = async (id: string) => {
    const previous = [...routines.value]
    routines.value = routines.value.filter(r => r.id !== id)
    try {
      const { error } = await supabase.from('workout_routines').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      routines.value = previous
    }
  }

  const syncExercises = async (routineId: string, exercises: Exercise[]) => {
    try {
      const { error } = await supabase.from('workout_routines').update({ exercises }).eq('id', routineId)
      if (error) throw error
    } catch (err) {
      console.error('Error updating exercises:', err)
    }
  }

  const addExerciseToRoutine = (routineId: string, exercise: Omit<Exercise, 'id' | 'isCompleted'>) => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return
    routine.exercises.push({ ...exercise, id: Date.now().toString(), isCompleted: false })
    syncExercises(routineId, routine.exercises)
  }

  const deleteExercise = (routineId: string, exerciseId: string) => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return
    routine.exercises = routine.exercises.filter(e => e.id !== exerciseId)
    syncExercises(routineId, routine.exercises)
  }

  const toggleExerciseCompletion = (routineId: string, exerciseId: string) => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return
    const exercise = routine.exercises.find(e => e.id === exerciseId)
    if (!exercise) return
    
    exercise.isCompleted = !exercise.isCompleted
    syncExercises(routineId, routine.exercises)
  }

  const resetRoutine = (routineId: string) => {
    const routine = routines.value.find(r => r.id === routineId)
    if (!routine) return
    routine.exercises.forEach(e => e.isCompleted = false)
    syncExercises(routineId, routine.exercises)
  }

  return { routines, isLoading, fetchRoutines, addRoutine, deleteRoutine, addExerciseToRoutine, deleteExercise, toggleExerciseCompletion, resetRoutine }
})