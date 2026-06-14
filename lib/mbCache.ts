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

// ─── Clientes da carteira (mb-search com ref_month opcional) ─────────────────
function keyClientes(refMonth?: string) {
  return refMonth ? `mb_clientes_${refMonth}` : 'mb_clientes'
}

export async function getMbClientes(forceRefresh = false, refMonth?: string): Promise<unknown[]> {
  const key = keyClientes(refMonth)
  if (!forceRefresh && isFresh(key)) {
    return getFromCache<unknown[]>(key)
  }
  const body: Record<string, string> = {}
  if (refMonth) body.ref_month = refMonth
  const { data } = await supabase.functions.invoke('mb-search', { body })
  const clientes = data?.clientes ?? []
  setCache(key, clientes)
  return clientes
}

// ─── TPV por lista de emails (mb-search com { emails }) ─────────────────────
// Chave inclui hash simples da lista para evitar colisão entre conjuntos de clientes diferentes
function keyTpvEmails(emails: string[]): string {
  const sorted = [...emails].sort()
  // hash leve: soma dos char codes dos primeiros 20 emails
  const h = sorted.slice(0, 20).join('').split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return `mb_tpv_emails_${sorted.length}_${h}`
}

export async function getMbTpvByEmails(
  emails: string[],
  forceRefresh = false,
): Promise<Record<string, { tpv_mes: number; ultima_venda: string | null }>> {
  if (!emails.length) return {}
  const key = keyTpvEmails(emails)
  if (!forceRefresh && isFresh(key)) {
    return getFromCache<Record<string, { tpv_mes: number; ultima_venda: string | null }>>(key)
  }
  const { data } = await supabase.functions.invoke('mb-search', { body: { emails } })
  const tpv = (data?.tpv ?? {}) as Record<string, { tpv_mes: number; ultima_venda: string | null }>
  setCache(key, tpv)
  return tpv
}

// ─── TPV diário (mb-search com daily_tpv) ────────────────────────────────────
function keyDailyTpv(mes: string, amIds: number[]) {
  return `mb_daily_${mes}_${amIds.sort().join(',')}`
}

// ─── TPV por ativação — janela customizada (ativação → +30 dias) ─────────────
// Divide em lotes de 8 para evitar timeout da Edge Function / Metabase
const BATCH_SIZE = 8

export async function getMbTpvPorAtivacao(
  activacoes: { id: string; email: string; start: string; end: string }[]
): Promise<Record<string, number>> {
  if (!activacoes.length) return {}

  const batches: (typeof activacoes)[] = []
  for (let i = 0; i < activacoes.length; i += BATCH_SIZE) {
    batches.push(activacoes.slice(i, i + BATCH_SIZE))
  }

  const results = await Promise.all(
    batches.map(batch =>
      supabase.functions
        .invoke('mb-search', { body: { tpv_por_ativacao: true, activacoes: batch } })
        .then(({ data }) => (data?.tpv ?? {}) as Record<string, number>)
        .catch(() => ({}) as Record<string, number>)
    )
  )

  return Object.assign({}, ...results) as Record<string, number>
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
  if (daily) setCache(key, daily) // não cacheia falha transitória do Metabase
  return daily
}
