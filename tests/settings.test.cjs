const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')
const vue = require('vue')
const pinia = require('pinia')

function load(source, dependencies, globals = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => dependencies[name] || (name === '@/lib/themePalettes' ? load(fs.readFileSync('src/lib/themePalettes.ts', 'utf8'), {}, globals) : name === '@/lib/storage' ? load(fs.readFileSync('src/lib/storage.ts', 'utf8'), {}, globals) : name === '@/lib/moduleCatalog' ? load(fs.readFileSync('src/lib/moduleCatalog.ts', 'utf8'), {}, globals) : require(name)), console, Date, ...globals })
  return exports
}
const themeLib = load(fs.readFileSync('src/lib/themePalettes.ts', 'utf8'), {})
const pageNavigation=load(fs.readFileSync('src/lib/workspaceSections.ts','utf8'),{'./moduleCatalog':load(fs.readFileSync('src/lib/moduleCatalog.ts','utf8'),{})})

function fixture(view = 'src/views/WorkspaceCustomizer.vue', count = 2, viewProps = {}) {
  pinia.setActivePinia(pinia.createPinia())
  const calls = []
  const toasts = []
  const memory = new Map([['ui_language', 'tr']])
  const locale = vue.ref('tr')
  let succeeds = true
  let gate
  const store = vue.reactive({
    activeId: 'one', busy: false, loaded: true, error: '',
    items: [
      { id: 'one', name: 'Personal', active_modules: ['detailed', 'plans'], archived_at: null },
      ...Array.from({ length: count - 1 }, (_, index) => ({ id: `extra-${index}`, name: `Work ${index}`, active_modules: ['detailed'], archived_at: null })),
    ],
    get available() { return this.items.filter(item => !item.archived_at) },
    get active() { return this.items.find(item => item.id === this.activeId) },
    switchTo(id) { this.activeId = id },
    async setModules(modules) {
      const workspace = this.active
      const previous = workspace.active_modules
      workspace.active_modules = modules
      calls.push(['modules', workspace.id, ...modules])
      if (gate) await gate
      if (!succeeds) workspace.active_modules = previous
      return succeeds
    },
    async create(name) {
      this.busy = true
      calls.push(['create', name])
      try { if (gate) await gate; return succeeds }
      finally { this.busy = false }
    },
    async configure(id, changes) {
      calls.push(['configure', id, changes])
      if (succeeds) {
        Object.assign(this.items.find(item => item.id === id), changes)
        if (!this.available.some(item => item.id === this.activeId)) this.switchTo(this.available[0].id)
      }
      return succeeds
    },
    async remove(id, expectedName) {
      calls.push(['remove',id,expectedName]);this.busy=true
      try {
        if(gate)await gate
        if(!succeeds){this.error='WORKSPACE_SHARED';return false}
        this.items=this.items.filter(item=>item.id!==id)
        if(this.activeId===id)this.switchTo(this.available[0].id)
        return true
      }finally{this.busy=false}
    },
  })
  const scope = vue.effectScope()
  let state, settings
  scope.run(() => {
    settings = load(fs.readFileSync('src/stores/settings.ts', 'utf8'), {
      './workspaces': { useWorkspacesStore: () => store },
      '@/lib/workspaceDefaults': { defaultModules: ['detailed'] },
      '@/i18n': { i18n: { global: { locale } } },
      '@/lib/supabase': { supabase: {} },
    }, { localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) } }).useSettingsStore()
    const descriptor = parse(fs.readFileSync(view, 'utf8')).descriptor
    const component = load(compileScript(descriptor, { id: 'settings-test' }).content, {
      'vue-i18n': { useI18n: () => ({ t: key => key, locale }) },
      'lucide-vue-next': {},
      '@/stores/settings': { useSettingsStore: () => settings },
      '@/stores/workspaces': { useWorkspacesStore: () => store },
      '@/stores/sharing': { useSharingStore: () => ({}) },
      '@/lib/sharing': { shareableModules: ['quick','code','detailed','activities'] },
      '@/stores/theme': { useThemeStore: () => load(fs.readFileSync('src/stores/theme.ts', 'utf8'), {
        './settings': { useSettingsStore: () => settings },
      }).useThemeStore() },
      '@/stores/ui': { useUIStore: () => ({ addToast: (...args) => toasts.push(args) }) },
      '@/components/ui/CustomSelect.vue': { default: {} },
      '@/components/WorkspaceManager.vue': { default: {} },
      '@/components/AccountSettings.vue': { default: {} },
      '@/components/ui/WorkspaceRail.vue':{default:{}}, '@/components/ui/WorkspacePicker.vue':{default:{}},
      '@/lib/workspaceSections':pageNavigation,
      '@/lib/workspaceScope':{useWorkspaceDraft:(_key,initial)=>vue.ref(initial)},
    }).default
    state = component.setup(viewProps, { expose() {} })
  })
  return {
    state, settings, store, calls, toasts, locale, memory, close: () => scope.stop(), fail: () => { succeeds = false },
    pause() { let release; gate = new Promise(resolve => { release = resolve }); return release },
  }
}

