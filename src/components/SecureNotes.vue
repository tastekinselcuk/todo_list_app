<template>
  <div class="space-y-5 animate-in fade-in zoom-in-95 duration-500 relative z-10 w-full flex flex-col items-center">
    
    <div v-if="!isAuthenticated" class="w-full max-w-6xl mx-auto space-y-6">
      
      <div class="flex flex-col md:flex-row gap-2.5 w-full relative z-[60]" style="overflow: visible;">
        <div class="relative flex-1 group">
          <Shield class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            v-model="inlineSessionName"
            type="text"
            :placeholder="$t('secure.sessionNamePlaceholder')"
            class="w-full h-10 pl-10 pr-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-medium"
            @keyup.enter="handleInlineAddSession"
          />
        </div>

        <div class="relative flex-1 group">
          <Lock class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            v-model="inlineSessionPassword"
            :type="showInlinePassword ? 'text' : 'password'"
            :placeholder="$t('secure.sessionPasswordPlaceholder')"
            class="w-full h-10 pl-10 pr-10 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-mono"
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
          <span class="sm:hidden">Ekle</span>
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

    <div v-else class="w-full max-w-6xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
      
      <div class="flex flex-col sm:flex-row items-center justify-between bg-card/40 backdrop-blur-2xl p-4 sm:p-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/10 dark:border-white/5 gap-4 relative overflow-hidden">
        <div class="absolute -left-10 -top-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px] pointer-events-none"></div>

        <div class="flex items-center gap-4 relative z-10 w-full sm:w-auto justify-center sm:justify-start">
          <div class="w-12 h-12 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-inner shrink-0">
            <Shield class="h-6 w-6" />
          </div>
          <div class="text-center sm:text-left">
            <h2 class="text-lg font-bold tracking-tight text-foreground">{{ currentSession?.name }}</h2>
            <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center justify-center sm:justify-start gap-1 mt-0.5">
              <Lock class="w-3 h-3" /> AÇIK KASA
            </p>
          </div>
        </div>
        
        <div class="flex flex-wrap items-center justify-center gap-2 relative z-10">
          <button @click="openAddNoteDialog" class="h-9 px-4 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors">
            <Plus class="h-4 w-4" /> {{ $t('secure.addNote') }}
          </button>
          
          <div class="w-px h-6 bg-border/50 mx-1 hidden sm:block"></div>

          <button @click="editSession(currentSession!)" class="h-9 w-9 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-muted text-foreground border border-border/50 transition-colors" :title="$t('secure.editSession')">
            <Edit class="h-4 w-4" />
          </button>
          <button @click="deleteCurrentSession" class="h-9 w-9 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border/50 hover:border-rose-500/20 transition-colors" :title="$t('secure.deleteSession')">
            <Trash2 class="h-4 w-4" />
          </button>
          <button @click="logout" class="h-9 w-9 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50 transition-colors" :title="$t('secure.logout')">
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="note in secureNotes"
          :key="note.id"
          class="group bg-card/40 backdrop-blur-md text-card-foreground p-5 rounded-[1.5rem] shadow-sm border border-border/50 hover:border-primary/30 transition-all duration-300 flex flex-col"
        >
          <div class="flex items-start justify-between mb-4">
            <div class="space-y-1.5 pr-4">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest border"
                  :class="{
                    'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20': note.type === 'password',
                    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20': note.type === 'secret'
                  }"
                >
                  {{ note.type === 'password' ? $t('secure.typePassword') : $t('secure.typeSecret') }}
                </span>
              </div>
              <h3 class="font-bold text-base tracking-tight text-foreground line-clamp-1">{{ note.title }}</h3>
              <p v-if="note.description" class="text-xs font-medium text-muted-foreground/80 line-clamp-2">
                {{ note.description }}
              </p>
            </div>
            
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button @click="editNote(note)" class="p-1.5 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors" :title="$t('secure.editNoteTitle')">
                <Edit class="h-3.5 w-3.5" />
              </button>
              <button @click="deleteNote(note.id)" class="p-1.5 hover:bg-rose-500/10 rounded-xl text-muted-foreground hover:text-rose-500 transition-colors" :title="$t('secure.deleteNoteTitle')">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          
          <div class="mt-auto pt-2 mb-2">
            <div v-if="note.type === 'password'" class="space-y-2">
              <div class="flex items-center justify-between bg-muted/30 p-2.5 rounded-xl border border-border/40 hover:border-primary/20 transition-colors group/copy">
                <div class="flex flex-col min-w-0 pr-2">
                  <span class="text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest">{{ $t('secure.username') }}</span>
                  <span class="text-xs font-semibold text-foreground truncate mt-0.5">{{ note.username || '-' }}</span>
                </div>
                <button @click="copyToClipboard(note.username || '', 'Kullanıcı adı')" class="w-7 h-7 flex items-center justify-center bg-muted/50 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors shrink-0">
                  <Copy class="h-3 w-3" />
                </button>
              </div>
              
              <div class="flex items-center justify-between bg-muted/30 p-2.5 rounded-xl border border-border/40 hover:border-primary/20 transition-colors group/copy">
                <div class="flex flex-col min-w-0 pr-2">
                  <span class="text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest">{{ $t('secure.password') }}</span>
                  <span class="text-xs font-mono text-foreground tracking-widest mt-0.5">
                    {{ visiblePasswords[note.id] ? note.password_encrypted : '••••••••' }}
                  </span> 
                </div>
                <div class="flex gap-1 shrink-0">
                  <button @click="togglePasswordVisibility(note.id)" class="w-7 h-7 flex items-center justify-center bg-muted/50 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors">
                    <Eye v-if="visiblePasswords[note.id]" class="h-3 w-3" />
                    <EyeOff v-else class="h-3 w-3" />
                  </button>
                  <button @click="copyToClipboard(note.password_encrypted || '', 'Şifre')" class="w-7 h-7 flex items-center justify-center bg-muted/50 hover:bg-primary/10 hover:text-primary rounded-lg text-muted-foreground transition-colors">
                    <Copy class="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
            
            <div v-else class="bg-muted/30 p-3 rounded-xl border border-border/40 relative group/copy">
              <p class="text-xs font-mono transition-all duration-300 pr-8 line-clamp-3" :class="visiblePasswords[note.id] ? 'blur-none' : 'blur-sm'">
                {{ note.content }}
              </p>
              <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/copy:opacity-100 transition-all">
                <button @click="togglePasswordVisibility(note.id)" class="w-7 h-7 flex items-center justify-center rounded-lg bg-card border border-border/50 shadow-sm hover:text-primary transition-all">
                  <Eye v-if="visiblePasswords[note.id]" class="h-3.5 w-3.5" />
                  <EyeOff v-else class="h-3.5 w-3.5" />
                </button>
                <button @click="copyToClipboard(note.content || '', 'Gizli içerik')" class="w-7 h-7 flex items-center justify-center rounded-lg bg-card border border-border/50 shadow-sm hover:text-primary transition-all">
                  <Copy class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            
            <div v-if="note.url" class="pt-3">
              <a :href="note.url" target="_blank" class="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
                <Globe class="w-3 h-3" /> {{ note.url.replace(/^https?:\/\//, '') }}
              </a>
            </div>

          </div>
          
          <div class="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 pt-3 border-t border-border/30">
            <span>{{ formatDate(note.created_at) }}</span>
          </div>
        </div>

        <div v-if="secureNotes.length === 0" class="col-span-full text-center py-16 bg-card/20 backdrop-blur-sm border border-dashed border-border/50 rounded-[2rem]">
          <Shield class="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p class="text-sm font-semibold text-muted-foreground/80">{{ $t('secure.noNotes') }}</p>
        </div>
      </div>
    </div>

    <dialog
      ref="unlockDialog"
      class="w-[90vw] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-card/90 backdrop-blur-2xl text-card-foreground shadow-2xl p-6 sm:p-8 space-y-6"
    >
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
              class="w-full h-11 rounded-xl border border-border/50 bg-background/50 text-foreground placeholder:text-muted-foreground/50 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
              :placeholder="$t('secure.enterPasswordPlaceholder', { name: selectedSessionForUnlock?.name })"
              required
              autofocus
            />
            <button
              type="button"
              @click="showUnlockPassword = !showUnlockPassword"
              class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors"
            >
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

      <form @submit.prevent="saveNote" class="space-y-5">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5 col-span-2 sm:col-span-1">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.title') }}</label>
            <input v-model="editingNote.title" type="text" class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" required />
          </div>
          <div class="space-y-1.5 col-span-2 sm:col-span-1">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.type') }}</label>
            <CustomSelect
              :modelValue="editingNote.type"
              @update:modelValue="editingNote.type = $event as 'password' | 'secret'"
              :options="noteTypeOptions"
            />
          </div>
        </div>
        
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.descriptionOptional') }}</label>
          <input v-model="editingNote.description" type="text" class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" :placeholder="$t('secure.descPlaceholder')" />
        </div>
        
        <div v-if="editingNote.type === 'password'" class="space-y-4 p-5 rounded-2xl bg-muted/30 border border-border/40">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.username') }}</label>
              <input v-model="editingNote.username" type="text" class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" :placeholder="$t('secure.usernamePlaceholder')" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.password') }}</label>
              <div class="relative">
                <input v-model="editingNote.password_encrypted" :type="showDialogPassword ? 'text' : 'password'" class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" :placeholder="$t('secure.password')" />
                <button type="button" @click="showDialogPassword = !showDialogPassword" class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                  <Eye v-if="showDialogPassword" class="h-3.5 w-3.5" />
                  <EyeOff v-else class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.urlOptional') }}</label>
            <input v-model="editingNote.url" type="url" class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" placeholder="https://example.com" />
          </div>
        </div>
        
        <div v-else class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.content') }}</label>
          <textarea v-model="editingNote.content" class="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all min-h-[100px] resize-none" :placeholder="$t('secure.contentSecretPlaceholder')" required></textarea>
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
              class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono transition-all"
              :placeholder="$t('secure.currentPasswordPlaceholder')"
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

      <form @submit.prevent="saveSession" class="space-y-5">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.sessionName') }}</label>
          <input v-model="editingSession.name" type="text" class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" :placeholder="$t('secure.sessionNamePlaceholder')" required />
        </div>
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted-foreground ml-1">{{ $t('secure.sessionPasswordLabel') }}</label>
          <div class="relative">
            <input v-model="editingSession.password_hash" :type="showEditSessionPassword ? 'text' : 'password'" class="w-full h-11 rounded-xl border border-border/50 bg-background/50 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono transition-all" :placeholder="$t('secure.sessionPasswordPlaceholder')" required />
            <button type="button" @click="showEditSessionPassword = !showEditSessionPassword" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-muted-foreground transition-colors">
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
import { ref, computed, onMounted, watch } from 'vue'
import { Lock, Shield, Eye, EyeOff, Plus, Edit, Trash2, X, LogOut, Copy, Loader2, Globe } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import CustomSelect from './ui/CustomSelect.vue'

interface SecureNote {
  id: string
  title: string
  description?: string
  type: 'password' | 'secret'
  username?: string
  password_encrypted?: string
  url?: string
  content?: string
  created_at: string
  updated_at: string
  session_id: string
}

interface PasswordSession {
  id: string
  name: string
  password_hash: string
  created_at: string
  updated_at?: string
}

const { t } = useI18n() 
const authStore = useAuthStore()
const uiStore = useUIStore()

const noteTypeOptions = computed(() => [
  { value: 'password', label: t('secure.typePassword') },
  { value: 'secret', label: t('secure.typeSecret') }
])

const isAuthenticated = ref(false)
const currentSession = ref<PasswordSession | null>(null)
const passwordSessions = ref<PasswordSession[]>([])
const secureNotes = ref<SecureNote[]>([])

// Görünürlük State'leri (Eye / EyeOff Icons)
const showInlinePassword = ref(false)
const showUnlockPassword = ref(false)
const showDialogPassword = ref(false)
const showVerificationPassword = ref(false)
const showEditSessionPassword = ref(false)

// Her bir not için şifre görünürlüğünü takip eden reaktif obje
const visiblePasswords = ref<Record<string, boolean>>({})

// Inline Ekleme (Yeni Kasa)
const inlineSessionName = ref('')
const inlineSessionPassword = ref('')

// Unlock Dialog (Kasa Seçim Sonrası Popup)
const unlockDialog = ref<HTMLDialogElement | null>(null)
const selectedSessionForUnlock = ref<PasswordSession | null>(null)
const unlockPassword = ref('')

// Diğer state'ler
const isLoading = ref(false)
const showAddNoteDialog = ref(false)
const noteDialog = ref<HTMLDialogElement | null>(null)
const showSessionDialog = ref(false)
const sessionDialog = ref<HTMLDialogElement | null>(null)
const passwordVerificationDialog = ref<HTMLDialogElement | null>(null)
const showPasswordVerification = ref(false)

const verificationPassword = ref('')
const isVerifyingPassword = ref(false)
const verificationError = ref('')

const editingNote = ref<{
  id?: string
  title: string
  description?: string
  type: 'password' | 'secret'
  username?: string
  password_encrypted?: string
  url?: string
  content?: string
}>({
  title: '',
  type: 'password',           // varsayılan değer koyuyoruz
  // diğer alanlar opsiyonel kalabilir
})
const editingSession = ref<Partial<PasswordSession> & { password?: string }>({ name: '', password_hash: '', password: '' })

// Şifreyi Göster/Gizle Toggle Fonksiyonu
const togglePasswordVisibility = (id: string) => {
  visiblePasswords.value[id] = !visiblePasswords.value[id]
}

const loadPasswordSessions = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase.from('password_sessions').select('*').order('created_at', { ascending: false })
    if (error) throw error
    passwordSessions.value = data || []
  } catch (err) {
    console.error('Failed to load password sessions:', err)
  } finally {
    isLoading.value = false
  }
}

const loadSecureNotes = async () => {
  if (!currentSession.value) return
  isLoading.value = true
  try {
    const { data, error } = await supabase.from('secure_notes').select('*').eq('session_id', currentSession.value.id).order('created_at', { ascending: false })
    if (error) throw error
    secureNotes.value = data || []
  } catch (err) {
    console.error('Failed to load secure notes:', err)
  } finally {
    isLoading.value = false
  }
}

const handleInlineAddSession = async () => {
  if (!inlineSessionName.value.trim() || !inlineSessionPassword.value.trim()) return
  isLoading.value = true
  
  try {
    const existing = passwordSessions.value.find(s => s.name.toLowerCase().trim() === inlineSessionName.value.toLowerCase().trim())
    if (existing) {
      uiStore.addToast(t('secure.sessionExists', { name: inlineSessionName.value }), 'error')
      return
    }
    
    const userId = authStore.user?.id || null
    const { data, error } = await supabase.from('password_sessions')
      .insert([{ created_by: userId, name: inlineSessionName.value, password_hash: inlineSessionPassword.value }])
      .select()
    
    if (error) throw error
    if (data && data[0]) {
      passwordSessions.value.unshift(data[0])
      uiStore.addToast('Kasa başarıyla oluşturuldu.', 'success')
      inlineSessionName.value = ''
      inlineSessionPassword.value = ''
      showInlinePassword.value = false
    }
  } catch (err) {
    uiStore.addToast('Kasa oluşturulurken hata oluştu.', 'error')
  } finally {
    isLoading.value = false
  }
}

const promptSessionUnlock = (session: PasswordSession) => {
  selectedSessionForUnlock.value = session
  unlockPassword.value = ''
  showUnlockPassword.value = false // Modal açılırken gizli başlasın
  unlockDialog.value?.showModal()
}

const closeUnlockDialog = () => {
  selectedSessionForUnlock.value = null
  unlockPassword.value = ''
  unlockDialog.value?.close()
}

const authenticate = async () => {
  if (!unlockPassword.value.trim() || !selectedSessionForUnlock.value) return
  
  isLoading.value = true
  try {
    if (selectedSessionForUnlock.value.password_hash === unlockPassword.value.trim()) {
      currentSession.value = selectedSessionForUnlock.value
      isAuthenticated.value = true
      await loadSecureNotes()
      uiStore.addToast(t('secure.accessSessionTitle', { name: currentSession.value.name }) + ' açıldı', 'success')
      closeUnlockDialog()
    } else {
      uiStore.addToast(t('secure.invalidPassword'), 'error')
    }
  } catch (err) {
    uiStore.addToast(t('secure.authFailed'), 'error')
  } finally {
    isLoading.value = false
  }
}

const logout = () => {
  isAuthenticated.value = false
  currentSession.value = null
  secureNotes.value = []
  // Tüm visible password state'lerini temizle
  visiblePasswords.value = {}
  uiStore.addToast(t('secure.logout') + ' yapıldı', 'info')
}

const openAddNoteDialog = () => {
  editingNote.value = { id: '', title: '', description: '', type: 'password', username: '', password_encrypted: '', url: '', content: '' }
  showDialogPassword.value = false // Form açılırken şifre gizli başlasın
  showAddNoteDialog.value = true
}

const closeSessionDialog = () => {
  showSessionDialog.value = false
  sessionDialog.value?.close()
}

const saveSession = async () => {
  isLoading.value = true
  try {
    if (editingSession.value.id) {
      const { error } = await supabase.from('password_sessions').update({ name: editingSession.value.name, password_hash: editingSession.value.password_hash }).eq('id', editingSession.value.id)
      if (error) throw error
      const index = passwordSessions.value.findIndex(s => s.id === editingSession.value.id)
      if (index !== -1) passwordSessions.value[index] = { ...passwordSessions.value[index], ...editingSession.value } as PasswordSession
      if (currentSession.value?.id === editingSession.value.id) currentSession.value = passwordSessions.value[index]
      uiStore.addToast('Kasa güncellendi', 'success')
    }
    closeSessionDialog()
  } catch (err) {
    uiStore.addToast((err as Error).message, 'error')
  } finally {
    isLoading.value = false
  }
}

const deleteCurrentSession = async () => {
  if (!currentSession.value) return
  const isConfirmed = await uiStore.showConfirm(t('secure.deleteSession'), t('secure.deleteSessionConfirm', { name: currentSession.value.name }), 'Kasayı Sil', t('secure.cancel'))
  if (!isConfirmed) return 
  
  isLoading.value = true
  try {
    const { error } = await supabase.from('password_sessions').delete().eq('id', currentSession.value.id)
    if (error) throw error
    passwordSessions.value = passwordSessions.value.filter(s => s.id !== currentSession.value!.id)
    logout()
    uiStore.addToast('Kasa başarıyla silindi', 'info')
  } catch (err) {
    uiStore.addToast('Kasa silinirken hata oluştu', 'error')
  } finally {
    isLoading.value = false
  }
}

const editNote = (note: SecureNote) => {
  editingNote.value = { ...note }
  showDialogPassword.value = false // Form açılırken gizli başlasın
  showAddNoteDialog.value = true
}

const editSession = (session: PasswordSession) => {
  editingSession.value = { ...session }
  showEditSessionPassword.value = false
  showPasswordVerification.value = true
}

const verifyPassword = async () => {
  if (!verificationPassword.value.trim()) return
  isVerifyingPassword.value = true
  verificationError.value = ''
  try {
    if (verificationPassword.value.trim() === currentSession.value?.password_hash) {
      showPasswordVerification.value = false
      showSessionDialog.value = true
      verificationPassword.value = ''
    } else {
      verificationError.value = t('secure.invalidVerification')
    }
  } finally {
    isVerifyingPassword.value = false
  }
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

const saveNote = async () => {
  isLoading.value = true
  try {
    if (editingNote.value.id) {
      const { error } = await supabase.from('secure_notes').update({
        title: editingNote.value.title, description: editingNote.value.description, type: editingNote.value.type,
        username: editingNote.value.username, password_encrypted: editingNote.value.password_encrypted,
        url: editingNote.value.url, content: editingNote.value.content
      }).eq('id', editingNote.value.id)
      
      if (error) throw error
      const index = secureNotes.value.findIndex(n => n.id === editingNote.value.id)
      if (index !== -1) secureNotes.value[index] = { ...editingNote.value } as SecureNote
      uiStore.addToast('Kayıt güncellendi', 'success')
    } else {
      const userId = authStore.user?.id || null
      const { data, error } = await supabase.from('secure_notes').insert([{
        created_by: userId, title: editingNote.value.title, description: editingNote.value.description, type: editingNote.value.type,
        username: editingNote.value.username, password_encrypted: editingNote.value.password_encrypted, url: editingNote.value.url,
        content: editingNote.value.content, session_id: currentSession.value?.id
      }]).select()
      
      if (error) throw error
      if (data && data[0]) secureNotes.value.unshift(data[0])
      uiStore.addToast('Kayıt eklendi', 'success')
    }
    closeNoteDialog()
  } catch (err) {
    uiStore.addToast('Kayıt sırasında hata oluştu', 'error')
  } finally {
    isLoading.value = false
  }
}

const deleteNote = async (id: string) => {
  const isConfirmed = await uiStore.showConfirm('Kaydı Sil', t('secure.deleteNoteConfirm'), 'Sil', t('secure.cancel'))
  if (!isConfirmed) return 
  
  isLoading.value = true
  try {
    const { error } = await supabase.from('secure_notes').delete().eq('id', id)
    if (error) throw error
    secureNotes.value = secureNotes.value.filter(n => n.id !== id)
    uiStore.addToast('Kayıt başarıyla silindi', 'info')
  } catch (err) {
    uiStore.addToast('Silinirken bir hata oluştu', 'error')
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async (text: string, type: string) => {
  try {
    await navigator.clipboard.writeText(text)
    uiStore.addToast(`${type} kopyalandı!`, 'success')
  } catch (e) {
    uiStore.addToast('Kopyalama başarısız', 'error')
  }
}

const formatDate = (date: string) => {
  const currentLang = t('workspace.language') === 'Dil' ? 'tr-TR' : 'en-US'
  return new Date(date).toLocaleDateString(currentLang, { year: 'numeric', month: 'short', day: 'numeric' })
}

watch(showAddNoteDialog, (show) => { if (show) noteDialog.value?.showModal(); else noteDialog.value?.close() })
watch(showSessionDialog, (show) => { if (show) sessionDialog.value?.showModal(); else sessionDialog.value?.close() })
watch(showPasswordVerification, (show) => { if (show) passwordVerificationDialog.value?.showModal(); else passwordVerificationDialog.value?.close() })

onMounted(() => { loadPasswordSessions() })
</script>

<style scoped>
/* Modal vs içindeki gereksiz titremeler veya z-index hatalarını gidermek için standart bir stil */
</style>