<template>
  <div ref="container" class="relative min-w-0">
    <button ref="trigger" type="button" class="project-trigger" :disabled="disabled" :aria-label="t('tasks.project')" :aria-expanded="open" aria-haspopup="menu" @click="toggle"><FolderTree :size="13" class="shrink-0 opacity-60" /><span class="min-w-0 flex-1 truncate text-left">{{ label }}</span><ChevronDown :size="12" :class="open&&'rotate-180'" class="shrink-0 transition-transform" /></button>
    <div v-show="open" ref="menu" popover="manual" role="menu" class="project-menu" :style="position" @keydown.esc.stop.prevent="close">
      <button v-if="filter" type="button" role="menuitemradio" :aria-checked="!modelValue" class="project-option" :class="!modelValue&&'is-selected'" @click="select('')">{{ t('tasks.allProjects') }}</button>
      <button type="button" role="menuitemradio" :aria-checked="modelValue===(filter?unassignedProject:'')" class="project-option" :class="modelValue===(filter?unassignedProject:'')&&'is-selected'" @click="select(filter?unassignedProject:'')">{{ t('tasks.noProject') }}</button>
      <div class="my-1 h-px bg-border/50" />
      <div class="max-h-52 overflow-y-auto overscroll-contain">
        <div v-for="project in projects" :key="project.id" class="flex items-center rounded-lg" :class="modelValue===project.id&&'bg-primary/5'">
          <button type="button" role="menuitemradio" :aria-checked="modelValue===project.id" :disabled="!filter&&project.archived&&modelValue!==project.id" class="project-option min-w-0 flex-1" :class="modelValue===project.id&&'is-selected'" @click="select(project.id)"><span class="truncate">{{ project.name }}</span><span v-if="project.archived" class="ml-auto text-[9px] opacity-60">{{ t('tasks.archived') }}</span></button>
          <button v-if="project.archived" type="button" class="finance-icon !h-7 !w-7" :aria-label="t('tasks.restoreProject')" @click="restore(project)"><ArchiveRestore :size="12" /></button><button type="button" class="finance-icon !h-7 !w-7" :aria-label="t('common.edit')+': '+project.name" @click="request('rename',project)"><Pencil :size="12" /></button>
          <button type="button" class="finance-icon !mr-1 !h-7 !w-7 hover:!text-destructive" :aria-label="t('tasks.deleteProject')+': '+project.name" @click="request('delete',project)"><Trash2 :size="12" /></button>
        </div>
      </div>
      <button type="button" class="project-option mt-1 border-t border-border/50 !pt-2.5 text-muted-foreground" @click="request('create')"><Plus :size="13" />{{ t('tasks.addProject') }}</button>
    </div>
    <Teleport to="body">
      <dialog v-if="action" ref="dialog" class="project-dialog" :aria-label="t(action==='delete'?'tasks.deleteProject':action==='rename'?'tasks.renameProject':'tasks.addProject')" @cancel.prevent="dismiss" @keydown.esc.stop.prevent="dismiss" @dblclick="event=>{if(isDialogBackdropDoubleClick(event))dismiss()}">
        <form @submit.prevent="submit">
          <header class="mb-4 flex items-center justify-between gap-3"><span class="text-sm font-medium">{{ t(action==='delete'?'tasks.deleteProject':action==='rename'?'tasks.renameProject':'tasks.addProject') }}</span><button type="button" class="finance-icon" :disabled="working" :aria-label="t('common.close')" @click="dismiss"><X :size="15" /></button></header>
          <template v-if="action==='delete'"><p class="mb-2 break-words text-sm">{{ selected?.name }}</p><p class="text-xs leading-6 text-muted-foreground">{{ t('tasks.deleteProjectHint') }}</p></template>
          <input v-else ref="nameInput" v-model="name" maxlength="100" required class="finance-input" :aria-label="t('tasks.projectName')" :placeholder="t('tasks.projectName')" :disabled="working" />
          <p v-if="failed" role="alert" class="mt-3 text-xs text-destructive">{{ t('tasks.failed') }}</p>
          <footer class="mt-5 flex justify-end gap-2"><button type="button" class="h-9 rounded-xl px-3 text-xs text-muted-foreground hover:bg-muted/30" :disabled="working" @click="dismiss">{{ t('common.cancel') }}</button><button type="submit" class="workspace-add-button !h-9 !px-3" :class="action==='delete'&&'!bg-destructive !text-destructive-foreground'" :disabled="working||(action!=='delete'&&!name.trim())"><Loader2 v-if="working" :size="12" class="animate-spin" />{{ t(action==='delete'?'common.delete':'common.save') }}</button></footer>
        </form>
      </dialog>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,onMounted,ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArchiveRestore,ChevronDown,FolderTree,Loader2,Pencil,Plus,Trash2,X } from 'lucide-vue-next'
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { unassignedProject,type WorkProject } from '../lib/tasks'
const props=defineProps<{modelValue:string;projects:WorkProject[];disabled?:boolean;filter?:boolean;saveProject:(name:string,id:string,version?:number,archived?:boolean)=>Promise<WorkProject|null>;deleteProject:(project:WorkProject)=>Promise<boolean>}>()
const emit=defineEmits<{'update:modelValue':[value:string]}>(),{t}=useI18n()
const container=ref<HTMLElement>(),trigger=ref<HTMLButtonElement>(),menu=ref<HTMLElement>(),open=ref(false),position=ref({top:'0px',left:'0px'})
const action=ref<'create'|'rename'|'delete'|null>(null),selected=ref<WorkProject>(),name=ref(''),dialog=ref<HTMLDialogElement>(),nameInput=ref<HTMLInputElement>(),working=ref(false),failed=ref(false)
let newId='',disposed=false,scroll:{body:string;root:string}|null=null
const label=computed(()=>props.projects.find(row=>row.id===props.modelValue)?.name||t(props.filter&&!props.modelValue?'tasks.allProjects':'tasks.noProject'))
function close(){open.value=false;menu.value?.hidePopover?.()}
async function toggle(){if(props.disabled)return;if(open.value){close();return}open.value=true;await nextTick();const rect=trigger.value?.getBoundingClientRect();if(rect)position.value={top:`${Math.max(8,Math.min(window.innerHeight-300,rect.bottom+6))}px`,left:`${Math.max(8,Math.min(window.innerWidth-280,rect.left))}px`};if(menu.value?.showPopover)menu.value.showPopover();else menu.value?.removeAttribute('popover')}
function select(value:string){if(props.disabled)return;emit('update:modelValue',value);close();trigger.value?.focus({preventScroll:true})}
async function request(kind:'create'|'rename'|'delete',project?:WorkProject){if(props.disabled)return;close();action.value=kind;selected.value=project;name.value=project?.name||'';failed.value=false;newId=crypto.randomUUID();await nextTick();if(disposed||!dialog.value)return;if(document.body.style.overflow!=='hidden'){scroll={body:document.body.style.overflow,root:document.documentElement.style.overflow};document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden'}dialog.value.showModal();if(kind!=='delete')nameInput.value?.focus({preventScroll:true})}
function release(){if(scroll){document.body.style.overflow=scroll.body;document.documentElement.style.overflow=scroll.root;scroll=null}}
function dismiss(){if(working.value)return;dialog.value?.close();action.value=null;name.value='';release();trigger.value?.focus({preventScroll:true})}
async function restore(project:WorkProject){if(props.disabled||working.value)return;working.value=true;try{await props.saveProject(project.name,project.id,project.version,false)}finally{working.value=false}}
async function submit(){if(working.value||!action.value||action.value!=='delete'&&!name.value.trim())return;working.value=true;failed.value=false;let success=false;try{if(action.value==='delete'&&selected.value){success=await props.deleteProject(selected.value);if(success&&props.modelValue===selected.value.id)emit('update:modelValue','')}else{const result=await props.saveProject(name.value.trim(),selected.value?.id||newId,selected.value?.version);if(result){success=true;emit('update:modelValue',result.id)}}}finally{working.value=false}if(!disposed){if(success)dismiss();else failed.value=true}}
function outside(event:PointerEvent){if(open.value&&!container.value?.contains(event.target as Node))close()}
onMounted(()=>document.addEventListener('pointerdown',outside))
onBeforeUnmount(()=>{disposed=true;close();dialog.value?.close();release();document.removeEventListener('pointerdown',outside)})
</script>
<style scoped>
.project-trigger{display:flex;align-items:center;gap:7px;width:100%;height:34px;border:1px solid hsl(var(--border)/.65);border-radius:10px;padding:0 10px;background:hsl(var(--background)/.5);font-size:11px}.project-trigger:hover{background:hsl(var(--muted)/.2)}.project-trigger:disabled{opacity:.45}.project-trigger:focus-visible{outline:2px solid hsl(var(--primary)/.25);outline-offset:2px}
.project-menu{position:fixed;inset:auto;margin:0;width:272px;max-width:calc(100vw - 16px);padding:4px;border:1px solid hsl(var(--border)/.65);border-radius:12px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 12px 35px rgb(0 0 0/.12);z-index:9999}.project-option{display:flex;align-items:center;gap:7px;width:100%;padding:8px 9px;border-radius:8px;font-size:11px;text-align:left}.project-option:hover,.project-option:focus-visible{background:hsl(var(--muted)/.5);outline:none}.project-option.is-selected{background:hsl(var(--primary)/.07);color:hsl(var(--primary))}.project-option:disabled{opacity:.4}
.project-dialog{width:min(380px,calc(100vw - 32px));margin:auto;padding:20px;border:1px solid hsl(var(--border)/.65);border-radius:20px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 20px 70px rgb(0 0 0/.16)}.project-dialog::backdrop{background:hsl(var(--background)/.65);backdrop-filter:blur(5px)}
@media(prefers-reduced-motion:no-preference){.project-dialog[open]{animation:project-enter .16s ease-out}@keyframes project-enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}}
</style>
