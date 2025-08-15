<template>
  <div class="space-y-6">
         <!-- Password Entry Section -->
     <div v-if="!isAuthenticated" class="max-w-2xl mx-auto space-y-6">
               <!-- Sessions Management -->
        <div class="bg-white p-6 rounded-lg shadow-sm border space-y-4">
          <div class="relative">
            <div class="text-center space-y-2">
              <Shield class="h-12 w-12 mx-auto text-primary" />
              <h2 class="text-xl font-semibold">Password Sessions</h2>
              <p class="text-sm text-gray-600">Manage your secure note sessions</p>
            </div>
            <button
              @click="openAddSessionDialog"
              class="absolute top-0 right-0 px-4 py-2 rounded-md bg-primary text-white hover:bg-primary/90 flex items-center gap-2"
            >
              <Plus class="h-4 w-4" />
              New Session
            </button>
          </div>
         
                   <!-- Sessions List -->
          <div v-if="passwordSessions.length > 0" class="space-y-3">
            <div
              v-for="session in passwordSessions"
              :key="session.id"
              :class="[
                'flex items-center justify-between p-4 border rounded-lg transition-all duration-200',
                selectedSession?.id === session.id
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'hover:bg-accent border-gray-200'
              ]"
            >
              <div 
                :class="[
                  'flex-1 cursor-pointer transition-colors',
                  selectedSession?.id === session.id
                    ? 'text-primary'
                    : 'hover:text-primary'
                ]"
                @click="selectSession(session)"
              >
                <div class="flex items-center gap-2">
                  <h3 class="font-medium">{{ session.name }}</h3>
                  <span 
                    v-if="selectedSession?.id === session.id"
                    class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary text-white"
                  >
                    Selected
                  </span>
                </div>
                <p class="text-sm text-gray-600">Created: {{ formatDate(session.createdAt) }}</p>
              </div>
              <div class="flex items-center gap-2">
                <!-- No buttons in session list - only delete from within session -->
              </div>
            </div>
          </div>
         
         <div v-else class="text-center py-8 text-gray-500">
           <Shield class="h-12 w-12 mx-auto mb-3 opacity-50" />
           <p>No password sessions yet. Create your first session to get started!</p>
         </div>
       </div>
       
        <!-- Login Section -->
        <div id="password-input-section" v-if="selectedSession" class="bg-white p-6 rounded-lg shadow-sm border space-y-4">
          <div class="text-center space-y-2">
            <Lock class="h-12 w-12 mx-auto text-primary" />
            <h2 class="text-xl font-semibold">Access {{ selectedSession.name }}</h2>
            <p class="text-sm text-gray-600">Enter password for {{ selectedSession.name }} session</p>
          </div>
          
          <form @submit.prevent="authenticate" class="space-y-4">
            <div class="space-y-2">
              <label for="master-password" class="text-sm font-medium">Session Password</label>
              <div class="relative">
                <input
                  id="master-password"
                  v-model="masterPassword"
                  :type="showPassword ? 'text' : 'password'"
                  class="w-full rounded-md border border-input px-3 py-2 pr-10 text-sm"
                  :placeholder="`Enter password for ${selectedSession.name}`"
                  required
                />

                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded"
                >
                  <Eye v-if="showPassword" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div class="flex gap-2">
              <button
                type="button"
                @click="selectedSession = null"
                class="flex-1 px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="flex-1 bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 transition-colors"
                :disabled="isLoading"
              >
                <Loader2 v-if="isLoading" class="h-4 w-4 mx-auto animate-spin" />
                <span v-else>Access Session</span>
              </button>
            </div>
          </form>
          
          <div v-if="errorMessage" class="text-red-500 text-sm text-center">
            {{ errorMessage }}
          </div>
        </div>
     </div>

    <!-- Secure Notes Content -->
    <div v-else class="space-y-4">
             <!-- Header with Logout -->
       <div class="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
         <div class="flex items-center gap-3">
           <Shield class="h-6 w-6 text-green-600" />
           <div>
             <h2 class="text-lg font-semibold">Secure Notes</h2>
             <p class="text-sm text-gray-600">{{ currentSession?.name }} - Your private notes and passwords</p>
           </div>
         </div>
         
         <div class="flex items-center gap-2">
           <button
             @click="editSession(currentSession)"
             class="px-3 h-8 rounded-md text-xs border border-blue-200 text-blue-600 hover:bg-blue-50 flex items-center gap-1"
           >
             <Edit class="h-3 w-3" />
             Edit Session
           </button>
           <button
             @click="deleteCurrentSession"
             class="px-3 h-8 rounded-md text-xs border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"
           >
             <Trash2 class="h-3 w-3" />
             Delete Session
           </button>
           <button
             @click="showAddNoteDialog = true"
             class="px-3 h-8 rounded-md text-xs bg-primary text-white hover:bg-primary/90 flex items-center gap-1"
           >
             <Plus class="h-3 w-3" />
             Add Note
           </button>
           <button
             @click="logout"
             class="px-3 h-8 rounded-md text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
           >
             <LogOut class="h-3 w-3" />
             Logout
           </button>
         </div>
       </div>

      <!-- Notes List -->
      <div class="space-y-3">
        <div
          v-for="note in secureNotes"
          :key="note.id"
          class="bg-white p-4 rounded-lg shadow-sm border space-y-3"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <h3 class="font-medium">{{ note.title }}</h3>
                <span
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                  :class="{
                    'bg-blue-100 text-blue-700': note.type === 'password',
                    'bg-purple-100 text-purple-700': note.type === 'note',
                    'bg-orange-100 text-orange-700': note.type === 'secret'
                  }"
                >
                  {{ note.type }}
                </span>
              </div>
              
              <p v-if="note.description" class="text-sm text-gray-600 mb-3">
                {{ note.description }}
              </p>
              
              <!-- Password Fields (if type is password) -->
              <div v-if="note.type === 'password'" class="space-y-2">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-xs font-medium text-gray-500">Username</label>
                    <div class="flex items-center gap-2 mt-1">
                      <input
                        :value="note.username || ''"
                        readonly
                        class="flex-1 text-sm bg-gray-50 border border-gray-200 px-2 py-1 rounded"
                      />
                      <button
                        @click="copyToClipboard(note.username || '')"
                        class="p-1 hover:bg-gray-200 rounded"
                        title="Copy username"
                      >
                        <Copy class="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label class="text-xs font-medium text-gray-500">Password</label>
                    <div class="flex items-center gap-2 mt-1">
                      <input
                        :value="note.password || ''"
                        readonly
                        class="flex-1 text-sm bg-gray-50 border border-gray-200 px-2 py-1 rounded"
                      />
                      <button
                        @click="copyToClipboard(note.password || '')"
                        class="p-1 hover:bg-gray-200 rounded"
                        title="Copy password"
                      >
                        <Copy class="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div v-if="note.url" class="flex items-center gap-2">
                  <label class="text-xs font-medium text-gray-500">URL:</label>
                  <a
                    :href="note.url"
                    target="_blank"
                    class="text-sm text-blue-600 hover:underline"
                  >
                    {{ note.url }}
                  </a>
                </div>
              </div>
              
              <!-- Regular Note Content -->
              <div v-else-if="note.type === 'note'" class="bg-gray-50 p-3 rounded border">
                <p class="text-sm whitespace-pre-wrap">{{ note.content }}</p>
              </div>
              
              <!-- Secret Content -->
              <div v-else-if="note.type === 'secret'" class="bg-gray-50 p-3 rounded border">
                <p class="text-sm font-mono">{{ note.content }}</p>
              </div>
            </div>
            
            <div class="flex items-center gap-1">
              <button
                @click="editNote(note)"
                class="p-2 hover:bg-accent rounded"
                title="Edit note"
              >
                <Edit class="h-4 w-4" />
              </button>
              <button
                @click="deleteNote(note.id)"
                class="p-2 hover:bg-accent text-red-500 rounded"
                title="Delete note"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <div class="flex items-center justify-between text-xs text-gray-500">
            <span>Created: {{ formatDate(note.createdAt) }}</span>
            <span v-if="note.updatedAt !== note.createdAt">
              Updated: {{ formatDate(note.updatedAt) }}
            </span>
          </div>
        </div>
        
        <div v-if="secureNotes.length === 0" class="text-center py-8 text-gray-500">
          <Shield class="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No secure notes yet. Create your first private note!</p>
        </div>
      </div>
    </div>

    <!-- Add/Edit Note Dialog -->
    <dialog
      ref="noteDialog"
      class="p-6 rounded-lg shadow-lg bg-white w-full max-w-lg border"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold">
          {{ editingNote.id ? 'Edit' : 'Add' }} Secure Note
        </h2>
        <button
          @click="closeNoteDialog"
          class="p-1 hover:bg-accent rounded"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <form @submit.prevent="saveNote" class="space-y-4">
        <div class="space-y-2">
          <label for="note-title" class="text-sm font-medium">Title</label>
          <input
            id="note-title"
            v-model="editingNote.title"
            type="text"
            class="w-full rounded-md border border-input px-3 py-2"
            required
          />
        </div>
        
        <div class="space-y-2">
          <label for="note-type" class="text-sm font-medium">Type</label>
          <select
            id="note-type"
            v-model="editingNote.type"
            class="w-full rounded-md border border-input px-3 py-2"
            required
          >
            <option value="password">Password</option>
            <option value="note">Note</option>
            <option value="secret">Secret</option>
          </select>
        </div>
        
        <div class="space-y-2">
          <label for="note-description" class="text-sm font-medium">Description (Optional)</label>
          <input
            id="note-description"
            v-model="editingNote.description"
            type="text"
            class="w-full rounded-md border border-input px-3 py-2"
            placeholder="Brief description of this note"
          />
        </div>
        
        <!-- Password Fields -->
        <div v-if="editingNote.type === 'password'" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <label for="note-username" class="text-sm font-medium">Username</label>
              <input
                id="note-username"
                v-model="editingNote.username"
                type="text"
                class="w-full rounded-md border border-input px-3 py-2"
                placeholder="Username or email"
              />
            </div>
            
            <div class="space-y-2">
              <label for="note-password" class="text-sm font-medium">Password</label>
              <input
                id="note-password"
                v-model="editingNote.password"
                type="text"
                class="w-full rounded-md border border-input px-3 py-2"
                placeholder="Password"
              />
            </div>
          </div>
          
          <div class="space-y-2">
            <label for="note-url" class="text-sm font-medium">URL (Optional)</label>
            <input
              id="note-url"
              v-model="editingNote.url"
              type="url"
              class="w-full rounded-md border border-input px-3 py-2"
              placeholder="https://example.com"
            />
          </div>
        </div>
        
        <!-- Note/Secret Content -->
        <div v-else class="space-y-2">
          <label for="note-content" class="text-sm font-medium">Content</label>
          <textarea
            id="note-content"
            v-model="editingNote.content"
            class="w-full rounded-md border border-input px-3 py-2 min-h-[100px]"
            :placeholder="editingNote.type === 'secret' ? 'Enter your secret content...' : 'Enter your note content...'"
            required
          ></textarea>
        </div>
        
        <div class="flex justify-end gap-2 pt-4 border-t">
          <button
            type="button"
            @click="closeNoteDialog"
            class="px-4 py-2 rounded-md text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 rounded-md bg-primary text-white text-sm hover:bg-primary/90"
          >
            {{ editingNote.id ? 'Update' : 'Create' }} Note
          </button>
        </div>
      </form>
         </dialog>
     
     <!-- Password Verification Dialog -->
     <dialog
       ref="passwordVerificationDialog"
       class="p-6 rounded-lg shadow-lg bg-white w-full max-w-md border"
     >
       <div class="flex justify-between items-center mb-4">
         <h2 class="text-lg font-semibold">Verify Password</h2>
         <button
           @click="closePasswordVerification"
           class="p-1 hover:bg-accent rounded"
         >
           <X class="h-4 w-4" />
         </button>
       </div>

       <div class="space-y-4">
         <p class="text-sm text-gray-600">
           Please enter your current password to edit this session.
         </p>
         
         <div class="space-y-2">
           <label for="verification-password" class="text-sm font-medium">Current Password</label>
           <div class="relative">
             <input
               id="verification-password"
               v-model="verificationPassword"
               :type="showPassword ? 'text' : 'password'"
               class="w-full rounded-md border border-input px-3 py-2 pr-10"
               placeholder="Enter your current password"
               required
             />
             <button
               type="button"
               @click="showPassword = !showPassword"
               class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded"
             >
               <Eye v-if="showPassword" class="h-4 w-4" />
               <EyeOff v-else class="h-4 w-4" />
             </button>
           </div>
         </div>
         
         <div v-if="verificationError" class="text-red-500 text-sm text-center">
           {{ verificationError }}
         </div>
         
         <div class="flex justify-end gap-2 pt-4 border-t">
           <button
             type="button"
             @click="closePasswordVerification"
             class="px-4 py-2 rounded-md text-sm hover:bg-accent"
           >
             Cancel
           </button>
           <button
             @click="verifyPassword"
             class="px-4 py-2 rounded-md bg-primary text-white text-sm hover:bg-primary/90"
             :disabled="isVerifyingPassword"
           >
             <Loader2 v-if="isVerifyingPassword" class="h-4 w-4 animate-spin" />
             <span v-else>Verify Password</span>
           </button>
         </div>
       </div>
     </dialog>
     
     <!-- Add/Edit Session Dialog -->
     <dialog
       ref="sessionDialog"
       class="p-6 rounded-lg shadow-lg bg-white w-full max-w-md border"
     >
       <div class="flex justify-between items-center mb-4">
         <h2 class="text-lg font-semibold">
           {{ editingSession.id ? 'Edit' : 'Add' }} Password Session
         </h2>
         <button
           @click="closeSessionDialog"
           class="p-1 hover:bg-accent rounded"
         >
           <X class="h-4 w-4" />
         </button>
       </div>

       <form @submit.prevent="saveSession" class="space-y-4">
         <div class="space-y-2">
           <label for="session-name" class="text-sm font-medium">Session Name</label>
           <input
             id="session-name"
             v-model="editingSession.name"
             type="text"
             class="w-full rounded-md border border-input px-3 py-2"
             placeholder="e.g., Work, Personal, Banking"
             required
           />
         </div>
         
         <div class="space-y-2">
           <label for="session-password" class="text-sm font-medium">Session Password</label>
           <div class="relative">
             <input
               id="session-password"
               v-model="editingSession.password"
               :type="showPassword ? 'text' : 'password'"
               class="w-full rounded-md border border-input px-3 py-2 pr-10"
               placeholder="Enter a password for this session"
               required
             />
             <button
               type="button"
               @click="showPassword = !showPassword"
               class="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded"
             >
               <Eye v-if="showPassword" class="h-4 w-4" />
               <EyeOff v-else class="h-4 w-4" />
             </button>
           </div>
         </div>
         
         <div v-if="sessionError" class="text-red-500 text-sm text-center bg-red-50 p-3 rounded border border-red-200">
           {{ sessionError }}
         </div>
         
         <div class="flex justify-end gap-2 pt-4 border-t">
           <button
             type="button"
             @click="closeSessionDialog"
             class="px-4 py-2 rounded-md text-sm hover:bg-accent"
           >
             Cancel
           </button>
           <button
             type="submit"
             class="px-4 py-2 rounded-md bg-primary text-white text-sm hover:bg-primary/90"
           >
             {{ editingSession.id ? 'Update' : 'Create' }} Session
           </button>
         </div>
       </form>
     </dialog>
   </div>
 </template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { 
  Lock, Shield, Eye, EyeOff, Plus, Edit, Trash2, X, LogOut, Copy, Loader2 
} from 'lucide-vue-next'

