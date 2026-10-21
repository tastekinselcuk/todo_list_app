const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202610180001_tasks_calendar.sql','utf8')
const uuid=n=>`81000000-0000-0000-0000-${String(n).padStart(12,'0')}`
async function fixture(){
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair','202610110001_reminder_delivery'])
 await f.db.exec('alter table todos add column description text;alter table code_snippets add column title text;alter table activity_items add column title text,add column subtitle text,add column notes text;')
 for(const name of ['202610120003_workspace_search','202610170001_workspace_trash'])await f.db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
 await f.db.exec(migration);await f.as(f.owner)
 f.mutate=(entity,operation,id,payload={},version=null,wid=f.wid)=>f.rpc('select work_mutate($1,$2,$3,$4,$5::jsonb,$6) as result',[wid,entity,operation,id,JSON.stringify(payload),version])
 f.calendar=(start='2026-10-01T00:00:00Z',end='2026-11-01T00:00:00Z',project=null)=>f.rpc('select work_calendar($1,$2,$3,$4) as result',[f.wid,start,end,project])
 return f
}
test('tasks are private, versioned and idempotent; projects and blocks cannot cross workspace boundaries',async()=>{
 const f=await fixture(),{db,owner,guest,wid,gwid,as,rpc,mutate}=f
 try{
  const project=await mutate('project','create',uuid(1),{name:'Launch'})
  const task=await mutate('task','create',uuid(2),{title:'Research',project_id:project.id,due_on:'2026-10-20'})
  assert.equal(task.status,'todo');assert.equal(task.estimate_minutes,30)
  assert.equal((await mutate('task','create',task.id,{title:'Retry must not overwrite'})).title,'Research')
  await mutate('task','update',task.id,{status:'doing',checklist:[{id:'one',title:'Read',done:false}]},1)
  await assert.rejects(mutate('task','update',task.id,{status:'done'},1),/WORK_CONFLICT/)
  for(const payload of [{user_id:guest},{workspace_id:gwid},{title:''},{title:'a'.repeat(181)},{status:'oops'},{estimate_minutes:0},{checklist:[{id:'1',title:'Bad',done:'false'}]},{due_on:'2026-02-30'}])await assert.rejects(mutate('task','update',task.id,payload,2))
  await assert.rejects(db.query('delete from work_tasks where id=$1',[task.id]),/permission denied/)
  await assert.rejects(db.query("update work_tasks set status='done' where id=$1",[task.id]),/permission denied/)
  await as(guest);assert.equal((await db.query('select * from work_tasks')).rows.length,0)
  await assert.rejects(rpc('select work_load($1) as result',[wid]),/WORK_ACCESS_DENIED/)
  await assert.rejects(mutate('task','update',task.id,{title:'Attack'},2),/WORK_ACCESS_DENIED/)
  await assert.rejects(mutate('task','create',uuid(3),{title:'Wrong project',project_id:project.id},null,gwid),/INVALID_WORK_PROJECT/)
  await assert.rejects(mutate('block','create',uuid(4),{task_id:task.id,starts_at:'2026-10-18T09:00Z',ends_at:'2026-10-18T10:00Z'},null,gwid),/INVALID_WORK_TASK/)
  await as(owner,'anon');await assert.rejects(rpc('select work_load($1) as result',[wid]),/permission denied/)
  await as(owner);await mutate('project','update',project.id,{archived:true},1)
  await assert.rejects(mutate('task','create',uuid(5),{title:'Archived',project_id:project.id}),/WORK_PROJECT_ARCHIVED/)
  await mutate('task','update',task.id,{title:'Still editable'},2)
  await as(owner,'postgres');await db.query("update workspaces set active_modules=array_remove(active_modules,'tasks') where id=$1",[wid]);await db.exec(migration)
  assert.equal((await db.query("select 'tasks'=any(active_modules) enabled from workspaces where id=$1",[wid])).rows[0].enabled,false,'rerunning never re-enables disabled modules')
  assert.equal((await db.query('select title from work_tasks where id=$1',[task.id])).rows[0].title,'Still editable')
  await db.query("insert into workspaces(user_id,name) values($1,'Reserve')",[owner]);await db.query('update workspaces set archived_at=now() where id=$1',[wid]);await as(owner)
  await assert.rejects(mutate('task','update',task.id,{title:'Archived workspace'},3),/WORK_ACCESS_DENIED/)
  assert.equal((await rpc('select work_task($1,$2) as result',[wid,task.id])),null)
 }finally{await db.close()}
})

