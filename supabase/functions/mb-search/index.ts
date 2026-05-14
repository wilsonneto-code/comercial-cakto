// @ts-nocheck
// Edge Function: mb-search — busca carteiras do Metabase (card 1660)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const MB_URL = Deno.env.get('METABASE_URL') ?? ''
  const MB_KEY = Deno.env.get('METABASE_API_KEY') ?? ''
  const json = (b) => new Response(JSON.stringify(b), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  const body = await req.json().catch(() => ({}))
  const cardId = body.card_id ?? 1660

  const res = await fetch(`${MB_URL}/api/card/${cardId}/query`, {
    method: 'POST',
    headers: { 'x-api-key': MB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const data = await res.json()
  const cols = data?.data?.cols?.map((c) => c.name) ?? []
  const rows = data?.data?.rows ?? []
  return json({ cols, rows, total: rows.length })
})
