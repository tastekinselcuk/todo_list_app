const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const migration = fs.readFileSync('supabase/migrations/202611140004_vault_storage_constraints.sql', 'utf8')
const security = fs.readFileSync('supabase/migrations/202611110001_vault_security.sql', 'utf8')
const key = Buffer.alloc(16, 1).toString('base64')
const payload = { v: 1, iv: Buffer.alloc(12).toString('base64'), ciphertext: Buffer.alloc(16).toString('base64'), key_id: key }
const metadata = JSON.stringify({ format: 'todo-vault-v2', key_id: key, kdf: { iterations: 600000, salt: key }, password: payload, recovery: { salt: key, wrapped: payload } })
async function fixture() {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table password_sessions(id int primary key,password_hash text);
    create table secure_notes(id int primary key,encrypted_payload jsonb,title text,type text,description text,username text,password_encrypted text,url text,content text);
    create table vault_note_history(id int primary key,encrypted_payload jsonb);
    grant usage on schema public to authenticated;
    grant insert,select,update on password_sessions,secure_notes,vault_note_history to authenticated;`)
  for (const name of ['vault_envelope_valid', 'vault_metadata_valid']) {
    await db.exec(security.match(new RegExp('create or replace function public\\.' + name + '[\\s\\S]*?end; \\$\\$;'))[0])
  }
  await db.exec('revoke all on function vault_envelope_valid(jsonb),vault_metadata_valid(text) from public,authenticated,anon')
  return db
}
test('vault storage constraints reject plaintext, legacy and malformed ciphertext even without application triggers', async () => {
  const db = await fixture()
  try {
    await db.exec(migration)
    await db.exec(migration)
    await db.exec('set role authenticated')
    await db.query('insert into password_sessions values(1,$1)', [metadata])
    for (const value of [null, 'old-hash', JSON.stringify({ format: 'todo-vault-v1' }), '{']) {
      await assert.rejects(db.query('insert into password_sessions values(2,$1)', [value]), /vault_v2_metadata_required/)
    }
    await db.query("insert into secure_notes(id,encrypted_payload,title,type) values(1,$1,'Encrypted note','secret')", [payload])
    await db.query('insert into vault_note_history values(1,$1)', [payload])
    await assert.rejects(db.query("insert into secure_notes(id,title,type) values(2,'Encrypted note','secret')"), /not-null/)
    for (const value of [{}, { ...payload, key_id: 'bad' }, { ...payload, iv: 'bad' }]) {
      await assert.rejects(db.query('update secure_notes set encrypted_payload=$1 where id=1', [value]), /vault_ciphertext_required/)
      await assert.rejects(db.query('update vault_note_history set encrypted_payload=$1 where id=1', [value]), /vault_history_ciphertext_required/)
    }
    for (const column of ['title', 'type', 'description', 'username', 'password_encrypted', 'url', 'content']) {
      await assert.rejects(db.query(`update secure_notes set ${column}='plaintext' where id=1`), /vault_plaintext_forbidden/)
    }
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select vault_v2_storage_valid($1)', [metadata]), /permission denied/)
  } finally { await db.close() }
})
test('vault storage migration aborts atomically if legacy records still need migration', async () => {
  const db = await fixture()
  try {
    await db.exec("insert into password_sessions values(1,'legacy')")
    await assert.rejects(db.exec(migration), /vault_v2_metadata_required/)
    await db.exec('rollback')
    assert.equal((await db.query("select to_regprocedure('public.vault_v2_storage_valid(text)') is null as absent")).rows[0].absent, true)
    assert.equal((await db.query('select password_hash from password_sessions')).rows[0].password_hash, 'legacy')
  } finally { await db.close() }
})
