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
    '@/components/ui/CustomSelect.vue': {},
    '@/lib/searchNavigation': { searchScrollKey: Symbol('search-scroll') },
    '../lib/tasks': tasksLib,
    ...dependencies,
  }, globals).default
}

const Editor = component('src/features/tasks/components/WorkEditor.vue')
function editorFixture(overrides = {}) {
  const scope = vue.effectScope(), emitted = []
  const props = vue.reactive({
    mode: 'block',
    block: { id: 'block', title: 'Planning', starts_at: '2026-10-21T09:00', ends_at: '2026-10-21T09:30', version: 1 },
    tasks: [], projects: [], blocks: [], saving: false, error: '',
    ...overrides,
  })
  const state = scope.run(() => Editor.setup(props, { expose() {}, emit: (...args) => emitted.push(args) }))
  return { props, state, emitted, stop: () => scope.stop() }
}

test('calendar editor presets change the actual saved interval and shifting the start preserves its duration', async t => {
  const f = editorFixture(); t.after(f.stop)
  for (const minutes of [15, 30, 60, 90]) {
    f.state.setDuration(minutes)
    assert.equal(f.state.durationMinutes.value, minutes)
    assert.equal(new Date(f.state.ends.value) - new Date(f.state.starts.value), minutes * 60000)
  }
  assert.equal(f.state.durationText.value, '1 h 30 min')
  f.state.starts.value = '2026-10-22T23:15'
  await vue.nextTick()
  assert.equal(f.state.ends.value, '2026-10-23T00:45', 'a shift across midnight keeps the selected 90-minute duration')
  f.state.submit()
  const [event, payload] = f.emitted[0]
  assert.equal(event, 'save')
  assert.equal(payload.starts_at, new Date('2026-10-22T23:15').toISOString())
  assert.equal(payload.ends_at, new Date('2026-10-23T00:45').toISOString())
  assert.equal(payload.task_id, null)
  assert.equal(payload.timezone, tasksLib.browserTimezone())
})

test('calendar editor keeps existing task association visible and requires a title after unlinking', t => {
  const f = editorFixture({ block: { title: '', task_id: 'linked', task_title: 'Existing task', starts_at: '2026-10-21T09:00', ends_at: '2026-10-21T09:30' } }); t.after(f.stop)
  assert.equal(f.state.linkedTaskTitle.value, 'Existing task')
  assert.equal(f.state.valid.value, true, 'a linked task supplies the block display title')
  assert.equal(f.state.taskOptions.value.some(option => option.value === 'linked'), true, 'paginated tasks do not remove an existing association')
  f.state.taskId.value = ''
  assert.equal(f.state.linkedTaskTitle.value, '')
  assert.equal(f.state.valid.value, false)
  f.state.submit()
  assert.equal(f.emitted.length, 0)
  f.state.title.value = 'Independent event'
  f.state.submit()
  assert.equal(f.emitted[0][1].title, 'Independent event')
  assert.equal(f.emitted[0][1].task_id, null)
})

test('calendar editor blocks duplicate save, closing and duration edits while a write is pending', t => {
  const f = editorFixture(); t.after(f.stop)
  f.props.saving = true
  const originalEnd = f.state.ends.value
  f.state.setDuration(90)
  f.state.submit()
  f.state.close()
  assert.equal(f.state.ends.value, originalEnd)
  assert.equal(f.emitted.length, 0)
  f.props.saving = false
  f.state.close()
  assert.equal(f.emitted[0][0], 'close')
})

test('calendar editor enforces supported date bounds, positive duration and a seven-day maximum', async t => {
  const f = editorFixture(); t.after(f.stop)
  f.state.starts.value = '2100-12-31T23:55'
  await vue.nextTick()
  assert.equal(f.state.canSetDuration(15), false)
  assert.equal(f.state.validTimes.value, false, 'a preserved interval beyond the supported final date cannot be saved')
  f.state.ends.value = '2100-12-31T23:59'
  assert.equal(f.state.validTimes.value, true)
  assert.equal(f.state.minimumEnd.value, '2100-12-31T23:56')
  assert.equal(f.state.maximumEnd.value, '2100-12-31T23:59')
  f.state.starts.value = '2026-10-21T12:00'
  await vue.nextTick()
  f.state.ends.value = tasksLib.localInput(new Date(new Date(f.state.starts.value).getTime() + 7 * 86400000))
  assert.equal(f.state.validTimes.value, true)
  f.state.ends.value = tasksLib.localInput(new Date(new Date(f.state.starts.value).getTime() + 7 * 86400000 + 60000))
  assert.equal(f.state.validTimes.value, false)
  f.state.ends.value = f.state.starts.value
  assert.equal(f.state.validTimes.value, false)
  f.state.starts.value = '1899-12-31T23:00'
  await vue.nextTick()
  f.state.ends.value = '1900-01-01T00:00'
  assert.equal(f.state.validTimes.value, false)
  assert.equal(f.state.canSetDuration(30), false)
  f.state.submit()
  assert.equal(f.emitted.length, 0)
})

