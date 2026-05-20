import { useEffect, useState } from 'react'
import { Header } from '../../components/Header'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { getMbClientes, getMbDailyTpv, invalidateMbCache } from '@/lib/mbCache'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import { BarChartH } from '@/components/ui/charts/BarChartH'
import { LineAreaChart } from '@/components/ui/charts/LineAreaChart'
import { TrendingUp, Users, DollarSign, AlertTriangle, CheckCircle, MessageSquare, RefreshCw, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Cliente {
  gerente: string; nome: string; email: string; telefone: string
  faturamento: number; tpv_mes: number | null; ultima_venda: string | null
  previsao_faturamento: number
}
interface Nota {
  email: string; motivo: string; observacao: string
  proxima_acao: string; data_contato: string | null
}

const BRL  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const PCT  = (v: number) => `${v.toFixed(1)}%`
const COR  = { verde: '#34C759', amarelo: '#FF9F0A', vermelho: '#FF3B30', azul: '#2997FF', roxo: '#BF5AF2' }

// Mapeamento nome do gerente → account_manager_id no Metabase
const GERENTE_AM_ID: Record<string, number> = {
  'Rafael Mendes':  4204072,
  'Isaac':          5843493,
  'Gabriel Bairros':5726885,
}

const pctColor = (p: number | null) =>
  p === null ? 'var(--text2)' : p >= 80 ? COR.verde : p >= 50 ? COR.amarelo : COR.vermelho

export default function DashboardGC() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  if (!hasAnyRole(user, ['Admin', 'Gerente de Contas'])) {
    return <><Header /><div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>Acesso restrito.</div></>
  }
  return <DashGCContent />
}

