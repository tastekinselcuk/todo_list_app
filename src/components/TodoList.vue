<template>
  <div class="space-y-6">
    <NotesTabs :initialTab="initialTab">
      
      <div class="space-y-6 max-w-5xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">
        
        <div class="flex flex-col sm:flex-row gap-3 bg-card/40 backdrop-blur-xl p-2.5 rounded-2xl border border-border/50 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 relative z-20">
          
          <div class="relative flex-1 flex items-center pl-2">
            <Plus class="w-5 h-5 text-muted-foreground mr-2" />
            <input
              v-model="quickTodoTitle"
              @keyup.enter="handleInlineAdd"
              type="text"
              :placeholder="$t('todo.addTodo') + '...'"
              class="w-full h-10 bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none text-sm font-medium"
            />
          </div>
          
          <div class="flex items-center gap-2 pr-1 border-t sm:border-t-0 sm:border-l border-border/50 pt-2 sm:pt-0 sm:pl-3 relative">
            
            <CustomSelect
              :modelValue="quickTodoPriority"
              @update:modelValue="quickTodoPriority = $event as 'low'|'medium'|'high'"
              :options="priorityOptions"
              variant="ghost"
              :colorClass="priorityColorClass(quickTodoPriority)"
            />

            <div class="flex items-center gap-1">
              <CustomSelect
                v-model="quickTodoCategoryId"
                :options="categoryOptions"
                placeholder="Kategori Seç"
                variant="ghost"
              />
              
              <button
                @click="showCategoryDialog = true"
                class="group/add w-10 h-10 flex items-center justify-center rounded-xl bg-muted/40 hover:bg-primary/10 border border-transparent hover:border-primary/30 text-muted-foreground hover:text-primary transition-all overflow-hidden relative"
                title="Yeni Kategori Ekle"
              >
                <Plus class="w-4 h-4 transition-transform group-hover/add:scale-110" />
              </button>
            </div>

            <button
              @click="handleInlineAdd"
              class="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 text-xs"
              :disabled="!quickTodoTitle.trim() || !quickTodoCategoryId"
            >
              {{ $t('todo.addTodo') }}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 relative z-10">
          
          <div class="flex items-center gap-1.5 p-1 bg-muted/30 rounded-2xl border border-border/40 overflow-x-auto hide-scrollbar">
            <button
              @click="clearAllFilters"
              class="px-4 py-1.5 text-xs font-semibold rounded-xl border transition-all"
              :class="!hasActiveFilters ? 'bg-card text-foreground shadow-sm border-border/50' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card/50 hover:border-border/30'"
            >
              Tümü
            </button>

            <div 
              v-for="category in todoStore.categories" 
              :key="category.id"
              @click="handleCategoryToggle(category.id)"
              class="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer relative"
              :class="selectedCategories.includes(category.id) ? 'shadow-sm border-transparent' : 'border-border/40 hover:bg-card/50 hover:border-border/60'"
              :style="{
                backgroundColor: selectedCategories.includes(category.id) ? category.color : 'transparent',
                color: selectedCategories.includes(category.id) ? '#fff' : 'inherit'
              }"
            >
              <span v-if="!selectedCategories.includes(category.id)" class="w-2 h-2 rounded-full" :style="{ backgroundColor: category.color }"></span>
              <span>{{ category.name }}</span>
              <button
                v-if="todoStore.categories.length > 1"
                @click.stop="handleDeleteCategory(category.id)"
                class="opacity-0 group-hover:opacity-100 hover:text-red-300 ml-1 transition-opacity"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div class="w-px h-6 bg-border/50 hidden sm:block"></div>

          <div class="flex gap-2">
            <CustomSelect
              :modelValue="selectedPriority"
              @update:modelValue="selectedPriority = $event"
              :options="filterPriorityOptions"
              size="sm"
              variant="ghost"
              :colorClass="priorityColorClass(selectedPriority)"
            />

            <button
              @click="showCompleted = !showCompleted"
              class="h-8 px-3 rounded-xl text-[11px] font-semibold border transition-colors flex items-center gap-1.5"
              :class="showCompleted ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-transparent border-border/50 text-muted-foreground hover:bg-muted'"
            >
              <Check class="w-3.5 h-3.5" /> {{ $t('todo.showCompleted') }}
            </button>
            <button
              @click="isGrouped = !isGrouped"
              class="h-8 px-3 rounded-xl text-[11px] font-semibold border transition-colors flex items-center gap-1.5"
              :class="isGrouped ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-transparent border-border/50 text-muted-foreground hover:bg-muted'"
            >
              <FolderTree class="w-3.5 h-3.5" /> {{ $t('todo.groupNotes') }}
            </button>
          </div>
        </div>

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
                    <TodoCardItem :todo="todo" :color="groupData.category.color" :categoryName="groupData.category.name" @toggle="todoStore.toggleTodo(todo.id)" @edit="openEditDialog(todo)" @delete="handleDeleteTodo(todo.id)" />
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
              <TodoCardItem :todo="todo" :color="getCategoryColor(todo.categoryId)" :categoryName="getCategoryName(todo.categoryId)" @toggle="todoStore.toggleTodo(todo.id)" @edit="openEditDialog(todo)" @delete="handleDeleteTodo(todo.id)" />
            </template>
          </draggable>
          
          <div v-if="filteredTodosArray.length === 0" class="text-center py-16 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-[2rem] bg-muted/5 w-full">
            <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <CheckSquare class="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p class="text-sm font-semibold text-muted-foreground/80">Görev bulunamadı</p>
          </div>
        </div>

      </div>
    </NotesTabs>

    <dialog
      ref="categoryDialog"
      class="w-[90vw] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-card/90 backdrop-blur-2xl text-card-foreground shadow-2xl p-6 space-y-5"
    >
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
        <h2 class="text-base font-bold tracking-tight">{{ $t('todo.addCategory') }}</h2>
        <button @click="closeCategoryDialog" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-4 h-4" /></button>
      </div>

      <form @submit.prevent="handleAddCategory" class="space-y-5">
        <div class="space-y-2">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.categoryName') }}</label>
          <input
            v-model="newCategory.name"
            type="text"
            class="w-full h-10 rounded-xl border border-border/50 bg-background/50 px-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            :placeholder="$t('todo.enterCategoryName')"
            required
          />
        </div>

        <div class="space-y-3">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.color') }}</label>
          <div class="grid grid-cols-8 gap-2">
            <button
              v-for="color in predefinedColors"
              :key="color"
              type="button"
              class="w-7 h-7 rounded-full transition-all hover:scale-110 focus:outline-none"
              :class="{ 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110 shadow-sm': newCategory.color === color }"
              :style="{ backgroundColor: color }"
              @click="newCategory.color = color"
            />
          </div>
        </div>

        <div class="space-y-2 pt-3 border-t border-border/50">
          <label class="text-xs font-semibold text-muted-foreground ml-1">Özel Hex Renk</label>
          <div class="flex items-center gap-3">
            <input
              v-model="newCategory.color"
              type="text"
              class="flex-1 h-10 rounded-xl border border-border/50 bg-background/50 px-4 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="#3B82F6"
              pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
            />
            <div class="w-10 h-10 rounded-xl border shrink-0 shadow-sm" :style="{ backgroundColor: newCategory.color }" />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" @click="closeCategoryDialog" class="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-muted">{{ $t('todo.cancel') }}</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-sm">{{ $t('todo.createCategory') }}</button>
        </div>
      </form>
    </dialog>

    <dialog
      ref="editDialog"
      class="w-[90vw] max-w-md rounded-[2rem] border border-white/10 dark:border-white/5 bg-card/90 backdrop-blur-2xl text-card-foreground shadow-2xl p-6 space-y-5 overflow-visible"
    >
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
        <h2 class="text-base font-bold tracking-tight">{{ $t('todo.editTask') }}</h2>
        <button @click="closeEditDialog" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-4 h-4" /></button>
      </div>

      <form @submit.prevent="handleEditSubmit" class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.title') }}</label>
          <input type="text" v-model="editingTodo.title" class="w-full h-10 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" required />
        </div>
        
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.description') }}</label>
          <textarea v-model="editingTodo.description" class="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] resize-none"></textarea>
        </div>
        
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-muted-foreground ml-1 flex items-center gap-1"><Calendar class="w-3 h-3"/> {{ $t('todo.dueDate') }}</label>
            <input type="date" v-model="editingTodo.dueDate" class="w-full h-10 rounded-xl border border-border/50 bg-background/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.priority') }}</label>
            <CustomSelect
              :modelValue="editingTodo.priority"
              @update:modelValue="editingTodo.priority = $event as 'low'|'medium'|'high'"
              :options="priorityOptionsLocalized"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.category') }}</label>
          <CustomSelect
            v-model="editingTodo.categoryId"
            :options="categoryOptions"
          />
        </div>
        
        <div class="flex justify-end pt-3">
          <button type="submit" class="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 shadow-sm">{{ $t('todo.saveChanges') }}</button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, h } from 'vue'
