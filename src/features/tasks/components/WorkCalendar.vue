<template>
  <div ref="calendarRoot" class="work-calendar" :class="{'is-roomy':roomy,'is-compact':calendarHeight<350}" :style="{'--calendar-body-height':calendarHeight+'px'}">
    <div class="workspace-toolbar calendar-chrome space-y-3">
      <slot name="toolbar" />
      <div class="calendar-controls">
        <div class="calendar-date-nav">
          <div class="flex"><button type="button" class="calendar-icon" :disabled="busy" :aria-label="t('tasks.previous')" @click="calendar?.getApi().prev()"><ChevronLeft :size="16" /></button><button type="button" class="calendar-icon" :disabled="busy" :aria-label="t('tasks.next')" @click="calendar?.getApi().next()"><ChevronRight :size="16" /></button></div>
          <label class="calendar-heading" :title="t('tasks.jumpDate')"><span aria-live="polite">{{ heading }}</span><ChevronDown :size="12" /><input type="date" :value="selectedDay" min="1900-01-01" max="2100-12-31" :aria-label="t('tasks.jumpDate')" :disabled="busy" @change="jumpDate" /></label>
          <button type="button" class="calendar-control" :disabled="busy" @click="goToday">{{ t('tasks.today') }}</button>
        </div>
        <div class="calendar-actions">
          <CustomSelect :model-value="period" :options="periods" :disabled="busy" size="sm" class="w-24" :aria-label="t('tasks.calendarPeriod')" @update:model-value="setPeriod" />
          <button v-if="!roomy" ref="inspectorToggle" type="button" class="calendar-icon calendar-bordered" :aria-expanded="inspectorOpen" :aria-label="t('tasks.planningPanel')" :title="t('tasks.planningPanel')" @click="inspectorOpen=!inspectorOpen"><PanelRight :size="15" /></button>
          <button ref="filterButton" type="button" class="calendar-icon calendar-bordered" :popovertarget="filterId" :aria-label="t('tasks.displayOptions')" :title="t('tasks.displayOptions')" @click="positionFilters"><SlidersHorizontal :size="15" /></button>
          <button type="button" class="calendar-add" :disabled="busy||loading||failed" @click="newEvent()"><Plus :size="15" />{{ t('tasks.newEvent') }}</button>
        </div>
      </div>
    </div>
    <div class="calendar-layout">
      <div class="calendar-main min-w-0">
        <div ref="calendarSurface" class="calendar-grid workspace-card" :aria-busy="loading"><FullCalendar ref="calendar" :options="options"><template #dayCellContent="arg"><div v-if="arg.view.type==='dayGridMonth'" class="calendar-day-heading"><button type="button" class="calendar-day-number" :aria-label="dayLabel(arg.date)" :aria-pressed="selectedDay===localDay(arg.date)" @click.stop="inspectDay(arg.date,$event.detail===0)">{{ arg.dayNumberText }}</button><button type="button" class="calendar-day-add" :disabled="busy||loading||failed" :aria-label="t('tasks.addOnDate',{date:dayLabel(arg.date)})" @click.stop="newEvent(arg.date)"><Plus :size="12" /></button></div></template><template #dayHeaderContent="arg"><span v-if="period==='dayGridMonth'">{{ arg.text }}</span><button v-else type="button" class="calendar-weekday" :aria-label="dayLabel(arg.date)" :aria-pressed="selectedDay===localDay(arg.date)" @click.stop="inspectDay(arg.date,$event.detail===0)">{{ arg.text }}</button></template></FullCalendar></div>
      </div>
      <aside v-show="roomy||inspectorOpen" ref="inspector" class="calendar-inspector workspace-card" @keydown.esc.stop="inspectorOpen=false;inspectorToggle?.focus()">
        <div class="inspector-tabs" role="group" :aria-label="t('tasks.planningPanel')"><button type="button" :class="panel==='day'&&'is-active'" :aria-pressed="panel==='day'" @click="panel='day'"><CalendarDays :size="14" />{{ t('tasks.selectedDay') }}</button><button type="button" :class="panel==='plan'&&'is-active'" :aria-pressed="panel==='plan'" @click="panel='plan'"><ListTodo :size="14" />{{ t('tasks.planTasks') }}<span v-if="!loading&&!failed" class="text-[9px] opacity-60">{{ backlog.length }}{{ hasMore?'+':'' }}</span></button></div>
        <template v-if="panel==='day'">
          <div ref="inspectorTitle" tabindex="-1" class="inspector-date" aria-live="polite"><div><span>{{ selectedDayLabel }}</span><strong>{{ selectedDateLabel }}</strong></div><div class="flex"><button type="button" class="calendar-icon !w-6" :disabled="busy" :aria-label="t('tasks.previousDay')" @click="stepDay(-1)"><ChevronLeft :size="14" /></button><button type="button" class="calendar-icon !w-6" :disabled="busy" :aria-label="t('tasks.nextDay')" @click="stepDay(1)"><ChevronRight :size="14" /></button></div></div>
          <div class="inspector-scroll">
            <p v-if="loading||failed" class="inspector-empty">{{ t(loading?'tasks.calendarLoading':'tasks.calendarUnavailable') }}</p>
            <template v-else>
              <button v-for="task in dayDeadlines" :key="`due:${task.id}`" type="button" class="inspector-deadline" :disabled="busy" @click="$emit('task',task.id)"><Flag :size="13" /><span class="min-w-0 flex-1 break-words">{{ task.title }}</span><span class="text-[9px] opacity-70">{{ t('tasks.deadline') }}</span></button>
              <div v-for="block in dayBlocks" :key="block.id" class="inspector-event" :data-inspector-block="block.id" :class="{ 'is-selected':selectedBlock===block.id }"><button type="button" class="inspector-event-body" :disabled="busy" @click="selectedBlock=block.id;$emit('edit',block)"><span class="inspector-event-time">{{ blockTime(block) }}</span><strong :class="block.task_status==='done'&&'line-through opacity-60'">{{ block.title||block.task_title }}</strong><span class="inspector-event-kind">{{ t(block.task_id?'tasks.linkedTask':'tasks.independentEvent') }}<Pencil :size="11" /></span></button><button v-if="block.task_id" type="button" class="inspector-complete" :class="block.task_status==='done'&&'is-done'" :disabled="busy" :aria-label="t(block.task_status==='done'?'tasks.reopen':'tasks.complete',{title:block.title||block.task_title})" @click="$emit('toggle-task',block.task_id)"><Check v-if="block.task_status==='done'" :size="11" /></button></div>
              <div v-if="!dayBlocks.length&&!dayDeadlines.length" class="inspector-empty"><CalendarDays :size="22" :stroke-width="1.2" /><p>{{ t('tasks.freeDay') }}</p></div>
            </template>
          </div>
          <button type="button" class="inspector-add" :disabled="busy||loading||failed" @click="newEvent()"><Plus :size="14" />{{ t('tasks.addToDay') }}</button>
        </template>
        <template v-else>
          <p class="inspector-hint">{{ t('tasks.planHint') }}</p>
          <form v-if="canCreateTask" class="inspector-capture" @submit.prevent="$emit('add-task')"><input :value="taskDraft" maxlength="180" :disabled="busy" :placeholder="t('tasks.taskQuickAdd')" :aria-label="t('tasks.title')" @input="$emit('update:taskDraft',($event.target as HTMLInputElement).value)" /><button type="submit" :disabled="busy||!taskDraft?.trim()" :aria-label="t('tasks.add')"><Plus :size="15" /></button></form>
          <div ref="dragArea" class="inspector-task-list inspector-scroll"><button v-for="task in backlog" :key="task.id" type="button" :data-drag-task="task.id" class="inspector-task" :disabled="busy||loading||failed" :aria-label="t('tasks.scheduleTask',{title:task.title})" @click="$emit('schedule',task,preferredDate())"><GripVertical :size="13" class="shrink-0 opacity-40" /><span>{{ task.title }}<small>{{ task.estimate_minutes }} {{ t('tasks.min') }}</small></span><Plus :size="13" class="shrink-0 opacity-50" /></button><p v-if="loading||failed" class="inspector-empty">{{ t(loading?'tasks.calendarLoading':'tasks.calendarUnavailable') }}</p><p v-else-if="!backlog.length" class="inspector-empty">{{ t(hasMore?'tasks.loadedTasksScheduled':'tasks.backlogEmptyPeriod') }}</p></div>
          <button v-if="hasMore" type="button" class="inspector-load" :disabled="busy||loading||paging||failed" @click="$emit('more')"><Loader2 v-if="paging" :size="11" class="animate-spin" />{{ t('tasks.more') }}</button>
        </template>
      </aside>
    </div>
    <div :id="filterId" ref="filterMenu" popover="auto" class="calendar-options" :style="filterPosition" :aria-label="t('tasks.displayOptions')"><span class="calendar-options-label">{{ t('tasks.displayOptions') }}</span><label><span>{{ t('tasks.showDeadlines') }}</span><input v-model="showDeadlines" type="checkbox" /></label><label><span>{{ t('tasks.showCompleted') }}</span><input v-model="showCompleted" type="checkbox" /></label><label><span>{{ t('tasks.workingHours') }}</span><input v-model="showWorkingHours" type="checkbox" /></label><p>{{ t('tasks.hoursHint') }}</p></div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import trLocale from '@fullcalendar/core/locales/tr'
