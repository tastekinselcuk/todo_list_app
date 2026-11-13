const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const migration = fs.readFileSync('supabase/migrations/202611140002_background_jobs.sql', 'utf8')

test('finance background processing handles active workspaces once and excludes archived, deleted and foreign schedules', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table workspaces(id integer primary key,user_id integer,archived_at timestamptz);
      create table finance_recurring(workspace_id integer,user_id integer,active boolean,deleted_at timestamptz);
      create table processed(workspace_id integer,user_id integer);
      create function finance_materialize(integer,integer) returns void language sql as
        'insert into processed values ($1,$2)';
      insert into workspaces values (1,10,null),(2,20,now()),(3,30,null),(4,40,null);
      insert into finance_recurring values
        (1,10,true,null),(1,10,true,null),(2,20,true,null),
        (3,30,false,null),(4,40,true,now()),(1,999,true,null);
    `)
    await db.exec(fs.readFileSync('supabase/migrations/202611140003_finance_rollover_fix.sql', 'utf8'))
    await db.exec('select finance_rollover_recurring()')
    assert.deepEqual((await db.query('select * from processed')).rows, [{ workspace_id: 1, user_id: 10 }])
    assert.equal((await db.query("select has_function_privilege('authenticated','finance_rollover_recurring()','execute') as allowed")).rows[0].allowed, false)
  } finally {
    await db.close()
  }
})

test('background job installation updates named schedules without duplicates or changing unrelated jobs', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema cron;
      create table cron.job(name text primary key, schedule text, command text);
      create function cron.schedule(name text, schedule text, command text) returns bigint
        language sql as $$
          insert into cron.job values ($1,$2,$3) on conflict(name) do update
            set schedule=excluded.schedule,command=excluded.command returning 1::bigint;
        $$;
      create function public.finance_rollover_recurring() returns void language sql as 'select null::void';
      create function public.purge_expired_trash(integer) returns integer language sql as 'select 0';
      insert into cron.job values ('vault-retention','0 * * * *','existing');
    `)
    await db.exec(migration)
    await db.exec(migration)
    const jobs = (await db.query('select * from cron.job order by name')).rows
    assert.equal(jobs.length, 3)
    assert.equal(jobs[0].name, 'finance-recurring-rollover')
    assert.equal(jobs[0].command, 'select public.finance_rollover_recurring();')
    assert.equal(jobs[1].command, 'existing')
    assert.equal(jobs[2].command, 'select public.purge_expired_trash(200);')
  } finally {
    await db.close()
  }
})
