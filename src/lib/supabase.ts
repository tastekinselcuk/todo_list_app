import { createClient } from '@supabase/supabase-js'
import { createAuthStorage } from './authStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or Anon Key. Check your .env.local file.')
}

export const authSessionStorage = createAuthStorage()
export const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: authSessionStorage, storageKey: authStorageKey, persistSession: true, autoRefreshToken: true },
})

// Password verification must not replace the application session.
export function createReauthenticationClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
