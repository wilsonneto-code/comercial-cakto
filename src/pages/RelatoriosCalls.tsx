import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { supabase } from '@/lib/supabase/client'
import { ChevronDown, Loader2 } from 'lucide-react'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const CALL_STATUS_COLORS: Record<string, string> = {
  Agendada:  'var(--action)',
  Realizada: 'var(--green)',
  Cancelada: 'var(--red)',
  'No-show': 'var(--orange)',
}

const GCAL_COLORS: Record<number, string> = {
  1:'#7986cb',2:'#33b679',3:'#8e24aa',4:'#e67c73',5:'#f6c026',
  6:'#f5511d',7:'#039be5',8:'#3f51b5',9:'#0b8043',10:'#d50000',11:'#f691b3',
}
function closerColor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff
  return GCAL_COLORS[(h % 11) + 1] ?? '#7986cb'
}

type DbUser  = { id: string; name: string; role: string }
type HistRow = {
  id: string; title: string; date: string; time: string; end_time: string | null
  responsible: string; status: string; notes: string; client_email: string
  google_event_id: string; meet_link: string; period: string
}
type PeriodStats = {
  period: string
  label: string
  total: number
  realized: number
  canceled: number
  noshow: number
  scheduled: number
  closers: {
    id: string; name: string; total: number; done: number; rate: number
    calls: { title: string; date: string; time: string; status: string }[]
  }[]
}

export default function RelatoriosCalls() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  return <RelatoriosContent />
}

