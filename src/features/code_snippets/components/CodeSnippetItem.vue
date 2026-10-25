<template>
  <article
    class="workspace-card group bg-card/40 dark:bg-muted/5 relative z-10 hover:bg-card/70 cursor-pointer"
    :data-shared-editing="isEditing"
    @click="openFocusedView"
  >
    <div 
      class="flex items-center justify-between gap-3 py-2.5 px-4"
    >
      <button ref="openButtonRef" type="button" class="flex items-center gap-3 flex-1 min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" aria-haspopup="dialog" :aria-expanded="isOpen" @click.stop="openFocusedView">
        <Code2 class="w-4 h-4 shrink-0 text-muted-foreground/60" />
        <span class="font-normal text-[13px] leading-5 truncate text-foreground">
          {{ snippet.title }}
        </span>
        <span class="hidden sm:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/30 text-muted-foreground border border-border/40">
          {{ formatLanguageLabel(snippet.language) }}
        </span>
      </button>
      
      <div class="flex items-center gap-3 shrink-0">
        <span class="text-[10px] text-muted-foreground/60 hidden sm:block">
          {{ formatDate(snippet.updatedAt) }}
        </span>
        <div class="flex items-center opacity-100 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button v-if="canWrite" @click.stop="beginInlineEdit" class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" :title="$t('code.edit')" :aria-label="$t('code.edit')">
            <Pencil class="w-3.5 h-3.5" />
          </button>
          <button v-if="canWrite" @click.stop="removeSnippet" class="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1" :title="$t('code.delete')" :aria-label="$t('code.delete')">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <CodeSnippetEditor v-if="isOpen" :model-value="isEditing ? editForm : snippet" @update:model-value="editForm=$event" :viewing="!isEditing" :can-edit="canWrite" :language-options="languageOptions" :label="isEditing?t('code.edit'):snippet.title" :submit-label="t('code.saveChanges')" :saving="saving" :refreshing="refreshing" :conflict="editConflict" @save="handleSave" @cancel="cancelInlineEdit" @close="closeFocusedView" @edit="beginInlineEdit" @copy="copySnippet" @refresh="refreshDraft">
      <template #preview><pre class="m-0 min-w-full w-max p-4 text-[13px] leading-relaxed font-mono"><code class="hljs" v-html="highlightedCode" /></pre></template>
    </CodeSnippetEditor>
  </article>
</template>

<script setup lang="ts">
import { useModuleAccess } from '@/lib/workspaceScope'
import { ref, computed, watch, nextTick, onDeactivated } from 'vue'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { Code2, Pencil, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CodeSnippet } from '@/features/todos/stores/todo'
import CodeSnippetEditor from './CodeSnippetEditor.vue'

// CodeMirror & Highlight.js
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const { canWrite } = useModuleAccess('code')

const props = defineProps<{
  snippet: CodeSnippet
  languageOptions: { value: string, label: string }[]
}>()

const emit = defineEmits<{
  update: [snippetId: string, data: Partial<CodeSnippet>, done: (success: boolean, conflict?: boolean) => void]
  refresh: [snippetId: string, done: (version?: number) => void]
  delete: [snippetId: string]
  copy: [code: string]
}>()

const { t, locale } = useI18n()

// Local State
const isOpen = ref(false), openButtonRef=ref<HTMLButtonElement|null>(null)
const isEditing = ref(false)
onDeactivated(() => { isOpen.value = false; isEditing.value = false })
const editConflict = ref(false), saving = ref(false), refreshing = ref(false)
const baseVersion=useWorkspaceDraft(`code-edit-version:${props.snippet.id}`,props.snippet.version)
const editForm = useWorkspaceDraft(`code-edit:${props.snippet.id}`, { title: props.snippet.title, language: props.snippet.language || 'plaintext', code: props.snippet.code })

const canSave = computed(() => !!editForm.value.title.trim() && !!editForm.value.code.trim())

const formatLanguageLabel = (language: string) => {
  if (language === 'plaintext') return 'Plain Text'
  return language.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

const formatDate = (isoDate: string) => {
  const currentLang = locale.value
  return new Date(isoDate).toLocaleDateString(currentLang, { month: 'short', day: 'numeric', year: 'numeric' })
}

const highlightedCode = computed(() => {
  const code = props.snippet.code
  const lang = props.snippet.language || 'plaintext'
  if (!code) return ''
  
  const escapeHtml = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  
  try {
    if (lang === 'plaintext') return escapeHtml(code)
    if (hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    return hljs.highlightAuto(code).value
  } catch (err) {
    return escapeHtml(code)
  }
})

// Actions
const openFocusedView = () => { if(!isOpen.value)isOpen.value=true }
const closeFocusedView = () => {
  if(saving.value || refreshing.value)return
  isEditing.value=false;isOpen.value=false
  void nextTick(()=>openButtonRef.value?.focus({preventScroll:true}))
}
const matchesDraft=(snippet:CodeSnippet)=>editForm.value.title===snippet.title && editForm.value.language===(snippet.language||'plaintext') && editForm.value.code===snippet.code
watch(()=>props.snippet,(snippet,previous)=>{
  if(isEditing.value){if(snippet.version!==baseVersion.value)editConflict.value=true;return}
  if(matchesDraft(previous))editForm.value={title:snippet.title,language:snippet.language||'plaintext',code:snippet.code}
  if(matchesDraft(snippet))baseVersion.value=snippet.version
})

const beginInlineEdit = () => {
  if (!canWrite.value || saving.value || refreshing.value) return
  editConflict.value = baseVersion.value !== props.snippet.version
  isEditing.value = true
  isOpen.value = true
}

const cancelInlineEdit = () => {
  if (saving.value || refreshing.value) return
  editForm.value = { title: props.snippet.title, language: props.snippet.language || 'plaintext', code: props.snippet.code }
  baseVersion.value=props.snippet.version;editConflict.value=false
  isEditing.value = false
}

const handleSave = () => {
  if (!canWrite.value || !isEditing.value || saving.value || refreshing.value || !canSave.value) return
  saving.value = true
  emit('update', props.snippet.id, {
    title: editForm.value.title.trim(),
    language: editForm.value.language || 'plaintext',
    code: editForm.value.code,
    version: baseVersion.value,
  }, (success, conflict) => { saving.value = false; editConflict.value = Boolean(conflict); if (success) {editForm.value.title=editForm.value.title.trim();isEditing.value = false} })
}
const refreshDraft = () => {
  if (!canWrite.value || !isEditing.value || saving.value || refreshing.value) return
  refreshing.value = true
  emit('refresh', props.snippet.id, version => {
    if (version !== undefined) { baseVersion.value = version; editConflict.value = false }
    refreshing.value = false
  })
}

const removeSnippet = () => {if(canWrite.value && !saving.value && !refreshing.value)emit('delete', props.snippet.id)}
const copySnippet = () => emit('copy', props.snippet.code)
</script>

<style scoped>
:deep(.hljs) { background: transparent !important; padding: 0; }
pre::-webkit-scrollbar { width: 6px; height: 6px; }
pre::-webkit-scrollbar-track { background: transparent; }
pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
pre::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
</style>
