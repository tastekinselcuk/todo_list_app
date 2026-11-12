<template>
  <div class="relative z-10 w-full">
    <VaultNotice><div style="--workspace-default-max:72rem" class="workspace-content mx-auto space-y-4">
      <template v-if="!isAuthenticated">
        <form v-if="isOwner" class="workspace-toolbar vault-create-form" @submit.prevent="handleInlineAddSession">
          <input v-model="inlineSessionName" type="text" maxlength="100" :placeholder="$t('secure.sessionNamePlaceholder')" :aria-label="$t('secure.sessionNamePlaceholder')" class="vault-field" :disabled="isLoading" />
          <button type="submit" class="workspace-add-button" :disabled="!inlineSessionName.trim() || isLoading"><Loader2 v-if="isLoading" class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />{{ $t('common.add') }}</button>
          <button v-if="isOwner" type="button" class="vault-control" @click="manager?.open('import')"><Upload class="h-3.5 w-3.5"/>{{ $t('vault.import') }}</button>
        </form>
        <div v-if="passwordSessions.length" class="vault-grid">
          <button v-for="session in passwordSessions" :key="session.id" type="button" class="workspace-card vault-session" @click="promptSessionUnlock(session)">
            <span class="vault-session-lock"><Lock class="h-4 w-4" /></span>
            <span class="min-w-0 flex-1"><span class="block truncate text-[13px] font-medium text-foreground">{{ session.name }}</span><span class="mt-1 block text-[11px]" :class="isSealedVault(session.password_hash)?'text-muted-foreground':'text-primary'">{{ $t(isSealedVault(session.password_hash)?'secure.passwordProtected':'vault.upgradeRequired') }}</span></span>
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
            <button type="submit" class="workspace-add-button" :disabled="isLoading||!noteDraftTitle.trim()">{{ $t('common.add') }}</button>
          </form>
          <div class="relative z-20 flex flex-wrap items-center gap-2">
            <CustomSelect :model-value="currentSession?.id || ''" @update:model-value="switchVault" :options="vaultOptions" :aria-label="$t('secure.chooseVault')" size="sm" class="vault-selector w-40 max-w-full" :disabled="isLoading" popover />
            <button type="button" class="vault-control" :class="{'is-active':showDeleted}" :aria-pressed="showDeleted" :disabled="isLoading" @click="showDeleted=!showDeleted"><Trash2 class="h-3.5 w-3.5"/>{{ $t('vault.deleted') }}</button>
            <span class="px-1 text-[11px] tabular-nums text-muted-foreground">{{ $t('secure.recordCount',{count:visibleNotes.length}) }}</span>
            <div class="ml-auto flex items-center gap-1">
              <button v-if="canWrite" type="button" class="vault-icon vault-action" :disabled="isLoading" :aria-label="$t('secure.editSession')" :title="$t('secure.editSession')" @click="editSession(currentSession!)"><Edit class="h-3.5 w-3.5" /></button>
              <button v-if="isOwner" type="button" class="vault-icon vault-action" :disabled="isLoading" :aria-label="$t('vault.manage')" :title="$t('vault.manage')" @click="openManagement"><ShieldCheck class="h-3.5 w-3.5" /></button>
              <button type="button" class="vault-icon vault-action" :aria-label="$t('secure.lockVault')" :title="$t('secure.lockVault')" @click="logout"><Lock class="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>

        <p class="text-[11px] leading-5 text-muted-foreground">{{ $t(showDeleted?'vault.trashHint':'vault.idle') }}</p>
        <div v-if="visibleNotes.length" class="vault-grid">
          <template v-for="note in visibleNotes" :key="note.id">
            <div v-if="showDeleted" class="workspace-card flex items-center justify-between gap-3 rounded-2xl p-4"><span class="truncate text-xs">{{ note.title }}</span><button v-if="canWrite" class="vault-primary" :disabled="isLoading" @click="restoreNote(note)">{{ $t('vault.restore') }}</button></div>
            <SecureNoteItem v-else :note="note" @edit="editNote" @delete="deleteNote" />
          </template>
        </div>
        <p v-else class="py-9 text-center text-xs text-muted-foreground">{{ $t('secure.noNotesShort') }}</p>
      </template>
    </div></VaultNotice>
    <VaultManager ref="manager" @changed="vaultChanged"/>

    <dialog @cancel.prevent="closeUnlockDialog" :aria-label="$t('secure.accessSessionTitle',{name:selectedSessionForUnlock?.name})" ref="unlockDialog" class="note-edit-dialog vault-dialog vault-small-dialog space-y-4">
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
          <button type="button" @click="closeUnlockDialog" class="flex-1 h-10 rounded-xl bg-muted/50 hover:bg-muted font-medium text-xs transition-colors">{{ $t('secure.cancel') }}</button>
          <button type="submit" class="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-medium text-xs shadow-sm hover:bg-primary/90 flex items-center justify-center gap-2 transition-all" :disabled="isLoading || !unlockPassword">
            <Loader2 v-if="isLoading" class="h-3.5 w-3.5 animate-spin" />
            <span v-else>{{ $t('secure.accessSessionBtn') }}</span>
          </button>
        </div>
        <button v-if="isOwner" type="button" class="block w-full text-center text-xs text-muted-foreground hover:text-foreground" @click="recoverSelected">{{ $t('vault.recover') }}</button>
      </form>
    </dialog>

    <dialog ref="noteDialog" class="note-edit-dialog vault-dialog vault-record-dialog" :aria-label="$t(editingNote.id?'secure.editSecureNote':'secure.addSecureNote')" :closedby="isLoading?'none':'closerequest'" @dblclick="event=>{if(!isLoading&&isDialogBackdropDoubleClick(event))closeNoteDialog()}" @cancel.prevent="!isLoading&&closeNoteDialog()">
      <form class="vault-dialog-layout" :data-shared-editing="showAddNoteDialog" @submit.prevent="saveNote">
        <header class="vault-dialog-header">
          <h2 class="flex items-center gap-2.5 text-[13px] font-medium"><Lock class="h-4 w-4 text-muted-foreground"/>{{ $t(editingNote.id?'secure.editSecureNote':'secure.addSecureNote') }}</h2>
          <button type="button" class="vault-icon" :disabled="isLoading" :aria-label="$t('common.close')" @click="closeNoteDialog"><X class="h-4 w-4"/></button>
        </header>
        <div class="vault-dialog-body space-y-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <label class="vault-label">{{ $t('secure.title') }}<input v-model="editingNote.title" type="text" maxlength="160" class="secure-field" required :disabled="isLoading"/></label>
            <div class="vault-label"><span>{{ $t('secure.type') }}</span><CustomSelect :model-value="editingNote.type" @update:model-value="editingNote.type=$event as 'password'|'secret'" :options="noteTypeOptions" :aria-label="$t('secure.type')" :disabled="isLoading" size="md" class="secure-type-select mt-2" popover/></div>
          </div>
          <label class="vault-label">{{ $t('secure.descriptionOptional') }}<input v-model="editingNote.description" type="text" maxlength="2000" class="secure-field" :disabled="isLoading"/></label>
          <template v-if="editingNote.type==='password'">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="vault-label">{{ $t('secure.username') }}<input v-model="editingNote.username" type="text" maxlength="500" class="secure-field" autocomplete="off" :disabled="isLoading"/></label>
              <div class="vault-label">
                <label for="vault-record-password">{{ $t('secure.password') }}</label>
                <div class="relative mt-2"><input id="vault-record-password" v-model="editingNote.password_encrypted" :type="showDialogPassword?'text':'password'" maxlength="1024" class="secure-field !mt-0 pr-11 font-mono" autocomplete="new-password" :disabled="isLoading"/><button type="button" class="vault-icon absolute right-1 top-1" :aria-label="$t(showDialogPassword?'secure.hidePassword':'secure.showPassword')" :aria-pressed="showDialogPassword" @click="showDialogPassword=!showDialogPassword"><Eye v-if="showDialogPassword" class="h-3.5 w-3.5"/><EyeOff v-else class="h-3.5 w-3.5"/></button></div>
              </div>
            </div>
            <label class="vault-label">{{ $t('secure.urlOptional') }}<input v-model="editingNote.url" type="url" maxlength="2048" class="secure-field" autocomplete="off" :disabled="isLoading"/></label>
            <button type="button" class="vault-control" :disabled="isLoading" @click="editingNote.password_encrypted=generateVaultPassword()"><Sparkles class="h-3.5 w-3.5"/>{{ $t('vault.generate') }}</button>
          </template>
          <label v-else class="vault-label">{{ $t('secure.content') }}<textarea v-model="editingNote.content" maxlength="100000" class="secure-field vault-secret-content" required :disabled="isLoading"/></label>
          <div v-if="editingNote.id" class="space-y-2 border-t border-border/50 pt-3">
            <button type="button" class="vault-control" :aria-expanded="historyOpen" :disabled="isLoading" @click="historyOpen?historyOpen=false:loadHistory()"><History class="h-3.5 w-3.5"/>{{ $t('vault.history') }}</button>
            <template v-if="historyOpen"><p class="text-[11px] leading-5 text-muted-foreground">{{ $t('vault.historyHint') }}</p><p v-if="!noteHistory.length" class="text-xs text-muted-foreground">{{ $t('vault.noHistory') }}</p><button v-for="version in noteHistory" :key="version.id" type="button" class="flex w-full justify-between rounded-lg border border-border/60 px-3 py-2 text-xs" :disabled="isLoading" @click="restoreHistory(version.id)"><span>{{ new Date(version.saved_at).toLocaleString() }}</span><span>{{ $t('vault.restore') }}</span></button></template>
          </div>
        </div>
        <footer class="vault-dialog-footer"><button type="button" class="vault-control" :disabled="isLoading" @click="closeNoteDialog">{{ $t('secure.cancel') }}</button><button type="submit" class="vault-submit" :disabled="isLoading||!editingNote.title.trim()"><Loader2 v-if="isLoading" class="h-3.5 w-3.5 animate-spin"/>{{ $t(editingNote.id?'secure.updateNote':'secure.createNote') }}</button></footer>
      </form>
    </dialog>

    <dialog @cancel.prevent="closePasswordVerification" :aria-label="$t('secure.verifyPasswordTitle')" ref="passwordVerificationDialog" class="note-edit-dialog vault-dialog vault-small-dialog space-y-4">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-sm font-medium">{{ $t('secure.verifyPasswordTitle') }}</h2>
        <button @click="closePasswordVerification" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-5 h-5" /></button>
      </div>

      <div class="space-y-5">
        <p class="text-sm font-medium text-muted-foreground/80 leading-relaxed">{{ $t('secure.verifyPasswordDesc') }}</p>
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground ml-1">{{ $t('secure.currentPassword') }}</label>
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
        <p v-if="verificationError" role="alert" class="text-xs text-destructive">{{ verificationError }}</p>
        <div class="flex justify-end gap-3 pt-4">
          <button type="button" @click="closePasswordVerification" class="px-5 py-2.5 rounded-xl font-medium text-sm bg-muted/50 hover:bg-muted text-foreground transition-colors">{{ $t('secure.cancel') }}</button>
          <button @click="verifyPassword" class="px-6 py-2.5 rounded-xl font-medium text-sm bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2" :disabled="isVerifyingPassword">
            <Loader2 v-if="isVerifyingPassword" class="w-4 h-4 animate-spin" />
            <span v-else>{{ $t('secure.verifyPasswordBtn') }}</span>
          </button>
        </div>
      </div>
    </dialog>
      
    <dialog @dblclick="event=>{if(!isLoading && isDialogBackdropDoubleClick(event))closeSessionDialog()}" @cancel.prevent="!isLoading && closeSessionDialog()" :aria-label="$t('secure.editSession')" ref="sessionDialog" class="note-edit-dialog vault-dialog vault-small-dialog space-y-4">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-sm font-medium">{{ $t('secure.editSessionTitle') }}</h2>
        <button :disabled="isLoading" @click="closeSessionDialog" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-5 h-5" /></button>
      </div>

      <form @submit.prevent="saveSession" :data-shared-editing="showSessionDialog" class="space-y-5">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground ml-1">{{ $t('secure.sessionName') }}</label>
          <input v-model="editingSession.name" type="text" class="secure-field w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" required />
        </div>
        <div class="flex justify-end gap-3 pt-4">
          <button type="button" :disabled="isLoading" @click="closeSessionDialog" class="px-5 py-2.5 rounded-xl font-medium text-sm bg-muted/50 hover:bg-muted text-foreground transition-colors">{{ $t('secure.cancel') }}</button>
          <button type="submit" class="px-6 py-2.5 rounded-xl font-medium text-sm bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2" :disabled="isLoading">
            <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
            <span v-else>{{ $t('secure.updateSessionBtn') }}</span>
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { isDialogBackdropDoubleClick } from '@/lib/utils'
import { useModuleAccess, useModuleLoad } from '@/lib/workspaceScope'
import { ref, shallowRef, computed, onBeforeUnmount, onDeactivated, onMounted, onActivated, watch } from 'vue'
import { Lock, Eye, EyeOff, Edit, X, Loader2, ChevronRight, ShieldCheck, Upload, Trash2, Sparkles, History } from 'lucide-vue-next'
import { useWorkspaceClient } from '@/lib/workspaceScope'
import { unlockVaultKey, encryptVaultValue, decryptVaultValue, isSealedVault, isRecoverableVault, vaultKeyId, generateVaultPassword } from '@/lib/vaultCrypto'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import SecureNoteItem from './SecureNoteItem.vue'
import VaultNotice from './VaultNotice.vue'
import VaultManager from './VaultManager.vue'

