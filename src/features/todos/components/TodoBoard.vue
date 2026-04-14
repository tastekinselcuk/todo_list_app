<template>
  <div class="space-y-6 max-w-5xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">
    
    <TodoQuickAdd @open-category-dialog="showCategoryDialog = true" />
    <CategoryModal v-model:open="showCategoryDialog" />

    <TodoFilters
      v-model:selectedCategories="selectedCategories"
      v-model:selectedPriority="selectedPriority"
      v-model:showCompleted="showCompleted"
      v-model:isGrouped="isGrouped"
    />

    <div class="space-y-4 relative z-0">
      
      <template v-if="isGrouped">
        <div 
          v-for="(groupData, categoryId) in groupedTodos" 
          :key="categoryId"
          class="rounded-3xl border transition-all duration-300 p-4 sm:p-5"
          :style="{
            backgroundColor: `${groupData.category.color}08`, 
            borderColor: `${groupData.category.color}30`
          }"
        >
          <div class="flex items-center gap-3 mb-4">
            <div class="p-1.5 rounded-lg border shadow-sm" :style="{ backgroundColor: `${groupData.category.color}15`, borderColor: `${groupData.category.color}40`, color: groupData.category.color }">
              <FolderTree class="w-4 h-4" />
            </div>
            <h3 class="text-sm font-bold tracking-tight" :style="{ color: groupData.category.color }">{{ groupData.category.name }}</h3>
            <div class="flex-1 h-px bg-gradient-to-r from-transparent to-transparent" :style="{ backgroundImage: `linear-gradient(to right, ${groupData.category.color}40, transparent)` }"></div>
          </div>
            
          <div class="space-y-2">
            <draggable
              v-model="groupData.todos"
              item-key="id"
              class="space-y-2 w-full"
              handle=".drag-handle"
              @end="handleDragEnd"
            >
              <template #item="{ element: todo }">
                <TodoCardItem 
                  :todo="todo" 
                  :color="groupData.category.color" 
                  :categoryName="groupData.category.name" 
                  @toggle="todoStore.toggleTodo(todo.id)" 
                  @delete="handleDeleteTodo(todo.id)" 
                />
              </template>
            </draggable>
          </div>
        </div>
      </template>
      
      <draggable
        v-else
        v-model="filteredTodosArray"
        item-key="id"
        class="space-y-2 w-full"
        handle=".drag-handle"
        @end="handleDragEnd"
      >
        <template #item="{ element: todo }">
          <TodoCardItem 
            :todo="todo" 
            :color="getCategoryColor(todo.categoryId)" 
            :categoryName="getCategoryName(todo.categoryId)" 
            @toggle="todoStore.toggleTodo(todo.id)" 
            @delete="handleDeleteTodo(todo.id)" 
          />
        </template>
      </draggable>
      
      <div v-if="filteredTodosArray.length === 0" class="text-center py-16 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-[2rem] bg-muted/5 w-full">
        <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <CheckSquare class="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p class="text-sm font-semibold text-muted-foreground/80">{{ $t('todo.noTasks') || 'Görev bulunamadı' }}</p>
      </div>
    </div>


  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { FolderTree, CheckSquare } from 'lucide-vue-next'
import { useTodoStore, type Todo } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'

import TodoQuickAdd from './TodoQuickAdd.vue'
import TodoFilters from './TodoFilters.vue'
import TodoCardItem from './TodoCard.vue'
import CategoryModal from './CategoryModal.vue'

const todoStore = useTodoStore()
const uiStore = useUIStore()
const { t } = useI18n()

const selectedCategories = ref<string[]>([])
const selectedPriority = ref('all')
const showCompleted = ref(true)
const isGrouped = ref(false)

const showCategoryDialog = ref(false)

onMounted(async () => {
  await Promise.all([
    todoStore.fetchCategories(),
    todoStore.fetchTodos()
  ])
})

const filteredTodos = computed(() => {
  return todoStore.todos.filter((todo) => {
    const categoryMatch = selectedCategories.value.length === 0 || (todo.categoryId !== null && selectedCategories.value.includes(todo.categoryId))
    const priorityMatch = selectedPriority.value === 'all' || todo.priority === selectedPriority.value
    const completionMatch = showCompleted.value || !todo.completed
    return categoryMatch && priorityMatch && completionMatch
  })
})

const filteredTodosArray = computed({
  get: () => {
    const todos = [...filteredTodos.value]
    return todos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },
  set: (newValue) => { todoStore.reorderTodos(newValue) }
})

const groupedTodos = computed(() => {
  const groups: { [key: string]: { category: any, todos: Todo[] } } = {}
  const categoriesToShow = selectedCategories.value.length > 0 ? todoStore.categories.filter(cat => selectedCategories.value.includes(cat.id)) : todoStore.categories
  
  categoriesToShow.forEach(category => {
    const categoryTodos = filteredTodos.value.filter(todo => todo.categoryId === category.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (categoryTodos.length > 0) groups[category.id] = { category, todos: categoryTodos }
  })
  return groups
})

const getCategoryColor = (categoryId: string) => todoStore.categories.find(c => c.id === categoryId)?.color || '#3B82F6'
const getCategoryName = (categoryId: string) => todoStore.categories.find(c => c.id === categoryId)?.name || 'Kategori'

const handleDragEnd = () => {
  if (isGrouped.value) {
    Object.values(groupedTodos.value).forEach(groupData => {
      if (groupData.todos.length > 0) todoStore.reorderTodos(groupData.todos)
    })
  }
}

const handleDeleteTodo = async (todoId: string) => {
  const isConfirmed = await uiStore.showConfirm(t('todo.deleteTask') || 'Görevi Sil', t('todo.deleteTaskConfirm') || 'Bu görevi kalıcı olarak silmek istediğinize emin misiniz?', t('todo.delete') || 'Sil', t('todo.cancel') || 'İptal')
  if (isConfirmed) {
    todoStore.deleteTodo(todoId)
    uiStore.addToast(t('todo.taskDeleted') || 'Görev silindi', 'info')
  }
}
</script>

<style scoped>
.drag-handle { touch-action: none; }
.drag-handle:active { cursor: grabbing; }
</style>