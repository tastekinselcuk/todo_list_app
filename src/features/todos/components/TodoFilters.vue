<template>
  <div class="flex flex-wrap items-center gap-3 relative z-40">
    <div class="flex items-center gap-1.5 p-1 bg-muted/30 rounded-2xl border border-border/40 overflow-x-auto hide-scrollbar">
      <button
        @click="clearAllFilters"
        class="px-4 py-1.5 text-xs font-semibold rounded-xl border transition-all"
        :class="!hasActiveFilters ? 'bg-card text-foreground shadow-sm border-border/50' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card/50 hover:border-border/30'"
      >
        {{ $t('todo.all') || 'Tümü' }}
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
        @update:modelValue="$emit('update:selectedPriority', $event)"
        :options="filterPriorityOptions"
        size="sm"
        variant="ghost"
        :colorClass="priorityColorClass(selectedPriority)"
      />

      <button
        @click="$emit('update:showCompleted', !showCompleted)"
        class="h-8 px-3 rounded-xl text-[11px] font-semibold border transition-colors flex items-center gap-1.5"
        :class="showCompleted ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-transparent border-border/50 text-muted-foreground hover:bg-muted'"
      >
        <Check class="w-3.5 h-3.5" /> {{ $t('todo.showCompleted') }}
      </button>
      <button
        @click="$emit('update:isGrouped', !isGrouped)"
        class="h-8 px-3 rounded-xl text-[11px] font-semibold border transition-colors flex items-center gap-1.5"
        :class="isGrouped ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-transparent border-border/50 text-muted-foreground hover:bg-muted'"
      >
        <FolderTree class="w-3.5 h-3.5" /> {{ $t('todo.groupNotes') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Trash2, Check, FolderTree } from 'lucide-vue-next'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'

const props = defineProps<{
  selectedCategories: string[]
  selectedPriority: string
  showCompleted: boolean
  isGrouped: boolean
}>()

const emit = defineEmits<{
  'update:selectedCategories': [value: string[]]
  'update:selectedPriority': [value: string]
  'update:showCompleted': [value: boolean]
  'update:isGrouped': [value: boolean]
}>()

const todoStore = useTodoStore()
const uiStore = useUIStore()
const { t } = useI18n()

// Options & Styling
const filterPriorityOptions = computed(() => [
  { value: 'all', label: t('todo.allPriorities') || 'Tüm Öncelikler' },
  { value: 'low', label: t('todo.low') },
  { value: 'medium', label: t('todo.medium') },
  { value: 'high', label: t('todo.high') }
])

const priorityColorClass = (priority: string) => {
  switch (priority) {
    case 'low': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
    case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
    case 'high': return 'text-rose-500 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20'
    default: return 'bg-muted/40 hover:bg-muted/60 border-transparent text-muted-foreground'
  }
}

// Actions
const hasActiveFilters = computed(() => {
  return props.selectedCategories.length > 0 || 
         props.selectedPriority !== 'all' || 
         !props.showCompleted || 
         props.isGrouped
})

const clearAllFilters = () => {
  emit('update:selectedCategories', [])
  emit('update:selectedPriority', 'all')
  emit('update:showCompleted', true)
  emit('update:isGrouped', false)
}

const handleCategoryToggle = (categoryId: string) => {
  const newCategories = [...props.selectedCategories]
  const index = newCategories.indexOf(categoryId)
  if (index === -1) newCategories.push(categoryId)
  else newCategories.splice(index, 1)
  emit('update:selectedCategories', newCategories)
}

const handleDeleteCategory = async (categoryId: string) => {
  const todoCount = todoStore.getTodosInCategory(categoryId)
  const message = todoCount > 0 
    ? t('todo.deleteCategoryWarning', { count: todoCount }) 
    : t('todo.deleteCategoryConfirm')
    
  const isConfirmed = await uiStore.showConfirm(t('todo.deleteCategory') || 'Kategoriyi Sil', message, t('todo.delete') || 'Sil', t('todo.cancel') || 'İptal')
  
  if (isConfirmed) {
    const result = await todoStore.deleteCategory(categoryId)
    if (!result.success) {
      uiStore.addToast(result.message || t('todo.cannotDelete'), 'error')
      return
    }
    
    uiStore.addToast(t('todo.categoryDeleted') || 'Kategori silindi', 'success')
    
    // Eğer silinen kategori seçiliyse, seçimden çıkar
    const index = props.selectedCategories.indexOf(categoryId)
    if (index !== -1) {
      const newCategories = [...props.selectedCategories]
      newCategories.splice(index, 1)
      emit('update:selectedCategories', newCategories)
    }
  }
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>