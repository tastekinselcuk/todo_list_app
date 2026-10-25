const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function load(path, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, Request, Response, TextDecoder, ...globals })
  return exports
}
test('optional storage rejects corrupted and mismatched data and survives denied access and quota errors', () => {
  const memory = new Map([['bad','{'],['wrong','42'],['ui_language','unknown']])
  const storage = load('src/lib/storage.ts', { localStorage: { getItem: key => memory.get(key) ?? null, setItem() { throw Error('quota') } } })
  assert.deepEqual(Array.from(storage.readStoredJSON('bad',[],Array.isArray)),[])
  assert.deepEqual(Array.from(storage.readStoredJSON('wrong',[],Array.isArray)),[])
  assert.equal(storage.supportedLanguage(),'en')
  assert.equal(storage.writeStoredJSON('value',{text:'kept'}),false)
  assert.equal(load('src/lib/storage.ts').readStorage('value'),null)
})
test('email handler rejects anonymous calls and body-supplied recipients; only sends server content', async () => {
  const { reminderHandler } = load('supabase/functions/send-periodic-reminder/handler.ts')
  const calls = []
  const payload = {to:'verified@test.invalid',title:'Server title',notes:'',workspaceName:'Work',reminderTime:'12:00',category:'work'}
  const handler = reminderHandler({ authenticate: async token => token === 'valid' ? 'owner' : null,
    claim: async (...args) => { calls.push(['claim',...args]); return {status:'claimed',id:'delivery',lease:'lease',payload} },
    send: async (...args) => calls.push(['send',...args]), finish: async (...args) => calls.push(['finish',...args]) })
  const body = {taskId:'10000000-0000-0000-0000-000000000001',workspaceId:'20000000-0000-0000-0000-000000000002',timezone:'UTC'}
  const request = (data,token) => new Request('https://test.invalid',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(data)})
  assert.equal((await handler(request(body))).status,401)
  assert.equal((await handler(request({...body,to:'attacker@test.invalid'},'valid'))).status,400)
  assert.equal(calls.length,0)
  assert.equal((await handler(request(body,'valid'))).status,200)
  assert.deepEqual(calls[0],['claim','owner',body.taskId,body.workspaceId,'UTC'])
  assert.equal(calls[1][2],payload)
  assert.deepEqual(calls[2],['finish','delivery','lease',true])
})
test('failed email stays retryable and duplicate/busy deliveries do not send again',async()=>{
  const { reminderHandler }=load('supabase/functions/send-periodic-reminder/handler.ts')
  let status='claimed', sends=0; const finished=[]
  const handler=reminderHandler({authenticate:async()=> 'owner',claim:async()=>({status,id:'id',lease:'token',payload:{}}),
    send:async()=>{sends++;throw Error('provider')},finish:async(...args)=>finished.push(args)})
  const request=()=>new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({taskId:'10000000-0000-0000-0000-000000000001',workspaceId:'20000000-0000-0000-0000-000000000002',timezone:'UTC'})})
  assert.equal((await handler(request())).status,503)
  assert.deepEqual(finished,[['id','token',false]])
  status='delivered';assert.equal((await handler(request())).status,200)
  status='busy';assert.equal((await handler(request())).status,409)
  assert.equal(sends,1)
})
