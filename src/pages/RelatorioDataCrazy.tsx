import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Phone, Users, TrendingUp, Filter } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { supabase } from '@/lib/supabase/client'

type Lead = {
  leadId: string; leadName: string; leadEmail: string; phone: string
  esteira: string; sdr: string; stage: string
  origens: string[]; callAgendada: boolean; closer: string; closerTipo: string
  lastMovedAt: string
}
type Stats = Record<string, { total: number; cadu: number; geovana: number; callAgendada: number; clienteAtivo: number; leads: number; qualificados: number }>
type ReportData = {
  leads: Lead[]
  stats: Stats
  totals: { total: number; cadu: number; geovana: number; callAgendada: number; leadsTotal: number; qualificadosTotal: number }
  fetchedAt: string
}

const CAMPANHA_COLORS: Record<string, string> = {
  'Campanha Low Ticket':    'var(--action)',
  'Campanha Meta - Ads':    '#2BB9FF',
  'Formulário Dist. Leads': '#BF5AF2',
  'Campanha Juros':         '#F59E0B',
}
const ESTEIRA_COLORS: Record<string, string> = {
  'Esteira Cadu':    '#07BA1C',
  'Esteira Geovana': '#5AABB5',
}
const fmt = (d: string) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

function KpiBox({ label, value, sub, color, icon }: { label: string; value: number | string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `color-mix(in srgb, ${color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{sub}</div>}
    </div>
  )
}

export default function RelatorioDataCrazy() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading])
  if (loading || !user) return null
  return <Content />
}

function Content() {
  const [data,       setData]       = useState<ReportData | null>(null)
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState('')
  const [filterEst,  setFilterEst]  = useState('all')
  const [filterCamp, setFilterCamp] = useState('all')
  const [filterCall, setFilterCall] = useState('all')
  const [search,     setSearch]     = useState('')
  const [dateFrom,   setDateFrom]   = useState('2026-05-30')
  const [dateTo,     setDateTo]     = useState(new Date().toISOString().slice(0, 10))

  async function load() {
    setIsLoading(true); setError('')
    const { data: res, error: err } = await supabase.functions.invoke('datacrazy-report', {
      body: { leads_report: true, startDate: dateFrom || undefined, endDate: dateTo || undefined },
    })
    if (err || res?.error) setError(err?.message ?? res?.error ?? 'Erro ao carregar')
    else setData(res as ReportData)
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  const leads  = data?.leads ?? []
  const stats  = data?.stats ?? {}
  const totals = data?.totals ?? { total: 0, cadu: 0, geovana: 0, callAgendada: 0 }

  const filtered = leads.filter(l => {
    if (filterEst  !== 'all' && l.esteira !== filterEst)                       return false
    if (filterCamp !== 'all' && !l.origens.includes(filterCamp))               return false
    if (filterCall === 'sim' && !l.callAgendada)                               return false
    if (filterCall === 'nao' && l.callAgendada)                                return false
    if (search && !l.leadName.toLowerCase().includes(search.toLowerCase()) &&
                  !l.leadEmail.toLowerCase().includes(search.toLowerCase()))   return false
    return true
  })

  const selStyle: React.CSSProperties = {
    fontSize: 13, padding: '7px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-card2)',
    color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
  }
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em',
    whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', background: 'var(--bg-card2)',
  }
  const tdStyle: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }

  return (
    <>
      <Header />
      <div className="page-wrap">

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>Pipeline — Campanhas</h1>
            {data?.fetchedAt && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Atualizado em {new Date(data.fetchedAt).toLocaleString('pt-BR')}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>De</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="inp" style={{ fontSize: 13, padding: '7px 10px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Até</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="inp" style={{ fontSize: 13, padding: '7px 10px' }} />
            </div>
            <button onClick={load} disabled={isLoading} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
              border: 'none', background: 'var(--action)', color: '#E2CFB7',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isLoading ? 0.6 : 1,
            }}>
              <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              Buscar
            </button>
          </div>
        </div>

        {error && <div style={{ padding: '14px 20px', borderRadius: 10, background: 'color-mix(in srgb, var(--red) 12%, var(--bg-card2))', border: '1px solid var(--red)', color: 'var(--red)', marginBottom: 20, fontSize: 13 }}>{error}</div>}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)', fontSize: 14 }}>Buscando leads nas campanhas e esteiras…</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
              <KpiBox label="Total Leads"         value={totals.leadsTotal ?? 0}        color="var(--cyan)"    sub="criados no período"      icon={<Users size={16} color="var(--cyan)" />} />
              <KpiBox label="Qualificados"        value={totals.qualificadosTotal ?? 0} color="var(--orange)"  sub="R$10–30k ou além"         icon={<Filter size={16} color="var(--orange)" />} />
              <KpiBox label="Total nas Esteiras"  value={totals.total}                  color="var(--action)"  sub="vindos das 4 campanhas"   icon={<TrendingUp size={16} color="var(--action)" />} />
              <KpiBox label="Esteira Cadu"        value={totals.cadu}                   color="#07BA1C"        sub="Carlos Eduardo"            icon={<TrendingUp size={16} color="#07BA1C" />} />
              <KpiBox label="Esteira Geovana"     value={totals.geovana}                color="#5AABB5"        sub="Geovana Paiva"             icon={<TrendingUp size={16} color="#5AABB5" />} />
              <KpiBox label="Call Agendada"       value={totals.callAgendada}           color="var(--purple)"  sub={`${totals.total > 0 ? Math.round(totals.callAgendada / totals.total * 100) : 0}% dos leads`} icon={<Phone size={16} color="var(--purple)" />} />
            </div>

            {/* Stats por campanha */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Por Campanha de Origem</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Campanha','Leads','Qualificados','Entrou na Esteira','Esteira Cadu','Esteira Geovana','Call Agendada','Cliente Ativo','% Call'].map((h, i) => (
                      <th key={h} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats).sort(([, a], [, b]) => (b.leads + b.qualificados) - (a.leads + a.qualificados)).map(([camp, s]) => (
                    <tr key={camp}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={tdStyle}><span style={{ fontWeight: 600, color: CAMPANHA_COLORS[camp] ?? 'var(--action)' }}>{camp}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--cyan)' }}>{s.leads ?? 0}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--orange)' }}>{s.qualificados ?? 0}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{s.cadu + s.geovana}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#07BA1C' }}>{s.cadu}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#5AABB5' }}>{s.geovana}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--purple)', fontWeight: 700 }}>{s.callAgendada}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: (s.clienteAtivo ?? 0) > 0 ? 'var(--green)' : 'var(--text2)', fontWeight: (s.clienteAtivo ?? 0) > 0 ? 700 : 400 }}>{s.clienteAtivo ?? 0}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: (s.cadu + s.geovana) > 0 && s.callAgendada / (s.cadu + s.geovana) >= 0.5 ? 'var(--green)' : s.callAgendada > 0 ? 'var(--orange)' : 'var(--text2)' }}>
                        {(s.cadu + s.geovana) > 0 ? `${Math.round(s.callAgendada / (s.cadu + s.geovana) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar lead…" className="inp"
                style={{ fontSize: 13, padding: '7px 12px', flex: 1, minWidth: 180 }} />
              <select value={filterEst}  onChange={e => setFilterEst(e.target.value)}  style={selStyle}>
                <option value="all">Todas as Esteiras</option>
                <option value="Esteira Cadu">Esteira Cadu</option>
                <option value="Esteira Geovana">Esteira Geovana</option>
              </select>
              <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)} style={selStyle}>
                <option value="all">Todas as Campanhas</option>
                <option value="Campanha Low Ticket">Low Ticket</option>
                <option value="Campanha Meta - Ads">Meta - Ads</option>
                <option value="Formulário Dist. Leads">Formulário Leads</option>
                <option value="Campanha Juros">Campanha Juros</option>
              </select>
              <select value={filterCall} onChange={e => setFilterCall(e.target.value)} style={selStyle}>
                <option value="all">Todos</option>
                <option value="sim">Com Call Agendada</option>
                <option value="nao">Sem Call Agendada</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{filtered.length}/{leads.length} leads</span>
            </div>

            {/* Tabela de leads */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Lead','Email','Esteira','SDR','Stage Atual','Origem','Call Ag.','Closer','Movido em'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text2)', padding: 40 }}>Nenhum lead encontrado.</td></tr>
                  )}
                  {filtered.map(l => (
                    <tr key={l.leadId + l.esteira}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={l.leadName} size={26} />
                          {l.leadName}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text2)', fontSize: 12 }}>{l.leadEmail || '—'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: ESTEIRA_COLORS[l.esteira] ?? 'var(--text2)' }}>
                          {l.esteira.replace('Esteira ', '')}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{l.sdr.split(' ')[0]}</td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>{l.stage}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {l.origens.map(o => (
                            <span key={o} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `color-mix(in srgb, ${CAMPANHA_COLORS[o] ?? 'var(--text2)'} 15%, var(--bg-card2))`, color: CAMPANHA_COLORS[o] ?? 'var(--text2)', whiteSpace: 'nowrap', display: 'inline-block' }}>
                              {o.replace('Campanha ', '').replace('Formulário Dist. Leads', 'Form. Leads')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {l.callAgendada
                          ? <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 16 }}>✓</span>
                          : <span style={{ color: 'var(--text2)' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {l.closer ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--action)' }}>{l.closer.split(' ')[0]}</div>
                            <div style={{ fontSize: 10, color: l.closerTipo === 'Cliente Ativo' ? 'var(--green)' : l.closerTipo === 'Call Realizada' ? 'var(--green)' : 'var(--cyan)', fontWeight: 600 }}>{l.closerTipo}</div>
                          </div>
                        ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmt(l.lastMovedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
