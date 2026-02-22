import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getSession,
  onAuthStateChange,
  resetPassword,
  updatePassword,
  type AuthUser
} from '@/lib/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isAuthenticated = computed(() => !!user.value)

  // Initialize auth state
  const initializeAuth = async () => {
    isLoading.value = true
    try {
      const currentUser = await getCurrentUser()
      user.value = currentUser
    } catch (err) {
      console.error('Error initializing auth:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Subscribe to auth state changes
  const setupAuthListener = () => {
    onAuthStateChange((authUser) => {
      user.value = authUser
    })
  }

  // Sign up
  const signup = async (email: string, password: string) => {
    isLoading.value = true
    error.value = null
    try {
      const result = await signUp(email, password)
      if (!result.success) {
        error.value = result.error || 'Signup failed'
        return { success: false, message: error.value }
      }
      return { success: true, message: result.message }
    } finally {
      isLoading.value = false
    }
  }

  // Sign in
  const login = async (email: string, password: string) => {
    isLoading.value = true
    error.value = null
    try {
      const result = await signIn(email, password)
      if (!result.success) {
        error.value = result.error || 'Login failed'
        return { success: false, message: error.value }
      }
      user.value = result.user
      return { success: true }
    } finally {
      isLoading.value = false
    }
  }

  // Sign out
  const logout = async () => {
    isLoading.value = true
    error.value = null
    try {
      const result = await signOut()
      if (!result.success) {
        error.value = result.error || 'Logout failed'
        return { success: false }
      }
      user.value = null
      return { success: true }
    } finally {
      isLoading.value = false
    }
  }

  // Reset password
  const sendPasswordReset = async (email: string) => {
    isLoading.value = true
    error.value = null
    try {
      const result = await resetPassword(email)
      if (!result.success) {
        error.value = result.error || 'Failed to send reset email'
        return { success: false, message: error.value }
      }
      return { success: true, message: result.message }
    } finally {
      isLoading.value = false
    }
  }

  // Update password
  const changePassword = async (newPassword: string) => {
    isLoading.value = true
    error.value = null
    try {
      const result = await updatePassword(newPassword)
      if (!result.success) {
        error.value = result.error || 'Failed to update password'
        return { success: false, message: error.value }
      }
      return { success: true, message: result.message }
    } finally {
      isLoading.value = false
    }
  }

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    initializeAuth,
    setupAuthListener,
    signup,
    login,
    logout,
    sendPasswordReset,
    changePassword
  }
})
