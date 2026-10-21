const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const vue = require('vue')
const { parse, compileScript } = require('@vue/compiler-sfc')

function load(source, dependencies = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require: name => dependencies[name] || require(name), console, ...globals,
  })
  return exports
}
const registry = load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'))
const navigation = load(fs.readFileSync('src/lib/workspaceSections.ts', 'utf8'), { './moduleCatalog': registry })
const copy = value => JSON.parse(JSON.stringify(value))

test('every registered module has exactly one section and keeps its catalog order', () => {
  const ids = registry.moduleCatalog.map(module => module.id)
  const groups = copy(navigation.getWorkspaceSections(ids))
  assert.deepEqual(groups.map(group => group.id), ['notes', 'planning', 'learning', 'life', 'finance'])
  assert.equal(navigation.workspaceSectionFor('pomodoro'),'notes')
  const grouped = groups.flatMap(group => group.modules)
  assert.deepEqual([...grouped].sort(), [...ids].sort())
  assert.equal(new Set(grouped).size, ids.length)
  for (const group of groups) {
    assert.deepEqual(group.modules, copy(ids.filter(id => navigation.workspaceSectionFor(id) === group.id)))
  }
  assert.equal(navigation.workspaceSectionFor('not-a-module'), undefined)
})

test('disabled and unknown modules never create navigation entries or empty sections', () => {
  const enabled = ['finance', 'quick', 'quick', 'unknown', 'tasks', 'plans']
  const original = [...enabled]
  const groups = navigation.getWorkspaceSections(enabled)
  assert.deepEqual(copy(groups.map(group => [group.id, group.modules])), [
    ['notes', ['plans', 'quick']], ['planning', ['tasks']], ['finance', ['finance']],
  ])
  assert.deepEqual(enabled, original)
  assert.deepEqual(copy(navigation.getWorkspaceSections([])), [])
  groups[0].modules.push('secure')
  assert.deepEqual(copy(navigation.getWorkspaceSections(enabled)[0].modules), ['plans', 'quick'])
})

test('category entry returns to an enabled remembered module and otherwise uses its default', () => {
  const groups = navigation.getWorkspaceSections(registry.moduleCatalog.map(module => module.id))
  const notes = groups.find(group => group.id === 'notes'), planning = groups.find(group => group.id === 'planning')
  assert.equal(navigation.chooseWorkspaceSectionModule(notes, 'quick'), 'quick')
  assert.equal(navigation.chooseWorkspaceSectionModule(notes, 'tasks'), 'plans')
  assert.equal(navigation.chooseWorkspaceSectionModule(planning), 'tasks')
  assert.equal(navigation.chooseWorkspaceSectionModule(planning, 'periodic'), 'periodic')
  assert.equal(navigation.chooseWorkspaceSectionModule(navigation.getWorkspaceSections(['periodic'])[0], 'tasks'), 'periodic')
})

function fixture({ selected = 'quick', enabled = registry.moduleCatalog.map(module => module.id), finePointer = true, savedMode = 'auto' } = {}) {
  const events = [], mounted = [], unmounted = [], listeners = new Map(), mediaListeners = new Map()
  const focus = { isConnected: true, focused: 0, focus() { this.focused++; document.activeElement = this } }
  const document = {
    activeElement: focus,
    body: { style: { overflow: 'auto' } },
    documentElement: { style: { overflow: '', scrollbarGutter: '' } },
    addEventListener(name, handler) { listeners.set(name, handler) },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name) },
  }
  const window = { matchMedia: query => ({ matches: query.includes('hover:') ? finePointer : false,
    addEventListener(name, handler) { mediaListeners.set(name, handler) },
    removeEventListener(name, handler) { if (mediaListeners.get(name) === handler) mediaListeners.delete(name) },
  }) }
  const props = vue.reactive({ modelValue: selected, enabled: [...enabled], workspaceName: 'Personal' })
  const descriptor = parse(fs.readFileSync('src/components/ui/WorkspaceRail.vue', 'utf8')).descriptor
  const component = load(compileScript(descriptor, { id: 'workspace-rail-test' }).content, {
    vue: { ...vue, onMounted: callback => mounted.push(callback), onBeforeUnmount: callback => unmounted.push(callback) },
    'vue-i18n': { useI18n: () => ({ t: key => key }) }, 'lucide-vue-next': {},
    '@/lib/workspaceSections': navigation,
    '@/lib/workspaceScope': { useWorkspaceDraft: () => vue.ref(savedMode) },
  }, { document, window })
  const scope = vue.effectScope()
  let state
  scope.run(() => { state = component.default.setup(props, { expose() {}, emit: (...args) => events.push(args) }) })
  mounted.forEach(callback => callback())
  return { state, props, events, document, focus, listeners, mediaListeners,
    close() { unmounted.forEach(callback => callback()); scope.stop() },
  }
}

