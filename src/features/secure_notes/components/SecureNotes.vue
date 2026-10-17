<template>
  <div class="relative z-10 w-full">
    <div style="--workspace-default-max:72rem" class="workspace-content mx-auto space-y-4">
      <template v-if="!isAuthenticated">
        <form v-if="canWrite" class="workspace-toolbar vault-create-form" @submit.prevent="handleInlineAddSession">
          <input v-model="inlineSessionName" type="text" maxlength="100" :placeholder="$t('secure.sessionNamePlaceholder')" :aria-label="$t('secure.sessionNamePlaceholder')" class="vault-field" :disabled="isLoading" />
          <div class="relative min-w-0">
            <input v-model="inlineSessionPassword" :type="showInlinePassword?'text':'password'" :placeholder="$t('secure.sessionPasswordPlaceholder')" :aria-label="$t('secure.sessionPasswordPlaceholder')" autocomplete="new-password" class="vault-field pr-11" :disabled="isLoading" />
            <button type="button" class="vault-icon absolute right-1.5 top-1/2 -translate-y-1/2" :aria-label="$t(showInlinePassword?'secure.hidePassword':'secure.showPassword')" @click="showInlinePassword=!showInlinePassword"><Eye v-if="showInlinePassword" class="h-3.5 w-3.5" /><EyeOff v-else class="h-3.5 w-3.5" /></button>
          </div>
          <button type="submit" class="vault-primary" :disabled="!inlineSessionName.trim() || !inlineSessionPassword.trim() || isLoading"><Loader2 v-if="isLoading" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /><Plus v-else class="h-3.5 w-3.5" />{{ $t('secure.newVault') }}</button>
        </form>
        <div v-if="passwordSessions.length" class="vault-grid">
          <button v-for="session in passwordSessions" :key="session.id" type="button" class="workspace-card vault-session" @click="promptSessionUnlock(session)">
            <span class="vault-session-lock"><Lock class="h-4 w-4" /></span>
            <span class="min-w-0 flex-1"><span class="block truncate text-[13px] font-medium text-foreground">{{ session.name }}</span><span class="mt-1 block text-[11px] text-muted-foreground">{{ $t('secure.passwordProtected') }}</span></span>
            <ChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          </button>
        </div>
        <p v-else class="py-9 text-center text-xs text-muted-foreground">{{ $t('secure.noVaultsShort') }}</p>
      </template>
      <template v-else>
        <div class="workspace-toolbar space-y-4">
          <form v-if="canWrite" class="vault-entry-form" @submit.prevent="openAddNoteDialog">
            <input v-model="noteDraftTitle" type="text" maxlength="160" class="vault-field" :placeholder="$t('secure.noteTitlePlaceholder')" :aria-label="$t('secure.title')" :disabled="isLoading" />
            <CustomSelect v-model="noteDraftType" :options="noteTypeOptions" :aria-label="$t('secure.type')" size="md" class="w-full min-w-0" :disabled="isLoading" />
            <button type="submit" class="vault-primary" :disabled="isLoading"><Plus class="h-3.5 w-3.5" />{{ $t('secure.addShort') }}</button>
          </form>
          <div class="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2.5">
            <CustomSelect :model-value="currentSession?.id || ''" @update:model-value="switchVault" :options="vaultOptions" :aria-label="$t('secure.chooseVault')" variant="ghost" size="sm" class="max-w-[200px] flex-1 sm:flex-none" :disabled="isLoading" />
            <span class="text-[11px] tabular-nums text-muted-foreground">{{ $t('secure.recordCount',{count:secureNotes.length}) }}</span>
            <div class="ml-auto flex items-center gap-1">
              <button v-if="canWrite" type="button" class="vault-icon" :disabled="isLoading" :aria-label="$t('secure.editSession')" :title="$t('secure.editSession')" @click="editSession(currentSession!)"><Edit class="h-3.5 w-3.5" /></button>
              <button v-if="canWrite" type="button" class="vault-icon hover:!bg-destructive/10 hover:!text-destructive" :disabled="isLoading" :aria-label="$t('secure.deleteSession')" :title="$t('secure.deleteSession')" @click="deleteCurrentSession"><Trash2 class="h-3.5 w-3.5" /></button>
              <button type="button" class="vault-icon" :aria-label="$t('secure.lockVault')" :title="$t('secure.lockVault')" @click="logout"><Lock class="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>

        <div v-if="secureNotes.length" class="vault-grid">
          <SecureNoteItem v-for="note in secureNotes" :key="note.id" :note="note" @edit="editNote" @delete="deleteNote" />
        </div>
        <p v-else class="py-9 text-center text-xs text-muted-foreground">{{ $t('secure.noNotesShort') }}</p>
      </template>
    </div>

    <dialog @cancel.prevent="closeUnlockDialog" :aria-label="$t('secure.accessSessionTitle',{name:selectedSessionForUnlock?.name})" ref="unlockDialog" class="w-[90vw] max-w-sm vault-dialog rounded-2xl border border-border/60 bg-card text-card-foreground shadow-2xl p-4 sm:p-5 space-y-4">
      <div class="text-center space-y-2 mb-2">
        <h2 class="text-sm font-medium text-foreground">{{ $t('secure.accessSessionTitle', { name: selectedSessionForUnlock?.name }) }}</h2>
      </div>
      
      <form @submit.prevent="authenticate" class="space-y-5">
        <div class="space-y-1.5">
          <div class="relative group">
            <input
              v-model="unlockPassword"
              :type="showUnlockPassword ? 'text' : 'password'"
              class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 text-foreground px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono tracking-wide"
              :placeholder="$t('secure.enterPasswordPlaceholder')"
              required
              autofocus
            />
            <button type="button" @click="showUnlockPassword = !showUnlockPassword" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors">
              <Eye v-if="showUnlockPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div class="flex gap-2">
          <button type="button" @click="closeUnlockDialog" class="flex-1 h-10 rounded-xl bg-muted/50 hover:bg-muted font-semibold text-xs transition-colors">{{ $t('secure.cancel') }}</button>
          <button type="submit" class="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm hover:bg-primary/90 flex items-center justify-center gap-2 transition-all" :disabled="isLoading || !unlockPassword">
            <Loader2 v-if="isLoading" class="h-3.5 w-3.5 animate-spin" />
            <span v-else>{{ $t('secure.accessSessionBtn') }}</span>
          </button>
        </div>
      </form>
    </dialog>

    <dialog @cancel.prevent="!isLoading && closeNoteDialog()" :aria-label="$t(editingNote.id ? 'secure.editSecureNote' : 'secure.addSecureNote')" ref="noteDialog" class="w-[90vw] max-w-lg vault-dialog rounded-2xl border border-border/60 bg-card text-card-foreground shadow-2xl p-4 sm:p-5 space-y-4">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-sm font-medium">{{ editingNote.id ? $t('secure.editSecureNote') : $t('secure.addSecureNote') }}</h2>
        <button :disabled="isLoading" @click="closeNoteDialog" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-5 h-5" /></button>
      </div>

      <form @submit.prevent="saveNote" :data-shared-editing="showAddNoteDialog" class="space-y-5">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5 col-span-2 sm:col-span-1">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.title') }}</label>
            <input v-model="editingNote.title" type="text" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" required />
          </div>
          <div class="space-y-1.5 col-span-2 sm:col-span-1">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.type') }}</label>
            <CustomSelect
              :modelValue="editingNote.type"
              @update:modelValue="editingNote.type = $event as 'password' | 'secret'"
              :options="noteTypeOptions"
              size="md"
              class="secure-type-select h-11"
            />
          </div>
        </div>
        
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.descriptionOptional') }}</label>
          <input v-model="editingNote.description" type="text" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
        </div>
        
        <div v-if="editingNote.type === 'password'" class="space-y-4 p-5 rounded-2xl bg-muted/30 border border-border/40">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.username') }}</label>
              <input v-model="editingNote.username" type="text" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" autocomplete="off" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.password') }}</label>
              <div class="relative">
                <input v-model="editingNote.password_encrypted" :type="showDialogPassword ? 'text' : 'password'" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 pr-10 text-sm font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" autocomplete="new-password" />
                <button type="button" @click="showDialogPassword = !showDialogPassword" class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                  <Eye v-if="showDialogPassword" class="h-3.5 w-3.5" />
                  <EyeOff v-else class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.urlOptional') }}</label>
            <input v-model="editingNote.url" type="url" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" autocomplete="off" />
          </div>
        </div>
        
        <div v-else class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.content') }}</label>
          <textarea v-model="editingNote.content" class="secure-field w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all min-h-[100px] resize-none font-mono" required></textarea>
        </div>
        
        <div class="flex justify-end gap-3 pt-4">
          <button type="button" :disabled="isLoading" @click="closeNoteDialog" class="px-5 py-2.5 rounded-xl font-semibold text-sm bg-muted/50 hover:bg-muted transition-colors">{{ $t('secure.cancel') }}</button>
          <button type="submit" class="px-6 py-2.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2" :disabled="isLoading">
            <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
            <span v-else>{{ editingNote.id ? $t('secure.updateNote') : $t('secure.createNote') }}</span>
          </button>
        </div>
      </form>
    </dialog>

    <dialog @cancel.prevent="closePasswordVerification" :aria-label="$t('secure.verifyPasswordTitle')" ref="passwordVerificationDialog" class="w-[90vw] max-w-sm vault-dialog rounded-2xl border border-border/60 bg-card text-card-foreground shadow-2xl p-4 sm:p-5 space-y-4">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-sm font-medium">{{ $t('secure.verifyPasswordTitle') }}</h2>
        <button @click="closePasswordVerification" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-5 h-5" /></button>
      </div>

      <div class="space-y-5">
        <p class="text-sm font-medium text-muted-foreground/80 leading-relaxed">{{ $t('secure.verifyPasswordDesc') }}</p>
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.currentPassword') }}</label>
          <div class="relative">
            <input
              v-model="verificationPassword"
              :type="showVerificationPassword ? 'text' : 'password'"
              class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-wide transition-all"
              @keyup.enter="verifyPassword"
              required
            />
            <button type="button" @click="showVerificationPassword = !showVerificationPassword" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors">
              <Eye v-if="showVerificationPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-4">
          <button type="button" @click="closePasswordVerification" class="px-5 py-2.5 rounded-xl font-semibold text-sm bg-muted/50 hover:bg-muted text-foreground transition-colors">{{ $t('secure.cancel') }}</button>
          <button @click="verifyPassword" class="px-6 py-2.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2" :disabled="isVerifyingPassword">
            <Loader2 v-if="isVerifyingPassword" class="w-4 h-4 animate-spin" />
            <span v-else>{{ $t('secure.verifyPasswordBtn') }}</span>
          </button>
        </div>
      </div>
    </dialog>
      
    <dialog @cancel.prevent="!isLoading && closeSessionDialog()" :aria-label="$t('secure.editSession')" ref="sessionDialog" class="w-[90vw] max-w-sm vault-dialog rounded-2xl border border-border/60 bg-card text-card-foreground shadow-2xl p-4 sm:p-5 space-y-4">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-sm font-medium">{{ $t('secure.editSessionTitle') }}</h2>
        <button :disabled="isLoading" @click="closeSessionDialog" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-5 h-5" /></button>
      </div>

      <form @submit.prevent="saveSession" :data-shared-editing="showSessionDialog" class="space-y-5">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.sessionName') }}</label>
          <input v-model="editingSession.name" type="text" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" required />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.sessionPasswordLabel') }}</label>
          <div class="relative">
            <input v-model="editingSession.password" :placeholder="$t('secure.keepPassword')" :type="showEditSessionPassword ? 'text' : 'password'" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono tracking-wide transition-all" autocomplete="new-password" />
            <button v-if="canWrite" type="button" @click="showEditSessionPassword = !showEditSessionPassword" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors">
              <Eye v-if="showEditSessionPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-4">
          <button type="button" :disabled="isLoading" @click="closeSessionDialog" class="px-5 py-2.5 rounded-xl font-semibold text-sm bg-muted/50 hover:bg-muted text-foreground transition-colors">{{ $t('secure.cancel') }}</button>
          <button type="submit" class="px-6 py-2.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2" :disabled="isLoading">
            <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
            <span v-else>{{ $t('secure.updateSessionBtn') }}</span>
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { useModuleAccess, useModuleLoad } from '@/lib/workspaceScope'
import { ref, shallowRef, computed, onBeforeUnmount, onDeactivated, watch } from 'vue'
import { Lock, Eye, EyeOff, Plus, Edit, Trash2, X, Loader2, ChevronRight } from 'lucide-vue-next'
import { useWorkspaceClient } from '@/lib/workspaceScope'
import { createVaultKey, unlockVaultKey, encryptVaultValue, decryptVaultValue, isSealedVault, vaultKeyId } from '@/lib/vaultCrypto'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import SecureNoteItem from './SecureNoteItem.vue'