import { Check, Trash2, Edit, GripVertical, Plus, ChevronDown, Calendar, Clock, FolderTree, X, CheckSquare, ChevronsUp, Minus } from 'lucide-vue-next'
import { useTodoStore, type Todo } from '@/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'
import NotesTabs from './NotesTabs.vue'
import CustomSelect from './ui/CustomSelect.vue'

const props = defineProps({
  initialTab: { type: String, default: 'detailed' }
})

const todoStore = useTodoStore()
const uiStore = useUIStore() // YENİ EKLENDİ
const { t } = useI18n()

const quickTodoTitle = ref('')
const quickTodoPriority = ref<'low'|'medium'|'high'>('low')
const quickTodoCategoryId = ref('')

const selectedCategories = ref<string[]>([])
const selectedPriority = ref('all')
const showCompleted = ref(true)
const isGrouped = ref(false)

const priorityOptions = [
  { value: 'low', label: 'Düşük' },
  { value: 'medium', label: 'Orta' },
  { value: 'high', label: 'Yüksek' }
]

const priorityOptionsLocalized = computed(() => [
  { value: 'low', label: t('todo.low') },
  { value: 'medium', label: t('todo.medium') },
  { value: 'high', label: t('todo.high') }
])

const filterPriorityOptions = [
  { value: 'all', label: 'Tüm Öncelikler' },
  ...priorityOptions
]

