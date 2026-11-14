const {test}=require('node:test'),assert=require('node:assert/strict')
test('production verification rejects stale releases and HTML fallback responses',async()=>{
 const {checkProduction}=await import('../scripts/check-production.mjs')
 const response=async revision=>Response.json({revision,builtAt:'2026-11-14T12:00:00Z'})
 assert.equal((await checkProduction('https://app.test','expected',()=>response('expected'))).revision,'expected')
 await assert.rejects(checkProduction('https://app.test','expected',()=>response('old')),/not deployed/)
 await assert.rejects(checkProduction('https://app.test','expected',async()=>new Response('<html>')),/unavailable/)
 await assert.rejects(checkProduction('https://secret:password@app.test','expected',()=>response('expected')),/without credentials/)
})