interface SecureNote {
  id: string; title: string; description?: string; type: 'password' | 'secret'; username?: string
  password_encrypted?: string; url?: string; content?: string; created_at: string; updated_at: string
  session_id: string; version?: number; encrypted_payload?: Awaited<ReturnType<typeof encryptVaultValue>> & { key_id?: string }
}
interface PasswordSession { id: string; name: string; password_hash: string; created_at: string; updated_at?: string; version?: number }
const { canWrite } = useModuleAccess('secure')

const { t } = useI18n()
const authStore = useAuthStore(), supabase = useWorkspaceClient(), uiStore = useUIStore()
const noteTypeOptions = computed(() => [
  { value: 'password', label: t('secure.typePassword') }, { value: 'secret', label: t('secure.typeSecret') }
])
const isAuthenticated = ref(false), currentSession = ref<PasswordSession | null>(null)
const passwordSessions = ref<PasswordSession[]>([]), secureNotes = ref<SecureNote[]>([])
const vaultKey = shallowRef<CryptoKey | null>(null)
let lockEpoch = 0
const showInlinePassword = ref(false), showUnlockPassword = ref(false), showDialogPassword = ref(false)
const showVerificationPassword = ref(false), showEditSessionPassword = ref(false)
const inlineSessionName = ref(''), inlineSessionPassword = ref('')
const unlockDialog = ref<HTMLDialogElement | null>(null), selectedSessionForUnlock = ref<PasswordSession | null>(null), unlockPassword = ref('')
const noteDraftTitle=ref(''),noteDraftType=ref<'password'|'secret'>('password')
const vaultOptions=computed(()=>passwordSessions.value.map(session=>({value:session.id,label:session.name})))
const switchVault=(id:string)=>{if(id===currentSession.value?.id || isLoading.value)return;const next=passwordSessions.value.find(session=>session.id===id);if(!next)return;lockVault();promptSessionUnlock(next)}
const isLoading = ref(false), showAddNoteDialog = ref(false), noteDialog = ref<HTMLDialogElement | null>(null)
const showSessionDialog = ref(false), sessionDialog = ref<HTMLDialogElement | null>(null)
const passwordVerificationDialog = ref<HTMLDialogElement | null>(null), showPasswordVerification = ref(false)
const verificationPassword = ref(''), isVerifyingPassword = ref(false), verificationError = ref('')
const editingNote = ref<Partial<SecureNote> & { title: string; type: 'password' | 'secret' }>({ title: '', type: 'password' })
const editingSession = ref<Partial<PasswordSession> & { password?: string }>({ name: '', password: '' })
const sensitive = (note: Partial<SecureNote>) => ({
  title: note.title || '', description: note.description || '', type: note.type || 'secret',
  username: note.username || '', password_encrypted: note.password_encrypted || '', url: note.url || '', content: note.content || ''
})
const payloadFor = async (key: CryptoKey, note: Partial<SecureNote>, session: PasswordSession, metadata = session.password_hash) => ({
  ...await encryptVaultValue(key, sensitive(note), session.id + ':' + note.id), key_id: vaultKeyId(metadata)
})
const lockVault = () => {
  noteDraftTitle.value='';noteDraftType.value='password'
  lockEpoch++; vaultKey.value = null; isAuthenticated.value = false; currentSession.value = null; secureNotes.value = []
  editingNote.value = { title: '', type: 'password' }; editingSession.value = { name: '', password: '' }
  inlineSessionPassword.value = ''; unlockPassword.value = ''; verificationPassword.value = ''
  selectedSessionForUnlock.value = null; unlockDialog.value?.close()
  showAddNoteDialog.value = false; showSessionDialog.value = false; showPasswordVerification.value = false
}
const showFailure = (err: unknown) => {
  const message = (err as Error)?.message || ''
  uiStore.addToast(t(message.includes('SHARING_CONFLICT') ? 'sharing.conflict'
    : message.includes('VAULT_HTTPS_REQUIRED') ? 'secure.httpsRequired' : 'sharing.errors.SAVE_FAILED'), 'error')
}
const fetchRows = async (sessionId: string): Promise<SecureNote[]> => {
  const { data, error } = await supabase.from('secure_notes').select('*').eq('session_id', sessionId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
const loadPasswordSessions = async () => {
  const epoch = lockEpoch
  try {
    const { data, error } = await supabase.from('password_sessions').select('*').order('created_at', { ascending: false })
    if (error) throw error
    if (epoch !== lockEpoch) return
    passwordSessions.value = data || []
    if (currentSession.value) {
      const latest = passwordSessions.value.find(s => s.id === currentSession.value!.id)
      if (!latest || latest.password_hash !== currentSession.value.password_hash) {
        lockVault(); uiStore.addToast(t('secure.passwordChanged'), 'info')
      } else currentSession.value = latest
    }
  } catch (err) { showFailure(err) }
}
const loadSecureNotes = async () => {
  const session = currentSession.value, key = vaultKey.value, epoch = lockEpoch
  if (!session) return
  const rows = await fetchRows(session.id)
  const decoded = key ? await Promise.all(rows.map(async row => {
    if (!row.encrypted_payload) throw new Error('VAULT_INVALID_DATA')
    return { ...row, ...await decryptVaultValue<ReturnType<typeof sensitive>>(key, row.encrypted_payload, session.id + ':' + row.id) }
  })) : rows
  if (epoch === lockEpoch && currentSession.value?.id === session.id) secureNotes.value = decoded
}
const handleInlineAddSession = async () => {
  if (isLoading.value || !inlineSessionName.value.trim() || !inlineSessionPassword.value.trim()) return
  if (!supabase.collection('secure')) { uiStore.addToast(t('sharing.errors.SETUP_REQUIRED'), 'error'); return }
  const name = inlineSessionName.value.trim(), password = inlineSessionPassword.value, epoch = lockEpoch
  isLoading.value = true
  try {
    if (passwordSessions.value.some(s => s.name.toLowerCase().trim() === name.toLowerCase())) {
      uiStore.addToast(t('secure.sessionExists', { name }), 'error'); return
    }
    const { metadata } = await createVaultKey(password)
    if (epoch !== lockEpoch) return
    const { data, error } = await supabase.from('password_sessions').insert([{ created_by: authStore.user?.id, name, password_hash: metadata }]).select()
    if (error) throw error
    if (epoch !== lockEpoch) return
    if (data?.[0]) passwordSessions.value.unshift(data[0])
    if (inlineSessionName.value.trim() === name && inlineSessionPassword.value === password) {
      inlineSessionName.value = ''; inlineSessionPassword.value = ''; showInlinePassword.value = false
    }
    uiStore.addToast(t('secure.sessionCreated'), 'success')
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}
const promptSessionUnlock = (session: PasswordSession) => {
  selectedSessionForUnlock.value = session; unlockPassword.value = ''; showUnlockPassword.value = false; unlockDialog.value?.showModal()
}
const closeUnlockDialog = () => { selectedSessionForUnlock.value = null; unlockPassword.value = ''; unlockDialog.value?.close() }
const authenticate = async () => {
  if (isLoading.value || !unlockPassword.value || !selectedSessionForUnlock.value) return
  let session = { ...selectedSessionForUnlock.value }
  const password = unlockPassword.value, epoch = lockEpoch
  isLoading.value = true
  try {
    let key: CryptoKey | null = null
    if (isSealedVault(session.password_hash)) key = await unlockVaultKey(password, session.password_hash)
    else {
      if (session.password_hash !== password.trim()) { uiStore.addToast(t('secure.invalidPassword'), 'error'); return }
      if (supabase.collection('secure')) {
        const sealed = await createVaultKey(password.trim()), rows = await fetchRows(session.id)
        const notes = await Promise.all(rows.map(async row => ({
          id: row.id, version: row.version, encrypted_payload: await payloadFor(sealed.key, row, session, sealed.metadata)
        })))
        if (epoch !== lockEpoch) return
        session = await supabase.sealVault(session.id, session.password_hash, sealed.metadata, notes, session.version!, session.name)
        key = sealed.key
      }
    }
    if (epoch !== lockEpoch || selectedSessionForUnlock.value?.id !== session.id) return
    currentSession.value = session; vaultKey.value = key; isAuthenticated.value = true
    await loadSecureNotes()
    const index = passwordSessions.value.findIndex(s => s.id === session.id)
    if (index !== -1) passwordSessions.value[index] = session
    closeUnlockDialog()
  } catch (err) {
    if (isAuthenticated.value) lockVault()
    if ((err as Error).name === 'OperationError') uiStore.addToast(t('secure.invalidPassword'), 'error')
    else showFailure(err)
  } finally { isLoading.value = false }
}
const logout = () => { lockVault(); uiStore.addToast(t('secure.logout'), 'info') }
const openAddNoteDialog = () => {
  editingNote.value = { title: noteDraftTitle.value.trim(), description: '', type: noteDraftType.value, username: '', password_encrypted: '', url: '', content: '' }
  showDialogPassword.value = false; showAddNoteDialog.value = true
}
const closeSessionDialog = () => { showSessionDialog.value = false; editingSession.value.password = ''; sessionDialog.value?.close() }
const saveSession = async () => {
  if (isLoading.value || !currentSession.value || !editingSession.value.name?.trim()) return
  const session = currentSession.value, epoch = lockEpoch
  isLoading.value = true
  try {
    let updated: PasswordSession
    let nextKey = vaultKey.value
    if (editingSession.value.password) {
      const sealed = await createVaultKey(editingSession.value.password)
      const rows = await fetchRows(session.id)
      const decoded = await Promise.all(rows.map(async row => ({
        ...row, ...await decryptVaultValue<ReturnType<typeof sensitive>>(vaultKey.value!, row.encrypted_payload!, session.id + ':' + row.id)
      })))
      const notes = await Promise.all(decoded.map(async row => ({
        id: row.id, version: row.version, encrypted_payload: await payloadFor(sealed.key, row, session, sealed.metadata)
      })))
      if (epoch !== lockEpoch) return
      updated = await supabase.sealVault(session.id, session.password_hash, sealed.metadata, notes, editingSession.value.version!, editingSession.value.name)
      nextKey = sealed.key
    } else {
      const { data, error } = await supabase.from('password_sessions').update({ name: editingSession.value.name, version: editingSession.value.version }).eq('id', session.id).select().single()
      if (error) throw error
      updated = data
    }
    if (epoch !== lockEpoch) return
    vaultKey.value = nextKey
    const index = passwordSessions.value.findIndex(s => s.id === session.id)
    if (index !== -1) passwordSessions.value[index] = updated
    currentSession.value = updated; await loadSecureNotes(); closeSessionDialog()
    uiStore.addToast(t('secure.sessionUpdated'), 'success')
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}
const deleteCurrentSession = async () => {
  const session = currentSession.value
  if (!session || !canWrite.value || isLoading.value) return
  isLoading.value = true
  try {
    const { error } = await supabase.from('password_sessions').delete().eq('id', session.id)
    if (error) throw error
    passwordSessions.value = passwordSessions.value.filter(s => s.id !== session.id)
    logout()
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}
const editNote = (note: SecureNote) => { editingNote.value = { ...note }; showDialogPassword.value = false; showAddNoteDialog.value = true }
const editSession = (session: PasswordSession) => {
  editingSession.value = { ...session, password: '' }; showEditSessionPassword.value = false
  verificationPassword.value = ''; verificationError.value = ''; showPasswordVerification.value = true
}
const verifyPassword = async () => {
  if (!verificationPassword.value || isVerifyingPassword.value || !currentSession.value) return
  isVerifyingPassword.value = true; verificationError.value = ''
  const epoch = lockEpoch, sessionId = currentSession.value.id
  try {
    if (isSealedVault(currentSession.value.password_hash)) await unlockVaultKey(verificationPassword.value, currentSession.value.password_hash)
    else if (verificationPassword.value.trim() !== currentSession.value.password_hash) throw new Error('Incorrect password')
    if (epoch !== lockEpoch || currentSession.value?.id !== sessionId || !showPasswordVerification.value) return
    showPasswordVerification.value = false; showSessionDialog.value = true; verificationPassword.value = ''
  } catch { verificationError.value = t('secure.invalidVerification') } finally { isVerifyingPassword.value = false }
}
const closePasswordVerification = () => { showPasswordVerification.value = false; verificationPassword.value = ''; verificationError.value = '' }
const closeNoteDialog = () => { showAddNoteDialog.value = false; editingNote.value = { title: '', type: 'password' }; noteDialog.value?.close() }
const saveNote = async () => {
  const session = currentSession.value, key = vaultKey.value, epoch = lockEpoch
  if (isLoading.value || !session) return
  isLoading.value = true
  try {
    const draft = { ...editingNote.value }, id = draft.id || crypto.randomUUID()
    const fields = key ? {
      id, title: 'Encrypted note', type: 'secret', encrypted_payload: await payloadFor(key, { ...draft, id }, session)
    } : sensitive(draft)
    if (epoch !== lockEpoch) return
    const query = draft.id ? supabase.from('secure_notes').update({ ...fields, version: draft.version }).eq('id', draft.id)
      : supabase.from('secure_notes').insert([{ ...fields, created_by: authStore.user?.id, session_id: session.id }])
    const { error } = await query.select()
    if (error) throw error
    if (epoch !== lockEpoch) return
    await loadSecureNotes(); noteDraftTitle.value='';closeNoteDialog()
    uiStore.addToast(t('secure.noteSaved'), 'success')
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}
const deleteNote = async (id: string) => {
  if (!canWrite.value || isLoading.value) return
  isLoading.value = true
  try {
    const { error } = await supabase.from('secure_notes').delete().eq('id', id)
    if (error) throw error
    secureNotes.value = secureNotes.value.filter(n => n.id !== id)
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}

watch(showAddNoteDialog, show => { if (show) noteDialog.value?.showModal(); else noteDialog.value?.close() })
watch(showSessionDialog, show => { if (show) sessionDialog.value?.showModal(); else sessionDialog.value?.close() })
watch(showPasswordVerification, show => { if (show) passwordVerificationDialog.value?.showModal(); else passwordVerificationDialog.value?.close() })
supabase.listen({
  password_sessions: loadPasswordSessions,
  secure_notes: async () => { try { await loadSecureNotes() } catch (err) { lockVault(); showFailure(err) } }
}, () => isLoading.value || isVerifyingPassword.value)
useModuleLoad(loadPasswordSessions)
onDeactivated(lockVault)
onBeforeUnmount(lockVault)
</script>

<style scoped>
.vault-create-form,.vault-entry-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; align-items:center; gap:8px; }
.vault-entry-form { grid-template-columns:minmax(0,1fr) 140px auto; }
.vault-field { @apply h-10 w-full min-w-0 rounded-xl border border-border/70 bg-card/65 px-3 text-[13px] text-foreground shadow-[0_1px_3px_rgb(15,23,42,0.025)] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50 dark:bg-muted/[0.08]; }
.vault-create-form .vault-primary,.vault-entry-form .vault-primary { height:40px; }
.vault-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:start; gap:12px; }
.vault-session-lock { @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30 text-muted-foreground; }
@media(max-width:1023px){.vault-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:639px){
 .vault-grid{grid-template-columns:minmax(0,1fr);gap:10px}
 .vault-create-form,.vault-entry-form{grid-template-columns:minmax(0,1fr) auto}
 .vault-create-form>input,.vault-entry-form>input{grid-column:1 / -1}
}
.vault-icon { @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40; }
.vault-primary { @apply inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40; }
.vault-session { @apply flex min-h-[92px] w-full items-center gap-3 rounded-2xl bg-card/50 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30; }
.vault-dialog { max-height:calc(100dvh - 32px); overflow-y:auto; overscroll-behavior:contain; }
.vault-dialog::backdrop { background:hsl(var(--background)/.75); backdrop-filter:blur(6px); }

.secure-field::placeholder {
  color: hsl(var(--muted-foreground) / 0.38);
  font-weight: 400;
}

.secure-type-select :deep(button) {
  height: 2.75rem;
  min-height: 2.75rem;
  background-color: hsl(var(--background) / 0.5);
  border-color: hsl(var(--border) / 0.5);
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
