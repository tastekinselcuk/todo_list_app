<template>
  <article
    class="group rounded-xl border transition-all duration-300 bg-card/40 dark:bg-muted/5 relative z-10 select-custom"
    :class="[
      isExpanded 
        ? 'border-primary/30 shadow-md bg-card/70' 
        : 'border-border/40 hover:border-primary/20 hover:shadow-sm hover:bg-card/70 overflow-hidden'
    ]"
  >
    <div 
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
          <button @click.stop="beginInlineEdit" class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" :title="$t('code.edit')">
            <Pencil class="w-3.5 h-3.5" />
          </button>
          <button @click.stop="removeSnippet" class="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1" :title="$t('code.delete')">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <transition name="slide-fade">
      <div v-if="isExpanded" class="border-t border-border/40 bg-[#0d1117] rounded-b-xl relative z-20" :style="isEditing ? 'overflow: visible;' : 'overflow: hidden;'">
        
        <div v-if="isEditing" class="p-0 animate-in fade-in duration-300">
          <div class="px-4 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between">
            <input
              v-model="editForm.title"
              type="text"
              class="h-8 px-2 text-sm font-semibold bg-transparent text-zinc-300 border-none focus:ring-0 flex-1 outline-none"
            />
            <div class="flex items-center gap-2 pr-2 relative z-30">
              <CustomSelect
                v-model="editForm.language"
                :options="languageOptions"
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
            <button @click="handleSave" :disabled="!canSave" class="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50">{{ $t('code.saveChanges') }}</button>
          </div>
        </div>

        <div v-else class="relative group/code">
          <div class="absolute top-0 right-0 left-0 bottom-0 pointer-events-none z-30">
            <div class="sticky top-0 flex justify-end p-3 overflow-hidden">
              <button
                @click.stop="copySnippet"
                class="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-zinc-300 hover:text-white hover:bg-primary/80 text-[10px] font-bold tracking-widest uppercase backdrop-blur-md transition-all shadow-lg opacity-0 group-hover/code:opacity-100"
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
  </article>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, Copy, Pencil, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CodeSnippet } from '@/features/todos/stores/todo'
import CustomSelect from '@/components/ui/CustomSelect.vue'

// CodeMirror & Highlight.js
import { Codemirror } from 'vue-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const props = defineProps<{
  snippet: CodeSnippet
  languageOptions: { value: string, label: string }[]
}>()

const emit = defineEmits<{
  update: [snippetId: string, data: Partial<CodeSnippet>]
  delete: [snippetId: string]
  copy: [code: string]
}>()

const { t } = useI18n()
const cmExtensions = [oneDark, javascript()]

// Local State
const isExpanded = ref(false)
const isEditing = ref(false)
const editForm = ref({ title: '', language: 'plaintext', code: '' })

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
  editForm.value = { title: props.snippet.title, language: props.snippet.language || 'plaintext', code: props.snippet.code }
  isEditing.value = true
  isExpanded.value = true
}

const cancelInlineEdit = () => {
  isEditing.value = false
}

const handleSave = () => {
  if (!canSave.value) return
  emit('update', props.snippet.id, {
    title: editForm.value.title.trim(),
    language: editForm.value.language || 'plaintext',
    code: editForm.value.code
  })
  isEditing.value = false
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