test('settings navigation honors workspace and profile entry points without trapping later visits in the account section',async()=>{
  const props=vue.reactive({initialSection:'workspaces',focusAccount:0})
  const f=fixture('src/views/WorkspaceCustomizer.vue',2,props)
  try{
    assert.equal(f.state.settingsSection.value,'workspaces')
    props.focusAccount=1;await vue.nextTick();assert.equal(f.state.settingsSection.value,'general')
    props.initialSection='general';await vue.nextTick();assert.equal(f.state.settingsSection.value,'general')
    props.initialSection='modules';await vue.nextTick();assert.equal(f.state.settingsSection.value,'workspaces')
    props.initialSection='invalid';await vue.nextTick();assert.equal(f.state.settingsSection.value,'workspaces')
    assert.equal(f.calls.length,0,'page navigation must not write module or account preferences')
  }finally{f.close()}
})

test('module selections show pending and success feedback and cannot submit twice', async () => {
  const f = fixture()
  const release = f.pause()
  const saving = f.state.toggleModule('quick', false)
  assert.equal(f.state.saveStatus.value, 'saving')
  assert.equal(f.settings.isModuleActive('quick'), true)
  await f.state.toggleModule('quick', false)
  assert.equal(f.calls.length, 1)
  release()
  await saving
  assert.equal(f.state.saveStatus.value, 'saved')
  assert.equal(f.state.pendingModuleId.value, '')
  assert.equal(f.state.enabledCount.value, 3)
  f.close()
})

test('core module stays enabled and failed selections show an error and restore the switch', async () => {
  const f = fixture()
  await f.state.toggleModule('detailed', true)
  assert.equal(await f.settings.toggleModule('detailed', true), false)
  assert.equal(f.calls.length, 0)
  f.fail()
  await f.state.toggleModule('quick', false)
  assert.equal(f.state.saveStatus.value, 'error')
  assert.equal(f.settings.isModuleActive('quick'), false)
  assert.equal(f.toasts.at(-1)[1], 'error')
  f.close()
})

test('a pending preference write cannot show its status in another workspace', async () => {
  const f = fixture()
  const release = f.pause()
  const saving = f.state.toggleModule('quick', false)
  f.store.switchTo('extra-0')
  await vue.nextTick()
  release()
  await saving
  assert.equal(f.state.saveStatus.value, 'idle')
  assert.equal(f.state.pendingModuleId.value, '')
  assert.equal(f.settings.isModuleActive('quick'), false)
  f.close()
})

test('language selection uses supported locales and persists to existing preferences', async () => {
  const f = fixture()
  f.state.handleLanguageChange('en')
  await vue.nextTick()
  assert.equal(f.locale.value, 'en')
  assert.equal(f.memory.get('ui_language'), 'en')
  f.state.handleLanguageChange('unsupported')
  assert.equal(f.locale.value, 'en')
  f.close()
})

