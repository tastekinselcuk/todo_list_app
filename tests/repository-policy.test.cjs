const {test}=require('node:test'),assert=require('node:assert/strict')
test('repository gate rejects tracked local material while retaining source, deployment files and attributions',async()=>{
 const {localOnlyFiles}=await import('../scripts/check-repository.mjs')
 const rejected=['tmp/tools/LICENSE.md','docs/review.md','REVIEW.md','research/data.json','experiment.local/result.json','node_modules/lib/a.js','.env','.env.production','backup.zip.dpapi','test-results/run.png','src/__pycache__/a.pyc']
 const allowed=['src/components/Editor.vue','src/lib/database.types.ts','supabase/bootstrap/application.sql','supabase/migrations/202611140018_vault_rpc_only.sql','.github/workflows/ci.yml','src/features/workout/data/NOTICE.md','LICENSE','NOTICE.txt','.env.example','.env.production.example','tests/vault.test.cjs','scripts/check-staging.mjs']
 assert.deepEqual(localOnlyFiles([...rejected,...allowed]),rejected)
 assert.deepEqual(localOnlyFiles(['tmp\\test.png']),['tmp\\test.png'])
})
