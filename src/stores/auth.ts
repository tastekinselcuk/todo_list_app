import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, createReauthenticationClient, authSessionStorage, authStorageKey } from '@/lib/supabase'
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
  const accountBusy = ref(false)
  let accountGeneration = 0
  const error = ref<string | null>(null)
  const isAuthenticated = computed(() => !!user.value)
  let authSubscription: { unsubscribe(): void } | undefined
  let authGeneration = 0

  // Initialize auth state
  const initializeAuth = async () => {
    const generation = authGeneration
    isLoading.value = true
    try {
      // A valid cached SDK session restores the client UI. Temporary network
      // failures must not be treated as sign-out; RPC/RLS still validate access.
      const cached = typeof supabase.auth.getSession === 'function' ? await supabase.auth.getSession() : null
      if (generation !== authGeneration) return
      if (cached?.data.session?.user) user.value = mapUser(cached.data.session.user)
      const { data: { user: supabaseUser }, error: sessionError } = await supabase.auth.getUser()
      if (generation !== authGeneration) return
      if (sessionError) {
        if ([401,403].includes(sessionError.status ?? 0) || ['bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(sessionError.code ?? '')) user.value = null
        error.value = sessionError.message
        return
      }
      if (supabaseUser) {
        user.value = mapUser(supabaseUser)
      } else {
        user.value = null
      }
    } catch (err) {
      console.error('Error initializing auth:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Subscribe to auth state changes
  const setupAuthListener = () => {
    authSubscription?.unsubscribe()
    const result = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (user.value && session?.user && user.value.id !== session.user.id)) authGeneration++
      // Another tab can sign in/out while this tab uses its fallback store.
      // Only local storage operations run inside the SDK's event callback.
      if (authStorageKey && authSessionStorage) {
        if (event === 'SIGNED_OUT') authSessionStorage.removeItem(authStorageKey)
        else if (session && event !== 'INITIAL_SESSION') authSessionStorage.setItem(authStorageKey, JSON.stringify(session))
      }
      const supabaseUser = session?.user
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
    user, isLoading, accountBusy, error, isAuthenticated,
    initializeAuth, setupAuthListener, signup, login, logout, sendPasswordReset, changePassword, updateProfile, updateEmail
  }
})
