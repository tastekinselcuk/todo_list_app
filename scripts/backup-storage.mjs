import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {createClient} from '@supabase/supabase-js'

export async function backupStorage(client,directory){
  await fs.mkdir(directory,{recursive:true})
  const {data:buckets,error}=await client.storage.listBuckets()
  if(error)throw new Error('BACKUP_STORAGE_LIST_FAILED')
  const records=[]
  for(const bucket of buckets){
    const prefixes=['']
    for(let index=0;index<prefixes.length;index++){
      const prefix=prefixes[index]
      for(let offset=0;;offset+=100){
        const {data:items,error}=await client.storage.from(bucket.id).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}})
        if(error)throw new Error('BACKUP_STORAGE_LIST_FAILED')
        for(const item of items){
          const remotePath=prefix?prefix+'/'+item.name:item.name
          if(!item.id){prefixes.push(remotePath);continue}
          const {data,error}=await client.storage.from(bucket.id).download(remotePath)
          if(error||!data)throw new Error('BACKUP_STORAGE_DOWNLOAD_FAILED')
          const bytes=Buffer.from(await data.arrayBuffer())
          const filename=crypto.createHash('sha256').update(bucket.id+'\0'+remotePath).digest('hex')+'.bin'
          const sha256=crypto.createHash('sha256').update(bytes).digest('hex')
          await fs.writeFile(path.join(directory,filename),bytes)
          if(crypto.createHash('sha256').update(await fs.readFile(path.join(directory,filename))).digest('hex')!==sha256)throw new Error('BACKUP_STORAGE_HASH_MISMATCH')
          records.push({bucket:bucket.id,path:remotePath,filename,sha256,bytes:bytes.length,contentType:data.type})
        }
        if(items.length<100)break
      }
    }
  }
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({buckets,records},null,2))
  return records.length
}
async function main(){
 const [project,directory]=process.argv.slice(2)
 if(!/^[a-z0-9]{16,24}$/.test(project||'')||!directory)throw new Error('BACKUP_ARGUMENTS_REQUIRED')
 const command='npx.cmd --yes supabase@3.0.0 projects api-keys --remote='+project+' --reveal --output json'
 const result=spawnSync('cmd.exe',['/d','/s','/c',command],{encoding:'utf8',windowsHide:true})
 if(result.status!==0)throw new Error('BACKUP_STORAGE_AUTH_REQUIRED')
 const key=JSON.parse(result.stdout).find(item=>item.name==='service_role')?.api_key
 if(!key)throw new Error('BACKUP_STORAGE_AUTH_REQUIRED')
 const client=createClient('https://'+project+'.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}})
 const count=await backupStorage(client,path.resolve(directory))
 console.log(JSON.stringify({storageObjects:count}))
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('scripts/backup-storage.mjs'))main().catch(()=>{console.error('BACKUP_STORAGE_FAILED');process.exitCode=1})
