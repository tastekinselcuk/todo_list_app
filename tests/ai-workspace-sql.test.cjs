const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')

const owner = '10000000-0000-0000-0000-000000000001'
const guest = '20000000-0000-0000-0000-000000000002'

async function createFullFixture() {
  const db = new PGlite()
  const contract = JSON.parse(fs.readFileSync('supabase/bootstrap/contract.json', 'utf8'))
  const { baselineTransaction } = await import('../scripts/database-baseline.mjs')
  const { migrationFiles, migrationTransaction } = await import('../scripts/migration-contract.mjs')

  await db.exec("set time zone 'UTC'")
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role authenticator;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create table auth.mfa_factors(user_id uuid, status text);
    create table auth.sessions(id uuid, user_id uuid);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create schema storage;
    create table storage.objects(id uuid);
    alter table storage.objects enable row level security;
    create schema cron;
    create table cron.job(jobname text, active boolean, schedule text);
    create schema vault;
    create table vault.secrets(name text);
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create schema extensions;
    create schema net;
    insert into auth.users(id, email, email_confirmed_at) values
      ('${owner}', 'owner@test.invalid', now()),
      ('${guest}', 'guest@test.invalid', now());
  `)

  await db.exec(baselineTransaction())
  await db.exec('set search_path=public')
  for (const file of migrationFiles().filter(f => f.version > contract.through)) {
    await db.exec(migrationTransaction(file))
  }

  async function as(id, role = 'authenticated', aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || ''])
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      id ? JSON.stringify({ sub: id, aal }) : '{}',
    ])
    await db.exec(`set role ${role}`)
  }

  const rpc = async (sql, args = []) => (await db.query(sql, args)).rows[0].result

  await as(owner)
  const wid = await rpc('select ensure_default_workspace() as result')
  await rpc('select ensure_module_bindings($1) as result', [wid])
  await db.exec('reset role')
  await db.query(
    "update public.workspaces set active_modules=array['plans','detailed','quick','secure','code','pomodoro','learning','flashcards','workout','periodic','activities','finance','tasks','calendar'] where id=$1",
    [wid]
  )

  await as(guest)
  const gwid = await rpc('select ensure_default_workspace() as result')
  await rpc('select ensure_module_bindings($1) as result', [gwid])

  return { db, owner, guest, wid, gwid, as, rpc }
}

test('unified mutation RPCs, note write modes, digest, read, execute_actions and undo work end-to-end across modules', async () => {
  const f = await createFullFixture()
  const { db, wid, gwid, owner, guest, as, rpc } = f
  try {
    await as(owner)

    // 1. Detailed notes & categories via notes_mutate
    const catId = '30000000-0000-0000-0000-000000000001'
    const noteId = '30000000-0000-0000-0000-000000000002'
    const cat = await rpc("select notes_mutate($1,'category','create',$2,$3) as result", [
      wid,
      catId,
      JSON.stringify({ name: 'Yapay Zeka', color: '#6366f1', icon: 'sparkles' }),
    ])
    assert.equal(cat.name, 'Yapay Zeka')

    const noteCreated = await rpc("select notes_mutate($1,'note','create',$2,$3) as result", [
      wid,
      noteId,
      JSON.stringify({
        title: 'Mimari Notlar',
        description: '<p>İlk paragraf.</p>',
        category_id: catId,
        priority: 'high',
      }),
    ])
    assert.equal(noteCreated.title, 'Mimari Notlar')
    assert.equal(noteCreated.version, 1)

    // Append mode via notes_mutate
    const noteAppended = await rpc("select notes_mutate($1,'note','append',$2,$3,$4) as result", [
      wid,
      noteId,
      JSON.stringify({ description: '<p>AI tarafından eklenen özet.</p>', target_format: 'html' }),
      noteCreated.version,
    ])
    assert.equal(noteAppended.version, 2)
    assert.match(noteAppended.description, /İlk paragraf/)
    assert.match(noteAppended.description, /AI tarafından eklenen özet/)

    // 2. Plans mutation with rich notes
    const planId = '30000000-0000-0000-0000-000000000003'
    const planCreated = await rpc("select plans_mutate($1,'create',$2,$3) as result", [
      wid,
      planId,
      JSON.stringify({
        title: 'Haftalık Sprint Planı',
        period: 'weekly',
        period_date: '2026-11-09',
        notes: 'Başlangıç notu',
      }),
    ])
    assert.equal(planCreated.title, 'Haftalık Sprint Planı')
    assert.equal(planCreated.notes, 'Başlangıç notu')
    assert.equal('reason' in planCreated, false)

    const planSectionAdded = await rpc("select plans_mutate($1,'insert_section',$2,$3,$4) as result", [
      wid,
      planId,
      JSON.stringify({ notes: '- Madde 1\n- Madde 2', section_heading: 'AI Önerileri' }),
      planCreated.version,
    ])
    assert.match(planSectionAdded.notes, /## AI Önerileri/)
    assert.match(planSectionAdded.notes, /- Madde 1/)

    // 3. Periodic tasks mutation with notes
    const periodicId = '30000000-0000-0000-0000-000000000004'
    const periodicCreated = await rpc("select periodic_mutate($1,'create',$2,$3) as result", [
      wid,
      periodicId,
      JSON.stringify({
        title: 'Günlük Okuma',
        frequency: 'daily',
        category: 'habit',
        notes: 'En az 20 sayfa',
      }),
    ])
    assert.equal(periodicCreated.notes, 'En az 20 sayfa')

    // 4. Code snippets mutation
    const codeId = '30000000-0000-0000-0000-000000000005'
    const codeCreated = await rpc("select code_mutate($1,'create',$2,$3) as result", [
      wid,
      codeId,
      JSON.stringify({ title: 'Edge Handler', language: 'typescript', code: 'export const ok = true;' }),
    ])
    assert.equal(codeCreated.language, 'typescript')

    // 5. Activity item notes & Finance transaction note
    const actId = '30000000-0000-0000-0000-000000000006'
    await rpc("select activity_library_mutate($1,'item.add',$2,$3) as result", [
      wid,
      actId,
      JSON.stringify({ title: 'Dune', type: 'book', notes: 'Harika bilimkurgu' }),
    ])
    const actUpdated = await rpc("select activity_library_mutate($1,'item.notes',$2,$3,1) as result", [
      wid,
      actId,
      JSON.stringify({ notes: 'İkinci kitap da okunacak', write_mode: 'append' }),
    ])
    assert.match(actUpdated.item.notes, /Harika bilimkurgu/)
    assert.match(actUpdated.item.notes, /İkinci kitap da okunacak/)

    const finId = '30000000-0000-0000-0000-000000000007'
    const finCreated = await rpc("select finance_mutate($1,'transaction','create',$2,$3) as result", [
      wid,
      finId,
      JSON.stringify({
        title: 'Bulut Sunucu',
        kind: 'expense',
        amount: 450,
        occurred_on: '2026-11-10',
        note: 'Kasım ayı GPU faturası',
      }),
    ])
    assert.equal(finCreated.note, 'Kasım ayı GPU faturası')
    const finQuery = await rpc("select finance_query($1,'2026-11-01'::date,$2) as result", [
      wid,
      JSON.stringify({ search: 'GPU faturası' }),
    ])
    assert.equal(finQuery.items.length, 1)
    assert.equal(finQuery.items[0].note, 'Kasım ayı GPU faturası')

    // 6. AI Workspace Digest & AI Read Records
    const digest = await rpc('select ai_workspace_digest($1) as result', [wid])
    assert.equal(digest.workspace.id, wid)
    assert.equal(digest.plans.active_count, 1)
    assert.equal(digest.detailed_notes.total_count, 1)
    assert.equal(digest.periodic.total_count, 1)
    assert.equal(digest.finance.month_expense, 450)
    assert.equal('secure' in digest, false)

    const readRes = await rpc('select ai_read_records($1,$2) as result', [
      wid,
      JSON.stringify([
        { module: 'detailed', id: noteId },
        { module: 'plans', id: planId },
        { module: 'periodic', id: periodicId },
        { module: 'activities', id: actId },
        { module: 'finance', id: finId },
      ]),
    ])
    assert.equal(readRes.items.length, 5)

    // Reading secure module must be strictly rejected
    await assert.rejects(
      rpc('select ai_read_records($1,$2) as result', [
        wid,
        JSON.stringify([{ module: 'secure', id: noteId }]),
      ]),
      /AI_SECURE_MODULE_FORBIDDEN/
    )

    // Guest cannot read or digest owner's workspace
    await as(guest)
    await assert.rejects(rpc('select ai_workspace_digest($1) as result', [wid]), /AI_ACCESS_DENIED/)
    await assert.rejects(
      rpc('select ai_read_records($1,$2) as result', [wid, JSON.stringify([{ module: 'plans', id: planId }])]),
      /AI_ACCESS_DENIED/
    )

    // 7. Batch AI Execute Actions + Undo
    await as(owner)
    const aiTaskId = '30000000-0000-0000-0000-000000000008'
    const aiDeckId = '30000000-0000-0000-0000-000000000009'
    const execResult = await rpc('select ai_execute_actions($1,$2,$3) as result', [
      wid,
      JSON.stringify([
        {
          module: 'detailed',
          operation: 'append',
          target_id: noteId,
          payload: { description: '<p>Üçüncü paragraf (geri alınacak).</p>', target_format: 'html' },
        },
        {
          module: 'tasks',
          operation: 'create',
          target_id: aiTaskId,
          payload: {
            title: 'AI Tarafından Oluşturulan Görev',
            description: 'Detaylı görev açıklaması',
            priority: 'high',
            status: 'todo',
          },
        },
        {
          module: 'flashcards',
          operation: 'create',
          target_id: aiDeckId,
          payload: {
            title: 'AI Tekrar Kartları',
            color: '#10b981',
            cards: [{ id: 'card-1', front: 'RAG nedir?', back: 'Retrieval-Augmented Generation' }],
          },
        },
      ]),
      JSON.stringify({
        prompt: 'Notumu genişlet, görev ve kart ekle',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        write_mode: 'ask_before_write',
      }),
    ])
    assert.equal(execResult.status, 'applied')
    assert.equal(execResult.applied_count, 3)

    // Verify changes took effect before undo
    const afterNote = (
      await rpc('select ai_read_records($1,$2) as result', [
        wid,
        JSON.stringify([{ module: 'detailed', id: noteId }]),
      ])
    ).items[0]
    assert.match(afterNote.description, /Üçüncü paragraf/)

    const historyBeforeUndo = await rpc('select ai_action_history($1) as result', [wid])
    assert.equal(historyBeforeUndo.length, 1)
    assert.equal(historyBeforeUndo[0].status, 'applied')

    // Undo the AI action run
    const undoResult = await rpc('select ai_undo_action_run($1,$2) as result', [wid, execResult.run_id])
    assert.equal(undoResult.status, 'undone')
    assert.equal(undoResult.restored_count, 3)

    // Verify note reverted to previous content and created task/deck are soft-deleted
    const revertedNote = (
      await rpc('select ai_read_records($1,$2) as result', [
        wid,
        JSON.stringify([{ module: 'detailed', id: noteId }]),
      ])
    ).items[0]
    assert.doesNotMatch(revertedNote.description, /Üçüncü paragraf/)
    assert.match(revertedNote.description, /AI tarafından eklenen özet/)

    const deletedTaskRead = await rpc('select ai_read_records($1,$2) as result', [
      wid,
      JSON.stringify([
        { module: 'tasks', id: aiTaskId },
        { module: 'flashcards', id: aiDeckId },
      ]),
    ])
    assert.equal(deletedTaskRead.items.length, 0)
  } finally {
    await db.close()
  }
})

test('AI provider credentials are isolated in private schema, masked on client read, and accessible only to service_role at runtime', async () => {
  const f = await createFullFixture()
  const { db, owner, guest, as, rpc } = f
  try {
    await as(owner)
    const initial = await rpc('select ai_settings_get() as result')
    assert.equal(initial.provider, 'gemini')
    assert.equal(initial.configured_providers.gemini, false)

    const saved = await rpc('select ai_settings_save($1,$2,$3,$4,$5) as result', [
      'openai',
      'gpt-4.1-mini',
      'auto_apply',
      'sk-proj-1234567890abcdef',
      null,
    ])
    assert.equal(saved.provider, 'openai')
    assert.equal(saved.model, 'gpt-4.1-mini')
    assert.equal(saved.write_mode, 'auto_apply')
    assert.equal(saved.configured_providers.openai, true)
    assert.equal(saved.key_hints.openai, '••••cdef')
    assert.ok(!JSON.stringify(saved).includes('sk-proj-1234567890abcdef'))

    // Authenticated user cannot directly query private.user_ai_credentials or call ai_resolve_runtime_credentials
    await assert.rejects(db.query('select * from private.user_ai_credentials'), /permission denied/)
    await assert.rejects(rpc('select ai_resolve_runtime_credentials($1) as result', [owner]), /permission denied/)

    // Guest cannot see owner's settings
    await as(guest)
    const guestSettings = await rpc('select ai_settings_get() as result')
    assert.equal(guestSettings.configured_providers.openai, false)

    // service_role can resolve runtime credentials for the Edge Function
    await as(owner, 'service_role')
    const runtime = await rpc('select ai_resolve_runtime_credentials($1) as result', [owner])
    assert.equal(runtime.provider, 'openai')
    assert.equal(runtime.model, 'gpt-4.1-mini')
    assert.equal(runtime.api_key, 'sk-proj-1234567890abcdef')
  } finally {
    await db.close()
  }
})
