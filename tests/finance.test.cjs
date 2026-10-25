const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
function load(path,globals={},dependencies={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>dependencies[name]||require(name),Request,Response,AbortSignal,Date,TextDecoder,console,...globals});return exports}
const lib=load('src/features/finance/lib/finance.ts')
test('finance parses decimal/grouped values without guessing malformed amounts and rejects invalid dates',()=>{
 for(const [input,expected] of [['1.234,56',1234.56],['1,234.56',1234.56],['1234,56',1234.56],['0',0],['10.20',10.2],['1.234',null],['12,34.56',null],['-10',null],['NaN',null],['1e10',null],['10₺',null],['',null]])assert.equal(lib.parseFinanceNumber(input),expected,input)
 assert.equal(lib.parseFinanceNumber('0.00000001',8),.00000001)
 assert.equal(lib.validFinanceDate('2026-02-30'),false);assert.equal(lib.validFinanceDate('2024-02-29'),true)
 assert.equal(lib.financeMonths('2026-10')[0],'2025-11-01');assert.equal(lib.financeMonths('2026-10').at(-1),'2026-10-01')
})
test('price handler rejects anonymous/private payloads and batches public FX/crypto requests with cached results',async()=>{
 const {financePricesHandler}=load('supabase/functions/finance-prices/handler.ts')
 const calls=[],saved=[],cached=[];const now=Date.parse('2026-10-12T12:00:00Z')
 const handler=financePricesHandler({authenticate:async token=>token==='ok',now:()=>now,cryptoKey:'server-secret',cached:async()=>cached,
  save:async quotes=>{saved.push(...quotes);cached.splice(0,cached.length,...quotes)},fetch:async(url,options)=>{
   calls.push({url,headers:options.headers})
   return new Response(JSON.stringify(url.includes('frankfurter')?[{date:'2026-10-12',quote:'USD',rate:.025},{date:'2026-10-12',quote:'EUR',rate:.02}]:{bitcoin:{try:3000000,last_updated_at:now/1000}}))
  }})
 const instruments=[{provider:'frankfurter',instrument:'USD'},{provider:'frankfurter',instrument:'EUR'},{provider:'coingecko',instrument:'bitcoin'}]
 const request=(body,token='ok')=>new Request('https://app.invalid',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)})
 assert.equal((await handler(request({currency:'TRY',instruments},''))).status,401)
 assert.equal((await handler(request({currency:'TRY',instruments,title:'Private note'}))).status,400)
 assert.equal((await handler(request({currency:'TRY',instruments:[{provider:'frankfurter',instrument:'https://evil.invalid'}]}))).status,400)
 const body=await(await handler(request({currency:'TRY',instruments}))).json()
 assert.equal(body.quotes.length,3);assert.equal(calls.length,2);assert.equal(saved.find(q=>q.instrument==='USD').price,40)
 assert.equal(calls.find(q=>q.url.includes('coingecko')).headers['x-cg-demo-api-key'],'server-secret')
 assert.ok(!JSON.stringify(body).includes('server-secret'))
 await handler(request({currency:'TRY',instruments}));assert.equal(calls.length,2,'fresh cache must avoid provider calls')
})
test('price failures retain stale cached quotes and report missing crypto setup without invented zero values',async()=>{
 const {financePricesHandler}=load('supabase/functions/finance-prices/handler.ts')
 const stale={provider:'frankfurter',instrument:'USD',currency:'TRY',price:40,price_at:'2020-01-01T00:00:00Z',fetched_at:'2020-01-01T00:00:00Z'}
 const handler=financePricesHandler({authenticate:async()=>true,cached:async()=>[stale],save:async()=>{},fetch:async()=>{throw Error('offline')}})
 const response=await handler(new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({currency:'TRY',instruments:[{provider:'frankfurter',instrument:'USD'},{provider:'coingecko',instrument:'bitcoin'}]})}))
 const body=await response.json()
 assert.equal(body.quotes.length,1);assert.equal(body.quotes[0].price,40)
 assert.ok(body.issues.includes('CRYPTO_SETUP_REQUIRED'));assert.ok(body.issues.includes('FX_UNAVAILABLE'))
})