test('calendar editor overlap notice excludes itself and task-mode save contract stays intact', t => {
  const block = editorFixture({ blocks: [
    { id: 'block', starts_at: '2026-10-21T09:00', ends_at: '2026-10-21T09:30' },
    { id: 'overlap', starts_at: '2026-10-21T09:15', ends_at: '2026-10-21T09:45' },
    { id: 'touching', starts_at: '2026-10-21T09:30', ends_at: '2026-10-21T10:00' },
  ] }); t.after(block.stop)
  assert.equal(block.state.conflicts.value, 1)
  assert.equal(block.state.valid.value, true, 'overlap informs without blocking an intentional schedule')
  const f = editorFixture({ mode: 'task', task: {
    title: '  Task title  ', description: 'Notes', project_id: 'project', status: 'doing', priority: 'high', due_on: '2026-11-01', estimate_minutes: 45,
    checklist: [{ id: 'child', title: '  Child task  ', done: true }],
  } }); t.after(f.stop)
  f.state.submit()
  assert.deepEqual(JSON.parse(JSON.stringify(f.emitted[0])), ['save', {
    title: 'Task title', description: 'Notes', project_id: 'project', status: 'doing', priority: 'high', due_on: '2026-11-01', estimate_minutes: 45,
    checklist: [{ id: 'child', title: 'Child task', done: true }],
  }])
  assert.equal(f.props.task.checklist[0].title, '  Child task  ', 'editing a checklist keeps incoming task props unchanged')
})

function calendarFixture(overrides = {}, stored = {}, globals = {}) {
  const scope = vue.effectScope(), emitted = [], moves = [], drafts = new Map(), dragInstances = []
  class Draggable {
    constructor(node, options) { this.node = node; this.options = options; this.destroyed = false; dragInstances.push(this) }
    destroy() { this.destroyed = true }
  }
  const Calendar = component('src/features/tasks/components/WorkCalendar.vue', {
    '@/lib/workspaceScope': { useWorkspaceDraft(key, initial) { if (!drafts.has(key)) drafts.set(key, vue.ref(key in stored ? stored[key] : initial)); return drafts.get(key) } },
    '@fullcalendar/vue3': { default: {} },
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
  assert.equal(f.state.panel.value, 'day')
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

test('calendar shows the selected-day agenda, clips cross-midnight times and excludes only tasks scheduled in this period', t => {
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
  assert.deepEqual(Array.from(f.state.backlog.value, row => row.id), ['outside', 'open'])
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
  assert.equal(f.state.backlog.value.length, 0)
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

test('dense day, backlog and agenda retain all records inside the fixed calendar frame',t=>{
 const blocks=Array.from({length:13},(_,i)=>({id:'block-'+i,title:'Block '+i,starts_at:'2026-10-21T09:00',ends_at:'2026-10-21T10:00'}))
 const deadlines=Array.from({length:4},(_,i)=>({id:'deadline-'+i,title:'Deadline '+i,due_on:'2026-10-21',status:'todo'}))
 const tasks=Array.from({length:11},(_,i)=>({id:'task-'+i,title:'Task '+i,status:'todo'}))
 const f=calendarFixture({blocks,deadlines,tasks});t.after(f.stop)
 f.state.chooseDay(new Date('2026-10-21T12:00'))
 assert.equal(f.state.dayBlocks.value.length,13);assert.equal(f.state.dayDeadlines.value.length,4)
 assert.equal(f.state.backlog.value.length,11)
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
 let calendar;const f=calendarFixture()
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
 const f=calendarFixture({blocks});f.state.period.value='dayGridMonth';let calendar
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
  f.state.options.value.drop({ draggedEl: { dataset: { dragTask: 'task' } }, date: new Date('2026-10-22T00:00'), allDay: true })
  assert.equal(f.emitted.length, 1)
  assert.equal(f.emitted[0][0], 'drop-task', 'external drop saves through its distinct action rather than opening a second scheduling flow')
  assert.equal(f.emitted[0][1].id, 'task')
  assert.equal(f.emitted[0][2].getHours(), 9)
  f.state.options.value.drop({ draggedEl: { dataset: { dragTask: 'done' } }, date: new Date('2026-10-22T10:00'), allDay: false })
  assert.equal(f.emitted.length, 1)
})

test('calendar planning panel creates and disposes its external draggable as the panel opens and closes', async t => {
  const f = calendarFixture({ tasks: [{ id: 'task', title: 'Task', estimate_minutes: 45 }] }); t.after(f.stop)
  const first = { id: 'panel-one' }, second = { id: 'panel-two' }
  f.state.dragArea.value = first
  await vue.nextTick()
  assert.equal(f.dragInstances.length, 1)
  const data = f.dragInstances[0].options.eventData({ dataset: { dragTask: 'task' } })
  assert.equal(data.title, 'Task')
  assert.equal(data.duration.minutes, 45)
  assert.equal(data.create, false, 'FullCalendar cannot create an extra local duplicate alongside the persisted block')
  f.state.dragArea.value = undefined
  await vue.nextTick()
  assert.equal(f.dragInstances[0].destroyed, true)
  f.state.dragArea.value = second
  await vue.nextTick()
  assert.equal(f.dragInstances.length, 2)
  assert.equal(f.dragInstances[1].destroyed, false)
})
