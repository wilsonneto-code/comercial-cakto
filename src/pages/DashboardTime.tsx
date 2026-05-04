import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Pencil, Check, X, TrendingUp, Users, Target, Zap, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { KpiCard } from '@/components/ui/KpiCard'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { LineAreaChart } from '@/components/ui/charts/LineAreaChart'
import { BarChartV } from '@/components/ui/charts/BarChartV'
import {
  getTPVDoTime, getMetaTime, setMetaTime,
  getEvolucaoDiaria, calcularProjecao, getTPVPorMembro,
  TIMES_UUID,
} from '../services/dashboardTimeService'
import {
  getTPVCanal, getTPVDiarioTime,
} from '../services/metabaseService'
import {
  getClientesAtivos, sincronizarClientesDoTime,
  removerCliente, editarCliente,
  type ClienteAtivo,
} from '../services/tpvClientesService'

const TIMES = ['01', '02', '03']
const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

type MembroTPV = {
  id: string; name: string; email: string | null; role: string;
  tpv_closer: number; tpv_sdr: number; tpv_total: number
}
type Canal = { inbound: number; outbound: number; indicacao: number; total: number }

export default function DashboardTime() {
  const { timeId } = useParams<{ timeId: string }>()
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null

  const timeNum = timeId ?? '01'
  return <DashboardTimeContent timeNum={timeNum} userRole={user.role} />
}

// ─────────────────────────────────────────────────────────────────────────────

