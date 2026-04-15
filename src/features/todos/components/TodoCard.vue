<template>
  <div
    ref="itemRef"
    class="flex flex-col py-3 px-4 rounded-2xl border transition-all duration-300 group/item w-full relative overflow-hidden"
    :class="todo.completed ? 'bg-muted/20 border-border/30 opacity-75' : 'bg-card/40 border-border/50 hover:border-primary/30 hover:shadow-sm'"
  >
    <div v-if="!todo.completed" class="absolute inset-y-0 left-0 w-0.5" :style="{ backgroundColor: color }"></div>

    <div class="flex items-center justify-between w-full relative z-10">
      <div class="flex items-center gap-3 flex-1 min-w-0 pr-2">
        <button class="cursor-grab text-muted-foreground/30 hover:text-muted-foreground transition-colors drag-handle shrink-0" @click.stop>
          <GripVertical class="w-4 h-4" />
        </button>

        <div class="shrink-0 cursor-pointer" @click.stop="$emit('toggle')">
          <div
            class="w-5 h-5 rounded-md border-[1.5px] flex items-center justify-center transition-colors"
            :class="todo.completed ? 'bg-primary border-primary shadow-sm' : 'border-border group-hover/item:border-primary/50'"
          >
            <Check v-if="todo.completed" class="w-3.5 h-3.5 text-primary-foreground" />
          </div>
        </div>

        <div class="flex flex-col min-w-0 overflow-hidden ml-1 flex-1">
          <span
            class="font-semibold text-sm truncate transition-colors duration-300"
            :class="todo.completed ? 'line-through text-muted-foreground/80' : 'text-foreground'"
          >
            {{ todo.title }}
          </span>

          <div v-if="!isExpanded && todo.description" class="text-xs text-muted-foreground/80 mt-1 line-clamp-2 editor-content" v-html="todo.description"></div>

          <div v-if="!isExpanded" class="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <span
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border"
              :style="{ backgroundColor: `${color}10`, color: color, borderColor: `${color}30` }"
            >
              <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: color }"></span>
              {{ categoryName }}
            </span>

            <span class="inline-flex items-center" :title="`Öncelik: ${todo.priority}`">
              <div v-if="todo.priority === 'high'" class="p-1 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/20"><ChevronsUp class="w-3 h-3" /></div>
              <div v-else-if="todo.priority === 'medium'" class="p-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20"><Minus class="w-3 h-3" /></div>
              <div v-else class="p-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"><ChevronDown class="w-3 h-3" /></div>
            </span>

            <span
              v-if="todo.dueDate"
              class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-colors"
              :class="isOverdue(todo.dueDate) ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'"
            >
              <Calendar class="w-3 h-3" />
              {{ formatDate(todo.dueDate) }}
            </span>

            <span v-if="todo.createdAt" class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-muted border border-border text-muted-foreground">
              <Clock class="w-3 h-3" />
              {{ formatRelativeTime(todo.createdAt) }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center transition-opacity shrink-0 z-10" :class="isExpanded ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'">
        <button 
          class="p-1.5 rounded-lg transition-colors" 
          :class="isExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
          @click.stop="toggleExpand"
        >
          <Edit class="w-4 h-4" />
        </button>
        <button class="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors ml-1" @click.stop="$emit('delete')">
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <transition name="expand">
      <div v-if="isExpanded" class="w-full relative z-10 overflow-hidden">
        <div class="pt-4 mt-3 border-t border-border/30 space-y-4">
          
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.title') }}</label>
            <input 
              ref="titleInputRef" 
              type="text" 
              v-model="editForm.title" 
              class="w-full h-10 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
              required 
            />
          </div>
          
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.description') }}</label>
            <RichTextEditor
              v-model="editForm.description"
              :placeholder="$t('todo.descriptionPlaceholder')"
            />
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-muted-foreground ml-1 flex items-center gap-1"><Calendar class="w-3 h-3"/> {{ $t('todo.dueDate') }}</label>
              <input type="date" v-model="editForm.dueDate" class="w-full h-10 rounded-xl border border-border/50 bg-background/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.priority') }}</label>
              <CustomSelect
                :modelValue="editForm.priority"
                @update:modelValue="editForm.priority = $event as 'low'|'medium'|'high'"
                :options="priorityOptions"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('todo.category') }}</label>
              <CustomSelect
                :modelValue="editForm.categoryId ?? ''"
                @update:modelValue="editForm.categoryId = $event || ''"
                :options="categoryOptions"
              />
            </div>
          </div>
          
          <div class="flex justify-end gap-2 pt-2">
            <button @click="cancelEdit" class="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
              {{ $t('common.cancel') || 'İptal' }}
            </button>
            <button 
              @click="saveEdit" 
              :disabled="!isFormChanged || !editForm.title.trim()"
              class="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ $t('todo.saveChanges') || 'Kaydet' }}
            </button>
          </div>
          
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue' // nextTick eklendi
import { GripVertical, Check, ChevronsUp, Minus, ChevronDown, Calendar, Clock, Trash2, Edit } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { Todo } from '@/features/todos/stores/todo'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import RichTextEditor from './RichTextEditor.vue'

