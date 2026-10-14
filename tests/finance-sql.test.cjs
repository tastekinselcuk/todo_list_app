const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {projectDB}=require('./helpers/project-db.cjs')
const migration=fs.readFileSync('supabase/migrations/202610120005_finance.sql','utf8')
const id='70000000-0000-0000-0000-000000000001',asset='70000000-0000-0000-0000-000000000002'
test('finance preserves exact monthly totals across pages, retries once, enforces optimistic versions and isolates private workspaces',async()=>{
 const f=await projectDB();const {db,wid,gwid,owner,guest,as,rpc}=f
 try {
  await db.exec(migration);await as(owner)
  const mutate=(entity,operation,rid,payload,version=null)=>rpc('select finance_mutate($1,$2,$3,$4,$5::jsonb,$6) as result',[wid,entity,operation,rid,JSON.stringify(payload),version])
  const payload={title:'Market',kind:'expense',category:'Food',amount:12.10,occurred_on:'2026-10-01'}
  await mutate('transaction','create',id,payload);await mutate('transaction','create',id,payload)
  let summary=await rpc("select finance_summary($1,'2026-10-01') as result",[wid])
  assert.equal(Number(summary.expense),12.1);assert.equal(summary.count,1)
  await mutate('transaction','update',id,{amount:12.20},1)
  await assert.rejects(mutate('transaction','update',id,{amount:8},1),/FINANCE_CONFLICT/)
  await assert.rejects(mutate('settings','update',null,{currency:'USD'}),/FINANCE_CURRENCY_LOCKED/)
  await assert.rejects(mutate('transaction','update',id,{user_id:guest},2),/INVALID_FINANCE_INPUT/)
  for(const bad of [{amount:-1},{amount:0},{amount:1e13},{title:''},{kind:'transfer'},{occurred_on:'2026-02-30'}])await assert.rejects(mutate('transaction','update',id,bad,2))
  await as(guest)
  await assert.rejects(rpc("select finance_summary($1,'2026-10-01') as result",[wid]),/FINANCE_ACCESS_DENIED/)
  await assert.rejects(mutate('transaction','delete',id,{},2),/FINANCE_ACCESS_DENIED/)
  assert.equal((await db.query('select * from finance_transactions')).rows.length,0)
  await assert.rejects(db.query('insert into finance_transactions(workspace_id,user_id,title,kind,category,amount,occurred_on) values($1,$2,\'Attack\',\'expense\',\'Test\',1,\'2026-10-01\')',[gwid,guest]),/permission denied/)
  await as(owner,'anon');await assert.rejects(rpc("select finance_summary($1,'2026-10-01') as result",[wid]),/permission denied/)
  await as(owner)
  for(let i=0;i<55;i++)await mutate('transaction','create',`71000000-0000-0000-0000-${String(i).padStart(12,'0')}`,{...payload,amount:.10,title:`Expense ${i}`})
  await mutate('transaction','create','72000000-0000-0000-0000-000000000001',{...payload,kind:'income',amount:100})
  await mutate('transaction','create','72000000-0000-0000-0000-000000000002',{...payload,occurred_on:'2026-09-30',amount:50})
  summary=await rpc("select finance_summary($1,'2026-10-01') as result",[wid])
  assert.equal(summary.count,57);assert.equal(Number(summary.expense),17.7);assert.equal(Number(summary.income),100)
  const combined=await rpc("select finance_load($1,'2026-10-01') as result",[wid])
  assert.equal(combined.summary.count,57);assert.equal(combined.transactions.items.length,50);assert.equal(combined.positions.items.length,0)
  assert.equal(summary.monthly.length,2)
  const first=await rpc("select finance_page($1,'transaction','2026-10-01') as result",[wid])
  assert.equal(first.items.length,50);assert.equal(first.has_more,true)
  const second=await rpc("select finance_page($1,'transaction','2026-10-01',$2,$3) as result",[wid,first.cursor.date,first.cursor.id])
  assert.equal(second.items.length,7);assert.equal(second.has_more,false)
  assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,57)
  await db.exec('reset role');await db.query("insert into workspaces(user_id,name) values($1,'Second workspace')",[owner]);await db.query('update workspaces set archived_at=now() where id=$1',[wid]);await as(owner)
  await assert.rejects(mutate('transaction','delete',id,{},2),/FINANCE_ACCESS_DENIED/)
  assert.equal((await rpc("select finance_summary($1,'2026-10-01') as result",[wid])).count,57)
 } finally {await db.close()}
})

