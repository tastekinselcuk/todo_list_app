<template>
  <div
    @click="$emit('toggle', note.id)"
    class="flex items-center justify-between py-2.5 px-4 rounded-xl border transition-all duration-300 cursor-pointer group/note w-full"
    :class="[
      note.completed 
        ? 'bg-muted/30 border-border/30 opacity-80' 
        : 'bg-card/40 dark:bg-muted/5 border-border/40 hover:border-primary/20 hover:shadow-md hover:bg-card/70'
    ]"
  >
    <div class="flex items-center gap-3 flex-1 pr-3 min-w-0">
      
      <div v-if="note.completed" class="flex-shrink-0 animate-in zoom-in duration-200">
        <div class="w-4.5 h-4.5 rounded-md bg-primary flex items-center justify-center shadow-sm p-0.5">
          <svg class="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      
      <span 
        :class="[
          'font-semibold text-sm leading-snug transition-all duration-300 break-words w-full', 
          note.completed ? 'line-through text-muted-foreground/80' : 'text-foreground'
        ]"
      >
        {{ note.content }}
      </span>
    </div>

    <button
      @click.stop="$emit('delete', note.id)"
      class="opacity-0 group-hover/note:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all flex-shrink-0 ml-2"
    >
      <Trash2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'

defineProps<{
  note: any // Eğer TodoStore içinde QuickNote type'ı varsa buraya import edip onu kullanabilirsiniz.
}>()

defineEmits<{
  toggle: [id: string]
  delete: [id: string]
}>()
</script>