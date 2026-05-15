import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { supabase } from '@/lib/supabase/client'
import { BarChartH } from '@/components/ui/charts/BarChartH'
import { LineAreaChart } from '@/components/ui/charts/LineAreaChart'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import { ChevronLeft, RefreshCw, Loader2, Users, Zap, Phone, TrendingUp } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
type DbUser       = { id: string; name: string; role: string; email: string; active: boolean }
type Activation   = { id: string; client: string; email: string; responsible: string; date: string; channel: string | null; faturamento_mensal: number | null; gerente_id: string | null; gc_status: string; welcome_sent: boolean }
type Call         = { id: string; date: string; status: string; responsible: string; sdr_nome: string | null; client_email: string; ativado: boolean; motivo_nao_ativacao: string | null }
type CarteiraNota = { email: string; motivo: string | null; data_contato: string | null }
type MbCliente    = { gerente: string; nome: string; email: string; tpv_mes: number | null; previsao_faturamento: number }

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const COR = { verde: '#34C759', amarelo: '#FF9F0A', vermelho: '#FF3B30', azul: '#2997FF', roxo: '#BF5AF2' }

type Preset = 'hoje' | '7d' | '15d' | '30d' | 'mes' | 'custom'

const fmt = (d: Date) => d.toISOString().split('T')[0]
const sub = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

function getRange(preset: Preset, customFrom: string, customTo: string) {
  const today = new Date()
  if (preset === 'hoje') return { inicio: fmt(today), fim: fmt(today), label: 'Hoje' }
  if (preset === '7d')   return { inicio: sub(6),     fim: fmt(today), label: 'Últimos 7 dias' }
  if (preset === '15d')  return { inicio: sub(14),    fim: fmt(today), label: 'Últimos 15 dias' }
  if (preset === '30d')  return { inicio: sub(29),    fim: fmt(today), label: 'Últimos 30 dias' }
  if (preset === 'mes') {
    const m = fmt(today).slice(0, 7)
    return { inicio: `${m}-01`, fim: `${m}-31`, label: today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
  }
  const from = customFrom || fmt(today)
  const to   = customTo   || fmt(today)
  return {
    inicio: from, fim: to,
    label: `${new Date(from+'T12:00').toLocaleDateString('pt-BR')} – ${new Date(to+'T12:00').toLocaleDateString('pt-BR')}`,
  }
}

const TABS = [
  { key: 'geral',      label: 'Visão Geral',  icon: Zap        },
  { key: 'ativacoes',  label: 'Ativações',    icon: Users      },
  { key: 'calls',      label: 'Calls / SDR',  icon: Phone      },
  { key: 'carteiragc', label: 'Carteira GC',  icon: TrendingUp },
  { key: 'carteiras',  label: 'Cobertura',    icon: Users      },
] as const
type TabKey = typeof TABS[number]['key']

export default function RelatoriosAdmin({ onBack }: { onBack?: () => void } = {}) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  if (!hasAnyRole(user, ['Admin'])) {
    return <><Header /><div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>Acesso restrito.</div></>
  }
  return <RelatoriosContent onBack={onBack} />
}

