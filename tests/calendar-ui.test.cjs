const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')
const vue = require('vue')

function load(source, dependencies = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(code, {
    exports, require: name => dependencies[name] || (name === '@/lib/utils' ? load(fs.readFileSync('src/lib/utils.ts','utf8'), {}, globals) : null) || require(name),
    Date, Intl, crypto, console, ...globals,
  })
  return exports
}

const tasksLib = load(fs.readFileSync('src/features/tasks/lib/tasks.ts', 'utf8'))
const lifecycle = { onMounted: () => {}, onActivated: () => {}, onBeforeUnmount: () => {}, onDeactivated: () => {} }
const translate = (key, values = {}) => ({ 'tasks.hourShort': 'h', 'tasks.min': 'min' }[key] || `${key}${Object.keys(values).length ? `:${JSON.stringify(values)}` : ''}`)

function component(path, dependencies = {}, globals = {}) {
  const source = compileScript(parse(fs.readFileSync(path, 'utf8')).descriptor, { id: 'calendar-ui-test' }).content
  return load(source, {
    vue: { ...vue, ...lifecycle, inject: (_key, fallback) => fallback },
    'vue-i18n': { useI18n: () => ({ t: translate, locale: vue.ref('en') }) },
    'lucide-vue-next': {},
    '@/components/ui/CustomSelect.vue': {},'./ProjectSelect.vue':{},
    '@/lib/searchNavigation': { searchScrollKey: Symbol('search-scroll') },
    '../lib/tasks': tasksLib,
    '../lib/connectedCalendars': load(fs.readFileSync('src/features/tasks/lib/connectedCalendars.ts','utf8'),{vue}),
    './CalendarProviderIcon.vue':{},
    ...dependencies,
  }, globals).default
}

const Editor = component('src/features/tasks/components/WorkEditor.vue')
function editorFixture(overrides = {}) {
  const scope = vue.effectScope(), emitted = []
  const props = vue.reactive({
    mode: 'block',
    block: { id: 'block', title: 'Planning', starts_at: '2026-10-21T09:00', ends_at: '2026-10-21T09:30', version: 1 },
    tasks: [], projects: [], blocks: [], saving: false, error: '',loadTask:async()=>null,saveProject:async()=>null,deleteProject:async()=>false,
    ...overrides,
  })
  const state = scope.run(() => Editor.setup(props, { expose() {}, emit: (...args) => emitted.push(args) }))
  return { props, state, emitted, stop: () => scope.stop() }
}

test('unified task editor requires only a title and omits the estimate input contract', t => {
 const f=editorFixture({mode:'task',block:undefined,initialTitle:'  Task  '});t.after(f.stop)
 assert.equal(f.state.valid.value,true);assert.equal(f.state.times.value.length,0);f.state.submit()
 const [event,draft]=f.emitted[0];assert.equal(event,'save');assert.equal(draft.task.title,'Task');assert.equal(draft.task.project_id,null);assert.equal(draft.task.due_on,null);assert.equal('estimate_minutes' in draft.task,false);assert.equal(draft.times.length,0)
})

test('collapsing the description preserves edits and completed steps are not offered for new planning',async t=>{
 const task={id:'task',title:'Task',description:'Original note',status:'todo',version:1,checklist:[{id:'done',title:'Finished step',done:true},{id:'open',title:'Open step',done:false}],scheduled_blocks:[{id:'past',task_id:'task',title:'',starts_at:'2026-10-21T09:00:00Z',ends_at:'2026-10-21T09:30:00Z',timezone:'UTC',version:1,subtask_ids:['done']}]}
 const f=editorFixture({mode:'task',task,block:undefined});t.after(f.stop)
 f.state.description.value='Edited note';await f.state.toggleDescription();assert.equal(f.state.descriptionOpen.value,false);assert.equal(f.state.description.value,'Edited note')
 await f.state.toggleDescription();assert.equal(f.state.descriptionOpen.value,true);assert.equal(f.state.description.value,'Edited note')
 assert.deepEqual(Array.from(f.state.availableSubtasks.value,item=>item.id),['open'])
 assert.deepEqual(Array.from(f.state.times.value[0].subtask_ids),['done'],'past associations are preserved when a step is finished')
 f.state.addTime();const newTime=f.state.times.value[1];f.state.toggleTarget(newTime,'done');assert.equal(newTime.subtask_ids.length,0)
 f.state.toggleTarget(newTime,'open');assert.deepEqual(Array.from(newTime.subtask_ids),['open']);f.state.submit();assert.equal(f.emitted[0][1].task.description,'Edited note')
})

