const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202611060001_timeless_plans_focus.sql','utf8')
async function fixture(){
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair','202610110001_reminder_delivery'])
 await f.db.exec('alter table todos add column description text;alter table code_snippets add column title text;alter table activity_items add column title text,add column subtitle text,add column notes text;')
 for(const name of ['202610120003_workspace_search','202610170001_workspace_trash'])await f.db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
 return f
}
test('personal quick notes and trash migrate to permanent plans once without resetting completion or deletion',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const q=(await f.db.query('select * from quick_notes where created_by=$1',[f.owner])).rows[0]
  await f.rpc("select trash_change($1,'quick',$2,'move',$3) result",[f.wid,q.id,q.version])
  await f.as(f.owner,'postgres');await f.db.exec(migration)
  const p=(await f.db.query('select * from plans where id=$1',[q.id])).rows[0];assert.equal(p.period,'timeless');assert.ok(p.deleted_at);assert.equal(p.history.length,0)
  assert.equal((await f.db.query('select * from quick_notes where id=$1',[q.id])).rows.length,0)
  await f.db.exec(migration);await f.as(f.owner)
  const trash=await f.rpc("select trash_page($1,'plans') result",[f.wid]);assert.equal(trash.items.filter(item=>item.id===q.id).length,1)
  await f.rpc("select trash_change($1,'plans',$2,'restore',$3) result",[f.wid,q.id,p.version])
  const plans=await f.rpc('select plan_entries_load($1) result',[f.wid]);assert.ok(plans.some(item=>item.id===q.id&&item.period==='timeless'));assert.equal(plans.some(item=>'reason' in item),false)
  const report=await f.rpc("select analytics_report($1,current_date,current_date,'UTC') result",[f.wid]);assert.ok(report.items.some(item=>item.record_id===q.id&&item.module==='plans'),'migrated notes retain their analytics identity')
 }finally{await f.db.close()}
})

test('shared quick sources keep their ACL, Plans search destination and trash restore route',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const q=(await f.db.query('select * from quick_notes where created_by=$1',[f.owner])).rows[0]
  const invite=await f.rpc("select create_collection_invite($1,'quick','viewer') result",[f.wid])
  await f.as(f.guest);await f.rpc('select accept_collection_invite($1,$2) result',[invite.token,f.gwid])
  await f.as(f.owner,'postgres');await f.db.exec(migration)
  assert.equal((await f.db.query('select * from quick_notes where id=$1',[q.id])).rows.length,1)
  await f.as(f.guest)
  const rows=await f.rpc('select plan_entries_load($1) result',[f.gwid]);const row=rows.find(p=>p.id===q.id)
  assert.equal(row.source,'quick');assert.equal(row.period,'timeless');assert.equal(row.can_write,false)
  const search=await f.rpc("select search_workspace($1,'fixture',30,0,'plans') result",[f.gwid])
  const hit=search.groups.flatMap(g=>g.items).find(p=>p.record_id===q.id)
  assert.equal(hit.module,'plans');assert.equal(hit.meta.period,'timeless')
  await assert.rejects(f.rpc("select trash_change($1,'quick',$2,'move',$3) result",[f.gwid,q.id,row.version]),/READ_ONLY|ACCESS|EDITOR/)
  await assert.rejects(f.rpc('select plan_entries_load($1) result',[f.wid]),/PLAN_ACCESS_DENIED/)
  await f.as(f.owner);const receipt=await f.rpc("select trash_change($1,'quick',$2,'move',$3) result",[f.wid,q.id,row.version])
  const trash=await f.rpc("select trash_page($1,'plans') result",[f.wid]);assert.ok(trash.items.some(i=>i.id===q.id&&i.module==='quick'))
  await f.rpc("select trash_change($1,'quick',$2,'restore',$3) result",[f.wid,q.id,receipt.version])
  assert.ok((await f.rpc('select plan_entries_load($1) result',[f.wid])).some(p=>p.id===q.id))
  await f.as(f.owner,'postgres');await f.db.query("update analytics_events set actor_id=null where record_id=$1 and kind='baseline'",[q.id])
  assert.equal((await f.db.query("select count(*)::integer n from analytics_events where record_id=$1 and kind='baseline'",[q.id])).rows[0].n,2,'actor deletion must not conflict with restored baseline snapshots')
  await f.as(f.owner);const later=await f.rpc("select create_collection_invite($1,'quick','viewer') result",[f.wid])
  await f.as(f.guest);await f.db.query("update workspaces set active_modules=array['detailed','pomodoro'] where id=$1",[f.gwid]);await f.rpc('select accept_collection_invite($1,$2) result',[later.token,f.gwid])
  assert.ok((await f.rpc('select plan_entries_load($1) result',[f.gwid])).some(p=>p.id===q.id),'accepting a legacy Quick Notes invite opens its notes through Plans')
 }finally{await f.db.close()}
})

