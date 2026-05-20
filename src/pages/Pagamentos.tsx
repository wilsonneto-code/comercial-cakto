import { useEffect, useState } from 'react'
import { Header } from '../../components/Header'
import { useAuth } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '../../components/ui/Toast'
import { RefreshCw, TrendingUp, DollarSign, Users, Zap } from 'lucide-react'

interface CacheRow {
  id: number
  ativacao_id: string
  cliente_email: string
  closer_email: string | null
  sdr_email: string | null
  time_id: string | null
  data_fechamento: string
  tpv_30_dias: number
  tpv_7_dias: number
  gatilho_roleta: boolean
  bonus_closer: number
  bonus_sdr: number
  ultima_atualizacao: string
}

interface CloserSummary {
  email: string
  name: string
  clientes: number
  tpv_total: number
  bonus_total: number
  gatilhos: number
}

interface SdrSummary {
  email: string
  name: string
  clientes: number
  tpv_total: number
  bonus_total: number
}

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const card = (style?: React.CSSProperties): React.CSSProperties => ({
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '20px 24px', ...style,
})

export default function Pagamentos() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [user, loading, navigate])

  if (loading || !user) return null
  return <PagamentosContent />
}

function PagamentosContent() {
  const { user } = useAuth()
  const toast = useToast()

  const [rows, setRows]           = useState<CacheRow[]>([])
  const [users, setUsers]         = useState<{ id: string; name: string; email: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [tab, setTab]             = useState<'closers' | 'sdrs' | 'detalhes'>('closers')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    const [{ data: cache }, { data: userList }] = await Promise.all([
      supabase.from('tpv_cache').select('*').order('data_fechamento', { ascending: false }),
      supabase.from('users').select('id, name, email').order('name'),
    ])
    setRows((cache || []) as CacheRow[])
    setUsers(userList || [])
    setIsLoading(false)
  }

  async function recalcular() {
    setIsRefreshing(true)
    toast('Recalculando TPV... pode levar alguns segundos.', 'success')
    try {
      await supabase.functions.invoke('calcular-tpv', { body: { limite: 100 } })
      await loadData()
      toast('TPV atualizado!', 'success')
    } catch {
      toast('Erro ao recalcular TPV', 'error')
    }
    setIsRefreshing(false)
  }

  const nameByEmail = (email: string | null) => {
    if (!email) return '—'
    return users.find(u => u.email === email)?.name || email
  }

  // ── Totais gerais ─────────────────────────────────────────────────────────
  const totalTPV30    = rows.reduce((s, r) => s + Number(r.tpv_30_dias), 0)
  const totalBonus    = rows.reduce((s, r) => s + Number(r.bonus_closer) + Number(r.bonus_sdr), 0)
  const totalGatilhos = rows.filter(r => r.gatilho_roleta).length
  const totalClientes = rows.length

  // ── Resumo por closer ─────────────────────────────────────────────────────
  const closerMap = new Map<string, CloserSummary>()
  rows.forEach(r => {
    const email = r.closer_email || 'sem-closer'
    if (!closerMap.has(email)) {
      closerMap.set(email, { email, name: nameByEmail(r.closer_email), clientes: 0, tpv_total: 0, bonus_total: 0, gatilhos: 0 })
    }
    const s = closerMap.get(email)!
    s.clientes++
    s.tpv_total  += Number(r.tpv_30_dias)
    s.bonus_total += Number(r.bonus_closer)
    if (r.gatilho_roleta) s.gatilhos++
  })
  const closers = [...closerMap.values()].sort((a, b) => b.tpv_total - a.tpv_total)

  // ── Resumo por SDR ────────────────────────────────────────────────────────
  const sdrMap = new Map<string, SdrSummary>()
  rows.forEach(r => {
    const email = r.sdr_email || 'sem-sdr'
    if (!sdrMap.has(email)) {
      sdrMap.set(email, { email, name: nameByEmail(r.sdr_email), clientes: 0, tpv_total: 0, bonus_total: 0 })
    }
    const s = sdrMap.get(email)!
    s.clientes++
    s.tpv_total  += Number(r.tpv_30_dias)
    s.bonus_total += Number(r.bonus_sdr)
  })
  const sdrs = [...sdrMap.values()].sort((a, b) => b.tpv_total - a.tpv_total)

  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} style={{
      padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      background: tab === t ? 'var(--accent)' : 'var(--bg-card2)',
      color: tab === t ? '#fff' : 'var(--text2)',
      transition: 'all .15s',
    }}>{label}</button>
  )

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>

        {/* Título */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Pagamentos & TPV</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
              Bônus calculados sobre TPV dos 30 dias após ativação
            </p>
          </div>
          <button onClick={recalcular} disabled={isRefreshing} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--bg-card2)', color: 'var(--text2)', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 600,
          }}>
            <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            Recalcular TPV
          </button>
        </div>

        {/* Cards de resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TrendingUp size={18} color="var(--accent)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>TPV Total 30d</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{isLoading ? '…' : BRL(totalTPV30)}</div>
          </div>
          <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <DollarSign size={18} color="#34C759" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Bônus Total</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#34C759' }}>{isLoading ? '…' : BRL(totalBonus)}</div>
          </div>
          <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Users size={18} color="#BF5AF2" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Clientes no Cache</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{isLoading ? '…' : totalClientes}</div>
          </div>
          <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Zap size={18} color="#FF9F0A" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Gatilhos Roleta</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#FF9F0A' }}>{isLoading ? '…' : totalGatilhos}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>TPV ≥ R$1.000 em 7 dias</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {tabBtn('closers',  'Por Closer')}
          {tabBtn('sdrs',     'Por SDR')}
          {tabBtn('detalhes', 'Detalhes por Cliente')}
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>Carregando...</div>
        ) : (
          <>
            {/* ── Tab Closers ──────────────────────────────────────────────── */}
            {tab === 'closers' && (
              <div style={card()}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Closer', 'Clientes', 'TPV 30d', 'Bônus (0,2%)', 'Gatilhos'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Closer' ? 'left' : 'right',
                          fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closers.map((c, i) => (
                      <tr key={c.email} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card2)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text2)' }}>{c.clientes}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{BRL(c.tpv_total)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#34C759', fontWeight: 700 }}>{BRL(c.bonus_total)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {c.gatilhos > 0 ? (
                            <span style={{ background: '#FF9F0A22', color: '#FF9F0A', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>
                              ⚡ {c.gatilhos}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Tab SDRs ─────────────────────────────────────────────────── */}
            {tab === 'sdrs' && (
              <div style={card()}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['SDR', 'Clientes', 'TPV 30d', 'Bônus (0,05%)'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: h === 'SDR' ? 'left' : 'right',
                          fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sdrs.map((s, i) => (
                      <tr key={s.email} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card2)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text2)' }}>{s.clientes}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{BRL(s.tpv_total)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#34C759', fontWeight: 700 }}>{BRL(s.bonus_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Tab Detalhes ─────────────────────────────────────────────── */}
            {tab === 'detalhes' && (
              <div style={card()}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Cliente', 'Closer', 'SDR', 'Time', 'Data Ativação', 'TPV 7d', 'TPV 30d', 'Bônus Closer', 'Bônus SDR', 'Roleta'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left',
                            fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                            letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card2)' }}>
                          <td style={{ padding: '8px 10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cliente_email}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{nameByEmail(r.closer_email)}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{nameByEmail(r.sdr_email)}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>{r.time_id || '—'}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                            {new Date(r.data_fechamento).toLocaleDateString('pt-BR')}
                          </td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{BRL(Number(r.tpv_7_dias))}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>{BRL(Number(r.tpv_30_dias))}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#34C759' }}>{BRL(Number(r.bonus_closer))}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#34C759' }}>{BRL(Number(r.bonus_sdr))}</td>
                          <td style={{ padding: '8px 10px' }}>
                            {r.gatilho_roleta ? <span style={{ color: '#FF9F0A', fontWeight: 700 }}>⚡</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