interface SecureNote {
  id: string
  title: string
  description?: string
  type: 'password' | 'note' | 'secret'
  username?: string
  password?: string
  url?: string
  content?: string
  createdAt: string
  updatedAt: string
  sessionId: string // Hangi oturuma ait olduğunu belirtir
}

interface PasswordSession {
  id: string
  name: string
  password: string
  createdAt: string
  updatedAt?: string
}

const isAuthenticated = ref(false)
const currentSession = ref<PasswordSession | null>(null)
const selectedSession = ref<PasswordSession | null>(null)
const masterPassword = ref('')
const showPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const showAddNoteDialog = ref(false)
const noteDialog = ref<HTMLDialogElement | null>(null)
const showSessionDialog = ref(false)
const sessionDialog = ref<HTMLDialogElement | null>(null)
const passwordVerificationDialog = ref<HTMLDialogElement | null>(null)
const showPasswordVerification = ref(false)
const verificationPassword = ref('')
const isVerifyingPassword = ref(false)
const verificationError = ref('')
const sessionError = ref('')

const passwordSessions = ref<PasswordSession[]>([])
const secureNotes = ref<SecureNote[]>([])
const editingNote = ref<SecureNote>({
  id: '',
  title: '',
  description: '',
  type: 'password',
  username: '',
  password: '',
  url: '',
  content: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sessionId: '',
})
const editingSession = ref<PasswordSession>({
  id: '',
  name: '',
  password: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

// Load password sessions from localStorage
const loadPasswordSessions = () => {
  const saved = localStorage.getItem('password-sessions')
  if (saved) {
    try {
      passwordSessions.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to load password sessions:', e)
    }
  }
}

// Save password sessions to localStorage
const savePasswordSessions = () => {
  localStorage.setItem('password-sessions', JSON.stringify(passwordSessions.value))
}

// Load secure notes from localStorage for current session
const loadSecureNotes = () => {
  if (!currentSession.value) return
  
  const saved = localStorage.getItem(`secure-notes-${currentSession.value.id}`)
  if (saved) {
    try {
      secureNotes.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to load secure notes:', e)
    }
  } else {
    secureNotes.value = []
  }
}

// Save secure notes to localStorage for current session
const saveSecureNotes = () => {
  if (!currentSession.value) return
  localStorage.setItem(`secure-notes-${currentSession.value.id}`, JSON.stringify(secureNotes.value))
}

// Authentication with session password
const authenticate = async () => {
  if (!masterPassword.value.trim() || !selectedSession.value) return
  
  isLoading.value = true
  errorMessage.value = ''
  
  // Simulate authentication delay
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Check if password matches selected session
  if (selectedSession.value.password === masterPassword.value.trim()) {
    currentSession.value = selectedSession.value
    isAuthenticated.value = true
    masterPassword.value = ''
    selectedSession.value = null
    loadSecureNotes()
  } else {
    errorMessage.value = 'Invalid password for this session'
  }
  
  isLoading.value = false
}

const logout = () => {
  isAuthenticated.value = false
  currentSession.value = null
  selectedSession.value = null
  secureNotes.value = []
}

const selectSession = (session: PasswordSession) => {
  selectedSession.value = session
  masterPassword.value = ''
  errorMessage.value = ''
  
  // Scroll to password input section after a short delay to ensure DOM is updated
  setTimeout(() => {
    const passwordSection = document.getElementById('password-input-section')
    if (passwordSection) {
      passwordSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      })
    }
  }, 100)
}



