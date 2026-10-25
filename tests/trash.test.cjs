const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202610170001_workspace_trash.sql','utf8')
async function fixture(){
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair','202610110001_reminder_delivery'])
 await f.db.exec(`alter table todos add column description text;alter table code_snippets add column title text;
 alter table activity_items add column title text,add column subtitle text,add column notes text;`)
 await f.db.exec(fs.readFileSync('supabase/migrations/202610120003_workspace_search.sql','utf8'))
 await f.db.exec(migration)
 return f
}

test('category removal preserves active and trashed notes, checks access and versions, and can be reinstalled',async()=>{
 const {db,owner,guest,wid,gwid,as,rpc}=await fixture()
 try{
  const repair=fs.readFileSync('supabase/migrations/202610220001_integrity_repairs.sql','utf8')
  const health=fs.readFileSync('supabase/diagnostics/application_health.sql','utf8')
  await db.exec(health)
  for(const name of ['delete_workspace(uuid,text)','delete_note_category(uuid,uuid,integer)']){
   assert.equal((await db.query('select status from pg_temp.todo_application_health where check_name=$1',[name])).rows[0].status,'FAIL','missing delete APIs must be visible in the existing health check')
  }
  await db.exec(repair);await db.exec(repair)
  await db.exec(health)
  const checks=(await db.query("select status from pg_temp.todo_application_health where check_name like 'delete_workspace(%' or check_name like 'delete_note_category(%'")).rows
  assert.equal(checks.length,8);assert.ok(checks.every(check=>check.status==='PASS'),'both APIs have the right security, grants, search path and PostgREST argument names')
  await as(owner)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='detailed'",[wid])).rows[0].collection_id
  const addCategory=async name=>(await db.query('insert into categories(created_by,workspace_id,collection_id,name) values($1,$2,$3,$4) returning *',[owner,wid,cid,name])).rows[0]
  const category=await addCategory('Remove'),keep=await addCategory('Keep')
  const addNote=async title=>(await db.query('insert into todos(created_by,workspace_id,collection_id,category_id,title,description) values($1,$2,$3,$4,$5,$6) returning *',[owner,wid,cid,category.id,title,'<p>Preserve content</p>'])).rows[0]
  const active=await addNote('Active'),trashed=await addNote('Trashed')
  await rpc("select trash_change($1,'detailed',$2,'move',1) as result",[wid,trashed.id])
  await assert.rejects(db.query('delete from categories where id=$1',[category.id]),/USE_TRASH/,'the old FK path reproduces the reported failure')
  const remove=(workspace=wid,version=1)=>rpc('select delete_note_category($1,$2,$3) as result',[workspace,category.id,version])
  await assert.rejects(remove(wid,0),/SHARING_CONFLICT/)
  await as(guest);await assert.rejects(remove(),/CATEGORY_ACCESS_DENIED/)
  await assert.rejects(remove(gwid),/CATEGORY_ACCESS_DENIED/)
  await as(owner,'postgres')
  await db.query("insert into collection_members(collection_id,user_id,role) values($1,$2,'viewer')",[cid,guest])
  await db.query("update workspace_module_bindings set collection_id=$1 where workspace_id=$2 and module='detailed'",[cid,gwid])
  await as(guest);await assert.rejects(remove(gwid),/CATEGORY_ACCESS_DENIED/)
  await as(owner,'postgres');await db.query("update collection_members set role='editor' where collection_id=$1 and user_id=$2",[cid,guest])
  await as(guest)
  const result=await remove(gwid)
  assert.equal(result.id,category.id);assert.equal(result.notes.length,2)
  assert.equal(result.notes.find(note=>note.id===active.id).version,2)
  assert.equal(result.notes.find(note=>note.id===trashed.id).version,3)
  const current=(await db.query('select * from todos where id=$1',[active.id])).rows[0]
  assert.equal(current.category_id,null);assert.equal(current.description,'<p>Preserve content</p>')
  const trash=await rpc('select trash_page($1) as result',[gwid]);assert.equal(trash.items[0].version,3)
  await rpc("select trash_change($1,'detailed',$2,'restore',3) as result",[gwid,trashed.id])
  assert.equal((await db.query('select * from todos where id=$1',[trashed.id])).rows[0].category_id,null)
  await assert.rejects(rpc('select delete_note_category($1,$2,1) as result',[gwid,keep.id]),/LAST_CATEGORY/)
  await as('', 'anon');await assert.rejects(remove(),/permission denied/)
 }finally{await db.close()}
})
test('trash preserves note identity and attachments, hides reads/search, checks versions, and keeps analytics history',async()=>{
 const {db,owner,wid,as,rpc}=await fixture()
 try{
  await as(owner)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='detailed'",[wid])).rows[0].collection_id
  const path=`${cid}/${owner}/70000000-0000-0000-0000-000000000001.webp`
  const row=(await db.query('insert into todos(created_by,workspace_id,collection_id,title,description) values($1,$2,$3,$4,$5) returning *',[owner,wid,cid,'Recover me',`<p>Original<img data-note-image="${path}"></p>`])).rows[0]
  const change=(action,version)=>rpc("select trash_change($1,'detailed',$2,$3,$4) as result",[wid,row.id,action,version])
  await assert.rejects(db.query('delete from todos where id=$1',[row.id]),/USE_TRASH/)
  await assert.rejects(db.query('update todos set deleted_at=now() where id=$1',[row.id]),/row-level security|USE_TRASH/)
  const moved=await change('move',1)
  assert.equal(moved.version,2);assert.ok(moved.deleted_at);assert.equal(moved.description,undefined)
  assert.equal((await db.query('select * from todos where id=$1',[row.id])).rows.length,0)
  assert.equal((await rpc("select search_workspace($1,'Recover') as result",[wid])).groups.length,0)
  const page=await rpc('select trash_page($1) as result',[wid])
  assert.equal(page.total,1);assert.equal(page.items[0].id,row.id);assert.equal(page.items[0].can_purge,true)
  await assert.rejects(change('restore',1),/SHARING_CONFLICT/)
  const restored=await change('restore',2);assert.equal(restored.version,3)
  assert.equal((await db.query('select * from todos where id=$1',[row.id])).rows[0].description,row.description)
  assert.equal((await rpc("select search_workspace($1,'Recover') as result",[wid])).groups[0].items[0].record_id,row.id)
  await change('move',3);await assert.rejects(change('restore',2),/SHARING_CONFLICT/)
  await change('purge',4)
  await as(owner,'service_role')
  assert.equal((await rpc('select trash_cleanup_images() as result')).length,0,'image deletion has a one-day grace period')
  await as(owner,'postgres');assert.equal((await db.query('select count(*)::int n from trash_image_cleanup')).rows[0].n,1)
  const kinds=(await db.query('select kind from analytics_events where record_id=$1 order by id',[row.id])).rows.map(r=>r.kind)
  assert.deepEqual(kinds,['created','deleted','baseline','deleted'],'restoring does not create a new note; purging does not double-count deletion')
 }finally{await db.close()}
})

