const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
function load(path) {
  const exports={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,Map,JSON,Math,Intl,console})
  return exports
}
const {FocusJournal,validFocusSession}=load('src/features/analytics/lib/focusJournal.ts')
const reports=load('src/features/analytics/lib/reports.ts')
function storage() {const entries=new Map();return {get length(){return entries.size},key:i=>[...entries.keys()][i]||null,getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)}}

test('corrupt active JSON is not a blocked-storage warning, while a failed write probe is',()=>{
 const cache=storage();cache.setItem('analytics-focus:owner:active:tab','{invalid JSON')
 const journal=new FocusJournal('owner',cache,'tab',async()=>{},()=>Date.now(),()=> 'id')
 assert.equal(journal.storageFailed,false,'malformed JSON does not prove localStorage is unavailable')
 assert.equal(cache.getItem('analytics-focus:owner:active:tab'),'{invalid JSON','preserve the original record for recovery')
 const blocked={...storage(),setItem(){throw Error('QuotaExceededError')}}
 const unavailable=new FocusJournal('owner',blocked,'tab',async()=>{},()=>Date.now(),()=> 'id')
 assert.equal(unavailable.storageFailed,true)
})

test('malformed cached timestamps are rejected without throwing or reporting blocked storage',()=>{
 const cache=storage(),value={id:'bad',workspace_id:'work',started_at:'2026-10-11T21:00:00Z',planned_seconds:60,revision:1,status:'ended',segments:[[123,null]]}
 assert.equal(validFocusSession(value),false)
 assert.equal(validFocusSession({...value,started_at:123,segments:[]}),false)
 cache.setItem('analytics-focus:owner:outbox:bad',JSON.stringify(value))
 const journal=new FocusJournal('owner',cache,'tab',async()=>{},()=>Date.now(),()=> 'unused')
 assert.equal(journal.pending().length,0);assert.equal(journal.storageFailed,false)
 assert.equal(cache.getItem('analytics-focus:owner:outbox:bad'),JSON.stringify(value))
})

test('a rejected legacy boundary is trimmed and uploaded without deleting other device data',async()=>{
 const cache=storage(),end='2026-10-11T21:31:22.856714+00:00'
 const broken={id:'session',workspace_id:'work',started_at:'2026-10-11T21:31:17.063+00:00',planned_seconds:1500,revision:9,status:'ended',association:'free',segments:[['2026-10-11T21:31:19.085511+00:00',end],['2026-10-11T21:31:22.856Z','2026-10-11T21:31:22.900Z']]}
 cache.setItem('analytics-focus:owner:outbox:session',JSON.stringify(broken));cache.setItem('other-module-draft','preserved')
 assert.equal(validFocusSession(broken),false,'SQL and browser validators must agree on microsecond overlap')
 const sent=[],journal=new FocusJournal('owner',cache,'tab',async value=>sent.push(value),()=>Date.now(),()=> 'new')
 const recovered=journal.pending()[0];assert.equal(recovered.revision,10);assert.equal(recovered.segments[1][0],end);assert.equal(recovered.started_at,broken.started_at)
 await journal.flush();assert.equal(sent.length,1);assert.equal(journal.pending().length,0);assert.equal(cache.getItem('other-module-draft'),'preserved')
})

test('a permanently rejected session remains available while valid sessions behind it synchronize',async()=>{
 const cache=storage(),good=[],now=Date.parse('2026-10-11T21:00:00Z')
 for(const id of ['bad','good'])cache.setItem(`analytics-focus:owner:outbox:${id}`,JSON.stringify({id,workspace_id:'work',started_at:new Date(now).toISOString(),planned_seconds:60,revision:1,status:'ended',segments:[]}))
 const journal=new FocusJournal('owner',cache,'tab',async value=>{if(value.id==='bad')throw Error('INVALID_FOCUS_SESSION');good.push(value.id)},()=>now,()=> 'unused')
 await journal.flush();assert.deepEqual(good,['good']);assert.equal(journal.pending().length,1);assert.equal(journal.pending()[0].id,'bad')
 assert.equal(journal.lastSyncError,'INVALID_FOCUS_SESSION');assert.equal(journal.storageFailed,false)
})

test('repairing a running legacy pointer pauses it and resumes without recreating the overlap',()=>{
 const cache=storage();let clock=Date.parse('2026-10-11T21:31:22.950Z')
 const session={id:'session',workspace_id:'work',started_at:'2026-10-11T21:31:17.063Z',planned_seconds:1500,revision:9,status:'running',segments:[['2026-10-11T21:31:19.085511Z','2026-10-11T21:31:22.856714Z'],['2026-10-11T21:31:22.856Z','2026-10-11T21:31:22.900Z']]}
 cache.setItem('analytics-focus:owner:active:tab',JSON.stringify({session,openStart:Date.parse('2026-10-11T21:31:22.856Z'),deadline:clock+1500000}))
 const journal=new FocusJournal('owner',cache,'tab',async()=>{},()=>clock,()=> 'unused')
 assert.equal(journal.session.status,'paused');assert.equal(journal.deadline,null)
 journal.start('another-workspace',1500);clock+=100;journal.pause()
 assert.equal(validFocusSession(journal.session),true);assert.equal(journal.session.workspace_id,'work')
 assert.equal(journal.session.segments[1][0],'2026-10-11T21:31:22.856714Z')
})

