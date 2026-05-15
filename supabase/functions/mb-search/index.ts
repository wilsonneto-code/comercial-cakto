// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GERENTES: Record<number, string> = {
  4204072: 'Rafael Mendes',
  5843493: 'Isaac',
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

  // ── Modo: TPV por lista de emails (para GC kanban) ──────────────────────
  if (body.emails && Array.isArray(body.emails)) {
    const emailList = body.emails.map((e: string) => `'${e.replace(/'/g, "''")}'`).join(',')
    if (!emailList) return json({ tpv: {} })

    const sql = `
      SELECT
        u."email",
        COALESCE(SUM(p."liquidAmount") FILTER (
          WHERE p."status" = 'paid'
            AND p."createdAt" >= date_trunc('month', current_date)
        ), 0) AS tpv_mes,
        COALESCE(MAX(p."createdAt") FILTER (WHERE p."status" = 'paid'), NULL) AS ultima_venda
      FROM "public"."user_user" u
      LEFT JOIN "public"."payment_payment" p ON p."user_id" = u."id"
      WHERE LOWER(u."email") IN (${emailList.toLowerCase()})
      GROUP BY u."email"
    `
    const { rows } = await runSQL(MB_URL, MB_KEY, sql)
    const tpv: Record<string, { tpv_mes: number; ultima_venda: string | null }> = {}
    rows.forEach((r: any[]) => {
      tpv[r[0]?.toLowerCase()] = { tpv_mes: Number(r[1] ?? 0), ultima_venda: r[2] ?? null }
    })
    return json({ tpv })
  }

  // ── Modo padrão: carteiras por account_manager_id ──────────────────────
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
        COALESCE(p."estimated_revenue", 0) AS previsao_faturamento
      FROM "public"."user_userportfolio" p
      JOIN "public"."user_user" u ON u."id" = p."user_id"
      LEFT JOIN (
        SELECT "user_id",
          SUM("liquidAmount") FILTER (WHERE "status" = 'paid'
            AND "createdAt" >= CURRENT_DATE - INTERVAL '30 days') AS tpv_30d,
          SUM("liquidAmount") FILTER (WHERE "status" = 'paid'
            AND "createdAt" >= date_trunc('month', current_date)) AS tpv_mes,
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

  const clientes = allRows.map(r => ({
    gerente:              GERENTES[Number(r[0])] ?? String(r[0]),
    nome:                 r[1],
    email:                r[2],
    telefone:             r[3],
    faturamento:          Number(r[4] ?? 0),
    tpv_mes:              Number(r[5] ?? 0),
    ultima_venda:         r[6],
    previsao_faturamento: Number(r[7] ?? 0),
  }))

  return json({ clientes, total: clientes.length })
})
