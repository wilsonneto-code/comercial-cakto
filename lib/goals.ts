// Metas globais do sistema comercial

export const GOALS = {
  closer: {
    ativacoes_mes: 48,
  },
  sdr: {
    reunioes_agendadas_mes: 200,
    reunioes_realizadas_mes: 160,
  },
  gc: {
    starter:    0.80,  // 80% do previsto
    growth:     0.85,  // 85% do previsto
    enterprise: 0.90,  // 90% do previsto
  },
} as const

export function gcMeta(tier: string | null): number {
  if (tier === 'starter')    return GOALS.gc.starter
  if (tier === 'growth')     return GOALS.gc.growth
  if (tier === 'enterprise') return GOALS.gc.enterprise
  return GOALS.gc.starter
}

/** Retorna cor baseada no % atingido em relação à meta */
export function metaColor(pct: number, meta: number): string {
  const ratio = pct / (meta * 100)
  if (ratio >= 1)    return '#34C759'  // verde — atingiu
  if (ratio >= 0.7)  return '#FF9F0A'  // amarelo — próximo
  return '#FF3B30'                      // vermelho — abaixo
}
