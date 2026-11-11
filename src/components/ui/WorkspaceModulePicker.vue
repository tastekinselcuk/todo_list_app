<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,onMounted,ref,watch,type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeftRight,BookOpen,CalendarDays,CheckSquare,Clapperboard,Code2,Columns3,Dumbbell,Layers,ListTodo,NotebookPen,Repeat,ShieldCheck,Timer,TrendingUp,Zap } from 'lucide-vue-next'
import { getWorkspaceModuleOptions,workspaceSectionFor } from '@/lib/workspaceSections'
import { navigationModules } from '@/lib/moduleCatalog'
import { useWorkspacesStore } from '@/stores/workspaces'
import { readStoredJSON,writeStoredJSON } from '@/lib/storage'
import { normalizeTabOrder,reorderVisibleTabs } from '@/lib/workspaceTabOrder'
import draggable from 'vuedraggable'

const props=withDefaults(defineProps<{modelValue:string;enabled:string[];activeView?:string}>(),{activeView:''})
const emit=defineEmits<{'update:modelValue':[module:string];navigate:[module:string,view:string]}>()
const {t}=useI18n()
const icons:Record<string,Component>={ArrowLeftRight,BookOpen,CalendarDays,CheckSquare,Clapperboard,Code2,Columns3,Dumbbell,Layers,ListTodo,NotebookPen,Repeat,ShieldCheck,Timer,TrendingUp,Zap}
const workspaces=useWorkspacesStore()
const available=computed(()=>getWorkspaceModuleOptions(props.enabled,props.modelValue))
const known=computed(()=>getWorkspaceModuleOptions(navigationModules.map(module=>module.id),props.modelValue).map(item=>item.value))
const storageKey=computed(()=>workspaces.userId&&workspaces.activeId?`workspace:${workspaces.userId}:${workspaces.activeId}:section-tab-order:${workspaceSectionFor(props.modelValue)}:v1`:'')
const order=ref<string[]>([]),dragging=ref(false),reducedMotion=ref(false),announcement=ref('')
watch([storageKey,()=>known.value.join('|')],()=>{order.value=normalizeTabOrder(known.value,storageKey.value?readStoredJSON<unknown>(storageKey.value,[],Array.isArray):[])},{immediate:true,flush:'sync'})
const choices=computed(()=>{const byId=new Map(available.value.map(item=>[item.value,item]));return order.value.flatMap(id=>{const item=byId.get(id);return item?[item]:[]})})
const reorderHint=computed(()=>t('workspaceNav.reorderTabs'))
const context=computed(()=>JSON.stringify([storageKey.value,workspaceSectionFor(props.modelValue),available.value.map(item=>item.value)]))
let dragContext='',clickBlockedUntil=0
function startDrag(){dragContext=context.value;dragging.value=true}
function endDrag(){dragging.value=false;clickBlockedUntil=Date.now()+200;dragContext=''}
function saveOrder(next:string[]){
  const updated=reorderVisibleTabs(order.value,choices.value.map(item=>item.value),next)
  if(!updated)return
  order.value=updated
  if(storageKey.value)writeStoredJSON(storageKey.value,updated)
  announcement.value=t('workspaceNav.tabOrderSaved')
}
function reorder(items:typeof available.value){if(dragging.value&&dragContext===context.value)saveOrder(items.map(item=>item.value))}
let motion:MediaQueryList|undefined
function updateMotion(){reducedMotion.value=Boolean(motion?.matches)}
onMounted(()=>{motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');updateMotion();motion?.addEventListener('change',updateMotion)})
onBeforeUnmount(()=>motion?.removeEventListener('change',updateMotion))
const selected=computed(()=>choices.value.find(item=>item.module===props.modelValue&&(!item.view||item.view===props.activeView))||choices.value.find(item=>item.module===props.modelValue))
const label=computed(()=>t('workspaceNav.moduleOptions',{section:t(`workspaceNav.sections.${workspaceSectionFor(props.modelValue)}`)}))
function select(value:string){
  if(dragging.value||Date.now()<clickBlockedUntil)return
  const item=choices.value.find(choice=>choice.value===value)
  if(!item)return
  if(item.view)emit('navigate',item.module,item.view)
  else emit('update:modelValue',item.module)
}
function navigateTabs(event:KeyboardEvent){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  const buttons=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=tab]'))
  if(!buttons.length)return
  if(event.ctrlKey||event.metaKey||event.shiftKey)return
  if(event.altKey){
    if(!['ArrowLeft','ArrowRight'].includes(event.key)||dragging.value)return
    event.preventDefault()
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement),destination=index+(event.key==='ArrowRight'?1:-1)
    if(index<0||destination<0||destination>=buttons.length)return
    const id=choices.value[index]!.value,ids=choices.value.map(item=>item.value),root=event.currentTarget as HTMLElement
    ids.splice(destination,0,ids.splice(index,1)[0]!);saveOrder(ids)
    void nextTick(()=>Array.from(root.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(button=>button.dataset.tabValue===id)?.focus())
    return
  }
  event.preventDefault()
  const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length
  select(choices.value[next]!.value);buttons[next]?.focus()
}
</script>

<template>
  <draggable v-if="choices.length" :model-value="choices" item-key="value" tag="div" role="tablist" :aria-label="label" :aria-description="reorderHint" class="workspace-module-tabs" :disabled="choices.length<2" :animation="reducedMotion?0:180" :delay="180" :delay-on-touch-only="true" :touch-start-threshold="5" :fallback-tolerance="5" :force-fallback="true" :fallback-on-body="true" ghost-class="workspace-tab-ghost" fallback-class="workspace-tab-dragging" @start="startDrag" @update:model-value="reorder" @end="endDrag" @keydown="navigateTabs">
    <template #item="{element:item}"><button :key="item.value" :data-tab-value="item.value" type="button" role="tab" :aria-selected="selected?.value===item.value" :tabindex="selected?.value===item.value?0:-1" :title="`${t(item.label)} · ${reorderHint}`" :aria-label="t(item.label)" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" class="workspace-module-tab" @click="select(item.value)"><component :is="icons[item.icon]" class="h-3.5 w-3.5 shrink-0" :stroke-width="1.65" /><span>{{ t(item.label) }}</span></button></template>
  </draggable>
  <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
</template>

<style scoped>
.workspace-module-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:2px;max-width:100%;min-width:0}
.workspace-module-tab{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:30px;padding:6px 9px;border:1px solid transparent;border-radius:8px;white-space:nowrap;font-size:11px;font-weight:500;color:hsl(var(--muted-foreground));transition:background 150ms,color 150ms,border-color 150ms}
.workspace-module-tab:hover{background:hsl(var(--primary)/.06);color:hsl(var(--primary))}
.workspace-module-tab[aria-selected='true']{background:hsl(var(--primary)/.1);border-color:hsl(var(--primary)/.12);color:hsl(var(--primary))}
.workspace-module-tab:focus-visible{outline:2px solid hsl(var(--primary)/.3);outline-offset:2px}
.workspace-module-tab{cursor:grab;touch-action:pan-y;user-select:none}
.workspace-module-tab:active{cursor:grabbing}
.workspace-tab-ghost{opacity:.3}
.workspace-tab-dragging{background:hsl(var(--card));border-color:hsl(var(--primary)/.2);border-radius:8px;box-shadow:0 6px 18px rgb(0 0 0/.1);cursor:grabbing}
@media(max-width:639px){.workspace-module-tab{width:32px;padding:7px}.workspace-module-tab>span{display:none}}
@media(prefers-reduced-motion:reduce){.workspace-module-tab{transition:none}}
</style>