import type { CalendarOptions, EventInput, EventDropArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Flag, GripVertical, ListTodo, Loader2, PanelRight, Pencil, Plus, SlidersHorizontal } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { localDay, type WorkBlock, type WorkTask } from '../lib/tasks'
const props=defineProps<{blocks:WorkBlock[];tasks:WorkTask[];deadlines:Pick<WorkTask,'id'|'title'|'due_on'|'status'>[];busy:boolean;loading:boolean;failed?:boolean;paging?:boolean;hasMore:boolean;saveMove:(block:WorkBlock,start:string,end:string)=>Promise<boolean>;taskDraft?:string;canCreateTask?:boolean}>()
const emit=defineEmits<{range:[start:string,end:string];create:[date:Date,end?:Date];edit:[block:WorkBlock];task:[id:string];schedule:[task:WorkTask,date?:Date];'drop-task':[task:WorkTask,date:Date];'toggle-task':[id:string];more:[];'update:taskDraft':[value:string];'add-task':[]}>()
const {t,locale}=useI18n(),calendar=ref<InstanceType<typeof FullCalendar>>(),dragArea=ref<HTMLElement>(),heading=ref('')
const calendarRoot=ref<HTMLElement>(),calendarSurface=ref<HTMLElement>(),inspector=ref<HTMLElement>(),inspectorTitle=ref<HTMLElement>()
const period=useWorkspaceDraft('tasks-calendar-period',typeof window!=='undefined'&&window.matchMedia('(max-width:639px)').matches?'listWeek':'timeGridWeek')
const savedDay=useWorkspaceDraft('tasks-calendar-day',localDay()),selectedDay=useWorkspaceDraft('tasks-calendar-selected-day',localDay()),panel=useWorkspaceDraft('tasks-calendar-panel','day')
const showCompleted=useWorkspaceDraft('tasks-calendar-completed',false),showDeadlines=useWorkspaceDraft('tasks-calendar-deadlines',true),showWorkingHours=useWorkspaceDraft('tasks-calendar-working-hours',true)
const validDay=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1900-01-01'&&value<='2100-12-31'&&localDay(new Date(`${value}T12:00:00`))===value
if(!['dayGridMonth','timeGridWeek','timeGridDay','listWeek'].includes(period.value))period.value='timeGridWeek'
if(!validDay(savedDay.value))savedDay.value=localDay()
if(!validDay(selectedDay.value))selectedDay.value=savedDay.value
if(!['day','plan'].includes(panel.value))panel.value='day'
const initialDay=savedDay.value,visibleRange=ref({start:0,end:0}),selectedBlock=ref('')
const calendarHeight=ref(480),roomy=ref(false),inspectorOpen=ref(false),inspectorToggle=ref<HTMLButtonElement>()
const filterButton=ref<HTMLButtonElement>(),filterMenu=ref<HTMLElement>(),filterPosition=ref({top:'0px',left:'0px'}),filterId=`calendar-options-${crypto.randomUUID()}`
const periods=computed(()=>[{value:'dayGridMonth',label:t('tasks.month')},{value:'timeGridWeek',label:t('tasks.week')},{value:'timeGridDay',label:t('tasks.day')},{value:'listWeek',label:t('tasks.agenda')}])
const rangeBlocks=computed(()=>props.loading||props.failed?[]:props.blocks.filter(row=>new Date(row.starts_at).getTime()<visibleRange.value.end&&new Date(row.ends_at).getTime()>visibleRange.value.start))
const visibleBlocks=computed(()=>rangeBlocks.value.filter(row=>showCompleted.value||row.task_status!=='done'))
const backlog=computed(()=>{if(props.loading||props.failed)return[];const scheduled=new Set(rangeBlocks.value.map(row=>row.task_id).filter(Boolean));return props.tasks.filter(row=>row.status!=='done'&&!scheduled.has(row.id))})
const dayStart=computed(()=>new Date(`${selectedDay.value}T00:00:00`)),dayEnd=computed(()=>{const date=new Date(dayStart.value);date.setDate(date.getDate()+1);return date})
const dayBlocks=computed(()=>visibleBlocks.value.filter(row=>new Date(row.starts_at)<dayEnd.value&&new Date(row.ends_at)>dayStart.value).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)))
const dayDeadlines=computed(()=>props.loading||props.failed||!showDeadlines.value?[]:props.deadlines.filter(row=>row.due_on===selectedDay.value&&(showCompleted.value||row.status!=='done')))

