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
import { ChevronLeft, RefreshCw, Loader2, Users, Zap, Phone, Calendar, DollarSign, TrendingUp, FileText, Shield, AlertTriangle } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
type DbUser       = { id: string; name: string; role: string; email: string; active: boolean; team_id: string | null }
type Activation   = { id: string; client: string; email: string; responsible: string; date: string; channel: string | null; faturamento_mensal: number | null; gerente_id: string | null; gc_status: string; welcome_sent: boolean }
type Call         = { id: string; title: string; date: string; time: string; status: string; responsible: string; sdr_nome: string | null; client_email: string; ativado: boolean; motivo_nao_ativacao: string | null }
type Meeting      = { id: string; title: string; date: string; time: string; status: string; gerente_id: string | null; client_email: string }
type AuditLog     = { id: string; user_name: string; action: string; module: string; created_at: string }
type CarteiraNota = { email: string; motivo: string | null; data_contato: string | null }
type Payment      = { id: string; user_id: string; value: number; status: string; date: string; ref: string | null }

const COR = { verde: '#34C759', amarelo: '#FF9F0A', vermelho: '#FF3B30', azul: '#2997FF', roxo: '#BF5AF2', laranja: '#FF6B35' }
const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const TABS = [
  { key: 'geral',      label: 'Visão Geral',  icon: TrendingUp  },
  { key: 'ativacoes',  label: 'Ativações',    icon: Zap         },
  { key: 'calls',      label: 'Calls / SDR',  icon: Phone       },
  { key: 'reunioes',   label: 'Reuniões GC',  icon: Calendar    },
  { key: 'carteiras',  label: 'Carteiras',    icon: Users       },
  { key: 'pagamentos', label: 'Pagamentos',   icon: DollarSign  },
  { key: 'usuarios',   label: 'Usuários',     icon: Shield      },
  { key: 'auditoria',  label: 'Auditoria',    icon: FileText    },
] as const
type TabKey = typeof TABS[number]['key']

const STATUS_COLOR: Record<string, string> = {
  Agendada: COR.azul, Realizada: COR.verde, Cancelada: COR.vermelho, 'No-show': COR.amarelo,
}

export default function RelatoriosAdmin({ onBack }: { onBack?: () => void } = {}) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  if (!hasAnyRole(user, ['Admin'])) {
    return (
      <>
        <Header />
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>
          Acesso restrito a administradores.
        </div>
      </>
    )
  }

  return <RelatoriosContent onBack={onBack} />
}