test('calendar uses interval overlap, independent blocks, separate deadlines and project filters',async()=>{
 const f=await fixture(),{db,wid,rpc,mutate}=f
 try{
  const project=await mutate('project','create',uuid(10),{name:'Calendar'})
  const task=await mutate('task','create',uuid(11),{title:'Write',project_id:project.id,due_on:'2026-10-30'})
  const payload={task_id:task.id,starts_at:'2026-09-30T23:30:00Z',ends_at:'2026-10-01T01:00:00Z',timezone:'Europe/Istanbul'}
  let block=await mutate('block','create',uuid(12),payload)
  await mutate('block','create',uuid(13),{title:'Appointment',starts_at:'2026-10-02T12:00Z',ends_at:'2026-10-02T13:00Z'})
  let calendar=await f.calendar();assert.equal(calendar.blocks.length,2);assert.equal(calendar.deadlines[0].due_on,'2026-10-30')
  assert.equal((await f.calendar(undefined,undefined,project.id)).blocks.length,1)
  block=await mutate('block','update',block.id,{starts_at:'2026-10-03T09:00:00Z',ends_at:'2026-10-03T10:00:00Z'},1)
  assert.equal((await rpc('select work_task($1,$2) as result',[wid,task.id])).due_on,'2026-10-30')
  for(const payload of [{starts_at:'2026-10-04T12:00Z',ends_at:'2026-10-04T11:00Z'},{starts_at:'infinity'},{timezone:'Invented/Zone'},{ends_at:'2027-01-01T00:00Z'}])await assert.rejects(mutate('block','update',block.id,payload,2))
  await assert.rejects(f.calendar('2026-01-01','2027-01-01'),/INVALID_WORK_RANGE/)
  await mutate('block','move',block.id,{},2)
  assert.equal((await f.calendar()).blocks.length,1)
  assert.equal((await rpc('select work_task($1,$2) as result',[wid,task.id])).status,'todo','deleting a block never completes a task')
  await mutate('block','restore',block.id,{},3)
  await mutate('task','move',task.id,{},1)
  assert.equal((await f.calendar()).blocks.length,1,'blocks on deleted tasks stay hidden')
  await mutate('task','restore',task.id,{},2)
  assert.equal((await f.calendar()).blocks.length,2,'restoring a task keeps its planned time')
 }finally{await db.close()}
})

test('new records join shared trash, safe global search and expiry without breaking existing notes',async()=>{
 const f=await fixture(),{db,wid,owner,rpc,mutate,as}=f
 try{
  const task=await mutate('task','create',uuid(20),{title:'Searchable task',description:'Planning needle'})
  const block=await mutate('block','create',uuid(21),{title:'Meeting',starts_at:'2026-10-02T12:00Z',ends_at:'2026-10-02T13:00Z'})
  assert.equal((await rpc("select search_workspace($1,'needle') as result",[wid])).groups[0].items[0].record_id,task.id)
  const move=(module,id,version)=>rpc("select trash_change($1,$2,$3,'move',$4) as result",[wid,module,id,version])
  const receipt=await move('tasks',task.id,1);assert.equal(receipt.version,2);assert.equal(receipt.description,undefined)
  await move('calendar',block.id,1)
  const page=await rpc('select trash_page($1) as result',[wid]);assert.equal(page.total,2);assert.equal(page.purgeable,2)
  assert.equal((await rpc("select trash_page($1,'tasks') as result",[wid])).items[0].id,task.id)
  assert.equal((await rpc("select search_workspace($1,'needle') as result",[wid])).groups.length,0)
  await rpc("select trash_change($1,'tasks',$2,'restore',2) as result",[wid,task.id])
  assert.equal((await rpc("select search_workspace($1,'needle') as result",[wid])).groups.length,1)
  await move('tasks',task.id,3)
  const cid=(await db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='quick'",[wid])).rows[0].collection_id
  const quick=(await db.query("insert into quick_notes(created_by,workspace_id,collection_id,content) values($1,$2,$3,'Existing note') returning *",[owner,wid,cid])).rows[0]
  await move('quick',quick.id,1)
  assert.equal((await rpc('select trash_page($1) as result',[wid])).total,3)
  const empty=await rpc("select trash_empty($1,'tasks') as result",[wid]);assert.equal(empty.count,1)
  assert.equal((await rpc('select trash_page($1) as result',[wid])).total,2)
  await as(owner,'postgres');await db.exec("update work_blocks set deleted_at=now()-interval '31 days'")
  await as(null,'service_role');assert.equal(await rpc('select purge_expired_trash() as result'),1)
  await as(owner);assert.equal((await rpc('select trash_page($1) as result',[wid])).total,1)
  await rpc('select trash_empty($1) as result',[wid]);assert.equal((await rpc('select trash_page($1) as result',[wid])).total,0)
 }finally{await db.close()}
})

test('task pagination counts all statuses and workspace deletion cascades projects, tasks and time blocks',async()=>{
 const f=await fixture(),{db,wid,owner,rpc,mutate,as}=f
 try{
  const project=await mutate('project','create',uuid(200),{name:'Large project'})
  for(let i=0;i<103;i++)await mutate('task','create',uuid(300+i),{title:`Task ${i}`,project_id:project.id,status:i%2?'done':'todo'})
  const first=await rpc('select work_load($1,$2) as result',[wid,project.id])
  assert.equal(first.tasks.total,103);assert.equal(first.tasks.counts.done,51);assert.equal(first.tasks.items.length,100);assert.equal(first.tasks.has_more,true)
  const next=await rpc('select work_load($1,$2,$3,$4) as result',[wid,project.id,first.tasks.cursor.created_at,first.tasks.cursor.id])
  assert.equal(next.tasks.items.length,3);assert.equal(next.tasks.has_more,false)
  assert.equal(new Set([...first.tasks.items,...next.tasks.items].map(t=>t.id)).size,103)
  await mutate('block','create',uuid(999),{task_id:uuid(300),starts_at:'2026-10-02T12:00Z',ends_at:'2026-10-02T13:00Z'})
  await as(owner,'postgres');await db.exec(fs.readFileSync('supabase/migrations/202610170003_workspace_deletion.sql','utf8'));await as(owner)
  await db.query("insert into workspaces(user_id,name) values($1,'Reserve')",[owner])
  const name=(await db.query('select name from workspaces where id=$1',[wid])).rows[0].name
  await rpc('select delete_workspace($1,$2) as result',[wid,name])
  for(const table of ['work_tasks','work_projects','work_blocks'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0)
 }finally{await db.close()}
})
