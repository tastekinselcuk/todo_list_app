<template>
  <article ref="itemRef" :data-search-record="todo.id" :data-shared-editing="isEditing && canWrite" class="workspace-card note-card group/item relative w-full" :class="{ 'is-expanded': isExpanded, 'is-complete': todo.completed }" @click="onCardClick">
    <div class="note-summary">
      <button type="button" :disabled="!canWrite || disabled || saving" :aria-label="`${t('todo.toggleCompletion')}: ${todo.title}`" :aria-pressed="todo.completed" @click.stop="$emit('toggle')" class="note-check" :class="{ checked:todo.completed }"><Check v-if="todo.completed" class="h-3 w-3" /></button>
      <div class="note-content" :class="{ 'drag-handle':canWrite && !isExpanded && !disabled }">
        <button type="button" class="note-heading" :class="{ 'line-through text-muted-foreground':todo.completed }" :aria-label="`${t('todo.viewNote')}: ${todo.title}`" :aria-expanded="isExpanded" :disabled="disabled || saving || mediaBusy" :title="todo.title" @click.stop="onCardClick()">{{ todo.title }}</button>
        <p v-if="descriptionPreview" class="note-preview">{{ descriptionPreview }}</p>
      </div>
      <div class="note-actions" @click.stop>
        <button type="button" class="note-icon" :aria-label="t('common.copy')" :title="t('common.copy')" @click="copyNote"><Copy class="h-[15px] w-[15px]" /></button>
        <button v-if="canWrite && !isEditing && !isExpanded" type="button" :disabled="disabled || saving" class="note-icon" :aria-label="t('todo.editTask')" :title="t('todo.editTask')" @click="startEdit"><Pencil class="h-[15px] w-[15px]" /></button>
        <button v-if="isExpanded" type="button" :disabled="saving || mediaBusy" class="note-icon" :aria-label="t('common.close')" :title="t('common.close')" @click="closeEdit"><ChevronUp class="h-[15px] w-[15px]" /></button>
        <button v-if="canWrite" type="button" :disabled="disabled || saving || mediaBusy" class="note-icon delete-action" :aria-label="t('todo.deleteTask')" :title="t('todo.deleteTask')" @click="$emit('delete')"><Trash2 class="h-[15px] w-[15px]" /></button>
      </div>
    </div>
    <Transition name="note-reveal">
      <div v-if="isExpanded" class="note-reveal">
        <div class="note-reveal-inner">
          <div class="note-reveal-body mt-3 border-t border-border/50 pt-3">
            <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
              <span class="inline-flex min-w-0 max-w-full items-center gap-1.5"><span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{backgroundColor:color}" /><span class="truncate">{{ categoryName }}</span></span>
              <time v-if="todo.createdAt" :datetime="todo.createdAt">{{ t('todo.createdOn',{date:formatDate(todo.createdAt)}) }}</time>
              <button v-if="canWrite && !isEditing" type="button" class="note-edit-button ml-auto" :disabled="disabled" @click="startEdit"><Pencil class="h-3 w-3" />{{ t('common.edit') }}</button>
            </div>
            <RichTextEditor key="reader" :model-value="todo.description || ''" :disabled="true" />

          </div>
        </div>
      </div>
    </Transition>
    <Teleport to="body">
      <dialog ref="editDialogRef" class="note-edit-dialog" closedby="closerequest" :aria-label="t('todo.editTask')" @dblclick="event=>{if(isDialogBackdropDoubleClick(event))leaveEditing()}" @cancel.prevent="leaveEditing" @close="onEditDialogClosed">
            <form v-if="isEditing" class="note-edit-form" @submit.prevent="saveEdit">
              <div class="flex shrink-0 items-center justify-between gap-3">
                <span class="text-xs font-medium text-muted-foreground">{{ t('todo.editTask') }}</span>
                <button type="button" class="note-icon" :disabled="saving || mediaBusy" :aria-label="t('common.close')" @click="leaveEditing"><X class="h-4 w-4" /></button>
              </div>
              <div class="flex shrink-0 flex-wrap items-center gap-2">
                <input ref="titleInputRef" v-model="editForm.title" type="text" required :maxlength="TODO_TITLE_MAX_LENGTH" :disabled="saving" :aria-label="t('todo.title')" class="note-input h-9 min-w-36 flex-1" />
                <CustomSelect :model-value="editForm.categoryId ?? ''" @update:model-value="editForm.categoryId=$event || ''" :options="categoryOptions" :disabled="saving" :aria-label="t('todo.category')" size="sm" class="w-40 min-w-0" />
              </div>
              <RichTextEditor :fit-height="true" key="writer" v-model="editForm.description" :disabled="saving" :placeholder="t('todo.descriptionPlaceholder')" @busy-change="mediaBusy=$event" />
              <div v-if="editConflict" role="alert" class="shrink-0 rounded-xl border border-border/50 bg-muted/30 p-3 text-xs">
                <p class="text-muted-foreground">{{ t('sharing.conflict') }}</p>
                <p v-if="draftRefreshed" class="mt-2 truncate">{{ todo.title }}</p>
                <button type="button" :disabled="saving" class="mt-2 font-medium text-primary" @click="refreshDraftVersion">{{ t('sharing.refreshDraft') }}</button>
              </div>
              <div class="flex shrink-0 justify-end gap-1.5 border-t border-border/30 pt-3">
                <button type="button" :disabled="saving || mediaBusy" class="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40" @click="cancelEdit">{{ t('common.cancel') }}</button>
                <button type="submit" :disabled="saving || mediaBusy || !isFormChanged || !editForm.title.trim()" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="saving" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ t('todo.saveChanges') }}</button>
              </div>
            </form>
      </dialog>
    </Teleport>
  </article>
