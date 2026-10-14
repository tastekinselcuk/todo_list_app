const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const { webcrypto } = require('node:crypto')
const { parse,compileScript } = require('@vue/compiler-sfc')
const vue = require('vue')
const cryptoApi = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/vaultCrypto.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  { exports:cryptoApi,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,Uint8Array,JSON })
test('vault encrypts every sensitive field, uses random IVs and non-extractable keys', async () => {
  const { key,metadata } = await cryptoApi.createVaultKey('correct horse battery staple')
  assert.equal(key.extractable,false)
  assert.equal(metadata.includes('correct horse'),false)
  const note={title:'Bank password',username:'private-user',password_encrypted:'private-password',content:'private-content'}
  const first=await cryptoApi.encryptVaultValue(key,note,'vault:note')
  const second=await cryptoApi.encryptVaultValue(key,note,'vault:note')
  assert.notEqual(first.iv,second.iv)
  assert.notEqual(first.ciphertext,second.ciphertext)
  assert.equal(JSON.stringify(first).includes('private'),false)
  const unlocked=await cryptoApi.unlockVaultKey('correct horse battery staple',metadata)
  assert.deepEqual(JSON.parse(JSON.stringify(await cryptoApi.decryptVaultValue(unlocked,first,'vault:note'))),note)
  await assert.rejects(cryptoApi.unlockVaultKey('wrong password',metadata))
  await assert.rejects(cryptoApi.decryptVaultValue(unlocked,first,'another-vault:note'))
  await assert.rejects(cryptoApi.decryptVaultValue(unlocked,{...first,ciphertext:'AA'+first.ciphertext.slice(2)},'vault:note'))
  await assert.rejects(webcrypto.subtle.exportKey('raw',key))
})
test('shared plan dates follow the collection calendar across different client timezones', () => {
  const api={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/plans/lib/periods.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,Date,Intl})
  const date=new Date('2026-10-11T22:30:00Z')
  assert.equal(api.periodStart('daily',date,'Europe/Istanbul'),'2026-10-12')
  assert.equal(api.periodStart('weekly',date,'Europe/Istanbul'),'2026-10-12')
  assert.equal(api.periodStart('daily',date,'America/Los_Angeles'),'2026-10-11')
  assert.equal(api.firstPopulatedPeriod([{period:'weekly',period_date:'2026-10-12'}],date,'Europe/Istanbul'),'weekly')
})

