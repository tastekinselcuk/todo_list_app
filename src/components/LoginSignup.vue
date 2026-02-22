<template>
  <div class="min-h-screen bg-gradient-to-br from-background to-muted text-foreground flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo / Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-lg mb-4">
          <CheckCircle2 class="h-8 w-8 text-white" />
        </div>
        <h1 class="text-3xl font-bold text-foreground">TodoFlow</h1>
        <p class="text-muted-foreground text-sm mt-2">Manage your tasks, secure your notes</p>
      </div>

      <!-- Card -->
      <div class="bg-card text-card-foreground rounded-lg shadow-sm border border-border p-8">
        <!-- Tab -->
        <div class="flex gap-4 mb-6 border-b">
          <button
            @click="isLogin = true"
            :class="[
              'pb-3 px-4 font-medium transition-colors border-b-2',
              isLogin
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            ]"
          >
            Sign In
          </button>
          <button
            @click="isLogin = false"
            :class="[
              'pb-3 px-4 font-medium transition-colors border-b-2',
              !isLogin
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            ]"
          >
            Sign Up
          </button>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Email -->
          <div class="space-y-2">
            <label for="email" class="text-sm font-medium text-foreground">Email Address</label>
            <input
              id="email"
              v-model="formData.email"
              type="email"
              placeholder="you@example.com"
              class="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors text-sm"
              required
            />
          </div>

          <!-- Password -->
          <div class="space-y-2">
            <label for="password" class="text-sm font-medium text-foreground">Password</label>
            <div class="relative">
              <input
                id="password"
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••"
                class="w-full px-4 py-2 pr-10 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors text-sm"
                required
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Eye v-if="showPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Confirm Password (for signup) -->
          <div v-if="!isLogin" class="space-y-2">
            <label for="confirmPassword" class="text-sm font-medium text-foreground">Confirm Password</label>
            <div class="relative">
              <input
                id="confirmPassword"
                v-model="formData.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="••••••••"
                class="w-full px-4 py-2 pr-10 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors text-sm"
                required
              />
              <button
                type="button"
                @click="showConfirmPassword = !showConfirmPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Eye v-if="showConfirmPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="error" class="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm flex items-start gap-3">
            <AlertCircle class="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span>{{ error }}</span>
          </div>

          <!-- Success Message -->
          <div v-if="successMessage" class="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-lg text-sm flex items-start gap-3">
            <CheckCircle2 class="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span>{{ successMessage }}</span>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full bg-primary text-primary-foreground py-2 px-4 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Loader2 v-if="isLoading" class="h-4 w-4 animate-spin" />
            <span>{{ isLogin ? 'Sign In' : 'Create Account' }}</span>
          </button>
        </form>

        <!-- Forgot Password Link -->
        <div v-if="isLogin" class="text-center mt-6">
          <button
            type="button"
            @click="showForgotPassword = true"
            class="text-sm text-primary hover:text-primary/80 font-medium"
          >
            Forgot your password?
          </button>
        </div>
      </div>

      <!-- Terms -->
      <p class="text-center text-xs text-muted-foreground mt-6">
        By signing up, you agree to our<br />
        <a href="#" class="text-primary hover:underline">Terms of Service</a> and
        <a href="#" class="text-primary hover:underline">Privacy Policy</a>
      </p>
    </div>

    <!-- Forgot Password Dialog -->
    <dialog
      ref="forgotPasswordDialog"
      class="p-6 rounded-lg shadow-lg bg-card text-card-foreground w-full max-w-sm border border-border backdrop:bg-black/55"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold">Reset Password</h2>
        <button
          @click="closeForgotPassword"
          class="p-1 hover:bg-accent rounded"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <form @submit.prevent="handlePasswordReset" class="space-y-4">
        <div class="space-y-2">
          <label for="reset-email" class="text-sm font-medium text-foreground">Email Address</label>
          <input
            id="reset-email"
            v-model="resetEmail"
            type="email"
            placeholder="you@example.com"
            class="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors text-sm"
            required
          />
        </div>

        <p class="text-sm text-muted-foreground">
          We'll send you an email with a link to reset your password.
        </p>

        <div v-if="resetError" class="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {{ resetError }}
        </div>

        <div v-if="resetSuccess" class="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-lg text-sm">
          {{ resetSuccess }}
        </div>

        <div class="flex gap-2 pt-4 border-t">
          <button
            type="button"
            @click="closeForgotPassword"
            class="flex-1 px-4 py-2 rounded-lg border border-input text-foreground hover:bg-accent font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isLoading"
            class="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Loader2 v-if="isLoading" class="h-4 w-4 animate-spin" />
            <span>Send Reset Link</span>
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-vue-next'

const authStore = useAuthStore()

const isLogin = ref(true)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const showForgotPassword = ref(false)
const forgotPasswordDialog = ref<HTMLDialogElement | null>(null)

const formData = ref({
  email: '',
  password: '',
  confirmPassword: ''
})

const resetEmail = ref('')
const error = ref('')
const successMessage = ref('')
const resetError = ref('')
const resetSuccess = ref('')

const isLoading = computed(() => authStore.isLoading)

const handleSubmit = async () => {
  error.value = ''
  successMessage.value = ''

  // Validation
  if (!formData.value.email || !formData.value.password) {
    error.value = 'Please fill in all fields'
    return
  }

  if (!isLogin.value) {
    if (formData.value.password !== formData.value.confirmPassword) {
      error.value = 'Passwords do not match'
      return
    }
    if (formData.value.password.length < 6) {
      error.value = 'Password must be at least 6 characters'
      return
    }
  }

  // Submit
  if (isLogin.value) {
    const result = await authStore.login(formData.value.email, formData.value.password)
    if (!result.success) {
      error.value = result.message || 'Login failed'
    }
  } else {
    const result = await authStore.signup(formData.value.email, formData.value.password)
    if (result.success) {
      successMessage.value = result.message || 'Signup successful! Please check your email.'
      formData.value = { email: '', password: '', confirmPassword: '' }
      // Switch to login after 2 seconds
      setTimeout(() => {
        isLogin.value = true
      }, 2000)
    } else {
      error.value = result.message || 'Signup failed'
    }
  }
}

const handlePasswordReset = async () => {
  resetError.value = ''
  resetSuccess.value = ''

  if (!resetEmail.value) {
    resetError.value = 'Please enter your email address'
    return
  }

  const result = await authStore.sendPasswordReset(resetEmail.value)
  if (result.success) {
    resetSuccess.value = result.message || 'Check your email for password reset link'
    resetEmail.value = ''
    setTimeout(() => {
      closeForgotPassword()
    }, 3000)
  } else {
    resetError.value = result.message || 'Failed to send reset email'
  }
}

const closeForgotPassword = () => {
  showForgotPassword.value = false
  forgotPasswordDialog.value?.close()
  resetError.value = ''
  resetSuccess.value = ''
  resetEmail.value = ''
}

// Dialog watcher
watch(showForgotPassword, (show) => {
  if (show) {
    forgotPasswordDialog.value?.showModal()
  } else {
    forgotPasswordDialog.value?.close()
  }
})
</script>

<style scoped>
dialog {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
