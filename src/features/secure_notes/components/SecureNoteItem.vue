<template>
  <article class="workspace-card vault-note" :class="{'is-expanded':isExpanded}">
    <div class="vault-note-summary">
      <button type="button" class="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :aria-expanded="isExpanded" @click="isExpanded=!isExpanded">
        <span class="flex min-w-0 items-center justify-between gap-3"><span class="truncate text-[13px] font-medium leading-5 text-foreground">{{ note.title }}</span><Lock class="h-3.5 w-3.5 shrink-0 text-muted-foreground/55" /></span>
        <span v-if="note.description || note.username" class="mt-1 block truncate text-xs leading-4 text-muted-foreground">{{ note.description || note.username }}</span>
        <span class="mt-3 block font-mono text-sm tracking-[0.15em] text-muted-foreground/65" aria-hidden="true">••••••••</span>
      </button>
      <div class="flex items-center justify-between gap-2"><span class="text-[10px] text-muted-foreground">{{ $t(note.type==='password'?'secure.typePassword':'secure.typeSecret') }}</span><div class="flex shrink-0 items-center gap-0.5">
        <button type="button" class="vault-note-icon" :title="$t(note.type==='password'?'secure.copyPassword':'secure.copySecret')" :aria-label="$t(note.type==='password'?'secure.copyPassword':'secure.copySecret')" @click="copyToClipboard(note.type==='password'?note.password_encrypted || '':note.content || '')"><Copy class="h-[15px] w-[15px]" /></button>
        <button type="button" class="vault-note-icon" :aria-expanded="isExpanded" :aria-label="$t(isExpanded?'common.close':'secure.showDetails')" @click="isExpanded=!isExpanded"><ChevronDown class="h-[15px] w-[15px] transition-transform" :class="{'rotate-180':isExpanded}" /></button>
        <button v-if="canWrite" type="button" class="vault-note-icon" :title="$t('secure.editNoteTitle')" :aria-label="$t('secure.editNoteTitle')" @click="$emit('edit',note)"><Edit class="h-[15px] w-[15px]" /></button>
        <button v-if="canWrite" type="button" class="vault-note-icon hover:!bg-destructive/10 hover:!text-destructive" :title="$t('secure.deleteNoteTitle')" :aria-label="$t('secure.deleteNoteTitle')" @click="$emit('delete',note.id)"><Trash2 class="h-[15px] w-[15px]" /></button>
      </div></div>
    </div>
    <Transition name="note-reveal">
      <div v-if="isExpanded" class="note-reveal">
        <div class="note-reveal-inner"><div class="note-reveal-body mt-3 space-y-3 border-t border-border/50 pt-3">
          <div v-if="note.type==='password'" class="grid gap-3 sm:grid-cols-2">
            <div class="vault-detail">
              <div class="min-w-0 flex-1"><span class="block text-[10px] text-muted-foreground">{{ $t('secure.username') }}</span><span class="mt-1 block truncate text-xs text-foreground">{{ note.username || '—' }}</span></div>
              <button type="button" class="vault-note-icon" :title="$t('secure.copyUsername')" :aria-label="$t('secure.copyUsername')" @click="copyToClipboard(note.username || '')"><Copy class="h-3.5 w-3.5" /></button>
            </div>
            <div class="vault-detail">
              <div class="min-w-0 flex-1"><span class="block text-[10px] text-muted-foreground">{{ $t('secure.password') }}</span><span class="mt-1 block truncate font-mono text-xs text-foreground">{{ showPassword ? note.password_encrypted : '••••••••' }}</span></div>
              <button type="button" class="vault-note-icon" :title="$t(showPassword?'secure.hidePassword':'secure.showPassword')" :aria-label="$t(showPassword?'secure.hidePassword':'secure.showPassword')" :aria-pressed="showPassword" @click="showPassword=!showPassword"><Eye v-if="showPassword" class="h-3.5 w-3.5" /><EyeOff v-else class="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div v-else class="space-y-2">
            <button type="button" class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground" :aria-pressed="showPassword" @click="showPassword=!showPassword"><Eye v-if="showPassword" class="h-3.5 w-3.5" /><EyeOff v-else class="h-3.5 w-3.5" />{{ $t(showPassword?'secure.hidePassword':'secure.showPassword') }}</button>
            <p v-if="showPassword" class="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/20 p-3 font-mono text-xs leading-5">{{ note.content }}</p>
            <p v-else class="px-2 font-mono text-xs text-muted-foreground" aria-hidden="true">••••••••</p>
          </div>
          <div v-if="safeUrl" class="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <a v-if="safeUrl" :href="safeUrl" target="_blank" rel="noopener noreferrer" class="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-primary hover:underline"><Globe class="h-3 w-3 shrink-0" /><span class="truncate">{{ note.url.replace(/^https?:\/\//,'') }}</span></a>
          </div>
        </div></div>
      </div>
    </Transition>
  </article>
</template>
<script setup lang="ts">
import { useModuleAccess } from '@/lib/workspaceScope'
import { ref, computed, watch } from 'vue'
import { Edit, Trash2, Copy, Eye, EyeOff, Globe, ChevronDown, Lock } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'

const { canWrite } = useModuleAccess('secure')

const props = defineProps<{
  note: any
}>()

defineEmits<{
  edit: [note: any]
  delete: [id: string]
}>()

const uiStore = useUIStore()
const { t } = useI18n()

const isExpanded=ref(false),showPassword=ref(false)
watch(isExpanded,open=>{if(!open)showPassword.value=false})
watch(()=>props.note,()=>{showPassword.value=false},{deep:true})

const safeUrl = computed(() => {
  try { const url = new URL(props.note.url || ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : '' } catch { return '' }
})

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    uiStore.addToast(t('secure.copySuccess'), 'success')
  } catch (e) {
    uiStore.addToast(t('secure.copyFailed'), 'error')
  }
}
</script>

<style scoped>
.vault-note { @apply min-w-0 rounded-2xl bg-card/50 p-3.5 text-card-foreground transition-colors hover:bg-muted/30; }
.vault-note-summary { display:flex; flex-direction:column; justify-content:space-between; min-height:110px; gap:10px; }
.vault-note-icon { @apply inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30; }
.vault-detail { @apply flex min-w-0 items-center gap-2 rounded-xl border border-border/45 bg-background/30 px-3 py-2; }
@media(max-width:639px){.vault-note-icon{width:26px;height:28px}}
</style>
