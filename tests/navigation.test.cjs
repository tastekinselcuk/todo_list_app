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
  vm.runInNewContext(code, { exports, require: name => dependencies[name] || (name === '@/lib/utils' ? load(fs.readFileSync('src/lib/utils.ts','utf8'), {}, globals) : null) || (['@/lib/workspaceTrash','./workspaceTrash'].includes(name) ? load(fs.readFileSync('src/lib/workspaceTrash.ts','utf8'), {'./supabase':dependencies['./supabase']||dependencies['@/lib/supabase']||{supabase:{}}}, globals) : null) || (name === '@/features/finance/lib/finance' ? load(fs.readFileSync('src/features/finance/lib/finance.ts','utf8'), {}, globals) : null) || (name === '@/lib/searchNavigation' ? load(fs.readFileSync('src/lib/searchNavigation.ts','utf8'), {vue}, globals) : null) || (name === '@/lib/storage' ? load(fs.readFileSync('src/lib/storage.ts', 'utf8'), {}, globals) : name === '@/lib/moduleCatalog' ? load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'), {}, globals) : require(name)), Date, console, ...globals })
  return exports
}
const scroll = load(fs.readFileSync('src/lib/navigationScroll.ts', 'utf8'))
const account = load(fs.readFileSync('src/lib/accountProfile.ts', 'utf8'))
const moduleCatalog = load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'))
const workspaceSections = load(fs.readFileSync('src/lib/workspaceSections.ts', 'utf8'), { './moduleCatalog': moduleCatalog })
const workspaceNavigation = load(fs.readFileSync('src/lib/workspaceNavigation.ts', 'utf8'))
const focusEnvironment = load(fs.readFileSync('src/features/pomodoro/lib/focusEnvironment.ts', 'utf8'))

test('navigation hides after downward scrolling and reappears on small upward scrolling', () => {
  const state = scroll.createNavigationScrollState(100)
  assert.equal(scroll.updateNavigationScroll(state, 110), true)
  assert.equal(scroll.updateNavigationScroll(state, 124), false)
  assert.equal(scroll.updateNavigationScroll(state, 120), false)
  assert.equal(scroll.updateNavigationScroll(state, 116), true)
})
test('workspace navigation ignores short scroll reversals and reveals after deliberate upward travel', () => {
  const state=scroll.createNavigationScrollState(500)
  const distances={reveal:40,hide:56}
  assert.equal(scroll.updateNavigationScroll(state,560,false,distances),false)
  for(const y of [552,560,550,558,548,556]) {
    assert.equal(scroll.updateNavigationScroll(state,y,false,distances),false)
  }
  assert.equal(scroll.updateNavigationScroll(state,516,false,distances),true)
  for(const y of [524,516,526,518]) {
    assert.equal(scroll.updateNavigationScroll(state,y,false,distances),true)
  }
  assert.equal(scroll.updateNavigationScroll(state,578,false,distances),false)
  assert.equal(scroll.updateNavigationScroll(state,576,true,distances),true)
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
    '@/stores/ui': { useUIStore: () => ({ clearUndoToasts() {}, resolveConfirm() {}, async showConfirm() { return false }, addToast() {} }) },
    '@/lib/workspaceScroll': { createWorkspaceScroll: () => ({refresh(){},reset(){},settle(){},reveal(){},dispose(){}}) },
    '@/lib/navigationScroll': scroll, '@/lib/workspaceReminders': { startWorkspaceReminders: () => () => {} },
    '@/lib/accountProfile': account,
    '@/lib/workspaceSections': workspaceSections, '@/lib/workspaceNavigation': workspaceNavigation,
    '@/features/analytics/lib/focusService': { focusJournal: () => undefined },
    '@/lib/supabase': { supabase: { rpc: async () => ({error:{code:'PGRST202'}}) } },
    '@/views/AnalyticsView.vue': { default: placeholder('Analytics') },
    '@/views/DashboardHome.vue': { default: placeholder('Home') }, '@/views/WorkspaceCustomizer.vue': { default: placeholder('Settings') },
    '@/components/ui/WorkspaceSearch.vue': { default: placeholder('Search') },
    '@/components/ui/WorkspaceRail.vue': { default: placeholder('Workspace rail') },
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
  dependencies['./PomodoroViewIcon.vue'] = { default: component('src/features/pomodoro/components/PomodoroViewIcon.vue') }
  dependencies['../lib/focusEnvironment'] = focusEnvironment
  dependencies['./PomodoroFocus.vue'] = { default: component('src/features/pomodoro/components/PomodoroFocus.vue') }
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

test('workspace changes carry an enabled module and calendar view, otherwise defer to the destination preference',async()=>{
 const h=harness(),spaces=h.dependencies['@/stores/workspaces'].useWorkspacesStore()
 h.enabled.value=['plans','quick','tasks']
 spaces.available=[{id:'one',active_modules:['plans','quick','tasks']},{id:'two',active_modules:['plans','tasks']},{id:'three',active_modules:['quick']}]
 let emitPanel;const mounted=[]
 h.dependencies['@/views/WorkspaceTabs.vue']={default:{props:['initialTab','initialView'],emits:['active-module','active-view'],setup(props,{emit}){
  mounted.push({module:props.initialTab,view:props.initialView});emitPanel=emit
  return()=>vue.h('div','Workspace')
 }}}
 const app=h.renderer.createApp(h.component('src/App.vue'));app.config.globalProperties.$t=key=>key
 try{
  app.mount(h.root);await settle()
  emitPanel('active-module','tasks');emitPanel('active-view','tasks','calendar');await settle()
  spaces.activeId='two';spaces.sessionKey='owner:two';await settle()
  assert.deepEqual(mounted.at(-1),{module:'tasks',view:'calendar'})
  emitPanel('active-module','tasks');await settle()
  spaces.sessionKey='owner:two:bindings-refreshed';await settle()
  assert.equal(mounted.at(-1).view,'calendar','binding refresh cannot drop the incoming view before its async module has consumed it')
  emitPanel('active-module','tasks');emitPanel('active-view','tasks','board');await settle()
  spaces.activeId='one';spaces.sessionKey='owner:one';await settle()
  assert.deepEqual(mounted.at(-1),{module:'tasks',view:'board'})
  emitPanel('active-module','tasks');emitPanel('active-view','tasks','calendar');await settle()
  spaces.activeId='three';spaces.sessionKey='owner:three';await settle()
  assert.deepEqual(mounted.at(-1),{module:undefined,view:undefined},'the destination restores its own saved module when the current one is unavailable')
  emitPanel('active-module','quick');await settle()
  spaces.activeId='one';spaces.sessionKey='owner:one';await settle()
  assert.deepEqual(mounted.at(-1),{module:'quick',view:undefined},'calendar state must not leak into another module')
 }finally{app.unmount()}
})

test('calendar and settings use compact upper spacing while the other pages keep their existing layout',async()=>{
 const h=harness();h.enabled.value=['plans','tasks','pomodoro'];let emitPanel
 h.dependencies['@/views/WorkspaceTabs.vue']={default:{emits:['active-module','active-view'],setup(_props,{emit}){emitPanel=emit;return()=>vue.h('div','Workspace')}}}
 const app=h.renderer.createApp(h.component('src/App.vue'));app.config.globalProperties.$t=key=>key
 const content=()=>h.find(node=>String(node.props.class||'').split(' ').includes('app-content'))
 try{
  app.mount(h.root);await settle();assert.equal(content().style.paddingTop,'7rem')
  emitPanel('active-module','tasks');emitPanel('active-view','tasks','calendar');await settle()
  assert.equal(content().style.paddingTop,'5.25rem')
  emitPanel('active-view','tasks','list');await settle();assert.equal(content().style.paddingTop,'7rem')
  emitPanel('active-module','plans');await settle();assert.equal(content().style.paddingTop,'7rem')
  h.click(h.find(node=>node.props['aria-label']==='app.settings'));await settle();assert.equal(content().style.paddingTop,'5.25rem')
  h.click(h.find(node=>node.props['aria-label']==='app.home'));await settle();assert.equal(content().style.paddingTop,'7rem')
 }finally{app.unmount()}
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
  assert.ok(h.find(node=>node.props['data-user-profile']!==undefined).props.class.includes('profile-embedded'),'profile shares the dock layout instead of floating over it')
  const profileTrigger=h.find(node=>node.props['aria-label']==='account.menuLabel')
  h.click(profileTrigger)
  await settle()
  h.click(h.find(node=>node.props.role==='menuitem'&&h.text(node)==='app.signOut'))
  await settle()
  assert.equal(h.find(node=>node.props.role==='menu'),undefined)
  app.unmount()
  assert.equal(h.documentListeners.size,0)
})

test('attached navigation, profile and timer use the workspace reservation without a gap during reveal and hide', async () => {
  const h=harness(),height=scroll.workspaceHeaderHeight
  let panelProps,emitPanel
  h.dependencies['@/views/WorkspaceTabs.vue']={default:{props:['headerInset'],emits:['pinned','header-offset'],setup(props,{emit}){
    panelProps=props;emitPanel=emit
    return()=>vue.h('div','Workspace')
  }}}
  const app=h.renderer.createApp(h.component('src/App.vue'));app.config.globalProperties.$t=key=>key;app.mount(h.root)
  try {
    await settle()
    assert.equal(panelProps.headerInset,height)
    emitPanel('pinned',true)
    for(const offset of [height,30,8,0,15,height]) {
      emitPanel('header-offset',offset);await settle()
      const nav=h.find(node=>node.props['data-app-navigation']!==undefined)
      assert.equal(parseFloat(nav.style.top)+parseFloat(nav.style.height),offset,'the navigation bottom must follow the exact same animated value as the workspace top')
      const profile=h.find(node=>node.props['data-user-profile']!==undefined)
      assert.equal(parseFloat(profile.style.top)+20,offset-height/2,'profile stays centered in the shared row')
    }
    assert.equal(h.find(node=>String(node.props.class||'').includes('workspace-header-surface')),undefined,'revealing navigation must not paint an extra full-screen white strip')
    h.scrollTo(620);await settle()
    assert.equal(panelProps.headerInset,0)
    h.scrollTo(560);await settle()
    assert.equal(panelProps.headerInset,height)
    h.dependencies['@/stores/settings'].useSettingsStore().isPomodoroDocked=true;await settle()
    emitPanel('header-offset',height);await settle()
    const dock=h.find(node=>node.props['data-pomodoro-navigation']!==undefined)
    assert.equal(parseFloat(dock.style.top)+parseFloat(dock.style.height),height,'the entire dock including its border fits the same compact reservation')
    assert.equal(h.intervals.size,0,'changing navigation geometry must not start a timer')
  } finally {app.unmount()}
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
  assert.ok(h.find(node => node.props['data-app-navigation'] !== undefined).props.class.includes('is-embedded'))
  const dock = h.find(node => node.props['data-pomodoro-navigation'] !== undefined)
  const left = h.find(node => node.props['data-pomodoro-left'] !== undefined)
  assert.equal(h.find(node => node.props['data-pomodoro-modes'] !== undefined).parent, left)
  assert.ok(h.find(node => node.props['aria-label'] === 'pomodoro.clickSetup').parent.parent.parent === left)
  assert.equal(dock.style.height,scroll.workspaceHeaderHeight+'px')
  const inDock=node=>{while(node){if(node===dock)return true;node=node.parent}return false}
  assert.equal(inDock(h.find(node=>node.props['data-app-navigation']!==undefined)),true,'navigation occupies the dock’s center column')
  assert.equal(inDock(h.find(node=>node.props['data-user-profile']!==undefined)),true,'profile occupies the dock’s right column')

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
  assert.ok(h.find(node => node.props['data-app-navigation'] !== undefined).props.class.includes('is-embedded'), 'an active timer stays in the dock on Home')
  h.click(h.find(node => node.props['aria-label'] === 'pomodoro.collapse'))
  await settle()
  assert.ok(h.find(node=>node.text==='Workspace'),'restoring the timer card returns to its workspace surface')
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.style.top, '14px')
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
  assert.equal(h.find(node => node.props['data-app-navigation'] !== undefined).props.style.top, '14px')
  assert.equal(h.find(node => node.props['data-pomodoro-navigation'] !== undefined), undefined)
  app.unmount()
})

test('grouped workspace hides the idle timer outside notes and preserves a running timer through calendar and finance', async () => {
  const h=harness()
  h.enabled.value=['plans','quick','tasks','finance','pomodoro']
  let workspaceEvents
  h.dependencies['@/views/WorkspaceTabs.vue']={default:{emits:['active-module'],setup(_props,{emit}){workspaceEvents=emit;return()=>vue.h('div','Workspace')}}}
  const app=h.renderer.createApp(h.component('src/App.vue'))
  app.config.globalProperties.$t=key=>key
  app.mount(h.root)
  const timerHost=()=>h.find(node=>String(node.props.class||'').split(' ').includes('pomodoro-host'))
  const navigation=()=>h.find(node=>node.props['data-app-navigation']!==undefined)
  try {
    await settle()
    assert.notEqual(timerHost().style.display,'none','the notes surface retains the familiar timer card')
    for(const module of ['tasks','finance']) {
      workspaceEvents('active-module',module);await settle()
      assert.equal(timerHost().style.display,'none',`idle Pomodoro does not crowd ${module}`)
      assert.equal(h.find(node=>node.props['data-pomodoro-navigation']!==undefined),undefined)
      assert.equal(navigation().props.style.top,'14px')
      assert.equal(h.intervals.size,0,'opening another group cannot start a timer')
    }
    workspaceEvents('active-module','quick');await settle()
    assert.notEqual(timerHost().style.display,'none')
    const timer= h.dependencies['@/features/pomodoro/stores/pomodoro'].usePomodoroStore()
    h.click(h.find(node=>node.tag==='button'&&h.text(node)==='pomodoro.start'))
    await settle();h.advance(5_000);await settle()
    assert.equal(timer.timeLeft,1495);assert.equal(h.intervals.size,1)
    for(const module of ['tasks','finance']) {
      workspaceEvents('active-module',module);await settle()
      assert.ok(h.find(node=>node.props['data-pomodoro-navigation']!==undefined),'active focus remains reachable as a compact dock')
      assert.ok(navigation().props.class.includes('is-embedded'))
      assert.equal(h.intervals.size,1,'section navigation preserves the single running clock')
      h.advance(5_000);await settle()
    }
    assert.equal(timer.timeLeft,1485)
    workspaceEvents('active-module','plans');await settle()
    assert.equal(h.find(node=>node.props['data-pomodoro-navigation']!==undefined),undefined)
    assert.notEqual(timerHost().style.display,'none')
    assert.equal(navigation().props.style.top,'14px')
    assert.equal(timer.timeLeft,1485);assert.equal(timer.isRunning,true)
    assert.equal(h.intervals.size,1)
  } finally { app.unmount() }
  assert.equal(h.intervals.size,0);assert.equal(h.documentListeners.size,0);assert.equal(h.listeners.size,0)
})

test('a paused break remains reachable outside notes and reset removes only the idle dock',async()=>{
  const h=harness()
  h.enabled.value=['plans','tasks','finance','pomodoro']
  let workspaceEvents
  h.dependencies['@/views/WorkspaceTabs.vue']={default:{emits:['active-module'],setup(_props,{emit}){workspaceEvents=emit;return()=>vue.h('div','Workspace')}}}
  const app=h.renderer.createApp(h.component('src/App.vue'))
  app.config.globalProperties.$t=key=>key
  app.mount(h.root)
  try {
    await settle()
    const timer=h.dependencies['@/features/pomodoro/stores/pomodoro'].usePomodoroStore()
    await timer.setMode('shortBreak');await timer.startTimer()
    h.advance(5_000);await settle()
    workspaceEvents('active-module','finance');await settle()
    timer.pauseTimer();await settle()
    assert.equal(timer.timeLeft,295);assert.equal(timer.isRunning,false)
    assert.ok(h.find(node=>node.props['data-pomodoro-navigation']!==undefined),'pausing a break cannot hide its resume control')
    h.click(h.find(node=>node.tag==='button'&&h.text(node)==='pomodoro.start'))
    await settle();h.advance(5_000);await settle()
    assert.equal(timer.timeLeft,290);assert.equal(timer.isRunning,true)
    await timer.resetTimer();await settle()
    assert.equal(timer.timeLeft,300);assert.equal(timer.isRunning,false)
    assert.equal(h.find(node=>node.props['data-pomodoro-navigation']!==undefined),undefined)
    assert.equal(h.intervals.size,0)
  } finally { app.unmount() }
})

test('toast notifications stay above the most recently opened modal and return to the page when it closes',async()=>{
  class FakeElement { constructor(){this.isConnected=true}matches(){return false}querySelector(){return null} }
  class FakeDialog extends FakeElement { constructor(){super();this.open=false}matches(selector){return selector===':modal' && this.open} }
  const first=new FakeDialog(),second=new FakeDialog(),body=new FakeElement()
  const document={body,querySelectorAll:()=>[first,second].filter(dialog=>dialog.open)}
  let callback,disconnected=false
  class Observer { constructor(cb){callback=cb}observe(){}disconnect(){disconnected=true} }
  const ui=vue.reactive({toasts:[]})
  const descriptor=parse(fs.readFileSync('src/components/ui/ToastContainer.vue','utf8')).descriptor
  const component=load(compileScript(descriptor,{id:'toast-layers'}).content,{
    '@/stores/ui':{useUIStore:()=>ui},'vue-i18n':{useI18n:()=>({t:key=>key})},
  },{document,Element:FakeElement,HTMLDialogElement:FakeDialog,MutationObserver:Observer}).default
  let state
  const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  const app=renderer.createApp({setup(){state=component.setup({}, {expose(){}});return()=>vue.h('div')}})
  app.mount({})
  const host={isConnected:true,open:false,shown:0,matches(){return this.open},showPopover(){this.open=true;this.shown++},hidePopover(){this.open=false}}
  state.toastHost.value=host;state.supportsPopover.value=true
  const settle=async()=>{await vue.nextTick();await vue.nextTick()}
  try{
    ui.toasts.push({id:'one',message:'Wrong password',type:'error'});await settle()
    assert.equal(host.open,true)
    second.open=true;callback([{type:'attributes',target:second}]);await settle()
    assert.equal(vue.toRaw(state.toastTarget.value),second)
    first.open=true;callback([{type:'attributes',target:first}]);await settle()
    assert.equal(vue.toRaw(state.toastTarget.value),first,'opening order must take precedence over DOM order')
    first.open=false;callback([{type:'attributes',target:first}]);await settle()
    assert.equal(vue.toRaw(state.toastTarget.value),second)
    second.open=false;callback([{type:'attributes',target:second}]);await settle()
    assert.equal(vue.toRaw(state.toastTarget.value),body)
    assert.ok(host.shown>=4,'existing toasts are promoted again as modal layers change')
    ui.toasts=[];await settle();state.hideWhenEmpty();assert.equal(host.open,false)
  }finally{app.unmount()}
  assert.equal(disconnected,true)
})

test('workspace management, profile editing and Settings navigation open the correct sidebar section',async()=>{
  const h=harness()
  let workspaceEvents,settingsProps
  h.dependencies['@/views/WorkspaceTabs.vue']={default:{emits:['manage-workspaces'],setup(_props,{emit}){workspaceEvents=emit;return()=>vue.h('div','Workspace')}}}
  h.dependencies['@/views/WorkspaceCustomizer.vue']={default:{props:['initialSection','focusAccount'],setup(props){settingsProps=props;return()=>vue.h('div','Settings')}}}
  const app=h.renderer.createApp(h.component('src/App.vue'));app.config.globalProperties.$t=key=>key
  try{
    app.mount(h.root);await settle()
    workspaceEvents('manage-workspaces');await settle();assert.equal(settingsProps.initialSection,'workspaces')
    h.click(h.find(node=>node.props['aria-label']==='account.menuLabel'));await settle()
    h.click(h.find(node=>node.tag==='button'&&h.text(node).includes('account.editProfile')));await settle()
    assert.equal(settingsProps.initialSection,'account');assert.equal(settingsProps.focusAccount,1)
    h.click(h.find(node=>node.props['aria-label']==='app.home'));await settle()
    h.click(h.find(node=>node.props['aria-label']==='app.settings'));await settle()
    assert.equal(settingsProps.initialSection,'general')
  }finally{app.unmount()}
})

test('productivity combines reports, preserves filters and opens chart details without changing the page',async()=>{
  const h=harness(),spaces=h.dependencies['@/stores/workspaces'].useWorkspacesStore()
  spaces.items=[{id:'one',name:'Personal'}]
  let source,instances=0
  const drafts=new Map()
  h.dependencies['@/components/ui/CustomSelect.vue']={default:{}}
  h.dependencies['@/lib/workspaceScope']={useWorkspaceDraft:(key,initial)=>{const value=vue.ref(initial);drafts.set(key,value);return value}}
  h.dependencies['@/features/analytics/lib/reports']=load(fs.readFileSync('src/features/analytics/lib/reports.ts','utf8'))
  h.dependencies['@/features/analytics/components/AnalyticsChart.vue']={default:{}}
  h.dependencies['@/features/analytics/composables/useAnalyticsReport']={useAnalyticsReport:options=>{
    instances++;source=options
    return {report:vue.ref(null),previous:vue.ref(null),status:vue.ref('ready'),error:vue.ref(''),refreshing:vue.ref(false),pending:vue.ref(0),storageFailed:vue.ref(false),load(){}}
  }}
  let state
  const component=h.component('src/views/AnalyticsView.vue',false)
  const app=h.renderer.createApp({setup(){state=vue.proxyRefs(component.setup({initialSection:'activity'},{expose(){},emit(){}}));return()=>vue.h('div')}})
  try{
    app.mount(h.root);assert.equal(state.analyticsPage,'overview');assert.equal(source.enabled.value,true)
    state.preset='month';state.personal=false
    state.selectPage('plans');await settle();assert.equal(state.detail,'plans')
    assert.equal(state.preset,'month');assert.equal(state.personal,false)
    assert.equal(state.analyticsPage,'overview')
    await state.chooseMetric('backlog');assert.equal(state.analyticsPage,'overview');assert.equal(state.detail,'backlog')
    await state.selectDay('2026-10-22');assert.equal(state.analyticsPage,'overview');assert.equal(state.selectedDay,'2026-10-22');assert.equal(state.detail,'daily')
    state.selectPage('daily');assert.equal(state.selectedDay,null,'the sidebar opens the whole daily report')
    state.selectPage('finance');assert.equal(source.enabled.value,false)
    state.selectPage('focus');assert.equal(source.enabled.value,true)
    state.selectPage('not-a-page');assert.equal(state.analyticsPage,'overview')
    assert.equal(instances,1,'changing report views does not create independent query sources')
  }finally{app.unmount()}
})

test('home, analytics and settings use the shared sidebar-aware layout in both width modes',async()=>{
  const h=harness(),settings=h.dependencies['@/stores/settings'].useSettingsStore()
  const app=h.renderer.createApp(h.component('src/App.vue'));app.config.globalProperties.$t=key=>key
  const layout=()=>h.find(node=>node.props.class?.includes('app-content'))
  try{
    app.mount(h.root);await settle()
    assert.equal(layout().props['data-page-layout'],undefined)
    settings.isFullScreen=true;await settle();assert.equal(layout().props['data-workspace-wide'],'')
    for(const view of ['app.home','app.analytics','app.settings']){
      h.click(h.find(node=>node.props['aria-label']===view));await settle()
      assert.equal(layout().props['data-page-layout'],'')
      assert.equal(layout().props['data-workspace-wide'],'')
      settings.isFullScreen=false;await settle()
      assert.equal(layout().props['data-page-layout'],'','pinned sidebars also reserve room in narrow mode')
      assert.equal(layout().props['data-workspace-wide'],undefined)
      settings.isFullScreen=true;await settle()
    }
  }finally{app.unmount()}
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
  h.enabled.value = ['plans','quick','tasks','periodic','pomodoro','finance']
  h.dependencies['@/lib/workspaceScope'] = { useWorkspaceDraft: (key, value) => vue.ref(value) }
  h.dependencies['@/components/ui/WorkspacePicker.vue'] = { default: {} }
  h.dependencies['@/components/ui/WorkspaceModulePane.vue'] = { default: {} }
  h.dependencies['@/components/ui/WorkspaceModuleFeedback.vue'] = { default: {} }
  const component = h.component('src/views/WorkspaceTabs.vue', false)
  const props=vue.reactive({initialTab:undefined,navigationRequest:0})
  let state, opened = 0
  const activeModules = []
  const app = h.renderer.createApp({ setup() { state = component.setup(props, { expose() {}, emit(name,value) { if(name==='active-module')activeModules.push(value) } });return () => vue.h('div') } })
  app.mount(h.root)
  assert.deepEqual(Array.from(state.activeModules.value,tab=>tab.id),['plans','tasks','quick','pomodoro','periodic','finance'],'search keeps enabled modules from every section')
  state.contentSearch.value = { open() { opened++ },close() {} }
  await state.openTabSearch();assert.equal(opened, 1)
  state.selectSearchHit({module:'secure',record_id:'secret',child_id:null});assert.equal(state.activeTab.value,'plans')
  state.selectSearchHit({module:'finance',record_id:'private',child_id:null});assert.equal(state.activeTab.value,'plans')
  state.selectSearchHit({module:'detailed',record_id:'disabled',child_id:null});assert.equal(state.activeTab.value,'plans')
  state.selectSearchHit({module:'tasks',record_id:'specific-task',child_id:null,title:'Task',preview:'',meta:{}})
  await settle()
  assert.equal(state.activeTab.value,'tasks');assert.equal(state.destination.value.record_id,'specific-task')
  assert.equal(state.navigationIntent.value,null,'a specific search result is not replaced by a general calendar command')
  state.selectModule('tasks')
  assert.deepEqual(JSON.parse(JSON.stringify(state.navigationIntent.value)),{module:'tasks',view:'calendar',sequence:1})
  state.selectModule('tasks');assert.equal(state.navigationIntent.value.sequence,2,'reopening the calendar issues a fresh navigation command')
  state.selectSearchHit({module:'quick',record_id:'specific-note',child_id:null,title:'Note',preview:'',meta:{}})
  await settle()
  assert.equal(state.activeTab.value,'quick');assert.equal(state.destination.value.record_id,'specific-note')
  state.selectSearchHit({module:'finance',record_id:'private',child_id:null})
  assert.equal(state.activeTab.value,'quick');assert.equal(state.destination.value.record_id,'specific-note')
  assert.deepEqual(activeModules,['plans','tasks','quick'],'the parent learns the actual opened module across section changes')
  props.initialTab='quick';props.navigationRequest++;await settle()
  state.selectModule('tasks');await settle()
  props.navigationRequest++;await settle()
  assert.equal(state.activeTab.value,'quick','repeated parent navigation still returns to its target after manual section changes')
  h.enabled.value=['finance'];await settle()
  assert.equal(state.activeTab.value,'finance')
  state.selectModule('tasks');assert.equal(state.activeTab.value,'finance','disabled module commands are ignored')
  h.enabled.value=[];await settle()
  assert.equal(state.activeTab.value,'');assert.equal(state.currentComponent.value,null)
  assert.equal(h.intervals.size,0)
  h.dependencies['@/stores/workspaces'].useWorkspacesStore().sessionKey='other';await settle()
  assert.equal(state.destination.value,null)
  app.unmount();assert.equal(h.listeners.size,0)
})

test('workspace transfers document scrolling into a pinned viewport and preserves focus, search, resize and tab changes', () => {
  const events=new Map(), viewportEvents=new Map(), documentEvents=new Map(), frames=new Map(), observers=[]
  let frameId=0, position=0, writes=0, toolbarHeight=120, loading=false
  const calls=[], attributes=new Set()
  const window={innerHeight:900,scrollY:0,
    addEventListener(name,fn){events.set(name,fn)},removeEventListener(name){events.delete(name)},
    scrollTo(options){this.scrollY=options.top;calls.push(options);events.get('scroll')?.()}}
  const document={addEventListener(name,fn){documentEvents.set(name,fn)},removeEventListener(name){documentEvents.delete(name)}}
  const navigation={offsetHeight:82}
  const toolbar={get offsetHeight(){return toolbarHeight},contains(){return false}}
  const content={offsetHeight:1800,querySelector(selector){return selector.includes('data-module-loading') ? loading || null : toolbar}}
  const frame={get offsetHeight(){return parseFloat(this.style.height)},style:{height:'',setProperty(){}},toggleAttribute(name,value){value?attributes.add(name):attributes.delete(name)},hasAttribute(name){return attributes.has(name)}}
  const stage={style:{height:''},getBoundingClientRect:()=>({top:320-window.scrollY})}
  const viewport={
    get clientHeight(){return parseFloat(frame.style.height)-130},
    get scrollTop(){return position},
    set scrollTop(value){position=Math.max(0,Math.min(content.offsetHeight-this.clientHeight,value));writes++},
    addEventListener(name,fn){viewportEvents.set(name,fn)},removeEventListener(name){viewportEvents.delete(name)},
    getBoundingClientRect(){return {top:105}},
  }
  const globals={window,document,getComputedStyle:()=>({paddingTop:'12px',paddingBottom:'24px',borderTopWidth:'1px',borderBottomWidth:'1px',rowGap:'10px'}),
    ResizeObserver:class {constructor(callback){this.callback=callback;observers.push(this)}observe(){}unobserve(){}disconnect(){this.disconnected=true}},
    MutationObserver:class {constructor(callback){this.callback=callback;observers.push(this)}observe(){}disconnect(){this.disconnected=true}},
    requestAnimationFrame:callback=>{const id=++frameId;frames.set(id,callback);return id},cancelAnimationFrame:id=>frames.delete(id)}
  const {createWorkspaceScroll}=load(fs.readFileSync('src/lib/workspaceScroll.ts','utf8'),{},globals)
  const controller=createWorkspaceScroll(stage,frame,navigation,viewport,content)
  const flush=()=>{for(const [id,callback] of [...frames]){frames.delete(id);callback()}}
  const scrollTo=top=>{window.scrollY=top;events.get('scroll')();flush()}
  try {
    assert.equal(stage.style.height,'1930px')
    assert.equal(frame.style.height,'900px')
    assert.equal(position,0)
    scrollTo(200);assert.equal(position,0,'the page scrolls normally before the frame reaches its top boundary')
    const before=writes
    window.scrollY=700
    events.get('scroll')();events.get('scroll')();events.get('scroll')()
    assert.equal(frames.size,1);assert.equal(writes,before)
    flush();assert.equal(position,380)
    scrollTo(1350);assert.equal(position,1030,'the last card remains reachable using the document scrollbar')
    scrollTo(900);assert.equal(position,580)
    viewport.scrollTop=730;viewportEvents.get('scroll')()
    assert.equal(calls.at(-1).top,1050,'native focus and browser-find scrolling share the document position')
    flush()
    const callCount=calls.length
    viewportEvents.get('scroll')()
    assert.equal(calls.length,callCount,'synchronization must not feed back into another page scroll')
    controller.reset();flush()
    assert.equal(window.scrollY,320);assert.equal(position,0)
    content.offsetHeight=120;controller.refresh();flush()
    assert.equal(stage.style.height,'900px','a replacement tab keeps the frame stable during its transition')
    loading=true;controller.settle();flush()
    assert.equal(stage.style.height,'900px','pending data retains the frame until loading finishes')
    loading=false;observers[1].callback();flush()
    assert.equal(stage.style.height,'250px','short lists shrink to their last card once loaded')
    assert.equal(frame.style.height,'250px')
    content.offsetHeight=80;controller.refresh();flush()
    assert.equal(stage.style.height,'210px','deleting the last row also removes its empty space')
    assert.equal(window.scrollY,320)
    content.offsetHeight=2400;toolbarHeight=1000;controller.refresh();flush()
    assert.equal(attributes.has('data-long-toolbar'),true,'long editors can scroll out of the way on small viewports')
    toolbarHeight=120;window.innerHeight=660;controller.refresh();flush()
    assert.equal(frame.style.height,'660px');assert.equal(attributes.has('data-long-toolbar'),false)
    const card={getBoundingClientRect:()=>({top:105+1200-position,height:80})}
    controller.reveal(card,'smooth');flush()
    assert.equal(calls.at(-1).behavior,'smooth')
    assert.equal(window.scrollY,1235)
    assert.equal(position,915,'search centers the result below the pinned module tools')
    assert.equal(events.has('wheel'),false);assert.equal(events.has('touchmove'),false)
    events.get('scroll')();assert.equal(frames.size,1)
  } finally { controller.dispose() }
  assert.equal(frames.size,0)
  assert.equal(events.size,0);assert.equal(viewportEvents.size,0);assert.equal(documentEvents.size,0)
  assert.ok(observers.every(observer=>observer.disconnected))
})

test('revealing the workspace header reserves its exact height without moving document scroll and handles rapid reversals',()=>{
  let now=1000,reduce=false,position=0,nextFrame=0
  const frames=new Map(),events=new Map(),documentEvents=new Map(),viewportEvents=new Map(),offsets=[],pins=[]
  const window={innerHeight:900,scrollY:0,matchMedia:()=>({matches:reduce}),
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),
    scrollTo({top}){this.scrollY=top;events.get('scroll')?.()}}
  const document={addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)}
  const stage={style:{},getBoundingClientRect:()=>({top:320-window.scrollY})}
  const frame={style:{},get offsetHeight(){return parseFloat(this.style.height)},toggleAttribute(){},hasAttribute(){return false}}
  const navigation={offsetHeight:68},content={offsetHeight:2000,querySelector:()=>null}
  const viewport={get clientHeight(){return parseFloat(frame.style.height)-100},get scrollTop(){return position},set scrollTop(value){position=Math.max(0,Math.min(content.offsetHeight-this.clientHeight,value))},
    addEventListener:(name,fn)=>viewportEvents.set(name,fn),removeEventListener:name=>viewportEvents.delete(name),getBoundingClientRect:()=>({top:100})}
  const {createWorkspaceScroll}=load(fs.readFileSync('src/lib/workspaceScroll.ts','utf8'),{}, {
    window,document,Date:class extends Date{static now(){return now}},getComputedStyle:()=>({paddingTop:'10px',paddingBottom:'10px',borderTopWidth:'1px',borderBottomWidth:'1px',rowGap:'10px'}),
    ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame},cancelAnimationFrame:id=>frames.delete(id),
  })
  const controller=createWorkspaceScroll(stage,frame,navigation,viewport,content,{headerInset:70,onPinned:value=>pins.push(value),onHeaderOffset:value=>offsets.push(value)})
  const step=ms=>{now+=ms;for(const[id,fn]of[...frames]){frames.delete(id);fn()}}
  try {
    assert.equal(frame.style.top,'70px');assert.equal(frame.style.height,'830px')
    window.scrollTo({top:620});step(0)
    assert.equal(position,370);assert.equal(pins.at(-1),true)
    controller.setHeaderInset(0);step(120)
    const midway=parseFloat(frame.style.top)
    assert.ok(midway>0&&midway<70)
    assert.equal(offsets.at(-1),midway,'header and frame share one animation value')
    assert.equal(position,300+midway);assert.equal(window.scrollY,620)
    controller.setHeaderInset(70);step(60)
    assert.ok(parseFloat(frame.style.top)>midway)
    controller.setHeaderInset(0);step(240)
    assert.equal(frame.style.top,'0px');assert.equal(frame.style.height,'900px');assert.equal(position,300)
    controller.setHeaderInset(70);step(240)
    assert.equal(frame.style.top,'70px');assert.equal(position,370)
    viewport.scrollTop=900;viewportEvents.get('scroll')();step(0)
    assert.equal(window.scrollY,1150,'native focus navigation subtracts the visible header reservation')
    controller.reset();step(0)
    assert.equal(window.scrollY,250);assert.equal(position,0)
    controller.setHeaderInset(0);step(0)
    assert.equal(window.scrollY,320);assert.equal(position,0,'a module transition keeps its first row at the top while the header changes')
    controller.settle();step(0)
    reduce=true;controller.setHeaderInset(70);step(0)
    assert.equal(frame.style.top,'70px','reduced motion applies the reservation immediately')
    assert.deepEqual(pins.slice(0,2),[false,true])
  } finally {controller.dispose()}
  assert.equal(frames.size,0);assert.equal(events.size,0);assert.equal(documentEvents.size,0);assert.equal(viewportEvents.size,0);assert.equal(pins.at(-1),false)
})

