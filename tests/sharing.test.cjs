const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const pinia = require('pinia')
const { createClient } = require('@supabase/supabase-js')

function load(path, dependencies, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(code,{ exports, require: name => dependencies[name] || (['@/lib/workspaceTrash','./workspaceTrash'].includes(name) ? load('src/lib/workspaceTrash.ts', {'./supabase':dependencies['./supabase']||dependencies['@/lib/supabase']||{supabase:{}}}, globals) : null) || (name === './moduleCatalog' ? load('src/lib/moduleCatalog.ts', {}, globals) : ['./storage','@/lib/storage'].includes(name) ? load('src/lib/storage.ts', {}, globals) : require(name)), console, URL, URLSearchParams, ...globals })
  return exports
}
const helpers = load('src/lib/sharing.ts',{})

test('workout sequence RPC uses scoped credentials, refreshes the parent version and fences late workspace responses', async () => {
 const requests=[],binding={module:'workout',collection_id:'collection',origin_workspace_id:'workspace',role:'owner'}
 let hold=false,release
 const client=createClient('https://database.example.test','public-test-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options={})=>{
   const parsed=new URL(url),body=options.body?JSON.parse(options.body):null;requests.push({url:parsed,body})
   if(hold)await new Promise(resolve=>release=resolve)
   const rpc=parsed.pathname.endsWith('/rpc/reorder_workout_exercises')
   if(!rpc)assert.equal(parsed.searchParams.get('version'),'eq.6')
   return new Response(JSON.stringify({id:'program',version:rpc?6:7,exercises:[]}),{headers:{'content-type':'application/json'}})
  }}})
 const workspaces={userId:'owner',activeId:'workspace',sessionKey:'owner:workspace',sharingAvailable:true,binding:module=>module==='workout'?binding:undefined}
 const api=load('src/lib/workspaceScope.ts',{'./supabase':{supabase:client},'@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'./sharing':helpers}).useWorkspaceClient()
 await api.mutateItem('workout','program','reorder',{ids:['second','first']},4)
 assert.deepEqual(requests[0].body,{cid:'collection',pid:'program',ordered_ids:['second','first'],expected_version:4})
 await api.from('workout_routines').update({title:'New title'}).eq('id','program').select().single()
 binding.role='viewer'
 await assert.rejects(api.mutateItem('workout','program','reorder',{ids:[]},7),/READ_ONLY/)
 assert.equal(requests.length,2)
 binding.role='owner';hold=true
 const pending=api.mutateItem('workout','program','reorder',{ids:[]},7)
 await new Promise(resolve=>setImmediate(resolve));workspaces.sessionKey='owner:other-workspace';release()
 await assert.rejects(pending,/Workspace changed/)
})

test('category RPC captures the workspace and version and refreshes note versions for following edits',async()=>{
 const requests=[],category={id:'category',version:3},note={id:'note',version:4,category_id:'category'}
 let release,hold=false
 const client=createClient('https://database.example.test','public-test-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options={})=>{
   const parsed=new URL(url),body=options.body?JSON.parse(options.body):null
   requests.push({url:parsed,body})
   if(parsed.pathname.endsWith('/rpc/delete_note_category')){
    if(hold)await new Promise(resolve=>release=resolve)
    note.version++;note.category_id=null
    return new Response(JSON.stringify({id:category.id,notes:[{id:note.id,version:note.version}]}),{headers:{'content-type':'application/json'}})
   }
   if(options.method==='PATCH'){assert.equal(parsed.searchParams.get('version'),'eq.5');note.version++}
   return new Response(JSON.stringify([parsed.pathname.endsWith('/categories')?category:note]),{headers:{'content-type':'application/json'}})
  }}})
 const binding={collection_id:'collection',origin_workspace_id:'workspace',role:'owner'}
 const workspaces={userId:'owner',activeId:'workspace',sessionKey:'session',sharingAvailable:true,binding(module){return module==='detailed'?binding:undefined}}
 const api=load('src/lib/workspaceScope.ts',{'./supabase':{supabase:client},'@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'./sharing':helpers}).useWorkspaceClient()
 await assert.rejects(api.removeCategory('category'),/SHARING_CONFLICT/)
 await api.from('categories').select();await api.from('todos').select()
 await api.removeCategory('category')
 assert.deepEqual(requests.at(-1).body,{wid:'workspace',category_id:'category',expected_version:3})
 await api.from('todos').update({completed:true}).eq('id','note')
 binding.role='viewer';const count=requests.length;await assert.rejects(api.removeCategory('category'),/READ_ONLY/);assert.equal(requests.length,count)
 binding.role='owner';await api.from('categories').select()
 hold=true;const pending=api.removeCategory('category');while(!release)await new Promise(resolve=>setImmediate(resolve))
 workspaces.sessionKey='new-session';release();await assert.rejects(pending,/Workspace changed/)
})

