import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Loader2, TrendingUp, Users, DollarSign, Award } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { KpiCard } from '@/components/ui/KpiCard'
import { getClientesLifetime, type ClienteAtivo } from '../services/tpvClientesService'

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const TIMES = ['', '01', '02', '03'] // '' = todos

export default function DashboardLifetime() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  return <DashboardLifetimeContent />
}

function DashboardLifetimeContent() {
  const navigate = useNavigate()
  const [clientes, setClientes]     = useState<ClienteAtivo[]>([])
  const [isLoading, setIsLoading]   = useState(true)
  const [filtroTime, setFiltroTime] = useState('')
  const [filtroCanal, setFiltroCanal] = useState('')

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const data = await getClientesLifetime()
      setClientes(data)
      setIsLoading(false)
    }
    load()
  }, [])

  const canais = useMemo(() => {
    const set = new Set(clientes.map(c => c.canal ?? '').filter(Boolean))
    return Array.from(set).sort()
  }, [clientes])

  const filtrados = useMemo(() => {
    return clientes
      .filter(c => !filtroTime  || c.time_id  === `Time ${filtroTime}`)
      .filter(c => !filtroCanal || c.canal     === filtroCanal)
      .sort((a, b) => b.tpv_atual - a.tpv_atual)
  }, [clientes, filtroTime, filtroCanal])

  const tpvTotal  = filtrados.reduce((acc, c) => acc + c.tpv_atual, 0)
  const tpvMedio  = filtrados.length > 0 ? tpvTotal / filtrados.length : 0
  const topCliente = filtrados[0]

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando Dashboard Lifetime…</span>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Cabeçalho ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={() => navigate('/dashboards')}>Voltar</Button>
          <h1 style={{ fontSize: 22, fontWeight: 800, flex: 1 }}>Dashboard Lifetime</h1>
        </div>

        {/* ── KPIs ────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Clientes Lifetime" value={filtrados.length}       icon={Users}      color="var(--purple)" />
          <KpiCard label="TPV Total"         value={BRL(tpvTotal)}          icon={TrendingUp} color="var(--green)"  />
          <KpiCard label="TPV Médio"         value={BRL(tpvMedio)}          icon={DollarSign} color="var(--action)" />
          <KpiCard label="Top Cliente"       value={BRL(topCliente?.tpv_atual ?? 0)} icon={Award} color="var(--gold)" />
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <select value={filtroTime} onChange={e => setFiltroTime(e.target.value)} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--text)', padding: '8px 12px', fontSize: 13,
          }}>
            <option value="">Todos os times</option>
            {TIMES.filter(Boolean).map(t => (
              <option key={t} value={t}>Time {t}</option>
            ))}
          </select>
          <select value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--text)', padding: '8px 12px', fontSize: 13,
          }}>
            <option value="">Todos os canais</option>
            {canais.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(filtroTime || filtroCanal) && (
            <button onClick={() => { setFiltroTime(''); setFiltroCanal('') }} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text2)', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
            }}>Limpar filtros</button>
          )}
        </div>

        {/* ── Tabela ──────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            Clientes pós 30 dias — {filtrados.length} registros
          </div>
          {filtrados.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              Nenhum cliente encontrado. Os clientes aparecem aqui após os 30 dias de ativação.
            </div>
          ) : (
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th><th>Cliente</th><th>Time</th><th>Canal</th>
                    <th>Ativação</th><th>Fim dos 30d</th><th>Closer</th><th>TPV Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c, i) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 800, color: i < 3 ? (['var(--gold)', '#C0C0C0', '#CD7F32'][i]) : 'var(--text2)', fontSize: 13 }}>{i + 1}</td>
                      <td style={{ fontSize: 13 }}>
                        <div>{c.cliente_email}</div>
                        {c.observacao && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.observacao}</div>}
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
                          background: 'color-mix(in srgb, var(--purple) 15%, transparent)', color: 'var(--purple)', fontWeight: 600 }}>
                          {c.time_id}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
                          background: 'color-mix(in srgb, var(--action) 15%, transparent)', color: 'var(--action)', fontWeight: 600 }}>
                          {c.canal ?? '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.data_ativacao}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.data_fim}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.closer_email ?? '—'}</td>
                      <td style={{ fontWeight: 700, color: c.tpv_atual > 0 ? 'var(--green)' : 'var(--text2)' }}>{BRL(c.tpv_atual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Ranking geral ────────────────────────────────────────────── */}
        {filtrados.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>🏆 Top 10 — Maior TPV Lifetime</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtrados.slice(0, 10).map((c, i) => {
                const pctBar = Math.round((c.tpv_atual / (filtrados[0]?.tpv_atual || 1)) * 100)
                const medalColor = i === 0 ? 'var(--gold)' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text2)'
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, width: 20, color: medalColor }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cliente_email}</span>
                        <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>{c.time_id}</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-card2)', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pctBar}%`, background: 'var(--green)', borderRadius: 99 }} />
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)', whiteSpace: 'nowrap' }}>{BRL(c.tpv_atual)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
