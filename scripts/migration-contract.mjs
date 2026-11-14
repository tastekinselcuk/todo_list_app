import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
// This boundary covers the migrations inspected and applied during this rollout.
// It is not a claim that older manually managed SQL has a verified history.
export const trackingStart='202611130001'
export function migrationFiles(directory='supabase/migrations'){
 return fs.readdirSync(directory).filter(name=>/^\d{12,14}_[a-z0-9_]+\.sql$/.test(name)&&name.split('_')[0]>=trackingStart).sort().map(name=>{
  const sql=fs.readFileSync(path.join(directory,name),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')
  return {name,version:name.split('_')[0],sha256:crypto.createHash('sha256').update(sql).digest('hex'),sql}
 })
}
export function migrationTransaction(file){
 if(!/^\s*(?:--[^\n]*(?:\n|$)\s*)*begin\s*;/i.test(file.sql)||!/\bcommit;\s*$/i.test(file.sql))throw new Error('Tracked migrations require an explicit outer BEGIN/COMMIT transaction')
 const quote=value=>"'"+value.replace(/'/g,"''")+"'"
 const statement=`insert into supabase_migrations.schema_migrations(version,name,statements,checksum) values(${quote(file.version)},${quote(file.name)},array[${quote(file.sql)}],${quote(file.sha256)});\ncommit;`
 return file.sql.replace(/\bcommit;\s*$/i,()=>statement)
}
