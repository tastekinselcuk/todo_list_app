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

        <CodeSnippetItem
          v-for="snippet in todoStore.codeSnippets"
          :key="snippet.id"
          :snippet="snippet"
          :languageOptions="languageSelectOptions"
          @update="handleUpdateSnippet"
          @delete="handleDeleteSnippet"
          @copy="handleCopySnippet"
        />

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Code2, Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n' 
import { useUIStore } from '@/stores/ui' 
import { useTodoStore, type CodeSnippet } from '@/features/todos/stores/todo'

import CustomSelect from '@/components/ui/CustomSelect.vue'
import CodeSnippetItem from './CodeSnippetItem.vue' // YENİ EKLENDİ

// Sadece yeni snippet ekleme kısmı için Codemirror ve Highlightjs listesi
import { Codemirror } from 'vue-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import hljs from 'highlight.js'

const todoStore = useTodoStore()
const uiStore = useUIStore() 
const { t } = useI18n()

const cmExtensions = [oneDark, javascript()]

const isDrafting = ref(false) 
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

const getLineCount = (code: string) => {
  if (!code) return 0
  return code.split(/\r?\n/).length
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

// Item'dan (Alt bileşenden) gelen Update Event'ini karşıla
const handleUpdateSnippet = async (snippetId: string, data: Partial<CodeSnippet>) => {
  const result = await todoStore.updateCodeSnippet(snippetId, data)
  if (result.success) {
    uiStore.addToast('Kod bloğu güncellendi', 'success')
  } else {
    uiStore.addToast(result.message || t('code.errorUpdating'), 'error')
  }
}

// Item'dan gelen Delete Event'ini karşıla
const handleDeleteSnippet = async (snippetId: string) => {
  const isConfirmed = await uiStore.showConfirm(
    'Kod Bloğunu Sil', 
    t('code.deleteConfirm'), 
    'Sil', 
    t('code.cancel')
  )

  if (!isConfirmed) return

  const result = await todoStore.deleteCodeSnippet(snippetId)
  if (result.success) {
    uiStore.addToast('Kod bloğu silindi', 'info')
  } else {
    uiStore.addToast(result.message || t('code.errorDeleting'), 'error')
  }
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

onMounted(async () => {
  await todoStore.fetchCodeSnippets()
})
</script>

<style scoped>
.slide-fade-enter-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-fade-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(-10px); opacity: 0; }

:deep(.custom-cm .cm-editor) { background-color: #0d1117; outline: none !important; }
:deep(.custom-cm .cm-scroller) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; padding: 10px 0; }
:deep(.custom-cm .cm-gutters) { background-color: #0d1117; border-right: 1px solid rgba(255,255,255,0.05); color: #484f58; }
:deep(.custom-cm .cm-activeLine), :deep(.custom-cm .cm-activeLineGutter) { background-color: rgba(255,255,255,0.03); }
:deep(.custom-cm .cm-focused) { outline: none !important; }
</style>