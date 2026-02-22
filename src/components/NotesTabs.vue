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
      
      <div class="space-y-2">
        <div
          v-for="note in todoStore.quickNotes"
          :key="note.id"
          class="flex items-center justify-between p-3 rounded-md border group hover:bg-accent"
        >
          <span>{{ note.content }}</span>
          <button
            @click="todoStore.deleteQuickNote(note.id)"
            class="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 class="h-4 w-4" />
          </button>
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
import { ref } from 'vue'
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

const addQuickNote = () => {
  if (quickNote.value.trim()) {
    todoStore.addQuickNote(quickNote.value)
    quickNote.value = ''
  }
}
</script>
