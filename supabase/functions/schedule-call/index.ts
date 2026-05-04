// @ts-nocheck
// Supabase Edge Function — schedule-call
// CRUD no Google Calendar com Meet automático, convidados e cores por Closer.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = 'jeferson@cakto.com.br'

async function getAccessToken(): Promise<string> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')     ?? ''
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN') ?? ''

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou GOOGLE_REFRESH_TOKEN não configurados.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }).toString(),
  })

  const json = await res.json()
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`)
  return json.access_token
}

// Cor determinística por nome do Closer — mesma lógica no frontend
function closerColorId(name: string): string {
  let hash = 0
  for (const ch of (name ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff
  return String((hash % 11) + 1)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body        = await req.json()
    const action      = body.action ?? 'create'
    const calendarId  = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary'
    const accessToken = await getAccessToken()
    const calBase     = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    const authHdr     = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    const json        = (s: unknown) => new Response(JSON.stringify(s), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    const err500      = (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { google_event_id } = body
      if (!google_event_id) return err500('google_event_id obrigatório para delete.')
      const res = await fetch(`${calBase}/${google_event_id}`, { method: 'DELETE', headers: authHdr })
      if (!res.ok && res.status !== 410) return err500(await res.text())
      return json({ deleted: true })
    }

    // ── Monta evento (CREATE / UPDATE) ────────────────────────────────────────
    const { title, date, time, end_time, closerName, closerEmail, clientEmail, notes } = body
    const tz      = '-03:00'
    const timeStr = time || '09:00'

    // Hora de término: usa end_time do payload ou +1h como fallback
    let endStr: string
    if (end_time && end_time !== timeStr) {
      endStr = end_time
    } else {
      const [h, m] = timeStr.split(':').map(Number)
      endStr = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    const descLines = [
      `Closer: ${closerName ?? ''}${closerEmail ? ` <${closerEmail}>` : ''}`,
      clientEmail ? `Cliente: ${clientEmail}` : '',
      notes ? `\n${notes}` : '',
    ].filter(Boolean).join('\n')

    // Convidados: sempre o admin + o cliente (se informado)
    const attendees: { email: string }[] = [{ email: ADMIN_EMAIL }]
    if (clientEmail) attendees.push({ email: clientEmail })

    const event = {
      summary:     title,
      description: descLines.trim(),
      colorId:     closerColorId(closerName ?? ''),
      attendees,
      start: { dateTime: `${date}T${timeStr}:00${tz}`, timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: `${date}T${endStr}:00${tz}`,  timeZone: 'America/Sao_Paulo' },
      conferenceData: {
        createRequest: {
          requestId:             crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (action === 'update') {
      const { google_event_id } = body
      if (!google_event_id) return err500('google_event_id obrigatório para update.')
      const res = await fetch(`${calBase}/${google_event_id}?conferenceDataVersion=1`, {
        method: 'PUT', headers: authHdr, body: JSON.stringify(event),
      })
      if (!res.ok) return err500(await res.text())
      const updated  = await res.json()
      const meetLink = updated.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ?? null
      return json({ eventId: updated.id, htmlLink: updated.htmlLink, meetLink })
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    const calRes = await fetch(`${calBase}?conferenceDataVersion=1`, {
      method: 'POST', headers: authHdr, body: JSON.stringify(event),
    })
    if (!calRes.ok) {
      const errTxt = await calRes.text()
      console.error('[schedule-call] Calendar API error:', errTxt)
      return err500(errTxt)
    }
    const created  = await calRes.json()
    const meetLink = created.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ?? null
    return json({ eventId: created.id, htmlLink: created.htmlLink, meetLink })

  } catch (e) {
    console.error('[schedule-call] erro:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
