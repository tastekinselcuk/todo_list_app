import type { InjectionKey } from 'vue'
export const openFinanceAnalysisKey: InjectionKey<() => void> = Symbol('open-finance-analysis')
export type FinanceCurrency = 'TRY' | 'USD' | 'EUR' | 'GBP'
export type FinanceEntity = 'transaction' | 'position'
export interface FinanceTransaction { id:string;title:string;kind:'income'|'expense';category:string;amount:number;occurred_on:string;version:number;recurring_id?:string|null }
export interface FinanceSchedule { id:string;title:string;kind:'income'|'expense';amount:number;cadence:'weekly'|'monthly'|'yearly';starts_on:string;timezone:string;next_on:string;active:boolean;version:number }
export interface FinancePosition { id:string;title:string;kind:string;instrument:string;price_source:string;quantity:number;buy_price:number;purchased_on:string;manual_price:number|null;version:number;price:number|null;price_at:string|null;stale:boolean;cost:number;current_value:number|null;gain:number|null;gain_percent:number|null;quote_info?:{source?:string;quality?:string;unit?:string;basis?:string;fx_at?:string;market_status?:string} }
export interface FinanceSummary {
  currency:FinanceCurrency;income:number;expense:number;count:number;locked_currency:boolean;
  monthly:{day:string;income:number;expense:number}[];categories:{category:string;amount:number}[];
  portfolio:{count:number;cost:number;value:number|null;priced_cost:number;gain:number|null;missing:number;stale:number};
  schedules?:FinanceSchedule[];
  allocation:{kind:string;amount:number}[];quote_requests:{provider:'frankfurter'|'coingecko'|'market';instrument:string}[];
}
export const financeCurrencies = ['TRY','USD','EUR','GBP'] as const
export const forexInstruments = ['USD','EUR','GBP','CHF','JPY','CAD','AUD','SAR'] as const
export const cryptoInstruments = [
  {value:'bitcoin',label:'Bitcoin · BTC'},{value:'ethereum',label:'Ethereum · ETH'},
  {value:'solana',label:'Solana · SOL'},{value:'cardano',label:'Cardano · ADA'},
  {value:'avalanche-2',label:'Avalanche · AVAX'},{value:'ripple',label:'XRP'},
  {value:'dogecoin',label:'Dogecoin · DOGE'},{value:'chainlink',label:'Chainlink · LINK'},
]
export type InvestmentCategory = 'metal'|'forex'|'tl'|'crypto'
export const investmentCategories:InvestmentCategory[] = ['metal','forex','tl','crypto']
export interface InvestmentInstrument { value:string;instrument:string;provider:'market'|'coingecko';kind:'forex'|'metal'|'crypto';category:InvestmentCategory;unit:'g'|'piece'|'unit';label?:string;labelKey?:string }
export const investmentInstruments:InvestmentInstrument[] = [
  ...[['XAU','goldGram','g'],['XAG','silverGram','g'],['XPT','platinumGram','g'],['XPD','palladiumGram','g'],['XAU22','gold22Gram','g'],['GOLD_QUARTER','goldQuarter','piece'],['GOLD_HALF','goldHalf','piece'],['GOLD_FULL','goldFull','piece'],['GOLD_ATA','goldAta','piece']].map(([instrument,labelKey,unit])=>({value:`market:${instrument}`,instrument,labelKey,unit:unit as 'g'|'piece',provider:'market' as const,kind:'metal' as const,category:'metal' as const})),
  ...forexInstruments.map(instrument=>({value:`market:${instrument}`,instrument,label:instrument,unit:'unit' as const,provider:'market' as const,kind:'forex' as const,category:'forex' as const})),
  {value:'market:TRY',instrument:'TRY',labelKey:'turkishLira',unit:'unit',provider:'market',kind:'forex',category:'tl'},
  ...cryptoInstruments.map(coin=>({value:`coingecko:${coin.value}`,instrument:coin.value,label:coin.label,unit:'unit' as const,provider:'coingecko' as const,kind:'crypto' as const,category:'crypto' as const})),
]
export function investmentInstrument(row:Pick<FinancePosition,'kind'|'instrument'>) {return investmentInstruments.find(item=>item.kind===row.kind && item.instrument===row.instrument)}
export const quoteSources:Record<string,{name:string;url:string}>={hesaplialtin:{name:'Hesaplı Altın',url:'https://hesaplialtin.com/'},goldapi:{name:'Gold API',url:'https://gold-api.com/'},frankfurter:{name:'Frankfurter',url:'https://frankfurter.dev/'},coingecko:{name:'CoinGecko',url:'https://www.coingecko.com/'}}
export function localFinanceDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
export function validFinanceDate(value:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'1900-01-01' || value>'2100-12-31') return false
  const date=new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value
}
// Accept decimal comma/dot and correctly grouped Turkish/English amounts, never currency symbols.
export function parseFinanceNumber(input:string, decimals=2):number|null {
  let text=input.trim()
  if (text.includes(',') && text.includes('.')) {
    const commaDecimal=text.lastIndexOf(',')>text.lastIndexOf('.')
    const pattern=commaDecimal?/^\d{1,3}(?:\.\d{3})+,\d+$/:/^\d{1,3}(?:,\d{3})+\.\d+$/
    if(!pattern.test(text))return null
    text=commaDecimal?text.replace(/\./g,'').replace(',','.'):text.replace(/,/g,'')
  } else text=text.replace(',','.')
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(text)) return null
  const value=Number(text)
  return Number.isFinite(value) && value<=1e12 ? value : null
}
export function financeMonths(month:string) {
  if(!validFinanceDate(`${month}-01`))return []
  const [year,m]=month.split('-').map(Number)
  return Array.from({length:12},(_,index)=>{const date=new Date(Date.UTC(year,m-12+index,1));return date.toISOString().slice(0,10)})
}
export function money(value:number|null|undefined,currency:string,locale:string) {
  if(value == null || !Number.isFinite(Number(value)))return '—'
  return new Intl.NumberFormat(locale,{style:'currency',currency,maximumFractionDigits:2}).format(Number(value))
}
export function financeError(error:unknown) {
  const failure=error as {message?:string;code?:string}
  if(['PGRST202','42883','42P01'].includes(failure?.code || ''))return 'setup'
  if(failure?.message?.includes('FINANCE_CONFLICT'))return 'conflict'
  if(failure?.message?.includes('FINANCE_CURRENCY_LOCKED'))return 'currencyLocked'
  return 'failed'
}