test('trash blocks cross-workspace access, viewers, stale permissions and editor permanent deletion',async()=>{
 const {db,owner,guest,wid,gwid,as,rpc}=await fixture()
 try{
  await as(owner)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='quick'",[wid])).rows[0].collection_id
  const row=(await db.query('insert into quick_notes(created_by,workspace_id,collection_id,content) values($1,$2,$3,$4) returning *',[owner,wid,cid,'Shared recoverable note'])).rows[0]
  await rpc("select trash_change($1,'quick',$2,'move',1) as result",[wid,row.id])
  await as(guest)
  await assert.rejects(rpc('select trash_page($1) as result',[wid]),/TRASH_ACCESS_DENIED/)
  assert.equal((await rpc('select trash_page($1) as result',[gwid])).total,0)
  await as(owner,'postgres')
  await db.query("insert into collection_members(collection_id,user_id,role) values($1,$2,'viewer')",[cid,guest])
  await db.query("update workspace_module_bindings set collection_id=$1 where workspace_id=$2 and module='quick'",[cid,gwid])
  await as(guest);assert.equal((await rpc('select trash_page($1) as result',[gwid])).total,0)
  await assert.rejects(rpc("select trash_change($1,'quick',$2,'restore',2) as result",[gwid,row.id]),/TRASH_ACCESS_DENIED/)
  await as(owner,'postgres');await db.query("update collection_members set role='editor' where collection_id=$1 and user_id=$2",[cid,guest])
  await as(guest);assert.equal((await rpc('select trash_page($1) as result',[gwid])).items[0].can_purge,false)
  await assert.rejects(rpc("select trash_change($1,'quick',$2,'purge',2) as result",[gwid,row.id]),/OWNER_REQUIRED/)
  await rpc("select trash_change($1,'quick',$2,'restore',2) as result",[gwid,row.id])
  assert.equal((await db.query('select * from quick_notes where id=$1',[row.id])).rows.length,1)
  await rpc("select trash_change($1,'quick',$2,'move',3) as result",[gwid,row.id])
  await as(owner,'postgres');await db.query('delete from collection_members where collection_id=$1 and user_id=$2',[cid,guest])
  await as(guest);await assert.rejects(rpc("select trash_change($1,'quick',$2,'restore',4) as result",[gwid,row.id]),/TRASH_ACCESS_DENIED/)
  await as(owner,'anon');await assert.rejects(rpc('select trash_page($1) as result',[wid]),/permission denied/)
  await as(owner);await assert.rejects(rpc('select purge_expired_trash() as result'),/permission denied/)
 }finally{await db.close()}
})

