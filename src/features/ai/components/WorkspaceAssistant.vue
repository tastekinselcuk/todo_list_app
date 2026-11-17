<template>
  <Teleport to="body">
    <aside
      data-workspace-assistant
      aria-label="Yapay Zeka Çalışma Alanı Asistanı"
      class="workspace-ai-sidebar flex flex-col border border-border/65 bg-card/98 text-foreground shadow-2xl"
    >
      <!-- Left-edge Resize Handle -->
      <div
        data-assistant-resize-handle
        role="separator"
        aria-orientation="vertical"
        aria-label="Panel genişliğini ayarla"
        title="Genişliği ayarlamak için sürükleyin"
        class="group absolute inset-y-3 left-0 z-20 hidden w-2.5 -translate-x-1/2 cursor-ew-resize items-center justify-center lg:flex"
        @pointerdown="startResize"
      >
        <span class="h-10 w-1 rounded-full bg-border/60 transition-colors group-hover:bg-primary/60" />
      </div>

      <!-- Header -->
      <header class="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles class="h-4 w-4" />
          </div>
          <h2 class="truncate text-sm font-semibold leading-tight">Yapay Zeka Asistanı</h2>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <span
            class="inline-flex max-w-[132px] truncate rounded-full border px-2 py-0.5 text-[10px] font-medium"
            :class="
              store.hasActiveProviderKey
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border/60 bg-muted/50 text-muted-foreground'
            "
            :title="store.hasActiveProviderKey ? `${store.settings.provider} · ${store.settings.model}` : 'Yerel Mod'"
          >
            {{ store.hasActiveProviderKey ? (store.settings.model || store.settings.provider) : 'Yerel Mod' }}
          </span>
          <button
            type="button"
            data-assistant-settings-btn
            aria-label="Ayarlar"
            title="Ayarlar"
            class="rounded-xl p-1.5 transition-colors"
            :class="
              store.activeTab === 'settings'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            "
            @click="store.activeTab = store.activeTab === 'settings' ? 'chat' : 'settings'"
          >
            <Settings class="h-4 w-4" />
          </button>
          <button
            type="button"
            data-assistant-close
            aria-label="Asistanı kapat"
            class="rounded-xl p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            @click="$emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </header>

      <!-- Navigation Tabs (Asistan & Geçmiş) -->
      <nav class="grid grid-cols-2 gap-1 border-b border-border/50 bg-muted/20 px-3 py-1.5 text-[11px]">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :data-assistant-tab="tab.id"
          class="inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 font-medium whitespace-nowrap transition-all"
          :class="
            store.activeTab === tab.id
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          "
          @click="store.activeTab = tab.id"
        >
          <span class="truncate">{{ tab.label }}</span>
          <span
            v-if="tab.id === 'chat' && store.pendingActions.length"
            class="rounded-full bg-background/25 px-1.5 py-0.2 text-[10px]"
          >
            {{ store.pendingActions.length }}
          </span>
        </button>
      </nav>

      <!-- Error Banner -->
      <div
        v-if="store.error"
        data-assistant-error
        class="mx-3.5 mt-3 flex items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        <span>{{ store.error }}</span>
        <button type="button" class="text-[11px] underline" @click="store.error = ''">Kapat</button>
      </div>

      <!-- Tab Content -->
      <div ref="chatScrollRef" class="ai-scroll flex-1 overflow-y-auto px-3.5 py-3.5 space-y-4">
        <!-- TAB 1: CHAT & WRITE -->
        <template v-if="store.activeTab === 'chat'">
          <!-- Conversation Messages -->
          <div class="space-y-3">
            <div
              v-if="!store.messages.length"
              class="rounded-2xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground"
            >
              Sohbet edin veya <span class="font-semibold text-foreground">/</span> ile modül seçerek işlem yaptırın.
            </div>

            <div
              v-for="msg in store.messages"
              :key="msg.id"
              :data-chat-role="msg.role"
              class="rounded-2xl p-3 text-xs leading-relaxed"
              :class="
                msg.role === 'user'
                  ? 'ml-8 bg-primary text-primary-foreground'
                  : 'mr-4 border border-border/60 bg-card/80 text-foreground'
              "
            >
              <div
                v-if="msg.scopeLabels?.length"
                data-chat-scope-badge
                class="mb-1.5 flex flex-wrap items-center gap-1"
              >
                <span
                  class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                  :class="
                    msg.role === 'user'
                      ? 'bg-primary-foreground/15 text-primary-foreground'
                      : 'bg-primary/10 text-primary'
                  "
                >
                  / {{ msg.scopeLabels.join(' › ') }}
                </span>
              </div>
              <p v-if="msg.role === 'user'" class="whitespace-pre-wrap">{{ msg.content }}</p>
              <div
                v-else
                class="ai-markdown space-y-1.5 text-xs leading-relaxed"
                v-html="structuredMarkdownToSafeHtml(msg.content)"
              />

              <!-- Interactive Clarification / Disambiguation Options -->
              <div
                v-if="msg.clarification?.options?.length"
                data-clarification-options
                class="mt-2.5 flex flex-col gap-1.5 border-t border-border/40 pt-2.5"
              >
                <button
                  v-for="opt in msg.clarification.options"
                  :key="opt.id"
                  type="button"
                  :data-clarification-option="opt.id"
                  :disabled="store.busy || Boolean(msg.clarification.resolvedOptionId)"
                  class="flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] transition-colors"
                  :class="
                    msg.clarification.resolvedOptionId === opt.id
                      ? 'border-primary bg-primary/15 text-primary font-medium'
                      : msg.clarification.resolvedOptionId
                        ? 'border-border/40 bg-muted/30 text-muted-foreground opacity-60'
                        : 'border-border/70 bg-background/80 text-foreground hover:border-primary/50 hover:bg-primary/5'
                  "
                  @click="store.selectClarificationOption(msg.id, opt.id)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="font-medium">{{ opt.label }}</div>
                    <div v-if="opt.description" class="truncate text-[10px] text-muted-foreground">
                      {{ opt.description }}
                    </div>
                  </div>
                  <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {{ opt.action.module }}
                  </span>
                </button>
              </div>
              <div v-if="msg.appliedRunId" class="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
                <span class="text-emerald-600 dark:text-emerald-400 font-medium">Veri girişi uygulandı</span>
                <button
                  type="button"
                  data-inline-undo
                  class="underline text-muted-foreground hover:text-foreground"
                  @click="store.undoActionRun(msg.appliedRunId!)"
                >
                  Geri Al
                </button>
              </div>
            </div>
          </div>

          <!-- Pending Action Approval Cards (in-flow at bottom of chat) -->
          <div v-if="store.pendingActions.length" class="space-y-2.5 pt-1" data-pending-actions-section>
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-foreground">
                Onay Bekleyen ({{ store.pendingActions.length }})
              </span>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  data-clear-pending-actions
                  :disabled="store.busy"
                  class="rounded-xl border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                  @click="store.clearPendingActions()"
                >
                  Temizle
                </button>
                <button
                  v-if="store.pendingActions.length > 1"
                  type="button"
                  data-approve-all-actions
                  :disabled="store.busy"
                  class="rounded-xl bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50"
                  @click="store.approveAllPendingActions()"
                >
                  Tümünü Onayla ({{ store.pendingActions.length }})
                </button>
              </div>
            </div>

            <AiActionPreviewCard
              v-for="(act, idx) in store.pendingActions"
              :key="`${act.module}-${act.operation}-${idx}`"
              :action="act"
              :busy="store.busy"
              @approve="updated => store.approvePendingAction(updated, idx)"
              @update-action="updated => updatePendingAction(idx, updated)"
              @reject="store.rejectPendingAction(idx)"
            />
          </div>
        </template>

        <!-- TAB 2: HISTORY & UNDO -->
        <template v-else-if="store.activeTab === 'history'">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-foreground">AI Veri Girişi Geçmişi & Geri Alma</h3>
            <button
              type="button"
              :disabled="store.busy"
              class="rounded-xl border border-border/60 px-2.5 py-1 text-[11px] hover:bg-muted/60"
              @click="store.loadHistory()"
            >
              Yenile
            </button>
          </div>

          <div
            v-if="!store.actionHistory.length"
            class="rounded-2xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground"
          >
            Henüz kaydedilmiş bir AI veri girişi işlemi bulunmuyor.
          </div>

          <div v-else class="space-y-2.5">
            <div
              v-for="run in store.actionHistory"
              :key="run.id"
              data-history-run
              class="rounded-2xl border border-border/60 bg-card/70 p-3 text-xs"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-semibold text-foreground">
                  {{ run.prompt_summary || 'AI Veri Girişi' }}
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  :class="
                    run.status === 'applied'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ run.status === 'applied' ? 'Uygulandı' : 'Geri Alındı' }}
                </span>
              </div>

              <div class="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>Modüller: {{ (run.target_modules || []).join(', ') || '-' }}</span>
                <button
                  v-if="run.status === 'applied'"
                  type="button"
                  data-undo-run
                  :disabled="store.busy"
                  class="rounded-xl border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/60 disabled:opacity-50"
                  @click="store.undoActionRun(run.id)"
                >
                  Geri Al (Undo)
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 4: SETTINGS -->
        <template v-else-if="store.activeTab === 'settings'">
          <AiProviderSettings
            :settings="store.settings"
            :busy="store.busy"
            @save="payload => store.updateSettings(payload)"
          />
        </template>
      </div>

      <!-- Footer Prompt Input (Chat Tab) -->
      <form
        v-if="store.activeTab === 'chat'"
        class="relative border-t border-border/60 bg-card/40 p-3.5"
        @submit.prevent="handleSendPrompt"
      >
        <!-- Hierarchical / Slash Directory Popover -->
        <div
          v-if="isSlashMenuOpen"
          data-slash-scope-menu
          role="listbox"
          aria-label="Hedef Dizin Seçimi"
          class="ai-scroll absolute bottom-full left-3.5 right-3.5 z-30 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border/80 bg-card p-1.5 shadow-xl"
        >
          <div class="flex items-center justify-between px-2 py-1 text-[10px] font-medium text-muted-foreground">
            <span>
              {{
                selectedScopePath.length
                  ? `${selectedScopePath.map(n => n.label).join(' › ')}`
                  : 'Dizin (/)'
              }}
            </span>
            <span class="text-[10px] opacity-75">↑↓ · Enter · Esc</span>
          </div>

          <div
            v-if="filteredScopeOptions.length === 0"
            class="px-2.5 py-2 text-[11px] text-muted-foreground"
          >
            Eşleşen dizin bulunamadı.
          </div>

          <button
            v-for="(node, idx) in filteredScopeOptions"
            :key="node.id"
            type="button"
            role="option"
            :aria-selected="idx === slashHighlightedIdx"
            :data-slash-option="node.id"
            :disabled="Boolean(node.disabled)"
            class="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-all"
            :class="[
              node.disabled
                ? 'cursor-not-allowed opacity-50'
                : idx === slashHighlightedIdx
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground hover:bg-muted/70',
            ]"
            @mousedown.prevent="selectScopeOption(node)"
            @mouseenter="!node.disabled && (slashHighlightedIdx = idx)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 font-medium">
                <span class="text-[10px]" :class="idx === slashHighlightedIdx && !node.disabled ? 'opacity-85' : 'opacity-60'">/</span>
                <span class="truncate">{{ node.label }}</span>
                <span
                  v-if="node.disabled"
                  class="rounded bg-muted px-1.5 py-0.5 text-[9px] font-normal text-muted-foreground"
                >
                  AI Kapalı
                </span>
              </div>
              <p
                v-if="node.disabled ? node.disabledReason : node.description"
                class="truncate text-[10px]"
                :class="idx === slashHighlightedIdx && !node.disabled ? 'text-primary-foreground/80' : 'text-muted-foreground'"
              >
                {{ node.disabled ? node.disabledReason : node.description }}
              </p>
            </div>
            <span
              v-if="!node.disabled && node.children?.length"
              class="shrink-0 text-xs font-medium"
              :class="idx === slashHighlightedIdx ? 'text-primary-foreground/90' : 'text-muted-foreground'"
              title="Alt dizinleri içerir"
            >
              ›
            </span>
          </button>
        </div>

        <!-- Selected Scope Breadcrumb Tag Bar -->
        <div
          v-if="selectedScopePath.length > 0"
          data-selected-scope-chips
          class="mb-2 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-primary/25 bg-primary/8 px-2.5 py-1.5"
        >
          <div class="flex flex-wrap items-center gap-1 text-[11px]">
            <span class="font-semibold text-primary">/</span>
            <template v-for="(node, idx) in selectedScopePath" :key="node.id">
              <span v-if="idx > 0" class="text-muted-foreground">›</span>
              <button
                type="button"
                class="rounded px-1 py-0.5 font-medium text-primary hover:bg-primary/15"
                :title="`${node.label} seviyesine dön`"
                @click="trimScopeTo(idx)"
              >
                {{ node.label }}
              </button>
            </template>
            <span
              v-if="availableScopeChildren.length > 0"
              class="ml-1 text-[10px] text-muted-foreground"
            >
              (alt sekme için / yazın)
            </span>
          </div>
          <button
            type="button"
            data-clear-scope
            class="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-primary/15 hover:text-foreground"
            title="Dizin seçimini temizle"
            @click="clearScope"
          >
            <X class="h-3 w-3" />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <input
            ref="promptInputRef"
            v-model="promptInput"
            type="text"
            data-assistant-prompt-input
            :disabled="store.busy"
            :placeholder="
              selectedScopePath.length
                ? `${selectedScopePath.map(n => n.label).join(' › ')} için komut yazın... (/ alt dizin)`
                : 'Komut yazın veya dizin seçmek için / tuşuna basın...'
            "
            class="min-w-0 flex-1 rounded-xl border border-border/60 bg-background px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
            @keydown="handlePromptKeydown"
          />
          <button
            type="submit"
            data-assistant-send
            :disabled="store.busy || !promptInput.trim()"
            class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            Gönder
          </button>
        </div>
      </form>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Settings, Sparkles, X } from 'lucide-vue-next'
