const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202610240001_activity_collections.sql','utf8')
const uuid=n=>`94000000-0000-0000-0000-${String(n).padStart(12,'0')}`
async function fixture(){
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair','202610110001_reminder_delivery'])
 await f.db.exec("alter table todos add column description text;alter table code_snippets add column title text;alter table activity_items add column title text,add column subtitle text,add column notes text,add column type text,add column status text default 'want',add column image_url text,add column external_source text,add column meta jsonb default '{}',add column updated_at timestamptz default now();create unique index activity_external_scoped on activity_items(collection_id,type,external_source,external_id) where external_id is not null and external_source is not null;")
 for(const name of ['202610120003_workspace_search','202610170001_workspace_trash'])await f.db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
 await f.db.exec(migration);await f.as(f.owner)
 f.mutate=(operation,rid,payload={},version=null,wid=f.wid)=>f.rpc('select activity_library_mutate($1,$2,$3,$4::jsonb,$5) as result',[wid,operation,rid,JSON.stringify(payload),version])
 f.load=(wid=f.wid)=>f.rpc('select activity_library_load($1) as result',[wid])
 return f
}
test('activity collections mix types, reuse one card across collections and retain status and memberships through trash',async()=>{
 const f=await fixture(),{db,mutate,load,rpc,wid}=f
 try{
  const a=(await mutate('collection.create',uuid(1),{name:'Favorites',color:'#64748B'})).collection,b=(await mutate('collection.create',uuid(2),{name:'Science'})).collection
  const payload={group_id:a.id,type:'book',title:'Cosmos',external_source:'openlibrary',external_id:'/works/cosmos',meta:{}}
  let result=await mutate('item.add',uuid(3),payload),item=result.item
  await mutate('item.add',uuid(4),{...payload,type:'movie',title:'Arrival',external_source:'tmdb',external_id:'329865'})
  result=await mutate('item.add',uuid(5),{...payload,group_id:b.id});assert.equal(result.item.id,item.id);assert.equal(result.already_exists,false);assert.equal(result.group_ids.length,2)
  result=await mutate('item.add',uuid(5),{...payload,group_id:b.id});assert.equal(result.already_exists,true)
  item=(await mutate('item.status',item.id,{status:'done'},result.item.version)).item
  assert.equal((await load()).items.length,2);assert.equal((await load()).items.find(i=>i.id===item.id).status,'done')
  await assert.rejects(mutate('item.status',item.id,{status:'want'},item.version-1),/SHARING_CONFLICT/)
  await rpc("select trash_change($1,'activities',$2,'move',$3) as result",[wid,item.id,item.version]);assert.equal((await load()).memberships.length,1)
  await rpc("select trash_change($1,'activities',$2,'restore',$3) as result",[wid,item.id,item.version+1]);assert.equal((await load()).memberships.length,3)
  item=(await load()).items.find(i=>i.id===item.id)
  result=await mutate('item.collections',item.id,{group_ids:[]},item.version);assert.equal(result.group_ids.length,0);assert.equal(result.item.status,'done')
  await f.as(f.owner,'postgres');await db.exec(migration);await f.as(f.owner);assert.equal((await load()).items.length,2)
 }finally{await db.close()}
})
test('collection archive is reversible, preserves cards and rejects stale versions and invalid inputs',async()=>{
 const f=await fixture(),{mutate,load}=f
 try{
  let group=(await mutate('collection.create',uuid(10),{name:'Movies'})).collection
  assert.equal((await mutate('collection.create',group.id,{name:'Retry'})).collection.name,'Movies')
  group=(await mutate('collection.update',group.id,{name:'Action films',color:'#478564'},group.version)).collection
  const item=(await mutate('item.add',uuid(11),{group_id:group.id,type:'movie',title:'Film'})).item
  const duplicate=await mutate('item.add',uuid(19),{group_id:group.id,type:'movie',title:' film '})
  assert.equal(duplicate.item.id,item.id);assert.equal(duplicate.already_exists,true)
  group=(await mutate('collection.archive',group.id,{},group.version)).collection
  assert.ok(group.archived_at);assert.equal((await load()).items.length,1);assert.equal((await load()).memberships.length,1)
  await assert.rejects(mutate('item.add',uuid(12),{group_id:group.id,type:'book',title:'Book'}),/ACTIVITY_COLLECTION_ARCHIVED/)
  await mutate('collection.restore',group.id,{},group.version)
  for(const bad of [{type:'bad',title:'X'},{type:'book',title:''},{type:'book',title:'X',image_url:'javascript:bad'},{type:'book',title:'X',meta:[]}])await assert.rejects(mutate('item.add',uuid(12),bad),/INVALID_ACTIVITY_INPUT/)
  await assert.rejects(mutate('collection.update',group.id,{name:'Stale'},1),/SHARING_CONFLICT/)
  await assert.rejects(mutate('item.collections',item.id,{group_ids:[null]},item.version),/ACTIVITY_COLLECTION_ARCHIVED/)
  assert.equal((await load()).items.length,1)
 }finally{await f.db.close()}
})
test('shared viewers can browse collections but cannot mutate or link foreign cards, and revoked access is fenced',async()=>{
 const f=await fixture(),{mutate,load,db,as,owner,guest,wid,gwid,rpc}=f
 try{
  const group=(await mutate('collection.create',uuid(20),{name:'Shared'})).collection
  const item=(await mutate('item.add',uuid(21),{type:'book',title:'Private book',group_id:group.id})).item
  await as(guest);assert.equal((await load(gwid)).collections.length,0);assert.equal((await db.query('select * from activity_collections')).rows.length,0)
  await assert.rejects(mutate('item.collections',item.id,{group_ids:[group.id]},item.version,gwid),/ACTIVITY_ACCESS_DENIED/)
  await assert.rejects(load(wid),/ACTIVITY_ACCESS_DENIED/)
  await as(owner);const invitation=await rpc("select create_collection_invite($1,'activities','viewer') as result",[wid])
  await as(guest);await rpc('select accept_collection_invite($1,$2) as result',[invitation.token,gwid])
  assert.equal((await load(gwid)).collections.length,1)
  await assert.rejects(mutate('collection.update',group.id,{name:'No'},group.version,gwid),/ACTIVITY_ACCESS_DENIED/)
  await assert.rejects(db.query('delete from activity_collection_items where item_id=$1',[item.id]),/permission denied/)
  await as(owner);await rpc("select manage_collection($1,'remove_member',$2) as result",[group.collection_id,guest])
  await as(guest);assert.equal((await load(gwid)).items.length,0)
  await as(owner,'anon');await assert.rejects(load(),/permission denied/)
 }finally{await db.close()}
})
