const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),vue=require('vue')
const {parse,compileScript}=require('@vue/compiler-sfc')
function load(source,deps){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>deps[name]||require(name),console,window:{addEventListener(){},removeEventListener(){}},encodeURIComponent,Promise});return exports}
const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await vue.nextTick()}
function component(file,auth,deps){
 const descriptor=parse(fs.readFileSync(file,'utf8')).descriptor
 const compiled=load(compileScript(descriptor,{id:'mfa-test'}).content,{'@/stores/auth':{useAuthStore:()=>auth},'vue-i18n':{useI18n:()=>({t:key=>key})},'@/components/ui/CustomSelect.vue':{default:{}},...deps}).default
 let state;const events=[]
 const app=renderer.createApp({setup(){state=compiled.setup({}, {expose(){},emit:(...args)=>events.push(args)});return()=>vue.h('div')}});app.mount({})
 return{state,events,close:()=>app.unmount()}
}
test('MFA sign-in stays blocked on an invalid code and only releases the app after successful verification',async()=>{
 const auth=vue.reactive({user:{id:'owner'}}),calls=[]
 const f=component('src/components/MfaGate.vue',auth,{'@/lib/mfaClient':{mfaState:async()=>({userId:'owner',required:true,factors:[{id:'factor'}]}),verifyMfaCode:async(id,code)=>{calls.push([id,code]);if(code!=='123456')throw Error('invalid')}}})
 try{await settle();assert.equal(f.state.state.value,'required')
  f.state.code.value='000000';await f.state.verify();assert.equal(f.state.state.value,'required');assert.equal(f.state.code.value,'');assert.equal(f.events.length,0)
  f.state.code.value='123456';await f.state.verify();assert.equal(f.state.state.value,'ready');assert.deepEqual(f.events,[['verified']]);assert.equal(calls.length,2)
 }finally{f.close()}
})
test('a late MFA response cannot release a different account after a session switch',async()=>{
 const auth=vue.reactive({user:{id:'owner'}});let resolve
 const pending=new Promise(done=>{resolve=done})
 const f=component('src/components/MfaGate.vue',auth,{'@/lib/mfaClient':{mfaState:async()=>({userId:auth.user.id,required:true,factors:[{id:'factor'}]}),verifyMfaCode:()=>pending}})
 try{await settle();f.state.code.value='123456';const checking=f.state.verify();auth.user={id:'other'};await settle();resolve();await checking;assert.equal(f.events.length,0);assert.equal(f.state.state.value,'required');assert.equal(f.state.code.value,'')}
 finally{f.close()}
})
test('MFA setup, failed removal and confirmed removal retain truthful server state and clear setup secrets',async()=>{
 const auth=vue.reactive({user:{id:'owner'}}),calls=[];let factors=[],allowed=true
 const sdk={auth:{mfa:{listFactors:async()=>({data:{totp:factors},error:null}),enroll:async()=>({data:{id:'factor',totp:{qr_code:'data:image/svg+xml;utf-8,<svg/>',secret:'SETUP-SECRET'}},error:null}),unenroll:async({factorId})=>{calls.push(factorId);factors=factors.filter(f=>f.id!==factorId);return {error:null}}}}}
 const f=component('src/components/MfaSettings.vue',auth,{'@/lib/supabase':{supabase:sdk},'@/lib/mfaClient':{verifyMfaCode:async()=>{if(!allowed)throw Error('invalid');if(!factors.length)factors=[{id:'factor'}]}}})
 try{await settle();await f.state.enroll();assert.equal(f.state.enrollment.value.secret,'SETUP-SECRET')
  f.state.code.value='123456';await f.state.confirm();assert.equal(f.state.enrollment.value,null);assert.equal(f.state.factors.value.length,1);assert.equal(f.state.feedback.value,'setupDone')
  f.state.startRemoval('factor');allowed=false;f.state.code.value='123456';await f.state.confirm();assert.equal(calls.length,0);assert.equal(f.state.factors.value.length,1)
  allowed=true;f.state.code.value='123456';await f.state.confirm();assert.deepEqual(calls,['factor']);assert.equal(f.state.factors.value.length,0);assert.equal(f.state.feedback.value,'removed')
 }finally{f.close()}
})
test('cancelling an unverified MFA setup removes only its own pending factor',async()=>{
 const auth=vue.reactive({user:{id:'owner'}}),removed=[]
 const sdk={auth:{mfa:{listFactors:async()=>({data:{totp:[]},error:null}),enroll:async()=>({data:{id:'pending-factor',totp:{qr_code:'data:image/svg+xml;utf-8,<svg/>',secret:'SETUP-SECRET'}},error:null}),unenroll:async({factorId})=>{removed.push(factorId);return{error:null}}}}}
 const f=component('src/components/MfaSettings.vue',auth,{'@/lib/supabase':{supabase:sdk},'@/lib/mfaClient':{verifyMfaCode:async()=>assert.fail('cancel must not verify a factor')}})
 try{await settle();await f.state.enroll();await f.state.cancel();assert.deepEqual(removed,['pending-factor']);assert.equal(f.state.enrollment.value,null);assert.equal(f.state.code.value,'')}
 finally{f.close()}
})
test('successful MFA verification preserves its session even if realtime is disconnected',async()=>{
 const calls=[],sdk={auth:{getSession:async()=>({data:{session:{user:{id:'owner'},access_token:'token'}},error:null}),mfa:{getAuthenticatorAssuranceLevel:async token=>{calls.push(token);return{data:{currentLevel:'aal1',nextLevel:'aal2'},error:null}},listFactors:async()=>({data:{totp:[{id:'factor'}]},error:null}),challengeAndVerify:async()=>({data:{access_token:'verified-token'},error:null})}},realtime:{setAuth:async()=>{throw Error('offline')}}}
 const client=load(fs.readFileSync('src/lib/mfaClient.ts','utf8'),{'./supabase':{supabase:sdk}})
 const state=await client.mfaState(true);assert.equal(state.required,true);assert.equal(state.userId,'owner');assert.deepEqual(calls,['token'])
 await assert.rejects(client.verifyMfaCode('factor','123'),/MFA_CODE_INVALID/)
 await client.verifyMfaCode('factor','123456')
})
