import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase/client'
import { avatarColor } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, ChevronLeft, RotateCcw } from 'lucide-react'

type GcTask = {
  id: string; activation_id: string; gerente_id: string
  client_name: string; client_email: string; phone: string | null
  tipo: string; title: string | null; gc_tier: string | null
  due_date: string; status: string
  completed_at: string | null; completed_by: string | null; notes: string | null
}
type DbUser = { id: string; name: string; role: string }

const TASK_LABEL: Record<string, string> = {
  alterar_taxas:            'Alteração de Taxa',
  d2_boas_vindas:           'Boas Vindas',
  adicionar_carteira:       'Adicionar na Carteira',
  d7_incentivo:             'Followup Ativação',
  d15_manual:               'Acompanhamento Manual',
  d30_ciclo:                'Resultado do Faturamento',
  acompanhamento_quinzenal: 'Acompanhamento Quinzenal',
  acompanhamento_semanal:   'Acompanhamento Semanal',
}
const TIER_COLOR: Record<string, string> = { starter: '#07BA1C', growth: '#2BB9FF', enterprise: '#BF5AF2' }
const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function DashboardTarefasGC() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  if (!hasAnyRole(user, ['Admin', 'Sócio'])) {
    return <><Header /><div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>Acesso restrito.</div></>
  }
  return <TarefasGCContent />
}