test('successful tiny probe does not hide a quota failure for pending offline records',async()=>{
 const cache=storage(),write=cache.setItem
 cache.setItem=(key,value)=>{if(value.length>100)throw Error('QuotaExceededError');write(key,value)}
 const journal=new FocusJournal('owner',cache,'tab',async()=>{throw Error('OFFLINE')},()=>Date.now(),()=> 'session')
 journal.start('work',60);assert.equal(journal.storageFailed,true)
 await journal.flush();assert.equal(journal.storageFailed,true);assert.equal(journal.pending().length,1)
 assert.equal(journal.lastSyncError,'OFFLINE')
})
test('focus pause excludes idle time, preserves the starting workspace and recovers after reload',async()=>{
  const cache=storage(),sent=[];let clock=Date.parse('2026-10-01T20:55:00Z')
  let journal=new FocusJournal('owner',cache,'tab',async value=>sent.push(value),()=>clock,()=> 'session')
  journal.start('work',1500);clock+=600000;journal.pause()
  assert.equal(journal.remaining,900)
  clock+=3600000
  journal=new FocusJournal('owner',cache,'tab',async value=>sent.push(value),()=>clock,()=> 'other')
  assert.equal(journal.remaining,900)
  journal.start('personal',1500);clock+=900000;journal.checkpoint();await journal.flush()
  const last=sent[sent.length-1]
  assert.equal(last.workspace_id,'work');assert.equal(last.status,'completed')
  assert.equal(last.segments.reduce((sum,[a,b])=>sum+Date.parse(b)-Date.parse(a),0),1500000)
  assert.equal(journal.pending().length,0)
})
test('failed uploads survive reload; overlapping tabs keep independent outbox records and users isolated',async()=>{
  const cache=storage();let clock=Date.parse('2026-10-02T08:00:00Z'),network=false
  const write=async()=>{if(!network)throw Error('OFFLINE')}
  const a=new FocusJournal('owner',cache,'a',write,()=>clock,()=> 'a')
  const b=new FocusJournal('owner',cache,'b',write,()=>clock,()=> 'b')
  a.start('work',1500);b.start('work',1500);clock+=60000;a.end();b.pause()
  await a.flush();assert.equal(a.pending().length,2)
  assert.equal(new FocusJournal('other',cache,'a',write,()=>clock).pending().length,0)
  const reloaded=new FocusJournal('owner',cache,'a',write,()=>clock)
  assert.equal(reloaded.pending().length,2);network=true;await reloaded.flush();assert.equal(reloaded.pending().length,0)
})
test('a newer checkpoint is retained while an older snapshot is being uploaded',async()=>{
  const cache=storage();let clock=Date.parse('2026-10-03T08:00:00Z'),release
  const journal=new FocusJournal('owner',cache,'tab',()=>new Promise(resolve=>{release=resolve}),()=>clock,()=> 'session')
  journal.start('work',1500);clock+=15000;journal.checkpoint()
  const flushing=journal.flush();clock+=15000;journal.checkpoint();release();await flushing
  assert.equal(journal.pending().length,1);assert.equal(journal.pending()[0].segments[0][1],new Date(clock).toISOString())
})
test('many fractional pauses do not inflate the planned duration',()=>{
  const cache=storage();let clock=Date.parse('2026-10-04T08:00:00Z')
  const journal=new FocusJournal('owner',cache,'tab',async()=>{},()=>clock,()=> 'session')
  journal.start('work',600)
  for(let i=0;i<20;i++){clock+=649;journal.pause();clock+=10000;journal.start('other',600)}
  clock=journal.deadline;journal.checkpoint()
  assert.equal(journal.session.segments.reduce((sum,[a,b])=>sum+Date.parse(b)-Date.parse(a),0),600000)
})
test('date windows use the reporting timezone and compare an equal number of elapsed days',()=>{
  const range=reports.reportRange('week','Europe/Istanbul',new Date('2026-10-11T22:10:00Z'))
  assert.equal(range.from,'2026-10-12');assert.equal(range.to,'2026-10-12');assert.equal(range.length,1)
  assert.equal(reports.dayDistance(range.previousFrom,range.previousTo)+1,range.length)
  assert.equal(reports.validDay('2026-02-30'),false)
  assert.throws(()=>reports.reportRange('custom','UTC',new Date('2026-10-11T10:00:00Z'),'2026-10-12','2026-10-13'),/INVALID_DATE_RANGE/)
})
test('backlog age buckets count unique open notes with calendar day boundaries',()=>{
  const today='2026-10-11',items=[0,7,8,30,31,90,91].map((age,index)=>({record_id:String(index),item_created_at:reports.shiftDay(today,-age)+'T21:00:00Z',completed:false}))
  const utc=reports.ageBuckets(items,today,'UTC')
  assert.deepEqual(Array.from(utc,b=>b.count),[2,2,2,1])
  const tr=reports.ageBuckets(items,today,'Europe/Istanbul')
  assert.deepEqual(Array.from(tr,b=>b.count),[3,2,2,0])
  assert.equal(reports.percentChange(10,0),null)
})