test('plan focus is idempotent and personal; title, goals, credited sessions and navigation stay attached',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const oldInvite=await f.rpc("select create_collection_invite($1,'pomodoro','viewer') result",[f.wid])
  await f.as(f.guest);await f.rpc('select accept_collection_invite($1,$2) result',[oldInvite.token,f.gwid])
  await f.as(f.owner,'postgres');await f.db.exec(migration);await f.as(f.owner)
  const plan=(await f.rpc('select plan_entries_load($1) result',[f.wid]))[0]
  const task=await f.rpc("select plan_focus_prepare($1,'plans',$2,60,2) result",[f.wid,plan.id])
  assert.equal(task.title,plan.title);assert.equal(task.focus_seconds,60);assert.equal(task.estimated_sessions,2)
  const repeated=await f.rpc("select plan_focus_prepare($1,'plans',$2) result",[f.wid,plan.id]);assert.equal(repeated.id,task.id)
  const changed=await f.rpc("select plan_focus_prepare($1,'plans',$2,120,3) result",[f.wid,plan.id]);assert.equal(changed.id,task.id);assert.equal(changed.estimated_sessions,3)
  await f.db.query('update plans set title=$1,version=version where id=$2',['Updated title',plan.id])
  assert.equal((await f.rpc("select plan_focus_prepare($1,'plans',$2) result",[f.wid,plan.id])).title,'Updated title')
  assert.equal((await f.rpc('select plan_focus_target($1,$2) result',[f.wid,task.id])).id,plan.id)
  const start=new Date(Date.now()-120000).toISOString(),end=new Date(Date.now()-60000).toISOString(),client='30000000-0000-0000-0000-000000000003'
  const proposal={id:'40000000-0000-0000-0000-000000000004',workspace_id:f.wid,started_at:start,planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id,estimated_sessions:3,goal_seconds:60}
  const claim=await f.rpc('select claim_focus_session($1,$2,false) result',[client,JSON.stringify(proposal)])
  const payload={...proposal,client_id:client,lease:claim.active.lease,revision:2,status:'completed',segments:[[start,end]]}
  await f.rpc('select record_focus_session($1) result',[JSON.stringify(payload)]);await f.rpc('select record_focus_session($1) result',[JSON.stringify(payload)])
  const loaded=(await f.rpc('select plan_entries_load($1) result',[f.wid])).find(p=>p.id===plan.id)
  assert.equal(loaded.focus.sessions,1);assert.equal(loaded.completed,false,'session credit must not complete a plan')
  const report=await f.rpc("select analytics_report($1,current_date,current_date,'UTC') result",[f.wid]);assert.equal(report.items.some(item=>item.module==='pomodoro'),false);assert.equal(report.daily[0].created,0,'focus backing records must not inflate created-plan counts');assert.equal(report.completed_sessions,1)
  const search=await f.rpc("select search_workspace($1,'Updated title') result",[f.wid]);assert.equal(search.groups.some(g=>g.module==='pomodoro'),false)
  await f.as(f.guest);await assert.rejects(f.rpc("select plan_focus_prepare($1,'plans',$2) result",[f.wid,plan.id]),/PLAN_ACCESS_DENIED/)
  assert.equal((await f.db.query('select id from pomo_tasks where id=$1',[task.id])).rows.length,0,'former PomoNotes members cannot read personal plan focus records')
  assert.equal(await f.rpc('select plan_focus_target($1,$2) result',[f.wid,task.id]),null)
  await f.as(f.owner);await assert.rejects(f.rpc("select create_collection_invite($1,'pomodoro','viewer') result",[f.wid]),/MODULE_NOT_SHAREABLE/)
  await f.db.query('update plans set completed=true,version=version where id=$1',[plan.id])
  await assert.rejects(f.rpc("select plan_focus_prepare($1,'plans',$2) result",[f.wid,plan.id]),/PLAN_COMPLETED/)
  await assert.rejects(f.rpc('select claim_focus_session($1,$2,false) result',[client,JSON.stringify({...proposal,id:'50000000-0000-0000-0000-000000000005'})]),/FOCUS_TARGET_UNAVAILABLE/)
 }finally{await f.db.close()}
})

