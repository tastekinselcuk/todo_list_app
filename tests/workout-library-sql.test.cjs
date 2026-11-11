const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202611070001_workout_custom_library.sql','utf8')
const removal=fs.readFileSync('supabase/migrations/202611070002_workout_library_removal.sql','utf8')
const movement=(fields={})=>({name:'My cable row',imageUrl:'https://images.example.test/row.gif',group:'back',equipment:'cable',...fields})
async function fixture(){const f=await projectDB();await f.db.exec(migration);await f.db.exec(removal);return f}
const save=(f,wid,id,input=movement())=>f.rpc('select workout_library_save($1,$2,$3) result',[wid,id,JSON.stringify(input)])

test('custom library persists independently of routines, retries once, rejects overwrites and survives reapplying setup',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const id=crypto.randomUUID(),first=await save(f,f.wid,id)
  assert.equal(first.id,'custom:'+id);assert.equal(first.source,'custom');assert.equal(first.group,'back');assert.equal(first.images[0],movement().imageUrl)
  assert.deepEqual(await save(f,f.wid,id),first)
  assert.equal((await f.rpc('select workout_library_load($1) result',[f.wid])).length,1)
  await assert.rejects(save(f,f.wid,id,movement({name:'A different movement'})),/WORKOUT_LIBRARY_CONFLICT/)
  assert.equal((await f.db.query('select * from workout_routines')).rows.length,0,'library creation never creates an unwanted program')
  await f.as(f.owner,'postgres');await f.db.exec(migration);await f.db.exec(removal);await f.as(f.owner)
  assert.deepEqual(await f.rpc('select workout_library_load($1) result',[f.wid]),[first])
  await assert.rejects(f.db.query('select * from workout_library_exercises'),/permission denied/)
  await f.as(null,'anon');await assert.rejects(f.rpc('select workout_library_load($1) result',[f.wid]),/permission denied/)
 }finally{await f.db.close()}
})

test('custom removal hides the card permanently across retries and reloads while existing programs keep their movement snapshot',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const id=crypto.randomUUID(),item=await save(f,f.wid,id)
  const cid=(await f.db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='workout'",[f.wid])).rows[0].collection_id
  const snapshot={id:'saved-movement',catalogId:item.id,name:item.name,imageUrl:item.images[0],sets:3,reps:'10',isCompleted:false}
  const routine=(await f.db.query("insert into workout_routines(user_id,workspace_id,collection_id,title) values($1,$2,$3,'Existing program') returning id",[f.owner,f.wid,cid])).rows[0].id
  await f.rpc("select mutate_collection_item($1,$2,'workout','add',$3) result",[cid,routine,JSON.stringify(snapshot)])
  const first=await f.rpc('select workout_library_remove($1,$2) result',[f.wid,id]);assert.equal(first.removed,true)
  assert.deepEqual(await f.rpc('select workout_library_remove($1,$2) result',[f.wid,id]),first)
  assert.deepEqual(await f.rpc('select workout_library_load($1) result',[f.wid]),[])
  const program=(await f.db.query('select exercises from workout_routines where id=$1',[routine])).rows[0]
  assert.equal(program.exercises[0].catalogId,item.id);assert.equal(program.exercises[0].imageUrl,item.images[0])
  await assert.rejects(save(f,f.wid,id),/WORKOUT_LIBRARY_REMOVED/)
  await f.as(f.owner,'postgres');await f.db.exec(removal);await f.as(f.owner)
  assert.deepEqual(await f.rpc('select workout_library_load($1) result',[f.wid]),[])
  await assert.rejects(f.rpc('select workout_library_remove($1,$2) result',[f.wid,crypto.randomUUID()]),/WORKOUT_LIBRARY_UNAVAILABLE/)
 }finally{await f.db.close()}
})

test('sharing exposes the workout library to members and only editors can append; revoked and cross-workspace callers are denied',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const first=await save(f,f.wid,crypto.randomUUID())
  const invite=await f.rpc("select create_collection_invite($1,'workout','viewer') result",[f.wid])
  await f.as(f.guest);await f.rpc('select accept_collection_invite($1,$2) result',[invite.token,f.gwid])
  assert.equal((await f.rpc('select workout_library_load($1) result',[f.gwid]))[0].id,first.id)
  await assert.rejects(save(f,f.gwid,crypto.randomUUID()),/READ_ONLY/)
  await assert.rejects(f.rpc('select workout_library_remove($1,$2) result',[f.gwid,first.id.slice(7)]),/READ_ONLY/)
  await assert.rejects(f.rpc('select workout_library_load($1) result',[f.wid]),/ACCESS_DENIED/)
  await f.as(f.owner,'postgres');const cid=(await f.db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='workout'",[f.wid])).rows[0].collection_id
  await f.db.query("update collection_members set role='editor' where collection_id=$1 and user_id=$2",[cid,f.guest])
  await f.as(f.guest);await save(f,f.gwid,crypto.randomUUID(),movement({name:'Guest exercise',group:'arms',equipment:'dumbbell'}))
  await f.rpc('select workout_library_remove($1,$2) result',[f.gwid,first.id.slice(7)])
  await f.as(f.owner);assert.equal((await f.rpc('select workout_library_load($1) result',[f.wid])).length,1)
  await f.as(f.owner,'postgres');await f.db.query('delete from collection_members where collection_id=$1 and user_id=$2',[cid,f.guest]);await f.as(f.guest)
  await assert.rejects(f.rpc('select workout_library_load($1) result',[f.gwid]),/ACCESS_DENIED/)
  await assert.rejects(f.rpc('select workout_library_remove($1,$2) result',[f.gwid,first.id.slice(7)]),/ACCESS_DENIED/)
 }finally{await f.db.close()}
})

test('server validates image links and classification and does not allow client ownership fields or inactive workspaces',async()=>{
 const f=await fixture();try{
  await f.as(f.owner)
  for(const fields of [{name:''},{name:'x'.repeat(161)},{imageUrl:'javascript:alert(1)'},{imageUrl:'data:image/gif;base64,xxx'},{imageUrl:'https://user:password@example.test/image.gif'},{group:'all'},{equipment:'invalid'},{name:null},{created_by:f.guest}])
   await assert.rejects(save(f,f.wid,crypto.randomUUID(),movement(fields)),/INVALID_CUSTOM_EXERCISE/)
  assert.deepEqual(await f.rpc('select workout_library_load($1) result',[f.wid]),[])
  await f.db.query("update workspaces set active_modules=array['detailed'] where id=$1",[f.wid])
  await assert.rejects(save(f,f.wid,crypto.randomUUID()),/ACCESS_DENIED/)
 }finally{await f.db.close()}
})

test('workspace deletion removes custom library entries through their collection without breaking audit cascades',async()=>{
 const f=await fixture();try{
  await f.as(f.owner,'postgres');await f.db.exec(fs.readFileSync('supabase/migrations/202610170003_workspace_deletion.sql','utf8'))
  await f.as(f.owner);await save(f,f.wid,crypto.randomUUID())
  const title=(await f.db.query('select name from workspaces where id=$1',[f.wid])).rows[0].name
  const replacement=(await f.db.query("insert into workspaces(user_id,name) values($1,'Another workspace') returning id",[f.owner])).rows[0].id
  const removed=await f.rpc('select delete_workspace($1,$2) result',[f.wid,title]);assert.equal(removed.next_workspace.id,replacement)
  await f.as(f.owner,'postgres');assert.equal((await f.db.query('select * from workout_library_exercises')).rows.length,0)
 }finally{await f.db.close()}
})
