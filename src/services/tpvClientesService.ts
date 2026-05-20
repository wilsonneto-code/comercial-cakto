/**
 * Serviço de Clientes Ativos por Time
 *
 * Gerencia a tabela tpv_clientes, que armazena o estado de cada cliente
 * ativado: período de 30 dias, TPV atual, canal, e status (ativo/expirado).
 *
 * Dados de TPV vêm do Metabase (card 2107) via getTPVCliente.
 */
import { supabase } from '@/lib/supabase/client'
import { TIMES_UUID } from './dashboardTimeService'

// Busca TPV via Edge Function (evita CORS do Metabase direto)
async function buscarTPVCliente(email: string, dataInicio: string, dataFim: string): Promise<number> {
  try {
    const { data, error } = await supabase.functions.invoke('calcular-tpv', {
      body: { cliente_email: email, data_inicio: dataInicio, data_fim: dataFim },
    })
    if (error) throw error
    return Number(data?.tpv ?? 0)
  } catch { return 0 }
}

const DATA_CORTE = '2026-04-01'

export type ClienteAtivo = {
  id: string
  ativacao_id: string
  cliente_email: string
  closer_email: string | null
  sdr_email: string | null
  time_id: string
  canal: string | null
  data_ativacao: string
  data_fim: string
  tpv_atual: number
  status: 'ativo' | 'expirado'
  removido_manualmente: boolean
  observacao: string | null
  ultima_atualizacao: string
}

// ─── Buscar clientes ativos do time ──────────────────────────────────────────
export async function getClientesAtivos(timeId: string): Promise<ClienteAtivo[]> {
  const hoje = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('tpv_clientes')
    .select('*')
    .eq('time_id', `Time ${timeId}`)
    .eq('status', 'ativo')
    .eq('removido_manualmente', false)
    .gte('data_fim', hoje)
    .order('tpv_atual', { ascending: false })

  return (data ?? []) as ClienteAtivo[]
}

// ─── Buscar clientes expirados (lifetime) ────────────────────────────────────
export async function getClientesLifetime(timeId?: string): Promise<ClienteAtivo[]> {
  let query = supabase
    .from('tpv_clientes')
    .select('*')
    .eq('status', 'expirado')
    .order('tpv_atual', { ascending: false })

  if (timeId) query = query.eq('time_id', `Time ${timeId}`)

  const { data } = await query
  return (data ?? []) as ClienteAtivo[]
}

// ─── Sincronizar clientes do time a partir das ativações ─────────────────────
export async function sincronizarClientesDoTime(timeId: string): Promise<void> {
  const teamUuid = TIMES_UUID[timeId]
  if (!teamUuid) return

  // Busca membros do time para filtrar ativações pelo responsible
  const { data: membros } = await supabase
    .from('users')
    .select('id')
    .eq('team_id', teamUuid)

  const memberIds = (membros ?? []).map(m => m.id)
  if (memberIds.length === 0) return

  const { data: ativacoes } = await supabase
    .from('activations')
    .select(`
      id, email, date, channel,
      closer:users!activations_responsible_fkey (email),
      sdr:users!activations_sdr_id_fkey (email)
    `)
    .in('responsible', memberIds)
    .gte('date', DATA_CORTE)
    .not('email', 'is', null)

  const hoje = new Date()

  for (const ativacao of ativacoes ?? []) {
    const dataFim = new Date(ativacao.date)
    dataFim.setDate(dataFim.getDate() + 30)
    const status = dataFim < hoje ? 'expirado' : 'ativo'

    const dataFimTpv = new Date(ativacao.date)
    dataFimTpv.setDate(dataFimTpv.getDate() + 30)
    const tpv = await buscarTPVCliente(
      ativacao.email,
      ativacao.date.split('T')[0],
      dataFimTpv.toISOString().split('T')[0],
    )

    // Verificar se já existe (para não sobrescrever removido_manualmente)
    const { data: existente } = await supabase
      .from('tpv_clientes')
      .select('removido_manualmente')
      .eq('ativacao_id', ativacao.id)
      .maybeSingle()

    // Se foi removido manualmente, apenas atualiza tpv_atual e status
    if (existente?.removido_manualmente) {
      await supabase.from('tpv_clientes')
        .update({ tpv_atual: tpv, status, ultima_atualizacao: new Date().toISOString() })
        .eq('ativacao_id', ativacao.id)
      continue
    }

    const { error: upsertErr } = await supabase.from('tpv_clientes').upsert({
      ativacao_id:          ativacao.id,
      cliente_email:        ativacao.email,
      closer_email:         (ativacao.closer as { email: string } | null)?.email ?? null,
      sdr_email:            (ativacao.sdr    as { email: string } | null)?.email ?? null,
      time_id:              `Time ${timeId}`,
      canal:                ativacao.channel ?? null,
      data_ativacao:        ativacao.date,
      data_fim:             dataFim.toISOString().split('T')[0],
      tpv_atual:            tpv,
      status,
      removido_manualmente: false,
      ultima_atualizacao:   new Date().toISOString(),
    }, { onConflict: 'ativacao_id' })

    if (upsertErr) {
      console.error('[tpvClientes] Erro no upsert:', JSON.stringify(upsertErr))
    }
  }
}

// ─── Remover cliente manualmente ─────────────────────────────────────────────
export async function removerCliente(ativacaoId: string, observacao?: string): Promise<void> {
  await supabase
    .from('tpv_clientes')
    .update({
      removido_manualmente: true,
      observacao:           observacao ?? 'Removido manualmente',
      ultima_atualizacao:   new Date().toISOString(),
    })
    .eq('ativacao_id', ativacaoId)
}

// ─── Editar observação ───────────────────────────────────────────────────────
export async function editarCliente(ativacaoId: string, observacao: string): Promise<void> {
  await supabase
    .from('tpv_clientes')
    .update({ observacao, ultima_atualizacao: new Date().toISOString() })
    .eq('ativacao_id', ativacaoId)
}