interface SecureNote {
  id: string; title: string; description?: string; type: 'password' | 'secret'; username?: string
  password_encrypted?: string; url?: string; content?: string; created_at: string; updated_at: string
  session_id: string; version?: number; deleted_at?:string|null; encrypted_payload?: Awaited<ReturnType<typeof encryptVaultValue>> & { key_id?: string }
}
interface PasswordSession { id: string; name: string; password_hash: string; created_at: string; updated_at?: string; version?: number }
const { canWrite } = useModuleAccess('secure')

const { t } = useI18n()
const authStore = useAuthStore(), supabase = useWorkspaceClient(), uiStore = useUIStore()
const isOwner=computed(()=>supabase.isOwner('secure'))
const manager=ref<InstanceType<typeof VaultManager>>()
const showDeleted=ref(false),historyOpen=ref(false),noteHistory=ref<{id:string;saved_at:string}[]>([])
const visibleNotes=computed(()=>secureNotes.value.filter(note=>showDeleted.value?note.deleted_at&&Date.parse(note.deleted_at)>Date.now()-30*86400000:!note.deleted_at))
function openManagement(){if(currentSession.value&&isOwner.value)manager.value?.open(isRecoverableVault(currentSession.value.password_hash)?'password':'upgrade',currentSession.value)}
function recoverSelected(){const session=selectedSessionForUnlock.value;if(!session)return;closeUnlockDialog();manager.value?.open(isRecoverableVault(session.password_hash)?'recover':'upgrade',session)}
async function vaultChanged(){lockVault(false);inlineSessionName.value='';await loadPasswordSessions()}
const noteTypeOptions = computed(() => [
  { value: 'password', label: t('secure.typePassword') }, { value: 'secret', label: t('secure.typeSecret') }
])
const isAuthenticated = ref(false), currentSession = ref<PasswordSession | null>(null)
const passwordSessions = ref<PasswordSession[]>([]), secureNotes = ref<SecureNote[]>([])
const vaultKey = shallowRef<CryptoKey | null>(null)
let lockEpoch = 0, noteLoad=0
const showUnlockPassword = ref(false), showDialogPassword = ref(false)
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
const lockVault = (closeManager=true) => {
  noteDraftTitle.value='';noteDraftType.value='password'
  inlineSessionName.value='';showUnlockPassword.value=false;showDialogPassword.value=false;showVerificationPassword.value=false;showEditSessionPassword.value=false;verificationError.value=''
  lockEpoch++; vaultKey.value = null; isAuthenticated.value = false; currentSession.value = null; secureNotes.value = []
  editingNote.value = { title: '', type: 'password' }; editingSession.value = { name: '', password: '' }
  inlineSessionPassword.value = ''; unlockPassword.value = ''; verificationPassword.value = ''
  selectedSessionForUnlock.value = null; unlockDialog.value?.close()
  showAddNoteDialog.value = false; showSessionDialog.value = false; showPasswordVerification.value = false
  showDeleted.value=false;historyOpen.value=false;noteHistory.value=[]
  if(closeManager)manager.value?.close(true)
}
const showFailure = (err: unknown) => {
  const message = (err as Error)?.message || ''
  uiStore.addToast(t(message.includes('SHARING_CONFLICT') ? 'sharing.conflict'
    : message.includes('VAULT_HTTPS_REQUIRED') ? 'secure.httpsRequired' : message.includes('VAULT_ACK_REQUIRED')?'vault.errors.VAULT_ACK_REQUIRED':'sharing.errors.SAVE_FAILED'), 'error')
}
const fetchRows = async (sessionId: string): Promise<SecureNote[]> => {
  const rows:SecureNote[]=[]
  for(let start=0;;start+=500){
    const {data,error}=await supabase.from('secure_notes').select('*').eq('session_id',sessionId).order('created_at',{ascending:false}).order('id').range(start,start+499)
    if(error)throw error
    rows.push(...(data||[]));if((data||[]).length<500)return rows
  }
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
  const session = currentSession.value, key = vaultKey.value, epoch = lockEpoch,ticket=++noteLoad
  if (!session) return
  const rows = await fetchRows(session.id)
  const decoded = key ? await Promise.all(rows.map(async row => {
    if (!row.encrypted_payload) throw new Error('VAULT_INVALID_DATA')
    return { ...row, ...await decryptVaultValue<ReturnType<typeof sensitive>>(key, row.encrypted_payload, session.id + ':' + row.id) }
  })) : rows
  if (epoch === lockEpoch && ticket===noteLoad && currentSession.value?.id === session.id) secureNotes.value = decoded
}
const handleInlineAddSession = () => {
  if (isLoading.value || !inlineSessionName.value.trim() || !isOwner.value) return
  manager.value?.open('create',null,inlineSessionName.value.trim())
}
const promptSessionUnlock = (session: PasswordSession) => {
  if(isOwner.value&&!isSealedVault(session.password_hash)){manager.value?.open('upgrade',session);return}
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
      if (!isOwner.value) { uiStore.addToast(t('vault.ownerOnly'),'info'); return }
      closeUnlockDialog(); manager.value?.open('upgrade',session); return
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
  if(isLoading.value||!noteDraftTitle.value.trim())return
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
    const { data, error } = await supabase.from('password_sessions').update({ name: editingSession.value.name, version: editingSession.value.version }).eq('id', session.id).select().single()
    if (error) throw error
    updated = data
    if (epoch !== lockEpoch) return
    vaultKey.value = nextKey
    const index = passwordSessions.value.findIndex(s => s.id === session.id)
    if (index !== -1) passwordSessions.value[index] = updated
    currentSession.value = updated; await loadSecureNotes(); closeSessionDialog()
    uiStore.addToast(t('secure.sessionUpdated'), 'success')
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}
const editNote = (note: SecureNote) => { historyOpen.value=false;noteHistory.value=[];editingNote.value = { ...note }; showDialogPassword.value = false; showAddNoteDialog.value = true }
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
    const note=secureNotes.value.find(n=>n.id===id)
    if(!note?.version)return
    await supabase.vaultRecordAction(id,note.version,'trash')
    await loadSecureNotes()
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}

