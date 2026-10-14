const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')
const vue = require('vue')

function load(source, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => dependencies[name] || (name === '@/features/finance/lib/finance' ? load(fs.readFileSync('src/features/finance/lib/finance.ts','utf8'), {}, globals) : null) || (name === '@/lib/searchNavigation' ? load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'), {vue}, globals) : null) || (name === '@/lib/storage' ? load(fs.readFileSync('src/lib/storage.ts', 'utf8'), {}, globals) : name === '@/lib/moduleCatalog' ? load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'), {}, globals) : require(name)), Date, console, ...globals })
  return exports
}
const scroll = load(fs.readFileSync('src/lib/navigationScroll.ts', 'utf8'))
const account = load(fs.readFileSync('src/lib/accountProfile.ts', 'utf8'))

test('navigation hides after downward scrolling and reappears on small upward scrolling', () => {
  const state = scroll.createNavigationScrollState(100)
  assert.equal(scroll.updateNavigationScroll(state, 110), true)
  assert.equal(scroll.updateNavigationScroll(state, 124), false)
  assert.equal(scroll.updateNavigationScroll(state, 120), false)
  assert.equal(scroll.updateNavigationScroll(state, 116), true)
})
test('navigation remains visible at the top and when its controls have keyboard focus', () => {
  const state = scroll.createNavigationScrollState(100)
  scroll.updateNavigationScroll(state, 150)
  assert.equal(scroll.updateNavigationScroll(state, 170, true), true)
  scroll.updateNavigationScroll(state, 200)
  assert.equal(scroll.updateNavigationScroll(state, 48), true)
  assert.equal(scroll.updateNavigationScroll(state, -20), true)
})
function harness(authOverride) {
  require('pinia').setActivePinia(require('pinia').createPinia())
  const listeners = new Map()
  const documentListeners = new Map()
  const intervals = new Map()
  const frames = new Map()
  let nextId = 1
  let clock = 1_800_000_000_000
  const enabled = vue.ref(['plans', 'quick', 'pomodoro'])
  const settings = vue.reactive({ isFullScreen: false, isPomodoroDocked:false, pomodoroDurations:{focus:25,shortBreak:5,longBreak:15}, async flushPreferences(){}, isModuleActive: id => enabled.value.includes(id) })
  const workspaces = vue.reactive({ loaded: true, activeId: 'one', sessionKey: 'owner:one', binding() {}, reset() {}, async load() { return true } })
  const theme = vue.reactive({ theme: 'light', initializeTheme() {}, toggleTheme() { this.theme = this.theme === 'light' ? 'dark' : 'light' } })
  const document = { title: 'Todo', activeElement: null, fonts: { ready: Promise.resolve() }, querySelector: () => null,
    addEventListener: (name, callback) => documentListeners.set(name, callback), removeEventListener: name => documentListeners.delete(name) }
  const window = { scrollY: 0, matchMedia: () => ({ matches: false }), scrollTo({ top }) { this.scrollY = top },
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) }
  const globals = { document, window, crypto: require('node:crypto').webcrypto,
    Date: class extends Date { static now() { return clock } },
    ResizeObserver: class { observe() {} disconnect() {} },
    setInterval: callback => { const id = nextId++; intervals.set(id, callback); return id }, clearInterval: id => intervals.delete(id),
    requestAnimationFrame: callback => { const id = nextId++; frames.set(id, callback); return id }, cancelAnimationFrame: id => frames.delete(id),
  }
  const placeholder = label => ({ setup: () => () => vue.h('div', label) })
  const dependencies = {
    vue: { ...vue, Transition: (props, { slots }) => vue.h(vue.BaseTransition, { ...props, onLeave(_element, done) { Promise.resolve().then(done) } }, slots) },
    'vue-i18n': { useI18n: () => ({ t: key => key, locale: vue.ref('tr') }) },
    '@/stores/auth': { useAuthStore: () => authOverride || ({ isLoading: false, isAuthenticated: true, user: { id: 'owner', email: 'user@example.com' }, async initializeAuth() {}, setupAuthListener() {} }) },
    '@/stores/settings': { useSettingsStore: () => settings }, '@/stores/theme': { useThemeStore: () => theme },
    '@/stores/workspaces': { useWorkspacesStore: () => workspaces },
    '@/stores/sharing': { useSharingStore: () => ({ start() {}, stop() {} }) },
    '@/components/SharingDialog.vue': { default: placeholder('Sharing') },
    '@/stores/ui': { useUIStore: () => ({ resolveConfirm() {}, async showConfirm() { return false }, addToast() {} }) },
    '@/lib/navigationScroll': scroll, '@/lib/workspaceReminders': { startWorkspaceReminders: () => () => {} },
    '@/lib/accountProfile': account,
    '@/features/analytics/lib/focusService': { focusJournal: () => undefined },
    '@/lib/supabase': { supabase: { rpc: async () => ({error:{code:'PGRST202'}}) } },
    '@/views/AnalyticsView.vue': { default: placeholder('Analytics') },
    '@/views/DashboardHome.vue': { default: placeholder('Home') }, '@/views/WorkspaceCustomizer.vue': { default: placeholder('Settings') },
    '@/components/ui/WorkspaceSearch.vue': { default: placeholder('Search') },
    '@/views/WorkspaceTabs.vue': { default: placeholder('Workspace') }, '@/views/LoginSignup.vue': { default: placeholder('Login') },
    '@/components/ui/ToastContainer.vue': { default: placeholder('Toasts') }, '@/components/ui/ConfirmModal.vue': { default: placeholder('Confirm') },
  }
  function component(path, inlineTemplate = true) {
    const descriptor = parse(fs.readFileSync(path, 'utf8')).descriptor
    return load(compileScript(descriptor, { id: path, inlineTemplate }).content, dependencies, globals).default
  }
  dependencies['@/features/pomodoro/stores/pomodoro'] = load(fs.readFileSync('src/features/pomodoro/stores/pomodoro.ts', 'utf8'), dependencies, globals)
  dependencies['@/components/ui/AppNavigation.vue'] = { default: component('src/components/ui/AppNavigation.vue') }
  dependencies['@/components/ui/UserProfileMenu.vue'] = { default: component('src/components/ui/UserProfileMenu.vue') }
  dependencies['@/features/pomodoro/components/PomodoroTimer.vue'] = { default: component('src/features/pomodoro/components/PomodoroTimer.vue') }
  const host = tag => ({ tag, tagName: tag.toUpperCase(), children: [], props: {}, parent: null, style: {}, offsetLeft: 4, offsetWidth: 80,
    addEventListener() {}, removeEventListener() {},
    getRootNode() { return document },
    focus() {}, select() {}, showModal() { this.open = true }, close() { this.open = false }, querySelector() { return null } })
  const renderer = vue.createRenderer({
    createElement: host, createText: text => ({ ...host('text'), text }), createComment: text => ({ ...host('comment'), text }),
    insert(node, parent, anchor) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index >= 0) parent.children.splice(index, 0, node); else parent.children.push(node)
      node.parent = parent
    },
    remove(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null },
    setText(node, text) { node.text = text }, setElementText(node, text) { node.text = text; node.children = [] },
    patchProp(node, key, previous, next) { node.props[key] = next; if (key === 'style') Object.assign(node.style, next) },
    parentNode: node => node?.parent, nextSibling: node => node?.parent?.children[node.parent.children.indexOf(node) + 1],
  })
  const root = host('root')
  function nodes(node = root) { return [node, ...node.children.flatMap(child => nodes(child))] }
  const find = predicate => nodes().find(predicate)
  const text = node => String(node?.text || '') + (node?.children || []).map(text).join('')
  const click = node => { assert.ok(node, 'interactive node exists'); node.props.onClick?.({}) }
  return { root, renderer, component, dependencies, globals, enabled, intervals, documentListeners, listeners, window, find, text, click,
    advance(ms) { clock += ms; for (const callback of intervals.values()) callback() },
    scrollTo(y) { window.scrollY = y; listeners.get('scroll')?.(); for (const [id, callback] of frames) { frames.delete(id); callback() } },
  }
}
async function settle() { await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }

