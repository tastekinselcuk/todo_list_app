const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {projectDB}=require('./helpers/project-db.cjs')
const upgrade=fs.readFileSync('supabase/migrations/202611010001_finance_budgets.sql','utf8')
const cid='81000000-0000-0000-0000-000000000001',tid='82000000-0000-0000-0000-000000000001'
async function fixture(beforeUpgrade){
 const f=await projectDB()
 for(const name of ['202610120005_finance','202610130001_finance_recurring_market','202610140001_finance_try'])await f.db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
 if(beforeUpgrade){await f.as(f.owner);await beforeUpgrade(f);await f.db.exec('reset role')}
 await f.db.exec(upgrade);await f.as(f.owner)
 f.category=(id,name)=>f.rpc("select finance_category_mutate($1,'create',$2,$3::jsonb,null) result",[f.wid,id,JSON.stringify({name})])
 f.summary=month=>f.rpc('select finance_summary($1,$2::date) result',[f.wid,month])
 f.budget=(month,amount,scope,version)=>f.rpc('select finance_budget_set($1,$2,$3::date,$4,$5,$6) result',[f.wid,cid,month,amount,scope,version])
 f.entry=(id,payload,version=null)=>f.rpc('select finance_mutate($1,\'transaction\',$2,$3,$4::jsonb,$5) result',[f.wid,version?'update':'create',id,JSON.stringify(payload),version])
 return f
}