const dayLabel=(date:Date)=>new Intl.DateTimeFormat(locale.value==='tr'?'tr-TR':'en-GB',{dateStyle:'full'}).format(date)
const selectedDayLabel=computed(()=>new Intl.DateTimeFormat(locale.value==='tr'?'tr-TR':'en-GB',{weekday:'long'}).format(dayStart.value))
const selectedDateLabel=computed(()=>new Intl.DateTimeFormat(locale.value==='tr'?'tr-TR':'en-GB',{day:'numeric',month:'long',year:'numeric'}).format(dayStart.value))
const clock=(date:Date)=>new Intl.DateTimeFormat(locale.value==='tr'?'tr-TR':'en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date)
function blockTime(block:WorkBlock){const a=new Date(block.starts_at),b=new Date(block.ends_at);return `${a<dayStart.value?'00:00':clock(a)} – ${b>=dayEnd.value?'24:00':clock(b)}`}
const events=computed<EventInput[]>(()=>[...visibleBlocks.value.map(row=>({id:row.id,title:row.title||row.task_title,start:row.starts_at,end:row.ends_at,classNames:[row.task_status==='done'?'work-block-done':'work-block',...(selectedBlock.value===row.id?['work-block-selected']:[])],extendedProps:{block:row}})),...(showDeadlines.value&&!props.loading&&!props.failed?props.deadlines.filter(row=>showCompleted.value||row.status!=='done').map(row=>({id:`due:${row.id}`,title:`${t('tasks.deadline')}: ${row.title}`,start:row.due_on!,allDay:true,editable:false,classNames:['work-deadline',...(row.status==='done'?['work-block-done']:[])],extendedProps:{taskId:row.id}})):[])])

function chooseDay(date:Date,navigate=true){if(props.busy||!validDay(localDay(date)))return;selectedDay.value=localDay(date);selectedBlock.value='';panel.value='day';if(navigate&&(date.getTime()<visibleRange.value.start||date.getTime()>=visibleRange.value.end))calendar.value?.getApi().gotoDate(date)}
async function revealInspector(keyboard=false){
  if(!roomy.value)inspectorOpen.value=true
  await nextTick()
  const target=selectedBlock.value?inspector.value?.querySelector<HTMLElement>(`[data-inspector-block="${selectedBlock.value}"]`):null
  const list=target?.closest<HTMLElement>('.inspector-scroll')
  if(target&&list){const offset=target.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop;list.scrollTop=Math.max(0,offset-4)}
  if(keyboard)inspectorTitle.value?.focus({preventScroll:true})
}
function inspectDay(date:Date,keyboard=false){if(props.busy)return;chooseDay(date);void revealInspector(keyboard)}
function inspectEvent(info:{event:{start:Date|null;extendedProps:Record<string,any>};el?:HTMLElement;jsEvent?:MouseEvent}){if(props.busy||props.loading||props.failed)return;if(info.event.extendedProps.taskId){emit('task',info.event.extendedProps.taskId);return}const block=info.event.extendedProps.block as WorkBlock;if(!block||!info.event.start)return;const clickedDay=info.el?.closest<HTMLElement>('[data-date]')?.dataset.date;const date=clickedDay&&validDay(clickedDay)?new Date(`${clickedDay}T12:00:00`):new Date(Math.max(info.event.start.getTime(),visibleRange.value.start));chooseDay(date,false);selectedBlock.value=block.id;if(calendarRoot.value&&calendarRoot.value.clientWidth<960)emit('edit',block);else void revealInspector(info.jsEvent?.detail===0)}
function stepDay(direction:number){const date=new Date(dayStart.value);date.setDate(date.getDate()+direction);if(validDay(localDay(date)))chooseDay(date)}
function goToday(){if(props.busy)return;chooseDay(new Date(),false);calendar.value?.getApi().today();calendar.value?.getApi().scrollToTime(currentScrollTime())}
function currentScrollTime(){return String(Math.max(0,new Date().getHours()-1)).padStart(2,'0')+':00:00'}
function preferredDate(){const now=new Date();if(selectedDay.value===localDay(now))return now;const date=new Date(dayStart.value);date.setHours(9,0,0,0);return date}
function newEvent(date?:Date){if(props.busy||props.loading||props.failed)return;const start=date?new Date(date):preferredDate();if(date)start.setHours(9,0,0,0);emit('create',start)}
function jumpDate(event:Event){const value=(event.target as HTMLInputElement).value;if(props.busy||!validDay(value))return;chooseDay(new Date(`${value}T12:00:00`),false);calendar.value?.getApi().gotoDate(value)}
function setPeriod(value:string){if(props.busy||!periods.value.some(item=>item.value===value))return;period.value=value;calendar.value?.getApi().changeView(value,selectedDay.value)}
function positionFilters(){const rect=filterButton.value?.getBoundingClientRect();if(rect)filterPosition.value={top:`${Math.max(8,Math.min(window.innerHeight-220,rect.bottom+8))}px`,left:`${Math.max(8,Math.min(window.innerWidth-240,rect.right-232))}px`}}
function closeFilters(){filterMenu.value?.hidePopover?.()}
async function moved(info:EventDropArg|EventResizeDoneArg){const block=info.event.extendedProps.block as WorkBlock;if(!block||props.busy||props.loading||props.failed||!info.event.start||!info.event.end){info.revert();return}try{if(!await props.saveMove(block,info.event.start.toISOString(),info.event.end.toISOString()))info.revert()}catch{info.revert()}}
const options=computed<CalendarOptions>(()=>({
  plugins:[dayGridPlugin,timeGridPlugin,listPlugin,interactionPlugin],initialView:period.value,initialDate:initialDay,locales:[trLocale],locale:locale.value==='tr'?'tr':'en',timeZone:'local',firstDay:1,headerToolbar:false,height:calendarHeight.value-2,expandRows:true,
  validRange:{start:'1900-01-01',end:'2101-01-01'},fixedWeekCount:false,nowIndicator:true,dayMaxEvents:period.value==='dayGridMonth'?false:2,dayMaxEventRows:period.value==='dayGridMonth'?3:false,eventMaxStack:2,slotMinTime:'00:00:00',slotMaxTime:'24:00:00',slotDuration:'00:30:00',snapDuration:'00:15:00',slotLabelInterval:'01:00:00',scrollTime:currentScrollTime(),scrollTimeReset:false,
  businessHours:showWorkingHours.value?{daysOfWeek:[0,1,2,3,4,5,6],startTime:'08:00',endTime:'20:00'}:false,
  slotLabelFormat:{hour:'2-digit',minute:'2-digit',hour12:false},eventTimeFormat:{hour:'2-digit',minute:'2-digit',hour12:false},allDayText:t('tasks.deadline'),
  dayHeaderFormat:period.value==='dayGridMonth'?{weekday:'short'}:{weekday:'short',day:'numeric'},
  selectable:!props.busy&&!props.loading&&!props.failed,selectMinDistance:5,selectLongPressDelay:450,selectMirror:true,selectAllow:info=>!info.allDay||localDay(info.start)===localDay(new Date(info.end.getTime()-1)),editable:!props.busy&&!props.loading&&!props.failed,eventDurationEditable:true,eventResizableFromStart:true,
  droppable:!props.busy&&!props.loading&&!props.failed,dragScroll:true,allDaySlot:events.value.some(event=>event.allDay),events:events.value,eventDisplay:'block',eventMinHeight:18,eventInteractive:true,
  dayCellClassNames:info=>localDay(info.date)===selectedDay.value?['calendar-selected-day']:[],
  datesSet(info){heading.value=info.view.title;savedDay.value=localDay(info.view.currentStart);if(visibleRange.value.start!==info.start.getTime()||visibleRange.value.end!==info.end.getTime()){visibleRange.value={start:info.start.getTime(),end:info.end.getTime()};const chosen=dayStart.value.getTime();if(chosen<info.start.getTime()||chosen>=info.end.getTime())selectedDay.value=localDay(info.view.currentStart)}emit('range',info.start.toISOString(),info.end.toISOString())},
  dateClick(info){if(props.busy||props.loading||props.failed)return;chooseDay(info.date);if(!info.allDay)emit('create',new Date(info.date));else void revealInspector(info.jsEvent?.detail===0)},
  select(info){if(props.busy||props.loading||props.failed)return;const start=new Date(info.start),end=new Date(info.end);if(info.allDay){start.setHours(9,0,0,0);end.setTime(start.getTime()+30*60000)}emit('create',start,end);calendar.value?.getApi().unselect()},
  eventClick:inspectEvent,
  eventDidMount(info){info.el.title=`${info.event.title}${info.timeText?` · ${info.timeText}`:''}`},eventDrop:moved,eventResize:moved,
  drop(info){const task=props.tasks.find(row=>row.id===info.draggedEl.dataset.dragTask);if(!task||props.busy||props.loading||props.failed||task.status==='done')return;const date=new Date(info.date);if(info.allDay)date.setHours(9,0,0,0);emit('drop-task',task,date)},
  noEventsContent:props.loading?t('tasks.calendarLoading'):props.failed?t('tasks.calendarUnavailable'):t('tasks.emptyCalendar'),buttonText:{today:t('tasks.today')},
}))
let draggable:Draggable|undefined
watch(dragArea,node=>{draggable?.destroy();draggable=undefined;if(node)draggable=new Draggable(node,{itemSelector:'[data-drag-task]:not(:disabled)',longPressDelay:350,eventData(el){const task=props.tasks.find(row=>row.id===el.dataset.dragTask);return{title:task?.title||'',duration:{minutes:task?.estimate_minutes||30},create:false}}})},{flush:'post'})
let sizeObserver:ResizeObserver|undefined,sizeFrame=0,sizingActive=true
const measuredWidths=new Map<Element,number>()
let viewportHeight=0
function fitCalendar(){
  const root=calendarRoot.value
  if(!root||typeof window==='undefined'||!root.getBoundingClientRect)return
  const chrome=root.querySelector<HTMLElement>('.calendar-chrome')
  const shell=root.closest<HTMLElement>('.workspace-shell')
  const bottom=shell?parseFloat(getComputedStyle(shell).paddingBottom)||0:16
  const available=(window.visualViewport?.height||window.innerHeight)-Math.max(0,root.getBoundingClientRect().top)-(chrome?.getBoundingClientRect().height||100)-bottom-8
  calendarHeight.value=Math.max(140,Math.floor(available))
  roomy.value=root.clientWidth>=960
}
function dismissInspector(event:PointerEvent){
  if(!roomy.value&&inspectorOpen.value&&!inspector.value?.contains(event.target as Node)&&!inspectorToggle.value?.contains(event.target as Node))inspectorOpen.value=false
}
function queueCalendarResize(){
  if(!sizingActive||sizeFrame)return
  sizeFrame=requestAnimationFrame(()=>{
    sizeFrame=0
    if(sizingActive&&calendarSurface.value?.isConnected){fitCalendar();calendar.value?.getApi().updateSize()}
  })
}
function observeCalendarSize(){
  if(sizeObserver||!calendarSurface.value||typeof ResizeObserver==='undefined')return
  // Grid width can change without a window resize. Observe the enclosing
  // viewport too so an attached navigation bar cannot cover the final row.
  sizeObserver=new ResizeObserver(entries=>{
    for(const entry of entries){
      const target=entry.target||calendarSurface.value!,width=entry.contentRect.width
      const isViewport=(target as HTMLElement).classList?.contains('workspace-viewport')
      if(isViewport&&Math.abs(entry.contentRect.height-viewportHeight)>.5){viewportHeight=entry.contentRect.height;queueCalendarResize()}
      if(width>0&&Math.abs(width-(measuredWidths.get(target)||0))>.5){measuredWidths.set(target,width);queueCalendarResize()}
    }
  })
  sizeObserver.observe(calendarSurface.value)
  if(calendarRoot.value){sizeObserver.observe(calendarRoot.value);const viewport=calendarRoot.value.closest('.workspace-viewport');if(viewport)sizeObserver.observe(viewport)}
}
function activateCalendarSize(){sizingActive=true;observeCalendarSize();queueCalendarResize()}
function pauseCalendarSize(){sizingActive=false;sizeObserver?.disconnect();sizeObserver=undefined;measuredWidths.clear();viewportHeight=0;if(sizeFrame)cancelAnimationFrame(sizeFrame);sizeFrame=0}
function windowResized(){closeFilters();queueCalendarResize()}
function layoutTransitionEnded(event:Event){const target=event.target as HTMLElement|null;if(target?.contains(calendarRoot.value||null)||target?.matches('.pomodoro-host'))queueCalendarResize()}
onMounted(()=>{activateCalendarSize();document.addEventListener('pointerdown',dismissInspector);document.addEventListener('transitionend',layoutTransitionEnded,true);window.visualViewport?.addEventListener('resize',windowResized);window.addEventListener('resize',windowResized);window.addEventListener('scroll',closeFilters,{passive:true})})
onActivated(activateCalendarSize)
onDeactivated(()=>{pauseCalendarSize();closeFilters()})
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',dismissInspector);document.removeEventListener('transitionend',layoutTransitionEnded,true);window.visualViewport?.removeEventListener('resize',windowResized);draggable?.destroy();pauseCalendarSize();closeFilters();window.removeEventListener('resize',windowResized);window.removeEventListener('scroll',closeFilters)})
</script>
<style scoped>
.work-calendar .calendar-chrome::before{bottom:0}
.work-calendar{container-type:inline-size;--fc-border-color:hsl(var(--border)/.55);--fc-page-bg-color:transparent;--fc-neutral-bg-color:hsl(var(--muted)/.2);--fc-neutral-text-color:hsl(var(--muted-foreground));--fc-today-bg-color:hsl(var(--primary)/.035);--fc-event-bg-color:hsl(var(--primary)/.09);--fc-event-border-color:hsl(var(--primary)/.2);--fc-event-text-color:hsl(var(--foreground));--fc-list-event-hover-bg-color:hsl(var(--muted)/.4);--fc-non-business-color:hsl(var(--muted)/.16);--fc-highlight-color:hsl(var(--primary)/.1);--fc-now-indicator-color:hsl(var(--primary));font-size:12px}
.calendar-chrome{padding-bottom:12px}.calendar-controls,.calendar-date-nav,.calendar-actions{display:flex;align-items:center}.calendar-controls{justify-content:space-between;gap:10px;flex-wrap:wrap}.calendar-date-nav{gap:7px;min-width:0}.calendar-actions{gap:6px}.calendar-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:30px;height:30px;border-radius:9px;color:hsl(var(--muted-foreground));transition:background .15s,color .15s}.calendar-icon:hover{background:hsl(var(--muted)/.5);color:hsl(var(--foreground))}.calendar-bordered{width:32px;height:32px;border:1px solid hsl(var(--border)/.6)}
.calendar-heading{position:relative;display:flex;align-items:center;gap:6px;min-width:0;font-size:13px;font-weight:600;white-space:nowrap}.calendar-heading>svg{color:hsl(var(--muted-foreground))}.calendar-heading input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.calendar-heading input::-webkit-calendar-picker-indicator{position:absolute;inset:0;width:auto;height:auto;cursor:pointer}.calendar-control{height:30px;padding:0 9px;border:1px solid hsl(var(--border)/.6);border-radius:9px;font-size:10px;color:hsl(var(--muted-foreground));background:hsl(var(--background)/.3)}.calendar-control:hover{background:hsl(var(--muted)/.4)}.calendar-add{display:flex;align-items:center;justify-content:center;gap:5px;height:32px;padding:0 11px;border-radius:10px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:11px;font-weight:500}.calendar-add:hover{background:hsl(var(--primary)/.9)}
.calendar-layout{position:relative;z-index:0;height:var(--calendar-body-height);display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:stretch}.calendar-main{position:relative;z-index:0;height:100%;min-height:0}.calendar-main:has(.fc-popover){z-index:2}.calendar-grid{height:100%;padding:0;border-radius:12px;background:hsl(var(--card)/.2)}.inspector-load{margin-top:9px;text-align:center;font-size:10px;color:hsl(var(--muted-foreground))}
.calendar-inspector{position:absolute;z-index:1;inset:0 0 auto auto;display:flex;flex-direction:column;width:min(100%,290px);height:var(--calendar-body-height);min-width:0;min-height:0;overflow:hidden;padding:12px;background:hsl(var(--card));box-shadow:0 6px 24px hsl(var(--foreground)/.06)}.inspector-tabs{display:flex;gap:3px;padding:3px;background:hsl(var(--muted)/.35);border-radius:10px}.inspector-tabs button{display:flex;flex:1;align-items:center;justify-content:center;gap:5px;min-height:30px;border-radius:8px;font-size:11px;font-weight:500;color:hsl(var(--muted-foreground))}.inspector-tabs button.is-active{background:hsl(var(--background));color:hsl(var(--foreground));box-shadow:0 1px 3px hsl(var(--foreground)/.05)}.inspector-date{display:flex;align-items:center;justify-content:space-between;gap:4px;margin:18px 0 13px}.inspector-date>div:first-child{display:flex;flex-direction:column;gap:4px;min-width:0}.inspector-date span{font-size:10px;color:hsl(var(--muted-foreground));text-transform:capitalize}.inspector-date strong{font-size:12px;font-weight:550}
.inspector-event{position:relative;overflow:hidden;margin-top:7px;border:1px solid hsl(var(--border)/.65);border-radius:11px;transition:background .15s,border-color .15s}.inspector-event:hover,.inspector-event.is-selected{background:hsl(var(--primary)/.045);border-color:hsl(var(--primary)/.3)}.inspector-event-body{display:flex;flex-direction:column;gap:6px;width:100%;padding:11px 34px 10px 11px;text-align:left}.inspector-event-time{font-size:10px;letter-spacing:.01em;color:hsl(var(--muted-foreground));font-variant-numeric:tabular-nums}.inspector-event-body strong{font-size:11px;font-weight:500;line-height:1.55;overflow-wrap:anywhere}.inspector-event-kind{display:flex;align-items:center;gap:5px;font-size:9px;color:hsl(var(--muted-foreground)/.8)}.inspector-event-kind svg{opacity:0;transition:opacity .15s}.inspector-event:hover .inspector-event-kind svg,.inspector-event:focus-within .inspector-event-kind svg{opacity:1}.inspector-complete{position:absolute;top:11px;right:10px;display:flex;align-items:center;justify-content:center;width:15px;height:15px;border:1px solid hsl(var(--muted-foreground)/.55);border-radius:5px}.inspector-complete:hover{border-color:hsl(var(--primary))}.inspector-complete.is-done{background:hsl(var(--primary));border-color:hsl(var(--primary));color:hsl(var(--primary-foreground))}
.inspector-deadline{display:flex;align-items:center;gap:6px;width:100%;padding:9px 0;font-size:10px;text-align:left;color:hsl(var(--muted-foreground));border-bottom:1px dashed hsl(var(--border)/.6)}.inspector-empty{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;min-height:100px;padding:18px 6px;text-align:center;font-size:11px;line-height:1.8;color:hsl(var(--muted-foreground))}.inspector-empty>svg{opacity:.4}.inspector-add{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;min-height:34px;margin-top:12px;border:1px solid hsl(var(--border)/.6);border-radius:10px;font-size:10px;color:hsl(var(--muted-foreground))}.inspector-add:hover{background:hsl(var(--muted)/.3);color:hsl(var(--foreground))}.inspector-hint{font-size:10px;line-height:1.7;color:hsl(var(--muted-foreground));margin:13px 1px}.inspector-capture{display:flex;align-items:center;gap:4px;border:1px solid hsl(var(--border)/.7);border-radius:10px;margin-bottom:10px;padding:3px}.inspector-capture:focus-within{border-color:hsl(var(--primary)/.4)}.inspector-capture input{width:100%;min-width:0;border:0;outline:none;background:transparent;font-size:11px;padding:7px;color:hsl(var(--foreground))}.inspector-capture input::placeholder{color:hsl(var(--muted-foreground)/.65)}.inspector-capture button{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex-shrink:0;border-radius:7px;background:hsl(var(--primary)/.08);color:hsl(var(--primary))}.inspector-task-list{display:flex;flex-direction:column;gap:5px}.inspector-task{display:flex;align-items:center;gap:5px;width:100%;padding:9px 6px;border:1px solid hsl(var(--border)/.6);border-radius:10px;text-align:left;cursor:grab;transition:background .15s,border-color .15s}.inspector-task:hover{background:hsl(var(--primary)/.035);border-color:hsl(var(--primary)/.25)}.inspector-task>span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:11px;line-height:1.5}.inspector-task small{display:block;margin-top:3px;font-size:9px;color:hsl(var(--muted-foreground))}.inspector-more{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:13px;font-size:10px;color:hsl(var(--muted-foreground))}.inspector-more button{display:flex;align-items:center;gap:5px}.inspector-more button:hover{color:hsl(var(--foreground))}
.calendar-options{position:fixed;inset:auto;margin:0;width:232px;padding:12px;border:1px solid hsl(var(--border)/.7);border-radius:13px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 12px 40px hsl(var(--foreground)/.12)}.calendar-options-label{display:block;padding:2px 1px 8px;font-size:10px;color:hsl(var(--muted-foreground));font-weight:550}.calendar-options label{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 1px;font-size:11px;cursor:pointer}.calendar-options input{accent-color:hsl(var(--primary));width:14px;height:14px}.calendar-options p{padding-top:8px;border-top:1px solid hsl(var(--border)/.5);font-size:10px;line-height:1.7;color:hsl(var(--muted-foreground))}
.calendar-day-heading{display:flex;align-items:center;justify-content:space-between;gap:2px;width:100%}.calendar-day-number{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-size:11px}.calendar-day-number[aria-pressed=true]{background:hsl(var(--primary));color:hsl(var(--primary-foreground))}.calendar-day-add{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;color:hsl(var(--muted-foreground));opacity:0;transition:opacity .15s,background .15s}.calendar-day-add:hover{background:hsl(var(--muted)/.5)}
.calendar-weekday{display:block;padding:6px 4px;border-radius:7px;white-space:nowrap;font-size:10px}.calendar-weekday[aria-pressed=true]{background:hsl(var(--primary)/.08);color:hsl(var(--primary))}.calendar-weekday:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:1px}.inspector-date:focus-visible{outline:2px solid hsl(var(--primary)/.3);outline-offset:4px;border-radius:4px}
.work-calendar :deep(.fc){font-family:inherit;border-radius:inherit}.work-calendar :deep(.fc-view-harness),.work-calendar :deep(.fc-view){border-radius:inherit}.work-calendar :deep(.fc-theme-standard .fc-scrollgrid){border:0;border-radius:inherit;overflow:hidden}.work-calendar :deep(.fc-scrollgrid-section>td),.work-calendar :deep(.fc-scrollgrid-section>th){border-right:0}.work-calendar :deep(.fc-scrollgrid-section:last-child>td){border-bottom:0}.work-calendar :deep(.fc th){font-weight:500;color:hsl(var(--muted-foreground));font-size:10px}.work-calendar :deep(.fc .fc-col-header-cell-cushion){padding:10px 3px}.work-calendar :deep(.fc .fc-daygrid-day-top){flex-direction:row}.work-calendar :deep(.fc .fc-daygrid-day-number){width:100%;padding:5px 6px 3px}.work-calendar :deep(.fc-daygrid-day:hover) .calendar-day-add,.work-calendar :deep(.fc-daygrid-day:focus-within) .calendar-day-add{opacity:1}.work-calendar :deep(.calendar-selected-day){background:hsl(var(--primary)/.025)}.work-calendar :deep(.fc-event){border-radius:5px;padding:2px 4px;cursor:pointer;font-size:10px;line-height:1.5}.work-calendar :deep(.fc-daygrid-event .fc-event-title){text-overflow:ellipsis}.work-calendar :deep(.fc .work-deadline){background:hsl(var(--muted)/.22);border:1px dashed hsl(var(--border));color:hsl(var(--muted-foreground));font-size:9px}.work-calendar :deep(.work-block-done){opacity:.55}.work-calendar :deep(.work-block-done .fc-event-title){text-decoration:line-through}.work-calendar :deep(.fc .work-block-selected){border-color:hsl(var(--primary)/.65);background:hsl(var(--primary)/.16)}.work-calendar :deep(.fc .fc-timegrid-slot){height:24px}.work-calendar :deep(.fc .fc-timegrid-slot-label-cushion){line-height:1.25}.work-calendar :deep(.fc .fc-timegrid-axis-cushion),.work-calendar :deep(.fc .fc-timegrid-slot-label-cushion){font-size:9px;color:hsl(var(--muted-foreground))}.work-calendar :deep(.fc-popover){background:hsl(var(--card));color:hsl(var(--foreground));border-radius:10px;overflow:hidden;box-shadow:0 8px 32px rgb(0 0 0/.12)}.work-calendar :deep(.fc-list){border:0;border-radius:inherit;overflow:hidden}.work-calendar :deep(.fc-list-day-cushion){background:hsl(var(--muted)/.25);font-size:11px}.work-calendar :deep(.fc-list-event td){padding:10px 7px;font-size:11px}
.calendar-icon:focus-visible,.calendar-control:focus-visible,.calendar-add:focus-visible,.calendar-heading:focus-within,.calendar-inspector button:focus-visible,.calendar-day-number:focus-visible,.calendar-day-add:focus-visible,.work-calendar :deep(.fc-event:focus-visible){outline:2px solid hsl(var(--primary)/.4);outline-offset:2px}.work-calendar button:disabled{opacity:.4;cursor:default}
.inspector-scroll{min-height:0;flex:1 1 0%;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none}.work-calendar :deep(.fc-scroller){overscroll-behavior-y:contain;scrollbar-width:none}.work-calendar :deep(.custom-scrollbar),.work-calendar :deep(.fc-popover){scrollbar-width:none}.inspector-scroll::-webkit-scrollbar,.work-calendar :deep(.fc-scroller::-webkit-scrollbar),.work-calendar :deep(.custom-scrollbar::-webkit-scrollbar),.work-calendar :deep(.fc-popover::-webkit-scrollbar){display:none;width:0;height:0}
/* FullCalendar reserves the platform scrollbar width even when its bars are hidden. */
.work-calendar :deep(.fc-col-header),.work-calendar :deep(.fc-daygrid-body),.work-calendar :deep(.fc-daygrid-body>table),.work-calendar :deep(.fc-timegrid-body),.work-calendar :deep(.fc-timegrid-slots>table),.work-calendar :deep(.fc-timegrid-cols>table){width:100%!important}
@container(min-width:960px){.calendar-layout{grid-template-columns:minmax(0,1fr) 244px;gap:16px}.calendar-inspector{position:relative;inset:auto;width:auto;box-shadow:none}}
.inspector-event,.inspector-deadline,.inspector-task,.inspector-capture,.inspector-tabs,.inspector-add,.inspector-date,.inspector-hint,.inspector-load{flex-shrink:0}.inspector-event-body strong,.inspector-task>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.inspector-deadline>span:first-of-type{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.is-compact .inspector-date{margin:9px 0 6px}.is-compact .inspector-date>div:first-child{gap:2px}.is-compact .inspector-hint{margin:7px 1px;line-height:1.4}.is-compact .inspector-empty{min-height:40px;padding:8px 4px;gap:4px}.is-compact .inspector-empty>svg{display:none}.is-compact .inspector-add{min-height:28px;margin-top:6px}.is-compact .inspector-event-body{gap:3px;padding-top:7px;padding-bottom:7px}.is-compact .inspector-event-kind{display:none}.is-compact .inspector-capture{margin-bottom:5px}
@media(max-width:639px){.calendar-controls{gap:9px}.calendar-date-nav{width:100%}.calendar-heading{flex:1;font-size:12px}.calendar-actions{width:100%;justify-content:flex-end}.calendar-add{flex:1;max-width:150px}.calendar-day-add{display:none}.work-calendar :deep(.fc .fc-daygrid-day-number){padding:3px}.work-calendar :deep(.fc-daygrid-event .fc-event-time){display:none}.work-calendar :deep(.fc-event){padding:1px 2px;font-size:9px}.calendar-inspector{padding:11px}}
@media(prefers-reduced-motion:reduce){.work-calendar *{transition:none!important}}
</style>
