import { createClient } from '@supabase/supabase-js'
import { createSharedAuthStorage } from './authStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or Anon Key. Check your .env.local file.')
}

export const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
export const authSessionStorage = createSharedAuthStorage(undefined, undefined, undefined, authStorageKey)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: authSessionStorage, storageKey: authStorageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

export type LoginProvider = 'google' | 'github'
// Read public Auth configuration; show only providers enabled on the server.
export async function getLoginProviders():Promise<LoginProvider[]> {
  const response=await fetch(`${supabaseUrl.replace(/\/$/,'')}/auth/v1/settings`,{headers:{apikey:supabaseAnonKey},signal:AbortSignal.timeout(8000)})
  if(!response.ok)throw new Error('PROVIDERS_UNAVAILABLE')
  const settings=await response.json()
  return (['google','github'] as const).filter(provider=>settings.external?.[provider]===true)
}

// Password verification must not replace the application session.
export function createReauthenticationClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { storageKey: `${authStorageKey}-reauth-${crypto.randomUUID()}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
