<template>
  <Transition name="category-reveal" @after-leave="resetDraft">
    <div v-if="open" class="category-reveal">
      <div class="category-reveal-inner">
        <form id="todo-category-form" ref="formContainerRef" @submit.prevent="handleSubmit" @keydown.esc.stop.prevent="closeModal(true)" class="category-form mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/50 p-3" :aria-label="t('todo.addNewCategory')" :aria-busy="saving">
          <div class="flex min-w-0 flex-1 basis-48 items-center gap-2">
            <button ref="colorTriggerRef" type="button" class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/50 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :title="t('todo.color')" :aria-label="t('todo.color')" :aria-expanded="colorOpen" aria-haspopup="dialog" :disabled="saving" @click="toggleColorMenu">
              <span aria-hidden="true" class="h-4 w-4 rounded-full ring-1 ring-inset ring-foreground/10" :style="{backgroundColor:newCategory.color}" />
            </button>
            <div ref="colorMenuRef" popover="auto" role="dialog" :aria-label="t('todo.color')" class="category-color-menu" :style="colorPosition" @toggle="colorOpen=$event.newState==='open'" @keydown.esc.stop.prevent="closeColorMenu();colorTriggerRef?.focus({preventScroll:true})">
              <ColorPalette :model-value="newCategory.color" :options="categoryColors" :label="t('todo.color')" :allow-custom="true" horizontal @update:model-value="chooseColor" />
            </div>
            <input ref="nameInputRef" v-model="newCategory.name" type="text" required autocomplete="off" :disabled="saving" :aria-label="t('todo.categoryName')" :placeholder="t('todo.enterCategoryName')" class="finance-input !h-10 flex-1 !px-3 !text-xs" />
          </div>
          <div class="ml-auto flex items-center gap-1.5">
            <button type="submit" :disabled="saving || !newCategory.name.trim()" class="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 disabled:opacity-40"><Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Plus v-else class="h-3.5 w-3.5" />{{ t('todo.createCategory') }}</button>
            <button type="button" @click="closeModal(true)" :disabled="saving" :aria-label="t('common.close')" class="finance-icon !h-9 !w-9"><X class="h-4 w-4" /></button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onDeactivated } from 'vue'
import { X, Loader2, Plus } from 'lucide-vue-next'
import { useTodoStore } from '@/features/todos/stores/todo'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import ColorPalette from '@/components/ui/ColorPalette.vue'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const todoStore = useTodoStore(), uiStore = useUIStore()
const { t } = useI18n()
const nameInputRef = ref<HTMLInputElement | null>(null), formContainerRef = ref<HTMLElement | null>(null)
const newCategory = ref({ name: '', color: '#3B82F6', icon: 'folder' }), saving = ref(false)
const colorTriggerRef=ref<HTMLButtonElement|null>(null),colorMenuRef=ref<HTMLElement|null>(null),colorOpen=ref(false),colorPosition=ref({top:'0px',left:'0px'})
const categoryColors=computed(()=>Object.entries({gray:'#64748B',brown:'#94735C',orange:'#C9793F',yellow:'#C7A541',green:'#4D8B65',blue:'#4E7EB7',purple:'#8A6CB2',pink:'#B56791',red:'#C25B62'}).map(([name,value])=>({value,label:t('noteEditor.colorNames.'+name),color:value})))
function closeColorMenu(){colorMenuRef.value?.hidePopover?.();colorOpen.value=false}
function toggleColorMenu(){
  if(saving.value)return
  if(colorOpen.value){closeColorMenu();return}
  const rect=colorTriggerRef.value?.getBoundingClientRect()
  if(!rect)return
  const width=Math.min(420,window.innerWidth-16)
  const beside=rect.right+6+width<=window.innerWidth-8
  const height=width<364?70:40
  colorPosition.value={top:`${Math.max(8,Math.min(window.innerHeight-height-8,beside?rect.top:rect.bottom+6))}px`,left:`${beside?rect.right+6:Math.max(8,Math.min(window.innerWidth-width-8,rect.left))}px`}
  colorMenuRef.value?.showPopover?.()
}
function chooseColor(value:string|null){if(saving.value||!value||!/^#[\da-f]{6}$/i.test(value))return;newCategory.value.color=value;closeColorMenu()}
let disposed = false
function resetDraft() { if (!props.open) newCategory.value = { name: '', color: '#3B82F6', icon: 'folder' } }
function closeModal(restoreFocus = false) {
  if (saving.value) return
  closeColorMenu()
  emit('update:open', false)
  if (restoreFocus) document.querySelector<HTMLButtonElement>('[data-category-trigger]')?.focus({ preventScroll: true })
}
const handleClickOutside = (event: MouseEvent) => {
  if (props.open && formContainerRef.value && !formContainerRef.value.contains(event.target as Node)) closeModal()
}
watch(() => props.open, open => {
  if (open) {
    nextTick(() => { if (!disposed && props.open) nameInputRef.value?.focus({ preventScroll: true }) })
    document.addEventListener('click', handleClickOutside)
  } else {
    closeColorMenu()
    document.removeEventListener('click', handleClickOutside)
  }
}, { immediate: true })
onMounted(()=>{window.addEventListener('resize',closeColorMenu);window.addEventListener('scroll',closeColorMenu,{passive:true})})
onDeactivated(closeColorMenu)
onUnmounted(() => { disposed = true; closeColorMenu();document.removeEventListener('click', handleClickOutside);window.removeEventListener('resize',closeColorMenu);window.removeEventListener('scroll',closeColorMenu) })
async function handleSubmit() {
  if (saving.value || !newCategory.value.name.trim()) return
  saving.value = true
  try {
    const result = await todoStore.addCategory({ ...newCategory.value, name: newCategory.value.name.trim() })
    if (result.success) { emit('update:open', false); uiStore.addToast(t('todo.categoryAdded'), 'success') }
    else uiStore.addToast(result.message || t('todo.saveFailed'), 'error')
  } catch {
    uiStore.addToast(t('todo.saveFailed'), 'error')
  } finally { saving.value = false }
}
</script>

<style scoped>
.category-reveal { display:grid; grid-template-rows:1fr; min-width:0; }
.category-reveal-inner { min-height:0; overflow:hidden; }
.category-form { transform:translateY(0); transition:transform 280ms cubic-bezier(.22,1,.36,1); }
.category-reveal-enter-active,.category-reveal-leave-active { transition:grid-template-rows 280ms cubic-bezier(.22,1,.36,1),opacity 200ms ease; }
.category-reveal-enter-from,.category-reveal-leave-to { grid-template-rows:0fr; opacity:0; }
.category-reveal-enter-from .category-form,.category-reveal-leave-to .category-form { transform:translateY(-6px); }
.category-color-menu{position:fixed;inset:auto;margin:0;width:420px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow-y:auto;padding:5px 6px;border:1px solid hsl(var(--border)/.6);border-radius:12px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 6px 20px hsl(var(--foreground)/.08);opacity:0;transform:translateX(-8px) scaleX(.96);transform-origin:left center;transition:opacity 180ms ease,transform 220ms cubic-bezier(.22,1,.36,1),display 220ms allow-discrete,overlay 220ms allow-discrete}
.category-color-menu:popover-open{opacity:1;transform:translateX(0) scaleX(1)}
@starting-style{.category-color-menu:popover-open{opacity:0;transform:translateX(-8px) scaleX(.96)}}
@media (prefers-reduced-motion: reduce) { .category-reveal-enter-active,.category-reveal-leave-active,.category-form { transition:none; } }
@media (prefers-reduced-motion:reduce){.category-color-menu{transition:none}}
</style>