test('workspace creation rejects duplicate names and retains the entered name on failure', async () => {
  const f = fixture('src/components/WorkspaceManager.vue')
  f.state.name.value = ' personal '
  await f.state.create()
  assert.equal(f.calls.length, 0)
  f.state.name.value = ' New area '
  f.fail()
  await f.state.create()
  assert.deepEqual(f.calls[0], ['create', 'New area'])
  assert.equal(f.state.name.value, ' New area ')
  assert.equal(f.state.creating.value, false)
  assert.equal(f.toasts.at(-1)[1], 'error')
  f.close()
})

test('workspace editing focuses and selects the name, and switching closes the editor', async () => {
  const f = fixture('src/components/WorkspaceManager.vue')
  const actions = []
  f.state.editInput.value = { focus: () => actions.push('focus'), select: () => actions.push('select') }
  await f.state.beginEdit('one', 'Personal')
  assert.deepEqual(actions, ['focus', 'select'])
  assert.equal(f.state.editName.value, 'Personal')
  f.store.switchTo('extra-0')
  await vue.nextTick()
  assert.equal(f.state.editingId.value, '')
  assert.equal(f.state.editName.value, '')
  f.close()
})

test('workspace selection switches the active area and actions only affect the selected workspace', async () => {
  const f = fixture('src/components/WorkspaceManager.vue', 8)
  f.state.selectWorkspace('extra-3')
  await vue.nextTick()
  assert.equal(f.store.activeId, 'extra-3')
  assert.equal(f.state.selected.value.name, 'Work 3')
  await f.state.archive('one')
  assert.equal(f.calls.length, 0)
  await f.state.archive('extra-3')
  await vue.nextTick()
  assert.ok(f.store.items.find(item => item.id === 'extra-3').archived_at)
  assert.equal(f.store.items.find(item => item.id === 'one').archived_at, null)
  assert.equal(f.state.selectedId.value, 'one')
  assert.equal(f.state.workspaceOptions.value.length, 8)
  assert.match(f.state.workspaceOptions.value.at(-1).label, /Work 3/)
  f.close()
})

test('renaming edits only the selected workspace and retains the editor when saving fails', async () => {
  const f = fixture('src/components/WorkspaceManager.vue')
  f.state.selectWorkspace('extra-0')
  await vue.nextTick()
  await f.state.beginEdit('extra-0', 'Work 0')
  f.state.editName.value = 'Renamed'
  await f.state.rename('one')
  assert.equal(f.calls.length, 0)
  f.fail()
  await f.state.rename('extra-0')
  assert.equal(f.state.editingId.value, 'extra-0')
  assert.equal(f.state.editName.value, 'Renamed')
  assert.equal(f.store.active.name, 'Work 0')
  assert.equal(f.toasts.at(-1)[1], 'error')
  f.close()
})

test('the last workspace cannot be archived and archived workspaces can be restored', async () => {
  const f = fixture('src/components/WorkspaceManager.vue', 1)
  await f.state.archive('one')
  assert.equal(f.calls.length, 0)
  f.store.items.push({ id: 'archived', name: 'Old work', active_modules: ['detailed'], archived_at: '2026-01-01' })
  f.state.selectWorkspace('archived')
  assert.equal(f.store.activeId, 'one')
  assert.equal(f.state.selected.value.name, 'Old work')
  await f.state.restore('archived')
  await vue.nextTick()
  assert.equal(f.store.available.length, 2)
  assert.equal(f.state.archived.value.length, 0)
  assert.equal(f.store.activeId, 'archived')
  f.close()
})

test('workspace deletion requires its name, protects the last active workspace and keeps failed confirmations open',async()=>{
 const f=fixture('src/components/WorkspaceManager.vue')
 try {
  f.state.askDelete();assert.equal(f.state.deleteTarget.value.id,'one')
  f.state.deleteName.value='wrong';await f.state.confirmDelete();assert.equal(f.calls.length,0)
  f.state.deleteName.value='Personal';const release=f.pause(),pending=f.state.confirmDelete()
  await f.state.confirmDelete();f.state.closeDelete()
  assert.equal(f.state.removing.value,true);assert.equal(f.calls.length,1);assert.ok(f.state.deleteTarget.value)
  release();await pending;await vue.nextTick()
  assert.equal(f.store.items.length,1);assert.equal(f.state.deleteTarget.value,null);assert.equal(f.store.activeId,'extra-0')
  f.state.askDelete();assert.equal(f.state.deleteTarget.value,null,'cannot request deletion of the last active workspace')
  f.store.items.push({id:'archived',name:'Old work',archived_at:'2026-01-01',active_modules:[]})
  f.state.selectWorkspace('archived');f.state.askDelete();f.state.deleteName.value='Old work';f.fail()
  await f.state.confirmDelete()
  assert.equal(f.state.deleteTarget.value.id,'archived');assert.equal(f.state.deleteError.value,'workspaces.deleteShared')
  assert.equal(f.store.items.length,2);assert.equal(f.store.activeId,'extra-0')
 }finally{f.close()}
})

