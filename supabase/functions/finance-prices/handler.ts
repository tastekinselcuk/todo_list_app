export type QuoteProvider = 'frankfurter' | 'coingecko' | 'market'
export interface QuoteRequest { provider: QuoteProvider; instrument: string }
export interface QuoteMetadata { source: string; quality: 'live' | 'reference'; unit: 'g' | 'piece' | 'unit'; basis: 'buy' | 'spot' | 'mid'; fx_at?: string; market_status?:'closed' }
export interface MarketQuote extends QuoteRequest { currency: string; price: number; price_at: string; fetched_at: string; metadata?: QuoteMetadata }
interface Dependencies {
  authenticate(token: string): Promise<boolean>
  cached(currency: string, requests: QuoteRequest[]): Promise<MarketQuote[]>
  save(quotes: MarketQuote[]): Promise<void>
  fetch: typeof fetch
  cryptoKey?: string
  marketKey?: string
  now?: () => number
}
const fx = new Set(['TRY','USD','EUR','GBP','CHF','JPY','CAD','AUD','SAR'])
const coins = new Set(['bitcoin','ethereum','solana','cardano','avalanche-2','ripple','dogecoin','chainlink'])
const metalCodes: Record<string,string> = {XAU:'GRAM_ALTIN_TRY',XAG:'GUMUS_TRY',XAU22:'AYAR22_TRY',GOLD_QUARTER:'CEYREK_YENI_TRY',GOLD_HALF:'YARIM_YENI_TRY',GOLD_FULL:'TAM_YENI_TRY',GOLD_ATA:'ATA_YENI_TRY'}
const spotMetals = new Set(['XAU','XAG','XPT','XPD'])
const metal = new Set([...Object.keys(metalCodes),...spotMetals])
const currencies = new Set(['TRY','USD','EUR','GBP'])
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }
const gramsPerTroyOunce = 31.1034768

