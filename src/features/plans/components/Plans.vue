<script setup lang="ts">
import { computed,inject,ref,onMounted,onActivated,onDeactivated,onUnmounted,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight,Check,Copy,History,Trash2,Play,Pause } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useSearchReveal } from '@/lib/searchNavigation'
import { useModuleAccess,useModuleLoad } from '@/lib/workspaceScope'
import { workspaceNavigationKey,workspaceActiveViewKey } from '@/lib/workspaceNavigation'
import { usePomodoroStore } from '@/features/pomodoro/stores/pomodoro'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { usePlansStore,type Plan } from '../stores/plans'
import { firstPopulatedPeriod,periodStart,periods,type Period } from '../lib/periods'
const {canWrite}=useModuleAccess('plans'),store=usePlansStore(),timer=usePomodoroStore(),settings=useSettingsStore(),ui=useUIStore(),{locale}=useI18n()
const copy=computed(()=>locale.value==='tr'?{
 timeless:'Hızlı Not',daily:'Günlük',weekly:'Haftalık',monthly:'Aylık',yearly:'Yıllık',placeholder:'Aklında ne var?',add:'Ekle',archive:'Geçmişi göster',current:'Bu dönem',done:'tamamlandı',pending:'yapılacak',carried:'Önceki dönemden',history:'Geçmiş dönemler',historyEmpty:'Henüz geçmiş bir dönem yok.',setup:'Planlar yüklenemedi. Bağlantıyı kontrol et; yeni kurulumda PLANS_SETUP.md dosyasındaki güncellemeyi tamamla.',retry:'Tekrar dene',complete:'Tamamla',undo:'Tamamlanmadı olarak işaretle',copy:'Kopyala',copied:'Kopyalandı',copyFailed:'Kopyalama başarısız',delete:'Sil',deleteFailed:'Plan silinemedi',focus:'Odaklan',pause:'Duraklat',next:'Sıradaki odak',goals:'Pomodoro ayarları',sessions:'Oturum hedefi',minutes:'Oturum süresi (dakika)',save:'Kaydet',cancel:'Vazgeç',focusFailed:'Odak başlatılamadı. Veritabanı güncellemesini ve bağlantını kontrol et.',goalHint:'Hedefe ulaşmak planı otomatik tamamlamaz.'
}:{timeless:'Quick Notes',daily:'Daily',weekly:'Weekly',monthly:'Monthly',yearly:'Yearly',placeholder:'What’s on your mind?',add:'Add',archive:'Show history',current:'This period',done:'completed',pending:'to do',carried:'Carried forward',history:'Past periods',historyEmpty:'No past periods yet.',setup:'Could not load plans. Check your connection and complete the update in PLANS_SETUP.md.',retry:'Retry',complete:'Complete',undo:'Mark incomplete',copy:'Copy',copied:'Copied',copyFailed:'Could not copy',delete:'Delete',deleteFailed:'Could not delete plan',focus:'Focus',pause:'Pause',next:'Next focus',goals:'Pomodoro settings',sessions:'Session goal',minutes:'Session duration (minutes)',save:'Save',cancel:'Cancel',focusFailed:'Could not start focus. Check the database update and your connection.',goalHint:'Reaching the goal does not complete the plan automatically.'})
const selected=ref<Period>('timeless'),inputPeriod=ref<Period>('timeless'),title=ref(''),showHistory=ref(false),today=ref(new Date())
let periodChosen=false
const periodOptions=computed(()=>periods.map(value=>({value,label:copy.value[value]})))
const inPeriod=(plan:Plan,period:Period)=>plan.period===period&&(period==='timeless'||plan.period_date===periodStart(period,today.value,store.timezone))
const currentPlans=computed(()=>store.plans.filter(plan=>inPeriod(plan,selected.value)))
const active=computed(()=>currentPlans.value.filter(plan=>!plan.completed).sort((a,b)=>b.history.length-a.history.length))
const completed=computed(()=>currentPlans.value.filter(plan=>plan.completed))
// Quick notes keep their creation order even when completion changes.
const displayedPlans=computed(()=>selected.value==='timeless'
 ? [...currentPlans.value].reverse().sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
 : [...active.value,...completed.value])