function TarefasGCContent() {
  const today = new Date().toISOString().slice(0, 10)
  const [tasks,    setTasks]    = useState<GcTask[]>([])
  const [users,    setUsers]    = useState<DbUser[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filterGerente, setFilterGerente] = useState('')
  const [filterTipo,    setFilterTipo]    = useState('')
  const [filterStatus,  setFilterStatus]  = useState<'todos' | 'pendente' | 'vencida' | 'concluida'>('todos')
  const [filterTier,    setFilterTier]    = useState('')
  const [subtab,        setSubtab]        = useState<'pendentes' | 'relatorio'>('pendentes')
  const [completingId,  setCompletingId]  = useState<string | null>(null)
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      supabase.from('gc_tasks').select('*').order('due_date').order('created_at'),
      supabase.from('users').select('id,name,role').in('role', ['Gerente de Contas', 'Admin']),
    ]).then(([{ data: t }, { data: u }]) => {
      if (t) setTasks(t as GcTask[])
      if (u) setUsers(u as DbUser[])
      setLoading(false)
    })
  }, [])

  async function completeTask(id: string) {
    setCompletingId(id)
    await supabase.from('gc_tasks').update({ status: 'concluida', completed_at: new Date().toISOString() }).eq('id', id)
    setTasks(p => p.map(t => t.id === id ? { ...t, status: 'concluida', completed_at: new Date().toISOString() } : t))
    setCompletingId(null)
  }

  async function reopenTask(id: string) {
    setCompletingId(id)
    await supabase.from('gc_tasks').update({ status: 'pendente', completed_at: null, completed_by: null }).eq('id', id)
    setTasks(p => p.map(t => t.id === id ? { ...t, status: 'pendente', completed_at: null } : t))
    setCompletingId(null)
  }

  const toggleExpand = (id: string) => setExpanded(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })

  const gerentes = useMemo(() => users.filter(u => u.role === 'Gerente de Contas'), [users])

  const filtered = useMemo(() => tasks.filter(t => {
    if (filterGerente && t.gerente_id !== filterGerente) return false
    if (filterTipo && t.tipo !== filterTipo) return false
    if (filterTier && t.gc_tier !== filterTier) return false
    if (filterStatus === 'pendente') return t.status === 'pendente' && t.due_date >= today
    if (filterStatus === 'vencida')  return t.status === 'pendente' && t.due_date < today
    if (filterStatus === 'concluida') return t.status === 'concluida'
    return true
  }), [tasks, filterGerente, filterTipo, filterTier, filterStatus, today])

  const pending   = filtered.filter(t => t.status !== 'concluida')
  const completed = filtered.filter(t => t.status === 'concluida')

  // KPIs globais (sem filtro de status)
  const allFiltered = tasks.filter(t => {
    if (filterGerente && t.gerente_id !== filterGerente) return false
    if (filterTipo && t.tipo !== filterTipo) return false
    if (filterTier && t.gc_tier !== filterTier) return false
    return true
  })
  const kpiPendentes  = allFiltered.filter(t => t.status === 'pendente' && t.due_date >= today).length
  const kpiVencidas   = allFiltered.filter(t => t.status === 'pendente' && t.due_date < today).length
  const kpiConcluidas = allFiltered.filter(t => t.status === 'concluida').length
  const kpiTotal      = allFiltered.length

  // Performance por gerente
  const perfByGerente = useMemo(() => gerentes.map(g => {
    const gt = tasks.filter(t => t.gerente_id === g.id)
    const conc = gt.filter(t => t.status === 'concluida').length
    const venc = gt.filter(t => t.status === 'pendente' && t.due_date < today).length
    const pend = gt.filter(t => t.status === 'pendente' && t.due_date >= today).length
    const pct  = gt.length > 0 ? Math.round(conc / gt.length * 100) : 0
    return { ...g, total: gt.length, conc, venc, pend, pct }
  }).sort((a, b) => b.conc - a.conc), [gerentes, tasks, today])

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }
  const inp:  React.CSSProperties = { background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }

  if (loading) return <><Header /><div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>Carregando...</div></>

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/dashboards')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, padding: 0, fontFamily: 'inherit' }}>
            <ChevronLeft size={16} /> Dashboards
          </button>
          <span style={{ color: 'var(--text2)' }}>/</span>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Tarefas GC</h1>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {[
            { label: 'Pendentes',  value: kpiPendentes,  color: 'var(--action)', icon: Clock },
            { label: 'Vencidas',   value: kpiVencidas,   color: kpiVencidas > 0 ? 'var(--red)' : 'var(--text2)', icon: AlertCircle },
            { label: 'Concluídas', value: kpiConcluidas, color: 'var(--green)',  icon: CheckCircle },
            { label: 'Total',      value: kpiTotal,      color: 'var(--text2)',  icon: Clock },
          ].map(k => (
            <div key={k.label} style={{ ...card, padding: 20, textAlign: 'center' }}>
              <k.icon size={20} color={k.color} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 32, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Performance por Gerente */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Performance por Gerente</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card2)' }}>
                {['Gerente', 'Total', 'Pendentes', 'Vencidas', 'Concluídas', '% Concluído'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Gerente' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perfByGerente.map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => setFilterGerente(f => f === g.id ? '' : g.id)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: avatarColor(g.name), flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: avatarColor(g.name) }}>{g.name}</span>
                      {filterGerente === g.id && <span style={{ fontSize: 10, background: 'var(--action)', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>filtrado</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{g.total}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--action)', fontWeight: 700 }}>{g.pend}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: g.venc > 0 ? 'var(--red)' : 'var(--text2)', fontWeight: 700 }}>{g.venc}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{g.conc}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, color: g.pct >= 70 ? 'var(--green)' : g.pct >= 40 ? 'var(--orange)' : 'var(--red)' }}>{g.pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterGerente} onChange={e => setFilterGerente(e.target.value)} style={inp}>
            <option value="">Todos os gerentes</option>
            {gerentes.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={inp}>
            <option value="">Todos os tipos</option>
            {Object.entries(TASK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={inp}>
            <option value="">Todos os tiers</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Enterprise</option>
          </select>
          {(filterGerente || filterTipo || filterTier || filterStatus !== 'todos') && (
            <button onClick={() => { setFilterGerente(''); setFilterTipo(''); setFilterTier(''); setFilterStatus('todos') }}
              style={{ ...inp, color: 'var(--red)', fontWeight: 600 }}>✕ Limpar filtros</button>
          )}
        </div>

        {/* Sub-tabs */}
        <div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 16 }}>
            {([['pendentes', `Pendentes (${pending.length})`], ['relatorio', `Relatório (${completed.length})`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSubtab(k)}
                style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: subtab === k ? 'var(--action)' : 'transparent',
                  color: subtab === k ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13 }}>{l}</button>
            ))}
          </div>

          {/* Filtro de status rápido */}
          {subtab === 'pendentes' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {([['todos','Todos'], ['pendente','No prazo'], ['vencida','Vencidas']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilterStatus(k)}
                  style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${filterStatus === k ? 'var(--action)' : 'var(--border)'}`,
                    background: filterStatus === k ? 'color-mix(in srgb,var(--action) 15%,var(--bg-card))' : 'var(--bg-card)',
                    color: filterStatus === k ? 'var(--action)' : 'var(--text2)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
              ))}
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {subtab === 'pendentes' && (
              pending.length === 0
                ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Nenhuma tarefa pendente 🎉</div>
                : pending.map(t => <TaskRow key={t.id} t={t} today={today} users={users} onComplete={completeTask} completingId={completingId} expanded={expanded} onToggle={toggleExpand} />)
            )}
            {subtab === 'relatorio' && (
              completed.length === 0
                ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Nenhuma tarefa concluída.</div>
                : completed.map(t => <TaskRow key={t.id} t={t} today={today} users={users} onComplete={completeTask} onReopen={reopenTask} completingId={completingId} expanded={expanded} onToggle={toggleExpand} />)
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function TaskRow({ t, today, users, onComplete, onReopen, completingId, expanded, onToggle }: {
  t: GcTask; today: string; users: DbUser[]
  onComplete: (id: string) => void; onReopen?: (id: string) => void
  completingId: string | null; expanded: Set<string>; onToggle: (id: string) => void
}) {
  const label       = t.title ?? TASK_LABEL[t.tipo] ?? t.tipo
  const isOverdue   = t.status !== 'concluida' && t.due_date < today
  const tierColor   = t.gc_tier ? TIER_COLOR[t.gc_tier] : 'var(--text2)'
  const gerenteName = users.find(u => u.id === t.gerente_id)?.name ?? '—'
  const isExpanded  = expanded.has(t.id)
  const hasNotes    = (t.tipo === 'alterar_taxas' || t.tipo === 'adicionar_carteira') && !!t.notes

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: t.tipo === 'alterar_taxas' ? 'var(--red)' : 'var(--text)' }}>{label}</span>
            {t.gc_tier && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${tierColor}22`, color: tierColor, textTransform: 'capitalize' }}>{t.gc_tier}</span>}
            {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#ff3b3022', color: 'var(--red)' }}>Vencida</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t.client_name || t.client_email}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: avatarColor(gerenteName) }}>· {gerenteName}</span>
            {hasNotes && (
              <button onClick={() => onToggle(t.id)}
                style={{ fontSize: 11, color: 'var(--action)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', fontWeight: 600 }}>
                {isExpanded ? '▲ ocultar' : '▼ ver notas'}
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--text2)', whiteSpace: 'nowrap', fontWeight: isOverdue ? 700 : 400 }}>
          {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
        </div>
        {t.phone && (
          <a href={`https://wa.me/55${t.phone.replace(/\D/g, '').replace(/^55/, '')}`}
            target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#25D36622', border: '1px solid #25D366', flexShrink: 0, textDecoration: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </a>
        )}
        {t.status !== 'concluida' ? (
          <button onClick={() => onComplete(t.id)} disabled={completingId === t.id}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--green)', background: 'color-mix(in srgb,var(--green) 12%,var(--bg-card))', color: 'var(--green)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {completingId === t.id ? '...' : '✓ Concluir'}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              ✓ {t.completed_at ? new Date(t.completed_at).toLocaleDateString('pt-BR') : ''}
            </span>
            {onReopen && (
              <button onClick={() => onReopen(t.id)} disabled={completingId === t.id}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                {completingId === t.id ? '...' : '↩ Reabrir'}
              </button>
            )}
          </div>
        )}
      </div>
      {hasNotes && isExpanded && (
        <div style={{ margin: '0 18px 12px', padding: 12, background: 'var(--bg-card2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 240, overflowY: 'auto' }}>
          {t.notes}
        </div>
      )}
    </div>
  )
}