test('multiple sessions, subtask targets and removals are saved together without changing untouched sessions',t=>{
 const first={id:'first',task_id:'task',title:'',starts_at:'2026-10-21T09:00:00Z',ends_at:'2026-10-21T09:30:00Z',version:1,timezone:'UTC',subtask_ids:[]},second={...first,id:'second',starts_at:'2026-12-01T12:00:00Z',ends_at:'2026-12-01T13:00:00Z'}
 const task={id:'task',title:'Report',status:'todo',version:2,checklist:[{id:'one',title:'Research',done:false}],scheduled_blocks:[first,second]}
 const f=editorFixture({mode:'task',task,block:undefined,blocks:[first]});t.after(f.stop)
 assert.equal(f.state.times.value.length,2,'all dates are loaded, not only the visible calendar range');assert.equal(f.state.canChooseTask,false)
 f.state.toggleTarget(f.state.times.value[0],'one');f.state.removeTime(f.state.times.value[1]);f.state.submit()
 const draft=f.emitted[0][1];assert.equal(draft.taskId,'task');assert.equal(draft.taskVersion,2);assert.equal(draft.times.length,1);assert.deepEqual(Array.from(draft.times[0].subtask_ids),['one']);assert.equal(draft.removed[0].id,'second');assert.equal(draft.removed[0].version,1)
 assert.equal(task.scheduled_blocks.length,2,'draft edits do not mutate the incoming task');assert.equal(task.scheduled_blocks[0].subtask_ids.length,0)
})

test('time validation preserves bounds, overlap warnings and the seven-day maximum',t=>{
 const f=editorFixture({blocks:[{id:'other',starts_at:'2026-10-21T09:15',ends_at:'2026-10-21T09:45'}]});t.after(f.stop)
 const time=f.state.times.value[0];assert.equal(f.state.conflicts(time),1);assert.equal(f.state.valid.value,true)
 time.ends=time.starts;assert.equal(f.state.valid.value,false);f.state.submit();assert.equal(f.emitted.length,0)
 time.starts='2100-12-31T23:00';time.ends='2101-01-01T00:00';assert.equal(f.state.valid.value,false)
 time.starts='2026-10-21T09:00';time.ends='2026-10-28T09:00';assert.equal(f.state.valid.value,true)
 time.ends='2026-10-28T09:01';assert.equal(f.state.valid.value,false)
})

test('completed parent drafts reopen when a child reopens, and removed children lose their time targets',t=>{
 const task={id:'task',title:'Task',status:'done',version:1,checklist:[{id:'one',title:'Step',done:true}],scheduled_blocks:[]}
 const f=editorFixture({mode:'task',task,block:undefined});t.after(f.stop)
 f.state.checklist.value[0].done=false;assert.equal(f.state.status.value,'todo');assert.equal(task.checklist[0].done,true)
 f.state.addTime();f.state.toggleTarget(f.state.times.value[0],'one');f.state.removeSubtask(0);assert.equal(f.state.times.value[0].subtask_ids.length,0)
 f.state.status.value='done';f.state.subtaskDraft.value='New step';f.state.addSubtask();assert.equal(f.state.status.value,'todo')
})

test('only a new calendar event can choose a task; selecting it hydrates its full details',async t=>{
 const task={id:'task',title:'Task',description:'Notes',status:'doing',version:3,checklist:[{id:'one',title:'Step',done:false}],scheduled_blocks:[]}
 const f=editorFixture({block:{starts_at:'2026-10-21T09:00',ends_at:'2026-10-21T09:30'},loadTask:async()=>task});t.after(f.stop)
 assert.equal(f.state.canChooseTask,true);await f.state.chooseTask('task');assert.equal(f.state.title.value,'Task');assert.equal(f.state.isTask.value,true);assert.equal(f.state.checklist.value.length,1);assert.equal(f.state.times.value.length,1)
 f.state.toggleTarget(f.state.times.value[0],'one');f.state.submit();assert.equal(f.emitted[0][1].taskId,'task');assert.equal(f.emitted[0][1].times[0].subtask_ids[0],'one')
 const existing=editorFixture({mode:'task',task});t.after(existing.stop);assert.equal(existing.state.canChooseTask,false);await existing.state.chooseTask('other');assert.equal(existing.state.linked.value.id,'task')
})

test('saving, closing and duplicate submissions are blocked while a request is pending',t=>{
 const f=editorFixture();t.after(f.stop);f.props.saving=true;f.state.submit();f.state.close();assert.equal(f.emitted.length,0)
 f.props.saving=false;f.state.close();assert.equal(f.emitted[0][0],'close')
})

test('deleting the selected project inside the editor preserves local edits and advances only its known task version',async t=>{
 const task={id:'task',title:'Original',project_id:'project',status:'todo',version:4,checklist:[],scheduled_blocks:[]}
 const f=editorFixture({mode:'task',task,block:undefined,deleteProject:async()=>true,loadTask:async()=>({...task,project_id:null,version:5})});t.after(f.stop)
 f.state.title.value='Unsaved edit';assert.equal(await f.state.removeProject({id:'project'}),true)
 assert.equal(f.state.title.value,'Unsaved edit');assert.equal(f.state.linked.value.version,5)
 f.state.projectId.value='';f.state.submit();assert.equal(f.emitted[0][1].taskVersion,5);assert.equal(f.emitted[0][1].task.title,'Unsaved edit')
})

