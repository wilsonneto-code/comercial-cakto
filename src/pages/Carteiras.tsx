import { useEffect, useState } from 'react'
import { Header } from '../../components/Header'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { getMbClientes, invalidateMbCache } from '@/lib/mbCache'
import { GOALS } from '@/lib/goals'
import { RefreshCw, Search, TrendingUp, DollarSign, MessageSquare, Zap, Tag, CheckCircle, X, Download, Database, Loader2 } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'

interface Nota {
  id?: string
  email: string
  motivo: string
  observacao: string
  proxima_acao: string
  data_contato: string
}

// Alias de nomes de gerentes (Metabase → exibição)
const GERENTE_ALIAS: Record<string, string> = {
  'Isaac': 'Carlos Eduardo',
}
const gerenteNome = (nome: string) => GERENTE_ALIAS[nome] ?? nome

// Tier fixo por gerente (nome exibido após alias)
const GERENTE_TIER: Record<string, 'starter' | 'growth' | 'enterprise'> = {
  'Carlos Eduardo': 'starter',
  'Gabriel Bairros': 'growth',
  'Rafael Mendes':   'enterprise',
}

interface CarteiraCli {
  gerente: string
  nome: string
  email: string
  telefone: string
  faturamento: number
  tpv_30d: number | null
  tpv_mes: number | null
  tpv_total: number | null
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
  const [sort, setSort]               = useState<'faturamento' | 'tpv' | 'nome' | 'pct' | 'tpv_total' | 'prev'>('pct')
  const [sortDir, setSortDir]         = useState<'desc' | 'asc'>('desc')
  const [filterPct, setFilterPct]     = useState<'todos' | 'verde' | 'amarelo' | 'vermelho' | 'critico'>('todos')
  const [filterTpvTotal, setFilterTpvTotal] = useState<'todos' | '100k' | '500k' | '1m' | '2m'>('todos')
  const [filterPrev,     setFilterPrev]     = useState<'todos' | '5k' | '10k' | '30k' | '50k'>('todos')
  const [filterPeriodo, setFilterPeriodo]   = useState<'todos' | 'mes' | '30d'>('todos')
  const [modalCli, setModalCli]       = useState<CarteiraCli | null>(null)
  const [notaForm, setNotaForm]       = useState<Omit<Nota,'email'>>({ motivo: '', observacao: '', proxima_acao: '', data_contato: '' })
  const [isSaving, setIsSaving]       = useState(false)

  // Atualizar Tags DataCrazy
  type TagResult = { email: string; client: string; pct: number|null; newTag: string; status: 'ok'|'error'|'skip'; tagUpdated?: string; previousTags?: string[]; error?: string }
  type TagStats  = { total: number; ok: number; errors: number; skipped: number; dentroMeta: number; proximoMeta: number; possivelChurn: number; churn: number }
  const [modalTags,    setModalTags]    = useState(false)
  const [tagsLoading,  setTagsLoading]  = useState(false)
  const [tagsStats,    setTagsStats]    = useState<TagStats | null>(null)
  const [tagsResults,  setTagsResults]  = useState<TagResult[]>([])
  const [tagsError,    setTagsError]    = useState<string | null>(null)
  const [tagsProgress, setTagsProgress] = useState({ done: 0, total: 0, batch: 0, batches: 0 })