function preferenceFixture(options={}) {
  pinia.setActivePinia(pinia.createPinia())
  const memory=options.memory||new Map(),cloud=options.cloud||new Map(),calls=[]
  const workspace=vue.reactive({userId:options.userId||'owner',loaded:true})
  let readGate,writeGate,offline=false,store
  const api={
    from(){let id;return {select(){return this},eq(_field,value){id=value;return this},async maybeSingle(){
      const preferences=cloud.has(id)?structuredClone(cloud.get(id)):null
      if(readGate)await readGate
      if(offline)return {error:{code:'NETWORK_ERROR'}}
      return {data:preferences?{preferences}:null}
    }}},
    async rpc(name,args){
      calls.push({name,args:structuredClone(args)})
      if(writeGate)await writeGate
      if(offline)return {error:{code:'NETWORK_ERROR'}}
      if(args.expected_user_id!==workspace.userId)return {error:{code:'42501',message:'SESSION_CHANGED'}}
      const values={...cloud.get(args.expected_user_id),...args.patch}
      cloud.set(args.expected_user_id,structuredClone(values));return {data:values}
    },
  }
  const scope=vue.effectScope()
  scope.run(()=>{
    store=load(fs.readFileSync('src/stores/settings.ts','utf8'),{
      './workspaces':{useWorkspacesStore:()=>workspace},'@/lib/workspaceDefaults':{defaultModules:[]},
      '@/i18n':{i18n:{global:{locale:vue.ref('en')}}},'@/lib/supabase':{supabase:api},
    },{setTimeout,clearTimeout,localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}}).useSettingsStore()
  })
  return {store,workspace,memory,cloud,calls,close:()=>{store.$dispose();scope.stop()},offline:value=>offline=value,
    holdRead(){let release;readGate=new Promise(resolve=>release=resolve);return ()=>{readGate=null;release()}},
    holdWrite(){let release;writeGate=new Promise(resolve=>release=resolve);return ()=>{writeGate=null;release()}}}
}
async function settlePreferences(){await new Promise(resolve=>setImmediate(resolve));await vue.nextTick()}

test('account preferences restore wide mode, dock, theme, language and timer durations immediately after F5 and sign-in',async()=>{
 const first=preferenceFixture();let reloaded
 try{
  await settlePreferences()
  first.store.patchPreferences({workspaceWide:true,pomodoroPlacement:'navbar',theme:'dark',language:'tr',pomodoroDurations:{focus:40,shortBreak:8,longBreak:20}})
  const snapshot=JSON.parse(first.memory.get('user-preferences:v1:owner'))
  assert.equal(snapshot.preferences.workspaceWide,true);assert.equal(snapshot.preferences.pomodoroPlacement,'navbar')
  await first.store.flushPreferences();assert.equal(first.store.preferenceSyncStatus,'saved')
  first.workspace.userId='';first.workspace.userId='owner';await settlePreferences()
  assert.equal(first.store.isFullScreen,true);assert.equal(first.store.isPomodoroDocked,true)
  reloaded=preferenceFixture({memory:first.memory,cloud:first.cloud})
  assert.equal(reloaded.store.isFullScreen,true);assert.equal(reloaded.store.isPomodoroDocked,true)
  await settlePreferences();assert.equal(reloaded.store.theme,'dark');assert.equal(reloaded.store.language,'tr')
  assert.equal(reloaded.store.pomodoroDurations.focus,40)
 }finally{reloaded?.close();first.close()}
})