test('workspace deletion broadcasts refresh other sessions after pending local writes finish',async()=>{
 pinia.setActivePinia(pinia.createPinia())
 const auth=vue.reactive({user:{id:'owner'}}),workspaces=vue.reactive({busy:false,sharingAvailable:true,async refreshBindings(){},async load(){reloads++}})
 let callback,reloads=0
 const channel={on(_type,_filter,fn){callback=fn;return channel},subscribe(){return channel}}
 const store=load('src/stores/sharing.ts',{
  '@/lib/supabase':{supabase:{channel:()=>channel,removeChannel(){}}},
  './auth':{useAuthStore:()=>auth},'./workspaces':{useWorkspacesStore:()=>workspaces},'@/lib/sharing':helpers,
 },{setInterval:()=>1,clearInterval(){},window:{location:{href:'https://notes.example.test/'},addEventListener(){},removeEventListener(){}}}).useSharingStore()
 try {
  store.start();callback({payload:{operation:'workspace_deleted'}});await vue.nextTick();assert.equal(reloads,1)
  workspaces.busy=true;callback({payload:{operation:'workspace_deleted'}});callback({payload:{operation:'workspace_deleted'}})
  await vue.nextTick();assert.equal(reloads,1)
  workspaces.busy=false;await vue.nextTick();assert.equal(reloads,2)
  workspaces.busy=true;callback({payload:{operation:'workspace_deleted'}});store.stop();workspaces.busy=false
  await vue.nextTick();assert.equal(reloads,2,'stopped sessions cannot replay queued refreshes')
 }finally{store.stop();store.$dispose()}
})

test('personal notes use the exact latest version for trash after creation and completion, without sending DELETE',async()=>{
 const requests=[],row={id:'note',collection_id:'collection',workspace_id:'workspace',created_by:'owner',content:'A note',version:1}
 const client=createClient('https://database.example.test','public-test-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options={})=>{
   const method=options.method||'GET',body=options.body?JSON.parse(options.body):null
   requests.push({url:String(url),method,body})
   let data
   if(String(url).includes('/rpc/trash_change'))data={id:row.id,module:'quick',version:row.version+1,deleted_at:new Date().toISOString()}
   else{if(method==='PATCH')row.version++;data=new Headers(options.headers).get('Accept')?.includes('object')?{...row}:[{...row}]}
   return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}})
  }}})
 const workspaces={userId:'owner',activeId:'workspace',sessionKey:'owner:workspace',sharingAvailable:false,binding(){}}
 const api=load('src/lib/workspaceScope.ts',{'./supabase':{supabase:client},'@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'./sharing':helpers}).useWorkspaceClient()
 await api.from('quick_notes').insert({content:'New'}).select().single()
 await api.from('quick_notes').update({completed:true}).eq('id','note')
 const deleted=await api.from('quick_notes').delete().eq('id','note').select('id').single()
 assert.equal(deleted.error,null);assert.equal(deleted.data.id,'note')
 const request=requests.at(-1)
 assert.ok(request.url.includes('/rpc/trash_change'));assert.equal(request.body.expected_version,2)
 assert.equal(request.body.wid,'workspace');assert.equal(request.body.module_id,'quick');assert.equal(requests.some(r=>r.method==='DELETE'),false)
})

