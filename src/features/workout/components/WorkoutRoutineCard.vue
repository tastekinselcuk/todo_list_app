<template>
  <div
    class="relative p-5 rounded-2xl border border-border bg-card hover:border-teal-500/30 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[140px]"
    @click="$emit('open', routine)"
  >
    <div>
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-semibold px-2 py-1 rounded bg-muted text-muted-foreground uppercase tracking-wider">
          {{ routine.day_of_week === 'Any' ? $t('workout.anyDay') : $t(`workout.${routine.day_of_week.toLowerCase()}`) }}
        </span>
        <button @click.stop="$emit('delete', routine.id)" class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
      <h3 class="text-lg font-bold text-foreground">{{ routine.title }}</h3>
    </div>
    
    <div class="mt-4 flex items-center justify-between">
      <p class="text-sm text-muted-foreground">{{ $t('workout.exercisesCount', { count: routine.exercises.length }) }}</p>
      <div class="flex items-center gap-1 text-teal-500 font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 duration-300">
        {{ $t('workout.start') }} <ArrowRight class="w-4 h-4" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Trash2, ArrowRight } from 'lucide-vue-next'
import type { Routine } from '@/features/workout/stores/workout'

defineProps<{
  routine: Routine
}>()

defineEmits<{
  open: [routine: Routine]
  delete: [id: string]
}>()
</script>