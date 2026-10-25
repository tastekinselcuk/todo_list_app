const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202610230002_learning_workspace.sql','utf8')
const uuid=n=>`89000000-0000-0000-0000-${String(n).padStart(12,'0')}`
function loadTS(path,deps={}){const exports={};vm.compileFunction(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,['exports','require'])(exports,name=>deps[name]||require(name));return exports}
const examCatalog=loadTS('src/features/learning/lib/examTemplates.ts',{'./templates':loadTS('src/features/learning/lib/templates.ts')})
async function fixture(storage=false){
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair','202610110001_reminder_delivery'])
 await f.db.exec('alter table todos add column description text;alter table code_snippets add column title text;alter table activity_items add column title text,add column subtitle text,add column notes text;alter table learning_subjects add column color text;alter table flashcard_decks add column color text;')
 for(const name of ['202610120003_workspace_search','202610170001_workspace_trash','202610180001_tasks_calendar'])await f.db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
 if(storage)await f.db.exec("create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant all on storage.objects to authenticated;")
 await f.db.exec(migration);await f.db.exec(fs.readFileSync('supabase/migrations/202610240003_learning_inline.sql','utf8'));await f.as(f.owner)
 f.mutate=(op,sid=null,tid=null,payload={},version=null,wid=f.wid)=>f.rpc('select learning_mutate($1,$2,$3,$4,$5::jsonb,$6) as result',[wid,op,sid,tid,JSON.stringify(payload),version])
 f.load=()=>f.rpc('select learning_load($1) as result',[f.wid])
 return f
}
test('learning curriculum is versioned, import is repeatable and topic archives preserve personal history',async()=>{
 const f=await fixture(),{db,mutate,load}=f
 try{
  const template={key:'tyt',revision:'2026-10',subjects:[{key:'math',title:'Math',topics:[{key:'numbers',title:'Numbers'},{key:'sets',title:'Sets'}]}]}
  let subject=(await mutate('template.import',null,null,template)).subjects[0],topic=subject.topics[0]
  let p=(await mutate('progress.update',subject.id,topic.id,{status:'doing'},0)).progress
  await assert.rejects(mutate('progress.update',subject.id,topic.id,{status:'done'},0),/SHARING_CONFLICT/)
  subject=(await mutate('topic.update',subject.id,topic.id,{title:'Renamed'},topic._version)).subject
  await mutate('template.import',null,null,template)
  let data=await load();assert.equal(data.subjects.length,1);assert.equal(data.subjects[0].topics.length,2);assert.equal(data.subjects[0].topics[0].title,'Renamed');assert.equal(data.progress[0].status,'doing')
  topic=subject.topics[0];subject=(await mutate('topic.archive',subject.id,topic.id,{},topic._version)).subject
  assert.equal(subject.topics[0].archived,true)
  await assert.rejects(mutate('progress.update',subject.id,topic.id,{status:'done'},p.version),/LEARNING_TOPIC_UNAVAILABLE/)
  await mutate('topic.restore',subject.id,topic.id,{},subject.topics[0]._version)
  assert.equal((await load()).progress[0].status,'doing')
  await f.as(f.owner,'postgres');await db.exec(migration);await f.as(f.owner)
  assert.equal((await load()).subjects[0].topics.length,2)
 }finally{await db.close()}
})
test('learning private progress, mistakes and review retries cannot leak or duplicate',async()=>{
 const f=await fixture(),{db,mutate,owner,guest,wid,gwid,as,rpc}=f
 try{
  let s=(await mutate('subject.create',uuid(1),null,{title:'Study',color:'#64748B'})).subject
  s=(await mutate('subject.update',s.id,null,{title:'Renamed subject',color:'#478564'},s.version)).subject
  assert.equal(s.title,'Renamed subject');assert.equal(s.color,'#478564')
  await assert.rejects(mutate('topic.add',s.id,null,{titles:[null]}),/INVALID_LEARNING_INPUT/)
  s=(await mutate('topic.add',s.id,null,{titles:['One','One','Two']})).subject;assert.equal(s.topics.length,2)
  await mutate('topic.move',s.id,s.topics[1].id,{direction:-1},s.topics[1]._version)
  s=(await f.load()).subjects[0];assert.equal(s.topics[0].title,'Two')
  await mutate('subject.create',uuid(25),null,{title:'Second subject'})
  await mutate('subject.move',s.id,null,{direction:1},s.version)
  assert.equal((await f.load()).subjects[1].id,s.id)
  const tid=s.topics[0].id
  let m=(await mutate('mistake.create',s.id,tid,{id:uuid(2),prompt:'Private question',reason:'knowledge'})).mistake
  const attempt={id:m.id,attempt_id:uuid(3),correct:false}
  let result=await mutate('mistake.review',s.id,tid,attempt,m.version)
  await mutate('mistake.review',s.id,tid,attempt,m.version)
  assert.equal((await db.query('select count(*)::integer n from learning_reviews')).rows[0].n,1)
  assert.equal(result.mistake.attempts,1)
  await assert.rejects(mutate('mistake.update',s.id,tid,{...m,prompt:'Stale'},m.version),/SHARING_CONFLICT/)
  await assert.rejects(mutate('mistake.create',s.id,tid,{id:uuid(4),prompt:'Bad',image_path:`${guest}/${wid}/${uuid(9)}.webp`}),/INVALID_LEARNING_INPUT/)
  m=(await mutate('mistake.archive',s.id,tid,{id:m.id},result.mistake.version)).mistake
  assert.equal((await rpc('select learning_mistakes_page($1) as result',[wid])).items.length,0)
  await mutate('mistake.restore',s.id,tid,{id:m.id},m.version)
  await as(guest)
  assert.equal((await db.query('select * from learning_progress')).rows.length,0)
  assert.equal((await db.query('select * from learning_mistakes')).rows.length,0)
  await assert.rejects(rpc('select learning_load($1) as result',[wid]),/LEARNING_ACCESS_DENIED/)
  await assert.rejects(mutate('progress.update',s.id,tid,{status:'done'},0,gwid),/LEARNING_ACCESS_DENIED/)
  await as(owner,'anon');await assert.rejects(rpc('select learning_load($1) as result',[wid]),/permission denied/)
 }finally{await db.close()}
})
test('learning links create actual note, deck, focus task and calendar block once',async()=>{
 const f=await fixture(),{db,mutate}=f
 try{
  let s=(await mutate('subject.create',uuid(10),null,{title:'Subject'})).subject
  s=(await mutate('topic.add',s.id,null,{titles:['Topic']})).subject;const tid=s.topics[0].id
  const note=(await mutate('link.note',s.id,tid)).link
  assert.equal((await mutate('link.note',s.id,tid)).link.id,note.id)
  assert.equal((await db.query('select title from todos where id=$1',[note.id])).rows[0].title,'Topic')
  const deck=(await mutate('link.deck',s.id,tid)).link
  assert.equal((await mutate('link.deck',s.id,tid)).link.id,deck.id)
  const focus=(await mutate('link.focus',s.id,tid,{seconds:1500})).link
  assert.ok(focus.target.id);assert.equal((await mutate('link.focus',s.id,tid,{seconds:1500})).link.target.id,focus.target.id)
  const plan={id:uuid(11),starts_at:'2026-10-25T09:00Z',ends_at:'2026-10-25T10:00Z',timezone:'Europe/Istanbul'}
  const block=(await mutate('link.plan',s.id,tid,plan)).link
  assert.equal(block.id,plan.id);await mutate('link.plan',s.id,tid,plan)
  assert.equal((await db.query('select count(*)::integer n from work_blocks')).rows[0].n,1)
 }finally{await db.close()}
})
test('shared viewers keep independent study records and private image policies reject cross-account access',async()=>{
 const f=await fixture(true),{db,mutate,as,owner,guest,wid,gwid,rpc}=f
 try{
  let s=(await mutate('subject.create',uuid(20),null,{title:'Shared curriculum'})).subject
  s=(await mutate('topic.add',s.id,null,{titles:['Topic']})).subject;const tid=s.topics[0].id
  await mutate('progress.update',s.id,tid,{status:'done'},0)
  const path=`${owner}/${wid}/${uuid(21)}.webp`
  await mutate('mistake.create',s.id,tid,{id:uuid(22),image_path:path})
  await db.query("insert into storage.objects(bucket_id,name) values('learning-images',$1)",[path])
  await as(owner,'postgres')
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='learning'",[wid])).rows[0].collection_id
  await db.query("insert into collection_members(collection_id,user_id,role) values($1,$2,'viewer')",[cid,guest])
  await db.query("update workspace_module_bindings set collection_id=$1 where workspace_id=$2 and module='learning'",[cid,gwid])
  await as(guest)
  let data=await rpc('select learning_load($1) as result',[gwid]);assert.equal(data.subjects.length,1);assert.equal(data.progress.length,0);assert.equal(data.due_mistakes.length,0)
  assert.equal((await db.query('select * from storage.objects')).rows.length,0)
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('learning-images',$1)",[path]),/row-level security/)
  await assert.rejects(mutate('topic.update',s.id,tid,{title:'No'},s.topics[0]._version,gwid),/LEARNING_ACCESS_DENIED/)
  await mutate('progress.update',s.id,tid,{status:'doing'},0,gwid)
  await mutate('mistake.create',s.id,tid,{id:uuid(23),prompt:'Guest private'},null,gwid)
  data=await rpc('select learning_load($1) as result',[gwid]);assert.equal(data.progress[0].status,'doing');assert.equal(data.due_mistakes[0].prompt,'Guest private')
  await as(owner);data=await f.load();assert.equal(data.progress[0].status,'done');assert.equal(data.due_mistakes.length,1)
  assert.equal((await db.query('select * from learning_mistakes')).rows.length,1)
  await as(owner,'postgres');await db.query("update workspaces set active_modules=array_remove(active_modules,'flashcards') where id=$1",[wid]);await as(owner)
  await assert.rejects(mutate('link.deck',s.id,tid),/LEARNING_ACCESS_DENIED/)
 }finally{await db.close()}
})