test('a fresh device loads cloud preferences without overwriting them with its defaults',async()=>{
 const cloud=new Map([['owner',{workspaceWide:true,pomodoroPlacement:'navbar',theme:'dark',language:'tr'}]])
 const f=preferenceFixture({cloud});try{
  await settlePreferences();assert.equal(f.store.isFullScreen,true);assert.equal(f.store.isPomodoroDocked,true)
  await f.store.flushPreferences();assert.equal(f.calls.length,0,'reading existing settings must not upload device defaults')
 }finally{f.close()}
})

test('offline preference edits survive F5, stay scoped to their account, and retry with a partial patch',async()=>{
 const f=preferenceFixture({cloud:new Map([['owner',{workspaceWide:false,pomodoroPlacement:'card'}]])});let reloaded
 try{
  await settlePreferences();f.offline(true);f.store.isFullScreen=true;f.store.isPomodoroDocked=true
  await f.store.flushPreferences();assert.equal(f.store.preferenceSyncStatus,'pending')
  f.workspace.userId='other';assert.equal(f.store.isFullScreen,false);assert.equal(f.store.isPomodoroDocked,false)
  reloaded=preferenceFixture({memory:f.memory,cloud:f.cloud})
  assert.equal(reloaded.store.isFullScreen,true);assert.equal(reloaded.store.isPomodoroDocked,true)
  await settlePreferences();await reloaded.store.flushPreferences()
  assert.equal(reloaded.store.preferenceSyncStatus,'saved');assert.equal(reloaded.cloud.get('owner').workspaceWide,true)
  assert.deepEqual(reloaded.calls.at(-1).args.patch,{workspaceWide:true,pomodoroPlacement:'navbar'})
 }finally{reloaded?.close();f.close()}
})

test('a late cloud read cannot undo edits already acknowledged by a save',async()=>{
 const f=preferenceFixture({cloud:new Map([['owner',{workspaceWide:false}]])})
 try{
  await settlePreferences();const release=f.holdRead(),loading=f.store.loadPreferences()
  f.store.isFullScreen=true;await f.store.flushPreferences();release();await loading
  assert.equal(f.store.isFullScreen,true);assert.equal(f.cloud.get('owner').workspaceWide,true)
 }finally{f.close()}
})

test('preference writes preserve another device field and stale writes cannot update a new account',async()=>{
 const f=preferenceFixture({cloud:new Map([['owner',{workspaceWide:false,pomodoroPlacement:'card'}]])})
 try{
  await settlePreferences();f.cloud.get('owner').pomodoroPlacement='navbar';f.store.isFullScreen=true
  await f.store.flushPreferences();assert.equal(f.cloud.get('owner').pomodoroPlacement,'navbar')
  const release=f.holdWrite();f.store.isFullScreen=false;const saving=f.store.flushPreferences()
  f.workspace.userId='other';await settlePreferences();release();await saving
  assert.equal(f.cloud.get('other'),undefined);assert.equal(f.store.isFullScreen,false)
  assert.equal(f.calls.at(-1).args.expected_user_id,'owner')
 }finally{f.close()}
})

test('editing while a preference save is in flight keeps the newer value pending until saved',async()=>{
 const f=preferenceFixture({cloud:new Map([['owner',{workspaceWide:false}]])})
 try{
  await settlePreferences();const release=f.holdWrite();f.store.isFullScreen=true
  const saving=f.store.flushPreferences();f.store.isFullScreen=false;release();await saving
  assert.equal(f.store.isFullScreen,false);assert.equal(f.store.preferenceSyncStatus,'pending')
  await f.store.flushPreferences();assert.equal(f.cloud.get('owner').workspaceWide,false)
  assert.equal(f.store.preferenceSyncStatus,'saved')
 }finally{f.close()}
})

