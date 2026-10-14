<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <div class="w-36 shrink-0">
      <button
        ref="categoryTrigger"
        type="button"
        :popovertarget="categoryMenuId"
        :aria-label="`${t('todo.category')}: ${categoryLabel}`"
        :aria-expanded="categoryOpen"
        :aria-controls="categoryMenuId"
        aria-haspopup="menu"
        :title="categoryLabel"
        class="filter-button w-full text-foreground"
        @keydown.down.prevent="openCategoryMenu"
        @keydown.up.prevent="openCategoryMenu"
      >
        <FolderTree class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate text-left">{{ categoryLabel }}</span>
        <span v-if="selectedCategories.length > 1" class="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{{ selectedCategories.length }}</span>
        <ChevronDown class="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150" :class="{ 'rotate-180': categoryOpen }" />
      </button>
      <div
        :id="categoryMenuId"
        ref="categoryMenu"
        popover="auto"
        role="menu"
        :aria-label="t('todo.category')"
        :style="categoryMenuStyle"
        class="category-menu rounded-xl border border-slate-300 bg-card p-1.5 text-card-foreground shadow-xl shadow-black/10 dark:border-slate-600"
        @beforetoggle="handleCategoryMenuToggle"
        @keydown="handleCategoryMenuKeydown"
      >
        <button type="button" role="menuitemcheckbox" data-category-option autofocus :aria-checked="!selectedCategories.length" class="category-option shrink-0" :class="{ 'category-option-selected': !selectedCategories.length }" @click="clearCategorySelection">
          <span class="category-checkbox" :class="{ 'is-checked': !selectedCategories.length }"><Check v-if="!selectedCategories.length" class="h-2.5 w-2.5" /></span>
          <span class="flex-1 text-left">{{ t('todo.all') }}</span>
        </button>
        <div v-if="todoStore.categories.length" role="separator" class="my-1 h-px shrink-0 bg-border/60" />
        <div class="category-options" role="none">
          <div v-for="category in todoStore.categories" :key="category.id" role="none" class="group/category flex items-center rounded-lg" :class="{ 'bg-muted/50': selectedCategories.includes(category.id) }">
            <button type="button" role="menuitemcheckbox" data-category-option :aria-checked="selectedCategories.includes(category.id)" class="category-option min-w-0 flex-1" @click="handleCategoryToggle(category.id)">
              <span class="category-checkbox" :class="{ 'is-checked': selectedCategories.includes(category.id) }"><Check v-if="selectedCategories.includes(category.id)" class="h-2.5 w-2.5" /></span>
              <span class="h-1 w-1 shrink-0 rounded-full opacity-70" :style="{ backgroundColor: category.color }" />
              <span class="truncate text-left" :title="category.name">{{ category.name }}</span>
            </button>
            <button v-if="canWrite && todoStore.categories.length > 1" type="button" role="menuitem" @click="handleDeleteCategory(category.id)" :disabled="deleting" :aria-label="`${t('todo.deleteCategory')}: ${category.name}`" :title="t('todo.deleteCategory')" class="category-delete mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40"><Trash2 class="h-3 w-3" /></button>
          </div>
        </div>
      </div>
    </div>
    <button type="button" @click="$emit('update:showCompleted', !showCompleted)" :aria-pressed="showCompleted" class="filter-button" :class="showCompleted ? 'filter-active' : 'filter-idle'"><Check class="h-3.5 w-3.5 shrink-0" />{{ t('todo.showCompleted') }}</button>
    <button type="button" @click="$emit('update:isGrouped', !isGrouped)" :aria-pressed="isGrouped" class="filter-button" :class="isGrouped ? 'filter-active' : 'filter-idle'"><FolderTree class="h-3.5 w-3.5 shrink-0" />{{ t('todo.groupNotes') }}</button>
    <button v-if="hasActiveFilters" type="button" @click="clearAllFilters" :aria-label="t('todo.clearFilters')" :title="t('todo.clearFilters')" class="filter-button filter-idle w-8 !justify-center !px-0"><X class="h-3.5 w-3.5" /></button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, getCurrentInstance, onBeforeUnmount, onDeactivated } from 'vue'
import { Trash2, Check, FolderTree, ChevronDown, X } from 'lucide-vue-next'
import { useModuleAccess } from '@/lib/workspaceScope'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ selectedCategories: string[]; showCompleted: boolean; isGrouped: boolean }>()
const emit = defineEmits<{
  'update:selectedCategories': [value: string[]]
  'update:showCompleted': [value: boolean]
  'update:isGrouped': [value: boolean]
}>()
const { canWrite } = useModuleAccess('detailed')
const todoStore = useTodoStore(), uiStore = useUIStore()
const { t } = useI18n()
const deleting = ref(false)
const categoryTrigger = ref<HTMLButtonElement | null>(null)
const categoryMenu = ref<HTMLElement | null>(null)
const categoryOpen = ref(false)
const categoryMenuId = `todo-category-filter-${getCurrentInstance()?.uid ?? 0}`
const categoryMenuStyle = ref<Record<string, string>>({})
const categoryLabel = computed(() => !props.selectedCategories.length
  ? t('todo.all')
  : todoStore.categories.filter(category => props.selectedCategories.includes(category.id)).map(category => category.name).join(', ') || t('todo.category'))