import { useAiAssistantStore } from '@/features/ai/stores/aiAssistant'
import { structuredMarkdownToSafeHtml } from '@/lib/aiNoteFormat'
import {
  getScopeChildren,
  filterScopeOptions,
  buildPromptScope,
  type ProposedAiAction,
  type AiScopeNode,
} from '@/features/ai/lib/aiClient'
import AiActionPreviewCard from '@/features/ai/components/AiActionPreviewCard.vue'
import AiProviderSettings from '@/features/ai/components/AiProviderSettings.vue'

defineEmits<{
  close: []
}>()

const store = useAiAssistantStore()
const promptInput = ref('')
const promptInputRef = ref<HTMLInputElement | null>(null)
const chatScrollRef = ref<HTMLElement | null>(null)
const selectedScopePath = ref<AiScopeNode[]>([])
const slashMenuDismissed = ref(false)
const slashHighlightedIdx = ref(0)

const WIDTH_STORAGE_KEY = 'workspace_ai_sidebar_width'
const MIN_WIDTH = 300
const MAX_WIDTH = 680

function applySidebarWidth(widthPx: number | null) {
  if (typeof document === 'undefined') return
  if (widthPx === null) {
    document.documentElement.style.removeProperty('--workspace-ai-user-width')
    return
  }
  const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(widthPx)))
  document.documentElement.style.setProperty('--workspace-ai-user-width', `${clamped}px`)
}