test('invitation dialog waits for permission selection and retains the actual issued role',async()=>{
  pinia.setActivePinia(pinia.createPinia())
  const calls=[],auth=vue.reactive({user:{id:'owner'}})
  let release
  const gate=new Promise(resolve=>release=resolve)
  const binding={module:'quick',collection_id:'common',personal_collection_id:'common',role:'owner',shared:false,permissions_ready:true}
  const workspaces={activeId:'personal',sharingAvailable:true,binding:()=>binding,refreshBindings:async()=>true}
  const store=load('src/stores/sharing.ts',{
    '@/lib/supabase':{supabase:{async rpc(name,args){
      calls.push([name,args])
      if(name==='create_collection_invite'){await gate;return {data:{token:'b'.repeat(64),expires_at:'2099-01-01',invite_role:args.invite_role},error:null}}
      return {data:{members:[],invites:[]},error:null}
    }}},
    './auth':{useAuthStore:()=>auth},'./workspaces':{useWorkspacesStore:()=>workspaces},'@/lib/sharing':helpers,
  },{window:{location:{origin:'https://notes.example.test',hash:''}},history:{replaceState(){}}}).useSharingStore()
  await store.showManage('quick')
  assert.equal(store.inviteRole,'viewer')
  assert.equal(calls.some(([name])=>name==='create_collection_invite'),false)
  store.inviteRole='editor'
  const pending=store.newInvite()
  store.inviteRole='viewer'
  release()
  assert.equal(await pending,true)
  assert.equal(calls.find(([name])=>name==='create_collection_invite')[1].invite_role,'editor')
  assert.equal(store.generatedRole,'editor')
  store.close()
  delete binding.permissions_ready
  await store.newInvite()
  assert.equal(store.error,'SETUP_ROLE_REQUIRED')
  assert.equal(calls.filter(([name])=>name==='create_collection_invite').length,1)
  store.$dispose()
})
test('invitation parsing accepts only an exact application origin and valid token', () => {
  const token='a'.repeat(64), origin='https://notes.example.test'
  assert.equal(helpers.parseInviteLink(helpers.inviteLink(token,origin),origin),token)
  for (const link of [`https://evil.example.test/#invite=${token}`,`${origin}/other/#invite=${token}`,`${origin}/#invite=short`,'javascript:alert(1)']) {
    assert.equal(helpers.parseInviteLink(link,origin),'')
  }
})

