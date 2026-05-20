// @ts-nocheck
/**
 * Edge Function: calcular-tpv
 *
 * Serve como proxy sem CORS para chamadas ao Metabase e como processador
 * em lote para popular o tpv_cache.
 *
 * Modos de operação (determinados pelo body):
 * A) { cliente_email, data_inicio, data_fim } → TPV de um cliente (card 2107)
 * B) { team_uuid, data_inicio, data_fim }     → TPV por canal do time (card 2108)
 * C) { cliente_email, tpv_diario: true }      → TPV diário do cliente (card 2109)
 * D) { ativacao_id }                           → Processa e salva no tpv_cache
 * E) { limite }                                → Processa N ativações em lote
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const METABASE_URL    = Deno.env.get('METABASE_URL')    ?? ''
const METABASE_API_KEY = Deno.env.get('METABASE_API_KEY') ?? ''

const DATA_INICIO_REGRA = '2026-04-01'

const TIMES: { [uuid: string]: string } = {
  '63d33c9a-fad3-4095-8be6-39f84dda7519': 'Time 01',
  'c37cfdfe-755c-428e-b132-13fd7c90ea7b': 'Time 02',
  '92f0c8fa-03c6-46e5-b97a-5ef544a9e183': 'Time 03',
}

// ─── Helpers Metabase ─────────────────────────────────────────────────────────

async function buscarTPV(email: string, dataInicio: string, dataFim: string): Promise<number> {
  try {
    const res = await fetch(`${METABASE_URL}/api/card/2107/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: [
        { type: 'text',        value: email,      target: ['variable', ['template-tag', 'email']]       },
        { type: 'date/single', value: dataInicio, target: ['variable', ['template-tag', 'data_inicio']] },
        { type: 'date/single', value: dataFim,    target: ['variable', ['template-tag', 'data_fim']]    },
      ]}),
    })
    const data = await res.json()
    return Number(data?.data?.rows?.[0]?.[2] ?? 0)
  } catch { return 0 }
}

async function buscarTPVCanal(teamUuid: string, dataInicio: string, dataFim: string) {
  try {
    const res = await fetch(`${METABASE_URL}/api/card/2108/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: [
        { type: 'text',        value: teamUuid,   target: ['variable', ['template-tag', 'team_id']]     },
        { type: 'date/single', value: dataInicio, target: ['variable', ['template-tag', 'data_inicio']] },
        { type: 'date/single', value: dataFim,    target: ['variable', ['template-tag', 'data_fim']]    },
      ]}),
    })
    const data = await res.json()
    const rows: unknown[][] = data?.data?.rows ?? []
    const result = { inbound: 0, outbound: 0, indicacao: 0, total: 0 }
    rows.forEach(row => {
      const canal = String(row[0]).toLowerCase()
      const tpv   = Number(row[1] ?? 0)
      if (canal.includes('inbound'))  result.inbound   += tpv
      else if (canal.includes('outbound')) result.outbound  += tpv
      else if (canal.includes('indica'))   result.indicacao += tpv
      result.total += tpv
    })
    return result
  } catch { return { inbound: 0, outbound: 0, indicacao: 0, total: 0 } }
}

async function buscarTPVDiario(email: string): Promise<number> {
  try {
    const res = await fetch(`${METABASE_URL}/api/card/2109/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: [
        { type: 'text', value: email, target: ['variable', ['template-tag', 'email']] },
      ]}),
    })
    const data = await res.json()
    return Number(data?.data?.rows?.[0]?.[0] ?? 0)
  } catch { return 0 }
}

// ─── Handler principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // ── Modo A: TPV de um cliente (proxy card 2107, sem CORS) ─────────────────
    if (body.cliente_email && body.data_inicio && body.data_fim && !body.ativacao_id && !body.limite) {
      const tpv = await buscarTPV(body.cliente_email, body.data_inicio, body.data_fim)
      return new Response(
        JSON.stringify({ success: true, tpv, email: body.cliente_email }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Modo B: TPV por canal do time (proxy card 2108, sem CORS) ────────────
    if (body.team_uuid && body.data_inicio && body.data_fim) {
      const canal = await buscarTPVCanal(body.team_uuid, body.data_inicio, body.data_fim)
      return new Response(
        JSON.stringify({ success: true, ...canal }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Modo C: TPV diário de um cliente (proxy card 2109, sem CORS) ─────────
    if (body.tpv_diario && body.cliente_email) {
      const tpv = await buscarTPVDiario(body.cliente_email)
      return new Response(
        JSON.stringify({ success: true, tpv, email: body.cliente_email }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Modos D/E: processar ativações e salvar no tpv_cache ─────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const limite     = body.limite     ?? 50
    const ativacaoId = body.ativacao_id ?? null

    let query = supabase
      .from('activations')
      .select(`
        id, email, responsible, sdr_id, date, created_at,
        closer:users!activations_responsible_fkey (id, email, team_id),
        sdr:users!activations_sdr_id_fkey (id, email)
      `)
      .not('email', 'is', null)
      .gte('date', DATA_INICIO_REGRA)
      .order('created_at', { ascending: false })

    if (ativacaoId) {
      query = query.eq('id', ativacaoId)
    } else {
      query = query.limit(limite)
    }

    const { data: ativacoes, error } = await query
    if (error) throw error

    const resultados = []

    for (const ativacao of ativacoes ?? []) {
      const closer   = ativacao.closer as { id: string; email: string; team_id: string } | null
      const sdr      = ativacao.sdr    as { id: string; email: string } | null
      const teamUuid = closer?.team_id ?? null
      const timeNome = teamUuid ? (TIMES[teamUuid] ?? null) : null

      const dataFechamento = new Date(ativacao.date ?? ativacao.created_at)
      const dataInicio     = dataFechamento.toISOString().split('T')[0]
      const dataFim30      = new Date(dataFechamento); dataFim30.setDate(dataFim30.getDate() + 30)
      const dataFim7       = new Date(dataFechamento); dataFim7.setDate(dataFim7.getDate() + 7)

      const [tpv30, tpv7] = await Promise.all([
        buscarTPV(ativacao.email, dataInicio, dataFim30.toISOString().split('T')[0]),
        buscarTPV(ativacao.email, dataInicio, dataFim7.toISOString().split('T')[0]),
      ])

      const gatilhoRoleta = tpv7 >= 1000
      const bonusCloser   = tpv30 * 0.002
      const bonusSdr      = tpv30 * 0.0005

      const { error: upsertError } = await supabase.from('tpv_cache').upsert({
        ativacao_id:        ativacao.id,
        cliente_email:      ativacao.email,
        closer_email:       closer?.email ?? null,
        sdr_email:          sdr?.email    ?? null,
        time_id:            timeNome,
        data_fechamento:    dataFechamento.toISOString(),
        tpv_30_dias:        tpv30,
        tpv_7_dias:         tpv7,
        gatilho_roleta:     gatilhoRoleta,
        bonus_closer:       bonusCloser,
        bonus_sdr:          bonusSdr,
        ultima_atualizacao: new Date().toISOString(),
      }, { onConflict: 'ativacao_id' })

      if (upsertError) console.error('[calcular-tpv] upsert error:', JSON.stringify(upsertError))

      resultados.push({
        ativacao_id: ativacao.id, cliente_email: ativacao.email,
        closer_email: closer?.email, sdr_email: sdr?.email,
        time_id: timeNome, tpv_30_dias: tpv30, tpv_7_dias: tpv7,
        gatilho_roleta: gatilhoRoleta,
      })
    }

    return new Response(
      JSON.stringify({ success: true, processados: resultados.length, resultados }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, erro: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
