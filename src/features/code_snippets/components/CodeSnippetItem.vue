<template>
  <article
    class="workspace-card group bg-card/40 dark:bg-muted/5 relative z-10 select-custom"
    :class="[
      isExpanded 
        ? 'is-expanded bg-card/70'
        : 'hover:bg-card/70 overflow-hidden'
    ]"
  >
    <div 
    :data-shared-editing="isEditing"
      @click="toggleExpanded"
      class="flex items-center justify-between py-2.5 px-4 cursor-pointer"
    >
      <div class="flex items-center gap-3 flex-1 pr-3 min-w-0">
        <ChevronDown 
          class="w-4 h-4 shrink-0 text-muted-foreground/50 transition-transform duration-200" 
          :class="{ '-rotate-90': !isExpanded, 'text-primary': isExpanded }"
        />
        <span class="font-semibold text-sm truncate text-foreground" :class="{ 'text-primary': isExpanded }">
          {{ snippet.title }}
        </span>
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-muted/50 text-muted-foreground border border-border/50 uppercase tracking-widest">
          {{ formatLanguageLabel(snippet.language) }}
        </span>
      </div>
      
      <div class="flex items-center gap-3 shrink-0">
        <span class="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider hidden sm:block">
          {{ formatDate(snippet.updatedAt) }}
        </span>
        <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button v-if="canWrite" @click.stop="beginInlineEdit" class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" :title="$t('code.edit')" :aria-label="$t('code.edit')">
            <Pencil class="w-3.5 h-3.5" />
          </button>
          <button v-if="canWrite" @click.stop="removeSnippet" class="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1" :title="$t('code.delete')">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <transition name="slide-fade">
      <div v-if="isExpanded" class="border-t border-border/40 bg-[#0d1117] rounded-b-xl relative z-20 overflow-hidden">
        <div class="relative group/code">
          <div class="absolute top-0 right-0 left-0 bottom-0 pointer-events-none z-30">
            <div class="sticky top-0 flex justify-end p-3 overflow-hidden">
              <button
                @click.stop="copySnippet"
                class="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-zinc-300 hover:text-primary-foreground hover:bg-primary/80 text-[10px] font-bold tracking-widest uppercase backdrop-blur-md transition-all shadow-lg opacity-0 group-hover/code:opacity-100"
              >
                <Copy class="w-3 h-3" />
                {{ $t('code.copy') }}
              </button>
            </div>
          </div>
          
          <pre class="m-0 p-5 text-[13px] leading-relaxed overflow-x-auto font-mono"><code class="hljs" v-html="highlightedCode"></code></pre>
        </div>

      </div>
    </transition>
    <CodeSnippetEditor v-if="canWrite && isEditing" v-model="editForm" :language-options="languageOptions" :label="t('code.edit')" :submit-label="t('code.saveChanges')" :saving="saving" :refreshing="refreshing" :conflict="editConflict" @save="handleSave" @cancel="cancelInlineEdit" @close="isEditing = false" @refresh="refreshDraft" />
  </article>
</template>

<script setup lang="ts">
import { useModuleAccess } from '@/lib/workspaceScope'
import { ref, computed } from 'vue'
import { useWorkspaceDraft } from '@/lib/workspaceScope'
import { ChevronDown, Copy, Pencil, Trash2 } from 'lucide-vue-next'
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

const { t } = useI18n()

// Local State
const isExpanded = ref(false)
const isEditing = ref(false)
const editConflict = ref(false), saving = ref(false), refreshing = ref(false), baseVersion = ref(props.snippet.version)
const editForm = useWorkspaceDraft(`code-edit:${props.snippet.id}`, { title: props.snippet.title, language: props.snippet.language || 'plaintext', code: props.snippet.code })

const canSave = computed(() => !!editForm.value.title.trim() && !!editForm.value.code.trim())

const formatLanguageLabel = (language: string) => {
  if (language === 'plaintext') return 'Plain Text'
  return language.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

const formatDate = (isoDate: string) => {
  const currentLang = t('workspace.language') === 'Dil' ? 'tr-TR' : 'en-US'
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
const toggleExpanded = () => {
  if (isExpanded.value && isEditing.value) {
    cancelInlineEdit()
  }
  isExpanded.value = !isExpanded.value
}

const beginInlineEdit = () => {
  if (!canWrite.value || saving.value || refreshing.value) return
  baseVersion.value = props.snippet.version; editConflict.value = false
  isEditing.value = true
  isExpanded.value = true
}

const cancelInlineEdit = () => {
  if (saving.value || refreshing.value) return
  editForm.value = { title: props.snippet.title, language: props.snippet.language || 'plaintext', code: props.snippet.code }
  isEditing.value = false
}

const handleSave = () => {
  if (!canWrite.value || saving.value || refreshing.value || !canSave.value) return
  saving.value = true
  emit('update', props.snippet.id, {
    title: editForm.value.title.trim(),
    language: editForm.value.language || 'plaintext',
    code: editForm.value.code,
    version: baseVersion.value,
  }, (success, conflict) => { saving.value = false; editConflict.value = Boolean(conflict); if (success) isEditing.value = false })
}
const refreshDraft = () => {
  if (saving.value || refreshing.value) return
  refreshing.value = true
  emit('refresh', props.snippet.id, version => {
    if (version !== undefined) { baseVersion.value = version; editConflict.value = false }
    refreshing.value = false
  })
}

const removeSnippet = () => emit('delete', props.snippet.id)
const copySnippet = () => emit('copy', props.snippet.code)
</script>

<style scoped>
/* METİN SEÇİCİ RENGİ REVİZESİ */
.select-custom ::selection {
  background-color: rgba(59, 130, 246, 0.3); /* Primary renginin şeffaf hali */
  color: #fff;
}

.slide-fade-enter-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-fade-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(-10px); opacity: 0; }

:deep(.hljs) { background: transparent !important; padding: 0; }
pre::-webkit-scrollbar { width: 6px; height: 6px; }
pre::-webkit-scrollbar-track { background: transparent; }
pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
pre::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
</style>
