const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const migration = fs.readFileSync('supabase/migrations/workspaces.sql', 'utf8')
const preferencesMigration = fs.readFileSync('supabase/migrations/202610120002_user_preferences.sql','utf8')
const palettesMigration = fs.readFileSync('supabase/migrations/202610120004_theme_palettes.sql','utf8')
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
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated')
  const save=async(id,patch)=>(await db.query('select save_user_preferences($1,$2::jsonb) as result',[id,JSON.stringify(patch)])).rows[0].result
  await save(owner,{workspaceWide:true,pomodoroPlacement:'navbar',theme:'dark',language:'tr',pomodoroDurations:{focus:40,shortBreak:8,longBreak:20}})
  await save(owner,{theme:'light'})
  const updated=await save(owner,{language:'en'})
  assert.equal(updated.workspaceWide,true);assert.equal(updated.pomodoroPlacement,'navbar');assert.equal(updated.theme,'light')
  assert.equal(updated.pomodoroDurations.focus,40)
  for (const themePalette of ['classic','ocean','forest','sand','lavender','amber']) {
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
  assert.equal((await db.query('select preferences from user_preferences where user_id=$1',[owner])).rows[0].preferences.themePalette,'amber')
  assert.equal((await db.query('select count(*)::int as n from user_preferences')).rows[0].n,2)
  await db.exec('set role anon')
  await assert.rejects(save(other,{theme:'dark'}),/permission denied/)
  await assert.rejects(db.query('select * from user_preferences'),/permission denied/)
 }finally{await db.close()}
})