test('palette selector preserves remaining choices and lists seven translated theme families', () => {
 const f = fixture()
 try {
  assert.equal(f.state.paletteOptions.value.length, 7)
  f.state.handlePaletteChange('forest')
  assert.equal(f.settings.themePalette, 'forest')
  f.state.handlePaletteChange('unknown')
  assert.equal(f.settings.themePalette, 'forest')
  assert.equal(f.state.paletteOptions.value.find(option => option.value === 'forest').label, 'Orman Yeşili')
  f.state.handleLanguageChange('en')
  assert.deepEqual(Array.from(f.state.paletteOptions.value, option => option.label), ['Classic','Forest Night','Amethyst','Ocean Depth','Ruby Noir','Cobalt Blue','Graphite'])
 } finally { f.close() }
})

test('palette survives reload/offline edits, synchronizes independently of mode and remains account scoped', async () => {
 const f = preferenceFixture({ cloud: new Map([['owner', { theme: 'dark', themePalette: 'ocean', workspaceWide: true }]]) })
 let reloaded
 try {
  await settlePreferences()
  assert.equal(f.store.themePalette, 'ocean')
  f.offline(true); f.store.themePalette = 'lavender'
  await f.store.flushPreferences()
  reloaded = preferenceFixture({ memory: f.memory, cloud: f.cloud })
  assert.equal(reloaded.store.themePalette, 'lavender')
  await settlePreferences(); await reloaded.store.flushPreferences()
  assert.deepEqual(reloaded.calls.at(-1).args.patch, { themePalette: 'lavender' })
  assert.equal(reloaded.cloud.get('owner').theme, 'dark')
  assert.equal(reloaded.cloud.get('owner').workspaceWide, true)
  reloaded.workspace.userId = 'other'
  assert.equal(reloaded.store.themePalette, 'classic')
  reloaded.workspace.userId = 'owner'
  assert.equal(reloaded.store.themePalette, 'lavender')
 } finally { reloaded?.close(); f.close() }
})

test('all palette modes keep readable text and buttons and switching back fully restores classic colors', () => {
 const { JSDOM } = require('jsdom')
 const root = new JSDOM('<html><body></body></html>').window.document.documentElement
 function luminance(hsl) {
  const [h, s, l] = hsl.split(' ').map(parseFloat)
  const chroma = (1 - Math.abs(2*l/100 - 1))*s/100, x = chroma*(1 - Math.abs((h/60)%2 - 1)), m = l/100 - chroma/2
  const rgb = h < 60 ? [chroma,x,0] : h < 120 ? [x,chroma,0] : h < 180 ? [0,chroma,x] : h < 240 ? [0,x,chroma] : h < 300 ? [x,0,chroma] : [chroma,0,x]
  return rgb.map(value => { const c = value+m; return c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4 }).reduce((sum,c,index) => sum + c*[.2126,.7152,.0722][index], 0)
 }
 function contrast(a,b) { const [high,low] = [luminance(a),luminance(b)].sort((a,b)=>b-a); return (high+.05)/(low+.05) }
 for (const palette of themeLib.themePalettes) for (const mode of ['light','dark']) {
  const tokens = palette.colors[mode]
  for (const [text,surface] of [['foreground','background'],['card-foreground','card'],['popover-foreground','popover'],['secondary-foreground','secondary'],['primary-foreground','primary']]) {
   assert.ok(contrast(tokens[text],tokens[surface]) >= 4.5, `${palette.id}/${mode}: ${text} on ${surface}`)
  }
  // The three new families specify their secondary text colors explicitly.
  const suppliedMuted = ['ruby','cobalt','graphite'].includes(palette.id) && mode === 'light'
  assert.ok(contrast(tokens['muted-foreground'],tokens.background) >= (suppliedMuted ? 3 : 4.5), `${palette.id}/${mode}: secondary text`)
  if (!suppliedMuted) assert.ok(contrast(tokens['muted-foreground'],tokens.muted) >= 4.5, `${palette.id}/${mode}: secondary text on muted`)
  themeLib.applyThemeAppearance(root,mode,palette.id)
  assert.equal(root.classList.contains('dark'),mode === 'dark')
  assert.equal(root.style.getPropertyValue('--primary'),tokens.primary)
 }
 themeLib.applyThemeAppearance(root,'light','classic')
 assert.equal(root.style.getPropertyValue('--background'),'0 0% 100%')
 assert.equal(root.style.getPropertyValue('--primary'),'222.2 47.4% 11.2%')
 themeLib.applyThemeAppearance(root,'dark','unsupported')
 assert.equal(root.dataset.palette,'classic')
 assert.equal(root.style.getPropertyValue('--background'),'222.2 84% 4.9%')
})

