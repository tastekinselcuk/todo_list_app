const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const vue=require('vue'),pinia=require('pinia')
const {GoTrueClient}=require('@supabase/auth-js')
function load(path,dependencies={},globals={}){
 const exports={}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console,URL,URLSearchParams,require:name=>dependencies[name]||require(name),...globals})
 return exports
}
const {createAuthStorage,createSharedAuthStorage,createIndexedAuthStorage}=load('src/lib/authStorage.ts',{}, {setTimeout,clearTimeout})
const profile=load('src/lib/accountProfile.ts')
test('social login uses enabled providers, coalesces discovery and prevents duplicate redirects',async()=>{
 pinia.setActivePinia(pinia.createPinia())
 let discoveries=0,finish,listener;const calls=[],gate=new Promise(resolve=>finish=resolve)
 const auth={async signInWithOAuth(options){calls.push(options);await gate;return{error:null}},onAuthStateChange(callback){listener=callback;return{data:{subscription:{unsubscribe(){}}}}}}
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth},getLoginProviders:async()=>{discoveries++;return['google','github']}},'@/lib/accountProfile':profile},{window:{location:new URL('https://app.example.test/workspace?unrelated=1')}}).useAuthStore()
 const stop=store.setupAuthListener()
 try{
  await Promise.all([store.loadLoginProviders(),store.loadLoginProviders()]);assert.equal(discoveries,1)
  assert.equal((await store.loginWithProvider('azure')).message,'OAUTH_UNAVAILABLE');assert.equal(calls.length,0)
  const pending=store.loginWithProvider('google');await Promise.resolve();await Promise.resolve()
  assert.equal((await store.loginWithProvider('github')).message,'OAUTH_BUSY')
  assert.equal(calls.length,1);assert.equal(calls[0].provider,'google')
  assert.equal(calls[0].options.redirectTo,'https://app.example.test/workspace')
  assert.deepEqual(Object.keys(calls[0].options),['redirectTo'],'calendar or repository scopes are never requested for login')
  finish();assert.equal((await pending).success,true)
  assert.equal(store.user,null,'requesting a redirect never fabricates an authenticated session')
  assert.equal(store.isLoading,true);assert.equal(store.oauthProvider,'google')
  listener('SIGNED_IN',{user:{id:'owner',email:'user@example.test',created_at:'2026-01-01',user_metadata:{}}})
  assert.equal(store.isAuthenticated,true);assert.equal(store.isLoading,false);assert.equal(store.oauthProvider,null)
 }finally{finish();stop();store.$dispose()}
})

test('unavailable and failed OAuth leave password login usable and browser return releases a pending redirect',async()=>{
 pinia.setActivePinia(pinia.createPinia());let enabled=[],failure=null,discoveries=0
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth:{async signInWithOAuth(){return{error:failure}}}},getLoginProviders:async()=>{discoveries++;if(discoveries===1)throw Error('offline');return enabled}},'@/lib/accountProfile':profile},{window:{location:new URL('https://app.example.test/')}}).useAuthStore()
 try{
  await store.loadLoginProviders();assert.equal(store.isLoading,false)
  enabled=['google'];await store.loadLoginProviders();assert.equal(discoveries,2,'discovery can retry after an offline response')
  assert.equal((await store.loginWithProvider('github')).message,'OAUTH_UNAVAILABLE')
  failure=Error('provider failure');assert.equal((await store.loginWithProvider('google')).message,'OAUTH_FAILED')
  assert.equal(store.isLoading,false);assert.equal(store.oauthProvider,null)
  failure=null;await store.loginWithProvider('google');assert.equal(store.isLoading,true)
  store.resetOAuth();assert.equal(store.isLoading,false);assert.equal(store.oauthProvider,null)
 }finally{store.$dispose()}
})

test('OAuth callback errors are translated and removed without exposing provider descriptions or deleting unrelated URL state',()=>{
 pinia.setActivePinia(pinia.createPinia());const replaced=[]
 const window={location:new URL('https://app.example.test/?view=notes#error=access_denied&error_code=denied&error_description=private-provider-detail&keep=yes'),history:{state:{kept:true},replaceState(...args){replaced.push(args)}}}
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{}},'@/lib/accountProfile':profile},{window}).useAuthStore()
 try{
  assert.equal(store.consumeOAuthError(),'oauthCancelled')
  assert.equal(replaced[0][2],'/?view=notes#keep=yes');assert.equal(replaced[0][0].kept,true)
  window.location=new URL('https://app.example.test/?error=server_error&error_description=private&view=notes')
  assert.equal(store.consumeOAuthError(),'oauthFailed');assert.equal(replaced[1][2],'/?view=notes')
 }finally{store.$dispose()}
})
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}}
function sharedStorage(){
 const values=new Map()
 return {values,async read(key){return values.get(key)},async write(key,value){values.set(key,{value})},
  async migrate(key,value){if(!values.has(key))values.set(key,{value});return values.get(key)}}
}

