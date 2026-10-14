<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronDown, Layers, Search, Settings2 } from 'lucide-vue-next'
import { useWorkspacesStore } from '@/stores/workspaces'

const emit = defineEmits<{ manage: [] }>()
const store = useWorkspacesStore()
const { t } = useI18n()
const open = ref(false)
const query = ref('')
const trigger = ref<HTMLButtonElement>()
const search = ref<HTMLInputElement>()
const popover = ref<HTMLElement>()
const position = ref({ top: '0px', left: '0px', width: '260px' })
const matches = computed(() => store.available.filter(item =>
  item.name.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))

function close() { open.value = false; query.value = '' }
async function toggle() {
  if (open.value) { close(); return }
  const rect = trigger.value!.getBoundingClientRect()
  const width = Math.min(300, window.innerWidth - 24)
  position.value = {
    top: `${rect.bottom + 8}px`,
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    width: `${width}px`,
  }
  open.value = true
  await nextTick()
  search.value?.focus()
}
function select(id: string) { close(); store.switchTo(id); trigger.value?.focus() }
function outside(event: PointerEvent) {
  if (!trigger.value?.contains(event.target as Node) && !popover.value?.contains(event.target as Node)) close()
}
function scroll(event: Event) {
  if (!(event.target instanceof Node) || !popover.value?.contains(event.target)) close()
}
document.addEventListener('pointerdown', outside)
window.addEventListener('resize', close)
window.addEventListener('scroll', scroll, true)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', scroll, true)
})
</script>

<template>
  <button ref="trigger" type="button" class="flex min-w-0 max-w-[240px] items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" :aria-label="t('workspaces.switch')" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
    <Layers class="h-3.5 w-3.5 shrink-0" /><span class="truncate">{{ store.active?.name }}</span><ChevronDown class="h-3 w-3 shrink-0" />
  </button>
  <Teleport to="body">
    <div v-if="open" ref="popover" role="dialog" :aria-label="t('workspaces.switch')" :style="position" class="fixed z-[100] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/10" @keydown.esc.stop="close(); trigger?.focus()">
      <div class="flex items-center gap-2 border-b border-border/40 px-3 py-2.5"><Search class="h-3.5 w-3.5 text-muted-foreground" /><input ref="search" v-model="query" :placeholder="t('workspaces.search')" :aria-label="t('workspaces.search')" class="min-w-0 flex-1 bg-transparent text-xs outline-none" @keydown.down.prevent="(popover?.querySelector('[data-workspace]') as HTMLButtonElement)?.focus()" /></div>
      <div class="max-h-64 overflow-y-auto p-1.5">
        <button v-for="item in matches" :key="item.id" type="button" data-workspace class="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none" :class="item.id === store.activeId ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'" :aria-pressed="item.id === store.activeId" @click="select(item.id)"><span class="truncate">{{ item.name }}</span><Check v-if="item.id === store.activeId" class="h-3.5 w-3.5 shrink-0" /></button>
        <p v-if="!matches.length" class="p-3 text-xs text-muted-foreground">{{ t('workspaces.noResults') }}</p>
      </div>
      <button type="button" class="flex w-full items-center gap-2 border-t border-border/40 px-4 py-3 text-xs text-muted-foreground hover:bg-muted/50" @click="close(); emit('manage')"><Settings2 class="h-3.5 w-3.5" />{{ t('workspaces.manage') }}</button>
    </div>
  </Teleport>
</template>
