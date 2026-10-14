<template>
  <form class="space-y-2.5" :data-shared-editing="form.title.trim() ? 'true' : undefined" @submit.prevent="submit">
    <div class="flex flex-wrap items-center gap-1.5">
      <input v-model="form.title" type="text" required maxlength="200" :aria-label="t('periodicTasks.note')" :placeholder="t('periodicTasks.placeholder')" :disabled="loading" class="routine-input !w-auto min-w-[180px] flex-1" />
      <CustomSelect :model-value="form.frequency" :options="frequencyOptions" :aria-label="t('periodicTasks.frequency')" :disabled="loading" class="w-fit shrink-0" @update:model-value="setFrequency" />
      <CustomSelect v-if="form.frequency==='yearly'" :model-value="String(form.monthOfYear)" :options="monthOptions" :aria-label="t('periodicTasks.month')" :disabled="loading" class="w-fit shrink-0" @update:model-value="form.monthOfYear=Number($event)" />
      <CustomSelect v-if="form.frequency==='monthly' || form.frequency==='yearly'" :model-value="String(form.dayOfMonth)" :options="dayOptions" :aria-label="t('periodicTasks.dayOfMonth')" :disabled="loading" class="w-fit shrink-0" @update:model-value="form.dayOfMonth=Number($event)" />
      <label v-if="form.frequency==='custom'" class="relative w-20 shrink-0">
        <input v-model.number="form.intervalDays" type="number" required min="1" max="365" :aria-label="t('periodicTasks.everyNDays')" :disabled="loading" class="routine-input !pl-3 !pr-8 !text-xs" />
        <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{{ t('periodicTasks.intervalUnit') }}</span>
      </label>
      <div class="ml-auto flex shrink-0 items-center gap-1.5">
        <CustomSelect :model-value="delivery" :options="deliveryOptions" :aria-label="t('periodicTasks.delivery')" :disabled="loading" :button-style="{paddingLeft:'0.5rem',paddingRight:'0.5rem'}" class="w-fit" @update:model-value="setDelivery">
          <template #value><component :is="delivery==='none'?BellOff:Bell" class="h-3.5 w-3.5" :class="delivery==='none'?'text-muted-foreground':'text-foreground'" /></template>
        </CustomSelect>
        <input v-model="form.reminderTime" type="time" required :aria-label="t('periodicTasks.reminderTime')" :disabled="loading" class="routine-input !w-[6.75rem] !px-2.5 !text-xs" />
        <button v-if="editId" type="button" :disabled="loading" class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50" :aria-label="t('common.cancel')" @click="emit('cancel')"><X class="h-4 w-4" /></button>
        <button type="submit" :disabled="!canSubmit || loading" class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"><Loader2 v-if="loading" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />{{ t(editId?'periodicTasks.save':'quickNotes.add') }}</button>
      </div>
    </div>
    <div v-if="form.frequency==='weekly'" class="flex flex-wrap items-center gap-1.5" role="group" :aria-label="t('periodicTasks.weekDays')">
      <button v-for="day in weekDays" :key="day.value" type="button" :disabled="loading" :aria-pressed="form.daysOfWeek.includes(day.value)" class="h-7 min-w-8 rounded-lg border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50" :class="form.daysOfWeek.includes(day.value)?'border-primary/30 bg-primary/10 text-primary':'border-border/50 bg-background/40 text-muted-foreground hover:bg-background/70 hover:text-foreground'" @click="toggleDay(day.value)">{{ day.label }}</button>
      <span v-if="!form.daysOfWeek.length" class="text-[11px] text-muted-foreground">{{ t('periodicTasks.selectDayError') }}</span>
    </div>
    <details v-if="form.notes.trim() || editTask?.notes" class="text-xs text-muted-foreground">
      <summary class="w-fit cursor-pointer">{{ t('periodicTasks.savedNotes') }}</summary>
      <textarea v-model="form.notes" rows="2" maxlength="500" :disabled="loading" :aria-label="t('periodicTasks.savedNotes')" class="routine-input mt-2 !h-auto resize-y py-2" />
    </details>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Bell, BellOff, Loader2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import type { PeriodicTask, PeriodicTaskInput, TaskCategory, TaskFrequency } from '../stores/periodicTasks'
const props=defineProps<{editTask?:PeriodicTask|null;loading?:boolean}>()
const emit=defineEmits<{submit:[input:PeriodicTaskInput];cancel:[]}>()
const {t,locale}=useI18n()
const defaults=()=>({title:'',notes:'',category:'other' as TaskCategory,frequency:'daily' as TaskFrequency,daysOfWeek:[] as number[],
 dayOfMonth:new Date().getDate(),monthOfYear:new Date().getMonth()+1,intervalDays:3,reminderTime:'09:00',notifyBrowser:true,notifyEmail:false})