const extended=fs.readFileSync('supabase/migrations/202610130001_finance_recurring_market.sql','utf8')
test('TRY support upgrades the previous instrument constraint and preserves nominal holdings on reruns',async()=>{
 const {db,wid,owner,as,rpc}=await projectDB()
 const tryMigration=fs.readFileSync('supabase/migrations/202610140001_finance_try.sql','utf8')
 try{
  await db.exec(migration);await db.exec(extended.replace("instrument in ('TRY','USD'","instrument in ('USD'"));await as(owner)
  const payload={title:'Turkish lira',kind:'forex',instrument:'TRY',price_source:'market',quantity:1250,buy_price:1,purchased_on:'2026-10-01'}
  const create=()=>rpc("select finance_mutate($1,'position','create',$2,$3::jsonb,null) as result",[wid,asset,JSON.stringify(payload)])
  await assert.rejects(create(),/finance_position_instrument/)
  await db.exec('reset role');await db.exec(tryMigration);await as(owner);await create()
  await db.exec('reset role');await db.exec('set role service_role')
  await db.query('select finance_cache_quotes($1::jsonb)',[JSON.stringify([{provider:'market',instrument:'TRY',currency:'TRY',price:1,price_at:new Date().toISOString(),fetched_at:new Date().toISOString(),metadata:{source:'identity',quality:'live',unit:'unit',basis:'mid'}}])])
  await as(owner)
  let row=(await rpc("select finance_page($1,'position','2026-10-01') as result",[wid])).items[0]
  assert.equal(Number(row.current_value),1250);assert.equal(Number(row.gain),0)
  await db.exec('reset role');await db.exec(tryMigration);await db.exec(extended);await db.exec(tryMigration);await as(owner)
  row=(await rpc("select finance_page($1,'position','2026-10-01') as result",[wid])).items[0]
  assert.equal(row.instrument,'TRY');assert.equal(Number(row.quantity),1250)
 }finally{await db.close()}
})

