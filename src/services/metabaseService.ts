/**
 * Serviço de integração com o Metabase
 *
 * O Metabase atua como intermediário entre o sistema comercial
 * e o banco de pagamentos do DataCrazy. Todas as consultas de TPV
 * são feitas via Edge Function calcular-tpv (proxy server-side),
 * nunca diretamente do browser — evita CORS.
 *
 * Cards:
 * - 2107: TPV por cliente (email + janela de datas)
 * - 2108: TPV por canal do time (team_id + janela de datas)
 * - 2109: TPV diário de um cliente (email)
 */
import { supabase } from '@/lib/supabase/client'

export async function getTPVporAtivacao(
  clienteEmail: string,
  dataFechamento: string,
  janelaDias = 30,
): Promise<number> {
  const dataInicio = new Date(dataFechamento)
  const dataFim = new Date(dataFechamento)
  dataFim.setDate(dataFim.getDate() + janelaDias)

  try {
    const { data, error } = await supabase.functions.invoke('calcular-tpv', {
      body: {
        cliente_email: clienteEmail,
        data_inicio:   dataInicio.toISOString().split('T')[0],
        data_fim:      dataFim.toISOString().split('T')[0],
      },
    })
    if (error) throw error
    return Number(data?.tpv ?? 0)
  } catch (error) {
    console.error('[Metabase] Erro ao buscar TPV:', error)
    return 0
  }
}

export async function getTPVporColaborador(
  ativacoes: Array<{ cliente_email: string; data_fechamento: string }>,
  janelaDias = 30,
): Promise<number> {
  const resultados = await Promise.all(
    ativacoes.map(a => getTPVporAtivacao(a.cliente_email, a.data_fechamento, janelaDias)),
  )
  return resultados.reduce((acc, tpv) => acc + tpv, 0)
}

export async function getTPVporTime(
  timeId: string,
  ativacoes: Array<{ cliente_email: string; data_fechamento: string; time_id: string }>,
  janelaDias = 30,
): Promise<number> {
  const ativacoesDoTime = ativacoes.filter(a => a.time_id === timeId)
  return getTPVporColaborador(ativacoesDoTime, janelaDias)
}

export async function verificarGatilhoRoleta(
  clienteEmail: string,
  dataFechamento: string,
): Promise<boolean> {
  const tpv = await getTPVporAtivacao(clienteEmail, dataFechamento, 7)
  return tpv >= 1000
}

// ─── Card 2107 — TPV por cliente (com nome) ──────────────────────────────────
export async function getTPVCliente(
  email: string,
  dataAtivacao: string,
  janelaDias = 30,
): Promise<{ tpv: number; nome: string }> {
  const dataInicio = dataAtivacao.split('T')[0]
  const dataFim = new Date(dataAtivacao)
  dataFim.setDate(dataFim.getDate() + janelaDias)
  const dataFimStr = dataFim.toISOString().split('T')[0]
  try {
    const { data, error } = await supabase.functions.invoke('calcular-tpv', {
      body: { cliente_email: email, data_inicio: dataInicio, data_fim: dataFimStr },
    })
    if (error) throw error
    return { tpv: Number(data?.tpv ?? 0), nome: email }
  } catch { return { tpv: 0, nome: email } }
}

// ─── Card 2108 — TPV por canal do time ───────────────────────────────────────
export async function getTPVCanal(
  teamUuid: string,
  dataInicio: string,
  dataFim: string,
): Promise<{ inbound: number; outbound: number; indicacao: number; total: number }> {
  try {
    const { data, error } = await supabase.functions.invoke('calcular-tpv', {
      body: { team_uuid: teamUuid, data_inicio: dataInicio, data_fim: dataFim },
    })
    if (error) throw error
    return {
      inbound:   Number(data?.inbound   ?? 0),
      outbound:  Number(data?.outbound  ?? 0),
      indicacao: Number(data?.indicacao ?? 0),
      total:     Number(data?.total     ?? 0),
    }
  } catch { return { inbound: 0, outbound: 0, indicacao: 0, total: 0 } }
}

// ─── Card 2109 — TPV diário de um cliente ────────────────────────────────────
export async function getTPVDiario(email: string): Promise<number> {
  try {
    const { data, error } = await supabase.functions.invoke('calcular-tpv', {
      body: { tpv_diario: true, cliente_email: email },
    })
    if (error) throw error
    return Number(data?.tpv ?? 0)
  } catch { return 0 }
}

export async function getTPVDiarioTime(emails: string[]): Promise<number> {
  const resultados = await Promise.all(emails.map(e => getTPVDiario(e)))
  return resultados.reduce((acc, tpv) => acc + tpv, 0)
}

export async function getTPVConsolidado(
  ativacoes: Array<{ cliente_email: string; data_fechamento: string; time_id: string }>,
  janelaDias = 30,
): Promise<Record<string, number>> {
  const times = [...new Set(ativacoes.map(a => a.time_id))]
  const resultados: Record<string, number> = {}
  await Promise.all(
    times.map(async timeId => {
      resultados[timeId] = await getTPVporTime(timeId, ativacoes, janelaDias)
    }),
  )
  return resultados
}
