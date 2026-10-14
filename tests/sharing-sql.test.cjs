const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const owner = '10000000-0000-0000-0000-000000000001'
const editor = '20000000-0000-0000-0000-000000000002'
const outsider = '30000000-0000-0000-0000-000000000003'
const migration = fs.readFileSync('supabase/migrations/tab_sharing.sql', 'utf8')
async function fixture(extended = false, permissions = false) {
  const db = new PGlite()
  try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key,email text);
    insert into auth.users values('${owner}','owner@example.test'),('${editor}','editor@example.test'),('${outsider}','outsider@example.test');
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema public,auth to authenticated,anon;
    create table quick_notes(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),content text,completed boolean default false,created_at timestamptz default now());
    create table code_snippets(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),code text,created_at timestamptz default now());
    create table categories(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),name text,created_at timestamptz default now(),unique(created_by,name));
    create table todos(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),category_id uuid references categories(id) on delete set null,title text,created_at timestamptz default now());
    create table activity_items(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),external_id text,created_at timestamptz default now());
    create unique index activity_external on activity_items(user_id,external_id);
    grant all on quick_notes,code_snippets,categories,todos,activity_items to authenticated;
    insert into quick_notes(created_by,content) values('${owner}','Owner original'),('${editor}','Editor original');
  `)
  if (extended) await db.exec(`
    create table plans(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,period text,period_date date,completed boolean default false,reason text default '',history jsonb default '[]',created_at timestamptz default now());
    create table learning_subjects(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,topics jsonb default '[]',created_at timestamptz default now());
    create table flashcard_decks(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,cards jsonb default '[]',created_at timestamptz default now());
    create table workout_routines(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,exercises jsonb default '[]',created_at timestamptz default now());
    create table periodic_tasks(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,notes text,category text default 'other',frequency text default 'daily',days_of_week int[],day_of_month int,month_of_year int,interval_days int,anchor_date date,completed_date date,reminder_time time,notify_browser boolean default true,notify_email boolean default false,last_notified_at timestamptz,created_at timestamptz default now());
    grant all on plans,learning_subjects,flashcard_decks,workout_routines,periodic_tasks to authenticated;
    insert into learning_subjects(user_id,title,topics) values('${owner}','Original topic','[{"id":"old-topic","title":"Original","learn":false}]');
    insert into plans(user_id,title,period,period_date,reason) values('${owner}','Old plan','daily',current_date-2,'Waiting');
  `)
  if (extended === 'vault') await db.exec(`
    create table password_sessions(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),name text,password_hash text,created_at timestamptz default now());
    create table secure_notes(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),session_id uuid references password_sessions(id) on delete cascade,
      title text not null,type text,description text,username text,password_encrypted text,url text,content text,created_at timestamptz default now(),updated_at timestamptz default now());
    grant all on password_sessions,secure_notes to authenticated;
    insert into password_sessions(created_by,name,password_hash) values('${owner}','Legacy vault','old-plaintext-password');
    insert into secure_notes(created_by,session_id,title,type,username,password_encrypted,content)
      select '${owner}',id,'Secret title','password','Secret user','Secret password','Secret content' from password_sessions;
  `)
  if (extended === 'reminders') await db.exec(`
    insert into periodic_tasks(user_id,title,notify_browser,notify_email,reminder_time,last_notified_at)
      values('${owner}','Existing routine',true,true,'09:45','2026-10-09T06:45:00Z');
  `)
  await db.exec(fs.readFileSync('supabase/migrations/workspaces.sql','utf8'))
  await db.exec(migration)
  if (extended) await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_modules.sql','utf8'))
  if (extended === 'vault') await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_vault.sql','utf8'))
  if (permissions) await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_permissions.sql','utf8'))
  const workspaces = (await db.query('select * from workspaces')).rows
  const ow = workspaces.find(w => w.user_id === owner).id
  const ew = workspaces.find(w => w.user_id === editor).id
  const xw = workspaces.find(w => w.user_id === outsider).id
  async function as(id) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
    await db.exec('set role authenticated')
  }
  const rpc = async (sql, args = []) => (await db.query(sql,args)).rows[0]?.result
  return { db, ow, ew, xw, as, rpc }
  } catch (err) { await db.close(); throw err }
}

test('modules migration backfills existing reminders without pending-trigger DDL errors and preserves preferences on rerun', async () => {
  const {db,as}=await fixture('reminders')
  try {
    const task=(await db.query('select * from periodic_tasks')).rows[0]
    let prefs=(await db.query('select * from periodic_member_preferences')).rows[0]
    assert.equal(prefs.task_id,task.id)
    assert.equal(prefs.user_id,owner)
    assert.equal(prefs.notify_browser,true)
    assert.equal(prefs.notify_email,true)
    assert.match(prefs.reminder_time,/09:45/)
    assert.equal(new Date(prefs.last_notified_at).toISOString(),'2026-10-09T06:45:00.000Z')
    await as(owner)
    await db.query("update periodic_tasks set member_notify_browser=false,member_notify_email=false,member_reminder_time='12:30' where id=$1",[task.id])
    await db.exec('reset role')
    await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_modules.sql','utf8'))
    prefs=(await db.query('select * from periodic_member_preferences')).rows[0]
    assert.equal(prefs.notify_browser,false)
    assert.equal(prefs.notify_email,false)
    assert.match(prefs.reminder_time,/12:30/)
    assert.equal((await db.query('select count(*)::int as n from periodic_member_preferences')).rows[0].n,1)
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.periodic_member_preferences'::regclass")).rows[0].relrowsecurity,true)
    const fk=(await db.query("select condeferrable,condeferred from pg_constraint where conrelid='public.periodic_member_preferences'::regclass and confrelid='public.periodic_tasks'::regclass")).rows[0]
    assert.equal(fk.condeferrable,true)
    assert.equal(fk.condeferred,true,'runtime task inserts still require deferred validation')
  } finally {await db.close()}
})

test('vault migration stays private until encrypted, seals atomically, rejects stale keys and shares only ciphertext', async () => {
  const { db,as,rpc,ow,ew } = await fixture('vault')
  const metadata = salt => JSON.stringify({format:'todo-vault-v1',iterations:310000,salt,
    verifier:{v:1,iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(32).toString('base64')}})
  const salt=Buffer.alloc(16,1).toString('base64'), salt2=Buffer.alloc(16,2).toString('base64')
  const payload={v:1,iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(32).toString('base64'),key_id:salt}
  try {
    await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_vault.sql','utf8'))
    await as(owner)
    await assert.rejects(rpc("select create_collection_invite($1,'secure') as result",[ow]),/VAULT_UPGRADE_REQUIRED/)
    const session=(await db.query('select * from password_sessions')).rows[0]
    const note=(await db.query('select * from secure_notes')).rows[0]
    assert.equal(note.content,'Secret content','private legacy data survives migration')
    await assert.rejects(rpc('select seal_vault($1,$2,$3,$4,$5,$6) as result',
      [session.id,session.password_hash,metadata(salt),JSON.stringify([{id:note.id,version:99,encrypted_payload:payload}]),session.version,session.name]),/SHARING_CONFLICT/)
    assert.equal((await db.query('select password_hash from password_sessions')).rows[0].password_hash,session.password_hash,'failed seal rolls back metadata too')
    const sealed=await rpc('select seal_vault($1,$2,$3,$4,$5,$6) as result',
      [session.id,session.password_hash,metadata(salt),JSON.stringify([{id:note.id,version:note.version,encrypted_payload:payload}]),session.version,session.name])
    const stored=(await db.query('select * from secure_notes')).rows[0]
    for (const field of ['description','username','password_encrypted','url','content']) assert.equal(stored[field],null)
    assert.equal(stored.title,'Encrypted note')
    await assert.rejects(db.query('update password_sessions set password_hash=$1 where id=$2',['new-plaintext',session.id]),/VAULT_UPGRADE_REQUIRED/)
    const invitation=await rpc("select create_collection_invite($1,'secure') as result",[ow])
    await as(editor)
    await rpc('select accept_collection_invite($1,$2) as result',[invitation.token,ew])
    assert.equal((await db.query('select * from secure_notes')).rows[0].content,null)
    const rotated=await rpc('select seal_vault($1,$2,$3,$4,$5,$6) as result',
      [session.id,sealed.password_hash,metadata(salt2),JSON.stringify([{id:note.id,version:stored.version,encrypted_payload:{...payload,key_id:salt2}}]),sealed.version,session.name])
    assert.equal(rotated.version,sealed.version+1)
    await assert.rejects(db.query('update secure_notes set encrypted_payload=$1 where id=$2',[JSON.stringify(payload),note.id]),/SHARING_CONFLICT/)
    await assert.rejects(db.query('update secure_notes set encrypted_payload=null where id=$1',[note.id]),/VAULT_INVALID_DATA/)
    await as(owner)
    await rpc("select manage_collection($1,'remove_member',$2) as result",[session.collection_id,editor])
    await as(editor)
    assert.equal((await db.query('select * from secure_notes')).rows.length,0)
    await db.exec('reset role')
    await db.exec(migration)
    await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_modules.sql','utf8'))
    await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_vault.sql','utf8'))
    await as(owner)
    assert.equal((await db.query('select encrypted_payload from secure_notes')).rows[0].encrypted_payload.key_id,salt2,'rerunning the complete migration chain preserves ciphertext')
  } finally { await db.close() }
})
test('permission upgrade preserves old editor invites, defaults new links to viewer and blocks reused links for every account', async () => {
  const {db,as,rpc,ow,ew,xw}=await fixture(true)
  try {
    await as(owner)
    const legacy=await rpc("select create_collection_invite($1,'quick') as result",[ow])
    await db.exec('reset role')
    // Emulate installed functions before reader permissions were introduced.
    await db.exec(`do $$ declare f record; begin
      for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in ('guard_collection_record','mutate_collection_item','rollover_collection_plans') loop
        execute replace(pg_get_functiondef(f.oid),'public.collection_write(','public.collection_access(');
      end loop;
    end; $$;`)
    const permissions=fs.readFileSync('supabase/migrations/tab_sharing_permissions.sql','utf8')
    await db.exec(permissions)
    await db.exec(permissions)
    await as(editor)
    assert.equal((await rpc('select preview_collection_invite($1) as result',[legacy.token])).invite_role,'editor')
    const accepted=await rpc('select accept_collection_invite($1,$2) as result',[legacy.token,ew])
    const binding=accepted.find(b=>b.module==='quick')
    assert.equal(binding.role,'editor')
    assert.equal(binding.permissions_ready,true)
    await assert.rejects(rpc('select accept_collection_invite($1,$2) as result',[legacy.token,ew]),/INVITE_USED/)
    await as(owner)
    await rpc("select manage_collection($1,'remove_member',$2) as result",[binding.collection_id,editor])
    await as(editor)
    await assert.rejects(rpc('select preview_collection_invite($1) as result',[legacy.token]),/INVITE_USED/)
    await assert.rejects(rpc('select accept_collection_invite($1,$2) as result',[legacy.token,ew]),/INVITE_USED/)
    assert.deepEqual((await db.query('select content from quick_notes')).rows.map(n=>n.content),['Editor original'])
    await as(owner)
    const fresh=await rpc("select create_collection_invite($1,'quick') as result",[ow])
    assert.equal(fresh.invite_role,'viewer')
    await rpc('select accept_collection_invite($1,$2) as result',[fresh.token,ow])
    await as(outsider)
    await assert.rejects(rpc('select accept_collection_invite($1,$2) as result',[fresh.token,xw]),/INVITE_USED/,'owners accepting their own links consume them too')
    await assert.rejects(rpc("select create_collection_invite($1,'quick','owner') as result",[xw]),/INVALID_ROLE/)
    await assert.rejects(rpc("select create_collection_invite($1,'quick',null) as result",[xw]),/INVALID_ROLE/)
    await assert.rejects(rpc('select preview_collection_invite($1) as result',['invalid']),/INVITE_INVALID/)
    await db.exec('reset role; set role anon')
    await assert.rejects(rpc('select preview_collection_invite($1) as result',[fresh.token]),/permission denied/)
    await assert.rejects(rpc("select create_collection_invite($1,'quick','editor') as result",[ow]),/permission denied/)
  } finally {await db.close()}
})

test('viewer membership reads all twelve root tables but cannot write through REST or item, rollover and vault RPCs', async () => {
  const {db,as,rpc,ow,ew}=await fixture('vault',true)
  const salt=Buffer.alloc(16,4).toString('base64')
  const metadata=JSON.stringify({format:'todo-vault-v1',iterations:310000,salt,
    verifier:{v:1,iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(32).toString('base64')}})
  const payload={v:1,iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(32).toString('base64'),key_id:salt}
  const roots=[['quick_notes','quick'],['code_snippets','code'],['categories','detailed'],['todos','detailed'],
    ['activity_items','activities'],['plans','plans'],['learning_subjects','learning'],['flashcard_decks','flashcards'],
    ['workout_routines','workout'],['periodic_tasks','periodic'],['password_sessions','secure'],['secure_notes','secure']]
  try {
    await as(owner)
    const ctx=await rpc('select sharing_context($1) as result',[ow])
    const cids=Object.fromEntries(ctx.map(b=>[b.module,b.collection_id]))
    for(const [table,module,column,value] of [
      ['code_snippets','code','code','Example'],['categories','detailed','name','Shared'],
      ['todos','detailed','title','Detailed'],['activity_items','activities','external_id','Shared'],
      ['flashcard_decks','flashcards','title','Deck'],['workout_routines','workout','title','Routine'],
      ['periodic_tasks','periodic','title','Reminder']
    ]) {
      const actor=['code_snippets','categories','todos'].includes(table)?'created_by':'user_id'
      await db.query(`insert into ${table}(${actor},workspace_id,collection_id,${column}) values($1,$2,$3,$4)`,[owner,ow,cids[module],value])
    }
    const session=(await db.query('select * from password_sessions')).rows[0]
    const note=(await db.query('select * from secure_notes')).rows[0]
    await rpc('select seal_vault($1,$2,$3,$4,$5,$6) as result',
      [session.id,session.password_hash,metadata,[{id:note.id,version:note.version,encrypted_payload:payload}],session.version,session.name])
    for(const module of new Set(roots.map(([,module])=>module))) {
      await as(owner)
      const inv=await rpc("select create_collection_invite($1,$2,'viewer') as result",[ow,module])
      await as(editor)
      const accepted=await rpc('select accept_collection_invite($1,$2) as result',[inv.token,ew])
      assert.equal(accepted.find(b=>b.module===module).role,'viewer')
      assert.equal(await rpc('select collection_write($1) as result',[cids[module]]),false)
    }
    for(const [table] of roots) {
      const rows=(await db.query(`select * from ${table}`)).rows
      assert.ok(rows.length>0,table+' remains readable')
      assert.equal((await db.query(`update ${table} set version=version where id=$1 returning id`,[rows[0].id])).rows.length,0,table+' rejects updates')
      assert.equal((await db.query(`delete from ${table} where id=$1 returning id`,[rows[0].id])).rows.length,0,table+' rejects deletes')
      await assert.rejects(db.query(`insert into ${table} select (jsonb_populate_record(null::${table},to_jsonb(src)||jsonb_build_object('id',gen_random_uuid()))).* from ${table} src limit 1`),/COLLECTION_ACCESS_DENIED|row-level security/,table+' rejects inserts')
    }
    const parent=(await db.query('select * from learning_subjects')).rows[0]
    await assert.rejects(rpc("select mutate_collection_item($1,$2,'learning','add',$3) as result",[cids.learning,parent.id,{id:'intrusion',title:'No'}]),/ACCESS_DENIED/)
    await assert.rejects(rpc('select rollover_collection_plans($1) as result',[cids.plans]),/ACCESS_DENIED/)
    const sealed=(await db.query('select * from password_sessions')).rows[0]
    await assert.rejects(rpc('select seal_vault($1,$2,$3,$4,$5,$6) as result',
      [sealed.id,sealed.password_hash,metadata,[{id:note.id,version:2,encrypted_payload:payload}],sealed.version,sealed.name]),/ACCESS_DENIED/)
    await assert.rejects(rpc("select create_collection_invite($1,'quick','editor') as result",[ew]),/OWNER_REQUIRED/)
    await assert.rejects(db.query("update collection_members set role='editor' where user_id=$1",[editor]),/permission denied/)
    await assert.rejects(db.query('select * from collection_invites'),/permission denied/)
    await assert.rejects(db.query("insert into learning_subjects_items(parent_id,id,data) values($1,'intrusion','{}')",[parent.id]),/permission denied|does not exist/)
    const reminder=(await db.query('select * from periodic_tasks')).rows[0]
    await db.exec('reset role')
    await db.query('insert into periodic_member_preferences(task_id,user_id) values($1,$2)',[reminder.id,editor])
    await as(editor)
    await rpc('select mark_member_reminder($1) as result',[reminder.id])
    assert.ok((await rpc('select personal_workspace_reminders() as result'))[0].last_notified_at,'existing personal delivery state can still be recorded')
    await as(owner)
    assert.equal((await db.query('select * from quick_notes')).rows[0].content,'Owner original')
    assert.equal((await db.query('select topics from learning_subjects')).rows[0].topics.length,1)
  } finally {await db.close()}
})

test('editor invite permits writes and roles cannot be changed by accepting a differently scoped invite', async () => {
  const {db,as,rpc,ow,ew}=await fixture(true,true)
  try {
    await as(owner)
    const inv=await rpc("select create_collection_invite($1,'learning','editor') as result",[ow])
    await as(editor)
    const ctx=await rpc('select accept_collection_invite($1,$2) as result',[inv.token,ew])
    const cid=ctx.find(b=>b.module==='learning').collection_id
    assert.equal(await rpc('select collection_write($1) as result',[cid]),true)
    const parent=(await db.query('select * from learning_subjects')).rows[0]
    await db.query("update learning_subjects set title='Updated' where id=$1",[parent.id])
    const added=await rpc("select mutate_collection_item($1,$2,'learning','add',$3) as result",[cid,parent.id,{id:'editor-item',title:'Added',learn:false}])
    assert.equal(added.topics.length,2)
    await as(owner)
    const different=await rpc("select create_collection_invite($1,'learning','viewer') as result",[ow])
    await as(editor)
    await assert.rejects(rpc('select accept_collection_invite($1,$2) as result',[different.token,ew]),/ALREADY_MEMBER/)
    assert.equal((await rpc('select preview_collection_invite($1) as result',[different.token])).invite_role,'viewer','failed acceptance leaves the invitation unused')
    await as(owner)
    await rpc("select manage_collection($1,'remove_member',$2) as result",[cid,editor])
    await as(editor)
    const downgraded=await rpc('select accept_collection_invite($1,$2) as result',[different.token,ew])
    assert.equal(downgraded.find(b=>b.module==='learning').role,'viewer')
    await db.exec('reset role')
    const digest=(await db.query('select token_hash from collection_invites where id=$1',[different.id])).rows[0].token_hash
    assert.notEqual(digest,different.token)
    assert.equal(digest.length,64)
  } finally {await db.close()}
})

test('sharing preserves personal notes, consumes an invite, enforces membership and detaches safely', async () => {
  const f = await fixture(), { db, as, rpc, ow, ew, xw } = f
  try {
    await db.exec(migration)
    assert.equal((await db.query('select count(*)::int as n from module_collections')).rows[0].n,12)
    await as(owner)
    const ctx = await rpc('select sharing_context($1) as result',[ow])
    const cid = ctx.find(b => b.module === 'quick').collection_id
    const inv = await rpc("select create_collection_invite($1,'quick') as result",[ow])
    assert.equal(inv.token.length,64)
    await assert.rejects(db.query('select * from collection_invites'),/permission denied/)
    await as(editor)
    assert.deepEqual((await db.query('select content from quick_notes')).rows.map(n => n.content),['Editor original'])
    const preview = await rpc('select preview_collection_invite($1) as result',[inv.token])
    assert.equal(preview.module,'quick')
    assert.equal(preview.owner_label,'owner')
    assert.equal(preview.content,undefined)
    await assert.rejects(rpc('select accept_collection_invite($1,$2) as result',[inv.token,ow]),/WORKSPACE_ACCESS_DENIED/)
    const accepted = await rpc('select accept_collection_invite($1,$2) as result',[inv.token,ew])
    assert.equal(accepted.find(b => b.module === 'quick').role,'editor')
    assert.deepEqual((await db.query('select content from quick_notes')).rows.map(n => n.content),['Owner original'])
    const added = (await db.query('insert into quick_notes(created_by,workspace_id,collection_id,content) values($1,$2,$3,$4) returning *',
      [outsider,ew,cid,'Shared addition'])).rows[0]
    assert.equal(added.created_by,editor,'actual actor is stamped by the database')
    assert.equal(added.workspace_id,ow,'origin is independent of the editor workspace')
    await assert.rejects(rpc("select manage_collection($1,'end_sharing') as result",[cid]),/OWNER_REQUIRED/)
    await as(outsider)
    assert.equal((await db.query('select * from quick_notes')).rows.length,0)
    await assert.rejects(rpc('select accept_collection_invite($1,$2) as result',[inv.token,xw]),/INVITE_USED/)
    await assert.rejects(db.query('insert into quick_notes(created_by,workspace_id,collection_id,content) values($1,$2,$3,$4)',
      [outsider,xw,cid,'Intrusion']),/COLLECTION_ACCESS_DENIED|row-level security/)
    await as(owner)
    assert.equal((await db.query('select * from quick_notes')).rows.length,2)
    await as(editor)
    await rpc("select detach_collection($1,'quick') as result",[ew])
    assert.deepEqual((await db.query('select content from quick_notes')).rows.map(n => n.content),['Editor original'])
    await as(owner)
    assert.equal((await db.query('select * from quick_notes')).rows.length,2,'detaching does not delete common records')
  } finally { await db.close() }
})

test('normalized items preserve legacy IDs, allow independent edits and reject stale child changes', async () => {
  const { db,as,rpc,ow,ew } = await fixture(true)
  try {
    await db.exec(fs.readFileSync('supabase/migrations/tab_sharing_modules.sql','utf8'))
    await as(owner)
    const ctx=await rpc('select sharing_context($1) as result',[ow])
    const cid=ctx.find(b=>b.module==='learning').collection_id
    const parent=(await db.query('select * from learning_subjects')).rows[0]
    assert.equal(parent.topics[0].id,'old-topic')
    assert.equal(parent.topics[0]._version,1)
    const inv=await rpc("select create_collection_invite($1,'learning') as result",[ow])
    await as(editor)
    await rpc('select accept_collection_invite($1,$2) as result',[inv.token,ew])
    const added=await rpc("select mutate_collection_item($1,$2,'learning','add',$3) as result",[cid,parent.id,{id:'new-topic',title:'New',learn:false}])
    assert.equal(added.topics.length,2)
    await as(owner)
    const updated=await rpc("select mutate_collection_item($1,$2,'learning','update',$3,1) as result",[cid,parent.id,{id:'old-topic',learn:true}])
    assert.equal(updated.topics.find(t=>t.id==='new-topic').title,'New')
    assert.equal(updated.topics.find(t=>t.id==='old-topic').learn,true)
    await as(editor)
    await assert.rejects(rpc("select mutate_collection_item($1,$2,'learning','update',$3,1) as result",[cid,parent.id,{id:'old-topic',learn:false}]),/SHARING_CONFLICT/)
    await assert.rejects(db.query("update learning_subjects set topics='[]' where id=$1",[parent.id]),/USE_ITEM_OPERATIONS/)
    await rpc("select mutate_collection_item($1,$2,'learning','delete',$3,1) as result",[cid,parent.id,{id:'new-topic'}])
    assert.equal((await db.query('select topics from learning_subjects')).rows[0].topics.length,1)
    await db.query('delete from learning_subjects where id=$1',[parent.id])
    assert.equal((await db.query('select * from learning_subjects_items')).rows.length,0)
  } finally { await db.close() }
})

test('shared plan rollover is repeatable and keeps one history snapshot per elapsed period', async () => {
  const { db,as,rpc,ow,ew } = await fixture(true)
  try {
    await as(owner)
    const ctx=await rpc('select sharing_context($1) as result',[ow])
    const cid=ctx.find(b=>b.module==='plans').collection_id
    const inv=await rpc("select create_collection_invite($1,'plans') as result",[ow])
    await as(editor)
    await rpc('select accept_collection_invite($1,$2) as result',[inv.token,ew])
    await rpc('select rollover_collection_plans($1) as result',[cid])
    const plan=(await db.query('select * from plans')).rows[0]
    assert.ok(plan.history.length>=2)
    assert.ok(plan.history.every(entry=>entry.reason==='Waiting'))
    await as(owner)
    await rpc('select rollover_collection_plans($1) as result',[cid])
    assert.deepEqual((await db.query('select history from plans')).rows[0].history,plan.history)
  } finally { await db.close() }
})

test('routine reminder preferences and sent state are personal while completion is shared', async () => {
  const { db,as,rpc,ow,ew } = await fixture(true)
  try {
    await as(owner)
    const cid=(await rpc('select sharing_context($1) as result',[ow])).find(b=>b.module==='periodic').collection_id
    const task=(await db.query("insert into periodic_tasks(user_id,workspace_id,collection_id,title,member_notify_browser,member_notify_email,member_reminder_time) values($1,$2,$3,'Routine',true,false,'10:00') returning *",[owner,ow,cid])).rows[0]
    assert.equal((await rpc('select personal_workspace_reminders() as result'))[0].notify_browser,true)
    const inv=await rpc("select create_collection_invite($1,'periodic') as result",[ow])
    await as(editor)
    await rpc('select accept_collection_invite($1,$2) as result',[inv.token,ew])
    let reminders=await rpc('select personal_workspace_reminders() as result')
    assert.equal(reminders[0].notify_browser,false,'joining does not enable other people’s notifications')
    assert.equal(reminders[0].workspace_id,ew)
    await db.query("update periodic_tasks set member_notify_browser=false,member_notify_email=true,member_reminder_time='11:00',completed_date=current_date where id=$1",[task.id])
    await rpc('select mark_member_reminder($1) as result',[task.id])
    reminders=await rpc('select personal_workspace_reminders() as result')
    assert.equal(reminders[0].notify_email,true)
    assert.match(reminders[0].reminder_time,/11:00/)
    assert.ok(reminders[0].last_notified_at)
    await as(owner)
    reminders=await rpc('select personal_workspace_reminders() as result')
    assert.equal(reminders[0].notify_browser,true)
    assert.equal(reminders[0].notify_email,false)
    assert.match(reminders[0].reminder_time,/10:00/)
    assert.equal(reminders[0].last_notified_at,null)
    assert.ok(reminders[0].completed_date)
  } finally { await db.close() }
})

test('revocation changes the channel epoch and stops data access even when the origin workspace is archived', async () => {
  const { db,as,rpc,ow,ew } = await fixture()
  try {
    await as(owner)
    const ctx = await rpc('select sharing_context($1) as result',[ow])
    const cid = ctx.find(b => b.module==='quick').collection_id
    const inv = await rpc("select create_collection_invite($1,'quick') as result",[ow])
    const work = (await db.query("insert into workspaces(user_id,name) values($1,'Second') returning id",[owner])).rows[0].id
    await as(editor)
    await rpc('select accept_collection_invite($1,$2) as result',[inv.token,ew])
    assert.equal(await rpc('select sharing_topic_access($1) as result',[`collection:${cid}:1`]),true)
    await as(owner)
    await db.query('update workspaces set archived_at=now() where id=$1',[ow])
    await as(editor)
    assert.equal((await db.query('select content from quick_notes')).rows[0].content,'Owner original')
    await as(owner)
    await rpc("select manage_collection($1,'remove_member',$2) as result",[cid,editor])
    await as(editor)
    assert.equal(await rpc('select sharing_topic_access($1) as result',[`collection:${cid}:1`]),false)
    assert.deepEqual((await db.query('select content from quick_notes')).rows.map(n=>n.content),['Editor original'])
    assert.equal((await rpc('select sharing_context($1) as result',[ew])).find(b=>b.module==='quick').shared,false)
    assert.ok(work)
  } finally { await db.close() }
})

test('expired and revoked tokens fail, stale versions cannot overwrite newer edits, and category boundaries survive', async () => {
  const { db,as,rpc,ow,ew } = await fixture()
  try {
    await as(owner)
    const ctx = await rpc('select sharing_context($1) as result',[ow])
    const quick = ctx.find(b=>b.module==='quick').collection_id
    const detailed = ctx.find(b=>b.module==='detailed').collection_id
    const inv = await rpc("select create_collection_invite($1,'quick') as result",[ow])
    await rpc("select manage_collection($1,'revoke_invite',$2) as result",[quick,inv.id])
    await as(editor)
    await assert.rejects(rpc('select preview_collection_invite($1) as result',[inv.token]),/INVITE_REVOKED/)
    await as(owner)
    const expired = await rpc("select create_collection_invite($1,'quick') as result",[ow])
    await db.exec('reset role')
    await db.query("update collection_invites set expires_at=now()-interval '1 second' where id=$1",[expired.id])
    await as(editor)
    await assert.rejects(rpc('select accept_collection_invite($1,$2) as result',[expired.token,ew]),/INVITE_EXPIRED/)
    await as(owner)
    const note=(await db.query('select * from quick_notes')).rows[0]
    await db.query("update quick_notes set content='New version' where id=$1 and version=$2",[note.id,note.version])
    assert.equal((await db.query("update quick_notes set content='Stale write' where id=$1 and version=$2 returning *",[note.id,note.version])).rows.length,0)
    assert.equal((await db.query('select version from quick_notes')).rows[0].version,2)
    const cat=(await db.query("insert into categories(created_by,workspace_id,collection_id,name) values($1,$2,$3,'Work') returning id",[owner,ow,detailed])).rows[0].id
    await assert.rejects(db.query('insert into todos(created_by,workspace_id,collection_id,category_id,title) values($1,$2,$3,$4,$5)',[owner,ow,quick,cat,'Bad']),/COLLECTION_ACCESS_DENIED|foreign key/)
    await db.query('insert into todos(created_by,workspace_id,collection_id,category_id,title) values($1,$2,$3,$4,$5)',[owner,ow,detailed,cat,'Good'])
    await db.query('delete from categories where id=$1',[cat])
    assert.equal((await db.query('select category_id from todos')).rows[0].category_id,null)
  } finally { await db.close() }
})