test('login stays mounted during submission and displays errors instead of resetting the form',async()=>{
  const previousDocument=global.Document,previousShadowRoot=global.ShadowRoot
  global.Document=class Document {};global.ShadowRoot=class ShadowRoot {}
  let release
  const gate=new Promise(resolve=>release=resolve)
  const auth=vue.reactive({isLoading:false,isAuthenticated:false,user:null,async initializeAuth(){},setupAuthListener(){},
    async login(){this.isLoading=true;await gate;this.isLoading=false;return {success:false,message:'Session could not be saved'}}})
  const h=harness(auth)
  h.dependencies['@/views/LoginSignup.vue']={default:h.component('src/views/LoginSignup.vue')}
  const app=h.renderer.createApp(h.component('src/App.vue'));app.config.globalProperties.$t=key=>key;app.mount(h.root)
  try{
    await settle()
    const email=h.find(node=>node.props.id==='email'),password=h.find(node=>node.props.id==='password')
    email.props['onUpdate:modelValue']('user@example.test');password.props['onUpdate:modelValue']('test-only-password')
    h.find(node=>node.tag==='form').props.onSubmit({preventDefault(){}})
    await settle()
    assert.ok(h.find(node=>node.props.id==='email')===email,'the pending form must keep its component and feedback')
    assert.equal(h.find(node=>node.props.type==='submit').props.disabled,true)
    release();await settle()
    assert.ok(h.text(h.root).includes('Session could not be saved'))
    assert.equal(h.find(node=>node.props.id==='email').value,'user@example.test')
  }finally{release();await settle();app.unmount();global.Document=previousDocument;global.ShadowRoot=previousShadowRoot}
})

