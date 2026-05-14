// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SQL_CARTEIRAS = `
WITH VendasHistoricas AS (
    SELECT 
        "user_id",
        SUM("liquidAmount") AS "volume_total_30d",
        SUM("liquidAmount") FILTER (WHERE "createdAt" >= date_trunc('month', current_date)) as "tpv_mes_atual",
        MAX("createdAt") as "ultima_venda"
    FROM "public"."payment_payment"
    WHERE "status" = 'paid' 
      AND "paidAt" >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY "user_id"
),
RankingTop AS (
    SELECT v.*, ROW_NUMBER() OVER (ORDER BY v."volume_total_30d" DESC) AS "ranking_produtor"
    FROM VendasHistoricas v
),
Distribuicao AS (
    SELECT r.*,
        CASE 
            WHEN "ranking_produtor" % 3 = 1 THEN 'Carteira 1'
            WHEN "ranking_produtor" % 3 = 2 THEN 'Carteira 2'
            WHEN "ranking_produtor" % 3 = 0 THEN 'Carteira 3'
        END AS "carteira_gerente"
    FROM RankingTop r
)
SELECT 
    d."carteira_gerente",
    d."ranking_produtor",
    u."first_name" || ' ' || u."last_name" AS "nome_completo",
    u."email",
    u."cellphone" AS "telefone",
    ROUND(CAST(d."volume_total_30d" AS NUMERIC), 2) AS "faturamento_base",
    ROUND(CAST(d."tpv_mes_atual" AS NUMERIC), 2) AS "tpv_mes",
    d."ultima_venda"
FROM Distribuicao d
LEFT JOIN "public"."user_user" u ON d."user_id" = u."id"
ORDER BY d."ranking_produtor" ASC
`

const DB_ID = 3

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const MB_URL = Deno.env.get('METABASE_URL') ?? ''
  const MB_KEY = Deno.env.get('METABASE_API_KEY') ?? ''
  const json = (b) => new Response(JSON.stringify(b), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  await req.json().catch(() => ({}))

  // Busca via dataset (sem limite de R$50k, até 2000 por página)
  // Faz paginação para pegar todos
  let allRows: any[] = []
  let cols: string[] = []
  let page = 0
  const PAGE_SIZE = 2000

  while (true) {
    const sql = `${SQL_CARTEIRAS} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`
    const res = await fetch(`${MB_URL}/api/dataset`, {
      method: 'POST',
      headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: DB_ID, type: 'native', native: { query: sql } }),
    })
    const data = await res.json()
    if (!cols.length) cols = data?.data?.cols?.map((c: any) => c.name) ?? []
    const rows = data?.data?.rows ?? []
    if (!rows.length) break
    allRows = allRows.concat(rows)
    if (rows.length < PAGE_SIZE) break
    page++
  }

  return json({ cols, rows: allRows, total: allRows.length })
})