function RelatoriosContent({ onBack }: { onBack?: () => void }) {
  const [tab,        setTab]        = useState<TabKey>('geral')
  const [preset,     setPreset]     = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [isLoading,  setIsLoading]  = useState(true)
  const [isRefresh,  setIsRefresh]  = useState(false)

  const [users,       setUsers]       = useState<DbUser[]>([])
  const [activations, setActivations] = useState<Activation[]>([])
  const [calls,       setCalls]       = useState<Call[]>([])
  const [notas,       setNotas]       = useState<CarteiraNota[]>([])
  const [mbClientes,  setMbClientes]  = useState<MbCliente[]>([])

  const { inicio, fim, label: rangeLabel } = getRange(preset, customFrom, customTo)

  useEffect(() => { load() }, [inicio, fim])

  async function load() {
    setIsLoading(true)
    const [{ data: u }, { data: a }, { data: c }, { data: n }, mbRes] = await Promise.all([
      supabase.from('users').select('id,name,role,email,active').order('name'),
      supabase.from('activations').select('id,client,email,responsible,date,channel,faturamento_mensal,gerente_id,gc_status,welcome_sent').gte('date', inicio).lte('date', fim),
      supabase.from('calls').select('id,date,status,responsible,sdr_nome,client_email,ativado,motivo_nao_ativacao').gte('date', inicio).lte('date', fim),
      supabase.from('carteira_notas').select('email,motivo,data_contato'),
      supabase.functions.invoke('mb-search', { body: {} }),
    ])
    if (u) setUsers(u as DbUser[])
    if (a) setActivations(a as Activation[])
    if (c) setCalls(c as Call[])
    if (n) setNotas(n as CarteiraNota[])
    if (mbRes.data?.clientes) setMbClientes(mbRes.data.clientes as MbCliente[])
    setIsLoading(false)
  }

  const refresh = async () => { setIsRefresh(true); await load(); setIsRefresh(false) }

  const sdrs     = useMemo(() => users.filter(u => u.role === 'SDR'), [users])
  const closers  = useMemo(() => users.filter(u => u.role === 'Closer'), [users])
  const gerentes = useMemo(() => users.filter(u => u.role === 'Gerente de Contas'), [users])
  const notaMap  = useMemo(() => Object.fromEntries(notas.map(n => [n.email, n])), [notas])

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }
  const lbl = (t: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>{t}</div>
  )

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'hoje',   label: 'Hoje'         },
    { key: '7d',     label: '7 dias'       },
    { key: '15d',    label: '15 dias'      },
    { key: '30d',    label: '30 dias'      },
    { key: 'mes',    label: 'Mês atual'    },
    { key: 'custom', label: 'Personalizado'},
  ]

  if (isLoading) return (
    <>
      <Header />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14 }}>Carregando relatórios…</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>

        {/* Topo */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onBack && <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>}
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Relatórios Gerais</h1>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text2)' }}>{rangeLabel}</p>
            </div>
          </div>

          {/* Filtro de período */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: 'var(--bg-card2)', borderRadius: 10, padding: 3, gap: 2 }}>
              {PRESETS.map(p => (
                <button key={p.key} onClick={() => setPreset(p.key)}
                  style={{ padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600, transition: 'all .15s', whiteSpace: 'nowrap',
                    background: preset === p.key ? 'var(--action)' : 'transparent',
                    color: preset === p.key ? '#fff' : 'var(--text2)' }}>
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12 }} />
                <span style={{ color: 'var(--text2)', fontSize: 12 }}>até</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 12 }} />
              </div>
            )}
            <button onClick={refresh} disabled={isRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
              <RefreshCw size={14} style={{ animation: isRefresh ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 12, padding: 4, marginBottom: 24, overflowX: 'auto', scrollbarWidth: 'none', width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: tab === t.key ? 'var(--action)' : 'transparent',
                color: tab === t.key ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13 }}>
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'geral'      && <TabGeral      activations={activations} calls={calls} users={users} inicio={inicio} fim={fim} card={card} lbl={lbl} />}
        {tab === 'ativacoes'  && <TabAtivacoes  activations={activations} closers={closers} inicio={inicio} fim={fim} card={card} lbl={lbl} />}
        {tab === 'calls'      && <TabCalls      calls={calls} sdrs={sdrs} card={card} lbl={lbl} />}
        {tab === 'carteiragc' && <TabCarteiraGC mbClientes={mbClientes} gerentes={gerentes} card={card} lbl={lbl} BRL={BRL} />}
        {tab === 'carteiras'  && <TabCarteiras  activations={activations} gerentes={gerentes} notaMap={notaMap} card={card} lbl={lbl} />}

      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}