function calendarFixture(overrides = {}, stored = {}, globals = {}) {
  const scope = vue.effectScope(), emitted = [], moves = [], drafts = new Map(), dragInstances = []
  class Draggable {
    constructor(node, options) { this.node = node; this.options = options; this.destroyed = false; dragInstances.push(this) }
    destroy() { this.destroyed = true }
  }
  const Calendar = component('src/features/tasks/components/WorkCalendar.vue', {
    '@/lib/workspaceScope': { useWorkspaceDraft(key, initial) { if (!drafts.has(key)) drafts.set(key, vue.ref(key in stored ? stored[key] : initial)); return drafts.get(key) } },
    './CalendarSurface.vue': { default: {} },'./CalendarAgenda.vue':{},'./ExternalCalendars.vue':{},
    '@fullcalendar/daygrid': { default: {} },
    '@fullcalendar/timegrid': { default: {} },
    '@fullcalendar/list': { default: {} },
    '@fullcalendar/interaction': { default: {}, Draggable },
    '@fullcalendar/core/locales/tr': { default: {} },
  }, globals)
  const props = vue.reactive({
    blocks: [], tasks: [], deadlines: [], busy: false, loading: false, failed: false, paging: false, hasMore: false,
    saveMove: async (...args) => { moves.push(args); return true },
    ...overrides,
  })
  const apiCalls = [], api = {
    gotoDate(value) { apiCalls.push(['gotoDate', value]) },
    changeView(...args) { apiCalls.push(['changeView', ...args]) },
    today() { apiCalls.push(['today']) },
    scrollToTime(value) { apiCalls.push(['scrollToTime', value]) },
    unselect() { apiCalls.push(['unselect']) },
    updateSize() { apiCalls.push(['updateSize']) },
  }
  const state = scope.run(() => Calendar.setup(props, { expose() {}, emit: (...args) => emitted.push(args) }))
  state.calendar.value = { getApi: () => api }
  function range(start = '2026-10-19T00:00', end = '2026-10-26T00:00') {
    state.options.value.datesSet({ start: new Date(start), end: new Date(end), view: { title: '19–25 October 2026', currentStart: new Date(start) } })
  }
  range()
  emitted.length = 0; apiCalls.length = 0
  return { props, state, emitted, moves, apiCalls, range, drafts, dragInstances, stop: () => scope.stop() }
}

test('agenda anchors a bounded multiweek range on the chosen day without asking FullCalendar for a removed view',async t=>{
 const f=calendarFixture();t.after(f.stop);f.state.chooseDay(new Date('2026-10-21T12:00'));f.apiCalls.length=0;f.emitted.length=0
 f.state.setPeriod('listWeek');await vue.nextTick()
 assert.equal(f.apiCalls.length,0)
 const range=f.state.visibleRange.value,chosen=new Date('2026-10-21T00:00').getTime()
 assert.ok(range.start<chosen&&range.end>chosen);assert.ok(range.end-range.start<=63*86400000)
 assert.equal(f.emitted.filter(event=>event[0]==='range').length,1)
 f.state.jumpDate({target:{value:'1900-01-01'}});await vue.nextTick()
 assert.equal(tasksLib.localDay(new Date(f.state.visibleRange.value.start)),'1900-01-01')
 f.state.jumpDate({target:{value:'2100-12-31'}});await vue.nextTick()
 assert.equal(tasksLib.localDay(new Date(f.state.visibleRange.value.end)),'2101-01-01')
 assert.equal(f.apiCalls.length,0)
})

test('agenda groups entries by day, preserves an empty selected day and clips cross-midnight and all-day intervals',t=>{
 const Agenda=component('src/features/tasks/components/CalendarAgenda.vue'),scope=vue.effectScope();t.after(()=>scope.stop())
 const props=vue.reactive({selectedDay:'2026-10-25',start:new Date('2026-10-19T00:00').getTime(),end:new Date('2026-11-01T00:00').getTime(),busy:false,loading:false,events:[
  {id:'late',title:'Overnight',start:'2026-10-21T23:00',end:'2026-10-22T01:00'},
  {id:'all',title:'All day',start:'2026-10-22',end:'2026-10-23',allDay:true},
  {id:'external',title:'Outlook',start:'2026-10-24T09:00',end:'2026-10-24T10:00',extendedProps:{external:{calendar_name:'Work'}}}
 ]})
 const state=scope.run(()=>Agenda.setup(props,{expose(){},emit(){}}))
 assert.deepEqual(Array.from(state.days.value,day=>day.key),['2026-10-21','2026-10-22','2026-10-24','2026-10-25'])
 const [first,second]=state.days.value;assert.equal(state.eventTime(first.entries[0],first),'23:00 – 24:00')
 assert.equal(second.entries[0].allDay,true);assert.equal(state.eventTime(second.entries[1],second),'00:00 – 01:00')
 assert.equal(state.days.value.at(-1).entries.length,0)
 props.loading=true;assert.equal(state.days.value.length,1);assert.equal(state.days.value[0].key,props.selectedDay)
 props.loading=false;props.failed=true;assert.equal(state.days.value.length,1);assert.equal(state.days.value[0].entries.length,0)
})