test('async plans load on first mount and refresh once on reactivation without duplicate requests',async()=>{
  const h=harness(),drafts=new Map()
  const scope=load(fs.readFileSync('src/lib/workspaceScope.ts','utf8'),{
    './supabase':{},'@/stores/workspaces':h.dependencies['@/stores/workspaces'],
    './sharing':{},'./storage':{},'./moduleCatalog':{},
  })
  h.dependencies['@/lib/workspaceScope']={...scope,useModuleAccess:()=>({canWrite:vue.ref(true)}),
    workspaceStorageKey:key=>key,useWorkspaceDraft:(key,value)=>{const draft=vue.ref(value);drafts.set(key,draft);return draft}}
  h.dependencies['@/components/ui/CustomSelect.vue']={default:{setup:()=>()=>vue.h('div')}}
  h.dependencies['../lib/periods']=load(fs.readFileSync('src/features/plans/lib/periods.ts','utf8'))
  let loads=0,release,resolveComponent
  const store=vue.reactive({plans:[],busy:false,timezone:'Europe/Istanbul',isSaving:()=>false,
    async load(){loads++;this.busy=true;await new Promise(resolve=>release=resolve);this.plans=[{
      id:'plan',title:'Loaded plan',period:'daily',period_date:h.dependencies['../lib/periods'].periodStart('daily',new Date(),this.timezone),
      completed:false,reason:'',history:[],
    }];this.busy=false;return true}})
  h.dependencies['../stores/plans']={usePlansStore:()=>store}
  const Plans=h.component('src/features/plans/components/Plans.vue')
  const AsyncPlans=vue.defineAsyncComponent(()=>new Promise(resolve=>resolveComponent=resolve))
  const Pane=h.component('src/components/ui/WorkspaceModulePane.vue'),visible=vue.ref(true)
  const Other={setup:()=>()=>vue.h('div','Other')}
  const app=h.renderer.createApp({setup:()=>()=>vue.h(vue.KeepAlive,null,{default:()=>visible.value
    ?vue.h(Pane,{key:'plans',tabId:'plans',moduleComponent:AsyncPlans}):vue.h(Other,{key:'other'})})})
  app.mount(h.root)
  try{
    await settle();assert.equal(loads,0)
    resolveComponent(Plans);await settle();await settle()
    assert.equal(loads,1,'an async child loads even after its pane was already activated')
    assert.equal(h.find(node=>node.props.role==='region').props['aria-busy'],true)
    visible.value=false;await settle();visible.value=true;await settle()
    assert.equal(loads,1,'returning while a request is pending reuses it')
    assert.equal(h.intervals.size,1,'the day watcher restarts when returning during a fetch')
    release();await settle()
    assert.ok(h.text(h.root).includes('Loaded plan'))
    assert.equal(h.find(node=>node.props.role==='region').props['aria-busy'],false)
    visible.value=false;await settle();assert.equal(h.intervals.size,0)
    visible.value=true;await settle()
    assert.equal(loads,2,'a cached tab refreshes after being opened again')
    release();await settle();assert.equal(h.intervals.size,1)
  }finally{release?.();await settle();app.unmount()}
  assert.equal(h.intervals.size,0)
})