test('real Supabase query builders use collection membership, version checks and actor stamps', async () => {
  const requests=[]
  const rows=[{ id:'note',collection_id:'shared',workspace_id:'owner-workspace',created_by:'owner',content:'Original',completed:false,version:1 }]
  const client=createClient('https://database.example.test','public-test-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(url,options={})=>{
      const parsed=new URL(url), method=options.method || 'GET'
      const filters=[...parsed.searchParams].filter(([key])=>!['select','order'].includes(key))
      const matched=rows.filter(row=>filters.every(([key,value])=>String(row[key])===value.slice(3)))
      const body=options.body ? JSON.parse(options.body) : null
      requests.push({method,filters,body})
      let data=matched
      if(method==='PATCH') { matched.forEach(row=>Object.assign(row,body,{version:row.version+1})); data=matched }
      if(method==='POST') { data=(Array.isArray(body)?body:[body]).map(row=>({...row,id:'added',version:1})); rows.push(...data) }
      if(method==='DELETE') { data=matched.map(row=>({...row})); matched.forEach(row=>rows.splice(rows.indexOf(row),1)) }
      const single=new Headers(options.headers).get('Accept')?.includes('object')
      return new Response(JSON.stringify(single ? data[0] ?? null : data),{status:200,headers:{'Content-Type':'application/json'}})
    }},
  })
  const workspaces=vue.reactive({userId:'editor',activeId:'personal',sessionKey:'editor:personal:1',sharingAvailable:true,
    bindings:{personal:[{module:'quick',collection_id:'shared',origin_workspace_id:'owner-workspace',epoch:1,shared:true}]},
    binding(module){return this.bindings.personal.find(b=>b.module===module)},
  })
  const api=load('src/lib/workspaceScope.ts',{
    '@/lib/supabase':{supabase:client},'./supabase':{supabase:client},
    '@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'./sharing':helpers,
  }).useWorkspaceClient()
  const fetched=await api.from('quick_notes').select('*').eq('created_by','editor').order('created_at')
  assert.equal(fetched.data[0].content,'Original')
  assert.ok(requests[0].filters.some(([key,value])=>key==='collection_id'&&value==='eq.shared'))
  assert.equal(requests[0].filters.some(([key])=>key==='created_by'),false)
  const updated=await api.from('quick_notes').update({completed:true}).eq('id','note').select().single()
  assert.equal(updated.error,null)
  assert.equal(updated.data.version,2)
  assert.ok(requests[1].filters.some(([key,value])=>key==='version'&&value==='eq.1'))
  rows[0].version=3; rows[0].content='Other person'
  const stale=await api.from('quick_notes').update({content:'Stale edit'}).eq('id','note')
  assert.equal(stale.error.code,'SHARING_CONFLICT')
  assert.equal(rows[0].content,'Other person')
  const added=await api.from('quick_notes').insert({created_by:'intruder',workspace_id:'other',collection_id:'bad',content:'New'}).select()
  assert.equal(added.data[0].collection_id,'shared')
  assert.equal(added.data[0].created_by,'editor')
  assert.equal(added.data[0].workspace_id,'owner-workspace')
  assert.throws(()=>api.from('quick_notes').update({collection_id:'bad'}),/ownership/)
  workspaces.bindings.personal[0].role='viewer'
  assert.equal(api.canWrite('quick'),false)
  const requestCount=requests.length
  assert.throws(()=>api.from('quick_notes').insert({content:'Intrusion'}),/READ_ONLY/)
  assert.throws(()=>api.from('quick_notes').update({content:'Intrusion'}),/READ_ONLY/)
  assert.throws(()=>api.from('quick_notes').delete(),/READ_ONLY/)
  await assert.rejects(api.mutateItem('quick','note','add',{}),/READ_ONLY/)
  assert.equal(requests.length,requestCount,'blocked writes never reach Supabase')
  workspaces.sessionKey='editor:personal:2'
  assert.throws(()=>api.from('quick_notes'),/Workspace changed/)
})

test('closing sharing rejects stale responses and one create request runs at a time', async () => {
  pinia.setActivePinia(pinia.createPinia())
  const calls=[], auth=vue.reactive({user:{id:'owner'}})
  let release
  const gate=new Promise(resolve=>{release=resolve})
  const binding={module:'quick',collection_id:'common',personal_collection_id:'common',role:'owner',shared:false,permissions_ready:true}
  const workspaces={activeId:'personal',sharingAvailable:true,binding:()=>binding,refreshBindings:async()=>true}
  const store=load('src/stores/sharing.ts',{
    '@/lib/supabase':{supabase:{rpc:async(name)=>{calls.push(name);await gate;return {data:{token:'a'.repeat(64),expires_at:'2099-01-01'},error:null}}}},
    './auth':{useAuthStore:()=>auth},'./workspaces':{useWorkspacesStore:()=>workspaces},'@/lib/sharing':helpers,
  },{window:{location:{origin:'https://notes.example.test',hash:''},removeEventListener(){}},history:{replaceState(){}},URLSearchParams}).useSharingStore()
  store.workspaceId='personal';store.moduleId='quick'
  const pending=store.newInvite()
  await store.newInvite()
  assert.equal(calls.length,1)
  store.close();release();await pending
  assert.equal(store.generatedLink,'')
  assert.equal(store.busy,false)
  store.$dispose()
})

