import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Loader2, Users, TrendingUp, Zap, DollarSign } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { KpiCard } from '@/components/ui/KpiCard'
import { BarChartH } from '@/components/ui/charts/BarChartH'
import { BarChartV } from '@/components/ui/charts/BarChartV'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import { supabase } from '@/lib/supabase/client'

// ── Constants ──────────────────────────────────────────────────────────────────
const DATA_INICIO_REGRA = '2026-04-01'

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmt = (d: Date) => d.toISOString().split('T')[0]
const sub = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

// ── Types ──────────────────────────────────────────────────────────────────────
type Preset = 'hoje' | '7d' | '30d' | 'mes' | 'custom'

interface RawActivation {
  id: string
  client: string
  email: string | null
  responsible: string
  date: string
  channel: string | null
  faturamento_mensal: number | null
  gerente_id: string | null
  gc_status: string | null
  welcome_sent: boolean | null
}

interface RawUser {
  id: string
  name: string
  email: string | null
  role: string
  team_id: string | null
  active: boolean
}

interface RawTeam {
  id: string
  name: string
}

interface RawTpvCache {
  closer_email: string
  tpv_30_dias: number | null
  tpv_7_dias: number | null
  bonus_closer: number | null
  cliente_email: string
  data_fechamento: string | null
  time_id: string | null
}

interface CloserRow {
  id: string
  name: string
  email: string | null
  team_id: string | null
  teamName: string
  ativacoes: number
  fatPrevisto: number
  ticketMedio: number
  tpv30d: number
  bonus: number
}

// ── Date range helper ──────────────────────────────────────────────────────────
function getRange(preset: Preset, customFrom: string, customTo: string): { inicio: string; fim: string; label: string } {
  const today = new Date()
  if (preset === 'hoje') return { inicio: fmt(today), fim: fmt(today), label: 'Hoje' }
  if (preset === '7d')   return { inicio: sub(6),     fim: fmt(today), label: 'Últimos 7 dias' }
  if (preset === '30d')  return { inicio: sub(29),    fim: fmt(today), label: 'Últimos 30 dias' }
  if (preset === 'mes') {
    const mes = fmt(today).slice(0, 7)
    return {
      inicio: `${mes}-01`,
      fim: `${mes}-31`,
      label: new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    }
  }
  const from = customFrom || fmt(today)
  const to   = customTo   || fmt(today)
  return {
    inicio: from,
    fim: to,
    label: `${new Date(from + 'T12:00').toLocaleDateString('pt-BR')} – ${new Date(to + 'T12:00').toLocaleDateString('pt-BR')}`,
  }
}

