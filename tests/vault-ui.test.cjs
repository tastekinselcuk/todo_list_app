const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),vue=require('vue')
const {parse,compileScript}=require('@vue/compiler-sfc'),{JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto')
function fixture(file,extra={}){
 const dom=new JSDOM('<main></main>',{url:'https://app.test'}),doc=dom.window.document,runtime=require('@vue/runtime-dom')
 const previousDocument=global.Document;global.Document=dom.window.Document
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false}
 const renderer=vue.createRenderer({...runtime.nodeOps,patchProp:runtime.patchProp,createElement:(tag,ns)=>ns==='svg'?doc.createElementNS('http://www.w3.org/2000/svg',tag):doc.createElement(tag),createText:text=>doc.createTextNode(text),createComment:text=>doc.createComment(text),querySelector:selector=>doc.querySelector(selector),insertStaticContent(content,parent,anchor){const template=doc.createElement('template');template.innerHTML=content;const first=template.content.firstChild,last=template.content.lastChild;parent.insertBefore(template.content,anchor);return[first,last]}})
 const deps={vue,'vue-i18n':{useI18n:()=>({t:key=>key})},...extra}
 const evaluate=source=>{const exports={};vm.compileFunction(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,['exports','require','document','window','navigator','crypto'])(exports,name=>deps[name]||require(name),doc,dom.window,dom.window.navigator,webcrypto);return exports}
 deps['@/lib/vaultCrypto']=evaluate(fs.readFileSync('src/lib/vaultCrypto.ts','utf8'))
 const compiled=evaluate(compileScript(parse(fs.readFileSync(file,'utf8')).descriptor,{id:'vault-ui',inlineTemplate:true}).content).default
 const app=renderer.createApp(compiled);app.config.globalProperties.$t=key=>key
 const instance=app.mount(doc.querySelector('main'))
 const flush=async()=>{await vue.nextTick();await new Promise(resolve=>setTimeout(resolve,5));await vue.nextTick()}
 const until=async condition=>{const deadline=Date.now()+10000;while(!condition()){if(Date.now()>deadline)throw Error('UI did not settle');await flush()}}
 const input=(element,value)=>{element.value=value;element.dispatchEvent(new dom.window.Event('input',{bubbles:true}))}
 return {doc,dom,instance,flush,until,input,cryptoApi:deps['@/lib/vaultCrypto'],close:()=>{app.unmount();dom.window.close();global.Document=previousDocument}}
}
test('notice is unchecked and persists once on the server',async()=>{
 let accepted=false,accepts=0
 const auth={user:{id:'owner'}},rpc=async name=>name==='vault_acknowledged'?{data:accepted,error:null}:(accepts++,accepted=true,{error:null})
 const deps={'@/lib/supabase':{supabase:{rpc}},'@/stores/auth':{useAuthStore:()=>auth}}
 const first=fixture('src/features/secure_notes/components/VaultNotice.vue',deps)
 try{
  await first.until(()=>first.doc.querySelector('input'))
  assert.equal(first.doc.querySelector('input').checked,false);assert.equal(first.doc.querySelector('button').disabled,true)
  first.doc.querySelector('input').checked=true;first.doc.querySelector('input').dispatchEvent(new first.dom.window.Event('change',{bubbles:true}));await first.flush()
  first.doc.querySelector('button').click();await first.flush();assert.equal(accepts,1);assert.equal(first.doc.querySelector('section'),null)
 }finally{first.close()}
 const second=fixture('src/features/secure_notes/components/VaultNotice.vue',deps)
 try{await second.flush();assert.equal(second.doc.querySelector('section'),null);assert.equal(accepts,1)}finally{second.close()}
})
test('vault management removes reset and keeps deletion behind explicit confirmation',async()=>{
 const Select={props:['modelValue','options'],setup:props=>()=>vue.h('select',{'aria-label':'actions'},props.options.map(item=>vue.h('option',{value:item.value},item.label)))}
 const f=fixture('src/features/secure_notes/components/VaultManager.vue',{'@/lib/workspaceScope':{useWorkspaceClient:()=>({})},'../lib/vaultApi':{vaultSecurity(){},downloadVaultFile(){}},'@/components/ui/CustomSelect.vue':{default:Select}})
 try{
  const session={id:'vault',name:'Work',password_hash:'{"format":"todo-vault-v2"}',version:1}
  f.instance.open('password',session);await f.flush()
  const actions=[...f.doc.querySelectorAll('option')].map(option=>option.value)
  assert.equal(actions.includes('reset'),false);assert.ok(actions.includes('delete'));assert.ok(actions.includes('backup'))
  f.instance.open('delete',session);await f.flush()
  assert.equal(f.doc.querySelectorAll('input[type="password"]').length,0)
  assert.equal(f.doc.querySelector('footer .workspace-add-button').disabled,true)
  const checkbox=f.doc.querySelector('input[type="checkbox"]');checkbox.checked=true;checkbox.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));await f.flush()
  assert.equal(f.doc.querySelector('footer .workspace-add-button').disabled,false)
 }finally{f.close()}
})
test('backup export uses a separate file password and never changes or embeds the recovery key',async()=>{
 const downloads=[],rows=[],client={from:()=>({select(){return this},eq(){return this},order(){return this},range:async()=>({data:rows,error:null})})}
 const f=fixture('src/features/secure_notes/components/VaultManager.vue',{'@/lib/workspaceScope':{useWorkspaceClient:()=>client},'../lib/vaultApi':{vaultSecurity:async()=>{throw Error('Export does not require email')},downloadVaultFile:(...args)=>downloads.push(args)},'@/components/ui/CustomSelect.vue':{default:{render:()=>null}}})
 try{
  const sealed=await f.cryptoApi.createRecoverableVault('original vault password')
  rows.push({id:'record',session_id:'vault',encrypted_payload:await f.cryptoApi.encryptVaultValue(sealed.key,{title:'Saved record',type:'secret',content:'Snapshot content'},'vault:record')})
  f.instance.open('backup',{id:'vault',name:'Work',password_hash:sealed.metadata,version:1});await f.flush()
  const fields=[...f.doc.querySelectorAll('input[type="password"]')]
  assert.equal(fields.length,3)
  f.input(fields[0],'original vault password');f.input(fields[1],'independent file password');f.input(fields[2],'independent file password')
  f.doc.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}))
  await f.until(()=>downloads.length)
  assert.equal(downloads[0][1],'pomodolist-backup.pvault')
  const snapshot=await f.cryptoApi.decryptVaultBackup('independent file password',downloads[0][0])
  assert.equal(snapshot.records[0].content,'Snapshot content')
  await assert.rejects(f.cryptoApi.decryptVaultBackup('original vault password',downloads[0][0]))
  assert.equal(downloads[0][0].includes(sealed.recoveryCode),false)
  const reopened=await f.cryptoApi.recoverVault('new original password',sealed.metadata,sealed.recoveryCode)
  assert.equal((await f.cryptoApi.decryptVaultValue(reopened.key,rows[0].encrypted_payload,'vault:record')).content,'Snapshot content')
 }finally{f.close()}
})
test('a late acknowledgement lookup cannot open a new account vault',async()=>{
 const auth=vue.reactive({user:{id:'first'}}),pending={}
 const f=fixture('src/features/secure_notes/components/VaultNotice.vue',{'@/lib/supabase':{supabase:{rpc:async(name,args)=>new Promise(resolve=>pending[args.uid]=resolve)}},'@/stores/auth':{useAuthStore:()=>auth}})
 try{
  auth.user={id:'second'};await f.flush();pending.second({data:false,error:null});await f.flush()
  pending.first({data:true,error:null});await f.flush()
  assert.ok(f.doc.querySelector('section'));assert.equal(f.doc.querySelector('input').checked,false)
 }finally{f.close()}
})
test('new vault creation requires matching passwords, sends only ciphertext, and requires recovery acknowledgement before closing',async()=>{
 const writes=[],client={from:()=>({insert(value){writes.push(value);return{select:async()=>({data:[{id:'vault'}],error:null})}}})}
 const f=fixture('src/features/secure_notes/components/VaultManager.vue',{'@/lib/workspaceScope':{useWorkspaceClient:()=>client},'../lib/vaultApi':{vaultSecurity:async()=>{throw Error('Unexpected email')},downloadVaultFile(){}},'@/components/ui/CustomSelect.vue':{default:{render:()=>null}}})
 try{
  f.instance.open('create',null,'Work');await f.flush()
  const inputs=[...f.doc.querySelectorAll('input')]
  f.input(inputs[1],'a very long password');f.input(inputs[2],'a different password')
  f.doc.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));await f.flush()
  assert.equal(writes.length,0);assert.match(f.doc.querySelector('[role="alert"]').textContent,/passwordMismatch/)
  f.input(inputs[2],'a very long password')
  f.doc.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}))
  await f.until(()=>f.doc.querySelector('code'))
  assert.equal(writes.length,1);assert.equal(JSON.stringify(writes).includes('a very long password'),false)
  const code=f.doc.querySelector('code').textContent;assert.match(code,/^PV2-/);assert.equal(JSON.stringify(writes).includes(code),false)
  assert.equal(JSON.parse(writes[0][0].password_hash).format,'todo-vault-v2')
  assert.equal(f.doc.querySelector('.workspace-add-button').disabled,true)
  f.doc.querySelector('dialog').dispatchEvent(new f.dom.window.Event('cancel',{cancelable:true}));await f.flush();assert.equal(f.doc.querySelector('dialog').open,true)
  const checkbox=f.doc.querySelector('input[type="checkbox"]');checkbox.checked=true;checkbox.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));await f.flush()
  f.doc.querySelector('.workspace-add-button').click();await f.flush();assert.equal(f.doc.querySelector('dialog').open,false);assert.equal(f.doc.querySelector('code'),null)
 }finally{f.close()}
})
