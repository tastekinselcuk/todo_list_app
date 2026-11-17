import { extractJsonObject, getProviderAdapter } from './adapters.ts'
import { executeToolCall, TOOL_DECLARATIONS, type ToolExecutionContext } from './tools.ts'
import type {
  AiAdapterMessage,
  AiProviderId,
  AiToolTraceItem,
  ProposedAiAction,
} from './types.ts'

export interface AgentLoopInput {
  fetchFn: typeof fetch
  provider: AiProviderId
  model: string
  apiKey: string
  systemPrompt: string
  initialMessages: AiAdapterMessage[]
  toolCtx: ToolExecutionContext
  enableTools: boolean
  maxSteps?: number
  totalBudgetMs?: number
}

export interface AgentLoopOutput {
  rawText: string
  parsed: Record<string, unknown> | null
  stagedProposals: ProposedAiAction[]
  toolTrace: AiToolTraceItem[]
  usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentLoopOutput> {
  const adapter = getProviderAdapter(input.provider)
  const maxSteps = input.maxSteps ?? 5
  const totalBudgetMs = input.totalBudgetMs ?? 24_000
  const startedAt = Date.now()
  const messages: AiAdapterMessage[] = [...input.initialMessages]
  const toolTrace: AiToolTraceItem[] = []
  const seenSignatures = new Set<string>()
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }

  for (let step = 1; step <= maxSteps; step += 1) {
    const elapsed = Date.now() - startedAt
    const remainingMs = Math.max(4_000, totalBudgetMs - elapsed)
    const isLastStep = step === maxSteps

    const result = await adapter.generate(input.fetchFn, {
      model: input.model,
      apiKey: input.apiKey,
      systemPrompt: input.systemPrompt,
      messages,
      tools: input.enableTools && !isLastStep ? TOOL_DECLARATIONS : undefined,
      temperature: 0.45,
      timeoutMs: Math.min(20_000, remainingMs),
      forceJsonResponse: !input.enableTools || isLastStep,
    })

    if (result.usage) {
      usage.input_tokens += Number(result.usage.input_tokens || 0)
      usage.output_tokens += Number(result.usage.output_tokens || 0)
      usage.total_tokens += Number(result.usage.total_tokens || 0)
    }

    if (!result.toolCalls.length || !input.enableTools || isLastStep) {
      return {
        rawText: result.rawText,
        parsed: result.parsed || (result.rawText ? extractJsonObject(result.rawText) : null),
        stagedProposals: input.toolCtx.stagedProposals,
        toolTrace,
        usage,
      }
    }

    messages.push({
      role: 'assistant',
      content: result.rawText || undefined,
      toolCalls: result.toolCalls,
    })

    const toolResults = []
    for (const call of result.toolCalls.slice(0, 4)) {
      const sig = `${call.name}:${JSON.stringify(call.args || {})}`
      const t0 = Date.now()
      if (seenSignatures.has(sig)) {
        toolResults.push({
          call_id: call.id,
          name: call.name,
          ok: false,
          error: 'DUPLICATE_TOOL_CALL_SKIPPED',
        })
        toolTrace.push({ step, tool: call.name, ok: false, duration_ms: Date.now() - t0 })
        continue
      }
      seenSignatures.add(sig)
      const res = await executeToolCall(call, input.toolCtx)
      toolResults.push(res)
      toolTrace.push({ step, tool: call.name, ok: res.ok, duration_ms: Date.now() - t0 })
    }

    messages.push({ role: 'tool', toolResults })
  }

  return {
    rawText: '',
    parsed: null,
    stagedProposals: input.toolCtx.stagedProposals,
    toolTrace,
    usage,
  }
}