const categoryOptions = computed(() =>
  todoStore.categories.map(cat => ({ value: cat.id, label: cat.name }))
)

const priorityColorClass = (priority: string) => {
  switch (priority) {
    case 'low': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
    case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
    case 'high': return 'text-rose-500 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20'
    default: return 'bg-muted/40 hover:bg-muted/60 border-transparent text-muted-foreground'
  }
}

const clearAllFilters = () => {
  selectedCategories.value = []
  selectedPriority.value = 'all'
  showCompleted.value = true
  isGrouped.value = false
}

const hasActiveFilters = computed(() => {
  return selectedCategories.value.length > 0 || 
         selectedPriority.value !== 'all' || 
         !showCompleted.value || 
         isGrouped.value
})

onMounted(() => {
  if (todoStore.categories.length > 0 && !quickTodoCategoryId.value) {
    quickTodoCategoryId.value = todoStore.categories[0].id
  }
})

const handleInlineAdd = () => {
  if (!quickTodoTitle.value.trim() || !quickTodoCategoryId.value) return
  
  todoStore.addTodo({
    title: quickTodoTitle.value.trim(),
    description: '',
    categoryId: quickTodoCategoryId.value,
    priority: quickTodoPriority.value,
    dueDate: null,
    completed: false
  })
  
  uiStore.addToast('Görev eklendi', 'success')
  quickTodoTitle.value = ''
}

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

const handleCategoryToggle = (categoryId: string) => {
  const index = selectedCategories.value.indexOf(categoryId)
  if (index === -1) selectedCategories.value.push(categoryId)
  else selectedCategories.value.splice(index, 1)
}

