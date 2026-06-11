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
import { GOALS, metaColor } from '@/lib/goals'
import { getMbTpvByEmails, invalidateMbCache } from '@/lib/mbCache'

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

interface RawCall {
  id: string
  title: string | null
  client_email: string | null
  responsible: string | null
  date: string
  time: string | null
  status: string
  ativado: boolean | null
  motivo_nao_ativacao: string | null
  updated_at: string | null
}

// alias para compatibilidade
type ConvertedCall = RawCall

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
    const y = today.getFullYear(), mo = today.getMonth() + 1
    const inicio = `${y}-${String(mo).padStart(2,'0')}-01`
    const fim    = fmt(new Date(y, mo, 0))
    return { inicio, fim, label: new Date(inicio + 'T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
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
  const [tpvCache,       setTpvCache]       = useState<RawTpvCache[]>([])
  const [calls,          setCalls]          = useState<RawCall[]>([])
  const [convertedCalls, setConvertedCalls] = useState<ConvertedCall[]>([])
  const [tpvMesMap,      setTpvMesMap]      = useState<Record<string, number>>({})
  const [isLoading,      setIsLoading]      = useState(true)
  const [isRefreshing,   setIsRefreshing]   = useState(false)
  // Modal de conversão
  const [convModal, setConvModal] = useState<{ closerId: string; name: string } | null>(null)

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [
        { data: acts },
        { data: usrs },
        { data: tms },
        { data: tpv },
        { data: cls },
        { data: conv },
      ] = await Promise.all([
        supabase
          .from('activations')
          .select('id,client,email,responsible,date,channel,faturamento_mensal,gerente_id,gc_status,welcome_sent')
          .gte('date', inicio)
          .lte('date', fim)
          .or('gc_ativacao.is.null,gc_ativacao.is.false'),
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
        supabase
          .from('calls')
          .select('id,title,client_email,responsible,date,time,status,ativado,motivo_nao_ativacao,updated_at')
          .gte('date', inicio)
          .lte('date', fim),
        // conv placeholder — usamos cls para tudo
        Promise.resolve({ data: [] }),
      ])
      const actList = (acts ?? []) as RawActivation[]
      setActivations(actList)
      setUsers((usrs ?? []) as RawUser[])
      setTeams((tms ?? []) as RawTeam[])
      setTpvCache((tpv ?? []) as RawTpvCache[])
      const allCalls = (cls ?? []) as RawCall[]
      setCalls(allCalls)
      setConvertedCalls(allCalls.filter(c => c.ativado === true))

      // Busca TPV do mês atual para todos os emails ativados no período
      const emails = [...new Set(actList.map(a => a.email).filter(Boolean) as string[])]
      if (emails.length > 0) {
        getMbTpvByEmails(emails).then(tpvData => {
          const map: Record<string, number> = {}
          Object.entries(tpvData).forEach(([email, v]) => { map[email.toLowerCase()] = v.tpv_mes })
          setTpvMesMap(map)
        }).catch(() => {})
      }

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

      // TPV Mês Atual: soma o tpv_mes dos clientes ativados por esse closer no período
      const tpv30d = myActs.reduce((s, a) => s + (tpvMesMap[(a.email ?? '').toLowerCase()] ?? 0), 0)
      const bonus  = 0 // bônus removido da tabela

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
  }, [closers, activations, tpvMesMap, teamMap])

  // ── Métricas de calls por closer ────────────────────────────────────────────
  const callStatsByCloser = useMemo(() => {
    const map: Record<string, { agendadas: number; realizadas: number; emAtendimento: number; noshow: number; canceladas: number; ativadas: number }> = {}
    calls.forEach(c => {
      if (!c.responsible) return
      if (!map[c.responsible]) map[c.responsible] = { agendadas: 0, realizadas: 0, emAtendimento: 0, noshow: 0, canceladas: 0, ativadas: 0 }
      map[c.responsible].agendadas++
      if (c.status === 'Realizada')       map[c.responsible].realizadas++
      if (c.status === 'Em Atendimento')  map[c.responsible].emAtendimento++
      if (c.status === 'No-show')         map[c.responsible].noshow++
      if (c.status === 'Cancelada')       map[c.responsible].canceladas++
      if (c.ativado === true)             map[c.responsible].ativadas++
    })
    return map
  }, [calls])

  // ── KPI aggregates ──────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalAtivacoes   = activations.length
    const fatTotal         = activations.reduce((s, a) => s + (a.faturamento_mensal ?? 0), 0)
    const ticketMedioGeral = totalAtivacoes > 0 ? fatTotal / totalAtivacoes : 0
    const tpvTotal30d      = closerRows.reduce((s, r) => s + r.tpv30d, 0)
    const bonusTotal       = 0
    return { totalAtivacoes, fatTotal, ticketMedioGeral, tpvTotal30d, bonusTotal }
  }, [activations, closerRows])

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

  // ── Tabela: motivos de não ativação ────────────────────────────────────────
  const naoAtivados = useMemo(() => {
    return calls.filter(c => c.motivo_nao_ativacao)
  }, [calls])

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
    if (fat <= 0) return '—'
    return `${Math.round((tpv / fat) * 100)}%`
  }
  function pctColor(fat: number, tpv: number): string {
    if (fat <= 0) return 'var(--text2)'
    const r = tpv / fat
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
            label="TPV Mês Atual"
            value={BRL(kpi.tpvTotal30d)}
            icon={TrendingUp}
            color="#BF5AF2"
            valueSize={22}
          />
        </div>

        {/* ── Meta do período ─────────────────────────────────────────── */}
        {preset === 'mes' && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              🎯 Meta do mês — Closers
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400 }}>Meta: {GOALS.closer.ativacoes_mes} ativações por closer</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {closerRows.map(r => {
                const pct = Math.min(100, (r.ativacoes / GOALS.closer.ativacoes_mes) * 100)
                const cor = metaColor(pct, 1)
                return (
                  <div key={r.id} style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={r.name} size={26} />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name.split(' ')[0]}</span>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 13, color: cor }}>{r.ativacoes}/{GOALS.closer.ativacoes_mes}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 20, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 20, transition: 'width .4s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: cor, fontWeight: 700, marginTop: 5, textAlign: 'right' }}>{pct.toFixed(0)}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
                  <th style={{ textAlign: 'right' }}>TPV Mês</th>
                  <th style={{ textAlign: 'right' }}>% Fat. vs TPV</th>
                  <th style={{ textAlign: 'right' }}>Conversões</th>
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
                    <td style={{ textAlign: 'right', fontWeight: 700, color: pctColor(r.fatPrevisto, r.tpv30d) }}>
                      {pctFatVsTpv(r.fatPrevisto, r.tpv30d)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {(() => {
                        const cnt = convertedCalls.filter(c => c.responsible === r.id).length
                        return cnt > 0 ? (
                          <button onClick={() => setConvModal({ closerId: r.id, name: r.name })}
                            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1px solid #34C759', background: '#34C75918', color: '#34C759', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {cnt} convertido{cnt !== 1 ? 's' : ''}
                          </button>
                        ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Conversão da Agenda por Closer ───────────────────────────── */}
        {calls.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Conversão da Agenda</div>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{calls.length} calls no período</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card2)' }}>
                    {['Closer','Agendadas','Realizadas','Em Atend.','No-show','Canceladas','Ativados','Taxa Show','Taxa Conv.'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Closer' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {closers.filter(c => callStatsByCloser[c.id]).map(c => {
                    const s = callStatsByCloser[c.id]
                    const taxaShow = s.agendadas > 0 ? Math.round(s.realizadas / s.agendadas * 100) : 0
                    const taxaConv = s.realizadas > 0 ? Math.round(s.ativadas / s.realizadas * 100) : 0
                    const pctColor = (v: number) => v >= 80 ? 'var(--green)' : v >= 50 ? 'var(--orange)' : 'var(--red)'
                    return (
                      <tr key={c.id}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={c.name} size={28} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name.split(' ')[0]}</div>
                              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{teams.find(t => t.id === c.team_id)?.name ?? '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{s.agendadas}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{s.realizadas}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: s.emAtendimento > 0 ? 'var(--cyan)' : 'var(--text2)', fontWeight: s.emAtendimento > 0 ? 700 : 400 }}>{s.emAtendimento}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: s.noshow > 0 ? 'var(--orange)' : 'var(--text2)' }}>{s.noshow}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: s.canceladas > 0 ? 'var(--red)' : 'var(--text2)' }}>{s.canceladas}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button onClick={() => setConvModal({ closerId: c.id, name: c.name })}
                            style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1px solid #34C759', background: '#34C75918', color: '#34C759', cursor: s.ativadas > 0 ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                            {s.ativadas}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: pctColor(taxaShow) }}>{taxaShow}%</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: pctColor(taxaConv) }}>{taxaConv}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Motivos de Não Ativação ──────────────────────────────────── */}
        {naoAtivados.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Motivos de Não Ativação</div>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                {naoAtivados.length} cliente{naoAtivados.length !== 1 ? 's' : ''} no período
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card2)' }}>
                    {['Cliente', 'Email', 'Closer', 'Atualizado', 'Motivo'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left',
                        fontSize: 11, fontWeight: 700, color: 'var(--text2)',
                        textTransform: 'uppercase', letterSpacing: '.04em',
                        whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {naoAtivados.map((c, i) => {
                    const closer = users.find(u => u.id === c.responsible)
                    return (
                      <tr key={c.id}
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {c.title || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text2)', fontSize: 12 }}>
                          {c.client_email || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          {closer ? (
                            <span style={{ background: '#F59E0B18', color: '#F59E0B', fontWeight: 600, fontSize: 12, padding: '2px 9px', borderRadius: 20 }}>
                              {closer.name.split(' ')[0]}
                            </span>
                          ) : <span style={{ color: 'var(--text2)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 12 }}>
                          {c.updated_at
                            ? new Date(c.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                            : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text)', lineHeight: 1.5 }}>
                          {c.motivo_nao_ativacao}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
      {/* ── Modal: Conversões da Agenda ── */}
      {convModal && (() => {
        const myConv = convertedCalls
          .filter(c => c.responsible === convModal.closerId)
          .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
        return (
          <div onClick={() => setConvModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'color-mix(in srgb, #34C759 8%, var(--bg-card2))' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#34C759', marginBottom: 4 }}>Conversões da Agenda</div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{convModal.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{rangeLabel} · {myConv.length} cliente{myConv.length !== 1 ? 's' : ''} convertido{myConv.length !== 1 ? 's' : ''}</div>
                </div>
                <button onClick={() => setConvModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
              </div>

              {/* Lista */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {myConv.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Nenhuma conversão no período.</div>
                ) : myConv.map((c, i) => (
                  <div key={c.id} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34C759', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.title || c.client_email || `Call #${i + 1}`}
                      </div>
                      {c.client_email && c.title && (
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{c.client_email}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {new Date(c.date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        {c.time ? ` · ${c.time.slice(0,5)}` : ''}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#34C759', background: '#34C75918', padding: '2px 8px', borderRadius: 20 }}>✓ Ativado</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setConvModal(null)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Fechar</button>
              </div>
            </div>
          </div>
        )
      })()}

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
