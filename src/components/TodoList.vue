<template>
  <div class="space-y-6">
    <div class="max-w-lg mx-auto">
      <PomodoroTimer />
    </div>
    
    <NotesTabs>
      <div class="space-y-4">
        <!-- Filters Section -->
        <div class="bg-white p-4 rounded-lg shadow-sm border space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <Filter class="h-5 w-5" />
              Filters
            </h2>
            <div class="flex gap-2">
              <button
                @click="showAddTodoDialog = true"
                class="px-3 h-8 rounded-md text-xs bg-primary text-white hover:bg-primary/90 flex items-center gap-1"
              >
                <Plus class="h-3 w-3" />
                Add Todo
              </button>
              <button
                @click="showCategoryDialog = true"
                class="px-3 h-8 rounded-md text-xs border border-primary text-primary hover:bg-primary/10 flex items-center gap-1"
              >
                <Tags class="h-3 w-3" />
                Add Category
              </button>
            </div>
          </div>
          
          <!-- Active Filters -->
          <div class="flex flex-wrap gap-2">
            <div
              v-for="category in todoStore.categories"
              :key="category.id"
              @click="handleCategoryToggle(category.id)"
              class="group flex items-center gap-2 h-8 rounded-md px-3 text-xs border cursor-pointer transition-colors relative"
              :class=" [
                selectedCategories.includes(category.id) 
                  ? 'text-white'
                  : 'hover:bg-accent'
              ]"
              :style="{
                backgroundColor: selectedCategories.includes(category.id) ? category.color : 'transparent',
                color: selectedCategories.includes(category.id) ? 'white' : category.color,
                borderColor: category.color,
              }"
            >
              <span>{{ category.name }}</span>
              <button
                v-if="todoStore.categories.length > 1"
                @click.stop="deleteCategory(category.id)"
                class="opacity-0 group-hover:opacity-100 hover:text-destructive ml-1"
              >
                <Trash2 class="h-3 w-3" />
              </button>
            </div>

            <!-- Priority Filter -->
            <div class="relative h-8">
              <select
                v-model="selectedPriority"
                class="h-full appearance-none rounded-md border border-input px-3 pr-8 text-xs cursor-pointer hover:bg-accent"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <ChevronDown class="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
            </div>

            <!-- Completed Toggle -->
            <button
              @click="showCompleted = !showCompleted"
              class="h-8 px-3 rounded-md text-xs border border-input hover:bg-accent flex items-center gap-2"
            >
              <Check class="h-3 w-3" :class="{ 'opacity-50': !showCompleted }" />
              {{ showCompleted ? 'Hide Completed' : 'Show Completed' }}
            </button>

            <!-- Clear Filters -->
            <button
              v-if="hasActiveFilters"
              @click="clearFilters"
              class="h-8 px-3 rounded-md text-xs text-red-500 border border-red-200 hover:bg-red-50 flex items-center gap-2"
            >
              <X class="h-3 w-3" />
              Clear Filters
            </button>
          </div>
        </div>

        <!-- Tasks List -->
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
      </div>
    </NotesTabs>

    <!-- Add Category Dialog -->
    <dialog
      ref="categoryDialog"
      class="p-6 rounded-lg shadow-lg bg-white w-full max-w-md border"
    >
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-lg font-semibold">Add Category</h2>
        <button
          @click="closeCategoryDialog"
          class="p-1.5 rounded-md hover:bg-accent"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <form @submit.prevent="handleAddCategory" class="space-y-6">
        <!-- Name Input -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Category Name</label>
          <input
            v-model="newCategory.name"
            type="text"
            class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Enter category name"
            required
          />
        </div>

        <!-- Color Selection -->
        <div class="space-y-4">
          <label class="text-sm font-medium">Color</label>
          
          <!-- Predefined Colors -->
          <div class="space-y-2">
            <div class="text-xs text-muted-foreground mb-2">Suggested Colors</div>
            <div class="grid grid-cols-8 gap-2">
              <button
                v-for="color in predefinedColors"
                :key="color"
                type="button"
                class="w-6 h-6 rounded-full transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
                :class="{ 'ring-2 ring-primary ring-offset-2': newCategory.color === color }"
                :style="{ backgroundColor: color }"
                @click="newCategory.color = color"
              />
            </div>
          </div>

          <!-- Custom Color Input -->
          <div class="space-y-2">
            <div class="text-xs text-muted-foreground">Custom Hex Color</div>
            <div class="flex items-start gap-3">
              <div class="flex-1">
                <div class="flex items-center gap-3">
                  <input
                    v-model="newCategory.color"
                    type="text"
                    class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="#000000"
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                  />
                  <div
                    class="w-10 h-10 rounded-md border shrink-0"
                    :style="{ backgroundColor: newCategory.color }"
                  />
                </div>
                <p class="text-xs text-muted-foreground mt-1">
                  Enter a hex color code (e.g., #FF0000 for red)
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t">
          <button
            type="button"
            @click="closeCategoryDialog"
            class="px-4 py-2 rounded-md text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 rounded-md bg-primary text-white text-sm hover:bg-primary/90"
          >
            Create Category
          </button>
        </div>
      </form>
    </dialog>

    <!-- Edit Todo Dialog -->
    <dialog
      ref="editDialog"
      class="p-6 rounded-lg shadow-lg bg-white w-full max-w-lg border"
    >
      <div class="flex justify-between items-center">
        <h2 class="text-lg font-semibold">Edit Task</h2>
        <button
          @click="closeEditDialog"
          class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <form @submit.prevent="handleEditSubmit" class="space-y-4">
        <div class="space-y-2">
          <label for="edit-title" class="text-sm font-medium">
            Title
          </label>
          <input
            id="edit-title"
            type="text"
            v-model="editingTodo.title"
            class="w-full rounded-md border border-input px-3 py-2"
            required
          />
        </div>
        
        <div class="space-y-2">
          <label for="edit-description" class="text-sm font-medium">
            Description
          </label>
          <textarea
            id="edit-description"
            v-model="editingTodo.description"
            class="w-full rounded-md border border-input px-3 py-2 min-h-[100px]"
          ></textarea>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label for="edit-dueDate" class="text-sm font-medium flex items-center gap-2">
              <Calendar class="h-4 w-4" />
              Due Date
            </label>
            <input
              id="edit-dueDate"
              type="date"
              v-model="editingTodo.dueDate"
              class="w-full rounded-md border border-input px-3 py-2"
            />
          </div>
          
          <div class="space-y-2">
            <label for="edit-priority" class="text-sm font-medium">
              Priority
            </label>
            <select
              id="edit-priority"
              v-model="editingTodo.priority"
              class="w-full rounded-md border border-input px-3 py-2"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        
        <div class="space-y-2">
          <label for="edit-category" class="text-sm font-medium">
            Category
          </label>
          <select
            id="edit-category"
            v-model="editingTodo.categoryId"
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
            Save Changes
          </button>
        </div>
      </form>
    </dialog>

    <AddTodoDialog
      v-model:open="showAddTodoDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, Trash2, Edit, Filter, GripVertical, Tags, X, Plus, ChevronDown } from 'lucide-vue-next'
import { useTodoStore, type Todo } from '@/stores/todo'
import draggable from 'vuedraggable'
import PomodoroTimer from './PomodoroTimer.vue'
import NotesTabs from './NotesTabs.vue'
import AddTodoDialog from './AddTodoDialog.vue'

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

// Add new refs and state
const showCategoryDialog = ref(false)
const categoryDialog = ref<HTMLDialogElement | null>(null)
const showAddTodoDialog = ref(false)
const newCategory = ref({
  name: '',
  color: '#3B82F6',
  icon: 'folder' // default icon
})

// Predefined colors for category
const predefinedColors = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
]