test('upgrading existing records preserves money and imports categories without assigning uncategorized entries',async()=>{
 const f=await fixture(async({rpc,wid})=>{
  for(const[id,category,amount]of [[tid,'Food',12.34],[cid,'Uncategorized',7]])await rpc("select finance_mutate($1,'transaction','create',$2,$3::jsonb,null) result",[wid,id,JSON.stringify({title:'Existing',kind:'expense',amount,category,occurred_on:'2026-10-02'})])
 })
 try{
  const s=await f.summary('2026-10-01')
  assert.equal(s.expense,19.34);assert.equal(s.count,2);assert.equal(s.uncategorized_expense,7)
  assert.equal(s.budget_categories.length,1);assert.equal(s.budget_categories[0].name,'Food');assert.equal(s.budget_categories[0].spent,12.34);assert.equal(s.budget_categories[0].budget,null)
  const page=await f.rpc("select finance_query($1,'2026-10-01') result",[f.wid])
  assert.equal(page.items.find(row=>row.id===tid).category_id,s.budget_categories[0].id)
  assert.equal(page.items.find(row=>row.id===cid).category_id,null)
 }finally{await f.db.close()}
})
test('monthly limits distinguish zero/unlimited, preserve history and reject cross-workspace writes',async()=>{
 const f=await fixture(),{db,as,owner,guest,wid,rpc}=f
 try{
  await f.category(cid,'Food');await f.category(cid,'Food')
  await f.budget('2026-10-01',1000,'forward',1)
  await f.budget('2026-11-01',1500,'month',2)
  assert.equal((await f.summary('2026-10-01')).budget_categories[0].budget,1000)
  assert.equal((await f.summary('2026-11-01')).budget_categories[0].budget,1500)
  assert.equal((await f.summary('2026-12-01')).budget_categories[0].budget,1000)
  await f.budget('2026-12-01',0,'forward',3)
  assert.equal((await f.summary('2027-01-01')).budget_categories[0].budget,0)
  await f.budget('2027-01-01',null,'month',4)
  assert.equal((await f.summary('2027-01-01')).budget_categories[0].budget,null)
  assert.equal((await f.summary('2027-02-01')).budget_categories[0].budget,0)
  await assert.rejects(f.budget('2027-02-01',5,'month',1),/FINANCE_CONFLICT/)
  for(const amount of [-1,1e13,1.001])await assert.rejects(f.budget('2027-02-01',amount,'month',5),/INVALID_FINANCE_INPUT/)
  await assert.rejects(f.budget('2027-02-03',5,'month',5),/INVALID_FINANCE_INPUT/)
  await assert.rejects(rpc("select finance_mutate($1,'settings','update',null,'{\"currency\":\"USD\"}',null) result",[wid]),/FINANCE_CURRENCY_LOCKED/)
  await as(guest)
  for(const action of [()=>f.summary('2026-10-01'),()=>f.category(cid,'Attack'),()=>f.budget('2026-10-01',20,'month',5),()=>rpc("select finance_query($1,'2026-10-01') result",[wid])])await assert.rejects(action(),/FINANCE_ACCESS_DENIED/)
  assert.equal((await db.query('select * from finance_categories')).rows.length,0)
  assert.equal((await db.query('select * from finance_budget_limits')).rows.length,0)
  await assert.rejects(rpc("select finance_summary_before_budgets($1,'2026-10-01') result",[wid]),/permission denied/)
  await as(owner,'anon');await assert.rejects(f.summary('2026-10-01'),/permission denied/)
  await db.exec('reset role');await db.exec(upgrade);await as(owner)
  assert.equal((await f.summary('2026-11-01')).budget_categories[0].budget,1500)
 }finally{await db.close()}
})
test('budget spend and filter totals cover every page, follow edits and retain archived category history',async()=>{
 const f=await fixture(),{db,rpc,wid,as,owner,guest,gwid}=f
 try{
  await f.category(cid,'Food');await f.budget('2026-10-01',5,'month',1)
  const payload={title:'Snack',kind:'expense',amount:.1,occurred_on:'2026-10-15',category_id:cid}
  for(let i=1;i<=55;i++)await f.entry(`82000000-0000-0000-0000-${String(i).padStart(12,'0')}`,payload)
  await f.entry('83000000-0000-0000-0000-000000000001',{...payload,category_id:null,amount:10})
  await f.entry('83000000-0000-0000-0000-000000000002',{...payload,kind:'income',amount:100})
  let s=await f.summary('2026-10-01')
  assert.equal(s.expense,15.5);assert.equal(s.uncategorized_expense,10);assert.equal(s.budget_categories[0].spent,5.5)
  const query=(filters,date=null,id=null)=>rpc("select finance_query($1,'2026-10-01',$2::jsonb,$3::date,$4::uuid) result",[wid,JSON.stringify(filters),date,id])
  const filters={category:cid,kind:'expense',search:'snack',recurring:'no'}
  let page=await query(filters)
  assert.equal(page.items.length,50);assert.equal(page.totals.count,55);assert.equal(page.totals.expense,5.5)
  const next=await query(filters,page.cursor.date,page.cursor.id)
  assert.equal(next.items.length,5);assert.equal(next.has_more,false);assert.equal(next.totals.expense,5.5)
  assert.equal((await query({category:'uncategorized'})).totals.expense,10)
  assert.equal((await query({search:'%'})).totals.count,0,'search treats wildcards literally')
  await f.entry(tid,{amount:2,occurred_on:'2026-11-01'},1)
  assert.equal((await f.summary('2026-10-01')).budget_categories[0].spent,5.4)
  assert.equal((await f.summary('2026-11-01')).budget_categories[0].spent,2)
  await rpc("select finance_category_mutate($1,'update',$2,'{\"name\":\"Groceries\",\"archived\":true}',1) result",[wid,cid])
  await db.exec('reset role');await db.exec(upgrade);await as(owner)
  assert.equal((await f.summary('2026-10-01')).budget_categories.length,1,'rerunning after a rename must not recreate legacy labels')
  assert.equal((await query(filters)).items[0].category,'Groceries')
  await assert.rejects(f.entry('84000000-0000-0000-0000-000000000001',payload),/INVALID_FINANCE_CATEGORY/)
  await f.entry(tid,{amount:3},2)
  await rpc("select finance_mutate($1,'transaction','delete',$2,'{}',3) result",[wid,tid])
  assert.equal((await f.summary('2026-11-01')).budget_categories[0].spent,0)
  await as(guest);const other='85000000-0000-0000-0000-000000000001'
  await rpc("select finance_category_mutate($1,'create',$2,'{\"name\":\"Private\"}',null) result",[gwid,other])
  await as(owner);await assert.rejects(f.entry(tid,{...payload,category_id:other}),/INVALID_FINANCE_CATEGORY/)
 }finally{await db.close()}
})
test('scheduled entries inherit categories once and category changes affect only future occurrences',async()=>{
 const f=await fixture(),{db,as,owner,rpc,wid}=f
 try{
  await f.category(cid,'Food');const other='86000000-0000-0000-0000-000000000001';await f.category(other,'Car')
  const year=Number((await db.query('select current_date::text as day')).rows[0].day.slice(0,4))+1
  const schedule=(payload,version=null)=>rpc('select finance_schedule_mutate($1,$2,$3,$4::jsonb,$5) result',[wid,version?'update':'create',tid,JSON.stringify(payload),version])
  await schedule({title:'Delivery',kind:'expense',amount:25,cadence:'monthly',starts_on:`${year}-01-31`,timezone:'UTC',category_id:cid})
  const materialize=async day=>{await db.exec('reset role');await db.query('select finance_materialize($1,$2,$3::date)',[wid,owner,day]);await as(owner)}
  await materialize(`${year}-03-01`);await materialize(`${year}-03-01`)
  assert.equal((await f.summary(`${year}-02-01`)).budget_categories.find(c=>c.id===cid).spent,25)
  await schedule({category_id:other},1);await materialize(`${year}-03-31`)
  assert.equal((await f.summary(`${year}-02-01`)).budget_categories.find(c=>c.id===cid).spent,25)
  assert.equal((await f.summary(`${year}-03-01`)).budget_categories.find(c=>c.id===other).spent,25)
  assert.equal((await db.query('select count(*)::int n from finance_transactions')).rows[0].n,3)
 }finally{await db.close()}
})
