<template>
  <section id="account-settings" class="account-settings space-y-4" aria-labelledby="account-heading">
    <div class="account-overview" :class="{ 'has-preferences': Boolean($slots.preferences) }">
      <slot name="preferences" />
    <form ref="section" class="account-card profile-card" @submit.prevent="saveProfile">
      <header class="account-card-header flex-wrap">
        <h2 id="account-heading" class="flex items-center gap-2 text-sm font-semibold"><UserRound class="h-4 w-4 text-muted-foreground" />{{ t('account.title') }}</h2>
        <span class="text-[11px] text-muted-foreground">{{ t('account.scope') }}</span>
      </header>
      <div class="profile-body">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold" :class="avatarClasses[tone]">{{ initials }}</span>
          <div class="min-w-0"><p class="truncate text-sm font-medium">{{ displayName.trim() || accountName(auth.user) }}</p><p class="mt-0.5 truncate text-xs text-muted-foreground">{{ auth.user?.email }}</p>
            <div class="mt-2 flex items-center gap-1.5" role="group" :aria-label="t('account.avatarColor')">
              <button v-for="option in avatarTones" :key="option" type="button" :aria-label="t('account.tones.' + option)" :aria-pressed="tone === option" :disabled="auth.accountBusy" class="flex h-5 w-5 items-center justify-center rounded-full border transition-colors" :class="[avatarClasses[option], tone === option ? 'border-current' : 'border-transparent hover:border-current']" @click="tone = option"><span class="h-2.5 w-2.5 rounded-full bg-current" /></button>
            </div>
          </div>
        </div>
        <div class="profile-name">
          <label for="account-display-name" class="account-label">{{ t('account.displayName') }}</label>
          <input id="account-display-name" ref="nameInput" v-model="displayName" class="account-input mt-1.5" autocomplete="name" maxlength="80" required :disabled="auth.accountBusy" :placeholder="t('account.namePlaceholder')" />
        </div>
      </div>
      <footer class="flex min-h-12 flex-wrap items-center justify-between gap-2 border-t border-border/40 px-4 py-2.5">
        <p role="status" aria-live="polite" class="text-xs" :class="feedback.profile?.error ? 'text-destructive' : 'text-muted-foreground'">{{ feedback.profile?.text || t('account.profileHint') }}</p>
        <button type="submit" class="account-primary" :disabled="auth.accountBusy || !profileChanged || !displayName.trim()"><Loader2 v-if="pending === 'profile'" class="h-3.5 w-3.5 animate-spin" />{{ t(pending === 'profile' ? 'settingsPage.saving' : 'common.save') }}</button>
      </footer>
    </form>
    </div>

    <div class="account-security-grid">
      <section class="account-card" aria-labelledby="account-contact">
        <header class="account-card-header"><h3 id="account-contact"><Mail class="h-4 w-4" />{{ t('account.contact') }}</h3><button type="button" class="account-link" :disabled="auth.accountBusy" :aria-expanded="editor === 'email'" aria-controls="account-email-form" @click="toggleEditor('email')">{{ t(editor === 'email' ? 'common.cancel' : 'account.change') }}</button></header>
        <div class="space-y-3 p-4">
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-2"><span class="break-all text-sm">{{ auth.user?.email }}</span><span class="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><BadgeCheck v-if="auth.user?.emailVerified" class="h-3.5 w-3.5 text-emerald-500" />{{ t(auth.user?.emailVerified ? 'account.verified' : 'account.unverified') }}</span></div>
          <p v-if="auth.user?.pendingEmail" class="break-words text-xs leading-5 text-muted-foreground">{{ t('account.pendingEmail', { email: auth.user.pendingEmail }) }}</p>
          <p v-else class="text-xs leading-5 text-muted-foreground">{{ t('account.emailHint') }}</p>
          <form v-if="editor === 'email'" id="account-email-form" class="space-y-3 border-t border-border/40 pt-3" @submit.prevent="saveEmail">
            <div><label for="account-email" class="account-label">{{ t('account.newEmail') }}</label><input id="account-email" v-model="email" class="account-input mt-1.5" type="email" autocomplete="email" required maxlength="254" :disabled="auth.accountBusy" /></div>
            <div><label for="account-email-password" class="account-label">{{ t('account.currentPassword') }}</label><input id="account-email-password" v-model="emailPassword" class="account-input mt-1.5" type="password" autocomplete="current-password" required :disabled="auth.accountBusy" /></div>
            <p class="text-xs leading-5 text-muted-foreground">{{ t('account.emailConfirmationHint') }}</p>
            <button type="submit" class="account-primary" :disabled="auth.accountBusy || !emailChanged || !emailPassword"><Loader2 v-if="pending === 'email'" class="h-3.5 w-3.5 animate-spin" />{{ t('account.updateEmail') }}</button>
          </form>
          <p v-if="feedback.email" role="status" aria-live="polite" class="text-xs leading-5" :class="feedback.email.error ? 'text-destructive' : 'text-muted-foreground'">{{ feedback.email.text }}</p>
        </div>
      </section>
      <section class="account-card" aria-labelledby="account-security">
        <header class="account-card-header"><h3 id="account-security"><ShieldCheck class="h-4 w-4" />{{ t('account.security') }}</h3><button type="button" class="account-link" :disabled="auth.accountBusy" :aria-expanded="editor === 'password'" aria-controls="account-password-form" @click="toggleEditor('password')">{{ t(editor === 'password' ? 'common.cancel' : 'account.change') }}</button></header>
        <div class="space-y-3 p-4">
          <div class="flex items-center justify-between gap-2"><span class="text-sm">{{ t('auth.password') }}</span><span class="select-none text-sm tracking-wider text-muted-foreground">••••••••</span></div>
          <p class="text-xs leading-5 text-muted-foreground">{{ t('account.passwordHint') }}</p>
          <form v-if="editor === 'password'" id="account-password-form" class="space-y-3 border-t border-border/40 pt-3" @submit.prevent="savePassword">
            <div><label for="account-current-password" class="account-label">{{ t('account.currentPassword') }}</label><input id="account-current-password" v-model="password.current" class="account-input mt-1.5" type="password" autocomplete="current-password" required :disabled="auth.accountBusy" /></div>
            <div><label for="account-new-password" class="account-label">{{ t('account.newPassword') }}</label><input id="account-new-password" v-model="password.next" class="account-input mt-1.5" type="password" autocomplete="new-password" minlength="8" required :disabled="auth.accountBusy" /></div>
            <div><label for="account-confirm-password" class="account-label">{{ t('account.confirmPassword') }}</label><input id="account-confirm-password" v-model="password.confirm" class="account-input mt-1.5" type="password" autocomplete="new-password" minlength="8" required :disabled="auth.accountBusy" /></div>
            <p v-if="password.confirm && password.next !== password.confirm" class="text-xs text-destructive">{{ t('account.errors.PASSWORD_MISMATCH') }}</p>
            <div v-if="needsCode"><label for="account-password-code" class="account-label">{{ t('account.verificationCode') }}</label><input id="account-password-code" v-model="nonce" class="account-input mt-1.5" autocomplete="one-time-code" inputmode="numeric" required :disabled="auth.accountBusy" /></div>
            <button type="submit" class="account-primary" :disabled="auth.accountBusy || !passwordValid"><Loader2 v-if="pending === 'password'" class="h-3.5 w-3.5 animate-spin" />{{ t('account.updatePassword') }}</button>
          </form>
          <p v-if="feedback.password" role="status" aria-live="polite" class="text-xs leading-5" :class="feedback.password.error ? 'text-destructive' : 'text-muted-foreground'">{{ feedback.password.text }}</p>
        </div>
      </section>
    </div>

    <section class="account-card" aria-labelledby="account-session">
      <header class="account-card-header"><h3 id="account-session"><Monitor class="h-4 w-4" />{{ t('account.session') }}</h3><span class="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />{{ t('account.currentSession') }}</span></header>
      <div class="divide-y divide-border/40 px-4">
        <div class="grid gap-3 py-3 sm:grid-cols-2"><div><p class="account-label">{{ t('account.joinedAt') }}</p><p class="mt-1 text-xs">{{ formatDate(auth.user?.createdAt) }}</p></div><div><p class="account-label">{{ t('account.lastSignIn') }}</p><p class="mt-1 text-xs">{{ formatDate(auth.user?.lastSignInAt, true) }}</p></div></div>
        <div class="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"><div class="min-w-0"><p class="account-label">{{ t('account.accountId') }}</p><p class="mt-1 break-all font-mono text-[11px] text-muted-foreground">{{ auth.user?.id }}</p></div><button type="button" class="account-link inline-flex items-center gap-1.5" @click="copyId"><Check v-if="idCopied" class="h-3.5 w-3.5" /><Copy v-else class="h-3.5 w-3.5" />{{ t(idCopied ? 'sharing.copied' : 'sharing.copyLink') }}</button></div>
        <div class="flex flex-wrap items-center justify-between gap-3 py-3"><p class="text-xs leading-5 text-muted-foreground">{{ t('account.sessionHint') }}</p><div class="flex flex-wrap items-center gap-2"><button type="button" class="account-secondary" :disabled="auth.accountBusy" @click="emit('logout', 'local')"><LogOut class="h-3.5 w-3.5" />{{ t('app.signOut') }}</button><button type="button" class="account-link text-destructive hover:!text-destructive" :disabled="auth.accountBusy" @click="emit('logout', 'global')">{{ t('account.signOutAll') }}</button></div></div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { BadgeCheck, Check, Copy, Loader2, LogOut, Mail, Monitor, ShieldCheck, UserRound } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { accountInitials, accountName, avatarClasses, avatarTones, validAvatarTone } from '@/lib/accountProfile'
