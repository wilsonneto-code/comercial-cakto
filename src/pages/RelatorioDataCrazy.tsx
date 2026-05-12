import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import { BarChartH } from '@/components/ui/charts/BarChartH'
import { supabase } from '@/lib/supabase/client'
import { Loader2, RefreshCw } from 'lucide-react'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const PIPELINE_COLORS = ['#2563eb', '#7c3aed', '#059669']
const STAGE_COLORS = [
  '#2563eb','#7c3aed','#059669','#d97706','#dc2626',
  '#0891b2','#65a30d','#9333ea','#ea580c','#0284c7',
]

type Stage      = { id: string; name: string; index: number; count: number }
type Business   = { id: string; leadId: string; leadName: string; leadEmail: string; stageId: string; stageName: string; createdAt: string; updatedAt: string; total: number }
type Pipeline   = { pipeline: string; closer: string; pipelineId: string; stages: Stage[]; businesses: Business[] }
type ReportData = { pipelines: Pipeline[]; fetchedAt: string }

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default function RelatorioDataCrazy() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  return <ReportContent />
}

function ReportContent() {
  const today = new Date()
  const [data, setData]           = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState('')
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [selectedPipeline, setSelectedPipeline] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'funil' | 'negocios' | 'desempenho'>('funil')

  async function load() {
    setIsLoading(true); setError('')
    const { data: res, error: err } = await supabase.functions.invoke('datacrazy-report')
    if (err || res?.error) { setError(err?.message ?? res?.error ?? 'Erro ao carregar'); setIsLoading(false); return }
    setData(res as ReportData)
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  // Meses disponíveis a partir dos dados
  const availableMonths = data ? [...new Set(
    data.pipelines.flatMap(p => p.businesses.map(b => b.createdAt?.slice(0, 7) ?? ''))
  )].filter(Boolean).sort((a, b) => b.localeCompare(a)) : []

  // Filtra businesses por mês e pipeline
  function filteredBusinesses(p: Pipeline) {
    return p.businesses.filter(b => {
      const monthMatch = selectedMonth === 'all' || b.createdAt?.startsWith(selectedMonth)
      return monthMatch
    })
  }

  const pipelines = data?.pipelines.filter(p =>
    selectedPipeline === 'all' || p.pipeline === selectedPipeline
  ) ?? []

  // KPIs globais
  const allBiz      = pipelines.flatMap(p => filteredBusinesses(p))
  const totalDeals  = allBiz.length
  const clienteAtivo = allBiz.filter(b => b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)').length
  const perdidos    = allBiz.filter(b => b.stageName.toLowerCase().includes('perdido') || b.stageName.toLowerCase().includes('desqualificado')).length
  const taxaConv    = totalDeals > 0 ? Math.round((clienteAtivo / totalDeals) * 100) : 0

  if (isLoading) return (
    <>
      <Header />
      <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14 }}>Carregando dados do DataCrazy…</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  )

  if (error) return (
    <>
      <Header />
      <div className="page-wrap" style={{ textAlign: 'center', padding: 64, color: 'var(--red)' }}>
        <div style={{ marginBottom: 12 }}>Erro: {error}</div>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Tentar novamente
        </button>
      </div>
    </>
  )

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Relatório de Pipeline</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filtro de mês */}
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Todos os meses</option>
              {availableMonths.map(m => {
                const [y, mo] = m.split('-').map(Number)
                return <option key={m} value={m}>{MONTHS[mo - 1]} {y}</option>
              })}
            </select>
            {/* Filtro de pipeline */}
            <select value={selectedPipeline} onChange={e => setSelectedPipeline(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Todos os closers</option>
              {data?.pipelines.map(p => <option key={p.pipeline} value={p.pipeline}>{p.pipeline} — {p.closer}</option>)}
            </select>
            <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>

        {/* ── KPIs Globais ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total de Negócios', value: totalDeals,   color: 'var(--text)' },
            { label: 'Cliente Ativo',     value: clienteAtivo, color: 'var(--green)' },
            { label: 'Taxa de Conversão', value: `${taxaConv}%`, color: taxaConv >= 30 ? 'var(--green)' : taxaConv >= 15 ? 'var(--orange)' : 'var(--red)' },
            { label: 'Perdidos/Desqualif',value: perdidos,     color: 'var(--red)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
          {/* KPI por pipeline */}
          {pipelines.map((p, i) => {
            const biz = filteredBusinesses(p)
            const ativo = biz.filter(b => b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)').length
            return (
              <div key={p.pipeline} style={{ background: 'var(--bg-card)', border: `1px solid ${PIPELINE_COLORS[i]}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: PIPELINE_COLORS[i] }}>{biz.length}</div>
                <div style={{ fontSize: 12, color: PIPELINE_COLORS[i], fontWeight: 600, marginTop: 2 }}>{p.pipeline}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{ativo} ativos · {p.closer.split(' ')[0]}</div>
              </div>
            )
          })}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' }}>
          {([['funil','Funil'], ['negocios','Negócios'], ['desempenho','Desempenho']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: activeTab === k ? 'var(--action)' : 'transparent',
              color: activeTab === k ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13,
            }}>{l}</button>
          ))}
        </div>

        {/* ── ABA: FUNIL ────────────────────────────────────────────────────── */}
        {activeTab === 'funil' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {pipelines.map((p, pi) => {
              const biz = filteredBusinesses(p)
              const maxCount = Math.max(...p.stages.map(s => s.count), 1)
              return (
                <div key={p.pipeline} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: PIPELINE_COLORS[pi] }} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{p.pipeline} — {p.closer}</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{biz.length} negócios</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.stages.filter(s => {
                      // Conta deals filtrados por mês neste stage
                      const cnt = biz.filter(b => b.stageId === s.id).length
                      return cnt > 0 || selectedMonth === 'all'
                    }).map((s, si) => {
                      const cnt = biz.filter(b => b.stageId === s.id).length
                      const pct = maxCount > 0 ? (cnt / maxCount) * 100 : 0
                      const isAtivo = s.name === 'Cliente Ativo' || s.name === 'Cliente Ativo (Campanha)'
                      const isPerdido = s.name.toLowerCase().includes('perdido') || s.name.toLowerCase().includes('desqualificado')
                      const barColor = isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : STAGE_COLORS[si % STAGE_COLORS.length]
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 160, fontSize: 12, color: 'var(--text2)', textAlign: 'right', flexShrink: 0, fontWeight: isAtivo ? 700 : 400, color: isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : 'var(--text2)' }}>
                            {s.name}
                          </div>
                          <div style={{ flex: 1, height: 28, background: 'var(--bg-card2)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(pct, cnt > 0 ? 2 : 0)}%`, background: barColor, borderRadius: 6, transition: 'width .4s', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                              {cnt > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{cnt}</span>}
                            </div>
                          </div>
                          <div style={{ width: 32, fontSize: 13, fontWeight: 700, color: barColor, textAlign: 'right' }}>{cnt}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Donut por pipeline */}
            {pipelines.length > 1 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Distribuição por Pipeline</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
                  <DonutChart size={160} thickness={28} data={pipelines.map((p, i) => ({
                    label: p.pipeline, value: filteredBusinesses(p).length, color: PIPELINE_COLORS[i],
                  }))} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pipelines.map((p, i) => (
                      <div key={p.pipeline} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: PIPELINE_COLORS[i], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.pipeline}</span>
                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{p.closer} — {filteredBusinesses(p).length} negócios</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA: NEGÓCIOS ─────────────────────────────────────────────────── */}
        {activeTab === 'negocios' && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Pipeline', 'Lead', 'E-mail', 'Etapa', 'Entrada', 'Últ. Atualização'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--border)', background: 'var(--bg-card2)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pipelines.flatMap((p, pi) =>
                    filteredBusinesses(p)
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((b, i) => {
                        const isAtivo = b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)'
                        const isPerdido = b.stageName.toLowerCase().includes('perdido') || b.stageName.toLowerCase().includes('desqualificado')
                        const stageColor = isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : 'var(--text2)'
                        return (
                          <tr key={b.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)' }}>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: PIPELINE_COLORS[pi], background: `color-mix(in srgb, ${PIPELINE_COLORS[pi]} 12%, var(--bg-card2))`, borderRadius: 6, padding: '2px 8px' }}>{p.pipeline}</span>
                            </td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.leadName || '—'}</td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.leadEmail || '—'}</td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: stageColor, background: `color-mix(in srgb, ${stageColor === 'var(--text2)' ? '#64748b' : stageColor} 12%, var(--bg-card2))`, borderRadius: 20, padding: '2px 9px' }}>{b.stageName}</span>
                            </td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                              {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                            </td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                              {new Date(b.updatedAt).toLocaleDateString('pt-BR')}
                            </td>
                          </tr>
                        )
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA: DESEMPENHO ───────────────────────────────────────────────── */}
        {activeTab === 'desempenho' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Conversão por pipeline */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Taxa de Conversão por Closer</div>
              <BarChartH data={pipelines.map((p, i) => {
                const biz = filteredBusinesses(p)
                const ativo = biz.filter(b => b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)').length
                const taxa = biz.length > 0 ? Math.round((ativo / biz.length) * 100) : 0
                return { label: `${p.pipeline} (${p.closer.split(' ')[0]})`, value: taxa }
              })} valueKey="value" labelKey="label" />
            </div>

            {/* Estágios mais comuns */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Distribuição por Etapa (combinado)</div>
              {(() => {
                const stageMap = new Map<string, number>()
                pipelines.forEach(p => filteredBusinesses(p).forEach(b => {
                  stageMap.set(b.stageName, (stageMap.get(b.stageName) ?? 0) + 1)
                }))
                const sorted = [...stageMap.entries()].sort((a, b) => b[1] - a[1])
                const max = sorted[0]?.[1] ?? 1
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sorted.map(([name, count], i) => {
                      const isAtivo = name === 'Cliente Ativo' || name === 'Cliente Ativo (Campanha)'
                      const isPerdido = name.toLowerCase().includes('perdido') || name.toLowerCase().includes('desqualificado')
                      const color = isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : STAGE_COLORS[i % STAGE_COLORS.length]
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 150, fontSize: 12, color: 'var(--text2)', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                          <div style={{ flex: 1, height: 24, background: 'var(--bg-card2)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: color, borderRadius: 6 }} />
                          </div>
                          <div style={{ width: 28, fontSize: 13, fontWeight: 700, color, textAlign: 'right' }}>{count}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Evolução mensal */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Negócios Criados por Mês</div>
              {(() => {
                const monthMap = new Map<string, number>()
                pipelines.forEach(p => p.businesses.forEach(b => {
                  const m = b.createdAt?.slice(0, 7) ?? ''
                  if (m) monthMap.set(m, (monthMap.get(m) ?? 0) + 1)
                }))
                const sorted = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
                const max = Math.max(...sorted.map(s => s[1]), 1)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sorted.map(([month, count]) => {
                      const [y, mo] = month.split('-').map(Number)
                      return (
                        <div key={month} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 110, fontSize: 12, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 }}>{MONTHS[mo - 1]} {y}</div>
                          <div style={{ flex: 1, height: 24, background: 'var(--bg-card2)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: 'var(--action)', borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                              {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{count}</span>}
                            </div>
                          </div>
                          <div style={{ width: 28, fontSize: 13, fontWeight: 700, color: 'var(--action)', textAlign: 'right' }}>{count}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

      </div>
    </>
  )
}
