<template>
  <div
    data-ai-action-card
    class="rounded-2xl border border-primary/25 bg-primary/[0.03] p-3.5 text-xs shadow-sm transition-all"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <span class="inline-flex items-center rounded-lg bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {{ moduleLabel }}
        </span>
        <span class="inline-flex items-center rounded-lg border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {{ operationLabel }}
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <label class="text-[10px] text-muted-foreground">Yazma Modu:</label>
        <select
          :value="selectedWriteMode"
          class="rounded-lg border border-border/60 bg-background px-2 py-0.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          @change="onWriteModeChange"
        >
          <option value="append">Sonuna Ekle (append)</option>
          <option value="prepend">Başına Ekle (prepend)</option>
          <option value="replace">Üzerine Yaz (replace)</option>
          <option value="insert_section">Alt Başlık Ekle (insert_section)</option>
        </select>
      </div>
    </div>

    <div v-if="isEditing" class="mt-2.5 space-y-2 rounded-xl border border-primary/30 bg-background/90 p-2.5">
      <div>
        <label class="block text-[10px] font-medium text-muted-foreground mb-1">Başlık</label>
        <input
          v-model="draftTitle"
          type="text"
          data-ai-action-edit-title
          class="w-full rounded-lg border border-border/60 bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label class="block text-[10px] font-medium text-muted-foreground mb-1">İçerik / Not</label>
        <textarea
          v-model="draftNote"
          rows="3"
          data-ai-action-edit-note
          class="w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/40"
        ></textarea>
      </div>
      <div class="flex items-center justify-end gap-1.5">
        <button
          type="button"
          class="rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/60"
          @click="cancelEdit"
        >
          Vazgeç
        </button>
        <button
          type="button"
          data-ai-action-save-edit
          class="rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25"
          @click="saveEdit"
        >
          Kaydet
        </button>
      </div>
    </div>

    <template v-else>
      <p class="mt-2 font-medium text-foreground">
        {{ action.summary || action.title || `${moduleLabel} veri girişi` }}
      </p>

      <div
        v-if="notePreview"
        class="mt-2 rounded-xl border border-border/50 bg-background/80 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
      >
        {{ notePreview }}
      </div>
    </template>

    <div class="mt-3 flex items-center justify-end gap-2">
      <button
        v-if="!isEditing && canEditAction"
        type="button"
        data-ai-action-edit
        :disabled="busy"
        class="mr-auto rounded-xl border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        @click="startEdit"
      >
        Düzenle
      </button>
      <button
        v-if="showReject"
        type="button"
        data-ai-action-reject
        :disabled="busy"
        class="rounded-xl border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        @click="$emit('reject')"
      >
        Vazgeç
      </button>
      <button
        type="button"
        data-ai-action-approve
        :disabled="busy"
        class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
        @click="emitApprove"
      >
        Onayla ve Uygula
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { notePlainTextPreview } from '@/lib/aiNoteFormat'
import type { ProposedAiAction, AiNoteWriteMode } from '@/features/ai/lib/aiClient'

const props = withDefaults(
  defineProps<{
    action: ProposedAiAction
    busy?: boolean
    showReject?: boolean
  }>(),
  {
    busy: false,
    showReject: true,
  },
)

const emit = defineEmits<{
  approve: [action: ProposedAiAction]
  updateAction: [action: ProposedAiAction]
  reject: []
}>()

const selectedWriteMode = ref<AiNoteWriteMode>(props.action.write_mode || 'append')
const isEditing = ref(false)
const draftTitle = ref('')
const draftNote = ref('')

const canEditAction = computed(() => String(props.action.operation || '').toLowerCase() !== 'delete')

watch(
  () => props.action.write_mode,
  value => {
    if (value) selectedWriteMode.value = value
  },
)

watch(
  () => props.action,
  () => {
    isEditing.value = false
  },
)

const MODULE_LABELS: Record<string, string> = {
  plans: 'Planlar',
  tasks: 'Görevler',
  calendar: 'Takvim',
  todos: 'Detaylı Notlar',
  quick_notes: 'Hızlı Notlar',
  periodic: 'Periyodik Rutinler',
  activities: 'Listelerim',
  finance: 'Finans',
  learning: 'Öğrenme Takipçisi',
  flashcards: 'Bilgi / Çalışma Kartları',
  workout: 'Antrenman Takipçisi',
  code: 'Kod Parçacıkları',
}

const moduleLabel = computed(() => MODULE_LABELS[props.action.module] || props.action.module)