test('hover keeps the active submenu; category clicks remember selection and deep links update the active section', async () => {
  const f = fixture(), s = f.state
  s.pointerEnter({ pointerType: 'mouse' })
  assert.equal(s.expanded.value, true)
  assert.equal(s.shownSection.value.id, 'notes')
  s.focusEnter({target:{}})
  assert.equal(s.shownSection.value.id,'notes','keyboard focus on another category cannot replace the active submenu')
  assert.equal(f.props.modelValue, 'quick')
  assert.deepEqual(f.events, [])
  s.selectSection(s.sections.value.find(section => section.id === 'planning'))
  assert.deepEqual(f.events.pop(), ['update:modelValue', 'tasks'])
  s.selectSection(s.sections.value.find(section => section.id === 'notes'))
  assert.deepEqual(f.events.pop(), ['update:modelValue', 'quick'])
  f.props.modelValue = 'code'
  await vue.nextTick()
  assert.equal(s.activeSection.value, 'notes')
  assert.equal(s.shownSection.value.id, 'notes')
  s.selectSection(s.sections.value.find(section => section.id === 'notes'))
  assert.deepEqual(f.events.pop(), ['update:modelValue', 'code'])
  f.props.enabled = ['detailed', 'finance']
  await vue.nextTick()
  s.selectSection(s.sections.value.find(section => section.id === 'notes'))
  assert.deepEqual(f.events.pop(), ['update:modelValue', 'detailed'])
  s.selectModule('secure')
  assert.deepEqual(f.events, [])
  f.close()
})

test('touch does not open the hover rail and group memory is isolated between mounted workspaces', () => {
  const first = fixture({ finePointer: false })
  first.state.pointerEnter({ pointerType: 'touch' })
  first.state.pointerEnter({ pointerType: 'mouse' })
  assert.equal(first.state.expanded.value, false)
  first.state.selectModule('code')
  first.close()
  const second = fixture({ selected: 'finance' })
  second.state.selectSection(second.state.sections.value.find(section => section.id === 'notes'))
  assert.deepEqual(second.events, [['update:modelValue', 'plans']])
  second.close()
})

test('outside pointer and Escape-style closing collapse the rail without changing content', () => {
  const f = fixture(), s = f.state
  const child = { matches: selector => selector === ':focus-visible' }
  s.desktop.value = { contains: target => target === child, querySelector: () => null }
  s.pointerEnter({ pointerType: 'mouse' })
  f.listeners.get('pointerdown')({ target: child })
  assert.equal(s.expanded.value, true)
  f.listeners.get('pointerdown')({ target: {} })
  assert.equal(s.expanded.value, false)
  s.focusEnter({ target: f.focus })
  assert.equal(s.expanded.value, false, 'closing must not reopen because focus stayed on the same button')
  s.focusEnter({ target: child })
  assert.equal(s.expanded.value, true)
  s.closeDesktop()
  assert.equal(s.expanded.value, false)
  assert.equal(f.props.modelValue, 'quick')
  assert.deepEqual(f.events, [])
  f.close()
  assert.equal(f.listeners.size, 0)
  assert.equal(f.mediaListeners.size, 0)
})

test('collapsed rails always preview on hover and pins preserve only the open state',()=>{
  const f=fixture({savedMode:'closed'}),s=f.state
  assert.equal(s.railMode.value,'auto','old closed preferences migrate to a hover-enabled collapsed rail')
  assert.equal(s.expanded.value,false)
  s.pointerEnter({pointerType:'mouse'})
  assert.equal(s.expanded.value,true)
  assert.equal(s.pinned.value,false,'hover previews do not set a permanent pin')
  s.togglePin();assert.equal(s.railMode.value,'open');assert.equal(s.expanded.value,true)
  assert.equal(s.pinned.value,true,'clicking while previewing pins instead of closing')
  s.pointerLeave();s.closeDesktop()
  assert.equal(s.expanded.value,true,'outside pointer and mouse leave keep a pinned rail open')
  s.closeDesktop();assert.equal(s.pinned.value,true,'Escape does not clear a saved pin')
  const next=fixture({savedMode:s.railMode.value})
  assert.equal(next.state.expanded.value,true)
  next.state.togglePin();assert.equal(next.state.railMode.value,'auto')
  assert.equal(next.state.expanded.value,false,'unpinning immediately returns to the minimal rail')
  next.state.pointerEnter({pointerType:'mouse'});assert.equal(next.state.expanded.value,true)
  next.state.pointerLeave();assert.equal(next.state.expanded.value,false)
  f.close();next.close()
})

