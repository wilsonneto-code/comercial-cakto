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
  const [sort, setSort]               = useState<'faturamento' | 'tpv' | 'nome' | 'pct'>('pct')
  const [filterPct, setFilterPct]     = useState<'todos' | 'verde' | 'amarelo' | 'vermelho'>('todos')

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

  const getPct = (c: CarteiraCli) =>
    c.previsao_faturamento > 0 ? (c.tpv_mes ?? 0) / c.previsao_faturamento * 100 : null

  const getPctColor = (pct: number | null) =>
    pct === null ? null : pct >= 80 ? 'verde' : pct >= 50 ? 'amarelo' : 'vermelho'

  const filtered = clientes
    .filter(c => filterCart === 'todas' || c.gerente === filterCart)
    .filter(c => {
      if (filterPct !== 'todos') return getPctColor(getPct(c)) === filterPct
      return true
    })
    .filter(c => {
      const q = search.toLowerCase()
      return !q || c.nome?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sort === 'nome') return a.nome.localeCompare(b.nome)
      if (sort === 'tpv')  return (b.tpv_mes ?? 0) - (a.tpv_mes ?? 0)
      if (sort === 'pct')  return (getPct(b) ?? -1) - (getPct(a) ?? -1)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabBtn('todas', 'Todas')}
            {gerentes.map(g => tabBtn(g, g))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {/* Filtro % atingido */}
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { v: 'todos',    label: 'Todos',       color: 'var(--text2)' },
              { v: 'verde',    label: '🟢 ≥ 80%',    color: '#34C759' },
              { v: 'amarelo',  label: '🟡 50–79%',   color: '#FF9F0A' },
              { v: 'vermelho', label: '🔴 < 50%',    color: '#FF3B30' },
            ] as const).map(({ v, label, color }) => (
              <button key={v} onClick={() => setFilterPct(v)} style={{
                padding: '6px 12px', borderRadius: 8, border: `1px solid ${filterPct === v ? color : 'var(--border)'}`,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                background: filterPct === v ? color + '22' : 'var(--bg-card2)',
                color: filterPct === v ? color : 'var(--text2)',
              }}>{label}</button>
            ))}
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
            <option value="pct">↓ % Atingido</option>
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
                    <td style={{ padding: '10px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.telefone ? (
                        <a href={`https://wa.me/55${c.telefone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          style={{ color: '#25D366', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          {c.telefone}
                        </a>
                      ) : <span style={{ color: 'var(--text2)' }}>—</span>}
                    </td>
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
                        const pct = getPct(c)
                        if (pct === null) return <span style={{ color: 'var(--text2)' }}>—</span>
                        const color = pct >= 80 ? '#34C759' : pct >= 50 ? '#FF9F0A' : '#FF3B30'
                        return <span style={{ color, fontWeight: 700 }}>{Math.min(pct, 999).toFixed(1)}%</span>
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