function RelatoriosContent({ onBack }: { onBack?: () => void }) {
  const [tab,        setTab]        = useState<TabKey>('geral')
  const [mes,        setMes]        = useState(() => new Date().toISOString().slice(0, 7))
  const [isLoading,  setIsLoading]  = useState(true)
  const [isRefresh,  setIsRefresh]  = useState(false)

  const [users,       setUsers]       = useState<DbUser[]>([])
  const [activations, setActivations] = useState<Activation[]>([])
  const [calls,       setCalls]       = useState<Call[]>([])
  const [meetings,    setMeetings]    = useState<Meeting[]>([])
  const [auditLogs,   setAuditLogs]   = useState<AuditLog[]>([])
  const [notas,       setNotas]       = useState<CarteiraNota[]>([])
  const [payments,    setPayments]    = useState<Payment[]>([])

  useEffect(() => { load() }, [mes])

  async function load() {
    setIsLoading(true)
    const inicio = `${mes}-01`
    const fim    = `${mes}-31`
    const [
      { data: u }, { data: a }, { data: c }, { data: m },
      { data: al }, { data: n }, { data: p },
    ] = await Promise.all([
      supabase.from('users').select('id,name,role,email,active,team_id').order('name'),
      supabase.from('activations').select('id,client,email,responsible,date,channel,faturamento_mensal,gerente_id,gc_status,welcome_sent').gte('date', inicio).lte('date', fim),
      supabase.from('calls').select('id,title,date,time,status,responsible,sdr_nome,client_email,ativado,motivo_nao_ativacao').gte('date', inicio).lte('date', fim),
      supabase.from('followup_meetings').select('id,title,date,time,status,gerente_id,client_email').gte('date', inicio).lte('date', fim),
      supabase.from('audit_logs').select('id,user_name,action,module,created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('carteira_notas').select('email,motivo,data_contato'),
      supabase.from('payments').select('id,user_id,value,status,date,ref').gte('date', inicio).lte('date', fim),
    ])
    if (u)  setUsers(u as DbUser[])
    if (a)  setActivations(a as Activation[])
    if (c)  setCalls(c as Call[])
    if (m)  setMeetings(m as Meeting[])
    if (al) setAuditLogs(al as AuditLog[])
    if (n)  setNotas(n as CarteiraNota[])
    if (p)  setPayments(p as Payment[])
    setIsLoading(false)
  }

  const refresh = async () => { setIsRefresh(true); await load(); setIsRefresh(false) }

  // ── Derivações globais ───────────────────────────────────────────────────
  const sdrs     = useMemo(() => users.filter(u => u.role === 'SDR'), [users])
  const closers  = useMemo(() => users.filter(u => u.role === 'Closer'), [users])
  const gerentes = useMemo(() => users.filter(u => u.role === 'Gerente de Contas'), [users])
  const notaMap  = useMemo(() => Object.fromEntries(notas.map(n => [n.email, n])), [notas])

  // Ativações por dia
  const [y, m2] = mes.split('-').map(Number)
  const daysInMonth = new Date(y, m2, 0).getDate()
  const atsByDay = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    const d = `${mes}-${day}`
    return { label: `${String(i + 1).padStart(2, '0')}/${String(m2).padStart(2, '0')}`, value: activations.filter(a => a.date === d).length }
  }), [activations, mes, daysInMonth])

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }
  const lbl = (t: string, color = 'var(--text2)') => (
    <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>{t}</div>
  )

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onBack && <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>}
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Relatórios Gerais</h1>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text2)' }}>
                {new Date(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} · todos os módulos
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={mes} onChange={e => setMes(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }} />
            <button onClick={refresh} disabled={isRefresh}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
              <RefreshCw size={14} style={{ animation: isRefresh ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 12, padding: 4, marginBottom: 24, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: tab === t.key ? 'var(--action)' : 'transparent',
                color: tab === t.key ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13 }}>
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ════ VISÃO GERAL ════════════════════════════════════════════════ */}
        {tab === 'geral' && <TabGeral activations={activations} calls={calls} meetings={meetings} users={users} payments={payments} notas={notas} mes={mes} atsByDay={atsByDay} card={card} lbl={lbl} BRL={BRL} />}

        {/* ════ ATIVAÇÕES ══════════════════════════════════════════════════ */}
        {tab === 'ativacoes' && <TabAtivacoes activations={activations} users={users} atsByDay={atsByDay} card={card} lbl={lbl} BRL={BRL} />}

        {/* ════ CALLS / SDR ════════════════════════════════════════════════ */}
        {tab === 'calls' && <TabCalls calls={calls} sdrs={sdrs} card={card} lbl={lbl} />}

        {/* ════ REUNIÕES GC ════════════════════════════════════════════════ */}
        {tab === 'reunioes' && <TabReunioes meetings={meetings} gerentes={gerentes} card={card} lbl={lbl} />}

        {/* ════ CARTEIRAS ══════════════════════════════════════════════════ */}
        {tab === 'carteiras' && <TabCarteiras activations={activations} gerentes={gerentes} notaMap={notaMap} card={card} lbl={lbl} />}

        {/* ════ PAGAMENTOS ═════════════════════════════════════════════════ */}
        {tab === 'pagamentos' && <TabPagamentos payments={payments} users={users} card={card} lbl={lbl} BRL={BRL} />}

        {/* ════ USUÁRIOS ═══════════════════════════════════════════════════ */}
        {tab === 'usuarios' && <TabUsuarios users={users} activations={activations} calls={calls} card={card} lbl={lbl} />}

        {/* ════ AUDITORIA ══════════════════════════════════════════════════ */}
        {tab === 'auditoria' && <TabAuditoria auditLogs={auditLogs} card={card} lbl={lbl} />}

      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: VISÃO GERAL
