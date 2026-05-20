/**
 * Cache em memória para resultados da Edge Function mb-search.
 * Persiste entre navegações de página (módulo singleton na sessão).
 * TTL de 4 horas — alinhado com o cron que roda 6x/dia.
 */
import { supabase } from '@/lib/supabase/client'

const TTL_MS = 4 * 60 * 60 * 1000 // 4 horas

type CacheEntry<T> = { data: T; ts: number }

const store: Record<string, CacheEntry<unknown>> = {}

function isFresh(key: string): boolean {
  const entry = store[key]
  return !!entry && Date.now() - entry.ts < TTL_MS
}

export function invalidateMbCache() {
  Object.keys(store).forEach(k => delete store[k])
}

// ─── Clientes da carteira (mb-search sem parâmetros) ─────────────────────────
const KEY_CLIENTES = 'mb_clientes'

export async function getMbClientes(forceRefresh = false): Promise<unknown[]> {
  if (!forceRefresh && isFresh(KEY_CLIENTES)) {
    return (store[KEY_CLIENTES].data as unknown[])
  }
  const { data } = await supabase.functions.invoke('mb-search', { body: {} })
  const clientes = data?.clientes ?? []
  store[KEY_CLIENTES] = { data: clientes, ts: Date.now() }
  return clientes
}

// ─── TPV diário (mb-search com daily_tpv) ────────────────────────────────────
function keyDailyTpv(mes: string, amIds: number[]) {
  return `mb_daily_${mes}_${amIds.sort().join(',')}`
}

export async function getMbDailyTpv(
  mes: string,
  amIds: number[],
  forceRefresh = false,
): Promise<unknown> {
  const key = keyDailyTpv(mes, amIds)
  if (!forceRefresh && isFresh(key)) {
    return store[key].data
  }
  const { data } = await supabase.functions.invoke('mb-search', {
    body: { daily_tpv: true, month: mes, ...(amIds.length ? { account_manager_ids: amIds } : {}) },
  })
  const daily = data?.daily ?? null
  store[key] = { data: daily, ts: Date.now() }
  return daily
}
