// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ME_API = 'https://www.melhorenvio.com.br/api/v2/me'
const ME_TOKEN       = Deno.env.get('ME_TOKEN')          ?? ''
const ME_FROM_NAME   = Deno.env.get('ME_FROM_NAME')      ?? 'Cakto'
const ME_FROM_EMAIL  = Deno.env.get('ME_FROM_EMAIL')     ?? ''
const ME_FROM_DOC    = Deno.env.get('ME_FROM_DOCUMENT')  ?? ''
const ME_FROM_PHONE  = Deno.env.get('ME_FROM_PHONE')     ?? ''
const ME_FROM_POSTAL = Deno.env.get('ME_FROM_POSTAL_CODE') ?? ''
const ME_FROM_ADDR   = Deno.env.get('ME_FROM_ADDRESS')   ?? ''
const ME_FROM_NUM    = Deno.env.get('ME_FROM_NUMBER')    ?? ''
const ME_FROM_DIST   = Deno.env.get('ME_FROM_DISTRICT')  ?? ''
const ME_FROM_CITY   = Deno.env.get('ME_FROM_CITY')      ?? ''
const ME_FROM_STATE  = Deno.env.get('ME_FROM_STATE')     ?? ''

const SB_URL = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ME_HEADERS = {
  'Authorization': `Bearer ${ME_TOKEN}`,
  'Content-Type':  'application/json',
  'Accept':        'application/json',
  'User-Agent':    'cakto-sistema-comercial (melhorenviocakto@gmail.com)',
}

const SB_HEADERS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
}

// Map ME order status → our system status
const ME_STATUS_MAP: Record<string, string> = {
  'delivered':            'Entregue',
  'posted':               'Em Trânsito',
  'in_transit':           'Em Trânsito',
  'delivered_to_agency':  'Em Trânsito',
  'with_carrier':         'Em Trânsito',
  'out_for_delivery':     'Em Trânsito',
  'released':             'Em Trânsito',
  'canceled':             'Cancelado',
  'pending':              'No Carrinho',
  'unpaid':               'No Carrinho',
}

