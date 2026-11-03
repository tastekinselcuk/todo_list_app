const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {parse,compileScript}=require('@vue/compiler-sfc'),vue=require('vue')
function fixture(){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main></main>',{url:'http://localhost/'}),doc=dom.window.document,runtime=require('@vue/runtime-dom')
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 dom.window.HTMLDialogElement.prototype.close=function(){if(this.open){this.removeAttribute('open');queueMicrotask(()=>this.dispatchEvent(new dom.window.Event('close')))}}
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,ns)=>ns==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:text=>doc.createTextNode(text),createComment:text=>doc.createComment(text),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 const deps={vue,'@/lib/workspaceScope':{useModuleLoad(){}},'@/lib/workspaceNavigation':{workspaceNavigationKey:Symbol(),workspaceActiveViewKey:Symbol()},'@/stores/workspaces':{useWorkspacesStore:()=>({sessionKey:'one'})},'@/stores/ui':{useUIStore:()=>({showConfirm:async()=>true})}}
 const evaluate=source=>{const exports={};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require','document','window','crypto'])(exports,name=>deps[name]||require(name),doc,dom.window,require('node:crypto').webcrypto);return exports}
 const tr=evaluate(fs.readFileSync('src/locales/tr.ts','utf8')).default
 const t=(key,args={})=>{let value=key.split('.').reduce((obj,k)=>obj?.[k],tr)||key;for(const[k,v]of Object.entries(args))value=value.replaceAll(`{${k}}`,String(v));return value}
 deps['vue-i18n']={useI18n:()=>({t,locale:vue.ref('tr')})}
 deps['../lib/finance']=evaluate(fs.readFileSync('src/features/finance/lib/finance.ts','utf8'))
 const actions=[],store=vue.reactive({month:'2026-11',summary:{currency:'TRY',income:5000,expense:1150,count:1,locked_currency:true,monthly:[],categories:[],allocation:[],quote_requests:[],portfolio:{count:0,cost:0,value:null,gain:null,missing:0,stale:0},schedules:[],uncategorized_expense:0,budget_categories:[{id:'snacks',name:'Aburcubur',budget:1000,spent:1150,budget_scope:'forward',version:1,budget_version:1,archived:false}]},transactions:[{id:'one',title:'Atıştırmalık',kind:'expense',category:'Aburcubur',category_id:'snacks',amount:1150,occurred_on:'2026-11-01',version:1}],positions:[],more:{transaction:false,position:false},filters:{search:'',kind:'',category:'',recurring:''},filtered:false,filteredTotals:{count:1,income:0,expense:1150},loading:false,saving:false,pricing:false,error:'',status:'ready',
  async load(){return true},async refreshPrices(){},async loadMore(){},async setFilters(filters){actions.push(['filters',filters]);Object.assign(this.filters,filters);this.filtered=Object.values(this.filters).some(Boolean)},
  async mutate(...args){actions.push(['mutate',...args]);return true},async mutateSchedule(...args){actions.push(['schedule',...args]);return true},
  async setBudget(...args){actions.push(['budget',...args]);this.summary.budget_categories[0].budget=args[1];return true},
  async mutateCategory(...args){actions.push(['category',...args]);return true}
 })
 deps['../stores/finance']={useFinanceStore:()=>store}
 deps['@/components/ui/CustomSelect.vue']={default:vue.defineComponent({props:['modelValue','options','disabled','ariaLabel','actionLabel'],emits:['update:modelValue','action'],setup:(props,{emit})=>()=>vue.h('span',[vue.h('select',{'aria-label':props.ariaLabel,value:props.modelValue,disabled:props.disabled,onChange:event=>emit('update:modelValue',event.target.value)},props.options.map(option=>vue.h('option',{value:option.value},option.label))),props.actionLabel?vue.h('button',{type:'button',onClick:()=>emit('action')},props.actionLabel):null])})}
 const compile=name=>evaluate(compileScript(parse(fs.readFileSync(`src/features/finance/components/${name}.vue`,'utf8')).descriptor,{id:name,inlineTemplate:true}).content).default
 for(const name of ['FinanceEntryForm','FinanceBudgets','FinanceTransactions'])deps[`./${name}.vue`]={default:compile(name)}
 const navigation=vue.ref(null),app=renderer.createApp(compile('FinanceTracker'));app.provide(deps['@/lib/workspaceNavigation'].workspaceNavigationKey,navigation);app.mount(doc.querySelector('main'))
 const flush=async()=>{await vue.nextTick();await new Promise(setImmediate);await vue.nextTick()}
 function input(element,value){element.value=value;element.dispatchEvent(new dom.window.Event('input',{bubbles:true}))}
 return {doc,dom,store,actions,flush,input,t,navigation,close(){app.unmount();dom.window.close()}}
}
test('budget UI shows overspend, filters transactions and preserves zero as an explicit limit',async()=>{
 const f=fixture();try{
  assert.match(f.doc.body.textContent,/150.*aşıldı/)
  assert.match(f.doc.body.textContent,/Aylık bütçeler/)
  f.doc.querySelector('button[aria-label="Bütçeleri düzenle"]').click();await f.flush()
  const dialog=f.doc.querySelector('.finance-budget-dialog');assert.equal(dialog.open,true)
  const amount=dialog.querySelector('input[inputmode="decimal"]');f.input(amount,'0')
  const scope=dialog.querySelector('select[aria-label="Uygulanacak dönem"]');assert.equal(scope.value,'month')
  dialog.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.flush()
  assert.deepEqual(f.actions.at(-1),['budget','snacks',0,'month',1]);assert.equal(dialog.open,false)
  const category=Array.from(f.doc.querySelectorAll('button')).find(button=>button.textContent==='Aburcubur')
  category.click();await f.flush();assert.equal(f.store.filters.category,'snacks');assert.equal(f.store.filters.kind,'expense')
  assert.match(f.doc.body.textContent,/Filtrelenen: 1 kayıt/)
 }finally{f.close()}
})
test('editing opens an accessible dialog and saves the category without modifying the quick-entry draft',async()=>{
 const f=fixture();try{
  const quick=f.doc.querySelector('main form');f.input(quick.querySelector('input[aria-label="Açıklama"]'),'Unfinished note')
  f.doc.querySelector('button[aria-label="Düzenle: Atıştırmalık"]').click();await f.flush()
  const dialog=f.doc.querySelector('.finance-edit-dialog');assert.equal(dialog.open,true)
  assert.equal(dialog.querySelector('select[aria-label="Kategori"]').value,'snacks')
  f.input(dialog.querySelector('input[aria-label="Tutar"]'),'1300,25')
  dialog.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.flush()
  const write=f.actions.find(action=>action[0]==='mutate')
  assert.equal(write[1],'transaction');assert.equal(write[2],'update');assert.equal(write[3],'one');assert.equal(write[4].category_id,'snacks');assert.equal(write[4].amount,1300.25)
  assert.equal(dialog.open,false)
  assert.equal(f.doc.querySelector('main form input[aria-label="Açıklama"]').value,'Unfinished note')
 }finally{f.close()}
})

test('finance relies on the upper workspace tabs and still receives investment and cashflow navigation',async()=>{
 const f=fixture();try{
  const toolbar=f.doc.querySelector('.workspace-toolbar')
  assert.equal(toolbar.querySelector('[role="group"]'),null,'there is no second copy of the cashflow and investment tabs')
  assert.ok(toolbar.querySelector('input[type="month"]'))
  f.navigation.value={module:'finance',view:'position',sequence:1};await f.flush()
  assert.equal(toolbar.querySelector('input[type="month"]'),null);assert.ok(f.doc.body.textContent.includes(f.t('finance.emptyPositions')))
  assert.equal(toolbar.querySelector('[role="group"]'),null)
  f.navigation.value={module:'finance',view:'transaction',sequence:2};await f.flush()
  assert.ok(toolbar.querySelector('input[type="month"]'));assert.ok(f.doc.querySelector('select[aria-label="'+f.t('finance.category')+'"]'))
 }finally{f.close()}
})