test('mouse focus cannot hold a preview open after leaving, while keyboard focus expands without pinning', async()=>{
  const f=fixture(),s=f.state
  s.pointerEnter({pointerType:'mouse'})
  s.focusEnter({target:{matches:()=>false}})
  s.pointerLeave()
  assert.equal(s.expanded.value,false,'clicking a category must not leave the hover panel stuck open')
  const keyboardTarget={matches:selector=>selector===':focus-visible'}
  s.focusEnter({target:keyboardTarget})
  assert.equal(s.expanded.value,true)
  assert.equal(s.pinned.value,false)
  f.document.activeElement=f.focus
  s.desktop.value={contains:()=>false}
  s.focusLeave();await vue.nextTick()
  assert.equal(s.expanded.value,false)
  f.close()
})

test('keyboard users can reach each category submenu and return without changing content',async()=>{
  const f=fixture(),s=f.state
  const category={focus(){f.document.activeElement=this}},module={focus(){f.document.activeElement=this}}
  const submenu={contains:target=>target===module}
  s.desktop.value={querySelector:selector=>selector==='.rail-modules'?submenu:selector==='.rail-modules .rail-module'?module:category}
  await s.focusSectionModules(s.sections.value.find(section=>section.id==='notes'))
  assert.equal(s.expanded.value,true);assert.equal(s.shownSection.value.id,'notes')
  assert.equal(s.pinned.value,false,'keyboard submenu access must not permanently shift the page')
  assert.equal(f.document.activeElement,module)
  s.focusCategory();assert.equal(f.document.activeElement,category)
  await s.focusSectionModules(s.sections.value.find(section=>section.id==='planning'))
  assert.equal(s.shownSection.value.id,'notes','an inactive category must first be explicitly selected')
  f.props.modelValue='tasks';await vue.nextTick()
  await s.focusSectionModules(s.sections.value.find(section=>section.id==='planning'))
  assert.equal(s.shownSection.value.id,'planning')
  s.closeDesktop()
  assert.equal(f.document.activeElement,category,'Escape restores a visible control before removing the submenu')
  assert.equal(s.expanded.value,false)
  assert.equal(f.props.modelValue,'tasks');assert.deepEqual(f.events,[])
  f.close()
})

test('mobile drawer traps focus, restores scroll and focus, and footer actions close before emitting', async () => {
  const f = fixture(), s = f.state
  const controls = [0, 1, 2].map(index => ({ index, getClientRects: () => [{}], focus() { f.document.activeElement = this } }))
  let opened = 0, closed = 0
  s.drawer.value = { showModal() { opened++ }, close() { closed++ }, querySelector: () => controls[1], querySelectorAll: () => controls, contains: target => controls.includes(target) }
  await s.openMobile()
  assert.equal(opened, 1)
  assert.equal(f.document.body.style.overflow, 'hidden')
  assert.equal(f.document.activeElement, controls[1])
  f.document.activeElement = controls[2]
  let prevented = 0
  s.drawerKeys({ key: 'Tab', shiftKey: false, preventDefault() { prevented++ } })
  assert.equal(f.document.activeElement, controls[0])
  s.drawerKeys({ key: 'Tab', shiftKey: true, preventDefault() { prevented++ } })
  assert.equal(f.document.activeElement, controls[2])
  assert.equal(prevented, 2)
  s.action('search')
  assert.equal(s.mobileOpen.value, false)
  assert.equal(closed, 1)
  assert.equal(f.document.body.style.overflow, 'auto')
  assert.equal(f.document.documentElement.style.overflow, '')
  assert.equal(f.document.documentElement.style.scrollbarGutter, '')
  assert.equal(f.document.activeElement, f.focus)
  assert.deepEqual(f.events, [['search']])
  await s.openMobile()
  s.selectModule('tasks')
  assert.equal(s.mobileOpen.value, false)
  assert.deepEqual(f.events.at(-1), ['update:modelValue', 'tasks'])
  await s.openMobile()
  f.close()
  assert.equal(f.document.body.style.overflow, 'auto')
})

test('financial shortcuts navigate to existing real views and do not bypass disabled modules', () => {
  const f = fixture()
  f.state.selectFinanceView('position')
  assert.deepEqual(f.events, [['update:modelValue', 'finance'], ['navigate', 'finance', 'position']])
  f.props.enabled = ['quick']
  f.state.selectFinanceView('transaction')
  assert.equal(f.events.length, 2)
  f.close()
})

test('a failed native drawer open does not leave page scroll locked', async () => {
  const f = fixture()
  f.state.drawer.value = { showModal() { throw new Error('Not supported') }, close() {} }
  await f.state.openMobile()
  assert.equal(f.state.mobileOpen.value, false)
  assert.equal(f.document.body.style.overflow, 'auto')
  assert.equal(f.document.documentElement.style.scrollbarGutter, '')
  assert.equal(f.document.activeElement, f.focus)
  f.close()
})
