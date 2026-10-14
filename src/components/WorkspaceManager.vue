<template>
  <section class="workspace-manager flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card/60 shadow-sm" aria-labelledby="workspace-manager-title">
    <header class="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
      <h2 id="workspace-manager-title" class="flex items-center gap-2 text-sm font-semibold"><Layers class="h-4 w-4 text-muted-foreground" />{{ t('workspaces.title') }}</h2>
      <span class="rounded-md bg-muted/60 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{{ store.available.length }}</span>
    </header>
    <div class="flex flex-1 flex-col divide-y divide-border/40 px-4">
      <div class="relative flex min-h-16 flex-1 items-center gap-2 py-3">
        <form v-if="editingId" class="flex min-w-0 flex-1 items-center gap-2" @submit.prevent="rename(editingId)">
          <input ref="editInput" v-model="editName" maxlength="80" autocomplete="off" :disabled="store.busy" :aria-label="t('workspaces.name')" :aria-invalid="Boolean(editName.trim() && duplicate(editName, editingId))" :aria-describedby="editName.trim() && duplicate(editName, editingId) ? 'workspace-edit-error' : undefined" class="h-9 min-w-0 flex-1 rounded-xl border border-border/50 bg-background/40 px-3 text-sm outline-none transition-colors focus:border-primary/40 disabled:opacity-50" @keydown.esc.prevent="cancelEdit" />
          <button type="submit" class="row-action" :title="t('common.save')" :aria-label="t('common.save')" :disabled="store.busy || !editName.trim() || duplicate(editName, editingId)"><Check class="h-4 w-4" /></button>
          <button type="button" class="row-action" :title="t('common.cancel')" :aria-label="t('common.cancel')" :disabled="store.busy" @click="cancelEdit"><X class="h-4 w-4" /></button>
        </form>
        <template v-else>
          <CustomSelect :model-value="selectedId" :options="workspaceOptions" :aria-label="t('workspaces.switch')" :placeholder="t('workspaces.noResults')" :disabled="store.busy" class="min-w-0 flex-1" :button-style="{ height: '2.25rem' }" @update:model-value="selectWorkspace" />
          <button type="button" class="row-action" :title="t('common.edit')" :aria-label="`${t('common.edit')}: ${selected?.name || ''}`" :disabled="store.busy || !selected" @click="selected && beginEdit(selected.id, selected.name)"><Pencil class="h-3.5 w-3.5" /></button>
          <button v-if="selected?.archived_at" type="button" class="row-action" :title="t('workspaces.restore')" :aria-label="`${t('workspaces.restore')}: ${selected.name}`" :disabled="store.busy" @click="restore(selected.id)"><RotateCcw class="h-3.5 w-3.5" /></button>
          <button v-else type="button" class="row-action" :title="store.available.length <= 1 ? t('workspaces.keepOne') : t('workspaces.archive')" :aria-label="`${t('workspaces.archive')}: ${selected?.name || ''}`" :disabled="store.busy || !selected || store.available.length <= 1" @click="selected && archive(selected.id)"><Archive class="h-3.5 w-3.5" /></button>
        </template>
        <p v-if="editingId && editName.trim() && duplicate(editName, editingId)" id="workspace-edit-error" class="absolute bottom-0 left-0 right-0 truncate text-[10px] leading-3 text-destructive" role="status">{{ t('workspaces.duplicate') }}</p>
      </div>
      <form class="relative flex min-h-16 flex-1 items-center gap-2 py-3" @submit.prevent="create">
        <label for="new-workspace-name" class="sr-only">{{ t('workspaces.name') }}</label>
        <input id="new-workspace-name" ref="createInput" v-model="name" maxlength="80" autocomplete="off" :disabled="store.busy" :placeholder="t('workspaces.placeholder')" :aria-invalid="Boolean(name.trim() && duplicate(name))" :aria-describedby="name.trim() && duplicate(name) ? 'workspace-name-error' : undefined" class="h-9 min-w-0 flex-1 rounded-xl border border-border/50 bg-background/40 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/40 disabled:opacity-50" />
        <button type="submit" :disabled="store.busy || !name.trim() || duplicate(name)" class="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
          <Loader2 v-if="creating" class="h-3.5 w-3.5 animate-spin" /><Plus v-else class="h-3.5 w-3.5" />{{ t('settingsPage.newWorkspace') }}
        </button>
        <p v-if="name.trim() && duplicate(name)" id="workspace-name-error" class="absolute bottom-0 left-0 right-0 truncate text-[10px] leading-3 text-destructive" role="status">{{ t('workspaces.duplicate') }}</p>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Archive, Check, Layers, Loader2, Pencil, Plus, RotateCcw, X } from 'lucide-vue-next'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useUIStore } from '@/stores/ui'