const form=reactive(useWorkspaceDraft(`routine-form:${props.editTask?.id || 'new'}`,defaults()).value)
const editId=computed(()=>props.editTask?.id || null)
const frequencies:TaskFrequency[]=['daily','weekly','monthly','yearly','custom']
const frequencyOptions=computed(()=>frequencies.map(value=>({value,label:t(`periodicTasks.${value}`)})))
const weekDays=computed(()=>[1,2,3,4,5,6,0].map(value=>({value,label:t(`days.${['sun','mon','tue','wed','thu','fri','sat'][value]}`)})))
const maxDay=computed(()=>form.frequency==='yearly'?new Date(2024,form.monthOfYear,0).getDate():31)
const dayOptions=computed(()=>Array.from({length:maxDay.value},(_,index)=>({value:String(index+1),label:t('periodicTasks.monthDay',{day:index+1})})))
const monthOptions=computed(()=>Array.from({length:12},(_,index)=>({value:String(index+1),label:new Date(2024,index,1).toLocaleString(locale.value,{month:'long'})})))
const delivery=computed(()=>form.notifyBrowser?(form.notifyEmail?'both':'browser'):(form.notifyEmail?'email':'none'))
const deliveryOptions=computed(()=>[
 {value:'browser',label:t('periodicTasks.notifyBrowser')},{value:'email',label:t('periodicTasks.notifyEmail')},
 {value:'both',label:t('periodicTasks.notifyBoth')},{value:'none',label:t('periodicTasks.notifyNone')},
])
const canSubmit=computed(()=>{
 if(!form.title.trim() || form.title.trim().length>200 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form.reminderTime || ''))return false
 if(form.frequency==='weekly' && !form.daysOfWeek.length)return false
 if(['monthly','yearly'].includes(form.frequency) && (!Number.isInteger(form.dayOfMonth) || form.dayOfMonth<1 || form.dayOfMonth>maxDay.value))return false
 if(form.frequency==='yearly' && (!Number.isInteger(form.monthOfYear) || form.monthOfYear<1 || form.monthOfYear>12))return false
 return form.frequency!=='custom' || (Number.isInteger(form.intervalDays) && form.intervalDays>=1 && form.intervalDays<=365)
})
function setFrequency(value:string){if(frequencies.includes(value as TaskFrequency))form.frequency=value as TaskFrequency}
function setDelivery(value:string){
 if(!['browser','email','both','none'].includes(value))return
 form.notifyBrowser=value==='browser' || value==='both';form.notifyEmail=value==='email' || value==='both'
}
function toggleDay(day:number){const index=form.daysOfWeek.indexOf(day);if(index<0)form.daysOfWeek.push(day);else form.daysOfWeek.splice(index,1)}
watch(()=>form.frequency,value=>{if(value==='weekly' && !form.daysOfWeek.length)form.daysOfWeek=[new Date().getDay()]})
watch(maxDay,value=>{if(form.dayOfMonth>value)form.dayOfMonth=value})
function resetForm(){Object.assign(form,defaults())}
function hydrate(task:PeriodicTask){
 Object.assign(form,{title:task.title,notes:task.notes || '',category:task.category || 'other',frequency:task.frequency,
 daysOfWeek:[...(task.days_of_week || [])],dayOfMonth:task.day_of_month || new Date().getDate(),monthOfYear:task.month_of_year || new Date().getMonth()+1,
 intervalDays:task.interval_days || 3,reminderTime:task.reminder_time || '09:00',notifyBrowser:task.notify_browser ?? true,notifyEmail:task.notify_email ?? false})
}
let firstHydration=true
watch(()=>props.editTask,task=>{
 if(!firstHydration){if(task)hydrate(task);else resetForm()}
 else if(task && !form.title)hydrate(task)
 firstHydration=false
},{immediate:true})
function submit(){
 if(!canSubmit.value || props.loading)return
 emit('submit',{title:form.title.trim(),notes:form.notes.trim(),category:form.category,frequency:form.frequency,
 daysOfWeek:[...form.daysOfWeek],dayOfMonth:form.dayOfMonth,monthOfYear:form.monthOfYear,intervalDays:form.intervalDays,
 anchorDate:props.editTask?.anchor_date || undefined,reminderTime:form.reminderTime,notifyBrowser:form.notifyBrowser,notifyEmail:form.notifyEmail})
}
defineExpose({resetForm})
</script>

<style scoped>
.routine-input {
 @apply h-10 w-full min-w-0 rounded-xl border border-border/50 bg-background/50 pl-4 pr-3 text-sm text-foreground shadow-sm backdrop-blur-sm outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/40 focus:bg-background focus:ring-1 focus:ring-primary/30 disabled:opacity-50;
}
</style>
