const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {parse,compileScript}=require('@vue/compiler-sfc')
const vue=require('vue'),pinia=require('pinia')
function load(source,dependencies={},globals={}) {
  const exports={}
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports,require:name=>dependencies[name]||require(name),console,window:{location:{origin:'https://app.example.test'}},...globals})
  return exports
}
const profile=load(fs.readFileSync('src/lib/accountProfile.ts','utf8'))
async function fixture() {
  pinia.setActivePinia(pinia.createPinia())
  let remote={id:'owner',email:'owner@example.test',created_at:'2026-01-01',email_confirmed_at:'2026-01-01',last_sign_in_at:'2026-10-09',user_metadata:{full_name:'Ada Lovelace',avatar_tone:'indigo'}}
  const calls=[],checks=[]
  let listener,gate,updateError=null,signOutError=null
  const auth={
    async getUser(){return {data:{user:structuredClone(remote)},error:null}},
    onAuthStateChange(callback){listener=callback},
    async updateUser(payload,options){
      calls.push(['update',payload,options])
      if(gate)await gate
      if(updateError)return {data:{user:null},error:updateError}
      if(payload.data)remote.user_metadata={...remote.user_metadata,...payload.data}
      if(payload.email)remote.new_email=payload.email
      return {data:{user:structuredClone(remote)},error:null}
    },
    async signOut(options){calls.push(['logout',options]);return {error:signOutError}},
    async reauthenticate(){calls.push(['reauthenticate']);return {error:null}}
  }
  const store=load(fs.readFileSync('src/stores/auth.ts','utf8'),{
    '@/lib/accountProfile':profile,'@/lib/supabase':{supabase:{auth},createReauthenticationClient:()=>({auth:{
      async signInWithPassword(credentials){
        checks.push(['verify',credentials])
        if(gate)await gate
        return credentials.password==='current-password'?{data:{user:{id:'owner'}},error:null}:{data:{user:null},error:{code:'invalid_credentials'}}
      },
      async signOut(options){checks.push(['cleanup',options]);return {error:null}}
    }})}
  }).useAuthStore()
  await store.initializeAuth();store.setupAuthListener()
  return {store,calls,checks,close:()=>store.$dispose(),failUpdate:err=>updateError=err,failLogout:()=>signOutError={message:'Offline'},
    hold(){let release;gate=new Promise(resolve=>release=resolve);return release},switchUser(user){listener('SIGNED_IN',user?{user}:null)}}
}
test('profile names and safe color defaults work for existing accounts',()=>{
  assert.equal(profile.accountInitials('Ada Lovelace'),'AL')
  assert.equal(profile.accountName({email:'owner@example.test'}),'owner')
  assert.equal(profile.validAvatarTone('anything'),'slate')
})
test('profile updates persist metadata without turning the entire page into a loading screen',async()=>{
  const f=await fixture()
  assert.equal(f.store.user.displayName,'Ada Lovelace')
  assert.equal(f.store.user.emailVerified,true)
  const release=f.hold()
  const pending=f.store.updateProfile('  New Name  ','rose')
  assert.equal(f.store.accountBusy,true)
  assert.equal(f.store.isLoading,false)
  assert.equal((await f.store.updateProfile('Duplicate','slate')).success,false)
  assert.equal(f.calls.length,1)
  release();assert.equal((await pending).success,true)
  assert.equal(f.store.user.displayName,'New Name')
  assert.equal(f.store.user.avatarTone,'rose')
  assert.equal(f.store.accountBusy,false)
  f.close()
})
test('failed profile saves retain the saved profile and reject invalid names',async()=>{
  const f=await fixture()
  assert.equal((await f.store.updateProfile(' ','slate')).message,'INVALID_NAME')
  assert.equal((await f.store.updateProfile('x'.repeat(81),'slate')).message,'INVALID_NAME')
  f.failUpdate({message:'Offline'})
  assert.equal((await f.store.updateProfile('Changed','slate')).success,false)
  assert.equal(f.store.user.displayName,'Ada Lovelace')
  f.close()
})
test('email changes verify the current password separately and keep the old address until confirmation',async()=>{
  const f=await fixture()
  assert.equal((await f.store.updateEmail('new@example.test','wrong-password')).message,'CURRENT_PASSWORD_INCORRECT')
  assert.equal(f.calls.length,0)
  assert.equal((await f.store.updateEmail(' NEW@example.test ','current-password')).success,true)
  assert.equal(f.store.user.email,'owner@example.test')
  assert.equal(f.store.user.pendingEmail,'new@example.test')
  assert.equal(f.calls[0][1].email,'new@example.test')
  assert.equal(f.calls[0][2].emailRedirectTo,'https://app.example.test')
  assert.equal(f.checks.filter(c=>c[0]==='cleanup').length,2)
  assert.equal(f.calls.some(c=>c[0]==='logout'),false,'verification never signs out the main session')
  f.close()
})
test('password changes reject wrong credentials, weak and unchanged passwords before updating',async()=>{
  const f=await fixture()
  assert.equal((await f.store.changePassword('short','current-password')).message,'PASSWORD_TOO_SHORT')
  assert.equal((await f.store.changePassword('current-password','current-password')).message,'PASSWORD_UNCHANGED')
  assert.equal((await f.store.changePassword('new-password','wrong')).message,'CURRENT_PASSWORD_INCORRECT')
  assert.equal(f.calls.length,0)
  assert.equal((await f.store.changePassword('new-password','current-password')).success,true)
  assert.equal(f.calls[0][1].password,'new-password')
  assert.equal(f.store.isAuthenticated,true)
  f.close()
})
test('secure password policy requests an email nonce and forwards the supplied code on retry',async()=>{
  const f=await fixture()
  f.failUpdate({code:'reauthentication_needed'})
  assert.equal((await f.store.changePassword('new-password','current-password')).message,'REAUTHENTICATION_REQUIRED')
  assert.equal(f.calls[1][0],'reauthenticate')
  f.failUpdate(null)
  assert.equal((await f.store.changePassword('new-password','current-password','123456')).success,true)
  assert.equal(f.calls[2][1].nonce,'123456')
  f.close()
})
test('late profile responses and credential checks cannot update a different signed-in account',async()=>{
  const f=await fixture()
  const release=f.hold()
  const pending=f.store.updateEmail('new@example.test','current-password')
  f.switchUser({id:'other',email:'other@example.test',created_at:'2026-01-01',user_metadata:{full_name:'Other'}})
  release()
  assert.equal((await pending).message,'SESSION_CHANGED')
  assert.equal(f.calls.length,0)
  assert.equal(f.store.user.id,'other')
  f.close()
  const second=await fixture(),unblock=second.hold()
  const save=second.store.updateProfile('Late update','rose')
  second.switchUser(null);unblock()
  assert.equal((await save).message,'SESSION_CHANGED')
  assert.equal(second.store.user,null)
  second.close()
})
test('local and global sign-out are distinct and failed sign-out preserves the current account',async()=>{
  const f=await fixture()
  f.failLogout()
  assert.equal((await f.store.logout()).success,false)
  assert.equal(f.store.isAuthenticated,true)
  assert.equal(f.calls[0][1].scope,'local')
  f.close()
  const second=await fixture()
  assert.equal((await second.store.logout('global')).success,true)
  assert.equal(second.calls[0][1].scope,'global')
  assert.equal(second.store.user,null)
  second.close()
})
function settingsFixture() {
  const calls=[],events=[]
  const user=vue.reactive({id:'owner',email:'owner@example.test',displayName:'Ada',avatarTone:'slate',createdAt:'2026-01-01'})
  const auth=vue.reactive({user,accountBusy:false,
    async updateProfile(...args){calls.push(['profile',...args]);return {success:false,message:'SAVE_FAILED'}},
    async updateEmail(...args){calls.push(['email',...args]);return {success:true}},
    async changePassword(...args){calls.push(['password',...args]);return {success:true}}
  })
  const descriptor=parse(fs.readFileSync('src/components/AccountSettings.vue','utf8')).descriptor
  const component=load(compileScript(descriptor,{id:'account-settings-test'}).content,{
    '@/stores/auth':{useAuthStore:()=>auth},'@/stores/ui':{useUIStore:()=>({addToast(){}})},'@/lib/accountProfile':profile,
    'vue-i18n':{useI18n:()=>({t:key=>key,locale:vue.ref('tr')})}
  },{cancelAnimationFrame(){},requestAnimationFrame:()=>1,clearTimeout}).default
  const renderer=vue.createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  let state
  const app=renderer.createApp({setup(){state=component.setup({focusRequest:0},{expose(){},emit:(...args)=>events.push(args)});return()=>vue.h('div')}})
  app.mount({})
  return {state,calls,auth,events,close:()=>app.unmount()}
}
test('account forms retain failed profile drafts and clear sensitive fields when cancelled or unmounted',async()=>{
  const f=settingsFixture(),s=f.state
  s.displayName.value='Draft'
  await s.saveProfile()
  assert.equal(s.displayName.value,'Draft')
  assert.equal(s.feedback.profile.error,true)
  s.toggleEditor('password')
  s.password.current='current-password';s.password.next='new-password';s.password.confirm='mismatch'
  assert.equal(s.passwordValid.value,false)
  await s.savePassword();assert.equal(f.calls.filter(c=>c[0]==='password').length,0)
  s.toggleEditor('email')
  assert.equal(s.password.current,'')
  s.emailPassword.value='private'
  f.close()
  assert.equal(s.emailPassword.value,'')
})
test('successful account forms clear credentials and busy accounts cannot submit again',async()=>{
  const f=settingsFixture(),s=f.state
  s.toggleEditor('email')
  s.email.value='new@example.test';s.emailPassword.value='current-password'
  f.auth.accountBusy=true
  await s.saveEmail();assert.equal(f.calls.length,0)
  f.auth.accountBusy=false
  await s.saveEmail()
  assert.equal(s.emailPassword.value,'')
  assert.equal(s.editor.value,null)
  s.toggleEditor('password')
  s.password.current='current-password';s.password.next='new-password';s.password.confirm='new-password'
  await s.savePassword()
  assert.equal(s.password.current,'');assert.equal(s.password.next,'')
  f.close()
})
