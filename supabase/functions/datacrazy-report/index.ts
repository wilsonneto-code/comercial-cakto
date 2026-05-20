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
const IGNORE_NAMES = new Set([
  'Cadastros',
  'SDR Instagram',
  'Internacional',
  'Premiações',
  'Premiacoes',
])

async function fetchAllPages(url: string, headers: Record<string, string>) {
  const take = 1000
  const sep = url.includes('?') ? '&' : '?'

  // Primeira página: descobre o total
  const firstRes = await fetch(`${url}${sep}take=${take}&skip=0`, { headers })
  const firstData = await firstRes.json()
  const declaredTotal: number = firstData.count ?? firstData.total ?? 0
  const firstRows: any[] = firstData.data ?? []

  if (firstRows.length >= declaredTotal || firstRows.length < take) {
    return { rows: firstRows, declaredTotal }
  }

  // Demais páginas em paralelo (lotes de 10 para não sobrecarregar a API)
  const remaining = Math.ceil((declaredTotal - take) / take)
  const BATCH = 10
  const all: any[] = [...firstRows]

  for (let i = 0; i < remaining; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, remaining - i) }, (_, j) => {
      const skip = (i + j + 1) * take
      return fetch(`${url}${sep}take=${take}&skip=${skip}`, { headers })
        .then(r => r.json())
        .then(d => d.data ?? [])
    })
    const results = await Promise.all(batch)
    for (const rows of results) all.push(...rows)
  }

  return { rows: all, declaredTotal }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const reqUrl = new URL(req.url)
  const diagnose = reqUrl.searchParams.get('diagnose') === '1'

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

    // ── Modo diagnóstico: descobre quantos negócios a API retorna com cada parâmetro ──
    if (diagnose) {
      const variants = [
        { label: 'sem filtro',                       url: `${BASE}/businesses` },
        { label: 'startDate=2020-01-01',             url: `${BASE}/businesses?startDate=2020-01-01` },
        { label: 'startDate=2020-01-01 (movedAt)',   url: `${BASE}/businesses?startDate=2020-01-01&dateType=movedAt` },
        { label: 'lastMovedAtStart=2020-01-01',      url: `${BASE}/businesses?lastMovedAtStart=2020-01-01` },
        { label: 'movedAtStart=2020-01-01',          url: `${BASE}/businesses?movedAtStart=2020-01-01` },
        { label: 'createdAtStart=2020-01-01',        url: `${BASE}/businesses?createdAtStart=2020-01-01` },
        { label: 'interval=all',                     url: `${BASE}/businesses?interval=all` },
        { label: 'interval=year&startDate=2020',     url: `${BASE}/businesses?interval=year&startDate=2020-01-01` },
        { label: 'period=all',                       url: `${BASE}/businesses?period=all` },
      ]
      // Só pega take=1 para verificar o count declarado
      const results = await Promise.all(variants.map(async v => {
        try {
          const sep = v.url.includes('?') ? '&' : '?'
          const res = await fetch(`${v.url}${sep}take=1&skip=0`, { headers: h })
          const d = await res.json()
          return {
            label: v.label,
            status: res.status,
            declaredCount: d.count ?? d.total ?? null,
            firstRow: d.data?.[0] ? Object.keys(d.data[0]).join(', ') : null,
            rawSample: JSON.stringify(d).substring(0, 200),
          }
        } catch (e) {
          return { label: v.label, error: String(e) }
        }
      }))

      // Também testa buscar histórico de movimentações pelo endpoint de businesses de um pipeline específico
      const pipelinesRes = await fetch(`${BASE}/pipelines?take=50`, { headers: h })
      const pipelinesData = await pipelinesRes.json()
      const firstSdrPipeline = (pipelinesData.data ?? []).find((p: any) =>
        p.name?.toLowerCase().includes('campanha') || p.name?.toLowerCase().includes('iphone')
      )

      let pipelineBusinessTest = null
      if (firstSdrPipeline) {
        // Testa filtrar por pipelineId via parâmetro
        const r1 = await fetch(`${BASE}/businesses?pipelineId=${firstSdrPipeline.id}&take=1`, { headers: h })
        const d1 = await r1.json()
        // Testa via path
        const r2 = await fetch(`${BASE}/pipelines/${firstSdrPipeline.id}/businesses?take=1`, { headers: h })
        const d2txt = await r2.text()
        pipelineBusinessTest = {
          pipeline: firstSdrPipeline.name,
          id: firstSdrPipeline.id,
          'businesses?pipelineId': { status: r1.status, count: d1.count ?? null, sample: JSON.stringify(d1).substring(0, 200) },
          'pipelines/{id}/businesses': { status: r2.status, body: d2txt.substring(0, 200) },
        }
      }

      return json({ variants: results, pipelineBusinessTest })
    }

    // ── Fluxo principal ──

    // 1. Pipelines
    const pipelinesRes = await fetch(`${BASE}/pipelines?take=50`, { headers: h })
    const pipelinesData = await pipelinesRes.json()
    const allPipelines: any[] = pipelinesData.data ?? pipelinesData ?? []

    const PIPELINES = allPipelines
      .filter((p: any) => !IGNORE_IDS.has(p.id) && !IGNORE_NAMES.has(p.name))
      .map((p: any) => ({
        id:     p.id,
        name:   p.name,
        closer: CLOSER_IDS.has(p.id) ? CLOSER_META[p.id]?.closer ?? '' : p.group ?? '',
        type:   CLOSER_IDS.has(p.id) ? 'closer' : 'sdr',
      }))

    // 2. Stages de cada pipeline
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

    // 4. Todos os negócios
    const { rows: allBusinesses, declaredTotal } = await fetchAllPages(`${BASE}/businesses`, h)
    console.log(`[datacrazy-report] businesses fetched=${allBusinesses.length} declared=${declaredTotal}`)

    // 5. Agrupa por pipeline — filtra apenas a partir de abril/2026 e sem deduplicação
    const FROM_DATE = new Date('2026-04-01T00:00:00.000Z')
    const businessesByPipeline = new Map<string, any[]>()
    for (const b of allBusinesses) {
      const movedAt = new Date(b.lastMovedAt ?? b.createdAt ?? 0)
      if (movedAt < FROM_DATE) continue
      const pid = b.stage?.pipeline?.id
        ?? stageToPipeline.get(b.stageId)
        ?? b.pipelineId
      if (!pid) continue
      if (!businessesByPipeline.has(pid)) businessesByPipeline.set(pid, [])
      businessesByPipeline.get(pid)!.push(b)
    }

    // 6. Activities
    const { rows: allActivities } = await fetchAllPages(`${BASE}/activities`, h)
    console.log(`[datacrazy-report] activities: ${allActivities.length}`)

    const activitiesByBusiness = new Map<string, any[]>()
    for (const act of allActivities) {
      const bid = act.businessId ?? act.business?.id
      if (!bid) continue
      if (!activitiesByBusiness.has(bid)) activitiesByBusiness.set(bid, [])
      activitiesByBusiness.get(bid)!.push(act)
    }

    // 7. Resultado
    const results = pipelinesWithStages.map(({ pipeline, stages }) => {
      const businesses = businessesByPipeline.get(pipeline.id) ?? []
      console.log(`[datacrazy-report] "${pipeline.name}" businesses=${businesses.length}`)

      return {
        pipeline:   pipeline.name,
        closer:     pipeline.closer,
        type:       pipeline.type,
        pipelineId: pipeline.id,
        stages: stages.sort((a: any, b: any) => a.index - b.index).map((s: any) => ({
          id:    s.id,
          name:  s.name,
          index: s.index,
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
          activities: (activitiesByBusiness.get(b.id) ?? []).map((a: any) => ({
            id:        a.id,
            title:     a.title ?? '',
            type:      a.type ?? a.activityType ?? '',
            createdAt: a.createdAt,
            stageId:   a.stageId ?? a.stage?.id ?? null,
            stageName: a.stage?.name ?? a.stageName ?? '',
          })),
        })),
      }
    })

    return json({
      pipelines: results,
      fetchedAt: new Date().toISOString(),
      debug: { totalBusinessesFetched: allBusinesses.length, declaredTotal },
    })

  } catch (e) {
    console.error('[datacrazy-report]', e)
    return json({ error: String(e) }, 500)
  }
})