// ══════════════════════════════════════════════════════════════════════════════
function TabGeral({ activations, calls, meetings, users, payments, notas, mes, atsByDay, card, lbl, BRL }: any) {
  const totalAts  = activations.length
  const totalCalls= calls.length
  const realizadas= calls.filter((c: any) => c.status === 'Realizada').length
  const ativadas  = calls.filter((c: any) => c.ativado).length
  const taxaConv  = realizadas > 0 ? (ativadas / realizadas * 100) : 0
  const taxaReal  = totalCalls > 0 ? (realizadas / totalCalls * 100) : 0
  const totalMeet = meetings.length
  const meetReal  = meetings.filter((m: any) => m.status === 'Realizada').length
  const totalPgt  = payments.reduce((s: number, p: any) => s + (p.value ?? 0), 0)
  const pgtPend   = payments.filter((p: any) => p.status === 'Pendente').reduce((s: number, p: any) => s + (p.value ?? 0), 0)
  const activeUsers = users.filter((u: any) => u.active).length

  const roleCount: Record<string, number> = {}
  users.forEach((u: any) => { roleCount[u.role] = (roleCount[u.role] ?? 0) + 1 })

  const donutRoles = Object.entries(roleCount).map(([label, value], i) => ({
    label, value: value as number,
    color: [COR.azul, COR.verde, COR.roxo, COR.amarelo, COR.vermelho][i % 5],
  }))

  const donutCalls = [
    { label: 'Realizadas', value: realizadas,                color: COR.verde    },
    { label: 'Agendadas',  value: totalCalls - realizadas - calls.filter((c: any) => c.status === 'No-show').length - calls.filter((c: any) => c.status === 'Cancelada').length, color: COR.azul },
    { label: 'No-show',    value: calls.filter((c: any) => c.status === 'No-show').length, color: COR.amarelo },
    { label: 'Canceladas', value: calls.filter((c: any) => c.status === 'Cancelada').length, color: COR.vermelho },
  ].filter(d => d.value > 0)

  const kpis = [
    { label: 'Ativações',      value: totalAts,                    color: COR.roxo,    sub: 'no mês' },
    { label: 'Calls',          value: totalCalls,                  color: COR.azul,    sub: `${taxaReal.toFixed(0)}% realiz.` },
    { label: 'Taxa Conversão', value: `${taxaConv.toFixed(1)}%`,   color: COR.verde,   sub: `${ativadas} ativados` },
    { label: 'Reuniões GC',    value: `${meetReal}/${totalMeet}`,  color: COR.amarelo, sub: 'realizadas' },
    { label: 'Usuários Ativos',value: activeUsers,                 color: COR.azul,    sub: `de ${users.length}` },
    { label: 'Pagamentos',     value: BRL(totalPgt),               color: COR.verde,   sub: `${BRL(pgtPend)} pend.` },
  ]

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Gráfico ativações por dia + donuts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Ativações por dia')}
          <LineAreaChart data={atsByDay} height={130} color={COR.roxo} valueKey="value" labelKey="label" />
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Distribuição de Calls')}
          <DonutChart data={donutCalls} size={110} thickness={16} />
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Usuários por Cargo')}
          <DonutChart data={donutRoles} size={110} thickness={16} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
            {donutRoles.map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, display: 'inline-block' }} />{r.label}
                </span>
                <strong style={{ color: r.color }}>{r.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top performers do mês */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Top Closers — Ativações do mês')}
          {(() => {
            const map: Record<string, number> = {}
            activations.forEach((a: any) => { map[a.responsible] = (map[a.responsible] ?? 0) + 1 })
            const sorted = Object.entries(map).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5)
            if (!sorted.length) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>
            const max = sorted[0][1] as number
            return sorted.map(([id, cnt], i) => {
              const u = (users as any[]).find((u: any) => u.id === id)
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: i < 3 ? ['#FFD600','#C0C0C0','#CD7F32'][i] : 'var(--text2)', minWidth: 16 }}>{i+1}</span>
                  <Avatar name={u?.name ?? id} size={26} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{u?.name ?? id}</div>
                    <div style={{ height: 6, background: 'var(--bg-card2)', borderRadius: 10, marginTop: 3 }}>
                      <div style={{ width: `${((cnt as number) / max) * 100}%`, height: '100%', background: COR.roxo, borderRadius: 10 }} />
                    </div>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 13, color: COR.roxo }}>{String(cnt)}</span>
                </div>
              )
            })
          })()}
        </div>

        <div style={{ ...card, padding: 20 }}>
          {lbl('Top SDRs — Calls realizadas')}
          {(() => {
            const map: Record<string, { total: number; realizadas: number; ativadas: number }> = {}
            calls.forEach((c: any) => {
              const n = c.sdr_nome || 'Sem SDR'
              if (!map[n]) map[n] = { total: 0, realizadas: 0, ativadas: 0 }
              map[n].total++
              if (c.status === 'Realizada') map[n].realizadas++
              if (c.ativado) map[n].ativadas++
            })
            const sorted = Object.entries(map).sort((a, b) => b[1].realizadas - a[1].realizadas).slice(0, 5)
            if (!sorted.length) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>
            const max = sorted[0][1].realizadas || 1
            return sorted.map(([nome, v], i) => (
              <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: i < 3 ? ['#FFD600','#C0C0C0','#CD7F32'][i] : 'var(--text2)', minWidth: 16 }}>{i+1}</span>
                <Avatar name={nome} size={26} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{nome}</div>
                  <div style={{ height: 6, background: 'var(--bg-card2)', borderRadius: 10, marginTop: 3 }}>
                    <div style={{ width: `${(v.realizadas / max) * 100}%`, height: '100%', background: COR.azul, borderRadius: 10 }} />
                  </div>
                </div>
                <span style={{ fontWeight: 800, fontSize: 13, color: COR.azul }}>{v.realizadas}<span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 11 }}>/{v.total}</span></span>
              </div>
            ))
          })()}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: ATIVAÇÕES
