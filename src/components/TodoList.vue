<template>
  <div class="space-y-6">
    <div class="max-w-lg mx-auto">
      <PomodoroTimer />
    </div>
    <div class="bg-white p-4 rounded-lg shadow-sm border space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Filter class="h-5 w-5" />
          Filters
        </h2>
        <button
          @click="clearFilters"
          class="px-3 h-8 rounded-md text-xs hover:bg-accent hover:text-accent-foreground"
        >
          Clear Filters
        </button>
      </div>
      
      <div class="flex flex-wrap gap-2">
        <button
          v-for="category in todoStore.categories"
          :key="category.id"
          @click="handleCategoryToggle(category.id)"
          class="h-8 rounded-md px-3 text-xs"
          :class="[
            selectedCategories.includes(category.id) ? 'text-white' : '',
          ]"
          :style="{
            backgroundColor: selectedCategories.includes(category.id) ? category.color : 'transparent',
            color: selectedCategories.includes(category.id) ? 'white' : category.color,
            borderColor: category.color,
            borderWidth: '1px',
          }"
        >
          {{ category.name }}
        </button>
      </div>
      
      <div class="flex gap-4">
        <select
          v-model="selectedPriority"
          class="rounded-md border border-input px-3 py-1 text-sm"
        >
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        
        <button
          @click="showCompleted = !showCompleted"
          class="h-8 px-3 rounded-md text-xs border border-input hover:bg-accent hover:text-accent-foreground"
        >
          {{ showCompleted ? 'Hide Completed' : 'Show Completed' }}
        </button>
      </div>
    </div>

    <div class="space-y-4">
      <draggable
        v-model="filteredTodosArray"
        item-key="id"
        class="space-y-4"
        handle=".drag-handle"
        @end="handleDragEnd"
      >
        <template #item="{ element: todo }">
          <div
            class="flex items-center justify-between p-4 bg-white rounded-lg shadow-sm border-l-4"
            :class="{ 'opacity-60': todo.completed }"
            :style="{ borderLeftColor: getCategoryColor(todo.categoryId) }"
          >
            <div class="flex items-center space-x-4">
              <button
                class="p-2 rounded-md hover:bg-accent drag-handle"
                title="Drag to reorder"
              >
                <GripVertical class="h-4 w-4 text-gray-400" />
              </button>
              
              <button
                @click="todoStore.toggleTodo(todo.id)"
                class="p-2 rounded-md hover:bg-accent"
                :class="{ 'bg-green-100 text-green-600': todo.completed }"
              >
                <Check
                  class="h-5 w-5"
                  :class="{ 'opacity-100': todo.completed, 'opacity-30': !todo.completed }"
                />
              </button>
              
              <div>
                <h3
                  class="font-medium"
                  :class="{ 'line-through': todo.completed }"
                >
                  {{ todo.title }}
                </h3>
                <p
                  v-if="todo.description"
                  class="text-sm text-gray-500"
                >
                  {{ todo.description }}
                </p>
                <div class="flex items-center space-x-2 mt-1">
                  <span
                    class="inline-flex items-center px-2 py-1 rounded-full text-xs"
                    :style="{
                      backgroundColor: `${getCategoryColor(todo.categoryId)}20`,
                      color: getCategoryColor(todo.categoryId)
                    }"
                  >
                    {{ getCategoryName(todo.categoryId) }}
                  </span>
                  <span
                    v-if="todo.dueDate"
                    class="text-xs text-gray-500"
                  >
                    Due: {{ formatDate(todo.dueDate) }}
                  </span>
                  <span
                    class="text-xs px-2 py-1 rounded-full"
                    :class="{
                      'bg-red-100 text-red-600': todo.priority === 'high',
                      'bg-yellow-100 text-yellow-600': todo.priority === 'medium',
                      'bg-blue-100 text-blue-600': todo.priority === 'low'
                    }"
                  >
                    {{ todo.priority }}
                  </span>
                </div>
              </div>
            </div>
            
            <div class="flex items-center space-x-2">
              <button 
                @click="openEditDialog(todo)"
                class="p-2 rounded-md hover:bg-accent"
              >
                <Edit class="h-4 w-4" />
              </button>
              <button
                @click="todoStore.deleteTodo(todo.id)"
                class="p-2 rounded-md hover:bg-accent text-red-500 hover:text-red-600"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </template>
      </draggable>
    </div>

    <!-- Edit Todo Dialog -->
    <dialog
      ref="editDialog"
      class="p-6 rounded-lg shadow-lg bg-white w-full max-w-md"
    >
      <h2 class="text-lg font-semibold mb-4">Edit Todo</h2>
      <form @submit.prevent="handleEditSubmit" class="space-y-4">
        <div>
          <label class="block text-sm mb-1">Title</label>
          <input
            v-model="editingTodo.title"
            type="text"
            class="w-full rounded-md border p-2"
            required
          />
        </div>
        <div>
          <label class="block text-sm mb-1">Description</label>
          <textarea
            v-model="editingTodo.description"
            class="w-full rounded-md border p-2"
            rows="3"
          ></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Category</label>
          <select
            v-model="editingTodo.categoryId"
            class="w-full rounded-md border p-2"
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
        <div>
          <label class="block text-sm mb-1">Priority</label>
          <select
            v-model="editingTodo.priority"
            class="w-full rounded-md border p-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label class="block text-sm mb-1">Due Date</label>
          <input
            v-model="editingTodo.dueDate"
            type="date"
            class="w-full rounded-md border p-2"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            @click="closeEditDialog"
            class="px-4 py-2 rounded-md border hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 rounded-md bg-primary text-white hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check, Trash2, Edit, Filter, GripVertical } from 'lucide-vue-next'