const props = defineProps<{
  todo: Todo
  color: string
  categoryName: string
}>()

defineEmits<{
  toggle: []
  delete: []
}>()

const { t } = useI18n()
const todoStore = useTodoStore()
const uiStore = useUIStore()

const itemRef = ref<HTMLElement | null>(null)
const titleInputRef = ref<HTMLInputElement | null>(null)

const isExpanded = ref(false)
const editForm = ref<Todo>({ ...props.todo })

const isFormChanged = computed(() => JSON.stringify(editForm.value) !== JSON.stringify(props.todo))

const categoryOptions = computed(() => todoStore.categories.map(cat => ({ value: cat.id, label: cat.name })))
const priorityOptions = computed(() => [
  { value: 'low', label: t('todo.low') },
  { value: 'medium', label: t('todo.medium') },
  { value: 'high', label: t('todo.high') }
])

// YENİ: Expand alanı açıldığında scroll ve focus işlemi yapar
watch(isExpanded, (expanded) => {
  if (expanded) {
    // 1. Kullanıcı direkt yazabilsin diye başlık input'una odaklan
    // preventScroll: true sayesinde tarayıcının aniden zıplamasını engelliyoruz
    nextTick(() => {
      titleInputRef.value?.focus({ preventScroll: true })
    })

    // 2. CSS expand animasyonunun (0.35s) alan yaratmasını bekleyip sonra ortalıyoruz
    setTimeout(() => {
      itemRef.value?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      })
    }, 200) // Animasyonla uyumlu olması için 200ms bekletiyoruz
  }
})

watch(() => props.todo, (newTodo) => {
  if (!isExpanded.value) {
    editForm.value = { ...newTodo }
  }
}, { deep: true })

const toggleExpand = () => {
  if (!isExpanded.value) editForm.value = { ...props.todo }
  isExpanded.value = !isExpanded.value
}

const cancelEdit = () => {
  editForm.value = { ...props.todo }
  isExpanded.value = false
}

const saveEdit = () => {
  if (!editForm.value.title.trim()) return
  todoStore.updateTodo({ ...editForm.value })
  uiStore.addToast(t('todo.taskUpdated') || 'Görev güncellendi', 'info')
  isExpanded.value = false
}

// Utils
const isOverdue = (date: string | null) => date ? new Date(date) < new Date(new Date().setHours(0, 0, 0, 0)) : false
const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString() : ''
const formatRelativeTime = (date: string) => {
  if (!date) return ''
  const diffDays = Math.floor(Math.abs(new Date().getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return t('todo.today') || 'Bugün'
  if (diffDays === 1) return t('todo.yesterday') || 'Dün'
  return formatDate(date)
}
</script>

<style scoped>
.drag-handle { touch-action: none; }
.drag-handle:active { cursor: grabbing; }

/* Yumuşak Açılma/Kapanma Animasyonu */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 800px;
  opacity: 1;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  margin-top: 0;
}
</style>