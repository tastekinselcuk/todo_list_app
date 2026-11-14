import fs from 'node:fs'
import crypto from 'node:crypto'
import {migrationFiles} from './migration-contract.mjs'
export function baselineTransaction(){
 const contract=JSON.parse(fs.readFileSync(new URL('../supabase/bootstrap/contract.json',import.meta.url),'utf8'))
 const sql=fs.readFileSync(new URL('../supabase/bootstrap/application.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n')
 if(crypto.createHash('sha256').update(sql).digest('hex')!==contract.sha256)throw Error('Baseline checksum mismatch')
 const files=migrationFiles(),covered=files.filter(file=>file.version<=contract.through)
 if(!covered.some(file=>file.version===contract.through))throw Error('Baseline boundary missing from migration history')
 const registry=files.find(file=>file.version==='202611140010').sql.replace(/^begin;\s*/,'').replace(/commit;\s*$/,'')
 const quote=value=>"'"+value.replace(/'/g,"''")+"'"
 const rows=covered.map(file=>`(${quote(file.version)},${quote(file.name)},array[${quote('-- Represented by application baseline '+contract.sha256)}],${quote(file.sha256)})`).join(',\n')
 return sql.replace(/commit;\s*$/,()=>`${registry}\ninsert into supabase_migrations.schema_migrations(version,name,statements,checksum) values ${rows};\ncommit;\n`)
}
