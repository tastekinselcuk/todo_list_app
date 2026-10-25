<template>
  <div :data-shared-editing="isFocused" class="relative z-40 min-w-0">
    <form @submit.prevent="openFocusedEditor">
      <input ref="titleInputRef" v-model="quickTodoTitle" @keydown.enter="handleTitleEnter" type="text" :maxlength="TODO_TITLE_MAX_LENGTH" :disabled="saving || isFocused" :placeholder="t('todo.noteTitlePlaceholder')" :aria-label="t('todo.title')" class="h-10 w-full rounded-xl border border-border/50 bg-background/50 px-4 text-sm font-normal text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-1 focus:ring-primary/30 disabled:opacity-50" />
    </form>
    <Teleport to="body">
      <dialog ref="draftDialogRef" class="note-edit-dialog" :closedby="saving || mediaBusy || categorySaving ? 'none' : 'closerequest'" :aria-label="t('todo.addTodo')" @dblclick="event=>{if(isDialogBackdropDoubleClick(event))closeFocusedEditor()}" @keydown.esc.stop.prevent="closeFocusedEditor" @cancel.prevent="closeFocusedEditor" @close="onDialogClosed">
        <form v-if="isDraftingTodo" class="note-edit-form" @submit.prevent="saveDraft">
          <header class="flex shrink-0 items-center justify-between gap-3"><span class="text-xs font-medium text-muted-foreground">{{ t('todo.addTodo') }}</span><button type="button" class="composer-icon" :disabled="saving || mediaBusy || categorySaving" :aria-label="t('common.close')" @click="closeFocusedEditor"><X class="h-4 w-4" /></button></header>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <input ref="dialogTitleRef" v-model="quickTodoTitle" type="text" required :maxlength="TODO_TITLE_MAX_LENGTH" :disabled="saving || categorySaving" :aria-label="t('todo.title')" class="finance-input !h-9 min-w-36 flex-1 !px-3 !text-xs" />
            <CustomSelect v-model="quickTodoCategoryId" :options="categoryOptions" :placeholder="t('todo.selectCategory')" :aria-label="t('todo.category')" :disabled="saving || mediaBusy || categorySaving" :action-label="t('todo.addNewCategory')" @action="requestCategory" popover size="sm" class="w-40 min-w-0" />
          </div>
          <CategoryModal :open="categoryOpen" @update:open="categoryOpen=$event" @created="quickTodoCategoryId=$event" @busy-change="categorySaving=$event" />
          <div class="flex min-h-0 flex-1 flex-col"><RichTextEditor ref="editorRef" v-model="quickTodoDescription" :fit-height="true" :disabled="saving || categorySaving" :placeholder="t('todo.descriptionPlaceholder')" @busy-change="mediaBusy=$event" /></div>
          <footer class="flex shrink-0 items-center justify-end gap-1.5 border-t border-border/30 pt-3">
            <button type="button" @click="cancelDraft" :disabled="saving || mediaBusy || categorySaving" class="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40">{{ t('common.cancel') }}</button>
            <button type="submit" :disabled="saving || mediaBusy || categorySaving || !quickTodoTitle.trim() || !quickTodoCategoryId" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="saving" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ t('common.save') }}</button>
          </footer>
        </form>
      </dialog>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, onActivated, onDeactivated, nextTick, defineAsyncComponent } from 'vue'
