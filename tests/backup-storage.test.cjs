const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')
test('Storage backup preserves nested objects with opaque local filenames and verifies their contents',async()=>{
 const {backupStorage}=await import('../scripts/backup-storage.mjs'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'pomodolist-storage-test-'))
 try{
  const content=Buffer.from('Example file'),visited=[]
  const client={storage:{listBuckets:async()=>({data:[{id:'bucket'}]}),from:()=>({list:async prefix=>({data:prefix?[{id:'file',name:'../unsafe.txt'}]:[{id:null,name:'folder'}]}),download:async name=>{visited.push(name);return {data:new Blob([content],{type:'text/plain'})}}})}}
  assert.equal(await backupStorage(client,directory),1);assert.deepEqual(visited,['folder/../unsafe.txt'])
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8')),record=manifest.records[0]
  assert.match(record.filename,/^[a-f0-9]{64}\.bin$/)
  assert.equal(record.sha256,crypto.createHash('sha256').update(content).digest('hex'))
  assert.deepEqual(await fs.readFile(path.join(directory,record.filename)),content)
 }finally{
  assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('pomodolist-storage-test-'))
  await fs.rm(directory,{recursive:true,force:true})
 }
})
