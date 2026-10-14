<template>
  <div class="relative" @mouseleave="hover = null">
    <div class="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span v-for="s in series" :key="s.key" class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full" :style="{ background: s.color }" />{{ s.label }}</span>
    </div>
    <svg viewBox="0 0 720 210" class="h-auto w-full overflow-visible" role="img" :aria-label="label">
      <title>{{ label }}</title><desc>{{ t('analytics.chartHelp') }}</desc>
      <g v-for="tick in [0, 1, 2, 3]" :key="tick" aria-hidden="true">
        <line x1="34" x2="710" :y1="174-tick*50" :y2="174-tick*50" stroke="currentColor" class="text-border/60" />
        <text x="27" :y="178-tick*50" text-anchor="end" fill="currentColor" class="text-muted-foreground" font-size="10">{{ formatValue ? formatValue(max*tick/3) : Math.round(max*tick/3) }}</text>
      </g>
      <g v-for="s in series.filter(s=>s.type!=='line')" :key="s.key" aria-hidden="true">
        <rect v-for="(row,index) in rows" :key="row.day" :x="x(index)+(barIndex(s.key)-barSeries.length/2)*barWidth" :y="174-height(Number(row[s.key] || 0))" :width="Math.max(1,barWidth-1.5)" :height="height(Number(row[s.key] || 0))" rx="2" :fill="s.color" :opacity="hover===index || selected===row.day ? 1 : .78" />
      </g>
      <path v-for="s in series.filter(s=>s.type==='line')" :key="s.key" :d="line(s.key)" fill="none" :stroke="s.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" />
      <g v-for="(row,index) in rows" :key="row.day">
        <rect :x="x(index)-slot/2" y="12" :width="slot" height="174" :fill="selected===row.day ? 'hsl(var(--primary) / .06)' : 'transparent'" class="cursor-pointer focus:outline-none focus:stroke-primary" :tabindex="index === focused ? 0 : -1" role="button" :aria-label="rowLabel(row)" :aria-pressed="selected===row.day" @mouseenter="hover=index" @focus="hover=index" @click="emit('select',row.day)" @keydown.enter.prevent="emit('select',row.day)" @keydown.space.prevent="emit('select',row.day)" @keydown.left.prevent="move($event,index-1)" @keydown.right.prevent="move($event,index+1)" />
        <text v-if="index % Math.max(1,Math.ceil(rows.length/7))===0 || index===rows.length-1" :x="x(index)" y="201" text-anchor="middle" fill="currentColor" class="text-muted-foreground" font-size="10" aria-hidden="true">{{ shortDate(row.day) }}</text>
      </g>
    </svg>
    <div v-if="active" class="mt-3 flex min-h-5 flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" role="status"><span class="font-medium text-foreground">{{ shortDate(active.day) }}</span><span v-for="s in series" :key="s.key">{{ s.label }}: {{ active[s.key] == null ? '—' : Number(active[s.key]).toLocaleString(locale,{maximumFractionDigits:1}) }}</span></div>
    <p v-else class="mt-3 text-[11px] text-muted-foreground">{{ t('analytics.chartHelp') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
interface Row { day:string; [key:string]:number|string|null }
interface Series {key:string;label:string;color:string;type?:'bar'|'line'}
const props=defineProps<{rows:Row[];series:Series[];label:string;selected?:string|null;formatValue?:(value:number)=>string}>()
const emit=defineEmits<{select:[day:string]}>()
const {t,locale}=useI18n(),hover=ref<number|null>(null),focused=ref(0)
watch(()=>props.rows,()=>{hover.value=null;focused.value=0})
const active=computed(()=>props.rows[hover.value ?? props.rows.findIndex(r=>r.day===props.selected)])
const max=computed(()=>Math.max(3,...props.rows.flatMap(row=>props.series.map(s=>Number(row[s.key]) || 0))))
const slot=computed(()=>676/Math.max(1,props.rows.length))
const barSeries=computed(()=>props.series.filter(s=>s.type!=='line'))
const barWidth=computed(()=>Math.min(24,slot.value*.72/Math.max(1,barSeries.value.length)))
const x=(index:number)=>34+slot.value*(index+.5)
const height=(value:number)=>value/max.value*150
const barIndex=(key:string)=>barSeries.value.findIndex(s=>s.key===key)
const shortDate=(day:string)=>new Date(`${day}T12:00:00Z`).toLocaleDateString(locale.value,{day:'numeric',month:'short',timeZone:'UTC'})
function line(key:string) { let pen=false;return props.rows.map((row,index)=>{if(row[key]===null){pen=false;return ''}const command=pen?'L':'M';pen=true;return `${command}${x(index)},${174-height(Number(row[key] || 0))}`}).join(' ') }
const rowLabel=(row:Row)=>`${row.day}, ${props.series.map(s=>`${s.label}: ${row[s.key] ?? '—'}`).join(', ')}`
function move(event:KeyboardEvent,index:number) {
  focused.value=Math.max(0,Math.min(props.rows.length-1,index))
  const parent=(event.target as SVGElement).parentElement?.parentElement
  const targets=parent?.querySelectorAll<SVGElement>('[role="button"]')
  targets?.[focused.value]?.focus()
}
</script>
