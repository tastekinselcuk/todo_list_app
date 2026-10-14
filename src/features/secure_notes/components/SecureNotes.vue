<template>
  <div class="space-y-5 relative z-10 w-full flex flex-col items-center">
    
    <div v-if="!isAuthenticated" style="--workspace-default-max:72rem" class="workspace-content mx-auto space-y-6">
      
      <div v-if="canWrite" class="flex flex-col md:flex-row gap-2.5 w-full relative z-[60]" style="overflow: visible;">
        <div class="relative flex-1 group">
          <Shield class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            v-model="inlineSessionName"
            type="text"
            :placeholder="$t('secure.sessionNamePlaceholder')"
            class="secure-field w-full h-10 pl-10 pr-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-medium"
            @keyup.enter="handleInlineAddSession"
          />
        </div>

        <div class="relative flex-1 group">
          <Lock class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            v-model="inlineSessionPassword"
            :type="showInlinePassword ? 'text' : 'password'"
            :placeholder="$t('secure.sessionPasswordPlaceholder')"
            class="secure-field w-full h-10 pl-10 pr-10 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-mono tracking-wide"
            @keyup.enter="handleInlineAddSession"
          />
          <button
            type="button"
            @click="showInlinePassword = !showInlinePassword"
            class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <Eye v-if="showInlinePassword" class="h-3.5 w-3.5" />
            <EyeOff v-else class="h-3.5 w-3.5" />
          </button>
        </div>
        
        <button
          @click="handleInlineAddSession"
          class="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm hover:shadow-lg transition-all disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shrink-0"
          :disabled="!inlineSessionName.trim() || !inlineSessionPassword.trim() || isLoading"
        >
          <Loader2 v-if="isLoading" class="w-3.5 h-3.5 animate-spin" />
          <Plus v-else class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">{{ $t('secure.newSession') }}</span>
          <span class="sm:hidden">{{ $t('secure.addShort') }}</span>
        </button>
      </div>

      <div v-if="passwordSessions.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
        <div
          v-for="session in passwordSessions"
          :key="session.id"
          @click="promptSessionUnlock(session)"
          class="group flex flex-col p-5 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl hover:bg-card hover:border-primary/30 hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden"
        >
          <div class="flex items-start justify-between relative z-10">
            <div class="w-10 h-10 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center transition-colors">
              <Lock class="w-4 h-4" />
            </div>
          </div>
          <div class="mt-4 space-y-1 relative z-10">
            <h3 class="font-bold text-base text-foreground tracking-tight group-hover:text-primary transition-colors truncate">
              {{ session.name }}
            </h3>
            <p class="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              {{ formatDate(session.created_at) }}
            </p>
          </div>
        </div>
      </div>
        
      <div v-else class="text-center py-16 bg-card/20 backdrop-blur-sm border border-dashed border-border/50 rounded-[2rem]">
        <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Shield class="w-5 h-5 text-muted-foreground/40" />
        </div>
        <p class="text-sm font-semibold text-muted-foreground/80">{{ $t('secure.noSessions') }}</p>
      </div>
    </div>

    <div v-else style="--workspace-default-max:72rem" class="workspace-content mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
      
      <div class="flex flex-col sm:flex-row items-center justify-between bg-card/40 backdrop-blur-2xl p-4 sm:p-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 dark:border-white/5 gap-4 relative overflow-hidden">
        <div class="absolute -left-10 -top-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px] pointer-events-none"></div>

        <div class="flex items-center gap-4 relative z-10 w-full sm:w-auto justify-center sm:justify-start">
          <div class="w-12 h-12 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-inner shrink-0">
            <Shield class="h-6 w-6" />
          </div>
          <div class="text-center sm:text-left">
            <h2 class="text-lg font-bold tracking-tight text-foreground">{{ currentSession?.name }}</h2>
            <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center justify-center sm:justify-start gap-1 mt-0.5">
              <Lock class="w-3 h-3" /> {{ $t('secure.vaultUnlocked') }}
            </p>
          </div>
        </div>
        
        <div class="flex flex-wrap items-center justify-center gap-2 relative z-10">
          <button v-if="canWrite" @click="openAddNoteDialog" class="h-9 px-4 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors">
            <Plus class="h-4 w-4" /> {{ $t('secure.addNote') }}
          </button>
          
          <div class="w-px h-6 bg-border/50 mx-1 hidden sm:block"></div>

          <button v-if="canWrite" @click="editSession(currentSession!)" class="h-9 w-9 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-muted text-foreground border border-border/50 transition-colors" :title="$t('secure.editSession')">
            <Edit class="h-4 w-4" />
          </button>
          <button v-if="canWrite" @click="deleteCurrentSession" class="h-9 w-9 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border/50 hover:border-rose-500/20 transition-colors" :title="$t('secure.deleteSession')">
            <Trash2 class="h-4 w-4" />
          </button>
          <button @click="logout" class="h-9 w-9 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50 transition-colors" :title="$t('secure.logout')">
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SecureNoteItem
          v-for="note in secureNotes"
          :key="note.id"
          :note="note"
          @edit="editNote"
          @delete="deleteNote"
        />

        <div v-if="secureNotes.length === 0" class="col-span-full text-center py-16 bg-card/20 backdrop-blur-sm border border-dashed border-border/50 rounded-[2rem]">
          <Shield class="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p class="text-sm font-semibold text-muted-foreground/80">{{ $t('secure.noNotes') }}</p>
        </div>
      </div>
    </div>

    <dialog ref="unlockDialog" class="w-[90vw] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-card/90 backdrop-blur-2xl text-card-foreground shadow-2xl p-6 sm:p-8 space-y-6">
      <div class="text-center space-y-2 mb-2">
        <div class="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-3 border border-primary/20">
          <Lock class="h-5 w-5" />
        </div>
        <h2 class="text-xl font-bold tracking-tight text-foreground">{{ $t('secure.accessSessionTitle', { name: selectedSessionForUnlock?.name }) }}</h2>
        <p class="text-xs font-medium text-muted-foreground/80">{{ $t('secure.accessSessionSubtitle', { name: selectedSessionForUnlock?.name }) }}</p>
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

    <dialog ref="noteDialog" class="w-[90vw] max-w-lg rounded-[2rem] border border-white/10 dark:border-white/5 bg-card/90 backdrop-blur-2xl text-card-foreground shadow-2xl p-6 sm:p-8 space-y-6">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-lg font-bold tracking-tight">{{ editingNote.id ? $t('secure.editSecureNote') : $t('secure.addSecureNote') }}</h2>
        <button @click="closeNoteDialog" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-5 h-5" /></button>
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
          <button type="button" @click="closeNoteDialog" class="px-5 py-2.5 rounded-xl font-semibold text-sm bg-muted/50 hover:bg-muted transition-colors">{{ $t('secure.cancel') }}</button>
          <button type="submit" class="px-6 py-2.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2" :disabled="isLoading">
            <Loader2 v-if="isLoading" class="w-4 h-4 animate-spin" />
            <span v-else>{{ editingNote.id ? $t('secure.updateNote') : $t('secure.createNote') }}</span>
          </button>
        </div>
      </form>
    </dialog>

    <dialog ref="passwordVerificationDialog" class="w-[90vw] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-card/90 backdrop-blur-2xl text-card-foreground shadow-2xl p-6 sm:p-8 space-y-6">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-lg font-bold tracking-tight">{{ $t('secure.verifyPasswordTitle') }}</h2>
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
      
    <dialog ref="sessionDialog" class="w-[90vw] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-card/90 backdrop-blur-2xl text-card-foreground shadow-2xl p-6 sm:p-8 space-y-6">
      <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
        <h2 class="text-lg font-bold tracking-tight">{{ $t('secure.editSessionTitle') }}</h2>
        <button @click="closeSessionDialog" class="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X class="w-5 h-5" /></button>
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
          <button type="button" @click="closeSessionDialog" class="px-5 py-2.5 rounded-xl font-semibold text-sm bg-muted/50 hover:bg-muted text-foreground transition-colors">{{ $t('secure.cancel') }}</button>
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
import { useModuleAccess } from '@/lib/workspaceScope'
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, onDeactivated, watch } from 'vue'
import { Lock, Shield, Eye, EyeOff, Plus, Edit, Trash2, X, LogOut, Loader2 } from 'lucide-vue-next'
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
  editingNote.value = { title: '', description: '', type: 'password', username: '', password_encrypted: '', url: '', content: '' }
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
  if (!session) return
  if (!await uiStore.showConfirm(t('secure.deleteSession'), t('secure.deleteSessionConfirm', { name: session.name }), t('secure.deleteSession'), t('secure.cancel'))) return
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
    if (epoch !== lockEpoch || currentSession.value?.id !== sessionId) return
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
    await loadSecureNotes(); closeNoteDialog()
    uiStore.addToast(t('secure.noteSaved'), 'success')
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}
const deleteNote = async (id: string) => {
  if (!await uiStore.showConfirm(t('secure.deleteNoteTitle'), t('secure.deleteNoteConfirm'), t('secure.deleteNoteTitle'), t('secure.cancel'))) return
  isLoading.value = true
  try {
    const { error } = await supabase.from('secure_notes').delete().eq('id', id)
    if (error) throw error
    secureNotes.value = secureNotes.value.filter(n => n.id !== id)
  } catch (err) { showFailure(err) } finally { isLoading.value = false }
}
const formatDate = (date: string) => new Date(date).toLocaleDateString(t('workspace.language') === 'Dil' ? 'tr-TR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
watch(showAddNoteDialog, show => { if (show) noteDialog.value?.showModal(); else noteDialog.value?.close() })
watch(showSessionDialog, show => { if (show) sessionDialog.value?.showModal(); else sessionDialog.value?.close() })
watch(showPasswordVerification, show => { if (show) passwordVerificationDialog.value?.showModal(); else passwordVerificationDialog.value?.close() })
supabase.listen({
  password_sessions: loadPasswordSessions,
  secure_notes: async () => { try { await loadSecureNotes() } catch (err) { lockVault(); showFailure(err) } }
}, () => isLoading.value || isVerifyingPassword.value)
onMounted(loadPasswordSessions)
onDeactivated(lockVault)
onBeforeUnmount(lockVault)
</script>

<style scoped>
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
