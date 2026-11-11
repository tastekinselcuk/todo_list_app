const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202610180001_tasks_calendar.sql','utf8')
const uuid=n=>`81000000-0000-0000-0000-${String(n).padStart(12,'0')}`
async function fixture(){
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair','202610110001_reminder_delivery'])
 await f.db.exec('alter table todos add column description text;alter table code_snippets add column title text;alter table activity_items add column title text,add column subtitle text,add column notes text;')
 for(const name of ['202610120003_workspace_search','202610170001_workspace_trash'])await f.db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
 await f.db.exec(migration);await f.db.exec(fs.readFileSync('supabase/migrations/202611090001_unified_work_details.sql','utf8'));await f.as(f.owner)
 f.mutate=(entity,operation,id,payload={},version=null,wid=f.wid)=>f.rpc('select work_mutate($1,$2,$3,$4,$5::jsonb,$6) as result',[wid,entity,operation,id,JSON.stringify(payload),version])
 f.calendar=(start='2026-10-01T00:00:00Z',end='2026-11-01T00:00:00Z',project=null)=>f.rpc('select work_calendar($1,$2,$3,$4) as result',[f.wid,start,end,project])
 return f
}

const save=(f,tid,payload,version,times=[],removed=[])=>f.rpc('select work_save_details($1,$2,$3::jsonb,$4,$5::jsonb,$6::jsonb) as result',[f.wid,tid,payload===null?null:JSON.stringify(payload),version,JSON.stringify(times),JSON.stringify(removed)])
const time=(id,steps=[])=>({id,title:'',starts_at:'2026-11-09T09:00:00Z',ends_at:'2026-11-09T09:30:00Z',timezone:'Europe/Istanbul',subtask_ids:steps})
test('unified details save all sessions atomically, enrich cards outside the current month and resolve renamed subtasks',async()=>{
 const f=await fixture();try{
  const id=uuid(1),a=time(uuid(2),['one']),b={...time(uuid(3)),starts_at:'2026-12-10T12:00:00Z',ends_at:'2026-12-10T13:00:00Z'}
  let saved=await save(f,id,{title:'Report',checklist:[{id:'one',title:'Research',done:false}]},null,[a,b])
  assert.equal(saved.blocks.length,2);assert.equal(saved.task.scheduled_blocks.length,2);assert.equal(saved.blocks[0].subtask_titles[0],'Research')
  const load=await f.rpc('select work_load($1) as result',[f.wid]);assert.equal(load.tasks.items[0].scheduled_blocks.length,2)
  const calendar=await f.calendar('2026-11-01','2026-11-30');assert.equal(calendar.blocks.length,1);assert.equal(calendar.blocks[0].subtask_titles[0],'Research')
  saved=await save(f,id,{title:'Report updated',checklist:[{id:'one',title:'Revised research',done:false}]},1,[])
  assert.equal(saved.blocks[0].subtask_titles[0],'Revised research');assert.equal(saved.blocks[0].task_title,'Report updated')
  await assert.rejects(save(f,id,{title:'Must roll back'},2,[{...a,version:0}]),/WORK_CONFLICT/)
  assert.equal((await f.rpc('select work_task($1,$2) as result',[f.wid,id])).title,'Report updated')
  await assert.rejects(save(f,id,{title:'Invalid step'},2,[time(uuid(4),['foreign-step'])]),/INVALID_WORK_SUBTASK/)
  assert.equal((await f.rpc('select work_task($1,$2) as result',[f.wid,id])).version,2)
  saved=await save(f,id,{title:'Report updated'},2,[],[{id:a.id,version:1}]);assert.equal(saved.blocks.length,1)
  assert.equal((await f.rpc('select work_task($1,$2) as result',[f.wid,id])).status,'todo')
  await f.as(f.owner,'postgres');await f.db.exec(fs.readFileSync('supabase/migrations/202611090001_unified_work_details.sql','utf8'));await f.as(f.owner)
  assert.equal((await f.rpc('select work_task($1,$2) as result',[f.wid,id])).scheduled_blocks.length,1)
 }finally{await f.db.close()}
})
test('project deletion preserves tasks and sessions, unassigned filtering works, and foreign or stale writes are refused',async()=>{
 const f=await fixture();try{
  const project=await f.mutate('project','create',uuid(10),{name:'Launch'})
  const task=await f.mutate('task','create',uuid(11),{title:'Task',project_id:project.id})
  await save(f,task.id,{title:'Task'},1,[time(uuid(12))])
  await assert.rejects(f.rpc('select work_project_delete($1,$2,$3) as result',[f.wid,project.id,0]),/WORK_CONFLICT/)
  await f.as(f.guest);await assert.rejects(save(f,task.id,{title:'Attack'},2,[time(uuid(13))]),/WORK_ACCESS_DENIED/)
  await assert.rejects(f.rpc('select work_project_delete($1,$2,$3) as result',[f.wid,project.id,1]),/WORK_ACCESS_DENIED/)
  await f.as(f.owner);await f.rpc('select work_project_delete($1,$2,$3) as result',[f.wid,project.id,1])
  const current=await f.rpc('select work_task($1,$2) as result',[f.wid,task.id]);assert.equal(current.project_id,null);assert.equal(current.scheduled_blocks.length,1);assert.equal(current.version,3)
  const page=await f.rpc('select work_load($1,$2) as result',[f.wid,'00000000-0000-0000-0000-000000000000']);assert.equal(page.tasks.total,1)
  assert.equal((await f.calendar('2026-11-01','2026-11-30','00000000-0000-0000-0000-000000000000')).blocks.length,1)
  await assert.rejects(save(f,uuid(14),{title:'Other task'},null,[{...time(uuid(12)),version:1}]),/WORK_ACCESS_DENIED/)
  assert.equal(await f.rpc('select work_task($1,$2) as result',[f.wid,uuid(14)]),null)
  const independent=await save(f,null,null,null,[{...time(uuid(15)),title:'Appointment'}]);assert.equal(independent.task,null);assert.equal(independent.blocks[0].task_id,null)
  await assert.rejects(save(f,null,null,null,[{...time(uuid(16),['one']),title:'Invalid'}]),/INVALID_WORK_SUBTASK/)
 }finally{await f.db.close()}
})
