/**
 * Cache persistente para resultados da Edge Function mb-search.
 * Usa localStorage como camada primária (sobrevive a F5/reload)
 * e memória como camada secundária (acesso instantâneo na mesma sessão).
 * TTL de 4 horas — alinhado com o cron que roda 6x/dia.
 */
import { supabase } from '@/lib/supabase/client'

const TTL_MS   = 4 * 60 * 60 * 1000  // 4 horas
const LS_PREFIX = 'mbcache_'

type CacheEntry<T> = { data: T; ts: number }

// Camada 1: memória (perdida no reload, acesso ~0ms)
const mem: Record<string, CacheEntry<unknown>> = {}

// ── helpers localStorage ────────────────────────────────────────────────────
function lsGet<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry<T>
  } catch { return null }
}

function lsSet(key: string, entry: CacheEntry<unknown>) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry))
  } catch {
    // localStorage cheio ou indisponível — continua sem persistência
  }
}

function lsDel(key: string) {
  try { localStorage.removeItem(LS_PREFIX + key) } catch {}
}

// ── isFresh: verifica memória primeiro, depois localStorage ─────────────────
function isFresh(key: string): boolean {
  // 1. memória
  const m = mem[key]
  if (m && Date.now() - m.ts < TTL_MS) return true

  // 2. localStorage — restaura para memória se ainda válido
  const ls = lsGet(key)
  if (ls && Date.now() - ls.ts < TTL_MS) {
    mem[key] = ls
    return true
  }
  return false
}

function getFromCache<T>(key: string): T {
  return (mem[key]?.data ?? lsGet<T>(key)!.data) as T
}

function setCache(key: string, data: unknown) {
  const entry: CacheEntry<unknown> = { data, ts: Date.now() }
  mem[key] = entry
  lsSet(key, entry)
}

// ── invalidate: limpa memória + localStorage ─────────────────────────────────
export function invalidateMbCache() {
  // memória
  Object.keys(mem).forEach(k => delete mem[k])
  // localStorage
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => localStorage.removeItem(k))
  } catch {}
}

// ─── Clientes da carteira (mb-search sem parâmetros) ─────────────────────────
const KEY_CLIENTES = 'mb_clientes'

export async function getMbClientes(forceRefresh = false): Promise<unknown[]> {
  if (!forceRefresh && isFresh(KEY_CLIENTES)) {
    return getFromCache<unknown[]>(KEY_CLIENTES)
  }
  const { data } = await supabase.functions.invoke('mb-search', { body: {} })
  const clientes = data?.clientes ?? []
  setCache(KEY_CLIENTES, clientes)
  return clientes
}

// ─── TPV por lista de emails (mb-search com { emails }) ─────────────────────
const KEY_TPV_EMAILS = 'mb_tpv_emails'

export async function getMbTpvByEmails(
  emails: string[],
  forceRefresh = false,
): Promise<Record<string, { tpv_mes: number; ultima_venda: string | null }>> {
  if (!emails.length) return {}
  if (!forceRefresh && isFresh(KEY_TPV_EMAILS)) {
    return getFromCache<Record<string, { tpv_mes: number; ultima_venda: string | null }>>(KEY_TPV_EMAILS)
  }
  const { data } = await supabase.functions.invoke('mb-search', { body: { emails } })
  const tpv = (data?.tpv ?? {}) as Record<string, { tpv_mes: number; ultima_venda: string | null }>
  setCache(KEY_TPV_EMAILS, tpv)
  return tpv
}

// ─── TPV diário (mb-search com daily_tpv) ────────────────────────────────────
function keyDailyTpv(mes: string, amIds: number[]) {
  return `mb_daily_${mes}_${amIds.sort().join(',')}`
}

// ─── TPV por ativação — janela customizada (ativação → +30 dias) ─────────────
// Não usa cache pois cada chamada tem conjunto específico de datas/ativações
export async function getMbTpvPorAtivacao(
  activacoes: { id: string; email: string; start: string; end: string }[]
): Promise<Record<string, number>> {
  if (!activacoes.length) return {}
  const { data } = await supabase.functions.invoke('mb-search', {
    body: { tpv_por_ativacao: true, activacoes },
  })
  return (data?.tpv ?? {}) as Record<string, number>
}

export async function getMbDailyTpv(
  mes: string,
  amIds: number[],
  forceRefresh = false,
): Promise<unknown> {
  const key = keyDailyTpv(mes, amIds)
  if (!forceRefresh && isFresh(key)) {
    return getFromCache<unknown>(key)
  }
  const { data } = await supabase.functions.invoke('mb-search', {
    body: { daily_tpv: true, month: mes, ...(amIds.length ? { account_manager_ids: amIds } : {}) },
  })
  const daily = data?.daily ?? null
  setCache(key, daily)
  return daily
}
