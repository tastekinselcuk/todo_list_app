<script setup lang="ts">
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { useSearchReveal } from '@/lib/searchNavigation'
import { computed, ref, watch, nextTick, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy, History, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, Target, Trash2, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useWorkspaceDraft, useModuleAccess } from '@/lib/workspaceScope'
import { useUIStore } from '@/stores/ui'
import { usePomodoroStore } from '../stores/pomodoro'
import { usePomoNotesStore, type PomoTask } from '../stores/pomoNotes'
const { t, locale }=useI18n(),store=usePomoNotesStore(),timer=usePomodoroStore(),ui=useUIStore()
const { canWrite }=useModuleAccess('pomodoro')
const title=useWorkspaceDraft('pomo-note-title',''),estimate=useWorkspaceDraft('pomo-note-estimate',1)
if(!Number.isInteger(estimate.value)||estimate.value<1||estimate.value>999)estimate.value=1
const input=ref<HTMLInputElement>(),menu=ref<PomoTask|null>(null),menuRef=ref<HTMLElement>(),menuStyle=ref<Record<string,string>>({})
const menuTrigger=ref<HTMLElement|null>(null)
const modal=ref<HTMLDialogElement>(),editing=ref<PomoTask|null>(null),dialogMode=ref<'edit'|'history'>('edit'),editTitle=ref(''),editEstimate=ref(1),editMinutes=ref(25)
const history=ref<Awaited<ReturnType<typeof store.history>>>([]),historyBusy=ref(false),historyMore=ref(false),historyError=ref(false)
let revealing=false,visible=true,historyGeneration=0,poll:ReturnType<typeof setInterval>|undefined,syncDelay:ReturnType<typeof setTimeout>|undefined
const options=computed(()=>['active','completed','all'].map(value=>({value,label:t(`pomoNotes.${value}`)})))
const targetOf=(task:PomoTask)=>({...task,estimated_sessions:task.estimated_sessions||1,focus_seconds:task.focus_seconds||timer.durations.focus*60})
const selected=(task:PomoTask)=>timer.currentTarget?.id===task.id
const running=(task:PomoTask)=>selected(task)&&timer.isRunning&&timer.modeKey==='focus'
const queued=(task:PomoTask)=>timer.queuedTarget?.id===task.id
const minutes=(seconds:number)=>Math.round(seconds/60)
const progress=(task:PomoTask)=>Math.min(100,task.sessions/(task.estimated_sessions||1)*100)
async function add() {
  if(!title.value.trim()||!Number.isInteger(estimate.value)||estimate.value<1||estimate.value>999||store.saving||!canWrite.value||store.status!=='ready')return
  const text=title.value.trim(),goal=Math.max(1,Math.min(999,Math.round(estimate.value)))
  if(await store.mutate('create',null,{title:text,estimate:goal,seconds:timer.durations.focus*60})){
    title.value='';await nextTick();input.value?.focus()
  }
}
async function toggle(task:PomoTask) {
  if(!canWrite.value)return
  if(await store.mutate(task.completed?'reopen':'complete',task)){
    if(!task.completed)timer.completedTask(task.id)
  }
}
async function focus(task:PomoTask,immediate=false) {
  menu.value=null
  if(task.completed)return
  await timer.focusOn(targetOf(task),immediate)
  if(timer.error&&timer.error!=='REMOTE_ACTIVE')ui.addToast(t(timer.errorMessageKey),'error')
}
function openMenu(event:MouseEvent,task:PomoTask) {
  if(menu.value?.id===task.id){menu.value=null;return}
  const box=(event.currentTarget as HTMLElement).getBoundingClientRect()
  menuTrigger.value=event.currentTarget as HTMLElement
  menuStyle.value={top:`max(8px, min(${box.bottom+6}px, calc(100vh - 220px)))`,left:`${Math.max(8,Math.min(box.right-176,window.innerWidth-184))}px`}
  menu.value=task
  void nextTick(()=>menuRef.value?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus())
}
async function edit(task:PomoTask) {
  menu.value=null;editing.value={...task};dialogMode.value='edit';editTitle.value=task.title
  editEstimate.value=task.estimated_sessions||1;editMinutes.value=Math.round((task.focus_seconds||timer.durations.focus*60)/60)
  store.error='';await nextTick();modal.value?.showModal()
}
async function save() {
  if(!editing.value)return
  const ok=await store.mutate(canWrite.value?'edit':'goal',editing.value,{title:editTitle.value.trim(),estimate:editEstimate.value,seconds:editMinutes.value*60})
  if(ok){timer.updateTarget({...editing.value,title:canWrite.value?editTitle.value.trim():editing.value.title,estimated_sessions:editEstimate.value,focus_seconds:editMinutes.value*60});modal.value?.close()}
}
async function copy(task:PomoTask) {
  menu.value=null
  try{await navigator.clipboard.writeText(task.title);ui.addToast(t('pomoNotes.copied'),'success')}
  catch{ui.addToast(t('pomoNotes.copyFailed'),'error')}
}
async function remove(task:PomoTask) {
  menu.value=null
  if(await store.mutate('delete',task)){timer.forgetTask(task.id)}
}
async function showHistory(task:PomoTask) {
  historyGeneration++;historyBusy.value=false
  menu.value=null;editing.value={...task};dialogMode.value='history';history.value=[];historyError.value=false
  await nextTick();modal.value?.showModal();await loadHistory()
}
async function loadHistory(more=false) {
  if(!editing.value||historyBusy.value)return
  historyBusy.value=true;historyError.value=false
  const task=editing.value
  const request=++historyGeneration
  try{
    const records=await store.history(task,more?history.value[history.value.length-1]:undefined)
    if(request!==historyGeneration||!visible||editing.value?.id!==task.id||dialogMode.value!=='history')return
    history.value=more?[...history.value,...records]:records;historyMore.value=records.length===30
  }catch{if(request===historyGeneration)historyError.value=true}finally{if(request===historyGeneration)historyBusy.value=false}
}
function outside(event:Event) {
  if(!visible)return
  const node=event.target as HTMLElement
  if(!menuRef.value?.contains(node)&&!node.closest?.('[data-pomo-menu]'))menu.value=null
}
function escape(event:KeyboardEvent) {if(visible&&event.key==='Escape'&&menu.value){menu.value=null;menuTrigger.value?.focus()}}
function menuKey(event:KeyboardEvent) {
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  event.preventDefault()
  const buttons=Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')||[])
  const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length
  buttons[next]?.focus()
}
function activate() {
  if(!visible){visible=true;store.active=true;store.search='';void store.load()}
  // Shared task edits arrive through the store's realtime listener. This slow
  // fallback also reconciles personal statistics changed on another device.
  if(!poll)poll=setInterval(()=>{if(visible&&document.visibilityState==='visible'&&!store.saving&&!store.loading&&!editing.value)void store.load()},120_000)
}
function deactivate() {
  visible=false;store.active=false;menu.value=null;modal.value?.close();editing.value=null
  if(poll)clearInterval(poll);poll=undefined
  if(syncDelay)clearTimeout(syncDelay)
}
watch(()=>store.filter,()=>{menu.value=null;if(!revealing){store.revealedId='';void store.load()}})
watch(()=>timer.taskStatsSequence,()=>{
  if(!visible||store.saving||editing.value)return
  if(syncDelay)clearTimeout(syncDelay);syncDelay=setTimeout(()=>{void store.load()},150)
})
onMounted(()=>{store.active=true;void store.load();activate();document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)})
onActivated(activate)
onDeactivated(deactivate)
onUnmounted(()=>{deactivate();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)})
useSearchReveal('pomodoro', async (hit, isCurrent) => {
  revealing=true;store.revealedId=hit.record_id;store.filter='all';store.search=''
  await nextTick();revealing=false
  if(isCurrent())await store.load()
})
</script>

