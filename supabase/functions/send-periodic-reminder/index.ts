import { createClient } from 'npm:@supabase/supabase-js@2'
import { reminderHandler, escapeHtml } from './handler.ts'

// JWT is verified again here; never trust a body-supplied recipient or user ID.
Deno.serve(reminderHandler({
  async authenticate(token) {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
    const { data, error } = await client.auth.getUser(token)
    return !error && data.user?.email_confirmed_at ? data.user.id : null
  },
  async claim(user, task, workspace, timezone) {
    const { data, error } = await admin().rpc('claim_periodic_email', { uid: user, tid: task, wid: workspace, tz: timezone })
    if (error) throw error
    return data
  },
  async finish(id, lease, success) {
    const { error } = await admin().rpc('finish_periodic_email', { did: id, token: lease, success })
    if (error) throw error
  },
  async send(key, message) {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) throw new Error('EMAIL_CONFIGURATION_REQUIRED')
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>${escapeHtml(message.title)}</h2><p>Periyodik hatırlatmanızın zamanı geldi.</p>
      ${message.notes ? `<p>${escapeHtml(message.notes)}</p>` : ''}
      <p>${escapeHtml(message.workspaceName)} · ${escapeHtml(message.reminderTime)}</p></div>`
    const result = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ from: Deno.env.get('REMINDER_FROM_EMAIL') || 'Reminders <onboarding@resend.dev>', to: [message.to], subject: `Hatırlatma: ${message.title}`, html }) })
    if (!result.ok) throw new Error('EMAIL_PROVIDER_UNAVAILABLE')
  },
}))
function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
}