test('learning drag order is atomic, versioned and preserves archived topics and private progress',async()=>{
 const f=await fixture(),{db,mutate,rpc,load}=f
 const reorder=(sid,ids,versions,wid=f.wid)=>rpc('select learning_reorder($1,$2,$3::text[],$4::jsonb) as result',[wid,sid,ids,JSON.stringify(versions)])
 try{
  let s=(await mutate('subject.create',uuid(31),null,{title:'Professional study'})).subject
  s=(await mutate('topic.add',s.id,null,{titles:['One','Archived','Three']})).subject
  const [one,archived,three]=s.topics
  await mutate('progress.update',s.id,one.id,{status:'doing'},0)
  await mutate('mistake.create',s.id,one.id,{id:uuid(32),prompt:'Private question'})
  s=(await mutate('topic.archive',s.id,archived.id,{},archived._version)).subject
  const before=await load(),version=s.version,ids=[three.id,archived.id,one.id]
  s=(await reorder(s.id,ids,{[s.id]:version})).subject
  assert.deepEqual(s.topics.map(t=>t.id),ids);assert.equal(s.topics[1].archived,true)
  assert.deepEqual(s.topics.map(t=>[t.id,t._version]).sort(),before.subjects[0].topics.map(t=>[t.id,t._version]).sort(),'positions do not overwrite topic content versions')
  assert.deepEqual((await load()).progress,before.progress);assert.deepEqual((await load()).due_mistakes,before.due_mistakes)
  await assert.rejects(reorder(s.id,[one.id,archived.id,three.id],{[s.id]:version}),/SHARING_CONFLICT/)
  for(const bad of [[one.id,three.id],[one.id,one.id,three.id],[one.id,archived.id,'foreign']])await assert.rejects(reorder(s.id,bad,{[s.id]:s.version}),/INVALID_LEARNING_ORDER/)
  assert.deepEqual((await load()).subjects[0].topics.map(t=>t.id),ids)
  const second=(await mutate('subject.create',uuid(33),null,{title:'Personal study'})).subject
  let versions=Object.fromEntries((await load()).subjects.map(s=>[s.id,s.version]))
  let result=await reorder(null,[second.id,s.id],versions)
  assert.deepEqual(result.subjects.map(s=>s.id),[second.id,s.id]);assert.deepEqual((await load()).subjects.map(s=>s.id),[second.id,s.id])
  await assert.rejects(reorder(null,[s.id,second.id],versions),/SHARING_CONFLICT/)
  versions=Object.fromEntries(result.subjects.map(s=>[s.id,s.version]))
  await assert.rejects(reorder(null,[s.id],versions),/INVALID_LEARNING_ORDER/)
  await f.as(f.guest);await assert.rejects(reorder(s.id,ids,{[s.id]:s.version}),/LEARNING_ACCESS_DENIED/)
  await f.as(f.owner,'postgres')
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='learning'",[f.wid])).rows[0].collection_id
  await db.query("insert into collection_members(collection_id,user_id,role) values($1,$2,'viewer')",[cid,f.guest])
  await db.query("update workspace_module_bindings set collection_id=$1 where workspace_id=$2 and module='learning'",[cid,f.gwid])
  await f.as(f.guest);await assert.rejects(reorder(null,[second.id,s.id],versions,f.gwid),/LEARNING_ACCESS_DENIED/)
  await f.as(f.owner,'postgres');await db.exec(fs.readFileSync('supabase/migrations/202610240003_learning_inline.sql','utf8'));await f.as(f.owner)
  assert.deepEqual((await load()).subjects.map(s=>s.id),[second.id,s.id])
 }finally{await db.close()}
})