test('successful login opens the workspace and logout permits a second login without a page reload',async()=>{
  const previousDocument=global.Document,previousShadowRoot=global.ShadowRoot
  global.Document=class Document {};global.ShadowRoot=class ShadowRoot {}
  const auth=vue.reactive({isLoading:false,user:null,get isAuthenticated(){return Boolean(this.user)},async initializeAuth(){},setupAuthListener(){},
    async login(){this.isLoading=true;await Promise.resolve();this.user={id:'owner',email:'user@example.test'};this.isLoading=false;return {success:true}},
    async logout(){this.user=null;return {success:true}}})
  const h=harness(auth),workspaces=h.dependencies['@/stores/workspaces'].useWorkspacesStore()
  let loads=0
  workspaces.reset=function(){this.loaded=false;this.activeId=''}
  workspaces.load=async function(){loads++;this.activeId='one';this.loaded=true;return true}
  h.dependencies['@/views/LoginSignup.vue']={default:h.component('src/views/LoginSignup.vue')}
  const app=h.renderer.createApp(h.component('src/App.vue'));app.config.globalProperties.$t=key=>key;app.mount(h.root)
  try{
    await settle()
    for(let attempt=0;attempt<2;attempt++){
      assert.ok(h.find(node=>node.props.id==='email'))
      h.find(node=>node.props.id==='email').props['onUpdate:modelValue']('user@example.test')
      h.find(node=>node.props.id==='password').props['onUpdate:modelValue']('test-only-password')
      h.find(node=>node.tag==='form').props.onSubmit({preventDefault(){}})
      await settle()
      assert.ok(h.find(node=>node.text==='Workspace'),'valid authentication opens application content')
      assert.equal(h.find(node=>node.props.id==='email'),undefined)
      assert.equal(loads,attempt+1)
      await auth.logout();await settle()
    }
  }finally{app.unmount();global.Document=previousDocument;global.ShadowRoot=previousShadowRoot}
})

test('global profile menu replaces header actions and opens account editing from every main view',async()=>{
  const h=harness()
  const app=h.renderer.createApp(h.component('src/App.vue'))
  app.config.globalProperties.$t=key=>key
  app.mount(h.root)
  await settle()
  assert.ok(h.find(node=>node.props['data-user-profile']!==undefined))
  assert.equal(h.find(node=>node.props['data-app-navigation']!==undefined).children.some(node=>node.props['aria-label']==='app.signOut'),false)
  h.click(h.find(node=>node.props['aria-label']==='account.menuLabel'))
  await settle()
  assert.ok(h.find(node=>node.props.role==='menu'))
  h.click(h.find(node=>node.props.role==='menuitem'&&h.text(node)==='account.editProfile'))
  await settle()
  assert.ok(h.find(node=>node.text==='Settings'))
  assert.equal(h.find(node=>node.props.role==='menu'),undefined)
  h.click(h.find(node=>node.props['aria-label']==='app.home'))
  await settle()
  assert.ok(h.find(node=>node.text==='Home'))
  assert.ok(h.find(node=>node.props['data-user-profile']!==undefined))
  h.click(h.find(node=>node.props['aria-label']==='app.workspace'))
  await settle()
  h.click(h.find(node=>node.props['aria-label']==='pomodoro.expandToNavbar'))
  await settle()
  assert.equal(h.find(node=>node.props['data-user-profile']!==undefined).props.style.top,'.5rem')
  const profileTrigger=h.find(node=>node.props['aria-label']==='account.menuLabel')
  h.click(profileTrigger)
  await settle()
  h.click(h.find(node=>node.props.role==='menuitem'&&h.text(node)==='app.signOut'))
  await settle()
  assert.equal(h.find(node=>node.props.role==='menu'),undefined)
  app.unmount()
  assert.equal(h.documentListeners.size,0)
})