async function restoreNote(note:SecureNote){
  if(!canWrite.value||isLoading.value||!note.version)return
  isLoading.value=true
  try{await supabase.vaultRecordAction(note.id,note.version,'restore');await loadSecureNotes()}catch(err){showFailure(err)}finally{isLoading.value=false}
}
async function loadHistory(){
  const id=editingNote.value.id,epoch=lockEpoch;if(!id)return
  try{const data=await supabase.vaultHistory(id);if(epoch!==lockEpoch||editingNote.value.id!==id)return;noteHistory.value=data||[];historyOpen.value=true}catch(err){showFailure(err)}
}
async function restoreHistory(id:string){
  const note=editingNote.value,epoch=lockEpoch;if(!note.id||!note.version||isLoading.value)return
  isLoading.value=true
  try{await supabase.vaultRecordAction(note.id,note.version,'history',id);if(epoch!==lockEpoch)return;await loadSecureNotes();closeNoteDialog()}catch(err){showFailure(err)}finally{isLoading.value=false}
}
watch(showAddNoteDialog, show => { if (show) noteDialog.value?.showModal(); else noteDialog.value?.close() })
watch(showSessionDialog, show => { if (show) sessionDialog.value?.showModal(); else sessionDialog.value?.close() })
watch(showPasswordVerification, show => { if (show) passwordVerificationDialog.value?.showModal(); else passwordVerificationDialog.value?.close() })
supabase.listen({
  password_sessions: loadPasswordSessions,
  secure_notes: async () => { try { await loadSecureNotes() } catch (err) { lockVault(); showFailure(err) } }
}, () => isLoading.value || isVerifyingPassword.value)
useModuleLoad(loadPasswordSessions)
// Check elapsed wall time on return too: background tabs can throttle timers.
let lastActivity=Date.now(),hiddenAt=0,active=true,lockTimer:ReturnType<typeof setInterval>|undefined
const touch=()=>{lastActivity=Date.now()}
const checkLock=()=>{if(active&&(Date.now()-lastActivity>=300000||(hiddenAt>0&&Date.now()-hiddenAt>=60000))){lockVault();lastActivity=Date.now()}}
const visibility=()=>{if(document.hidden){hiddenAt=Date.now()}else{checkLock();hiddenAt=0}}
onMounted(()=>{
  document.addEventListener('pointerdown',touch,{passive:true});document.addEventListener('keydown',touch);document.addEventListener('visibilitychange',visibility)
  document.addEventListener('wheel',touch,{passive:true});window.addEventListener('pagehide',pageHide)
  hiddenAt=document.hidden?Date.now():0
  lockTimer=setInterval(checkLock,1000)
})
onActivated(()=>{active=true;lastActivity=Date.now()})
onDeactivated(()=>{active=false;lockVault()})
const pageHide=()=>lockVault()
onBeforeUnmount(()=>{active=false;if(lockTimer)clearInterval(lockTimer);document.removeEventListener('pointerdown',touch);document.removeEventListener('keydown',touch);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('wheel',touch);window.removeEventListener('pagehide',pageHide);lockVault()})
</script>

