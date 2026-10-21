<template>
  <div ref="containerRef" :data-shared-editing="isDraftingTodo" class="relative z-40 min-w-0" :style="isFocused ? {height:inlineHeight+'px'} : undefined">
    <Teleport :to="draftDialogRef || 'body'" :disabled="!isFocused">
    <form ref="composerRef" @submit.prevent="saveDraft" :class="isFocused ? 'note-edit-form composer-focused' : ['rounded-2xl border bg-card/65 shadow-[0_1px_3px_rgb(15,23,42,0.025)] transition-[border-color,box-shadow] duration-200 focus-within:border-muted-foreground/35 focus-within:ring-2 focus-within:ring-primary/[0.06] dark:bg-muted/[0.08]',isDraftingTodo?'border-border/65':'border-border/45']">
      <header v-if="isFocused" class="flex shrink-0 items-center justify-between gap-3"><span class="text-xs font-medium text-muted-foreground">{{ t('todo.addTodo') }}</span><button type="button" class="composer-icon" :disabled="saving || mediaBusy" :aria-label="t('common.close')" @click="closeFocusedEditor"><X class="h-4 w-4" /></button></header>
      <div class="flex shrink-0 flex-wrap items-center gap-2 sm:gap-2.5" :class="isFocused ? '' : 'p-1.5'">
        <input ref="titleInputRef" v-model="quickTodoTitle" @focus="onTitleFocus" @input="isDraftingTodo=true" @keydown.enter.prevent="saveDraft" type="text" :maxlength="TODO_TITLE_MAX_LENGTH" :disabled="saving" :placeholder="t('todo.addTodo')+'…'" :aria-label="t('todo.title')" class="min-w-32 flex-1 text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50" :class="isFocused ? 'finance-input !h-9 !px-3 !text-xs' : 'h-8 bg-transparent px-2.5 text-sm font-medium'" />
        <div class="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          <CustomSelect v-model="quickTodoCategoryId" :options="categoryOptions" :placeholder="t('todo.selectCategory')" :aria-label="t('todo.category')" :disabled="saving" variant="ghost" size="sm" class="w-36 min-w-0" />
          <button v-if="!isFocused" type="button" data-category-trigger @click.stop="$emit('open-category-dialog')" :disabled="saving" :aria-label="t('todo.addNewCategory')" :title="t('todo.addNewCategory')" :aria-expanded="!!categoryOpen" :aria-controls="categoryOpen ? 'todo-category-form' : undefined" class="composer-icon" :class="categoryOpen && 'bg-muted/50 text-foreground'"><Layers class="h-4 w-4" /></button>
        </div>
      </div>
      <Transition name="note-reveal">
        <div v-if="isDraftingTodo" class="note-reveal">
          <div class="note-reveal-inner">
            <div class="note-reveal-body" :class="!isFocused && 'border-t border-border/40'">
              <div class="composer-editor" :class="isFocused ? 'flex min-h-0 flex-1 flex-col' : 'p-3'"><RichTextEditor ref="editorRef" v-model="quickTodoDescription" :fit-height="isFocused" :disabled="saving" :placeholder="t('todo.descriptionPlaceholder')" @focus="openFocusedEditor" @busy-change="mediaBusy=$event" /></div>
              <div class="flex shrink-0 items-center justify-end gap-1.5 border-t border-border/30" :class="isFocused ? 'pt-3' : 'px-3 py-2.5'">
                <button type="button" @click="cancelDraft" :disabled="saving || mediaBusy" class="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40">{{ t('common.cancel') }}</button>
                <button type="submit" :disabled="saving || mediaBusy || !quickTodoTitle.trim() || !quickTodoCategoryId" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="saving" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ t('common.save') }}</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </form>
    </Teleport>
    <Teleport to="body"><dialog ref="draftDialogRef" class="note-edit-dialog" closedby="closerequest" :aria-label="t('todo.addTodo')" @cancel.prevent="closeFocusedEditor" @close="onDialogClosed" /></Teleport>
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { ref, computed, watch, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, defineAsyncComponent } from 'vue'
import { Layers, Loader2, X } from 'lucide-vue-next'
import { useTodoStore, TODO_TITLE_MAX_LENGTH } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
const RichTextEditor=defineAsyncComponent(()=>import('./RichTextEditor.vue'))
defineProps<{categoryOpen?:boolean}>()
defineEmits<{'open-category-dialog':[]}>()
const todoStore=useTodoStore(),uiStore=useUIStore(),{t}=useI18n()
const containerRef=ref<HTMLElement|null>(null)
const composerRef=ref<HTMLFormElement|null>(null),titleInputRef=ref<HTMLInputElement|null>(null),draftDialogRef=ref<HTMLDialogElement|null>(null),editorRef=ref<InstanceType<typeof RichTextEditor>|null>(null)
const quickTodoTitle=useWorkspaceDraft('todo-title','')
const quickTodoCategoryId=useWorkspaceDraft('todo-input-category','')
const quickTodoDescription=useWorkspaceDraft('todo-description','')
const isDraftingTodo=ref(false),saving=ref(false),mediaBusy=ref(false)
const isFocused=ref(false),inlineHeight=ref(0)
let dialogEpoch=0,disposed=false,active=true,restoringFocus=false,scrollLock:{body:string;root:string;gutter:string}|null=null
function onTitleFocus(){if(!restoringFocus)isDraftingTodo.value=true}
function releaseScroll(){if(scrollLock){document.body.style.overflow=scrollLock.body;document.documentElement.style.overflow=scrollLock.root;document.documentElement.style.scrollbarGutter=scrollLock.gutter;scrollLock=null}}
function openFocusedEditor(){
 if(isFocused.value || saving.value || disposed || !active)return
 inlineHeight.value=containerRef.value?.getBoundingClientRect().height||0
 isDraftingTodo.value=true;isFocused.value=true
}
function closeFocusedEditor(){if(!saving.value && !mediaBusy.value)isFocused.value=false}
function onDialogClosed(){if(!draftDialogRef.value?.open){isFocused.value=false;releaseScroll()}}
watch(isFocused,async focused=>{
 const epoch=++dialogEpoch
 if(!focused){draftDialogRef.value?.close();releaseScroll();await nextTick();if(!disposed&&active&&epoch===dialogEpoch&&titleInputRef.value?.isConnected){restoringFocus=true;titleInputRef.value.focus({preventScroll:true});restoringFocus=false}return}
 await nextTick()
 if(disposed || epoch!==dialogEpoch || !isFocused.value || !draftDialogRef.value)return
 scrollLock={body:document.body.style.overflow,root:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter}
 document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';document.documentElement.style.scrollbarGutter='stable'
 try{draftDialogRef.value.showModal();editorRef.value?.focus()}catch{isFocused.value=false;releaseScroll()}
})
const handleClickOutside=(event:MouseEvent)=>{if(!isFocused.value && !saving.value && !mediaBusy.value && isDraftingTodo.value && containerRef.value && !containerRef.value.contains(event.target as Node))isDraftingTodo.value=false}
onMounted(()=>document.addEventListener('mousedown',handleClickOutside))
onActivated(()=>{active=true})
onDeactivated(()=>{active=false;isFocused.value=false;draftDialogRef.value?.close();releaseScroll()})
onUnmounted(()=>{disposed=true;dialogEpoch++;draftDialogRef.value?.close();releaseScroll();document.removeEventListener('mousedown',handleClickOutside)})
watch(()=>todoStore.categories,categories=>{if(categories.length && !categories.some(category=>category.id===quickTodoCategoryId.value))quickTodoCategoryId.value=categories[0]!.id},{immediate:true})
const categoryOptions=computed(()=>todoStore.categories.map(category=>({value:category.id,label:category.name})))
function cancelDraft(){
 if(saving.value || mediaBusy.value)return
 isFocused.value=false;isDraftingTodo.value=false;quickTodoTitle.value='';quickTodoDescription.value=''
}
async function saveDraft(){
 if(saving.value || mediaBusy.value || !quickTodoTitle.value.trim() || !quickTodoCategoryId.value)return
 if(quickTodoTitle.value.trim().length>TODO_TITLE_MAX_LENGTH){uiStore.addToast(t('todo.titleTooLong',{count:TODO_TITLE_MAX_LENGTH}),'error');return}
 saving.value=true
 try{
  const result=await todoStore.addTodo({title:quickTodoTitle.value.trim(),description:quickTodoDescription.value.trim(),categoryId:quickTodoCategoryId.value,priority:'low',dueDate:null,completed:false})
  if(!result.success){uiStore.addToast(result.message || t('todo.saveFailed'),'error');return}
  uiStore.addToast(t('todo.taskAdded'),'success')
  quickTodoTitle.value='';quickTodoDescription.value='';isFocused.value=false;isDraftingTodo.value=false
 }catch{uiStore.addToast(t('todo.saveFailed'),'error')}
 finally{saving.value=false}
}
</script>

<style scoped>
.composer-icon { @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40; }
.composer-focused > .note-reveal { flex:1; min-height:0; }
.composer-focused .note-reveal-body { display:flex; height:100%; min-height:0; flex-direction:column; gap:12px; }
</style>