const openAddSessionDialog = () => {
  editingSession.value = {
    id: '',
    name: '',
    password: '',
    createdAt: new Date().toISOString(),
  }
  showSessionDialog.value = true
}

const closeSessionDialog = () => {
  showSessionDialog.value = false
  sessionDialog.value?.close()
  sessionError.value = ''
}

const saveSession = () => {
  // Clear previous errors
  sessionError.value = ''
  
  // Check for duplicate names (case-insensitive)
  const existingSession = passwordSessions.value.find(s => 
    s.name.toLowerCase().trim() === editingSession.value.name.toLowerCase().trim() &&
    s.id !== editingSession.value.id // Exclude current session when editing
  )
  
  if (existingSession) {
    sessionError.value = `A session with the name "${editingSession.value.name}" already exists. Please choose a different name.`
    return
  }
  
  if (editingSession.value.id) {
    // Update existing session
    const index = passwordSessions.value.findIndex(s => s.id === editingSession.value.id)
    if (index !== -1) {
      passwordSessions.value[index] = {
        ...editingSession.value,
        updatedAt: new Date().toISOString()
      }
      
      // If updating current session, update the reference
      if (currentSession.value?.id === editingSession.value.id) {
        currentSession.value = { ...editingSession.value, updatedAt: new Date().toISOString() }
      }
    }
  } else {
    // Create new session
    const newSession: PasswordSession = {
      ...editingSession.value,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    }
    passwordSessions.value.unshift(newSession)
  }
  
  savePasswordSessions()
  closeSessionDialog()
}