test('calendar separates selecting a day from creating a timed block and protects a click from also becoming a selection', t => {
  const f = calendarFixture(); t.after(f.stop)
  assert.equal(f.state.options.value.selectMinDistance, 5)
  f.state.options.value.dateClick({ date: new Date('2026-10-22T00:00'), allDay: true })
  assert.equal(f.state.selectedDay.value, '2026-10-22')
  assert.equal(f.emitted.length, 0, 'an ordinary day click opens its agenda without creating an event')
  const clockBefore=new Date(),preferred=f.state.preferredDate(),clockAfter=new Date()
  if(f.state.selectedDay.value===tasksLib.localDay())assert.ok(preferred>=clockBefore&&preferred<=clockAfter,'today uses the current time')
  else assert.equal(preferred.getHours(),9,'other days start at 09:00')
  f.state.options.value.dateClick({ date: new Date('2026-10-22T14:15'), allDay: false })
  assert.equal(f.emitted.length, 1)
  assert.equal(f.emitted[0][0], 'create')
  assert.equal(f.emitted[0][1].getTime(), new Date('2026-10-22T14:15').getTime())
  f.emitted.length = 0
  f.state.options.value.select({ start: new Date('2026-10-22T15:00'), end: new Date('2026-10-22T16:15'), allDay: false })
  assert.equal(f.emitted.length, 1)
  assert.equal(f.emitted[0][2] - f.emitted[0][1], 75 * 60000, 'dragging a timed selection preserves its real duration')
  assert.equal(f.apiCalls.at(-1)[0], 'unselect')
  assert.equal(f.state.options.value.selectAllow({ start: new Date('2026-10-22T00:00'), end: new Date('2026-10-23T00:00'), allDay: true }), true)
  assert.equal(f.state.options.value.selectAllow({ start: new Date('2026-10-22T00:00'), end: new Date('2026-10-24T00:00'), allDay: true }), false, 'month dragging cannot silently turn several days into a 30-minute block')
  f.props.loading = true
  f.state.options.value.dateClick({ date: new Date('2026-10-22T17:00'), allDay: false })
  assert.equal(f.emitted.length, 1)
})

test('calendar date and view navigation validates saved preferences and keeps the selected day', t => {
  const f = calendarFixture({}, {
    'tasks-calendar-period': 'invalid-view', 'tasks-calendar-day': '2026-02-31',
    'tasks-calendar-selected-day': '1899-12-31', 'tasks-calendar-panel': 'invalid-panel',
  }); t.after(f.stop)
  assert.equal(f.state.period.value, 'timeGridWeek')
  assert.equal(f.state.validDay(f.state.savedDay.value), true)
  assert.equal(f.state.validDay(f.state.selectedDay.value), true)
  for (const value of ['2026-02-31', '1899-12-31', '2101-01-01', '2026-1-01', 'not-a-date']) assert.equal(f.state.validDay(value), false)
  f.state.chooseDay(new Date('2026-10-22T12:00'))
  f.state.setPeriod('timeGridDay')
  assert.deepEqual(Array.from(f.apiCalls.at(-1)), ['changeView', 'timeGridDay', '2026-10-22'])
  f.state.stepDay(1)
  assert.equal(f.state.selectedDay.value, '2026-10-23')
  f.apiCalls.length = 0
  f.state.jumpDate({ target: { value: '2026-02-31' } })
  assert.equal(f.apiCalls.length, 0, 'invalid dates cannot navigate the calendar')
  f.state.jumpDate({ target: { value: '2026-11-03' } })
  assert.equal(f.state.selectedDay.value, '2026-11-03')
  assert.equal(f.apiCalls.length, 1, 'jumping outside the displayed range causes one navigation, not two')
  assert.equal(f.apiCalls[0][0], 'gotoDate')
  f.range('1999-01-01T00:00', '1999-01-08T00:00')
  f.apiCalls.length = 0
  f.state.goToday()
  assert.deepEqual(Array.from(f.apiCalls, call => call[0]), ['today','scrollToTime'], 'Today returns to the current date and scrolls within the existing grid')
  const selected = f.state.selectedDay.value
  f.props.busy = true
  f.state.chooseDay(new Date('2026-10-24T12:00'))
  f.state.setPeriod('dayGridMonth')
  assert.equal(f.state.selectedDay.value, selected)
  assert.equal(f.state.period.value, 'timeGridDay')
})