// ── DateRangeFilter ────────────────────────────────────────────────────────────
function DateRangeFilter({
  preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo,
}: {
  preset: Preset; onPreset: (p: Preset) => void
  customFrom: string; customTo: string
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void
}) {
  const presets: { key: Preset; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: '7d',   label: '7d' },
    { key: '30d',  label: '30d' },
    { key: 'mes',  label: 'Mês atual' },
    { key: 'custom', label: 'Personalizado' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', background: 'var(--bg-card2)', borderRadius: 10, padding: 3, gap: 2 }}>
        {presets.map(p => (
          <button key={p.key} onClick={() => onPreset(p.key)}
            style={{
              padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, transition: 'all .15s',
              background: preset === p.key ? '#F59E0B' : 'transparent',
              color: preset === p.key ? '#fff' : 'var(--text2)',
            }}>
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

// ══════════════════════════════════════════════════════════════════════════════
export default function DashboardClosers() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null

  return <DashboardClosersContent />
}

// ── Main content ───────────────────────────────────────────────────────────────
function DashboardClosersContent() {
  const navigate = useNavigate()

  // ── Filter state ────────────────────────────────────────────────────────────
  const [preset,     setPreset]     = useState<Preset>('mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const { inicio, fim, label: rangeLabel } = getRange(preset, customFrom, customTo)

  // ── Raw data ────────────────────────────────────────────────────────────────
  const [activations, setActivations] = useState<RawActivation[]>([])
  const [users,       setUsers]       = useState<RawUser[]>([])
  const [teams,       setTeams]       = useState<RawTeam[]>([])
  const [tpvCache,    setTpvCache]    = useState<RawTpvCache[]>([])
  const [isLoading,   setIsLoading]   = useState(true)

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [
        { data: acts },
        { data: usrs },
        { data: tms },
        { data: tpv },
      ] = await Promise.all([
        supabase
          .from('activations')
          .select('id,client,email,responsible,date,channel,faturamento_mensal,gerente_id,gc_status,welcome_sent')
          .gte('date', inicio)
          .lte('date', fim),
        supabase
          .from('users')
          .select('id,name,email,role,team_id,active'),
        supabase
          .from('teams')
          .select('id,name'),
        supabase
          .from('tpv_cache')
          .select('closer_email,tpv_30_dias,tpv_7_dias,bonus_closer,cliente_email,data_fechamento,time_id')
          .gte('data_fechamento', DATA_INICIO_REGRA),
      ])
      setActivations((acts ?? []) as RawActivation[])
      setUsers((usrs ?? []) as RawUser[])
      setTeams((tms ?? []) as RawTeam[])
      setTpvCache((tpv ?? []) as RawTpvCache[])
      setIsLoading(false)
    }
    load()
  }, [inicio, fim])

  // ── Derived: closers ────────────────────────────────────────────────────────
  const closers = useMemo(() => users.filter(u => u.role === 'Closer' && u.active), [users])

  const teamMap = useMemo(() => {
    const m: Record<string, string> = {}
    teams.forEach(t => { m[t.id] = t.name })
    return m
  }, [teams])

  // ── Derived: closer rows (for ranking table) ────────────────────────────────
  const closerRows = useMemo((): CloserRow[] => {
    return closers.map(closer => {
      const myActs = activations.filter(a => a.responsible === closer.id)
      const fatPrevisto = myActs.reduce((s, a) => s + (a.faturamento_mensal ?? 0), 0)
      const ativacoes = myActs.length
      const ticketMedio = ativacoes > 0 ? fatPrevisto / ativacoes : 0

      // TPV: sum tpv_30_dias where closer_email matches
      const myTpv = tpvCache.filter(t => t.closer_email === closer.email)
      const tpv30d = myTpv.reduce((s, t) => s + (t.tpv_30_dias ?? 0), 0)
      const bonus  = myTpv.reduce((s, t) => s + (t.bonus_closer ?? 0), 0)

      return {
        id: closer.id,
        name: closer.name,
        email: closer.email,
        team_id: closer.team_id,
        teamName: closer.team_id ? (teamMap[closer.team_id] ?? '—') : '—',
        ativacoes,
        fatPrevisto,
        ticketMedio,
        tpv30d,
        bonus,
      }
    }).sort((a, b) => b.ativacoes - a.ativacoes)
  }, [closers, activations, tpvCache, teamMap])

  // ── KPI aggregates ──────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalAtivacoes   = activations.length
    const fatTotal         = activations.reduce((s, a) => s + (a.faturamento_mensal ?? 0), 0)
    const ticketMedioGeral = totalAtivacoes > 0 ? fatTotal / totalAtivacoes : 0
    const tpvTotal30d      = tpvCache.reduce((s, t) => s + (t.tpv_30_dias ?? 0), 0)
    const bonusTotal       = tpvCache.reduce((s, t) => s + (t.bonus_closer ?? 0), 0)
    return { totalAtivacoes, fatTotal, ticketMedioGeral, tpvTotal30d, bonusTotal }
  }, [activations, tpvCache])

  // ── Chart: ativações por dia ────────────────────────────────────────────────
  const ativacoesPorDia = useMemo(() => {
    const map: Record<string, number> = {}
    activations.forEach(a => { map[a.date] = (map[a.date] ?? 0) + 1 })
    const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
    return entries.map(([date, value]) => ({
      label: new Date(date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      value,
    }))
  }, [activations])

  // ── Chart: por canal ────────────────────────────────────────────────────────
  const porCanal = useMemo(() => {
    const map: Record<string, number> = {}
    activations.forEach(a => {
      const ch = a.channel ?? 'Não informado'
      map[ch] = (map[ch] ?? 0) + 1
    })
    const CANAL_COLORS = ['#F59E0B', '#2997FF', '#34C759', '#BF5AF2', '#FF3B30', '#FF9F0A']
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value], i) => ({ label, value, color: CANAL_COLORS[i % CANAL_COLORS.length] }))
      .filter(d => d.value > 0)
  }, [activations])

  // ── Chart: ranking horizontal (top 8 closers) ──────────────────────────────
  const rankingBarData = useMemo(() =>
    closerRows
      .slice(0, 8)
      .map(r => ({ label: r.name.split(' ')[0], value: r.ativacoes })),
    [closerRows]
  )

  // ── Chart: por funil ────────────────────────────────────────────────────────
  const porFunil = useMemo(() => {
    let starter = 0, growth = 0, enterprise = 0
    activations.forEach(a => {
      const fat = a.faturamento_mensal ?? 0
      if (fat <= 50_000)       starter++
      else if (fat <= 250_000) growth++
      else                     enterprise++
    })
    return [
      { label: 'Starter (≤50k)',      value: starter,    color: '#34C759' },
      { label: 'Growth (≤250k)',      value: growth,     color: '#2997FF' },
      { label: 'Enterprise (>250k)',  value: enterprise, color: '#BF5AF2' },
    ].filter(d => d.value > 0)
  }, [activations])

  // ── GC Status breakdown ─────────────────────────────────────────────────────
  const gcStatus = useMemo(() => {
    const counts: Record<string, number> = {}
    activations.forEach(a => {
      const s = a.gc_status ?? 'Não definido'
      counts[s] = (counts[s] ?? 0) + 1
    })
    return counts
  }, [activations])

  // ── % Fat vs TPV ────────────────────────────────────────────────────────────
  function pctFatVsTpv(fat: number, tpv: number): string {
    if (tpv <= 0) return '—'
    return `${Math.round((fat / tpv) * 100)}%`
  }
  function pctColor(fat: number, tpv: number): string {
    if (tpv <= 0) return 'var(--text2)'
    const r = fat / tpv
    if (r >= 0.8) return '#34C759'
    if (r >= 0.5) return '#F59E0B'
    return '#FF3B30'
  }

  // ── Medal ────────────────────────────────────────────────────────────────────
  const MEDALS = ['🥇', '🥈', '🥉']

  // ── GC status card definitions ──────────────────────────────────────────────
  const GC_CARDS = [
    { label: 'Cliente novo',        keys: ['Cliente novo',        'Novo'],        color: '#2997FF' },
    { label: 'Cliente atendido',    keys: ['Cliente atendido',    'Atendido'],    color: '#34C759' },
    { label: 'Cliente faturando',   keys: ['Cliente faturando',   'Faturando'],   color: '#BF5AF2' },
    { label: 'Reunião agendada',    keys: ['Reunião agendada',    'Reunião'],     color: '#F59E0B' },
  ]

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando Dashboard Closers…</span>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </>
    )
  }

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
  }

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Button variant="ghost" icon={ChevronLeft} onClick={() => navigate('/dashboards')}>Voltar</Button>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Dashboard Closers</h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
              {rangeLabel} · {kpi.totalAtivacoes} ativações · {closers.length} closers ativos
            </p>
          </div>
          <DateRangeFilter
            preset={preset} onPreset={setPreset}
            customFrom={customFrom} customTo={customTo}
            onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}
          />
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <KpiCard
            label="Closers Ativos"
            value={closers.length}
            icon={Users}
            color="#F59E0B"
          />
          <KpiCard
            label="Total Ativações"
            value={kpi.totalAtivacoes}
            icon={Zap}
            color="#2997FF"
          />
          <KpiCard
            label="Fat. Previsto Total"
            value={BRL(kpi.fatTotal)}
            icon={DollarSign}
            color="#34C759"
            valueSize={22}
          />
          <KpiCard
            label="Ticket Médio"
            value={BRL(kpi.ticketMedioGeral)}
            icon={TrendingUp}
            color="#F59E0B"
            valueSize={22}
          />
          <KpiCard
            label="TPV Total 30d"
            value={BRL(kpi.tpvTotal30d)}
            icon={TrendingUp}
            color="#BF5AF2"
            valueSize={22}
          />
        </div>

        {/* ── Charts row 1: Ativações por dia + Por Canal ─────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Ativações por Dia</div>
            {ativacoesPorDia.length > 0
              ? <BarChartV data={ativacoesPorDia} height={200} color="#F59E0B" />
              : <EmptyChart />
            }
          </div>
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Por Canal</div>
            {porCanal.length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                  <DonutChart data={porCanal} size={140} thickness={20} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {porCanal.map(seg => (
                    <div key={seg.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, display: 'inline-block', flexShrink: 0 }} />
                        {seg.label}
                      </span>
                      <strong style={{ color: seg.color }}>{seg.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyChart />}
          </div>
        </div>

        {/* ── Charts row 2: Ranking de Ativações + Por Funil ──────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Ranking de Ativações (top 8)</div>
            {rankingBarData.length > 0
              ? <BarChartH data={rankingBarData} labelKey="label" valueKey="value" color1="#F59E0B" color2="#FCD34D" />
              : <EmptyChart />
            }
          </div>
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Por Funil</div>
            {porFunil.length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                  <DonutChart data={porFunil} size={140} thickness={20} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {porFunil.map(seg => (
                    <div key={seg.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, display: 'inline-block', flexShrink: 0 }} />
                        {seg.label}
                      </span>
                      <strong style={{ color: seg.color }}>{seg.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyChart />}
          </div>
        </div>

        {/* ── Ranking Table ────────────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            Ranking de Closers
          </div>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>#</th>
                  <th style={{ textAlign: 'left' }}>Closer</th>
                  <th style={{ textAlign: 'left' }}>Time</th>
                  <th style={{ textAlign: 'right' }}>Ativações</th>
                  <th style={{ textAlign: 'right' }}>Fat. Previsto</th>
                  <th style={{ textAlign: 'right' }}>Ticket Médio</th>
                  <th style={{ textAlign: 'right' }}>TPV 30d</th>
                  <th style={{ textAlign: 'right' }}>Bônus</th>
                  <th style={{ textAlign: 'right' }}>% Fat. vs TPV</th>
                </tr>
              </thead>
              <tbody>
                {closerRows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>
                      Nenhum closer com ativações no período.
                    </td>
                  </tr>
                )}
                {closerRows.map((r, i) => (
                  <tr key={r.id}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{
                      fontWeight: 800,
                      color: i < 3 ? ['#F59E0B', '#C0C0C0', '#CD7F32'][i] : 'var(--text2)',
                      fontSize: i < 3 ? 16 : 13,
                    }}>
                      {i < 3 ? MEDALS[i] : i + 1}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={r.name} size={30} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                          {r.email && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: 'color-mix(in srgb, #F59E0B 15%, transparent)',
                        color: '#F59E0B',
                      }}>
                        {r.teamName}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.ativacoes}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.fatPrevisto > 0 ? '#34C759' : 'var(--text2)' }}>
                      {BRL(r.fatPrevisto)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
                      {r.ativacoes > 0 ? BRL(r.ticketMedio) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.tpv30d > 0 ? '#BF5AF2' : 'var(--text2)' }}>
                      {r.tpv30d > 0 ? BRL(r.tpv30d) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.bonus > 0 ? '#34C759' : 'var(--text2)' }}>
                      {r.bonus > 0 ? BRL(r.bonus) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: pctColor(r.fatPrevisto, r.tpv30d) }}>
                      {pctFatVsTpv(r.fatPrevisto, r.tpv30d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── GC Status breakdown ─────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text2)', marginBottom: 12 }}>
            Status GC
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {GC_CARDS.map(gc => {
              const count = gc.keys.reduce((sum, k) => sum + (gcStatus[k] ?? 0), 0)
              return (
                <div key={gc.label} style={{
                  background: `color-mix(in srgb, ${gc.color} 10%, var(--bg-card))`,
                  border: `1px solid color-mix(in srgb, ${gc.color} 30%, var(--border))`,
                  borderRadius: 14,
                  padding: '16px 20px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: gc.color, marginBottom: 8 }}>
                    {gc.label}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: gc.color, lineHeight: 1 }}>
                    {count}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                    {activations.length > 0 ? `${Math.round((count / activations.length) * 100)}% do total` : 'sem dados'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function EmptyChart() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text2)', fontSize: 13 }}>
      Sem dados no período
    </div>
  )
}
