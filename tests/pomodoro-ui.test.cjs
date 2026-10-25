const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {parse,compileScript}=require('@vue/compiler-sfc'),vue=require('vue'),pinia=require('pinia')

function fixture(options={}){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="app"><button id="origin">Open timer</button><main></main></div><aside inert="existing"></aside>',{url:'http://localhost/'}),doc=dom.window.document,runtime=require('@vue/runtime-dom')
 if(options.savedAppearance)dom.window.localStorage.setItem('pomodoro-focus-appearance-v1',JSON.stringify(options.savedAppearance))
 if(options.blockedStorage)Object.defineProperty(dom.window,'localStorage',{get(){throw Error('Storage blocked')}})
 const previous=new Map(['Document','ShadowRoot'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const key of previous.keys())globalThis[key]=dom.window[key]
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,namespace)=>namespace==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:value=>doc.createTextNode(value),createComment:value=>doc.createComment(value),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 const deps={vue:{...vue,Transition:(props,{slots})=>vue.h(vue.BaseTransition,{...props,onLeave(_element,done){Promise.resolve().then(done)}},slots)},'vue-i18n':{useI18n:()=>({t:key=>key})}}
 const media=[],images=[]
 class TestAudio{constructor(){media.push(this);this.paused=true;this.plays=0;this.currentTime=0;this.duration=NaN;this.readyState=0}play(){this.plays++;if(options.rejectAudio)return Promise.reject(Error('Playback blocked'));this.paused=false;return Promise.resolve()}pause(){this.paused=true}removeAttribute(name){if(name==='src')this.src=''}load(){}}
 class TestImage{constructor(){images.push(this)}set src(value){this.url=value;if(!options.manualImages)queueMicrotask(()=>this.onload?.())}removeAttribute(){this.url=''}}
 const evaluate=code=>{const exports={};vm.compileFunction(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require','document','window','HTMLElement','Node','Audio','Image','localStorage'])(exports,name=>deps[name]||require(name),doc,dom.window,dom.window.HTMLElement,dom.window.Node,TestAudio,TestImage,{getItem:key=>dom.window.localStorage.getItem(key),setItem:(key,value)=>dom.window.localStorage.setItem(key,value)});return exports}
 const compile=name=>evaluate(compileScript(parse(fs.readFileSync(`src/features/pomodoro/components/${name}.vue`,'utf8')).descriptor,{id:name,inlineTemplate:true}).content).default
 deps['@/lib/storage']=evaluate(fs.readFileSync('src/lib/storage.ts','utf8'))
 deps['../lib/focusEnvironment']=evaluate(fs.readFileSync('src/features/pomodoro/lib/focusEnvironment.ts','utf8'))
 deps['./PomodoroViewIcon.vue']={default:compile('PomodoroViewIcon')}
 let fullscreen=null,requests=0,exits=0,pending
 Object.defineProperty(doc,'fullscreenElement',{get:()=>fullscreen})
 const changed=()=>doc.dispatchEvent(new dom.window.Event('fullscreenchange'))
 if(options.native)dom.window.HTMLElement.prototype.requestFullscreen=function(settings){
  requests++;assert.equal(settings.navigationUI,'hide')
  if(options.reject)return Promise.reject(Error('Fullscreen denied'))
  const enter=()=>{fullscreen=this;changed()}
  if(options.pending)return new Promise(resolve=>pending=()=>{enter();resolve()})
  enter();return Promise.resolve()
 }
 doc.exitFullscreen=async()=>{exits++;fullscreen=null;changed()}
 deps['./PomodoroFocus.vue']={default:compile('PomodoroFocus')}
 const Focus=deps['./PomodoroFocus.vue'].default,props=vue.reactive({time:'25:00',mode:'Focus',nextLabel:'Next: Short break',durations:{focus:25,shortBreak:5,longBreak:15},targetTitle:undefined,running:false,remote:false,busy:false,canReset:false,progress:0}),events=[],configurations=[]
 let exposed
 const app=renderer.createApp({setup:()=>()=>vue.h(Focus,{...props,ref:value=>exposed=value,onToggle:()=>events.push('toggle'),onReset:()=>events.push('reset'),onNext:()=>events.push('next'),onConfigure:value=>{configurations.push(value);props.durations={...value}}})})
 app.mount(doc.querySelector('main'))
 const flush=async()=>{await vue.nextTick();await new Promise(setImmediate);await vue.nextTick()}
 return {dom,doc,deps,compile,renderer,app,props,events,configurations,flush,media,images,get screen(){return doc.querySelector('.pomodoro-focus')},get api(){return exposed},get requests(){return requests},get exits(){return exits},resolve:()=>pending?.(),nativeExit(){fullscreen=null;changed()},
  async open(){doc.getElementById('origin').focus();await exposed.open();await flush()},
  key(key,extra={}){const event=new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});doc.activeElement.dispatchEvent(event);return event},
  close(){app.unmount();dom.window.close();for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
 }
}

test('focus view falls back without fullscreen, isolates keyboard focus and restores the page on Escape',async()=>{
 const f=fixture();try{
  f.doc.body.style.overflow='auto';f.doc.documentElement.style.overflow='clip'
  await f.open();assert.ok(f.screen);assert.equal(f.screen.getAttribute('aria-modal'),'true');assert.equal(f.doc.getElementById('app').hasAttribute('inert'),true)
  assert.equal(f.doc.body.style.overflow,'hidden');assert.equal(f.doc.documentElement.style.overflow,'hidden')
  assert.equal(f.doc.activeElement,f.screen.querySelector('.focus-toggle'));assert.equal(f.screen.querySelectorAll('button').length,5)
  assert.equal(f.screen.querySelector('nav,input,select'),null);assert.equal(f.screen.querySelector('[role="timer"]').getAttribute('aria-live'),'off')
  const appearance=f.screen.querySelector('.focus-appearance'),next=f.screen.querySelector('.focus-next')
  assert.ok(f.screen.querySelector('.focus-exit [data-direction="inward"]'),'exit uses the matching four inward arrows')
  next.focus();assert.equal(f.key('Tab').defaultPrevented,true);assert.equal(f.doc.activeElement,appearance)
  appearance.focus();f.key('Tab',{shiftKey:true});assert.equal(f.doc.activeElement,next)
  f.screen.click();await f.flush();assert.ok(f.screen,'background clicks do not leave focus mode')
  f.key('Escape');await f.flush();assert.equal(f.screen,null);assert.equal(f.doc.body.style.overflow,'auto');assert.equal(f.doc.documentElement.style.overflow,'clip')
  assert.equal(f.doc.getElementById('app').hasAttribute('inert'),false);assert.equal(f.doc.querySelector('aside').getAttribute('inert'),'existing');assert.equal(f.doc.activeElement.id,'origin')
 }finally{f.close()}
})

test('native fullscreen opens only the focus surface and browser Escape closes the view without timer actions',async()=>{
 const f=fixture({native:true});try{
  await f.open();assert.equal(f.requests,1);assert.equal(f.doc.fullscreenElement,f.screen)
  f.nativeExit();await f.flush();assert.equal(f.screen,null);assert.equal(f.exits,0);assert.deepEqual(f.events,[]);assert.equal(f.doc.activeElement.id,'origin')
  await f.open();f.screen.querySelector('.focus-exit').click();await f.flush();assert.equal(f.exits,1);assert.equal(f.screen,null)
 }finally{f.close()}
})

test('denied fullscreen retains a usable reactive timer and blocks busy controls',async()=>{
 const f=fixture({native:true,reject:true});try{
  await f.open();assert.ok(f.screen);assert.equal(f.requests,1)
  f.props.time='24:58';f.props.running=true;f.props.canReset=true;await f.flush()
  assert.equal(f.screen.querySelector('.focus-time').textContent,'24:58');assert.match(f.screen.querySelector('.focus-toggle').textContent,/pomodoro.pause/)
  f.screen.querySelector('.focus-toggle').click();f.screen.querySelector('.focus-reset').click();assert.deepEqual(f.events,['toggle','reset'])
  f.props.busy=true;f.props.remote=true;f.props.mode='Short break';f.props.error='Could not save';await f.flush()
  f.screen.querySelector('.focus-toggle').click();f.screen.querySelector('.focus-reset').click();f.screen.querySelector('.focus-next').click();assert.equal(f.events.length,2)
  assert.match(f.screen.querySelector('.focus-toggle').textContent,/pomoNotes.continueHere/);assert.equal(f.screen.querySelector('.focus-mode').textContent,'Short break');assert.equal(f.screen.querySelector('[role="status"]').textContent,'Could not save')
  f.screen.querySelector('.focus-exit').click();await f.flush();assert.equal(f.screen,null,'exit remains available during a pending timer action')
 }finally{f.close()}
})

test('closing during a pending fullscreen request cleans up a late native entry and unmount restores inert state',async()=>{
 const f=fixture({native:true,pending:true});try{
  f.doc.getElementById('origin').focus();const opening=f.api.open();await f.flush();assert.ok(f.screen)
  f.api.close();await f.flush();assert.equal(f.screen,null);f.resolve();await opening;await f.flush();assert.equal(f.doc.fullscreenElement,null);assert.equal(f.exits,1)
  const next=f.api.open();await f.flush();f.resolve();await next;await f.flush();assert.ok(f.screen)
  f.app.unmount();await f.flush();assert.equal(f.doc.fullscreenElement,null);assert.equal(f.exits,2);assert.equal(f.doc.getElementById('app').hasAttribute('inert'),false);assert.equal(f.doc.body.style.overflow,'')
 }finally{f.close()}
})

test('the next-session arrow follows reset, updates its destination and keeps native fullscreen open',async()=>{
 const f=fixture({native:true});try{
  await f.open();const next=f.screen.querySelector('.focus-next')
  assert.equal(f.screen.querySelector('.focus-reset').nextElementSibling,next);assert.ok(next.querySelector('.lucide-chevrons-right-icon'))
  assert.equal(next.getAttribute('aria-label'),'Next: Short break');next.click();await f.flush();assert.deepEqual(f.events,['next']);assert.equal(f.doc.fullscreenElement,f.screen);assert.equal(f.exits,0)
  f.props.nextLabel='Next: Long break';await f.flush();assert.equal(next.title,'Next: Long break')
  f.props.remote=true;await f.flush();next.click();assert.equal(next.disabled,true);assert.equal(f.events.length,1)
  f.props.remote=false;f.props.busy=true;await f.flush();next.click();assert.equal(f.events.length,1)
 }finally{f.close()}
})

test('card and dock enter the same focus view without moving placement or restarting a running session',async()=>{
 const f=fixture();let app
 try{
  f.app.unmount();pinia.setActivePinia(pinia.createPinia())
  let initialized=0,shutdown=0,toggles=0,advances=0,configured=0
  const useTimer=pinia.defineStore('focus-ui',()=>{
   const time=vue.ref('24:57'),isRunning=vue.ref(true),durations=vue.ref({focus:25,shortBreak:5,longBreak:15}),modeKey=vue.ref('focus'),sessionSeconds=vue.ref(1500),canReset=vue.ref(true),remote=vue.ref(false),starting=vue.ref(false),clearing=vue.ref(false),error=vue.ref(''),completionSequence=vue.ref(0),currentTarget=vue.ref(null),progressPercentage=vue.ref(1)
   const nextMode=vue.computed(()=>modeKey.value==='focus'?'shortBreak':modeKey.value==='shortBreak'?'longBreak':'focus')
   return {formattedTime:time,isRunning,durations,modeKey,sessionSeconds,canReset,remote,starting,clearing,error,errorMessageKey:'failure',completionSequence,currentTarget,progressPercentage,nextMode,init(){initialized++},shutdown(){shutdown++},async toggleTimer(){toggles++;isRunning.value=!isRunning.value},async resetTimer(){time.value='25:00';isRunning.value=false},async advanceMode(){advances++;modeKey.value=nextMode.value;time.value=modeKey.value==='focus'?'25:00':modeKey.value==='shortBreak'?'05:00':'15:00';isRunning.value=false},setMode(){},configure(value){configured++;durations.value={...value}},clearFocus(){}}
  })
  const timer=useTimer(),placement=vue.ref(false),moves=[]
  f.deps['@/features/pomodoro/stores/pomodoro']={usePomodoroStore:useTimer,normalizeDurations:value=>value};f.deps['@/stores/ui']={useUIStore:()=>({addToast(){}})}
  f.deps['@/lib/navigationScroll']={workspaceHeaderHeight:56};f.deps['@/lib/utils']={isDialogBackdropDoubleClick:()=>false}
  const Timer=f.compile('PomodoroTimer')
  app=f.renderer.createApp({setup:()=>()=>vue.h(Timer,{docked:placement.value,onExpand:()=>{placement.value=true;moves.push('dock')},onCollapse:()=>{placement.value=false;moves.push('card')}})})
  app.config.globalProperties.$t=key=>key;app.mount(f.doc.querySelector('main'));await f.flush()
  const compact=f.doc.querySelector('[data-teleport="compact"]'),up=compact.querySelector('[aria-label="pomodoro.expandToNavbar"]')
  assert.ok(up.querySelector('.lucide-arrow-up-icon'));assert.ok(up.classList.contains('timer-dock-button'));assert.ok(compact.querySelector('.timer-fullscreen-button [data-direction="outward"]'))
  assert.ok(compact.querySelector('.pomodoro-card-time').classList.contains('text-primary'));assert.equal(compact.querySelector('.pomodoro-card-time').classList.contains('hover:text-primary'),false)
  timer.currentTarget={title:'Mesleki çalışma · Sistem tasarımı'};await f.flush()
  compact.querySelector('[aria-label="pomodoro.fullscreen"]').click();await f.flush();assert.ok(f.screen);assert.equal(timer.isRunning,true);assert.equal(timer.formattedTime,'24:57');assert.equal(placement.value,false)
  assert.equal(f.screen.querySelector('.focus-mode-label').textContent,timer.currentTarget.title);timer.modeKey='shortBreak';await f.flush();assert.equal(f.screen.querySelector('.focus-mode-label').textContent,'pomodoro.shortBreak');timer.modeKey='focus';await f.flush()
  f.screen.querySelector('.focus-exit').click();await f.flush();up.click();await f.flush();assert.equal(placement.value,true)
  f.doc.querySelector('[data-pomodoro-navigation] [aria-label="pomodoro.fullscreen"]').click();await f.flush();assert.ok(f.screen);assert.equal(placement.value,true)
  timer.formattedTime='24:55';await f.flush();assert.equal(f.screen.querySelector('.focus-time').textContent,'24:55')
  f.screen.querySelector('.focus-toggle').click();await f.flush();assert.equal(timer.isRunning,false);assert.equal(toggles,1)
  f.screen.querySelector('.focus-next').click();await f.flush();assert.ok(f.screen);assert.equal(timer.modeKey,'shortBreak');assert.equal(f.screen.querySelector('.focus-time').textContent,'05:00');assert.equal(placement.value,true)
  f.screen.querySelector('.focus-next').click();await f.flush();assert.equal(timer.modeKey,'longBreak');assert.equal(f.screen.querySelector('.focus-time').textContent,'15:00')
  f.screen.querySelector('.focus-next').click();await f.flush();assert.equal(timer.modeKey,'focus');assert.equal(f.screen.querySelector('.focus-time').textContent,'25:00');assert.equal(advances,3);assert.equal(shutdown,0)
  f.screen.querySelector('.focus-appearance').click();await f.flush();f.screen.querySelector('[data-settings-tab="duration"]').click();await f.flush();f.screen.querySelector('[data-duration-preset="extended"]').click();await f.flush();f.screen.querySelector('.focus-duration-apply').click();await f.flush();assert.equal(configured,1);assert.equal(timer.durations.focus,60);assert.ok(f.screen);f.key('Escape');await f.flush()
  f.key('Escape');await f.flush();assert.equal(f.screen,null);assert.equal(placement.value,true);assert.deepEqual(moves,['dock']);assert.equal(initialized,1);assert.equal(shutdown,0)
 }finally{app?.unmount();f.close()}
})

test('appearance puts backgrounds first and keeps the original remaining-time ring draining clockwise',async()=>{
 const f=fixture();try{
  await f.open();assert.equal(f.screen.getAttribute('data-counter'),'ring')
  const appearance=f.screen.querySelector('.focus-appearance');appearance.click();await f.flush()
  assert.equal(appearance.getAttribute('aria-expanded'),'true');assert.equal(f.screen.querySelector('.focus-font-choice,.focus-fonts,[data-number-font]'),null)
  const sections=[...f.screen.querySelectorAll('.focus-appearance-panel .focus-option-heading')];assert.deepEqual(sections.map(item=>item.textContent),['pomodoro.background','pomodoro.counterStyle'])
  f.screen.querySelector('.focus-counter-styles button:nth-child(2)').click();await f.flush()
  assert.equal(f.screen.getAttribute('data-counter'),'ring')
  assert.equal(f.screen.querySelector('.focus-ring-progress').getAttribute('stroke-dashoffset'),'0')
  f.props.progress=25;f.props.time='18:45';await f.flush();assert.equal(f.screen.querySelector('.focus-ring-progress').getAttribute('stroke-dashoffset'),'-25');assert.equal(f.screen.querySelector('[role="timer"]').getAttribute('aria-label'),'18:45');assert.equal(f.screen.querySelector('.focus-time').textContent,'18:45')
  for(const [value,expected]of [[50,'-50'],[75,'-75'],[120,'-100'],[-20,'0'],[NaN,'0']]){f.props.progress=value;await f.flush();assert.equal(f.screen.querySelector('.focus-ring-progress').getAttribute('stroke-dashoffset'),expected)}
  assert.deepEqual(JSON.parse(f.dom.window.localStorage.getItem('pomodoro-focus-appearance-v1')),{counter:'ring',background:'none',track:'piano',volume:.25});assert.deepEqual(f.events,[])
  f.key('Escape');await f.flush();assert.ok(f.screen);assert.equal(f.screen.querySelector('.focus-appearance-panel'),null);assert.equal(f.doc.activeElement,appearance)
  appearance.click();await f.flush();f.screen.querySelector('.focus-time').dispatchEvent(new f.dom.window.MouseEvent('pointerdown',{bubbles:true}));await f.flush();assert.equal(f.screen.querySelector('.focus-appearance-panel'),null)
  f.api.close();await f.flush();await f.open();assert.equal(f.screen.getAttribute('data-counter'),'ring');assert.equal(f.screen.querySelector('.focus-appearance-panel'),null)
 }finally{f.close()}
})

test('legacy typeface choices are ignored while other preferences and blocked storage remain supported',async()=>{
 for(const options of [{savedAppearance:{font:'serif',counter:'digital',background:'none',track:'rain',volume:.4}},{savedAppearance:{font:'mono',counter:'ring'}},{blockedStorage:true}]){
  const f=fixture(options);try{
   await f.open();assert.equal(f.screen.hasAttribute('data-number-font'),false);assert.equal(f.screen.getAttribute('data-counter'),options.savedAppearance?.counter||'ring')
   f.screen.querySelector('.focus-appearance').click();await f.flush();assert.equal(f.screen.querySelector('.focus-fonts'),null)
   f.screen.querySelector('.focus-counter-styles button:first-child').click();await f.flush();assert.equal(f.screen.getAttribute('data-counter'),'digital')
   if(!options.blockedStorage){const saved=JSON.parse(f.dom.window.localStorage.getItem('pomodoro-focus-appearance-v1'));assert.equal(Object.hasOwn(saved,'font'),false);assert.equal(saved.track,options.savedAppearance?.track||'piano');assert.equal(saved.volume,options.savedAppearance?.volume??.25)}
  }finally{f.close()}
 }
})

test('focus heading shows a bounded centered target and falls back to the session label',async()=>{
 const f=fixture();try{
  await f.open();assert.equal(f.screen.querySelector('.focus-mode-label').textContent,'Focus')
  f.props.targetTitle='  Mesleki çalışma   · Sistem tasarımı  ';await f.flush();const heading=f.screen.querySelector('.focus-mode')
  assert.equal(heading.classList.contains('has-target'),true);assert.equal(heading.textContent,'Mesleki çalışma · Sistem tasarımı')
  assert.ok(heading.querySelector('.focus-status-dot'),'focused notes keep their status dot')
  f.props.running=true;await f.flush();assert.equal(f.screen.getAttribute('data-running'),'true')
  f.props.remote=true;await f.flush();assert.equal(f.screen.getAttribute('data-running'),'false','a session running elsewhere does not light the local ring');f.props.remote=false
  const long='🧠 Konu '.repeat(40);f.props.targetTitle=long;await f.flush();assert.equal(heading.getAttribute('title'),long);assert.ok(Array.from(heading.textContent).length<=84);assert.ok(heading.textContent.endsWith('…'))
  f.props.targetTitle='  ';f.props.mode='Short break';await f.flush();assert.equal(heading.textContent,'Short break');assert.equal(heading.classList.contains('has-target'),false)
 }finally{f.close()}
})

test('backgrounds load only when chosen, keep contrast and reject stale image responses',async()=>{
 const f=fixture({manualImages:true});try{
  await f.open();assert.equal(f.images.length,0);assert.equal(f.media.length,0)
  f.screen.querySelector('.focus-appearance').click();await f.flush();assert.equal(f.screen.querySelectorAll('.focus-background-choice').length,5)
  f.screen.querySelector('[data-background="forest"]').click();await f.flush();const old=f.images[0],late=old.onload
  f.screen.querySelector('[data-background="ocean"]').click();await f.flush();assert.equal(f.images.length,2);late();await f.flush();assert.equal(f.screen.querySelector('.focus-scene'),null)
  f.images[1].onload();await f.flush();assert.ok(f.screen.querySelector('.focus-scene').src.endsWith('/focus/backgrounds/ocean.webp'));assert.equal(f.screen.classList.contains('has-background'),true);assert.ok(f.screen.querySelector('.focus-scene-scrim'))
  f.screen.querySelector('[data-background="rain"]').click();await f.flush();f.images[2].onerror();await f.flush();assert.ok(f.screen.querySelector('.focus-scene').src.endsWith('ocean.webp'));assert.match(f.screen.querySelector('[role="status"]').textContent,/backgroundFailed/)
  f.screen.querySelector('[data-background="rain"]').click();await f.flush();assert.equal(f.images.length,4,'selecting the same failed background retries its load');f.images[3].onload();await f.flush();assert.ok(f.screen.querySelector('.focus-scene').src.endsWith('rain.webp'))
  f.screen.querySelector('[data-background="none"]').click();await f.flush();assert.equal(f.screen.querySelector('.focus-scene'),null);assert.equal(f.screen.classList.contains('has-background'),false)
  assert.deepEqual(f.events,[])
 }finally{f.close()}
})

test('music requires a play action, supports track and volume choices and stops when focus closes',async()=>{
 const f=fixture();try{
  await f.open();f.screen.querySelector('.focus-appearance').click();await f.flush();f.screen.querySelector('.focus-settings-tabs button:nth-child(2)').click();await f.flush()
  assert.equal(f.screen.querySelectorAll('.focus-track-choice').length,5);assert.equal(f.media.length,0)
  f.screen.querySelector('[data-track="ambient"]').click();await f.flush();assert.equal(f.media.length,0,'choosing a track does not autoplay')
  f.screen.querySelector('.focus-music-toggle').click();await f.flush();assert.equal(f.media.length,1);const first=f.media[0];assert.equal(first.src,'/focus/audio/ambient.mp3');assert.equal(first.loop,true);assert.equal(first.volume,.25);assert.equal(first.paused,false)
  const slider=f.screen.querySelector('.focus-volume input');slider.value='60';slider.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await f.flush();assert.equal(first.volume,.6)
  f.screen.querySelector('[data-track="rhythm"]').click();await f.flush();assert.equal(first.paused,true);assert.equal(first.src,'');assert.equal(f.media[1].src,'/focus/audio/rhythm.mp3');assert.equal(f.media[1].volume,.6)
  assert.equal(f.screen.querySelector('a[href="https://creativecommons.org/licenses/by/4.0/"]').rel,'noopener noreferrer')
  f.dom.window.dispatchEvent(new f.dom.window.Event('pagehide'));await f.flush();assert.equal(f.media[1].paused,true);f.screen.querySelector('.focus-music-toggle').click();await f.flush();assert.equal(f.media[1].paused,false)
  f.api.close();await f.flush();assert.ok(f.media.every(item=>item.paused));assert.ok(f.media.every(item=>item.src===''));await f.open();assert.equal(f.media.length,2,'reopening never resumes music automatically')
  assert.deepEqual(f.events,[],'music controls do not mutate the focus session')
 }finally{f.close()}
})

test('music failures remain retryable and saved music preferences do not enable autoplay',async()=>{
 const f=fixture({rejectAudio:true,savedAppearance:{font:'mono',counter:'digital',background:'none',track:'piano',volume:.4}});try{
  await f.open();assert.equal(f.screen.getAttribute('data-counter'),'digital','an explicit saved counter choice is preserved');assert.equal(f.media.length,0)
  f.screen.querySelector('.focus-appearance').click();await f.flush();f.screen.querySelector('.focus-settings-tabs button:nth-child(2)').click();await f.flush();f.screen.querySelector('.focus-music-toggle').click();await f.flush()
  assert.match(f.screen.querySelector('[role="status"]').textContent,/musicFailed/);assert.match(f.screen.querySelector('.focus-music-toggle').textContent,/playMusic/)
  assert.equal(f.media[0].volume,.4);assert.equal(f.media[0].paused,true);f.screen.querySelector('.focus-music-toggle').click();await f.flush();assert.equal(f.media[0].plays,2)
 }finally{f.close()}
})

test('selected audio shows duration, supports scrubbing before play and keeps a drag stable across time events',async()=>{
 const f=fixture();try{
  await f.open();f.screen.querySelector('.focus-appearance').click();await f.flush();f.screen.querySelector('.focus-settings-tabs button:nth-child(2)').click();await f.flush()
  let slider=f.screen.querySelector('.focus-seek');assert.equal(f.screen.querySelectorAll('.focus-track-timeline').length,1);assert.ok(slider.closest('.is-selected'));assert.equal(slider.closest('button'),null)
  assert.equal(f.screen.querySelector('.focus-audio-times').textContent,'0:004:09');assert.equal(slider.getAttribute('aria-label'),'pomodoro.seekAudio')
  slider.value='127';slider.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await f.flush();assert.equal(f.media.length,0);assert.equal(f.screen.querySelector('.focus-audio-times span').textContent,'2:07')
  f.screen.querySelector('.focus-music-toggle').click();await f.flush();const media=f.media[0];media.readyState=1;media.duration=249;media.onloadedmetadata();await f.flush();assert.equal(media.currentTime,127)
  media.currentTime=130;media.ontimeupdate();await f.flush();assert.equal(Number(slider.value),130)
  slider.dispatchEvent(new f.dom.window.MouseEvent('pointerdown',{bubbles:true}));slider.value='180';slider.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await f.flush();assert.equal(media.currentTime,180)
  media.currentTime=181;media.ontimeupdate();await f.flush();assert.equal(Number(slider.value),180,'time updates do not move the thumb during a drag')
  slider.dispatchEvent(new f.dom.window.MouseEvent('pointerup',{bubbles:true}));await f.flush();assert.equal(Number(slider.value),181)
  f.screen.querySelector('.focus-music-toggle').click();await f.flush();slider.value='200';slider.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await f.flush();assert.equal(media.currentTime,200);assert.equal(media.paused,true);assert.equal(media.plays,1)
  f.screen.querySelector('[data-track="rain"]').click();await f.flush();slider=f.screen.querySelector('.focus-seek');assert.equal(Number(slider.value),0);assert.equal(f.media.length,1);assert.equal(media.src,'');assert.equal(f.screen.querySelector('.focus-audio-times').textContent,'0:000:45')
  assert.ok(f.screen.querySelector('.focus-media-credit').textContent.includes('Ylmir'));assert.ok(f.screen.querySelector('a[href="https://creativecommons.org/publicdomain/zero/1.0/"]'))
  f.screen.querySelector('.focus-music-toggle').click();await f.flush();assert.equal(f.media[1].src,'/focus/audio/rain.mp3');assert.equal(f.media[1].loop,true)
  f.screen.querySelector('[data-track="fireplace"]').click();await f.flush();assert.equal(f.media[1].paused,true);assert.equal(f.media[2].src,'/focus/audio/fireplace.mp3');assert.ok(f.screen.querySelector('.focus-media-credit').textContent.includes('PagDev'))
  f.api.close();await f.flush();assert.equal(f.media[2].ontimeupdate,null);assert.equal(f.media[2].onloadedmetadata,null);assert.deepEqual(f.events,[])
 }finally{f.close()}
})

test('focus duration settings share the existing presets and apply without closing fullscreen or restarting the session',async()=>{
 const f=fixture({native:true});try{
  await f.open();f.props.running=true;f.props.canReset=true;f.props.time='24:58';await f.flush()
  f.screen.querySelector('.focus-appearance').click();await f.flush();assert.equal(f.screen.querySelectorAll('.focus-settings-tabs button').length,3)
  f.screen.querySelector('[data-settings-tab="duration"]').click();await f.flush()
  assert.equal(f.screen.querySelectorAll('[data-duration-preset]').length,4);assert.equal(f.screen.querySelectorAll('.focus-duration-fields input').length,3)
  assert.equal(f.screen.querySelector('.focus-backgrounds'),null);assert.equal(f.screen.querySelector('.focus-counter-styles'),null);assert.equal(f.screen.querySelector('.focus-duration-apply').disabled,true)
  f.screen.querySelector('[data-duration-preset="medium"]').click();await f.flush();assert.equal(f.configurations.length,0)
  assert.deepEqual([...f.screen.querySelectorAll('.focus-duration-fields input')].map(input=>input.value),['40','8','20'])
  const input=f.screen.querySelector('[data-duration-field="focus"]');input.value='45';input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await f.flush()
  assert.match(f.screen.querySelector('.focus-duration-settings .focus-setting-hint').textContent,/durationRunningHint/)
  f.screen.querySelector('.focus-duration-apply').click();await f.flush();assert.deepEqual(f.configurations,[{focus:45,shortBreak:8,longBreak:20}])
  assert.equal(f.doc.fullscreenElement,f.screen);assert.equal(f.exits,0);assert.equal(f.screen.querySelector('.focus-time').textContent,'24:58');assert.deepEqual(f.events,[])
  assert.match(f.screen.querySelector('.focus-duration-apply').textContent,/durationApplied/);assert.equal(f.screen.querySelector('.focus-duration-apply').disabled,true)
  f.key('Escape');await f.flush();assert.ok(f.screen);assert.equal(f.screen.querySelector('.focus-appearance-panel'),null)
 }finally{f.close()}
})

test('duration inputs validate ranges and whole minutes, preserve unsaved edits and respect pending operations',async()=>{
 const f=fixture();try{
  await f.open();f.screen.querySelector('.focus-appearance').click();await f.flush();f.screen.querySelector('[data-settings-tab="sound"]').click();await f.flush();f.screen.querySelector('.focus-music-toggle').click();await f.flush()
  f.screen.querySelector('[data-settings-tab="duration"]').click();await f.flush()
  f.props.durations={focus:35,shortBreak:5,longBreak:15};await f.flush();assert.equal(f.screen.querySelector('[data-duration-field="focus"]').value,'35')
  async function enter(key,value){const input=f.screen.querySelector(`[data-duration-field="${key}"]`);input.value=value;input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));await f.flush();return input}
  for(const value of ['91','12.5','']){const input=await enter('focus',value);assert.equal(input.getAttribute('aria-invalid'),'true');assert.ok(f.screen.querySelector('[role="alert"]'));assert.equal(f.screen.querySelector('.focus-duration-apply').disabled,true)}
  await enter('focus','30');f.props.durations={focus:40,shortBreak:5,longBreak:15};await f.flush();assert.equal(f.screen.querySelector('[data-duration-field="focus"]').value,'30','external updates preserve an unsaved edit')
  await enter('shortBreak','0');assert.equal(f.screen.querySelector('.focus-duration-apply').disabled,true);await enter('shortBreak','6')
  await enter('longBreak','46');assert.equal(f.screen.querySelector('.focus-duration-apply').disabled,true);await enter('longBreak','20')
  assert.equal(f.screen.querySelector('[role="alert"]'),null);f.props.busy=true;await f.flush();f.screen.querySelector('.focus-duration-apply').click();assert.equal(f.configurations.length,0)
  f.props.busy=false;await f.flush();f.screen.querySelector('.focus-duration-apply').click();await f.flush();assert.deepEqual(f.configurations,[{focus:30,shortBreak:6,longBreak:20}]);assert.equal(f.media[0].paused,false,'applying durations does not interrupt background sound')
 }finally{f.close()}
})
