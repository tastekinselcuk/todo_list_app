export type AiProviderId = 'gemini' | 'openai' | 'anthropic'
export type AiWriteMode = 'ask_before_write' | 'auto_apply'
export type AiNoteWriteMode = 'replace' | 'append' | 'prepend' | 'insert_section'
export type AiRequestMode = 'chat' | 'analyze' | 'recommend' | 'transform_note' | 'plan_actions' | 'write'
export type AiRiskLevel = 'low' | 'medium' | 'high'

export interface ProposedAiAction {
  module:
    | 'detailed'
    | 'plans'
    | 'quick'
    | 'tasks'
    | 'calendar'
    | 'periodic'
    | 'code'
    | 'learning'
    | 'flashcards'
    | 'workout'
    | 'activities'
    | 'finance'
  entity?: string
  operation: string
  target_id?: string
  write_mode?: AiNoteWriteMode
  section_heading?: string
  expected_version?: number
  summary?: string
  risk_level?: AiRiskLevel
  requires_confirmation?: boolean
  payload: Record<string, unknown>
}

export interface AiInsightItem {
  title: string
  summary: string
  severity: 'info' | 'warning' | 'positive'
  module?: string
}

export interface AiRecommendationItem {
  id: string
  title: string
  reason: string
  module: string
  action?: ProposedAiAction
}

export interface AiClarificationOption {
  id: string
  label: string
  description?: string
  action: ProposedAiAction
}

export interface AiClarificationPrompt {
  question: string
  options: AiClarificationOption[]
}

export interface AiConversationTurn {
  role: 'user' | 'assistant'
  content: string
  scopeLabels?: string[]
  clarificationQuestion?: string
  clarificationOptions?: Array<{ id: string; label: string; module: string }>
}

export interface AiPromptScope {
  path: string[]
  labels: string[]
  module?: string
  view?: string
}

export interface AiTimeContext {
  now_utc: string
  timezone: string
  timezone_valid: boolean
  local_date: string
  local_time: string
  tomorrow_date: string
  weekday_tr: string
  weekday_en: string
}

export interface AiModelCapability {
  id: string
  provider: AiProviderId
  label: string
  supportsTools: boolean
  supportsJsonMode: boolean
  supportsTemperature: boolean
  deprecated?: boolean
}

export interface AiToolDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface AiToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  thoughtSignature?: string
}

export interface AiToolResult {
  call_id: string
  name: string
  ok: boolean
  data?: unknown
  error?: string
}

export interface AiToolTraceItem {
  step: number
  tool: string
  ok: boolean
  duration_ms: number
}

export interface AiAdapterMessage {
  role: 'user' | 'assistant' | 'tool'
  content?: string
  toolCalls?: AiToolCall[]
  toolResults?: AiToolResult[]
}

export interface AiAdapterResult {
  rawText: string
  parsed: Record<string, unknown> | null
  toolCalls: AiToolCall[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

export class AiProviderError extends Error {
  code:
    | 'PROVIDER_AUTH'
    | 'PROVIDER_RATE_LIMIT'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_INVALID_JSON'
    | 'PROVIDER_TIMEOUT'
  provider: AiProviderId
  status?: number

  constructor(
    code: AiProviderError['code'],
    provider: AiProviderId,
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'AiProviderError'
    this.code = code
    this.provider = provider
    this.status = status
  }
}

export interface AiRuntimeCredentials {
  provider: AiProviderId
  model: string
  write_mode: AiWriteMode
  api_key: string | null
  api_keys?: Partial<Record<AiProviderId, string>>
}

export interface AiAssistantDependencies {
  authenticate(token: string): Promise<string | null>
  consumeBudget(userId: string): Promise<boolean>
  resolveCredentials(userId: string): Promise<AiRuntimeCredentials>
  loadWorkspaceDigest(token: string, workspaceId: string): Promise<Record<string, unknown>>
  searchWorkspace?(
    token: string,
    workspaceId: string,
    query: string,
    onlyModule?: string | null,
    pageSize?: number,
    pageOffset?: number,
  ): Promise<Record<string, unknown>>
  readRecords?(
    token: string,
    workspaceId: string,
    targets: Array<{ module: string; id: string }>,
  ): Promise<Record<string, unknown>>
  queryMetrics?(
    token: string,
    workspaceId: string,
    metric: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>
  executeActions?(
    token: string,
    workspaceId: string,
    actions: ProposedAiAction[],
    meta: Record<string, unknown>,
  ): Promise<Record<string, unknown>>
  fetch: typeof fetch
  now?: () => Date
  defaultKeys?: Partial<Record<AiProviderId, string>>
}
