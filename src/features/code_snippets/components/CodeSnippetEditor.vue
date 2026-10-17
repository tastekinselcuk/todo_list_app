<template>
  <Teleport to="body">
    <dialog ref="dialogRef" class="code-edit-dialog" :aria-label="label" :closedby="busy ? 'none' : 'closerequest'" @keydown.esc.stop.prevent="requestClose" @cancel.prevent="requestClose" @close="onClosed" @click.self="requestClose">
      <form class="code-edit-form" @submit.prevent="submit">
        <header class="flex shrink-0 items-center justify-between gap-3">
          <span class="text-xs font-medium text-muted-foreground">{{ label }}</span>
          <button type="button" class="finance-icon" :disabled="busy" :aria-label="t('common.close')" @click="requestClose"><X class="h-4 w-4" /></button>
        </header>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <input ref="titleRef" v-model="title" type="text" required :disabled="busy" :aria-label="t('code.snippetTitlePlaceholder')" :placeholder="t('code.snippetTitlePlaceholder')" class="finance-input h-9 min-w-36 flex-1" />
          <CustomSelect v-model="language" :options="languageOptions" :disabled="busy" :aria-label="t('code.language')" size="sm" class="w-40 min-w-0" />
        </div>
        <div class="code-editor">
          <Codemirror v-model="code" :placeholder="t('code.codePlaceholder')" :style="{ height: '100%', fontSize: '13px' }" :disabled="busy" :indent-with-tab="true" :tab-size="2" :extensions="extensions" class="code-mirror" />
        </div>
        <div v-if="conflict" role="alert" class="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs">
          <p class="text-muted-foreground">{{ t('sharing.conflict') }}</p>
          <button type="button" :disabled="busy" class="font-medium text-primary disabled:opacity-40" @click="$emit('refresh')">{{ t('sharing.refreshDraft') }}</button>
        </div>
        <footer class="flex shrink-0 items-center justify-between gap-2 border-t border-border/30 pt-3">
          <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground">{{ t('code.lines', { count: code ? code.split(/\r?\n/).length : 0 }) }}</span>
          <div class="flex items-center gap-1.5">
            <button type="button" :disabled="busy" class="h-8 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40" @click="$emit('cancel')">{{ t('code.cancel') }}</button>
            <button type="submit" :disabled="busy || !title.trim() || !code.trim()" class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"><Loader2 v-if="saving" class="h-3 w-3 animate-spin motion-reduce:animate-none" />{{ submitLabel }}</button>
          </div>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2, X } from 'lucide-vue-next'
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
}>()
const emit = defineEmits<{
  'update:modelValue': [value: SnippetDraft]
  save: []
  cancel: []
  close: []
  refresh: []
}>()
const { t } = useI18n()
const busy = computed(() => props.saving || props.refreshing)
const title = computed({ get: () => props.modelValue.title, set: value => emit('update:modelValue', { ...props.modelValue, title: value }) })
const language = computed({ get: () => props.modelValue.language, set: value => emit('update:modelValue', { ...props.modelValue, language: value }) })
const code = computed({ get: () => props.modelValue.code, set: value => emit('update:modelValue', { ...props.modelValue, code: value }) })
const extensions = [oneDark, javascript()]
const dialogRef = ref<HTMLDialogElement | null>(null), titleRef = ref<HTMLInputElement | null>(null)
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
function submit() { if (!busy.value && title.value.trim() && code.value.trim()) emit('save') }
onMounted(async () => {
  await nextTick()
  if (disposed || !dialogRef.value) return
  scrollLock = { body: document.body.style.overflow, root: document.documentElement.style.overflow, gutter: document.documentElement.style.scrollbarGutter }
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  document.documentElement.style.scrollbarGutter = 'stable'
  try { dialogRef.value.showModal() } catch { releaseScroll(); emit('close'); return }
  const focusTarget = dialogRef.value.querySelector<HTMLElement>('.cm-content') || titleRef.value
  focusTarget?.focus({ preventScroll: true })
})
onDeactivated(() => { disposed = true; closeDialog(); emit('close') })
onBeforeUnmount(() => { disposed = true; closeDialog() })
</script>

<style scoped>
.code-edit-dialog { width:calc(100vw - 32px); max-width:1100px; height:min(820px,calc(100dvh - 48px)); max-height:calc(100dvh - 48px); margin:auto; padding:0; overflow:hidden; overscroll-behavior:contain; border:1px solid hsl(var(--border)/.6); border-radius:18px; background:hsl(var(--card)); color:hsl(var(--foreground)); box-shadow:0 24px 80px rgb(0 0 0 / .2); }
.code-edit-dialog::backdrop { background:hsl(var(--background)/.8); backdrop-filter:blur(6px); }
.code-edit-form { display:flex; flex-direction:column; height:100%; min-height:0; gap:12px; padding:16px; }
.code-editor { flex:1; min-height:0; min-width:0; overflow:hidden; border:1px solid hsl(var(--border)/.5); border-radius:12px; background:#0d1117; }
.code-mirror { height:100%; min-height:0; width:100%; }
.code-mirror :deep(.cm-editor) { height:100%; background:#0d1117; }
.code-mirror :deep(.cm-scroller) { overflow:auto; overscroll-behavior:contain; padding:10px 0; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; scrollbar-width:thin; scrollbar-color:#ffffff26 transparent; }
.code-mirror :deep(.cm-gutters) { background:#0d1117; border-right:1px solid #ffffff0d; color:#7d8590; }
.code-mirror :deep(.cm-activeLine), .code-mirror :deep(.cm-activeLineGutter) { background:#ffffff08; }
.code-mirror :deep(.cm-focused) { outline:none; }
@media(max-width:639px) { .code-edit-dialog { width:calc(100vw - 16px); height:calc(100dvh - 16px); max-height:calc(100dvh - 16px); border-radius:14px; } .code-edit-form { padding:12px; gap:10px; } }
@media(prefers-reduced-motion:no-preference) { .code-edit-dialog[open] { animation:code-edit-enter 180ms cubic-bezier(.22,1,.36,1); } @keyframes code-edit-enter { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } } }
</style>