test('live local metal and currency quotes are batched, use sell-back prices and keep grams distinct from coins',async()=>{
 const {financePricesHandler}=load('supabase/functions/finance-prices/handler.ts')
 const now=Date.parse('2026-10-13T12:00:00Z'),calls=[],saved=[],cache=[]
 const at=new Date(now).toISOString(),row=(alis,satis)=>({alis,satis,guncelleme:at})
 const handler=financePricesHandler({authenticate:async()=>true,marketKey:'private-market-key',now:()=>now,cached:async currency=>cache.filter(q=>q.currency===currency),
  save:async quotes=>{saved.push(...quotes);cache.push(...quotes)},fetch:async(url,options)=>{
   calls.push(String(url));assert.equal(options.headers['X-API-Key'],'private-market-key')
   return new Response(JSON.stringify({kalemler:{GRAM_ALTIN_TRY:row(6600,6700),GUMUS_TRY:row(90,95),CEYREK_YENI_TRY:row(10800,11000),USD_TRY:row(49,50),EUR_TRY:row(55,56)}}))
  }})
 const instruments=['XAU','XAG','GOLD_QUARTER','USD'].map(instrument=>({provider:'market',instrument}))
 const request=()=>new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({currency:'TRY',instruments})})
 const response=await handler(request()),body=await response.json()
 assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(body.issues.length,0)
 assert.equal(saved.find(q=>q.instrument==='XAU').price,6600,'local gram quotes must not be divided by troy-ounce grams again')
 assert.equal(saved.find(q=>q.instrument==='GOLD_QUARTER').metadata.unit,'piece')
 assert.equal(saved.find(q=>q.instrument==='USD').price,49);assert.equal(saved[0].metadata.basis,'buy')
 assert.ok(!JSON.stringify(body).includes('private-market-key'))
 await handler(request());assert.equal(calls.length,1,'fresh shared quotes must avoid another provider call')
 const cross=await (await handler(new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({currency:'EUR',instruments:[{provider:'market',instrument:'USD'}]})}))).json()
 assert.ok(Math.abs(cross.quotes[0].price-49/56)<1e-10)
 assert.equal(calls.length,2,'different display currencies use their own quotes')
})

test('keyless metal fallback converts troy ounces once and labels daily FX references without inventing local coin prices',async()=>{
 const {financePricesHandler}=load('supabase/functions/finance-prices/handler.ts')
 const now=Date.parse('2026-10-13T12:00:00Z'),saved=[]
 const handler=financePricesHandler({authenticate:async()=>true,now:()=>now,cached:async()=>[],save:async quotes=>saved.push(...quotes),fetch:async url=>new Response(JSON.stringify(String(url).includes('frankfurter')?[{quote:'USD',rate:1.25,date:'2026-10-13'}]:{symbol:'XAU',currency:'USD',price:3110.34768,updatedAt:new Date(now).toISOString()}))})
 const request=(currency,instruments)=>new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({currency,instruments})})
 const body=await (await handler(request('GBP',[{provider:'market',instrument:'XAU'},{provider:'market',instrument:'GOLD_QUARTER'}]))).json()
 assert.equal(body.quotes.length,1);assert.ok(Math.abs(body.quotes[0].price-80)<1e-8)
 assert.equal(body.quotes[0].metadata.quality,'reference');assert.ok(body.issues.includes('MARKET_SETUP_REQUIRED'))
 assert.ok(body.issues.includes('MARKET_INCOMPLETE'));assert.ok(body.issues.includes('MARKET_REFERENCE'))
 assert.equal((await handler(request('TRY',[{provider:'market',instrument:'https://evil.invalid'}]))).status,400)
})

function nativePriceFixture(fetcher) {
 let handler
 const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'private-service-key'}
 load('supabase/functions/finance-prices/index.ts',{
  URL,URLSearchParams,fetch:fetcher,Deno:{env:{get:key=>env[key]},serve:callback=>{handler=callback}},
 },{'./handler.ts':load('supabase/functions/finance-prices/handler.ts')})
 return handler
}

