<script setup lang="ts">
import { computed,type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeftRight,BookOpen,CalendarDays,CheckSquare,Clapperboard,Code2,Columns3,Dumbbell,Layers,ListTodo,NotebookPen,Repeat,ShieldCheck,Timer,TrendingUp,Zap } from 'lucide-vue-next'
import CustomSelect from './CustomSelect.vue'
import { getWorkspaceModuleOptions,workspaceSectionFor } from '@/lib/workspaceSections'

const props=withDefaults(defineProps<{modelValue:string;enabled:string[];activeView?:string}>(),{activeView:''})
const emit=defineEmits<{'update:modelValue':[module:string];navigate:[module:string,view:string]}>()
const {t}=useI18n()
const icons:Record<string,Component>={ArrowLeftRight,BookOpen,CalendarDays,CheckSquare,Clapperboard,Code2,Columns3,Dumbbell,Layers,ListTodo,NotebookPen,Repeat,ShieldCheck,Timer,TrendingUp,Zap}
const choices=computed(()=>getWorkspaceModuleOptions(props.enabled,props.modelValue))
const options=computed(()=>choices.value.map(item=>({...item,label:t(item.label)})))
const selected=computed(()=>choices.value.find(item=>item.module===props.modelValue&&(!item.view||item.view===props.activeView))||choices.value.find(item=>item.module===props.modelValue))
const label=computed(()=>t('workspaceNav.moduleOptions',{section:t(`workspaceNav.sections.${workspaceSectionFor(props.modelValue)}`)}))
function select(value:string){
  const item=choices.value.find(choice=>choice.value===value)
  if(!item)return
  if(item.view)emit('navigate',item.module,item.view)
  else emit('update:modelValue',item.module)
}
</script>

<template>
  <CustomSelect v-if="options.length" class="workspace-module-picker min-w-0 max-w-[260px]" :model-value="selected?.value||''" :options="options" :aria-label="label" :popover="true" size="sm" variant="ghost" @update:model-value="select">
    <template #value><span class="flex min-w-0 items-center gap-2"><component :is="icons[selected?.icon||'NotebookPen']" class="h-3.5 w-3.5 shrink-0" :stroke-width="1.65" /><span class="truncate">{{ selected?t(selected.label):'' }}</span></span></template>
    <template #option="{option}"><component :is="icons[choices.find(item=>item.value===option.value)?.icon||'NotebookPen']" class="h-3.5 w-3.5 shrink-0" :stroke-width="1.65" /><span class="truncate">{{ option.label }}</span></template>
  </CustomSelect>
</template>

<style scoped>
.workspace-module-picker :deep(.select-menu) {
  padding: 4px;
  border-radius: 10px;
}

.workspace-module-picker :deep(.select-options) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.workspace-module-picker :deep(.select-option) {
  box-sizing: border-box;
  min-width: 0;
  min-height: 30px;
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 6px;
  outline: none;
  font-weight: 500;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.workspace-module-picker :deep(.select-option:hover:not(:disabled)),
.workspace-module-picker :deep(.select-option:focus-visible) {
  background-color: hsl(var(--primary) / 0.07);
  color: hsl(var(--primary));
}

.workspace-module-picker :deep(.select-option-selected) {
  background-color: hsl(var(--primary) / 0.1);
}

.workspace-module-picker :deep(.select-option-selected:hover),
.workspace-module-picker :deep(.select-option-selected:focus-visible) {
  background-color: hsl(var(--primary) / 0.13);
}

.workspace-module-picker :deep(.select-option:focus-visible) {
  box-shadow: inset 0 0 0 1px hsl(var(--primary) / 0.22);
}

@media (prefers-reduced-motion: reduce) {
  .workspace-module-picker :deep(.select-option) {
    transition: none;
  }
}
</style>
