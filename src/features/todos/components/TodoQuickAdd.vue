<template>
  <div ref="containerRef" :data-shared-editing="isDraftingTodo" class="relative z-40 min-w-0">
    <div class="rounded-2xl border bg-card/65 shadow-[0_1px_3px_rgb(15,23,42,0.025)] transition-[border-color,box-shadow] duration-200 focus-within:border-muted-foreground/35 focus-within:ring-2 focus-within:ring-primary/[0.06] dark:bg-muted/[0.08]" :class="isDraftingTodo?'border-border/65':'border-border/45'">
      <div class="flex flex-wrap items-center gap-2 p-1.5 sm:gap-2.5">
        <input v-model="quickTodoTitle" @focus="isDraftingTodo=true" @keydown.enter.prevent="saveDraft" type="text" :maxlength="TODO_TITLE_MAX_LENGTH" :disabled="saving" :placeholder="t('todo.addTodo')+'…'" :aria-label="t('todo.title')" class="h-8 min-w-32 flex-1 bg-transparent px-2.5 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50" />
        <div class="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          <CustomSelect v-model="quickTodoCategoryId" :options="categoryOptions" :placeholder="t('todo.selectCategory')" :aria-label="t('todo.category')" :disabled="saving" variant="ghost" size="sm" class="w-36 min-w-0" />
          <button type="button" @click.stop="$emit('open-category-dialog')" :disabled="saving" :aria-label="t('todo.addNewCategory')" :title="t('todo.addNewCategory')" class="composer-icon"><Layers class="h-4 w-4" /></button>
          <button type="button" @click="saveDraft" :disabled="saving || mediaBusy || !quickTodoTitle.trim() || !quickTodoCategoryId" :aria-label="t('todo.addTodo')" :title="t('todo.addTodo')" class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 disabled:opacity-40"><Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Plus v-else class="h-4 w-4" /></button>
        </div>
      </div>
      <Transition name="note-reveal">
        <div v-if="isDraftingTodo" class="note-reveal">
          <div class="note-reveal-inner">
            <div class="note-reveal-body border-t border-border/40">
              <div class="p-3"><RichTextEditor v-model="quickTodoDescription" :disabled="saving" :placeholder="t('todo.descriptionPlaceholder')" @busy-change="mediaBusy=$event" /></div>
              <div class="flex items-center justify-end gap-1.5 border-t border-border/30 px-3 py-2.5">
                <button type="button" @click="cancelDraft" :disabled="saving || mediaBusy" class="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40">{{ t('common.cancel') }}</button>
                <button type="button" @click="saveDraft" :disabled="saving || mediaBusy || !quickTodoTitle.trim() || !quickTodoCategoryId" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="saving" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ t('common.save') }}</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { Layers, Plus, Loader2 } from 'lucide-vue-next'
import { useTodoStore, TODO_TITLE_MAX_LENGTH } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
const RichTextEditor=defineAsyncComponent(()=>import('./RichTextEditor.vue'))
defineEmits<{'open-category-dialog':[]}>()
const todoStore=useTodoStore(),uiStore=useUIStore(),{t}=useI18n()
const containerRef=ref<HTMLElement|null>(null)
const quickTodoTitle=useWorkspaceDraft('todo-title','')
const quickTodoCategoryId=useWorkspaceDraft('todo-input-category','')
const quickTodoDescription=useWorkspaceDraft('todo-description','')
const isDraftingTodo=ref(false),saving=ref(false),mediaBusy=ref(false)
const handleClickOutside=(event:MouseEvent)=>{if(!saving.value && !mediaBusy.value && isDraftingTodo.value && containerRef.value && !containerRef.value.contains(event.target as Node))isDraftingTodo.value=false}
onMounted(()=>document.addEventListener('mousedown',handleClickOutside))
onUnmounted(()=>document.removeEventListener('mousedown',handleClickOutside))
watch(()=>todoStore.categories,categories=>{if(categories.length && !categories.some(category=>category.id===quickTodoCategoryId.value))quickTodoCategoryId.value=categories[0]!.id},{immediate:true})
const categoryOptions=computed(()=>todoStore.categories.map(category=>({value:category.id,label:category.name})))
function cancelDraft(){
 if(saving.value || mediaBusy.value)return
 isDraftingTodo.value=false;quickTodoTitle.value='';quickTodoDescription.value=''
}
async function saveDraft(){
 if(saving.value || mediaBusy.value || !quickTodoTitle.value.trim() || !quickTodoCategoryId.value)return
 if(quickTodoTitle.value.trim().length>TODO_TITLE_MAX_LENGTH){uiStore.addToast(t('todo.titleTooLong',{count:TODO_TITLE_MAX_LENGTH}),'error');return}
 saving.value=true
 try{
  const result=await todoStore.addTodo({title:quickTodoTitle.value.trim(),description:quickTodoDescription.value.trim(),categoryId:quickTodoCategoryId.value,priority:'low',dueDate:null,completed:false})
  if(!result.success){uiStore.addToast(result.message || t('todo.saveFailed'),'error');return}
  uiStore.addToast(t('todo.taskAdded'),'success')
  quickTodoTitle.value='';quickTodoDescription.value='';isDraftingTodo.value=false
 }catch{uiStore.addToast(t('todo.saveFailed'),'error')}
 finally{saving.value=false}
}
</script>

<style scoped>
.composer-icon { @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40; }
</style>
