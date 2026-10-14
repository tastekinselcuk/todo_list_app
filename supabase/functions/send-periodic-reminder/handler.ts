const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
type Claim = { status: string; id?: string; lease?: string; payload?: { to: string; title: string; notes: string; category: string; workspaceName: string; reminderTime: string } }
export interface ReminderDependencies {
  authenticate(token: string): Promise<string | null>
  claim(user: string, task: string, workspace: string, timezone: string): Promise<Claim>
  finish(id: string, lease: string, success: boolean): Promise<void>
  send(key: string, message: NonNullable<Claim['payload']>): Promise<void>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function reminderHandler(deps: ReminderDependencies) {
  return async (req: Request): Promise<Response> => {
    const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
    if (req.method === 'OPTIONS') return reply(200, {})
    if (req.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return reply(401, { error: 'AUTH_REQUIRED' })
    let claim: Claim | undefined
    try {
      const user = await deps.authenticate(token)
      if (!user) return reply(401, { error: 'AUTH_REQUIRED' })
      const raw = await req.text()
      if (raw.length > 1024) return reply(400, { error: 'INVALID_REQUEST' })
      let body: Record<string, unknown>
      try { body = JSON.parse(raw) } catch { return reply(400, { error: 'INVALID_REQUEST' }) }
      if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !['taskId','workspaceId','timezone'].includes(key))
        || typeof body.taskId !== 'string' || !uuid.test(body.taskId) || typeof body.workspaceId !== 'string' || !uuid.test(body.workspaceId)
        || typeof body.timezone !== 'string' || body.timezone.length > 100) return reply(400, { error: 'INVALID_REQUEST' })
      claim = await deps.claim(user, body.taskId, body.workspaceId, body.timezone)
      if (claim.status === 'delivered') return reply(200, { ok: true })
      if (claim.status === 'busy') return reply(409, { error: 'DELIVERY_PENDING' })
      if (!claim.id || !claim.lease || !claim.payload) throw new Error('INVALID_CLAIM')
      await deps.send(`periodic/${claim.id}`, claim.payload)
      await deps.finish(claim.id, claim.lease, true)
      return reply(200, { ok: true })
    } catch (error) {
      if (claim?.id && claim.lease) { try { await deps.finish(claim.id, claim.lease, false) } catch { /* Lease expiry allows a retry with the same provider key. */ } }
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
      const known = ['ACCESS_DENIED','EMAIL_DISABLED','EMAIL_UNAVAILABLE','INVALID_TIMEZONE','REMINDER_NOT_DUE','DELIVERY_LIMIT'].find(code => message.includes(code))
      return reply(known === 'DELIVERY_LIMIT' ? 429 : known ? 403 : 503, { error: known || 'DELIVERY_UNAVAILABLE' })
    }
  }
}
export function escapeHtml(value: string): string {
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}
