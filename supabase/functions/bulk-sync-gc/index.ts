// @ts-nocheck
// Supabase Edge Function: bulk-sync-gc
// Sincroniza a carteira GC com o CRM DataCrazy.
// Para cada cliente:
//   1. Busca lead por email → fallback telefone → cria se não existir
//   2. Adiciona tag GC ao lead (GC Starter / GC Growth / GC Enterprise)
//   3. Verifica se já existe negócio no pipeline GC correto
//   4. Se não existe → cria negócio no primeiro stage

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://api.g1.datacrazy.io/api/v1'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const GERENTE_TIER: Record<string, string> = {
  'rafael mendes':   'GC Enterprise',
  'carlos eduardo':  'GC Starter',
  'gabriel bairros': 'GC Growth',
}

function tierByGerente(gerente: string): string | null {
  const g = (gerente ?? '').toLowerCase().trim()
  for (const [key, tier] of Object.entries(GERENTE_TIER)) {
    if (g === key || g.includes(key) || key.includes(g)) return tier
  }
  return null
}

// Fuzzy: aceita "GC Stater" (typo DataCrazy) além de "GC Starter"
function findGcPipeline(pipelines: any[], tierName: string): any | null {
  const tier = tierName.toLowerCase()
  return pipelines.find(p => {
    const name = (p.name ?? '').toLowerCase()
    if (!name.includes('gc')) return false
    if (tier.includes('enterprise')) return name.includes('enterprise')
    if (tier.includes('growth'))     return name.includes('growth')
    if (tier.includes('starter'))    return name.includes('starter') || name.includes('stater')
    return false
  }) ?? null
}

// Faz fetch com retry automático em caso de rate-limit (429) ou erro de rede
async function dcFetch(url: string, opts: RequestInit, h: Record<string,string>, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, headers: h })
      if (res.status === 429) {
        // Rate limit — espera e tenta de novo
        const wait = (attempt + 1) * 1500
        console.warn(`[bulk-sync-gc] Rate limit 429 em ${url} — aguardando ${wait}ms`)
        await sleep(wait)
        continue
      }
      return res
    } catch (e) {
      if (attempt === retries) throw e
      await sleep(500)
    }
  }
  throw new Error(`Falha após ${retries + 1} tentativas: ${url}`)
}

