import { supabase } from './supabase'

export interface AuthUser {
  id: string
  email: string
  createdAt: string
}

export interface AuthSession {
  user: AuthUser | null
  isLoading: boolean
  error: string | null
}

/**
 * Sign up with email and password
 */
export const signUp = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })

    if (error) throw error

    return {
      success: true,
      user: data.user ? {
        id: data.user.id,
        email: data.user.email || '',
        createdAt: data.user.created_at
      } : null,
      message: 'Signup successful! Check your email for confirmation.'
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message
    }
  }
}

/**
 * Sign in with email and password
 */
export const signIn = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) throw error

    return {
      success: true,
      user: data.user ? {
        id: data.user.id,
        email: data.user.email || '',
        createdAt: data.user.created_at
      } : null,
      session: data.session
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message
    }
  }
}

/**
 * Sign out current user
 */
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message
    }
  }
}

/**
 * Get current authenticated user
 */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return {
      id: user.id,
      email: user.email || '',
      createdAt: user.created_at
    }
  } catch (err) {
    console.error('Error getting current user:', err)
    return null
  }
}

/**
 * Get current session
 */
export const getSession = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  } catch (err) {
    console.error('Error getting session:', err)
    return null
  }
}

/**
 * Subscribe to auth state changes
 */
export const onAuthStateChange = (callback: (user: AuthUser | null) => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      const user = session?.user
      if (user) {
        callback({
          id: user.id,
          email: user.email || '',
          createdAt: user.created_at
        })
      } else {
        callback(null)
      }
    }
  )

  return subscription
}

/**
 * Reset password with email
 */
export const resetPassword = async (email: string) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (error) throw error

    return {
      success: true,
      message: 'Password reset email sent. Check your email.'
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message
    }
  }
}

/**
 * Update password
 */
export const updatePassword = async (password: string) => {
  try {
    const { error } = await supabase.auth.updateUser({
      password
    })

    if (error) throw error

    return {
      success: true,
      message: 'Password updated successfully!'
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message
    }
  }
}
