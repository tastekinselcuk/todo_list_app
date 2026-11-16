<template>
  <Teleport to="body">
    <aside
      data-workspace-assistant
      aria-label="Yapay Zeka Çalışma Alanı Asistanı"
      class="workspace-ai-sidebar flex flex-col border border-border/65 bg-card/98 text-foreground shadow-2xl"
    >
      <!-- Header -->
      <header class="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <h2 class="truncate text-sm font-semibold leading-tight">Yapay Zeka Asistanı</h2>
            <p class="truncate text-[11px] text-muted-foreground">
              Çapraz modül analizi ve akıllı veri girişi
            </p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <span
            class="hidden rounded-full border px-2 py-0.5 text-[10px] font-medium xl:inline-flex"
            :class="
              store.hasActiveProviderKey
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-border/60 bg-muted/50 text-muted-foreground'
            "
          >
            {{ store.settings.provider.toUpperCase() }} · {{ store.hasActiveProviderKey ? 'Anahtar Aktif' : 'Yerel Mod' }}
          </span>
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

      <!-- Navigation Tabs -->
      <nav class="flex items-center gap-1 overflow-x-auto border-b border-border/50 bg-muted/20 px-3 py-2 text-[11px]">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :data-assistant-tab="tab.id"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-medium whitespace-nowrap transition-all"
          :class="
            store.activeTab === tab.id
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          "
          @click="store.activeTab = tab.id"
        >
          <span>{{ tab.label }}</span>
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
      <div class="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-4">
        <!-- TAB 1: CHAT & WRITE -->
        <template v-if="store.activeTab === 'chat'">
          <!-- Quick Prompts -->
          <div class="space-y-1.5">
            <p class="text-[11px] font-medium text-muted-foreground">Hızlı Komutlar & Veri Girişi</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="chip in quickPrompts"
                :key="chip.label"
                type="button"
                data-quick-prompt
                :disabled="store.busy"
                class="rounded-xl border border-border/60 bg-card/80 px-2.5 py-1 text-[11px] text-foreground hover:border-primary/40 hover:bg-primary/[0.04] disabled:opacity-50"
                @click="runQuickPrompt(chip.prompt, chip.mode)"
              >
                {{ chip.label }}
              </button>
            </div>
          </div>

          <!-- Pending Action Approval Cards -->
          <div v-if="store.pendingActions.length" class="space-y-2.5" data-pending-actions-section>
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-foreground">
                Onay Bekleyen Veri Girişleri ({{ store.pendingActions.length }})
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

          <!-- Direct Structured Note Entry Composer -->
          <details class="group rounded-2xl border border-border/60 bg-card/50 p-3 text-xs">
            <summary class="cursor-pointer font-medium text-foreground flex items-center justify-between">
              <span>Hedef Modüle Doğrudan Yapılandırılmış Not / Veri Gönder</span>
              <span class="text-[10px] text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div class="mt-3 space-y-2.5 pt-2 border-t border-border/40">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label class="block text-[10px] text-muted-foreground mb-1">Hedef Modül</label>
                  <select
                    v-model="composerModule"
                    data-composer-module
                    class="w-full rounded-xl border border-border/60 bg-background px-2.5 py-1.5 text-xs"
                  >
                    <option value="quick_notes">Hızlı Notlar</option>
                    <option value="plans">Planlar (Günlük/Haftalık)</option>
                    <option value="calendar">Takvim Etkinliği</option>
                    <option value="tasks">Görevler</option>
                    <option value="todos">Detaylı Notlar</option>
                    <option value="workout">Antrenman Takipçisi</option>
                    <option value="periodic">Periyodik Rutinler</option>
                    <option value="activities">Listelerim (Film/Kitap/Yer)</option>
                    <option value="finance">Finans İşlemi + Not</option>
                    <option value="finance_position">Finans Pozisyonu</option>
                    <option value="learning">Öğrenme Konusu / Hata Notu</option>
                    <option value="flashcards">Çalışma Kartları</option>
                    <option value="code">Kod Parçacığı</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] text-muted-foreground mb-1">Not Yazma Modu</label>
                  <select
                    v-model="composerWriteMode"
                    data-composer-write-mode
                    class="w-full rounded-xl border border-border/60 bg-background px-2.5 py-1.5 text-xs"
                  >
                    <option value="append">Sonuna Ekle (append)</option>
                    <option value="prepend">Başına Ekle (prepend)</option>
                    <option value="replace">Üzerine Yaz (replace)</option>
                    <option value="insert_section">Alt Başlık Ekle (insert_section)</option>
                  </select>
                </div>
              </div>

              <input
                v-model="composerTitle"
                type="text"
                data-composer-title
                placeholder="Başlık (Örn: Sprint Planı, Kitap Özeti, Harcama Notu)..."
                class="w-full rounded-xl border border-border/60 bg-background px-3 py-1.5 text-xs"
              />

              <textarea
                v-model="composerNotes"
                rows="3"
                data-composer-notes
                placeholder="Not içeriği (Markdown veya düz metin; AI otomatik yapılandırır)..."
                class="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-xs"
              ></textarea>

              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  data-composer-queue
                  :disabled="store.busy || (!composerTitle.trim() && !composerNotes.trim())"
                  class="rounded-xl bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  @click="submitStructuredComposer"
                >
                  {{ store.settings.write_mode === 'auto_apply' ? 'Modüle Doğrudan Yaz' : 'Önizleme Listesine Ekle' }}
                </button>
              </div>
            </div>
          </details>

          <!-- Conversation Messages -->
          <div class="space-y-3">
            <div
              v-if="!store.messages.length"
              class="rounded-2xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground"
            >
              Çalışma alanınızdaki verileri analiz etmek, öneri almak veya herhangi bir modülün not alanına veri girmek için aşağıdan komut gönderin.
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
              <p class="whitespace-pre-wrap">{{ msg.content }}</p>

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
                      ? 'border-primary bg-primary/12 text-primary font-medium'
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
        </template>

        <!-- TAB 2: INSIGHTS & RECOMMENDATIONS -->
        <template v-else-if="store.activeTab === 'insights'">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-foreground">Çapraz Modül Durum Özeti</h3>
            <button
              type="button"
              data-refresh-analysis
              :disabled="store.busy"
              class="rounded-xl border border-border/60 px-2.5 py-1 text-[11px] hover:bg-muted/60 disabled:opacity-50"
              @click="store.refreshWorkspaceAnalysis()"
            >
              Analizi Yenile
            </button>
          </div>

          <div v-if="store.digest" class="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs">
            <div class="rounded-2xl border border-border/60 bg-card/60 p-2.5">
              <span class="text-[10px] text-muted-foreground">Bekleyen Planlar</span>
              <p class="mt-0.5 text-base font-semibold">{{ store.digest.plans?.pending_count ?? 0 }}</p>
              <span class="text-[10px] text-amber-600 dark:text-amber-400">
                {{ store.digest.plans?.overdue_count ?? 0 }} gecikmiş
              </span>
            </div>
            <div class="rounded-2xl border border-border/60 bg-card/60 p-2.5">
              <span class="text-[10px] text-muted-foreground">Görevler</span>
              <p class="mt-0.5 text-base font-semibold">{{ store.digest.tasks?.pending_count ?? 0 }}</p>
              <span class="text-[10px] text-amber-600 dark:text-amber-400">
                {{ store.digest.tasks?.overdue_count ?? 0 }} gecikmiş
              </span>
            </div>
            <div class="rounded-2xl border border-border/60 bg-card/60 p-2.5">
              <span class="text-[10px] text-muted-foreground">Notlar & Dokümanlar</span>
              <p class="mt-0.5 text-base font-semibold">
                {{ (store.digest.todos?.active_count ?? 0) + (store.digest.quick_notes?.total_count ?? 0) }}
              </p>
              <span class="text-[10px] text-muted-foreground">
                {{ store.digest.todos?.active_count ?? 0 }} detaylı · {{ store.digest.quick_notes?.total_count ?? 0 }} hızlı
              </span>
            </div>
            <div class="rounded-2xl border border-border/60 bg-card/60 p-2.5">
              <span class="text-[10px] text-muted-foreground">Öğrenme Hataları</span>
              <p class="mt-0.5 text-base font-semibold">{{ store.digest.learning?.unresolved_mistakes ?? 0 }}</p>
              <span class="text-[10px] text-muted-foreground">
                {{ store.digest.learning?.active_topics ?? 0 }} aktif konu
              </span>
            </div>
          </div>

          <!-- Insights List -->
          <div class="space-y-2">
            <h4 class="text-xs font-semibold text-foreground">Tespitler</h4>
            <div
              v-for="(item, i) in store.insights"
              :key="i"
              data-insight-card
              class="rounded-2xl border p-3 text-xs"
              :class="
                item.severity === 'warning'
                  ? 'border-amber-500/35 bg-amber-500/[0.06]'
                  : item.severity === 'success'
                    ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                    : 'border-border/60 bg-card/60'
              "
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold text-foreground">{{ item.title }}</span>
                <span class="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {{ item.module }}
                </span>
              </div>
              <p class="mt-1 text-[11px] text-muted-foreground">{{ item.detail }}</p>
            </div>
          </div>

          <!-- Recommendations List -->
          <div v-if="store.recommendations.length" class="space-y-2">
            <h4 class="text-xs font-semibold text-foreground">Akıllı Öneriler</h4>
            <div
              v-for="(rec, idx) in store.recommendations"
              :key="idx"
              data-recommendation-card
              class="rounded-2xl border border-primary/25 bg-primary/[0.03] p-3 text-xs"
            >
              <p class="font-semibold text-foreground">{{ rec.title }}</p>
              <p class="mt-1 text-[11px] text-muted-foreground">{{ rec.reason }}</p>
              <div v-if="rec.suggested_action" class="mt-2.5 flex justify-end">
                <button
                  type="button"
                  data-apply-recommendation
                  :disabled="store.busy"
                  class="rounded-xl bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  @click="applyRecommendation(rec.suggested_action)"
                >
                  Öneriyi Uygula
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- TAB 3: HISTORY & UNDO -->
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
          class="absolute bottom-full left-3.5 right-3.5 z-30 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border/80 bg-card p-1.5 shadow-xl"
        >
          <div class="flex items-center justify-between px-2 py-1 text-[10px] font-medium text-muted-foreground">
            <span>
              {{
                selectedScopePath.length
                  ? `Alt Dizin: ${selectedScopePath.map(n => n.label).join(' › ')}`
                  : 'Hedef Modül Seçin (/)'
              }}
            </span>
            <span class="text-[10px] opacity-75">↑↓ Seç · Enter Onayla · Esc Kapat</span>
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
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors"
            :class="[
              node.disabled
                ? 'cursor-not-allowed opacity-50'
                : idx === slashHighlightedIdx
                  ? 'bg-primary/12 text-primary'
                  : 'text-foreground hover:bg-muted/70',
            ]"
            @mousedown.prevent="selectScopeOption(node)"
            @mouseenter="!node.disabled && (slashHighlightedIdx = idx)"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 font-medium">
                <span class="text-[10px] opacity-60">/</span>
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
                class="truncate text-[10px] text-muted-foreground"
              >
                {{ node.disabled ? node.disabledReason : node.description }}
              </p>
            </div>
            <span
              v-if="!node.disabled && node.children?.length"
              class="shrink-0 text-[11px] text-muted-foreground"
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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Sparkles, X } from 'lucide-vue-next'
import { useAiAssistantStore } from '@/features/ai/stores/aiAssistant'
import { structuredMarkdownToSafeHtml } from '@/lib/aiNoteFormat'
import {
  getScopeChildren,
  filterScopeOptions,
  buildPromptScope,
  type ProposedAiAction,
  type AiNoteWriteMode,
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
const selectedScopePath = ref<AiScopeNode[]>([])
const slashMenuDismissed = ref(false)
const slashHighlightedIdx = ref(0)

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
  void store.open(store.activeTab)
})

