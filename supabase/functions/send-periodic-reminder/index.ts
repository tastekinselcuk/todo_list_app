// Supabase Edge Function: send-periodic-reminder
// Deploy: supabase functions deploy send-periodic-reminder
// Secrets: RESEND_API_KEY, REMINDER_FROM_EMAIL (optional)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from =
      Deno.env.get('REMINDER_FROM_EMAIL') || 'Reminders <onboarding@resend.dev>'

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { to, title, notes, category, reminderTime } = await req.json()

    if (!to || !title) {
      return new Response(
        JSON.stringify({ error: 'Missing to or title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const safeNotes = notes ? String(notes).slice(0, 500) : ''
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">⏰ ${escapeHtml(title)}</h2>
        <p style="color: #555; margin: 0 0 12px;">
          Periyodik hatırlatmanızın zamanı geldi.
        </p>
        ${safeNotes ? `<p style="background:#f5f5f5;padding:12px;border-radius:8px;">${escapeHtml(safeNotes)}</p>` : ''}
        <p style="color:#888;font-size:12px;margin-top:16px;">
          ${category ? `Kategori: ${escapeHtml(String(category))} · ` : ''}
          ${reminderTime ? `Saat: ${escapeHtml(String(reminderTime))}` : ''}
        </p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Hatırlatma: ${title}`,
        html,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