test('a quota-full local store restores the same SDK session in a fresh tab through shared durable storage',async()=>{
 const shared=sharedStorage(),local=storage();local.setItem=()=>{throw Error('QuotaExceededError')}
 const firstStorage=createSharedAuthStorage(shared,()=>local,()=>storage()),first=client(firstStorage)
 let second
 try{
  await first.auth.initialize();await first.auth.signInWithPassword({email:'user@example.test',password:'test-only-password'})
  assert.equal(firstStorage.persistence,'indexeddb');assert.equal(firstStorage.persistent,true)
  const freshTab=createSharedAuthStorage(shared,()=>local,()=>storage());second=client(freshTab)
  await second.auth.initialize()
  assert.equal((await second.auth.getSession()).data.session.user.id,first.user.id)
  assert.equal(second.requests.includes('/token'),false,'a fresh tab does not perform another password login')
  await second.auth.signOut({scope:'local'})
  assert.equal((await first.auth.getSession()).data.session,null,'an existing client observes shared sign-out')
  assert.equal(await freshTab.getItem('test-auth'),null)
 }finally{first.auth.stopAutoRefresh();second?.auth.stopAutoRefresh()}
})

test('legacy tab-only login migrates once and an old tab backup cannot resurrect a signed-out session',async()=>{
 const shared=sharedStorage(),local=storage(),oldTab=storage()
 oldTab.setItem('auth-backup:test-auth','legacy-session');local.setItem('note-draft','preserved')
 const first=createSharedAuthStorage(shared,()=>local,()=>oldTab)
 assert.equal(await first.getItem('test-auth'),'legacy-session')
 assert.equal(oldTab.getItem('auth-backup:test-auth'),null)
 const staleTab=storage();staleTab.setItem('auth-backup:test-auth','old-session')
 await first.removeItem('test-auth')
 const other=createSharedAuthStorage(shared,()=>local,()=>staleTab)
 assert.equal(await other.getItem('test-auth'),null)
 assert.equal(local.getItem('note-draft'),'preserved')
 await first.setItem('test-auth','new-login');assert.equal(await other.getItem('test-auth'),'new-login')
})

test('migration preserves a concurrent login or logout committed between the first shared read and migration',async()=>{
 for(const newer of ['new-login',null]){
  const shared=sharedStorage(),local=storage();local.setItem('test-auth','old-login')
  shared.read=async key=>{shared.values.set(key,{value:newer});return undefined}
  const adapter=createSharedAuthStorage(shared,()=>local,()=>storage())
  assert.equal(await adapter.getItem('test-auth'),newer)
 }
})

test('IndexedDB auth writes wait for a committed transaction and reject an aborted transaction',async()=>{
 let tx,request
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
  tx={objectStore:()=>({put(){request={};return request}})};return tx
 }}
 const factory={open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request}}
 const adapter=createIndexedAuthStorage(()=>factory)
 let complete=false
 const writing=adapter.write('test-auth','token').then(()=>{complete=true})
 await new Promise(resolve=>setImmediate(resolve))
 request.onsuccess?.();await Promise.resolve();assert.equal(complete,false,'put success is not a durable commit')
 tx.oncomplete();await writing;assert.equal(complete,true)
 const aborted=adapter.write('test-auth','replacement')
 await new Promise(resolve=>setImmediate(resolve));tx.onabort()
 await assert.rejects(aborted,/AUTH_STORAGE_UNAVAILABLE/)
})

test('successfully saving a PKCE helper does not conceal a failure to persist the actual session',async()=>{
 const shared=sharedStorage(),local=storage(),tab=storage()
 const write=shared.write;shared.write=async(key,value)=>{if(key==='test-auth')throw Error('quota');return write(key,value)}
 local.setItem=()=>{throw Error('quota')}
 const adapter=createSharedAuthStorage(shared,()=>local,()=>tab,'test-auth')
 await adapter.setItem('test-auth','session');assert.equal(adapter.persistent,false)
 await adapter.removeItem('test-auth-code-verifier');assert.equal(adapter.persistent,false)
})

test('unavailable shared storage falls back honestly and its recovery does not restore an old shared token',async()=>{
 const shared=sharedStorage(),local=storage(),tab=storage();let blocked=true
 shared.values.set('test-auth',{value:'old-token'})
 const write=shared.write,read=shared.read
 shared.write=async(...args)=>{if(blocked)throw Error('Storage denied');return write(...args)}
 shared.read=async(...args)=>{if(blocked)throw Error('Storage denied');return read(...args)}
 const adapter=createSharedAuthStorage(shared,()=>local,()=>tab)
 await adapter.setItem('test-auth','new-token')
 assert.equal(adapter.persistence,'local');assert.equal(adapter.persistent,true)
 blocked=false
 assert.equal(await createSharedAuthStorage(shared,()=>local,()=>storage()).getItem('test-auth'),'new-token')
 await adapter.removeItem('test-auth')
 assert.equal(await adapter.getItem('test-auth'),null)
})