test('workspace mounting respects the destination saved tab and applies only enabled incoming views',()=>{
 for(const incoming of [undefined,'tasks','secure']){
  const h=harness(),drafts=new Map()
  h.enabled.value=['plans','quick','tasks']
  h.dependencies['@/lib/workspaceScope']={useWorkspaceDraft:(key,value)=>{const draft=vue.ref(key==='last-tab'?'quick':value);drafts.set(key,draft);return draft}}
  for(const path of ['@/components/ui/WorkspacePicker.vue','@/components/ui/WorkspaceModulePane.vue','@/components/ui/WorkspaceModuleFeedback.vue'])h.dependencies[path]={default:{}}
  const Component=h.component('src/views/WorkspaceTabs.vue',false)
  let state;const props=vue.reactive({initialTab:incoming,initialView:'calendar'})
  const app=h.renderer.createApp({setup(){state=Component.setup(props,{expose(){},emit(){}});return()=>vue.h('div')}})
  try{
   app.mount(h.root)
   assert.equal(state.activeTab.value,incoming==='tasks'?'tasks':'quick')
   assert.equal(state.navigationIntent.value?.view,incoming==='tasks'?'calendar':undefined)
   assert.equal(drafts.get('last-tab').value,incoming==='tasks'?'tasks':'quick','disabled incoming tabs cannot overwrite a valid destination preference')
  }finally{app.unmount()}
 }
})