const tabs: Array<{ id: 'chat' | 'insights' | 'history' | 'settings'; label: string }> = [
  { id: 'chat', label: 'Asistan & Veri Girişi' },
  { id: 'insights', label: 'Analiz & Öneriler' },
  { id: 'history', label: 'Geçmiş & Geri Al' },
  { id: 'settings', label: 'AI Ayarları' },
]

const quickPrompts: Array<{ label: string; prompt: string; mode: 'analyze' | 'recommend' | 'write' | 'chat' }> = [
  {
    label: 'Çalışma alanımı analiz et',
    prompt: 'Tüm modüllerdeki verilerimi analiz et ve öncelik önerisinde bulun.',
    mode: 'analyze',
  },
  {
    label: 'Bugünkü plana odak notu ekle',
    prompt: 'Günlük plana odak ve öncelik değerlendirme notu ekle',
    mode: 'write',
  },
  {
    label: 'Detaylı not şablonu oluştur',
    prompt: 'Detaylı notlara haftalık değerlendirme ve aksiyon şablonu ekle',
    mode: 'write',
  },
  {
    label: 'Yeni görev ve açıklama yaz',
    prompt: 'Görevlere önemli kontrol listesi görevi ekle',
    mode: 'write',
  },
]

const composerModule = ref('quick_notes')
const composerWriteMode = ref<AiNoteWriteMode>('append')
const composerTitle = ref('')
const composerNotes = ref('')

