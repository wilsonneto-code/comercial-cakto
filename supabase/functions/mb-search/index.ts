// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GERENTES: Record<number, string> = {
  4204072: 'Rafael Mendes',
  5267370: 'Carlos Eduardo',
  5726885: 'Gabriel Bairros',
}

const DB_ID = 3

async function runSQL(mbUrl: string, mbKey: string, sql: string) {
  const res = await fetch(`${mbUrl}/api/dataset`, {
    method: 'POST',
    headers: { 'x-api-key': mbKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ database: DB_ID, type: 'native', native: { query: sql } }),
  })
  const data = await res.json()
  return {
    cols: data?.data?.cols?.map((c: any) => c.name) ?? [],
    rows: data?.data?.rows ?? [],
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const MB_URL = Deno.env.get('METABASE_URL') ?? ''
  const MB_KEY = Deno.env.get('METABASE_API_KEY') ?? ''
  const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  const body = await req.json().catch(() => ({}))

  // ── Modo: TPV diário por mês (para gráfico de crescimento) ─────────────
  if (body.daily_tpv && body.month) {
    const [y, m] = (body.month as string).split('-')
    const inicio = `${y}-${m}-01`
    const fim    = `${y}-${m}-31`
    const ids: number[] = Array.isArray(body.account_manager_ids) && body.account_manager_ids.length
      ? body.account_manager_ids
      : Object.keys(GERENTES).map(Number)
    const amList = ids.join(',')

    const sql = `
      SELECT
        DATE(p."paidAt") AS dia,
        COALESCE(SUM(p."liquidAmount"), 0) AS tpv_dia
      FROM "public"."payment_payment" p
      JOIN "public"."user_userportfolio" up ON up."user_id" = p."user_id"
      WHERE up."account_manager_id" IN (${amList})
        AND p."status" = 'paid'
        AND DATE(p."paidAt") >= '${inicio}'
        AND DATE(p."paidAt") <= '${fim}'
      GROUP BY DATE(p."paidAt")
      ORDER BY dia
    `
    const { rows } = await runSQL(MB_URL, MB_KEY, sql)
    const daily: Record<string, number> = {}
    rows.forEach((r: any[]) => {
      if (r[0]) daily[String(r[0]).slice(0, 10)] = Number(r[1] ?? 0)
    })
    return json({ daily })
  }

  // ── Modo: buscar user_id por email em qualquer banco ────────────────────
  if (body.get_user_id && body.debug_email) {
    const dbId  = Number(body.db_id)
    const email = body.debug_email.toLowerCase().replace(/'/g, "''")
    const res   = await fetch(`${MB_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: dbId, type: 'native', native: {
        query: `SELECT id FROM "public"."user_user" WHERE LOWER(email) = '${email}' LIMIT 1`
      }}),
    })
    const data = await res.json()
    const userId = data?.data?.rows?.[0]?.[0] ?? null
    return json({ db_id: dbId, user_id: userId })
  }

  // ── Modo: listar bancos disponíveis no Metabase ─────────────────────────
  if (body.list_databases) {
    const res = await fetch(`${MB_URL}/api/database`, {
      headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    const dbs = (data?.data ?? data ?? []).map((d: any) => ({
      id: d.id, name: d.name, engine: d.engine,
    }))
    return json({ databases: dbs })
  }

  // ── Modo: testar query em banco específico ───────────────────────────────
  if (body.test_db && body.debug_email) {
    const dbId  = Number(body.test_db)
    const email = body.debug_email.toLowerCase().replace(/'/g, "''")
    const sql = `
      SELECT u."id", u."email",
        COUNT(p."id") AS total_payments,
        COUNT(p."id") FILTER (WHERE p."status" = 'paid') AS paid_count,
        SUM(p."liquidAmount") FILTER (WHERE p."status" = 'paid') AS total_liquid,
        MIN(DISTINCT p."status") AS sample_status
      FROM "public"."user_user" u
      LEFT JOIN "public"."payment_payment" p ON p."user_id" = u."id"
      WHERE LOWER(u."email") = '${email}'
      GROUP BY u."id", u."email"
    `
    const res = await fetch(`${MB_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: dbId, type: 'native', native: { query: sql } }),
    })
    const data = await res.json()
    return json({
      db_id: dbId,
      cols: data?.data?.cols?.map((c: any) => c.name) ?? [],
      rows: data?.data?.rows ?? [],
      error: data?.error ?? null,
    })
  }

  // ── Modo: todos os status de um usuário (por user_id) ────────────────────
  if (body.all_statuses && body.user_id) {
    const userId = Number(body.user_id)
    const dbId   = Number(body.db_id ?? DB_ID)
    const sql = `
      SELECT
        p."status",
        COUNT(*) AS count,
        SUM(p."liquidAmount") AS total_liquid,
        SUM(p."amount") AS total_amount,
        MIN(p."createdAt") AS first_date,
        MAX(p."createdAt") AS last_date
      FROM "public"."payment_payment" p
      WHERE p."user_id" = ${userId}
      GROUP BY p."status"
      ORDER BY count DESC
    `
    const res = await fetch(`${MB_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: dbId, type: 'native', native: { query: sql } }),
    })
    const data = await res.json()
    return json({ cols: data?.data?.cols?.map((c: any) => c.name) ?? [], rows: data?.data?.rows ?? [], error: data?.error ?? null })
  }

  // ── Modo: listar tabelas de um banco ─────────────────────────────────────
  if (body.list_tables) {
    const dbId = Number(body.db_id)
    const sql  = `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name LIMIT 80`
    const res  = await fetch(`${MB_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: dbId, type: 'native', native: { query: sql } }),
    })
    const data = await res.json()
    return json({ cols: data?.data?.cols?.map((c: any) => c.name) ?? [], rows: data?.data?.rows ?? [], error: data?.error ?? null })
  }

  // ── Modo: buscar pagamentos por user_id em tabelas do banco Cakto #4 ─────
  if (body.explore_payments_cakto) {
    const userId = Number(body.user_id)
    const dbId   = Number(body.db_id ?? 4)

    async function runQ(sql: string) {
      const r = await fetch(`${MB_URL}/api/dataset`, {
        method: 'POST',
        headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: dbId, type: 'native', native: { query: sql } }),
      })
      const d = await r.json()
      return { cols: d?.data?.cols?.map((c: any) => c.name) ?? [], rows: d?.data?.rows ?? [], error: d?.error ?? null }
    }

    const results: any[] = []

    // 1. vendas_por_usuario — busca por email direto
    const vendasByEmail = await runQ(`SELECT * FROM "public"."vendas_por_usuario" WHERE email ILIKE '${body.debug_email?.toLowerCase() ?? ''}' LIMIT 10`)
    if (!vendasByEmail.error && vendasByEmail.rows.length > 0)
      results.push({ table: 'vendas_por_usuario (por email)', note: '✓ encontrado por email', ...vendasByEmail })
    else
      results.push({ table: 'vendas_por_usuario', note: `email não encontrado nesta view`, cols: vendasByEmail.cols, rows: [] })

    // 2. Definição da view vendas_por_usuario (para entender a origem dos dados)
    const viewDef = await runQ(`SELECT pg_get_viewdef('public.vendas_por_usuario', true) AS definition`)
    if (!viewDef.error && viewDef.rows.length > 0)
      results.push({ table: 'vendas_por_usuario (SQL da view)', note: 'definição completa', cols: viewDef.cols, rows: viewDef.rows })

    // 3. gateway_split — tabela de divisão de receita (coprodução)
    const gsSample2 = await runQ(`SELECT * FROM "public"."gateway_split" LIMIT 1`)
    results.push({ table: 'gateway_split (colunas)', note: `colunas: ${gsSample2.cols.join(', ')}`, cols: gsSample2.cols, rows: gsSample2.rows })

    // 3b. Busca splits dos pedidos dos produtos afiliados dela (PAID no mês atual)
    const afilSplitCheck = await runQ(`
      SELECT
        go.id AS order_id, go.status, go.amount, go.created_at,
        pa.product_id, pa.commission,
        gs.id AS split_id, gs.user_id AS split_user_id, gs.percentage, gs.amountreserve, gs.type
      FROM "public"."product_affiliate" pa
      JOIN "public"."gateway_order" go ON go."product_id"::text = pa."product_id"::text
      LEFT JOIN "public"."gateway_split" gs ON gs."order_id"::text = go."id"::text
      WHERE pa."user_id" = ${userId}
        AND pa."status" = 'active'
        AND go."status" = 'paid'
      ORDER BY go."created_at" DESC
      LIMIT 10
    `)
    results.push({ table: 'affiliate splits (paid orders do mês)', note: 'verifica join gateway_split', ...afilSplitCheck })

    // 3c. Conta quantos pedidos pagos existem para os produtos afiliados dela (todos os períodos)
    const afilCount = await runQ(`
      SELECT COUNT(*) as total_orders, SUM(go.amount) as total_amount,
        MIN(go.created_at) as first_order, MAX(go.created_at) as last_order
      FROM "public"."product_affiliate" pa
      JOIN "public"."gateway_order" go ON go."product_id"::text = pa."product_id"::text
      WHERE pa."user_id" = ${userId} AND pa."status" = 'active' AND go."status" = 'paid'
    `)
    results.push({ table: 'total pedidos pagos (afiliados, histórico)', note: 'sem filtro de mês', ...afilCount })

    // Tenta buscar split por user_id com vários campos possíveis
    for (const field of ['user_id', 'recipient_id', 'co_producer_id', 'seller_id', 'beneficiary_id']) {
      if (!gsSample2.cols.includes(field)) continue
      const r = await runQ(`
        SELECT gs.status, COUNT(*) as count, SUM(gs.amount) as total
        FROM "public"."gateway_split" gs
        WHERE gs."${field}" = ${userId}
        GROUP BY gs.status
      `)
      if (!r.error && r.rows.length > 0) {
        results.push({ table: `gateway_split (por ${field})`, note: `✓ encontrou dados de split!`, ...r })
      }
    }

    // 4. product_affiliate — pode conter a relação de coprodução
    const afSample = await runQ(`SELECT * FROM "public"."product_affiliate" LIMIT 1`)
    results.push({ table: 'product_affiliate (colunas)', note: `colunas: ${afSample.cols.join(', ')}`, cols: afSample.cols, rows: afSample.rows })

    for (const field of ['user_id', 'affiliate_id', 'co_producer_id', 'member_id']) {
      if (!afSample.cols.includes(field)) continue
      const r = await runQ(`SELECT * FROM "public"."product_affiliate" WHERE "${field}" = ${userId} LIMIT 5`)
      if (!r.error && r.rows.length > 0) {
        results.push({ table: `product_affiliate (por ${field})`, note: '✓ encontrou registro!', ...r })
      }
    }

    // 2. gateway_order — orders diretos
    const goSample = await runQ(`SELECT * FROM "public"."gateway_order" LIMIT 1`)
    const goCols = goSample.cols
    const goUserField = ['user_id','buyer_id','customer_id'].find(f => goCols.includes(f))
    if (goUserField) {
      const go = await runQ(`SELECT status, COUNT(*) as count, SUM(amount) as total FROM "public"."gateway_order" WHERE "${goUserField}" = ${userId} GROUP BY status`)
      if (!go.error) results.push({ table: 'gateway_order', note: `por ${goUserField}`, ...go })
    } else {
      results.push({ table: 'gateway_order (colunas)', note: 'sem user_id conhecido — mostra colunas', cols: goCols, rows: goSample.rows })
    }

    // 3. gateway_payment_orders
    const gpSample = await runQ(`SELECT * FROM "public"."gateway_payment_orders" LIMIT 1`)
    const gpCols = gpSample.cols
    const gpUserField = ['user_id','buyer_id','customer_id','order_id'].find(f => gpCols.includes(f))
    if (gpUserField) {
      const gp = await runQ(`SELECT status, COUNT(*) as count, SUM(amount) as total FROM "public"."gateway_payment_orders" WHERE "${gpUserField}" = ${userId} GROUP BY status`)
      if (!gp.error) results.push({ table: 'gateway_payment_orders', note: `por ${gpUserField}`, ...gp })
    } else {
      results.push({ table: 'gateway_payment_orders (colunas)', note: 'sem user_id — mostra colunas', cols: gpCols, rows: gpSample.rows })
    }

    // 4. gateway_subscription
    const gsSample = await runQ(`SELECT * FROM "public"."gateway_subscription" LIMIT 1`)
    const gsCols = gsSample.cols
    const gsUserField = ['user_id','subscriber_id','customer_id'].find(f => gsCols.includes(f))
    if (gsUserField) {
      const gs = await runQ(`SELECT status, COUNT(*) as count, SUM(amount) as total FROM "public"."gateway_subscription" WHERE "${gsUserField}" = ${userId} GROUP BY status`)
      if (!gs.error) results.push({ table: 'gateway_subscription', note: `por ${gsUserField}`, ...gs })
    } else {
      results.push({ table: 'gateway_subscription (colunas)', note: 'mostra colunas', cols: gsCols, rows: gsSample.rows })
    }

    return json({ results })
  }

  // ── Modo: exploração profunda — listar tabelas e buscar pagamentos ────────
  if (body.deep_explore && body.debug_email) {
    const email  = body.debug_email.toLowerCase().replace(/'/g, "''")
    const dbIds  = [3, 4]
    const report: any[] = []

    for (const dbId of dbIds) {
      // 1. Lista todas as tabelas
      const tablesRes = await fetch(`${MB_URL}/api/dataset`, {
        method: 'POST',
        headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: dbId, type: 'native', native: { query: `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name` } }),
      })
      const tablesData = await tablesRes.json()
      const tables: string[][] = tablesData?.data?.rows ?? []
      report.push({ dbId, type: 'tables', tables: tables.map(r => `${r[0]}.${r[1]}`) })

      // 2. Para cada tabela que tem "email" ou "user" no nome, tenta buscar o email
      const emailTables = tables.filter(r => {
        const name = (r[1] ?? '').toLowerCase()
        return name.includes('user') || name.includes('customer') || name.includes('client') || name.includes('subscriber') || name.includes('member')
      })
      for (const [schema, table] of emailTables.slice(0, 8)) {
        const searchRes = await fetch(`${MB_URL}/api/dataset`, {
          method: 'POST',
          headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ database: dbId, type: 'native', native: { query: `SELECT * FROM "${schema}"."${table}" WHERE email ILIKE '${email}' LIMIT 3` } }),
        })
        const sd = await searchRes.json()
        if (!sd?.error && (sd?.data?.rows?.length ?? 0) > 0) {
          report.push({ dbId, type: 'found_user', table: `${schema}.${table}`, cols: sd.data.cols.map((c: any) => c.name), rows: sd.data.rows })
        }
      }

      // 3. Para tabelas de pagamento, busca por user_id da Roniaria (1247735)
      const payTables = tables.filter(r => {
        const name = (r[1] ?? '').toLowerCase()
        return name.includes('payment') || name.includes('order') || name.includes('transaction') || name.includes('sale') || name.includes('subscription') || name.includes('invoice') || name.includes('charge') || name.includes('purchase')
      })
      for (const [schema, table] of payTables.slice(0, 10)) {
        // Tenta por user_id e por email direto
        const queries = [
          `SELECT status, SUM(amount) as total, COUNT(*) as count FROM "${schema}"."${table}" WHERE user_id = 1247735 GROUP BY status`,
          `SELECT status, SUM(value) as total, COUNT(*) as count FROM "${schema}"."${table}" WHERE user_id = 1247735 GROUP BY status`,
          `SELECT status, COUNT(*) as count FROM "${schema}"."${table}" WHERE email ILIKE '${email}' GROUP BY status`,
        ]
        for (const sql of queries) {
          const r2 = await fetch(`${MB_URL}/api/dataset`, {
            method: 'POST',
            headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ database: dbId, type: 'native', native: { query: sql } }),
          })
          const d2 = await r2.json()
          if (!d2?.error && (d2?.data?.rows?.length ?? 0) > 0) {
            report.push({ dbId, type: 'found_payments', table: `${schema}.${table}`, cols: d2.data.cols.map((c: any) => c.name), rows: d2.data.rows, sql })
          }
        }
      }
    }
    return json({ report })
  }

  // ── Modo: buscar usuário por email em banco genérico (tabelas flexíveis) ──
  if (body.find_user && body.debug_email) {
    const dbId  = Number(body.db_id ?? 4)
    const email = body.debug_email.toLowerCase().replace(/'/g, "''")
    // Tenta várias combinações de tabelas comuns em plataformas de pagamento
    const queries = [
      `SELECT id, email, name FROM public.users WHERE LOWER(email) = '${email}' LIMIT 5`,
      `SELECT id, email FROM public.customers WHERE LOWER(email) = '${email}' LIMIT 5`,
      `SELECT id, email FROM public.user WHERE LOWER(email) = '${email}' LIMIT 5`,
      `SELECT id, email FROM public.accounts WHERE LOWER(email) = '${email}' LIMIT 5`,
    ]
    const results: any[] = []
    for (const sql of queries) {
      const res  = await fetch(`${MB_URL}/api/dataset`, {
        method: 'POST',
        headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: dbId, type: 'native', native: { query: sql } }),
      })
      const data = await res.json()
      if (!data?.error && data?.data?.rows?.length > 0) {
        results.push({ sql, cols: data.data.cols.map((c: any) => c.name), rows: data.data.rows })
      }
    }
    return json({ db_id: dbId, results })
  }

  // ── Modo debug: inspecionar pagamentos brutos de um email ───────────────
  if (body.debug_email) {
    const email = body.debug_email.toLowerCase().replace(/'/g, "''")
    // Mostra estatísticas agregadas + últimos pagamentos
    const sqlStats = `
      SELECT
        u."id", u."email",
        COUNT(p."id") AS total_payments,
        COUNT(p."id") FILTER (WHERE LOWER(p."status") IN ('paid','approved','completed','pago')) AS paid_count,
        SUM(p."liquidAmount") FILTER (WHERE LOWER(p."status") IN ('paid','approved','completed','pago')) AS total_liquid,
        SUM(p."amount") FILTER (WHERE LOWER(p."status") IN ('paid','approved','completed','pago')) AS total_amount,
        MIN(p."status") AS sample_status,
        MAX(COALESCE(p."paidAt",p."createdAt")) AS last_date,
        COUNT(p."paidAt") AS count_with_paidAt,
        COUNT(p."createdAt") AS count_with_createdAt
      FROM "public"."user_user" u
      LEFT JOIN "public"."payment_payment" p ON p."user_id" = u."id"
      WHERE LOWER(u."email") = '${email}'
      GROUP BY u."id", u."email"
    `
    const sqlSample = `
      SELECT p."status", p."liquidAmount", p."amount", p."paidAt", p."createdAt"
      FROM "public"."user_user" u
      JOIN "public"."payment_payment" p ON p."user_id" = u."id"
      WHERE LOWER(u."email") = '${email}'
      ORDER BY COALESCE(p."paidAt",p."createdAt") DESC NULLS LAST
      LIMIT 10
    `
    const [stats, sample] = await Promise.all([
      runSQL(MB_URL, MB_KEY, sqlStats),
      runSQL(MB_URL, MB_KEY, sqlSample),
    ])
    return json({ stats: { cols: stats.cols, rows: stats.rows }, sample: { cols: sample.cols, rows: sample.rows } })
  }

  // ── Modo: TPV por lista de emails — consulta DB #3 (Split) e DB #4 (Cakto)
  if (body.emails && Array.isArray(body.emails)) {
    try {
    const allEmails = (body.emails as string[]).filter(Boolean)
    if (!allEmails.length) return json({ tpv: {} })

    // Lotes — uma única lista grande (300+ e-mails) faz o IN(...) contra payment_payment
    // estourar o timeout do Metabase e a query inteira volta vazia. Divide e paraleliza.
    const EMAIL_BATCH = 120
    const batches: string[][] = []
    for (let i = 0; i < allEmails.length; i += EMAIL_BATCH) {
      batches.push(allEmails.slice(i, i + EMAIL_BATCH))
    }

    const fetchDB4 = (sql: string) => fetch(`${MB_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: 4, type: 'native', native: { query: sql } }),
    }).then(r => r.json()).then(d => ({ rows: d?.data?.rows ?? [] }))

    const tpv: Record<string, { tpv_mes: number; ultima_venda: string | null }> = {}

    await Promise.all(batches.map(async (batch) => {
      const emailList = batch.map(e => `'${e.replace(/'/g, "''")}'`).join(',').toLowerCase()

      // DB #3 Cakto Split: payment_payment com liquidAmount e createdAt
      const sqlSplit = `
        SELECT
          u."email",
          COALESCE(SUM(p."liquidAmount") FILTER (
            WHERE p."status" = 'paid' AND p."createdAt" >= date_trunc('month', current_date)
          ), 0) AS tpv_mes,
          COALESCE(MAX(p."createdAt") FILTER (WHERE p."status" = 'paid'), NULL) AS ultima_venda
        FROM "public"."user_user" u
        LEFT JOIN "public"."payment_payment" p ON p."user_id" = u."id"
        WHERE LOWER(u."email") IN (${emailList})
        GROUP BY u."email"
      `

      // DB #4 Cakto: gateway_split.totalAmount (cobre produtor, afiliado e coprodutor)
      // Baseado na query exata do Metabase: gateway_split → gateway_order (paid) → user_user
      const sqlCakto4 = `
        SELECT
          u."email",
          COALESCE(SUM(gs."totalAmount") FILTER (
            WHERE go."status" = 'paid'
              AND DATE_TRUNC('month', gs."createdAt") = DATE_TRUNC('month', CURRENT_DATE)
          ), 0) AS tpv_mes,
          COALESCE(MAX(gs."createdAt") FILTER (WHERE go."status" = 'paid'), NULL) AS ultima_venda
        FROM "public"."user_user" u
        JOIN "public"."gateway_split" gs ON gs."user_id" = u."id"
        JOIN "public"."gateway_order" go ON go."id" = gs."order_id"
        WHERE LOWER(u."email") IN (${emailList})
        GROUP BY u."email"
      `

      const [splitResult, caktoResult] = await Promise.all([
        runSQL(MB_URL, MB_KEY, sqlSplit).catch(() => ({ cols: [], rows: [] })),
        fetchDB4(sqlCakto4).catch(() => ({ rows: [] })),
      ])

      splitResult.rows.forEach((r: any[]) => {
        const email = r[0]?.toLowerCase()
        if (email) tpv[email] = { tpv_mes: Number(r[1] ?? 0), ultima_venda: r[2] ?? null }
      })

      // Mescla resultado do Cakto #4 — usa o maior valor
      caktoResult.rows.forEach((r: any[]) => {
        const email = r[0]?.toLowerCase()
        if (!email) return
        const val = Number(r[1] ?? 0)
        const existing = tpv[email]
        if (!existing || val > existing.tpv_mes) {
          tpv[email] = { tpv_mes: val, ultima_venda: r[2] ?? existing?.ultima_venda ?? null }
        }
      })
    }))

    return json({ tpv })
    } catch (_) {
      return json({ tpv: {} })
    }
  }

  // ── Modo: TPV por ativação — janela customizada (ativação_date → +30 dias) ─
  // body = { tpv_por_ativacao: true, activacoes: [{id, email, start, end}] }
  // Retorna { tpv: Record<activacao_id, number> }
  if (body.tpv_por_ativacao && Array.isArray(body.activacoes) && body.activacoes.length > 0) {
    try {
      const acts = (body.activacoes as { id: string; email: string; start: string; end: string }[])
        .filter(a => a.email && a.id)

      if (!acts.length) return json({ tpv: {} })

      // Constrói VALUES com types explícitos para o PostgreSQL
      const values = acts
        .map(a =>
          `('${a.id.replace(/'/g, "''")}'::text, '${a.email.toLowerCase().replace(/'/g, "''")}'::text, '${a.start}'::date, '${a.end}'::date)`
        )
        .join(',\n        ')

      // DB #3 (Split): payment_payment com liquidAmount + paidAt/createdAt
      const sql3 = `
        WITH ranges(act_id, email, start_date, end_date) AS (
          VALUES ${values}
        )
        SELECT r.act_id,
          COALESCE(SUM(p."liquidAmount") FILTER (
            WHERE p."status" = 'paid'
              AND COALESCE(p."paidAt", p."createdAt") >= r.start_date::timestamp
              AND COALESCE(p."paidAt", p."createdAt") < r.end_date::timestamp + INTERVAL '1 day'
          ), 0) AS tpv
        FROM ranges r
        JOIN "public"."user_user" u ON LOWER(u."email") = r.email
        LEFT JOIN "public"."payment_payment" p ON p."user_id" = u."id"
        GROUP BY r.act_id
      `

      // DB #4 (Cakto): gateway_split + gateway_order
      const sql4 = `
        WITH ranges(act_id, email, start_date, end_date) AS (
          VALUES ${values}
        )
        SELECT r.act_id,
          COALESCE(SUM(gs."totalAmount") FILTER (
            WHERE go."status" = 'paid'
              AND gs."createdAt" >= r.start_date::timestamp
              AND gs."createdAt" < r.end_date::timestamp + INTERVAL '1 day'
          ), 0) AS tpv
        FROM ranges r
        JOIN "public"."user_user" u ON LOWER(u."email") = r.email
        LEFT JOIN "public"."gateway_split" gs ON gs."user_id" = u."id"
        LEFT JOIN "public"."gateway_order" go ON go."id" = gs."order_id"
        GROUP BY r.act_id
      `

      const fetchDB4 = (sql: string) =>
        fetch(`${MB_URL}/api/dataset`, {
          method: 'POST',
          headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ database: 4, type: 'native', native: { query: sql } }),
        }).then(r => r.json()).catch(() => ({ data: { rows: [] } }))

      const [res3, res4] = await Promise.all([
        runSQL(MB_URL, MB_KEY, sql3).catch(() => ({ cols: [], rows: [] })),
        fetchDB4(sql4),
      ])

      const tpv: Record<string, number> = {}
      // DB #3
      res3.rows.forEach((r: any[]) => { if (r[0]) tpv[r[0]] = Number(r[1] ?? 0) })
      // DB #4 — mescla tomando o maior valor
      ;(res4?.data?.rows ?? []).forEach((r: any[]) => {
        if (!r[0]) return
        const v4 = Number(r[1] ?? 0)
        if (!(r[0] in tpv) || v4 > tpv[r[0]]) tpv[r[0]] = v4
      })

      return json({ tpv })
    } catch (err) {
      console.error('[mb-search tpv_por_ativacao] Erro:', err)
      return json({ tpv: {} })
    }
  }

  // ── Modo padrão: carteiras por account_manager_id ──────────────────────
  // ref_month: 'YYYY-MM' — se não informado, usa o mês atual
  const refMonthParam: string = (body.ref_month as string) || new Date().toISOString().slice(0, 7)
  const refMonthStart = `${refMonthParam}-01`
  const refMonthEnd   = `${refMonthParam}-01`  // DATE_TRUNC vai tratar como início do mês

  const amIds = Object.keys(GERENTES).join(',')
  let allRows: any[] = []
  let offset = 0
  const PAGE = 2000

  while (true) {
    const sql = `
      SELECT
        p."account_manager_id",
        u."first_name" || ' ' || u."last_name" AS nome_completo,
        u."email",
        u."cellphone" AS telefone,
        COALESCE(pmt.tpv_30d, 0) AS faturamento_base,
        COALESCE(pmt.tpv_mes, 0) AS tpv_mes,
        pmt.ultima_venda,
        COALESCE(p."estimated_revenue", 0) AS previsao_faturamento,
        COALESCE(pmt.tpv_total, 0) AS tpv_total
      FROM "public"."user_userportfolio" p
      JOIN "public"."user_user" u ON u."id" = p."user_id"
      LEFT JOIN (
        SELECT "user_id",
          SUM("liquidAmount") FILTER (WHERE "status" = 'paid'
            AND "createdAt" >= CURRENT_DATE - INTERVAL '30 days') AS tpv_30d,
          SUM("liquidAmount") FILTER (WHERE "status" = 'paid'
            AND "createdAt" >= DATE_TRUNC('month', '${refMonthStart}'::date)
            AND "createdAt" <  DATE_TRUNC('month', '${refMonthStart}'::date) + INTERVAL '1 month') AS tpv_mes,
          SUM("liquidAmount") FILTER (WHERE "status" = 'paid') AS tpv_total,
          MAX("createdAt") FILTER (WHERE "status" = 'paid') AS ultima_venda
        FROM "public"."payment_payment"
        GROUP BY "user_id"
      ) pmt ON pmt."user_id" = u."id"
      WHERE p."account_manager_id" IN (${amIds})
      ORDER BY COALESCE(pmt.tpv_30d, 0) DESC
      LIMIT ${PAGE} OFFSET ${offset}
    `
    const { rows } = await runSQL(MB_URL, MB_KEY, sql)
    if (!rows.length) break
    allRows = allRows.concat(rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }

  // Complementa com Cakto #4 (gateway_split) — bateladas em paralelo, nunca quebra a resposta principal
  try {
    const allEmails = allRows.map(r => r[2]).filter(Boolean)
    if (allEmails.length > 0) {
      const BATCH = 400
      const caktoMap: Record<string, number> = {}
      const caktoTotalMap: Record<string, number> = {}

      // Monta todas as bateladas e dispara em paralelo
      const batches: string[][] = []
      for (let i = 0; i < allEmails.length; i += BATCH) {
        batches.push(allEmails.slice(i, i + BATCH))
      }

      const batchResults = await Promise.all(batches.map(batch => {
        const emailList = batch.map((e: string) => `'${e.replace(/'/g, "''")}'`).join(',')
        const sqlCakto4 = `
          SELECT
            u."email",
            COALESCE(SUM(gs."totalAmount") FILTER (
              WHERE go."status" = 'paid'
                AND gs."createdAt" >= DATE_TRUNC('month', '${refMonthStart}'::date)
                AND gs."createdAt" <  DATE_TRUNC('month', '${refMonthStart}'::date) + INTERVAL '1 month'
            ), 0) AS tpv_mes,
            COALESCE(SUM(gs."totalAmount") FILTER (WHERE go."status" = 'paid'), 0) AS tpv_total
          FROM "public"."user_user" u
          JOIN "public"."gateway_split" gs ON gs."user_id" = u."id"
          JOIN "public"."gateway_order" go ON go."id" = gs."order_id"
          WHERE LOWER(u."email") IN (${emailList.toLowerCase()})
          GROUP BY u."email"
        `
        return fetch(`${MB_URL}/api/dataset`, {
          method: 'POST',
          headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ database: 4, type: 'native', native: { query: sqlCakto4 } }),
        }).then(r => r.json()).catch(() => ({}))
      }))

      for (const res of batchResults) {
        ;(res?.data?.rows ?? []).forEach((r: any[]) => {
          if (r[0]) caktoMap[r[0].toLowerCase()] = Number(r[1] ?? 0)
          if (r[0]) caktoTotalMap[r[0].toLowerCase()] = Number(r[2] ?? 0)
        })
      }

      allRows = allRows.map(r => {
        const email     = (r[2] ?? '').toLowerCase()
        const splitTpv  = Number(r[5] ?? 0)
        const caktoTpv  = caktoMap[email] ?? 0
        const bestTpv   = Math.max(splitTpv, caktoTpv)
        const splitTotal = Number(r[8] ?? 0)
        const caktoTotal = caktoTotalMap[email] ?? 0
        const bestTotal  = Math.max(splitTotal, caktoTotal)
        return [r[0], r[1], r[2], r[3], r[4], bestTpv, r[6], r[7], bestTotal]
      })
    }
  } catch (_) {
    // Se Cakto #4 falhar, mantém dados do Split sem interromper a resposta
  }

  const clientes = allRows.map(r => ({
    gerente:              GERENTES[Number(r[0])] ?? String(r[0]),
    nome:                 r[1],
    email:                r[2],
    telefone:             r[3],
    faturamento:          Number(r[4] ?? 0),
    tpv_30d:              Number(r[4] ?? 0),
    tpv_mes:              Number(r[5] ?? 0),
    ultima_venda:         r[6],
    previsao_faturamento: Number(r[7] ?? 0),
    tpv_total:            Number(r[8] ?? 0),
  }))

  return json({ clientes, total: clientes.length })
})