function vaultView() {
  const sessions=[{id:'vault',name:'Personal',password_hash:'old-password',version:1,created_at:'2026-01-01'}]
  const notes=[{id:'note',session_id:'vault',version:1,title:'Original',type:'secret',content:'Private content'}]
  const calls=[],toasts=[], listeners={}
  let fail=false,gate,entered
  const client={
    collection(){return 'secure-collection'},
    listen(callbacks){Object.assign(listeners,callbacks)},
    async sealVault(id,previousHash,metadata,encryptedNotes,version,name){
      calls.push(['seal',previousHash,metadata,encryptedNotes]); entered?.()
      if(gate) await gate
      const session=sessions.find(s=>s.id===id)
      assert.equal(version,session.version)
      encryptedNotes.forEach(n=>Object.assign(notes.find(row=>row.id===n.id),n,{title:'Encrypted note',content:null,version:n.version+1}))
      Object.assign(session,{password_hash:metadata,name,version:session.version+1})
      return structuredClone(session)
    },
    from(table){
      let op='select',payload,single=false,id
      const rows=table==='password_sessions'?sessions:notes
      const q={select(){return q},order(){return q},eq(key,value){if(key==='id')id=value;return q},
        update(value){op='update';payload=value;return q},insert(value){op='insert';payload=value;return q},single(){single=true;return q},
        then(resolve,reject){return (async()=>{
          if(fail&&op!=='select')return {data:null,error:{message:'Offline'}}
          if(op==='update'){Object.assign(rows.find(row=>row.id===id),payload);calls.push(['update',payload])}
          if(op==='insert'){rows.push(...payload);calls.push(['insert',payload])}
          const data=structuredClone(id?rows.filter(row=>row.id===id):rows)
          return {data:single?data[0]:data,error:null}
        })().then(resolve,reject)}
      };return q
    }
  }
  const exports={}
  const descriptor=parse(fs.readFileSync('src/features/secure_notes/components/SecureNotes.vue','utf8')).descriptor
  const code=ts.transpileModule(compileScript(descriptor,{id:'vault-view-test'}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const quietConsole={...console,warn(){}}
  const dependencies={vue,'lucide-vue-next':{},'@/lib/workspaceScope':{useWorkspaceClient:()=>client,useModuleAccess:()=>({canWrite:vue.ref(true)})},'@/lib/vaultCrypto':cryptoApi,
    '@/stores/auth':{useAuthStore:()=>({user:{id:'owner'}})},'@/stores/ui':{useUIStore:()=>({addToast:(...args)=>toasts.push(args),showConfirm:async()=>true})},
    'vue-i18n':{useI18n:()=>({t:key=>key})},'@/components/ui/CustomSelect.vue':{default:{}},'./SecureNoteItem.vue':{default:{}}}
  vm.runInNewContext(code,{exports,require:name=>dependencies[name]||require(name),console:quietConsole,crypto:webcrypto,Date})
  const scope=vue.effectScope()
  let state
  // Script methods are checked independently of browser layout and native dialogs.
  const warn=console.warn;console.warn=()=>{}
  try { scope.run(()=>{state=exports.default.setup({}, {expose(){}})}) } finally {console.warn=warn}
  return {state,sessions,notes,calls,toasts,listeners,close:()=>scope.stop(),fail(){fail=true},
    holdSeal(){let release,start;gate=new Promise(resolve=>release=resolve);const started=new Promise(resolve=>start=resolve);entered=start;return {release,started}}}
}
async function openLegacy(f) {
  f.state.promptSessionUnlock(structuredClone(f.sessions[0]))
  f.state.unlockPassword.value='old-password'
  await f.state.authenticate()
}
test('vault screen upgrades a legacy vault on unlock and retains the draft when an encrypted save fails', async () => {
  const f=vaultView()
  try {
    await openLegacy(f)
    assert.equal(f.state.isAuthenticated.value,true)
    assert.equal(cryptoApi.isSealedVault(f.sessions[0].password_hash),true)
    assert.equal(f.notes[0].content,null)
    assert.equal(f.state.secureNotes.value[0].content,'Private content')
    f.state.editNote(f.state.secureNotes.value[0])
    f.state.editingNote.value.content='Unsaved change'
    f.fail();await f.state.saveNote()
    assert.equal(f.state.editingNote.value.content,'Unsaved change')
    assert.equal(f.state.showAddNoteDialog.value,true)
    assert.equal(f.notes[0].content,null)
    f.state.lockVault()
    assert.equal(f.state.vaultKey.value,null)
    assert.equal(f.state.secureNotes.value.length,0)
    assert.equal(f.state.editingNote.value.content,undefined)
  } finally { f.close() }
})
test('a completed password rotation cannot put a key back into a vault that was locked meanwhile', async () => {
  const f=vaultView()
  try {
    await openLegacy(f)
    f.state.editingSession.value={...f.state.currentSession.value,password:'new-password'}
    const held=f.holdSeal(),saving=f.state.saveSession()
    await held.started
    f.state.lockVault();held.release();await saving
    assert.equal(f.state.vaultKey.value,null)
    assert.equal(f.state.currentSession.value,null)
    const key=await cryptoApi.unlockVaultKey('new-password',f.sessions[0].password_hash)
    assert.equal((await cryptoApi.decryptVaultValue(key,f.notes[0].encrypted_payload,'vault:note')).content,'Private content')
  } finally { f.close() }
})
test('peer password changes lock the active vault and clear decrypted content', async () => {
  const f=vaultView()
  try {
    await openLegacy(f)
    f.sessions[0].password_hash=(await cryptoApi.createVaultKey('peer-password')).metadata
    await f.listeners.password_sessions()
    assert.equal(f.state.isAuthenticated.value,false)
    assert.equal(f.state.vaultKey.value,null)
    assert.equal(f.state.secureNotes.value.length,0)
    assert.equal(f.toasts.at(-1)[0],'secure.passwordChanged')
  } finally { f.close() }
})
