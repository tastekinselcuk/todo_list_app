<template>
  <div class="space-y-5 animate-in fade-in zoom-in-95 duration-500 relative z-10 w-full flex flex-col items-center">
    
    <div class="flex flex-col sm:flex-row gap-2.5 max-w-5xl w-full relative z-30">
      <div class="relative flex-1 group">
        <Code2 class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <input
          v-model="snippetForm.title"
          @keyup.enter="handleInitNewSnippet"
          type="text"
          :placeholder="$t('code.snippetTitlePlaceholder')"
          class="w-full h-10 pl-10 pr-3 rounded-xl border border-border/50 bg-background/50 backdrop-blur-sm text-foreground placeholder:text-muted-foreground/60 shadow-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none text-sm font-medium"
          :disabled="isDrafting"
        />
      </div>
      
      <div class="flex items-center gap-2">
        <CustomSelect
          v-model="snippetForm.language"
          :options="languageSelectOptions"
          size="sm"
          variant="default"
          class="w-[130px] h-10 z-30 relative"
          :disabled="isDrafting"
        />
        <button
          @click="handleInitNewSnippet"
          class="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm hover:shadow-lg transition-all disabled:opacity-50 text-xs flex items-center gap-1.5 shrink-0"
          :disabled="!snippetForm.title.trim() || isDrafting"
        >
          <Plus class="w-3.5 h-3.5" />
          {{ $t('code.newSnippet') }}
        </button>
      </div>
    </div>

    <div class="space-y-4 pt-2 max-w-5xl w-full relative z-20" style="overflow: visible;">
      
      <transition name="slide-fade">
        <div v-if="isDrafting" class="rounded-xl border border-primary/30 bg-[#0d1117] shadow-lg flex flex-col animate-in slide-in-from-top-4 relative z-20">
          <div class="px-4 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between rounded-t-xl">
            <div class="flex items-center gap-3 w-full">
              <div class="flex gap-1.5 opacity-50 shrink-0">
                <div class="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              </div>
              <div class="flex-1 truncate font-mono text-[11px] text-zinc-400 pl-2">
                {{ snippetForm.title }} • {{ formatLanguageLabel(snippetForm.language) }}
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button @click="cancelDraft" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                  {{ $t('code.cancel') }}
                </button>
                <button
                  @click="handleSaveSnippet"
                  :disabled="!snippetForm.code.trim()"
                  class="px-4 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 transition-all"
                >
                  {{ $t('code.saveSnippet') }}
                </button>
              </div>
            </div>
          </div>

          <div class="relative group flex-1 rounded-b-xl overflow-hidden">
            <codemirror
              v-model="snippetForm.code"
              :placeholder="$t('code.codePlaceholder')"
              :style="{ minHeight: '200px', fontSize: '13px' }"
              :autofocus="true"
              :indent-with-tab="true"
              :tab-size="2"
              :extensions="cmExtensions"
              class="w-full custom-cm"
            />
            <div class="absolute bottom-2 right-3 text-[10px] font-bold tracking-widest uppercase text-zinc-500 pointer-events-none">
              {{ $t('code.lines', { count: getLineCount(snippetForm.code) }) }}
            </div>
          </div>
        </div>
      </transition>

      <div class="grid grid-cols-1 gap-2 w-full">
        
        <div v-if="todoStore.codeSnippets.length === 0 && !isDrafting" class="text-center py-12 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-2xl bg-muted/5 w-full">
          <div class="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
            <Code2 class="w-4 h-4 text-muted-foreground/40" />
          </div>
          <p class="text-xs font-semibold text-muted-foreground/80">{{ $t('code.noSnippets') }}</p>
        </div>

        <article
          v-for="snippet in todoStore.codeSnippets"
          :key="snippet.id"
          class="group rounded-xl border transition-all duration-300 bg-card/40 dark:bg-muted/5 relative z-10"
          :class="[
            expandedSnippetId === snippet.id 
              ? 'border-primary/30 shadow-md bg-card/70' 
              : 'border-border/40 hover:border-primary/20 hover:shadow-sm hover:bg-card/70 overflow-hidden'
          ]"
        >
          <div 
            @click="toggleExpanded(snippet.id)"
            class="flex items-center justify-between py-2.5 px-4 cursor-pointer"
          >
            <div class="flex items-center gap-3 flex-1 pr-3 min-w-0">
              <ChevronDown 
                class="w-4 h-4 shrink-0 text-muted-foreground/50 transition-transform duration-200" 
                :class="{ '-rotate-90': expandedSnippetId !== snippet.id, 'text-primary': expandedSnippetId === snippet.id }"
              />
              <span class="font-semibold text-sm truncate text-foreground" :class="{ 'text-primary': expandedSnippetId === snippet.id }">
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
                <button @click.stop="beginInlineEdit(snippet)" class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" :title="$t('code.edit')">
                  <Pencil class="w-3.5 h-3.5" />
                </button>
                <button @click.stop="removeSnippet(snippet.id)" class="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1" :title="$t('code.delete')">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <transition name="slide-fade">
            <div v-if="expandedSnippetId === snippet.id" class="border-t border-border/40 bg-[#0d1117] rounded-b-xl relative z-20" :style="editingSnippetId === snippet.id ? 'overflow: visible;' : 'overflow: hidden;'">
              
              <div v-if="editingSnippetId === snippet.id" class="p-0 animate-in fade-in duration-300">
                <div class="px-4 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between">
                  <input
                    v-model="editForm.title"
                    type="text"
                    class="h-8 px-2 text-sm font-semibold bg-transparent text-zinc-300 border-none focus:ring-0 flex-1 outline-none"
                  />
                  <div class="flex items-center gap-2 pr-2 relative z-30">
                    <CustomSelect
                      v-model="editForm.language"
                      :options="languageSelectOptions"
                      size="sm"
                      variant="ghost"
                      class="text-zinc-300 bg-white/10 hover:bg-white/20 border-transparent h-8 rounded-xl !shadow-none"
                    />
                  </div>
                </div>
                
                <codemirror
                  v-model="editForm.code"
                  :style="{ minHeight: '150px', fontSize: '13px' }"
                  :indent-with-tab="true"
                  :tab-size="2"
                  :extensions="cmExtensions"
                  class="w-full custom-cm"
                />

                <div class="px-4 py-2.5 bg-black/40 border-t border-white/5 flex justify-end gap-2">
                  <button @click="cancelInlineEdit" class="px-3 py-1.5 text-xs font-semibold rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">{{ $t('code.cancel') }}</button>
                  <button @click="handleInlineUpdate" :disabled="!canSaveInline" class="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50">{{ $t('code.saveChanges') }}</button>
                </div>
              </div>

              <div v-else class="relative group/code">
                <div class="absolute top-2 right-3 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
                  <button
                    @click.stop="copySnippet(snippet.code)"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/20 text-[10px] font-bold tracking-widest uppercase backdrop-blur-md transition-all shadow-sm"
                  >
                    <Copy class="w-3 h-3" />
                    {{ $t('code.copy') }}
                  </button>
                </div>
                <pre class="m-0 p-5 text-[13px] leading-relaxed overflow-x-auto font-mono"><code class="hljs" v-html="getHighlightedCode(snippet.code, snippet.language)"></code></pre>
              </div>

            </div>
          </transition>
        </article>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronDown, Code2, Copy, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n' 
