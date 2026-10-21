<template>
  <Teleport to="body">
    <dialog ref="dialogRef" class="note-edit-dialog" :aria-label="label" :closedby="busy ? 'none' : 'closerequest'" @keydown.esc.stop.prevent="requestClose" @cancel.prevent="requestClose" @close="onClosed">
      <form class="note-edit-form" @submit.prevent="submit">
        <header class="flex shrink-0 items-center justify-between gap-3">
          <span class="min-w-0 truncate text-xs font-medium" :class="viewing?'text-foreground':'text-muted-foreground'">{{ label }}</span>
          <button type="button" class="finance-icon" :disabled="busy" :aria-label="t('common.close')" @click="requestClose"><X class="h-4 w-4" /></button>
        </header>
        <div v-if="!viewing" class="flex shrink-0 flex-wrap items-center gap-2">
          <input ref="titleRef" v-model="title" type="text" required :disabled="busy" :aria-label="t('code.snippetTitlePlaceholder')" :placeholder="t('code.snippetTitlePlaceholder')" class="finance-input h-9 min-w-36 flex-1" />
          <CustomSelect v-model="language" :options="languageOptions" :disabled="busy" :aria-label="t('code.language')" searchable :search-placeholder="t('code.searchLanguage')" :empty-text="t('code.noLanguages')" size="sm" class="w-40 min-w-0" />
        </div>
        <div v-else class="flex shrink-0 items-center gap-2"><span class="rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">{{ languageOptions.find(option=>option.value===language)?.label || language }}</span></div>
        <div v-if="viewing" ref="previewRef" class="code-editor code-preview" tabindex="0" role="region" :aria-label="label"><slot name="preview" /></div>
        <div v-else class="code-editor">
          <Codemirror v-model="code" :placeholder="t('code.codePlaceholder')" :style="{ height: '100%', fontSize: '13px' }" :disabled="busy" :indent-with-tab="true" :tab-size="2" :extensions="extensions" class="code-mirror" />
        </div>
        <div v-if="conflict && !viewing" role="alert" class="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs">
          <p class="text-muted-foreground">{{ t('sharing.conflict') }}</p>
          <button type="button" :disabled="busy" class="font-medium text-primary disabled:opacity-40" @click="$emit('refresh')">{{ t('sharing.refreshDraft') }}</button>
        </div>
        <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-border/30 pt-3">
          <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">{{ t('code.lines', { count: code ? code.split(/\r?\n/).length : 0 }) }}</span>
          <div v-if="viewing" class="flex items-center gap-1.5">
            <button type="button" class="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground" @click="$emit('copy')"><Copy class="mr-1.5 inline h-3.5 w-3.5" />{{ t('code.copy') }}</button>
            <button v-if="canEdit" type="button" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90" @click="$emit('edit')"><Pencil class="h-3.5 w-3.5" />{{ t('code.edit') }}</button>
          </div>
          <div v-else class="flex items-center gap-1.5">
            <button type="button" :disabled="busy" class="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40" @click="$emit('cancel')">{{ t('code.cancel') }}</button>
            <button type="submit" :disabled="busy || !title.trim() || !code.trim()" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="saving" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ submitLabel }}</button>
          </div>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Pencil, Loader2, X } from 'lucide-vue-next'
import { Codemirror } from 'vue-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import CustomSelect from '@/components/ui/CustomSelect.vue'

interface SnippetDraft { title: string; language: string; code: string }
const props = defineProps<{
  modelValue: SnippetDraft
  languageOptions: { value: string; label: string }[]
  label: string
  submitLabel: string
  saving?: boolean
  refreshing?: boolean
  conflict?: boolean
  viewing?: boolean
  canEdit?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: SnippetDraft]
  save: []
  cancel: []
  close: []
  refresh: []
  edit: []
  copy: []
}>()
const { t } = useI18n()
const busy = computed(() => props.saving || props.refreshing)
const title = computed({ get: () => props.modelValue.title, set: value => emit('update:modelValue', { ...props.modelValue, title: value }) })
const language = computed({ get: () => props.modelValue.language, set: value => emit('update:modelValue', { ...props.modelValue, language: value }) })
const code = computed({ get: () => props.modelValue.code, set: value => emit('update:modelValue', { ...props.modelValue, code: value }) })
const extensions = [oneDark, javascript()]
const dialogRef = ref<HTMLDialogElement | null>(null), titleRef = ref<HTMLInputElement | null>(null), previewRef=ref<HTMLElement|null>(null)
let disposed = false
let scrollLock: { body: string; root: string; gutter: string } | null = null
function releaseScroll() {
  if (!scrollLock) return
  document.body.style.overflow = scrollLock.body
  document.documentElement.style.overflow = scrollLock.root
  document.documentElement.style.scrollbarGutter = scrollLock.gutter
  scrollLock = null
}
function closeDialog() { dialogRef.value?.close(); releaseScroll() }
function requestClose() { if (!busy.value) emit('close') }
function onClosed() { if (!disposed && !dialogRef.value?.open) { releaseScroll(); emit('close') } }
function submit() { if (!props.viewing && !busy.value && title.value.trim() && code.value.trim()) emit('save') }
function focusContent(){
  const target=props.viewing?previewRef.value:dialogRef.value?.querySelector<HTMLElement>('.cm-content') || titleRef.value
  target?.focus({preventScroll:true})
}
watch(()=>props.viewing,async()=>{await nextTick();if(!disposed)focusContent()})
onMounted(async () => {
  await nextTick()
  if (disposed || !dialogRef.value) return
  scrollLock = { body: document.body.style.overflow, root: document.documentElement.style.overflow, gutter: document.documentElement.style.scrollbarGutter }
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  document.documentElement.style.scrollbarGutter = 'stable'
  try { dialogRef.value.showModal() } catch { releaseScroll(); emit('close'); return }
  focusContent()
})
onDeactivated(() => { disposed = true; closeDialog(); emit('close') })
onBeforeUnmount(() => { disposed = true; closeDialog() })
</script>

<style scoped>
.code-editor { flex:1; min-height:0; min-width:0; overflow:hidden; border:1px solid hsl(var(--border)/.5); border-radius:12px; background:#0d1117; }
.code-preview{overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#ffffff26 transparent;color:#c9d1d9}
.code-preview:focus-visible{outline:2px solid hsl(var(--primary)/.4);outline-offset:2px}
.code-mirror { height:100%; min-height:0; width:100%; }
.code-mirror :deep(.cm-editor) { height:100%; background:#0d1117; }
.code-mirror :deep(.cm-scroller) { overflow:auto; overscroll-behavior:contain; padding:10px 0; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; scrollbar-width:thin; scrollbar-color:#ffffff26 transparent; }
.code-mirror :deep(.cm-gutters) { background:#0d1117; border-right:1px solid #ffffff0d; color:#7d8590; }
.code-mirror :deep(.cm-activeLine), .code-mirror :deep(.cm-activeLineGutter) { background:#ffffff08; }
.code-mirror :deep(.cm-focused) { outline:none; }
</style>
