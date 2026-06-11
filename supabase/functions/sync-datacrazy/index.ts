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
// Time 01 = Victor Vieira (63d33c9a) → Closer 1
// Time 02 = Wilson Neto   (c37cfdfe) → Closer 2
// Time 03 = Isaac         (92f0c8fa) → Closer 3
const TEAM_PIPELINE: Record<string, { pipelineId: string; stageId: string; label: string }> = {
  '63d33c9a-fad3-4095-8be6-39f84dda7519': {
    label:      'Time 01 → Closer 1 (Victor)',
    pipelineId: '4d88436f-d761-4e34-b974-d7890273a829',
    stageId:    'f5faf1b5-0f76-40b2-8cb3-d8c2c127595f', // Cliente Ativo
  },
  'c37cfdfe-755c-428e-b132-13fd7c90ea7b': {
    label:      'Time 02 → Closer 2 (Wilson)',
    pipelineId: '746ec7cc-ff48-4139-9b40-977e0540d875',
    stageId:    '9b8e192e-8ae9-4b08-b89f-44592c43b1bd', // Cliente Ativo
  },
  '92f0c8fa-03c6-46e5-b97a-5ef544a9e183': {
    label:      'Time 03 → Closer 3 (Isaac)',
    pipelineId: '22150736-c65d-472a-b3e8-5b14373a881c',
    stageId:    'f7f0a07f-c08b-4ee0-a731-4e76f463b52d', // Cliente Ativo
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const { name, email, phone, team_uuid, notes, image_urls, faturamento_mensal, channel, gc_gerente_id } = await req.json()

    // Mapeamento GC ID → nome do pipeline GC
    const GC_PIPELINE_BY_GERENTE: Record<string, string> = {
      '0bfe1dcb-9827-4a2a-8850-8343c53985f5': 'GC Starter',   // Carlos Eduardo
      'ea6caf80-fea1-4cd5-b7e0-6a124b783e04': 'GC Growth',    // Gabriel Bairros
      '4923ac02-3f50-49b9-8443-f7e1b0e9f6d6': 'GC Enterprise', // Rafael Mendes
    }
    const GC_ALL_PIPELINE_NAMES = ['GC Starter', 'GC Growth', 'GC Enterprise']

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

    const pipeline = TEAM_PIPELINE[team_uuid] ?? null
    if (!pipeline) {
      console.warn(`[sync-datacrazy] team_uuid não mapeado ou ausente: ${team_uuid} — pulando etapa do pipeline Closer, seguindo com lead/notas/arquivos/funil GC`)
    }

    console.log(`[sync-datacrazy] Processando: ${email} | ${pipeline ? pipeline.label : 'GC/sem time'}`)

    const h = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    // ── 1. Busca lead por email ──────────────────────────────────────────────
    let leadId: string | null = null

    if (email) {
      const r = await fetch(`${BASE}/leads?search=${encodeURIComponent(email)}&take=10`, { headers: h })
      const d = await r.json()
      const found = (d.data ?? []).find((l: any) =>
        l.email?.toLowerCase() === email.toLowerCase() ||
        l.contacts?.some((c: any) => c.identifier?.toLowerCase() === email.toLowerCase())
      )
      if (found) { leadId = found.id; console.log(`[sync-datacrazy] Lead encontrado por email: ${leadId}`) }
    }

    // ── 2. Fallback: busca por telefone (normaliza removendo DDI 55 e variações) ─
    if (!leadId && phone) {
      const rawDigits   = phone.replace(/\D/g, '')
      // Monta variantes: com DDI (55...), sem DDI, com/sem 9
      const variants = new Set<string>()
      variants.add(rawDigits)
      const sem55 = rawDigits.startsWith('55') ? rawDigits.slice(2) : rawDigits
      variants.add(sem55)
      variants.add('55' + sem55)
      // Remove o 9 extra do celular (ex: 71990900504 → 7190900504)
      if (sem55.length === 11) variants.add('55' + sem55.slice(0,2) + sem55.slice(3))

      for (const variant of variants) {
        if (leadId) break
        const r = await fetch(`${BASE}/leads?search=${encodeURIComponent(variant)}&take=10`, { headers: h })
        const d = await r.json()
        const found = (d.data ?? []).find((l: any) => {
          const lp = (l.rawPhone ?? l.phone ?? '').replace(/\D/g, '')
          return variants.has(lp)
        })
        if (found) { leadId = found.id; console.log(`[sync-datacrazy] Lead encontrado por telefone (${variant}): ${leadId}`) }
      }
    }

    // ── 2b. Fallback: busca por nome ─────────────────────────────────────────
    if (!leadId && name) {
      const firstName = name.trim().split(' ')[0]
      const r = await fetch(`${BASE}/leads?search=${encodeURIComponent(firstName)}&take=20`, { headers: h })
      const d = await r.json()
      // Só aceita se o nome completo bater (evita falsos positivos)
      const found = (d.data ?? []).find((l: any) =>
        l.name?.toLowerCase().trim() === name.toLowerCase().trim()
      )
      if (found) { leadId = found.id; console.log(`[sync-datacrazy] Lead encontrado por nome: ${leadId}`) }
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

    // ── 4. Tenta criar/mover card no pipeline do Closer (apenas se team_uuid mapeado) ─
    if (pipeline) {
      const bRes = await fetch(`${BASE}/leads/${leadId}/businesses?take=50`, { headers: h })
      const bData = await bRes.json()
      const existingBusiness = (bData.data ?? []).find(
        (b: any) => b.stage?.pipeline?.id === pipeline.pipelineId
      )

      if (existingBusiness) {
        const moveRes = await fetch(`${BASE}/businesses/${existingBusiness.id}`, {
          method: 'PATCH', headers: h,
          body: JSON.stringify({ stageId: pipeline.stageId }),
        })
        const moveBody = await moveRes.json()
        if (!moveRes.ok) {
          console.error(`[sync-datacrazy] Falha ao mover card: status=${moveRes.status}`, JSON.stringify(moveBody))
        } else {
          console.log(`[sync-datacrazy] Card existente movido para Cliente Ativo: ${existingBusiness.id}`)
        }
      } else {
        const cRes = await fetch(`${BASE}/businesses`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ leadId, stageId: pipeline.stageId }),
        })
        const created = await cRes.json()
        if (!cRes.ok) {
          console.error(`[sync-datacrazy] Falha ao criar card: status=${cRes.status}`, JSON.stringify(created))
        } else {
          console.log(`[sync-datacrazy] Novo card criado em Cliente Ativo: ${created?.id}`)
        }
      }
    }

    // ── 5. Atualiza campo "notes" do lead (quadro de notas na esquerda) ──────
    if (notes) {
      // Converte URLs soltas em markdown [url](url) para ficarem clicáveis
      const notesFormatted = notes.replace(
        /(?<![(\[])(https?:\/\/[^\s)\]]+)/g,
        (url: string) => `[${url}](${url})`
      )
      const noteRes = await fetch(`${BASE}/leads/${leadId}`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ notes: notesFormatted }),
      })
      console.log(`[sync-datacrazy] Campo notes atualizado: ${noteRes.status}`)
    }

    // ── 6. Envia arquivos para a aba Arquivos do lead ────────────────────────
    if (image_urls?.length > 0) {
      for (const url of image_urls as string[]) {
        const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'arquivo')

        // Obtém tamanho do arquivo via HEAD
        let fileSize = 0
        try {
          const headRes = await fetch(url, { method: 'HEAD' })
          fileSize = parseInt(headRes.headers.get('content-length') ?? '0', 10) || 0
        } catch { /* ignora erro de HEAD */ }

        const attRes = await fetch(`${BASE}/leads/${leadId}/attachments`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ attachmentUrl: url, fileName, fileSize }),
        })
        console.log(`[sync-datacrazy] Arquivo enviado: ${fileName} | status: ${attRes.status}`)
      }
    }

    // ── 7. Cria/move negócio no funil GC correto ────────────────────────────
    // Prioridade: gc_gerente_id > faturamento_mensal
    const gcFunnelName: string | null =
      (gc_gerente_id && GC_PIPELINE_BY_GERENTE[gc_gerente_id])
        ? GC_PIPELINE_BY_GERENTE[gc_gerente_id]
        : faturamento_mensal != null
          ? (Number(faturamento_mensal) <= 50000 ? 'GC Starter' : Number(faturamento_mensal) <= 250000 ? 'GC Growth' : 'GC Enterprise')
          : null

    if (gcFunnelName && leadId) {
      try {
        const pipRes = await fetch(`${BASE}/pipelines?take=100`, { headers: h })
        const pipData = await pipRes.json()
        const allPipelines: any[] = pipData.data ?? pipData ?? []

        const gcPipeline = allPipelines.find(
          (p: any) => p.name?.toLowerCase().includes(gcFunnelName.toLowerCase())
        )

        if (gcPipeline) {
          const stagesRes = await fetch(`${BASE}/pipelines/${gcPipeline.id}/stages?take=50`, { headers: h })
          const stagesData = await stagesRes.json()
          const stages = (stagesData.data ?? stagesData ?? []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          const firstStage = stages[0]

          if (firstStage) {
            const gcBizRes = await fetch(`${BASE}/leads/${leadId}/businesses?take=50`, { headers: h })
            const gcBizData = await gcBizRes.json()
            const allBiz: any[] = gcBizData.data ?? []

            // Negócio já no pipeline correto
            const existingCorrect = allBiz.find((b: any) => b.stage?.pipeline?.id === gcPipeline.id)

            if (existingCorrect) {
              console.log(`[sync-datacrazy] Negócio GC já existe em ${gcFunnelName}: ${existingCorrect.id}`)
            } else {
              // Remove de outros pipelines GC (evita lead duplicado em Starter e Growth ao mesmo tempo)
              const otherGcPipelines = allPipelines.filter(
                (p: any) => GC_ALL_PIPELINE_NAMES.some(n => p.name?.toLowerCase().includes(n.toLowerCase())) && p.id !== gcPipeline.id
              )
              for (const bizInWrongPipeline of allBiz.filter((b: any) => otherGcPipelines.some((p: any) => p.id === b.stage?.pipeline?.id))) {
                await fetch(`${BASE}/businesses/${bizInWrongPipeline.id}`, { method: 'DELETE', headers: h })
                console.log(`[sync-datacrazy] Negócio removido do pipeline errado: ${bizInWrongPipeline.id} (${bizInWrongPipeline.stage?.pipeline?.name})`)
              }

              const createGcRes = await fetch(`${BASE}/businesses`, {
                method: 'POST', headers: h,
                body: JSON.stringify({ leadId, stageId: firstStage.id }),
              })
              const gcBiz = await createGcRes.json()
              console.log(`[sync-datacrazy] Negócio criado em ${gcFunnelName}: ${gcBiz?.id} | stage: ${firstStage.name}`)
            }
          }
        } else {
          console.warn(`[sync-datacrazy] Funil GC não encontrado: "${gcFunnelName}"`)
        }
      } catch (gcErr) {
        console.error('[sync-datacrazy] Erro ao criar/mover negócio GC:', String(gcErr))
      }
    }

    // ── 8. Adiciona tags ao lead (canal + tier GC) ───────────────────────────
    try {
      const tagsToAdd: string[] = []
      if (channel) tagsToAdd.push(channel)
      if (faturamento_mensal != null) {
        const fat = Number(faturamento_mensal)
        tagsToAdd.push(fat <= 50000 ? 'GC Starter' : fat <= 250000 ? 'GC Growth' : 'GC Enterprise')
      }

      if (tagsToAdd.length > 0) {
        const tagsRes  = await fetch(`${BASE}/tags?take=100`, { headers: h })
        const tagsData = await tagsRes.json()
        const existingTags: Array<{ id: string; name: string }> = tagsData.data ?? tagsData ?? []

        const tagIds: string[] = []
        for (const tagName of tagsToAdd) {
          let tag = existingTags.find(t => t.name?.toLowerCase() === tagName.toLowerCase())

          if (!tag) {
            const createTagRes = await fetch(`${BASE}/tags`, {
              method: 'POST', headers: h,
              body: JSON.stringify({ name: tagName }),
            })
            const created = await createTagRes.json()
            tag = created?.id ? created : null
            if (tag) {
              existingTags.push(tag)
              console.log(`[sync-datacrazy] Tag criada: "${tagName}" → ${tag.id}`)
            } else {
              console.warn(`[sync-datacrazy] Falha ao criar tag "${tagName}":`, JSON.stringify(created))
              continue
            }
          }
          tagIds.push(tag.id)
        }

        if (tagIds.length > 0) {
          const patchRes = await fetch(`${BASE}/leads/${leadId}`, {
            method: 'PATCH', headers: h,
            body: JSON.stringify({ tags: tagIds.map(id => ({ id })) }),
          })
          console.log(`[sync-datacrazy] Tags adicionadas (${tagsToAdd.join(', ')}): ${patchRes.status}`)
        }
      }
    } catch (tagErr) {
      console.error('[sync-datacrazy] Erro ao adicionar tags:', String(tagErr))
    }

    return json({ success: true, leadId })

  } catch (e) {
    console.error('[sync-datacrazy] Erro:', e)
    return json({ success: false, error: String(e) }, 500)
  }
})
