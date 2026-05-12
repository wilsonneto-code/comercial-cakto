// @ts-nocheck
// Edge Function: datacrazy-report
// Busca todos os negócios dos pipelines Closer 1, 2 e 3 no DataCrazy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://api.g1.datacrazy.io/api/v1'

const PIPELINES = [
  // Closers
  { id: '4d88436f-d761-4e34-b974-d7890273a829', name: 'Closer 1', closer: 'Victor Vieira', type: 'closer' },
  { id: '746ec7cc-ff48-4139-9b40-977e0540d875', name: 'Closer 2', closer: 'Wilson Neto',  type: 'closer' },
  { id: '22150736-c65d-472a-b3e8-5b14373a881c', name: 'Closer 3', closer: 'Isaac',         type: 'closer' },
  // SDR — Campanha Iphone
  { id: '79319246-8852-430c-8b62-b5c10a9dd6f0', name: 'Campanha Iphone 1', closer: 'Time 01', type: 'sdr' },
  { id: '201d3917-dbd7-4bb5-bb27-a703f9a964a0', name: 'Campanha Iphone 2', closer: 'Time 02', type: 'sdr' },
  { id: '33a4f440-60f6-4cbc-982e-2321446948e7', name: 'Campanha Iphone 3', closer: 'Time 03', type: 'sdr' },
]

async function fetchAllPages(url: string, headers: Record<string, string>) {
  const all: any[] = []
  let skip = 0
  const take = 100
  while (true) {
    const sep = url.includes('?') ? '&' : '?'
    const res = await fetch(`${url}${sep}take=${take}&skip=${skip}`, { headers })
    const d = await res.json()
    const rows = d.data ?? []
    all.push(...rows)
    if (rows.length < take) break
    skip += take
  }
  return all
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: cfg } = await supabase
      .from('configuracoes').select('valor').eq('chave', 'datacrazy_api_key').maybeSingle()

    const apiKey = (cfg?.valor || Deno.env.get('DATACRAZY_API_KEY')) ?? ''
    if (!apiKey) return json({ error: 'API key não configurada' }, 400)

    const h = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    // Busca todos os stages e negócios dos 3 pipelines em paralelo
    const results = await Promise.all(PIPELINES.map(async (pipeline) => {
      // Busca stages do pipeline
      const stagesRes = await fetch(`${BASE}/pipelines/${pipeline.id}/stages`, { headers: h })
      const stagesData = await stagesRes.json()
      const stages: any[] = stagesData.data ?? stagesData ?? []

      // Busca todos os negócios do pipeline
      const businesses = await fetchAllPages(
        `${BASE}/businesses?pipelineId=${pipeline.id}`, h
      )

      // Deduplicação: para cada lead, mantém apenas 1 negócio (mais recente) por pipeline
      const seenLeads = new Map<string, any>()
      for (const b of businesses) {
        const leadId = b.leadId
        if (!seenLeads.has(leadId) ||
            new Date(b.createdAt) > new Date(seenLeads.get(leadId).createdAt)) {
          seenLeads.set(leadId, b)
        }
      }
      const deduplicated = [...seenLeads.values()]

      return {
        pipeline: pipeline.name,
        closer: pipeline.closer,
        type: pipeline.type,
        pipelineId: pipeline.id,
        stages: stages.sort((a, b) => a.index - b.index).map((s: any) => ({
          id: s.id, name: s.name, index: s.index,
          count: deduplicated.filter(b => b.stageId === s.id).length,
        })),
        businesses: deduplicated.map(b => ({
          id:         b.id,
          leadId:     b.leadId,
          leadName:   b.lead?.name ?? '',
          leadEmail:  b.lead?.email ?? '',
          stageId:    b.stageId,
          stageName:  b.stage?.name ?? '',
          createdAt:  b.createdAt,
          updatedAt:  b.updatedAt,
          total:      b.total ?? 0,
        })),
      }
    }))

    return json({ pipelines: results, fetchedAt: new Date().toISOString() })

  } catch (e) {
    console.error('[datacrazy-report]', e)
    return json({ error: String(e) }, 500)
  }
})