let activeMoveHandler: ((ev: PointerEvent) => void) | null = null
let activeUpHandler: (() => void) | null = null

function stopResize() {
  if (typeof window !== 'undefined') {
    if (activeMoveHandler) window.removeEventListener('pointermove', activeMoveHandler)
    if (activeUpHandler) window.removeEventListener('pointerup', activeUpHandler)
  }
  activeMoveHandler = null
  activeUpHandler = null
  if (typeof document !== 'undefined') {
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }
}

function startResize(e: PointerEvent) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  e.preventDefault()
  stopResize()
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'ew-resize'

  activeMoveHandler = (ev: PointerEvent) => {
    const maxAllowed = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - 320))
    const nextWidth = Math.min(maxAllowed, Math.max(MIN_WIDTH, window.innerWidth - ev.clientX - 12))
    applySidebarWidth(nextWidth)
    try {
      window.localStorage?.setItem(WIDTH_STORAGE_KEY, String(Math.round(nextWidth)))
    } catch {
      // ignore storage errors
    }
  }
  activeUpHandler = () => stopResize()
  window.addEventListener('pointermove', activeMoveHandler)
  window.addEventListener('pointerup', activeUpHandler)
}

function scrollChatToBottom() {
  void nextTick(() => {
    const el = chatScrollRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

watch(
  () => [store.messages.length, store.pendingActions.length, store.activeTab],
  () => {
    if (store.activeTab === 'chat') {
      scrollChatToBottom()
    }
  },
)

watch(promptInput, () => {
  slashMenuDismissed.value = false
  slashHighlightedIdx.value = 0
})

const slashMatch = computed(() => {
  if (slashMenuDismissed.value) return null
  const val = promptInput.value
  const m = val.match(/(^|\s)\/([^\s/]*)$/)
  if (!m) return null
  const fullMatch = m[0]
  const leading = m[1] || ''
  const query = m[2] || ''
  const slashStart = val.length - fullMatch.length + leading.length
  return { slashStart, query }
})

const availableScopeChildren = computed(() => getScopeChildren(selectedScopePath.value))
const filteredScopeOptions = computed(() =>
  filterScopeOptions(availableScopeChildren.value, slashMatch.value?.query || ''),
)
const isSlashMenuOpen = computed(
  () => Boolean(slashMatch.value) && availableScopeChildren.value.length > 0,
)

function selectScopeOption(node: AiScopeNode) {
  if (node.disabled) return
  selectedScopePath.value = [...selectedScopePath.value, node]
  if (slashMatch.value) {
    const before = promptInput.value.slice(0, slashMatch.value.slashStart)
    promptInput.value = before.replace(/\s+$/, before.trim() ? ' ' : '')
  }
  slashMenuDismissed.value = false
  slashHighlightedIdx.value = 0
  void nextTick(() => {
    promptInputRef.value?.focus()
  })
}

function trimScopeTo(index: number) {
  selectedScopePath.value = selectedScopePath.value.slice(0, index + 1)
  slashHighlightedIdx.value = 0
  void nextTick(() => {
    promptInputRef.value?.focus()
  })
}

function clearScope() {
  selectedScopePath.value = []
  slashHighlightedIdx.value = 0
  void nextTick(() => {
    promptInputRef.value?.focus()
  })
}

function moveSlashHighlight(step: 1 | -1) {
  const opts = filteredScopeOptions.value
  if (!opts.length) return
  const total = opts.length
  for (let i = 1; i <= total; i += 1) {
    const candidate = (slashHighlightedIdx.value + step * i + total) % total
    if (!opts[candidate]?.disabled) {
      slashHighlightedIdx.value = candidate
      return
    }
  }
}

function handlePromptKeydown(e: KeyboardEvent) {
  if (isSlashMenuOpen.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveSlashHighlight(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveSlashHighlight(-1)
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const selected = filteredScopeOptions.value[slashHighlightedIdx.value]
      if (selected && !selected.disabled) {
        e.preventDefault()
        selectScopeOption(selected)
        return
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      slashMenuDismissed.value = true
      return
    }
  } else if (
    e.key === 'Backspace' &&
    !promptInput.value &&
    selectedScopePath.value.length > 0
  ) {
    e.preventDefault()
    selectedScopePath.value = selectedScopePath.value.slice(0, -1)
  }
}

onMounted(() => {
  try {
    const saved = typeof window !== 'undefined' ? Number(window.localStorage?.getItem(WIDTH_STORAGE_KEY)) : NaN
    if (Number.isFinite(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
      applySidebarWidth(saved)
    }
  } catch {
    // ignore storage errors
  }
  void store.open(store.activeTab === 'insights' ? 'chat' : store.activeTab)
  scrollChatToBottom()
})

onBeforeUnmount(() => {
  stopResize()
})

const tabs: Array<{ id: 'chat' | 'history'; label: string }> = [
  { id: 'chat', label: 'Asistan' },
  { id: 'history', label: 'Geçmiş' },
]

async function handleSendPrompt() {
  const text = promptInput.value.trim()
  if (!text) return
  const activeScope = buildPromptScope(selectedScopePath.value)
  promptInput.value = ''
  selectedScopePath.value = []
  slashMenuDismissed.value = false
  await store.sendPrompt(text, 'chat', activeScope)
}

function updatePendingAction(index: number, updated: ProposedAiAction) {
  if (index >= 0 && index < store.pendingActions.length) {
    store.pendingActions[index] = updated
  }
}
</script>

<style scoped>
.workspace-ai-sidebar {
  position: fixed;
  z-index: 65;
  inset: 14px 12px 14px auto;
  width: var(--workspace-ai-user-width, var(--workspace-ai-open-width, 376px));
  border-radius: 22px;
  backdrop-filter: blur(24px);
}
.ai-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, currentColor 18%, transparent) transparent;
}
.ai-scroll::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.ai-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.ai-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 9999px;
}
.ai-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, currentColor 28%, transparent);
}
.ai-markdown :deep(h1),
.ai-markdown :deep(h2),
.ai-markdown :deep(h3),
.ai-markdown :deep(h4) {
  font-size: 0.78rem;
  font-weight: 600;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
.ai-markdown :deep(ul),
.ai-markdown :deep(ol) {
  padding-left: 1rem;
  margin: 0.25rem 0;
  list-style: disc;
}
.ai-markdown :deep(p) {
  margin: 0.15rem 0;
}
.ai-markdown :deep(code) {
  border-radius: 0.35rem;
  padding: 0.05rem 0.3rem;
  font-size: 0.72rem;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
@media (max-width: 1023px) {
  .workspace-ai-sidebar {
    width: min(calc(100vw - 24px), 400px);
  }
}
</style>