function RelatoriosContent() {
  const today = new Date()
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const [isLoading, setIsLoading]             = useState(true)
  const [periods, setPeriods]                 = useState<PeriodStats[]>([])
  const [selectedPeriod, setSelectedPeriod]   = useState<string>(currentPeriod)
  const [expandedClosers, setExpandedClosers] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [{ data: dbUsers }, { data: dbHistory }, { data: dbCalls }] = await Promise.all([
        supabase.from('users').select('id,name,role').order('name'),
        supabase.from('calls_history')
          .select('id,title,date,time,end_time,responsible,status,notes,client_email,google_event_id,meet_link,period')
          .order('period', { ascending: false }),
        supabase.from('calls')
          .select('id,title,date,time,end_time,responsible,status,notes,client_email,google_event_id,meet_link'),
      ])

      const users  = (dbUsers  || []) as DbUser[]
      const closers = users.filter(u => u.role === 'Closer')

      const currentRows: HistRow[] = (dbCalls || []).map((c: any) => ({
        ...c,
        period: (c.date as string)?.slice(0, 7) ?? currentPeriod,
      }))
      const allRows: HistRow[] = [...(dbHistory || []).map((c: any) => c as HistRow), ...currentRows]

      const periodMap = new Map<string, HistRow[]>()
      for (const row of allRows) {
        if (!periodMap.has(row.period)) periodMap.set(row.period, [])
        periodMap.get(row.period)!.push(row)
      }

      const result: PeriodStats[] = []
      for (const [period, rows] of [...periodMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
        const [py, pm] = period.split('-').map(Number)
        result.push({
          period,
          label: `${MONTHS[pm - 1]} ${py}${period === currentPeriod ? ' (mês atual)' : ''}`,
          total:     rows.length,
          realized:  rows.filter(r => r.status === 'Realizada').length,
          canceled:  rows.filter(r => r.status === 'Cancelada').length,
          noshow:    rows.filter(r => r.status === 'No-show').length,
          scheduled: rows.filter(r => r.status === 'Agendada').length,
          closers: closers.map(u => {
            const uRows = rows.filter(r => r.responsible === u.id)
            const done  = uRows.filter(r => r.status === 'Realizada').length
            return {
              id: u.id, name: u.name,
              total: uRows.length, done,
              rate: uRows.length ? Math.round((done / uRows.length) * 100) : 0,
              calls: uRows
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(r => ({ title: r.title, date: r.date, time: (r.time || '').slice(0, 5), status: r.status })),
            }
          }).filter(c => c.total > 0),
        })
      }

      setPeriods(result)
      setIsLoading(false)
    }
    load()
  }, [])

  function toggleCloser(key: string) {
    setExpandedClosers(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Relatório de Calls</h1>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14 }}>Carregando relatórios…</span>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : periods.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 64, fontSize: 14 }}>
            Nenhum dado encontrado.
          </div>
        ) : (
          <>
            {/* ── Filtro de mês ──────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {periods.map(p => {
                const active = selectedPeriod === p.period
                return (
                  <button key={p.period} onClick={() => { setSelectedPeriod(p.period); setExpandedClosers(new Set()) }}
                    style={{
                      padding: '7px 18px', borderRadius: 20, border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                      background: active ? 'var(--action)' : 'var(--bg-card)',
                      color: active ? '#fff' : 'var(--text2)',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                    }}>
                    {p.label}
                  </button>
                )
              })}
            </div>

            {/* ── Período selecionado ────────────────────────────────── */}
            {periods.filter(p => p.period === selectedPeriod).map(p => (
              <div key={p.period} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: 24 }}>

                      {/* KPIs do período */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
                        {[
                          { label: 'Total de Calls', value: p.total,     color: 'var(--text)'   },
                          { label: 'Realizadas',     value: p.realized,  color: 'var(--green)'  },
                          { label: 'Taxa Realização',value: p.total ? `${Math.round((p.realized / p.total) * 100)}%` : '—', color: p.total && (p.realized / p.total) >= 0.7 ? 'var(--green)' : 'var(--orange)' },
                          { label: 'Canceladas',     value: p.canceled,  color: 'var(--red)'    },
                          { label: 'No-show',        value: p.noshow,    color: 'var(--orange)'  },
                          { label: 'Agendadas',      value: p.scheduled, color: 'var(--action)'  },
                        ].map(k => (
                          <div key={k.label} style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Performance por Closer */}
                      {p.closers.length > 0 && (
                        <>
                          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Performance por Closer</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {p.closers.map(c => {
                              const cc = closerColor(c.name)
                              const closerKey = `${p.period}-${c.id}`
                              const closerOpen = expandedClosers.has(closerKey)
                              return (
                                <div key={c.id} style={{ background: 'var(--bg-card2)', borderRadius: 10, overflow: 'hidden' }}>
                                  <button onClick={() => toggleCloser(closerKey)} style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text)', fontFamily: 'inherit',
                                  }}>
                                    <Avatar name={c.name} size={32} />
                                    <div style={{ flex: 1, textAlign: 'left' }}>
                                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.total} call{c.total !== 1 ? 's' : ''} · {c.done} realizadas</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ width: 80 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                                          <span style={{ color: 'var(--text2)' }}>{c.rate}%</span>
                                        </div>
                                        <div style={{ height: 5, borderRadius: 3, background: 'var(--border)' }}>
                                          <div style={{ height: '100%', borderRadius: 3, width: `${c.rate}%`, background: c.rate >= 70 ? 'var(--green)' : c.rate >= 40 ? 'var(--orange)' : 'var(--red)', transition: 'width .3s' }} />
                                        </div>
                                      </div>
                                      <ChevronDown size={14} style={{ color: 'var(--text2)', transform: closerOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                                    </div>
                                  </button>
                                  {closerOpen && c.calls.length > 0 && (
                                    <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                          <tr>
                                            {['Data', 'Hora', 'Título', 'Status'].map(h => (
                                              <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                                                color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em',
                                                borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {c.calls.map((row, i) => (
                                            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-card2)' : 'var(--bg-card)' }}>
                                              <td style={{ padding: '7px 14px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                                                {new Date(row.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                              </td>
                                              <td style={{ padding: '7px 14px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{row.time}</td>
                                              <td style={{ padding: '7px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{row.title}</td>
                                              <td style={{ padding: '7px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                  background: `color-mix(in srgb, ${CALL_STATUS_COLORS[row.status] || 'var(--text2)'} 15%, var(--bg-card2))`,
                                                  color: CALL_STATUS_COLORS[row.status] || 'var(--text2)',
                                                  border: `1px solid ${CALL_STATUS_COLORS[row.status] || 'var(--border)'}`,
                                                  borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 700,
                                                }}>{row.status}</span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}
