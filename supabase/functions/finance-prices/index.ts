import { financePricesHandler, type MarketQuote } from './handler.ts'

// Use Deno's native HTTP client: this function needs no npm dependencies to deploy.
function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing function configuration: ${name}`)
  return value
}
const base = required('SUPABASE_URL')
const anon = required('SUPABASE_ANON_KEY')
const service = required('SUPABASE_SERVICE_ROLE_KEY')
async function adminJSON(path: string, options: RequestInit = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(8_000),
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('PRICE_CACHE_UNAVAILABLE')
  return response.status === 204 ? null : response.json()
}

Deno.serve(financePricesHandler({
  async authenticate(token) {
    const response = await fetch(new URL('/auth/v1/user', base), {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (response.status === 401 || response.status === 403) return false
    if (!response.ok) throw new Error('AUTH_SERVICE_UNAVAILABLE')
    const user = await response.json()
    return typeof user?.id === 'string' && user.id.length > 0
  },
  async cached(currency,requests) {
    if (!requests.length) return []
    const query = new URLSearchParams({
      select: 'provider,instrument,currency,price,price_at,fetched_at,metadata',
      currency: `eq.${currency}`,
      instrument: `in.(${[...new Set(requests.map(q=>q.instrument))].join(',')})`,
    })
    const data = await adminJSON(`/rest/v1/finance_market_quotes?${query}`)
    if (!Array.isArray(data)) throw new Error('INVALID_PRICE_CACHE')
    return (data as MarketQuote[]).map(q=>({...q,price:Number(q.price)}))
      .filter(q=>requests.some(r=>r.provider===q.provider&&r.instrument===q.instrument))
  },
  async save(quotes) {
    await adminJSON('/rest/v1/rpc/finance_cache_quotes', {
      method: 'POST', body: JSON.stringify({ items: quotes }),
    })
  },
  fetch,
  cryptoKey:Deno.env.get('COINGECKO_DEMO_API_KEY'),
  marketKey:Deno.env.get('HESAPLI_ALTIN_API_KEY'),
}))