</template>
<script setup lang="ts">
import { useModuleAccess } from '@/lib/workspaceScope'
import { ref, watch, computed, nextTick, defineAsyncComponent, onBeforeUnmount, onDeactivated } from 'vue'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { Check, ChevronUp, Trash2, Pencil, Copy, Loader2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { Todo } from '@/features/todos/stores/todo'
import { useTodoStore, TODO_TITLE_MAX_LENGTH } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { isDialogBackdropDoubleClick } from '@/lib/utils'
const RichTextEditor = defineAsyncComponent(() => import('./RichTextEditor.vue'))

const { canWrite } = useModuleAccess('detailed')

const PREVIEW_MAX_CHARS = 160

const props = defineProps<{
  todo: Todo
  color: string
  categoryName: string
  disabled?: boolean
}>()

defineEmits<{
  toggle: []
  delete: []
}>()

const { t, locale } = useI18n()
const todoStore = useTodoStore()
const uiStore = useUIStore()

const itemRef = ref<HTMLElement | null>(null)
const titleInputRef = ref<HTMLInputElement | null>(null)
const editDialogRef=ref<HTMLDialogElement|null>(null)
let dialogEpoch=0,dialogDisposed=false
let scrollLock:{body:string;root:string;gutter:string}|null=null
function releaseEditorScroll(){
  if(!scrollLock)return
  document.body.style.overflow=scrollLock.body
  document.documentElement.style.overflow=scrollLock.root
  document.documentElement.style.scrollbarGutter=scrollLock.gutter
  scrollLock=null
}
function closeEditorDialog(){editDialogRef.value?.close();releaseEditorScroll()}
function leaveEditing(){if(!saving.value && !mediaBusy.value)isEditing.value=false}
function onEditDialogClosed(){if(!editDialogRef.value?.open){releaseEditorScroll();if(isEditing.value)isEditing.value=false}}
onBeforeUnmount(()=>{dialogDisposed=true;dialogEpoch++;closeEditorDialog()})
onDeactivated(()=>{dialogEpoch++;isEditing.value=false;closeEditorDialog()})

const isExpanded = ref(false), isEditing = ref(false)
const editConflict = ref(false), draftRefreshed = ref(false), saving = ref(false), mediaBusy = ref(false)
const editForm = useWorkspaceDraft<Todo>(`todo-edit:${props.todo.id}`, { ...props.todo })

const isFormChanged = computed(() => JSON.stringify(editForm.value) !== JSON.stringify(props.todo))

/** Text-only preview: strip images/media; empty when description is image-only. */
const descriptionPreview = computed(() => {
  const html = props.todo.description
  if (!html?.trim()) return ''

  try {
    const text = descriptionText(html)
    if (!text) return ''
    if (text.length <= PREVIEW_MAX_CHARS) return text
    return `${text.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…`
  } catch {
    const stripped = html
      .replace(/<img[\s\S]*?>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!stripped) return ''
    if (stripped.length <= PREVIEW_MAX_CHARS) return stripped
    return `${stripped.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…`
  }
})

const categoryOptions = computed(() => todoStore.categories.map(cat => ({ value: cat.id, label: cat.name })))

watch(isEditing, async editing => {
  const epoch=++dialogEpoch
  if(!editing){closeEditorDialog();return}
  await nextTick()
  if(dialogDisposed || epoch!==dialogEpoch || !isEditing.value || !editDialogRef.value)return
  if(!editDialogRef.value.open){
    scrollLock={body:document.body.style.overflow,root:document.documentElement.style.overflow,gutter:document.documentElement.style.scrollbarGutter}
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden'
    document.documentElement.style.scrollbarGutter='stable'
    try{editDialogRef.value.showModal()}catch{releaseEditorScroll();isEditing.value=false;return}
  }
  titleInputRef.value?.focus({preventScroll:true})
})

watch(() => props.todo, (newTodo) => {
  if (!isEditing.value) {
    editForm.value = { ...newTodo }
  } else if (newTodo.version !== editForm.value.version) {
    editConflict.value = true
    draftRefreshed.value = false
  }
}, { deep: true })

const onCardClick = (event?: MouseEvent) => {
  if (props.disabled || saving.value || mediaBusy.value || isEditing.value) return
  if (event) {
    const target = event.target as HTMLElement | null
    if (isExpanded.value && target?.closest?.('.note-reveal')) return
    if (target?.closest?.('button,a,input,textarea,select,label,summary,dialog,img,.note-image-node,[role="button"],[role="checkbox"],[role="switch"],[contenteditable="true"]')) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && (itemRef.value?.contains(selection.anchorNode) || itemRef.value?.contains(selection.focusNode))) return
  }
  isExpanded.value = !isExpanded.value
}