test('closed local markets retain the actual last-price timestamp and reuse the shared cache',async()=>{
 const {financePricesHandler}=load('supabase/functions/finance-prices/handler.ts')
 const now=Date.parse('2026-10-18T12:00:00Z'),at='2026-10-16T15:00:00Z',cached=[],calls=[]
 const handler=financePricesHandler({authenticate:async()=>true,marketKey:'server-only',now:()=>now,cached:async()=>cached,
  save:async quotes=>cached.splice(0,cached.length,...quotes),fetch:async url=>{
   calls.push(String(url));return new Response(JSON.stringify({piyasa:'durgun',kalemler:{GRAM_ALTIN_TRY:{alis:6600,satis:6700,guncelleme:at,bayat:true}}}))
  }})
 const request=()=>new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({currency:'TRY',instruments:[{provider:'market',instrument:'XAU'}]})})
 const body=await(await handler(request())).json()
 assert.equal(body.quotes[0].price,6600);assert.equal(Date.parse(body.quotes[0].price_at),Date.parse(at))
 assert.equal(body.quotes[0].metadata.market_status,'closed');assert.equal(body.quotes[0].metadata.quality,'reference')
 await handler(request());assert.equal(calls.length,1,'closed local quotes still use the one-minute cache')
 assert.ok(calls.every(url=>url.includes('hesaplialtin')),'closed local quotes must not silently switch to global spot prices')
})

test('the complete investment catalog fits one authenticated price batch',async()=>{
 const {financePricesHandler}=load('supabase/functions/finance-prices/handler.ts'),now=Date.now()
 const instruments=lib.investmentInstruments.map(item=>({provider:item.provider,instrument:item.instrument}))
 assert.equal(instruments.length,26)
 const handler=financePricesHandler({authenticate:async()=>true,now:()=>now,cached:async()=>instruments.map(q=>({...q,currency:'TRY',price:1,price_at:new Date(now).toISOString(),fetched_at:new Date(now).toISOString()})),
  save:async()=>assert.fail('fresh quotes must not be rewritten'),fetch:async()=>assert.fail('fresh quotes must not call providers')})
 const response=await handler(new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({currency:'TRY',instruments})}))
 assert.equal(response.status,200);assert.equal((await response.json()).quotes.length,26)
})

test('native price service verifies the caller before cache access and isolates service credentials from providers',async()=>{
 const calls=[],handler=nativePriceFixture(async(url,options)=>{
  url=String(url);calls.push({url,options})
  assert.ok(options.signal,'all network requests must have a timeout')
  if(url.includes('/auth/v1/user')) {
   assert.equal(options.headers.apikey,'public-key');assert.equal(options.headers.Authorization,'Bearer user-token')
   return new Response(JSON.stringify({id:'verified-user'}))
  }
  if(url.includes('api.frankfurter.dev')) {
   assert.ok(!JSON.stringify(options.headers).includes('private-service-key'))
   return new Response(JSON.stringify([{date:new Date().toISOString().slice(0,10),quote:'USD',rate:.025}]))
  }
  assert.equal(options.headers.apikey,'private-service-key');assert.equal(options.headers.Authorization,'Bearer private-service-key')
  const parsed=new URL(url)
  if(parsed.pathname==='/rest/v1/rpc/consume_edge_budget') {
   assert.deepEqual(JSON.parse(options.body),{uid:'verified-user',operation:'finance-prices'})
   return new Response('true')
  }
  if(parsed.pathname==='/rest/v1/finance_market_quotes') {
   assert.equal(parsed.searchParams.get('currency'),'eq.TRY');assert.equal(parsed.searchParams.get('instrument'),'in.(USD)')
   return new Response('[]')
  }
  assert.equal(parsed.pathname,'/rest/v1/rpc/finance_cache_quotes');assert.equal(options.method,'POST')
  const {items}=JSON.parse(options.body);assert.equal(items.length,1);assert.equal(items[0].price,40)
  return new Response(null,{status:204})
 })
 const request=()=>new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer user-token'},body:JSON.stringify({currency:'TRY',instruments:[{provider:'frankfurter',instrument:'USD'}]})})
 const response=await handler(request()),body=await response.json()
 assert.equal(response.status,200);assert.equal(body.quotes[0].price,40);assert.equal(calls.length,5)
 assert.ok(calls[0].url.endsWith('/auth/v1/user'));assert.ok(!JSON.stringify(body).includes('private-service-key'))
 const preflight=await handler(new Request('https://app.invalid',{method:'OPTIONS'}))
 assert.equal(preflight.status,204);assert.equal(calls.length,5,'CORS must not call auth or read cache')
})