async function handleSendPrompt() {
  const text = promptInput.value.trim()
  if (!text) return
  const activeScope = buildPromptScope(selectedScopePath.value)
  promptInput.value = ''
  selectedScopePath.value = []
  slashMenuDismissed.value = false
  await store.sendPrompt(text, 'chat', activeScope)
}

async function runQuickPrompt(prompt: string, mode: 'analyze' | 'recommend' | 'write' | 'chat') {
  await store.sendPrompt(prompt, mode)
}

function updatePendingAction(index: number, updated: ProposedAiAction) {
  if (index >= 0 && index < store.pendingActions.length) {
    store.pendingActions[index] = updated
  }
}

async function applyRecommendation(action: ProposedAiAction) {
  if (store.settings.write_mode === 'auto_apply') {
    await store.approvePendingAction(action)
  } else {
    store.pendingActions.push(action)
    store.activeTab = 'chat'
  }
}

async function submitStructuredComposer() {
  const title = composerTitle.value.trim() || 'AI Not Kaydı'
  const rawNotes = composerNotes.value.trim()
  const richHtml = structuredMarkdownToSafeHtml(rawNotes || title)
  const mod = composerModule.value
  const writeMode = composerWriteMode.value

  let action: ProposedAiAction
  switch (mod) {
    case 'plans':
      action = {
        module: 'plans',
        operation: 'save_plan',
        write_mode: writeMode,
        title,
        summary: `Planlar modülüne notlu kayıt: "${title}"`,
        payload: { title, scope: 'daily', priority: 'medium', notes: richHtml, write_mode: writeMode },
      }
      break
    case 'tasks':
      action = {
        module: 'tasks',
        operation: 'upsert_task',
        write_mode: writeMode,
        title,
        summary: `Görevler modülüne açıklamalı kayıt: "${title}"`,
        payload: { title, status: 'todo', priority: 'medium', description: rawNotes || title, write_mode: writeMode },
      }
      break
    case 'todos':
      action = {
        module: 'todos',
        operation: 'save_todo',
        write_mode: writeMode,
        title,
        summary: `Detaylı Notlar modülüne kayıt: "${title}"`,
        payload: { title, priority: 'medium', notes: richHtml, write_mode: writeMode },
      }
      break
    case 'periodic':
      action = {
        module: 'periodic',
        operation: 'save_task',
        write_mode: writeMode,
        title,
        summary: `Periyodik Rutinlere notlu kayıt: "${title}"`,
        payload: { title, category: 'habit', frequency: 'daily', notes: rawNotes || title, write_mode: writeMode },
      }
      break
    case 'activities':
      action = {
        module: 'activities',
        operation: 'save_item',
        write_mode: writeMode,
        title,
        summary: `Listelerim modülüne notlu kayıt: "${title}"`,
        payload: { title, type: 'book', status: 'want', notes: rawNotes || title, write_mode: writeMode },
      }
      break
    case 'finance':
      action = {
        module: 'finance',
        operation: 'save_transaction',
        write_mode: writeMode,
        title,
        summary: `Finans modülüne notlu işlem: "${title}"`,
        payload: { kind: 'expense', amount: 100, category: 'general', note: `${title}: ${rawNotes}`, write_mode: writeMode },
      }
      break
    case 'learning':
      action = {
        module: 'learning',
        operation: 'save_topic',
        write_mode: writeMode,
        title,
        summary: `Öğrenme modülüne notlu konu: "${title}"`,
        payload: { title, category: 'Genel', status: 'learning', notes: rawNotes || title, write_mode: writeMode },
      }
      break
    case 'calendar': {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const start = new Date(now)
      start.setMinutes(0, 0, 0)
      start.setHours(start.getHours() + 1)
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul'
      action = {
        module: 'calendar',
        operation: 'save_event',
        write_mode: writeMode,
        title,
        summary: `Takvime etkinlik ve not ekle: "${title}"`,
        payload: {
          title,
          description: rawNotes || title,
          due_on: localDate,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          timezone: tz,
          estimate_minutes: 60,
          status: 'todo',
          priority: 'medium',
          write_mode: writeMode,
        },
      }
      break
    }
    case 'workout': {
      const lines = rawNotes
        .split(/\r?\n|,/)
        .map((line) => line.trim())
        .filter(Boolean)
      const exercises = (lines.length ? lines : [title]).map((name) => ({
        name: name.slice(0, 160),
        sets: 3,
        reps: '10-12',
      }))
      action = {
        module: 'workout',
        operation: 'save_routine',
        write_mode: writeMode,
        title,
        summary: `Antrenman Takipçisine program ekle: "${title}" (${exercises.length} egzersiz)`,
        payload: {
          title,
          day_of_week: 'Any',
          exercises,
          write_mode: writeMode,
        },
      }
      break
    }
    case 'flashcards': {
      const lines = rawNotes
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      const cards = lines.length
        ? lines.map((line) => {
            const parts = line.split(/\s*(?:::|->|\|)\s*/)
            if (parts.length >= 2) {
              return { front: parts[0], back: parts.slice(1).join(' ') }
            }
            return { front: title, back: line }
          })
        : [{ front: title, back: 'AI tarafından oluşturulan çalışma kartı' }]
      action = {
        module: 'flashcards',
        operation: 'save_deck',
        write_mode: writeMode,
        title,
        summary: `Çalışma Kartlarına deste ekle: "${title}" (${cards.length} kart)`,
        payload: {
          title,
          color: '#6366f1',
          cards,
          write_mode: writeMode,
        },
      }
      break
    }
    case 'code':
      action = {
        module: 'code',
        operation: 'save_snippet',
        write_mode: writeMode,
        title,
        summary: `Kod Parçacıklarına kayıt: "${title}"`,
        payload: { title, language: 'typescript', code: rawNotes || '// AI snippet', write_mode: writeMode },
      }
      break
    case 'quick_notes':
    default:
      action = {
        module: 'quick_notes',
        operation: 'save_note',
        write_mode: writeMode,
        title,
        summary: `Hızlı Notlara kayıt: "${title}"`,
        payload: { text: title, notes: richHtml, write_mode: writeMode },
      }
      break
  }

  composerTitle.value = ''
  composerNotes.value = ''

  if (store.settings.write_mode === 'auto_apply') {
    await store.approvePendingAction(action)
  } else {
    store.pendingActions.push(action)
  }
}
</script>

<style scoped>
.workspace-ai-sidebar {
  position: fixed;
  z-index: 65;
  inset: 14px 12px 14px auto;
  width: var(--workspace-ai-open-width, 376px);
  border-radius: 22px;
  backdrop-filter: blur(24px);
}
@media (max-width: 1023px) {
  .workspace-ai-sidebar {
    width: min(calc(100vw - 24px), 400px);
  }
}
</style>
