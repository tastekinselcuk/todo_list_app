const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const owner='10000000-0000-0000-0000-000000000001', guest='20000000-0000-0000-0000-000000000002'
async function projectDB(extra=[]) {
  const db=new PGlite()
  // Report tests request UTC dates; the database must use the same date boundary.
  await db.exec("set time zone 'UTC'")
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text);
    insert into auth.users values('${owner}','owner@test.invalid'),('${guest}','guest@test.invalid');
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema public,auth to authenticated,anon,service_role;
    create table quick_notes(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),content text,completed boolean default false,created_at timestamptz default now());
    create table todos(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),category_id uuid,title text,completed boolean default false,created_at timestamptz default now());
    create table categories(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),name text,created_at timestamptz default now(),unique(created_by,name));
    create table code_snippets(id uuid primary key default gen_random_uuid(),created_by uuid references auth.users(id),code text,created_at timestamptz default now());
    create table activity_items(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),external_id text,created_at timestamptz default now());
    create table plans(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,period text,period_date date,completed boolean default false,reason text default '',history jsonb default '[]',created_at timestamptz default now());
    create table learning_subjects(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,topics jsonb default '[]',created_at timestamptz default now());
    create table flashcard_decks(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,cards jsonb default '[]',created_at timestamptz default now());
    create table workout_routines(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,exercises jsonb default '[]',created_at timestamptz default now());
    create table periodic_tasks(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),title text,notes text,category text,frequency text,days_of_week int[],day_of_month int,month_of_year int,interval_days int,anchor_date date,completed_date date,reminder_time time,notify_browser boolean default true,notify_email boolean default false,last_notified_at timestamptz,created_at timestamptz default now());
    grant all on quick_notes,todos,categories,code_snippets,activity_items,plans,learning_subjects,flashcard_decks,workout_routines,periodic_tasks to authenticated;
    insert into quick_notes(created_by,content) values('${owner}','fixture'),('${guest}','fixture');`)
  for (const name of ['workspaces','tab_sharing','tab_sharing_modules','tab_sharing_permissions','analytics',...extra])
    await db.exec(fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8'))
  const workspaces=(await db.query('select * from workspaces')).rows
  const wid=workspaces.find(w=>w.user_id===owner).id, gwid=workspaces.find(w=>w.user_id===guest).id
  async function as(id,role='authenticated') {
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${role}`)
  }
  const rpc=async(sql,args=[])=>(await db.query(sql,args)).rows[0].result
  return {db,owner,guest,wid,gwid,as,rpc}
}
module.exports={projectDB,owner,guest}