test('tab-only fallback is explicitly reported as unavailable to other tabs',async()=>{
 const shared=sharedStorage(),local=storage(),tab=storage()
 shared.write=shared.read=async()=>{throw Error('IDB unavailable')}
 local.setItem=()=>{throw Error('QuotaExceededError')}
 const adapter=createSharedAuthStorage(shared,()=>local,()=>tab)
 await adapter.setItem('test-auth','token')
 assert.equal(await adapter.getItem('test-auth'),'token');assert.equal(adapter.persistent,false)
})

test('a runtime fallback from another tab wins over stale tab backups and sign-out fences stay signed out',async()=>{
 const shared=sharedStorage(),local=storage(),tab=storage();shared.values.set('test-auth',{value:'old-shared'})
 const write=shared.write;shared.write=async()=>{throw Error('unavailable')}
 const first=createSharedAuthStorage(shared,()=>local,()=>storage())
 await first.setItem('test-auth','new-local')
 tab.setItem('auth-backup:test-auth','stale-other-tab')
 shared.write=write
 assert.equal(await createSharedAuthStorage(shared,()=>local,()=>tab).getItem('test-auth'),'new-local')
 shared.write=async()=>{throw Error('unavailable')}
 await first.removeItem('test-auth')
 tab.setItem('auth-backup:test-auth','stale-other-tab')
 const next=createSharedAuthStorage(shared,()=>local,()=>tab)
 assert.equal(await next.getItem('test-auth'),null)
 shared.write=write
 assert.equal(await createSharedAuthStorage(shared,()=>local,()=>tab).getItem('test-auth'),null)
})

test('bootstrap coalesces concurrent calls and does not request user validation for a signed-out tab',async()=>{
 pinia.setActivePinia(pinia.createPinia());let reads=0,validations=0
 const auth={async getSession(){reads++;return{data:{session:null}}},async getUser(){validations++;throw Error('unnecessary')}}
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth}},'@/lib/accountProfile':profile}).useAuthStore()
 try{await Promise.all([store.initializeAuth(),store.initializeAuth()]);assert.equal(reads,1);assert.equal(validations,0);assert.equal(store.isAuthenticated,false)}finally{store.$dispose()}
})

test('auth broadcasts update the UI without writing received stale tokens back to shared storage',()=>{
 pinia.setActivePinia(pinia.createPinia());let listener,writes=0
 const auth={onAuthStateChange(callback){listener=callback;return{data:{subscription:{unsubscribe(){}}}}}}
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth},authSessionStorage:{persistent:true,setItem(){writes++},removeItem(){writes++}}},'@/lib/accountProfile':profile}).useAuthStore()
 const stop=store.setupAuthListener()
 try{
  listener('SIGNED_IN',{user:{id:'owner',email:'test@example.test',created_at:'2026-01-01'}})
  assert.equal(store.isAuthenticated,true)
  listener('SIGNED_OUT',null);assert.equal(store.isAuthenticated,false);assert.equal(writes,0)
 }finally{stop();store.$dispose()}
})

test('a late validation rejection cannot clear a refreshed session delivered by the SDK',async()=>{
 pinia.setActivePinia(pinia.createPinia());let listener,finish
 const user={id:'owner',email:'test@example.test',created_at:'2026-01-01'}
 const auth={getUser:()=>new Promise(resolve=>finish=resolve),onAuthStateChange(callback){listener=callback;return{data:{subscription:{unsubscribe(){}}}}}}
 const store=load('src/stores/auth.ts',{'@/lib/supabase':{supabase:{auth}},'@/lib/accountProfile':profile}).useAuthStore(),stop=store.setupAuthListener()
 try{const pending=store.initializeAuth();listener('TOKEN_REFRESHED',{user});finish({data:{user:null},error:{status:401,message:'old request'}});await pending;assert.equal(store.user.id,'owner')}finally{stop();store.$dispose()}
})

test('PKCE generates a verifier and S256 challenge without requesting calendar scopes or exposing tokens',async()=>{
 const shared=sharedStorage(),cache=createSharedAuthStorage(shared,()=>storage(),()=>storage())
 const auth=new GoTrueClient({url:'https://auth.example.test',storage:cache,storageKey:'pkce-test',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce'})
 try{
  await auth.initialize()
  const {data,error}=await auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://app.example.test/',skipBrowserRedirect:true}})
  assert.equal(error,null)
  const url=new URL(data.url);assert.equal(url.searchParams.get('code_challenge_method'),'s256')
  assert.ok(url.searchParams.get('code_challenge'));assert.ok(await cache.getItem('pkce-test-code-verifier'))
  assert.equal(url.searchParams.has('access_token'),false);assert.equal(url.searchParams.has('scopes'),false)
 }finally{auth.stopAutoRefresh()}
})
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
