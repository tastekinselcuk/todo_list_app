<template>
  <main class="auth-shell">
    <div class="auth-layout">
      <header class="auth-brand"><span class="auth-mark"><Layers :size="20" :stroke-width="1.6" /></span><h1>{{ t('auth.title') }}</h1><p>{{ t('auth.subtitle') }}</p></header>
      <section class="auth-card" :aria-label="t(isLogin?'auth.signIn':'auth.signUp')">
        <div class="auth-tabs" role="group" :aria-label="t('auth.accessMode')">
          <button type="button" :aria-pressed="isLogin" :class="{active:isLogin}" :disabled="isLoading" @click="isLogin=true">{{ t('auth.signIn') }}</button>
          <button type="button" :aria-pressed="!isLogin" :class="{active:!isLogin}" :disabled="isLoading" @click="isLogin=false">{{ t('auth.signUp') }}</button>
        </div>
        <form class="auth-form" @submit.prevent="handleSubmit">
          <label class="auth-field" for="email"><span>{{ t('auth.email') }}</span><input id="email" v-model="formData.email" type="email" autocomplete="username" inputmode="email" :disabled="isLoading" :placeholder="t('auth.emailPlaceholder')" :aria-invalid="Boolean(error)" required /></label>
          <label class="auth-field" for="password"><span>{{ t('auth.password') }}</span><span class="auth-password"><input id="password" v-model="formData.password" :type="showPassword?'text':'password'" :autocomplete="isLogin?'current-password':'new-password'" :minlength="isLogin?undefined:6" :disabled="isLoading" :placeholder="t('auth.passwordPlaceholder')" required /><button type="button" :disabled="isLoading" :aria-pressed="showPassword" :aria-label="t(showPassword?'auth.hidePassword':'auth.showPassword')" @click="showPassword=!showPassword"><EyeOff v-if="showPassword" :size="16" /><Eye v-else :size="16" /></button></span></label>
          <label v-if="!isLogin" class="auth-field" for="confirmPassword"><span>{{ t('auth.confirmPassword') }}</span><span class="auth-password"><input id="confirmPassword" v-model="formData.confirmPassword" :type="showConfirmPassword?'text':'password'" autocomplete="new-password" minlength="6" :disabled="isLoading" :placeholder="t('auth.passwordPlaceholder')" required /><button type="button" :disabled="isLoading" :aria-pressed="showConfirmPassword" :aria-label="t(showConfirmPassword?'auth.hidePassword':'auth.showPassword')" @click="showConfirmPassword=!showConfirmPassword"><EyeOff v-if="showConfirmPassword" :size="16" /><Eye v-else :size="16" /></button></span></label>
          <p v-if="error" class="auth-message is-error" role="alert"><AlertCircle :size="15" /><span>{{ error }}</span></p>
          <p v-if="successMessage" class="auth-message" role="status"><CheckCircle2 :size="15" /><span>{{ successMessage }}</span></p>
          <button type="submit" class="auth-submit" :disabled="isLoading"><Loader2 v-if="isLoading&&!authStore.oauthProvider" :size="15" class="animate-spin motion-reduce:animate-none" />{{ t(isLogin?'auth.signIn':'auth.signUp') }}<ArrowRight v-if="!isLoading" :size="15" /></button>
        </form>
        <button v-if="isLogin" type="button" class="auth-forgot" :disabled="isLoading" @click="showForgotPassword=true">{{ t('auth.forgotPassword') }}</button>
        <div v-if="providers.length" class="auth-social">
          <span class="auth-divider">{{ t('auth.orContinue') }}</span>
          <div class="auth-providers"><button v-for="provider in providers" :key="provider" type="button" class="auth-provider" :disabled="isLoading" @click="handleOAuth(provider)">
            <Loader2 v-if="authStore.oauthProvider===provider" :size="17" class="animate-spin motion-reduce:animate-none" />
            <svg v-else-if="provider==='google'" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 20.5H24v8.1h11.3c-.5 2.6-2 4.8-4.2 6.3v5.2h6.8c4-3.7 6.3-9.1 6.3-15.6 0-1.4-.1-2.7-.4-4z"/><path fill="#34A853" d="M24 44c5.6 0 10.3-1.8 13.8-5l-6.8-5.2c-1.9 1.3-4.3 2-7 2-5.4 0-10-3.6-11.6-8.5h-7v5.4C8.8 39.3 15.9 44 24 44z"/><path fill="#FBBC05" d="M12.4 27.3a12 12 0 0 1 0-7.6v-5.4h-7a20 20 0 0 0 0 18.4z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4C15.9 4 8.8 8.7 5.4 15.5l7 5.4C14 15.5 18.6 11.9 24 11.9z"/></svg>
            <Github v-else :size="18" />{{ provider==='google'?'Google':'GitHub' }}
          </button></div>
        </div>
      </section>
      <p class="auth-caption">{{ t('auth.privateSpace') }}</p>
    </div>
    <dialog ref="forgotPasswordDialog" class="auth-reset" :aria-label="t('auth.resetPasswordTitle')" @cancel.prevent="closeForgotPassword" @close="closeForgotPassword">
      <header><h2>{{ t('auth.resetPasswordTitle') }}</h2><button type="button" :disabled="isLoading" :aria-label="t('common.close')" @click="closeForgotPassword"><X :size="17" /></button></header>
      <p class="auth-reset-hint">{{ t('auth.resetPasswordDesc') }}</p>
      <form class="auth-form" @submit.prevent="handlePasswordReset">
        <label class="auth-field" for="reset-email"><span>{{ t('auth.email') }}</span><input id="reset-email" v-model="resetEmail" type="email" autocomplete="email" :disabled="isLoading" :placeholder="t('auth.emailPlaceholder')" required /></label>
        <p v-if="resetError" class="auth-message is-error" role="alert">{{ resetError }}</p><p v-if="resetSuccess" class="auth-message" role="status">{{ resetSuccess }}</p>
        <button type="submit" class="auth-submit" :disabled="isLoading"><Loader2 v-if="isLoading" :size="15" class="animate-spin" />{{ t('auth.sendResetLink') }}</button>
      </form>
    </dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import type { LoginProvider } from '@/lib/supabase'
