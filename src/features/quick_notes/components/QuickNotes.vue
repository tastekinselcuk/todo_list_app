<template>
  <div class="space-y-3 relative z-10 w-full flex flex-col items-center">
    
    <div v-if="canWrite" class="workspace-toolbar flex gap-2.5 workspace-content">
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
    
    <div class="space-y-3 workspace-content">
      
      <template v-for="(group, dateKey) in groupedNotes" :key="dateKey">
        <div class="space-y-1.5 w-full">
          <div class="flex h-5 items-center gap-2 px-1">
            <time :datetime="String(dateKey)" class="shrink-0 text-[11px] font-medium leading-5 text-muted-foreground">
              {{ formatDateHeader(String(dateKey)) }}
            </time>
            <div aria-hidden="true" class="h-px flex-1 bg-border/40"></div>
          </div>
          
          <div class="grid grid-cols-1 gap-2 w-full">
            <QuickNoteItem
              v-for="note in group.notes"
              :key="note.id"
              :note="note"
              @toggle="todoStore.toggleQuickNote"
              @delete="handleDeleteQuickNote"
            />
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
import { useSearchReveal } from '@/lib/searchNavigation'
import { useModuleAccess, useModuleLoad } from '@/lib/workspaceScope'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { computed } from 'vue'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import QuickNoteItem from './QuickNoteItem.vue'

const { canWrite } = useModuleAccess('quick')

const todoStore = useTodoStore()
const uiStore = useUIStore()
const { t, locale } = useI18n()

const quickNote = useWorkspaceDraft('quick-note', '')

const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const getTodayKey = () => localDateKey(new Date())
const getDateKey = (isoDate: string) => localDateKey(new Date(isoDate))

const formatDateHeader = (dateKey: string) => {
  const date = new Date(dateKey + 'T00:00:00')
  const today = new Date(getTodayKey() + 'T00:00:00')
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (dateKey === getTodayKey()) {
    return t('todo.today') 
  } else if (dateKey === localDateKey(yesterday)) {
    return t('todo.yesterday') 
  } else {
    return date.toLocaleDateString(locale?.value || 'tr', {
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

const addQuickNote = async () => {
  if (quickNote.value.trim()) {
    const value = quickNote.value
    const result = await todoStore.addQuickNote(value)
    if (!result.success) { uiStore.addToast(t('sharing.errors.SAVE_FAILED'), 'error'); return }
    if (quickNote.value === value) quickNote.value = ''
    // DÜZELTME: Toast mesajı artık dil dosyasından (i18n) çekiliyor
    uiStore.addToast(t('quickNotes.noteAdded') || 'Note added successfully', 'success') 
  }
}

const deletingQuickNotes = new Set<string>()
const handleDeleteQuickNote = async (noteId: string) => {
  if (!canWrite.value || deletingQuickNotes.has(noteId)) return
  deletingQuickNotes.add(noteId)
  try {
    const saved = await todoStore.deleteQuickNote(noteId)
    if (!saved) uiStore.addToast(t('sharing.errors.SAVE_FAILED'), 'error')
  } finally { deletingQuickNotes.delete(noteId) }
}

useModuleLoad(() => todoStore.fetchQuickNotes())
useSearchReveal('quick', async hit => { await todoStore.fetchQuickNotes(hit.record_id) })
</script>
