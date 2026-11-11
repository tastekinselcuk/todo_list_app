<template>
  <div ref="scroller" class="calendar-agenda" :aria-label="t('tasks.agenda')" :aria-busy="loading" @scroll.passive="userScrolled=true">
    <section v-for="day in days" :key="day.key" :data-date="day.key" :data-agenda-day="day.key" class="agenda-day">
      <div class="agenda-day-header"><button type="button" class="agenda-day-heading" :class="day.key===selectedDay&&'is-selected'" :aria-label="fullDate(day.start)" :aria-current="day.key===selectedDay?'date':undefined" :aria-pressed="day.key===selectedDay" :disabled="busy" @click="$emit('select',day.key)"><span class="capitalize">{{ weekday(day.start) }}</span><span class="agenda-date">{{ dateLabel(day.start) }}</span></button></div>
      <p v-if="loading||failed" class="agenda-empty">{{ t(loading?'tasks.calendarLoading':'tasks.calendarUnavailable') }}</p>
      <template v-else>
        <button v-for="entry in day.entries" :key="entry.id" type="button" class="agenda-event" :class="{'is-done':entry.done,'is-selected':entry.id===selectedBlock}" :disabled="busy" @click="$emit('event',entry.id,($event.currentTarget as HTMLElement),$event)">
          <span class="agenda-time">{{ entry.allDay?t('connectedCalendars.allDay'):eventTime(entry,day) }}</span><i class="agenda-dot" :style="entry.color?{backgroundColor:entry.color}:undefined" />
          <span class="min-w-0 flex-1"><span class="agenda-event-title">{{ entry.title }}</span><span v-if="entry.source" class="agenda-source">{{ entry.source }}</span></span>
        </button>
        <p v-if="!day.entries.length" class="agenda-empty">{{ t('tasks.freeDay') }}</p>
      </template>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed,nextTick,onMounted,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EventInput } from '@fullcalendar/core'
