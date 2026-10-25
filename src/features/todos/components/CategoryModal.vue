<template>
  <Teleport to="body">
    <dialog ref="dialogRef" class="category-dialog" :aria-label="t('todo.addNewCategory')" :aria-busy="saving" :closedby="saving ? 'none' : 'closerequest'" @cancel.prevent="closeModal(true)" @keydown.esc.stop.prevent="closeModal(true)" @click="event => { if (event.target === dialogRef) closeModal(true) }">
      <form v-if="open" id="todo-category-form" @submit.stop.prevent="handleSubmit">
        <header class="category-heading">
          <h2>{{ t('todo.addNewCategory') }}</h2>
          <button type="button" class="finance-icon" :disabled="saving" :aria-label="t('common.close')" @click="closeModal(true)"><X class="h-4 w-4" /></button>
        </header>
        <div class="category-fields">
          <label class="category-name-field"><span>{{ t('todo.categoryName') }}</span><input ref="nameInputRef" v-model="newCategory.name" type="text" required maxlength="60" autocomplete="off" :aria-label="t('todo.categoryName')" :disabled="saving" :placeholder="t('todo.enterCategoryName')" class="finance-input" /></label>
          <div class="space-y-2.5"><span class="category-field-label">{{ t('todo.color') }}</span><fieldset :disabled="saving" class="min-w-0"><ColorPalette :model-value="newCategory.color" :options="categoryColors" :label="t('todo.color')" :allow-custom="true" horizontal @update:model-value="chooseColor" /></fieldset></div>
        </div>
        <footer class="category-footer">
          <button type="button" class="category-cancel" :disabled="saving" @click="closeModal(true)">{{ t('common.cancel') }}</button>
          <button type="submit" :disabled="saving || !newCategory.name.trim()" class="category-submit"><Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Plus v-else class="h-3.5 w-3.5" />{{ t('todo.createCategory') }}</button>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onDeactivated } from 'vue'
import { X, Loader2, Plus } from 'lucide-vue-next'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import ColorPalette from '@/components/ui/ColorPalette.vue'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; created: [id: string]; 'busy-change': [busy: boolean] }>()
const todoStore = useTodoStore(), uiStore = useUIStore(), { t } = useI18n()
const dialogRef = ref<HTMLDialogElement>(), nameInputRef = ref<HTMLInputElement>()
const blankCategory = () => ({ name: '', color: '#4E7EB7', icon: 'folder' })
const newCategory = ref(blankCategory()), saving = ref(false)
const categoryColors = computed(() => Object.entries({gray:'#64748B',brown:'#94735C',orange:'#C9793F',yellow:'#C7A541',green:'#4D8B65',blue:'#4E7EB7',purple:'#8A6CB2',pink:'#B56791',red:'#C25B62'}).map(([name,value]) => ({value,label:t('noteEditor.colorNames.'+name),color:value})))
let disposed=false, epoch=0, previousFocus:HTMLElement|null=null, lockedOverflow:{body:string;root:string}|undefined
function releaseScroll() {
  if (!lockedOverflow) return
  document.body.style.overflow=lockedOverflow.body;document.documentElement.style.overflow=lockedOverflow.root;lockedOverflow=undefined
}
function dismiss() { dialogRef.value?.close();releaseScroll() }
function restoreFocus() {
  const target=previousFocus, parent=target?.closest('dialog')
  if(target?.isConnected && (!parent || parent.open))target.focus({preventScroll:true})
}
function closeModal(restore=false) {
  if(saving.value)return
  dismiss();emit('update:open',false)
  if(restore)void nextTick(()=>{if(!disposed)restoreFocus()})
}
function chooseColor(value:string|null) { if(!saving.value && value && /^#[\da-f]{6}$/i.test(value))newCategory.value.color=value }
watch(saving,busy=>emit('busy-change',busy),{flush:'sync'})
watch(()=>props.open,async open=>{
  const request=++epoch
  if(!open){dismiss();newCategory.value=blankCategory();return}
  previousFocus=document.activeElement as HTMLElement|null
  newCategory.value=blankCategory()
  await nextTick()
  if(disposed || request!==epoch || !props.open || !dialogRef.value)return
  if(document.body.style.overflow!=='hidden'){
    lockedOverflow={body:document.body.style.overflow,root:document.documentElement.style.overflow}
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden'
  }
  try{dialogRef.value.showModal();nameInputRef.value?.focus({preventScroll:true})}
  catch{dismiss();emit('update:open',false)}
},{immediate:true})
onDeactivated(()=>{epoch++;dismiss();emit('update:open',false)})
onBeforeUnmount(()=>{disposed=true;epoch++;dismiss()})
async function handleSubmit() {
  const name=newCategory.value.name.trim()
  if(!props.open || saving.value || !name || name.length>60)return
  const request=epoch
  saving.value=true
  try{
    const result=await todoStore.addCategory({...newCategory.value,name})
    if(disposed || request!==epoch || !props.open)return
    if(!result.success){uiStore.addToast(result.message || t('todo.saveFailed'),'error');return}
    const created=todoStore.categories.find(category=>category.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())
    if(created)emit('created',created.id)
    dismiss();emit('update:open',false);uiStore.addToast(t('todo.categoryAdded'),'success')
    void nextTick(()=>{if(!disposed)restoreFocus()})
  }catch{if(!disposed && request===epoch)uiStore.addToast(t('todo.saveFailed'),'error')}
  finally{saving.value=false}
}
</script>

<style scoped>
.category-dialog{width:calc(100vw - 32px);max-width:440px;max-height:calc(100dvh - 32px);margin:auto;padding:0;overflow-y:auto;overscroll-behavior:contain;border:1px solid hsl(var(--border)/.75);border-radius:20px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 24px 72px hsl(var(--foreground)/.16),0 4px 16px hsl(var(--foreground)/.04);outline:none}
.category-dialog::backdrop{background:hsl(var(--background)/.6);backdrop-filter:blur(5px)}
.category-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px 12px}
.category-heading h2{font-size:14px;font-weight:600;letter-spacing:-.015em}
.category-fields{display:flex;flex-direction:column;gap:20px;padding:4px 20px 22px}
.category-name-field{display:flex;flex-direction:column;gap:8px}
.category-name-field>span,.category-field-label{font-size:11px;font-weight:500;color:hsl(var(--muted-foreground))}
.category-name-field input{font-size:13px;box-shadow:none;backdrop-filter:none}
.category-footer{display:flex;justify-content:flex-end;gap:6px;padding:12px 20px;border-top:1px solid hsl(var(--border)/.5)}
.category-cancel,.category-submit{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;font-size:12px;font-weight:500;transition:background 150ms,color 150ms}
.category-cancel{color:hsl(var(--muted-foreground))}.category-cancel:hover{background:hsl(var(--muted)/.6);color:hsl(var(--foreground))}
.category-submit{background:hsl(var(--primary));color:hsl(var(--primary-foreground))}.category-submit:hover{background:hsl(var(--primary)/.9)}
.category-dialog button:disabled{opacity:.4}.category-dialog button:focus-visible{outline:2px solid hsl(var(--primary)/.35);outline-offset:2px}
@media(prefers-reduced-motion:no-preference){.category-dialog[open]{animation:category-enter 220ms cubic-bezier(.22,1,.36,1)}@keyframes category-enter{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}}
</style>