const props = withDefaults(defineProps<{ focusRequest?: number }>(), { focusRequest: 0 })
const emit = defineEmits<{ logout: [scope: 'local' | 'global'] }>()
const auth = useAuthStore(), ui = useUIStore(), { t, locale } = useI18n()
const section = ref<HTMLElement>(), nameInput = ref<HTMLInputElement>()
const displayName = ref(accountName(auth.user)), tone = ref(validAvatarTone(auth.user?.avatarTone))
const initials = computed(() => accountInitials(displayName.value || accountName(auth.user)))
const profileChanged = computed(() => displayName.value.trim() !== accountName(auth.user) || tone.value !== validAvatarTone(auth.user?.avatarTone))
const editor = ref<'email' | 'password' | null>(null), pending = ref('')
const email = ref(''), emailPassword = ref('')
const emailChanged = computed(() => email.value.trim().toLowerCase() !== auth.user?.email.toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
const password = reactive({ current: '', next: '', confirm: '' })
const needsCode = ref(false), nonce = ref('')
const passwordValid = computed(() => Boolean(password.current) && password.next.length >= 8 && password.next === password.confirm && password.next !== password.current)
const feedback = reactive<Record<string, { text: string; error: boolean } | undefined>>({})
const idCopied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
let focusFrame = 0, disposed = false
function clearPasswords() { emailPassword.value = ''; password.current = ''; password.next = ''; password.confirm = ''; needsCode.value = false; nonce.value = '' }
function toggleEditor(value: 'email' | 'password') {
  if (auth.accountBusy) return
  editor.value = editor.value === value ? null : value
  clearPasswords()
  email.value = auth.user?.pendingEmail || auth.user?.email || ''
  feedback[value] = undefined
}
function message(key: string, result: { success: boolean; message?: string }, successKey: string) {
  const codes = ['CURRENT_PASSWORD_REQUIRED', 'CURRENT_PASSWORD_INCORRECT', 'INVALID_NAME', 'INVALID_EMAIL', 'PASSWORD_TOO_SHORT', 'PASSWORD_UNCHANGED', 'SESSION_CHANGED', 'PASSWORD_POLICY', 'EMAIL_TAKEN', 'RATE_LIMIT', 'REAUTHENTICATION_REQUIRED', 'INVALID_CODE']
  const errorKey = codes.includes(result.message || '') ? result.message : 'SAVE_FAILED'
  feedback[key] = { error: !result.success, text: t(result.success ? successKey : 'account.errors.' + errorKey) }
}
async function saveProfile() {
  if (!profileChanged.value || !displayName.value.trim() || auth.accountBusy) return
  pending.value = 'profile'
  try { message('profile', await auth.updateProfile(displayName.value, tone.value), 'account.profileSaved') }
  finally { pending.value = '' }
}
async function saveEmail() {
  if (!emailChanged.value || !emailPassword.value || auth.accountBusy) return
  pending.value = 'email'
  try {
    const result = await auth.updateEmail(email.value, emailPassword.value)
    message('email', result, auth.user?.pendingEmail ? 'account.emailRequested' : 'account.emailUpdated')
    if (result.success) { emailPassword.value = ''; editor.value = null }
  } finally { pending.value = '' }
}
async function savePassword() {
  if (!passwordValid.value || auth.accountBusy) return
  pending.value = 'password'
  try {
    if (needsCode.value && !nonce.value.trim()) return
    const result = await auth.changePassword(password.next, password.current, nonce.value.trim() || undefined)
    if (result.message === 'REAUTHENTICATION_REQUIRED') needsCode.value = true
    message('password', result, 'account.passwordUpdated')
    if (result.success) { clearPasswords(); editor.value = null }
  } finally { pending.value = '' }
}
function formatDate(value?: string, time = false) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—'
  return new Date(value).toLocaleString(locale.value === 'tr' ? 'tr-TR' : 'en-US', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
}
async function copyId() {
  try {
    await navigator.clipboard.writeText(auth.user?.id || '')
    idCopied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { idCopied.value = false }, 1800)
  } catch { ui.addToast(t('sharing.copyFailed'), 'error') }
}
async function focusAccount() {
  if (!props.focusRequest) return
  await nextTick()
  if (disposed) return
  cancelAnimationFrame(focusFrame)
  focusFrame = requestAnimationFrame(() => {
    section.value?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    nameInput.value?.focus({ preventScroll: true })
  })
}
watch(() => props.focusRequest, focusAccount)
watch(() => auth.user?.id, () => { clearPasswords(); editor.value = null; displayName.value = accountName(auth.user); tone.value = validAvatarTone(auth.user?.avatarTone) })
onMounted(focusAccount)
onBeforeUnmount(() => { disposed = true; clearPasswords(); cancelAnimationFrame(focusFrame); clearTimeout(copyTimer) })
</script>