import { useUIStore } from '@/stores/ui' 

import { Codemirror } from 'vue-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'

import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

import { useTodoStore, type CodeSnippet } from '@/stores/todo'
import CustomSelect from './ui/CustomSelect.vue'

const props = defineProps({
  initialTab: { type: String, default: 'detailed' }
})

const todoStore = useTodoStore()
const uiStore = useUIStore() 
const { t } = useI18n()

const languageSelectOptions = computed(() =>
  availableLanguages.value.map(lang => ({ value: lang, label: formatLanguageLabel(lang) }))
)

const isDrafting = ref(false) 
const expandedSnippetId = ref<string | null>(null)
const editingSnippetId = ref<string | null>(null)

const cmExtensions = [oneDark, javascript()]

const snippetForm = ref({
  title: '',
  language: 'javascript', 
  code: '',
})

const editForm = ref({
  title: '',
  language: 'plaintext',
  code: '',
})

const availableLanguages = computed(() => {
  const uniqueLanguages = new Set(['plaintext', ...hljs.listLanguages()])
  return Array.from(uniqueLanguages).sort((a, b) => a.localeCompare(b))
})

const canSaveInline = computed(() => !!editForm.value.title.trim() && !!editForm.value.code.trim())

const formatLanguageLabel = (language: string) => {
  if (language === 'plaintext') return 'Plain Text'
  return language.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

const getLineCount = (code: string) => {
  if (!code) return 0
  return code.split(/\r?\n/).length
}

const formatDate = (isoDate: string) => {
  const currentLang = t('workspace.language') === 'Dil' ? 'tr-TR' : 'en-US'
  return new Date(isoDate).toLocaleDateString(currentLang, { month: 'short', day: 'numeric', year: 'numeric' })
}

const escapeHtml = (code: string) => {
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const getHighlightedCode = (code: string, language: string) => {
  if (!code) return ''
  try {
    if (language === 'plaintext') return escapeHtml(code)
    if (hljs.getLanguage(language)) return hljs.highlight(code, { language, ignoreIllegals: true }).value
    return hljs.highlightAuto(code).value
  } catch (err) {
    return escapeHtml(code)
  }
}

const toggleExpanded = (snippetId: string) => {
  if (expandedSnippetId.value === snippetId) {
    expandedSnippetId.value = null
    if (editingSnippetId.value === snippetId) cancelInlineEdit()
  } else {
    expandedSnippetId.value = snippetId
  }
}

const handleInitNewSnippet = () => {
  if (!snippetForm.value.title.trim()) return
  snippetForm.value.code = ''
  isDrafting.value = true
}

const cancelDraft = () => {
  isDrafting.value = false
  snippetForm.value.title = ''
  snippetForm.value.code = ''
}

const handleSaveSnippet = async () => {
  if (!snippetForm.value.title.trim() || !snippetForm.value.code.trim()) return

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
}

const beginInlineEdit = (snippet: CodeSnippet) => {
  editingSnippetId.value = snippet.id
  expandedSnippetId.value = snippet.id
  editForm.value = { title: snippet.title, language: snippet.language || 'plaintext', code: snippet.code }
}

const cancelInlineEdit = () => {
  editingSnippetId.value = null
}

const handleInlineUpdate = async () => {
  if (!editingSnippetId.value || !canSaveInline.value) return
  
  const result = await todoStore.updateCodeSnippet(editingSnippetId.value, {
    title: editForm.value.title.trim(),
    language: editForm.value.language || 'plaintext',
    code: editForm.value.code,
  })
  
  if (result.success) {
    uiStore.addToast('Kod bloğu güncellendi', 'success')
    cancelInlineEdit()
  } else {
    uiStore.addToast(result.message || t('code.errorUpdating'), 'error')
  }
}

const removeSnippet = async (snippetId: string) => {
  const isConfirmed = await uiStore.showConfirm(
    'Kod Bloğunu Sil', 
    t('code.deleteConfirm'), 
    'Sil', 
    t('code.cancel')
  )

  if (!isConfirmed) return

  const result = await todoStore.deleteCodeSnippet(snippetId)
  if (!result.success) {
    uiStore.addToast(result.message || t('code.errorDeleting'), 'error')
    return
  }
  
  uiStore.addToast('Kod bloğu silindi', 'info')
  if (expandedSnippetId.value === snippetId) expandedSnippetId.value = null
  if (editingSnippetId.value === snippetId) cancelInlineEdit()
}

const copySnippet = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code)
    uiStore.addToast(t('code.copySuccess') || 'Kopyalandı!', 'success')
  } catch (err) {
    uiStore.addToast('Kopyalama başarısız', 'error')
  }
}

onMounted(async () => {
  await todoStore.fetchCodeSnippets()
})
</script>

<style scoped>
.slide-fade-enter-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-fade-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(-10px); opacity: 0; }

:deep(.hljs) { background: transparent !important; padding: 0; }

pre::-webkit-scrollbar, :deep(.cm-scroller)::-webkit-scrollbar { width: 6px; height: 6px; }
pre::-webkit-scrollbar-track, :deep(.cm-scroller)::-webkit-scrollbar-track { background: transparent; }
pre::-webkit-scrollbar-thumb, :deep(.cm-scroller)::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
pre::-webkit-scrollbar-thumb:hover, :deep(.cm-scroller)::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

:deep(.custom-cm .cm-editor) { background-color: #0d1117; outline: none !important; }
:deep(.custom-cm .cm-scroller) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; padding: 10px 0; }
:deep(.custom-cm .cm-gutters) { background-color: #0d1117; border-right: 1px solid rgba(255,255,255,0.05); color: #484f58; }
:deep(.custom-cm .cm-activeLine), :deep(.custom-cm .cm-activeLineGutter) { background-color: rgba(255,255,255,0.03); }
:deep(.custom-cm .cm-focused) { outline: none !important; }
</style>