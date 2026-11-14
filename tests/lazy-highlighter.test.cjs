const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const exportsHelper={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/lazyHighlighter.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsHelper,Map})
test('language loading is shared across simultaneous previews; unknown or failed languages remain escaped',async()=>{
 const registered=new Set(),calls=[];let finish
 const engine={getLanguage:name=>registered.has(name),registerLanguage:name=>registered.add(name),highlight:code=>({value:'highlighted:'+code})}
 const highlight=exportsHelper.createLazyHighlighter(engine,{javascript:()=>{calls.push('load');return new Promise(resolve=>{finish=resolve})},bad:async()=>{throw Error('offline')}})
 const first=highlight('one','javascript'),second=highlight('two','javascript')
 assert.equal(calls.length,1);finish(()=>({}));assert.equal(await first,'highlighted:one');assert.equal(await second,'highlighted:two')
 assert.equal(await highlight('three','javascript'),'highlighted:three');assert.equal(calls.length,1)
 assert.equal(await highlight('<script>"x"</script>','unknown'),'&lt;script&gt;&quot;x&quot;&lt;/script&gt;')
 assert.equal(await highlight('<img>','bad'),'&lt;img&gt;')
 assert.equal(await highlight('<b>','plaintext'),'&lt;b&gt;')
})