const getCategoryColor = (categoryId: string) => todoStore.categories.find(c => c.id === categoryId)?.color || '#3B82F6'
const getCategoryName = (categoryId: string) => todoStore.categories.find(c => c.id === categoryId)?.name || 'Kategori'

const editDialog = ref<HTMLDialogElement | null>(null)
const editingTodo = ref<Todo>({ id: '', title: '', description: '', completed: false, categoryId: '', priority: 'low', dueDate: null, createdAt: '', updatedAt: '' })

const openEditDialog = (todo: Todo) => { editingTodo.value = { ...todo }; editDialog.value?.showModal() }
const closeEditDialog = () => editDialog.value?.close()
const handleEditSubmit = () => { 
  if (editingTodo.value.id) { 
    todoStore.updateTodo({ ...editingTodo.value }); 
    closeEditDialog() 
    uiStore.addToast('Görev güncellendi', 'info')
  } 
}

const handleDragEnd = () => {
  if (isGrouped.value) {
    Object.values(groupedTodos.value).forEach(groupData => {
      if (groupData.todos.length > 0) todoStore.reorderTodos(groupData.todos)
    })
  }
}

const showCategoryDialog = ref(false)
const categoryDialog = ref<HTMLDialogElement | null>(null)
const newCategory = ref({ name: '', color: '#3B82F6', icon: 'folder' })
const predefinedColors = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6']

watch(showCategoryDialog, (show) => show ? categoryDialog.value?.showModal() : categoryDialog.value?.close())
const closeCategoryDialog = () => { showCategoryDialog.value = false; newCategory.value = { name: '', color: '#3B82F6', icon: 'folder' } }

const handleAddCategory = async () => {
  const result = await todoStore.addCategory(newCategory.value)
  if (result.success) {
    closeCategoryDialog()
    uiStore.addToast('Kategori eklendi', 'success')
  } else {
    uiStore.addToast(result.message || t('todo.cannotDelete'), 'error')
  }
}

// YENİ: uiStore ile Modern Confirm Modal kullanılarak kategori silme
const handleDeleteCategory = async (categoryId: string) => {
  const todoCount = todoStore.getTodosInCategory(categoryId)
  const message = todoCount > 0 
    ? t('todo.deleteCategoryWarning', { count: todoCount }) 
    : t('todo.deleteCategoryConfirm')
    
  const isConfirmed = await uiStore.showConfirm('Kategoriyi Sil', message, 'Sil', 'İptal')
  
  if (isConfirmed) {
    const result = await todoStore.deleteCategory(categoryId)
    if (!result.success) {
      uiStore.addToast(result.message || t('todo.cannotDelete'), 'error')
      return
    }
    
    uiStore.addToast('Kategori silindi', 'success')
    const index = selectedCategories.value.indexOf(categoryId)
    if (index !== -1) selectedCategories.value.splice(index, 1)
  }
}

// YENİ: uiStore ile Modern Confirm Modal kullanılarak todo silme
const handleDeleteTodo = async (todoId: string) => {
  const isConfirmed = await uiStore.showConfirm('Görevi Sil', 'Bu görevi kalıcı olarak silmek istediğinize emin misiniz?', 'Sil', 'İptal')
  if (isConfirmed) {
    todoStore.deleteTodo(todoId)
    uiStore.addToast('Görev silindi', 'info')
  }
}

