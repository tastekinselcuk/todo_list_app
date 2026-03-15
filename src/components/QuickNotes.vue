<template>
  <div class="space-y-5 animate-in fade-in zoom-in-95 duration-500 relative z-10 w-full flex flex-col items-center">
    
    <div class="flex gap-2.5 max-w-5xl w-full">
      <div class="relative flex-1 group">
        <input
          v-model="quickNote"
          @keyup.enter="addQuickNote"
          type="text"
          :placeholder="$t('quickNotes.placeholder')"
          class="w-full h-10 pl-4 pr-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 focus:bg-background transition-all outline-none text-sm"
        />
      </div>
      <button
        @click="addQuickNote"
        class="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm hover:shadow-lg transition-all disabled:opacity-50 text-xs"
        :disabled="!quickNote.trim()"
      >
        {{ $t('quickNotes.add') }}
      </button>
    </div>
    
    <div class="space-y-6 pt-2 max-w-5xl w-full">
      <template v-for="(group, dateKey) in groupedNotes" :key="dateKey">
        
        <div class="space-y-3 w-full">
          <div class="flex items-center gap-3">
            <div class="h-px flex-1 bg-gradient-to-r from-transparent via-border/50 to-transparent"></div>
            <span class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
              {{ formatDateHeader(dateKey) }}
            </span>
            <div class="h-px flex-1 bg-gradient-to-l from-transparent via-border/50 to-transparent"></div>
          </div>
          
          <div class="grid grid-cols-1 gap-2 w-full">
            <div
              v-for="note in group.notes"
              :key="note.id"
              @click="todoStore.toggleQuickNote(note.id)"
              class="flex items-center justify-between py-2.5 px-4 rounded-xl border transition-all duration-300 cursor-pointer group/note w-full"
              :class="[
                note.completed 
                  ? 'bg-muted/30 border-border/30 opacity-80' 
                  : 'bg-card/40 dark:bg-muted/5 border-border/40 hover:border-primary/20 hover:shadow-md hover:bg-card/70'
              ]"
            >
              <div class="flex items-center gap-3 flex-1 pr-3 min-w-0">
                <div v-if="note.completed" class="flex-shrink-0 animate-in zoom-in duration-200">
                  <div class="w-4.5 h-4.5 rounded-md bg-primary flex items-center justify-center shadow-sm">
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
                @click.stop="handleDeleteQuickNote(note.id)"
                class="opacity-0 group-hover/note:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all flex-shrink-0 ml-2"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </template>
      
      <div v-if="todoStore.quickNotes.length === 0" class="text-center py-12 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-3xl bg-muted/5 w-full">
        <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
          <svg class="w-4 h-4 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </div>
        <p class="text-xs font-semibold text-muted-foreground/80">{{ $t('quickNotes.noNotes') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { useTodoStore } from '@/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const todoStore = useTodoStore()
const uiStore = useUIStore()
const { t } = useI18n()

const quickNote = ref('')

const getTodayKey = () => {
  const today = new Date()
  return today.toISOString().split('T')[0]
}

const getDateKey = (isoDate: string) => {
  return isoDate.split('T')[0]
}

const formatDateHeader = (dateKey: string) => {
  const date = new Date(dateKey + 'T00:00:00')
  const today = new Date(getTodayKey() + 'T00:00:00')
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (dateKey === getTodayKey()) {
    return t('todo.today') 
  } else if (dateKey === yesterday.toISOString().split('T')[0]) {
    return t('todo.yesterday') 
  } else {
    return date.toLocaleDateString(t('workspace.language') === 'Dil' ? 'tr-TR' : 'en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined 
    })
  }
}

const groupedNotes = computed(() => {
  const groups: Record<string, { notes: typeof todoStore.quickNotes }> = {}
  
  todoStore.quickNotes.forEach(note => {
    const dateKey = getDateKey(note.createdAt)
    if (!groups[dateKey]) {
      groups[dateKey] = { notes: [] }
    }
    groups[dateKey].notes.push(note)
  })
  
  const sortedGroups: typeof groups = {}
  const sortedKeys = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  
  sortedKeys.forEach((key) => {
    sortedGroups[key] = {
      notes: groups[key].notes
    }
  })
  return sortedGroups
})

const addQuickNote = () => {
  if (quickNote.value.trim()) {
    todoStore.addQuickNote(quickNote.value)
    quickNote.value = ''
    uiStore.addToast('Not başarıyla eklendi', 'success') 
  }
}

const handleDeleteQuickNote = async (noteId: string) => {
  const isConfirmed = await uiStore.showConfirm(
    'Notu Sil', 
    'Bu hızlı notu silmek istediğinize emin misiniz?', 
    'Sil', 
    'İptal'
  )
  
  if (isConfirmed) {
    todoStore.deleteQuickNote(noteId)
    uiStore.addToast('Not silindi', 'info')
  }
}

onMounted(() => {
  todoStore.fetchQuickNotes()
})
</script>