test('theme store applies hydrated palette and updates the DOM immediately when either setting changes', () => {
 pinia.setActivePinia(pinia.createPinia())
 const { JSDOM } = require('jsdom')
 const document = new JSDOM('<html><body></body></html>').window.document
 const settings = vue.reactive({theme:'dark',themePalette:'forest'})
 const scope = vue.effectScope()
 try {
  let store
  scope.run(() => { store = load(fs.readFileSync('src/stores/theme.ts','utf8'), {
    './settings': {useSettingsStore:()=>settings},
  }, {document}).useThemeStore() })
  assert.equal(document.documentElement.dataset.palette,'forest')
  store.theme = 'light'
  assert.equal(document.documentElement.classList.contains('dark'),false)
  assert.equal(document.documentElement.style.getPropertyValue('--primary'),themeLib.getThemePalette('forest').colors.light.primary)
  settings.themePalette = 'ocean'
  assert.equal(document.documentElement.dataset.palette,'ocean')
  assert.equal(document.documentElement.style.getPropertyValue('--primary'),themeLib.getThemePalette('ocean').colors.light.primary)
 } finally { scope.stop() }
})

test('premium palettes retain every supplied base color in both modes and reuse secondary surfaces consistently', () => {
 const { JSDOM } = require('jsdom')
 const style = new JSDOM().window.document.createElement('div').style
 const expected = {
  forest: {light:['#EDF5EF','#FBFDFB','#287755','#D4E8DB'],dark:['#101C19','#172721','#8BC4A3','#293D34']},
  lavender: {light:['#F1EEFB','#FCFAFF','#7046B8','#E1D9F3'],dark:['#181625','#242036','#BAA2F4','#332D49']},
  ocean: {light:['#EDF7F7','#FAFEFE','#258A88','#D3EBE9'],dark:['#071D25','#102B35','#67D6C5','#20424B']},
  ruby: {light:['#FBF2F3','#FFFCFC','#A93349','#F1DCE1','#382027','#916F78','#EBD4D9'],dark:['#1D1015','#2A171F','#F08CA0','#462431','#FBE9ED','#CCA6AF','#58313D']},
  cobalt: {light:['#F0F4FF','#FFFFFF','#315BD5','#DBE5FF','#182B54','#7181A6','#D7E1F7'],dark:['#0C1530','#152242','#86A8FF','#253963','#EDF2FF','#A2B5DD','#354976']},
  graphite: {light:['#ECEFF2','#FAFBFC','#465668','#DCE2E8','#1E2935','#7B8997','#D3DAE1'],dark:['#14171B','#21262C','#B7C5D3','#343C45','#F2F5F7','#A4B0BC','#46515C']},
 }
 for (const [id, modes] of Object.entries(expected)) for (const [mode, colors] of Object.entries(modes)) {
  const tokens = themeLib.getThemePalette(id).colors[mode]
  for (const [index, name] of ['background','card','primary','secondary','foreground','muted-foreground','border'].slice(0,colors.length).entries()) {
   style.color = `hsl(${tokens[name]})`
   const hex = '#' + style.color.match(/[\d.]+/g).slice(0,3).map(channel => Math.round(+channel).toString(16).padStart(2,'0')).join('').toUpperCase()
   assert.equal(hex, colors[index], `${id}/${mode}/${name}`)
  }
  assert.equal(tokens.secondary,tokens.muted);assert.equal(tokens.secondary,tokens.accent)
  assert.equal(tokens.card,tokens.popover);assert.equal(tokens.border,tokens.input);assert.equal(tokens.ring,tokens.primary)
 }
})

