const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue'),pinia=require('pinia')
const {GoTrueClient}=require('@supabase/auth-js')
function load(path,dependencies={}){
 const exports={}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console,require:name=>dependencies[name]||require(name)})
 return exports
}
const {createAuthStorage}=load('src/lib/authStorage.ts')
const profile=load('src/lib/accountProfile.ts')
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}}
function client(cache,options={}){
 const user={id:'10000000-0000-0000-0000-000000000001',aud:'authenticated',email:'user@example.test',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{full_name:'Test user'}}
 const requests=[]
 const auth=new GoTrueClient({url:'https://auth.example.test',storage:cache,storageKey:'test-auth',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,
  fetch:async(url)=>{
   const path=new URL(url).pathname;requests.push(path)
   if(path.endsWith('/token'))return new Response(JSON.stringify({user,access_token:'test-only-access-token',refresh_token:'test-only-refresh-token',token_type:'bearer',expires_in:3600}),{status:200,headers:{'Content-Type':'application/json'}})
   if(path.endsWith('/user'))return new Response(JSON.stringify(options.userFailure?{message:'Temporarily unavailable'}:user),{status:options.userFailure||200,headers:{'Content-Type':'application/json'}})
   if(path.endsWith('/logout'))return new Response(null,{status:204})
   throw Error('Unexpected test request: '+path)
  }})
 return {auth,requests,user}
}

test('a successful token response can still reject sign-in when full-session storage exceeds quota',async()=>{
 const cache=storage(),save=cache.setItem
 cache.setItem=(key,value)=>{if(value.length>100)throw Error('QuotaExceededError');save(key,value)}
 cache.setItem('probe','1')
 const {auth,requests}=client(cache)
 try{
  await auth.initialize()
  await assert.rejects(auth.signInWithPassword({email:'user@example.test',password:'test-only-password'}),/QuotaExceededError/)
  assert.ok(requests.includes('/token'),'server login succeeded before local persistence rejected')
 }finally{auth.stopAutoRefresh()}
})

test('runtime storage failure retains a validated in-memory session through logout and re-login',async()=>{
 pinia.setActivePinia(pinia.createPinia())
 const cache=storage(),save=cache.setItem
 cache.setItem=(key,value)=>{if(value.length>100)throw Error('QuotaExceededError');save(key,value)}
 cache.setItem('unrelated-note','preserved')
 const resilient=createAuthStorage(()=>cache),{auth}=client(resilient)
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth},authSessionStorage:resilient},'@/lib/accountProfile':profile}).useAuthStore()
 let stop
 try{
  await store.initializeAuth();stop=store.setupAuthListener()
  const result=await store.login('user@example.test','test-only-password')
  assert.equal(result.success,true);assert.equal(result.persistent,false)
  assert.equal(store.isAuthenticated,true);assert.equal(store.user.displayName,'Test user');assert.equal(store.isLoading,false)
  assert.equal(resilient.persistent,false)
  assert.ok((await auth.getSession()).data.session)
  assert.equal((await store.logout()).success,true);assert.equal(store.user,null)
  assert.equal((await auth.getSession()).data.session,null)
  assert.equal((await store.login('user@example.test','test-only-password')).success,true)
  assert.equal(store.isAuthenticated,true);assert.equal(store.isLoading,false)
  assert.equal(cache.getItem('unrelated-note'),'preserved')
 }finally{stop?.();store.$dispose();auth.stopAutoRefresh()}
})

test('healthy auth persistence survives a new adapter and observes cross-tab updates',()=>{
 const cache=storage(),first=createAuthStorage(()=>cache)
 first.setItem('test-auth','first')
 assert.equal(first.persistent,true)
 const next=createAuthStorage(()=>cache);assert.equal(next.getItem('test-auth'),'first')
 cache.setItem('test-auth','other-tab');assert.equal(first.getItem('test-auth'),'other-tab')
 next.removeItem('test-auth');assert.equal(first.getItem('test-auth'),null)
})

test('a failed replacement removes the old auth key while retaining unrelated local notes',()=>{
 const cache=storage();cache.setItem('test-auth','old-account');cache.setItem('note-draft','preserved')
 cache.setItem=()=>{throw Error('QuotaExceededError')}
 const resilient=createAuthStorage(()=>cache)
 resilient.setItem('test-auth','new-account')
 assert.equal(resilient.getItem('test-auth'),'new-account')
 assert.equal(cache.getItem('test-auth'),null)
 assert.equal(cache.getItem('note-draft'),'preserved')
})

