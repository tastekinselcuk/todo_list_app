<template>
  <div class="relative w-full z-20 flex items-start gap-2.5" ref="containerRef">
    
    <div class="relative flex-1 group/draft">
      <div 
        class="flex flex-col sm:flex-row gap-2 bg-card/40 backdrop-blur-xl p-1.5 pl-4 border shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 relative z-20"
        :class="isDraftingTodo ? 'rounded-t-xl border-primary/30 border-b-transparent' : 'rounded-xl border-border/50'"
      >
        <div class="relative flex-1 flex items-center">
          <input
            v-model="quickTodoTitle"
            @focus="isDraftingTodo = true"
            @keyup.enter="saveDraft"
            type="text"
            :placeholder="$t('todo.addTodo') + '...'"
            class="w-full h-8 bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none text-sm font-medium disabled:opacity-50"
          />
        </div>
        
        <div class="flex items-center gap-1.5 pr-0.5 border-t sm:border-t-0 sm:border-l border-border/50 pt-2 sm:pt-0 sm:pl-2 relative">
          <CustomSelect
            :modelValue="quickTodoPriority"
            @update:modelValue="quickTodoPriority = $event as 'low'|'medium'|'high'"
            :options="priorityOptionsLocalized"
            variant="ghost"
            size="sm"
            :colorClass="priorityColorClass(quickTodoPriority)"
          />

          <div class="flex items-center gap-1">
            <CustomSelect
              :modelValue="quickTodoCategoryId ?? ''"
              @update:modelValue="quickTodoCategoryId = $event || ''"
              :options="categoryOptions"
              :placeholder="$t('todo.selectCategory')"
              variant="ghost"
              size="sm"
            />
          </div>

          <button
            v-if="!isDraftingTodo"
            @click="saveDraft"
            class="h-8 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 text-xs shrink-0"
            :disabled="!quickTodoTitle.trim() || !quickTodoCategoryId"
          >
            {{ $t('todo.addTodo') }}
          </button>
          
          <div v-else class="h-8 px-4 flex items-center text-xs font-semibold text-primary shrink-0">
            {{ $t('todo.drafting') }}
          </div>
        </div>
      </div>

      <transition name="slide-fade">
        <div v-if="isDraftingTodo" class="rounded-b-xl border border-t-0 border-primary/30 bg-card/40 backdrop-blur-xl shadow-lg flex flex-col z-10 relative overflow-hidden -mt-px">
          <div class="p-3">
            <RichTextEditor
              v-model="quickTodoDescription"
              :placeholder="$t('todo.descriptionPlaceholder')"
            />
          </div>
          <div class="px-4 py-2.5 bg-black/5 dark:bg-black/20 border-t border-border/30 flex justify-end gap-2">
            <button @click="cancelDraft" class="px-4 py-1.5 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              {{ $t('common.cancel') }}
            </button>
            <button 
              @click="saveDraft" 
              :disabled="!quickTodoTitle.trim() || !quickTodoCategoryId"
              class="px-5 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {{ $t('common.save') }}
            </button>
          </div>
        </div>
      </transition>
    </div>

<button
      @click.stop="$emit('open-category-dialog')"
      class="shrink-0 w-[44px] h-[44px] flex items-center justify-center rounded-xl bg-card/40 backdrop-blur-xl border border-border/50 hover:bg-primary/10 hover:border-primary/30 text-muted-foreground hover:text-primary shadow-sm transition-all group/add"
      :title="$t('todo.addNewCategory')"
    >
      <Layers class="w-5 h-5 transition-transform group-hover/add:scale-110" />
    </button>
    
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Layers } from 'lucide-vue-next'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import RichTextEditor from './RichTextEditor.vue'

defineEmits<{
  'open-category-dialog': []
}>()

const todoStore = useTodoStore()
const uiStore = useUIStore()
const { t } = useI18n()

const containerRef = ref<HTMLElement | null>(null)
const quickTodoTitle = ref('')
const quickTodoPriority = ref<'low'|'medium'|'high'>('low')
const quickTodoCategoryId = ref('')
const isDraftingTodo = ref(false)
const quickTodoDescription = ref('')

watch(isDraftingTodo, async (isDrafting) => {
  if (isDrafting) {
    await nextTick() // DOM'un genişlemesini bekle
    containerRef.value?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' // Ekranın tam ortasına hizalar
    })
  }
})

// DIŞARI TIKLAMA (Click-Outside) MANTIĞI
const handleClickOutside = (event: MouseEvent) => {
  if (isDraftingTodo.value && containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isDraftingTodo.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))

watch(() => todoStore.categories, (cats) => {
  if (cats.length > 0 && !quickTodoCategoryId.value) {
    quickTodoCategoryId.value = cats[0].id
  }
}, { immediate: true })

const priorityOptionsLocalized = computed(() => [
  { value: 'low', label: t('todo.low') },
  { value: 'medium', label: t('todo.medium') },
  { value: 'high', label: t('todo.high') }
])

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

const cancelDraft = () => {
  isDraftingTodo.value = false
  quickTodoTitle.value = ''
  quickTodoDescription.value = ''
}

const saveDraft = async () => {
  if (!quickTodoTitle.value.trim() || !quickTodoCategoryId.value) return
  
  try {
    const result = await todoStore.addTodo({
      title: quickTodoTitle.value.trim(),
      description: quickTodoDescription.value.trim(),
      categoryId: quickTodoCategoryId.value,
      priority: quickTodoPriority.value,
      dueDate: null,
      completed: false
    })
    
    if (result && result.success) {
      uiStore.addToast(t('todo.taskAdded'), 'success')
      quickTodoTitle.value = ''
      quickTodoDescription.value = ''
      isDraftingTodo.value = false
    } else {
      uiStore.addToast(result?.message || t('todo.error'), 'error')
    }
  } catch (error) {
    uiStore.addToast(t('todo.systemError'), 'error')
  }
}
</script>

<style scoped>
.slide-fade-enter-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-fade-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(-10px); opacity: 0; }
</style>