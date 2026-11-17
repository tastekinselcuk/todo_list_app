import {
  AiProviderError,
  type AiAdapterMessage,
  type AiAdapterResult,
  type AiModelCapability,
  type AiProviderId,
  type AiToolCall,
  type AiToolDeclaration,
} from './types.ts'

export const AI_MODEL_CATALOG: AiModelCapability[] = [
  { id: 'gemini-2.5-flash', provider: 'gemini', label: 'Gemini 2.5 Flash', supportsTools: true, supportsJsonMode: true, supportsTemperature: true },
  { id: 'gemini-2.5-pro', provider: 'gemini', label: 'Gemini 2.5 Pro', supportsTools: true, supportsJsonMode: true, supportsTemperature: true },
  { id: 'gemini-2.0-flash', provider: 'gemini', label: 'Gemini 2.0 Flash', supportsTools: true, supportsJsonMode: true, supportsTemperature: true },
  { id: 'gpt-4.1-mini', provider: 'openai', label: 'GPT-4.1 Mini', supportsTools: true, supportsJsonMode: true, supportsTemperature: true },
  { id: 'gpt-4.1', provider: 'openai', label: 'GPT-4.1', supportsTools: true, supportsJsonMode: true, supportsTemperature: true },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o Mini', supportsTools: true, supportsJsonMode: true, supportsTemperature: true },
  { id: 'claude-3-5-haiku-latest', provider: 'anthropic', label: 'Claude 3.5 Haiku', supportsTools: true, supportsJsonMode: false, supportsTemperature: true },
  { id: 'claude-3-7-sonnet-latest', provider: 'anthropic', label: 'Claude 3.7 Sonnet', supportsTools: true, supportsJsonMode: false, supportsTemperature: true },
  { id: 'claude-3-5-sonnet-latest', provider: 'anthropic', label: 'Claude 3.5 Sonnet', supportsTools: true, supportsJsonMode: false, supportsTemperature: true },
]

export function getModelCapability(provider: AiProviderId, model: string): AiModelCapability {
  const found = AI_MODEL_CATALOG.find(m => m.provider === provider && m.id === model)
  if (found) return found
  const isReasoningOnly = /^(o1|o3|o4|gpt-5)/i.test(model)
  return {
    id: model,
    provider,
    label: model,
    supportsTools: true,
    supportsJsonMode: provider !== 'anthropic',
    supportsTemperature: !isReasoningOnly,
  }
}

export function extractJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = String(rawText || '').trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
}

function mapHttpError(provider: AiProviderId, status: number): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError('PROVIDER_AUTH', provider, `${provider.toUpperCase()} authentication failed (${status})`, status)
  }
  if (status === 429) {
    return new AiProviderError('PROVIDER_RATE_LIMIT', provider, `${provider.toUpperCase()} rate limit exceeded`, status)
  }
  return new AiProviderError('PROVIDER_UNAVAILABLE', provider, `${provider.toUpperCase()} HTTP ${status}`, status)
}

function wrapFetchError(provider: AiProviderId, err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err
  const name = err instanceof Error ? err.name : ''
  const msg = err instanceof Error ? err.message : String(err)
  if (name === 'AbortError' || name === 'TimeoutError' || /timeout|aborted/i.test(msg)) {
    return new AiProviderError('PROVIDER_TIMEOUT', provider, `${provider.toUpperCase()} request timed out`)
  }
  return new AiProviderError('PROVIDER_UNAVAILABLE', provider, msg)
}

export interface AdapterCallInput {
  model: string
  apiKey: string
  systemPrompt: string
  messages: AiAdapterMessage[]
  tools?: AiToolDeclaration[]
  temperature?: number
  timeoutMs?: number
  forceJsonResponse?: boolean
}

export interface AiProviderAdapter {
  readonly id: AiProviderId
  generate(fetchFn: typeof fetch, input: AdapterCallInput): Promise<AiAdapterResult>
}