test('calendar shows the selected-day agenda, clips cross-midnight times and respects completion filters', t => {
  const f = calendarFixture({
    tasks: [
      { id: 'scheduled', status: 'todo' }, { id: 'outside', status: 'todo' },
      { id: 'open', status: 'doing' }, { id: 'done', status: 'done' },
    ],
    blocks: [
      { id: 'late', task_id: 'scheduled', task_status: 'todo', title: 'Late', starts_at: '2026-10-21T23:00', ends_at: '2026-10-22T02:00' },
      { id: 'earlier', title: 'Earlier', starts_at: '2026-10-21T09:00', ends_at: '2026-10-21T10:00' },
      { id: 'outside', task_id: 'outside', task_status: 'todo', starts_at: '2026-11-01T09:00', ends_at: '2026-11-01T10:00' },
      { id: 'finished', task_id: 'done', task_status: 'done', starts_at: '2026-10-21T11:00', ends_at: '2026-10-21T12:00' },
    ],
    deadlines: [{ id: 'deadline', due_on: '2026-10-21', title: 'Due', status: 'todo' }, { id: 'done-deadline', due_on: '2026-10-21', title: 'Done', status: 'done' }],
  }); t.after(f.stop)
  f.state.chooseDay(new Date('2026-10-21T12:00'))
  assert.deepEqual(Array.from(f.state.dayBlocks.value, row => row.id), ['earlier', 'late'])
  assert.equal(f.state.blockTime(f.state.dayBlocks.value[1]), '23:00 – 24:00')
  assert.equal(f.state.dayDeadlines.value.length, 1)
  f.state.chooseDay(new Date('2026-10-22T12:00'))
  assert.equal(f.state.blockTime(f.state.dayBlocks.value[0]), '00:00 – 02:00')
  f.state.showCompleted.value = true
  assert.equal(f.state.visibleBlocks.value.length, 3)
  f.state.chooseDay(new Date('2026-10-21T12:00'))
  assert.equal(f.state.dayDeadlines.value.length, 2)
  f.state.showDeadlines.value = false
  assert.equal(f.state.dayDeadlines.value.length, 0)
  assert.equal(f.state.events.value.some(row => row.id.startsWith('due:')), false)
  f.props.loading = true
  assert.equal(f.state.events.value.length, 0)
  assert.equal(f.state.dayBlocks.value.length, 0)
  assert.equal(f.state.options.value.editable, false)
  f.props.loading = false; f.props.failed = true
  assert.equal(f.state.events.value.length, 0, 'failed refresh never displays old records as current')
  assert.equal(f.state.options.value.droppable, false)
})

test('calendar keeps every half-hour scrollable inside a bounded viewport without filtering hours',t=>{
 const f=calendarFixture({}, {'tasks-calendar-time-window':'late'});t.after(f.stop)
 assert.equal(f.state.options.value.slotMinTime,'00:00:00')
 assert.equal(f.state.options.value.slotMaxTime,'24:00:00')
 assert.equal(f.state.options.value.slotDuration,'00:30:00')
 assert.equal(f.state.options.value.height+2,480,'the grid and inspector share the same outer height, including the grid border')
 assert.equal(f.state.options.value.scrollTimeReset,false,'resizing and data refreshes preserve the user’s place in the day')
 f.props.blocks=[{id:'early',starts_at:'2026-10-21T00:15',ends_at:'2026-10-21T00:45'},{id:'late',starts_at:'2026-10-21T23:15',ends_at:'2026-10-21T23:45'}]
 assert.equal(f.state.options.value.events.length,2)
 f.state.calendarHeight.value=240
 assert.equal(f.state.options.value.height+2,240)
 assert.equal(f.state.options.value.slotDuration,'00:30:00','short screens never compress the day into coarse hour windows')
 f.state.showWorkingHours.value=false
 assert.equal(f.state.options.value.businessHours,false)
 assert.equal(f.state.options.value.slotMaxTime,'24:00:00')
 assert.equal(f.emitted.length,0,'viewport changes do not issue backend queries')
})

test('calendar sizing respects the available viewport and changes width without losing hour access',t=>{
 const window={innerHeight:800,matchMedia:()=>({matches:false})}
 const f=calendarFixture({}, {}, {window,getComputedStyle:()=>({paddingBottom:'24px'})});t.after(f.stop)
 f.state.calendarRoot.value={clientWidth:970,getBoundingClientRect:()=>({top:100}),querySelector:()=>({getBoundingClientRect:()=>({height:100})}),closest:()=>({})}
 f.state.fitCalendar()
 assert.equal(f.state.calendarHeight.value,568);assert.equal(f.state.roomy.value,true)
 window.innerHeight=500;f.state.calendarRoot.value.clientWidth=760;f.state.fitCalendar()
 assert.equal(f.state.calendarHeight.value,268);assert.equal(f.state.roomy.value,false)
 assert.equal(f.state.options.value.slotMinTime,'00:00:00');assert.equal(f.state.options.value.slotMaxTime,'24:00:00')
 assert.equal(f.emitted.length,0)
})