test('native price service fails closed on rejected/unavailable authentication and rejects malformed JSON',async()=>{
 for(const status of [401,403,500]) {
  const calls=[],handler=nativePriceFixture(async(url)=>{calls.push(String(url));return new Response('{}',{status})})
  const response=await handler(new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer invalid'},body:'{}'}))
  assert.equal(response.status,status===500?503:401);assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/auth/v1/user'))
 }
 const handler=nativePriceFixture(async url=>new Response(String(url).includes('consume_edge_budget')?'true':JSON.stringify({id:'verified-user'})))
 const response=await handler(new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer valid'},body:'{broken'}))
 assert.equal(response.status,400)
})

function storeFixture() {
 const vue=require('vue'),workspace=vue.reactive({userId:'owner',activeId:'one',sessionKey:'owner:one'}),calls=[],rows=[]
 let gate,readFailed=false,store
 const summary=()=>({currency:'TRY',income:0,expense:rows.reduce((sum,row)=>sum+row.amount,0),count:rows.length,monthly:[],categories:[],allocation:[],quote_requests:[],
  schedules:[],locked_currency:rows.length>0,portfolio:{count:0,cost:0,value:null,priced_cost:0,gain:null,missing:0,stale:0}})
 const client={rpc(name,args){
   calls.push({name,args:structuredClone(args)})
   const data=name==='finance_load'?{summary:summary(),transactions:{items:structuredClone(rows),has_more:false,cursor:null},positions:{items:[],has_more:false,cursor:null}}:name==='finance_mutate'?{...args.payload,id:args.rid,version:1}:null
   const result=(async()=>{if(gate)await gate;if(name==='finance_load' && readFailed)return {error:{code:'NETWORK_ERROR'}}
    if(name==='finance_mutate')rows.push(data)
    return {data}})()
   result.abortSignal=()=>result
   return result
  },functions:{invoke:async()=>({data:{issues:[]}})}}
 const scope=vue.effectScope()
 scope.run(()=>{store=load('src/features/finance/stores/finance.ts',{}, {
  vue,'@/lib/workspaceScope':{defineWorkspaceStore:(_id,setup)=>()=>vue.reactive(setup())},
  '@/stores/workspaces':{useWorkspacesStore:()=>workspace},'@/lib/supabase':{supabase:client},'../lib/finance':lib,
 }).useFinanceStore()})
 return {store,workspace,calls,rows,close:()=>scope.stop(),failReads:()=>{readFailed=true},restoreReads:()=>{readFailed=false},hold(){let release;gate=new Promise(resolve=>release=resolve);return()=>{gate=null;release()}}}
}
test('a committed entry remains successful when its refresh fails, and refresh cannot duplicate the money entry',async()=>{
 const f=storeFixture()
 try {
  await f.store.load();f.failReads()
  const saved=await f.store.mutate('transaction','create','new-id',{title:'Market',kind:'expense',category:'Food',amount:10.20,occurred_on:'2026-10-12'})
  assert.equal(saved,true);assert.equal(f.rows.length,1);assert.equal(f.store.error,'refreshFailed')
  f.restoreReads();await f.store.load()
  assert.equal(f.store.summary.expense,10.2);assert.equal(f.calls.filter(c=>c.name==='finance_mutate').length,1)
  assert.equal(f.calls.filter(c=>c.name==='finance_load').length,3,'each refresh uses one RPC')
 }finally{f.close()}
})
test('a late finance response cannot populate another workspace and failed month changes hide old totals',async()=>{
 const f=storeFixture()
 try {
  const release=f.hold(),reading=f.store.load();f.workspace.sessionKey='owner:two';release()
  assert.equal(await reading,false);assert.equal(f.store.summary,null)
 }finally{f.close()}
 const second=storeFixture()
 try {
  await second.store.load();second.store.month='2026-09';second.failReads()
  await second.store.load();assert.equal(second.store.summary,null);assert.equal(second.store.transactions.length,0)
 }finally{second.close()}
})
test('finance analysis disables productivity queries and re-enabling reloads the report',async()=>{
 const vue=require('vue'),enabled=vue.ref(false),calls=[],scope=vue.effectScope()
 const use=load('src/features/analytics/composables/useAnalyticsReport.ts',{}, {
  vue:{...vue,onMounted(){},onBeforeUnmount(){}},'@/lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:{items:[]}}}}},
  '@/stores/workspaces':{useWorkspacesStore:()=>({userId:'owner',sessionKey:'owner:one'})},
  '../lib/focusService':{focusJournal:()=>({flush:async()=>{},pending:()=>[],storageFailed:false})},
  '../lib/reports':{reportRange:()=>({from:'2026-10-01',to:'2026-10-12',previousFrom:'2026-09-01',previousTo:'2026-09-12'})},
 }).useAnalyticsReport
 const options={workspace:vue.ref('one'),preset:vue.ref('month'),from:vue.ref('2026-10-01'),to:vue.ref('2026-10-12'),personal:vue.ref(true),timezone:vue.ref('UTC'),enabled}
 try {
  scope.run(()=>use(options));await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,0)
  enabled.value=true;await vue.nextTick();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,2)
  enabled.value=false;await vue.nextTick();options.workspace.value='two';await vue.nextTick();assert.equal(calls.length,2)
 }finally{scope.stop()}
})

function financeFormFixture(props) {
 const vue=require('vue'),{parse,compileScript}=require('@vue/compiler-sfc'),writes=[],events=[]
 const store=vue.reactive({saving:false,status:'ready',error:'',mutate:async(...args)=>{writes.push({method:'mutate',args});return true},mutateSchedule:async(...args)=>{writes.push({method:'schedule',args});return true},refreshPrices:async()=>{}})
 const script=compileScript(parse(fs.readFileSync('src/features/finance/components/FinanceEntryForm.vue','utf8')).descriptor,{id:'finance-form'}).content
 const exports={}
 vm.runInNewContext(ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console,Date,Intl,require:name=>({
  vue,'vue-i18n':{useI18n:()=>({t:key=>key})},'@/components/ui/CustomSelect.vue':{default:{}},
  '../stores/finance':{useFinanceStore:()=>store},'../lib/finance':lib,
 }[name]||require(name))})
 let state
 const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
 const app=renderer.createApp({setup(){state=exports.default.setup(vue.reactive({record:null,currency:'TRY',draftId:'stable-draft',...props}),{expose(){},emit:(...args)=>events.push(args)});return()=>vue.h('div')}})
 app.mount({})
 return {state,writes,events,close:()=>app.unmount()}
}
test('cash form saves its optional description without a category, and the recurring form targets a stable schedule ID',async()=>{
 const f=financeFormFixture({entity:'transaction'})
 try{
  f.state.amount.value='123,45';f.state.name.value='  Market  ';await f.state.save()
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].method,'mutate')
  assert.equal(f.writes[0].args[2],'stable-draft')
  assert.deepEqual(Object.keys(f.writes[0].args[3]).sort(),['amount','kind','occurred_on','title'])
  assert.equal(f.writes[0].args[3].title,'Market')
  assert.equal(f.writes[0].args[3].amount,123.45)
  f.state.cadence.value='monthly';f.state.name.value='Rent';await f.state.save()
  assert.equal(f.writes[1].method,'schedule');assert.equal(f.writes[1].args[1],'stable-draft')
  assert.equal(f.writes[1].args[2].title,'Rent');assert.equal(f.writes[1].args[2].cadence,'monthly')
  f.state.cadence.value='once';f.state.name.value=' ';await f.state.save();assert.equal(f.writes[2].args[3].title,'expense')
  const before=f.writes.length;f.state.amount.value='-1';await f.state.save();assert.equal(f.writes.length,before)
 }finally{f.close()}
})
test('investment categories filter instruments, clear incompatible values, and initialize from existing records',async()=>{
 const f=financeFormFixture({entity:'position'})
 try{
  assert.equal(f.state.category.value,'metal')
  assert.ok(f.state.instrumentOptions.value.every(option=>lib.investmentInstruments.find(item=>item.value===option.value).kind==='metal'))
  f.state.quantity.value='2';f.state.buyPrice.value='6500'
  f.state.category.value='forex'
  assert.equal(f.state.selection.value,'market:USD');assert.equal(f.state.quantity.value,'');assert.equal(f.state.buyPrice.value,'')
  assert.equal(f.state.instrumentOptions.value.length,8);assert.ok(!f.state.instrumentOptions.value.some(option=>option.value==='market:TRY'))
  f.state.category.value='tl';assert.equal(f.state.instrumentOptions.value.length,1);assert.equal(f.state.selection.value,'market:TRY')
  f.state.quantity.value='1000';f.state.buyPrice.value='1';await f.state.save()
  assert.equal(f.writes[0].args[3].instrument,'TRY');assert.equal(f.writes[0].args[3].price_source,'market')
  f.state.selection.value='market:XAU';await f.state.save();assert.equal(f.writes.length,1,'a stale instrument outside the category must not be saved')
 }finally{f.close()}
 for(const [kind,instrument,price_source,expected] of [['forex','EUR','market','forex'],['forex','TRY','market','tl'],['crypto','bitcoin','coingecko','crypto'],['stock','CUSTOM','manual','stock']]){
  const edit=financeFormFixture({entity:'position',record:{id:'edit',kind,instrument,price_source,title:'Existing',quantity:2,buy_price:1,purchased_on:'2026-10-01',version:1,manual_price:price_source==='manual'?2:null}})
  try{assert.equal(edit.state.category.value,expected);assert.ok(edit.state.instrumentOptions.value.some(option=>option.value===edit.state.selection.value))}finally{edit.close()}
 }
})

