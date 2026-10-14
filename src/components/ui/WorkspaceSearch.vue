<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowUpRight, Loader2, Search, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useWorkspacesStore } from '@/stores/workspaces'
import { supabase } from '@/lib/supabase'
import { parseSearchGroups, searchHitKey, type SearchGroup, type SearchHit } from '@/lib/workspaceSearch'

const props = defineProps<{ enabled: string[] }>()
const emit = defineEmits<{ select: [hit: SearchHit] }>()
const { t } = useI18n(), workspaces = useWorkspacesStore()
const dialog = ref<HTMLDialogElement>(), input = ref<HTMLInputElement>(), query = ref(''), opened = ref(false)
const groups = ref<SearchGroup[]>([]), busy = ref(false), error = ref(''), highlighted = ref(0), completedQuery = ref('')
const hits = computed(() => groups.value.flatMap(group => group.items))
const resultCount = computed(() => groups.value.reduce((n, group) => n + group.total, 0))
const scope = computed(() => `${workspaces.sessionKey}|${props.enabled.join(',')}`)
let sequence = 0, delay: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined
function cancel() { sequence++;clearTimeout(delay);delay = undefined;controller?.abort();controller = undefined;busy.value = false }
function reset() { cancel();groups.value = [];error.value = '';completedQuery.value = '';highlighted.value = 0 }
async function open() {
  reset();query.value = '';opened.value = true;dialog.value?.showModal()
  await nextTick();input.value?.focus()
}
function close() { opened.value = false;reset();query.value = '';dialog.value?.close() }
async function search(module?: string) {
  const text = query.value.trim().slice(0, 120)
  if (!text || !opened.value) return
  cancel()
  const request = sequence, capturedScope = scope.value
  const abort = new AbortController();controller = abort
  const deadline = setTimeout(() => abort.abort(), 12_000)
  busy.value = true;error.value = ''
  try {
    const existing = module ? groups.value.find(group => group.module === module) : undefined
    const result = await supabase.rpc('search_workspace', { wid: workspaces.activeId, query_text: text, page_size: 5, page_offset: existing?.items.length || 0, only_module: module || null }).abortSignal(abort.signal)
    if (request !== sequence || scope.value !== capturedScope || !opened.value) return
    if (result.error) throw result.error
    const parsed = parseSearchGroups(result.data, props.enabled)
    if (module && existing) {
      const next = parsed.find(group => group.module === module)
      if (next) { existing.total = next.total;existing.items.push(...next.items.filter(item => !existing.items.some(old => searchHitKey(old) === searchHitKey(item)))) }
    } else { groups.value = parsed;highlighted.value = 0 }
    completedQuery.value = text
  } catch (failure) {
    if (request !== sequence || scope.value !== capturedScope || !opened.value) return
    const code = (failure as { code?: string })?.code
    error.value = ['PGRST202','42883','42P01'].includes(code || '') ? 'search.setup' : 'search.failed'
  } finally { clearTimeout(deadline);if (request === sequence) busy.value = false }
}
watch(query, () => {
  reset()
  if (query.value.trim() && opened.value) { busy.value = true;delay = setTimeout(() => { delay = undefined;void search() }, 250) }
})
watch(scope, close)
function move(direction: number) {
  if (!hits.value.length) return
  highlighted.value = (highlighted.value + direction + hits.value.length) % hits.value.length
  dialog.value?.querySelector(`#workspace-search-result-${highlighted.value}`)?.scrollIntoView({ block: 'nearest' })
}
function select(hit?: SearchHit) {
  if (!hit || !props.enabled.includes(hit.module) || busy.value) return
  emit('select', hit);close()
}
function submit() { if (completedQuery.value === query.value.trim() && !busy.value) select(hits.value[highlighted.value]);else void search() }
const indexOf = (hit: SearchHit) => hits.value.findIndex(item => searchHitKey(item) === searchHitKey(hit))
onBeforeUnmount(cancel)
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="workspace-search fixed top-[12vh] mx-auto w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-card p-0 text-foreground shadow-2xl" :aria-label="t('search.title')" @close="close" @click="event => { if(event.target === dialog) close() }">
    <div class="flex items-center gap-3 border-b border-border/50 px-4 py-3">
      <Loader2 v-if="busy" class="h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
      <Search v-else class="h-4 w-4 shrink-0 text-muted-foreground" />
      <input ref="input" v-model="query" type="text" maxlength="120" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" :aria-expanded="opened" aria-controls="workspace-search-results" :aria-activedescendant="hits[highlighted] ? `workspace-search-result-${highlighted}` : undefined" :aria-label="t('search.title')" :placeholder="t('search.placeholder')" class="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="submit" />
      <button type="button" class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/50" :aria-label="t('common.cancel')" @click="close"><X class="h-4 w-4" /></button>
    </div>
    <div class="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2 text-[10px] text-muted-foreground">
      <span class="truncate">{{ workspaces.active?.name }} · {{ t('search.scope') }}</span>
      <span v-if="completedQuery && !busy" class="shrink-0 tabular-nums" aria-live="polite">{{ t('search.count', { count: resultCount }) }}</span>
    </div>
    <div id="workspace-search-results" role="listbox" :aria-label="t('search.results')" :aria-busy="busy" class="max-h-[min(55vh,28rem)] overflow-y-auto p-2">
      <div v-if="error" role="status" class="px-4 py-8 text-center text-xs text-muted-foreground"><p>{{ t(error) }}</p><button v-if="error !== 'search.setup'" type="button" class="mt-3 rounded-lg px-3 py-1.5 text-foreground hover:bg-muted/50" @click="search()">{{ t('workspace.retryModule') }}</button></div>
      <p v-else-if="!query.trim()" class="px-4 py-8 text-center text-xs text-muted-foreground">{{ t('search.hint') }}</p>
      <p v-else-if="!busy && !hits.length" role="status" class="px-4 py-8 text-center text-xs text-muted-foreground">{{ t('search.empty') }}</p>
      <template v-else>
        <div v-for="group in groups" :key="group.module" role="group" :aria-label="t(group.module === 'pomodoro' ? 'pomoNotes.tab' : `workspace.modules.${group.module}Name`)" class="mb-1 last:mb-0">
          <div class="flex items-center gap-2 px-3 pb-1 pt-3 text-[10px] font-medium text-muted-foreground"><span>{{ t(group.module === 'pomodoro' ? 'pomoNotes.tab' : `workspace.modules.${group.module}Name`) }}</span><span class="tabular-nums text-muted-foreground/60">{{ group.total }}</span></div>
          <button v-for="hit in group.items" :id="`workspace-search-result-${indexOf(hit)}`" :key="searchHitKey(hit)" type="button" role="option" :aria-selected="indexOf(hit) === highlighted" :disabled="busy" class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-60" :class="indexOf(hit) === highlighted ? 'bg-muted/60' : 'hover:bg-muted/40'" @pointermove="highlighted = indexOf(hit)" @click="select(hit)">
            <div class="min-w-0 flex-1"><p class="truncate text-xs font-medium">{{ hit.title || t('search.untitled') }}</p><p v-if="hit.preview" class="mt-1 line-clamp-2 break-words text-[11px] leading-relaxed text-muted-foreground">{{ hit.preview }}</p></div><ArrowUpRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          </button>
          <button v-if="group.items.length < group.total" type="button" :disabled="busy" class="mb-1 ml-3 rounded-lg px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50" @click="search(group.module)">{{ t('search.more') }}</button>
        </div>
      </template>
    </div>
    <div class="border-t border-border/40 px-4 py-2.5 text-[10px] leading-relaxed text-muted-foreground/70">{{ t('search.privateExcluded') }}</div>
  </dialog>
</template>

<style scoped>
.workspace-search::backdrop { background: rgb(2 6 23 / .4);backdrop-filter: blur(4px); }
.workspace-search[open] { animation: search-open 160ms ease-out; }
@keyframes search-open { from { opacity: 0;transform: translateY(-5px); } to { opacity: 1;transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .workspace-search[open] { animation: none; } }
</style>
