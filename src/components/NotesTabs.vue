<template>
  <div class="bg-card text-card-foreground p-4 rounded-lg shadow-sm border border-border space-y-4">
    <div class="border-b">
      <div class="flex gap-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="px-4 py-2 -mb-px font-medium text-sm transition-colors"
          :class="[
            activeTab === tab.id
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          ]"
        >
          {{ tab.name }}
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'quick'" class="space-y-4">
      <div class="flex gap-2">
        <input
          v-model="quickNote"
          @keyup.enter="addQuickNote"
          type="text"
          placeholder="Type a quick note and press Enter..."
          class="flex-1 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2"
        />
        <button
          @click="addQuickNote"
          class="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Add
        </button>
      </div>
      
      <div class="space-y-3">
        <template v-for="(group, dateKey) in groupedNotes" :key="dateKey">
          <!-- Date Header -->
          <div class="flex items-center gap-2 pt-2 first:pt-0">
            <div :class="['h-px flex-1', group.dividerColor]"></div>
            <span :class="['text-xs font-medium px-2', group.headerColor]">
              {{ formatDateHeader(dateKey) }}
            </span>
            <div :class="['h-px flex-1', group.dividerColor]"></div>
          </div>
          
          <!-- Notes for this date -->
          <div
            v-for="note in group.notes"
            :key="note.id"
            @click="todoStore.toggleQuickNote(note.id)"
            :class="[
              'flex items-center justify-between p-3 rounded-md border transition-all cursor-pointer group',
              group.bgColor,
              'border-muted hover:opacity-90',
              note.completed && 'opacity-60'
            ]"
          >
            <span :class="[note.completed && 'line-through text-muted-foreground']">
              {{ note.content }}
            </span>
            <button
              @click.stop="todoStore.deleteQuickNote(note.id)"
              class="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 hover:text-destructive ml-2"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </template>
        
        <div v-if="todoStore.quickNotes.length === 0" class="text-center py-8 text-muted-foreground">
          <p>No quick notes yet. Add one above!</p>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'secure'">
      <SecureNotes />
    </div>
    <div v-else>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { useTodoStore } from '@/stores/todo'
import SecureNotes from './SecureNotes.vue'

const todoStore = useTodoStore()
const activeTab = ref('detailed')
const quickNote = ref('')

const tabs = [
  { id: 'detailed', name: 'Detailed Notes' },
  { id: 'quick', name: 'Quick Notes' },
  { id: 'secure', name: 'Secure Notes' },
]

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
    return 'Today'
  } else if (dateKey === yesterday.toISOString().split('T')[0]) {
    return 'Yesterday'
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
  }
}

const groupedNotes = computed(() => {
  const groups: Record<string, { notes: typeof todoStore.quickNotes; bgColor: string; headerColor: string; dividerColor: string }> = {}
  
  // Group notes by date
  todoStore.quickNotes.forEach(note => {
    const dateKey = getDateKey(note.createdAt)
    if (!groups[dateKey]) {
      groups[dateKey] = { notes: [], bgColor: '', headerColor: '', dividerColor: '' }
    }
    groups[dateKey].notes.push(note)
  })
  
  // Sort by date descending (newest first) with uniform styling
  const sortedGroups: typeof groups = {}
  const sortedKeys = Object.keys(groups)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  
  sortedKeys.forEach((key) => {
    sortedGroups[key] = {
      notes: groups[key].notes,
      bgColor: 'bg-muted/40',
      headerColor: 'text-muted-foreground',
      dividerColor: 'bg-border'
    }
  })
  
  return sortedGroups
})

const addQuickNote = () => {
  if (quickNote.value.trim()) {
    todoStore.addQuickNote(quickNote.value)
    quickNote.value = ''
  }
}
</script>
