import {
  AI_CAPABILITY_REGISTRY,
  applyActionRiskPolicy,
  normalizeModuleId,
} from './registry.ts'
import type {
  AiAssistantDependencies,
  AiPromptScope,
  AiTimeContext,
  AiToolCall,
  AiToolDeclaration,
  AiToolResult,
  AiWriteMode,
  ProposedAiAction,
} from './types.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_METRICS = new Set([
  'finance_monthly_comparison',
  'focus_summary',
  'task_load',
  'learning_summary',
])

export const TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: 'get_current_datetime',
    description: 'Returns authoritative current UTC and local date/time, weekday, and tomorrow date in the user timezone.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_workspace_capabilities',
    description: 'Returns available Pomodolist modules, supported operations, and restrictions (never includes secure vault).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_workspace_digest',
    description: 'Returns a compact summary of counts and recent signals across authorized workspace modules.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_workspace_records',
    description: 'Searches authorized workspace records by keyword/phrase with optional module filter and pagination.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text (1-120 chars)' },
        module: { type: 'string', description: 'Optional module filter (plans, tasks, detailed, quick, code, learning, flashcards, workout, periodic, activities, finance)' },
        page_size: { type: 'integer', description: 'Results per module (1-15)' },
        page_offset: { type: 'integer', description: 'Pagination offset (>= 0)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_workspace_records',
    description: 'Reads full authorized details and current version numbers for up to 10 specific record IDs.',
    parameters: {
      type: 'object',
      properties: {
        targets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              module: { type: 'string' },
              id: { type: 'string' },
            },
            required: ['module', 'id'],
          },
        },
      },
      required: ['targets'],
    },
  },
  {
    name: 'query_workspace_metrics',
    description: 'Runs deterministic SQL aggregations for finance comparisons, focus/pomodoro sessions, task load, or learning stats.',
    parameters: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['finance_monthly_comparison', 'focus_summary', 'task_load', 'learning_summary'],
        },
        days: { type: 'integer', description: 'Optional lookback window in days (1-365)' },
      },
      required: ['metric'],
    },
  },
  {
    name: 'propose_workspace_actions',
    description: 'Stages typed create/update/complete/delete action proposals for user review. Does NOT write to database.',
    parameters: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              module: { type: 'string' },
              operation: { type: 'string' },
              target_id: { type: 'string' },
              expected_version: { type: 'integer' },
              write_mode: { type: 'string', enum: ['replace', 'append', 'prepend', 'insert_section'] },
              summary: { type: 'string' },
              payload: { type: 'object' },
            },
            required: ['module', 'operation', 'payload'],
          },
        },
      },
      required: ['actions'],
    },
  },
]

export interface ToolExecutionContext {
  deps: AiAssistantDependencies
  token: string
  workspaceId: string
  timeCtx: AiTimeContext
  writeMode: AiWriteMode
  scope?: AiPromptScope | null
  digestCache?: Record<string, unknown> | null
  stagedProposals: ProposedAiAction[]
}

