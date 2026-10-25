<template>
  <div class="space-y-5 relative z-10 w-full flex flex-col items-center">
    
    <div v-if="canWrite" class="workspace-toolbar flex flex-col sm:flex-row gap-2.5 workspace-content relative z-30">
      <div class="relative flex-1 min-w-0 group">
        <Code2 class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
        <input
          v-model="snippetForm.title"
          @keyup.enter="handleInitNewSnippet"
          type="text"
          :placeholder="$t('code.snippetTitlePlaceholder')"
          class="w-full h-10 pl-10 pr-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-medium"
          :disabled="isDrafting"
        />
      </div>

      <CustomSelect
        v-model="snippetForm.language"
        :options="languageSelectOptions"
        searchable
        :aria-label="t('code.language')"
        :search-placeholder="t('code.searchLanguage')"
        :empty-text="t('code.noLanguages')"
        size="md"
        variant="default"
        class="snippet-toolbar-select w-full sm:w-44 shrink-0 z-30 relative"
        :disabled="isDrafting"
      />
    </div>

    <div class="space-y-4 pt-2 workspace-content relative z-20" style="overflow: visible;">
      
      <CodeSnippetEditor v-if="canWrite && isDrafting" v-model="snippetForm" :language-options="languageSelectOptions" :label="t('code.newSnippet')" :submit-label="t('code.saveSnippet')" :saving="saving" @save="handleSaveSnippet" @cancel="cancelDraft" @close="isDrafting = false" />

      <div class="grid grid-cols-1 gap-2 w-full">
        
        <div v-if="todoStore.codeSnippets.length === 0 && !isDrafting" class="text-center py-12 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-2xl bg-muted/5 w-full">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
            <Code2 class="w-4 h-4 text-muted-foreground/40" />
          </div>
          <p class="text-xs font-semibold text-muted-foreground/80">{{ $t('code.noSnippets') }}</p>
        </div>

        <CodeSnippetItem
          v-for="snippet in todoStore.codeSnippets"
          :key="snippet.id"
          :snippet="snippet"
          :data-search-record="snippet.id"
          :languageOptions="languageSelectOptions"
          @update="handleUpdateSnippet"
          @refresh="refreshSnippetDraft"
          @delete="handleDeleteSnippet"
          @copy="handleCopySnippet"
        />

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSearchReveal } from '@/lib/searchNavigation'
import { useModuleAccess, useModuleLoad } from '@/lib/workspaceScope'
import { computed, ref, onDeactivated } from 'vue'
import { Code2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n' 
import { useUIStore } from '@/stores/ui' 
import { useTodoStore, type CodeSnippet } from '@/features/todos/stores/todo'

import CustomSelect from '@/components/ui/CustomSelect.vue'
import CodeSnippetItem from './CodeSnippetItem.vue'
import CodeSnippetEditor from './CodeSnippetEditor.vue'

import hljs from 'highlight.js'

const { canWrite } = useModuleAccess('code')

const todoStore = useTodoStore()
const uiStore = useUIStore() 
const { t } = useI18n()

const saving = ref(false)

const isDrafting = ref(false)
onDeactivated(() => { isDrafting.value = false; snippetForm.value={title:'',language:'javascript',code:''} })
const snippetForm = ref({
  title: '',
  language: 'javascript', 
  code: '',
})

const availableLanguages = computed(() => {
  const uniqueLanguages = new Set(['plaintext', ...hljs.listLanguages()])
  return Array.from(uniqueLanguages).sort((a, b) => a.localeCompare(b))
})

const formatLanguageLabel = (language: string) => {
  if (language === 'plaintext') return 'Plain Text'
  return language.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

const languageSelectOptions = computed(() =>
  availableLanguages.value.map(lang => ({ value: lang, label: formatLanguageLabel(lang) }))
)

const handleInitNewSnippet = () => {
  if (!canWrite.value || saving.value || !snippetForm.value.title.trim()) return
  isDrafting.value = true
}

const cancelDraft = () => {
  if (saving.value) return
  isDrafting.value = false
  snippetForm.value.title = ''
  snippetForm.value.code = ''
}

const handleSaveSnippet = async () => {
  if (!canWrite.value || saving.value || !snippetForm.value.title.trim() || !snippetForm.value.code.trim()) return
  saving.value = true
  try {
    const result = await todoStore.addCodeSnippet({
      title: snippetForm.value.title.trim(),
      language: snippetForm.value.language || 'plaintext',
      code: snippetForm.value.code,
    })
    if (result.success) {
      uiStore.addToast('Kod bloğu eklendi', 'success')
      isDrafting.value = false
      snippetForm.value.title = ''
      snippetForm.value.code = ''
    } else {
      uiStore.addToast(result.message || t('code.errorSaving'), 'error')
    }
  } finally { saving.value = false }
}

// Item'dan (Alt bileşenden) gelen Update Event'ini karşıla
const refreshSnippetDraft = async (snippetId: string, done: (version?: number) => void) => {
  const loaded = await todoStore.fetchCodeSnippets()
  const latest = loaded ? todoStore.codeSnippets.find(snippet => snippet.id === snippetId) : undefined
  done(latest?.version)
  if (latest) uiStore.addToast(t('sharing.draftReady'), 'info')
}
const handleUpdateSnippet = async (snippetId: string, data: Partial<CodeSnippet>, done?: (success: boolean, conflict?: boolean) => void) => {
  const result = await todoStore.updateCodeSnippet(snippetId, data)
  done?.(result.success, result.message === 'SHARING_CONFLICT')
  if (result.success) {
    uiStore.addToast('Kod bloğu güncellendi', 'success')
  } else {
    uiStore.addToast(result.message === 'SHARING_CONFLICT' ? t('sharing.conflict') : t('code.errorUpdating'), 'error')
  }
}

// Item'dan gelen Delete Event'ini karşıla
const deletingSnippets = new Set<string>()
const handleDeleteSnippet = async (snippetId: string) => {
  if (!canWrite.value || deletingSnippets.has(snippetId)) return
  deletingSnippets.add(snippetId)
  try {
    const result = await todoStore.deleteCodeSnippet(snippetId)
    if (!result.success) uiStore.addToast(result.message || t('code.errorDeleting'), 'error')
  } finally { deletingSnippets.delete(snippetId) }
}

// Item'dan gelen Copy Event'ini karşıla
const handleCopySnippet = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code)
    uiStore.addToast(t('code.copySuccess') || 'Kopyalandı!', 'success')
  } catch (err) {
    uiStore.addToast('Kopyalama başarısız', 'error')
  }
}

useModuleLoad(() => todoStore.fetchCodeSnippets())
useSearchReveal('code', async hit => { await todoStore.fetchCodeSnippets(hit.record_id) })
</script>

<style scoped>
.snippet-toolbar-select :deep(button) {
  height: 2.5rem;
  min-height: 2.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  background-color: hsl(var(--background) / 0.5);
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  border-color: hsl(var(--border) / 0.5);
}

</style>