import { useTodoStore, type Todo } from '@/stores/todo'
import draggable from 'vuedraggable'
import PomodoroTimer from './PomodoroTimer.vue'

const todoStore = useTodoStore()

const selectedCategories = ref<string[]>([])
const selectedPriority = ref('all')
const showCompleted = ref(true)

const filteredTodos = computed(() => {
  return todoStore.todos.filter((todo) => {
    const categoryMatch = selectedCategories.value.length === 0 || selectedCategories.value.includes(todo.categoryId)
    const priorityMatch = selectedPriority.value === 'all' || todo.priority === selectedPriority.value
    const completionMatch = showCompleted.value || !todo.completed
    return categoryMatch && priorityMatch && completionMatch
  })
})

// Convert filtered todos to an array for drag and drop
const filteredTodosArray = computed({
  get: () => filteredTodos.value,
  set: (newValue) => {
    // Update the order in the store
    todoStore.reorderTodos(newValue)
  }
})

const handleCategoryToggle = (categoryId: string) => {
  const index = selectedCategories.value.indexOf(categoryId)
  if (index === -1) {
    selectedCategories.value.push(categoryId)
  } else {
    selectedCategories.value.splice(index, 1)
  }
}

const clearFilters = () => {
  selectedCategories.value = []
  selectedPriority.value = 'all'
  showCompleted.value = true
}

const getCategoryColor = (categoryId: string) => {
  return todoStore.categories.find(c => c.id === categoryId)?.color
}

const getCategoryName = (categoryId: string) => {
  return todoStore.categories.find(c => c.id === categoryId)?.name
}

const editDialog = ref<HTMLDialogElement | null>(null)
const editingTodo = ref<Todo>({
  id: '',
  title: '',
  description: '',
  completed: false,
  categoryId: '',
  priority: 'low',
  dueDate: null,
})

// Update date display logic
const formatDate = (date: string | null) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString()
}

const openEditDialog = (todo: Todo) => {
  editingTodo.value = { ...todo }
  editDialog.value?.showModal()
}

const closeEditDialog = () => {
  editDialog.value?.close()
}

const handleEditSubmit = () => {
  if (editingTodo.value.id) {
    todoStore.updateTodo({ ...editingTodo.value })
    closeEditDialog()
  }
}

const handleDragEnd = () => {
  // Optional: Add any additional logic after drag ends
}
</script>

<style scoped>
.drag-handle {
  cursor: grab;
  touch-action: none;
}

.drag-handle:active {
  cursor: grabbing;
}
</style>