test('Pomodoro dock keeps main navigation available, shares scroll visibility and continues across views', async () => {
  const h = harness()
  const app = h.renderer.createApp(h.component('src/App.vue'))
  app.config.globalProperties.$t = key => key
  app.mount(h.root)
  await settle()
  h.click(h.find(node => node.tag === 'button' && h.text(node) === 'pomodoro.start'))
  await settle()
  assert.equal(h.intervals.size, 1)
  h.advance(5_000)
  await settle()
  h.click(h.find(node => node.props['aria-label'] === 'pomodoro.expandToNavbar'))
  await settle()
  assert.ok(h.find(node => node.props['data-pomodoro-navigation'] !== undefined))
  assert.ok(h.find(node => node.props['data-app-navigation'] !== undefined))
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.style.top, '.4375rem')
  const dock = h.find(node => node.props['data-pomodoro-navigation'] !== undefined)
  const left = h.find(node => node.props['data-pomodoro-left'] !== undefined)
  assert.equal(h.find(node => node.props['data-pomodoro-modes'] !== undefined).parent, left)
  assert.ok(h.find(node => node.props['aria-label'] === 'pomodoro.clickSetup').parent.parent.parent === left)
  assert.ok(dock.children[0].props.class.includes('h-14'))

  h.click(h.find(node => node.props['aria-label'] === 'app.settings'))
  await settle()
  assert.ok(h.find(node => node.text === 'Settings'))
  assert.equal(h.intervals.size, 1)
  h.advance(5_000)
  await settle()
  assert.ok(h.find(node => node.tag === 'button' && h.text(node) === '24:50'))
  h.click(h.find(node => node.props['aria-label'] === 'app.analytics'))
  await settle()
  assert.ok(h.find(node => node.text === 'Analytics'))
  assert.equal(h.intervals.size,1,'the timer keeps running on the analytics view')

  h.scrollTo(300)
  await settle()
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.inert, true)
  assert.equal(h.find(node => node.props['data-pomodoro-navigation'] !== undefined).props.inert, true)
  h.scrollTo(290)
  await settle()
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.inert, false)
  assert.equal(h.find(node => node.props['data-pomodoro-navigation'] !== undefined).props.inert, false)

  h.click(h.find(node => node.props['aria-label'] === 'app.home'))
  await settle()
  assert.ok(h.find(node => node.text === 'Home'))
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.style.top, '.4375rem', 'an active timer stays in the dock on Home')
  h.click(h.find(node => node.props['aria-label'] === 'pomodoro.collapse'))
  await settle()
  assert.ok(h.find(node=>node.text==='Workspace'),'restoring the timer card returns to its workspace surface')
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.style.top, '1.5rem')
  assert.equal(h.intervals.size, 1)
  app.unmount()
  assert.equal(h.intervals.size, 0)
  assert.equal(h.documentListeners.size, 0)
  assert.equal(h.listeners.size, 0)
})

test('disabling Pomodoro while docked restores the regular navigation layout', async () => {
  const h = harness()
  const app = h.renderer.createApp(h.component('src/App.vue'))
  app.config.globalProperties.$t = key => key
  app.mount(h.root)
  await settle()
  h.click(h.find(node => node.props['aria-label'] === 'pomodoro.expandToNavbar'))
  await settle()
  h.enabled.value = ['plans', 'quick']
  await settle()
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.style.top, '1.5rem')
  assert.equal(h.find(node => node.props['data-pomodoro-navigation'] !== undefined), undefined)
  app.unmount()
})

test('compact dock controls can change session, start, reset and restore the timer card', async () => {
  const h = harness()
  const app = h.renderer.createApp(h.component('src/App.vue'))
  app.config.globalProperties.$t = key => key
  app.mount(h.root)
  await settle()
  h.click(h.find(node => node.props['aria-label'] === 'pomodoro.expandToNavbar'))
  await settle()
  const menu = h.find(node => node.props.id === 'pomodoro-dock-controls')
  const menuButton = label => {
    const visit = node => node.tag === 'button' && h.text(node).includes(label) ? node : node.children.map(visit).find(Boolean)
    return visit(menu)
  }
  let closed = 0
  menu.hidePopover = () => closed++
  h.click(menuButton('pomodoro.shortBreak'))
  await settle()
  assert.ok(h.find(node => node.tag === 'button' && h.text(node) === '05:00'))
  h.click(menuButton('pomodoro.start'))
  h.advance(5_000)
  await settle()
  assert.ok(menuButton('pomodoro.pause'))
  assert.ok(h.find(node => node.tag === 'button' && h.text(node) === '04:55'))
  h.click(menuButton('pomodoro.reset'))
  await settle()
  assert.equal(h.intervals.size, 0)
  assert.ok(h.find(node => node.tag === 'button' && h.text(node) === '05:00'))
  h.click(menuButton('pomodoro.collapse'))
  await settle()
  assert.equal(closed, 4)
  assert.equal(h.find(node => node.props['data-pomodoro-navigation'] !== undefined), undefined)
  assert.ok(h.find(node => node.props['aria-label'] === 'pomodoro.expandToNavbar'))
  app.unmount()
})