export function DashGCContent({ onBack }: { onBack?: () => void } = {}) {
  const { user } = useAuth()
  const isAdmin = hasAnyRole(user, ['Admin'])
  const gcNome  = !isAdmin ? (user?.name ?? '') : null

  const [clientes,  setClientes]  = useState<Cliente[]>([])
  const [notas,     setNotas]     = useState<Nota[]>([])
  const [dailyTpv,  setDailyTpv]  = useState<{ label: string; value: number; acumulado: number }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefresh, setIsRefresh] = useState(false)
  const [gerente,   setGerente]   = useState('todos')
  const [mes,       setMes]       = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => { load() }, [])
  useEffect(() => { loadDailyTpv() }, [mes, gerente, gcNome])

  async function load(forceRefresh = false) {
    setIsLoading(true)
    const [clientes, { data: nd }] = await Promise.all([
      getMbClientes(forceRefresh),
      supabase.from('carteira_notas').select('*'),
    ])
    setClientes(clientes as Cliente[])
    if (nd) setNotas(nd)
    setIsLoading(false)
  }

  async function loadDailyTpv() {
    // Determina quais account_manager_ids buscar
    let amIds: number[] = []
    if (gcNome) {
      const id = GERENTE_AM_ID[gcNome]
      if (id) amIds = [id]
      else return setDailyTpv([])
    } else if (gerente !== 'todos') {
      const id = GERENTE_AM_ID[gerente]
      if (id) amIds = [id]
    }
    // amIds vazio = todos os gerentes

    const daily = await getMbDailyTpv(mes, amIds)
    if (!daily) return setDailyTpv([])

    const [y, m] = mes.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    let acumulado = 0
    const points = Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, '0')
      const dateStr = `${mes}-${day}`
      const val = Number((daily as Record<string, unknown>)[dateStr] ?? 0)
      acumulado += val
      return {
        label: `${String(i + 1).padStart(2, '0')}/${m.toString().padStart(2, '0')}`,
        value: val,
        acumulado,
      }
    })
    setDailyTpv(points)
  }

  const refresh = async () => {
    setIsRefresh(true)
    invalidateMbCache()
    await supabase.functions.invoke('calcular-tpv', { body: { limite: 30 } })
    await Promise.all([load(true), loadDailyTpv()])
    setIsRefresh(false)
  }

  const gerentes = [...new Set(clientes.map(c => c.gerente))].sort()
  const base = clientes.filter(c =>
    gcNome ? c.gerente === gcNome : (gerente === 'todos' || c.gerente === gerente)
  )
  const notaMap = Object.fromEntries(notas.map(n => [n.email, n]))

  const getPct = (c: Cliente) =>
    c.previsao_faturamento > 0 ? Math.min((c.tpv_mes ?? 0) / c.previsao_faturamento * 100, 999) : null

  const total     = base.length
  const tpvTotal  = base.reduce((s, c) => s + (c.tpv_mes ?? 0), 0)
  const prevTotal = base.reduce((s, c) => s + c.previsao_faturamento, 0)
  const pctGeral  = prevTotal > 0 ? tpvTotal / prevTotal * 100 : 0
  const comNota   = base.filter(c => notaMap[c.email]).length
  const verdes    = base.filter(c => { const p = getPct(c); return p !== null && p >= 80 }).length
  const amarelos  = base.filter(c => { const p = getPct(c); return p !== null && p >= 50 && p < 80 }).length
  const vermelhos = base.filter(c => { const p = getPct(c); return p !== null && p < 50 }).length
  const semPrev   = base.filter(c => !c.previsao_faturamento).length

  const donutStatus = [
    { label: '≥ 80%',    value: verdes,    color: COR.verde    },
    { label: '50–79%',   value: amarelos,  color: COR.amarelo  },
    { label: '< 50%',    value: vermelhos, color: COR.vermelho },
    { label: 'Sem prev', value: semPrev,   color: '#636366'    },
  ].filter(d => d.value > 0)

  const donutNotas = [
    { label: 'Com nota', value: comNota,         color: COR.azul  },
    { label: 'Sem nota', value: total - comNota, color: '#3A3A3C' },
  ]

  const motivosMap: Record<string, number> = {}
  notas.forEach(n => {
    if (!n.motivo || !base.find(c => c.email === n.email)) return
    motivosMap[n.motivo] = (motivosMap[n.motivo] ?? 0) + 1
  })
  const barMotivos = Object.entries(motivosMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([label, value]) => ({ label: label.length > 22 ? label.slice(0, 20) + '…' : label, value }))

  const emAlerta = base
    .filter(c => { const p = getPct(c); return p !== null && p < 50 })
    .sort((a, b) => (getPct(a) ?? 0) - (getPct(b) ?? 0))
    .slice(0, 7)

  const topCli = [...base]
    .filter(c => getPct(c) !== null)
    .sort((a, b) => (b.tpv_mes ?? 0) - (a.tpv_mes ?? 0))
    .slice(0, 5)

  const ultimosContatos = notas
    .filter(n => base.find(c => c.email === n.email) && n.data_contato)
    .sort((a, b) => new Date(b.data_contato!).getTime() - new Date(a.data_contato!).getTime())
    .slice(0, 5)

  // Métricas do gráfico diário
  const tpvAcumulado = dailyTpv[dailyTpv.length - 1]?.acumulado ?? 0
  const melhorDia    = dailyTpv.reduce((best, d) => d.value > best.value ? d : best, { label: '—', value: 0, acumulado: 0 })
  const diasComVenda = dailyTpv.filter(d => d.value > 0).length
  const [hoveredBar, setHoveredBar] = useState<{ idx: number; x: number; y: number } | null>(null)

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }

  if (isLoading) return (
    <><Header /><div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>Carregando...</div></>
  )

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>

        {/* Topo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {onBack && <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>}
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                {gcNome ? `Dashboard — ${gcNome}` : 'Dashboard Gerente de Contas'}
              </h1>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
              {new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · {total} clientes na carteira
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={mes} onChange={e => setMes(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }} />
            {isAdmin && (
              <select value={gerente} onChange={e => setGerente(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }}>
                <option value="todos">Todos os gerentes</option>
                {gerentes.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            <button onClick={refresh} disabled={isRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
              <RefreshCw size={14} style={{ animation: isRefresh ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Cards métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { icon: <Users size={16} color={COR.azul} />,           label: 'Clientes',   val: String(total),   sub: 'na carteira',                                  color: 'var(--text)' },
            { icon: <DollarSign size={16} color={COR.verde} />,      label: 'TPV Mês',    val: BRL(tpvTotal),   sub: 'realizado',                                    color: COR.verde     },
            { icon: <TrendingUp size={16} color={COR.roxo} />,       label: 'Prev. Fat.', val: BRL(prevTotal),  sub: 'previsto',                                     color: COR.roxo      },
            { icon: <TrendingUp size={16} color={pctColor(pctGeral)} />, label: '% Geral', val: PCT(pctGeral),  sub: pctGeral >= 80 ? '↑ acima da meta' : '↓ abaixo da meta', color: pctColor(pctGeral) },
            { icon: <MessageSquare size={16} color={COR.amarelo} />, label: 'Cobertura',  val: `${comNota}/${total}`, sub: `${total - comNota} sem nota`,             color: COR.amarelo   },
          ].map(({ icon, label, val, sub, color }) => (
            <div key={label} style={{ ...card, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-card2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Gráfico: faturamento diário da carteira */}
        <div style={{ ...card, padding: '20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                Faturamento Diário da Carteira
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                {new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Acumulado</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: COR.verde }}>{BRL(tpvAcumulado)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Melhor dia</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: COR.azul }}>{BRL(melhorDia.value)}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{melhorDia.label}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Dias com venda</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: COR.roxo }}>{diasComVenda}</div>
              </div>
            </div>
          </div>

          {(() => {
            const [y, m]      = mes.split('-').map(Number)
            const daysInMonth = new Date(y, m, 0).getDate()
            const dailyTarget = prevTotal > 0 ? prevTotal / daysInMonth : 0
            const maxVal      = Math.max(...dailyTpv.map(x => x.value), dailyTarget, 1)
            const maxAcum     = Math.max(prevTotal, dailyTpv[dailyTpv.length - 1]?.acumulado ?? 0, 1)
            const BAR_H       = 110
            const LINE_H      = 90
            const W = 400, PAD = { top: 12, bottom: 24, left: 8, right: 8 }
            const chartW = W - PAD.left - PAD.right
            const chartH = LINE_H - PAD.top - PAD.bottom

            // Pontos da linha acumulada real
            const realPts = dailyTpv.map((d, i) => ({
              x: PAD.left + (i / (dailyTpv.length - 1 || 1)) * chartW,
              y: PAD.top + chartH - Math.min((d.acumulado / maxAcum) * chartH, chartH),
            }))
            // Pontos da linha de meta acumulada (prev / dias * dia)
            const metaPts = dailyTpv.map((d, i) => ({
              x: PAD.left + (i / (dailyTpv.length - 1 || 1)) * chartW,
              y: PAD.top + chartH - Math.min(((dailyTarget * (i + 1)) / maxAcum) * chartH, chartH),
            }))
            const realPath = realPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
            const metaPath = metaPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
            const areaPath = realPts.length
              ? `${realPath} L${realPts[realPts.length-1].x},${PAD.top+chartH} L${realPts[0].x},${PAD.top+chartH} Z`
              : ''
            const targetBarH = dailyTarget > 0 ? Math.min(BAR_H - 10, (dailyTarget / maxVal) * (BAR_H - 10)) : 0

            return dailyTpv.every(d => d.value === 0) ? (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 13 }}>
                Sem faturamento registrado neste mês
              </div>
            ) : (
              <>
                {/* Barras + linha de meta diária */}
                <div style={{ position: 'relative' }} onMouseLeave={() => setHoveredBar(null)}>

                  {/* Tooltip */}
                  {hoveredBar !== null && dailyTpv[hoveredBar.idx] && (() => {
                    const d = dailyTpv[hoveredBar.idx]
                    const pct = hoveredBar.idx / (dailyTpv.length - 1)
                    const leftPct = Math.min(Math.max(pct * 100, 5), 78)
                    const metaAcum = dailyTarget * (hoveredBar.idx + 1)
                    const diff = d.acumulado - metaAcum
                    return (
                      <div style={{
                        position: 'absolute', top: 0, left: `${leftPct}%`,
                        transform: 'translateY(-105%)',
                        background: '#1e293b', border: '1px solid var(--border)', borderRadius: 10,
                        padding: '10px 14px', zIndex: 100, pointerEvents: 'none', minWidth: 168,
                        boxShadow: '0 8px 24px rgba(0,0,0,.6)',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>{d.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: d.value > 0 ? COR.verde : 'var(--text2)' }}>{BRL(d.value)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                          Meta dia: <span style={{ fontWeight: 700, color: COR.amarelo }}>{BRL(dailyTarget)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                          Acumulado: <span style={{ fontWeight: 700, color: COR.azul }}>{BRL(d.acumulado)}</span>
                        </div>
                        {prevTotal > 0 && (
                          <div style={{ fontSize: 11, marginTop: 2, fontWeight: 700, color: diff >= 0 ? COR.verde : COR.vermelho }}>
                            {diff >= 0 ? `+${BRL(diff)} acima` : `${BRL(Math.abs(diff))} abaixo`} da meta
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Linha de meta diária nas barras */}
                  {targetBarH > 0 && (
                    <div style={{
                      position: 'absolute', left: 4, right: 4,
                      bottom: targetBarH,
                      height: 0,
                      borderTop: `2px dashed ${COR.amarelo}`,
                      opacity: 0.8,
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}>
                      <span style={{
                        position: 'absolute', right: 0, top: -18,
                        fontSize: 9, fontWeight: 700, color: COR.amarelo,
                        background: '#1e293b', padding: '1px 5px', borderRadius: 4,
                      }}>{BRL(dailyTarget)}/dia</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: BAR_H, marginBottom: 4, padding: '0 4px' }}>
                    {dailyTpv.map((d, i) => {
                      const h = d.value > 0 ? Math.max(4, (d.value / maxVal) * (BAR_H - 10)) : 2
                      const isHoje   = d.label === new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                      const isHovered = hoveredBar?.idx === i
                      const aboveMeta = d.value >= dailyTarget && dailyTarget > 0
                      return (
                        <div key={i} onMouseEnter={() => setHoveredBar({ idx: i, x: 0, y: 0 })}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', cursor: 'crosshair', height: BAR_H }}>
                          <div style={{
                            width: isHovered ? '92%' : '78%', height: h,
                            background: isHovered ? '#fff'
                              : aboveMeta ? COR.verde
                              : isHoje    ? COR.amarelo
                              : d.value > 0 ? `color-mix(in srgb, ${COR.vermelho} 60%, ${COR.amarelo})`
                              : 'var(--border)',
                            borderRadius: '3px 3px 0 0',
                            opacity: d.value === 0 ? 0.2 : 1,
                            transition: 'width .1s, background .1s',
                          }} />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Gráfico acumulado vs meta acumulada */}
                <svg viewBox={`0 0 ${W} ${LINE_H}`} style={{ width: '100%', height: LINE_H }} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gcRealGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR.azul} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={COR.azul} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {areaPath && <path d={areaPath} fill="url(#gcRealGrad)" />}
                  {realPath && <path d={realPath} fill="none" stroke={COR.azul} strokeWidth="2" style={{ filter: `drop-shadow(0 0 5px ${COR.azul}88)` }} />}
                  {metaPath && <path d={metaPath} fill="none" stroke={COR.amarelo} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.85" />}
                  {realPts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={COR.azul} stroke="var(--bg-card)" strokeWidth={1.5} />
                  ))}
                  {/* Labels eixo x */}
                  {dailyTpv.map((d, i) => i % Math.ceil(dailyTpv.length / 6) === 0 && (
                    <text key={i} x={realPts[i].x} y={LINE_H - 6} textAnchor="middle" fontSize={9} fill="var(--text2)">{d.label}</text>
                  ))}
                </svg>

                {/* Legenda */}
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
                    <span style={{ width: 10, height: 10, background: COR.verde, borderRadius: 2, display: 'inline-block' }} />
                    Acima da meta
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
                    <span style={{ width: 10, height: 10, background: `color-mix(in srgb, ${COR.vermelho} 60%, ${COR.amarelo})`, borderRadius: 2, display: 'inline-block' }} />
                    Abaixo da meta
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
                    <span style={{ width: 12, height: 3, background: COR.azul, borderRadius: 2, display: 'inline-block' }} />
                    Acumulado real
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
                    <span style={{ width: 14, height: 0, borderTop: `2px dashed ${COR.amarelo}`, display: 'inline-block' }} />
                    Meta acumulada
                  </div>
                </div>
              </>
            )
          })()}
        </div>

        {/* Linha 1: Donuts + Motivos */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 220px 1fr', gap: 16, marginBottom: 16 }}>

          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>Distribuição</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <DonutChart data={donutStatus} size={130} thickness={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: '≥ 80%',     value: verdes,    color: COR.verde    },
                { label: '50–79%',    value: amarelos,  color: COR.amarelo  },
                { label: '< 50%',     value: vermelhos, color: COR.vermelho },
                { label: 'Sem prev.', value: semPrev,   color: '#636366'    },
              ].map(e => (
                <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.color, display: 'inline-block' }} />{e.label}
                  </span>
                  <strong style={{ color: e.color }}>{e.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>Cobertura de Notas</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <DonutChart data={donutNotas} size={130} thickness={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: COR.azul, display: 'inline-block' }} />Com nota
                </span>
                <strong style={{ color: COR.azul }}>{comNota} ({total > 0 ? ((comNota / total) * 100).toFixed(0) : 0}%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#636366', display: 'inline-block' }} />Sem nota
                </span>
                <strong style={{ color: 'var(--text2)' }}>{total - comNota}</strong>
              </div>
            </div>
          </div>

          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>Motivos de Baixo Faturamento</div>
            {barMotivos.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, color: 'var(--text2)', fontSize: 13, gap: 8 }}>
                <MessageSquare size={24} color="var(--text2)" />
                Nenhuma nota registrada ainda
              </div>
            ) : (
              <BarChartH data={barMotivos} labelKey="label" valueKey="value" color1={COR.vermelho} color2={COR.amarelo} />
            )}
          </div>
        </div>

        {/* Linha 2: Alerta + Top performers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

          <div style={{ ...card, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <AlertTriangle size={14} color={COR.vermelho} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Clientes em Alerta — &lt; 50%</span>
            </div>
            {emAlerta.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                <CheckCircle size={28} color={COR.verde} style={{ display: 'block', margin: '0 auto 8px' }} />
                Nenhum cliente em alerta!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {emAlerta.map(c => {
                  const pct  = getPct(c)
                  const nota = notaMap[c.email]
                  return (
                    <div key={c.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: '#FF3B3010', border: '1px solid #FF3B3025' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                        <div style={{ fontSize: 11, color: nota?.motivo ? COR.vermelho : 'var(--text2)', marginTop: 2 }}>
                          {nota?.motivo ?? 'Sem nota registrada'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: COR.vermelho }}>{pct !== null ? PCT(pct) : '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.tpv_mes ? BRL(c.tpv_mes) : '—'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ ...card, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <TrendingUp size={14} color={COR.verde} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Top Clientes por TPV</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topCli.map((c, i) => {
                const pct = getPct(c)
                return (
                  <div key={c.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-card2)' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#FFD60022' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: i === 0 ? '#FFD600' : 'var(--text2)', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{BRL(c.previsao_faturamento)} previsto</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: COR.verde }}>{BRL(c.tpv_mes ?? 0)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: pctColor(pct) }}>{pct !== null ? PCT(pct) : '—'}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Últimos contatos */}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <MessageSquare size={14} color={COR.azul} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Últimos Contatos Registrados</span>
          </div>
          {ultimosContatos.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Nenhum contato registrado ainda.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {ultimosContatos.map(n => {
                const cli = base.find(c => c.email === n.email)
                const pct = cli ? getPct(cli) : null
                return (
                  <div key={n.email} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-card2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{cli?.nome ?? n.email}</div>
                    {n.motivo && <div style={{ fontSize: 11, color: COR.vermelho, marginBottom: 4 }}>{n.motivo}</div>}
                    {n.proxima_acao && <div style={{ fontSize: 11, color: COR.azul, marginBottom: 6 }}>→ {n.proxima_acao.length > 38 ? n.proxima_acao.slice(0, 36) + '…' : n.proxima_acao}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--text2)' }}>
                        {n.data_contato ? new Date(n.data_contato).toLocaleDateString('pt-BR') : '—'}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(pct) }}>{pct !== null ? PCT(pct) : '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
