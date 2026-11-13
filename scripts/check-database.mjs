import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

export function collectRpcNames(directory) {
  const names = new Set()
  function visitFile(filename) {
    let content = fs.readFileSync(filename, 'utf8')
    if (filename.endsWith('.vue')) {
      content = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n')
    }
    const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true)
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'rpc' && node.arguments[0]
        && ts.isStringLiteralLike(node.arguments[0])) names.add(node.arguments[0].text)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  function visitDirectory(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name)
      if (entry.isDirectory()) visitDirectory(filename)
      else if (/\.(ts|vue)$/.test(entry.name)) visitFile(filename)
    }
  }
  visitDirectory(directory)
  // These calls select the RPC name dynamically in the existing stores.
  for (const name of ['finance_query', 'finance_page', 'finance_category_mutate',
    'finance_budget_set', 'analytics_summary', 'analytics_report']) names.add(name)
  return [...names].sort()
}

async function checkDatabase() {
  const environment = { ...process.env }
  if (fs.existsSync('.env.local')) {
    for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
      if (match && !environment[match[1]]) environment[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  const url = environment.VITE_SUPABASE_URL
  const key = environment.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Deployment requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  const required = collectRpcNames('src')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.rpc('application_release_ready', { required_rpc: required }, { get: true })
    .abortSignal(AbortSignal.timeout(20000))
  if (error || data !== true) throw new Error('Database release check failed. Apply and verify the required SQL migrations before deployment.')
  console.log(`Database release check passed for ${required.length} RPC names and critical schema permissions.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/check-database.mjs')) {
  checkDatabase().catch(error => { console.error(error.message); process.exitCode = 1 })
}
