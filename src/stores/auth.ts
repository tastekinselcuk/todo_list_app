import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export interface AuthUser {
  id: string
  email: string
  createdAt: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isAuthenticated = computed(() => !!user.value)

  // Initialize auth state
  const initializeAuth = async () => {
    isLoading.value = true
    try {
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) {
        user.value = { id: supabaseUser.id, email: supabaseUser.email || '', createdAt: supabaseUser.created_at }
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
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const supabaseUser = session?.user
      if (supabaseUser) {
        user.value = { id: supabaseUser.id, email: supabaseUser.email || '', createdAt: supabaseUser.created_at }
      } else {
        user.value = null
      }
    })
  }

  // Sign up
  const signup = async (email: string, password: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: supabaseError } = await supabase.auth.signUp({ email, password })
      if (supabaseError) throw supabaseError
      
      return { success: true, message: 'Signup successful! Check your email for confirmation.' }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  // Sign in
  const login = async (email: string, password: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: supabaseError } = await supabase.auth.signInWithPassword({ email, password })
      if (supabaseError) throw supabaseError
      
      user.value = data.user ? { id: data.user.id, email: data.user.email || '', createdAt: data.user.created_at } : null
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  // Sign out
  const logout = async () => {
    isLoading.value = true
    error.value = null
    try {
      const { error: supabaseError } = await supabase.auth.signOut()
      if (supabaseError) throw supabaseError
      user.value = null
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false }
    } finally {
      isLoading.value = false
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

  // Update password
  const changePassword = async (newPassword: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: supabaseError } = await supabase.auth.updateUser({ password: newPassword })
      if (supabaseError) throw supabaseError
      return { success: true, message: 'Password updated successfully!' }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  return {
    user, isLoading, error, isAuthenticated,
    initializeAuth, setupAuthListener, signup, login, logout, sendPasswordReset, changePassword
  }
})