import { useEffect, useState } from 'react'
import { Header } from '../../components/Header'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { GOALS, metaColor } from '@/lib/goals'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import { BarChartH } from '@/components/ui/charts/BarChartH'
import { BarChartV } from '@/components/ui/charts/BarChartV'
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

type Preset = 'hoje' | '7d' | '15d' | 'mes' | 'custom'

const COR = { verde: '#34C759', amarelo: '#FF9F0A', vermelho: '#FF3B30', azul: '#2997FF', roxo: '#BF5AF2' }
const sdrNome = (nome: string | null) => nome || 'Geovana Paiva'
const pctColor = (p: number, meta: number) => p >= meta ? COR.verde : p >= meta * 0.6 ? COR.amarelo : COR.vermelho

const fmt = (d: Date) => d.toISOString().split('T')[0]
const sub = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

function getRange(preset: Preset, customFrom: string, customTo: string): { inicio: string; fim: string; label: string } {
  const today = new Date()
  if (preset === 'hoje') return { inicio: fmt(today), fim: fmt(today), label: 'Hoje' }
  if (preset === '7d')   return { inicio: sub(6),     fim: fmt(today), label: 'Últimos 7 dias' }
  if (preset === '15d')  return { inicio: sub(14),    fim: fmt(today), label: 'Últimos 15 dias' }
  if (preset === 'mes') {
    const mes = fmt(today).slice(0, 7)
    return { inicio: `${mes}-01`, fim: `${mes}-31`, label: new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
  }
  const from = customFrom || fmt(today)
  const to   = customTo   || fmt(today)
  return { inicio: from, fim: to, label: `${new Date(from + 'T12:00').toLocaleDateString('pt-BR')} – ${new Date(to + 'T12:00').toLocaleDateString('pt-BR')}` }
}

// ── Componente de filtro de data reutilizável ─────────────────────────────
export function DateRangeFilter({
  preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo,
}: {
  preset: Preset; onPreset: (p: Preset) => void
  customFrom: string; customTo: string
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void
}) {
  const presets: { key: Preset; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: '7d',   label: '7 dias' },
    { key: '15d',  label: '15 dias' },
    { key: 'mes',  label: 'Este mês' },
    { key: 'custom', label: 'Personalizado' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', background: 'var(--bg-card2)', borderRadius: 10, padding: 3, gap: 2 }}>
        {presets.map(p => (
          <button key={p.key} onClick={() => onPreset(p.key)}
            style={{ padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600, transition: 'all .15s',
              background: preset === p.key ? 'var(--action)' : 'transparent',
              color: preset === p.key ? '#fff' : 'var(--text2)' }}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12 }} />
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>até</span>
          <input type="date" value={customTo} onChange={e => onCustomTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12 }} />
        </div>
      )}
    </div>
  )
}

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

  const [preset,     setPreset]     = useState<Preset>('mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const { inicio, fim, label: rangeLabel } = getRange(preset, customFrom, customTo)

  useEffect(() => { load() }, [inicio, fim])

  async function load() {
    setIsLoading(true)
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
    const nome = sdrNome(c.sdr_nome)
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

  const motivosMap: Record<string, number> = {}
  base.filter(c => c.motivo_nao_ativacao).forEach(c => {
    const m = c.motivo_nao_ativacao!
    motivosMap[m] = (motivosMap[m] ?? 0) + 1
  })
  const barMotivos = Object.entries(motivosMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([label, value]) => ({ label: label.length > 22 ? label.slice(0, 20) + '…' : label, value }))

  const funil = [
    { label: 'Agendadas',  value: agendadas,  pct: 100,                                           color: COR.azul    },
    { label: 'Realizadas', value: realizadas, pct: agendadas > 0 ? realizadas/agendadas*100 : 0,  color: COR.verde   },
    { label: 'Ativadas',   value: ativadas,   pct: agendadas > 0 ? ativadas/agendadas*100 : 0,    color: COR.roxo    },
  ]

  // ── Agendadas por dia × SDR ───────────────────────────────────────────
  const agendadasPorDia = (() => {
    // Datas únicas ordenadas
    const datas = [...new Set(base.map(c => c.date))].sort()
    // SDRs únicos ordenados
    const sdrNomes = [...new Set(base.map(c => sdrNome(c.sdr_nome)))].sort()
    // Mapa data → sdr_nome → contagem
    const grid: Record<string, Record<string, number>> = {}
    base.forEach(c => {
      const d = c.date
      const s = sdrNome(c.sdr_nome)
      if (!grid[d]) grid[d] = {}
      grid[d][s] = (grid[d][s] ?? 0) + 1
    })
    return { datas, sdrNomes, grid }
  })()

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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              {onBack && <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>}
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
                {isSdr ? `Dashboard — ${user?.name}` : 'Dashboard SDR'}
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
              {rangeLabel} · {agendadas} calls no período
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <DateRangeFilter
              preset={preset} onPreset={setPreset}
              customFrom={customFrom} customTo={customTo}
              onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}
            />
            <button onClick={refresh} disabled={isRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
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

        {/* Meta do mês — SDR */}
        {preset === 'mes' && (
          <div style={{ ...card, padding: '20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>🎯 Meta do mês — SDR</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)' }}>
                <span>Agendadas: <strong style={{ color: 'var(--text)' }}>{GOALS.sdr.reunioes_agendadas_mes}</strong></span>
                <span>Realizadas: <strong style={{ color: 'var(--text)' }}>{GOALS.sdr.reunioes_realizadas_mes}</strong></span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: sdrs.length > 0 && !isSdr ? 14 : 0 }}>
              {[
                { label: 'Agendadas (time)', val: agendadas, meta: GOALS.sdr.reunioes_agendadas_mes },
                { label: 'Realizadas (time)', val: realizadas, meta: GOALS.sdr.reunioes_realizadas_mes },
              ].map(({ label, val, meta }) => {
                const pct = Math.min(100, (val / meta) * 100)
                const cor = metaColor(pct, 1)
                return (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontWeight: 800, color: cor }}>{val} / {meta}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-card2)', borderRadius: 20, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 20, transition: 'width .4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {!isSdr && sdrs.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {sdrs.map(s => {
                  const pctAg = Math.min(100, (s.agendadas / GOALS.sdr.reunioes_agendadas_mes) * 100)
                  const pctRe = Math.min(100, (s.realizadas / GOALS.sdr.reunioes_realizadas_mes) * 100)
                  const corAg = metaColor(pctAg, 1)
                  const corRe = metaColor(pctRe, 1)
                  return (
                    <div key={s.nome} style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{s.nome.split(' ')[0]}</div>
                      {([
                        { label: 'Agendadas', val: s.agendadas, meta: GOALS.sdr.reunioes_agendadas_mes, cor: corAg, pct: pctAg },
                        { label: 'Realizadas', val: s.realizadas, meta: GOALS.sdr.reunioes_realizadas_mes, cor: corRe, pct: pctRe },
                      ] as const).map(({ label, val, meta, cor, pct }) => (
                        <div key={label} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: 'var(--text2)' }}>{label}</span>
                            <span style={{ fontWeight: 700, color: cor }}>{val}/{meta}</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 20, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 20, transition: 'width .4s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Linha 1: Donut + Funil + Motivos */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 220px 1fr', gap: 16, marginBottom: 16 }}>

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

        {/* Agendadas por dia × SDR */}
        {agendadasPorDia.datas.length > 0 && (
          <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Reuniões Agendadas por Dia
              </div>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                Total: <strong style={{ color: COR.azul }}>{agendadas}</strong>
                {agendadasPorDia.datas.length > 1 && (
                  <> · Média: <strong style={{ color: 'var(--text)' }}>
                    {(agendadas / agendadasPorDia.datas.length).toFixed(1)}/dia
                  </strong></>
                )}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card2)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                      Data
                    </th>
                    {agendadasPorDia.sdrNomes.map(sdr => (
                      <th key={sdr} style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: COR.azul, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                        {sdr.split(' ')[0]}
                      </th>
                    ))}
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agendadasPorDia.datas.map((date, i) => {
                    const total = agendadasPorDia.sdrNomes.reduce((s, sdr) => s + (agendadasPorDia.grid[date]?.[sdr] ?? 0), 0)
                    return (
                      <tr key={date}
                        style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card2)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${COR.azul} 6%, var(--bg-card2))`)}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-card2)')}>
                        <td style={{ padding: '10px 16px', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                          {new Date(date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </td>
                        {agendadasPorDia.sdrNomes.map(sdr => {
                          const val = agendadasPorDia.grid[date]?.[sdr] ?? 0
                          return (
                            <td key={sdr} style={{ padding: '10px 16px', textAlign: 'center' }}>
                              {val > 0
                                ? <span style={{ fontWeight: 800, color: COR.azul, background: `${COR.azul}18`, borderRadius: 20, padding: '2px 10px', fontSize: 13 }}>{val}</span>
                                : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>
                              }
                            </td>
                          )
                        })}
                        <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: total > 0 ? 'var(--text)' : 'var(--text2)' }}>
                          {total || '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Linha de totais */}
                  <tr style={{ background: 'var(--bg-card2)', borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '11px 16px', fontWeight: 700, fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      Total
                    </td>
                    {agendadasPorDia.sdrNomes.map(sdr => {
                      const total = agendadasPorDia.datas.reduce((s, d) => s + (agendadasPorDia.grid[d]?.[sdr] ?? 0), 0)
                      return (
                        <td key={sdr} style={{ padding: '11px 16px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: COR.azul }}>{total}</span>
                        </td>
                      )
                    })}
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{agendadas}</span>
                    </td>
                  </tr>
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
                {lbl('Resumo do Período')}
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