const isOverdue = (date: string | null) => date ? new Date(date) < new Date(new Date().setHours(0, 0, 0, 0)) : false
const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString() : ''
const formatRelativeTime = (date: string) => {
  if (!date) return ''
  const diffDays = Math.floor(Math.abs(new Date().getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return t('todo.today')
  if (diffDays === 1) return t('todo.yesterday')
  return formatDate(date)
}

// GÜNCELLENDİ: Öncelik ikonlarını dairesel background (halo) içine alıyor
const getPriorityIcon = (priority: string) => {
  if (priority === 'high') {
    return h('div', { class: 'p-1 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/20' }, [
      h(ChevronsUp, { class: 'w-3 h-3' })
    ])
  }
  if (priority === 'medium') {
    return h('div', { class: 'p-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20' }, [
      h(Minus, { class: 'w-3 h-3' })
    ])
  }
  return h('div', { class: 'p-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20' }, [
    h(ChevronDown, { class: 'w-3 h-3' })
  ])
}

// Render Function Component for Todo Card
const TodoCardItem = {
  props: ['todo', 'color', 'categoryName'],
  emits: ['toggle', 'edit', 'delete'],
  setup(props: any, { emit }: any) {
    return () => h('div', {
      class: [
        'flex items-center justify-between py-3 px-4 rounded-2xl border transition-all duration-300 group/item w-full relative overflow-hidden',
        props.todo.completed ? 'bg-muted/20 border-border/30 opacity-75' : 'bg-card/40 border-border/50 hover:border-primary/30 hover:shadow-sm'
      ]
    }, [
      props.todo.completed 
        ? null
        : h('div', { class: 'absolute inset-y-0 left-0 w-0.5', style: { backgroundColor: props.color } }),

      h('div', { class: 'flex items-center gap-3 flex-1 min-w-0 pr-2 z-10' }, [
        h('button', { class: 'cursor-grab text-muted-foreground/30 hover:text-muted-foreground transition-colors drag-handle shrink-0' }, [h(GripVertical, { class: 'w-4 h-4' })]),
        
        h('div', { class: 'shrink-0 cursor-pointer', onClick: () => emit('toggle') }, [
          h('div', { 
            class: ['w-5 h-5 rounded-md border-[1.5px] flex items-center justify-center transition-colors', props.todo.completed ? 'bg-primary border-primary shadow-sm' : 'border-border group-hover/item:border-primary/50']
          }, props.todo.completed ? [h(Check, { class: 'w-3.5 h-3.5 text-primary-foreground' })] : [])
        ]),
        
        h('div', { class: 'flex flex-col min-w-0 overflow-hidden ml-1 flex-1' }, [
          h('span', { 
            class: ['font-semibold text-sm truncate transition-colors duration-300', props.todo.completed ? 'line-through text-muted-foreground/80' : 'text-foreground'] 
          }, props.todo.title),
          
          props.todo.description 
            ? h('p', { class: 'text-xs text-muted-foreground/80 mt-0.5 line-clamp-1' }, props.todo.description) 
            : null,
          
          h('div', { class: 'flex items-center gap-2.5 mt-1.5 flex-wrap' }, [
            
            h('span', { 
              class: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border', 
              style: { backgroundColor: `${props.color}10`, color: props.color, borderColor: `${props.color}30` } 
            }, [
              h('span', { class: 'w-1.5 h-1.5 rounded-full', style: { backgroundColor: props.color } }),
              props.categoryName
            ]),
            
            h('span', { 
              class: 'inline-flex items-center',
              title: `Öncelik: ${props.todo.priority}`
            }, [getPriorityIcon(props.todo.priority)]),
            
            props.todo.dueDate 
              ? h('span', { 
                  class: `inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-colors ${
                    isOverdue(props.todo.dueDate) 
                      ? 'bg-destructive/10 border-destructive/20 text-destructive' 
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
                  }`
                }, [h(Calendar, { class: 'w-3 h-3' }), formatDate(props.todo.dueDate)]) 
              : null,
            
            props.todo.createdAt 
              ? h('span', { 
                  class: 'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-muted border border-border text-muted-foreground'
                }, [h(Clock, { class: 'w-3 h-3' }), formatRelativeTime(props.todo.createdAt)]) 
              : null
          ])
        ])
      ]),
      
      h('div', { class: 'flex items-center opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0 z-10' }, [
        h('button', { class: 'p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors', onClick: () => emit('edit') }, [h(Edit, { class: 'w-4 h-4' })]),
        h('button', { class: 'p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors ml-1', onClick: () => emit('delete') }, [h(Trash2, { class: 'w-4 h-4' })])
      ])
    ])
  }
}
</script>

<style scoped>
.drag-handle { touch-action: none; }
.drag-handle:active { cursor: grabbing; }
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>