const operationLabel = computed(() => {
  const op = String(props.action.operation || '').toLowerCase()
  if (op === 'delete') return 'Kayıt Silme'
  if (op === 'complete') return 'Tamamlama'
  if (op === 'update' || props.action.target_id) return 'Kayıt Güncelleme'
  if (op.includes('note') || op.includes('description')) return 'Yeni Kayıt'
  if (op.startsWith('save_') || op.startsWith('upsert_') || op.startsWith('create_') || op === 'create') return 'Kayıt & Not Girişi'
  return props.action.operation
})

const notePreview = computed(() => {
  const payload = props.action.payload || {}
  if (props.action.module === 'workout' && Array.isArray(payload.exercises)) {
    const items = (payload.exercises as Array<Record<string, unknown>>)
      .slice(0, 6)
      .map((ex, i) => `${i + 1}. ${String(ex.name || 'Egzersiz')} (${String(ex.sets || 3)}x${String(ex.reps || '10')})`)
    return notePlainTextPreview(items.join(' · '), 280)
  }
  if (props.action.module === 'calendar' && payload.starts_at) {
    const start = new Date(String(payload.starts_at))
    const end = payload.ends_at ? new Date(String(payload.ends_at)) : null
    const fmtDate = Number.isNaN(start.getTime()) ? '' : start.toLocaleDateString('tr-TR')
    const fmtStart = Number.isNaN(start.getTime()) ? '' : start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    const fmtEnd = end && !Number.isNaN(end.getTime()) ? end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''
    const desc = String(payload.description || payload.notes || '')
    return notePlainTextPreview(`${fmtDate} ${fmtStart}${fmtEnd ? `–${fmtEnd}` : ''} · ${desc}`, 280)
  }
  if (props.action.module === 'flashcards' && Array.isArray(payload.cards)) {
    const cards = payload.cards as Array<Record<string, unknown>>
    const previewItems = cards
      .slice(0, 4)
      .map(c => `${String(c.front || '')} → ${String(c.back || '')}`)
    const suffix = cards.length > 4 ? ` (+${cards.length - 4} kart)` : ''
    return notePlainTextPreview(`${cards.length} kart: ${previewItems.join(' · ')}${suffix}`, 280)
  }
  const raw =
    payload.notes ||
    payload.description ||
    payload.note ||
    payload.solution ||
    payload.text ||
    payload.code ||
    payload.back ||
    ''
  return notePlainTextPreview(String(raw || ''), 280)
})

function onWriteModeChange(event: Event) {
  const value = (event.target as HTMLSelectElement)?.value as AiNoteWriteMode
  if (value) selectedWriteMode.value = value
}

function resolveRawNote(payload: Record<string, unknown>): string {
  const raw =
    payload.notes ??
    payload.description ??
    payload.note ??
    payload.solution ??
    payload.code ??
    payload.text ??
    payload.prompt ??
    ''
  return notePlainTextPreview(String(raw || ''), 2000)
}

function startEdit() {
  const p = props.action.payload || {}
  draftTitle.value = String(p.title || props.action.title || '')
  draftNote.value = resolveRawNote(p)
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
}

function buildEditedAction(): ProposedAiAction {
  const p = { ...(props.action.payload || {}) }
  const cleanTitle = draftTitle.value.trim() || String(props.action.title || p.title || '')
  const cleanNote = draftNote.value

  if (cleanTitle) {
    p.title = cleanTitle
    if (props.action.module === 'quick_notes') {
      p.text = cleanTitle
    }
  }

  if (cleanNote !== undefined) {
    if (props.action.module === 'code') {
      p.code = cleanNote
    } else if (props.action.module === 'finance') {
      p.note = cleanNote
    } else if (props.action.module === 'todos') {
      p.description = cleanNote
      p.notes = cleanNote
    } else if (props.action.module === 'tasks' || props.action.module === 'calendar') {
      p.description = cleanNote
      p.notes = cleanNote
    } else if (props.action.module === 'learning' && ('prompt' in p || 'solution' in p)) {
      if ('solution' in p) p.solution = cleanNote
      else p.prompt = cleanNote
    } else {
      p.notes = cleanNote
    }
  }

  p.write_mode = selectedWriteMode.value
  return {
    ...props.action,
    write_mode: selectedWriteMode.value,
    title: cleanTitle || props.action.title,
    summary: cleanTitle ? `${moduleLabel.value}: "${cleanTitle}"` : props.action.summary,
    payload: p,
  }
}

function saveEdit() {
  const updated = buildEditedAction()
  isEditing.value = false
  emit('updateAction', updated)
}

function emitApprove() {
  if (isEditing.value) {
    const updated = buildEditedAction()
    isEditing.value = false
    emit('approve', updated)
    return
  }
  emit('approve', {
    ...props.action,
    write_mode: selectedWriteMode.value,
    payload: {
      ...(props.action.payload || {}),
      write_mode: selectedWriteMode.value,
    },
  })
}
</script>