test('compact learning name limits apply to new titles without truncating legacy records',async()=>{
 const f=await fixture(),{db,mutate}=f
 try{
  await assert.rejects(mutate('subject.create',uuid(40),null,{title:'x'.repeat(81)}),/INVALID_LEARNING_NAME/)
  let s=(await mutate('subject.create',uuid(40),null,{title:'x'.repeat(80)})).subject
  await assert.rejects(mutate('subject.update',s.id,null,{title:'x'.repeat(81)},s.version),/INVALID_LEARNING_NAME/)
  await assert.rejects(mutate('topic.add',s.id,null,{titles:['Valid','x'.repeat(101)]}),/INVALID_LEARNING_NAME/)
  assert.equal((await f.load()).subjects[0].topics.length,0,'invalid bulk additions roll back together')
  s=(await mutate('topic.add',s.id,null,{titles:['x'.repeat(100)]})).subject
  await assert.rejects(mutate('topic.update',s.id,s.topics[0].id,{title:'x'.repeat(101)},s.topics[0]._version),/INVALID_LEARNING_NAME/)
  await f.as(f.owner,'postgres');await db.exec('alter table learning_subjects disable trigger learning_name_limit;alter table learning_subjects_items disable trigger learning_name_limit;');await f.as(f.owner)
  s=(await mutate('subject.update',s.id,null,{title:'l'.repeat(110)},s.version)).subject
  s=(await mutate('topic.update',s.id,s.topics[0].id,{title:'l'.repeat(150)},s.topics[0]._version)).subject
  await f.as(f.owner,'postgres');await db.exec('alter table learning_subjects enable trigger learning_name_limit;alter table learning_subjects_items enable trigger learning_name_limit;');await f.as(f.owner)
  s=(await mutate('topic.archive',s.id,s.topics[0].id,{},s.topics[0]._version)).subject
  assert.equal(s.title.length,110);assert.equal(s.topics[0].title.length,150)
  s=(await mutate('subject.update',s.id,null,{title:'Updated study'},s.version)).subject
  assert.equal(s.title,'Updated study');assert.equal(s.topics[0].title.length,150)
 }finally{await db.close()}
})

