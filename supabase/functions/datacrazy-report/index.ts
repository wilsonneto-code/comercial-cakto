// @ts-nocheck
// Edge Function: datacrazy-report

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://api.g1.datacrazy.io/api/v1'

const CLOSER_IDS = new Set([
  '4d88436f-d761-4e34-b974-d7890273a829',
  '746ec7cc-ff48-4139-9b40-977e0540d875',
  '22150736-c65d-472a-b3e8-5b14373a881c',
])
const CLOSER_META: Record<string, { closer: string }> = {
  '4d88436f-d761-4e34-b974-d7890273a829': { closer: 'Victor Vieira' },
  '746ec7cc-ff48-4139-9b40-977e0540d875': { closer: 'Wilson Neto' },
  '22150736-c65d-472a-b3e8-5b14373a881c': { closer: 'Isaac' },
}
const IGNORE_IDS = new Set([
  '6ed13d75-cdad-482b-aab3-57860abe0483',
])

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

    // 1. Busca todos os pipelines
    const pipelinesRes = await fetch(`${BASE}/pipelines?take=50`, { headers: h })
    const pipelinesData = await pipelinesRes.json()
    const allPipelines: any[] = pipelinesData.data ?? pipelinesData ?? []

    const PIPELINES = allPipelines
      .filter((p: any) => !IGNORE_IDS.has(p.id))
      .map((p: any) => ({
        id:     p.id,
        name:   p.name,
        closer: CLOSER_IDS.has(p.id) ? CLOSER_META[p.id]?.closer ?? '' : p.group ?? '',
        type:   CLOSER_IDS.has(p.id) ? 'closer' : 'sdr',
      }))

    // 2. Busca stages de todos os pipelines em paralelo
    const pipelinesWithStages = await Promise.all(PIPELINES.map(async (pipeline) => {
      const stagesRes = await fetch(`${BASE}/pipelines/${pipeline.id}/stages`, { headers: h })
      const stagesData = await stagesRes.json()
      const stages: any[] = stagesData.data ?? stagesData ?? []
      return { pipeline, stages }
    }))

    // 3. Mapa stageId -> pipelineId
    const stageToPipeline = new Map<string, string>()
    for (const { pipeline, stages } of pipelinesWithStages) {
      for (const stage of stages) {
        stageToPipeline.set(stage.id, pipeline.id)
      }
    }

    // 4. Busca TODOS os negócios (filtros da API não funcionam)
    const allBusinesses = await fetchAllPages(`${BASE}/businesses`, h)
    console.log(`[datacrazy-report] total businesses: ${allBusinesses.length}`)

    // 5. Agrupa por pipeline via stage.pipeline.id ou mapa de stages
    const businessesByPipeline = new Map<string, any[]>()
    for (const b of allBusinesses) {
      const pid = b.stage?.pipeline?.id
        ?? stageToPipeline.get(b.stageId)
        ?? b.pipelineId
      if (!pid) continue
      if (!businessesByPipeline.has(pid)) businessesByPipeline.set(pid, [])
      businessesByPipeline.get(pid)!.push(b)
    }

    // 6. Monta resultado — inclui lastMovedAt para filtrar movimentações no frontend
    const results = pipelinesWithStages.map(({ pipeline, stages }) => {
      const businesses = businessesByPipeline.get(pipeline.id) ?? []
      console.log(`[datacrazy-report] pipeline="${pipeline.name}" count=${businesses.length}`)

      return {
        pipeline:   pipeline.name,
        closer:     pipeline.closer,
        type:       pipeline.type,
        pipelineId: pipeline.id,
        stages: stages.sort((a, b) => a.index - b.index).map((s: any) => ({
          id:    s.id,
          name:  s.name,
          index: s.index,
          // count total atual (posição atual)
          count: businesses.filter(b => b.stageId === s.id).length,
        })),
        businesses: businesses.map(b => ({
          id:          b.id,
          leadId:      b.leadId,
          leadName:    b.lead?.name ?? '',
          leadEmail:   b.lead?.email ?? '',
          stageId:     b.stageId,
          stageName:   b.stage?.name ?? '',
          createdAt:   b.createdAt,
          updatedAt:   b.updatedAt,
          lastMovedAt: b.lastMovedAt ?? b.updatedAt ?? b.createdAt,
          total:       b.total ?? 0,
        })),
      }
    })

    return json({ pipelines: results, fetchedAt: new Date().toISOString() })

  } catch (e) {
    console.error('[datacrazy-report]', e)
    return json({ error: String(e) }, 500)
  }
})
