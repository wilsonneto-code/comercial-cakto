import { useEffect, useState } from 'react'
import { Header } from '../../components/Header'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import { BarChartH } from '@/components/ui/charts/BarChartH'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, Phone, TrendingUp, Target, Users, Award, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

interface Call {
  id: string
  date: string
  status: 'Agendada' | 'Realizada' | 'No-show' | 'Cancelada'
  sdr_nome: string | null
  responsible: string
  ativado: boolean
  motivo_nao_ativacao: string | null
}

interface SdrRow {
  nome: string
  agendadas: number
  realizadas: number
  noshow: number
  canceladas: number
  ativadas: number
  pctRealizacao: number
  pctAtivacao: number
  score: number
}

const COR = { verde: '#34C759', amarelo: '#FF9F0A', vermelho: '#FF3B30', azul: '#2997FF', roxo: '#BF5AF2' }
const pctColor = (p: number, meta: number) => p >= meta ? COR.verde : p >= meta * 0.6 ? COR.amarelo : COR.vermelho

export default function DashboardSDR() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  return <DashSDRContent />
}

export function DashSDRContent({ onBack }: { onBack?: () => void } = {}) {
  const { user } = useAuth()
  const isAdmin = hasAnyRole(user, ['Admin'])
  const isSdr   = user?.role === 'SDR'

  const [calls, setCalls]         = useState<Call[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefresh, setIsRefresh] = useState(false)
  const [mes, setMes]             = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => { load() }, [mes])

  async function load() {
    setIsLoading(true)
    const inicio = `${mes}-01`
    const fim    = `${mes}-31`
    const { data } = await supabase
      .from('calls')
      .select('id,date,status,sdr_nome,responsible,ativado,motivo_nao_ativacao')
      .gte('date', inicio).lte('date', fim)
    setCalls((data ?? []) as Call[])
    setIsLoading(false)
  }

  const refresh = async () => { setIsRefresh(true); await load(); setIsRefresh(false) }

  // Filtra pelo próprio SDR se não for admin
  const base = isSdr
    ? calls.filter(c => c.sdr_nome === user?.name)
    : calls

  // ── Métricas gerais ───────────────────────────────────────────────────
  const agendadas  = base.length
  const realizadas = base.filter(c => c.status === 'Realizada').length
  const noshow     = base.filter(c => c.status === 'No-show').length
  const canceladas = base.filter(c => c.status === 'Cancelada').length
  const ativadas   = base.filter(c => c.ativado).length
  const pctReal    = agendadas > 0 ? realizadas / agendadas * 100 : 0
  const pctAtiv    = realizadas > 0 ? ativadas / realizadas * 100 : 0

  // ── Ranking por SDR ───────────────────────────────────────────────────
  const sdrMap: Record<string, { ag: number; re: number; ns: number; ca: number; at: number }> = {}
  base.forEach(c => {
    const nome = c.sdr_nome || 'Sem SDR'
    if (!sdrMap[nome]) sdrMap[nome] = { ag: 0, re: 0, ns: 0, ca: 0, at: 0 }
    sdrMap[nome].ag++
    if (c.status === 'Realizada') sdrMap[nome].re++
    if (c.status === 'No-show')   sdrMap[nome].ns++
    if (c.status === 'Cancelada') sdrMap[nome].ca++
    if (c.ativado) sdrMap[nome].at++
  })

  const sdrs: SdrRow[] = Object.entries(sdrMap).map(([nome, v]) => {
    const pctR = v.ag > 0 ? v.re / v.ag * 100 : 0
    const pctA = v.re > 0 ? v.at / v.re * 100 : 0
    // Score: (realizadas/160 + pctAtiv/30) / 2 * 100
    const score = Math.round(((v.re / 160) + (pctA / 30)) / 2 * 100)
    return { nome, agendadas: v.ag, realizadas: v.re, noshow: v.ns, canceladas: v.ca, ativadas: v.at, pctRealizacao: pctR, pctAtivacao: pctA, score }
  }).sort((a, b) => b.score - a.score)

  // ── Gráficos ──────────────────────────────────────────────────────────
  const donutStatus = [
    { label: 'Realizadas',  value: realizadas, color: COR.verde    },
    { label: 'Agendadas',   value: agendadas - realizadas - noshow - canceladas, color: COR.azul },
    { label: 'No-show',     value: noshow,     color: COR.amarelo  },
    { label: 'Canceladas',  value: canceladas, color: COR.vermelho },
  ].filter(d => d.value > 0)

  const barAgendadas  = sdrs.map(s => ({ label: s.nome.split(' ')[0], value: s.agendadas }))
  const barRealizadas = sdrs.map(s => ({ label: s.nome.split(' ')[0], value: s.realizadas }))

  // Motivos não ativação
  const motivosMap: Record<string, number> = {}
  base.filter(c => c.motivo_nao_ativacao).forEach(c => {
    const m = c.motivo_nao_ativacao!
    motivosMap[m] = (motivosMap[m] ?? 0) + 1
  })
  const barMotivos = Object.entries(motivosMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([label, value]) => ({ label: label.length > 22 ? label.slice(0, 20) + '…' : label, value }))

  // Funil de conversão
  const funil = [
    { label: 'Agendadas',  value: agendadas,  pct: 100,                                           color: COR.azul    },
    { label: 'Realizadas', value: realizadas, pct: agendadas > 0 ? realizadas/agendadas*100 : 0,  color: COR.verde   },
    { label: 'Ativadas',   value: ativadas,   pct: agendadas > 0 ? ativadas/agendadas*100 : 0,    color: COR.roxo    },
  ]

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }
  const lbl = (t: string) => <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>{t}</div>

  if (isLoading) return (
    <><Header /><div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>Carregando...</div></>
  )

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>

        {/* Topo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onBack && <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>}
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                {isSdr ? `Dashboard — ${user?.name}` : 'Dashboard SDR'}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
                {new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · {agendadas} calls no período
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="month" value={mes} onChange={e => setMes(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }} />
            <button onClick={refresh} disabled={isRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
              <RefreshCw size={14} style={{ animation: isRefresh ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Cards métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { icon: <Phone size={16} color={COR.azul} />,      label: 'Agendadas',   val: String(agendadas),       sub: 'no período',           color: COR.azul    },
            { icon: <CheckCircle size={16} color={COR.verde} />, label: 'Realizadas',  val: String(realizadas),      sub: `de ${agendadas}`,       color: COR.verde   },
            { icon: <AlertTriangle size={16} color={COR.amarelo} />, label: 'No-show', val: String(noshow),          sub: 'não compareceu',        color: COR.amarelo },
            { icon: <XCircle size={16} color={COR.vermelho} />, label: 'Canceladas',  val: String(canceladas),      sub: 'canceladas',            color: COR.vermelho},
            { icon: <TrendingUp size={16} color={pctColor(pctReal, 80)} />, label: '% Realização', val: `${pctReal.toFixed(1)}%`, sub: 'meta: 80%', color: pctColor(pctReal, 80) },
            { icon: <Target size={16} color={pctColor(pctAtiv, 30)} />,     label: '% Ativação',   val: `${pctAtiv.toFixed(1)}%`, sub: `${ativadas} ativações`, color: pctColor(pctAtiv, 30) },
          ].map(({ icon, label, val, sub, color }) => (
            <div key={label} style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-card2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Linha 1: Donut + Funil + Motivos */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 220px 1fr', gap: 16, marginBottom: 16 }}>

          {/* Donut status */}
          <div style={{ ...card, padding: '20px' }}>
            {lbl('Status das Calls')}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <DonutChart data={donutStatus} size={130} thickness={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {donutStatus.map(e => (
                <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text2)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.color, display: 'inline-block' }} />{e.label}
                  </span>
                  <strong style={{ color: e.color }}>{e.value}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Funil */}
          <div style={{ ...card, padding: '20px' }}>
            {lbl('Funil de Conversão')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {funil.map((f, i) => (
                <div key={f.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text2)' }}>{f.label}</span>
                    <span style={{ fontWeight: 700, color: f.color }}>{f.value} <span style={{ fontWeight: 400, color: 'var(--text2)' }}>({f.pct.toFixed(0)}%)</span></span>
                  </div>
                  <div style={{ height: 10, background: 'var(--bg-card2)', borderRadius: 20, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(f.pct, 100)}%`, height: '100%', background: f.color, borderRadius: 20, transition: 'width .4s' }} />
                  </div>
                  {i < funil.length - 1 && (
                    <div style={{ fontSize: 10, color: 'var(--text2)', textAlign: 'right', marginTop: 2 }}>
                      ↓ {funil[i + 1].pct.toFixed(0)}% de conversão
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Motivos não ativação */}
          <div style={{ ...card, padding: '20px' }}>
            {lbl('Motivos de Não Ativação')}
            {barMotivos.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text2)', fontSize: 13 }}>
                Nenhum motivo registrado
              </div>
            ) : (
              <BarChartH data={barMotivos} labelKey="label" valueKey="value" color1={COR.vermelho} color2={COR.amarelo} />
            )}
          </div>
        </div>

        {/* Linha 2: Barras agendadas vs realizadas */}
        {!isSdr && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ ...card, padding: '20px' }}>
              {lbl('Calls Agendadas por SDR')}
              <BarChartH data={barAgendadas} labelKey="label" valueKey="value" color1={COR.azul} color2="#5AB4FF" />
            </div>
            <div style={{ ...card, padding: '20px' }}>
              {lbl('Calls Realizadas por SDR')}
              <BarChartH data={barRealizadas} labelKey="label" valueKey="value" color1={COR.verde} color2="#7AE28C" />
            </div>
          </div>
        )}

        {/* Ranking SDRs */}
        {!isSdr && (
          <div style={{ ...card, padding: '20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Award size={14} color={COR.roxo} />
              {lbl('Ranking SDRs')}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card2)' }}>
                    {['#', 'SDR', 'Agendadas', 'Realizadas', 'No-show', 'Ativadas', '% Realiz.', '% Ativação', 'Score'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'SDR' || h === '#' ? 'left' : 'right',
                        fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                        letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sdrs.map((s, i) => (
                    <tr key={s.nome} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '11px 14px', fontWeight: 800, color: i < 3 ? ['#FFD600','#C0C0C0','#CD7F32'][i] : 'var(--text2)' }}>{i + 1}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 600 }}>{s.nome}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>{s.agendadas}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: COR.verde, fontWeight: 700 }}>{s.realizadas}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: s.noshow > 0 ? COR.amarelo : 'var(--text2)' }}>{s.noshow}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: COR.roxo, fontWeight: 700 }}>{s.ativadas}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <span style={{ color: pctColor(s.pctRealizacao, 80), fontWeight: 700 }}>{s.pctRealizacao.toFixed(1)}%</span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <span style={{ color: pctColor(s.pctAtivacao, 30), fontWeight: 700 }}>{s.pctAtivacao.toFixed(1)}%</span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <span style={{ background: `${pctColor(s.score, 50)}22`, color: pctColor(s.score, 50),
                          padding: '3px 9px', borderRadius: 20, fontWeight: 800, fontSize: 12 }}>{s.score}</span>
                      </td>
                    </tr>
                  ))}
                  {sdrs.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Nenhum dado para o período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Visão individual SDR */}
        {isSdr && sdrs.length > 0 && (() => {
          const s = sdrs[0]
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ ...card, padding: '20px' }}>
                {lbl('Meu Desempenho')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: '% Realização', val: s.pctRealizacao, meta: 80  },
                    { label: '% Ativação',   val: s.pctAtivacao,   meta: 30  },
                    { label: 'Score',        val: s.score,         meta: 50  },
                  ].map(({ label, val, meta }) => (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                        <span style={{ color: 'var(--text2)' }}>{label}</span>
                        <span style={{ fontWeight: 700, color: pctColor(val, meta) }}>{val.toFixed(1)}{label === 'Score' ? '' : '%'} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>/ meta {meta}{label === 'Score' ? '' : '%'}</span></span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-card2)', borderRadius: 20, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(val / meta * 100, 100)}%`, height: '100%', background: pctColor(val, meta), borderRadius: 20, transition: 'width .4s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ ...card, padding: '20px' }}>
                {lbl('Resumo do Mês')}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Agendadas',  val: s.agendadas,  color: COR.azul    },
                    { label: 'Realizadas', val: s.realizadas, color: COR.verde   },
                    { label: 'No-show',    val: s.noshow,     color: COR.amarelo },
                    { label: 'Ativadas',   val: s.ativadas,   color: COR.roxo    },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