<style scoped>
.account-settings { container: account-settings / inline-size; min-width: 0; }
.account-overview { display: grid; gap: 1rem; align-items: stretch; }
.account-security-grid { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 1rem; }
.profile-card { container: account-profile / inline-size; display: flex; flex-direction: column; scroll-margin-top: 6rem; }
.profile-body { display: flex; flex: 1; flex-direction: column; justify-content: center; gap: 1rem; padding: 1rem; }
.profile-name { width: 100%; min-width: 0; }
@container account-settings (min-width: 48rem) { .account-overview.has-preferences { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); } }
@container account-settings (min-width: 40rem) { .account-security-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container account-profile (min-width: 32rem) { .profile-body { flex-direction: row; align-items: center; } .profile-name { width: 16rem; } }
.account-card { overflow: hidden; min-width: 0; border: 1px solid hsl(var(--border) / .6); border-radius: 1rem; background: hsl(var(--card) / .6); box-shadow: 0 1px 2px rgb(0 0 0 / .02); }
.account-card-header { display: flex; min-height: 3rem; align-items: center; justify-content: space-between; gap: .75rem; border-bottom: 1px solid hsl(var(--border) / .4); padding: .6rem 1rem; }
.account-card-header h3 { display: flex; align-items: center; gap: .5rem; font-size: .8125rem; font-weight: 500; }
.account-card-header h3 svg { color: hsl(var(--muted-foreground)); }
.account-label { font-size: .75rem; color: hsl(var(--muted-foreground)); }
.account-input { width: 100%; min-width: 0; height: 2.5rem; border: 1px solid hsl(var(--border) / .5); border-radius: .75rem; background: hsl(var(--background) / .4); padding: 0 .75rem; font-size: .8125rem; outline: none; transition: border-color 150ms, box-shadow 150ms; }
.account-input:focus { border-color: hsl(var(--primary) / .4); box-shadow: 0 0 0 3px hsl(var(--primary) / .06); }
.account-primary, .account-secondary { display: inline-flex; min-height: 2.125rem; align-items: center; justify-content: center; gap: .4rem; border-radius: .65rem; padding: .4rem .8rem; font-size: .75rem; font-weight: 500; transition: background-color 150ms, opacity 150ms; }
.account-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.account-primary:hover { opacity: .9; }
.account-secondary { border: 1px solid hsl(var(--border) / .6); background: hsl(var(--background) / .4); }
.account-secondary:hover { background: hsl(var(--muted) / .6); }
.account-link { border-radius: .5rem; padding: .25rem; font-size: .75rem; color: hsl(var(--muted-foreground)); transition: color 150ms; }
.account-link:hover { color: hsl(var(--foreground)); }
button:disabled, input:disabled { opacity: .45; cursor: default; }
button:focus-visible { outline: 2px solid hsl(var(--primary) / .5); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .account-settings *, .account-settings *::before { transition: none !important; } }
</style>
