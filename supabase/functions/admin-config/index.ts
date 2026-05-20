// @ts-nocheck
// Edge Function: admin-config
// Lê/grava configuracoes e webhook_logs usando service_role.
// Verifica JWT via SUPABASE_ANON_KEY + role na tabela users.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('[admin-config] Requisição recebida:', req.method)

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })

  try {
    console.log('[admin-config] Verificando Authorization header...')
    const authHeader = req.headers.get('Authorization')
    console.log('[admin-config] Auth header presente:', !!authHeader)
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token não fornecido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('[admin-config] Verificando variáveis de ambiente...')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    console.log('[admin-config] SUPABASE_URL existe:', !!supabaseUrl)
    console.log('[admin-config] SUPABASE_ANON_KEY existe:', !!anonKey)
    console.log('[admin-config] SUPABASE_SERVICE_ROLE_KEY existe:', !!serviceKey)

    // Verifica o JWT com a chave anon (não service_role)
    console.log('[admin-config] Criando cliente anon para validar JWT...')
    const supabaseUser = createClient(
      supabaseUrl      ?? '',
      anonKey          ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    console.log('[admin-config] Chamando auth.getUser()...')
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    console.log('[admin-config] auth.getUser resultado — user:', !!user, '| error:', authError?.message ?? null)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verifica role com service_role (bypassa RLS)
    console.log('[admin-config] Criando cliente service_role...')
    const supabaseAdmin = createClient(
      supabaseUrl ?? '',
      serviceKey  ?? '',
    )

    console.log('[admin-config] Buscando role do user:', user.id)
    const { data: userData, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    console.log('[admin-config] Role result:', JSON.stringify(userData), '| error:', roleError?.message ?? null)

    if (userData?.role !== 'Admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado', role: userData?.role }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('[admin-config] Lendo body...')
    const body = await req.json()
    console.log('[admin-config] Body:', JSON.stringify(body))

    // ── get: retorna URL + últimos 10 logs ───────────────────────────────────
    if (body.action === 'get') {
      console.log('[admin-config] Executando action: get')
      const [{ data: configs, error: cfgErr }, { data: logs, error: logErr }] = await Promise.all([
        supabaseAdmin.from('configuracoes').select('chave, valor'),
        supabaseAdmin
          .from('webhook_logs')
          .select('id, ativacao_id, status, tentativas, erro, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
      ])
      console.log('[admin-config] configs error:', cfgErr?.message ?? null)
      console.log('[admin-config] logs error:', logErr?.message ?? null)
      console.log('[admin-config] configs count:', configs?.length ?? 0)
      const webhookUrl = configs?.find(r => r.chave === 'datacrazy_webhook_url')?.valor ?? ''
      return new Response(JSON.stringify({ webhookUrl, logs: logs ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── save: grava URL do webhook ───────────────────────────────────────────
    if (body.action === 'save') {
      console.log('[admin-config] Executando action: save')
      const { error } = await supabaseAdmin.from('configuracoes').upsert(
        { chave: 'datacrazy_webhook_url', valor: body.webhookUrl ?? '', updated_at: new Date().toISOString() },
        { onConflict: 'chave' },
      )
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[admin-config] ERRO FATAL:', err.message, err.stack)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