<template>
  <div class="workspace-content space-y-4" :data-module-loading="store.loading || undefined">
    <div class="workspace-toolbar space-y-4">
      <form v-if="canWrite" class="flex flex-wrap items-center gap-2" @submit.prevent="add">
        <input ref="input" v-model="title" type="text" maxlength="500" autocomplete="off" :aria-label="t('pomoNotes.placeholder')" :placeholder="t('pomoNotes.placeholder')" class="h-10 min-w-0 basis-full rounded-xl border border-border/50 bg-background/50 px-4 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:bg-background focus:ring-1 focus:ring-primary/30 sm:flex-1 sm:basis-0" />
        <div class="flex h-10 items-center gap-1 rounded-xl border border-border/50 bg-background/50 px-1.5">
          <button type="button" class="pomo-icon" :aria-label="t('pomoNotes.less')" :disabled="estimate<=1" @click="estimate=Math.max(1,estimate-1)"><span aria-hidden="true">−</span></button>
          <input v-model.number="estimate" type="number" min="1" max="999" :aria-label="t('pomoNotes.goal')" class="w-8 bg-transparent text-center text-xs tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span class="text-xs text-muted-foreground">{{ t('pomoNotes.sessions') }}</span>
          <button type="button" class="pomo-icon" :aria-label="t('pomoNotes.more')" :disabled="estimate>=999" @click="estimate=Math.min(999,estimate+1)"><Plus class="h-3 w-3" /></button>
        </div>
        <button type="submit" :disabled="!title.trim()||store.saving||store.status!=='ready'" class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40" :aria-label="t('pomoNotes.add')"><Loader2 v-if="store.saving" class="h-4 w-4 animate-spin motion-reduce:animate-none" /><Plus v-else class="h-4 w-4" /></button>
      </form>
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <CustomSelect v-model="store.filter" :options="options" :aria-label="t('pomoNotes.filter')" class="w-36" />
        <div class="ml-auto flex items-center gap-3">
          <span v-if="store.status==='ready'" class="whitespace-nowrap text-[11px] text-muted-foreground">{{ t('pomoNotes.taskCount',{count:store.total}) }}</span>
        </div>
      </div>
    </div>

    <p v-if="timer.queuedTarget" class="flex items-center gap-2 text-xs text-muted-foreground"><Target class="h-3.5 w-3.5" /><span class="truncate">{{ t('pomoNotes.next',{title:timer.queuedTarget.title}) }}</span><button type="button" class="pomo-icon" :aria-label="t('pomoNotes.cancelNext')" @click="timer.cancelQueued()"><X class="h-3.5 w-3.5" /></button></p>
    <p v-if="timer.provisional" class="text-[11px] text-muted-foreground" role="status">{{ t('pomoNotes.provisional') }}</p>
    <div v-if="store.status==='setup'" class="rounded-xl border border-dashed border-border/60 p-5 text-center text-sm text-muted-foreground"><p>{{ t('pomoNotes.setup') }}</p><button type="button" class="mt-3 text-xs text-foreground underline underline-offset-4" @click="store.load()">{{ t('pomoNotes.retry') }}</button></div>
    <div v-else-if="store.status==='error' || (store.error && !editing)" class="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 text-xs text-muted-foreground" role="alert"><span>{{ t(store.error==='TRASH_FOCUS_ACTIVE'?'trash.focusActive':store.error.includes('CONFLICT')?'pomoNotes.conflict':'pomoNotes.loadFailed') }}</span><button type="button" class="shrink-0 text-foreground" @click="store.load()">{{ t('pomoNotes.retry') }}</button></div>
    <div v-if="store.loading&&!store.items.length" class="flex justify-center py-8" role="status" :aria-label="t('pomoNotes.loading')"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" /></div>
    <p v-else-if="store.status==='ready'&&!store.items.length" class="py-9 text-center text-sm text-muted-foreground">{{ t(store.search?'pomoNotes.noResults':store.filter==='completed'?'pomoNotes.noCompleted':'pomoNotes.empty') }}</p>
    <div class="space-y-2">
      <article v-for="task in store.items" :key="task.id" :data-search-record="task.id" class="workspace-card relative bg-card/40 px-4 py-3 transition-colors hover:bg-card/60" :class="[selected(task)&&!task.completed?'border-primary/35':'',task.completed?'opacity-70':'']">
        <div class="flex items-center gap-3">
          <button v-if="canWrite" type="button" class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors" :class="task.completed?'border-primary/40 bg-primary/10 text-primary':'border-muted-foreground/40 text-transparent hover:border-primary/60'" :aria-label="t(task.completed?'pomoNotes.reopen':'pomoNotes.complete')" :disabled="store.saving" @click="toggle(task)"><Check class="h-3.5 w-3.5" /></button>
          <div class="min-w-0 flex-1">
            <button type="button" class="text-left text-sm font-medium leading-5 text-foreground" :class="task.completed?'text-muted-foreground line-through':''" @click="edit(task)">{{ task.title }}</button>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
              <span>{{ t('pomoNotes.progress',{done:task.sessions,goal:task.estimated_sessions||1}) }}</span>
              <span v-if="running(task)" class="inline-flex items-center gap-1 text-primary"><span class="h-1 w-1 rounded-full bg-current" />{{ t('pomoNotes.running',{number:task.sessions+1}) }}</span>
              <span v-else-if="queued(task)" class="text-primary">{{ t('pomoNotes.queued') }}</span>
              <span v-else-if="task.sessions>=(task.estimated_sessions||1)&&!task.completed">{{ t('pomoNotes.goalReached') }}</span>
              <span v-if="task.seconds">· {{ t('pomoNotes.focusMinutes',{minutes:minutes(task.seconds)}) }}</span>
            </div>
            <div v-if="task.sessions||selected(task)" class="mt-2 h-[2px] max-w-56 overflow-hidden rounded-full bg-muted/60" role="progressbar" :aria-label="t('pomoNotes.goal')" :aria-valuemin="0" :aria-valuemax="task.estimated_sessions||1" :aria-valuenow="Math.min(task.sessions,task.estimated_sessions||1)"><div class="h-full rounded-full bg-primary/60 transition-[width] duration-200 motion-reduce:transition-none" :style="{width:`${progress(task)}%`}" /></div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button v-if="!task.completed" type="button" class="pomo-icon" :class="selected(task)?'bg-primary/10 text-primary':''" :disabled="timer.starting || timer.clearing" :title="t(running(task)&&!timer.remote?'pomodoro.pause':timer.remote&&selected(task)?'pomoNotes.continueHere':timer.isRunning&&!selected(task)?'pomoNotes.queue':'pomoNotes.focus')" :aria-label="t(running(task)&&!timer.remote?'pomodoro.pause':'pomoNotes.focus')" @click="focus(task)"><Pause v-if="running(task)&&!timer.remote" class="h-4 w-4" /><Target v-else-if="queued(task)" class="h-4 w-4" /><Play v-else class="h-4 w-4" /></button>
            <button type="button" data-pomo-menu class="pomo-icon" :aria-label="t('pomoNotes.actions')" aria-haspopup="menu" :aria-expanded="menu?.id===task.id" @click="openMenu($event,task)"><MoreHorizontal class="h-4 w-4" /></button>
          </div>
        </div>
      </article>
    </div>
    <button v-if="store.hasMore" type="button" class="mx-auto block rounded-xl border border-border/60 px-4 py-2 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-40" :disabled="store.loading" @click="store.load(true)">{{ t('pomoNotes.showMore') }}</button>
    <Teleport to="body">
      <div v-if="menu" ref="menuRef" role="menu" :style="menuStyle" class="fixed z-50 w-44 rounded-xl border border-border/70 bg-card p-1.5 text-foreground shadow-lg" @keydown="menuKey">
        <button type="button" role="menuitem" class="pomo-menu-item" @click="edit(menu)"><Pencil class="h-3.5 w-3.5" />{{ t(canWrite?'pomoNotes.edit':'pomoNotes.editGoal') }}</button>
        <button type="button" role="menuitem" class="pomo-menu-item" @click="copy(menu)"><Copy class="h-3.5 w-3.5" />{{ t('pomoNotes.copy') }}</button>
        <button type="button" role="menuitem" class="pomo-menu-item" @click="showHistory(menu)"><History class="h-3.5 w-3.5" />{{ t('pomoNotes.history') }}</button>
        <button v-if="!menu.completed&&timer.isRunning&&!selected(menu)&&!timer.remote" type="button" role="menuitem" class="pomo-menu-item" @click="focus(menu,true)"><Play class="h-3.5 w-3.5" />{{ t('pomoNotes.switchNow') }}</button>
        <button v-if="canWrite" type="button" role="menuitem" class="pomo-menu-item text-destructive" :disabled="store.saving" @click="remove(menu)"><Trash2 class="h-3.5 w-3.5" />{{ t('pomoNotes.delete') }}</button>
      </div>
    </Teleport>
    <dialog ref="modal" class="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border/70 bg-card p-5 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm" :aria-label="t(dialogMode==='edit'?'pomoNotes.edit':'pomoNotes.history')" :data-shared-editing="Boolean(editing)&&dialogMode==='edit'" @dblclick="event=>{if(dialogMode==='edit' && !store.saving && isDialogBackdropDoubleClick(event))modal?.close()}" @close="editing=null">
      <div class="mb-4 flex items-center justify-between gap-3"><p class="truncate text-sm font-medium">{{ dialogMode==='history'?editing?.title:t(canWrite?'pomoNotes.edit':'pomoNotes.editGoal') }}</p><button type="button" class="pomo-icon" :aria-label="t('pomoNotes.close')" @click="modal?.close()"><X class="h-4 w-4" /></button></div>
      <form v-if="dialogMode==='edit'" class="space-y-4" @submit.prevent="save">
        <label v-if="canWrite" class="block space-y-1.5 text-xs text-muted-foreground"><span>{{ t('pomoNotes.task') }}</span><input v-model="editTitle" autofocus type="text" maxlength="500" required class="pomo-input" /></label>
        <div class="grid grid-cols-2 gap-3"><label class="space-y-1.5 text-xs text-muted-foreground"><span>{{ t('pomoNotes.myGoal') }}</span><input v-model.number="editEstimate" type="number" min="1" max="999" required class="pomo-input" /></label><label class="space-y-1.5 text-xs text-muted-foreground"><span>{{ t('pomoNotes.sessionMinutes') }}</span><input v-model.number="editMinutes" type="number" min="1" max="90" required class="pomo-input" /></label></div>
        <p class="text-[11px] text-muted-foreground">{{ t('pomoNotes.estimateTime',{minutes:editEstimate*editMinutes}) }}</p>
        <p v-if="store.error" class="text-xs text-destructive" role="alert">{{ t(store.error.includes('CONFLICT')?'pomoNotes.conflict':'pomoNotes.saveFailed') }}</p>
        <div class="flex justify-end gap-2"><button type="button" class="rounded-xl px-3 py-2 text-xs hover:bg-muted/50" @click="modal?.close()">{{ t('pomoNotes.cancel') }}</button><button type="submit" class="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-40" :disabled="store.saving||!editTitle.trim()">{{ t('pomoNotes.save') }}</button></div>
      </form>
      <div v-else>
        <p v-if="historyError" class="text-xs text-muted-foreground" role="alert">{{ t('pomoNotes.loadFailed') }} <button type="button" class="underline" @click="loadHistory()">{{ t('pomoNotes.retry') }}</button></p>
        <p v-if="!history.length&&!historyBusy&&!historyError" class="py-6 text-center text-xs text-muted-foreground">{{ t('pomoNotes.historyEmpty') }}</p>
        <ul class="max-h-72 divide-y divide-border/50 overflow-y-auto"><li v-for="session in history" :key="session.id" class="flex items-center justify-between gap-3 py-3 text-xs"><span class="text-muted-foreground">{{ new Date(session.started_at).toLocaleString(locale==='tr'?'tr-TR':'en-US',{dateStyle:'short',timeStyle:'short'}) }}</span><span>{{ minutes(session.credited_segments.reduce((sum,[a,b])=>sum+(Date.parse(b)-Date.parse(a))/1000,0)) }} {{ t('analytics.minShort') }} · {{ t(session.credited_completed?'pomoNotes.fullSession':'pomoNotes.partialSession') }}</span></li></ul>
        <div v-if="historyBusy" class="flex justify-center py-3"><Loader2 class="h-4 w-4 animate-spin motion-reduce:animate-none" /></div>
        <button v-else-if="historyMore" type="button" class="mt-3 text-xs text-muted-foreground underline" @click="loadHistory(true)">{{ t('pomoNotes.showMore') }}</button>
      </div>
    </dialog>
  </div>
</template>
<style scoped>
.pomo-icon { display:inline-flex; align-items:center; justify-content:center; width:1.8rem; height:1.8rem; border-radius:.6rem; color:hsl(var(--muted-foreground)); transition:background-color 150ms,color 150ms; }
.pomo-icon:hover { background:hsl(var(--muted)/.5); color:hsl(var(--foreground)); }
.pomo-icon:disabled { opacity:.4; }
.pomo-icon:focus-visible,.pomo-menu-item:focus-visible { outline:2px solid hsl(var(--primary)/.4);outline-offset:2px; }
.pomo-menu-item { display:flex;align-items:center;gap:.6rem;width:100%;padding:.55rem .6rem;border-radius:.5rem;text-align:left;font-size:.75rem; }
.pomo-menu-item:hover { background:hsl(var(--muted)/.5); }
.pomo-input { display:block;height:2.5rem;width:100%;border:1px solid hsl(var(--border)/.7);border-radius:.75rem;background:hsl(var(--background)/.5);padding:0 .75rem;color:hsl(var(--foreground));outline:none; }
.pomo-input:focus { border-color:hsl(var(--primary)/.4);box-shadow:0 0 0 1px hsl(var(--primary)/.2); }
</style>