test('dense day and agenda retain all records inside the fixed calendar frame',t=>{
 const blocks=Array.from({length:13},(_,i)=>({id:'block-'+i,title:'Block '+i,starts_at:'2026-10-21T09:00',ends_at:'2026-10-21T10:00'}))
 const deadlines=Array.from({length:4},(_,i)=>({id:'deadline-'+i,title:'Deadline '+i,due_on:'2026-10-21',status:'todo'}))
 const tasks=Array.from({length:11},(_,i)=>({id:'task-'+i,title:'Task '+i,status:'todo'}))
 const f=calendarFixture({blocks,deadlines,tasks});t.after(f.stop)
 f.state.chooseDay(new Date('2026-10-21T12:00'))
 assert.equal(f.state.dayBlocks.value.length,13);assert.equal(f.state.dayDeadlines.value.length,4)
 f.state.period.value='listWeek'
 assert.equal(f.state.options.value.events.length,17,'the internal agenda scroll has access to every event')
 assert.equal(f.state.calendarHeight.value,480);assert.equal(f.emitted.length,0)
})

test('calendar measures the grid throughout width transitions, ignores height feedback and cancels work when hidden',t=>{
 const frames=new Map(),observers=[];let next=0
 const f=calendarFixture({}, {}, {
  ResizeObserver:class {constructor(callback){this.callback=callback;observers.push(this)}observe(node){this.node=node}disconnect(){this.disconnected=true}},
  requestAnimationFrame:callback=>{frames.set(++next,callback);return next},cancelAnimationFrame:id=>frames.delete(id),
 });t.after(()=>{f.state.pauseCalendarSize();f.stop()})
 const surface={isConnected:true};f.state.calendarSurface.value=surface
 const flush=()=>{for(const [id,callback]of [...frames]){frames.delete(id);callback()}}
 const resize=(width,height=1000)=>observers.at(-1).callback([{contentRect:{width,height}}])
 f.state.activateCalendarSize();f.state.activateCalendarSize()
 assert.equal(observers.length,1,'mount plus KeepAlive activation share one observer')
 assert.equal(frames.size,1)
 resize(700);resize(720);resize(760);flush()
 assert.equal(f.apiCalls.filter(call=>call[0]==='updateSize').length,1,'at most one recalculation per animation frame')
 resize(760,1300);assert.equal(frames.size,0,'calendar height changes cannot feed a resize loop')
 resize(1100);flush();assert.equal(f.apiCalls.filter(call=>call[0]==='updateSize').length,2)
 assert.equal(f.emitted.length,0,'resizing does not request calendar data or change the selected range')
 resize(1140);f.state.pauseCalendarSize();assert.equal(frames.size,0);assert.equal(observers[0].disconnected,true)
 resize(1160);assert.equal(frames.size,0)
 f.state.activateCalendarSize();assert.equal(observers.length,2);flush()
 assert.equal(f.apiCalls.at(-1)[0],'updateSize')
 surface.isConnected=false;resize(1200);flush()
 assert.equal(f.apiCalls.filter(call=>call[0]==='updateSize').length,3,'detached calendars cannot measure a stale grid')
})

test('the actual FullCalendar grid renders all 48 half-hour slots inside its own fixed-height scroller',t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<!doctype html><div id="calendar"></div>',{pretendToBeVisual:true})
 const previous=new Map(),globals={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,getComputedStyle:dom.window.getComputedStyle.bind(dom.window)}
 dom.window.matchMedia=()=>({matches:false});let calendar;const f=calendarFixture({}, {}, globals)
 for(const [key,value]of Object.entries(globals)){previous.set(key,global[key]);global[key]=value}
 try{
  const {Calendar}=require('@fullcalendar/core'),timeGrid=require('@fullcalendar/timegrid').default,list=require('@fullcalendar/list').default
  calendar=new Calendar(document.getElementById('calendar'),{...f.state.options.value,plugins:[timeGrid,list],initialView:'timeGridDay',initialDate:'2026-10-22',datesSet:undefined,dateClick:undefined,select:undefined,eventClick:undefined,eventDrop:undefined,eventResize:undefined,drop:undefined,droppable:false,selectable:false,editable:false})
  calendar.render()
  const slots=()=>[...document.querySelectorAll('.fc-timegrid-slot-lane[data-time]')].map(node=>node.dataset.time)
  assert.equal(slots().length,48);assert.equal(slots()[0],'00:00:00');assert.equal(slots().at(-1),'23:30:00')
  assert.equal(calendar.getOption('height')+2,f.state.calendarHeight.value)
  assert.ok([...document.querySelectorAll('.fc-scroller')].some(node=>node.style.overflowY==='auto'||node.style.overflowY==='scroll'),'FullCalendar owns the hour grid scrollbar')
  calendar.setOption('height',240)
  assert.equal(slots().length,48,'a smaller viewport does not hide the final hours')
 }finally{calendar?.destroy();f.stop();for(const[key,value]of previous){if(value===undefined)delete global[key];else global[key]=value}dom.window.close()}
})