const deleteSession = (id: string) => {
  if (confirm('Are you sure you want to delete this session? All notes in this session will also be deleted.')) {
    // Delete session
    passwordSessions.value = passwordSessions.value.filter(s => s.id !== id)
    savePasswordSessions()
    
    // Delete associated notes
    localStorage.removeItem(`secure-notes-${id}`)
    
    // If current session is deleted, logout
    if (currentSession.value?.id === id) {
      logout()
    }
  }
}

const deleteCurrentSession = () => {
  if (!currentSession.value) return
  
  if (confirm(`Are you sure you want to delete "${currentSession.value.name}" session? All notes in this session will also be deleted.`)) {
    // Delete current session
    passwordSessions.value = passwordSessions.value.filter(s => s.id !== currentSession.value!.id)
    savePasswordSessions()
    
    // Delete associated notes
    localStorage.removeItem(`secure-notes-${currentSession.value.id}`)
    
    // Logout since session is deleted
    logout()
  }
}

const editNote = (note: SecureNote) => {
  editingNote.value = { ...note }
  showAddNoteDialog.value = true
}

const editSession = (session: PasswordSession) => {
  // This function is now only called from within the session
  // so we can assume the user is logged in
  editingSession.value = { ...session }
  showPasswordVerification.value = true
}