test('emptying uses a server snapshot, pagination is stable, retention expires and referenced images survive cleanup',async()=>{
 const {db,owner,wid,as,rpc}=await fixture()
 try{
  await as(owner)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='quick'",[wid])).rows[0].collection_id
  const add=async()=>{
   const r=(await db.query('insert into quick_notes(created_by,workspace_id,collection_id,content) values($1,$2,$3,$4) returning *',[owner,wid,cid,'Quick recover'])).rows[0]
   await rpc("select trash_change($1,'quick',$2,'move',1) as result",[wid,r.id]);return r.id
  }
  const old=await add(),snapshot=await rpc('select trash_page($1,null,\'\',null,null,1) as result',[wid]),newer=await add()
  assert.equal((await rpc("select trash_empty($1,null,$2) as result",[wid,snapshot.as_of])).count,1)
  const remaining=await rpc('select trash_page($1) as result',[wid]);assert.equal(remaining.total,1);assert.equal(remaining.items[0].id,newer)
  await as(owner,'postgres');await db.exec("select set_config('app.trash_write','on',false)")
  await db.query("update quick_notes set deleted_at=now()-interval '31 days' where id=$1",[newer]);await db.exec("select set_config('app.trash_write','off',false)")
  await as(owner);assert.equal((await rpc('select trash_page($1) as result',[wid])).total,0)
  await assert.rejects(rpc("select trash_change($1,'quick',$2,'restore',3) as result",[wid,newer]),/TRASH_EXPIRED/)
  await as(owner,'service_role');assert.equal(await rpc('select purge_expired_trash() as result'),1)
  await as(owner,'postgres');assert.equal((await db.query('select * from quick_notes where id=any($1)',[[old,newer]])).rows.length,0)
  await db.exec(migration);assert.equal((await db.query('select count(*)::int n from quick_notes')).rows[0].n,2,'rerunning does not modify active notes')
 }finally{await db.close()}
})