// ══════════════════════════════════════════════════════════════════════════════
function TabAtivacoes({ activations, users, atsByDay, card, lbl, BRL }: any) {
  const porCanal: Record<string, number> = {}
  activations.forEach((a: any) => { const k = a.channel || 'Sem canal'; porCanal[k] = (porCanal[k] ?? 0) + 1 })
  const barCanal = Object.entries(porCanal).sort((a,b) => b[1]-a[1]).map(([label, value]) => ({ label, value: value as number }))

  const porGcStatus: Record<string, number> = {}
  activations.forEach((a: any) => { const k = a.gc_status || 'Cliente novo'; porGcStatus[k] = (porGcStatus[k] ?? 0) + 1 })

  const porFunil: Record<string, number> = { Starter: 0, Growth: 0, Enterprise: 0, 'Sem info': 0 }
  activations.forEach((a: any) => {
    const f = a.faturamento_mensal
    if (!f) porFunil['Sem info']++
    else if (f <= 50000)  porFunil['Starter']++
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
  activations.forEach((a: any) => { porCloser[a.responsible] = (porCloser[a.responsible] ?? 0) + 1 })
  const barCloser = Object.entries(porCloser)
    .sort((a,b) => b[1]-a[1]).slice(0, 8)
    .map(([id, value]) => {
      const u = (users as any[]).find((u: any) => u.id === id)
      return { label: u?.name?.split(' ')[0] ?? '?', value: value as number }
    })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total ativações',    value: activations.length,                                                  color: COR.roxo    },
          { label: 'Com gerente',        value: activations.filter((a: any) => a.gerente_id).length,                 color: COR.verde   },
          { label: 'Boas-vindas enviadas', value: activations.filter((a: any) => a.welcome_sent).length,             color: COR.azul    },
          { label: 'Fat. médio/cliente', value: (() => { const v = activations.filter((a: any) => a.faturamento_mensal); return v.length ? BRL(v.reduce((s: number, a: any) => s + a.faturamento_mensal, 0) / v.length) : '—' })(), color: COR.verde },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Ativações por dia')}
          <LineAreaChart data={atsByDay} height={140} color={COR.roxo} valueKey="value" labelKey="label" />
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Distribuição por Funil')}
          <DonutChart data={donutFunil} size={110} thickness={16} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            {donutFunil.map(d => (
              <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text2)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, display: 'inline-block' }} />{d.label}
                </span>
                <strong style={{ color: d.color }}>{d.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Por Closer')}
          <BarChartH data={barCloser} labelKey="label" valueKey="value" color1={COR.roxo} color2="#9B59B6" />
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Por Canal')}
          {barCanal.length ? <BarChartH data={barCanal} labelKey="label" valueKey="value" color1={COR.azul} color2="#5AB4FF" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados de canal</div>}
        </div>
      </div>

      {/* Status Kanban GC */}
      <div style={{ ...card, padding: 20 }}>
        {lbl('Status no Kanban GC')}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(porGcStatus).map(([status, count]) => (
            <div key={status} style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', minWidth: 140 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{status}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{String(count)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CALLS / SDR
// ══════════════════════════════════════════════════════════════════════════════
function TabCalls({ calls, sdrs, card, lbl }: any) {
  const total      = calls.length
  const realizadas = calls.filter((c: any) => c.status === 'Realizada').length
  const noshow     = calls.filter((c: any) => c.status === 'No-show').length
  const canceladas = calls.filter((c: any) => c.status === 'Cancelada').length
  const ativadas   = calls.filter((c: any) => c.ativado).length
  const taxaReal   = total > 0 ? realizadas / total * 100 : 0
  const taxaAtiv   = realizadas > 0 ? ativadas / realizadas * 100 : 0

  const sdrMap: Record<string, { ag: number; re: number; ns: number; ca: number; at: number }> = {}
  calls.forEach((c: any) => {
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
  calls.filter((c: any) => c.motivo_nao_ativacao).forEach((c: any) => {
    motivosMap[c.motivo_nao_ativacao] = (motivosMap[c.motivo_nao_ativacao] ?? 0) + 1
  })
  const barMotivos = Object.entries(motivosMap).sort((a,b) => b[1]-a[1]).slice(0, 8)
    .map(([label, value]) => ({ label: label.length > 24 ? label.slice(0,22)+'…' : label, value: value as number }))

  const donut = [
    { label: 'Realizadas', value: realizadas, color: COR.verde    },
    { label: 'Agendadas',  value: total - realizadas - noshow - canceladas, color: COR.azul },
    { label: 'No-show',    value: noshow,     color: COR.amarelo  },
    { label: 'Canceladas', value: canceladas, color: COR.vermelho },
  ].filter(d => d.value > 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Calls',    value: total,                   color: COR.azul   },
          { label: 'Realizadas',     value: realizadas,              color: COR.verde  },
          { label: 'No-show',        value: noshow,                  color: COR.amarelo},
          { label: '% Realização',   value: `${taxaReal.toFixed(1)}%`, color: COR.azul },
          { label: '% Ativação',     value: `${taxaAtiv.toFixed(1)}%`, color: COR.verde},
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{String(k.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Status')}
          <DonutChart data={donut} size={110} thickness={16} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            {donut.map(d => (
              <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text2)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, display: 'inline-block' }} />{d.label}
                </span>
                <strong style={{ color: d.color }}>{d.value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Motivos de Não Ativação')}
          {barMotivos.length ? <BarChartH data={barMotivos} labelKey="label" valueKey="value" color1={COR.vermelho} color2={COR.amarelo} /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhum motivo registrado</div>}
        </div>
      </div>

      {/* Ranking SDRs */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Ranking SDRs</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card2)' }}>
                {['#','SDR','Agendadas','Realizadas','No-show','Canceladas','Ativadas','% Realiz.','% Ativação'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'SDR' || h === '#' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sdrRows.length === 0 && <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Sem dados</td></tr>}
              {sdrRows.map((s, i) => (
                <tr key={s.nome} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: i < 3 ? ['#FFD600','#C0C0C0','#CD7F32'][i] : 'var(--text2)' }}>{i+1}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.nome}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{s.ag}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: COR.verde, fontWeight: 700 }}>{s.re}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: s.ns > 0 ? COR.amarelo : 'var(--text2)' }}>{s.ns}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: s.ca > 0 ? COR.vermelho : 'var(--text2)' }}>{s.ca}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: COR.roxo, fontWeight: 700 }}>{s.at}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}><span style={{ color: s.pctR >= 80 ? COR.verde : s.pctR >= 50 ? COR.amarelo : COR.vermelho, fontWeight: 700 }}>{s.pctR.toFixed(1)}%</span></td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}><span style={{ color: s.pctA >= 30 ? COR.verde : s.pctA >= 15 ? COR.amarelo : COR.vermelho, fontWeight: 700 }}>{s.pctA.toFixed(1)}%</span></td>
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
// TAB: REUNIÕES GC
// ══════════════════════════════════════════════════════════════════════════════
function TabReunioes({ meetings, gerentes, card, lbl }: any) {
  const total    = meetings.length
  const realiz   = meetings.filter((m: any) => m.status === 'Realizada').length
  const noshow   = meetings.filter((m: any) => m.status === 'No-show').length
  const cancel   = meetings.filter((m: any) => m.status === 'Cancelada').length
  const agendada = meetings.filter((m: any) => m.status === 'Agendada').length

  const porGerente: Record<string, { total: number; realizadas: number }> = {}
  meetings.forEach((m: any) => {
    const g = (gerentes as any[]).find((u: any) => u.id === m.gerente_id)?.name ?? 'Sem gerente'
    if (!porGerente[g]) porGerente[g] = { total: 0, realizadas: 0 }
    porGerente[g].total++
    if (m.status === 'Realizada') porGerente[g].realizadas++
  })
  const barGerente = Object.entries(porGerente).map(([label, v]) => ({ label: label.split(' ')[0], value: v.realizadas }))

  const donut = [
    { label: 'Realizadas', value: realiz,   color: COR.verde   },
    { label: 'Agendadas',  value: agendada, color: COR.azul    },
    { label: 'No-show',    value: noshow,   color: COR.amarelo },
    { label: 'Canceladas', value: cancel,   color: COR.vermelho},
  ].filter(d => d.value > 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Reuniões', value: total,   color: COR.azul    },
          { label: 'Realizadas',     value: realiz,  color: COR.verde   },
          { label: 'No-show',        value: noshow,  color: COR.amarelo },
          { label: 'Taxa Realização',value: `${total > 0 ? (realiz/total*100).toFixed(1) : 0}%`, color: COR.verde },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{String(k.value)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Status')}
          <DonutChart data={donut} size={110} thickness={16} />
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Reuniões realizadas por Gerente')}
          {barGerente.length ? <BarChartH data={barGerente} labelKey="label" valueKey="value" color1={COR.roxo} color2="#9B59B6" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CARTEIRAS
// ══════════════════════════════════════════════════════════════════════════════
function TabCarteiras({ activations, gerentes, notaMap, card, lbl }: any) {
  const porGerente = (gerentes as any[]).map((g: any) => {
    const cli = activations.filter((a: any) => a.gerente_id === g.id)
    const comNota = cli.filter((a: any) => notaMap[a.email]).length
    return { nome: g.name, total: cli.length, comNota, semNota: cli.length - comNota }
  }).sort((a: any, b: any) => b.total - a.total)

  const semGerente = activations.filter((a: any) => !a.gerente_id).length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Total de clientes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COR.azul }}>{activations.length}</div>
        </div>
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Com nota registrada</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COR.verde }}>{activations.filter((a: any) => notaMap[a.email]).length}</div>
        </div>
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Sem gerente</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: semGerente > 0 ? COR.amarelo : COR.verde }}>{semGerente}</div>
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Carteira por Gerente</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              {['Gerente', 'Clientes', 'Com Nota', 'Cobertura', 'Sem Nota'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Gerente' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porGerente.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Sem dados</td></tr>}
            {porGerente.map((g: any) => {
              const pct = g.total > 0 ? (g.comNota / g.total * 100) : 0
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

// ══════════════════════════════════════════════════════════════════════════════
// TAB: PAGAMENTOS
// ══════════════════════════════════════════════════════════════════════════════
function TabPagamentos({ payments, users, card, lbl, BRL }: any) {
  const total   = payments.reduce((s: number, p: any) => s + (p.value ?? 0), 0)
  const pago    = payments.filter((p: any) => p.status === 'Pago').reduce((s: number, p: any) => s + p.value, 0)
  const pendente= payments.filter((p: any) => p.status === 'Pendente').reduce((s: number, p: any) => s + p.value, 0)

  const porUser: Record<string, number> = {}
  payments.forEach((p: any) => { porUser[p.user_id] = (porUser[p.user_id] ?? 0) + p.value })
  const barUser = Object.entries(porUser)
    .sort((a,b) => b[1]-a[1]).slice(0, 8)
    .map(([id, value]) => {
      const u = (users as any[]).find((u: any) => u.id === id)
      return { label: u?.name?.split(' ')[0] ?? '?', value: value as number }
    })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total registrado', value: BRL(total),   color: COR.azul    },
          { label: 'Pago',             value: BRL(pago),    color: COR.verde   },
          { label: 'Pendente',         value: BRL(pendente),color: COR.amarelo },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Por colaborador')}
          {barUser.length ? <BarChartH data={barUser} labelKey="label" valueKey="value" color1={COR.verde} color2="#7AE28C" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Lançamentos do mês</div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-card2)' }}>
                  {['Colaborador','Ref','Valor','Status','Data'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text2)' }}>Sem pagamentos</td></tr>}
                {(payments as any[]).map((p: any) => {
                  const u = (users as any[]).find((u: any) => u.id === p.user_id)
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{u?.name?.split(' ')[0] ?? '?'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{p.ref || '—'}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: COR.verde }}>{BRL(p.value)}</td>
                      <td style={{ padding: '8px 12px' }}><Badge label={p.status} color={p.status === 'Pago' ? COR.verde : COR.amarelo} /></td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{p.date ? new Date(p.date + 'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: USUÁRIOS
// ══════════════════════════════════════════════════════════════════════════════
function TabUsuarios({ users, activations, calls, card, lbl }: any) {
  const atMap: Record<string, number> = {}
  activations.forEach((a: any) => { atMap[a.responsible] = (atMap[a.responsible] ?? 0) + 1 })
  const callMap: Record<string, { ag: number; re: number }> = {}
  calls.forEach((c: any) => {
    if (!callMap[c.responsible]) callMap[c.responsible] = { ag: 0, re: 0 }
    callMap[c.responsible].ag++
    if (c.status === 'Realizada') callMap[c.responsible].re++
  })

  const roles = [...new Set((users as any[]).map((u: any) => u.role))].sort()

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {roles.map((r: any) => {
          const cnt = (users as any[]).filter((u: any) => u.role === r).length
          return (
            <div key={r} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{r}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COR.azul }}>{cnt}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{(users as any[]).filter((u: any) => u.role === r && u.active).length} ativos</div>
            </div>
          )
        })}
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Todos os Usuários</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card2)' }}>
                {['Nome','Email','Cargo','Time','Ativações','Calls','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(users as any[]).map((u: any) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={u.name} size={28} /><span style={{ fontWeight: 600 }}>{u.name}</span></div></td>
                  <td style={{ padding: '10px 14px', color: 'var(--text2)', fontSize: 12 }}>{u.email}</td>
                  <td style={{ padding: '10px 14px' }}><Badge label={u.role} color="var(--action)" /></td>
                  <td style={{ padding: '10px 14px', color: 'var(--text2)', fontSize: 12 }}>{u.team_id ?? '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: COR.roxo }}>{atMap[u.id] ?? '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: COR.azul }}>
                    {callMap[u.id] ? `${callMap[u.id].re}/${callMap[u.id].ag}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                      background: u.active ? 'color-mix(in srgb, #34C759 12%, var(--bg-card2))' : 'var(--bg-card2)',
                      color: u.active ? '#34C759' : 'var(--text2)',
                      border: `1px solid ${u.active ? '#34C75930' : 'var(--border)'}` }}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
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
// TAB: AUDITORIA
// ══════════════════════════════════════════════════════════════════════════════
function TabAuditoria({ auditLogs, card, lbl }: any) {
  const porModulo: Record<string, number> = {}
  auditLogs.forEach((a: any) => { porModulo[a.module] = (porModulo[a.module] ?? 0) + 1 })
  const barModulo = Object.entries(porModulo).sort((a,b) => b[1]-a[1])
    .map(([label, value]) => ({ label, value: value as number }))

  const porUser: Record<string, number> = {}
  auditLogs.forEach((a: any) => { porUser[a.user_name] = (porUser[a.user_name] ?? 0) + 1 })
  const barUser = Object.entries(porUser).sort((a,b) => b[1]-a[1]).slice(0, 8)
    .map(([label, value]) => ({ label: label.split(' ')[0], value: value as number }))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Total de ações</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COR.azul }}>{auditLogs.length}</div>
        </div>
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Usuários ativos (audit)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COR.verde }}>{Object.keys(porUser).length}</div>
        </div>
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Módulos acionados</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COR.roxo }}>{Object.keys(porModulo).length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Ações por Módulo')}
          {barModulo.length ? <BarChartH data={barModulo} labelKey="label" valueKey="value" color1={COR.azul} color2="#5AB4FF" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
        <div style={{ ...card, padding: 20 }}>
          {lbl('Ações por Usuário')}
          {barUser.length ? <BarChartH data={barUser} labelKey="label" valueKey="value" color1={COR.roxo} color2="#9B59B6" /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem dados</div>}
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Log completo (últimas 50 ações)</div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card2)', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Usuário','Ação','Módulo','Data/Hora'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 && <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>Sem registros</td></tr>}
              {auditLogs.map((a: any) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={a.user_name} size={24} /><span style={{ fontWeight: 600, fontSize: 12 }}>{a.user_name}</span></div></td>
                  <td style={{ padding: '9px 14px', color: 'var(--text2)', fontSize: 12 }}>{a.action}</td>
                  <td style={{ padding: '9px 14px' }}><Badge label={a.module} color="var(--action)" /></td>
                  <td style={{ padding: '9px 14px', color: 'var(--text2)', fontSize: 12 }}>{new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
