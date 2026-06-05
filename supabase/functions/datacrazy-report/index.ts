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

    // ── Modo: Relatório de Leads das 4 Campanhas → Esteiras → Call Agendada ──
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    if (body.leads_report) {
      const SOURCE_IDS = new Set([
        '03421a59-a526-43e1-a429-05943887ab14', // Campanha Low Ticket
        'd23a5d31-84bb-4794-9e22-d7e1b9458c84', // Campanha Meta - Formulário Nativo
        '172facdd-d902-463f-80e4-53ef1c3b965b', // Formulário Distr. Leads
        '61769c50-9f92-4946-917f-1f2075171017', // Campanha Juros
      ])
      const SOURCE_NAMES: Record<string, string> = {
        '03421a59-a526-43e1-a429-05943887ab14': 'Campanha Low Ticket',
        'd23a5d31-84bb-4794-9e22-d7e1b9458c84': 'Campanha Meta - Ads',
        '172facdd-d902-463f-80e4-53ef1c3b965b': 'Formulário Dist. Leads',
        '61769c50-9f92-4946-917f-1f2075171017': 'Campanha Juros',
      }
      const ESTEIRA_IDS = new Set([
        '79319246-8852-430c-8b62-b5c10a9dd6f0', // Esteira Cadu
        '201d3917-dbd7-4bb5-bb27-a703f9a964a0', // Esteira Geovana
      ])
      const ESTEIRA_NAMES: Record<string, { name: string; sdr: string }> = {
        '79319246-8852-430c-8b62-b5c10a9dd6f0': { name: 'Esteira Cadu', sdr: 'Carlos Eduardo' },
        '201d3917-dbd7-4bb5-bb27-a703f9a964a0': { name: 'Esteira Geovana', sdr: 'Geovana Paiva' },
      }
      // Stages relevantes dentro das próprias campanhas de origem para mostrar na tabela
      // "callAgendada" só será true se o lead também aparecer nos Closers
      const SOURCE_CALL_STAGES: Record<string, { pipeline: string; tipo: string }> = {
        'fedbdf5e-99c9-4259-a031-4a90074d9a91': { pipeline: 'Campanha Low Ticket',    tipo: 'Call Agendada'   },
        '0dee0b06-7eb0-4e87-9b7c-cc7bdc1536b9': { pipeline: 'Campanha Juros',         tipo: 'Call Agendada'   },
        '09c9e5c8-b2ae-456b-9cf3-4f74765213ae': { pipeline: 'Formulário Dist. Leads', tipo: 'Leads Atendidos' },
      }
      // Stages relevantes nos 3 pipelines de Closer (Call Agendada + Cliente Ativo)
      const CLOSER_STAGE_IDS: Record<string, { closer: string; tipo: string }> = {
        'dcf4a28b-c8d8-4aca-ad8b-8380abb1223e': { closer: 'Victor Vieira', tipo: 'Call Agendada'  },
        '8584ffbb-4e04-4221-9523-e2e5690b6d91': { closer: 'Victor Vieira', tipo: 'Call Realizada' },
        'f5faf1b5-0f76-40b2-8cb3-d8c2c127595f': { closer: 'Victor Vieira', tipo: 'Cliente Ativo'  },
        '4563c2d4-541b-4b5a-91b7-e55a1acff731': { closer: 'Wilson Neto',   tipo: 'Call Agendada'  },
        'bebbd1dc-faaa-4ab0-9689-5aa9ccb974d7': { closer: 'Wilson Neto',   tipo: 'Call Realizada' },
        '9b8e192e-8ae9-4b08-b89f-44592c43b1bd': { closer: 'Wilson Neto',   tipo: 'Cliente Ativo'  },
        '14854585-59d9-450e-aea6-3bcef31baf4f': { closer: 'Isaac',         tipo: 'Call Agendada'  },
        '834e3653-22ad-4b19-9687-70ba1155c4a0': { closer: 'Isaac',         tipo: 'Call Realizada' },
        'f7f0a07f-c08b-4ee0-a731-4e76f463b52d': { closer: 'Isaac',         tipo: 'Cliente Ativo'  },
        'a472fe43-60ea-4af8-b6c0-436359283d78': { closer: 'Isaac',         tipo: 'Cliente Ativo'  },
      }
      // Filtro de data (opcional)
      const startDate = body.startDate ? new Date(body.startDate) : null
      const endDate   = body.endDate   ? new Date(body.endDate + 'T23:59:59') : null

      // Nome da coluna de qualificação em cada pipeline de campanha
      const QUALIFIED_STAGE_NAME = 'Entre R$ 10 Mil e R$ 30 Mil por mês'

      // Rastreia leads únicos: total criados + qualificados por campanha
      const sourceLeadSets: Record<string, { leads: Set<string>; qualificados: Set<string> }> = {}
      for (const name of Object.values(SOURCE_NAMES)) {
        sourceLeadSets[name] = { leads: new Set(), qualificados: new Set() }
      }

      // Busca a ordenação de stages de cada pipeline fonte para saber quais IDs são >= "qualificado"
      // Leads em "Entre R$10-30k" OU qualquer stage posterior = qualificado
      const qualifiedStageIds: Record<string, Set<string>> = {}
      for (const [pid, pname] of Object.entries(SOURCE_NAMES)) {
        qualifiedStageIds[pname] = new Set()
        try {
          const stagesRes  = await fetch(`${BASE}/pipelines/${pid}/stages`, { headers: h })
          const stagesData = await stagesRes.json()
          const stages: any[] = (stagesData.data ?? stagesData ?? [])
            .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
          const qualIdx = stages.findIndex((s: any) => s.name === QUALIFIED_STAGE_NAME)
          if (qualIdx >= 0) {
            for (const s of stages.slice(qualIdx)) qualifiedStageIds[pname].add(s.id)
          }
          console.log(`[leads_report] ${pname} stages=${stages.length} qualIdx=${qualIdx}`)
        } catch (e) {
          console.warn(`[leads_report] stages fetch failed for ${pname}:`, e)
        }
      }

      // Busca TODOS os businesses de uma vez (API só funciona via /businesses global)
      const { rows: allBiz } = await fetchAllPages(`${BASE}/businesses`, h)
      console.log(`[leads_report] total businesses fetched: ${allBiz.length}`)

      // Indexa por leadId → info nos pipelines relevantes
      const leadInSource:  Record<string, string[]>  = {} // leadId → [pipeline names]
      const leadInEsteira: Record<string, { name: string; sdr: string; stage: string; stageId: string; lastMovedAt: string; leadName: string; leadEmail: string; phone: string }> = {}
      const leadInCloserCall: Record<string, string> = {} // leadId → closer name

      for (const b of allBiz) {
        const lid = b.leadId ?? b.lead?.id
        if (!lid) continue
        const pid = b.stage?.pipeline?.id ?? ''
        const sid = b.stage?.id ?? ''

        if (SOURCE_IDS.has(pid)) {
          if (!leadInSource[lid]) leadInSource[lid] = []
          const pname = SOURCE_NAMES[pid]
          if (pname && !leadInSource[lid].includes(pname)) leadInSource[lid].push(pname)

          // Total Leads = todos criados no período (via API automation)
          // Qualificados = desses mesmos leads, os que estão em "Entre R$10-30k" ou etapa posterior
          if (pname && sourceLeadSets[pname]) {
            const createdAt = b.createdAt ?? ''
            let inRange = true
            if (createdAt && startDate && new Date(createdAt) < startDate) inRange = false
            if (createdAt && endDate   && new Date(createdAt) > endDate)   inRange = false
            if (inRange) {
              sourceLeadSets[pname].leads.add(lid)
              if (qualifiedStageIds[pname]?.has(sid)) {
                sourceLeadSets[pname].qualificados.add(lid)
              }
            }
          }
        }

        if (ESTEIRA_IDS.has(pid)) {
          const info = ESTEIRA_NAMES[pid]
          if (info) {
            const movedAt = b.lastMovedAt ?? b.updatedAt ?? b.createdAt ?? ''
            // Aplica filtro de data se fornecido
            if (movedAt && startDate) {
              const d = new Date(movedAt)
              if (d < startDate) continue
            }
            if (movedAt && endDate) {
              const d = new Date(movedAt)
              if (d > endDate) continue
            }
            leadInEsteira[lid] = {
              name: info.name,
              sdr: info.sdr,
              stage: b.stage?.name ?? '—',
              stageId: sid,
              lastMovedAt: movedAt,
              leadName:  b.lead?.name  ?? '—',
              leadEmail: b.lead?.email ?? '',
              phone:     b.lead?.phone ?? '',
            }
          }
        }

        if (CLOSER_STAGE_IDS[sid]) {
          const info = CLOSER_STAGE_IDS[sid]
          const PRIO: Record<string, number> = { 'Cliente Ativo': 3, 'Call Realizada': 2, 'Call Agendada': 1 }
          const existing = leadInCloserCall[lid]
          if (!existing || (PRIO[info.tipo] ?? 0) > (PRIO[existing.split(' | ')[1]] ?? 0)) {
            leadInCloserCall[lid] = `${info.closer} | ${info.tipo}`
          }
        }

        // Registra leads em "Call Agendada" dentro das próprias campanhas
        if (SOURCE_CALL_STAGES[sid]) {
          const info = SOURCE_CALL_STAGES[sid]
          const movedAt = b.lastMovedAt ?? b.updatedAt ?? b.createdAt ?? ''
          if (movedAt && startDate && new Date(movedAt) < startDate) continue
          if (movedAt && endDate   && new Date(movedAt) > endDate)   continue
          if (!leadInEsteira[lid]) {
            // Só adiciona se ainda não está catalogado via esteira
            leadInEsteira[lid] = {
              name: `Campanha (${info.tipo})`,
              sdr: 'SDR',
              stage: b.stage?.name ?? info.tipo,
              stageId: sid,
              lastMovedAt: movedAt,
              leadName:  b.lead?.name  ?? '—',
              leadEmail: b.lead?.email ?? '',
              phone:     b.lead?.phone ?? '',
            }
          }
        }
      }

      // Cruza: lead que veio de fonte + está na esteira ou em Call Agendada da própria campanha
      const resultLeads: Array<{
        leadId: string; leadName: string; leadEmail: string; phone: string
        esteira: string; sdr: string; stage: string
        origens: string[]; callAgendada: boolean; closer: string
        lastMovedAt: string
      }> = []

      // 1. Leads que passaram pelas Esteiras ou SOURCE_CALL_STAGES
      const addedLeads = new Set<string>()
      for (const [lid, esteiraInfo] of Object.entries(leadInEsteira)) {
        const origens = leadInSource[lid]
        if (!origens || origens.length === 0) continue
        const closerRaw = leadInCloserCall[lid] ?? ''
        const [closerName, closerTipo] = closerRaw ? closerRaw.split(' | ') : ['', '']
        const isDirectSourceCall = esteiraInfo.name.startsWith('Campanha (Call Agendada')
        const callAgendada = !!closerRaw || isDirectSourceCall
        addedLeads.add(lid)
        resultLeads.push({
          leadId:      lid,
          leadName:    esteiraInfo.leadName,
          leadEmail:   esteiraInfo.leadEmail,
          phone:       esteiraInfo.phone,
          esteira:     esteiraInfo.name,
          sdr:         esteiraInfo.sdr,
          stage:       esteiraInfo.stage,
          origens,
          callAgendada,
          closer:      closerName,
          closerTipo:  closerTipo ?? '',
          lastMovedAt: esteiraInfo.lastMovedAt,
        })
      }

      // 2. Leads que foram DIRETO da campanha para os Closers (sem passar pelas Esteiras)
      //    Rastreados em leadInCloserCall mas não em leadInEsteira
      for (const [lid, closerRaw] of Object.entries(leadInCloserCall)) {
        if (addedLeads.has(lid)) continue // já adicionado
        const origens = leadInSource[lid]
        if (!origens || origens.length === 0) continue
        const [closerName, closerTipo] = closerRaw.split(' | ')
        // Busca dados do lead no allBiz (primeiro negócio encontrado nas fontes)
        const bizData = allBiz.find((b: any) => (b.leadId ?? b.lead?.id) === lid && SOURCE_IDS.has(b.stage?.pipeline?.id ?? ''))
        resultLeads.push({
          leadId:      lid,
          leadName:    bizData?.lead?.name  ?? '—',
          leadEmail:   bizData?.lead?.email ?? '',
          phone:       bizData?.lead?.phone ?? '',
          esteira:     'Direto para Closer',
          sdr:         '—',
          stage:       bizData?.stage?.name ?? '—',
          origens,
          callAgendada: true,
          closer:      closerName,
          closerTipo:  closerTipo ?? '',
          lastMovedAt: bizData?.lastMovedAt ?? '',
        })
      }

      // Estatísticas por campanha
      // Pré-inicializa todas as 4 campanhas para garantir que apareçam na tabela
      const stats: Record<string, { total: number; cadu: number; geovana: number; callAgendada: number; clienteAtivo: number; leads: number; qualificados: number }> = {}
      for (const name of Object.values(SOURCE_NAMES)) {
        stats[name] = { total: 0, cadu: 0, geovana: 0, callAgendada: 0, clienteAtivo: 0, leads: 0, qualificados: 0 }
      }
      for (const l of resultLeads) {
        for (const o of l.origens) {
          if (!stats[o]) stats[o] = { total: 0, cadu: 0, geovana: 0, callAgendada: 0, clienteAtivo: 0, leads: 0, qualificados: 0 }
          stats[o].total++
          if (l.esteira === 'Esteira Cadu') stats[o].cadu++
          else if (l.esteira === 'Esteira Geovana') stats[o].geovana++
          if (l.callAgendada) stats[o].callAgendada++
          if ((l as any).closerTipo === 'Cliente Ativo') stats[o].clienteAtivo++
        }
      }
      // Injeta contagens de Leads e Qualificados por campanha
      for (const [campName, sets] of Object.entries(sourceLeadSets)) {
        if (stats[campName]) {
          stats[campName].leads        = sets.leads.size
          stats[campName].qualificados = sets.qualificados.size
        }
      }

      const leadsTotal        = Object.values(sourceLeadSets).reduce((a, s) => a + s.leads.size, 0)
      const qualificadosTotal = Object.values(sourceLeadSets).reduce((a, s) => a + s.qualificados.size, 0)

      return json({
        leads: resultLeads,
        stats,
        totals: {
          total: resultLeads.length,
          cadu: resultLeads.filter(l => l.esteira === 'Esteira Cadu').length,
          geovana: resultLeads.filter(l => l.esteira === 'Esteira Geovana').length,
          callAgendada: resultLeads.filter(l => l.callAgendada).length,
          clienteAtivo: resultLeads.filter(l => (l as any).closerTipo === 'Cliente Ativo').length,
          leadsTotal,
          qualificadosTotal,
        },
        fetchedAt: new Date().toISOString(),
      })
    }

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