test('Timeless ignores rollover and legacy deferral writes; shared viewer focus is private and revocation blocks new sessions',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const invite=await f.rpc("select create_collection_invite($1,'quick','viewer') result",[f.wid])
  await f.as(f.guest);await f.rpc('select accept_collection_invite($1,$2) result',[invite.token,f.gwid])
  await f.as(f.owner,'postgres');await f.db.exec(migration);await f.as(f.guest)
  const plan=(await f.rpc('select plan_entries_load($1) result',[f.gwid])).find(p=>p.source==='quick')
  const task=await f.rpc("select plan_focus_prepare($1,'quick',$2,60,1) result",[f.gwid,plan.id])
  await f.as(f.owner);const own=(await f.rpc('select plan_entries_load($1) result',[f.wid])).find(p=>p.id===plan.id);assert.equal(own.focus,null)
  const personal=(await f.db.query("select collection_id from workspace_module_bindings where workspace_id=$1 and module='plans'",[f.wid])).rows[0].collection_id
  const inserted=(await f.db.query("insert into plans(user_id,workspace_id,collection_id,title,period,period_date,reason,history) values($1,$2,$3,'Permanent','timeless','2000-01-01','old reason','[{\"date\":\"2000-01-01\",\"completed\":false}]') returning *",[f.owner,f.wid,personal])).rows[0]
  assert.equal(inserted.period_date.toISOString().slice(0,10),'1970-01-01');assert.equal(inserted.reason,'');assert.deepEqual(inserted.history,[])
  await f.rpc('select rollover_collection_plans($1) result',[personal]);const timeless=(await f.rpc('select plan_entries_load($1) result',[f.wid])).find(p=>p.id===inserted.id);assert.equal(timeless.period_date,'1970-01-01');assert.deepEqual(timeless.history,[])
  await f.as(f.owner,'postgres');await f.db.query('delete from collection_members where user_id=$1 and collection_id=$2',[f.guest,own.collection_id|| (await f.db.query('select collection_id from quick_notes where id=$1',[plan.id])).rows[0].collection_id])
  await f.as(f.guest);await assert.rejects(f.rpc("select plan_focus_prepare($1,'quick',$2) result",[f.gwid,plan.id]),/PLAN_ACCESS_DENIED/)
  const proposal={id:'60000000-0000-0000-0000-000000000006',workspace_id:f.gwid,started_at:new Date().toISOString(),planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id,estimated_sessions:1,goal_seconds:60}
  await assert.rejects(f.rpc('select claim_focus_session($1,$2,false) result',['30000000-0000-0000-0000-000000000003',JSON.stringify(proposal)]),/FOCUS_TARGET_UNAVAILABLE/)
  await f.rpc('select record_focus_session($1) result',[JSON.stringify({...proposal,status:'paused'})])
  await f.as(f.owner,'postgres');assert.equal((await f.db.query('select task_id from analytics_focus_sessions where id=$1',[proposal.id])).rows[0].task_id,null,'late offline time cannot restore a revoked source link')
 }finally{await f.db.close()}
})