function updateCategoryMenuPosition() {
  if (!categoryTrigger.value || typeof window === 'undefined') return
  const rect = categoryTrigger.value.getBoundingClientRect()
  const gap = 6, edge = 8
  const width = Math.min(Math.max(rect.width, 240), window.innerWidth - edge * 2)
  const below = window.innerHeight - rect.bottom - gap - edge
  const above = rect.top - gap - edge
  const desiredHeight = Math.min(280, 46 + (todoStore.categories.length ? 9 : 0) + todoStore.categories.length * 32)
  const openAbove = below < desiredHeight && above > below
  const height = Math.min(desiredHeight, Math.max(64, openAbove ? above : below))
  categoryMenuStyle.value = {
    left: `${Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge))}px`,
    top: `${openAbove ? Math.max(edge, rect.top - gap - height) : rect.bottom + gap}px`,
    width: `${width}px`,
    maxHeight: `${height}px`,
  }
}
function removeCategoryMenuListeners() {
  if (typeof window === 'undefined') return
  window.removeEventListener('resize', updateCategoryMenuPosition)
  window.removeEventListener('scroll', updateCategoryMenuPosition, true)
  document.removeEventListener('focusin', handleCategoryFocus)
}
function handleCategoryMenuToggle(event: Event) {
  categoryOpen.value = (event as Event & { newState: string }).newState === 'open'
  removeCategoryMenuListeners()
  if (!categoryOpen.value) return
  updateCategoryMenuPosition()
  if (typeof window === 'undefined') return
  window.addEventListener('resize', updateCategoryMenuPosition)
  window.addEventListener('scroll', updateCategoryMenuPosition, true)
  document.addEventListener('focusin', handleCategoryFocus)
}
function closeCategoryMenu(restoreFocus = false) {
  categoryMenu.value?.hidePopover()
  categoryOpen.value = false
  removeCategoryMenuListeners()
  if (restoreFocus) categoryTrigger.value?.focus()
}
function handleCategoryFocus(event: FocusEvent) {
  if (!categoryMenu.value?.contains(event.target as Node) && !categoryTrigger.value?.contains(event.target as Node)) closeCategoryMenu()
}
function openCategoryMenu() {
  if (!categoryOpen.value) categoryMenu.value?.showPopover()
  nextTick(() => categoryMenu.value?.querySelector<HTMLElement>('[data-category-option]')?.focus())
}
function handleCategoryMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCategoryMenu(true); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const options = Array.from(categoryMenu.value?.querySelectorAll<HTMLElement>('[data-category-option]') || [])
  if (!options.length) return
  event.preventDefault()
  const index = options.indexOf(document.activeElement as HTMLElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
  options[next]?.focus()
}
onDeactivated(() => closeCategoryMenu())
onBeforeUnmount(() => closeCategoryMenu())
const hasActiveFilters = computed(() => props.selectedCategories.length > 0 || !props.showCompleted || props.isGrouped)
function clearAllFilters() {
  emit('update:selectedCategories', []); emit('update:showCompleted', true); emit('update:isGrouped', false)
}
function clearCategorySelection() { emit('update:selectedCategories', []) }
function handleCategoryToggle(id: string) {
  emit('update:selectedCategories', props.selectedCategories.includes(id) ? props.selectedCategories.filter(value => value !== id) : [...props.selectedCategories, id])
}
async function handleDeleteCategory(id: string) {
  if (!canWrite.value || deleting.value) return
  closeCategoryMenu()
  deleting.value = true
  try {
    const count = todoStore.getTodosInCategory(id)
    const confirmed = await uiStore.showConfirm(t('todo.deleteCategory'), t(count > 0 ? 'todo.deleteCategoryWarning' : 'todo.deleteCategoryConfirm', { count }), t('todo.delete'), t('todo.cancel'))
    if (!confirmed) return
    const result = await todoStore.deleteCategory(id)
    if (!result.success) { uiStore.addToast(result.message || t('todo.cannotDelete'), 'error'); return }
    uiStore.addToast(t('todo.categoryDeleted'), 'success')
    emit('update:selectedCategories', props.selectedCategories.filter(value => value !== id))
  } finally { deleting.value = false }
}
</script>

<style scoped>
.category-menu {
  position: fixed;
  inset: auto;
  margin: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 150ms ease, transform 150ms ease, display 150ms allow-discrete, overlay 150ms allow-discrete;
}
.category-menu:popover-open { display: flex; flex-direction: column; opacity: 1; transform: translateY(0); }
@starting-style { .category-menu:popover-open { opacity: 0; transform: translateY(4px); } }
.category-options { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.category-option { @apply flex h-8 w-full items-center gap-2 rounded-lg px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none; }
.category-option-selected { @apply bg-muted/50; }
.category-checkbox { @apply inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-muted-foreground/50; }
.category-checkbox.is-checked { @apply border-primary bg-primary text-primary-foreground; }
.filter-button { @apply inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border/60 bg-card/70 px-2.5 text-xs font-medium transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30; }
.filter-active { @apply border-border text-foreground; }
.filter-idle { @apply text-muted-foreground hover:text-foreground; }
@media (hover: hover) {
  .category-delete { opacity: 0; }
  .group\/category:hover .category-delete, .group\/category:focus-within .category-delete { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