test('content search chooses only enabled safe modules and passes the specific destination without starting a timer', async () => {
  const h = harness()
  h.dependencies['@/lib/workspaceScope'] = { useWorkspaceDraft: (key, value) => vue.ref(value) }
  h.dependencies['@/components/ui/WorkspaceTabStrip.vue'] = { default: {} }
  h.dependencies['@/components/ui/WorkspacePicker.vue'] = { default: {} }
  h.dependencies['@/components/ui/WorkspaceModulePane.vue'] = { default: {} }
  h.dependencies['@/components/ui/WorkspaceModuleFeedback.vue'] = { default: {} }
  const component = h.component('src/views/WorkspaceTabs.vue', false)
  let state, opened = 0
  const app = h.renderer.createApp({ setup() { state = component.setup({}, { expose() {}, emit() {} });return () => vue.h('div') } })
  app.mount(h.root)
  state.contentSearch.value = { open() { opened++ },close() {} }
  await state.openTabSearch();assert.equal(opened, 1)
  state.selectSearchHit({module:'secure',record_id:'secret',child_id:null});assert.equal(state.activeTab.value,'plans')
  state.selectSearchHit({module:'detailed',record_id:'disabled',child_id:null});assert.equal(state.activeTab.value,'plans')
  state.selectSearchHit({module:'quick',record_id:'specific-note',child_id:null,title:'Note',preview:'',meta:{}})
  assert.equal(state.activeTab.value,'quick');assert.equal(state.destination.value.record_id,'specific-note')
  assert.equal(h.intervals.size,0)
  h.dependencies['@/stores/workspaces'].useWorkspacesStore().sessionKey='other';await settle()
  assert.equal(state.destination.value,null)
  app.unmount();assert.equal(h.listeners.size,0)
})

test('module transitions retain each tab instance and its unsaved local state', async () => {
  const h = harness()
  const drafts = new Map()
  const mounted = { plans: 0, quick: 0 }
  h.dependencies['@/lib/workspaceScope'] = { useWorkspaceDraft: (key, value) => { const draft = vue.ref(value); drafts.set(key, draft); return draft } }
  h.dependencies['@/components/ui/WorkspaceTabStrip.vue'] = { default: { setup: () => () => vue.h('div') } }
  h.dependencies['@/components/ui/WorkspacePicker.vue'] = { default: { setup: () => () => vue.h('div') } }
  h.dependencies['@/components/ui/WorkspaceModulePane.vue'] = { default: h.component('src/components/ui/WorkspaceModulePane.vue') }
  h.dependencies['@/components/ui/WorkspaceModuleFeedback.vue'] = { default: { setup: () => () => vue.h('div', 'Loading') } }
  for (const [id, path] of [['plans', '@/features/plans/components/Plans.vue'], ['quick', '@/features/quick_notes/components/QuickNotes.vue']]) {
    h.dependencies[path] = { default: { setup() {
      mounted[id]++
      const value = vue.ref('draft')
      return () => vue.h('div', [vue.h('button', { onClick: () => { value.value = 'edited' } }, `Edit ${id}`), vue.h('span', `${id}:${value.value}`)])
    } } }
  }
  const app = h.renderer.createApp(h.component('src/views/WorkspaceTabs.vue'))
  app.mount(h.root)
  await settle()
  h.click(h.find(node => node.tag === 'button' && h.text(node) === 'Edit plans'))
  await settle()
  drafts.get('last-tab').value = 'quick'
  await settle()
  await settle()
  assert.ok(h.find(node => node.text === 'quick:draft'))
  drafts.get('last-tab').value = 'plans'
  await settle()
  await settle()
  assert.ok(h.find(node => node.text === 'plans:edited'))
  assert.deepEqual(mounted, { plans: 1, quick: 1 })
  app.unmount()
})