<style scoped>
.vault-create-form,.vault-entry-form { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:8px; }
.vault-entry-form { grid-template-columns:minmax(0,1fr) 140px auto; }
.vault-field { @apply h-10 w-full min-w-0 rounded-xl border border-border/70 bg-card/65 px-3 text-[13px] text-foreground shadow-[0_1px_3px_rgb(15,23,42,0.025)] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50 dark:bg-muted/[0.08]; }
.vault-create-form .vault-primary,.vault-entry-form .vault-primary { height:40px; }
.vault-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr)); align-items:start; gap:12px; }
.vault-session-lock { @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30 text-muted-foreground; }
@media(max-width:639px){
 .vault-grid{gap:10px}
 .vault-create-form,.vault-entry-form{grid-template-columns:minmax(0,1fr) auto}
 .vault-create-form>input,.vault-entry-form>input{grid-column:1 / -1}
}
.vault-icon { @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40; }
.vault-primary { @apply inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40; }
.vault-session { @apply flex min-h-[92px] w-full items-center gap-3 rounded-2xl bg-card/50 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30; }
.vault-dialog { max-height:calc(100dvh - 32px); overflow-y:auto; overscroll-behavior:contain; }
.vault-dialog::backdrop { background:hsl(var(--background)/.75); backdrop-filter:blur(6px); }