// Private positions never leave the app: only server-allowlisted public identifiers and currency.
export function financePricesHandler(deps: Dependencies) {
  const pending = new Map<string, Promise<{quotes: MarketQuote[]; issues: string[]}>>()
  const now = deps.now || Date.now
  const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' })
    try {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
      if (!token || !await deps.authenticate(token)) return response(401, { error: 'AUTH_REQUIRED' })
      const text = await request.text()
      if (text.length > 4096) return response(400, { error: 'INVALID_PRICE_REQUEST' })
      let body
      try { body = JSON.parse(text) } catch { return response(400, { error: 'INVALID_PRICE_REQUEST' }) }
      if (!body || Object.keys(body).some(k => !['currency','instruments'].includes(k)) || !currencies.has(body.currency)
        || !Array.isArray(body.instruments) || body.instruments.length > 32
        || body.instruments.some((q: QuoteRequest) => !q || Object.keys(q).some(k => !['provider','instrument'].includes(k))
          || !(q.provider === 'frankfurter' ? fx.has(q.instrument) : q.provider === 'coingecko' ? coins.has(q.instrument) : q.provider === 'market' && (fx.has(q.instrument) || metal.has(q.instrument))))) {
        return response(400, { error: 'INVALID_PRICE_REQUEST' })
      }
      const requests = [...new Map<string,QuoteRequest>(body.instruments.map((q: QuoteRequest) => [`${q.provider}:${q.instrument}`,q])).values()]
        .sort((a,b) => `${a.provider}:${a.instrument}`.localeCompare(`${b.provider}:${b.instrument}`))
      const key = JSON.stringify([body.currency,requests])
      if (!pending.has(key)) pending.set(key, refresh(body.currency, requests).finally(() => pending.delete(key)))
      return response(200, await pending.get(key))
    } catch { return response(503, { error: 'PRICE_SERVICE_UNAVAILABLE' }) }
  }
  async function refresh(currency: string, requests: QuoteRequest[]) {
    const cached = await deps.cached(currency,requests)
    const fresh = cached.filter(q => {
      const ttl = q.provider==='frankfurter' ? 6*3600_000 : q.provider==='coingecko' ? 5*60_000
        : q.metadata?.source==='hesaplialtin' ? 60_000 : q.metadata?.quality==='reference' ? (fx.has(q.instrument)?6*3600_000:5*60_000) : 60_000
      // Adding a live-data key must immediately upgrade an older reference fallback.
      return !(q.provider==='market' && q.metadata?.quality==='reference' && q.metadata?.source!=='hesaplialtin' && deps.marketKey)
        && now()-Date.parse(q.fetched_at)>=0 && now()-Date.parse(q.fetched_at)<ttl
    })
    const needed = requests.filter(r => !fresh.some(q => q.provider === r.provider && q.instrument === r.instrument))
    const issues: string[] = [], updates: MarketQuote[] = []
    const providerDeadline = AbortSignal.timeout(15_000)
    const validPrice = (price: number, at: number) => Number.isFinite(price) && price > 0 && price <= 1e9 && Number.isFinite(at) && at <= now()+60_000
    const fetchJSON = async (url: string, headers: Record<string,string> = {}) => {
      const res = await deps.fetch(url,{ headers, signal: AbortSignal.any([providerDeadline,AbortSignal.timeout(10_000)]) })
      if (!res.ok) throw Error('PROVIDER_UNAVAILABLE')
      return res.json()
    }
    const stamp = (r: QuoteRequest,price: number,at: number,metadata?:QuoteMetadata) => {
      if (!validPrice(price,at)) throw Error('INVALID_QUOTE')
      updates.push({...r,currency,price,price_at:new Date(at).toISOString(),fetched_at:new Date(now()).toISOString(),...(metadata?{metadata}:{})})
    }
    await Promise.all([
      (async () => {
        const group = needed.filter(r => r.provider === 'frankfurter')
        if (!group.length) return
        try {
          const other = group.filter(r => r.instrument !== currency)
          const rows = other.length ? await fetchJSON(`https://api.frankfurter.dev/v2/rates?base=${currency.toLowerCase()}&quotes=${other.map(r=>r.instrument.toLowerCase()).join(',')}`) : []
          for (const r of group) {
            if (r.instrument === currency) { stamp(r,1,now());continue }
            const row = Array.isArray(rows) && rows.find((q: {quote:string}) => q.quote?.toUpperCase() === r.instrument)
            if (!row || !Number.isFinite(row.rate) || row.rate<=0) {issues.push('FX_INCOMPLETE');continue}
            stamp(r,1/row.rate,Date.parse(`${row.date}T00:00:00Z`))
          }
        } catch { issues.push('FX_UNAVAILABLE') }
      })(),
      (async () => {
        const group = needed.filter(r => r.provider === 'coingecko')
        if (!group.length) return
        if (!deps.cryptoKey) {issues.push('CRYPTO_SETUP_REQUIRED');return}
        try {
          const rows = await fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${group.map(r=>r.instrument).join(',')}&vs_currencies=${currency.toLowerCase()}&include_last_updated_at=true`,{'x-cg-demo-api-key':deps.cryptoKey})
          for (const r of group) {
            const row=rows[r.instrument]
            if(!row || !validPrice(row[currency.toLowerCase()],row.last_updated_at*1000)) {issues.push('CRYPTO_INCOMPLETE');continue}
            stamp(r,row[currency.toLowerCase()],row.last_updated_at*1000)
          }
        } catch {issues.push('CRYPTO_UNAVAILABLE')}
      })(),
      (async () => {
        const group=needed.filter(r=>r.provider==='market')
        if(!group.length)return
        // One request returns the full local FX/metal snapshot; the key never reaches the browser.
        let snapshot: {updatedAt?:string;piyasa?:string;kalemler?:Record<string,{alis:number;satis:number;guncelleme:string;bayat?:boolean}>}|null=null
        if(deps.marketKey) {
          try { snapshot=await fetchJSON('https://hesaplialtin.com/api/v1/public-prices',{'X-API-Key':deps.marketKey}) }
          catch { issues.push('MARKET_UNAVAILABLE') }
        }
        const localQuote=(code:string,basis:'alis'|'satis'='alis')=>{
          const row=snapshot?.kalemler?.[code],price=Number(row?.[basis]),at=Date.parse(row?.guncelleme || '')
          return row && validPrice(price,at) && (snapshot?.piyasa==='durgun' || (!row.bayat && now()-at<=30*60_000)) ? {price,at} : null
        }
        const target=currency==='TRY'?{price:1,at:now()}:localQuote(`${currency}_TRY`,'satis')
        const remaining:QuoteRequest[]=[]
        for(const r of group) {
          if(r.instrument===currency && fx.has(r.instrument)){stamp(r,1,now(),{source:'identity',quality:'live',unit:'unit',basis:'mid'});continue}
          const code=fx.has(r.instrument)?`${r.instrument}_TRY`:metalCodes[r.instrument]
          const row=r.instrument==='TRY'?{price:1,at:now()}:code?localQuote(code):null
          if(row && target) {
            stamp(r,row.price/target.price,Math.min(row.at,target.at),{source:'hesaplialtin',quality:snapshot?.piyasa==='durgun'?'reference':'live',unit:fx.has(r.instrument)?'unit':r.instrument.startsWith('GOLD_')?'piece':'g',basis:'buy',...(snapshot?.piyasa==='durgun'?{market_status:'closed' as const}:{})})
          }else remaining.push(r)
        }
        if(!remaining.length)return
        if(!deps.marketKey && remaining.some(r=>fx.has(r.instrument) || metalCodes[r.instrument]))issues.push('MARKET_SETUP_REQUIRED')
        // Keyless fallback: explicitly labelled daily FX references and spot metal prices.
        const fallbackFx=remaining.filter(r=>fx.has(r.instrument))
        const usd=localQuote('USD_TRY')
        let usdPrice=currency==='USD'?1:usd && target?usd.price/target.price:null
        let usdAt=currency==='USD'?now():usd && target?Math.min(usd.at,target.at):null
        let liveConversion=currency==='USD' || Boolean(usd && target && snapshot?.piyasa!=='durgun')
        const fxSymbols=[...new Set([...fallbackFx.map(r=>r.instrument),...(remaining.some(r=>spotMetals.has(r.instrument)) && usdPrice===null?['USD']:[])])].filter(code=>code!==currency)
        if(fxSymbols.length) {
          try {
            const rows=await fetchJSON(`https://api.frankfurter.dev/v2/rates?base=${currency.toLowerCase()}&quotes=${fxSymbols.map(code=>code.toLowerCase()).join(',')}`)
            for(const symbol of fxSymbols) {
              const row=Array.isArray(rows) && rows.find((q:{quote:string})=>q.quote?.toUpperCase()===symbol)
              const rate=row && Number(row.rate),at=row && Date.parse(`${row.date}T00:00:00Z`)
              if(!validPrice(1/rate,at))continue
              const r=fallbackFx.find(item=>item.instrument===symbol)
              if(r)stamp(r,1/rate,at,{source:'frankfurter',quality:'reference',unit:'unit',basis:'mid'})
              if(symbol==='USD' && usdPrice===null){usdPrice=1/rate;usdAt=at;liveConversion=false}
            }
          }catch{issues.push('FX_UNAVAILABLE')}
        }
        for(const r of remaining.filter(item=>spotMetals.has(item.instrument))) {
          if(usdPrice===null || usdAt===null)continue
          try {
            const row=await fetchJSON(`https://api.gold-api.com/price/${r.instrument}`)
            const at=Date.parse(row.updatedAt)
            if(row.symbol!==r.instrument || row.currency!=='USD' || !validPrice(Number(row.price),at))throw Error('INVALID_QUOTE')
            stamp(r,Number(row.price)/gramsPerTroyOunce*usdPrice,Math.min(at,usdAt),{source:'goldapi',quality:liveConversion?'live':'reference',unit:'g',basis:'spot',...(!liveConversion?{fx_at:new Date(usdAt).toISOString()}:{})})
          }catch{issues.push('METAL_UNAVAILABLE')}
        }
        for(const r of remaining) {
          if(!updates.some(q=>q.provider===r.provider && q.instrument===r.instrument))issues.push('MARKET_INCOMPLETE')
        }
        if(updates.some(q=>q.provider==='market' && q.metadata?.quality==='reference'))issues.push('MARKET_REFERENCE')
      })(),
    ])
    if (updates.length) await deps.save(updates)
    const combined = new Map(cached.map(q => [`${q.provider}:${q.instrument}`,q]))
    updates.forEach(q => combined.set(`${q.provider}:${q.instrument}`,q))
    return {quotes:[...combined.values()],issues:[...new Set(issues)]}
  }
}
