/**
 * Serviço de TPV
 *
 * Consulta o tpv_cache do Supabase, que é populado pela
 * Edge Function calcular-tpv via API do Metabase.
 *
 * Os valores de TPV refletem pagamentos reais processados
 * no DataCrazy, consultados através do Metabase.
 */
import { supabase } from '../lib/supabase/client'

const DATA_INICIO_REGRA = new Date('2026-04-01T00:00:00.000Z')

export async function getTPVPorTime(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('tpv_cache')
    .select('time_id, tpv_30_dias')
    .not('time_id', 'is', null)
    .gte('data_fechamento', DATA_INICIO_REGRA.toISOString())

  const consolidado: Record<string, number> = {}
  data?.forEach(row => {
    consolidado[row.time_id] = (consolidado[row.time_id] ?? 0) + Number(row.tpv_30_dias)
  })
  return consolidado
}

export async function getTPVPorCloser(): Promise<Record<string, { tpv: number; bonus: number }>> {
  const { data } = await supabase
    .from('tpv_cache')
    .select('closer_email, tpv_30_dias, bonus_closer')
    .not('closer_email', 'is', null)
    .gte('data_fechamento', DATA_INICIO_REGRA.toISOString())

  const consolidado: Record<string, { tpv: number; bonus: number }> = {}
  data?.forEach(row => {
    if (!consolidado[row.closer_email]) consolidado[row.closer_email] = { tpv: 0, bonus: 0 }
    consolidado[row.closer_email].tpv   += Number(row.tpv_30_dias)
    consolidado[row.closer_email].bonus += Number(row.bonus_closer)
  })
  return consolidado
}

export async function getTPVPorSDR(): Promise<Record<string, { tpv: number; bonus: number }>> {
  const { data } = await supabase
    .from('tpv_cache')
    .select('sdr_email, tpv_30_dias, bonus_sdr')
    .not('sdr_email', 'is', null)
    .gte('data_fechamento', DATA_INICIO_REGRA.toISOString())

  const consolidado: Record<string, { tpv: number; bonus: number }> = {}
  data?.forEach(row => {
    if (!consolidado[row.sdr_email]) consolidado[row.sdr_email] = { tpv: 0, bonus: 0 }
    consolidado[row.sdr_email].tpv   += Number(row.tpv_30_dias)
    consolidado[row.sdr_email].bonus += Number(row.bonus_sdr)
  })
  return consolidado
}

export async function getGatilhosRoleta() {
  const { data } = await supabase
    .from('tpv_cache')
    .select('*')
    .eq('gatilho_roleta', true)
    .order('ultima_atualizacao', { ascending: false })
  return data ?? []
}

export async function getTPVConsolidadoHead() {
  const { data } = await supabase
    .from('tpv_cache')
    .select('time_id, tpv_30_dias')
    .gte('data_fechamento', DATA_INICIO_REGRA.toISOString())

  let totalGeral = 0
  const porTime: Record<string, number> = {}

  data?.forEach(row => {
    porTime[row.time_id] = (porTime[row.time_id] ?? 0) + Number(row.tpv_30_dias)
    totalGeral += Number(row.tpv_30_dias)
  })

  const excedente = Math.max(0, totalGeral - 3_000_000)
  return {
    porTime,
    totalGeral,
    metaHead: 3_000_000,
    excedente,
    bonusHead: excedente * 0.003,
  }
}
