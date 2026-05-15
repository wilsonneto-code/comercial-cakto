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

  await req.json().catch(() => ({}))

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
        pmt.ultima_venda
      FROM "public"."user_userportfolio" p
      JOIN "public"."user_user" u ON u."id" = p."user_id"
      LEFT JOIN (
        SELECT "user_id",
          SUM("liquidAmount") AS tpv_30d,
          SUM("liquidAmount") FILTER (WHERE "createdAt" >= date_trunc('month', current_date)) AS tpv_mes,
          MAX("createdAt") AS ultima_venda
        FROM "public"."payment_payment"
        WHERE "status" = 'paid' AND "paidAt" >= CURRENT_DATE - INTERVAL '30 days'
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
    gerente:     GERENTES[Number(r[0])] ?? String(r[0]),
    nome:        r[1],
    email:       r[2],
    telefone:    r[3],
    faturamento: Number(r[4] ?? 0),
    tpv_mes:     Number(r[5] ?? 0),
    ultima_venda: r[6],
  }))

  return json({ clientes, total: clientes.length })
})