test('denied storage access and removal do not resurrect a logged-out session in memory',()=>{
 const cache=storage();cache.setItem('test-auth','older-session')
 let blocked=true
 const resilient=createAuthStorage(()=>{if(blocked)throw Error('SecurityError');return cache})
 resilient.setItem('test-auth','current-session');assert.equal(resilient.getItem('test-auth'),'current-session')
 resilient.removeItem('test-auth');blocked=false
 assert.equal(resilient.getItem('test-auth'),null)
 resilient.setItem('test-auth','new-session');assert.equal(resilient.persistent,true)
 assert.equal(cache.getItem('test-auth'),'new-session')
})

test('a local quota failure falls back to tab storage and a new SDK client restores the session after F5',async()=>{
 const local=storage(),tab=storage(),save=local.setItem
 local.setItem=(key,value)=>{if(value.length>100)throw Error('QuotaExceededError');save(key,value)}
 const firstStorage=createAuthStorage(()=>local,()=>tab),first=client(firstStorage)
 let second
 try{
  await first.auth.initialize();await first.auth.signInWithPassword({email:'user@example.test',password:'test-only-password'})
  assert.equal(firstStorage.persistence,'session');assert.equal(firstStorage.persistent,true)
  const freshStorage=createAuthStorage(()=>local,()=>tab);second=client(freshStorage)
  await second.auth.initialize()
  assert.equal((await second.auth.getSession()).data.session.user.id,first.user.id)
  assert.equal(freshStorage.persistence,'session')
  await second.auth.signOut({scope:'local'})
  assert.equal(createAuthStorage(()=>local,()=>tab).getItem('test-auth'),null,'logout clears both durable areas')
 }finally{first.auth.stopAutoRefresh();second?.auth.stopAutoRefresh()}
})

test('a temporary user endpoint failure does not erase a valid restored SDK session',async()=>{
 const cache=storage(),sessionStorage=createAuthStorage(()=>cache),first=client(sessionStorage)
 let second,store
 try{
  await first.auth.initialize();await first.auth.signInWithPassword({email:'user@example.test',password:'test-only-password'})
  second=client(createAuthStorage(()=>cache),{userFailure:503})
  pinia.setActivePinia(pinia.createPinia())
  store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth:second.auth}},'@/lib/accountProfile':profile}).useAuthStore()
  await store.initializeAuth()
  assert.equal(store.isAuthenticated,true);assert.equal(store.user.id,first.user.id)
  assert.ok(store.error);assert.equal(store.isLoading,false)
 }finally{store?.$dispose();first.auth.stopAutoRefresh();second?.auth.stopAutoRefresh()}
})

test('a late bootstrap response cannot sign out a newer successful login',async()=>{
 pinia.setActivePinia(pinia.createPinia())
 let finish
 const previousUser=new Promise(resolve=>finish=resolve)
 const user={id:'owner',email:'user@example.test',created_at:'2026-01-01',user_metadata:{}}
 const auth={getUser:()=>previousUser,async signInWithPassword(){return {data:{user},error:null}}}
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth}},'@/lib/accountProfile':profile}).useAuthStore()
 try{
  const initializing=store.initializeAuth()
  assert.equal((await store.login('user@example.test','test-only-password')).success,true)
  finish({data:{user:null},error:null});await initializing
  assert.equal(store.user.id,'owner');assert.equal(store.isAuthenticated,true)
 }finally{store.$dispose()}
})

test('a definitive authentication rejection does not retain the cached signed-in UI',async()=>{
 const cache=storage(),first=client(createAuthStorage(()=>cache));let second,store
 try{
  await first.auth.initialize();await first.auth.signInWithPassword({email:'user@example.test',password:'test-only-password'})
  second=client(createAuthStorage(()=>cache),{userFailure:401})
  pinia.setActivePinia(pinia.createPinia())
  store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth:second.auth}},'@/lib/accountProfile':profile}).useAuthStore()
  await store.initializeAuth()
  assert.equal(store.isAuthenticated,false);assert.equal(store.user,null)
 }finally{store?.$dispose();first.auth.stopAutoRefresh();second?.auth.stopAutoRefresh()}
})