const geminiAdapter: AiProviderAdapter = {
  id: 'gemini',
  async generate(fetchFn, input) {
    const cap = getModelCapability('gemini', input.model)
    const signal = AbortSignal.timeout(input.timeoutMs ?? 25_000)

    const contents: Array<Record<string, unknown>> = []
    for (const msg of input.messages) {
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content || '' }] })
      } else if (msg.role === 'assistant') {
        const parts: Array<Record<string, unknown>> = []
        if (msg.content) parts.push({ text: msg.content })
        for (const tc of msg.toolCalls || []) {
          parts.push({
            functionCall: { name: tc.name, args: tc.args },
            ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
          })
        }
        if (parts.length) contents.push({ role: 'model', parts })
      } else if (msg.role === 'tool' && msg.toolResults?.length) {
        contents.push({
          role: 'user',
          parts: msg.toolResults.map(r => ({
            functionResponse: {
              name: r.name,
              response: r.ok ? { result: r.data ?? null } : { error: r.error || 'TOOL_ERROR' },
            },
          })),
        })
      }
    }

    const generationConfig: Record<string, unknown> = {}
    if (cap.supportsTemperature && typeof input.temperature === 'number') {
      generationConfig.temperature = input.temperature
    }
    if (input.forceJsonResponse && cap.supportsJsonMode && !input.tools?.length) {
      generationConfig.responseMimeType = 'application/json'
    }

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents,
      generationConfig,
    }
    if (input.tools?.length && cap.supportsTools) {
      body.tools = [
        {
          functionDeclarations: input.tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ]
    }

    try {
      const res = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
        {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': input.apiKey,
          },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) throw mapHttpError('gemini', res.status)
      const data = await res.json()
      const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : []
      const toolCalls: AiToolCall[] = []
      const textSegments: string[] = []
      let idx = 0
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue
        if (part.thought) continue
        if (part.functionCall && typeof part.functionCall.name === 'string') {
          idx += 1
          toolCalls.push({
            id: `gem-call-${idx}`,
            name: part.functionCall.name,
            args:
              part.functionCall.args && typeof part.functionCall.args === 'object'
                ? (part.functionCall.args as Record<string, unknown>)
                : {},
            ...(typeof part.thoughtSignature === 'string' ? { thoughtSignature: part.thoughtSignature } : {}),
          })
        } else if (typeof part.text === 'string') {
          textSegments.push(part.text)
        }
      }
      const rawText = textSegments.join('') || ''
      const parsed = rawText ? extractJsonObject(rawText) : null
      if (!toolCalls.length && input.forceJsonResponse && !parsed && rawText) {
        throw new AiProviderError('PROVIDER_INVALID_JSON', 'gemini', 'Gemini returned invalid JSON')
      }
      return {
        rawText,
        parsed,
        toolCalls,
        usage: data?.usageMetadata
          ? {
              input_tokens: data.usageMetadata.promptTokenCount,
              output_tokens: data.usageMetadata.candidatesTokenCount,
              total_tokens: data.usageMetadata.totalTokenCount,
            }
          : undefined,
      }
    } catch (err) {
      throw wrapFetchError('gemini', err)
    }
  },
}

const openaiAdapter: AiProviderAdapter = {
  id: 'openai',
  async generate(fetchFn, input) {
    const cap = getModelCapability('openai', input.model)
    const signal = AbortSignal.timeout(input.timeoutMs ?? 25_000)

    const messages: Array<Record<string, unknown>> = [{ role: 'system', content: input.systemPrompt }]
    for (const msg of input.messages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content || '' })
      } else if (msg.role === 'assistant') {
        const entry: Record<string, unknown> = {
          role: 'assistant',
          content: msg.content || null,
        }
        if (msg.toolCalls?.length) {
          entry.tool_calls = msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          }))
        }
        messages.push(entry)
      } else if (msg.role === 'tool' && msg.toolResults?.length) {
        for (const r of msg.toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: r.call_id,
            content: JSON.stringify(r.ok ? r.data ?? null : { error: r.error || 'TOOL_ERROR' }),
          })
        }
      }
    }

    const body: Record<string, unknown> = {
      model: input.model,
      messages,
    }
    if (cap.supportsTemperature && typeof input.temperature === 'number') {
      body.temperature = input.temperature
    }
    if (input.forceJsonResponse && cap.supportsJsonMode && !input.tools?.length) {
      body.response_format = { type: 'json_object' }
    }
    if (input.tools?.length && cap.supportsTools) {
      body.tools = input.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    try {
      const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw mapHttpError('openai', res.status)
      const data = await res.json()
      const choice = data?.choices?.[0]?.message || {}
      const rawText = typeof choice.content === 'string' ? choice.content : ''
      const rawCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : []
      const toolCalls: AiToolCall[] = rawCalls
        .filter((c: any) => c?.function?.name)
        .map((c: any, i: number) => {
          let args: Record<string, unknown> = {}
          try {
            const parsedArgs = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments) : c.function.arguments
            if (parsedArgs && typeof parsedArgs === 'object') args = parsedArgs
          } catch {
            args = {}
          }
          return {
            id: String(c.id || `oai-call-${i + 1}`),
            name: String(c.function.name),
            args,
          }
        })

      const parsed = rawText ? extractJsonObject(rawText) : null
      if (!toolCalls.length && input.forceJsonResponse && !parsed && rawText) {
        throw new AiProviderError('PROVIDER_INVALID_JSON', 'openai', 'OpenAI returned invalid JSON')
      }
      return {
        rawText,
        parsed,
        toolCalls,
        usage: data?.usage
          ? {
              input_tokens: data.usage.prompt_tokens,
              output_tokens: data.usage.completion_tokens,
              total_tokens: data.usage.total_tokens,
            }
          : undefined,
      }
    } catch (err) {
      throw wrapFetchError('openai', err)
    }
  },
}

