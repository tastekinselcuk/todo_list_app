<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 bg-black/50"
      @click="$emit('update:open', false)"
    ></div>
    
    <div
      v-if="open"
      class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg"
    >
      <div class="flex justify-between items-center">
        <h2 class="text-lg font-semibold">Add New Task</h2>
        <button
          @click="$emit('update:open', false)"
          class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="space-y-2">
          <label for="title" class="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            type="text"
            v-model="title"
            class="w-full rounded-md border border-input px-3 py-2"
            required
          />
        </div>
        
        <div class="space-y-2">
          <label for="description" class="text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            v-model="description"
            class="w-full rounded-md border border-input px-3 py-2 min-h-[100px]"
          ></textarea>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label for="dueDate" class="text-sm font-medium flex items-center gap-2">
              <Calendar class="h-4 w-4" />
              Due Date
            </label>
            <input
              id="dueDate"
              type="date"
              v-model="dueDate"
              class="w-full rounded-md border border-input px-3 py-2"
            />
          </div>
          
          <div class="space-y-2">
            <label for="priority" class="text-sm font-medium">
              Priority
            </label>
            <select
              id="priority"
              v-model="priority"
              class="w-full rounded-md border border-input px-3 py-2"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        
        <div class="space-y-2">
          <label for="category" class="text-sm font-medium">
            Category
          </label>
          <select
            id="category"
            v-model="categoryId"
            class="w-full rounded-md border border-input px-3 py-2"
          >
            <option
              v-for="category in todoStore.categories"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select>
        </div>
        
        <div class="flex justify-end">
          <button
            type="submit"
            class="w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          >
            Add Task
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Calendar, X } from 'lucide-vue-next'
import { useTodoStore } from '@/stores/todo'

// Add prop definition for open
defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const todoStore = useTodoStore()

const title = ref('')
const description = ref('')
const dueDate = ref('')
const priority = ref<'low' | 'medium' | 'high'>('medium')
const categoryId = ref(todoStore.categories[0]?.id || '')

const handleSubmit = () => {
  todoStore.addTodo({
    title: title.value,
    description: description.value,
    dueDate: dueDate.value || null, // Convert to string or null
    priority: priority.value,
    categoryId: categoryId.value,
    completed: false,
  })

  // Reset form
  title.value = ''
  description.value = ''
  dueDate.value = ''
  priority.value = 'medium'
  categoryId.value = todoStore.categories[0]?.id || ''
  
  emit('update:open', false)
}
</script>