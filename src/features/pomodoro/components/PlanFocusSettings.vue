<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,ref,watch } from 'vue'
import { Loader2,Play,Unlink,X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { usePomodoroStore,type FocusTarget } from '../stores/pomodoro'

const timer=usePomodoroStore(),auth=useAuthStore(),{t}=useI18n()
const dialog=ref<HTMLDialogElement>(),estimate=ref(1),minutes=ref(25),loading=ref(false),saving=ref(false),failure=ref('')
const loadFailed=ref(false)
const source=ref<'plans'|'quick'>(),recordId=ref(''),target=ref<FocusTarget|null>(null),title=ref(''),completed=ref(false)
const locked=computed(()=>loading.value||saving.value||timer.starting||timer.clearing)
const valid=computed(()=>Number.isInteger(estimate.value)&&estimate.value>=1&&estimate.value<=999&&Number.isInteger(minutes.value)&&minutes.value>=1&&minutes.value<=90)
const running=computed(()=>Boolean(target.value&&timer.currentTarget?.id===target.value.id&&timer.isRunning&&!timer.remote&&timer.modeKey==='focus'))
let generation=0,previous:HTMLElement|null=null
function close(){if(!locked.value)timer.planSettings=null}
watch(()=>timer.planSettings,async request=>{
  const version=++generation
  failure.value='';saving.value=false;loading.value=false;loadFailed.value=false
  if(!request){dialog.value?.close();if(previous?.isConnected)previous.focus({preventScroll:true});return}
  const owner=auth.user?.id
  source.value=request.source;recordId.value=request.record_id||'';title.value=request.title;completed.value=false
  target.value=request.target?{...request.target,workspace_id:request.workspace_id}:null
  estimate.value=request.target?.estimated_sessions||1;minutes.value=(request.target?.focus_seconds||timer.durations.focus*60)/60
  previous=document.activeElement instanceof HTMLElement?document.activeElement:null
  await nextTick()
  if(version!==generation)return
  dialog.value?.showModal()
  if(!source.value&&target.value){
    loading.value=true
    try{
      const result=await supabase.rpc('plan_focus_target',{wid:request.workspace_id,tid:target.value.id})
      if(version!==generation||auth.user?.id!==owner)return
      if(result.error)throw result.error
      if(result.data){source.value=result.data.source;recordId.value=result.data.id;title.value=result.data.title;completed.value=result.data.completed}
    }catch{if(version===generation){loadFailed.value=true;failure.value=t('planFocusSettings.loadFailed')}}
    finally{if(version===generation)loading.value=false}
  }
},{immediate:true})
async function save(){
  const request=timer.planSettings,owner=auth.user?.id,version=generation
  if(!request||!owner||locked.value||!valid.value||completed.value||loadFailed.value)return
  saving.value=true;failure.value=''
  try{
    const result=source.value&&recordId.value
      ?await supabase.rpc('plan_focus_prepare',{wid:request.workspace_id,source:source.value,rid:recordId.value,seconds:minutes.value*60,estimate:estimate.value})
      :await supabase.rpc('pomonotes_mutate',{wid:request.workspace_id,operation:'goal',tid:target.value?.id,title:null,estimate:estimate.value,focus_seconds:minutes.value*60,expected_version:null})
    if(version!==generation||owner!==auth.user?.id)return
    if(result.error)throw result.error
    if(!result.data?.id)throw Error('INVALID_FOCUS_TARGET')
    target.value={...result.data,workspace_id:request.workspace_id,estimated_sessions:estimate.value,focus_seconds:minutes.value*60}
    timer.taskStatsSequence++
    await timer.startConfiguredFocus(target.value!)
    if(version!==generation||owner!==auth.user?.id)return
    if(timer.error)throw Error(timer.error)
    timer.planSettings=null
  }catch{if(version===generation)failure.value=t('planFocusSettings.saveFailed')}
  finally{if(version===generation)saving.value=false}
}
async function remove(){
  const request=timer.planSettings,owner=auth.user?.id,version=generation,id=target.value?.id
  if(!request||!owner||!id||locked.value||loadFailed.value)return
  saving.value=true;failure.value=''
  try{
    if(timer.currentTarget?.id===id){await timer.clearFocus();if(timer.error)throw Error(timer.error)}
    if(version!==generation||owner!==auth.user?.id)return
    if(source.value&&recordId.value){
      const result=await supabase.rpc('plan_focus_remove',{wid:request.workspace_id,source:source.value,rid:recordId.value})
      if(result.error)throw result.error
    }
    if(version!==generation||owner!==auth.user?.id)return
    if(timer.queuedTarget?.id===id)timer.cancelQueued()
    timer.taskStatsSequence++;timer.planSettings=null
  }catch{if(version===generation)failure.value=t('planFocusSettings.removeFailed')}
  finally{if(version===generation)saving.value=false}
}
onBeforeUnmount(()=>{generation++;dialog.value?.close()})
</script>

<template>
  <Teleport to="body"><dialog ref="dialog" class="plan-focus-dialog" :aria-label="t('planFocusSettings.title')" :closedby="locked?'none':'closerequest'" @cancel.prevent="close" @dblclick="event=>{if(isDialogBackdropDoubleClick(event))close()}">
    <form @submit.prevent="save">
      <header><strong>{{ t('planFocusSettings.title') }}</strong><button type="button" :disabled="locked" :aria-label="t('common.close')" @click="close"><X :size="17" /></button></header>
      <p class="plan-focus-title">{{ title }}</p>
      <div class="plan-focus-fields"><label>{{ t('planFocusSettings.sessions') }}<input v-model.number="estimate" type="number" min="1" max="999" required :disabled="locked" /></label><label>{{ t('planFocusSettings.minutes') }}<input v-model.number="minutes" type="number" min="1" max="90" required :disabled="locked" /></label></div>
      <small>{{ t(running?'planFocusSettings.runningHint':'planFocusSettings.hint') }}</small>
      <p v-if="failure" class="plan-focus-error" role="alert">{{ failure }}</p>
      <footer><button v-if="target" type="button" class="remove-focus" :disabled="locked||loadFailed" @click="remove"><Unlink :size="14" />{{ t('planFocusSettings.remove') }}</button><button type="submit" :disabled="locked||loadFailed||!valid||completed"><Loader2 v-if="locked" :size="14" class="animate-spin motion-reduce:animate-none" /><Play v-else-if="!running" :size="14" />{{ t(running?'common.save':'pomodoro.start') }}</button></footer>
    </form>
  </dialog></Teleport>
</template>

<style scoped>
.plan-focus-dialog{margin:auto;width:400px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 40px);padding:22px;overflow:auto;color:hsl(var(--foreground));background:hsl(var(--card));border:1px solid hsl(var(--border)/.7);border-radius:20px;box-shadow:0 24px 80px #0002}
.plan-focus-dialog::backdrop{background:rgb(2 6 23/.35);backdrop-filter:blur(5px)}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:12px}header strong{font-size:14px;font-weight:500}header button{padding:5px;border-radius:8px;color:hsl(var(--muted-foreground))}
.plan-focus-title{margin:8px 0 22px;font-size:12px;line-height:1.6;color:hsl(var(--muted-foreground));overflow-wrap:anywhere}
.plan-focus-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:flex;flex-direction:column;gap:8px;font-size:11px;color:hsl(var(--muted-foreground))}input{width:100%;padding:10px 12px;font-size:14px;color:hsl(var(--foreground));font-variant-numeric:tabular-nums;background:hsl(var(--muted)/.25);border:1px solid hsl(var(--border)/.7);border-radius:10px}
small{display:block;margin-top:16px;font-size:11px;line-height:1.6;color:hsl(var(--muted-foreground))}.plan-focus-error{margin-top:12px;font-size:11px;line-height:1.6;color:hsl(var(--destructive))}
footer{justify-content:flex-end;margin-top:22px;padding-top:16px;border-top:1px solid hsl(var(--border)/.4)}footer button{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 13px;font-size:12px;border-radius:10px}footer button[type=submit]{background:hsl(var(--primary));color:hsl(var(--primary-foreground))}.remove-focus{margin-right:auto;color:hsl(var(--muted-foreground));font-size:11px}.remove-focus:hover:not(:disabled){color:hsl(var(--destructive));background:hsl(var(--destructive)/.06)}button:disabled,input:disabled{opacity:.45}button:focus-visible,input:focus-visible{outline:2px solid hsl(var(--primary)/.35);outline-offset:3px}
</style>