// Watch showCategoryDialog changes
watch(showCategoryDialog, (show) => {
  if (show) {
    categoryDialog.value?.showModal()
  } else {
    categoryDialog.value?.close()
  }
})

const closeCategoryDialog = () => {
  showCategoryDialog.value = false
  newCategory.value = { name: '', color: '#3B82F6', icon: 'folder' }
}

const handleAddCategory = () => {
  todoStore.addCategory(newCategory.value)
  closeCategoryDialog()
}

// Add computed property for active filters
const hasActiveFilters = computed(() => {
  return selectedCategories.value.length > 0 || 
         selectedPriority.value !== 'all' || 
         !showCompleted.value
})

const deleteCategory = async (categoryId: string) => {
  const todoCount = todoStore.getTodosInCategory(categoryId)
  
  let shouldDelete = false
  if (todoCount > 0) {
    shouldDelete = confirm(
      `This category contains ${todoCount} note${todoCount === 1 ? '' : 's'}. ` +
      'Deleting it will also permanently delete all associated notes. ' +
      'Are you sure you want to continue?'
    )
  } else {
    shouldDelete = confirm('Are you sure you want to delete this category?')
  }

  if (shouldDelete) {
    const result = todoStore.deleteCategory(categoryId)
    if (!result.success) {
      alert(result.message || 'Cannot delete the category')
    }
    // Remove the category from selected categories if it was selected
    const index = selectedCategories.value.indexOf(categoryId)
    if (index !== -1) {
      selectedCategories.value.splice(index, 1)
    }
  }
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