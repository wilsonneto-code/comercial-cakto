import { useEffect, useState } from 'react'
import { Header } from '../../components/Header'
import { useAuth } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { RefreshCw, Search, TrendingUp, DollarSign } from 'lucide-react'

interface CarteiraCli {
  gerente: string
  nome: string
  email: string
  telefone: string
  faturamento: number
  tpv_mes: number | null
  ultima_venda: string | null
  previsao_faturamento: number
}

const BRL = (v: number) =>
  v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'

const card = (s?: React.CSSProperties): React.CSSProperties => ({
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, ...s,
})

export default function Carteiras() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  return <CarteirasContent />
}

function CarteirasContent() {
  const [clientes, setClientes] = useState<CarteiraCli[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch]           = useState('')
  const [filterCart, setFilterCart]   = useState('todas')
  const [sort, setSort]               = useState<'faturamento' | 'tpv' | 'nome'>('faturamento')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setIsLoading(true)
    const { data, error } = await supabase.functions.invoke('mb-search', { body: {} })
    if (!error && data?.clientes) {
      setClientes(data.clientes as CarteiraCli[])
    }
    setIsLoading(false)
  }

  async function refresh() {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  const gerentes = [...new Set(clientes.map(c => c.gerente))].sort()

  const filtered = clientes
    .filter(c => filterCart === 'todas' || c.gerente === filterCart)
    .filter(c => {
      const q = search.toLowerCase()
      return !q || c.nome?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sort === 'nome') return a.nome.localeCompare(b.nome)
      if (sort === 'tpv')  return (b.tpv_mes ?? 0) - (a.tpv_mes ?? 0)
      return b.faturamento - a.faturamento
    })

  // resumo por gerente
  const resumo = gerentes.map(g => {
    const cls = clientes.filter(c => c.gerente === g)
    return {
      gerente: g,
      total: cls.length,
      fat_total: cls.reduce((s, c) => s + c.faturamento, 0),
      tpv_total: cls.reduce((s, c) => s + (c.tpv_mes ?? 0), 0),
    }
  })

  const tabBtn = (v: string, label: string) => (
    <button key={v} onClick={() => setFilterCart(v)} style={{
      padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      background: filterCart === v ? 'var(--accent)' : 'var(--bg-card2)',
      color: filterCart === v ? '#fff' : 'var(--text2)',
    }}>{label}</button>
  )

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>

        {/* Título */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Carteiras</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
              Clientes ativos por gerente de contas — dados do Metabase
            </p>
          </div>
          <button onClick={refresh} disabled={isRefreshing} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--bg-card2)', color: 'var(--text2)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
          }}>
            <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>

        {/* Cards resumo */}
        {!isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${resumo.length}, 1fr)`, gap: 16, marginBottom: 28 }}>
            {resumo.map(r => (
              <div key={r.gerente} style={{ ...card(), padding: '20px 24px', cursor: 'pointer',
                outline: filterCart === r.gerente ? '2px solid var(--accent)' : 'none' }}
                onClick={() => setFilterCart(filterCart === r.gerente ? 'todas' : r.gerente)}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                  {r.gerente}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{r.total} clientes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                    <TrendingUp size={13} color="var(--accent)" />
                    Fat. base: <strong style={{ color: 'var(--text)' }}>{BRL(r.fat_total)}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                    <DollarSign size={13} color="#34C759" />
                    TPV mês: <strong style={{ color: '#34C759' }}>{BRL(r.tpv_total)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabBtn('todas', 'Todas')}
            {gerentes.map(g => tabBtn(g, g))}
          </div>

          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente ou email..."
              style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, width: 220 }}
            />
          </div>

          <select value={sort} onChange={e => setSort(e.target.value as any)} style={{
            padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13,
          }}>
            <option value="faturamento">↓ Faturamento base</option>
            <option value="tpv">↓ TPV mês</option>
            <option value="nome">A→Z Nome</option>
          </select>
        </div>

        {/* Tabela */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>Carregando carteiras...</div>
        ) : (
          <div style={card()}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cliente', 'Email', 'Telefone', 'Gerente', 'Prev. Fat.', 'TPV Mês', '% Atingido', 'Última Venda'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'TPV Mês' || h === 'Prev. Fat.' || h === '% Atingido' ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.email + i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card2)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: 12 }}>{c.email}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>{c.telefone || '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: 'var(--bg-card2)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {c.gerente}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#BF5AF2', fontWeight: 700 }}>
                      {c.previsao_faturamento > 0 ? BRL(c.previsao_faturamento) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#34C759', fontWeight: 700 }}>
                      {c.tpv_mes != null ? BRL(c.tpv_mes) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {(() => {
                        if (!c.previsao_faturamento) return <span style={{ color: 'var(--text2)' }}>—</span>
                        const pct = Math.min((c.tpv_mes ?? 0) / c.previsao_faturamento * 100, 999)
                        const color = pct >= 80 ? '#34C759' : pct >= 50 ? '#FF9F0A' : '#FF3B30'
                        return (
                          <span style={{ color, fontWeight: 700 }}>
                            {pct.toFixed(1)}%
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.ultima_venda ? new Date(c.ultima_venda).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Nenhum cliente encontrado.</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)', borderTop: '1px solid var(--border)' }}>
              {filtered.length} cliente{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