const startEdit = () => {
  if(!canWrite.value || props.disabled || saving.value || mediaBusy.value)return
  isExpanded.value=true;isEditing.value=true
  if(editForm.value.version!==props.todo.version)editConflict.value=true
}

const closeEdit = () => {
  if (saving.value || mediaBusy.value) return
  isEditing.value=false;isExpanded.value = false
}

const cancelEdit = () => {
  if (saving.value || mediaBusy.value) return
  editForm.value = { ...props.todo }
  editConflict.value = false; draftRefreshed.value = false
  isEditing.value=false
}

const saveEdit = async () => {
  if (!canWrite.value || !isEditing.value) return
  if (saving.value || mediaBusy.value || !editForm.value.title.trim()) return
  if(editForm.value.title.trim().length>TODO_TITLE_MAX_LENGTH && editForm.value.title.trim()!==props.todo.title.trim()){
    uiStore.addToast(t('todo.titleTooLong',{count:TODO_TITLE_MAX_LENGTH}), 'error');return
  }
  saving.value = true
  let saved = false
  try { saved = await todoStore.updateTodo({ ...editForm.value, title: editForm.value.title.trim(), completed: props.todo.completed }) } finally { saving.value = false }
  if (!saved) {
    editConflict.value = Boolean(todoStore.error?.includes('SHARING_CONFLICT'))
    if (!editConflict.value) uiStore.addToast(t('todo.saveFailed'), 'error')
    return
  }
  editConflict.value = false; draftRefreshed.value = false
  uiStore.addToast(t('todo.taskUpdated') || 'Görev güncellendi', 'info')
  editForm.value={...(todoStore.todos.find(note=>note.id===props.todo.id) || props.todo)}
  isEditing.value=false
}
const refreshDraftVersion = async () => {
  if (!await todoStore.fetchTodos()) return
  const latest = todoStore.todos.find(todo => todo.id === props.todo.id)
  if (!latest) return
  editForm.value.version = latest.version
  draftRefreshed.value = true
  uiStore.addToast(t('sharing.draftReady'), 'info')
}

async function copyNote(){
  try{
    await navigator.clipboard.writeText([props.todo.title,descriptionText(props.todo.description)].filter(Boolean).join('\n\n'))
    uiStore.addToast(t('todo.noteCopied'),'success')
  }catch{uiStore.addToast(t('todo.copyFailed'),'error')}
}
function descriptionText(html:string){
  const doc=new DOMParser().parseFromString(html,'text/html')
  doc.querySelectorAll('img,svg,script,style').forEach(el=>el.remove())
  doc.querySelectorAll('p,li,h1,h2,h3,tr,summary').forEach(el=>el.append(doc.createTextNode(' ')))
  return (doc.body.textContent || '').replace(/\s+/g,' ').trim()
}

// Utils
const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', ...(new Date(date).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }) : ''
</script>

<style scoped>

.note-card { padding:10px 12px; background:hsl(var(--card)/.4); cursor:pointer; }
.note-card:hover,.note-card:focus-within { background:hsl(var(--muted)/.5); }
.note-card.is-complete { background:hsl(var(--muted)/.25); }
.note-card.is-expanded { @apply z-20; }
.note-card > .note-reveal { cursor:auto; }
.note-summary { display:flex; align-items:center; gap:13px; min-height:44px; }
.note-check { height:19px; width:19px; border:1px solid hsl(var(--muted-foreground)/.4); border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.note-check.checked { background:hsl(var(--primary)); border-color:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }
.note-content { flex:1; min-width:0; }
.note-heading { display:block; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left; font-size:13px; font-weight:400; line-height:20px; }
.note-preview { margin-top:3px; font-size:12px; line-height:17px; color:hsl(var(--muted-foreground)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.note-actions { display:flex; align-items:center; gap:2px; flex-shrink:0; }
.note-icon { @apply inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40; }
.delete-action:hover { @apply bg-destructive/10 text-destructive; }
.note-edit-button { @apply inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground; }
.note-input { @apply rounded-xl border border-border/60 bg-background/60 px-3 text-xs text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-50; }
.note-card button:focus-visible { outline:2px solid hsl(var(--primary)/.3); outline-offset:2px; }
@media(max-width:639px){.note-summary{gap:10px}.note-icon{width:26px;height:28px}}
@media(prefers-reduced-motion:reduce){.note-card,.note-icon{transition:none}}
</style>