import { ArrowRight, Eye, EyeOff, Github, Layers, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
const authStore=useAuthStore(),uiStore=useUIStore(),{t}=useI18n()
const isLogin=ref(true),showPassword=ref(false),showConfirmPassword=ref(false),showForgotPassword=ref(false)
const forgotPasswordDialog=ref<HTMLDialogElement|null>(null)
const formData=ref({email:'',password:'',confirmPassword:''})
const resetEmail=ref(''),error=ref(''),successMessage=ref(''),resetError=ref(''),resetSuccess=ref('')
const isLoading=computed(()=>authStore.isLoading),providers=computed(()=>authStore.loginProviders||[])
async function handleSubmit(){
  if(isLoading.value)return
  error.value='';successMessage.value=''
  const email=formData.value.email.trim()
  if(!email||!formData.value.password){error.value=t('auth.errors.fillFields');return}
  if(!isLogin.value&&formData.value.password!==formData.value.confirmPassword){error.value=t('auth.errors.passwordsNotMatch');return}
  if(!isLogin.value&&formData.value.password.length<6){error.value=t('auth.errors.passwordLength');return}
  const result=await (isLogin.value?authStore.login(email,formData.value.password):authStore.signup(email,formData.value.password))
  if(!result.success){error.value=result.message||t(isLogin.value?'auth.errors.loginFailed':'auth.errors.signupFailed');return}
  if(result.persistent===false)uiStore.addToast(t('auth.sessionTemporary'),'warning')
  if(!isLogin.value){successMessage.value=t('auth.success.signup');formData.value={email,password:'',confirmPassword:''};isLogin.value=true}
}
async function handleOAuth(provider:LoginProvider){
  if(isLoading.value)return
  error.value='';successMessage.value=''
  const result=await authStore.loginWithProvider(provider)
  if(!result.success)error.value=t(result.message==='OAUTH_UNAVAILABLE'?'auth.oauthUnavailable':'auth.oauthFailed')
}
async function handlePasswordReset(){
  if(isLoading.value)return
  resetError.value='';resetSuccess.value=''
  if(!resetEmail.value.trim()){resetError.value=t('auth.errors.emailRequired');return}
  const result=await authStore.sendPasswordReset(resetEmail.value.trim())
  if(result.success){resetSuccess.value=t('auth.success.resetLinkSent');resetEmail.value=''}
  else resetError.value=result.message||t('auth.errors.resetFailed')
}
function closeForgotPassword(){
  if(isLoading.value)return
  showForgotPassword.value=false
  if(forgotPasswordDialog.value?.open)forgotPasswordDialog.value.close()
  resetError.value='';resetSuccess.value='';resetEmail.value=''
}
watch(showForgotPassword,show=>{if(show){resetEmail.value=formData.value.email;forgotPasswordDialog.value?.showModal()}else if(forgotPasswordDialog.value?.open)forgotPasswordDialog.value.close()})
const resetOAuth=()=>authStore.resetOAuth?.()
onMounted(()=>{
  const callbackError=authStore.consumeOAuthError?.();if(callbackError)error.value=t('auth.'+callbackError)
  void authStore.loadLoginProviders?.()
  window.addEventListener('pageshow',resetOAuth)
})
onBeforeUnmount(()=>{window.removeEventListener('pageshow',resetOAuth);formData.value.password='';formData.value.confirmPassword=''})
</script>

<style scoped>
.auth-shell{display:grid;min-height:100dvh;place-items:center;padding:32px 20px;background:hsl(var(--background));color:hsl(var(--foreground))}
.auth-layout{width:100%;max-width:380px}.auth-brand{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;margin-bottom:26px}.auth-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid hsl(var(--border)/.7);border-radius:11px;background:hsl(var(--card));color:hsl(var(--foreground))}.auth-brand h1{font-size:21px;font-weight:600;letter-spacing:-.035em}.auth-brand p{flex-basis:100%;text-align:center;margin-top:2px;font-size:12px;line-height:1.7;color:hsl(var(--muted-foreground))}
.auth-card{padding:24px;border:1px solid hsl(var(--border)/.7);border-radius:20px;background:hsl(var(--card));box-shadow:0 6px 28px hsl(var(--foreground)/.025)}.auth-tabs{display:flex;gap:3px;margin-bottom:24px;padding:4px;border-radius:11px;background:hsl(var(--muted)/.4)}.auth-tabs button{flex:1;height:32px;border-radius:8px;font-size:12px;font-weight:500;color:hsl(var(--muted-foreground));transition:background .16s,color .16s}.auth-tabs button.active{background:hsl(var(--background));color:hsl(var(--foreground));box-shadow:0 1px 3px hsl(var(--foreground)/.06)}
.auth-form{display:flex;flex-direction:column;gap:17px}.auth-field{display:flex;flex-direction:column;gap:8px;font-size:11px;font-weight:500}.auth-field>span:first-child{color:hsl(var(--muted-foreground))}.auth-field input{width:100%;min-width:0;height:42px;padding:0 12px;border:1px solid hsl(var(--border)/.8);border-radius:10px;background:hsl(var(--background)/.6);font-size:13px;font-weight:400;outline:none;transition:border-color .16s,box-shadow .16s}.auth-field input::placeholder{color:hsl(var(--muted-foreground)/.55)}.auth-field input:focus{border-color:hsl(var(--primary)/.5);box-shadow:0 0 0 3px hsl(var(--primary)/.07)}
.auth-password{position:relative;display:block}.auth-password input{padding-right:42px}.auth-password button{position:absolute;inset:0 4px 0 auto;display:grid;place-items:center;width:34px;color:hsl(var(--muted-foreground))}
.auth-submit{display:flex;align-items:center;justify-content:center;gap:9px;min-height:42px;padding:9px 12px;border-radius:10px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:12px;font-weight:500;transition:background .16s}.auth-submit:hover{background:hsl(var(--primary)/.9)}.auth-forgot{display:block;margin:18px auto 0;font-size:11px;color:hsl(var(--muted-foreground))}.auth-forgot:hover{color:hsl(var(--foreground))}
.auth-message{display:flex;align-items:flex-start;gap:8px;padding:11px;border:1px solid hsl(var(--border)/.65);border-radius:10px;background:hsl(var(--muted)/.2);font-size:11px;line-height:1.7;color:hsl(var(--muted-foreground))}.auth-message svg{flex-shrink:0;margin-top:2px}.auth-message.is-error{border-color:hsl(var(--destructive)/.35);color:hsl(var(--foreground))}.auth-message.is-error svg{color:hsl(var(--destructive))}
.auth-divider{display:flex;align-items:center;gap:12px;margin:23px 0 16px;font-size:10px;color:hsl(var(--muted-foreground))}.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:hsl(var(--border)/.6)}.auth-providers{display:flex;gap:8px}.auth-provider{display:flex;flex:1;align-items:center;justify-content:center;gap:9px;min-height:41px;border:1px solid hsl(var(--border)/.75);border-radius:10px;font-size:12px;background:hsl(var(--background)/.4);transition:background .16s}.auth-provider:hover{background:hsl(var(--muted)/.4)}.auth-caption{margin-top:20px;text-align:center;font-size:10px;color:hsl(var(--muted-foreground)/.75)}
.auth-reset{width:min(380px,calc(100vw - 32px));margin:auto;padding:24px;border:1px solid hsl(var(--border)/.7);border-radius:20px;background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 20px 70px hsl(var(--foreground)/.12)}.auth-reset::backdrop{background:hsl(var(--background)/.75);backdrop-filter:blur(6px)}.auth-reset header{display:flex;align-items:center;justify-content:space-between;gap:12px}.auth-reset h2{font-size:15px;font-weight:550}.auth-reset header button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;color:hsl(var(--muted-foreground))}.auth-reset-hint{margin:12px 0 22px;font-size:12px;line-height:1.7;color:hsl(var(--muted-foreground))}
.auth-shell button:focus-visible{outline:2px solid hsl(var(--primary)/.5);outline-offset:3px}.auth-shell button:disabled{opacity:.45;cursor:default}@media(max-width:420px){.auth-shell{padding:24px 16px}.auth-card{padding:20px}}@media(prefers-reduced-motion:reduce){.auth-shell *{transition:none!important}}
</style>
