// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DC_TOKEN = Deno.env.get('DATACRAZY_API_KEY') ?? ''
const DC_BASE  = 'https://api.g1.datacrazy.io/api/v1'
const headers  = { 'Authorization': `Bearer ${DC_TOKEN}`, 'Content-Type': 'application/json' }

async function getLeadByEmail(email: string): Promise<string | null> {
  try {
    const res  = await fetch(`${DC_BASE}/leads?email=${encodeURIComponent(email)}&take=1`, { headers })
    const data = await res.json()
    return data?.data?.[0]?.id ?? null
  } catch { return null }
}

async function addTagToLead(leadId: string, tagId: string): Promise<boolean> {
  try {
    const r1   = await fetch(`${DC_BASE}/leads/${leadId}`, { headers })
    const lead = await r1.json()
    const tags: { id: string }[] = lead?.tags ?? []
    if (!tags.find(t => t.id === tagId)) tags.push({ id: tagId })
    const r2 = await fetch(`${DC_BASE}/leads/${leadId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ tags }),
    })
    return r2.ok
  } catch { return false }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const body = await req.json()

    // Modo: listar tags do DataCrazy
    if (body.listar_tags) {
      const res  = await fetch(`${DC_BASE}/tags?take=100`, { headers })
      const data = await res.json()
      const tags = (data?.data ?? []).map((t: any) => ({ id: t.id, name: t.name, color: t.color }))
      return json({ tags })
    }

    // Modo: executar campanha
    const { emails, tagId, tagName } = body
    if (!emails?.length || !tagId) return json({ error: 'emails e tagId obrigatórios' }, 400)

    const resultados = { sucesso: 0, nao_encontrado: 0, erro: 0, detalhes: [] as any[] }

    // Processa em paralelo (lotes de 5 para não sobrecarregar)
    for (let i = 0; i < emails.length; i += 5) {
      const lote = emails.slice(i, i + 5)
      await Promise.all(lote.map(async (email: string) => {
        const leadId = await getLeadByEmail(email)
        if (!leadId) {
          resultados.nao_encontrado++
          resultados.detalhes.push({ email, status: 'nao_encontrado' })
          return
        }
        const ok = await addTagToLead(leadId, tagId)
        if (ok) {
          resultados.sucesso++
          resultados.detalhes.push({ email, leadId, status: 'ok' })
        } else {
          resultados.erro++
          resultados.detalhes.push({ email, leadId, status: 'erro' })
        }
      }))
    }

    return json({ total: emails.length, tagName, ...resultados })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
