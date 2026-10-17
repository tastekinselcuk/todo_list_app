<template>
  <div style="--workspace-default-max:48rem" class="workspace-content mx-auto space-y-4">
    <div class="workspace-toolbar space-y-4">
      <PeriodicTaskForm v-if="canWrite" ref="formRef" :key="editingTask?.id || 'new'" :edit-task="editingTask" :loading="taskStore.isLoading || submitting" @submit="handleSubmit" @cancel="closeForm" />
      <div class="relative flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div class="flex items-center gap-1" role="group" :aria-label="t('periodicTasks.view')">
          <button v-for="view in ['today','all'] as const" :key="view" type="button" :aria-pressed="viewMode===view" class="h-8 rounded-xl px-3 text-xs font-medium transition-colors" :class="viewMode===view?'bg-background text-foreground shadow-sm ring-1 ring-border/50':'text-muted-foreground hover:bg-background/40 hover:text-foreground'" @click="viewMode=view">{{ t(view==='today'?'periodicTasks.todayTasks':'periodicTasks.allRoutines') }}</button>
        </div>
        <div class="flex items-center gap-3">
          <button v-if="browserPermission!=='granted' && browserPermission!=='unsupported'" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground" :title="t(browserPermission==='denied'?'periodicTasks.notificationsDenied':'periodicTasks.enableNotificationsDesc')" @click="enableBrowserNotifications"><Bell class="h-3.5 w-3.5" />{{ t('periodicTasks.enableNotifications') }}</button>
          <span v-if="taskStore.todaysTasks.length" class="text-[11px] tabular-nums text-muted-foreground">{{ t('periodicTasks.completedToday',{done:taskStore.todaysCompletedCount,total:taskStore.todaysTasks.length}) }}</span>
        </div>
        <span v-if="taskStore.todaysTasks.length" class="pointer-events-none absolute bottom-[-1px] left-0 h-px bg-primary/70 transition-[width] duration-300 motion-reduce:transition-none" :style="{width:taskStore.progressPercent+'%'}" />
      </div>
    </div>

    <div v-if="taskStore.isLoading && !taskStore.tasks.length" class="space-y-2" role="status" :aria-label="t('app.loading')"><div v-for="n in 2" :key="n" class="workspace-card h-16 animate-pulse bg-muted/20 motion-reduce:animate-none" /></div>
    <div v-else class="space-y-2">
      <PeriodicTaskItem v-for="task in visibleTasks" :key="task.id" :task="task" :busy="taskStore.isLoading || submitting" :data-search-record="task.id" @toggle="toggleTask" @delete="deleteTask" @edit="startEdit" />
      <p v-if="!visibleTasks.length" class="py-7 text-center text-xs text-muted-foreground">{{ t(viewMode==='today'?'periodicTasks.noTasksToday':'periodicTasks.noRoutines') }}</p>
    </div>
    <p v-if="taskStore.error" class="flex items-center gap-2 text-xs text-destructive" role="alert"><span>{{ taskStore.error }}</span><button type="button" class="text-muted-foreground underline underline-offset-2" :disabled="taskStore.isLoading" @click="taskStore.loadTasks()">{{ t('periodicTasks.retry') }}</button></p>
  </div>
</template>

<script setup lang="ts">
import { useModuleLoad } from '@/lib/workspaceScope'
import { computed, ref } from 'vue'
import { Bell } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useSearchReveal } from '@/lib/searchNavigation'
import { useModuleAccess, useWorkspaceDraft } from '@/lib/workspaceScope'
import { useUIStore } from '@/stores/ui'
import { useWorkspacesStore } from '@/stores/workspaces'
import { usePeriodicTasksStore, type PeriodicTask, type PeriodicTaskInput } from '../stores/periodicTasks'
import PeriodicTaskItem from './PeriodicTaskItem.vue'
import PeriodicTaskForm from './PeriodicTaskForm.vue'
import { getBrowserPermission, requestBrowserPermission } from '../lib/reminders'
const {canWrite}=useModuleAccess('periodic'),{t}=useI18n()
const uiStore=useUIStore(),workspaces=useWorkspacesStore(),taskStore=usePeriodicTasksStore()
const editingTask=ref<PeriodicTask|null>(null),formRef=ref<{resetForm:()=>void}|null>(null)
const submitting=ref(false)
const viewMode=useWorkspaceDraft<'today'|'all'>('routine-view','all')
const browserPermission=ref(getBrowserPermission())
const visibleTasks=computed(()=>viewMode.value==='today'?taskStore.todaysTasks:taskStore.tasks)
useModuleLoad(async()=>{await taskStore.loadTasks();browserPermission.value=getBrowserPermission()})
async function enableBrowserNotifications(){
 const result=await requestBrowserPermission();browserPermission.value=result
 uiStore.addToast(t(result==='granted'?'periodicTasks.notificationsEnabled':'periodicTasks.notificationsDenied'),result==='granted'?'success':'error')
}
function closeForm(){editingTask.value=null}
function startEdit(task:PeriodicTask){if(canWrite.value && !taskStore.isLoading && !submitting.value)editingTask.value=task}
async function handleSubmit(input:PeriodicTaskInput){
 if(!canWrite.value || taskStore.isLoading || submitting.value)return
 submitting.value=true
 try {
 const scope=workspaces.sessionKey,target=editingTask.value?.id
 if(input.notifyBrowser && getBrowserPermission()==='default'){
  await requestBrowserPermission();browserPermission.value=getBrowserPermission()
 }
 if(scope!==workspaces.sessionKey)return
 if(target){
  const ok=await taskStore.updateTask(target,input)
  if(scope!==workspaces.sessionKey)return
  if(ok){uiStore.addToast(t('periodicTasks.updated'),'success');if(editingTask.value?.id===target)closeForm()}
  else if(taskStore.error)uiStore.addToast(taskStore.error,'error')
  return
 }
 const created=await taskStore.addTask(input)
 if(scope!==workspaces.sessionKey)return
 if(created){formRef.value?.resetForm();if(!taskStore.isTaskDueOn(created))viewMode.value='all';uiStore.addToast(t('periodicTasks.added'),'success')}
 else if(taskStore.error)uiStore.addToast(taskStore.error,'error')
 }finally{submitting.value=false}
}
async function toggleTask(taskId:string){if(canWrite.value && !taskStore.isLoading && !submitting.value)await taskStore.toggleTask(taskId)}
async function deleteTask(taskId:string){
 if(!canWrite.value || taskStore.isLoading || submitting.value)return
 const scope=workspaces.sessionKey
 await taskStore.deleteTask(taskId)
 if(scope!==workspaces.sessionKey)return
 if(!taskStore.error){if(editingTask.value?.id===taskId)closeForm()}
}
useSearchReveal('periodic',async(hit,isCurrent)=>{await taskStore.loadTasks(hit.record_id);if(isCurrent())viewMode.value='all'})
</script>