const emptyMessage=computed(()=>selected.value==='timeless'?(locale.value==='tr'?'Henüz hızlı not eklenmedi.':'No quick notes added yet.'):locale.value==='tr'?`Henüz ${copy.value[selected.value].toLocaleLowerCase('tr-TR')} plan eklenmedi.`:`No ${copy.value[selected.value].toLowerCase()} plans added yet.`)
const archived=computed(()=>{
 if(selected.value==='timeless')return []
 const groups=new Map<string,{id:string;title:string;completed:boolean}[]>()
 for(const plan of store.plans.filter(plan=>plan.period===selected.value))for(const entry of [...plan.history,{date:plan.period_date,completed:plan.completed}]){
  if(entry.date>=periodStart(selected.value,today.value,store.timezone))continue
  const rows=groups.get(entry.date)||[];rows.push({id:plan.id,title:plan.title,completed:entry.completed});groups.set(entry.date,rows)
 }
 return [...groups.entries()].sort(([a],[b])=>b.localeCompare(a))
})
function formatDate(value:string,period=selected.value){const date=new Date(value+'T12:00:00'),language=locale.value==='tr'?'tr-TR':'en-GB';if(period==='yearly')return String(date.getFullYear());if(period==='monthly')return date.toLocaleDateString(language,{month:'long',year:'numeric'});const start=date.toLocaleDateString(language,{day:'numeric',month:'long',year:'numeric'});if(period!=='weekly')return start;date.setDate(date.getDate()+6);return start+' – '+date.toLocaleDateString(language,{day:'numeric',month:'long'})}
const count=(period:Period)=>store.plans.filter(plan=>inPeriod(plan,period)).length
const editable=(plan:Plan)=>plan.can_write??canWrite.value
async function refresh(choose=false){today.value=new Date();if(await store.load()&&choose&&!periodChosen){selected.value=firstPopulatedPeriod(store.plans,today.value,store.timezone);inputPeriod.value=selected.value;periodChosen=true}}
async function add(){if(!await store.load())return;if(await store.add(title.value,inputPeriod.value)){selected.value=inputPeriod.value;title.value='';today.value=new Date()}}
async function toggle(plan:Plan){if(!editable(plan)||store.isSaving(plan.id))return;if(periodStart('daily',new Date(),store.timezone)!==periodStart('daily',today.value,store.timezone)&&!await store.load())return;const current=store.plans.find(p=>p.id===plan.id&&p.source===plan.source);if(current&&await store.update(current,{completed:!current.completed})){if(current.completed&&current.focus)timer.completedTask(current.focus.id);else if(current.focus&&timer.currentTarget?.id===current.focus.id)timer.updateTarget({...timer.currentTarget,completed:false})}today.value=new Date()}
async function copyPlan(plan:Plan){try{await navigator.clipboard.writeText(plan.title);ui.addToast(copy.value.copied,'success')}catch{ui.addToast(copy.value.copyFailed,'error')}}
async function deletePlan(plan:Plan){if(!editable(plan)||store.busy||store.isSaving(plan.id))return;if(plan.focus?.id===timer.currentTarget?.id){await timer.clearFocus();if(timer.error)return}if(await store.remove(plan.id,plan.source||'plans')){if(plan.focus)timer.forgetTask(plan.focus.id)}else ui.addToast(copy.value.deleteFailed,'error')}
const isSelected=(plan:Plan)=>Boolean(plan.focus&&timer.currentTarget?.id===plan.focus.id)
const isRunning=(plan:Plan)=>isSelected(plan)&&timer.isRunning&&timer.modeKey==='focus'
function openGoal(plan:Plan){
 if(plan.completed||store.isFocusing(plan)||timer.starting||timer.clearing)return
 timer.openPlanSettings({source:plan.source||'plans',record_id:plan.id,title:plan.title,target:plan.focus?{...plan.focus,title:plan.title,collection_id:'',workspace_id:''}:undefined})
}
const navigation=inject(workspaceNavigationKey,null),reportView=inject(workspaceActiveViewKey,()=>{})
watch(()=>navigation?.value,intent=>{if(intent?.module==='plans'&&periods.includes(intent.view as Period)){selected.value=intent.view as Period;inputPeriod.value=selected.value;periodChosen=true}},{immediate:true})
watch(selected,value=>{inputPeriod.value=value;periodChosen=true;if(value==='timeless')showHistory.value=false;reportView('plans',value)})
watch(()=>timer.taskStatsSequence,()=>{void refresh()})
let clock:ReturnType<typeof setInterval>|undefined
function watchDay(){clearInterval(clock);clock=setInterval(()=>{if(periodStart('daily',new Date(),store.timezone)!==periodStart('daily',today.value,store.timezone))void refresh()},30000)}
onMounted(watchDay);onActivated(watchDay);useModuleLoad(()=>refresh(true));onDeactivated(()=>{title.value='';clearInterval(clock);showHistory.value=false;selected.value='timeless';inputPeriod.value='timeless';periodChosen=false});onUnmounted(()=>{clearInterval(clock)})
useSearchReveal('plans',async(hit,isCurrent)=>{if(periods.includes(hit.meta.period as Period))selected.value=hit.meta.period as Period;periodChosen=true;today.value=new Date();await store.load(hit.record_id);if(!isCurrent())return;const plan=store.plans.find(p=>p.id===hit.record_id);if(plan){selected.value=plan.period;showHistory.value=plan.period!=='timeless'&&plan.period_date<periodStart(plan.period,today.value,store.timezone)}})
</script>
<template>
 <section class="plans-shell" :aria-busy="store.busy">
  <div class="workspace-toolbar">
   <form v-if="canWrite" class="capture" @submit.prevent="add"><div class="capture-field"><input v-model="title" type="text" :aria-label="copy.placeholder" :placeholder="copy.placeholder" maxlength="1000" /><div class="period-select"><CustomSelect :model-value="inputPeriod" @update:model-value="inputPeriod=$event as Period" :options="periodOptions" variant="ghost" size="sm" :aria-label="copy.current" popover /></div></div><button class="add-button" :disabled="!title.trim()||store.busy">{{ copy.add }}</button></form>
   <div v-if="store.error" role="alert" class="error-message"><p>{{ copy.setup }}</p><button :disabled="store.busy" @click="refresh(true)">{{ copy.retry }}</button></div>
   <div class="period-toolbar"><nav class="period-tabs" :aria-label="copy.current"><button v-for="period in periods" :key="period" :class="{selected:selected===period}" :aria-pressed="selected===period" @click="selected=period">{{ copy[period] }}<span v-if="count(period)">{{ count(period) }}</span></button></nav><button v-if="selected!=='timeless'" class="history-switch" role="switch" :aria-checked="showHistory" @click="showHistory=!showHistory"><History :size="15" />{{ copy.archive }}<span class="switch-track" :class="{on:showHistory}"><i /></span></button></div>
  </div>
  <div v-if="!currentPlans.length&&!store.busy&&!store.error" class="empty-state"><p>{{ emptyMessage }}</p></div>
  <div class="task-list"><article v-for="plan in displayedPlans" :key="(plan.source||'plans')+plan.id" :data-search-record="plan.id" class="workspace-card task-row" :class="{completed:plan.completed}" @click="editable(plan)&&toggle(plan)">
   <button :disabled="!editable(plan)" class="task-check" :aria-disabled="store.busy||store.isSaving(plan.id)" :aria-label="plan.completed?copy.undo:copy.complete" :aria-pressed="plan.completed" @click.stop="toggle(plan)"><Check v-if="plan.completed" :size="13" /></button>
   <button :disabled="!editable(plan)" class="task-content" :aria-disabled="store.busy||store.isSaving(plan.id)" :aria-pressed="plan.completed" @click.stop="toggle(plan)"><span>{{ plan.title }}</span><small v-if="plan.period!=='timeless'&&plan.history.length&&!plan.completed"><ArrowUpRight :size="11" />{{ copy.carried }}</small></button>
   <div class="task-actions" @click.stop>
    <button v-if="plan.focus && settings.isModuleActive('pomodoro')" type="button" class="focus-goal" :disabled="plan.completed||store.busy||store.isSaving(plan.id)||timer.starting||timer.clearing" :aria-label="copy.goals" :title="copy.goals" @click.stop="openGoal(plan)">{{ plan.focus.sessions }}/{{ plan.focus.estimated_sessions }}</button>
    <button type="button" class="task-action" :aria-label="copy.copy" :title="copy.copy" @click.stop="copyPlan(plan)"><Copy :size="15" /></button>
    <button v-if="settings.isModuleActive('pomodoro')" type="button" class="task-action focus-action" :class="{'is-focused':isRunning(plan)}" :disabled="plan.completed||store.busy||store.isSaving(plan.id)||store.isFocusing(plan)||timer.starting||timer.clearing" :aria-label="copy.goals" :title="copy.goals" :aria-pressed="isRunning(plan)" @click.stop="openGoal(plan)"><Pause v-if="isRunning(plan)" :size="15" /><Play v-else :size="15" /></button>
    <button v-if="editable(plan)" type="button" class="task-action delete-action" :disabled="store.busy||store.isSaving(plan.id)" :aria-label="copy.delete" :title="copy.delete" @click.stop="deletePlan(plan)"><Trash2 :size="15" /></button>
   </div>
  </article></div>
  <section v-if="selected!=='timeless'&&showHistory" class="archive-section"><h3><History :size="16" />{{ copy.history }}</h3><p v-if="!archived.length" class="archive-empty">{{ copy.historyEmpty }}</p><details v-for="[date,rows] in archived" :key="date" class="workspace-card archive-group"><summary>{{ formatDate(date) }}<span>{{ rows.filter(row=>row.completed).length }} / {{ rows.length }} {{ copy.done }}</span></summary><div v-for="row in rows" :key="row.id" :data-search-record="row.id" class="archive-row"><Check v-if="row.completed" :size="15" /><History v-else :size="15" /><div><span :class="{'past-done':row.completed}">{{ row.title }}</span><small>{{ row.completed?copy.done:copy.pending }}</small></div></div></details></section>
 </section>