.vault-control { @apply inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-card/60 px-3 text-xs font-medium text-muted-foreground shadow-[0_1px_2px_rgb(15,23,42,0.025)] transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-40; }
.vault-control.is-active { @apply border-primary/20 bg-primary/[0.06] text-primary; }
.vault-action { @apply border border-border/60 bg-card/60; }
.vault-selector :deep(.select-trigger) { height:36px; border-color:hsl(var(--border)/.7); border-radius:12px; }
.vault-dialog { height:auto; border-radius:18px; }
.vault-small-dialog { max-width:400px; padding:20px; }
.vault-small-dialog .secure-field { margin-top:0; }
.vault-record-dialog { max-width:640px; padding:0; overflow:hidden; }
.vault-dialog-layout { display:flex; flex-direction:column; min-height:0; max-height:calc(100dvh - 48px); }
.vault-dialog-header { @apply flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-5 py-4; }
.vault-dialog-body { @apply min-h-0 overflow-y-auto px-5 py-5; }
.vault-dialog-footer { @apply flex shrink-0 items-center justify-end gap-2 border-t border-border/50 px-5 py-4; }
.vault-label { @apply block text-[11px] font-medium text-muted-foreground; }
.secure-field { @apply mt-2 h-10 w-full min-w-0 rounded-xl border border-border/60 bg-background/50 px-3 text-[13px] font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-50; }
.vault-secret-content { height:160px; min-height:120px; padding-top:10px; padding-bottom:10px; resize:vertical; }
.secure-type-select :deep(.select-trigger) { height:40px; min-height:40px; font-size:13px; font-weight:400; }
.vault-submit { @apply inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40; }
@media(max-width:639px){.vault-record-dialog{width:calc(100vw - 24px)}.vault-dialog-layout{max-height:calc(100dvh - 32px)}.vault-dialog-header,.vault-dialog-footer{padding:14px 16px}.vault-dialog-body{padding:16px}}
</style>