test('recurring finance catches up once, clamps month ends, preserves historical amounts, and skips paused periods',async()=>{
 const f=await projectDB();const {db,wid,owner,guest,as,rpc}=f
 try{
  await db.exec(migration);await db.exec(extended);await as(owner)
  const today=(await db.query("select current_date::text as day")).rows[0].day,year=Number(today.slice(0,4))+1
  const sid='73000000-0000-0000-0000-000000000001',gap='73000000-0000-0000-0000-000000000002'
  const schedule=(operation,rid,payload,version=null)=>rpc('select finance_schedule_mutate($1,$2,$3,$4::jsonb,$5) as result',[wid,operation,rid,JSON.stringify(payload),version])
  const sync=async through=>{await db.exec('reset role');await db.query('select finance_materialize($1,$2,$3::date)',[wid,owner,through]);await as(owner)}
  const payload={title:'Rent',kind:'income',amount:100,cadence:'monthly',starts_on:`${year}-01-31`,timezone:'UTC'}
  await schedule('create',sid,payload);await schedule('create',sid,payload)
  await assert.rejects(rpc("select finance_mutate($1,'settings','update',null,'{\"currency\":\"USD\"}',null) as result",[wid]),/FINANCE_CURRENCY_LOCKED/)
  await sync(`${year}-04-30`);await sync(`${year}-04-30`)
  let rows=(await db.query('select occurred_on::text as day,amount,version,id from finance_transactions where recurring_id=$1 order by occurred_on',[sid])).rows
  const febDays=year%4===0 && (year%100!==0 || year%400===0)?29:28
  assert.deepEqual(rows.map(row=>row.day),[`${year}-01-31`,`${year}-02-${febDays}`,`${year}-03-31`,`${year}-04-30`])
  const report=await rpc('select finance_load($1,$2::date) as result',[wid,`${year}-03-01`])
  assert.equal(report.transactions.items.length,1);assert.equal(Number(report.summary.income),100);assert.equal(report.summary.schedules[0].next_on,`${year}-05-31`)
  await schedule('update',sid,{amount:200},1)
  await assert.rejects(schedule('update',sid,{amount:500},1),/FINANCE_CONFLICT/)
  await schedule('pause',sid,{},2);await sync(`${year}-05-31`)
  assert.equal((await db.query('select count(*)::int as n from finance_transactions where recurring_id=$1',[sid])).rows[0].n,4)
  await schedule('resume',sid,{},3);await sync(`${year}-05-31`)
  rows=(await db.query('select occurred_on::text as day,amount,version,id from finance_transactions where recurring_id=$1 order by occurred_on',[sid])).rows
  assert.deepEqual(rows.map(row=>Number(row.amount)),[100,100,100,100,200])
  await rpc("select finance_mutate($1,'transaction','delete',$2,'{}',1) as result",[wid,rows.at(-1).id])
  await sync(`${year}-05-31`)
  assert.equal((await db.query('select count(*)::int as n from finance_transactions where recurring_id=$1',[sid])).rows[0].n,4,'a deleted occurrence must not regenerate')
  await schedule('delete',sid,{},4);await sync(`${year+1}-12-31`)
  assert.equal((await db.query('select count(*)::int as n from finance_transactions where recurring_id=$1',[sid])).rows[0].n,4,'removing a schedule preserves its historical entries')
  await schedule('create',gap,{...payload,starts_on:`${year}-01-01`})
  await db.exec('reset role');await db.query("update finance_recurring set starts_on=$2::date,next_index=1,active=false where id=$1",[gap,`${year-11}-01-01`]);await as(owner)
  await schedule('resume',gap,{},1)
  const g=(await db.query('select * from finance_recurring where id=$1',[gap])).rows[0]
  assert.ok(g.next_index>100,'resume advances past paused dates rather than retroactively charging them')
  assert.equal((await db.query('select count(*)::int as n from finance_transactions where recurring_id=$1',[gap])).rows[0].n,0)
  await assert.rejects(db.query('select finance_materialize($1,$2,null)',[wid,owner]),/permission denied/)
  await assert.rejects(db.query('select finance_rollover_recurring()'),/permission denied/)
  await as(guest);assert.equal((await db.query('select * from finance_recurring')).rows.length,0)
  await assert.rejects(schedule('pause',gap,{},2),/FINANCE_ACCESS_DENIED/)
  await as(owner,'anon');await assert.rejects(schedule('pause',gap,{},2),/permission denied/)
  await db.exec('reset role');await db.query("insert into workspaces(user_id,name) values($1,'Active reserve')",[owner]);await db.query('update workspaces set archived_at=now() where id=$1',[wid]);await as(owner)
  await assert.rejects(schedule('pause',gap,{},2),/FINANCE_ACCESS_DENIED/)
  await sync(`${year+5}-12-31`)
  assert.equal((await db.query('select count(*)::int as n from finance_transactions where recurring_id=$1',[gap])).rows[0].n,0,'archived workspaces stop recurring writes')
  await db.exec('reset role');await db.exec(extended)
  assert.equal((await db.query('select count(*)::int as n from finance_transactions where recurring_id=$1',[sid])).rows[0].n,4)
 }finally{await db.close()}
})
test('minimal cash entry needs no description/category, automatic metal prices carry units and source, and old FX records migrate safely',async()=>{
 const f=await projectDB();const {db,wid,owner,as,rpc}=f
 try{
  await db.exec(migration);await as(owner)
  await rpc("select finance_mutate($1,'position','create',$2,$3::jsonb,null) as result",[wid,asset,JSON.stringify({title:'Dollar savings',kind:'forex',instrument:'USD',price_source:'frankfurter',quantity:100,buy_price:40,purchased_on:'2026-01-01',manual_price:null})])
  await db.exec('reset role');await db.exec(extended);await as(owner)
  const minimal={kind:'expense',amount:12.25,occurred_on:'2026-10-01'}
  const args=[wid,id,JSON.stringify(minimal)]
  const cash=await rpc("select finance_mutate($1,'transaction','create',$2,$3::jsonb,null) as result",args)
  await rpc("select finance_mutate($1,'transaction','create',$2,$3::jsonb,null) as result",args)
  assert.equal(cash.title,'expense');assert.equal(cash.category,'Uncategorized')
  assert.equal((await db.query('select count(*)::int as n from finance_transactions')).rows[0].n,1)
  const mid='74000000-0000-0000-0000-000000000001'
  await rpc("select finance_mutate($1,'position','create',$2,$3::jsonb,null) as result",[wid,mid,JSON.stringify({title:'Gold',kind:'metal',instrument:'XAU',price_source:'market',quantity:2,buy_price:6500,purchased_on:'2026-01-01',manual_price:null})])
  await assert.rejects(rpc("select finance_mutate($1,'position','update',$2,'{\"instrument\":\"https://evil.invalid\"}',1) as result",[wid,mid]))
  await db.exec('reset role');await db.exec('set role service_role')
  const quote={provider:'market',instrument:'XAU',currency:'TRY',price:6600,price_at:new Date().toISOString(),fetched_at:new Date().toISOString(),metadata:{source:'hesaplialtin',quality:'live',unit:'g',basis:'buy'}}
  await rpc('select finance_cache_quotes($1::jsonb) as result',[JSON.stringify([quote])])
  await rpc('select finance_cache_quotes($1::jsonb) as result',[JSON.stringify([{...quote,price:5000,price_at:'2020-01-01T00:00:00Z',metadata:{...quote.metadata,quality:'reference'}}])])
  await as(owner)
  const page=await rpc("select finance_page($1,'position','2026-10-01') as result",[wid]),gold=page.items.find(row=>row.id===mid),forex=page.items.find(row=>row.id===asset)
  assert.equal(forex.price_source,'market')
  assert.equal(Number(gold.current_value),13200);assert.equal(Number(gold.gain),200)
  assert.equal(gold.quote_info.unit,'g');assert.equal(gold.quote_info.source,'hesaplialtin');assert.equal(gold.quote_info.quality,'live')
  const summary=await rpc("select finance_summary($1,'2026-10-01') as result",[wid])
  assert.equal(summary.quote_requests.filter(row=>row.provider==='market').length,2);assert.equal(Number(summary.expense),12.25)
  await db.exec('reset role');await db.exec(extended);await as(owner)
  assert.equal(Number((await rpc("select finance_page($1,'position','2026-10-01') as result",[wid])).items.find(row=>row.id===mid).price),6600)
 }finally{await db.close()}
})

