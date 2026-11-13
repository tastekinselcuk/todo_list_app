const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')

test('release checks reject missing RPCs, lost columns, disabled RLS and reopened retired tables', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      grant usage on schema public to anon, authenticated;
      create table secure_notes(encrypted_payload jsonb, version integer);
      create table password_sessions(password_hash text, version integer);
      create table workout_library_exercises(removed_at timestamptz);
      create table plans(period text, version integer);
      create table work_blocks(task_id uuid);
      create table rutin_members(id uuid, access_token text);
      alter table secure_notes enable row level security;
      alter table password_sessions enable row level security;
      alter table workout_library_exercises enable row level security;
      alter table plans enable row level security;
      alter table work_blocks enable row level security;
      alter table rutin_members enable row level security;
      create function workout_library_remove() returns boolean language sql as 'select true';
      revoke all on function workout_library_remove() from public;
      grant execute on function workout_library_remove() to authenticated;
    `)
    const migration = fs.readFileSync('supabase/migrations/202611140001_release_readiness.sql', 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const ready = async names => (await db.query('select application_release_ready($1) as ready', [names])).rows[0].ready
    assert.equal(await ready(['workout_library_remove']), true)
    assert.equal(await ready(['missing_rpc']), false)
    assert.equal(await ready([]), false)
    assert.equal(await ready(['private.function']), false)
    assert.equal(await ready(Array(129).fill('workout_library_remove')), false)
    await db.exec('revoke execute on function workout_library_remove() from authenticated')
    assert.equal(await ready(['workout_library_remove']), false)
    await db.exec('grant execute on function workout_library_remove() to authenticated; alter table workout_library_exercises drop column removed_at')
    assert.equal(await ready(['workout_library_remove']), false)
    await db.exec('alter table workout_library_exercises add column removed_at timestamptz; alter table plans disable row level security')
    assert.equal(await ready(['workout_library_remove']), false)
    await db.exec('alter table plans enable row level security; grant select(access_token) on rutin_members to anon')
    assert.equal(await ready(['workout_library_remove']), false)
    await db.exec('revoke select(access_token) on rutin_members from anon; set role anon')
    assert.equal(await ready(['workout_library_remove']), true)
    await assert.rejects(db.query('select * from secure_notes'), /permission denied/)
  } finally {
    await db.close()
  }
})

test('build requirements include current literal RPC calls and dynamically selected finance APIs', async () => {
  const { collectRpcNames } = await import('../scripts/check-database.mjs')
  const required = collectRpcNames('src')
  assert.ok(required.includes('workout_library_remove'))
  assert.ok(required.includes('work_save_details'))
  assert.ok(required.includes('finance_category_mutate'))
  assert.equal(required.length, new Set(required).size)
  assert.ok(required.length <= 128)
})
