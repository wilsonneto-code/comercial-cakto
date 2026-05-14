// @ts-nocheck
// Edge Function: google-oauth
// Gera URL de autorização OAuth do Google Calendar e processa o callback

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url    = new URL(req.url)
  // Detecta callback pelo parâmetro 'code' (Google não aceita query params na redirect URI)
  const code_param = url.searchParams.get('code')
  const action = code_param ? 'callback' : (url.searchParams.get('action') ?? '')

  const CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')     ?? ''
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
  const REDIRECT_URI  = 'https://dugjrmjlcmkeyjjbqxxk.supabase.co/functions/v1/google-oauth'
  const APP_URL       = Deno.env.get('APP_URL') ?? 'https://www.caktocomercial.site'

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

  // ── Gera URL de autorização ───────────────────────────────────────────────
  if (action === 'url') {
    try {
      const body   = await req.json()
      const userId = body.user_id ?? ''
      if (!userId) return json({ error: 'user_id obrigatório' }, 400)

      const params = new URLSearchParams({
        client_id:     CLIENT_ID,
        redirect_uri:  REDIRECT_URI,
        response_type: 'code',
        scope:         SCOPES,
        access_type:   'offline',
        prompt:        'consent',
        state:         userId,
      })

      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
    } catch (e) {
      return json({ error: String(e) }, 500)
    }
  }

  // ── Callback OAuth ────────────────────────────────────────────────────────
  if (action === 'callback') {
    const code   = code_param ?? url.searchParams.get('code')
    const userId = url.searchParams.get('state')
    const error  = url.searchParams.get('error')

    if (error || !code || !userId) {
      return Response.redirect(`${APP_URL}/gerente-contas?google_oauth=error`, 302)
    }

    try {
      // Troca code por tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri:  REDIRECT_URI,
          grant_type:    'authorization_code',
        }),
      })
      const tokens = await tokenRes.json()

      if (!tokens.refresh_token) {
        return Response.redirect(`${APP_URL}/gerente-contas?google_oauth=no_refresh_token`, 302)
      }

      // Busca o e-mail do usuário Google para usar como calendar ID
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      const profile = await profileRes.json()
      const calendarId = profile.email ?? 'primary'

      // Salva no banco
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )
      await supabase.from('users').update({
        google_refresh_token: tokens.refresh_token,
        google_calendar_id:   calendarId,
      }).eq('id', userId)

      return Response.redirect(`${APP_URL}/gerente-contas?google_oauth=success`, 302)
    } catch (e) {
      console.error('[google-oauth] callback error:', e)
      return Response.redirect(`${APP_URL}/gerente-contas?google_oauth=error`, 302)
    }
  }

  // ── Desconectar ───────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    try {
      const body   = await req.json()
      const userId = body.user_id ?? ''
      if (!userId) return json({ error: 'user_id obrigatório' }, 400)

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )
      await supabase.from('users').update({
        google_refresh_token: null,
        google_calendar_id:   null,
      }).eq('id', userId)

      return json({ success: true })
    } catch (e) {
      return json({ error: String(e) }, 500)
    }
  }

  return json({ error: 'action inválida' }, 400)
})
