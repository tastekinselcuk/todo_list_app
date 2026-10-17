const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const migration = fs.readFileSync('supabase/migrations/workspaces.sql', 'utf8')
const preferencesMigration = fs.readFileSync('supabase/migrations/202610120002_user_preferences.sql','utf8')
const palettesMigration = fs.readFileSync('supabase/migrations/202610120004_theme_palettes.sql','utf8')
const paletteExtensionsMigration = fs.readFileSync('supabase/migrations/202610170002_theme_palette_extensions.sql','utf8')
const deletionMigration = fs.readFileSync('supabase/migrations/202610170003_workspace_deletion.sql','utf8')
const owner = '10000000-0000-0000-0000-000000000001'
const other = '20000000-0000-0000-0000-000000000002'
const category = '30000000-0000-0000-0000-000000000003'
const session = '40000000-0000-0000-0000-000000000004'

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${owner}'), ('${other}');
    create table user_settings(user_id uuid primary key, active_modules text[]);
    insert into user_settings values ('${owner}', array['plans','detailed']);
  `)
  const tables = ['categories','todos','quick_notes','code_snippets','password_sessions','secure_notes',
    'plans','periodic_tasks','activity_items','learning_subjects','flashcard_decks','workout_routines','pomodoro_history']
  for (const table of tables) {
    const field = ['categories','todos','quick_notes','code_snippets','password_sessions','secure_notes','pomodoro_history'].includes(table) ? 'created_by' : 'user_id'
    await db.exec(`create table ${table}(id uuid primary key default gen_random_uuid(), ${field} uuid references auth.users(id), name text, created_at timestamptz default now()); grant all on ${table} to authenticated;`)
  }
  await db.exec(`
    alter table categories add constraint categories_owner_name unique(created_by, name);
    alter table todos add column category_id uuid references categories(id) on delete set null;
    alter table secure_notes add column session_id uuid references password_sessions(id) on delete cascade;
    alter table activity_items add column external_id text;
    create unique index activity_external on activity_items(user_id,external_id) where external_id is not null;
    insert into categories(id,created_by,name) values ('${category}','${owner}','Work');
    insert into todos(created_by,name,category_id) values ('${owner}','Original note','${category}');
    insert into password_sessions(id,created_by,name) values ('${session}','${owner}','Vault');
    insert into secure_notes(created_by,name,session_id) values ('${owner}','Original secret','${session}');
  `)
  for (const table of tables.filter(name => !['categories','todos','password_sessions','secure_notes'].includes(name))) {
    const field = ['quick_notes','code_snippets','pomodoro_history'].includes(table) ? 'created_by' : 'user_id'
    await db.query(`insert into ${table}(${field},name) values ($1,$2)`, [owner, `Original ${table}`])
  }
  return db
}

test('migration preserves every module, scopes constraints and enforces RLS and archiving', async () => {
  const db = await fixture()
  try {
    await db.exec(migration)
    const personal = (await db.query('select * from workspaces where user_id=$1', [owner])).rows[0]
    assert.equal(personal.name, 'Kişisel')
    assert.deepEqual(personal.active_modules, ['plans','detailed'])
    const secret = (await db.query('select * from secure_notes')).rows[0]
    assert.equal(secret.workspace_id, personal.id)
    assert.equal(secret.name, 'Original secret')
    for (const table of ['categories','todos','quick_notes','code_snippets','password_sessions','secure_notes','plans','periodic_tasks','activity_items','learning_subjects','flashcard_decks','workout_routines','pomodoro_history']) {
      const rows = (await db.query(`select * from ${table}`)).rows
      assert.equal(rows.length, 1, `${table} records preserved`)
      assert.equal(rows[0].workspace_id, personal.id)
    }
    await db.exec(migration) // Idempotent; a rerun must not replace workspace preferences or notes.
    assert.equal((await db.query('select count(*)::int as n from workspaces')).rows[0].n, 2)

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select count(*)::int as n from workspaces')).rows[0].n, 1)
    const work = (await db.query('insert into workspaces(user_id,name) values ($1,$2) returning id', [owner,'İş'])).rows[0].id
    await assert.rejects(db.query('insert into workspaces(user_id,name) values ($1,$2)', [other,'Not mine']), /row-level security/i)
    await db.query('insert into categories(created_by,workspace_id,name) values ($1,$2,$3)', [owner,work,'Work'])
    await db.query('insert into activity_items(user_id,workspace_id,external_id) values ($1,$2,$3)', [owner,personal.id,'film-1'])
    await db.query('insert into activity_items(user_id,workspace_id,external_id) values ($1,$2,$3)', [owner,work,'film-1'])
    await assert.rejects(db.query('insert into activity_items(user_id,workspace_id,external_id) values ($1,$2,$3)', [owner,work,'film-1']), /duplicate/i)
    await assert.rejects(db.query('insert into todos(created_by,workspace_id,category_id) values ($1,$2,$3)', [owner,work,category]), /foreign key/i)
    await assert.rejects(db.query('insert into secure_notes(created_by,workspace_id,session_id) values ($1,$2,$3)', [owner,work,session]), /foreign key/i)
    const otherWs = (await db.query('select id from workspaces where user_id=$1', [other])).rows
    assert.equal(otherWs.length, 0)
    await db.exec('reset role')
    const foreignId = (await db.query('select id from workspaces where user_id=$1',[other])).rows[0].id
    await db.exec('set role authenticated')
    await assert.rejects(db.query('insert into quick_notes(created_by,workspace_id,name) values ($1,$2,$3)', [owner,foreignId,'Wrong workspace']), /row-level security|foreign key/i)
    await db.query('update workspaces set archived_at=now() where id=$1',[personal.id])
    assert.equal((await db.query('select * from secure_notes')).rows.length, 0, 'archive hides but does not delete notes')
    await assert.rejects(db.query('update workspaces set archived_at=now() where id=$1',[work]), /LAST_WORKSPACE/)
    await assert.rejects(db.query('delete from workspaces where id=$1',[personal.id]), /permission denied/i)
    await db.query('update workspaces set archived_at=null where id=$1',[personal.id])
    assert.equal((await db.query('select * from secure_notes')).rows.length, 1)
    assert.equal((await db.query('select ensure_default_workspace() as id')).rows[0].id, personal.id)
    await db.query('delete from categories where id=$1',[category])
    const note = (await db.query('select * from todos')).rows[0]
    assert.equal(note.category_id, null)
    assert.equal(note.workspace_id, personal.id)
  } finally { await db.close() }
})

test('ambiguous ownerless legacy records abort the entire migration without changing data', async () => {
  const db = await fixture()
  try {
    await db.exec("insert into quick_notes(created_by,name) values(null,'Legacy note')")
    await assert.rejects(db.exec(migration), /ownerless rows/)
    await db.exec('rollback')
    assert.equal((await db.query("select to_regclass('public.workspaces') as name")).rows[0].name, null)
    assert.equal((await db.query("select name from quick_notes where created_by is null")).rows[0].name, 'Legacy note')
  } finally { await db.close() }
})

test('single-account migration assigns legacy notes to that account and keeps their content', async () => {
  const db = await fixture()
  try {
    await db.query('delete from auth.users where id=$1',[other])
    await db.exec("insert into quick_notes(created_by,name) values(null,'Legacy note')")
    await db.exec(migration)
    const note = (await db.query("select * from quick_notes where name='Legacy note'")).rows[0]
    assert.equal(note.created_by, owner)
    assert.equal(note.name, 'Legacy note')
    assert.ok(note.workspace_id)
  } finally { await db.close() }
})

test('account preferences validate patches, merge different fields, isolate users and survive migration reruns',async()=>{
 const db=await fixture()
 try{
  await db.exec(preferencesMigration)
  await db.exec(palettesMigration)
  await db.exec(paletteExtensionsMigration)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated')
  const save=async(id,patch)=>(await db.query('select save_user_preferences($1,$2::jsonb) as result',[id,JSON.stringify(patch)])).rows[0].result
  await save(owner,{workspaceWide:true,pomodoroPlacement:'navbar',theme:'dark',language:'tr',pomodoroDurations:{focus:40,shortBreak:8,longBreak:20}})
  await save(owner,{theme:'light'})
  const updated=await save(owner,{language:'en'})
  assert.equal(updated.workspaceWide,true);assert.equal(updated.pomodoroPlacement,'navbar');assert.equal(updated.theme,'light')
  assert.equal(updated.pomodoroDurations.focus,40)
  for (const themePalette of ['classic','ocean','forest','sand','lavender','amber','ruby','cobalt','graphite']) {
   const saved = await save(owner,{themePalette})
   assert.equal(saved.themePalette,themePalette);assert.equal(saved.workspaceWide,true);assert.equal(saved.theme,'light')
  }
  await assert.rejects(save(other,{workspaceWide:false}),/SESSION_CHANGED/)
  for(const patch of [{theme:'invalid'},{themePalette:'invalid'},{themePalette:null},{themePalette:{}},{workspaceWide:'true'},{is_admin:true},{pomodoroDurations:null},{pomodoroDurations:{focus:1,shortBreak:5,longBreak:15}},{language:null},[]]){
   await assert.rejects(save(owner,patch),/INVALID_PREFERENCES/)
  }
  await assert.rejects(db.query('insert into user_preferences(user_id) values($1)',[other]),/permission denied/)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other])
  assert.equal((await db.query('select * from user_preferences')).rows.length,0)
  await save(other,{workspaceWide:false,pomodoroPlacement:'card'})
  assert.equal((await db.query('select * from user_preferences')).rows.length,1)
  await db.exec('reset role');await db.exec(preferencesMigration)
  await db.exec(palettesMigration);await db.exec(palettesMigration)
  await db.exec(paletteExtensionsMigration);await db.exec(paletteExtensionsMigration)
  assert.equal((await db.query('select preferences from user_preferences where user_id=$1',[owner])).rows[0].preferences.themePalette,'graphite')
  assert.equal((await db.query('select count(*)::int as n from user_preferences')).rows[0].n,2)
  await db.exec('set role anon')
  await assert.rejects(save(other,{theme:'dark'}),/permission denied/)
  await assert.rejects(db.query('select * from user_preferences'),/permission denied/)
 }finally{await db.close()}
})

test('workspace deletion checks ownership/name/last-workspace, removes personal content and leaves foreign shared notes intact',async()=>{
 const {projectDB}=require('./helpers/project-db.cjs')
 const f=await projectDB(['202610110002_pomonotes','202610110003_focus_repair','202610110001_reminder_delivery'])
 const {db,owner,guest,wid,gwid,as,rpc}=f
 try {
  await db.exec('alter table todos add column description text;alter table code_snippets add column title text;alter table activity_items add column title text,add column subtitle text,add column notes text')
  await db.exec(fs.readFileSync('supabase/migrations/202610120003_workspace_search.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/202610170001_workspace_trash.sql','utf8'))
  await db.exec(deletionMigration);await db.exec(deletionMigration)
  const original=(await db.query('select * from workspaces where id=$1',[wid])).rows[0]
  await as(guest);await assert.rejects(rpc('select delete_workspace($1,$2) as result',[wid,original.name]),/WORKSPACE_ACCESS_DENIED/)
  await as(owner);await assert.rejects(rpc('select delete_workspace($1,$2) as result',[wid,original.name]),/LAST_WORKSPACE/)
  const extra=(await db.query("insert into workspaces(user_id,name) values($1,'Keep') returning *",[owner])).rows[0]
  await rpc('select ensure_module_bindings($1) as result',[extra.id])
  await assert.rejects(rpc('select delete_workspace($1,$2) as result',[wid,'Old name']),/WORKSPACE_CHANGED/)
  await as(owner,'postgres')
  const ownQuick=(await db.query("select personal_collection_id id from workspace_module_bindings where workspace_id=$1 and module='quick'",[wid])).rows[0].id
  const foreignQuick=(await db.query("select collection_id id from workspace_module_bindings where workspace_id=$1 and module='quick'",[gwid])).rows[0].id
  await db.query("update workspace_module_bindings set collection_id=$1 where workspace_id=$2 and module='quick'",[ownQuick,extra.id])
  await as(owner);await assert.rejects(rpc('select delete_workspace($1,$2) as result',[wid,original.name]),/WORKSPACE_SHARED/)
  await as(owner,'postgres')
  await db.query("update workspace_module_bindings set collection_id=personal_collection_id where workspace_id=$1 and module='quick'",[extra.id])
  await db.query("update workspace_module_bindings set collection_id=$1 where workspace_id=$2 and module='quick'",[foreignQuick,wid])
  await db.query("insert into collection_members(collection_id,user_id,role) values($1,$2,'editor')",[foreignQuick,owner])
  const detailed=(await db.query("select collection_id id from workspace_module_bindings where workspace_id=$1 and module='detailed'",[wid])).rows[0].id
  const image=`${detailed}/${wid}/10000000-0000-0000-0000-000000000009.png`
  await db.query("insert into todos(created_by,workspace_id,collection_id,title,description) values($1,$2,$3,'Remove',$4)",[owner,wid,detailed,`<img data-note-image="${image}">`])
  const trashed=(await db.query("insert into todos(created_by,workspace_id,collection_id,title) values($1,$2,$3,'Trashed') returning id",[owner,wid,detailed])).rows[0].id
  await as(owner);await rpc("select trash_change($1,'detailed',$2,'move',1) as result",[wid,trashed]);await as(owner,'postgres')
  const learning=(await db.query("select collection_id id from workspace_module_bindings where workspace_id=$1 and module='learning'",[wid])).rows[0].id
  const subject=(await db.query("insert into learning_subjects(user_id,workspace_id,collection_id,title) values($1,$2,$3,'Subject') returning id",[owner,wid,learning])).rows[0].id
  await db.query("insert into learning_subjects_items(parent_id,collection_id,id,data,position) values($1,$2,'topic','{}',0)",[subject,learning])
  const pomo=(await db.query("select collection_id id from workspace_module_bindings where workspace_id=$1 and module='pomodoro'",[wid])).rows[0].id
  const task=(await db.query("insert into pomo_tasks(created_by,workspace_id,collection_id,title) values($1,$2,$3,'Task') returning id",[owner,wid,pomo])).rows[0].id
  await db.query('insert into pomo_task_member_preferences(task_id,user_id,estimated_sessions,focus_seconds) values($1,$2,2,1500)',[task,owner])
  const focus=(await db.query("insert into analytics_focus_sessions(id,user_id,workspace_id,started_at,planned_seconds,revision,status) values(gen_random_uuid(),$1,$2,now(),1500,1,'running') returning id",[owner,wid])).rows[0].id
  await db.query('insert into focus_ownership(user_id,session_id,client_id) values($1,$2,gen_random_uuid())',[owner,focus])
  await as(owner);await assert.rejects(rpc('select delete_workspace($1,$2) as result',[wid,original.name]),/WORKSPACE_FOCUS_ACTIVE/)
  await as(owner,'postgres');await db.query('delete from focus_ownership where session_id=$1',[focus])
  await db.exec("create function test_delete_failure() returns trigger language plpgsql as 'begin raise exception ''TEST_ROLLBACK'';end';create trigger test_delete_failure before delete on workspaces for each row execute function test_delete_failure()")
  await as(owner);await assert.rejects(rpc('select delete_workspace($1,$2) as result',[wid,original.name]),/TEST_ROLLBACK/)
  await as(owner,'postgres')
  assert.equal((await db.query('select count(*)::int n from todos where workspace_id=$1',[wid])).rows[0].n,2,'a late failure rolls back active and trashed content deletion')
  assert.equal((await db.query('select count(*)::int n from trash_image_cleanup')).rows[0].n,0,'cleanup is transactional')
  await db.exec('drop trigger test_delete_failure on workspaces')
  await as(owner)
  const result=await rpc('select delete_workspace($1,$2) as result',[wid,original.name])
  assert.equal(result.id,wid);assert.equal(result.next_workspace.id,extra.id);assert.equal(result.next_workspace.is_default,true)
  await assert.rejects(rpc('select delete_workspace($1,$2) as result',[extra.id,extra.name]),/LAST_WORKSPACE/)
  await as(owner,'postgres')
  for(const table of ['workspaces','workspace_module_bindings','todos','quick_notes','analytics_focus_sessions']) {
   const column=table==='workspaces'?'id':'workspace_id'
   assert.equal((await db.query(`select count(*)::int n from ${table} where ${column}=$1`,[wid])).rows[0].n,0,table)
  }
  assert.equal((await db.query('select count(*)::int n from module_collections where origin_workspace_id=$1',[wid])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from learning_subjects_items where parent_id=$1',[subject])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from pomo_task_member_preferences where task_id=$1',[task])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from quick_notes where collection_id=$1',[foreignQuick])).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from collection_members where collection_id=$1 and user_id=$2',[foreignQuick,owner])).rows[0].n,0)
  assert.equal((await db.query('select path from trash_image_cleanup')).rows[0].path,image)
  await as(guest);assert.equal((await db.query('select * from quick_notes')).rows.length,1)
  await as('', 'anon');await assert.rejects(rpc('select delete_workspace($1,$2) as result',[extra.id,extra.name]),/permission denied/)
 } finally {await db.close()}
})