test('every real exam template imports and reimports through the existing API without duplicate studies or topics',async()=>{
 const f=await fixture()
 try{
  const payloads=examCatalog.examTemplates.map(template=>examCatalog.selectedExamTemplate(template,examCatalog.allExamTopicKeys(template)))
  const expectedSubjects=payloads.reduce((n,p)=>n+p.subjects.length,0),expectedTopics=payloads.reduce((n,p)=>n+p.subjects.reduce((n,s)=>n+s.topics.length,0),0)
  for(const payload of payloads)await f.mutate('template.import',null,null,payload)
  let loaded=await f.load();assert.equal(loaded.subjects.length,expectedSubjects);assert.equal(loaded.subjects.reduce((n,s)=>n+s.topics.length,0),expectedTopics)
  const before=loaded.subjects.map(s=>({id:s.id,topics:s.topics.map(t=>t.id)}))
  for(const payload of payloads)await f.mutate('template.import',null,null,payload)
  loaded=await f.load();assert.deepEqual(loaded.subjects.map(s=>({id:s.id,topics:s.topics.map(t=>t.id)})),before)
  const find=prefix=>loaded.subjects.find(s=>s.template_key.startsWith(prefix+':'))
  assert.notEqual(find('tyt-core').id,find('ayt-core').id);assert.notEqual(find('ielts-academic').id,find('ielts-general').id)
  assert.notEqual(find('yokdil-science').id,find('yokdil-health').id)
 }finally{await f.db.close()}
})

test('upgraded TYT imports preserve legacy IDs, custom names, private progress, archive flags and custom order',async()=>{
 const f=await fixture()
 try{
  // This is the payload used before the expanded exam catalog existed.
  const original=loadTS('src/features/learning/lib/templates.ts').tytTemplate
  const subset={...original,subjects:[{...original.subjects[0],topics:original.subjects[0].topics.slice(0,2)}]}
  let s=(await f.mutate('template.import',null,null,subset)).subjects[0]
  const [first,second]=s.topics
  s=(await f.mutate('subject.update',s.id,null,{title:'My existing study'},s.version)).subject
  s=(await f.mutate('topic.update',s.id,first.id,{title:'My own topic name'},first._version)).subject
  await f.mutate('progress.update',s.id,first.id,{status:'doing'},0)
  s=(await f.mutate('topic.move',s.id,second.id,{direction:-1},second._version)).subject
  s=(await f.mutate('topic.archive',s.id,second.id,{},s.topics[0]._version)).subject
  const before=await f.load(),current=examCatalog.examTemplate('tyt-core')
  await f.mutate('template.import',null,null,examCatalog.selectedExamTemplate(current,examCatalog.allExamTopicKeys(current)))
  const after=await f.load(),study=after.subjects.find(row=>row.id===s.id)
  assert.equal(study.title,'My existing study');assert.equal(study.topics[0].id,second.id);assert.equal(study.topics[0].archived,true)
  assert.equal(study.topics[1].id,first.id);assert.equal(study.topics[1].title,'My own topic name');assert.deepEqual(after.progress,before.progress)
 }finally{await f.db.close()}
})
