// @ts-nocheck
// Supabase Edge Function — schedule-call
// CRUD no Google Calendar com Meet automático, convidados e cores por Closer.
// Calendário "Cakto" (GOOGLE_CALENDAR_ID + GOOGLE_REFRESH_TOKEN) é o calendário
// principal: TODA call agendada gera um evento ali, independente de o
// Closer/SDR terem conectado a própria conta Google. Se Closer/SDR tiverem
// conta conectada, uma cópia best-effort é criada no calendário pessoal deles.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL        = 'wilsonneto@cakto.com.br'
const CAKTO_CALENDAR_ID  = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary'

const json   = (s: unknown) => new Response(JSON.stringify(s), { headers: { ...CORS, 'Content-Type': 'application/json' } })
const err500 = (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })

function supa() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

// refreshToken vazio/undefined cai no token admin (calendário Cakto)
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

  const j = await res.json()
  if (!j.access_token) throw new Error(`Token error: ${JSON.stringify(j)}`)
  return j.access_token
}

async function getGCTokens(email: string): Promise<{ refreshToken: string | null; calendarId: string }> {
  try {
    const { data } = await supa()
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

// Token de acesso ao calendário "Cakto": usa a conta Google conectada do admin
// (ADMIN_EMAIL, dono do calendário compartilhado "Cakto"). Fallback: GOOGLE_REFRESH_TOKEN.
async function getAdminAccessToken(): Promise<string> {
  const adminTokens = await getGCTokens(ADMIN_EMAIL)
  if (adminTokens.refreshToken) return getAccessToken(adminTokens.refreshToken)
  return getAccessToken()
}

// Cor determinística por nome do Closer — mesma lógica no frontend
function closerColorId(name: string): string {
  let hash = 0
  for (const ch of (name ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff
  return String((hash % 11) + 1)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Extrai e-mails válidos de um campo que pode vir sujo (vazio, múltiplos, texto solto)
function extractEmails(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/[\s,;]+/).map(s => s.trim()).filter(s => EMAIL_RE.test(s))
}

// Monta o payload do evento a partir dos dados da call
function buildEvent(input: {
  title: string; date: string; time: string; end_time?: string
  closerName?: string | null; closerEmail?: string | null
  clientEmail?: string | null; notes?: string | null
}) {
  const { title, date, closerName, closerEmail, clientEmail, notes } = input
  const tz      = '-03:00'
  const timeStr = (input.time || '09:00').slice(0, 5)

  const [sh, sm] = timeStr.split(':').map(Number)
  const startMin = sh * 60 + sm

  let endStr = input.end_time ? input.end_time.slice(0, 5) : ''
  if (endStr) {
    const [eh, em] = endStr.split(':').map(Number)
    if (eh * 60 + em <= startMin) endStr = '' // end_time inválido (≤ início) → recalcula
  }
  if (!endStr) {
    const total = startMin + 60
    endStr = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }

  const descLines = [
    `Closer: ${closerName ?? ''}${closerEmail ? ` <${closerEmail}>` : ''}`,
    clientEmail ? `Cliente: ${clientEmail}` : '',
    notes ? `\n${notes}` : '',
  ].filter(Boolean).join('\n')

  // Convidados: admin + closer (se diferente do admin) + cliente(s) válidos
  const attendees: { email: string }[] = [{ email: ADMIN_EMAIL }]
  if (closerEmail && closerEmail !== ADMIN_EMAIL) attendees.push({ email: closerEmail })
  for (const e of extractEmails(clientEmail)) {
    if (!attendees.some(a => a.email.toLowerCase() === e.toLowerCase())) attendees.push({ email: e })
  }

  return {
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
  if (!res.ok) console.warn('[schedule-call] Falha ao criar cópia:', calendarId, await res.text())
  else console.log('[schedule-call] Cópia criada no calendário:', calendarId)
}

// Cria cópias best-effort nos calendários pessoais do closer/SDR (se conectados)
async function createPersonalCopies(
  closerEmail: string, sdrEmail: string,
  event: Record<string, unknown>, meetLink: string | null,
) {
  const closerTokens = closerEmail ? await getGCTokens(closerEmail) : { refreshToken: null, calendarId: 'primary' }
  const sdrTokens    = sdrEmail && sdrEmail !== closerEmail ? await getGCTokens(sdrEmail) : { refreshToken: null, calendarId: 'primary' }

  if (closerTokens.refreshToken) {
    try {
      const t = await getAccessToken(closerTokens.refreshToken)
      await createCopyEvent(closerTokens.calendarId || 'primary', t, event, meetLink)
    } catch (e) { console.warn('[schedule-call] Falha cópia closer:', String(e)) }
  }
  if (sdrTokens.refreshToken) {
    try {
      const t = await getAccessToken(sdrTokens.refreshToken)
      await createCopyEvent(sdrTokens.calendarId || 'primary', t, event, meetLink)
    } catch (e) { console.warn('[schedule-call] Falha cópia SDR:', String(e)) }
  }
}

// Cria eventos no calendário Cakto para um lote de calls antigas (sem acesso a DB —
// os dados de cada call vêm prontos do frontend, que já tem permissão de escrita em `calls`)
async function handleBackfillBatch(body: any) {
  const items = (body.items ?? []) as Array<{
    id: string; title: string; date: string; time: string; end_time?: string
    closerName?: string; closerEmail?: string; sdrEmail?: string
    clientEmail?: string; notes?: string
  }>

  const adminAccessToken = await getAdminAccessToken()
  const caktoBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAKTO_CALENDAR_ID)}/events`
  const authHdr   = { Authorization: `Bearer ${adminAccessToken}`, 'Content-Type': 'application/json' }

  const results: { id: string; ok: boolean; eventId?: string; meetLink?: string | null; error?: string }[] = []

  for (const it of items) {
    try {
      const event = buildEvent(it)
      const res = await fetch(`${caktoBase}?conferenceDataVersion=1`, {
        method: 'POST', headers: authHdr, body: JSON.stringify(event),
      })
      if (!res.ok) { results.push({ id: it.id, ok: false, error: await res.text() }); continue }
      const created  = await res.json()
      const meetLink = created.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ?? null

      await createPersonalCopies(it.closerEmail ?? '', it.sdrEmail ?? '', event, meetLink)

      results.push({ id: it.id, ok: true, eventId: created.id, meetLink })
    } catch (e) {
      results.push({ id: it.id, ok: false, error: String(e) })
    }
  }

  return json({ results })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body   = await req.json()
    const action = body.action ?? 'create'

    if (action === 'backfill-batch') return await handleBackfillBatch(body)

    const closerEmail = body.closerEmail ?? ''
    const sdrEmail    = body.sdrEmail ?? ''

    const adminAccessToken = await getAdminAccessToken()
    const caktoBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAKTO_CALENDAR_ID)}/events`
    const authHdr   = { Authorization: `Bearer ${adminAccessToken}`, 'Content-Type': 'application/json' }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { google_event_id } = body
      if (!google_event_id) return err500('google_event_id obrigatório para delete.')
      const res = await fetch(`${caktoBase}/${google_event_id}`, { method: 'DELETE', headers: authHdr })
      if (!res.ok && res.status !== 410) return err500(await res.text())
      return json({ deleted: true })
    }

    // ── Monta evento (CREATE / UPDATE) ────────────────────────────────────────
    const { title, date, time, end_time, closerName, clientEmail, notes } = body
    const event = buildEvent({ title, date, time, end_time, closerName, closerEmail, clientEmail, notes })

    // ── UPDATE ────────────────────────────────────────────────────────────────
    if (action === 'update') {
      const { google_event_id } = body
      if (!google_event_id) return err500('google_event_id obrigatório para update.')
      const res = await fetch(`${caktoBase}/${google_event_id}?conferenceDataVersion=1`, {
        method: 'PUT', headers: authHdr, body: JSON.stringify(event),
      })
      if (!res.ok) return err500(await res.text())
      const updated  = await res.json()
      const meetLink = updated.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ?? null
      return json({ eventId: updated.id, htmlLink: updated.htmlLink, meetLink })
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    const calRes = await fetch(`${caktoBase}?conferenceDataVersion=1`, {
      method: 'POST', headers: authHdr, body: JSON.stringify(event),
    })
    if (!calRes.ok) {
      const errTxt = await calRes.text()
      console.error('[schedule-call] Calendar API error:', errTxt)
      return err500(errTxt)
    }
    const created  = await calRes.json()
    const meetLink = created.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ?? null

    // Cópias best-effort nos calendários pessoais do closer/SDR
    await createPersonalCopies(closerEmail, sdrEmail, event, meetLink)

    return json({ eventId: created.id, htmlLink: created.htmlLink, meetLink })

  } catch (e) {
    console.error('[schedule-call] erro:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