const anthropicAdapter: AiProviderAdapter = {
  id: 'anthropic',
  async generate(fetchFn, input) {
    const cap = getModelCapability('anthropic', input.model)
    const signal = AbortSignal.timeout(input.timeoutMs ?? 25_000)

    const messages: Array<Record<string, unknown>> = []
    for (const msg of input.messages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content || '' })
      } else if (msg.role === 'assistant') {
        const blocks: Array<Record<string, unknown>> = []
        if (msg.content) blocks.push({ type: 'text', text: msg.content })
        for (const tc of msg.toolCalls || []) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args || {} })
        }
        if (blocks.length) messages.push({ role: 'assistant', content: blocks })
      } else if (msg.role === 'tool' && msg.toolResults?.length) {
        messages.push({
          role: 'user',
          content: msg.toolResults.map(r => ({
            type: 'tool_result',
            tool_use_id: r.call_id,
            content: JSON.stringify(r.ok ? r.data ?? null : { error: r.error || 'TOOL_ERROR' }),
            ...(r.ok ? {} : { is_error: true }),
          })),
        })
      }
    }

    const body: Record<string, unknown> = {
      model: input.model,
      max_tokens: 2048,
      system: input.systemPrompt,
      messages,
    }
    if (cap.supportsTemperature && typeof input.temperature === 'number') {
      body.temperature = input.temperature
    }
    if (input.tools?.length && cap.supportsTools) {
      body.tools = input.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }))
    }

    try {
      const res = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': input.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw mapHttpError('anthropic', res.status)
      const data = await res.json()
      const blocks = Array.isArray(data?.content) ? data.content : []
      const textParts: string[] = []
      const toolCalls: AiToolCall[] = []
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue
        if (b.type === 'text' && typeof b.text === 'string') {
          textParts.push(b.text)
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          toolCalls.push({
            id: String(b.id || `ant-call-${toolCalls.length + 1}`),
            name: b.name,
            args: b.input && typeof b.input === 'object' ? (b.input as Record<string, unknown>) : {},
          })
        }
      }
      const rawText = textParts.join('') || ''
      const parsed = rawText ? extractJsonObject(rawText) : null
      if (!toolCalls.length && input.forceJsonResponse && !parsed && rawText) {
        throw new AiProviderError('PROVIDER_INVALID_JSON', 'anthropic', 'Anthropic returned invalid JSON')
      }
      return {
        rawText,
        parsed,
        toolCalls,
        usage: data?.usage
          ? {
              input_tokens: data.usage.input_tokens,
              output_tokens: data.usage.output_tokens,
              total_tokens:
                typeof data.usage.input_tokens === 'number' && typeof data.usage.output_tokens === 'number'
                  ? data.usage.input_tokens + data.usage.output_tokens
                  : undefined,
            }
          : undefined,
      }
    } catch (err) {
      throw wrapFetchError('anthropic', err)
    }
  },
}

const ADAPTERS: Record<AiProviderId, AiProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
}

export function getProviderAdapter(provider: AiProviderId): AiProviderAdapter {
  return ADAPTERS[provider]
}
