import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useUIStore } from '@/stores/ui'
import {
  defaultAiSettings,
  fetchAiSettings,
  saveAiSettings,
  fetchAiWorkspaceDigest,
  fetchAiActionHistory,
  executeAiActions,
  undoAiActionRun,
  invokeAiAssistant,
  synthesizeWorkspaceAnalysis,
  type AiProviderId,
  type AiWriteMode,
  type AiNoteWriteMode,
  type AiTransformInstruction,
  type AiSettingsState,
  type AiWorkspaceDigest,
  type AiInsightItem,
  type AiRecommendationItem,
  type ProposedAiAction,
  type AiActionRunRecord,
  type AiPromptScope,
  type AiClarificationPrompt,
  type AiConversationTurn,
} from '@/features/ai/lib/aiClient'

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  scopeLabels?: string[]
  actions?: ProposedAiAction[]
  clarification?: AiClarificationPrompt | null
  appliedRunId?: string | null
}

export const useAiAssistantStore = defineStore('aiAssistant', () => {
  const isOpen = ref(false)
  const activeTab = ref<'chat' | 'insights' | 'history' | 'settings'>('chat')
  const busy = ref(false)
  const error = ref('')

  const settings = ref<AiSettingsState>(defaultAiSettings())
  const digest = ref<AiWorkspaceDigest | null>(null)
  const insights = ref<AiInsightItem[]>([])
  const recommendations = ref<AiRecommendationItem[]>([])
  const messages = ref<AiChatMessage[]>([])
  const conversationId = ref<string>('')
  const pendingActions = ref<ProposedAiAction[]>([])
  const actionHistory = ref<AiActionRunRecord[]>([])
  const lastTransformResult = ref<{ text: string; markdown: string; reply: string } | null>(null)

  const hasActiveProviderKey = computed(() =>
    Boolean(settings.value.configured_providers?.[settings.value.provider]),
  )

  const CHAT_STORAGE_PREFIX = 'pomodolist_ai_chat_v1:'

  function newId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function activeWorkspaceId(): string {
    const workspaces = useWorkspacesStore()
    return workspaces.activeId || ''
  }

  function persistWorkspaceSession(wid: string) {
    if (!wid || typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return
    try {
      globalThis.localStorage.setItem(
        `${CHAT_STORAGE_PREFIX}${wid}`,
        JSON.stringify({
          conversationId: conversationId.value,
          messages: messages.value.slice(-40),
        }),
      )
    } catch {
      // Ignore storage quota errors
    }
  }

  function restoreWorkspaceSession(wid: string) {
    pendingActions.value = []
    error.value = ''
    if (!wid || typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      conversationId.value = newId('conv')
      messages.value = []
      return
    }
    try {
      const raw = globalThis.localStorage.getItem(`${CHAT_STORAGE_PREFIX}${wid}`)
      if (!raw) {
        conversationId.value = newId('conv')
        messages.value = []
        return
      }
      const parsed = JSON.parse(raw) as { conversationId?: string; messages?: AiChatMessage[] }
      conversationId.value = typeof parsed.conversationId === 'string' && parsed.conversationId ? parsed.conversationId : newId('conv')
      messages.value = Array.isArray(parsed.messages) ? parsed.messages.slice(-40) : []
    } catch {
      conversationId.value = newId('conv')
      messages.value = []
    }
  }

  function newConversation() {
    const wid = activeWorkspaceId()
    conversationId.value = newId('conv')
    messages.value = []
    pendingActions.value = []
    error.value = ''
    if (wid) persistWorkspaceSession(wid)
  }

  watch(
    () => activeWorkspaceId(),
    (nextWid, prevWid) => {
      if (prevWid && prevWid !== nextWid) {
        persistWorkspaceSession(prevWid)
      }
      if (nextWid && nextWid !== prevWid) {
        restoreWorkspaceSession(nextWid)
      }
    },
    { immediate: true },
  )

  watch(
    () => messages.value.length,
    () => {
      const wid = activeWorkspaceId()
      if (wid) persistWorkspaceSession(wid)
    },
  )

  async function open(tab: 'chat' | 'insights' | 'history' | 'settings' = 'chat') {
    activeTab.value = tab
    isOpen.value = true
    error.value = ''
    const wid = activeWorkspaceId()
    if (wid && !conversationId.value) {
      restoreWorkspaceSession(wid)
    }
    await Promise.allSettled([loadSettings(), refreshWorkspaceAnalysis(), loadHistory()])
  }

  function close() {
    isOpen.value = false
  }

  async function loadSettings() {
    try {
      settings.value = await fetchAiSettings()
    } catch {
      // Keep default settings if RPC isn't reachable yet
    }
  }

  async function updateSettings(payload: {
    provider: AiProviderId
    model: string
    write_mode: AiWriteMode
    api_key?: string | null
    clear_key?: boolean
  }) {
    busy.value = true
    error.value = ''
    try {
      settings.value = await saveAiSettings(payload)
      const ui = useUIStore()
      ui.addToast('AI ayarları kaydedildi.', 'success')
      return settings.value
    } catch (err: any) {
      error.value = String(err?.message || 'AI ayarları kaydedilemedi.')
      throw err
    } finally {
      busy.value = false
    }
  }

  async function refreshWorkspaceAnalysis() {
    const wid = activeWorkspaceId()
    if (!wid) return null
    try {
      const data = await fetchAiWorkspaceDigest(wid)
      digest.value = data
      const synthesis = synthesizeWorkspaceAnalysis(data, '')
      insights.value = synthesis.insights
      recommendations.value = synthesis.recommendations
      return data
    } catch (err: any) {
      error.value = String(err?.message || 'Çalışma alanı analizi alınamadı.')
      return null
    }
  }

  async function refreshAffectedModuleStores(modules: string[]) {
    const targets = new Set(modules.map(m => String(m || '').toLowerCase()).filter(Boolean))
    const tasks: Array<Promise<unknown>> = []

    if (targets.has('plans') || targets.has('quick') || targets.has('quick_notes')) {
      tasks.push(import('@/features/plans/stores/plans').then(m => m.usePlansStore().load()))
    }
    if (targets.has('tasks') || targets.has('calendar')) {
      tasks.push(
        import('@/features/tasks/stores/tasks').then(async m => {
          const store = m.useTasksStore()
          await Promise.allSettled([store.load(), store.loadCalendar()])
        }),
      )
    }
    if (targets.has('todos') || targets.has('detailed')) {
      tasks.push(
        import('@/features/todos/stores/todo').then(async m => {
          const store = m.useTodoStore()
          await Promise.allSettled([store.fetchCategories(), store.fetchTodos()])
        }),
      )
    }
    if (targets.has('code')) {
      tasks.push(import('@/features/todos/stores/todo').then(m => m.useTodoStore().fetchCodeSnippets()))
    }
    if (targets.has('periodic')) {
      tasks.push(import('@/features/PeriodicTasks/stores/periodicTasks').then(m => m.usePeriodicTasksStore().loadTasks()))
    }
    if (targets.has('learning')) {
      tasks.push(
        import('@/features/learning/stores/learning').then(async m => {
          const store = m.useLearningStore()
          await Promise.allSettled([store.fetchSubjects(), store.fetchMistakes()])
        }),
      )
    }
    if (targets.has('flashcards')) {
      tasks.push(import('@/features/flashcards/stores/flashcards').then(m => m.useFlashcardStore().fetchDecks()))
    }
    if (targets.has('workout')) {
      tasks.push(import('@/features/workout/stores/workout').then(m => m.useWorkoutStore().fetchRoutines()))
    }
    if (targets.has('activities')) {
      tasks.push(import('@/features/activity_lists/stores/activityLists').then(m => m.useActivityListsStore().loadItems()))
    }
    if (targets.has('finance')) {
      tasks.push(import('@/features/finance/stores/finance').then(m => m.useFinanceStore().load()))
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks)
    }
  }

  async function loadHistory() {
    const wid = activeWorkspaceId()
    if (!wid) return []
    try {
      const rows = await fetchAiActionHistory(wid, 25)
      actionHistory.value = rows
      return rows
    } catch {
      return []
    }
  }

  async function sendPrompt(
    promptText: string,
    mode: 'chat' | 'analyze' | 'recommend' | 'write' = 'chat',
    scope?: AiPromptScope | null,
  ) {
    const cleanPrompt = String(promptText || '').trim()
    if (!cleanPrompt && mode === 'chat') return null
    const wid = activeWorkspaceId()
    if (!wid) {
      error.value = 'Aktif çalışma alanı bulunamadı.'
      return null
    }

    busy.value = true
    error.value = ''

    const conversationHistory: AiConversationTurn[] = messages.value.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
      ...(m.scopeLabels?.length ? { scopeLabels: m.scopeLabels } : {}),
      ...(m.clarification?.question ? { clarificationQuestion: m.clarification.question } : {}),
      ...(m.clarification?.options?.length
        ? {
            clarificationOptions: m.clarification.options.map(o => ({
              id: o.id,
              label: o.label,
              module: o.action.module,
            })),
          }
        : {}),
    }))

    if (cleanPrompt) {
      messages.value.push({
        id: `user-${Date.now()}`,
        role: 'user',
        content: cleanPrompt,
        createdAt: new Date().toISOString(),
        scopeLabels: scope?.labels?.length ? [...scope.labels] : undefined,
      })
    }

    try {
      const response = await invokeAiAssistant({
        workspace_id: wid,
        mode,
        prompt: cleanPrompt,
        scope: scope || undefined,
        history: conversationHistory,
        provider: settings.value.provider,
        model: settings.value.model,
        write_mode: settings.value.write_mode,
      })

      if (response.digest) {
        digest.value = response.digest
      }
      if (response.insights?.length) {
        insights.value = response.insights
      }
      if (response.recommendations?.length) {
        recommendations.value = response.recommendations
      }
      if (response.proposed_actions?.length) {
        pendingActions.value = [...response.proposed_actions]
      }
      if (response.applied_run?.run_id) {
        const touchedModules = (response.applied_run.applied_changes || []).map((c: any) => String(c?.module || ''))
        await Promise.allSettled([loadHistory(), refreshAffectedModuleStores(touchedModules)])
        window.dispatchEvent(
          new CustomEvent('workspace-ai-mutated', {
            detail: { runId: response.applied_run.run_id, changes: response.applied_run.applied_changes },
          }),
        )
      }

      messages.value.push({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        createdAt: new Date().toISOString(),
        actions: response.proposed_actions || [],
        clarification: response.clarification || null,
        appliedRunId: response.applied_run?.run_id || null,
      })

      return response
    } catch (err: any) {
      const code = String(err?.message || 'AI_ERROR')
      if (code === 'AI_SECURE_MODULE_FORBIDDEN') {
        const refusalMessage =
          'Güvenli Notlar (Kasa) modülündeki veriler uçtan uca şifrelidir. Gizlilik ve güvenlik kuralları gereği yapay zeka bu alanda okuma, analiz veya veri girişi işlemi yapamaz.'
        error.value =
          'Güvenli Notlar (Kasa) modülü gizlilik kuralları gereği yapay zeka erişimine kapalıdır.'
        messages.value.push({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: refusalMessage,
          createdAt: new Date().toISOString(),
        })
      } else {
        const errorMap: Record<string, string> = {
          PROVIDER_AUTH: 'Sağlayıcı API anahtarı geçersiz veya yetkisiz (401/403). Lütfen AI Ayarlarından anahtarınızı kontrol edin.',
          PROVIDER_RATE_LIMIT: 'AI istek sınırı aşıldı (429). Lütfen kısa bir süre bekleyip tekrar deneyin.',
          RATE_LIMITED: 'Çok sık istek gönderildi (429). Lütfen biraz bekleyin.',
          PROVIDER_TIMEOUT: 'AI sağlayıcısı zaman aşımına uğradı. Lütfen tekrar deneyin.',
          PROVIDER_UNAVAILABLE: 'AI sağlayıcısına şu anda ulaşılamıyor.',
          PROVIDER_INVALID_JSON: 'AI sağlayıcısı beklenmeyen bir yanıt formatı döndürdü.',
          AUTH_REQUIRED: 'Oturum doğrulaması gerekli. Lütfen yeniden giriş yapın.',
        }
        error.value = errorMap[code] || code
      }
      return null
    } finally {
      busy.value = false
    }
  }

  async function approvePendingAction(action: ProposedAiAction, index?: number) {
    const wid = activeWorkspaceId()
    if (!wid) return null
    busy.value = true
    error.value = ''
    try {
      const result = await executeAiActions(wid, [action], {
        provider: settings.value.provider,
        model: settings.value.model,
        mode: 'ask_before_write',
        prompt_summary: action.summary || action.title || `${action.module}:${action.operation}`,
      })
      if (typeof index === 'number' && index >= 0 && index < pendingActions.value.length) {
        pendingActions.value.splice(index, 1)
      } else {
        pendingActions.value = pendingActions.value.filter(item => item !== action)
      }
      const touchedModules = [action.module, ...(result.applied_changes || []).map((c: any) => String(c?.module || ''))]
      await Promise.allSettled([loadHistory(), refreshWorkspaceAnalysis(), refreshAffectedModuleStores(touchedModules)])
      window.dispatchEvent(
        new CustomEvent('workspace-ai-mutated', {
          detail: { runId: result.run_id, changes: result.applied_changes },
        }),
      )
      const ui = useUIStore()
      ui.addToast('AI veri girişi uygulandı.', 'success')
      return result
    } catch (err: any) {
      error.value = String(err?.message || 'Aksiyon uygulanamadı.')
      throw err
    } finally {
      busy.value = false
    }
  }

  async function approveAllPendingActions() {
    const wid = activeWorkspaceId()
    if (!wid || !pendingActions.value.length) return null
    busy.value = true
    error.value = ''
    try {
      const actionsBatch = [...pendingActions.value]
      const result = await executeAiActions(wid, actionsBatch, {
        provider: settings.value.provider,
        model: settings.value.model,
        mode: 'ask_before_write',
        prompt_summary: `${actionsBatch.length} AI veri girişi onaylandı`,
      })
      pendingActions.value = []
      const touchedModules = [
        ...actionsBatch.map(a => a.module),
        ...(result.applied_changes || []).map((c: any) => String(c?.module || '')),
      ]
      await Promise.allSettled([loadHistory(), refreshWorkspaceAnalysis(), refreshAffectedModuleStores(touchedModules)])
      window.dispatchEvent(
        new CustomEvent('workspace-ai-mutated', {
          detail: { runId: result.run_id, changes: result.applied_changes },
        }),
      )
      const ui = useUIStore()
      ui.addToast(`${result.applied_count} AI işlemi uygulandı.`, 'success')
      return result
    } catch (err: any) {
      error.value = String(err?.message || 'Aksiyonlar uygulanamadı.')
      throw err
    } finally {
      busy.value = false
    }
  }

  function rejectPendingAction(index: number) {
    if (index >= 0 && index < pendingActions.value.length) {
      pendingActions.value.splice(index, 1)
    }
  }

  function clearPendingActions() {
    pendingActions.value = []
  }

  async function undoActionRun(runId: string) {
    const wid = activeWorkspaceId()
    if (!wid || !runId) return null
    busy.value = true
    error.value = ''
    try {
      const runEntry = actionHistory.value.find(h => h.id === runId)
      const touchedModules = Array.isArray(runEntry?.applied_changes)
        ? runEntry.applied_changes.map((c: any) => String(c?.module || ''))
        : ['plans', 'tasks', 'todos', 'periodic', 'learning', 'flashcards', 'workout', 'activities', 'finance', 'code']
      const result = await undoAiActionRun(wid, runId)
      await Promise.allSettled([loadHistory(), refreshWorkspaceAnalysis(), refreshAffectedModuleStores(touchedModules)])
      window.dispatchEvent(
        new CustomEvent('workspace-ai-mutated', {
          detail: { runId, undone: true },
        }),
      )
      const ui = useUIStore()
      ui.addToast('AI işlemi geri alındı.', 'info')
      return result
    } catch (err: any) {
      error.value = String(err?.message || 'Geri alma işlemi başarısız oldu.')
      throw err
    } finally {
      busy.value = false
    }
  }

  async function transformNote(payload: {
    text: string
    instruction: AiTransformInstruction
    targetFormat?: 'html' | 'markdown' | 'plain'
    writeMode?: AiNoteWriteMode
    sectionHeading?: string
    module?: string
    targetId?: string
  }) {
    const wid = activeWorkspaceId()
    busy.value = true
    error.value = ''
    try {
      const response = await invokeAiAssistant({
        workspace_id: wid || 'local',
        mode: 'transform_note',
        provider: settings.value.provider,
        model: settings.value.model,
        write_mode: settings.value.write_mode,
        note_context: {
          module: payload.module,
          target_id: payload.targetId,
          text: payload.text,
          instruction: payload.instruction,
          target_format: payload.targetFormat || 'html',
          write_mode: payload.writeMode || 'replace',
          section_heading: payload.sectionHeading,
        },
      })
      const result = {
        text: response.transformed_text || payload.text,
        markdown: response.transformed_markdown || '',
        reply: response.reply || '',
      }
      lastTransformResult.value = result
      return result
    } catch (err: any) {
      error.value = String(err?.message || 'Not dönüştürülemedi.')
      throw err
    } finally {
      busy.value = false
    }
  }

  async function selectClarificationOption(messageId: string, optionId: string) {
    const msg = messages.value.find(m => m.id === messageId)
    const clarification = msg?.clarification
    const opt = clarification?.options.find(o => o.id === optionId)
    if (!msg || !clarification || !opt || clarification.resolvedOptionId) return

    clarification.resolvedOptionId = optionId
    messages.value.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: `Seçim: ${opt.label}`,
      createdAt: new Date().toISOString(),
    })

    const wid = activeWorkspaceId()
    if (settings.value.write_mode === 'auto_apply' && wid) {
      busy.value = true
      try {
        const appliedRun = await executeAiActions(wid, [opt.action], {
          provider: settings.value.provider,
          model: settings.value.model,
          mode: settings.value.write_mode,
          prompt: opt.action.summary || opt.label,
          prompt_summary: opt.action.summary || opt.label,
        })
        if (appliedRun?.run_id) {
          const touchedModules = (appliedRun.applied_changes || []).map((c: any) => String(c?.module || ''))
          await Promise.allSettled([loadHistory(), refreshAffectedModuleStores(touchedModules)])
          window.dispatchEvent(
            new CustomEvent('workspace-ai-mutated', {
              detail: { runId: appliedRun.run_id, changes: appliedRun.applied_changes },
            }),
          )
        }
        messages.value.push({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `**${opt.label}** seçiminiz uygulandı.`,
          createdAt: new Date().toISOString(),
          appliedRunId: appliedRun?.run_id || null,
        })
      } catch (err: any) {
        error.value = String(err?.message || 'Seçim uygulanamadı.')
      } finally {
        busy.value = false
      }
      return
    }

    pendingActions.value = [opt.action]
    messages.value.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: `Anlaşıldı, **${opt.label}** için işlem hazırlandı. Aşağıdan onaylayarak uygulayabilirsiniz.`,
      createdAt: new Date().toISOString(),
      actions: [opt.action],
    })
  }

  return {
    isOpen,
    activeTab,
    busy,
    error,
    settings,
    digest,
    insights,
    recommendations,
    messages,
    conversationId,
    pendingActions,
    actionHistory,
    lastTransformResult,
    hasActiveProviderKey,
    open,
    close,
    newConversation,
    loadSettings,
    updateSettings,
    refreshWorkspaceAnalysis,
    loadHistory,
    sendPrompt,
    selectClarificationOption,
    approvePendingAction,
    approveAllPendingActions,
    rejectPendingAction,
    clearPendingActions,
    undoActionRun,
    transformNote,
  }
})