import { Loader2, X } from 'lucide-vue-next'
import { useTodoStore, TODO_TITLE_MAX_LENGTH } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import CategoryModal from './CategoryModal.vue'
import { isDialogBackdropDoubleClick } from '@/lib/utils'
const RichTextEditor=defineAsyncComponent(()=>import('./RichTextEditor.vue'))
const todoStore=useTodoStore(),uiStore=useUIStore(),{t}=useI18n()
const titleInputRef=ref<HTMLInputElement|null>(null),dialogTitleRef=ref<HTMLInputElement|null>(null),draftDialogRef=ref<HTMLDialogElement|null>(null),editorRef=ref<InstanceType<typeof RichTextEditor>|null>(null)
const quickTodoTitle=ref('')
const quickTodoCategoryId=ref('')
const quickTodoDescription=ref('')
const isDraftingTodo=ref(false),saving=ref(false),mediaBusy=ref(false)
const isFocused=ref(false)
const categoryOpen=ref(false),categorySaving=ref(false)
let dialogEpoch=0,disposed=false,active=true,scrollLock:{body:string;root:string;gutter:string}|null=null
function releaseScroll(){if(scrollLock){document.body.style.overflow=scrollLock.body;document.documentElement.style.overflow=scrollLock.root;document.documentElement.style.scrollbarGutter=scrollLock.gutter;scrollLock=null}}
function openFocusedEditor(){
 if(isFocused.value || saving.value || disposed || !active || !quickTodoTitle.value.trim())return
 if(quickTodoTitle.value.trim().length>TODO_TITLE_MAX_LENGTH){uiStore.addToast(t('todo.titleTooLong',{count:TODO_TITLE_MAX_LENGTH}),'error');return}
 isDraftingTodo.value=true;isFocused.value=true
}
function handleTitleEnter(event:KeyboardEvent){if(event.isComposing || event.keyCode===229)return;event.preventDefault();openFocusedEditor()}
function requestCategory(){if(isFocused.value && !saving.value && !mediaBusy.value && !categorySaving.value)categoryOpen.value=!categoryOpen.value}
function closeFocusedEditor(){if(!saving.value && !mediaBusy.value && !categorySaving.value)isFocused.value=false}
function onDialogClosed(){if(!draftDialogRef.value?.open){isFocused.value=false;releaseScroll()}}
watch(isFocused,async focused=>{
 const epoch=++dialogEpoch
 if(!focused){categoryOpen.value=false;draftDialogRef.value?.close();releaseScroll();await nextTick();if(!disposed&&active&&epoch===dialogEpoch&&titleInputRef.value?.isConnected)titleInputRef.value.focus({preventScroll:true});return}
 await nextTick()
 if(disposed || !active || epoch!==dialogEpoch || !isFocused.value || !draftDialogRef.value)return
 scrollLock={body:document.body.style.overflow,root:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter}
 document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';document.documentElement.style.scrollbarGutter='stable'
 try{draftDialogRef.value.showModal();if(editorRef.value)editorRef.value.focus();else dialogTitleRef.value?.focus({preventScroll:true})}catch{isFocused.value=false;releaseScroll()}
})
watch(editorRef,editor=>{if(editor && active && isFocused.value && draftDialogRef.value?.open)editor.focus()},{flush:'post'})
onActivated(()=>{active=true})
onDeactivated(()=>{quickTodoTitle.value='';quickTodoDescription.value='';quickTodoCategoryId.value=todoStore.categories[0]?.id || '';active=false;isFocused.value=false;isDraftingTodo.value=false;categoryOpen.value=false;categorySaving.value=false;draftDialogRef.value?.close();releaseScroll()})
onUnmounted(()=>{disposed=true;dialogEpoch++;draftDialogRef.value?.close();releaseScroll()})
watch(()=>todoStore.categories,categories=>{if(categories.length && !categories.some(category=>category.id===quickTodoCategoryId.value))quickTodoCategoryId.value=categories[0]!.id},{immediate:true})
const categoryOptions=computed(()=>todoStore.categories.map(category=>({value:category.id,label:category.name})))
function cancelDraft(){
 if(saving.value || mediaBusy.value || categorySaving.value)return
 isFocused.value=false;isDraftingTodo.value=false;quickTodoTitle.value='';quickTodoDescription.value=''
}
async function saveDraft(){
 if(saving.value || mediaBusy.value || categorySaving.value || !quickTodoTitle.value.trim() || !quickTodoCategoryId.value)return
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
</style>
