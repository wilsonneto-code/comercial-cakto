// @ts-nocheck
// Supabase Edge Function: sync-datacrazy
// Quando uma ativação é criada no sistema comercial:
//   1. Busca o lead no DataCrazy por email ou telefone
//   2. Cria ou atualiza o lead com os dados do cliente
//   3. Cria ou move o card para "Cliente Ativo" no pipeline do time correto

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://api.g1.datacrazy.io/api/v1'

// team_uuid (Supabase) → pipeline Closer + stage "Cliente Ativo"
const TEAM_PIPELINE: Record<string, { pipelineId: string; stageId: string; label: string }> = {
  '63d33c9a-fad3-4095-8be6-39f84dda7519': {
    label:      'Time 01 → Closer 1',
    pipelineId: '4d88436f-d761-4e34-b974-d7890273a829',
    stageId:    'f5faf1b5-0f76-40b2-8cb3-d8c2c127595f', // Cliente Ativo
  },
  'c37cfdfe-755c-428e-b132-13fd7c90ea7b': {
    label:      'Time 02 → Closer 2',
    pipelineId: '746ec7cc-ff48-4139-9b40-977e0540d875',
    stageId:    '9b8e192e-8ae9-4b08-b89f-44592c43b1bd', // Cliente Ativo
  },
  '92f0c8fa-03c6-46e5-b97a-5ef544a9e183': {
    label:      'Time 03 → Closer 3',
    pipelineId: '22150736-c65d-472a-b3e8-5b14373a881c',
    stageId:    'f7f0a07f-c08b-4ee0-a731-4e76f463b52d', // Cliente Ativo
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const { name, email, phone, team_uuid } = await req.json()

    // Busca API Key nas configurações do Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: cfg } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'datacrazy_api_key')
      .maybeSingle()

    const apiKey = (cfg?.valor || Deno.env.get('DATACRAZY_API_KEY')) ?? ''
    if (!apiKey) return json({ success: false, error: 'datacrazy_api_key não configurada em Configurações' }, 400)

    const pipeline = TEAM_PIPELINE[team_uuid]
    if (!pipeline) {
      console.warn(`[sync-datacrazy] time_uuid não mapeado: ${team_uuid}`)
      return json({ success: false, error: `Time não mapeado: ${team_uuid}` }, 400)
    }

    console.log(`[sync-datacrazy] Processando: ${email} | ${pipeline.label}`)

    const h = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    // ── 1. Busca lead por email ──────────────────────────────────────────────
    let leadId: string | null = null

    if (email) {
      const r = await fetch(`${BASE}/leads?search=${encodeURIComponent(email)}&take=5`, { headers: h })
      const d = await r.json()
      const found = (d.data ?? []).find((l: any) =>
        l.email?.toLowerCase() === email.toLowerCase() ||
        l.contacts?.some((c: any) => c.identifier?.toLowerCase() === email.toLowerCase())
      )
      if (found) { leadId = found.id; console.log(`[sync-datacrazy] Lead encontrado por email: ${leadId}`) }
    }

    // ── 2. Fallback: busca por telefone ──────────────────────────────────────
    if (!leadId && phone) {
      const phoneDigits = phone.replace(/\D/g, '')
      const r = await fetch(`${BASE}/leads?search=${encodeURIComponent(phoneDigits)}&take=5`, { headers: h })
      const d = await r.json()
      const found = (d.data ?? []).find((l: any) =>
        l.rawPhone === phoneDigits ||
        l.phone?.replace(/\D/g, '') === phoneDigits
      )
      if (found) { leadId = found.id; console.log(`[sync-datacrazy] Lead encontrado por telefone: ${leadId}`) }
    }

    // ── 3. Cria ou atualiza lead ─────────────────────────────────────────────
    const leadPayload: Record<string, string> = {}
    if (name)  leadPayload.name  = name
    if (email) leadPayload.email = email
    if (phone) leadPayload.phone = phone

    if (leadId) {
      await fetch(`${BASE}/leads/${leadId}`, {
        method: 'PATCH', headers: h, body: JSON.stringify(leadPayload),
      })
      console.log(`[sync-datacrazy] Lead atualizado: ${leadId}`)
    } else {
      const r = await fetch(`${BASE}/leads`, {
        method: 'POST', headers: h, body: JSON.stringify(leadPayload),
      })
      const created = await r.json()
      leadId = created?.id ?? null
      console.log(`[sync-datacrazy] Lead criado: ${leadId}`)
    }

    if (!leadId) return json({ success: false, error: 'Falha ao criar/encontrar lead' }, 500)

    // ── 4. Verifica se já existe card neste pipeline ─────────────────────────
    const bRes = await fetch(
      `${BASE}/businesses?leadId=${leadId}&pipelineId=${pipeline.pipelineId}&take=10`, { headers: h }
    )
    const bData = await bRes.json()
    const existingBusiness = (bData.data ?? [])[0]

    if (existingBusiness) {
      // Move para "Cliente Ativo"
      await fetch(`${BASE}/businesses/actions/move`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ ids: [existingBusiness.id], stageId: pipeline.stageId }),
      })
      console.log(`[sync-datacrazy] Card movido para Cliente Ativo: ${existingBusiness.id}`)
    } else {
      // Cria card diretamente em "Cliente Ativo"
      const cRes = await fetch(`${BASE}/businesses`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ leadId, stageId: pipeline.stageId }),
      })
      const created = await cRes.json()
      console.log(`[sync-datacrazy] Card criado em Cliente Ativo: ${created?.id}`)
    }

    return json({ success: true, leadId })

  } catch (e) {
    console.error('[sync-datacrazy] Erro:', e)
    return json({ success: false, error: String(e) }, 500)
  }
})
