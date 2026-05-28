// @ts-nocheck
// Supabase Edge Function — schedule-call
// CRUD no Google Calendar com Meet automático, convidados e cores por Closer.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = 'wilsonneto@cakto.com.br'

async function getAccessToken(refreshToken?: string): Promise<string> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')     ?? ''
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
  const token        = refreshToken || Deno.env.get('GOOGLE_REFRESH_TOKEN') || ''

  if (!clientId || !clientSecret || !token) {
    throw new Error('Credenciais Google não configuradas.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: token,
      grant_type:    'refresh_token',
    }).toString(),
  })

  const json = await res.json()
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`)
  return json.access_token
}

async function getGCTokens(email: string): Promise<{ refreshToken: string | null; calendarId: string }> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data } = await supabase
      .from('users')
      .select('google_refresh_token, google_calendar_id')
      .eq('email', email)
      .maybeSingle()
    return {
      refreshToken: data?.google_refresh_token ?? null,
      calendarId:   data?.google_calendar_id ?? 'primary',
    }
  } catch {
    return { refreshToken: null, calendarId: 'primary' }
  }
}

// Cor determinística por nome do Closer — mesma lógica no frontend
function closerColorId(name: string): string {
  let hash = 0
  for (const ch of (name ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff
  return String((hash % 11) + 1)
}

// Cria evento em um calendário sem gerar nova conferência (cópia)
async function createCopyEvent(
  calendarId: string,
  accessToken: string,
  event: Record<string, unknown>,
  meetLink: string | null,
) {
  const copy = {
    ...event,
    conferenceData: undefined,
    description: [
      event.description,
      meetLink ? `\nLink do Meet: ${meetLink}` : '',
    ].filter(Boolean).join('\n'),
  }
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(copy) }
  )
  if (!res.ok) console.warn('[schedule-call] Falha ao criar cópia no calendário SDR:', await res.text())
  else console.log('[schedule-call] Cópia criada no calendário SDR:', calendarId)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body         = await req.json()
    const action       = body.action ?? 'create'
    const closerEmail  = body.closerEmail ?? ''
    const sdrEmail     = body.sdrEmail ?? ''

    const json   = (s: unknown) => new Response(JSON.stringify(s), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    const err500 = (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })

    // Busca tokens: closer primeiro, SDR como fallback
    const closerTokens = closerEmail ? await getGCTokens(closerEmail) : { refreshToken: null, calendarId: 'primary' }
    const sdrTokens    = sdrEmail && sdrEmail !== closerEmail ? await getGCTokens(sdrEmail) : { refreshToken: null, calendarId: 'primary' }

    // Se nenhum tem token, pula
    if (!closerTokens.refreshToken && !sdrTokens.refreshToken) {
      console.warn('[schedule-call] Sem token para closer nem SDR — Google Calendar ignorado')
      return json({ eventId: null, meetLink: null, skipped: true })
    }

    // Usa o token do closer como principal; se não tiver, usa o do SDR
    const primaryTokens  = closerTokens.refreshToken ? closerTokens : sdrTokens
    const calendarId     = primaryTokens.calendarId || 'primary'
    const accessToken    = await getAccessToken(primaryTokens.refreshToken!)
    const calBase        = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    const authHdr        = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

    console.log('[schedule-call] principal:', closerTokens.refreshToken ? closerEmail : sdrEmail, '| calendarId:', calendarId)

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { google_event_id } = body
      if (!google_event_id) return err500('google_event_id obrigatório para delete.')
      const res = await fetch(`${calBase}/${google_event_id}`, { method: 'DELETE', headers: authHdr })
      if (!res.ok && res.status !== 410) return err500(await res.text())
      return json({ deleted: true })
    }

    // ── Monta evento (CREATE / UPDATE) ────────────────────────────────────────
    const { title, date, time, end_time, closerName, clientEmail, notes } = body
    const tz      = '-03:00'
    const timeStr = time || '09:00'

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

    // Convidados: admin + closer (se diferente do admin) + cliente
    const attendees: { email: string }[] = [{ email: ADMIN_EMAIL }]
    if (closerEmail && closerEmail !== ADMIN_EMAIL) attendees.push({ email: closerEmail })
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

    // Cria cópia no calendário do SDR se ele tiver token e for diferente do principal
    if (sdrTokens.refreshToken && sdrTokens !== primaryTokens) {
      try {
        const sdrAccessToken = await getAccessToken(sdrTokens.refreshToken)
        await createCopyEvent(sdrTokens.calendarId || 'primary', sdrAccessToken, event, meetLink)
      } catch (e) {
        console.warn('[schedule-call] Falha ao criar cópia SDR:', String(e))
      }
    }

    return json({ eventId: created.id, htmlLink: created.htmlLink, meetLink })

  } catch (e) {
    console.error('[schedule-call] erro:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
