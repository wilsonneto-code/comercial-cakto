import { useEffect, useState } from 'react'
import { Header } from '../../components/Header'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { RefreshCw, Search, TrendingUp, DollarSign, MessageSquare, Zap, Tag, CheckCircle, X } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'

interface Nota {
  id?: string
  email: string
  motivo: string
  observacao: string
  proxima_acao: string
  data_contato: string
}

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

const MOTIVOS = [
  'Cliente em churn',
  'Produto pausado',
  'Problema técnico',
  'Férias / ausência',
  'Mudança de estratégia',
  'Aguardando produto',
  'Problema financeiro',
  'Em negociação',
  'Outro',
]

function CarteirasContent() {
  const { user } = useAuth()
  const toast    = useToast()
  const isAdmin  = hasAnyRole(user, ['Admin'])
  // GC só vê a própria carteira (nome do user === nome do gerente no Metabase)
  const gcNome   = !isAdmin ? (user?.name ?? '') : null
  const [clientes, setClientes]       = useState<CarteiraCli[]>([])
  const [notas, setNotas]             = useState<Record<string, Nota>>({})
  const [isLoading, setIsLoading]     = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch]           = useState('')
  const [filterCart, setFilterCart]   = useState('todas')
  const [sort, setSort]               = useState<'faturamento' | 'tpv' | 'nome' | 'pct'>('pct')
  const [filterPct, setFilterPct]     = useState<'todos' | 'verde' | 'amarelo' | 'vermelho' | 'critico'>('todos')
  const [modalCli, setModalCli]       = useState<CarteiraCli | null>(null)
  const [notaForm, setNotaForm]       = useState<Omit<Nota,'email'>>({ motivo: '', observacao: '', proxima_acao: '', data_contato: '' })
  const [isSaving, setIsSaving]       = useState(false)

  // Campanha DataCrazy
  const [modalCampanha, setModalCampanha] = useState(false)
  const [dcTags, setDcTags]               = useState<{ id: string; name: string; color: string }[]>([])
  const [tagSelecionada, setTagSelecionada] = useState('')
  const [isCampanha, setIsCampanha]       = useState(false)
  const [resultCampanha, setResultCampanha] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setIsLoading(true)
    const [{ data: mbData }, { data: notasData }] = await Promise.all([
      supabase.functions.invoke('mb-search', { body: {} }),
      supabase.from('carteira_notas').select('*'),
    ])
    if (mbData?.clientes) setClientes(mbData.clientes as CarteiraCli[])
    if (notasData) {
      const map: Record<string, Nota> = {}
      notasData.forEach((n: any) => { map[n.email] = n })
      setNotas(map)
    }
    setIsLoading(false)
  }

  async function refresh() {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  function openModal(c: CarteiraCli) {
    const existing = notas[c.email]
    setNotaForm({
      motivo:       existing?.motivo      ?? '',
      observacao:   existing?.observacao  ?? '',
      proxima_acao: existing?.proxima_acao ?? '',
      data_contato: existing?.data_contato ?? '',
    })
    setModalCli(c)
  }

  async function saveNota() {
    if (!modalCli) return
    setIsSaving(true)
    const payload = {
      email:        modalCli.email,
      motivo:       notaForm.motivo,
      observacao:   notaForm.observacao,
      proxima_acao: notaForm.proxima_acao,
      data_contato: notaForm.data_contato || null,
      criado_por:   user?.id,
      updated_at:   new Date().toISOString(),
    }
    const { error } = await supabase.from('carteira_notas').upsert(payload, { onConflict: 'email' })
    setIsSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setNotas(p => ({ ...p, [modalCli.email]: { ...payload, id: notas[modalCli.email]?.id } as Nota }))
    toast('Nota salva!', 'success')
    setModalCli(null)
  }

  async function abrirModalCampanha() {
    setResultCampanha(null)
    setTagSelecionada('')
    // Carrega tags do DataCrazy
    const { data } = await supabase.functions.invoke('campanha-gc', {
      body: { listar_tags: true }
    })
    if (data?.tags) setDcTags(data.tags)
    setModalCampanha(true)
  }

  async function enviarCampanha() {
    if (!tagSelecionada) { toast('Selecione uma tag', 'error'); return }
    const emails = filtered.map(c => c.email).filter(Boolean)
    if (!emails.length) { toast('Nenhum cliente na lista', 'error'); return }
    setIsCampanha(true)
    const tag = dcTags.find(t => t.id === tagSelecionada)
    const { data, error } = await supabase.functions.invoke('campanha-gc', {
      body: { emails, tagId: tagSelecionada, tagName: tag?.name }
    })
    setIsCampanha(false)
    if (error) { toast('Erro ao enviar campanha', 'error'); return }
    setResultCampanha(data)
  }

  const gerentes = [...new Set(clientes.map(c => c.gerente))].sort()

  const getPct = (c: CarteiraCli) =>
    c.previsao_faturamento > 0 ? (c.tpv_mes ?? 0) / c.previsao_faturamento * 100 : null

  const getPctColor = (pct: number | null) =>
    pct === null ? null : pct >= 80 ? 'verde' : pct >= 50 ? 'amarelo' : pct >= 20 ? 'vermelho' : 'critico'

  const filtered = clientes
    .filter(c => gcNome ? c.gerente === gcNome : (filterCart === 'todas' || c.gerente === filterCart))
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
      prev_total: cls.reduce((s, c) => s + (c.previsao_faturamento ?? 0), 0),
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

  const pctChip = (pct: number | null) => {
    if (pct === null) return <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>
    const v = Math.min(pct, 999)
    const [bg, fg] = v >= 80 ? ['#34C75922','#34C759'] : v >= 50 ? ['#FF9F0A22','#FF9F0A'] : v >= 20 ? ['#FF3B3022','#FF3B30'] : ['#8B000033','#FF4444']
    return (
      <span style={{ background: bg, color: fg, fontWeight: 700, fontSize: 12, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
        {v.toFixed(1)}%
      </span>
    )
  }

  const inp: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13,
  }

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>

        {/* Título */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
              {gcNome ? `Minha Carteira` : 'Carteiras'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
              {gcNome ? `${gcNome} · ` : ''}{filtered.length} clientes · dados do Metabase
            </p>
          </div>
          <button onClick={refresh} disabled={isRefreshing} style={{
            display: 'flex', alignItems: 'center', gap: 6, ...inp, cursor: 'pointer', fontWeight: 600,
          }}>
            <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>

        {/* Cards GC */}
        {!isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gcNome ? 1 : resumo.length}, 1fr)`, gap: 14, marginBottom: 24 }}>
            {resumo.filter(r => gcNome ? r.gerente === gcNome : true).map(r => {
              const pct = r.prev_total > 0 ? r.tpv_total / r.prev_total * 100 : null
              const [pbg, pfg] = !pct ? ['transparent','var(--text2)'] : pct >= 80 ? ['#34C75918','#34C759'] : pct >= 50 ? ['#FF9F0A18','#FF9F0A'] : ['#FF3B3018','#FF3B30']
              const active = filterCart === r.gerente
              return (
                <div key={r.gerente} onClick={() => !gcNome && setFilterCart(active ? 'todas' : r.gerente)}
                  style={{ background: 'var(--bg-card)', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'border .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{r.gerente}</div>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>{r.total}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>clientes</div>
                    </div>
                    {pct !== null && (
                      <span style={{ background: pbg, color: pfg, fontSize: 13, fontWeight: 800, padding: '4px 10px', borderRadius: 20 }}>
                        {Math.min(pct, 999).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}><TrendingUp size={12} color="#BF5AF2" /> Prev. Fat.</span>
                      <strong style={{ color: '#BF5AF2' }}>{BRL(r.prev_total)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}><DollarSign size={12} color="#34C759" /> TPV mês</span>
                      <strong style={{ color: '#34C759' }}>{BRL(r.tpv_total)}</strong>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Barra de filtros */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Gerente — só admin vê */}
          {isAdmin && (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                {['todas', ...gerentes].map(g => (
                  <button key={g} onClick={() => setFilterCart(g)} style={{
                    padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600, transition: 'all .15s',
                    background: filterCart === g ? 'var(--accent)' : 'transparent',
                    color: filterCart === g ? '#fff' : 'var(--text2)',
                  }}>{g === 'todas' ? 'Todos' : g}</button>
                ))}
              </div>
              <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
            </>
          )}

          {/* % Atingido */}
          {([
            { v: 'todos',    label: 'Qualquer %',  bg: 'transparent', fg: 'var(--text2)', border: 'var(--border)' },
            { v: 'verde',    label: '≥ 80%',        bg: '#34C759',     fg: '#fff',          border: '#34C759' },
            { v: 'amarelo',  label: '50–79%',       bg: '#FF9F0A',     fg: '#fff',          border: '#FF9F0A' },
            { v: 'vermelho', label: '20–49%',       bg: '#FF3B30',     fg: '#fff',          border: '#FF3B30' },
            { v: 'critico',  label: '< 20%',        bg: '#8B0000',     fg: '#fff',          border: '#8B0000' },
          ] as const).map(({ v, label, bg, fg, border }) => (
            <button key={v} onClick={() => setFilterPct(v)} style={{
              padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              border: `1px solid ${filterPct === v ? border : 'var(--border)'}`,
              background: filterPct === v ? bg : 'transparent',
              color: filterPct === v ? fg : 'var(--text2)',
              transition: 'all .15s',
            }}>{label}</button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                style={{ ...inp, paddingLeft: 30, width: 180 }} />
            </div>
            <select value={sort} onChange={e => setSort(e.target.value as any)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="pct">↓ % Atingido</option>
              <option value="tpv">↓ TPV mês</option>
              <option value="nome">A→Z Nome</option>
            </select>

            {/* Botão campanha */}
            {!isLoading && filtered.length > 0 && (
              <button onClick={abrirModalCampanha} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #FF6B35, #FF3B30)',
                color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                <Zap size={13} />
                Criar Campanha ({filtered.length})
              </button>
            )}
          </div>
        </div>

        {/* Tabela */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)', fontSize: 14 }}>Carregando carteiras...</div>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-card2)' }}>
                  {[
                    { label: 'Cliente',      align: 'left'  },
                    { label: 'Contato',      align: 'left'  },
                    { label: 'Gerente',      align: 'left'  },
                    { label: 'Prev. Fat.',   align: 'right' },
                    { label: 'TPV Mês',      align: 'right' },
                    { label: '% Atingido',   align: 'center'},
                    { label: 'Últ. Venda',   align: 'left'  },
                    { label: '',             align: 'left'  },
                  ].map(h => (
                    <th key={h.label} style={{ padding: '11px 16px', textAlign: h.align as any,
                      fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                      letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.email + i}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', maxWidth: 180 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {c.telefone ? (
                        <a href={`https://wa.me/55${c.telefone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          style={{ color: '#25D366', fontWeight: 600, textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          {c.telefone}
                        </a>
                      ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {c.gerente}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#BF5AF2', fontWeight: 700, fontSize: 13 }}>
                      {c.previsao_faturamento > 0 ? BRL(c.previsao_faturamento) : <span style={{ color: 'var(--text2)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#34C759', fontWeight: 700, fontSize: 13 }}>
                      {c.tpv_mes ? BRL(c.tpv_mes) : <span style={{ color: 'var(--text2)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {pctChip(getPct(c))}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.ultima_venda ? new Date(c.ultima_venda).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => openModal(c)} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                        background: notas[c.email] ? '#2997FF15' : 'transparent',
                        border: `1px solid ${notas[c.email] ? '#2997FF' : 'var(--border)'}`,
                        color: notas[c.email] ? '#2997FF' : 'var(--text2)',
                      }}>
                        <MessageSquare size={11} />
                        {notas[c.email] ? 'Ver nota' : 'Nota'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Nenhum cliente encontrado.</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{filtered.length} cliente{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}</span>
              <span>{clientes.length} total na carteira</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal de campanha DataCrazy */}
      {modalCampanha && (
        <div style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget && !isCampanha) { setModalCampanha(false); setResultCampanha(null) } }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520 }}>

            {!resultCampanha ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#FF6B35,#FF3B30)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={18} color="#fff" />
                  </div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Criar Campanha no DataCrazy</h2>
                </div>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text2)' }}>
                  Será adicionada uma tag a <strong>{filtered.length} clientes</strong> filtrados. O flow configurado no DataCrazy para essa tag será disparado automaticamente.
                </p>

                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
                  <strong style={{ color: 'var(--text)' }}>Clientes selecionados:</strong>{' '}
                  {filtered.slice(0, 3).map(c => c.nome.split(' ')[0]).join(', ')}{filtered.length > 3 ? ` e mais ${filtered.length - 3}…` : ''}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 8 }}>
                    Tag DataCrazy (flow pré-configurado)
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {dcTags.length === 0 && <div style={{ color: 'var(--text2)', fontSize: 13 }}>Carregando tags...</div>}
                    {dcTags.map(t => (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
                        background: tagSelecionada === t.id ? t.color + '22' : 'var(--bg-card2)',
                        border: `1px solid ${tagSelecionada === t.id ? t.color : 'transparent'}`,
                        cursor: 'pointer', transition: 'all .15s' }}>
                        <input type="radio" name="tag" value={t.id} checked={tagSelecionada === t.id}
                          onChange={() => setTagSelecionada(t.id)} style={{ accentColor: t.color }} />
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                        <Tag size={11} color="var(--text2)" style={{ marginLeft: 'auto' }} />
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setModalCampanha(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button onClick={enviarCampanha} disabled={isCampanha || !tagSelecionada} style={{
                    padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: tagSelecionada ? 'linear-gradient(135deg,#FF6B35,#FF3B30)' : 'var(--bg-card2)',
                    color: tagSelecionada ? '#fff' : 'var(--text2)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                  }}>
                    {isCampanha ? `Enviando... (0/${filtered.length})` : `Disparar Campanha`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
                  <CheckCircle size={40} color="#34C759" style={{ marginBottom: 10 }} />
                  <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>Campanha Enviada!</h2>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>Tag <strong>"{resultCampanha.tagName}"</strong> adicionada no DataCrazy</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Tag adicionada', val: resultCampanha.sucesso, color: '#34C759' },
                    { label: 'Não encontrado', val: resultCampanha.nao_encontrado, color: '#FF9F0A' },
                    { label: 'Erro', val: resultCampanha.erro, color: '#FF3B30' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color }}>{val}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#34C75910', border: '1px solid #34C75930', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
                  O flow configurado no DataCrazy para a tag <strong style={{ color: 'var(--text)' }}>"{resultCampanha.tagName}"</strong> será disparado automaticamente para os leads marcados.
                </div>
                <button onClick={() => { setModalCampanha(false); setResultCampanha(null) }}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de nota */}
      {modalCli && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setModalCli(null) }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Observação do cliente</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text2)' }}>{modalCli.nome} — {modalCli.email}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Motivo</label>
                <select value={notaForm.motivo} onChange={e => setNotaForm(p => ({ ...p, motivo: e.target.value }))}
                  style={{ width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }}>
                  <option value="">Selecione um motivo...</option>
                  {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Observação</label>
                <textarea value={notaForm.observacao} onChange={e => setNotaForm(p => ({ ...p, observacao: e.target.value }))}
                  rows={3} placeholder="Descreva o que está acontecendo com o cliente..."
                  style={{ width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Próxima ação</label>
                <input value={notaForm.proxima_acao} onChange={e => setNotaForm(p => ({ ...p, proxima_acao: e.target.value }))}
                  placeholder="Ex: Ligar na próxima semana, enviar proposta..."
                  style={{ width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Data do último contato</label>
                <input type="date" value={notaForm.data_contato} onChange={e => setNotaForm(p => ({ ...p, data_contato: e.target.value }))}
                  style={{ width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalCli(null)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={saveNota} disabled={isSaving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