export async function executeToolCall(
  call: AiToolCall,
  ctx: ToolExecutionContext,
): Promise<AiToolResult> {
  const args = call.args || {}

  try {
    if (call.name === 'get_current_datetime') {
      return { call_id: call.id, name: call.name, ok: true, data: ctx.timeCtx }
    }

    if (call.name === 'get_workspace_capabilities') {
      return {
        call_id: call.id,
        name: call.name,
        ok: true,
        data: {
          modules: AI_CAPABILITY_REGISTRY.map(c => ({
            id: c.id,
            label: c.labelTr,
            description: c.description,
            operations: c.operations,
          })),
          excluded: ['secure'],
        },
      }
    }

    if (call.name === 'get_workspace_digest') {
      if (!ctx.digestCache) {
        ctx.digestCache = await ctx.deps.loadWorkspaceDigest(ctx.token, ctx.workspaceId)
      }
      return { call_id: call.id, name: call.name, ok: true, data: ctx.digestCache }
    }

    if (call.name === 'search_workspace_records') {
      const query = String(args.query || '').trim().slice(0, 120)
      if (!query) {
        return { call_id: call.id, name: call.name, ok: false, error: 'INVALID_QUERY' }
      }
      const rawMod = typeof args.module === 'string' && args.module.trim() ? args.module.trim() : null
      let normalizedMod: string | null = null
      if (rawMod) {
        const norm = normalizeModuleId(rawMod)
        if (norm === 'secure') {
          throw new Error('AI_SECURE_MODULE_FORBIDDEN')
        }
        normalizedMod = norm
      }
      if (ctx.scope?.module === 'secure') {
        throw new Error('AI_SECURE_MODULE_FORBIDDEN')
      }
      if (!ctx.deps.searchWorkspace) {
        return { call_id: call.id, name: call.name, ok: false, error: 'SEARCH_UNAVAILABLE' }
      }
      const pageSize = Math.min(15, Math.max(1, Number(args.page_size || 8)))
      const pageOffset = Math.max(0, Number(args.page_offset || 0))
      const res = await ctx.deps.searchWorkspace(ctx.token, ctx.workspaceId, query, normalizedMod, pageSize, pageOffset)
      return { call_id: call.id, name: call.name, ok: true, data: res }
    }

    if (call.name === 'read_workspace_records') {
      const rawTargets = Array.isArray(args.targets) ? args.targets.slice(0, 10) : []
      const targets: Array<{ module: string; id: string }> = []
      for (const item of rawTargets) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        const norm = normalizeModuleId(String(rec.module || ''))
        if (norm === 'secure') throw new Error('AI_SECURE_MODULE_FORBIDDEN')
        const id = String(rec.id || '').trim()
        if (norm && UUID_RE.test(id)) {
          targets.push({ module: norm, id })
        }
      }
      if (!targets.length) {
        return { call_id: call.id, name: call.name, ok: false, error: 'INVALID_TARGETS' }
      }
      if (!ctx.deps.readRecords) {
        return { call_id: call.id, name: call.name, ok: false, error: 'READ_UNAVAILABLE' }
      }
      const res = await ctx.deps.readRecords(ctx.token, ctx.workspaceId, targets)
      return { call_id: call.id, name: call.name, ok: true, data: res }
    }

    if (call.name === 'query_workspace_metrics') {
      const metric = String(args.metric || '').trim()
      if (!ALLOWED_METRICS.has(metric)) {
        return { call_id: call.id, name: call.name, ok: false, error: 'UNSUPPORTED_METRIC' }
      }
      const days = args.days ? Math.min(365, Math.max(1, Number(args.days))) : 21
      if (ctx.deps.queryMetrics) {
        const res = await ctx.deps.queryMetrics(ctx.token, ctx.workspaceId, metric, { days })
        return { call_id: call.id, name: call.name, ok: true, data: res }
      }
      // Safe deterministic fallback using digest signals if dedicated SQL RPC isn't injected in tests
      if (!ctx.digestCache) {
        ctx.digestCache = await ctx.deps.loadWorkspaceDigest(ctx.token, ctx.workspaceId)
      }
      return {
        call_id: call.id,
        name: call.name,
        ok: true,
        data: {
          metric,
          days,
          source: 'digest_signals',
          signals: (ctx.digestCache as Record<string, unknown>)?.recommendations_signals || {},
        },
      }
    }

    if (call.name === 'propose_workspace_actions') {
      const rawActions = Array.isArray(args.actions) ? args.actions.slice(0, 10) : []
      const staged: ProposedAiAction[] = []
      for (const item of rawActions) {
        if (!item || typeof item !== 'object') continue
        const candidate = item as Record<string, unknown>
        const norm = normalizeModuleId(String(candidate.module || ''))
        if (norm === 'secure') throw new Error('AI_SECURE_MODULE_FORBIDDEN')
        if (!norm) continue
        const target_id =
          typeof candidate.target_id === 'string' && UUID_RE.test(candidate.target_id)
            ? candidate.target_id
            : undefined
        staged.push({
          module: norm,
          operation: String(candidate.operation || 'create').trim(),
          ...(target_id ? { target_id } : {}),
          ...(typeof candidate.expected_version === 'number' ? { expected_version: candidate.expected_version } : {}),
          write_mode: (['replace', 'append', 'prepend', 'insert_section'].includes(String(candidate.write_mode))
            ? String(candidate.write_mode)
            : 'append') as ProposedAiAction['write_mode'],
          ...(typeof candidate.summary === 'string' ? { summary: candidate.summary.slice(0, 240) } : {}),
          payload:
            candidate.payload && typeof candidate.payload === 'object' && !Array.isArray(candidate.payload)
              ? (candidate.payload as Record<string, unknown>)
              : {},
        })
      }
      const withRisk = applyActionRiskPolicy(staged, ctx.writeMode)
      ctx.stagedProposals.push(...withRisk)
      return {
        call_id: call.id,
        name: call.name,
        ok: true,
        data: { staged_count: withRisk.length, actions: withRisk },
      }
    }

    return { call_id: call.id, name: call.name, ok: false, error: `UNKNOWN_TOOL_${call.name}` }
  } catch (err) {
    if (String((err as any)?.message || err).includes('AI_SECURE_MODULE_FORBIDDEN')) {
      throw err
    }
    return {
      call_id: call.id,
      name: call.name,
      ok: false,
      error: err instanceof Error ? err.message : 'TOOL_EXECUTION_ERROR',
    }
  }
}