const store = useWorkspacesStore()
const ui = useUIStore()
const { t } = useI18n()
const name = ref('')
const editingId = ref('')
const editName = ref('')
const selectedId = ref(store.activeId)
const creating = ref(false)
const createInput = ref<HTMLInputElement>()
const editInput = ref<HTMLInputElement>()
const archived = computed(() => store.items.filter(item => item.archived_at))
const selected = computed(() => store.items.find(item => item.id === selectedId.value))
const workspaceOptions = computed(() => [
  ...store.available.map(item => ({ value: item.id, label: item.name })),
  ...archived.value.map(item => ({ value: item.id, label: `${item.name} · ${t('workspaces.archivedLabel')}` })),
])
const duplicate = (value: string, except = '') => store.items.some(item => item.id !== except && item.name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase())
function reportError() { ui.addToast(t('workspaces.saveFailed'), 'error') }
function cancelEdit() { editingId.value = ''; editName.value = '' }

function selectWorkspace(id: string) {
  if (store.busy) return
  const item = store.items.find(item => item.id === id)
  if (!item) return
  cancelEdit()
  selectedId.value = id
  if (!item.archived_at) store.switchTo(id)
}

async function beginEdit(id: string, value: string) {
  if (store.busy || id !== selectedId.value) return
  editingId.value = id
  editName.value = value
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}

async function create() {
  if (store.busy || creating.value || !name.value.trim() || duplicate(name.value)) return
  creating.value = true
  try {
    if (await store.create(name.value.trim())) { name.value = ''; selectedId.value = store.activeId; ui.addToast(t('workspaces.created'), 'success') }
    else reportError()
  } catch { reportError() }
  finally { creating.value = false; await nextTick(); createInput.value?.focus() }
}

async function rename(id: string) {
  if (store.busy || id !== editingId.value || id !== selectedId.value || !editName.value.trim() || duplicate(editName.value, id)) return
  if (await store.configure(id, { name: editName.value.trim() })) cancelEdit()
  else reportError()
}

async function archive(id: string) {
  if (store.busy || id !== selectedId.value || !selected.value || selected.value.archived_at || store.available.length <= 1 || editingId.value === id) return
  if (await store.configure(id, { archived_at: new Date().toISOString() })) {
    selectedId.value = store.activeId
    ui.addToast(t('workspaces.archived'), 'success')
  }
  else reportError()
}

async function restore(id: string) {
  if (store.busy || id !== selectedId.value || !selected.value?.archived_at) return
  if (await store.configure(id, { archived_at: null })) selectWorkspace(id)
  else reportError()
}

watch(() => store.activeId, id => { selectedId.value = id; cancelEdit() })
</script>

<style scoped>
.workspace-manager :is(button, input):focus-visible { outline: 2px solid hsl(var(--primary) / 0.55); outline-offset: 2px; border-radius: 0.75rem; }
.row-action { display: inline-flex; height: 2rem; width: 2rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.5rem; color: hsl(var(--muted-foreground)); transition: background-color 150ms, color 150ms; }
.row-action:hover:not(:disabled) { background: hsl(var(--muted) / 0.6); color: hsl(var(--foreground)); }
.row-action:disabled { opacity: 0.3; }
@media (prefers-reduced-motion: reduce) { .workspace-manager * { transition-duration: 0s !important; animation: none !important; } }
</style>