const verifyPassword = async () => {
  if (!verificationPassword.value.trim()) return
  
  isVerifyingPassword.value = true
  verificationError.value = ''
  
  // Simulate verification delay
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Check if password matches current session
  if (verificationPassword.value.trim() === currentSession.value?.password) {
    showPasswordVerification.value = false
    showSessionDialog.value = true
    verificationPassword.value = ''
  } else {
    verificationError.value = 'Invalid password. Please try again.'
  }
  
  isVerifyingPassword.value = false
}

const closePasswordVerification = () => {
  showPasswordVerification.value = false
  verificationPassword.value = ''
  verificationError.value = ''
}

const closeNoteDialog = () => {
  showAddNoteDialog.value = false
  noteDialog.value?.close()
}

const saveNote = () => {
  if (editingNote.value.id) {
    // Update existing note
    const index = secureNotes.value.findIndex(n => n.id === editingNote.value.id)
    if (index !== -1) {
      secureNotes.value[index] = {
        ...editingNote.value,
        sessionId: currentSession.value?.id || '',
        updatedAt: new Date().toISOString()
      }
    }
  } else {
    // Create new note
    const newNote: SecureNote = {
      ...editingNote.value,
      id: crypto.randomUUID(),
      sessionId: currentSession.value?.id || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    secureNotes.value.unshift(newNote)
  }
  
  saveSecureNotes()
  closeNoteDialog()
}

const deleteNote = (id: string) => {
  if (confirm('Are you sure you want to delete this secure note? This action cannot be undone.')) {
    secureNotes.value = secureNotes.value.filter(n => n.id !== id)
    saveSecureNotes()
  }
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    // You could add a toast notification here
  } catch (e) {
    console.error('Failed to copy to clipboard:', e)
  }
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString()
}

// Watch for dialog changes
watch(showAddNoteDialog, (show) => {
  if (show) {
    noteDialog.value?.showModal()
  } else {
    noteDialog.value?.close()
  }
})

watch(showSessionDialog, (show) => {
  if (show) {
    sessionDialog.value?.showModal()
  } else {
    sessionDialog.value?.close()
  }
})

watch(showPasswordVerification, (show) => {
  if (show) {
    passwordVerificationDialog.value?.showModal()
  } else {
    passwordVerificationDialog.value?.close()
  }
})

onMounted(() => {
  loadPasswordSessions()
})
</script>

<style scoped>
/* Add any custom styles here */
</style>
