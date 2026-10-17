<template>
  <div class="workspace-content mx-auto space-y-4">
    <div class="workspace-toolbar space-y-4">
      <TodoQuickAdd v-if="canWrite" @open-category-dialog="showCategoryDialog = !showCategoryDialog" />
      <CategoryModal v-if="canWrite" v-model:open="showCategoryDialog" />

      <div class="relative z-30">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TodoFilters class="max-w-full" v-model:selectedCategories="selectedCategories" v-model:showCompleted="showCompleted" v-model:isGrouped="isGrouped" />
        </div>
        <div class="note-progress mt-3" role="progressbar" :aria-label="t('todo.completionProgress')" :aria-valuenow="completionPercent" :aria-valuetext="t('todo.progressSummary',{percent:completionPercent,done:completedCount,total:scopedTodos.length})" :aria-valuemin="0" :aria-valuemax="100"><span :style="{width:completionPercent+'%'}" /></div>
        <div class="mt-2 flex justify-end text-[11px] text-muted-foreground" aria-live="polite">{{ t('todo.progressSummary',{percent:completionPercent,done:completedCount,total:scopedTodos.length}) }}</div>
      </div>
    </div>

    <div v-if="loadFailed" role="alert" class="rounded-2xl border border-border/50 px-5 py-8 text-center text-xs text-muted-foreground">
      <p>{{ t('todo.loadFailed') }}</p>
      <button type="button" class="mt-2 rounded-md px-2 py-1 text-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" @click="loadNotes">{{ t('workspace.retryModule') }}</button>
    </div>
    <div v-else-if="loading && !todoStore.todos.length" role="status" :aria-label="t('app.loading')" class="flex justify-center py-10">
      <Loader2 class="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
    </div>
    <div v-else-if="filteredTodosArray.length" class="relative z-0 space-y-5">
      <template v-if="isGrouped">
        <section v-for="group in groupedTodos" :key="group.category.id" class="space-y-2.5">
          <header class="flex min-w-0 items-center gap-2.5 px-1">
            <span class="h-1 w-1 shrink-0 rounded-full opacity-70" :style="{ backgroundColor: group.category.color }" />
            <h3 class="truncate text-[11px] font-medium text-muted-foreground">{{ group.category.name }}</h3>
            <span class="text-[10px] tabular-nums text-muted-foreground/60">{{ group.todos.length }}</span>
          </header>
          <draggable :model-value="group.todos" @update:model-value="todoStore.reorderTodos($event)" :disabled="!canWrite" item-key="id" class="space-y-1.5" handle=".drag-handle" :animation="180" ghost-class="note-drag-ghost" :delay="100" :delay-on-touch-only="true">
            <template #item="{ element: todo }">
              <TodoCardItem :todo="todo" :color="group.category.color" :category-name="group.category.name" :disabled="pendingIds.has(todo.id)" @toggle="handleToggleTodo(todo.id)" @delete="handleDeleteTodo(todo.id)" />
            </template>
          </draggable>
        </section>
      </template>
      <draggable v-else v-model="filteredTodosArray" :disabled="!canWrite" item-key="id" class="space-y-1.5" handle=".drag-handle" :animation="180" ghost-class="note-drag-ghost" :delay="100" :delay-on-touch-only="true">
        <template #item="{ element: todo }">
          <TodoCardItem :todo="todo" :color="getCategoryColor(todo.categoryId)" :category-name="getCategoryName(todo.categoryId)" :disabled="pendingIds.has(todo.id)" @toggle="handleToggleTodo(todo.id)" @delete="handleDeleteTodo(todo.id)" />
        </template>
      </draggable>
    </div>
    <div v-else class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-muted/[0.04] px-5 py-10 text-center">
      <CheckSquare class="mb-3 h-6 w-6 text-muted-foreground/40" />
      <p class="text-xs font-medium text-muted-foreground">{{ t(todoStore.todos.length ? 'todo.noMatches' : 'todo.noTasks') }}</p>
      <button v-if="hasFilters" type="button" class="mt-2 rounded-lg px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted/50" @click="clearFilters">{{ t('todo.clearFilters') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useModuleLoad } from '@/lib/workspaceScope'
import { useSearchReveal } from '@/lib/searchNavigation'
import { useModuleAccess, useWorkspaceDraft } from '@/lib/workspaceScope'
import { ref, computed } from 'vue'
import { CheckSquare, Loader2 } from 'lucide-vue-next'
import { useTodoStore, type Todo, type Category } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import draggable from 'vuedraggable'
import TodoQuickAdd from './TodoQuickAdd.vue'
import TodoFilters from './TodoFilters.vue'
import TodoCardItem from './TodoCard.vue'
import CategoryModal from './CategoryModal.vue'

const { canWrite } = useModuleAccess('detailed')
const todoStore = useTodoStore(), uiStore = useUIStore()
const { t, locale } = useI18n()
const selectedCategories = useWorkspaceDraft<string[]>('todo-categories', [])
const showCompleted = useWorkspaceDraft('todo-show-completed', true)
const isGrouped = useWorkspaceDraft('todo-grouped', false)
const query = ref('')
const showCategoryDialog = ref(false), loading = ref(true), loadFailed = ref(false)
const pendingIds = ref(new Set<string>())

async function loadNotes() {
  loading.value = true
  loadFailed.value = false
  try {
    const results = await Promise.all([todoStore.fetchCategories(), todoStore.fetchTodos()])
    loadFailed.value = results.some(result => !result)
  } finally { loading.value = false }
}
useModuleLoad(loadNotes)

const scopedTodos = computed(() => {
  const search=query.value.trim().toLocaleLowerCase(locale.value)
  return todoStore.todos.filter(todo => {
    const categoryMatch=!selectedCategories.value.length || (todo.categoryId!==null && selectedCategories.value.includes(todo.categoryId))
    const description=todo.description.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ')
    return categoryMatch && (!search || `${todo.title} ${description}`.toLocaleLowerCase(locale.value).includes(search))
  })
})
const filteredTodosArray = computed({
  get:()=>scopedTodos.value.filter(todo=>showCompleted.value || !todo.completed),
  set:(newValue:Todo[])=>{todoStore.reorderTodos(newValue)},
})
const completedCount=computed(()=>scopedTodos.value.filter(todo=>todo.completed).length)
const completionPercent=computed(()=>scopedTodos.value.length?Math.round(completedCount.value/scopedTodos.value.length*100):0)
const hasFilters = computed(() => Boolean(query.value.trim() || selectedCategories.value.length || !showCompleted.value))
const groupedTodos = computed(() => {
  const groups: { category: Category; todos: Todo[] }[] = []
  for (const category of todoStore.categories) {
    const todos = filteredTodosArray.value.filter(todo => todo.categoryId === category.id)
    if (todos.length) groups.push({ category, todos })
  }
  const uncategorized = filteredTodosArray.value.filter(todo => !todoStore.categories.some(category => category.id === todo.categoryId))
  if (uncategorized.length) groups.push({ category: { id: 'uncategorized', name: t('todo.uncategorized'), color: '#94A3B8', icon: 'folder' }, todos: uncategorized })
  return groups
})
const getCategoryColor = (id: string | null) => todoStore.categories.find(category => category.id === id)?.color || '#94A3B8'
const getCategoryName = (id: string | null) => todoStore.categories.find(category => category.id === id)?.name || t('todo.uncategorized')
function clearFilters() {
  query.value = ''; selectedCategories.value = []; showCompleted.value = true
}
async function handleToggleTodo(id: string) {
  if (!canWrite.value || pendingIds.value.has(id)) return
  pendingIds.value.add(id)
  try {
    if (!await todoStore.toggleTodo(id)) uiStore.addToast(t('todo.saveFailed'), 'error')
  } finally { pendingIds.value.delete(id) }
}
async function handleDeleteTodo(id: string) {
  if (!canWrite.value || pendingIds.value.has(id)) return
  pendingIds.value.add(id)
  try {
    const saved = await todoStore.deleteTodo(id)
    if (!saved) uiStore.addToast(t('todo.saveFailed'), 'error')
  } finally { pendingIds.value.delete(id) }
}
useSearchReveal('detailed', async (hit, isCurrent) => { await todoStore.fetchTodos(hit.record_id);if(!isCurrent())return;selectedCategories.value=[];showCompleted.value=true;query.value='' })
</script>

<style scoped>
.note-drag-ghost { opacity: 0.3; }
.note-progress { height:1px; overflow:hidden; background:hsl(var(--border)); }
.note-progress span { display:block; height:100%; background:hsl(var(--primary)/.6); transition:width .3s ease; }
@media(prefers-reduced-motion:reduce){.note-progress span{transition:none}}
</style>
