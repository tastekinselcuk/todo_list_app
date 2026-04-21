<template>
  <transition name="expand">
    <div
      v-if="open"
      class="mb-4 overflow-hidden transition-all duration-300"
      ref="formContainerRef"
    >
      <form 
        @submit.prevent="handleSubmit" 
        class="flex items-center gap-2 p-2 rounded-xl border border-border/80 bg-card shadow-sm w-full relative"
      >
        <div 
          class="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-border/50 transition-all hover:ring-2 hover:ring-primary/40 focus-within:ring-2 focus-within:ring-primary"
          :title="$t('todo.color') || 'Renk'"
        >
          <input
            v-model="newCategory.color"
            type="color"
            class="absolute -top-2 -left-2 w-12 h-12 cursor-pointer bg-transparent border-0"
          />
        </div>

        <input
          v-model="newCategory.name"
          type="text"
          class="flex-1 h-8 bg-transparent border-none focus:outline-none focus:ring-0 text-sm px-2 text-foreground placeholder:text-muted-foreground/50"
          :placeholder="$t('todo.enterCategoryName') || 'Kategori adını girin...'"
          required
          ref="nameInputRef"
        />

        <div class="flex items-center shrink-0">
          <button 
            type="submit" 
            :disabled="!newCategory.name.trim()"
            class="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {{ $t('todo.add') || 'Ekle' }}
          </button>
        </div>
      </form>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const todoStore = useTodoStore()
const uiStore = useUIStore()
const { t } = useI18n()

const nameInputRef = ref<HTMLInputElement | null>(null)
const formContainerRef = ref<HTMLElement | null>(null)
const newCategory = ref({ name: '', color: '#3B82F6', icon: 'folder' })

const closeModal = () => {
  emit('update:open', false)
}

// Dışarı tıklama kontrolü
const handleClickOutside = (event: MouseEvent) => {
  if (props.open && formContainerRef.value && !formContainerRef.value.contains(event.target as Node)) {
    closeModal()
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      nameInputRef.value?.focus({ preventScroll: true })
    })
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
    setTimeout(() => {
      resetForm()
    }, 300)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const resetForm = () => {
  newCategory.value = { name: '', color: '#3B82F6', icon: 'folder' }
}

const handleSubmit = async () => {
  if (!newCategory.value.name.trim()) return

  const result = await todoStore.addCategory(newCategory.value)
  if (result.success) {
    closeModal() // Başarılı olunca otomatik kapanır
    uiStore.addToast(t('todo.categoryAdded') || 'Kategori eklendi', 'success')
  } else {
    uiStore.addToast(result.message || t('todo.cannotDelete'), 'error')
  }
}
</script>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 60px;
  opacity: 1;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  margin-bottom: 0;
}
</style>