test('month cells show three events, then two plus the remaining count, and open every event in the more popover',async t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<!doctype html><div id="calendar"></div>',{pretendToBeVisual:true})
 const previous=new Map(),globals={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,getComputedStyle:dom.window.getComputedStyle.bind(dom.window)}
 const blocks=[...[3,4].flatMap((count,day)=>Array.from({length:count},(_,i)=>({id:`${day}-${i}`,title:`Event ${i}`,starts_at:`2026-10-${20+day}T09:00`,ends_at:`2026-10-${20+day}T10:00`})))]
 dom.window.matchMedia=()=>({matches:false});const f=calendarFixture({blocks}, {}, globals);f.state.period.value='dayGridMonth';let calendar
 for(const[key,value]of Object.entries(globals)){previous.set(key,global[key]);global[key]=value}
 // Supply event dimensions for JSDOM's otherwise zero-height layout engine.
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){const event=this.classList.contains('fc-daygrid-event-harness'),cell=this.closest('.fc-daygrid-day'),x=cell?Number(cell.dataset.date?.slice(-2))%7*100:0;return{x,y:0,left:x,top:0,right:x+100,bottom:event?18:100,width:cell?100:700,height:event?18:100}}
 Object.defineProperty(dom.window.HTMLElement.prototype,'offsetParent',{configurable:true,get(){return this.parentElement}})
 try{
  const {Calendar}=require('@fullcalendar/core'),dayGrid=require('@fullcalendar/daygrid').default
  calendar=new Calendar(document.getElementById('calendar'),{...f.state.options.value,plugins:[dayGrid],initialDate:'2026-10-01',datesSet:undefined,dateClick:undefined,select:undefined,eventClick:undefined,eventDrop:undefined,eventResize:undefined,drop:undefined,droppable:false,selectable:false,editable:false})
  calendar.render();await new Promise(resolve=>setTimeout(resolve,30))
  const cell=day=>document.querySelector(`[data-date="2026-10-${day}"]`),visible=day=>[...cell(day).querySelectorAll('.fc-daygrid-event-harness')].filter(node=>node.style.visibility!=='hidden')
  assert.equal(visible(20).length,3);assert.equal(cell(20).querySelector('.fc-more-link'),null)
  assert.equal(visible(21).length,2)
  const more=cell(21).querySelector('.fc-more-link');assert.match(more.textContent,/2/)
  more.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,10))
  assert.equal(document.querySelectorAll('.fc-popover .fc-event').length,4,'more opens all the day’s events, including those hidden from the cell')
 }finally{calendar?.destroy();f.stop();for(const[key,value]of previous){if(value===undefined)delete global[key];else global[key]=value}dom.window.close()}
})

test('calendar event inspection keeps the clicked visible day for cross-week blocks and opens the editor directly on small screens', t => {
  const block = { id: 'overnight', title: 'Work', starts_at: '2026-10-18T23:00', ends_at: '2026-10-20T10:00' }
  const f = calendarFixture({ blocks: [block] }); t.after(f.stop)
  f.state.calendarRoot.value = { clientWidth: 1000 }
  f.state.inspectEvent({ event: { start: new Date(block.starts_at), extendedProps: { block } } })
  assert.equal(f.state.selectedDay.value, '2026-10-19', 'continuing blocks select their first visible day instead of navigating to last week')
  assert.equal(f.state.selectedBlock.value, block.id)
  assert.equal(f.apiCalls.length, 0)
  assert.equal(f.emitted.length, 0)
  f.state.inspectEvent({ event: { start: new Date(block.starts_at), extendedProps: { block } }, el: { closest: () => ({ dataset: { date: '2026-10-20' } }) } })
  assert.equal(f.state.selectedDay.value, '2026-10-20')
  f.state.calendarRoot.value = { clientWidth: 390 }
  f.state.inspectEvent({ event: { start: new Date(block.starts_at), extendedProps: { block } } })
  assert.equal(f.emitted[0][0], 'edit', 'the editing action cannot be lost below a long mobile grid')
  assert.equal(f.emitted[0][1].id, block.id)
  f.props.busy = true
  f.state.inspectEvent({ event: { start: new Date(block.starts_at), extendedProps: { block } } })
  assert.equal(f.emitted.length, 1)
})

test('inspection scrolls only the day panel and opens a narrow overlay without moving the page',async t=>{
 const block={id:'late',title:'Late',starts_at:'2026-10-21T21:00',ends_at:'2026-10-21T22:00'}
 const f=calendarFixture({blocks:[block]});t.after(f.stop)
 const list={scrollTop:0,getBoundingClientRect:()=>({top:100})},target={getBoundingClientRect:()=>({top:560-list.scrollTop}),closest:()=>list}
 f.state.inspector.value={querySelector:()=>target}
 f.state.calendarRoot.value={clientWidth:1100};f.state.roomy.value=true
 f.state.inspectEvent({event:{start:new Date(block.starts_at),extendedProps:{block}}})
 assert.equal(f.state.selectedBlock.value,'late')
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(list.scrollTop,456,'only the list containing the selected entry changes its scroll position')
 assert.equal(f.emitted.length,0)
 f.state.roomy.value=false;f.state.inspectorOpen.value=false
 f.state.inspectDay(new Date('2026-10-22T00:00'));await new Promise(resolve=>setImmediate(resolve))
 assert.equal(f.state.inspectorOpen.value,true)
})

