const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs')
const { projectDB } = require('./helpers/project-db.cjs')
const migration = fs.readFileSync('supabase/migrations/202610240002_workout_sequence.sql', 'utf8')
async function fixture() {
  const f = await projectDB()
  await f.db.exec('alter table workout_routines add column deleted_at timestamptz;')
  await f.db.exec(migration)
  await f.as(f.owner)
  const routine = (await f.db.query('insert into workout_routines(user_id,workspace_id,title) values($1,$2,$3) returning *', [f.owner, f.wid, 'Workout'])).rows[0]
  for (const id of ['a', 'b', 'c']) await f.rpc("select mutate_collection_item($1,$2,'workout','add',$3::jsonb,null) as result", [routine.collection_id, routine.id, JSON.stringify({ id, name: id, sets: 3, reps: '10', isCompleted: id === 'a', notes: 'Personal note' })])
  const row = async () => (await f.db.query('select * from workout_routines where id=$1', [routine.id])).rows[0]
  f.routine = await row(); f.row = row
  f.reorder = (ids, version, cid = routine.collection_id, pid = routine.id) => f.rpc('select reorder_workout_exercises($1,$2,$3::text[],$4) as result', [cid, pid, ids, version])
  return f
}

test('reordering is durable and atomic and preserves exercise identity, versions, content and completion', async () => {
  const f = await fixture()
  try {
    const before = f.routine, result = await f.reorder(['c', 'a', 'b'], before.version)
    assert.deepEqual(result.exercises.map(e => e.id), ['c', 'a', 'b'])
    assert.deepEqual(result.exercises, [before.exercises[2], before.exercises[0], before.exercises[1]])
    assert.deepEqual((await f.row()).exercises, result.exercises)
    assert.equal((await f.reorder(['c', 'a', 'b'], result.version)).version, result.version)
    await assert.rejects(f.reorder(['a', 'b', 'c'], before.version), /SHARING_CONFLICT/)
    for (const ids of [[], ['c', 'c', 'a'], ['c', 'a', null], ['c', 'a', 'foreign'], [['c', 'a', 'b']]]) {
      await assert.rejects(f.reorder(ids, result.version), /INVALID_EXERCISE_ORDER/)
      assert.deepEqual((await f.row()).exercises, result.exercises)
    }
    await assert.rejects(f.reorder(['a', 'b', 'c'], null), /SHARING_CONFLICT/)
    await f.as(f.owner, 'postgres'); await f.db.exec(migration); await f.as(f.owner)
    assert.deepEqual((await f.row()).exercises, result.exercises)
    await f.as(f.owner, 'postgres'); await f.db.query('update workout_routines set deleted_at=now() where id=$1', [result.id]); await f.as(f.owner)
    await assert.rejects(f.reorder(['a', 'b', 'c'], (await f.row()).version), /SHARING_CONFLICT/)
  } finally { await f.db.close() }
})

test('only authorized workout editors can reorder; viewers, foreign records, revoked users and anonymous calls are rejected', async () => {
  const f = await fixture()
  try {
    const { rpc, as, owner, guest, wid, gwid, routine, db } = f
    await as(guest)
    await assert.rejects(f.reorder(['c', 'b', 'a'], routine.version), /ACCESS_DENIED/)
    await as(owner)
    const invitation = await rpc("select create_collection_invite($1,'workout','viewer') as result", [wid])
    await as(guest); await rpc('select accept_collection_invite($1,$2) as result', [invitation.token, gwid])
    await assert.rejects(f.reorder(['c', 'b', 'a'], routine.version), /ACCESS_DENIED/)
    await assert.rejects(db.query('update workout_routines_items set position=99'), /permission denied/)
    await as(owner); await rpc("select manage_collection($1,'remove_member',$2) as result", [routine.collection_id, guest])
    const editor = await rpc("select create_collection_invite($1,'workout','editor') as result", [wid])
    await as(guest); await rpc('select accept_collection_invite($1,$2) as result', [editor.token, gwid])
    const result = await f.reorder(['c', 'b', 'a'], routine.version)
    assert.deepEqual(result.exercises.map(e => e.id), ['c', 'b', 'a'])
    await assert.rejects(f.reorder(['a', 'b', 'c'], result.version, routine.collection_id, '90000000-0000-0000-0000-000000000099'), /SHARING_CONFLICT/)
    await as(owner); await rpc("select manage_collection($1,'remove_member',$2) as result", [routine.collection_id, guest])
    await as(guest); await assert.rejects(f.reorder(['a', 'b', 'c'], result.version), /ACCESS_DENIED/)
    await as(owner, 'anon'); await assert.rejects(f.reorder(['a', 'b', 'c'], result.version), /permission denied/)
  } finally { await f.db.close() }
})