test('all note modules hide trashed roots, preserve collection children and do not notify or focus deleted tasks',async()=>{
 const {db,owner,wid,as,rpc}=await fixture()
 try{
  await as(owner)
  const modules={quick:'quick_notes',detailed:'todos',plans:'plans',code:'code_snippets',pomodoro:'pomo_tasks',learning:'learning_subjects',flashcards:'flashcard_decks',workout:'workout_routines',periodic:'periodic_tasks',activities:'activity_items'}
  for(const [module,table] of Object.entries(modules)){
   const cid=(await db.query('select collection_id from workspace_module_bindings where workspace_id=$1 and module=$2',[wid,module])).rows[0].collection_id
   const creator=['quick','detailed','code','pomodoro'].includes(module)?'created_by':'user_id',field=module==='quick'?'content':'title'
   const row=module==='pomodoro'?await rpc("select pomonotes_mutate($1,'create',null,$2,1,1500) as result",[wid,'Recover '+module]):(await db.query(`insert into ${table}(${creator},workspace_id,collection_id,${field}) values($1,$2,$3,$4) returning *`,[owner,wid,cid,'Recover '+module])).rows[0]
   if(module==='learning'){
    await rpc("select mutate_collection_item($1,$2,'learning','add',$3::jsonb,null) as result",[cid,row.id,JSON.stringify({id:'topic',title:'Retained child'})])
    row.version=(await db.query('select version from learning_subjects where id=$1',[row.id])).rows[0].version
   }
   await rpc("select trash_change($1,$2,$3,'move',$4) as result",[wid,module,row.id,row.version])
   if(module!=='pomodoro')assert.equal((await db.query(`select * from ${table} where id=$1`,[row.id])).rows.length,0,module)
   if(module==='learning'){
    assert.equal((await db.query('select * from learning_subjects_items where parent_id=$1',[row.id])).rows.length,0,'child reads are also hidden')
    await assert.rejects(rpc("select mutate_collection_item($1,$2,'learning','add',$3::jsonb,null) as result",[cid,row.id,JSON.stringify({id:'late',title:'Must not mutate trash'})]),/USE_TRASH/)
   }
   if(module==='pomodoro'){
    assert.equal((await rpc("select pomonotes_page($1,'all') as result",[wid])).items.some(item=>item.id===row.id),false)
    const proposal={id:'90000000-0000-0000-0000-000000000001',workspace_id:wid,association:'task',task_id:row.id,status:'running'}
    await assert.rejects(rpc('select claim_focus_session($1,$2::jsonb,false) as result',['90000000-0000-0000-0000-000000000002',JSON.stringify(proposal)]),/FOCUS_TARGET_UNAVAILABLE/)
   }
   if(module==='periodic')assert.equal((await rpc('select personal_workspace_reminders() as result')).some(item=>item.id===row.id),false)
   await rpc("select trash_change($1,$2,$3,'restore',$4) as result",[wid,module,row.id,row.version+1])
   if(module!=='pomodoro')assert.equal((await db.query(`select * from ${table} where id=$1`,[row.id])).rows.length,1,module)
   else assert.equal((await rpc("select pomonotes_page($1,'all') as result",[wid])).items.some(item=>item.id===row.id),true)
   if(module==='learning')assert.equal((await db.query('select * from learning_subjects_items where parent_id=$1',[row.id])).rows.length,1)
  }
 }finally{await db.close()}
})

test('image cleanup never queues foreign collections or removes an image retained by another note',async()=>{
 const {db,owner,wid,as,rpc}=await fixture()
 try{
  await as(owner)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='detailed'",[wid])).rows[0].collection_id
  const local=`${cid}/${owner}/70000000-0000-0000-0000-000000000001.webp`,foreign=`80000000-0000-0000-0000-000000000001/${owner}/70000000-0000-0000-0000-000000000002.webp`
  const add=async html=>(await db.query('insert into todos(created_by,workspace_id,collection_id,title,description) values($1,$2,$3,$4,$5) returning *',[owner,wid,cid,'Images',html])).rows[0]
  const note=await add(`<img data-note-image="${local}"><img data-note-image="${foreign}">`)
  await add(`<img data-note-image="${local}">`)
  await rpc("select trash_change($1,'detailed',$2,'move',1) as result",[wid,note.id]);await rpc("select trash_change($1,'detailed',$2,'purge',2) as result",[wid,note.id])
  await as(owner,'postgres');assert.deepEqual((await db.query('select path from trash_image_cleanup')).rows.map(row=>row.path),[local])
  await db.exec("update trash_image_cleanup set queued_at=now()-interval '2 days'")
  await as(owner,'service_role');assert.deepEqual(await rpc('select trash_cleanup_images() as result'),[])
  await as(owner,'postgres');assert.equal((await db.query('select * from trash_image_cleanup')).rows.length,0)
 }finally{await db.close()}
})

