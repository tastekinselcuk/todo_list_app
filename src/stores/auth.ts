import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, createReauthenticationClient, authSessionStorage, getLoginProviders, type LoginProvider } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { validAvatarTone, type AvatarTone } from '@/lib/accountProfile'

export interface AuthUser {
  id: string
  email: string
  createdAt: string
  displayName: string
  avatarTone: AvatarTone
  emailVerified: boolean
  pendingEmail: string
  lastSignInAt: string
}

function mapUser(value: User): AuthUser {
  return { id: value.id, email: value.email || '', createdAt: value.created_at,
    displayName: String(value.user_metadata?.full_name || value.user_metadata?.name || ''),
    avatarTone: validAvatarTone(value.user_metadata?.avatar_tone), emailVerified: Boolean(value.email_confirmed_at),
    pendingEmail: value.new_email || '', lastSignInAt: value.last_sign_in_at || '' }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoading = ref(false)
  const loginProviders=ref<LoginProvider[]>([]),oauthProvider=ref<LoginProvider|null>(null)
  let providerRequest:Promise<void>|undefined,providersLoaded=false
  function loadLoginProviders(){
    if(providerRequest)return providerRequest
    if(providersLoaded)return Promise.resolve()
    providerRequest=Promise.resolve().then(async()=>{
      try{loginProviders.value=await getLoginProviders();providersLoaded=true}catch{/* Email login remains available if discovery fails. */}
    }).finally(()=>{providerRequest=undefined})
    return providerRequest
  }
  function resetOAuth(){if(oauthProvider.value){oauthProvider.value=null;isLoading.value=false}}
  function consumeOAuthError(){
    const url=new URL(window.location.href),hash=new URLSearchParams(url.hash.slice(1))
    const code=url.searchParams.get('error')||hash.get('error')
    if(!code)return ''
    for(const key of ['error','error_code','error_description']){url.searchParams.delete(key);hash.delete(key)}
    url.hash=hash.toString();window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
    return code==='access_denied'?'oauthCancelled':'oauthFailed'
  }
  const accountBusy = ref(false)
  let accountGeneration = 0
  const error = ref<string | null>(null)
  const isAuthenticated = computed(() => !!user.value)
  let authSubscription: { unsubscribe(): void } | undefined
  let authGeneration = 0
  let authEventRevision = 0
  let initialization: Promise<void> | undefined
  const sessionPersistent = ref(true)
  function updatePersistence() { sessionPersistent.value = authSessionStorage?.persistent ?? true }

  // Initialize auth state
  const initializeAuth = () => {
    if (initialization) return initialization
    initialization = restoreAuth().finally(() => { initialization = undefined })
    return initialization
  }
  const restoreAuth = async () => {
    const generation = authGeneration
    void loadLoginProviders()
    try {
      // A valid cached SDK session restores the client UI. Temporary network
      // failures must not be treated as sign-out; RPC/RLS still validate access.
      const cached = typeof supabase.auth.getSession === 'function' ? await supabase.auth.getSession() : null
      if (generation !== authGeneration) return
      updatePersistence()
      if (cached?.data.session?.user) user.value = mapUser(cached.data.session.user)
      // No remote validation call is necessary on the signed-out login screen.
      if (cached && !cached.data.session) { user.value = null; return }
      const revision = authEventRevision
      const { data: { user: supabaseUser }, error: sessionError } = await supabase.auth.getUser()
      if (generation !== authGeneration || revision !== authEventRevision) return
      if (sessionError) {
        if ([401,403].includes(sessionError.status ?? 0) || ['bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(sessionError.code ?? '')) {
          user.value = null
          // Invalidate the SDK session as well as the view. Otherwise a later
          // visibility event could restore this definitively rejected account.
          try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* The rejected UI remains signed out. */ }
        }
        error.value = sessionError.message
        return
      }
      if (supabaseUser) {
        user.value = mapUser(supabaseUser)
      } else {
        user.value = null
      }
    } catch (err) {
      error.value = 'AUTH_INITIALIZATION_FAILED'
    }
  }

  // Subscribe to auth state changes
  const setupAuthListener = () => {
    authSubscription?.unsubscribe()
    const result = supabase.auth.onAuthStateChange((event, session) => {
      authEventRevision++
      if (event === 'SIGNED_OUT' || (user.value && session?.user && user.value.id !== session.user.id)) authGeneration++
      // Shared storage is already committed by the SDK. Rewriting a received
      // broadcast here could resurrect a signed-out session or stale token.
      updatePersistence()
      const supabaseUser = session?.user
      if(event==='SIGNED_IN'||event==='SIGNED_OUT')resetOAuth()
      if (supabaseUser) {
        user.value = mapUser(supabaseUser)
      } else {
        user.value = null
      }
    })
    const subscription = result?.data?.subscription
    authSubscription = subscription
    return () => { subscription?.unsubscribe(); if (authSubscription === subscription) authSubscription = undefined }
  }

  // Sign up
  const signup = async (email: string, password: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: supabaseError } = await supabase.auth.signUp({ email, password })
      if (supabaseError) throw supabaseError
      
      return { success: true, persistent: authSessionStorage?.persistent ?? true, message: 'Signup successful! Check your email for confirmation.' }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  // Sign in
  const login = async (email: string, password: string) => {
    const generation = ++authGeneration
    isLoading.value = true
    error.value = null
    try {
      const { data, error: supabaseError } = await supabase.auth.signInWithPassword({ email, password })
      if (supabaseError) throw supabaseError
      if (generation !== authGeneration) return { success: false, message: 'SESSION_CHANGED' }
      
      user.value = data.user ? mapUser(data.user) : null
      return { success: true, persistent: authSessionStorage?.persistent ?? true }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  async function loginWithProvider(provider:LoginProvider){
    if(isLoading.value||oauthProvider.value)return {success:false,message:'OAUTH_BUSY'}
    if(!['google','github'].includes(provider))return {success:false,message:'OAUTH_UNAVAILABLE'}
    await loadLoginProviders()
    if(!loginProviders.value.includes(provider))return {success:false,message:'OAUTH_UNAVAILABLE'}
    if(isLoading.value||oauthProvider.value)return {success:false,message:'OAUTH_BUSY'}
    const generation=++authGeneration
    isLoading.value=true;oauthProvider.value=provider;error.value=null
    let redirecting=false
    try{
      const {error:failure}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:window.location.origin+window.location.pathname}})
      if(failure)throw failure
      if(generation!==authGeneration)return {success:false,message:'SESSION_CHANGED'}
      redirecting=true
      return {success:true}
    }catch(failure){error.value=(failure as Error).message;return {success:false,message:'OAUTH_FAILED'}}
    finally{if(!redirecting)resetOAuth()}
  }

  // Sign out
  const logout = async (scope: 'local' | 'global' = 'local') => {
    if (accountBusy.value) return { success: false }
    accountGeneration++
    authGeneration++
    accountBusy.value = true
    error.value = null
    try {
      const { error: supabaseError } = await supabase.auth.signOut({ scope })
      if (supabaseError) throw supabaseError
      user.value = null
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false }
    } finally {
      accountBusy.value = false
    }
  }

  // Reset password
  const sendPasswordReset = async (email: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: supabaseError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (supabaseError) throw supabaseError
      return { success: true, message: 'Password reset email sent. Check your email.' }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  async function updateAccount(operation: (id: string) => Promise<User | null>) {
    if (accountBusy.value || !user.value) return { success: false, message: 'ACCOUNT_BUSY' }
    const id = user.value.id, generation = ++accountGeneration
    accountBusy.value = true
    try {
      const updated = await operation(id)
      if (user.value?.id !== id || generation !== accountGeneration || (updated && updated.id !== id)) return { success: false, message: 'SESSION_CHANGED' }
      if (updated) user.value = mapUser(updated)
      return { success: true, message: '' }
    } catch (err) {
      const failure = err as { code?: string; message?: string }
      const codes: Record<string, string> = { weak_password: 'PASSWORD_POLICY', email_exists: 'EMAIL_TAKEN', user_already_exists: 'EMAIL_TAKEN', over_email_send_rate_limit: 'RATE_LIMIT', over_request_rate_limit: 'RATE_LIMIT', same_password: 'PASSWORD_UNCHANGED', reauthentication_not_valid: 'INVALID_CODE' }
      return { success: false, message: codes[failure.code || ''] || failure.message || 'SAVE_FAILED' }
    } finally { if (generation === accountGeneration) accountBusy.value = false }
  }
  async function verifyPassword(password: string, id: string) {
    const email = user.value?.email
    if (!email || !password || user.value?.id !== id) throw new Error('CURRENT_PASSWORD_REQUIRED')
    const client = createReauthenticationClient()
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error) { if (error.code === 'invalid_credentials') throw new Error('CURRENT_PASSWORD_INCORRECT'); throw error }
      if (data.user?.id !== id) throw new Error('CURRENT_PASSWORD_INCORRECT')
      if (user.value?.id !== id) throw new Error('SESSION_CHANGED')
    } finally {
      try { await client.auth.signOut({ scope: 'local' }) } catch { /* No persistent session. */ }
    }
  }
  const updateProfile = (displayName: string, avatarTone: AvatarTone) => updateAccount(async () => {
    if (!displayName.trim() || displayName.trim().length > 80) throw new Error('INVALID_NAME')
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim(), avatar_tone: validAvatarTone(avatarTone) } })
    if (error) throw error
    return data.user
  })
  const updateEmail = (email: string, password: string) => updateAccount(async id => {
    const value = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value === user.value?.email.toLowerCase()) throw new Error('INVALID_EMAIL')
    await verifyPassword(password, id)
    if (user.value?.id !== id) throw new Error('SESSION_CHANGED')
    const { data, error } = await supabase.auth.updateUser({ email: value }, { emailRedirectTo: window.location.origin })
    if (error) throw error
    return data.user
  })
  const changePassword = (newPassword: string, currentPassword: string, nonce?: string) => updateAccount(async id => {
    if (newPassword.length < 8) throw new Error('PASSWORD_TOO_SHORT')
    if (newPassword === currentPassword) throw new Error('PASSWORD_UNCHANGED')
    await verifyPassword(currentPassword, id)
    if (user.value?.id !== id) throw new Error('SESSION_CHANGED')
    const { data, error } = await supabase.auth.updateUser({ password: newPassword, ...(nonce ? { nonce } : {}) })
    if (error?.code === 'reauthentication_needed') {
      const confirmation = await supabase.auth.reauthenticate()
      if (confirmation.error) throw confirmation.error
      throw new Error('REAUTHENTICATION_REQUIRED')
    }
    if (error) throw error
    return data.user
  })

  return {
    user, isLoading, accountBusy, error, isAuthenticated, sessionPersistent,
    initializeAuth, setupAuthListener, signup, login, logout, sendPasswordReset, changePassword, updateProfile, updateEmail,
    loginProviders,oauthProvider,loadLoginProviders,loginWithProvider,resetOAuth,consumeOAuthError
  }
})
