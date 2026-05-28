// @ts-nocheck
// update-tags-gc: atualiza tag de status nos leads do DataCrazy conforme % atingido
// Tags: "Dentro da Meta" (>=80%), "Próximo da Meta" (50-79%), "Possível Churn" (20-49%), "Churn" (<20%)
// Remove tags antigas de status e adiciona a atual, mantendo as demais tags intactas.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const BASE = 'https://api.g1.datacrazy.io/api/v1'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const STATUS_TAGS = ['Dentro da Meta', 'Próximo da Meta', 'Possível Churn', 'Churn']

function tagForPct(pct: number | null): string {
  if (pct === null || pct < 20) return 'Churn'
  if (pct < 50)  return 'Possível Churn'
  if (pct < 80)  return 'Próximo da Meta'
  return 'Dentro da Meta'
}

async function dcFetch(url: string, opts: RequestInit, h: Record<string, string>, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...opts, headers: h })
      if (res.status === 429) { await sleep((attempt + 1) * 1500); continue }
      return res
    } catch (e) {
      if (attempt === retries) throw e
      await sleep(500)
    }
  }
  throw new Error(`Falha após ${retries + 1} tentativas: ${url}`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const respond = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(SUPA_URL, SUPA_KEY)

    const { data: cfg } = await supabase
      .from('configuracoes').select('valor').eq('chave', 'datacrazy_api_key').maybeSingle()
    const apiKey = (cfg?.valor || Deno.env.get('DATACRAZY_API_KEY')) ?? ''
    if (!apiKey) return respond({ success: false, error: 'datacrazy_api_key não configurada' })

    const h = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    let bodyJson: any = {}
    try { bodyJson = await req.json() } catch {}
    const clients: any[] = bodyJson.clients ?? []
    if (!clients.length) return respond({ success: false, error: 'Nenhum cliente enviado' })

    // ── Pré-carrega / cria as 4 tags de status ────────────────────────────
    const tagsRes  = await dcFetch(`${BASE}/tags?take=100`, {}, h)
    const tagsData = await tagsRes.json()
    const allTags: any[] = tagsData.data ?? tagsData ?? []
    const statusTagIds: Record<string, string> = {}

    for (const tagName of STATUS_TAGS) {
      let tag = allTags.find((t: any) => t.name?.toLowerCase() === tagName.toLowerCase())
      if (!tag) {
        const r = await dcFetch(`${BASE}/tags`, { method: 'POST', body: JSON.stringify({ name: tagName }) }, h)
        const created = await r.json()
        if (created?.id) { tag = created; allTags.push(tag) }
      }
      if (tag?.id) statusTagIds[tagName] = tag.id
    }
    const statusIdSet = new Set(Object.values(statusTagIds))

    // ── Helper: encontra leadId buscando por nome ─────────────────────────
    async function findLead(searchName: string, eLower: string, ph: string): Promise<string | null> {
      if (!searchName.trim()) return null
      const r = await dcFetch(`${BASE}/leads?search=${encodeURIComponent(searchName.trim())}&take=20`, {}, h)
      if (!r.ok) return null
      const d  = await r.json()
      const items: any[] = d.data ?? []

      // Match rápido pelos campos da lista
      const quick = items.find((l: any) =>
        (eLower && (l.email?.toLowerCase() === eLower ||
          l.contacts?.some((c: any) => c.identifier?.toLowerCase() === eLower))) ||
        (ph && (l.phone?.replace(/\D/g, '') === ph ||
          l.rawPhone?.replace(/\D/g, '') === ph ||
          l.contacts?.some((c: any) => c.identifier?.replace(/\D/g, '') === ph)))
      )
      if (quick) return quick.id
      if (items.length === 1) return items[0].id

      // Múltiplos → busca detalhes individualmente (máx 8)
      for (const item of items.slice(0, 8)) {
        const ir = await dcFetch(`${BASE}/leads/${item.id}`, {}, h)
        if (!ir.ok) continue
        const l = await ir.json()
        if (
          (eLower && (l.email?.toLowerCase() === eLower ||
            l.contacts?.some((c: any) => c.identifier?.toLowerCase() === eLower))) ||
          (ph && (l.phone?.replace(/\D/g, '') === ph ||
            l.rawPhone?.replace(/\D/g, '') === ph ||
            l.contacts?.some((c: any) => c.identifier?.replace(/\D/g, '') === ph)))
        ) return l.id
      }
      return null
    }

    // ── Processa cada cliente ─────────────────────────────────────────────
    const results: any[] = []

    for (const cli of clients) {
      const email  = (cli.email  ?? '').trim().toLowerCase()
      const nome   = (cli.nome   ?? '').trim()
      const ph     = String(cli.telefone ?? '').replace(/\D/g, '')
      const pct    = cli.pct as number | null
      const newTagName = tagForPct(pct)
      const newTagId   = statusTagIds[newTagName]
      const entry: any = { email, client: nome, pct, newTag: newTagName, status: 'ok' }

      if (!email) { entry.status = 'skip'; entry.error = 'sem email'; results.push(entry); continue }
      if (!newTagId) { entry.status = 'error'; entry.error = `tag "${newTagName}" não criada`; results.push(entry); continue }

      try {
        // Busca o lead pelo nome completo, depois tenta primeiro+último nome
        let leadId = await findLead(nome, email, ph)
        if (!leadId && nome) {
          const parts = nome.split(/\s+/)
          if (parts.length >= 2) leadId = await findLead(`${parts[0]} ${parts[parts.length - 1]}`, email, ph)
        }

        if (!leadId) {
          entry.status = 'error'
          entry.error  = 'lead não encontrado no DataCrazy'
          results.push(entry)
          continue
        }
        entry.leadId = leadId

        // GET lead para pegar tags atuais
        const lRes = await dcFetch(`${BASE}/leads/${leadId}`, {}, h)
        if (!lRes.ok) {
          entry.status = 'error'; entry.error = `GET lead HTTP ${lRes.status}`
          results.push(entry); continue
        }
        const leadData = await lRes.json()
        const currentTags: any[] = leadData.tags ?? []

        // Remove as 4 tags de status, mantém o resto, adiciona nova
        const keptTags = currentTags
          .filter((t: any) => !statusIdSet.has(t.id))
          .map((t: any) => ({ id: t.id }))
        const newTags = [...keptTags, { id: newTagId }]

        const patchRes = await dcFetch(`${BASE}/leads/${leadId}`, {
          method: 'PATCH', body: JSON.stringify({ tags: newTags }),
        }, h)

        if (!patchRes.ok) {
          entry.status = 'error'; entry.error = `PATCH tags HTTP ${patchRes.status}`
        } else {
          entry.tagUpdated   = newTagName
          entry.previousTags = currentTags
            .filter((t: any) => statusIdSet.has(t.id))
            .map((t: any) => t.name)
        }

      } catch (err) {
        entry.status = 'error'
        entry.error  = `Exceção: ${String(err)}`
      }

      results.push(entry)
    }

    const stats = {
      total:         results.length,
      ok:            results.filter(r => r.status === 'ok').length,
      errors:        results.filter(r => r.status === 'error').length,
      skipped:       results.filter(r => r.status === 'skip').length,
      dentroMeta:    results.filter(r => r.newTag === 'Dentro da Meta').length,
      proximoMeta:   results.filter(r => r.newTag === 'Próximo da Meta').length,
      possivelChurn: results.filter(r => r.newTag === 'Possível Churn').length,
      churn:         results.filter(r => r.newTag === 'Churn').length,
    }

    console.log('[update-tags-gc] Concluído:', JSON.stringify(stats))
    return respond({ success: true, stats, results })

  } catch (e) {
    console.error('[update-tags-gc] Erro:', e)
    return respond({ success: false, error: String(e) })
  }
})