function DashboardTimeContent({ timeNum, userRole }: { timeNum: string; userRole: string }) {
  const navigate = useNavigate()
  const canEditMeta = userRole === 'Admin' || userRole === 'Head Comercial'

  const [isLoading, setIsLoading]         = useState(true)
  const [tpvTotal, setTpvTotal]           = useState(0)
  const [meta, setMeta]                   = useState(1_000_000)
  const [evolucao, setEvolucao]           = useState<{ dia: string; label: string; tpv: number; acumulado: number }[]>([])
  const [membros, setMembros]             = useState<MembroTPV[]>([])
  const [editingMeta, setEditingMeta]     = useState(false)
  const [metaDraft, setMetaDraft]         = useState('')
  const [savingMeta, setSavingMeta]       = useState(false)

  // Clientes ativos
  const [clientes, setClientes]           = useState<ClienteAtivo[]>([])
  const [canal, setCanal]                 = useState<Canal>({ inbound: 0, outbound: 0, indicacao: 0, total: 0 })
  const [tpvHoje, setTpvHoje]             = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const [modalEditar, setModalEditar]     = useState<ClienteAtivo | null>(null)
  const [modalRemover, setModalRemover]   = useState<ClienteAtivo | null>(null)
  const [observacao, setObservacao]       = useState('')

  const teamName  = `Time ${timeNum}`
  const teamUuid  = TIMES_UUID[timeNum] ?? ''
  const loadedRef = useRef(false)

  // ── Load principal ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadedRef.current = false
    setIsLoading(true)
    setTpvTotal(0); setEvolucao([]); setMembros([])
    setClientes([]); setCanal({ inbound: 0, outbound: 0, indicacao: 0, total: 0 }); setTpvHoje(0)

    const dataInicio = '2026-04-01'
    const dataFim    = new Date().toISOString().split('T')[0]

    async function load() {
      if (loadedRef.current) return
      loadedRef.current = true
      const [{ tpvTotal: tv }, metaVal, ev, membrosTPV, clientesData, canalData] = await Promise.all([
        getTPVDoTime(timeNum),
        getMetaTime(timeNum),
        getEvolucaoDiaria(timeNum),
        getTPVPorMembro(timeNum),
        getClientesAtivos(timeNum),
        getTPVCanal(teamUuid, dataInicio, dataFim),
      ])
      setTpvTotal(tv)
      setMeta(metaVal)
      setEvolucao(ev)
      setMembros(membrosTPV)
      setClientes(clientesData)
      setCanal(canalData)
      setIsLoading(false)

      // TPV hoje em background (1 call por cliente ativo)
      if (clientesData.length > 0) {
        const emails = clientesData.map(c => c.cliente_email)
        getTPVDiarioTime(emails).then(setTpvHoje)
      }
    }
    load()
  }, [timeNum, teamUuid])

  // ── Sincronizar clientes ────────────────────────────────────────────────────
  async function sincronizar() {
    setSincronizando(true)
    await sincronizarClientesDoTime(timeNum)
    const dados = await getClientesAtivos(timeNum)
    setClientes(dados)
    setSincronizando(false)
  }

  // ── Salvar edição ───────────────────────────────────────────────────────────
  async function salvarEdicao() {
    if (!modalEditar) return
    await editarCliente(modalEditar.ativacao_id, observacao)
    setClientes(prev => prev.map(c =>
      c.ativacao_id === modalEditar.ativacao_id ? { ...c, observacao } : c
    ))
    setModalEditar(null)
  }

  // ── Confirmar remoção ───────────────────────────────────────────────────────
  async function confirmarRemocao() {
    if (!modalRemover) return
    await removerCliente(modalRemover.ativacao_id)
    setClientes(prev => prev.filter(c => c.ativacao_id !== modalRemover.ativacao_id))
    setModalRemover(null)
  }

  const pct           = meta > 0 ? Math.min(100, Math.round((tpvTotal / meta) * 100)) : 0
  const projecao      = calcularProjecao(evolucao)
  const progressColor = pct >= 100 ? '#22C55E' : pct >= 70 ? '#F59E0B' : 'var(--action)'

  const barData = useMemo(() =>
    evolucao.slice(-14).map(e => ({ label: e.label, value: e.tpv })), [evolucao])

  const clientesOrdenados = useMemo(() =>
    [...clientes].sort((a, b) => b.tpv_atual - a.tpv_atual), [clientes])

  async function saveMeta() {
    const val = Number(metaDraft.replace(/\D/g, ''))
    if (!val || val <= 0) return
    setSavingMeta(true)
    await setMetaTime(timeNum, val)
    setMeta(val)
    setSavingMeta(false)
    setEditingMeta(false)
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando Dashboard {teamName}…</span>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Cabeçalho + abas ───────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={() => navigate('/dashboards')}>Voltar</Button>
          <h1 style={{ fontSize: 22, fontWeight: 800, flex: 1 }}>Dashboard — {teamName}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {TIMES.map(t => (
              <button key={t} onClick={() => navigate(`/dashboard/time/${t}`)} style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: 'none',
                cursor: 'pointer', transition: 'all .15s',
                background: t === timeNum ? 'var(--action)' : 'var(--bg-card2)',
                color: t === timeNum ? '#fff' : 'var(--text2)',
              }}>Time {t}</button>
            ))}
          </div>
        </div>

        {/* ── Cards de canal ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <div style={{ background: 'color-mix(in srgb, #3B82F6 12%, var(--bg-card))', border: '1px solid rgba(59,130,246,.3)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#60A5FA', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>TPV Hoje</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>{BRL(tpvHoje)}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>clientes ativos</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Inbound</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{BRL(canal.inbound)}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Outbound</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{BRL(canal.outbound)}</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Indicação</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{BRL(canal.indicacao)}</div>
          </div>
          <div style={{ background: 'color-mix(in srgb, var(--green) 10%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total Canal</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)', marginTop: 6 }}>{BRL(canal.total)}</div>
          </div>
        </div>

        {/* ── KPIs ───────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="TPV Acumulado"   value={BRL(tpvTotal)}  icon={TrendingUp} color="var(--green)"  />
          <KpiCard label="Meta do Período" value={BRL(meta)}      icon={Target}     color="var(--action)" />
          <KpiCard label="% da Meta"       value={`${pct}%`}      icon={Zap}        color={progressColor} />
          <KpiCard label="Membros no Time" value={membros.length} icon={Users}      color="var(--purple)" />
        </div>

        {/* ── Barra de progresso ─────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Progresso da Meta</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 20, color: progressColor }}>{pct}%</span>
              {canEditMeta && !editingMeta && (
                <button onClick={() => { setMetaDraft(String(meta)); setEditingMeta(true) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4,
                }}><Pencil size={14} /></button>
              )}
            </div>
          </div>
          <div style={{ height: 14, background: 'var(--bg-card2)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: progressColor, borderRadius: 99, transition: 'width .5s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{BRL(tpvTotal)}</span>
            <span>Meta: {BRL(meta)}</span>
          </div>
          {editingMeta && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <input value={metaDraft} onChange={e => setMetaDraft(e.target.value)} placeholder="Ex: 1500000"
                style={{ flex: 1, background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text)', padding: '8px 12px', fontSize: 14 }} />
              <button onClick={saveMeta} disabled={savingMeta} style={{
                background: 'var(--green)', border: 'none', borderRadius: 8, padding: '8px 14px',
                color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}><Check size={14} /> Salvar</button>
              <button onClick={() => setEditingMeta(false)} style={{
                background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 14px', color: 'var(--text2)', cursor: 'pointer',
              }}><X size={14} /></button>
            </div>
          )}
        </div>

        {/* ── Projeção ───────────────────────────────────────────────── */}
        {projecao > 0 && (
          <div style={{
            background: projecao >= meta ? 'color-mix(in srgb, #22C55E 10%, var(--bg-card))' : 'color-mix(in srgb, var(--red) 10%, var(--bg-card))',
            border: `1px solid ${projecao >= meta ? '#22C55E' : 'var(--red)'}`,
            borderRadius: 12, padding: '14px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <TrendingUp size={16} color={projecao >= meta ? '#22C55E' : 'var(--red)'} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              No ritmo atual, o time vai atingir{' '}
              <strong style={{ color: projecao >= meta ? '#22C55E' : 'var(--red)' }}>{BRL(projecao)}</strong>
              {' '}no fim do mês — meta: {BRL(meta)}
            </span>
          </div>
        )}

        {/* ── Membros + Gráfico de linha ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Membros do Time</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {membros.length === 0 && <div style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhum membro cadastrado.</div>}
              {membros.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={m.name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{m.role}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: m.tpv_total > 0 ? 'var(--green)' : 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {BRL(m.tpv_total)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Evolução do TPV (Acumulado)</div>
            {evolucao.length > 0
              ? <LineAreaChart data={evolucao} height={200} color="var(--green)" valueKey="acumulado" labelKey="label" />
              : <div style={{ color: 'var(--text2)', fontSize: 13, paddingTop: 60, textAlign: 'center' }}>Sem dados no período.</div>
            }
          </div>
        </div>

        {/* ── Gráfico de barras ──────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>TPV por Dia (últimos 14 dias)</div>
          {barData.length > 0
            ? <BarChartV data={barData} height={200} color1="var(--action)" color2="var(--purple)" />
            : <div style={{ color: 'var(--text2)', fontSize: 13, paddingTop: 60, textAlign: 'center' }}>Sem dados no período.</div>
          }
        </div>

        {/* ── Contribuição Individual ────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Contribuição Individual</div>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>Membro</th><th>Cargo</th><th>TPV como Closer</th><th>TPV como SDR</th><th>Total</th></tr>
              </thead>
              <tbody>
                {membros.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sem membros.</td></tr>
                )}
                {[...membros].sort((a, b) => b.tpv_total - a.tpv_total).map((m, i) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 800, color: i < 3 ? (['var(--gold)', '#C0C0C0', '#CD7F32'][i]) : 'var(--text2)' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={m.name} size={28} />
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 13 }}>{m.role}</td>
                    <td style={{ fontWeight: 600, color: m.tpv_closer > 0 ? 'var(--green)' : 'var(--text2)' }}>{BRL(m.tpv_closer)}</td>
                    <td style={{ fontWeight: 600, color: m.tpv_sdr    > 0 ? 'var(--cyan)'  : 'var(--text2)' }}>{BRL(m.tpv_sdr)}</td>
                    <td style={{ fontWeight: 800, color: m.tpv_total  > 0 ? 'var(--text)'  : 'var(--text2)' }}>{BRL(m.tpv_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Painel de Clientes Ativos ───────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Clientes Ativos (30 dias) — {clientes.length}</div>
            <button onClick={sincronizar} disabled={sincronizando} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              cursor: sincronizando ? 'default' : 'pointer', color: 'var(--action)', fontSize: 13, fontWeight: 600,
            }}>
              <RefreshCw size={14} style={{ animation: sincronizando ? 'spin 1s linear infinite' : 'none' }} />
              {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          </div>
          {clientes.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              Nenhum cliente ativo. Clique em "Sincronizar" para carregar os dados.
            </div>
          ) : (
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr><th>Cliente</th><th>Canal</th><th>Ativação</th><th>Dias restantes</th><th>TPV</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {clientesOrdenados.map(c => {
                    const diasRestantes = Math.max(0, Math.ceil(
                      (new Date(c.data_fim).getTime() - Date.now()) / 86_400_000
                    ))
                    const pctDias = Math.round((diasRestantes / 30) * 100)
                    return (
                      <tr key={c.id}>
                        <td style={{ fontSize: 13 }}>
                          <div>{c.cliente_email}</div>
                          {c.observacao && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.observacao}</div>}
                        </td>
                        <td>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
                            background: 'color-mix(in srgb, var(--action) 15%, transparent)', color: 'var(--action)', fontWeight: 600 }}>
                            {c.canal ?? '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.data_ativacao}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 64, height: 6, background: 'var(--bg-card2)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pctDias}%`, background: diasRestantes > 10 ? 'var(--green)' : 'var(--red)', borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{diasRestantes}d</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, color: c.tpv_atual > 0 ? 'var(--green)' : 'var(--text2)' }}>{BRL(c.tpv_atual)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setModalEditar(c); setObservacao(c.observacao ?? '') }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14 }}>✏️</button>
                            <button onClick={() => setModalRemover(c)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14 }}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Ranking de Clientes por TPV ────────────────────────────── */}
        {clientes.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>🏆 Ranking de Clientes por TPV</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {clientesOrdenados.slice(0, 10).map((c, i) => {
                const pctBar = Math.round((c.tpv_atual / (clientesOrdenados[0]?.tpv_atual || 1)) * 100)
                const medalColor = i === 0 ? 'var(--gold)' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text2)'
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, width: 20, color: medalColor }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cliente_email}</div>
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

      {/* ── Modal Editar ─────────────────────────────────────────────── */}
      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title="Editar Cliente">
        {modalEditar && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{modalEditar.cliente_email}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>TPV: {BRL(modalEditar.tpv_atual)}</div>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Observação..." rows={3}
              style={{ width: '100%', background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', padding: '8px 12px', fontSize: 13, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={salvarEdicao} style={{ flex: 1 }}>Salvar</Button>
              <Button variant="secondary" onClick={() => setModalEditar(null)} style={{ flex: 1 }}>Cancelar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Remover ────────────────────────────────────────────── */}
      <Modal open={!!modalRemover} onClose={() => setModalRemover(null)} title="Remover cliente?">
        {modalRemover && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              <strong>{modalRemover.cliente_email}</strong> será removido do dashboard. O histórico será mantido.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="danger" onClick={confirmarRemocao} style={{ flex: 1 }}>Remover</Button>
              <Button variant="secondary" onClick={() => setModalRemover(null)} style={{ flex: 1 }}>Cancelar</Button>
            </div>
          </div>
        )}
      </Modal>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