</template>
<style scoped>
.plans-shell {
  --plan-accent:hsl(var(--primary));
  padding:0;
  color:hsl(var(--foreground))
}
.plans-shell > .workspace-toolbar {
  margin-bottom:16px
}
.capture {
  display:flex;
  align-items:center;
  gap:10px;
  width:100%
}
.capture-field {
  display:flex;
  align-items:center;
  flex:1;
  min-width:0;
  height:40px;
  border:1px solid hsl(var(--border)/.5);
  border-radius:12px;
  background:hsl(var(--background)/.5);
  backdrop-filter:blur(4px);
  box-shadow:0 1px 2px #0000000d;
  transition:border-color .2s,background .2s,box-shadow .2s
}
.capture-field:hover {
  border-color:hsl(var(--border)/.8);
  background:hsl(var(--background)/.7)
}
.capture-field:focus-within {
  border-color:hsl(var(--primary)/.4);
  background:hsl(var(--background));
  box-shadow:0 0 0 1px hsl(var(--primary)/.3)
}
.capture input {
  min-width:0;
  width:100%;
  flex:1;
  height:100%;
  background:transparent;
  outline:none;
  font-size:14px;
  padding:0 12px 0 16px;
  border-radius:12px 0 0 12px
}
.capture input::placeholder {
  color:hsl(var(--muted-foreground)/.6)
}
.period-select {
  display:flex;
  align-items:center;
  position:relative;
  flex-shrink:0;
  border-left:1px solid hsl(var(--border)/.5);
  padding:0 4px;
  color:hsl(var(--muted-foreground));
  font-size:12px
}
.period-select :deep(.absolute) {
  right:0
}
.add-button {
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  height:40px;
  background:hsl(var(--primary));
  color:hsl(var(--primary-foreground));
  font-size:12px;
  font-weight:600;
  padding:0 20px;
  border-radius:12px;
  box-shadow:0 1px 2px #0000000d;
  transition:background .2s,box-shadow .2s
}
.add-button:hover:not(:disabled) {
  background:hsl(var(--primary)/.9)
}
.add-button:disabled {
  opacity:.45;
  cursor:not-allowed
}
.period-toolbar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  margin:16px 0 0;
  padding-bottom:10px;
  flex-wrap:wrap
}
.period-tabs {
  display:flex;
  gap:5px;
  flex-wrap:wrap
}
.period-tabs button {
  display:flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  padding:7px 12px;
  border-radius:8px;
  color:hsl(var(--muted-foreground))
}
.period-tabs button.selected {
  background:color-mix(in srgb,var(--plan-accent) 12%,transparent);
  color:var(--plan-accent);
  font-weight:600
}
.period-tabs button span {
  font-size:10px;
  opacity:.7
}
.history-switch {
  display:flex;
  align-items:center;
  gap:7px;
  font-size:11px;
  color:hsl(var(--muted-foreground))
}
.switch-track {
  width:28px;
  height:16px;
  border-radius:20px;
  background:hsl(var(--muted));
  padding:3px
}
.switch-track i {
  display:block;
  width:10px;
  height:10px;
  background:hsl(var(--muted-foreground));
  border-radius:50%;
  transition:transform .2s
}
.switch-track.on {
  background:var(--plan-accent)
}
.switch-track.on i {
  transform:translateX(12px);
  background:hsl(var(--primary-foreground))
}
.task-row {
  display:flex;
  align-items:center;
  gap:13px;
  padding:10px 12px;
  background:hsl(var(--card)/.4);
  cursor:pointer
}
.task-list {
  display:grid;
  gap:6px
}
.task-row:hover,.task-row:focus-within {
  background:hsl(var(--muted)/.5)
}
.task-row.completed {
  background:hsl(var(--muted)/.25)
}
.task-row.completed:hover,.task-row.completed:focus-within {
  background:hsl(var(--muted)/.5)
}
.task-check {
  height:19px;
  width:19px;
  border:1px solid hsl(var(--muted-foreground)/.4);
  border-radius:6px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0
}
.completed .task-check {
  background:var(--plan-accent);
  border-color:var(--plan-accent);
  color:hsl(var(--primary-foreground))
}
.task-content {
  flex:1;
  min-width:0;
  overflow-wrap:anywhere;
  font-size:13px;
  text-align:left;
  cursor:pointer
}
.task-content small {
  display:flex;
  align-items:center;
  gap:3px;
  font-size:10px;
  color:var(--plan-accent);
  margin-top:5px
}
.completed .task-content>span {
  color:hsl(var(--muted-foreground));
  text-decoration:line-through
}
.task-actions {
  display:flex;
  align-items:center;
  gap:2px;
  flex-shrink:0
}
.task-action {
  display:flex;
  align-items:center;
  justify-content:center;
  color:hsl(var(--muted-foreground));
  width:28px;
  height:28px;
  padding:6px;
  border-radius:6px;
  transition:background .18s,color .18s
}
.task-action:hover:not(:disabled) {
  background:hsl(var(--muted));
  color:hsl(var(--foreground))
}
.delete-action:hover:not(:disabled) {
  background:hsl(var(--destructive)/.1);
  color:hsl(var(--destructive))
}
.task-action:disabled {
  opacity:.4
}
.focus-goal {
  padding:4px 7px;
  border-radius:7px;
  font-size:11px;
  font-variant-numeric:tabular-nums;
  color:hsl(var(--muted-foreground));
  transition:background .18s,color .18s
}
.focus-goal:hover:not(:disabled) {
  color:var(--plan-accent);
  background:color-mix(in srgb,var(--plan-accent) 8%,transparent)
}
.focus-goal:disabled { opacity:.4 }
.focus-action.is-focused {
  color:var(--plan-accent);
  background:color-mix(in srgb,var(--plan-accent) 9%,transparent)
}
.archive-section>h3 {
  font-size:12px;
  display:flex;
  gap:8px;
  align-items:center;
  font-weight:500;
  color:hsl(var(--muted-foreground))
}
.empty-state {
  text-align:center;
  padding:28px 12px;
  border:1px dashed hsl(var(--border)/.4);
  border-radius:12px;
  background:hsl(var(--muted)/.05)
}
.empty-state p {
  font-size:12px;
  color:hsl(var(--muted-foreground))
}
.archive-section {
  margin-top:20px;
  border-top:1px solid hsl(var(--border));
  padding-top:16px
}
.archive-empty {
  font-size:11px;
  color:hsl(var(--muted-foreground));
  margin:10px 0 16px
}
.archive-group {
  margin-top:10px;
  overflow:hidden
}
.archive-group summary {
  cursor:pointer;
  font-size:12px;
  padding:15px
}
.archive-group summary span {
  float:right;
  font-size:10px;
  color:hsl(var(--muted-foreground))
}
.archive-row {
  display:flex;
  gap:12px;
  padding:12px 18px;
  font-size:12px;
  border-top:1px solid hsl(var(--border)/.7);
  transition:background .18s
}
.archive-row:hover {
  background:hsl(var(--muted)/.35)
}
.archive-row svg {
  color:var(--plan-accent);
  flex-shrink:0
}
.archive-row small {
  display:block;
  font-size:10px;
  color:hsl(var(--muted-foreground));
  margin-top:3px
}
.past-done {
  text-decoration:line-through
}
.error-message {
  font-size:12px;
  margin-top:16px;
  padding:16px;
  border-radius:10px;
  background:hsl(var(--destructive)/.08);
  color:hsl(var(--destructive))
}
.error-message button {
  margin-top:8px;
  text-decoration:underline
}
button:focus-visible,summary:focus-visible,textarea:focus-visible {
  outline:2px solid var(--plan-accent);
  outline-offset:4px
}
.capture input:focus-visible {
  outline:none
}
button:disabled {
  cursor:not-allowed
}
@media(max-width:640px) {
  .period-toolbar {
    gap:10px
  }
  .period-tabs {
    gap:2px
  }
  .period-tabs button {
    padding:6px 9px
  }
  .history-switch {
    margin-left:auto
  }
  .archive-group summary span {
    float:none;
    display:block;
    margin-top:6px
  }
}
@media(max-width:380px) {
  .capture {
    flex-wrap:wrap
  }
  .capture-field {
    flex-basis:100%
  }
  .capture>.add-button {
    margin-left:auto
  }
}
@media(prefers-reduced-motion:reduce) {
  * {
    transition:none!important
  }
}
</style>