// ── Selector reutilizável ────────────────────────────────────────────────────
function EmployeeFilter({ label, options, value, onChange }: {
  label: string
  options: { id: string; name: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{label}:</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onChange('')}
          style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            background: value === '' ? 'var(--action)' : 'var(--bg-card2)', color: value === '' ? '#fff' : 'var(--text2)' }}>
          Todos
        </button>
        {options.map(o => (
          <button key={o.id} onClick={() => onChange(o.id)}
            style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              background: value === o.id ? 'var(--action)' : 'var(--bg-card2)', color: value === o.id ? '#fff' : 'var(--text2)' }}>
            {o.name.split(' ')[0]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── KPI mini card ────────────────────────────────────────────────────────────
function Kpi({ label, value, color, card }: { label: string; value: string | number; color: string; card: React.CSSProperties }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{String(value)}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: VISÃO GERAL
// ══════════════════════════════════════════════════════════════════════════════
function TabGeral({ activations, calls, users, inicio, fim, card, lbl }: any) {
  // Ativações por dia no range
  const days: { label: string; value: number }[] = []
  const start = new Date(inicio + 'T12:00:00')
  const end   = new Date(fim   + 'T12:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().split('T')[0]
    days.push({ label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: activations.filter((a: any) => a.date === ds).length })
  }

  const realizadas = calls.filter((c: any) => c.status === 'Realizada').length
  const ativadas   = calls.filter((c: any) => c.ativado).length
  const taxaConv   = realizadas > 0 ? (ativadas / realizadas * 100) : 0

  const atMap: Record<string, number> = {}
  activations.forEach((a: any) => { atMap[a.responsible] = (atMap[a.responsible] ?? 0) + 1 })
  const topClosers = Object.entries(atMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, cnt]) => {
      const u = (users as any[]).find((u: any) => u.id === id)
      return { label: u?.name?.split(' ')[0] ?? '?', value: cnt as number }
    })

  const sdrCallMap: Record<string, number> = {}
  calls.filter((c: any) => c.status === 'Realizada').forEach((c: any) => {
    const n = c.sdr_nome || 'Sem SDR'
    sdrCallMap[n] = (sdrCallMap[n] ?? 0) + 1
  })
  const topSDRs = Object.entries(sdrCallMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, value]) => ({ label: label.split(' ')[0], value: value as number }))

  const donutCalls = [
    { label: 'Realizadas', value: realizadas, color: COR.verde },
    { label: 'Agendadas',  value: calls.filter((c: any) => c.status === 'Agendada').length, color: COR.azul },
    { label: 'No-show',    value: calls.filter((c: any) => c.status === 'No-show').length,  color: COR.amarelo },
    { label: 'Canceladas', value: calls.filter((c: any) => c.status === 'Cancelada').length,color: COR.vermelho },
  ].filter(d => d.value > 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label="Ativações"       value={activations.length}           color={COR.roxo}    card={card} />
        <Kpi label="Calls"           value={calls.length}                 color={COR.azul}    card={card} />
        <Kpi label="Realizadas"      value={realizadas}                   color={COR.verde}   card={card} />
        <Kpi label="Taxa conversão"  value={`${taxaConv.toFixed(1)}%`}   color={COR.verde}   card={card} />
        <Kpi label="Usuários Ativos"  value={users.filter((u: any) => u.active).length} color={COR.amarelo} card={card} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Ativações por dia')}
          {days.length > 1
            ? <LineAreaChart data={days} height={130} color={COR.roxo} valueKey="value" labelKey="label" />
            : <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 13 }}>Selecione um período maior</div>
          }
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Status das Calls')}
          {donutCalls.length > 0
            ? <DonutChart data={donutCalls} size={110} thickness={16} />
            : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>
          }
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Top Closers — Ativações')}
          {topClosers.length ? <BarChartH data={topClosers} labelKey="label" valueKey="value" color1={COR.roxo} color2="#9B59B6" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Top SDRs — Calls Realizadas')}
          {topSDRs.length ? <BarChartH data={topSDRs} labelKey="label" valueKey="value" color1={COR.azul} color2="#5AB4FF" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: ATIVAÇÕES
// ══════════════════════════════════════════════════════════════════════════════
function TabAtivacoes({ activations, closers, inicio, fim, card, lbl }: any) {
  const [selectedCloser, setSelectedCloser] = useState('')

  const base = selectedCloser ? activations.filter((a: any) => a.responsible === selectedCloser) : activations

  const days: { label: string; value: number }[] = []
  const start = new Date(inicio + 'T12:00:00')
  const end   = new Date(fim   + 'T12:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().split('T')[0]
    days.push({ label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: base.filter((a: any) => a.date === ds).length })
  }

  const porCanal: Record<string, number> = {}
  base.forEach((a: any) => { const k = a.channel || 'Sem canal'; porCanal[k] = (porCanal[k] ?? 0) + 1 })
  const barCanal = Object.entries(porCanal).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: value as number }))

  const porFunil = { Starter: 0, Growth: 0, Enterprise: 0, 'Sem info': 0 } as Record<string, number>
  base.forEach((a: any) => {
    const f = a.faturamento_mensal
    if (!f) porFunil['Sem info']++
    else if (f <= 50000) porFunil['Starter']++
    else if (f <= 250000) porFunil['Growth']++
    else porFunil['Enterprise']++
  })
  const donutFunil = [
    { label: 'Starter',    value: porFunil['Starter'],    color: '#07BA1C' },
    { label: 'Growth',     value: porFunil['Growth'],     color: '#2BB9FF' },
    { label: 'Enterprise', value: porFunil['Enterprise'], color: '#BF5AF2' },
    { label: 'Sem info',   value: porFunil['Sem info'],   color: '#636366' },
  ].filter(d => d.value > 0)

  const porCloser: Record<string, number> = {}
  base.forEach((a: any) => { porCloser[a.responsible] = (porCloser[a.responsible] ?? 0) + 1 })
  const barCloser = Object.entries(porCloser).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, value]) => {
      const u = (closers as any[]).find((u: any) => u.id === id)
      return { label: u?.name?.split(' ')[0] ?? '?', value: value as number }
    })

  return (
    <div>
      <EmployeeFilter label="Filtrar por Closer" options={closers} value={selectedCloser} onChange={setSelectedCloser} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label="Total"           value={base.length}                                                     color={COR.roxo}  card={card} />
        <Kpi label="Com gerente"     value={base.filter((a: any) => a.gerente_id).length}                    color={COR.verde} card={card} />
        <Kpi label="Boas-vindas"     value={base.filter((a: any) => a.welcome_sent).length}                  color={COR.azul}  card={card} />
        <Kpi label="Sem gerente"     value={base.filter((a: any) => !a.gerente_id).length}                   color={COR.amarelo} card={card} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Ativações por dia')}
          {days.length > 1
            ? <LineAreaChart data={days} height={130} color={COR.roxo} valueKey="value" labelKey="label" />
            : <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 13 }}>Selecione um período maior</div>
          }
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Funil')}
          {donutFunil.length ? <DonutChart data={donutFunil} size={100} thickness={14} /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Por Closer')}
          {barCloser.length ? <BarChartH data={barCloser} labelKey="label" valueKey="value" color1={COR.roxo} color2="#9B59B6" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Por Canal')}
          {barCanal.length ? <BarChartH data={barCanal} labelKey="label" valueKey="value" color1={COR.azul} color2="#5AB4FF" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados de canal</div>}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CALLS / SDR
// ══════════════════════════════════════════════════════════════════════════════
function TabCalls({ calls, sdrs, card, lbl }: any) {
  const [selectedSdr, setSelectedSdr] = useState('')

  const sdrNames = [...new Set(calls.map((c: any) => c.sdr_nome).filter(Boolean))] as string[]
  const sdrOptions = sdrs.length
    ? sdrs
    : sdrNames.map((n: string) => ({ id: n, name: n }))

  const base = selectedSdr
    ? calls.filter((c: any) => {
        const sdr = sdrs.find((s: any) => s.id === selectedSdr)
        return sdr ? c.sdr_nome === sdr.name : c.sdr_nome === selectedSdr
      })
    : calls

  const total      = base.length
  const realizadas = base.filter((c: any) => c.status === 'Realizada').length
  const noshow     = base.filter((c: any) => c.status === 'No-show').length
  const canceladas = base.filter((c: any) => c.status === 'Cancelada').length
  const ativadas   = base.filter((c: any) => c.ativado).length
  const taxaReal   = total > 0 ? realizadas / total * 100 : 0
  const taxaAtiv   = realizadas > 0 ? ativadas / realizadas * 100 : 0

  const sdrMap: Record<string, { ag: number; re: number; ns: number; ca: number; at: number }> = {}
  base.forEach((c: any) => {
    const n = c.sdr_nome || 'Sem SDR'
    if (!sdrMap[n]) sdrMap[n] = { ag: 0, re: 0, ns: 0, ca: 0, at: 0 }
    sdrMap[n].ag++
    if (c.status === 'Realizada') sdrMap[n].re++
    if (c.status === 'No-show')   sdrMap[n].ns++
    if (c.status === 'Cancelada') sdrMap[n].ca++
    if (c.ativado) sdrMap[n].at++
  })
  const sdrRows = Object.entries(sdrMap)
    .map(([nome, v]) => ({ nome, ...v, pctR: v.ag > 0 ? v.re / v.ag * 100 : 0, pctA: v.re > 0 ? v.at / v.re * 100 : 0 }))
    .sort((a, b) => b.re - a.re)

  const motivosMap: Record<string, number> = {}
  base.filter((c: any) => c.motivo_nao_ativacao).forEach((c: any) => {
    motivosMap[c.motivo_nao_ativacao] = (motivosMap[c.motivo_nao_ativacao] ?? 0) + 1
  })
  const barMotivos = Object.entries(motivosMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([label, value]) => ({ label: label.length > 24 ? label.slice(0, 22) + '…' : label, value: value as number }))

  const donut = [
    { label: 'Realizadas', value: realizadas, color: COR.verde    },
    { label: 'Agendadas',  value: total - realizadas - noshow - canceladas, color: COR.azul },
    { label: 'No-show',    value: noshow,     color: COR.amarelo  },
    { label: 'Canceladas', value: canceladas, color: COR.vermelho },
  ].filter(d => d.value > 0)

  const pctColor = (v: number, meta: number) => v >= meta ? COR.verde : v >= meta * 0.6 ? COR.amarelo : COR.vermelho

  return (
    <div>
      <EmployeeFilter label="Filtrar por SDR" options={sdrOptions} value={selectedSdr} onChange={setSelectedSdr} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label="Total Calls"    value={total}                         color={COR.azul}    card={card} />
        <Kpi label="Realizadas"     value={realizadas}                    color={COR.verde}   card={card} />
        <Kpi label="No-show"        value={noshow}                        color={COR.amarelo} card={card} />
        <Kpi label="% Realização"   value={`${taxaReal.toFixed(1)}%`}    color={COR.azul}    card={card} />
        <Kpi label="% Ativação"     value={`${taxaAtiv.toFixed(1)}%`}    color={COR.verde}   card={card} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Status')}
          {donut.length ? <><DonutChart data={donut} size={110} thickness={16} /><div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>{donut.map(d => (<div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, display: 'inline-block' }} />{d.label}</span><strong style={{ color: d.color }}>{d.value}</strong></div>))}</div></> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Motivos de Não Ativação')}
          {barMotivos.length ? <BarChartH data={barMotivos} labelKey="label" valueKey="value" color1={COR.vermelho} color2={COR.amarelo} /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhum motivo registrado</div>}
        </div>
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Ranking SDRs</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card2)' }}>
                {['#','SDR','Agendadas','Realizadas','No-show','Ativadas','% Realiz.','% Ativação'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'SDR' || h === '#' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sdrRows.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Sem dados</td></tr>}
              {sdrRows.map((s, i) => (
                <tr key={s.nome} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: i < 3 ? ['#FFD600','#C0C0C0','#CD7F32'][i] : 'var(--text2)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.nome}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{s.ag}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: COR.verde, fontWeight: 700 }}>{s.re}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: s.ns > 0 ? COR.amarelo : 'var(--text2)' }}>{s.ns}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: COR.roxo, fontWeight: 700 }}>{s.at}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}><span style={{ color: pctColor(s.pctR, 80), fontWeight: 700 }}>{s.pctR.toFixed(1)}%</span></td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}><span style={{ color: pctColor(s.pctA, 30), fontWeight: 700 }}>{s.pctA.toFixed(1)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CARTEIRA GC (dados do Metabase)
// ══════════════════════════════════════════════════════════════════════════════
function TabCarteiraGC({ mbClientes, gerentes, card, lbl, BRL }: any) {
  const [selectedGerente, setSelectedGerente] = useState('')

  const getPct = (c: MbCliente) =>
    c.previsao_faturamento > 0 ? Math.min((c.tpv_mes ?? 0) / c.previsao_faturamento * 100, 999) : null

  // Agrupa por nome do gerente
  const gerentesNomes = [...new Set((mbClientes as MbCliente[]).map(c => c.gerente))].sort()
  const gerenteOptions = gerentesNomes.map(n => {
    const u = (gerentes as any[]).find((g: any) => g.name === n)
    return { id: u?.id ?? n, name: n }
  })

  const base: MbCliente[] = selectedGerente
    ? mbClientes.filter((c: MbCliente) => {
        const u = (gerentes as any[]).find((g: any) => g.id === selectedGerente)
        return u ? c.gerente === u.name : c.gerente === selectedGerente
      })
    : mbClientes

  // Por gerente
  const rows = gerentesNomes
    .filter(n => !selectedGerente || (() => {
      const u = (gerentes as any[]).find((g: any) => g.id === selectedGerente)
      return u ? n === u.name : n === selectedGerente
    })())
    .map(nome => {
      const cli = (mbClientes as MbCliente[]).filter(c => c.gerente === nome)
      const tpvTotal  = cli.reduce((s, c) => s + (c.tpv_mes ?? 0), 0)
      const prevTotal = cli.reduce((s, c) => s + c.previsao_faturamento, 0)
      const v80  = cli.filter(c => { const p = getPct(c); return p !== null && p >= 80 }).length
      const v50  = cli.filter(c => { const p = getPct(c); return p !== null && p >= 50 && p < 80 }).length
      const v20  = cli.filter(c => { const p = getPct(c); return p !== null && p >= 20 && p < 50 }).length
      const zero = cli.filter(c => { const p = getPct(c); return p !== null && p < 20 }).length
      const semPrev = cli.filter(c => !c.previsao_faturamento).length
      const pctGeral = prevTotal > 0 ? tpvTotal / prevTotal * 100 : 0
      return { nome, total: cli.length, tpvTotal, prevTotal, pctGeral, v80, v50, v20, zero, semPrev }
    })

  // Totais globais
  const totalClientes = base.length
  const totalTpv      = base.reduce((s, c) => s + (c.tpv_mes ?? 0), 0)
  const totalPrev     = base.reduce((s, c) => s + c.previsao_faturamento, 0)
  const totalV80  = base.filter(c => { const p = getPct(c); return p !== null && p >= 80 }).length
  const totalV50  = base.filter(c => { const p = getPct(c); return p !== null && p >= 50 && p < 80 }).length
  const totalV20  = base.filter(c => { const p = getPct(c); return p !== null && p >= 20 && p < 50 }).length
  const totalZero = base.filter(c => { const p = getPct(c); return p !== null && p < 20 }).length
  const pctGeralTotal = totalPrev > 0 ? totalTpv / totalPrev * 100 : 0

  const donutFunil = [
    { label: '≥ 80%',   value: totalV80,  color: COR.verde    },
    { label: '50–79%',  value: totalV50,  color: COR.amarelo  },
    { label: '20–49%',  value: totalV20,  color: COR.vermelho },
    { label: '< 20%',   value: totalZero, color: '#636366'    },
  ].filter(d => d.value > 0)

  const pctColor = (p: number) => p >= 80 ? COR.verde : p >= 50 ? COR.amarelo : p >= 20 ? COR.vermelho : '#636366'

  return (
    <div>
      <EmployeeFilter label="Filtrar por Gerente" options={gerenteOptions} value={selectedGerente} onChange={setSelectedGerente} />

      {/* KPIs globais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label="Clientes"    value={totalClientes}          color={COR.azul}    card={card} />
        <Kpi label="TPV mês"     value={BRL(totalTpv)}          color={COR.verde}   card={card} />
        <Kpi label="Prev. fat."  value={BRL(totalPrev)}         color={COR.roxo}    card={card} />
        <Kpi label="% Geral"     value={`${pctGeralTotal.toFixed(1)}%`} color={pctColor(pctGeralTotal)} card={card} />
        <Kpi label="≥ 80%"       value={totalV80}               color={COR.verde}   card={card} />
        <Kpi label="Zerados"     value={totalZero}              color='#636366'     card={card} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Distribuição')}
          {donutFunil.length ? (
            <>
              <DonutChart data={donutFunil} size={120} thickness={16} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {donutFunil.map(d => (
                  <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text2)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                      {d.label}
                    </span>
                    <strong style={{ color: d.color }}>{d.value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados do Metabase</div>}
        </div>

        {/* Tabela por gerente */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            Carteira por Gerente de Contas
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-card2)' }}>
                  {['Gerente','Clientes','TPV mês','Prev. Fat.','% Ating.','≥ 80%','50–79%','20–49%','< 20%'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Gerente' ? 'left' : 'right',
                      fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                      letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>
                    {mbClientes.length === 0 ? 'Carregando dados do Metabase…' : 'Sem dados'}
                  </td></tr>
                )}
                {rows.map((r: any) => (
                  <tr key={r.nome} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={r.nome} size={26} />
                        {r.nome}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>{r.total}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: COR.verde }}>{BRL(r.tpvTotal)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.roxo }}>{BRL(r.prevTotal)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 800, color: pctColor(r.pctGeral) }}>{r.pctGeral.toFixed(1)}%</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.verde, fontWeight: 700 }}>{r.v80}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.amarelo, fontWeight: 700 }}>{r.v50}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.vermelho, fontWeight: 700 }}>{r.v20}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#8E8E93', fontWeight: 700 }}>{r.zero}</td>
                  </tr>
                ))}
                {/* Totais */}
                {rows.length > 1 && (
                  <tr style={{ background: 'var(--bg-card2)', fontWeight: 800 }}>
                    <td style={{ padding: '12px 14px' }}>Total</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>{totalClientes}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.verde }}>{BRL(totalTpv)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.roxo }}>{BRL(totalPrev)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span style={{ color: pctColor(pctGeralTotal) }}>{pctGeralTotal.toFixed(1)}%</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.verde }}>{totalV80}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.amarelo }}>{totalV50}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: COR.vermelho }}>{totalV20}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#8E8E93' }}>{totalZero}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CARTEIRAS