  // Sincronizar CRM
  type SyncResult = {
    email: string; client: string; tier: string | null; gerente: string
    status: 'ok' | 'error' | 'skip'; leadAction?: string; leadId?: string
    bizAction?: string; bizId?: string; bizStage?: string
    tagAdded?: string; error?: string; steps?: string[]
  }
  type SyncStats = {
    total: number; ok: number; errors: number; skipped: number
    leadsCreated: number; bizCreated: number; bizExisting: number
    starter: number; growth: number; enterprise: number
    pipelinesFound?: Record<string, string>
    pipelineErrors?: string[]
  }
  const [modalSync,    setModalSync]    = useState(false)
  const [syncLoading,  setSyncLoading]  = useState(false)
  const [syncStats,    setSyncStats]    = useState<SyncStats | null>(null)
  const [syncResults,  setSyncResults]  = useState<SyncResult[]>([])
  const [syncError,    setSyncError]    = useState<string | null>(null)
  const [syncScope,    setSyncScope]    = useState<'filtrado' | 'todos'>('todos')
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0, batch: 0, batches: 0 })
  const BATCH_SIZE = 10 // lotes menores evitam HTTP 546 (limite de recursos da Edge Function)

  async function runSyncCRM() {
    setSyncLoading(true)
    setSyncStats(null)
    setSyncResults([])
    setSyncError(null)

    const lista = syncScope === 'filtrado' ? filtered : clientes
    const allClients = lista.map(c => ({
      email:                c.email,
      nome:                 c.nome,
      telefone:             c.telefone ?? null,
      gerente:              gerenteNome(c.gerente),
      previsao_faturamento: c.previsao_faturamento ?? 0,
      tpv_mes:              c.tpv_mes ?? 0,
    }))

    // Divide em lotes
    const batches: typeof allClients[] = []
    for (let i = 0; i < allClients.length; i += BATCH_SIZE)
      batches.push(allClients.slice(i, i + BATCH_SIZE))

    setSyncProgress({ done: 0, total: allClients.length, batch: 0, batches: batches.length })

    const accResults: SyncResult[] = []
    let accStats: SyncStats = { total: 0, ok: 0, errors: 0, skipped: 0, leadsCreated: 0, bizCreated: 0, bizExisting: 0, starter: 0, growth: 0, enterprise: 0, pipelinesFound: {} }
    let firstError: string | null = null

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const { data: { session } } = await supabase.auth.getSession()
    const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY

    for (let b = 0; b < batches.length; b++) {
      setSyncProgress(p => ({ ...p, batch: b + 1, done: b * BATCH_SIZE }))
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/bulk-sync-gc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ clients: batches[b] }),
        })
        const bData = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status} — resposta não é JSON` }))
        if (!res.ok || !bData?.success) {
          firstError = `Lote ${b + 1} (HTTP ${res.status}): ${bData?.error ?? bData?.message ?? JSON.stringify(bData).slice(0, 300)}`
          break
        }

        // Acumula resultados
        const br: SyncResult[] = bData.results ?? []
        accResults.push(...br)
        const bs: SyncStats = bData.stats ?? {}
        accStats = {
          total:         accStats.total         + (bs.total         ?? 0),
          ok:            accStats.ok            + (bs.ok            ?? 0),
          errors:        accStats.errors        + (bs.errors        ?? 0),
          skipped:       accStats.skipped       + (bs.skipped       ?? 0),
          leadsCreated:  accStats.leadsCreated  + (bs.leadsCreated  ?? 0),
          bizCreated:    accStats.bizCreated    + (bs.bizCreated    ?? 0),
          bizExisting:   accStats.bizExisting   + (bs.bizExisting   ?? 0),
          starter:       accStats.starter       + (bs.starter       ?? 0),
          growth:        accStats.growth        + (bs.growth        ?? 0),
          enterprise:    accStats.enterprise    + (bs.enterprise    ?? 0),
          pipelinesFound: bs.pipelinesFound ?? accStats.pipelinesFound,
        }
        setSyncResults([...accResults])
        setSyncStats({ ...accStats })
        setSyncProgress(p => ({ ...p, done: Math.min((b + 1) * BATCH_SIZE, allClients.length) }))
      } catch (e) {
        firstError = `Lote ${b + 1}: ${String(e)}`
        break
      }
    }

    if (firstError) setSyncError(firstError)
    else toast(`Sincronização concluída: ${accStats.bizCreated} negócios criados ✓`, 'success')
    setSyncLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function loadData(forceRefresh = false) {
    setIsLoading(true)
    const [clientes, { data: notasData }] = await Promise.all([
      getMbClientes(forceRefresh),
      supabase.from('carteira_notas').select('*'),
    ])
    setClientes(clientes as CarteiraCli[])
    if (notasData) {
      const map: Record<string, Nota> = {}
      notasData.forEach((n: any) => { map[n.email] = n })
      setNotas(map)
    }
    setIsLoading(false)
  }

  function exportCsv() {
    const BRL = (v: number | null) => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }) : ''
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = ['Cliente', 'Email', 'Telefone', 'Gerente', 'TPV Total', 'Prev. Fat.', 'TPV Mês', '% Atingido', 'Últ. Venda']
    const rows = filtered.map(c => {
      const pct = c.previsao_faturamento > 0 ? (getTpvPeriodo(c) / c.previsao_faturamento * 100) : null
      return [
        esc(c.nome),
        esc(c.email),
        esc(c.telefone ?? ''),
        esc(gerenteNome(c.gerente)),
        esc(BRL(c.tpv_total ?? null)),
        esc(BRL(c.previsao_faturamento)),
        esc(BRL(getTpvPeriodo(c))),
        pct != null ? esc(pct.toFixed(1) + '%') : esc(''),
        esc(c.ultima_venda ?? ''),
      ].join(';')
    })
    const csv = '﻿' + [headers.map(h => esc(h)).join(';'), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `carteiras_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleSort(col: typeof sort) {
    if (sort === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSort(col); setSortDir('desc') }
  }


  async function refresh() {
    setIsRefreshing(true)
    invalidateMbCache()
    await loadData(true)
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

  async function runUpdateTags() {
    setTagsLoading(true)
    setTagsStats(null)
    setTagsResults([])
    setTagsError(null)

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const { data: { session } } = await supabase.auth.getSession()
    const authToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY

    const allClients = filtered.map(c => ({
      email:    c.email,
      nome:     c.nome,
      telefone: c.telefone ?? null,
      pct:      getPct(c),
    }))

    const TAG_BATCH = 10
    const batches: typeof allClients[] = []
    for (let i = 0; i < allClients.length; i += TAG_BATCH)
      batches.push(allClients.slice(i, i + TAG_BATCH))

    setTagsProgress({ done: 0, total: allClients.length, batch: 0, batches: batches.length })

    const accResults: TagResult[] = []
    let accStats: TagStats = { total: 0, ok: 0, errors: 0, skipped: 0, dentroMeta: 0, proximoMeta: 0, possivelChurn: 0, churn: 0 }
    let firstError: string | null = null

    for (let b = 0; b < batches.length; b++) {
      setTagsProgress(p => ({ ...p, batch: b + 1, done: b * TAG_BATCH }))
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/update-tags-gc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ clients: batches[b] }),
        })
        const bData = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
        if (!bData?.success) { firstError = `Lote ${b + 1}: ${bData?.error ?? 'Falha'}`; break }

        const br: TagResult[] = bData.results ?? []
        accResults.push(...br)
        const bs: TagStats = bData.stats ?? {}
        accStats = {
          total:         accStats.total         + (bs.total ?? 0),
          ok:            accStats.ok            + (bs.ok ?? 0),
          errors:        accStats.errors        + (bs.errors ?? 0),
          skipped:       accStats.skipped       + (bs.skipped ?? 0),
          dentroMeta:    accStats.dentroMeta    + (bs.dentroMeta ?? 0),
          proximoMeta:   accStats.proximoMeta   + (bs.proximoMeta ?? 0),
          possivelChurn: accStats.possivelChurn + (bs.possivelChurn ?? 0),
          churn:         accStats.churn         + (bs.churn ?? 0),
        }
        setTagsResults([...accResults])
        setTagsStats({ ...accStats })
        setTagsProgress(p => ({ ...p, done: Math.min((b + 1) * TAG_BATCH, allClients.length) }))
      } catch (e) {
        firstError = `Lote ${b + 1}: ${String(e)}`; break
      }
    }

    if (firstError) setTagsError(firstError)
    else toast(`Tags atualizadas: ${accStats.ok} clientes ✓`, 'success')
    setTagsLoading(false)
  }

  const gerentes = [...new Set(clientes.map(c => c.gerente))].sort()

  const getTpvPeriodo = (c: CarteiraCli) =>
    filterPeriodo === '30d' ? (c.tpv_30d ?? 0) : (c.tpv_mes ?? 0)

  const getPct = (c: CarteiraCli) =>
    c.previsao_faturamento > 0 ? getTpvPeriodo(c) / c.previsao_faturamento * 100 : null

  const tpvColLabel = filterPeriodo === '30d' ? 'TPV 30d' : 'TPV Mês'

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
    .filter(c => {
      const t = c.tpv_total ?? 0
      if (filterTpvTotal === '100k') return t >= 100_000
      if (filterTpvTotal === '500k') return t >= 500_000
      if (filterTpvTotal === '1m')   return t >= 1_000_000
      if (filterTpvTotal === '2m')   return t >= 2_000_000
      return true
    })
    .filter(c => {
      const p = c.previsao_faturamento ?? 0
      if (filterPrev === '5k')  return p >= 5_000
      if (filterPrev === '10k') return p >= 10_000
      if (filterPrev === '30k') return p >= 30_000
      if (filterPrev === '50k') return p >= 50_000
      return true
    })
    .filter(c => {
      if (filterPeriodo === 'todos') return true
      if (!c.ultima_venda) return false
      const venda = new Date(c.ultima_venda)
      if (filterPeriodo === 'mes') {
        const hoje = new Date()
        return venda.getFullYear() === hoje.getFullYear() && venda.getMonth() === hoje.getMonth()
      }
      if (filterPeriodo === '30d') {
        const limite = new Date(); limite.setDate(limite.getDate() - 30)
        return venda >= limite
      }
      return true
    })
    .sort((a, b) => {
      const d = sortDir === 'asc' ? 1 : -1
      if (sort === 'nome')      return d * a.nome.localeCompare(b.nome)
      if (sort === 'tpv')       return d * (getTpvPeriodo(a) - getTpvPeriodo(b))
      if (sort === 'tpv_total') return d * ((a.tpv_total ?? 0) - (b.tpv_total ?? 0))
      if (sort === 'pct')       return d * ((getPct(a) ?? -1) - (getPct(b) ?? -1))
      if (sort === 'prev')      return d * ((a.previsao_faturamento ?? 0) - (b.previsao_faturamento ?? 0))
      return d * (a.faturamento - b.faturamento)
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
              // Tier fixo por gerente
              const tier = GERENTE_TIER[gerenteNome(r.gerente)] ?? 'starter'
              const metaTier = tier === 'enterprise' ? GOALS.gc.enterprise : tier === 'growth' ? GOALS.gc.growth : GOALS.gc.starter
              const metaPct  = metaTier * 100
              const [pbg, pfg] = !pct ? ['transparent','var(--text2)']
                : pct >= metaPct ? ['#34C75918','#34C759']
                : pct >= metaPct * 0.7 ? ['#FF9F0A18','#FF9F0A']
                : ['#FF3B3018','#FF3B30']
              const active = filterCart === r.gerente
              const TIER_COLORS: Record<string, string> = { starter: '#07BA1C', growth: '#2BB9FF', enterprise: '#BF5AF2' }
              return (
                <div key={r.gerente} onClick={() => !gcNome && setFilterCart(active ? 'todas' : r.gerente)}
                  style={{ background: 'var(--bg-card)', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'border .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{gerenteNome(r.gerente)}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: `${TIER_COLORS[tier]}22`, color: TIER_COLORS[tier], textTransform: 'capitalize' }}>{tier}</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800 }}>{r.total}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>clientes</div>
                    </div>
                    {pct !== null && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ background: pbg, color: pfg, fontSize: 13, fontWeight: 800, padding: '4px 10px', borderRadius: 20, display: 'block' }}>
                          {Math.min(pct, 999).toFixed(1)}%
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3, display: 'block' }}>meta {metaPct.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                  {/* Barra de progresso em relação à meta */}
                  {pct !== null && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ height: 6, background: 'var(--bg-card2)', borderRadius: 20, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pfg, borderRadius: 20, transition: 'width .4s' }} />
                        {/* Marcador da meta */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${metaPct}%`, width: 2, background: 'var(--text2)', opacity: 0.5 }} />
                      </div>
                    </div>
                  )}
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

          {/* Período */}
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
          {([
            { v: 'todos', label: 'Todos os períodos' },
            { v: 'mes',   label: 'Mês atual'         },
            { v: '30d',   label: 'Últimos 30 dias'   },
          ] as const).map(({ v, label }) => (
            <button key={v} onClick={() => setFilterPeriodo(v)} style={{
              padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              border: `1px solid ${filterPeriodo === v ? '#F59E0B' : 'var(--border)'}`,
              background: filterPeriodo === v ? '#F59E0B' : 'transparent',
              color: filterPeriodo === v ? '#000' : 'var(--text2)',
              transition: 'all .15s',
            }}>{label}</button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                style={{ ...inp, paddingLeft: 30, width: 180 }} />
            </div>
            <select value={filterTpvTotal} onChange={e => setFilterTpvTotal(e.target.value as any)} style={{ ...inp, cursor: 'pointer', color: filterTpvTotal !== 'todos' ? '#F59E0B' : undefined, fontWeight: filterTpvTotal !== 'todos' ? 700 : undefined }}>
              <option value="todos">TPV Total: Todos</option>
              <option value="100k">TPV Total ≥ R$ 100k</option>
              <option value="500k">TPV Total ≥ R$ 500k</option>
              <option value="1m">TPV Total ≥ R$ 1M</option>
              <option value="2m">TPV Total ≥ R$ 2M</option>
            </select>
            <select value={filterPrev} onChange={e => setFilterPrev(e.target.value as any)} style={{ ...inp, cursor: 'pointer', color: filterPrev !== 'todos' ? '#BF5AF2' : undefined, fontWeight: filterPrev !== 'todos' ? 700 : undefined }}>
              <option value="todos">Prev. Fat.: Todos</option>
              <option value="5k">Prev. Fat. ≥ R$ 5k</option>
              <option value="10k">Prev. Fat. ≥ R$ 10k</option>
              <option value="30k">Prev. Fat. ≥ R$ 30k</option>
              <option value="50k">Prev. Fat. ≥ R$ 50k</option>
            </select>
            {/* Botão export CSV */}
            {!isLoading && filtered.length > 0 && (
              <button onClick={exportCsv} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-card)', color: 'var(--text2)', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                <Download size={13} />
                Exportar CSV ({filtered.length})
              </button>
            )}

            {/* Botão Atualizar Tag */}
            {!isLoading && filtered.length > 0 && (
              <button onClick={() => { setModalTags(true); setTagsStats(null); setTagsResults([]); setTagsError(null) }} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: '1px solid #FF9F0A',
                background: 'color-mix(in srgb, #FF9F0A 12%, var(--bg-card))',
                color: '#FF9F0A', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                <Tag size={13} />
                Atualizar Tag ({filtered.length})
              </button>
            )}

            {/* Botão Sincronizar CRM */}
            {!isLoading && isAdmin && clientes.length > 0 && (
              <button onClick={() => { setModalSync(true); setSyncStats(null); setSyncResults([]); setSyncError(null) }} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: '1px solid #BF5AF2',
                background: 'color-mix(in srgb, #BF5AF2 12%, var(--bg-card))',
                color: '#BF5AF2', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                <Database size={13} />
                Sincronizar CRM
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
                    { label: 'Cliente',     align: 'left',   col: 'nome'      },
                    { label: 'Contato',     align: 'left',   col: null        },
                    { label: 'Gerente',     align: 'left',   col: null        },
                    { label: 'TPV Total',   align: 'right',  col: 'tpv_total' },
                    { label: 'Prev. Fat.',  align: 'right',  col: 'prev'      },
                    { label: tpvColLabel,   align: 'right',  col: 'tpv'       },
                    { label: '% Atingido',  align: 'center', col: 'pct'       },
                    { label: 'Últ. Venda',  align: 'left',   col: null        },
                    { label: '',            align: 'left',   col: null        },
                  ].map(h => (
                    <th key={h.label} onClick={h.col ? () => toggleSort(h.col as typeof sort) : undefined}
                      style={{ padding: '11px 16px', textAlign: h.align as any,
                        fontSize: 11, fontWeight: 700, color: h.col && sort === h.col ? 'var(--text)' : 'var(--text2)',
                        textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                        cursor: h.col ? 'pointer' : 'default', userSelect: 'none' }}>
                      {h.label}{h.col && sort === h.col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
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
                        {gerenteNome(c.gerente)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#F59E0B', fontWeight: 700, fontSize: 13 }}>
                      {c.tpv_total ? BRL(c.tpv_total) : <span style={{ color: 'var(--text2)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#BF5AF2', fontWeight: 700, fontSize: 13 }}>
                      {c.previsao_faturamento > 0 ? BRL(c.previsao_faturamento) : <span style={{ color: 'var(--text2)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#34C759', fontWeight: 700, fontSize: 13 }}>
                      {getTpvPeriodo(c) > 0 ? BRL(getTpvPeriodo(c)) : <span style={{ color: 'var(--text2)' }}>—</span>}
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

      {/* ── Modal: Sincronizar CRM DataCrazy ── */}
      {modalSync && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 200 }}
            onClick={() => { if (!syncLoading) setModalSync(false) }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 201, width: 'min(760px, 94vw)', maxHeight: '82vh',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20,
            boxShadow: '0 24px 80px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column',
            animation: 'scaleIn .22s cubic-bezier(.34,1.56,.64,1)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10,
                  background: 'color-mix(in srgb,#BF5AF2 18%,var(--bg-card2))',
                  border: '1px solid #BF5AF240', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={18} color="#BF5AF2" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>Sincronizar Carteira → DataCrazy</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
                    Cria negócios nos pipelines GC Starter · GC Growth · GC Enterprise
                  </div>
                </div>
              </div>
              {!syncLoading && (
                <button onClick={() => setModalSync(false)} style={{
                  background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '4px 10px', fontSize: 18, cursor: 'pointer', color: 'var(--text2)',
                  lineHeight: 1, fontFamily: 'inherit' }}>×</button>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Seleção de escopo + info pré-sync */}
              {!syncLoading && !syncStats && !syncError && (
                <>
                  {/* Mapeamento GC */}
                  <div style={{ background: 'color-mix(in srgb,#BF5AF2 7%,var(--bg-card2))',
                    border: '1px solid color-mix(in srgb,#BF5AF2 25%,var(--border))',
                    borderRadius: 12, padding: '14px 16px', fontSize: 13, lineHeight: 1.65 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: '#BF5AF2' }}>Pipeline por gerente:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { label: 'Carlos Eduardo', tier: 'GC Starter',    color: '#07BA1C' },
                        { label: 'Gabriel Bairros', tier: 'GC Growth',    color: '#2BB9FF' },
                        { label: 'Rafael Mendes',   tier: 'GC Enterprise', color: '#BF5AF2' },
                      ].map(g => (
                        <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 20,
                          background: `color-mix(in srgb,${g.color} 10%,var(--bg-card2))`,
                          border: `1px solid color-mix(in srgb,${g.color} 35%,transparent)` }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{g.label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text2)' }}>→</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: g.color }}>{g.tier}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                      • Lead buscado por e-mail → fallback telefone → criado se não existir<br/>
                      • Tag GC adicionada ao lead &nbsp;•&nbsp; Negócio criado no pipeline correto (sem duplicar)
                    </div>
                  </div>

                  {/* Escopo */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { v: 'todos', label: `Toda a carteira (${clientes.length} clientes)` },
                      { v: 'filtrado', label: `Apenas filtro atual (${filtered.length} clientes)` },
                    ].map(({ v, label }) => (
                      <button key={v} onClick={() => setSyncScope(v as any)} style={{
                        flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                        border: `1.5px solid ${syncScope === v ? '#BF5AF2' : 'var(--border)'}`,
                        background: syncScope === v ? 'color-mix(in srgb,#BF5AF2 10%,var(--bg-card2))' : 'var(--bg-card2)',
                        color: syncScope === v ? '#BF5AF2' : 'var(--text2)',
                        transition: 'all .15s',
                      }}>{label}</button>
                    ))}
                  </div>
                </>
              )}

              {/* Loading */}
              {syncLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '28px 0' }}>
                  <Loader2 size={38} style={{ animation: 'spin 1s linear infinite', color: '#BF5AF2' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      Lote {syncProgress.batch} de {syncProgress.batches}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {syncProgress.done} de {syncProgress.total} clientes processados
                    </div>
                  </div>
                  {/* Barra de progresso */}
                  <div style={{ width: '100%', maxWidth: 360 }}>
                    <div style={{ height: 8, background: 'var(--bg-card2)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{
                        height: '100%', borderRadius: 99, transition: 'width .4s ease',
                        background: 'linear-gradient(90deg,#BF5AF2,#9B59B2)',
                        width: syncProgress.total > 0 ? `${Math.round(syncProgress.done / syncProgress.total * 100)}%` : '0%',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text2)' }}>
                      <span>{syncProgress.total > 0 ? Math.round(syncProgress.done / syncProgress.total * 100) : 0}%</span>
                      <span>Não feche esta janela</span>
                    </div>
                  </div>
                  {/* Resultados parciais em tempo real */}
                  {syncResults.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 16 }}>
                      <span style={{ color: '#34C759', fontWeight: 700 }}>✦ {syncResults.filter(r => r.bizAction === 'created').length} criados</span>
                      <span style={{ color: 'var(--action)', fontWeight: 700 }}>~ {syncResults.filter(r => r.bizAction === 'already_exists').length} existiam</span>
                      {syncResults.filter(r => r.status === 'error').length > 0 && (
                        <span style={{ color: 'var(--red)', fontWeight: 700 }}>✕ {syncResults.filter(r => r.status === 'error').length} erros</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Erro */}
              {syncError && (
                <div style={{ background: 'color-mix(in srgb,var(--red) 10%,var(--bg-card2))',
                  border: '1px solid color-mix(in srgb,var(--red) 35%,var(--border))',
                  borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                  ✕ {syncError}
                </div>
              )}

              {/* Stats */}
              {syncStats && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {syncStats.pipelinesFound && Object.keys(syncStats.pipelinesFound).length > 0 && (
                    <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        Pipelines mapeados:
                      </span>
                      {Object.entries(syncStats.pipelinesFound).map(([tier, name]) => {
                        const c = tier.includes('Starter') ? '#07BA1C' : tier.includes('Growth') ? '#2BB9FF' : '#BF5AF2'
                        return (
                          <span key={tier} style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20,
                            background: `color-mix(in srgb,${c} 15%,transparent)`, color: c, fontWeight: 700 }}>
                            {tier} → {name}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {([
                      { label: 'Total Carteira',    value: syncStats.total,        color: 'var(--text2)' },
                      { label: 'Negócios Criados',  value: syncStats.bizCreated,   color: '#34C759' },
                      { label: 'Já Existiam',        value: syncStats.bizExisting,  color: 'var(--action)' },
                      { label: 'Leads Criados',      value: syncStats.leadsCreated, color: 'var(--cyan)' },
                      { label: 'Erros',              value: syncStats.errors,       color: syncStats.errors > 0 ? 'var(--red)' : 'var(--text2)' },
                      { label: 'Starter / Growth / Enterprise', value: `${syncStats.starter} / ${syncStats.growth} / ${syncStats.enterprise}`, color: 'var(--text2)' },
                    ] as const).map(k => (
                      <div key={k.label} style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)',
                        borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3, fontWeight: 600 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alertas de pipeline não encontrado */}
              {syncStats?.pipelineErrors && syncStats.pipelineErrors.length > 0 && (
                <div style={{ background: 'color-mix(in srgb,var(--orange) 10%,var(--bg-card2))',
                  border: '1px solid color-mix(in srgb,var(--orange) 35%,var(--border))',
                  borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', marginBottom: 6 }}>⚠ Avisos de Pipeline</div>
                  {syncStats.pipelineErrors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>• {e}</div>
                  ))}
                </div>
              )}

              {/* Tabela de resultados + aba de erros */}
              {syncResults.length > 0 && (() => {
                const errRows   = syncResults.filter(r => r.status === 'error')
                const okRows    = syncResults.filter(r => r.status === 'ok')
                const skipRows  = syncResults.filter(r => r.status === 'skip')
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Aba de resultados OK */}
                    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ background: 'var(--bg-card2)', padding: '8px 14px', fontSize: 11,
                        fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em',
                        borderBottom: '1px solid var(--border)', display: 'flex', gap: 14 }}>
                        <span style={{ color: '#34C759' }}>✓ {okRows.length} OK</span>
                        <span>~ {syncResults.filter(r => r.bizAction === 'already_exists').length} já existiam</span>
                        <span style={{ color: 'var(--cyan)' }}>✦ {syncResults.filter(r => r.leadAction === 'created').length} leads criados</span>
                        {skipRows.length > 0 && <span style={{ color: 'var(--text2)' }}>{skipRows.length} ignorados</span>}
                      </div>
                      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-card2)', position: 'sticky', top: 0 }}>
                              {['Cliente', 'Gerente / Tier', 'Lead', 'Negócio / Stage', 'Tag'].map(col => (
                                <th key={col} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10,
                                  fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                                  letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {syncResults.filter(r => r.status !== 'error').map((r, i) => {
                              const tc = r.tier === 'GC Starter' ? '#07BA1C' : r.tier === 'GC Growth' ? '#2BB9FF' : r.tier === 'GC Enterprise' ? '#BF5AF2' : 'var(--text2)'
                              const LL: Record<string,string> = { created: '✦ Criado', found_email: '✓ Email', found_phone: '✓ Tel' }
                              const BL: Record<string,string> = { created: '✦ Criado', already_exists: '~ Existia' }
                              return (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: r.status === 'skip' ? 0.4 : 1 }}>
                                  <td style={{ padding: '8px 10px' }}>
                                    <div style={{ fontWeight: 600, fontSize: 12 }}>{r.client}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text2)' }}>{r.email}</div>
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.gerente}</div>
                                    {r.tier
                                      ? <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                                          background: `color-mix(in srgb,${tc} 14%,var(--bg-card2))`, color: tc }}>
                                          {r.tier.replace('GC ','')}
                                        </span>
                                      : <span style={{ fontSize: 10, color: 'var(--text2)' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontWeight: 600,
                                    color: r.leadAction === 'created' ? 'var(--cyan)' : '#34C759' }}>
                                    {r.leadAction ? (LL[r.leadAction] ?? r.leadAction) : '—'}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span style={{ fontWeight: 600,
                                      color: r.bizAction === 'created' ? '#34C759' : r.bizAction === 'already_exists' ? 'var(--action)' : 'var(--text2)' }}>
                                      {r.bizAction ? (BL[r.bizAction] ?? r.bizAction) : '—'}
                                    </span>
                                    {r.bizStage && <div style={{ fontSize: 10, color: 'var(--text2)' }}>{r.bizStage}</div>}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontSize: 11,
                                    color: r.tagAdded ? tc : 'var(--text2)' }}>
                                    {r.tagAdded ? r.tagAdded.replace('GC ','') : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Relatório de erros */}
                    {errRows.length > 0 && (
                      <div style={{ border: '1px solid color-mix(in srgb,var(--red) 40%,var(--border))',
                        borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ background: 'color-mix(in srgb,var(--red) 8%,var(--bg-card2))',
                          padding: '10px 14px', borderBottom: '1px solid color-mix(in srgb,var(--red) 30%,var(--border))',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                            ✕ Relatório de Erros — {errRows.length} cliente{errRows.length > 1 ? 's' : ''}
                          </span>
                          <button
                            onClick={() => {
                              const txt = errRows.map(r => `${r.client} <${r.email}> [${r.tier ?? 'sem tier'}]\n  → ${r.error}`).join('\n\n')
                              navigator.clipboard.writeText(txt).catch(() => {})
                              toast('Erros copiados!', 'success')
                            }}
                            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6,
                              border: '1px solid color-mix(in srgb,var(--red) 40%,var(--border))',
                              background: 'transparent', color: 'var(--red)', cursor: 'pointer',
                              fontFamily: 'inherit', fontWeight: 600 }}>
                            Copiar
                          </button>
                        </div>
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          {errRows.map((r, i) => {
                            const tc = r.tier === 'GC Starter' ? '#07BA1C' : r.tier === 'GC Growth' ? '#2BB9FF' : r.tier === 'GC Enterprise' ? '#BF5AF2' : 'var(--text2)'
                            return (
                              <div key={i} style={{ padding: '12px 14px',
                                borderBottom: i < errRows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                      <span style={{ fontWeight: 700, fontSize: 13 }}>{r.client}</span>
                                      {r.tier && (
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                                          background: `color-mix(in srgb,${tc} 14%,var(--bg-card2))`, color: tc }}>
                                          {r.tier.replace('GC ','')}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>{r.email} · {r.gerente}</div>
                                    <div style={{ fontSize: 12, color: 'var(--red)',
                                      background: 'color-mix(in srgb,var(--red) 6%,var(--bg-card2))',
                                      border: '1px solid color-mix(in srgb,var(--red) 20%,var(--border))',
                                      borderRadius: 8, padding: '7px 10px',
                                      fontFamily: 'monospace', lineHeight: 1.5, wordBreak: 'break-all' }}>
                                      {r.error}
                                    </div>
                                    {r.steps && r.steps.length > 0 && (
                                      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
                                        Passos: {r.steps.join(' · ')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              {!syncLoading && (
                <button onClick={() => setModalSync(false)} style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-card2)', color: 'var(--text)', fontSize: 14,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Fechar
                </button>
              )}
              <button onClick={runSyncCRM} disabled={syncLoading} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 22px', borderRadius: 8,
                border: 'none',
                background: syncLoading ? 'var(--border)' : 'linear-gradient(135deg,#BF5AF2,#9B59B2)',
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: syncLoading ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: syncLoading ? 0.7 : 1 }}>
                {syncLoading
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sincronizando…</>
                  : <><Database size={14} /> {syncStats ? 'Sincronizar Novamente' : `Iniciar · ${syncScope === 'todos' ? clientes.length : filtered.length} clientes`}</>}
              </button>
            </div>
          </div>
          <style>{`@keyframes scaleIn{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </>
      )}

      {/* Modal Atualizar Tag */}
      {modalTags && (
        <div style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget && !tagsLoading) setModalTags(false) }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb,#FF9F0A 20%,var(--bg-card2))', border: '1px solid color-mix(in srgb,#FF9F0A 40%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Tag size={17} color="#FF9F0A" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Atualizar Tag → DataCrazy</h2>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>Atualiza tag de status conforme % atingido de cada cliente</p>
                </div>
              </div>
              {!tagsLoading && <button onClick={() => setModalTags(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 20, padding: 4 }}>×</button>}
            </div>

            {/* Preview das tags */}
            {!tagsStats && !tagsLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
                  Serão atualizadas as tags de <strong style={{ color: 'var(--text)' }}>{filtered.length} clientes</strong> com base no % atingido atual:
                </p>
                {([
                  { label: 'Dentro da Meta',  range: '≥ 80%',    color: '#34C759', count: filtered.filter(c => { const p = getPct(c); return p !== null && p >= 80 }).length },
                  { label: 'Próximo da Meta', range: '50–79%',   color: '#FF9F0A', count: filtered.filter(c => { const p = getPct(c); return p !== null && p >= 50 && p < 80 }).length },
                  { label: 'Possível Churn',  range: '20–49%',   color: '#FF6B35', count: filtered.filter(c => { const p = getPct(c); return p !== null && p >= 20 && p < 50 }).length },
                  { label: 'Churn',           range: '< 20%',    color: '#FF3B30', count: filtered.filter(c => { const p = getPct(c); return p === null || p < 20 }).length },
                ] as const).map(({ label, range, color, count }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-card2)', border: `1px solid color-mix(in srgb,${color} 25%,var(--border))` }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color }}>{label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 4 }}>{range}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 14, color }}>{count}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => setModalTags(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button onClick={runUpdateTags} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#FF9F0A', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={13} /> Atualizar {filtered.length} clientes
                  </button>
                </div>
              </div>
            )}

            {/* Progress */}
            {tagsLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
                  Lote {tagsProgress.batch} de {tagsProgress.batches} — {tagsProgress.done} de {tagsProgress.total} clientes
                </div>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-card2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, background: '#FF9F0A', transition: 'width .3s',
                    width: tagsProgress.total ? `${Math.round(tagsProgress.done / tagsProgress.total * 100)}%` : '0%' }} />
                </div>
                {tagsStats && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}>
                    ✓ {tagsStats.ok} atualizados · ✕ {tagsStats.errors} erros
                  </div>
                )}
              </div>
            )}

            {/* Erro geral */}
            {tagsError && (
              <div style={{ background: 'color-mix(in srgb,var(--red) 10%,var(--bg-card2))', border: '1px solid color-mix(in srgb,var(--red) 35%,var(--border))', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                ✕ {tagsError}
              </div>
            )}

            {/* Stats finais */}
            {tagsStats && !tagsLoading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {([
                  { label: 'Dentro da Meta',  value: tagsStats.dentroMeta,    color: '#34C759' },
                  { label: 'Próximo da Meta', value: tagsStats.proximoMeta,   color: '#FF9F0A' },
                  { label: 'Possível Churn',  value: tagsStats.possivelChurn, color: '#FF6B35' },
                  { label: 'Churn',           value: tagsStats.churn,         color: '#FF3B30' },
                ] as const).map(k => (
                  <div key={k.label} style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2, fontWeight: 600 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabela de resultados */}
            {tagsResults.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ background: 'var(--bg-card2)', padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14 }}>
                  <span style={{ color: '#34C759' }}>✓ {tagsResults.filter(r => r.status === 'ok').length} atualizados</span>
                  {tagsResults.filter(r => r.status === 'error').length > 0 && <span style={{ color: 'var(--red)' }}>✕ {tagsResults.filter(r => r.status === 'error').length} erros</span>}
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {tagsResults.map((r, i) => {
                        const tc = r.newTag === 'Dentro da Meta' ? '#34C759' : r.newTag === 'Próximo da Meta' ? '#FF9F0A' : r.newTag === 'Possível Churn' ? '#FF6B35' : '#FF3B30'
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: r.status === 'error' ? 0.7 : 1, background: r.status === 'error' ? 'color-mix(in srgb,var(--red) 4%,transparent)' : 'transparent' }}>
                            <td style={{ padding: '7px 10px' }}>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{r.client}</div>
                              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{r.email}</div>
                            </td>
                            <td style={{ padding: '7px 10px' }}>
                              {r.status === 'ok'
                                ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `color-mix(in srgb,${tc} 14%,transparent)`, color: tc }}>{r.newTag}</span>
                                : <span style={{ fontSize: 11, color: 'var(--red)' }}>✕ {r.error}</span>}
                            </td>
                            <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text2)', textAlign: 'right' }}>
                              {r.pct !== null && r.pct !== undefined ? `${(r.pct as number).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Botões após conclusão */}
            {tagsStats && !tagsLoading && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setModalTags(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
                  Fechar
                </button>
                <button onClick={runUpdateTags} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#FF9F0A', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={13} /> Atualizar Novamente
                </button>
              </div>
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