test('Realtime retries pending updates after editing and removes channels and timers on scope disposal', async () => {
  const timers=new Map(), subscriptions=[], removed=[], callbacks=[]
  let nextTimer=0, busy=true, editing=false
  const workspaces=vue.reactive({userId:'editor',activeId:'personal',sessionKey:'session',sharingAvailable:true,
    binding(module){return module==='quick'?{collection_id:'common',epoch:4,shared:true}:undefined},
  })
  const client={channel(topic,options){
    const entry={topic,options}
    const channel={on(_type,_event,callback){entry.callback=callback;return channel},subscribe(callback){callback('SUBSCRIBED');return channel}}
    subscriptions.push(entry);return channel
  },removeChannel(channel){removed.push(channel)}}
  const scope=vue.effectScope()
  scope.run(()=>{
    const api=load('src/lib/workspaceScope.ts',{
      './supabase':{supabase:client},'@/stores/workspaces':{useWorkspacesStore:()=>workspaces},'./sharing':helpers,
    },{setInterval:callback=>{timers.set(++nextTimer,callback);return nextTimer},clearInterval:id=>timers.delete(id),
      document:{querySelector:()=>editing?{}:null},
    }).useWorkspaceClient()
    api.listen({quick_notes:async()=>callbacks.push('updated')},()=>busy)
  })
  assert.equal(subscriptions[0].topic,'collection:common:4')
  assert.equal(subscriptions[0].options.config.private,true)
  subscriptions[0].callback({payload:{table:'quick_notes'}})
  assert.equal(callbacks.length,0)
  busy=false;editing=true
  timers.get(1)();await Promise.resolve()
  assert.equal(callbacks.length,0)
  editing=false;timers.get(1)();await Promise.resolve();await Promise.resolve()
  assert.equal(callbacks.length,1)
  scope.stop()
  assert.equal(timers.size,0)
  assert.equal(removed.length,1)
  subscriptions[0].callback({payload:{table:'quick_notes'}})
  await Promise.resolve()
  assert.equal(callbacks.length,1)
})

test('joining previews the invite first, attaches the selected workspace and clears the link after success', async () => {
  pinia.setActivePinia(pinia.createPinia())
  const calls=[], refreshed=[], switched=[]
  const auth=vue.reactive({user:{id:'editor'}})
  const workspaces=vue.reactive({activeId:'personal',sharingAvailable:true,binding:()=>undefined,
    switchTo(id){switched.push(id);this.activeId=id}, async refreshBindings(id){refreshed.push(id)}})
  const store=load('src/stores/sharing.ts',{
    '@/lib/supabase':{supabase:{async rpc(name,args){calls.push([name,args]);return {data:name==='preview_collection_invite'?{module:'quick',name:'Work',owner_label:'Owner'}:[],error:null}}}},
    './auth':{useAuthStore:()=>auth},'./workspaces':{useWorkspacesStore:()=>workspaces},'@/lib/sharing':helpers,
  },{window:{location:{origin:'https://notes.example.test',hash:'#invite='+'a'.repeat(64),pathname:'/',search:''}},history:{replaceState(){calls.push(['clear-url'])}},URLSearchParams}).useSharingStore()
  store.showJoin(); store.input='https://notes.example.test/#invite='+'a'.repeat(64)
  await vue.nextTick()
  assert.equal(await store.accept(),false,'an invite cannot be accepted without a preview')
  await store.inspectInvite()
  assert.equal(store.preview.module,'quick')
  store.workspaceId='work'
  assert.equal(await store.accept(),true)
  assert.deepEqual(switched,['work'])
  assert.deepEqual(refreshed,['work'])
  assert.equal(calls.find(([name])=>name==='accept_collection_invite')[1].wid,'work')
  assert.equal(store.open,false)
  assert.equal(store.input,'')
  store.$dispose()
})

test('context network errors prevent fallback writes, while a missing migration keeps legacy personal mode', async () => {
  pinia.setActivePinia(pinia.createPinia())
  let error={message:'offline',code:'NETWORK_ERROR'}
  const auth=vue.reactive({user:{id:'owner'}})
  const store=load('src/stores/workspaces.ts',{
    '@/lib/supabase':{supabase:{async rpc(){return {data:null,error}}}},
    './auth':{useAuthStore:()=>auth},'@/lib/workspaceDefaults':{defaultModules:['detailed']},
    '@/lib/workspaceScope':{disposeWorkspaceStores(){}},
  }).useWorkspacesStore()
  store.activeId='personal'
  assert.equal(await store.refreshBindings('personal',true),false)
  assert.equal(store.scopeReady,false)
  error={message:'not found',code:'PGRST202'}
  assert.equal(await store.refreshBindings('personal',true),true)
  assert.equal(store.scopeReady,true)
  assert.equal(store.sharingAvailable,false)
  store.$dispose()
})