function loadSource(path,globals={}){
 const exports={}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require,console,Response,...globals})
 return exports
}
test('a live focus task cannot be trashed until its session is ended, and past focus credit remains linked',async()=>{
 const {db,owner,wid,as,rpc}=await fixture()
 try{
  await as(owner)
  const task=await rpc("select pomonotes_mutate($1,'create',null,'Focused task',2,60) as result",[wid])
  const client='90000000-0000-0000-0000-000000000002',id='90000000-0000-0000-0000-000000000003'
  const proposal={id,workspace_id:wid,started_at:new Date().toISOString(),planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id}
  await rpc('select claim_focus_session($1,$2::jsonb,false) as result',[client,JSON.stringify(proposal)])
  await assert.rejects(rpc("select trash_change($1,'pomodoro',$2,'move',1) as result",[wid,task.id]),/TRASH_FOCUS_ACTIVE/)
  await rpc('select end_focus_session($1) as result',[id])
  await rpc("select trash_change($1,'pomodoro',$2,'move',1) as result",[wid,task.id])
  await as(owner,'postgres');assert.equal((await db.query('select task_id from analytics_focus_sessions where id=$1',[id])).rows[0].task_id,task.id)
 }finally{await db.close()}
})
test('Undo groups deletions, pauses for pointer and focus, deduplicates clicks and retries only failed restores',async()=>{
 const {createPinia,setActivePinia}=require('pinia');setActivePinia(createPinia())
 let now=0,id=0,fail=true,release;const timers=new Map(),restored=[]
 const store=loadSource('src/stores/ui.ts',{Date:class extends Date{static now(){return now}},setTimeout:(callback,ms)=>{const key=++id;timers.set(key,{callback,ms});return key},clearTimeout:key=>timers.delete(key)}).useUIStore()
 try{
  const describe=count=>String(count),add=(run)=>store.addUndoToast(describe,'Undo',run,'workspace')
  add(async()=>{if(fail)throw Error('offline');restored.push('one')})
  add(async()=>{restored.push('two')})
  assert.equal(store.toasts.length,1);assert.equal(store.toasts[0].message,'2')
  const toast=store.toasts[0]
  now=2000;store.pauseToast(toast.id);store.pauseToast(toast.id,'focus');assert.equal(timers.size,0)
  store.resumeToast(toast.id);assert.equal(timers.size,0,'focus still holds the timer')
  store.resumeToast(toast.id,'focus');assert.equal([...timers.values()][0].ms,8000)
  await store.runToastAction(toast.id);assert.deepEqual(restored,['two']);assert.equal(store.toasts[0].message,'1')
  fail=false;await store.runToastAction(toast.id);assert.deepEqual(restored,['two','one']);assert.equal(store.toasts.length,0)
  add(()=>new Promise(resolve=>release=resolve));const next=store.toasts[0]
  const pending=store.runToastAction(next.id);await store.runToastAction(next.id);assert.equal(next.pending,true)
  release();await pending;assert.equal(store.toasts.length,0);assert.equal(timers.size,0)
 }finally{store.$dispose()}
})

test('cleanup is server-only, removes only server-selected images and retains failed batches for retry',async()=>{
 const {trashCleanupHandler}=loadSource('supabase/functions/trash-cleanup/handler.ts')
 const calls=[];let fail=true
 const handler=trashCleanupHandler({secret:'server-secret',purge:async()=>{calls.push('purge');return 2},images:async(ack)=>{calls.push(ack?'ack':'list');return ack?[]:['approved.webp']},remove:async paths=>{calls.push(paths);if(fail)throw Error('storage unavailable')}})
 const request=(token='server-secret',method='POST')=>new Request('https://example.test/cleanup',{method,headers:{Authorization:'Bearer '+token}})
 assert.equal((await handler(request('anon-token'))).status,401);assert.deepEqual(calls,[])
 assert.equal((await handler(request('server-secret','GET'))).status,405)
 assert.equal((await handler(request())).status,500);assert.equal(calls.includes('ack'),false)
 fail=false;const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{purged:2,images:1});assert.equal(calls.at(-1),'ack')
})
