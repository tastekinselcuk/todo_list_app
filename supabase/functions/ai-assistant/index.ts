import { aiAssistantHandler, type AiRuntimeCredentials } from './handler.ts'
import { verifiedUserHasRequiredAssurance } from '../_shared/authAssurance.ts'

function required(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing function configuration: ${name}`)
  return value
}

const base = required('SUPABASE_URL')
const anon = required('SUPABASE_ANON_KEY')
const service = required('SUPABASE_SERVICE_ROLE_KEY')

async function adminJSON(path: string, options: RequestInit = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) throw new Error('ADMIN_RPC_UNAVAILABLE')
  return response.status === 204 ? null : response.json()
}

async function userRPC(token: string, name: string, payload: Record<string, unknown>) {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, base), {
    method: 'POST',
    signal: AbortSignal.timeout(12_000),
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`USER_RPC_${name.toUpperCase()}_FAILED`)
  return response.json()
}

Deno.serve(
  aiAssistantHandler({
    async authenticate(token) {
      const response = await fetch(new URL('/auth/v1/user', base), {
        headers: { apikey: anon, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      })
      if (response.status === 401 || response.status === 403) return null
      if (!response.ok) throw new Error('AUTH_SERVICE_UNAVAILABLE')
      const user = await response.json()
      return typeof user?.id === 'string' && verifiedUserHasRequiredAssurance(token, user)
        ? user.id
        : null
    },
    async consumeBudget(uid) {
      return (
        (await adminJSON('/rest/v1/rpc/consume_edge_budget', {
          method: 'POST',
          body: JSON.stringify({ uid, operation: 'ai-assistant' }),
        })) === true
      )
    },
    async resolveCredentials(uid) {
      const data = await adminJSON('/rest/v1/rpc/ai_resolve_runtime_credentials', {
        method: 'POST',
        body: JSON.stringify({ uid }),
      })
      return (data || {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        write_mode: 'ask_before_write',
        api_key: null,
      }) as AiRuntimeCredentials
    },
    async loadWorkspaceDigest(token, workspaceId) {
      return (await userRPC(token, 'ai_workspace_digest', {
        wid: workspaceId,
        options: {},
      })) as Record<string, unknown>
    },
    async searchWorkspace(token, workspaceId, query, onlyModule = null, pageSize = 8, pageOffset = 0) {
      return (await userRPC(token, 'search_workspace', {
        wid: workspaceId,
        query_text: query,
        page_size: pageSize,
        page_offset: pageOffset,
        only_module: onlyModule,
      })) as Record<string, unknown>
    },
    async readRecords(token, workspaceId, targets) {
      return (await userRPC(token, 'ai_read_records', {
        wid: workspaceId,
        targets,
      })) as Record<string, unknown>
    },
    async queryMetrics(token, workspaceId, metric, params = {}) {
      return (await userRPC(token, 'ai_query_metrics', {
        wid: workspaceId,
        metric,
        params,
      })) as Record<string, unknown>
    },
    async executeActions(token, workspaceId, actions, meta) {
      return (await userRPC(token, 'ai_execute_actions', {
        wid: workspaceId,
        actions,
        meta,
      })) as Record<string, unknown>
    },
    fetch,
    defaultKeys: {
      gemini: Deno.env.get('GEMINI_API_KEY'),
      openai: Deno.env.get('OPENAI_API_KEY'),
      anthropic: Deno.env.get('ANTHROPIC_API_KEY'),
    },
  })
)