test('classic tokens stay identical to the original palette after switching through every premium mode', () => {
 const { JSDOM } = require('jsdom')
 const root = new JSDOM('<html></html>').window.document.documentElement
 const originals = {
  light:{background:'0 0% 100%',foreground:'222.2 84% 4.9%',card:'0 0% 100%','card-foreground':'222.2 84% 4.9%',popover:'0 0% 100%','popover-foreground':'222.2 84% 4.9%',primary:'222.2 47.4% 11.2%','primary-foreground':'210 40% 98%',secondary:'210 40% 96.1%','secondary-foreground':'222.2 84% 4.9%',muted:'210 40% 96.1%','muted-foreground':'215.4 16.3% 45.5%',accent:'210 40% 96.1%','accent-foreground':'222.2 84% 4.9%',border:'214.3 31.8% 91.4%',input:'214.3 31.8% 91.4%',ring:'222.2 84% 4.9%'},
  dark:{background:'222.2 84% 4.9%',foreground:'210 40% 98%',card:'222.2 84% 4.9%','card-foreground':'210 40% 98%',popover:'222.2 84% 4.9%','popover-foreground':'210 40% 98%',primary:'210 40% 98%','primary-foreground':'222.2 47.4% 11.2%',secondary:'217.2 32.6% 17.5%','secondary-foreground':'210 40% 98%',muted:'217.2 32.6% 17.5%','muted-foreground':'215 20.2% 65.1%',accent:'217.2 32.6% 17.5%','accent-foreground':'210 40% 98%',border:'217.2 32.6% 17.5%',input:'217.2 32.6% 17.5%',ring:'212.7 26.8% 83.9%'},
 }
 for (const [mode, baseline] of Object.entries(originals)) {
  for (const palette of themeLib.themePalettes) for (const variant of ['light','dark']) themeLib.applyThemeAppearance(root,variant,palette.id)
  themeLib.applyThemeAppearance(root,mode,'classic')
  assert.equal(Object.keys(themeLib.getThemePalette('classic').colors[mode]).length,Object.keys(baseline).length)
  for (const [key,value] of Object.entries(themeLib.getThemePalette('classic').colors[mode])) {
   assert.equal(value,baseline[key],`${mode}/${key}`)
   assert.equal(root.style.getPropertyValue('--'+key),baseline[key])
  }
 }
})

test('retired warm preferences resolve to Classic on cloud hydration and reload without changing light/dark mode', async () => {
 const f = preferenceFixture({cloud:new Map([['owner',{theme:'dark',themePalette:'amber'}]])})
 let reloaded
 try {
  await settlePreferences()
  assert.equal(f.store.themePalette,'classic');assert.equal(f.store.theme,'dark')
  reloaded = preferenceFixture({memory:f.memory,cloud:f.cloud})
  assert.equal(reloaded.store.themePalette,'classic')
  await settlePreferences()
  assert.equal(reloaded.store.themePalette,'classic');assert.equal(reloaded.store.theme,'dark')
  assert.equal(themeLib.getThemePalette('amber').id,'classic')
  assert.equal(themeLib.getThemePalette('sand').id,'classic')
  assert.equal(themeLib.isThemePaletteId('sand'),false)
  assert.equal(themeLib.isThemePaletteId('amber'),false)
 } finally { reloaded?.close();f.close() }
})

test('each new palette persists offline, reloads, and synchronizes without changing the selected light/dark mode', async () => {
 for (const themePalette of ['ruby','cobalt','graphite']) for (const theme of ['light','dark']) {
  const f=preferenceFixture({cloud:new Map([['owner',{theme,themePalette:'forest'}]])})
  let reloaded
  try {
   await settlePreferences();f.offline(true);f.store.themePalette=themePalette;await f.store.flushPreferences()
   reloaded=preferenceFixture({memory:f.memory,cloud:f.cloud})
   assert.equal(reloaded.store.themePalette,themePalette);assert.equal(reloaded.store.theme,theme)
   await settlePreferences();await reloaded.store.flushPreferences()
   assert.equal(reloaded.cloud.get('owner').themePalette,themePalette);assert.equal(reloaded.cloud.get('owner').theme,theme)
  } finally { reloaded?.close();f.close() }
 }
})