test('module transitions retain each tab instance and its unsaved local state across workspace groups', async () => {
  const h = harness()
  h.enabled.value=['plans','quick','tasks','pomodoro']
  const drafts = new Map()
  const mounted = { plans: 0, quick: 0, tasks: 0 }
  h.dependencies['@/lib/workspaceScope'] = { moduleLoadKey:Symbol('module-load'), useWorkspaceDraft: (key, value) => { const draft = vue.ref(value); drafts.set(key, draft); return draft } }
  h.dependencies['@/components/ui/WorkspacePicker.vue'] = { default: { setup: () => () => vue.h('div') } }
  h.dependencies['@/components/ui/WorkspaceModulePane.vue'] = { default: h.component('src/components/ui/WorkspaceModulePane.vue') }
  h.dependencies['@/components/ui/WorkspaceModuleFeedback.vue'] = { default: { setup: () => () => vue.h('div', 'Loading') } }
  h.dependencies['@/components/ui/WorkspaceRail.vue']={default:{props:['enabled','modelValue'],emits:['update:modelValue'],setup(props,{emit}){return()=>vue.h('nav',props.enabled.map(id=>vue.h('button',{'data-open-module':id,onClick:()=>emit('update:modelValue',id)},id)))}}}
  for (const [id, path] of [['plans', '@/features/plans/components/Plans.vue'], ['quick', '@/features/quick_notes/components/QuickNotes.vue'], ['tasks','@/features/tasks/components/Tasks.vue']]) {
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
  h.click(h.find(node=>node.props['data-open-module']==='tasks'))
  await settle();await settle()
  assert.ok(h.find(node=>node.text==='tasks:draft'))
  h.click(h.find(node=>node.tag==='button'&&h.text(node)==='Edit tasks'))
  await settle()
  h.click(h.find(node=>node.props['data-open-module']==='plans'))
  await settle()
  await settle()
  assert.ok(h.find(node => node.text === 'plans:edited'))
  h.click(h.find(node=>node.props['data-open-module']==='tasks'))
  await settle();await settle()
  assert.ok(h.find(node=>node.text==='tasks:edited'),'returning to planning retains its original component and draft')
  const region=h.find(node=>node.props.id==='workspace-panel-tasks')
  assert.equal(region.props.role,'region')
  assert.equal(region.props['aria-label'],'tasks.calendar','the module has its own accessible name without the removed tab strip')
  assert.equal(region.props['aria-labelledby'],undefined,'no label may point at a removed tab')
  assert.deepEqual(mounted, { plans: 1, quick: 1, tasks: 1 })
  assert.equal(h.intervals.size,0)
  app.unmount()
})