// Extrai mensagem de erro de dados já parseados (quando .json() foi chamado antes)
function parsedError(data: any, ctx: string, status: number): string {
  const raw = data?.message ?? data?.error ?? data?.detail
    ?? data?.errors?.[0]?.message ?? data?.errors?.[0]
    ?? data
  const msg = (typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')).slice(0, 400)
  return `${ctx} → HTTP ${status}: ${msg || '(sem detalhe)'}`
}

// Extrai mensagem de erro legível de uma resposta ainda não consumida
async function apiError(res: Response, ctx: string): Promise<string> {
  let body = ''
  try { body = await res.text() } catch {}
  let parsed: any = null
  try { parsed = JSON.parse(body) } catch {}
  const msg = parsed?.message ?? parsed?.error ?? parsed?.detail ?? parsed?.errors?.[0]?.message
    ?? body.slice(0, 300)
  return `${ctx} → HTTP ${res.status}: ${msg || '(sem detalhe)'}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const respond = (body: unknown, _status = 200) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(SUPA_URL, SUPA_KEY)

    // ── API Key DataCrazy ────────────────────────────────────────────────────
    const { data: cfg } = await supabase
      .from('configuracoes').select('valor').eq('chave', 'datacrazy_api_key').maybeSingle()

    const apiKey = (cfg?.valor || Deno.env.get('DATACRAZY_API_KEY')) ?? ''
    if (!apiKey) return respond({ success: false, error: 'datacrazy_api_key não configurada em Configurações' }, 400)

    const h = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    // ── Fonte: lista do front-end ou Metabase ─────────────────────────────────
    let bodyJson: any = {}
    try { bodyJson = await req.json() } catch {}

    let rawClientes: any[] = []
    if (Array.isArray(bodyJson.clients) && bodyJson.clients.length > 0) {
      rawClientes = bodyJson.clients
    } else {
      const mbRes  = await fetch(`${SUPA_URL}/functions/v1/mb-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
        body:   JSON.stringify({}),
      })
      const mbData = await mbRes.json()
      rawClientes  = mbData.clientes ?? []
      if (!rawClientes.length)
        return respond({ success: false, error: 'Metabase não retornou clientes' }, 500)
    }

    const clientes = rawClientes.filter(c => c.email?.trim())
    console.log(`[bulk-sync-gc] Processando ${clientes.length} clientes`)

    // ── Pré-carrega pipelines ─────────────────────────────────────────────────
    const pipRes  = await dcFetch(`${BASE}/pipelines?take=100`, {}, h)
    const pipData = await pipRes.json()
    const allPipelines: any[] = pipData.data ?? pipData ?? []
    console.log('[bulk-sync-gc] Pipelines:', allPipelines.map((p: any) => p.name).join(' | '))

    const GC_TIERS = ['GC Starter', 'GC Growth', 'GC Enterprise']
    const gcPipelines:   Record<string, any>    = {}
    const gcFirstStages: Record<string, any>    = {}
    const pipelineNames: Record<string, string> = {}
    const pipelineErrors: string[]              = []

    for (const tierName of GC_TIERS) {
      const pip = findGcPipeline(allPipelines, tierName)
      if (!pip) {
        const msg = `Pipeline "${tierName}" não encontrado. Pipelines disponíveis: ${allPipelines.map((p:any) => p.name).join(', ')}`
        pipelineErrors.push(msg)
        console.warn('[bulk-sync-gc]', msg)
        continue
      }
      gcPipelines[tierName]   = pip
      pipelineNames[tierName] = pip.name

      const stagesRes  = await dcFetch(`${BASE}/pipelines/${pip.id}/stages?take=50`, {}, h)
      const stagesData = await stagesRes.json()
      const stages: any[] = stagesData.data ?? stagesData ?? []
      const first = stages.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))[0]
      if (first) {
        gcFirstStages[tierName] = first
        console.log(`[bulk-sync-gc] "${tierName}" → pipeline "${pip.name}" → stage "${first.name}"`)
      } else {
        pipelineErrors.push(`Pipeline "${pip.name}" não tem stages configurados`)
      }
    }

    // ── Pré-carrega / cria tags GC ────────────────────────────────────────────
    const tagsRes  = await dcFetch(`${BASE}/tags?take=100`, {}, h)
    const tagsData = await tagsRes.json()
    const knownTags: Array<{ id: string; name: string }> = tagsData.data ?? tagsData ?? []
    const gcTagIds: Record<string, string> = {}

    for (const tagName of GC_TIERS) {
      let tag = knownTags.find(t => t.name?.toLowerCase() === tagName.toLowerCase())
      if (!tag) {
        const r = await dcFetch(`${BASE}/tags`, { method: 'POST', body: JSON.stringify({ name: tagName }) }, h)
        const created = await r.json()
        if (created?.id) { tag = created; knownTags.push(tag) }
        else console.warn(`[bulk-sync-gc] Não criou tag "${tagName}":`, JSON.stringify(created))
      }
      if (tag?.id) gcTagIds[tagName] = tag.id
    }

    // ── Processa cada cliente ─────────────────────────────────────────────────
    const results: any[] = []

    for (const cli of clientes) {
      const email    = (cli.email ?? '').trim().toLowerCase()
      const nome     = (cli.nome ?? cli.client ?? '').trim()
      const telefone = cli.telefone ?? null
      const gerente  = (cli.gerente ?? '').trim()
      const tier     = tierByGerente(gerente)

      if (!tier) {
        results.push({ email, client: nome, gerente, tier: null, status: 'skip', error: `Gerente "${gerente}" não mapeado para nenhum tier GC` })
        continue
      }

      const entry: Record<string, any> = { email, client: nome, gerente, tier, status: 'ok', steps: [] }

      try {
        // ── Helper: verifica se um lead (por ID) tem email ou telefone ────────
        async function leadMatchesContact(id: string, eLower: string, ph: string): Promise<boolean> {
          const r = await dcFetch(`${BASE}/leads/${id}`, {}, h)
          if (!r.ok) return false
          const l = await r.json()
          return (
            (eLower && (l.email?.toLowerCase() === eLower ||
              l.contacts?.some((c: any) => c.identifier?.toLowerCase() === eLower))) ||
            (ph !== '' && (l.phone?.replace(/\D/g, '') === ph ||
              l.rawPhone?.replace(/\D/g, '') === ph ||
              l.contacts?.some((c: any) => c.identifier?.replace(/\D/g, '') === ph)))
          )
        }

        // ── Helper: busca lead pelo nome que o DC conhece ────────────────────
        async function findLeadByDcName(dcName: string, matchEmail: string, matchPhone: string): Promise<string | null> {
          if (!dcName.trim()) return null
          const r = await dcFetch(`${BASE}/leads?search=${encodeURIComponent(dcName.trim())}&take=20`, {}, h)
          if (!r.ok) return null
          const d = await r.json()
          const eLower = matchEmail.toLowerCase()
          const ph     = matchPhone.replace(/\D/g, '')
          const items: any[] = d.data ?? []

          // 1. Match rápido pelos campos da lista (pode não incluir contacts)
          const quick = items.find((l: any) =>
            (eLower && (l.email?.toLowerCase() === eLower ||
              l.contacts?.some((c: any) => c.identifier?.toLowerCase() === eLower))) ||
            (ph && (l.phone?.replace(/\D/g, '') === ph ||
              l.rawPhone?.replace(/\D/g, '') === ph ||
              l.contacts?.some((c: any) => c.identifier?.replace(/\D/g, '') === ph)))
          )
          if (quick) return quick.id

          // 2. Resultado único → assume que é o lead correto
          if (items.length === 1) return items[0].id

          // 3. Múltiplos resultados: busca detalhes de cada um (máx 8) para verificar contatos
          for (const item of items.slice(0, 8)) {
            if (await leadMatchesContact(item.id, eLower, ph)) return item.id
          }

          return null
        }

        // ── 1. Tenta criar lead diretamente ─────────────────────────────────
        // Evita pré-busca para economizar chamadas API (limite de recursos DC)
        let leadId: string | null = null

        const payload: any = { name: nome || email, email }
        if (telefone) payload.phone = String(telefone)
        const crRes  = await dcFetch(`${BASE}/leads`, { method: 'POST', body: JSON.stringify(payload) }, h)
        const crData = await crRes.json()

        if (crRes.ok) {
          leadId = crData?.id ?? null
          entry.leadAction = 'created'
        } else if (crData?.code === 'lead-with-same-contact-exists') {
          // Estrutura real: { code, message: { code, message, params: { name, email, phone } } }
          const params  = crData?.message?.params ?? crData?.params ?? {}
          const dcName  = (params.name  ?? '').trim()
          const dcEmail = (params.email ?? email).trim()
          const dcPhone = String(params.phone ?? telefone ?? '')
          leadId = await findLeadByDcName(dcName, dcEmail, dcPhone)
          // Fallback: tenta com nosso nome (pode estar cadastrado com nome diferente)
          if (!leadId && nome) leadId = await findLeadByDcName(nome, email, String(telefone ?? ''))
          if (leadId) {
            entry.leadAction = 'found_after_conflict'
          } else {
            entry.status = 'error'
            entry.error  = `lead existe no DC (nome: "${dcName}") mas não localizado via busca`
            results.push(entry); continue
          }
        } else {
          entry.status = 'error'
          entry.error  = parsedError(crData, 'criar_lead', crRes.status)
          if (crData?.id) leadId = crData.id
          else { results.push(entry); continue }
        }

        if (!leadId) {
          entry.status = 'error'
          entry.error  = 'Lead criado mas sem ID retornado pela API'
          results.push(entry)
          continue
        }
        entry.leadId = leadId

        // ── 4. Adiciona tag GC (preserva as demais tags do lead) ─────────────
        const tagId = gcTagIds[tier]
        if (tagId) {
          const lRes  = await dcFetch(`${BASE}/leads/${leadId}`, {}, h)
          const lData = await lRes.json()
          const currentTagIds: string[] = (lData?.tags ?? []).map((t: any) => t.id).filter(Boolean)

          if (!currentTagIds.includes(tagId)) {
            const tagRes = await dcFetch(`${BASE}/leads/${leadId}`, {
              method: 'PATCH', body: JSON.stringify({ tags: [...currentTagIds, tagId].map(id => ({ id })) }),
            }, h)
            if (!tagRes.ok) entry.steps.push(`tag: HTTP ${tagRes.status}`)
            else entry.tagAdded = tier
          } else {
            entry.tagAdded = `${tier} (já presente)`
          }
        }

        // ── 5. Verifica/cria negócio no pipeline GC ─────────────────────────
        const gcPip   = gcPipelines[tier]
        const gcStage = gcFirstStages[tier]

        if (!gcPip || !gcStage) {
          entry.status    = 'error'
          entry.error     = `Pipeline "${tier}" não encontrado no DataCrazy. ${pipelineErrors.join('; ')}`
          results.push(entry)
          continue
        }

        // Busca negócios existentes deste lead
        const bizRes  = await dcFetch(`${BASE}/leads/${leadId}/businesses?take=50`, {}, h)
        const bizData = await bizRes.json()
        if (!bizRes.ok) {
          entry.steps.push(`busca_negocios: HTTP ${bizRes.status}`)
        }
        const existing = (bizData.data ?? []).find(
          (b: any) => b.stage?.pipeline?.id === gcPip.id
        )

        if (existing) {
          entry.bizAction = 'already_exists'
          entry.bizId     = existing.id
          entry.bizStage  = existing.stage?.name ?? null
        } else {
          const crBizRes  = await dcFetch(`${BASE}/businesses`, {
            method: 'POST', body: JSON.stringify({ leadId, stageId: gcStage.id }),
          }, h)
          const crBizData = await crBizRes.json()
          if (!crBizRes.ok) {
            entry.status = 'error'
            entry.error  = parsedError(crBizData, 'criar_negocio', crBizRes.status)
          } else {
            entry.bizAction = 'created'
            entry.bizId     = crBizData?.id ?? null
            entry.bizStage  = gcStage.name
          }
        }

      } catch (err) {
        entry.status = 'error'
        entry.error  = `Exceção: ${String(err)}`
      }

      results.push(entry)
    }

    const stats = {
      total:          results.length,
      ok:             results.filter(r => r.status === 'ok').length,
      errors:         results.filter(r => r.status === 'error').length,
      skipped:        results.filter(r => r.status === 'skip').length,
      leadsCreated:   results.filter(r => r.leadAction  === 'created').length,
      bizCreated:     results.filter(r => r.bizAction   === 'created').length,
      bizExisting:    results.filter(r => r.bizAction   === 'already_exists').length,
      starter:        results.filter(r => r.tier === 'GC Starter').length,
      growth:         results.filter(r => r.tier === 'GC Growth').length,
      enterprise:     results.filter(r => r.tier === 'GC Enterprise').length,
      pipelinesFound: pipelineNames,
      pipelineErrors,
    }

    console.log('[bulk-sync-gc] Concluído:', JSON.stringify(stats))
    return respond({ success: true, stats, results })

  } catch (e) {
    console.error('[bulk-sync-gc] Erro fatal:', e)
    return respond({ success: false, error: String(e) }, 500)
  }
})
