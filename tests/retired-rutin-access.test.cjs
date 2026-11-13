const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')

const migration = fs.readFileSync('supabase/migrations/202611130001_retire_unused_rutin_access.sql', 'utf8')
const tables = ['rutin_workspaces', 'rutin_members', 'rutin_routines',
  'rutin_routine_assignees', 'rutin_recurrences', 'rutin_occurrences']

test('retiring unused tables rejects API reads and writes while preserving data and server access', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.plans(id integer primary key);
      grant select on public.plans to authenticated;
    `)
    for (const table of tables) {
      await db.exec(`
        create table public.${table}(id integer primary key, secret text);
        insert into public.${table} values (1, 'preserved');
        alter table public.${table} enable row level security;
        create policy open_access on public.${table}
          for all to anon, authenticated using (true) with check (true);
        grant all on public.${table} to anon, authenticated, service_role;
        grant select(secret), update(secret) on public.${table} to public;
      `)
    }
    await db.exec(migration)
    await db.exec(migration)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      for (const table of tables) {
        for (const query of [
          `select secret from public.${table}`,
          `insert into public.${table} values (2, 'blocked')`,
          `update public.${table} set secret = 'blocked' where id = 1`,
          `delete from public.${table} where id = 1`,
          `truncate public.${table}`,
        ]) {
          await assert.rejects(db.exec(query), /permission denied/)
        }
      }
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    for (const table of tables) {
      assert.equal((await db.query(`select secret from public.${table}`)).rows[0].secret, 'preserved')
    }
    await db.exec('reset role')
    assert.equal((await db.query("select has_table_privilege('authenticated', 'public.plans', 'select') as allowed")).rows[0].allowed, true)
    assert.equal((await db.query("select count(*)::int as n from pg_policy where polrelid in (select oid from pg_class where relname like 'rutin_%')")).rows[0].n, 0)
  } finally {
    await db.close()
  }
})

test('a clean installation without the retired application tables can apply the migration', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated;')
    await db.exec(migration)
    assert.equal((await db.query("select count(*)::int as n from pg_class where relname like 'rutin_%'")).rows[0].n, 0)
  } finally {
    await db.close()
  }
})
