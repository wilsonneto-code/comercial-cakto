import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import { BarChartH } from '@/components/ui/charts/BarChartH'
import { supabase } from '@/lib/supabase/client'
import { Loader2, RefreshCw } from 'lucide-react'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const PIPELINE_COLORS  = ['#2563eb', '#7c3aed', '#059669']
const SDR_COLORS       = ['#0891b2', '#d97706', '#be185d']
const STAGE_COLORS = [
  '#2563eb','#7c3aed','#059669','#d97706','#dc2626',
  '#0891b2','#65a30d','#9333ea','#ea580c','#0284c7',
]

type Stage    = { id: string; name: string; index: number; count: number }
type Activity = { id: string; title: string; type: string; createdAt: string; stageId: string | null; stageName: string }
type Business = {
  id: string; leadId: string; leadName: string; leadEmail: string
  stageId: string; stageName: string; createdAt: string; updatedAt: string
  lastMovedAt: string; total: number; activities?: Activity[]
}
type Pipeline   = { pipeline: string; closer: string; type: string; pipelineId: string; stages: Stage[]; businesses: Business[] }
type ReportData = { pipelines: Pipeline[]; fetchedAt: string }

export default function RelatorioDataCrazy() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  return <ReportContent />
}

function ReportContent() {
  const [data, setData]           = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState('')
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const [selectedPipeline, setSelectedPipeline] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'funil' | 'sdr' | 'negocios' | 'desempenho'>('funil')

  async function load() {
    setIsLoading(true); setError('')
    const { data: res, error: err } = await supabase.functions.invoke('datacrazy-report')
    if (err || res?.error) { setError(err?.message ?? res?.error ?? 'Erro ao carregar'); setIsLoading(false); return }
    setData(res as ReportData)
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  // Meses disponíveis baseados em lastMovedAt
  const availableMonths = data ? [...new Set(
    data.pipelines.flatMap(p => p.businesses.map(b => (b.lastMovedAt ?? b.createdAt)?.slice(0, 7) ?? ''))
  )].filter(Boolean).sort((a, b) => b.localeCompare(a)) : []

  // Negócios filtrados por mês (lastMovedAt) — usado na tabela e KPIs
  function filteredBusinesses(p: Pipeline) {
    if (selectedMonth === 'all') return p.businesses
    return p.businesses.filter(b => (b.lastMovedAt ?? b.createdAt ?? '').startsWith(selectedMonth))
  }

  // Para o FUNIL: conta movimentos por etapa no mês selecionado
  // Cada negócio que foi movido para uma etapa naquele mês conta como 1 movimento naquela etapa
  // SDR permite repetição do mesmo lead em etapas diferentes (lastMovedAt por negócio)
  function stageMovements(p: Pipeline, stageId: string): number {
    if (selectedMonth === 'all') {
      return p.businesses.filter(b => b.stageId === stageId).length
    }
    return p.businesses.filter(b =>
      b.stageId === stageId &&
      (b.lastMovedAt ?? b.createdAt ?? '').startsWith(selectedMonth)
    ).length
  }

  const allPipelines    = data?.pipelines ?? []
  const closerPipelines = allPipelines.filter(p => p.type === 'closer').filter(p =>
    selectedPipeline === 'all' || p.pipeline === selectedPipeline
  )
  const sdrPipelines = allPipelines.filter(p => p.type === 'sdr').filter(p =>
    selectedPipeline === 'all' || p.pipeline === selectedPipeline
  )
  const pipelines = closerPipelines

  // KPIs globais (baseados em todos os negócios sem filtro de mês)
  const allBizTotal  = pipelines.flatMap(p => p.businesses)
  const allBizFiltered = pipelines.flatMap(p => filteredBusinesses(p))
  const totalDeals   = allBizTotal.length
  const clienteAtivo = allBizTotal.filter(b => b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)').length
  const perdidos     = allBizTotal.filter(b => b.stageName.toLowerCase().includes('perdido') || b.stageName.toLowerCase().includes('desqualificado')).length
  const taxaConv     = totalDeals > 0 ? Math.round((clienteAtivo / totalDeals) * 100) : 0

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
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 2 }}>Relatório de Pipeline</h1>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {selectedMonth === 'all' ? 'Todos os movimentos' : `Movimentos em ${MONTHS[Number(selectedMonth.split('-')[1]) - 1]} ${selectedMonth.split('-')[0]}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Todos os meses</option>
              {availableMonths.map(m => {
                const [y, mo] = m.split('-').map(Number)
                return <option key={m} value={m}>{MONTHS[mo - 1]} {y}</option>
              })}
            </select>
            <select value={selectedPipeline} onChange={e => setSelectedPipeline(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Todos</option>
              <optgroup label="Closers">
                {data?.pipelines.filter(p => p.type === 'closer').map(p => <option key={p.pipeline} value={p.pipeline}>{p.pipeline} — {p.closer}</option>)}
              </optgroup>
              <optgroup label="SDR">
                {data?.pipelines.filter(p => p.type === 'sdr').map(p => <option key={p.pipeline} value={p.pipeline}>{p.pipeline}</option>)}
              </optgroup>
            </select>
            <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>

        {/* ── KPIs Globais ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total de Negócios', value: totalDeals,    color: 'var(--text)' },
            { label: 'Cliente Ativo',     value: clienteAtivo,  color: 'var(--green)' },
            { label: 'Taxa de Conversão', value: `${taxaConv}%`, color: taxaConv >= 30 ? 'var(--green)' : taxaConv >= 15 ? 'var(--orange)' : 'var(--red)' },
            { label: 'Perdidos/Desqualif',value: perdidos,      color: 'var(--red)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
          {pipelines.map((p, i) => {
            const ativo = p.businesses.filter(b => b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)').length
            const movMes = selectedMonth !== 'all' ? filteredBusinesses(p).length : null
            return (
              <div key={p.pipeline} style={{ background: 'var(--bg-card)', border: `1px solid ${PIPELINE_COLORS[i]}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: PIPELINE_COLORS[i] }}>{p.businesses.length}</div>
                <div style={{ fontSize: 12, color: PIPELINE_COLORS[i], fontWeight: 600, marginTop: 2 }}>{p.pipeline}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {ativo} ativos · {p.closer.split(' ')[0]}
                  {movMes !== null && <> · <span style={{ color: PIPELINE_COLORS[i] }}>{movMes} no mês</span></>}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' }}>
          {([['funil','Funil Closers'], ['sdr','Funil SDR'], ['negocios','Negócios'], ['desempenho','Desempenho']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: activeTab === k ? 'var(--action)' : 'transparent',
              color: activeTab === k ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13,
            }}>{l}</button>
          ))}
        </div>

        {/* ── ABA: FUNIL CLOSERS ────────────────────────────────────────────── */}
        {activeTab === 'funil' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {pipelines.map((p, pi) => {
              const stagesWithCount = p.stages.map(s => ({
                ...s,
                movements: stageMovements(p, s.id),
              }))
              const maxCount = Math.max(...stagesWithCount.map(s => s.movements), 1)
              const totalMovements = stagesWithCount.reduce((acc, s) => acc + s.movements, 0)

              return (
                <div key={p.pipeline} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: PIPELINE_COLORS[pi] }} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{p.pipeline} — {p.closer}</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {totalMovements} {selectedMonth !== 'all' ? 'movimentos no mês' : 'negócios no total'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stagesWithCount.filter(s => s.movements > 0 || selectedMonth === 'all').map((s, si) => {
                      const pct = maxCount > 0 ? (s.movements / maxCount) * 100 : 0
                      const isAtivo   = s.name === 'Cliente Ativo' || s.name === 'Cliente Ativo (Campanha)'
                      const isPerdido = s.name.toLowerCase().includes('perdido') || s.name.toLowerCase().includes('desqualificado')
                      const barColor  = isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : STAGE_COLORS[si % STAGE_COLORS.length]
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 160, fontSize: 12, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontWeight: isAtivo ? 700 : 400, color: isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : 'var(--text2)' }}>
                            {s.name}
                          </div>
                          <div style={{ flex: 1, height: 28, background: 'var(--bg-card2)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(pct, s.movements > 0 ? 2 : 0)}%`, background: barColor, borderRadius: 6, transition: 'width .4s', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                              {s.movements > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{s.movements}</span>}
                            </div>
                          </div>
                          <div style={{ width: 32, fontSize: 13, fontWeight: 700, color: barColor, textAlign: 'right' }}>{s.movements}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {pipelines.length > 1 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Distribuição por Pipeline</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
                  <DonutChart size={160} thickness={28} data={pipelines.map((p, i) => ({
                    label: p.pipeline,
                    value: selectedMonth !== 'all' ? filteredBusinesses(p).length : p.businesses.length,
                    color: PIPELINE_COLORS[i],
                  }))} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pipelines.map((p, i) => (
                      <div key={p.pipeline} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: PIPELINE_COLORS[i], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.pipeline}</span>
                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                          {p.closer} — {selectedMonth !== 'all' ? filteredBusinesses(p).length : p.businesses.length} negócios
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA: SDR ──────────────────────────────────────────────────────── */}
        {activeTab === 'sdr' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
              {sdrPipelines.map((p, i) => {
                const biz = filteredBusinesses(p)
                const qualificados = biz.filter(b => b.stageName === 'Lead Qualificado' || b.stageName === 'Call Agendada').length
                const perdidos = biz.filter(b => b.stageName.toLowerCase().includes('perdido') || b.stageName.toLowerCase().includes('desqualificado')).length
                const taxa = biz.length > 0 ? Math.round((qualificados / biz.length) * 100) : 0
                return (
                  <div key={p.pipeline} style={{ background: 'var(--bg-card)', border: `1px solid ${SDR_COLORS[i]}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: SDR_COLORS[i] }}>
                      {selectedMonth !== 'all' ? biz.length : p.businesses.length}
                    </div>
                    <div style={{ fontSize: 12, color: SDR_COLORS[i], fontWeight: 600, marginTop: 2 }}>{p.pipeline}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{qualificados} qualif. · {taxa}% taxa · {perdidos} perdidos</div>
                  </div>
                )
              })}
            </div>

            {sdrPipelines.map((p, pi) => {
              const stagesWithCount = p.stages.map(s => ({
                ...s,
                movements: stageMovements(p, s.id),
              }))
              const maxCount = Math.max(...stagesWithCount.map(s => s.movements), 1)
              const totalMovements = stagesWithCount.reduce((acc, s) => acc + s.movements, 0)

              return (
                <div key={p.pipeline} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: SDR_COLORS[pi] }} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{p.pipeline}</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {totalMovements} {selectedMonth !== 'all' ? 'movimentos no mês' : 'leads no total'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stagesWithCount.map((s, si) => {
                      if (s.movements === 0 && selectedMonth !== 'all') return null
                      const pct = maxCount > 0 ? (s.movements / maxCount) * 100 : 0
                      const isQual    = s.name === 'Lead Qualificado' || s.name === 'Call Agendada'
                      const isPerdido = s.name.toLowerCase().includes('perdido') || s.name.toLowerCase().includes('desqualificado')
                      const barColor  = isQual ? 'var(--green)' : isPerdido ? 'var(--red)' : SDR_COLORS[pi % SDR_COLORS.length]
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 180, fontSize: 12, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            color: isQual ? 'var(--green)' : isPerdido ? 'var(--red)' : 'var(--text2)', fontWeight: isQual ? 700 : 400 }}>
                            {s.name}
                          </div>
                          <div style={{ flex: 1, height: 28, background: 'var(--bg-card2)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(pct, s.movements > 0 ? 2 : 0)}%`, background: barColor, borderRadius: 6, transition: 'width .4s', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                              {s.movements > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{s.movements}</span>}
                            </div>
                          </div>
                          <div style={{ width: 32, fontSize: 13, fontWeight: 700, color: barColor, textAlign: 'right' }}>{s.movements}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {sdrPipelines.length > 1 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Distribuição entre Campanhas</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
                  <DonutChart size={160} thickness={28} data={sdrPipelines.map((p, i) => ({
                    label: p.pipeline,
                    value: selectedMonth !== 'all' ? filteredBusinesses(p).length : p.businesses.length,
                    color: SDR_COLORS[i],
                  }))} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sdrPipelines.map((p, i) => (
                      <div key={p.pipeline} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: SDR_COLORS[i], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.pipeline}</span>
                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                          {selectedMonth !== 'all' ? filteredBusinesses(p).length : p.businesses.length} leads
                        </span>
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
                    {['Pipeline', 'Lead', 'E-mail', 'Etapa', 'Movido em', 'Criado em'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--border)', background: 'var(--bg-card2)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...pipelines, ...sdrPipelines].flatMap((p, pi) =>
                    filteredBusinesses(p)
                      .sort((a, b) => new Date(b.lastMovedAt ?? b.createdAt).getTime() - new Date(a.lastMovedAt ?? a.createdAt).getTime())
                      .map((b, i) => {
                        const isAtivo   = b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)'
                        const isPerdido = b.stageName.toLowerCase().includes('perdido') || b.stageName.toLowerCase().includes('desqualificado')
                        const isSdr     = p.type === 'sdr'
                        const pColor    = isSdr ? SDR_COLORS[pi % 3] : PIPELINE_COLORS[pi % 3]
                        const stageColor = isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : 'var(--text2)'
                        return (
                          <tr key={b.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)' }}>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: pColor, background: `color-mix(in srgb, ${pColor} 12%, var(--bg-card2))`, borderRadius: 6, padding: '2px 8px' }}>{p.pipeline}{isSdr ? ' (SDR)' : ''}</span>
                            </td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.leadName || '—'}</td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.leadEmail || '—'}</td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: stageColor, background: `color-mix(in srgb, ${stageColor === 'var(--text2)' ? '#64748b' : stageColor} 12%, var(--bg-card2))`, borderRadius: 20, padding: '2px 9px' }}>{b.stageName}</span>
                            </td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                              {new Date(b.lastMovedAt ?? b.updatedAt).toLocaleDateString('pt-BR')}
                            </td>
                            <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                              {new Date(b.createdAt).toLocaleDateString('pt-BR')}
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
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Taxa de Conversão por Closer</div>
              <BarChartH data={pipelines.map((p, i) => {
                const biz   = p.businesses
                const ativo = biz.filter(b => b.stageName === 'Cliente Ativo' || b.stageName === 'Cliente Ativo (Campanha)').length
                const taxa  = biz.length > 0 ? Math.round((ativo / biz.length) * 100) : 0
                return { label: `${p.pipeline} (${p.closer.split(' ')[0]})`, value: taxa }
              })} valueKey="value" labelKey="label" />
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Distribuição por Etapa (combinado)</div>
              {(() => {
                const stageMap = new Map<string, number>()
                pipelines.forEach(p => p.businesses.forEach(b => {
                  stageMap.set(b.stageName, (stageMap.get(b.stageName) ?? 0) + 1)
                }))
                const sorted = [...stageMap.entries()].sort((a, b) => b[1] - a[1])
                const max = sorted[0]?.[1] ?? 1
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sorted.map(([name, count], i) => {
                      const isAtivo   = name === 'Cliente Ativo' || name === 'Cliente Ativo (Campanha)'
                      const isPerdido = name.toLowerCase().includes('perdido') || name.toLowerCase().includes('desqualificado')
                      const color     = isAtivo ? 'var(--green)' : isPerdido ? 'var(--red)' : STAGE_COLORS[i % STAGE_COLORS.length]
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

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Movimentações por Mês</div>
              {(() => {
                const monthMap = new Map<string, number>()
                pipelines.forEach(p => p.businesses.forEach(b => {
                  const m = (b.lastMovedAt ?? b.createdAt)?.slice(0, 7) ?? ''
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