import { localDay } from '../lib/tasks'
const props=defineProps<{events:EventInput[];selectedDay:string;selectedBlock?:string;start:number;end:number;busy:boolean;loading:boolean;failed?:boolean}>()
defineEmits<{select:[day:string];event:[id:string,element:HTMLElement,event:MouseEvent]}>()
const {t,locale}=useI18n(),scroller=ref<HTMLElement>(),userScrolled=ref(false)
const language=computed(()=>locale.value==='tr'?'tr-TR':'en-GB')
const parseDate=(value:unknown)=>value instanceof Date?new Date(value):new Date(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00':String(value))
const entries=computed(()=>props.events.flatMap(event=>{
 const start=parseDate(event.start);if(!Number.isFinite(start.getTime()))return[]
 const end=event.end?parseDate(event.end):new Date(start)
 if(!event.end){if(event.allDay)end.setDate(end.getDate()+1);else end.setMinutes(end.getMinutes()+30)}
 if(!Number.isFinite(end.getTime())||end<=start)return[]
 const classes=Array.isArray(event.classNames)?event.classNames:[]
 return[{id:String(event.id),title:String(event.title||''),start,end,allDay:!!event.allDay,done:classes.includes('work-block-done'),color:typeof event.borderColor==='string'&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(event.borderColor)?event.borderColor:undefined,source:event.extendedProps?.external?.calendar_name||''}]
}))
type Entry=(typeof entries.value)[number]
const days=computed(()=>{
 const result:{key:string;start:Date;end:Date;entries:Entry[]}[]=[],date=new Date(props.start)
 if(!Number.isFinite(date.getTime()))return result
 date.setHours(0,0,0,0)
 for(let index=0;date.getTime()<props.end&&index<63;index++){
  const start=new Date(date),end=new Date(date);end.setDate(end.getDate()+1)
  const key=localDay(start),items=props.loading||props.failed?[]:entries.value.filter(entry=>entry.start<end&&entry.end>start).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.getTime()-b.start.getTime()||a.title.localeCompare(b.title))
  if(key===props.selectedDay||items.length)result.push({key,start,end,entries:items})
  date.setDate(date.getDate()+1)
 }
 return result
})
const weekday=(date:Date)=>new Intl.DateTimeFormat(language.value,{weekday:'long'}).format(date)
const dateLabel=(date:Date)=>new Intl.DateTimeFormat(language.value,{day:'numeric',month:'long',year:date.getFullYear()!==new Date().getFullYear()?'numeric':undefined}).format(date)
const fullDate=(date:Date)=>new Intl.DateTimeFormat(language.value,{dateStyle:'full'}).format(date)
const clock=(date:Date)=>new Intl.DateTimeFormat(language.value,{hour:'2-digit',minute:'2-digit',hour12:false}).format(date)
function eventTime(entry:Entry,day:{start:Date;end:Date}){return `${entry.start<day.start?'00:00':clock(entry.start)} – ${entry.end>=day.end?'24:00':clock(entry.end)}`}
function scrollToSelected(){const root=scroller.value,target=root?.querySelector<HTMLElement>(`[data-agenda-day="${props.selectedDay}"]`);if(root&&target)root.scrollTop=Math.max(0,target.getBoundingClientRect().top-root.getBoundingClientRect().top+root.scrollTop)}
watch(()=>props.selectedDay,async()=>{userScrolled.value=false;await nextTick();scrollToSelected()})
watch([()=>props.loading,()=>props.events,()=>props.start,()=>props.end],async()=>{await nextTick();if(!userScrolled.value)scrollToSelected()},{flush:'post'})
onMounted(async()=>{await nextTick();scrollToSelected()})
</script>
<style scoped>
.agenda-day:last-child{min-height:100%}
.calendar-agenda{height:calc(var(--calendar-body-height) - 2px);min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;border-radius:inherit}.calendar-agenda::-webkit-scrollbar{display:none}.agenda-day-header{position:sticky;top:0;z-index:2;display:flex;justify-content:flex-start;padding:10px 16px;border-block:1px solid hsl(var(--border)/.5);background:hsl(var(--card))}.agenda-day:first-child .agenda-day-header{border-top:0}.agenda-day-heading{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;max-width:100%;padding:7px 10px;border:1px solid hsl(var(--border)/.8);border-radius:8px;background:hsl(var(--muted)/.25);text-align:left;font-size:11px;font-weight:500;line-height:1.5;color:hsl(var(--muted-foreground));transition:background-color .15s,border-color .15s,color .15s}.agenda-day-heading:hover{background:hsl(var(--primary)/.045);border-color:hsl(var(--primary)/.18)}.agenda-day-heading.is-selected{background:hsl(var(--primary)/.09);border-color:hsl(var(--primary)/.24);color:hsl(var(--primary))}.agenda-date{font-weight:400;color:inherit;opacity:.8}.agenda-event{display:flex;align-items:center;gap:12px;width:100%;padding:11px 13px;text-align:left;border-bottom:1px solid hsl(var(--border)/.35);font-size:12px;transition:background-color .15s}.agenda-event:hover,.agenda-event.is-selected{background:hsl(var(--primary)/.035)}.agenda-time{flex-shrink:0;min-width:84px;font-size:10px;font-variant-numeric:tabular-nums;color:hsl(var(--muted-foreground))}.agenda-dot{flex-shrink:0;width:6px;height:6px;border-radius:50%;background:hsl(var(--primary)/.3)}.agenda-event-title{overflow-wrap:anywhere;line-height:1.6}.agenda-event.is-done .agenda-event-title{text-decoration:line-through;color:hsl(var(--muted-foreground))}.agenda-source{display:block;margin-top:2px;font-size:10px;color:hsl(var(--muted-foreground))}.agenda-empty{padding:20px 14px;text-align:center;font-size:11px;color:hsl(var(--muted-foreground))}.agenda-event:focus-visible,.agenda-day-heading:focus-visible{outline:2px solid hsl(var(--primary)/.3);outline-offset:-2px}.agenda-event:disabled,.agenda-day-heading:disabled{opacity:.5}
@media(max-width:639px){.agenda-event{gap:8px;padding:10px}.agenda-time{min-width:75px}}
@media(prefers-reduced-motion:reduce){.agenda-event,.agenda-day-heading{transition:none}}
</style>