test('removing a personal plan focus link requires a stopped session and preserves notes, recorded time and other users links',async()=>{
 const f=await fixture();try{
  await f.as(f.owner,'postgres');await f.db.exec(migration);await f.db.exec(fs.readFileSync('supabase/migrations/202611080001_plan_focus_settings.sql','utf8'))
  await f.as(f.owner);const plan=(await f.rpc('select plan_entries_load($1) result',[f.wid]))[0]
  const task=await f.rpc("select plan_focus_prepare($1,'plans',$2,60,2) result",[f.wid,plan.id])
  const client='30000000-0000-0000-0000-000000000003',sid='40000000-0000-0000-0000-000000000088',start=new Date(Date.now()-30000).toISOString(),end=new Date(Date.now()-10000).toISOString()
  const proposal={id:sid,workspace_id:f.wid,started_at:start,planned_seconds:60,revision:1,status:'running',segments:[],association:'task',task_id:task.id,estimated_sessions:2,goal_seconds:60}
  const claim=await f.rpc('select claim_focus_session($1,$2,false) result',[client,JSON.stringify(proposal)])
  await assert.rejects(f.rpc("select plan_focus_remove($1,'plans',$2) result",[f.wid,plan.id]),/FOCUS_SESSION_ACTIVE/)
  await f.rpc('select record_focus_session($1) result',[JSON.stringify({...proposal,client_id:client,lease:claim.active.lease,revision:2,status:'ended',segments:[[start,end]]})])
  await f.rpc('select end_focus_session($1) result',[sid])
  await f.as(f.guest);await assert.rejects(f.rpc("select plan_focus_remove($1,'plans',$2) result",[f.wid,plan.id]),/PLAN_ACCESS_DENIED/)
  await f.as(f.owner);await f.rpc("select plan_focus_remove($1,'plans',$2) result",[f.wid,plan.id]);await f.rpc("select plan_focus_remove($1,'plans',$2) result",[f.wid,plan.id])
  const row=(await f.rpc('select plan_entries_load($1) result',[f.wid])).find(p=>p.id===plan.id)
  assert.equal(row.focus,null);assert.equal(row.title,plan.title);assert.equal(row.completed,false)
  assert.equal(await f.rpc('select plan_focus_target($1,$2) result',[f.wid,task.id]),null)
  await f.as(f.owner,'postgres')
  const recorded=(await f.db.query('select * from analytics_focus_sessions where id=$1',[sid])).rows[0]
  assert.equal(recorded.task_id,task.id);assert.equal(recorded.status,'ended');assert.ok(recorded.credited_segments.reduce((seconds,[start,end])=>seconds+(Date.parse(end)-Date.parse(start))/1000,0)>=19)
  await f.as(f.owner)
  const readded=await f.rpc("select plan_focus_prepare($1,'plans',$2,120,3) result",[f.wid,plan.id]);assert.notEqual(readded.id,task.id)
  await f.as(f.owner,'anon');await assert.rejects(f.rpc("select plan_focus_remove($1,'plans',$2) result",[f.wid,plan.id]),/permission denied/)
 }finally{await f.db.close()}
})


test('a shared viewer removes only their own plan focus connection and revoked source access blocks removal',async()=>{
 const f=await fixture();try{
  await f.as(f.owner);const quick=(await f.db.query('select id from quick_notes where created_by=$1',[f.owner])).rows[0]
  const invite=await f.rpc("select create_collection_invite($1,'quick','viewer') result",[f.wid])
  await f.as(f.guest);await f.rpc('select accept_collection_invite($1,$2) result',[invite.token,f.gwid])
  await f.as(f.owner,'postgres');await f.db.exec(migration);await f.db.exec(fs.readFileSync('supabase/migrations/202611080001_plan_focus_settings.sql','utf8'))
  await f.as(f.owner);const own=await f.rpc("select plan_focus_prepare($1,'quick',$2,60,1) result",[f.wid,quick.id])
  await f.as(f.guest);await f.rpc("select plan_focus_prepare($1,'quick',$2,120,3) result",[f.gwid,quick.id]);await f.rpc("select plan_focus_remove($1,'quick',$2) result",[f.gwid,quick.id])
  assert.equal((await f.rpc('select plan_entries_load($1) result',[f.gwid])).find(p=>p.id===quick.id).focus,null)
  await f.as(f.owner);assert.equal((await f.rpc('select plan_entries_load($1) result',[f.wid])).find(p=>p.id===quick.id).focus.id,own.id)
  await f.as(f.guest);await f.rpc("select plan_focus_prepare($1,'quick',$2,60,1) result",[f.gwid,quick.id])
  await f.as(f.owner,'postgres');await f.db.query('delete from collection_members where user_id=$1',[f.guest])
  await f.as(f.guest);await assert.rejects(f.rpc("select plan_focus_remove($1,'quick',$2) result",[f.gwid,quick.id]),/PLAN_ACCESS_DENIED/)
 }finally{await f.db.close()}
})