test('calendar uses a custom event title before its linked task title and only reserves a deadline row when needed', t => {
  const f = calendarFixture({
    blocks: [{ id: 'custom', title: 'Research session', task_title: 'Research', task_id: 'task', starts_at: '2026-10-21T09:00', ends_at: '2026-10-21T10:00' }],
  }); t.after(f.stop)
  assert.equal(f.state.events.value[0].title, 'Research session')
  assert.equal(f.state.options.value.allDaySlot, false)
  f.props.deadlines = [{ id: 'task', title: 'Research', due_on: '2026-10-21', status: 'todo' }]
  assert.equal(f.state.options.value.allDaySlot, true)
  f.state.showDeadlines.value = false
  assert.equal(f.state.options.value.allDaySlot, false)
})

test('calendar drag saves once, reverts rejected and thrown saves, and external task drops have one distinct action', async t => {
  const saves = [], f = calendarFixture({ saveMove: async (...args) => { saves.push(args); return false }, tasks: [{ id: 'task', status: 'todo' }, { id: 'done', status: 'done' }] }); t.after(f.stop)
  let reverts = 0
  const block = { id: 'block', version: 3 }, info = { event: { start: new Date('2026-10-21T10:00'), end: new Date('2026-10-21T11:00'), extendedProps: { block } }, revert() { reverts++ } }
  await f.state.options.value.eventDrop(info)
  assert.equal(saves.length, 1)
  assert.equal(saves[0][0].id, 'block')
  assert.equal(reverts, 1)
  f.props.saveMove = async () => { throw new Error('offline') }
  await f.state.options.value.eventResize(info)
  assert.equal(reverts, 2, 'transport failure restores the prior visible interval')
  f.props.busy = true
  await f.state.options.value.eventDrop(info)
  assert.equal(saves.length, 1)
  assert.equal(reverts, 3)
  f.props.busy = false
  assert.equal(f.state.options.value.droppable,false,'the retired planner no longer accepts external task drags')
})

test('Outlook overlays stay read-only, preserve all-day boundaries and open their own details',async()=>{
 const f=calendarFixture();try{
  f.range('2026-11-01T00:00:00Z','2026-12-01T00:00:00Z');f.state.chooseDay(new Date('2026-11-04T12:00:00'))
  const external={id:'outlook:one',source_id:'source',calendar_name:'Work',title:'Meeting',private:false,color:'#3388FF',start:'2026-11-04T09:00:00Z',end:'2026-11-04T10:00:00Z',allDay:false,location:'',url:null},allDay={...external,id:'outlook:day',allDay:true,start:'2026-11-04',end:'2026-11-05'}
  f.state.externalEvents.value=[external,allDay];assert.equal(f.state.dayExternal.value.length,2)
  const event=f.state.events.value.find(row=>row.id===external.id);assert.equal(event.editable,false);assert.equal(event.startEditable,false);assert.equal(event.durationEditable,false);assert.equal(f.state.options.value.allDaySlot,true)
  let opened;f.state.externalCalendar.value={openEvent(value){opened=value}}
  f.state.options.value.eventClick({event:{start:new Date(external.start),extendedProps:{external}}});assert.equal(opened.id,external.id);assert.equal(f.emitted.length,1,'only the initial range report is emitted; no local editor opens')
  let reverted=0;await f.state.options.value.eventDrop({event:{start:new Date(external.start),end:new Date(external.end),extendedProps:{external}},revert(){reverted++}});assert.equal(reverted,1);assert.equal(f.moves.length,0)
  f.state.chooseDay(new Date('2026-11-05T12:00:00'));assert.equal(f.state.dayExternal.value.length,0,'all-day end dates are exclusive')
 }finally{f.stop()}
})


test('a height-changing resize waits for the Vue update and cannot resize a calendar torn down during that update',async t=>{
 const frames=new Map();let next=0
 const f=calendarFixture({}, {}, {window:{innerHeight:800,matchMedia:()=>({matches:false})},getComputedStyle:()=>({paddingBottom:'24px'}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next},cancelAnimationFrame:id=>frames.delete(id)})
 t.after(()=>{f.state.pauseCalendarSize();f.stop()})
 f.state.calendarRoot.value={clientWidth:970,getBoundingClientRect:()=>({top:100}),querySelector:()=>({getBoundingClientRect:()=>({height:100})}),closest:()=>({})}
 f.state.calendarSurface.value={isConnected:true}
 f.state.activateCalendarSize();for(const[id,fn]of frames){frames.delete(id);fn()}
 assert.equal(f.state.calendarHeight.value,568)
 assert.equal(f.apiCalls.some(call=>call[0]==='updateSize'),false,'new options must reach Vue before imperative sizing')
 f.state.pauseCalendarSize();await vue.nextTick();assert.equal(f.apiCalls.some(call=>call[0]==='updateSize'),false,'a stale nextTick cannot touch the disposed calendar')
 f.state.activateCalendarSize();for(const[id,fn]of frames){frames.delete(id);fn()};await vue.nextTick()
 assert.equal(f.apiCalls.filter(call=>call[0]==='updateSize').length,1)
})