test('TRY uses identity pricing in TRY workspaces and labelled reference conversion in other currencies',async()=>{
 const {financePricesHandler}=load('supabase/functions/finance-prices/handler.ts'),now=Date.parse('2026-10-14T12:00:00Z'),calls=[]
 const handler=financePricesHandler({authenticate:async()=>true,now:()=>now,cached:async()=>[],save:async()=>{},fetch:async url=>{
  calls.push(String(url));return new Response(JSON.stringify([{quote:'TRY',rate:50,date:'2026-10-14'}]))
 }})
 const request=currency=>new Request('https://app.invalid',{method:'POST',headers:{authorization:'Bearer ok'},body:JSON.stringify({currency,instruments:[{provider:'market',instrument:'TRY'}]})})
 const identity=await(await handler(request('TRY'))).json();assert.equal(identity.quotes[0].price,1);assert.equal(calls.length,0)
 const converted=await(await handler(request('USD'))).json();assert.equal(converted.quotes[0].price,.02);assert.equal(converted.quotes[0].metadata.quality,'reference')
 assert.ok(calls[0].includes('quotes=try'))
})

test('investment form derives automatic provider and gram units from the chosen instrument without title or current-price entry',async()=>{
 const f=financeFormFixture({entity:'position'})
 try{
  assert.equal(f.state.selected.value.unit,'g');assert.equal(f.state.selected.value.instrument,'XAU')
  f.state.quantity.value='2';f.state.buyPrice.value='6500';await f.state.save()
  assert.equal(f.writes.length,1);const payload=f.writes[0].args[3]
  assert.equal(payload.price_source,'market');assert.equal(payload.kind,'metal');assert.equal(payload.instrument,'XAU')
  assert.equal(payload.manual_price,null);assert.equal(payload.quantity,2)
  f.state.category.value='crypto';f.state.selection.value='coingecko:bitcoin';f.state.quantity.value='0,1';f.state.buyPrice.value='3000000';await f.state.save()
  assert.equal(f.writes[1].args[3].price_source,'coingecko')
 }finally{f.close()}
})