async function meJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: ME_HEADERS, ...opts })
  const text = await res.text()
  try { return { status: res.status, data: JSON.parse(text) } }
  catch { return { status: res.status, data: null, raw: text.slice(0, 300) } }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!ME_TOKEN) {
    return new Response(JSON.stringify({ error: 'ME_TOKEN não configurado.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, payload = {} } = await req.json() as { action: string; payload?: Record<string, unknown> }

    // ── 1. Adicionar ao carrinho ─────────────────────────────────────────────
    if (action === 'cart') {
      const fromAddr = {
        name:        ME_FROM_NAME,
        email:       ME_FROM_EMAIL,
        document:    ME_FROM_DOC,
        phone:       ME_FROM_PHONE  || undefined,
        postal_code: ME_FROM_POSTAL || undefined,
        address:     ME_FROM_ADDR   || undefined,
        number:      ME_FROM_NUM    || undefined,
        district:    ME_FROM_DIST   || undefined,
        city:        ME_FROM_CITY   || undefined,
        state_abbr:  ME_FROM_STATE  || undefined,
        country_id:  'BR',
      }

      // Cota frete e escolhe o mais barato entre Correios (id=1) e Jadlog (id=2)
      const toPostal  = (payload.to as Record<string, string>)?.postal_code ?? ''
      const volumes   = (payload.volumes as Record<string, number>[]) ?? [{ height: 18, width: 30, length: 35, weight: 3 }]
      const calcPayload = {
        from: { postal_code: ME_FROM_POSTAL },
        to:   { postal_code: toPostal },
        volumes,
      }

      let serviceId = 1 // fallback: PAC Correios
      try {
        const { status: calcStatus, data: calcData } = await meJson(`${ME_API}/shipment/calculate`, {
          method: 'POST',
          body:   JSON.stringify(calcPayload),
        })
        if (calcStatus === 200 && Array.isArray(calcData)) {
          // Apenas Correios (id=1) e Jadlog (id=2), sem erro, ordenados pelo menor preço
          const eligible = (calcData as Record<string, unknown>[])
            .filter(s => !s.error && s.price != null &&
              ((s.company as Record<string, unknown>)?.id === 1 || (s.company as Record<string, unknown>)?.id === 2))
            .sort((a, b) => parseFloat(String(a.price)) - parseFloat(String(b.price)))
          if (eligible.length > 0) {
            const cheapest = eligible[0]
            serviceId = cheapest.id as number
            console.log(`[cart] serviço mais barato: id=${serviceId} price=${cheapest.price} company=${(cheapest.company as Record<string, unknown>)?.name}`)
          } else {
            console.warn('[cart] nenhum serviço elegível — usando fallback PAC (id=1)')
          }
        } else {
          console.warn(`[cart] calculadora retornou ${calcStatus} — usando fallback PAC (id=1)`)
        }
      } catch (e) {
        console.error('[cart] erro na cotação:', e, '— usando fallback PAC (id=1)')
      }

      const cartPayload = {
        ...payload,
        service: serviceId,
        from:    fromAddr,
      }
      const { status, data } = await meJson(`${ME_API}/cart`, {
        method: 'POST',
        body:   JSON.stringify(cartPayload),
      })
      if (status >= 400) console.error(`[cart] ME ${status}:`, JSON.stringify(data))
      return new Response(JSON.stringify(data), {
        status, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Sincronização individual (por me_cart_id com fallback por CPF) ─────
    if (action === 'sync-tracking') {
      const { me_cart_id, document, product_hint } = payload as { me_cart_id?: string; document?: string; product_hint?: string }
      const sanitizeDoc = (v: unknown): string => v ? String(v).replace(/\D/g, '') : ''
      const cleanCartId   = (me_cart_id    ?? '').trim()
      const cleanDoc      = sanitizeDoc(document)
      const cleanHint     = (product_hint  ?? '').toLowerCase().trim()

      console.log(`[sync-tracking] recebido me_cart_id="${cleanCartId}" document="${cleanDoc}"`)

      // Guard: precisa de pelo menos um dos dois
      if (!cleanCartId && !cleanDoc) {
        return new Response(JSON.stringify({ found: false, error: 'Informe me_cart_id ou document (CPF)' }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Caminho A: temos me_cart_id — tenta via /shipment/tracking
      if (cleanCartId) {
        const { status: tStatus, data: tData } = await meJson(`${ME_API}/shipment/tracking`, {
          method: 'POST',
          body:   JSON.stringify({ orders: [cleanCartId] }),
        })
        console.log(`[sync-tracking] /shipment/tracking HTTP ${tStatus}:`, JSON.stringify(tData)?.slice(0, 300))

        if (tStatus === 200 && tData && typeof tData === 'object') {
          const entry = (tData as Record<string, unknown>)[cleanCartId] as Record<string, unknown> | undefined
          if (entry) {
            // Prefere tracking oficial; fallback para melhorenvio_tracking (etiqueta gerada mas não paga)
            const tracking = entry.tracking
              ? String(entry.tracking)
              : (entry.melhorenvio_tracking ? String(entry.melhorenvio_tracking) : '')
            const meStatus = ME_STATUS_MAP[String(entry.status ?? '')] ?? 'Em Trânsito'
            // Só retorna do Caminho A se tiver tracking; senão cai no B para buscar via CPF nos orders
            if (tracking) {
              return new Response(JSON.stringify({ found: true, me_cart_id: cleanCartId, tracking, status: meStatus }), {
                status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
              })
            }
            console.warn('[sync-tracking] entry encontrado mas sem tracking — fallback por CPF nos orders')
          } else {
            console.warn('[sync-tracking] me_cart_id ausente na resposta do ME — fallback por CPF')
          }
        } else {
          console.warn(`[sync-tracking] /shipment/tracking retornou ${tStatus} — fallback por CPF`)
        }
      }

      // Caminho B: sem me_cart_id OU Caminho A não encontrou tracking → busca nos orders por documento
      if (!cleanDoc) {
        console.warn('[sync-tracking] sem documento para fallback — reset')
        return new Response(JSON.stringify({ found: false, reset: !!cleanCartId }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Filtra por status que têm etiqueta gerada/postada para cobrir pedidos antigos
      const statusFilter = ['released', 'released_waiting', 'posted', 'in_transit', 'delivered', 'delivered_to_agency', 'with_carrier', 'out_for_delivery']
        .map(s => `status[]=${s}`).join('&')
      console.log(`[sync-tracking] fallback por documento: ${cleanDoc}`)
      const pages = await Promise.all([1, 2, 3].map(page =>
        meJson(`${ME_API}/orders?per_page=100&page=${page}&orderBy=created_at&sortedBy=desc&${statusFilter}`)
      ))
      const orders = pages.flatMap(p => p.data?.data ?? []) as Record<string, unknown>[]
      console.log(`[sync-tracking] varredura com filtro de status: ${orders.length} pedidos`)

      const cpfOrders = orders.filter(o =>
        sanitizeDoc((o.to as Record<string, unknown>)?.document) === cleanDoc
      )

      let match: Record<string, unknown> | undefined

      if (cpfOrders.length === 0) {
        console.log(`[sync-tracking] nenhum match para doc=${cleanDoc}`)
        return new Response(JSON.stringify({ found: false, reset: !!cleanCartId }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      } else if (cpfOrders.length === 1 || !cleanHint) {
        // Um único pedido ou sem hint de dimensão → pega o primeiro (mais recente)
        match = cpfOrders[0]
      } else {
        // Múltiplos pedidos com mesmo CPF — usa product_hint para desempate
        const DIMENSION_KEYS = ['100k', '250k', '500k', '1m', '2m', '5m', '10m']
        const scored = cpfOrders.map(o => {
          const prodNames = Array.isArray(o.products)
            ? (o.products as Record<string, unknown>[]).map(p => String(p.name ?? '').toLowerCase()).join(' ')
            : ''
          const meDim = DIMENSION_KEYS.find(k => prodNames.includes(k)) ?? ''
          return { o, score: (meDim && meDim === cleanHint) ? 2 : 1 }
        }).sort((a, b) => b.score - a.score)
        match = scored[0].o
        console.log(
          `[sync-tracking] CPF multi-order: ${cpfOrders.length} pedidos, hint="${cleanHint}", ` +
          `picked id=${match.id} score=${scored[0].score}`
        )
      }

      if (!match) {
        return new Response(JSON.stringify({ found: false, reset: !!cleanCartId }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      const tracking = match.tracking
        ? String(match.tracking)
        : (match.melhorenvio_tracking ? String(match.melhorenvio_tracking) : '')
      const meStatus = ME_STATUS_MAP[String(match.status ?? '')] ?? 'Em Trânsito'
      console.log(`[sync-tracking] MATCH doc=${cleanDoc} id=${match.id} track=${tracking || '(vazio)'} status=${meStatus}`)

      return new Response(JSON.stringify({
        found:      true,
        me_cart_id: String(match.id ?? ''),
        tracking,
        status:     meStatus,
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ── 3. Sincronização retroativa em massa (force-sync + combos) ───────────
    if (action === 'sync-bulk') {
      const sanitizeDoc = (v: unknown): string => v ? String(v).replace(/\D/g, '') : ''
      // Regex para extrair dimensão do nome do produto (ex: "Placa 100K" → "100K")
      const DIMENSION_RE = /(10k|50k|100k|250k|500k|1m|2m|5m|10m)/i

      // Busca 3 páginas × 100 = até 300 pedidos no ME (mais recentes primeiro)
      const pages = await Promise.all([1, 2, 3].map(page =>
        meJson(`${ME_API}/orders?per_page=100&page=${page}&orderBy=created_at&sortedBy=desc`)
      ))
      const orders: unknown[] = pages.flatMap(p => p.data?.data ?? [])

      if (orders.length === 0) {
        return new Response(JSON.stringify({ updated: 0, total: 0 }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Force-sync: todas as submissions, ordenadas da mais antiga para a mais nova.
      // Ordenação ASC garante que, quando houver múltiplos candidatos com mesma dimensão,
      // o sistema sempre preenche o registro mais antigo pendente primeiro.
      const subsRes = await fetch(
        `${SB_URL}/rest/v1/form_submissions?select=id,data,me_cart_id,status,tracking_code,submitted_at&order=submitted_at.asc`,
        { headers: SB_HEADERS }
      )
      const subsText = await subsRes.text()
      let submissions: Array<{
        id: string; data: Record<string, string>; me_cart_id: string
        status: string; tracking_code: string; submitted_at: string
      }> = []
      try { submissions = JSON.parse(subsText) } catch { console.error('[sync-bulk] parse subs error:', subsText.slice(0, 300)) }

      const sampleME    = (orders[0] as Record<string, unknown>)
      const sampleDB    = submissions[0]
      const sampleMEDoc = sanitizeDoc((sampleME?.to as Record<string, unknown>)?.document)
      console.log(`[sync-bulk] ${orders.length} orders ME | ${submissions.length} submissions no DB`)
      console.log('[sync-bulk] Exemplo ME doc:', sampleMEDoc)
      console.log('[sync-bulk] Exemplo DB data keys:', Object.keys(sampleDB?.data ?? {}))

      let updated = 0

      for (const order of orders) {
        const o        = order as Record<string, unknown>
        const meId     = String(o.id ?? '')
        const track    = o.tracking
          ? String(o.tracking)
          : (o.melhorenvio_tracking ? String(o.melhorenvio_tracking) : '')
        const meStatus = ME_STATUS_MAP[String(o.status ?? '')] ?? 'Em Trânsito'
        const meDoc    = sanitizeDoc((o.to as Record<string, unknown>)?.document)
        const meEmail  = String((o.to as Record<string, unknown>)?.email ?? '').toLowerCase().trim()
        const meTagId  = Array.isArray(o.tags) ? String((o.tags as unknown[])[0] ?? '') : ''

        if (!meDoc && !meEmail) continue

        // Loop sobre produtos da etiqueta.
        // Combos (N prêmios na mesma caixa) têm múltiplos itens → N updates com o mesmo tracking.
        // Envios simples têm 1 item; fallback [{ name: '' }] trata pedidos sem products.
        const products = Array.isArray(o.products) && (o.products as unknown[]).length > 0
          ? (o.products as Record<string, unknown>[])
          : [{ name: '' }]

        for (const product of products) {
          const productName = String(product.name ?? '')
          // Extrai dimensão via regex e normaliza para MAIÚSCULO (ex: "100K", "250K")
          const dimension = productName.match(DIMENSION_RE)?.[0]?.toUpperCase() ?? ''

          let match: typeof submissions[0] | undefined

          // Tier 1: me_cart_id exato (criado pelo nosso addToCart)
          match = submissions.find(sub =>
            sub.me_cart_id && sub.me_cart_id === meId && sub.status !== 'Entregue'
          )

          // Tier 2: tag UUID injetada no addToCart (tags[0] = submission.id)
          if (!match && meTagId) {
            match = submissions.find(sub =>
              sub.id === meTagId && sub.status !== 'Entregue'
            )
          }

          // Tier 3: CPF ou email + dimensão do produto + mais antiga pendente primeiro
          if (!match) {
            // Candidatos: batem por CPF ou email; excluem status "Entregue" (já concluídos)
            // Array já está em ASC por submitted_at → candidates[0] = mais antigo
            const candidates = submissions.filter(sub => {
              if (sub.status === 'Entregue') return false
              const vals = Object.values(sub.data)
              const byCpf   = meDoc  && vals.some(v => sanitizeDoc(v) === meDoc)
              const byEmail = meEmail && vals.some(v => String(v).toLowerCase() === meEmail)
              return byCpf || byEmail
            })

            if (candidates.length > 0) {
              if (dimension) {
                // Filtra pelos que confirmam a dimensão do produto ME
                const withDim = candidates.filter(sub =>
                  Object.values(sub.data).some(v =>
                    String(v).toUpperCase().includes(dimension)
                  )
                )
                // Pega o mais antigo que confirma dimensão; se nenhum confirma, pega o mais antigo geral
                match = (withDim.length > 0 ? withDim : candidates)[0]
                if (withDim.length === 0 && candidates.length > 1) {
                  console.warn(
                    `[sync-bulk] nenhum candidato confirma dimension="${dimension}" para meId=${meId} ` +
                    `— usando o mais antigo pendente (${candidates.length} candidatos)`
                  )
                }
              } else {
                // Sem dimensão no produto ME → mais antigo pendente
                match = candidates[0]
              }
              if (candidates.length > 1) {
                console.log(
                  `[sync-bulk] Tier3 multi-match (${candidates.length} candidatos) ` +
                  `dimension="${dimension}" meEmail="${meEmail}" → picked id=${match!.id}`
                )
              }
            }
          }

          if (!match) continue

          // Force-sync: UPDATE exclusivamente pelo PK (id)
          const prevTrack = match.tracking_code || '(vazio)'
          console.log(
            `[sync-bulk] FORCE UPDATE PK id=${match.id} | product="${productName}" | ` +
            `dimension="${dimension}" | track: ${prevTrack} → ${track || '(sem track)'}`
          )

          const patch: Record<string, string> = { me_cart_id: meId, status: meStatus }
          if (track) patch.tracking_code = track

          const patchRes = await fetch(
            `${SB_URL}/rest/v1/form_submissions?id=eq.${match.id}`,
            {
              method:  'PATCH',
              headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
              body:    JSON.stringify(patch),
            }
          )
          if (patchRes.ok) {
            updated++
            submissions.splice(submissions.indexOf(match), 1)
          } else {
            console.error(`[sync-bulk] PATCH falhou id=${match.id}:`, await patchRes.text())
          }
        }
      }

      console.log(`[sync-bulk] ${orders.length} orders ME → ${updated} updates`)

      // Se nenhum match, devolve amostra para diagnóstico no frontend
      if (updated === 0) {
        return new Response(JSON.stringify({
          updated: 0,
          total: orders.length,
          debug: {
            pendingDbCount: submissions.length,
            subsHttpStatus: subsRes.status,
            meCPF:        sampleMEDoc,
            meStatus:     String((sampleME as Record<string, unknown>)?.status ?? ''),
            dbRowKeys:    Object.keys(sampleDB ?? {}),
            dbDataKeys:   Object.keys(sampleDB?.data ?? {}),
            dbDataValues: Object.values(sampleDB?.data ?? {}).slice(0, 5),
            dbRowFull:    sampleDB,
          },
        }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ updated, total: orders.length }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `action inválida: ${action}` }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('me-proxy erro:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
