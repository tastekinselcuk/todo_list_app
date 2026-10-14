<template>
  <Transition name="category">
    <form v-if="open" ref="formContainerRef" @submit.prevent="handleSubmit" @keydown.esc.stop.prevent="closeModal" class="relative flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2 shadow-sm">
      <label class="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border/50 focus-within:ring-2 focus-within:ring-primary/30" :title="t('todo.color')">
        <input v-model="newCategory.color" type="color" :aria-label="t('todo.color')" :disabled="saving" class="absolute -left-2 -top-2 h-12 w-12 cursor-pointer border-0 bg-transparent" />
      </label>
      <input ref="nameInputRef" v-model="newCategory.name" type="text" required :disabled="saving" :aria-label="t('todo.categoryName')" :placeholder="t('todo.enterCategoryName')" class="h-8 min-w-28 flex-1 rounded-lg bg-transparent px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20" />
      <button type="submit" :disabled="saving || !newCategory.name.trim()" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="saving" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ t('todo.createCategory') }}</button>
      <button type="button" @click="closeModal" :disabled="saving" :aria-label="t('common.close')" class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"><X class="h-3.5 w-3.5" /></button>
    </form>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { X, Loader2 } from 'lucide-vue-next'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const todoStore = useTodoStore(), uiStore = useUIStore()
const { t } = useI18n()
const nameInputRef = ref<HTMLInputElement | null>(null), formContainerRef = ref<HTMLElement | null>(null)
const newCategory = ref({ name: '', color: '#3B82F6', icon: 'folder' }), saving = ref(false)
function closeModal() { if (!saving.value) emit('update:open', false) }
const handleClickOutside = (event: MouseEvent) => {
  if (props.open && formContainerRef.value && !formContainerRef.value.contains(event.target as Node)) closeModal()
}
watch(() => props.open, (open, _, onCleanup) => {
  if (open) {
    nextTick(() => { if (props.open) nameInputRef.value?.focus({ preventScroll: true }) })
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
    const timer = setTimeout(() => { newCategory.value = { name: '', color: '#3B82F6', icon: 'folder' } }, 160)
    onCleanup(() => clearTimeout(timer))
  }
})
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
async function handleSubmit() {
  if (saving.value || !newCategory.value.name.trim()) return
  saving.value = true
  try {
    const result = await todoStore.addCategory({ ...newCategory.value, name: newCategory.value.name.trim() })
    if (result.success) { emit('update:open', false); uiStore.addToast(t('todo.categoryAdded'), 'success') }
    else uiStore.addToast(result.message || t('todo.saveFailed'), 'error')
  } finally { saving.value = false }
}
</script>

<style scoped>
.category-enter-active, .category-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.category-enter-from, .category-leave-to { opacity: 0; transform: translateY(5px); }
@media (prefers-reduced-motion: reduce) { .category-enter-active, .category-leave-active { transition: none; } }
</style>