test('portfolio distinguishes missing/zero/manual/API prices, ignores older provider updates and preserves currency on migration rerun',async()=>{
 const f=await projectDB();const {db,wid,owner,as,rpc}=f
 try {
  await db.exec(migration);await as(owner)
  const mutate=(operation,rid,payload,version=null)=>rpc('select finance_mutate($1,\'position\',$2,$3,$4::jsonb,$5) as result',[wid,operation,rid,JSON.stringify(payload),version])
  const common={title:'Savings',kind:'forex',instrument:'USD',price_source:'frankfurter',quantity:100,buy_price:30,purchased_on:'2026-01-01',manual_price:null}
  await mutate('create',asset,common)
  await mutate('create',id,{...common,title:'Manual',kind:'other',instrument:'',price_source:'manual',quantity:2,buy_price:100,manual_price:0})
  let summary=await rpc("select finance_summary($1,'2026-10-01') as result",[wid])
  assert.equal(summary.portfolio.missing,1);assert.equal(Number(summary.portfolio.value),0);assert.equal(Number(summary.portfolio.gain),-200)
  assert.equal(Number(summary.portfolio.cost),3200);assert.equal(summary.count,0,'an investment must not create a budget expense')
  await assert.rejects(rpc('select finance_cache_quotes($1::jsonb) as result',[JSON.stringify([])]),/permission denied/)
  await db.exec('reset role');await db.exec('set role service_role')
  const quotes=[{provider:'frankfurter',instrument:'USD',currency:'TRY',price:40,price_at:new Date().toISOString(),fetched_at:new Date().toISOString()}]
  await rpc('select finance_cache_quotes($1::jsonb) as result',[JSON.stringify(quotes)])
  await rpc('select finance_cache_quotes($1::jsonb) as result',[JSON.stringify([{...quotes[0],price:5,price_at:'2020-01-01T00:00:00Z'}])])
  await as(owner)
  summary=await rpc("select finance_summary($1,'2026-10-01') as result",[wid])
  assert.equal(Number(summary.portfolio.value),4000);assert.equal(Number(summary.portfolio.gain),800);assert.equal(summary.portfolio.missing,0)
  const page=await rpc("select finance_page($1,'position','2026-10-01') as result",[wid])
  assert.equal(Number(page.items.find(row=>row.id===asset).gain_percent),33.33)
  await mutate('update',id,{manual_price:125},1)
  assert.equal(Number((await rpc("select finance_summary($1,'2026-10-01') as result",[wid])).portfolio.gain),1050)
  await mutate('delete',id,{},2);await mutate('delete',asset,{},1)
  await rpc("select finance_mutate($1,'settings','update',null,'{\"currency\":\"EUR\"}',null) as result",[wid])
  await db.exec('reset role');await db.query("update workspaces set active_modules=array['detailed'] where id=$1",[wid]);await db.exec(migration);await as(owner)
  assert.equal((await rpc("select finance_summary($1,'2026-10-01') as result",[wid])).currency,'EUR')
  assert.equal((await db.query('select active_modules from workspaces where id=$1',[wid])).rows[0].active_modules.join(','),'detailed')
 } finally {await db.close()}
})