// ══════════════════════════════════════════════════════════════════════════════
function TabCarteiras({ activations, gerentes, notaMap, card, lbl }: any) {
  const [selectedGerente, setSelectedGerente] = useState('')

  const baseAts = selectedGerente
    ? activations.filter((a: any) => a.gerente_id === selectedGerente)
    : activations

  const porGerente = (gerentes as any[]).map((g: any) => {
    const cli     = baseAts.filter((a: any) => a.gerente_id === g.id)
    const comNota = cli.filter((a: any) => notaMap[a.email]).length
    return { id: g.id, nome: g.name, total: cli.length, comNota, semNota: cli.length - comNota }
  }).filter(g => !selectedGerente || g.id === selectedGerente).sort((a: any, b: any) => b.total - a.total)

  const semGerente = baseAts.filter((a: any) => !a.gerente_id).length

  return (
    <div>
      <EmployeeFilter label="Filtrar por Gerente" options={gerentes} value={selectedGerente} onChange={setSelectedGerente} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label="Total clientes"    value={baseAts.length}                                          color={COR.azul}    card={card} />
        <Kpi label="Com nota"          value={baseAts.filter((a: any) => notaMap[a.email]).length}     color={COR.verde}   card={card} />
        <Kpi label="Sem gerente"       value={semGerente}                                              color={semGerente > 0 ? COR.amarelo : COR.verde} card={card} />
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Carteira por Gerente</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              {['Gerente','Clientes','Com Nota','Cobertura','Sem Nota'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Gerente' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porGerente.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Sem dados</td></tr>}
            {porGerente.map((g: any) => {
              const pct = g.total > 0 ? g.comNota / g.total * 100 : 0
              return (
                <tr key={g.nome} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={g.nome} size={26} />{g.nome}</div></td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{g.total}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: COR.azul, fontWeight: 700 }}>{g.comNota}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: pct >= 80 ? COR.verde : pct >= 50 ? COR.amarelo : COR.vermelho }}>{pct.toFixed(0)}%</span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: g.semNota > 0 ? COR.vermelho : 'var(--text2)' }}>{g.semNota}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
