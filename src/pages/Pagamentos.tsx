import { useEffect, useState, useMemo, createContext, useContext } from 'react'
import { Header } from '../../components/Header'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '../../components/ui/Toast'
import { getMbDailyTpv, getMbTpvPorAtivacao } from '@/lib/mbCache'
import { RefreshCw, TrendingUp, DollarSign, Users, Zap, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, addDays } from 'date-fns'

// ── Contexto para ocultar valores salariais ───────────────────────────────────
const HideCtx = createContext(false)
// Componente que mostra valor monetário ou ••••• se hideValues = true
function MVal({ v, style }: { v: number; style?: React.CSSProperties }) {
  const hide = useContext(HideCtx)
  return hide
    ? <span style={{ filter: 'blur(7px)', userSelect: 'none', ...style }}>R$●●●●</span>
    : <span style={style}>{BRL(v)}</span>
}
// ── Dados do Plano de Carreira ────────────────────────────────────────────────
const NIVEL_LABELS = ['JR 1','JR 2','JR 3','PL 1','PL 2','PL 3','SN 1','SN 2','SN 3']

const FIXO: Record<string, number[]> = {
  sdr:    [3500, 3800, 4100, 4500, 5000, 5500, 6000, 6500, 7000],
  closer: [3500, 3700, 3900, 4200, 5100, 6000, 6500, 7000, 7500],
  gc:     [3500, 4000, 4500, 5500, 6500, 7500, 8000, 9000, 11000],
}
const VAR_TETO: Record<string, number[]> = {
  sdr:    [ 980, 1088, 1200, 1395, 1600, 1815, 2040, 2275, 2520],
  closer: [2500, 3000, 3500, 4000, 4800, 5500, 6500, 7500, 8500],
  gc:     [2000, 2500, 3000, 4000, 5000, 6000, 6500, 7500, 9000],
}

// SDR: R$ por reunião realizada
const SDR_RATE        = [3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.0, 6.5, 7.0]
const SDR_META_AGEND  = [140, 145, 150, 155, 160, 165, 170, 175, 180]
const SDR_META_SHOWUP = [ 70,  73,  75,  78,  80,  82,  84,  86,  88]

// Closer: R$ por cliente que fatura acima do gatilho (verificado via tpv_cache)
// JR 1-3 → gatilho R$10k; PL 1-3 → R$20k; SN 1-3 → R$30k
const CLOSER_RATE      = [50, 60, 70, 80, 90, 100, 110, 120, 140]
const CLOSER_THRESHOLD = [10_000, 10_000, 10_000, 20_000, 20_000, 20_000, 30_000, 30_000, 30_000]
const CLOSER_THRESHOLD_LABEL = ['R$10k','R$10k','R$10k','R$20k','R$20k','R$20k','R$30k','R$30k','R$30k']

// GC: taxa × GMV acima da meta de manutenção da carteira
const GC_RATE     = [0.0015, 0.0018, 0.0020, 0.0022, 0.0025, 0.0028, 0.0030, 0.0033, 0.0035]
const GC_RATE_PCT = ['0,15%','0,18%','0,20%','0,22%','0,25%','0,28%','0,30%','0,33%','0,35%']
// Metabase account_manager_ids
const GC_AM_ID: Record<string, number> = { 'Gabriel Bairros': 5726885, 'Rafael Mendes': 4204072 }

// ── Configuração do time ──────────────────────────────────────────────────────
interface TeamMember {
  display: string
  role: 'sdr' | 'closer' | 'gc'
  nivelIdx: number
  nameMatch: string
  sdrNomeNull?: boolean   // Geovana: conta calls onde sdr_nome IS NULL
  // GC: carteira de referência e % de manutenção
  portfolioGmv?: number
  maintenancePct?: number
}

const TEAM: TeamMember[] = [
  // ── SDR ──────────────────────────────────────────────────────────────────
  { display: 'Carlos Eduardo', role: 'sdr',    nivelIdx: 0, nameMatch: 'Carlos Eduardo' },
  { display: 'Geovana Paiva',  role: 'sdr',    nivelIdx: 0, nameMatch: 'Geovana', sdrNomeNull: true },
  // ── Closer ───────────────────────────────────────────────────────────────
  { display: 'Victor Vieira',  role: 'closer', nivelIdx: 0, nameMatch: 'Victor Vieira' },
  { display: 'Isaac Marba',    role: 'closer', nivelIdx: 5, nameMatch: 'Isaac'  },
  { display: 'Wilson Neto',    role: 'closer', nivelIdx: 6, nameMatch: 'Wilson Neto' },
  // ── GC ───────────────────────────────────────────────────────────────────
  // portfolioGmv = GMV total da carteira estabelecida
  // maintenancePct = % mínimo que precisa manter para ganhar variável
  { display: 'Gabriel Bairros', role: 'gc', nivelIdx: 0, nameMatch: 'Gabriel',
    portfolioGmv: 8_642_000.00, maintenancePct: 0.85 },
  { display: 'Rafael Mendes',   role: 'gc', nivelIdx: 6, nameMatch: 'Rafael',
    portfolioGmv: 8_709_502.23, maintenancePct: 0.90 },
]

const ROLE_COLOR: Record<string, string> = { sdr: '#1DBF88', closer: '#7F77DD', gc: '#E07038' }
const ROLE_BG:    Record<string, string> = { sdr: 'rgba(29,191,136,.1)', closer: 'rgba(127,119,221,.1)', gc: 'rgba(224,112,56,.1)' }

// ── Helpers ───────────────────────────────────────────────────────────────────
const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const BRL2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const PCT2 = (v: number) => `${v.toFixed(1)}%`
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
function monthLabelShort(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MESES_CURTO[m - 1]}/${y}`
}
function monthRange(ym: string): [string, string] {
  const d = parseISO(ym + '-01')
  return [format(startOfMonth(d), 'yyyy-MM-dd'), format(endOfMonth(d), 'yyyy-MM-dd')]
}
function prevMonth(ym: string) { return format(subMonths(parseISO(ym + '-01'), 1), 'yyyy-MM') }
function nextMonthStr(ym: string) { return format(addMonths(parseISO(ym + '-01'), 1), 'yyyy-MM') }
function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max) }
function pctOf(val: number, total: number) { return total > 0 ? clamp((val / total) * 100, 0, 100) : 0 }

function ProgressBar({ pct, color, height = 5 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: 'var(--bg-card2)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${clamp(pct, 0, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s ease' }} />
    </div>
  )
}

// ── Interfaces de dados ───────────────────────────────────────────────────────
interface CacheRow {
  id: number; ativacao_id: string; cliente_email: string
  closer_email: string | null; sdr_email: string | null
  time_id: string | null; data_fechamento: string
  tpv_30_dias: number; tpv_7_dias: number
  gatilho_roleta: boolean; bonus_closer: number; bonus_sdr: number
}
interface DbCall {
  sdr_nome: string | null; status: string; date: string
  title: string | null; client_email: string | null; time: string | null; ativado: boolean | null
}
interface DbUser       { id: string; name: string; email: string }
// inclui id para join exato com tpv_cache.ativacao_id (TPV de data_ativação até +30 dias)
interface DbActivation { id: string; responsible: string; date: string; email: string | null; client: string | null }

// ── Componente principal ──────────────────────────────────────────────────────
export default function Pagamentos() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  return <PagamentosContent />
}

function PagamentosContent() {
  const toast = useToast()
  const { user } = useAuth()
  // Admins e Sócios veem todos os cards; outros veem apenas o próprio
  const isAllAccess = hasAnyRole(user, ['Admin', 'Sócio'])

  const [tab, setTab]       = useState<'previa' | 'closers' | 'sdrs' | 'detalhes'>('previa')
  const [refMonth, setRefMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [hideValues, setHideValues] = useState(false)

  // ── state legado ──────────────────────────────────────────────────────────
  const [rows, setRows]           = useState<CacheRow[]>([])
  const [isLegLoading, setIsLegLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── state prévia ──────────────────────────────────────────────────────────
  const [previaLoading, setPreviaLoading] = useState(false)
  const [hasLoaded,     setHasLoaded]     = useState(false)
  // closerActivMonth = mês das ativações do closer (independente do refMonth de SDR/GC)
  const [closerActivMonth, setCloserActivMonth] = useState('2026-03')
  const [callsData,        setCallsData]        = useState<DbCall[]>([])
  const [activationsPrev,  setActivationsPrev]  = useState<DbActivation[]>([])
  // tpvByActId: activation_id → TPV live do Metabase (ativação → ativação+30d)
  const [tpvByActId,       setTpvByActId]        = useState<Record<string, number>>({})
  const [usersData,        setUsersData]         = useState<DbUser[]>([])
  const [gcGmv,            setGcGmv]             = useState<Record<string, number>>({})

  async function loadPrevia() {
    setPreviaLoading(true)
    const [start, end] = monthRange(refMonth)
    // Ativações do closer: usa closerActivMonth (independente do refMonth)
    const [actStart, actEnd] = monthRange(closerActivMonth)

    // Busca em paralelo: calls (refMonth), ativações (closerActivMonth), users
    const [
      { data: usrs },
      { data: callsRaw },
      { data: actRaw },
    ] = await Promise.all([
      supabase.from('users').select('id,name,email').order('name'),
      supabase.from('calls').select('sdr_nome,status,date,title,client_email,time,ativado').gte('date', start).lte('date', end),
      // Inclui 'id' para join exato com Metabase (activation_id → tpv da janela)
      supabase.from('activations').select('id,responsible,date,email,client').gte('date', actStart).lte('date', actEnd),
    ])

    const activacoesList = (actRaw || []) as DbActivation[]
    setUsersData((usrs || []) as DbUser[])
    setCallsData((callsRaw || []) as DbCall[])
    setActivationsPrev(activacoesList)

    // Busca TPV do Metabase para cada ativação: janela = data_ativação → data_ativação + 29 dias
    // (ex.: ativado 18/03 → conta de 18/03 até 16/04 inclusive = 30 dias corridos)
    const tpvInputs = activacoesList
      .filter(a => a.email)
      .map(a => ({
        id:    a.id,
        email: a.email!,
        start: a.date,
        end:   format(addDays(parseISO(a.date), 29), 'yyyy-MM-dd'),
      }))
    const mbTpv = tpvInputs.length > 0 ? await getMbTpvPorAtivacao(tpvInputs) : {}
    setTpvByActId(mbTpv)

    // Busca GMV Metabase para cada GC
    const gcEntries = TEAM.filter(m => m.role === 'gc')
    const gmvMap: Record<string, number> = {}
    await Promise.all(gcEntries.map(async m => {
      const amId = GC_AM_ID[m.display]
      if (!amId) return
      const daily = await getMbDailyTpv(refMonth, [amId])
      if (!daily) return
      const [y, mo] = refMonth.split('-').map(Number)
      const dias = new Date(y, mo, 0).getDate()
      let total = 0
      for (let i = 1; i <= dias; i++) {
        const ds = `${refMonth}-${String(i).padStart(2, '0')}`
        total += Number((daily as Record<string, unknown>)[ds] ?? 0)
      }
      gmvMap[m.display] = total
    }))
    setGcGmv(gmvMap)
    setHasLoaded(true)
    setPreviaLoading(false)
  }

  // ── Carrega legado ────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'previa') loadLegacy()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function loadLegacy() {
    setIsLegLoading(true)
    const { data } = await supabase.from('tpv_cache').select('*').order('data_fechamento', { ascending: false })
    setRows((data || []) as CacheRow[])
    setIsLegLoading(false)
  }

  async function recalcular() {
    setIsRefreshing(true)
    toast('Recalculando TPV...', 'success')
    try {
      await supabase.functions.invoke('calcular-tpv', { body: { limite: 100 } })
      await loadLegacy()
      toast('TPV atualizado!', 'success')
    } catch { toast('Erro ao recalcular TPV', 'error') }
    setIsRefreshing(false)
  }

  const nameByEmail = (email: string | null) => {
    if (!email) return '—'
    return usersData.find(u => u.email === email)?.name || email
  }

  // ── Totais legado ─────────────────────────────────────────────────────────
  const totalTPV30    = rows.reduce((s, r) => s + Number(r.tpv_30_dias), 0)
  const totalBonus    = rows.reduce((s, r) => s + Number(r.bonus_closer) + Number(r.bonus_sdr), 0)
  const totalGatilhos = rows.filter(r => r.gatilho_roleta).length
  const closerMap = new Map<string, { email: string; name: string; clientes: number; tpv_total: number; bonus_total: number; gatilhos: number }>()
  rows.forEach(r => {
    const email = r.closer_email || 'sem-closer'
    if (!closerMap.has(email)) closerMap.set(email, { email, name: nameByEmail(r.closer_email), clientes: 0, tpv_total: 0, bonus_total: 0, gatilhos: 0 })
    const s = closerMap.get(email)!
    s.clientes++; s.tpv_total += Number(r.tpv_30_dias); s.bonus_total += Number(r.bonus_closer)
    if (r.gatilho_roleta) s.gatilhos++
  })
  const closers = [...closerMap.values()].sort((a, b) => b.tpv_total - a.tpv_total)

  const sdrMap = new Map<string, { email: string; name: string; clientes: number; tpv_total: number; bonus_total: number }>()
  rows.forEach(r => {
    const email = r.sdr_email || 'sem-sdr'
    if (!sdrMap.has(email)) sdrMap.set(email, { email, name: nameByEmail(r.sdr_email), clientes: 0, tpv_total: 0, bonus_total: 0 })
    const s = sdrMap.get(email)!
    s.clientes++; s.tpv_total += Number(r.tpv_30_dias); s.bonus_total += Number(r.bonus_sdr)
  })
  const sdrs = [...sdrMap.values()].sort((a, b) => b.tpv_total - a.tpv_total)

  // ── Cálculos da prévia ────────────────────────────────────────────────────
  const previaCalc = useMemo(() => {
    return TEAM.map(m => {
      const fixo  = FIXO[m.role][m.nivelIdx]
      const teto  = VAR_TETO[m.role][m.nivelIdx]
      const nivel = NIVEL_LABELS[m.nivelIdx]
      const cor   = ROLE_COLOR[m.role]

      // ── SDR ──────────────────────────────────────────────────────────────
      if (m.role === 'sdr') {
        const callsAll = callsData.filter(c => {
          if (m.sdrNomeNull)
            return !c.sdr_nome || c.sdr_nome.toLowerCase().includes(m.nameMatch.toLowerCase())
          return c.sdr_nome?.toLowerCase().includes(m.nameMatch.toLowerCase())
        })
        const agendadas  = callsAll.length
        const realizadas = callsAll.filter(c => c.status === 'Realizada' || c.status === 'Ativado').length
        const showupPct  = agendadas > 0 ? Math.round((realizadas / agendadas) * 100) : 0
        const variavel   = Math.min(realizadas * SDR_RATE[m.nivelIdx], teto)
        const callsSorted = [...callsAll].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
        return {
          ...m, fixo, teto, nivel, cor, variavel, total: fixo + variavel,
          sdr: { agendadas, realizadas, showupPct,
            metaAgend: SDR_META_AGEND[m.nivelIdx], metaShowup: SDR_META_SHOWUP[m.nivelIdx],
            rate: SDR_RATE[m.nivelIdx],
            calls: callsSorted },
        }
      }

      // ── Closer ────────────────────────────────────────────────────────────
      if (m.role === 'closer') {
        // 1. Encontra o user pelo nome
        const userObj = usersData.find(u => u.name.toLowerCase().includes(m.nameMatch.toLowerCase()))
        const userId  = userObj?.id ?? ''

        // 2. Filtra ativações do mês anterior feitas POR este closer
        const activacoes = activationsPrev.filter(a => a.responsible === userId)

        // 3. TPV live do Metabase por activation_id → janela exata (ativação → +29 dias)
        //    null = email não encontrado no Metabase (mostra "aguardando")
        //    0   = encontrado mas sem vendas na janela (mostra R$0, não qualifica)
        const clienteDetalhes = activacoes.map(a => {
          const email      = a.email || ''
          const dataInicio = format(parseISO(a.date), 'dd/MM/yyyy')
          const dataFim    = format(addDays(parseISO(a.date), 29), 'dd/MM/yyyy')
          const tpv30      = a.id in tpvByActId ? tpvByActId[a.id] : null
          const tem_tpv    = tpv30 !== null
          const qualifica  = tem_tpv && tpv30! >= CLOSER_THRESHOLD[m.nivelIdx]
          return { email, nome: a.client ?? email, tpv30, tem_tpv, qualifica, dataInicio, dataFim }
        })

        const threshold    = CLOSER_THRESHOLD[m.nivelIdx]
        const totalAtiv    = activacoes.length
        const comTpv       = clienteDetalhes.filter(c => c.tem_tpv).length
        const qualificados = clienteDetalhes.filter(c => c.qualifica).length
        const variavel     = Math.min(qualificados * CLOSER_RATE[m.nivelIdx], teto)

        return {
          ...m, fixo, teto, nivel, cor, variavel, total: fixo + variavel,
          closer: {
            userId, email: userObj?.email ?? '',
            threshold, thresholdLabel: CLOSER_THRESHOLD_LABEL[m.nivelIdx],
            totalAtiv, comTpv, qualificados,
            rate: CLOSER_RATE[m.nivelIdx],
            clientes: clienteDetalhes,
          },
        }
      }

      // ── GC ────────────────────────────────────────────────────────────────
      // Variável = taxa × GMV ACIMA da meta de manutenção da carteira
      // Se GMV atual < (carteira × maintenancePct) → variável = 0
      // Se GMV atual > threshold → variável = taxa × (GMV - threshold)
      const gmvAtual       = gcGmv[m.display] ?? 0
      const portfolioGmv   = m.portfolioGmv   ?? 0
      const maintenancePct = m.maintenancePct  ?? 0.85
      const threshold      = portfolioGmv * maintenancePct
      const newGmv         = Math.max(0, gmvAtual - threshold)
      const hitTarget      = gmvAtual >= threshold
      const variavel       = hitTarget ? Math.min(newGmv * GC_RATE[m.nivelIdx], teto) : 0

      return {
        ...m, fixo, teto, nivel, cor, variavel, total: fixo + variavel,
        gc: {
          gmvAtual, portfolioGmv, maintenancePct, threshold, newGmv, hitTarget,
          rate: GC_RATE_PCT[m.nivelIdx],
        },
      }
    })
  }, [callsData, activationsPrev, tpvByActId, usersData, gcGmv])

  // Filtra cards visíveis por permissão
  const visibleCalc = isAllAccess
    ? previaCalc
    : previaCalc.filter(m => user?.name?.toLowerCase().includes(m.nameMatch.toLowerCase()))

  const totalFixo  = visibleCalc.reduce((s, m) => s + m.fixo, 0)
  const totalVar   = visibleCalc.reduce((s, m) => s + m.variavel, 0)
  const totalFolha = totalFixo + totalVar

  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} style={{
      padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      background: tab === t ? 'var(--action)' : 'var(--bg-card2)',
      color: tab === t ? '#fff' : 'var(--text2)', transition: 'all .15s',
    }}>{label}</button>
  )

  return (
    <HideCtx.Provider value={hideValues}>
      <Header />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div className="page-wrap" style={{ paddingTop: 88 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Pagamentos & TPV</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>Prévia pelo Plano de Carreira + histórico de bônus</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Botão ocultar salários */}
            <button onClick={() => setHideValues(h => !h)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${hideValues ? 'var(--action)' : 'var(--border)'}`,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              background: hideValues ? 'rgba(41,151,255,.1)' : 'var(--bg-card2)',
              color: hideValues ? 'var(--action)' : 'var(--text2)', transition: 'all .15s',
            }}>
              {hideValues ? <EyeOff size={15} /> : <Eye size={15} />}
              {hideValues ? 'Mostrar valores' : 'Ocultar valores'}
            </button>
            {tab !== 'previa' && (
              <button onClick={recalcular} disabled={isRefreshing} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
                border: 'none', cursor: 'pointer', background: 'var(--bg-card2)', color: 'var(--text2)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              }}>
                <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                Recalcular TPV
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {tabBtn('previa',   '📋 Prévia do Plano de Carreira')}
          {tabBtn('closers',  'Por Closer (legado)')}
          {tabBtn('sdrs',     'Por SDR (legado)')}
          {tabBtn('detalhes', 'Detalhes por Cliente')}
        </div>

        {/* ══ ABA PRÉVIA ══ */}
        {tab === 'previa' && (
          <>
            {/* Controles de período */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text2)', marginBottom: 12 }}>Período de referência</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>

                {/* SDR + GC: refMonth */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>📋 SDR (calls) · GC (GMV Metabase)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setRefMonth(prevMonth(refMonth))}
                      style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--text2)' }}>
                      <ChevronLeft size={14} />
                    </button>
                    <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '6px 16px', fontWeight: 700, fontSize: 13, minWidth: 140, textAlign: 'center' }}>
                      {monthLabel(refMonth)}
                    </div>
                    <button onClick={() => setRefMonth(nextMonthStr(refMonth))}
                      style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--text2)' }}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Closer: closerActivMonth */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>🎯 Closer — mês das ativações</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setCloserActivMonth(prevMonth(closerActivMonth))}
                      style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--text2)' }}>
                      <ChevronLeft size={14} />
                    </button>
                    <div style={{ background: 'rgba(127,119,221,.12)', border: '1px solid rgba(127,119,221,.35)', borderRadius: 8,
                      padding: '6px 16px', fontWeight: 700, fontSize: 13, minWidth: 140, textAlign: 'center', color: '#7F77DD' }}>
                      {monthLabel(closerActivMonth)}
                    </div>
                    <button onClick={() => setCloserActivMonth(nextMonthStr(closerActivMonth))}
                      style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--text2)' }}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
                    TPV: data de ativação → +30 dias (por ativação)
                  </div>
                </div>

                {/* Botão Atualizar */}
                <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                  <button onClick={loadPrevia} disabled={previaLoading} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9,
                    border: 'none', cursor: previaLoading ? 'not-allowed' : 'pointer',
                    background: 'var(--action)', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                    opacity: previaLoading ? 0.7 : 1,
                  }}>
                    <RefreshCw size={14} style={{ animation: previaLoading ? 'spin 1s linear infinite' : 'none' }} />
                    {previaLoading ? 'Carregando...' : 'Atualizar dados'}
                  </button>
                </div>
              </div>
            </div>

            {/* Estado inicial — aguardando clique em Atualizar */}
            {!hasLoaded && !previaLoading && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text2)' }}>
                <RefreshCw size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Nenhum dado carregado</div>
                <div style={{ fontSize: 13 }}>Selecione os períodos acima e clique em <strong>Atualizar dados</strong></div>
              </div>
            )}

            {/* Conteúdo — só aparece após primeiro carregamento */}
            {hasLoaded && (<>

            {/* Resumo da folha — só para Admin/Sócio */}
            {isAllAccess && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
                {[
                  { label: 'Total Fixo',     val: totalFixo,  icon: <DollarSign size={16} color="var(--text2)" />, color: 'var(--text)'    },
                  { label: 'Total Variável', val: totalVar,   icon: <TrendingUp  size={16} color="#34C759" />,     color: '#34C759'         },
                  { label: 'Folha Total',    val: totalFolha, icon: <Users       size={16} color="var(--action)"/>, color: 'var(--action)'  },
                ].map(c => (
                  <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      {c.icon}
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</span>
                    </div>
                    <MVal v={c.val} style={{ fontSize: 26, fontWeight: 800, color: c.color }} />
                  </div>
                ))}
              </div>
            )}

            {/* ── SDR ── */}
            {visibleCalc.some(m => m.role === 'sdr') && (<>
              <SectionHeader
                label="SDR"
                note={`Variável: reuniões realizadas com show-up confirmado em ${monthLabel(refMonth)} × taxa do nível`}
                color="#1DBF88" />
              {visibleCalc.filter(m => m.role === 'sdr').map(m => (
                <SdrCard key={m.display} m={m as SdrCalc} />
              ))}
            </>)}

            {/* ── Closer ── */}
            {visibleCalc.some(m => m.role === 'closer') && (<>
              <SectionHeader
                label="Closer"
                note={`Ativações de ${monthLabel(closerActivMonth)} · TPV medido da data de ativação até +30 dias por cliente · gatilho por nível (JR R$10k · PL R$20k · SN R$30k)`}
                color="#7F77DD" />
              {visibleCalc.filter(m => m.role === 'closer').map(m => (
                <CloserCard key={m.display} m={m as CloserCalc} activMonthLabel={monthLabelShort(closerActivMonth)} />
              ))}
            </>)}

            {/* ── GC ── */}
            {visibleCalc.some(m => m.role === 'gc') && (<>
              <SectionHeader
                label="Gerente de Contas"
                note={`Variável: taxa × GMV acima da meta de manutenção da carteira em ${monthLabel(refMonth)}. GMV abaixo da meta = sem variável.`}
                color="#E07038" />
              {visibleCalc.filter(m => m.role === 'gc').map(m => (
                <GCCard key={m.display} m={m as GCCalc} />
              ))}
            </>)}

            {/* Aviso se usuário não encontrado no time */}
            {!isAllAccess && visibleCalc.length === 0 && (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text2)' }}>
                <AlertCircle size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Sem dados de pagamento</div>
                <div style={{ fontSize: 13 }}>Seu usuário (<strong>{user?.name}</strong>) não está mapeado no plano de carreira desta prévia.</div>
              </div>
            )}

            {/* Nota */}
            <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>ℹ️ Sobre os cálculos</strong>
              <strong style={{ color: '#1DBF88' }}>SDR:</strong> calls com status "Realizada/Ativado" em {monthLabel(refMonth)} onde o SDR é responsável.<br />
              <strong style={{ color: '#7F77DD' }}>Closer:</strong> ativações de {monthLabel(closerActivMonth)} cruzadas com <code>tpv_cache</code> pelo ID da ativação. <code>tpv_30_dias</code> = TPV da data de ativação até +30 dias (ex.: ativado 18/03 → conta até 17/04).<br />
              <strong style={{ color: '#E07038' }}>GC:</strong> variável só é paga se o GMV de {monthLabel(refMonth)} superar a meta de manutenção da carteira. O excedente é a base de cálculo.
            </div>

            </>)} {/* fim hasLoaded */}
          </>
        )}

        {/* ══ ABAS LEGADO ══ */}
        {tab !== 'previa' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'TPV Total 30d', val: BRL(totalTPV30),    icon: <TrendingUp size={16} color="var(--action)" />, color: 'var(--text)'  },
                { label: 'Bônus Total',   val: BRL(totalBonus),    icon: <DollarSign size={16} color="#34C759" />,       color: '#34C759'      },
                { label: 'Clientes',      val: rows.length,        icon: <Users      size={16} color="#BF5AF2" />,       color: 'var(--text)'  },
                { label: 'Gatilhos ⚡',   val: totalGatilhos,      icon: <Zap        size={16} color="#FF9F0A" />,       color: '#FF9F0A'      },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    {c.icon}
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{isLegLoading ? '…' : c.val}</div>
                </div>
              ))}
            </div>

            {isLegLoading ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>Carregando...</div> : (
              <>
                {tab === 'closers' && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Closer','Clientes','TPV 30d','Bônus (0,2%)','Gatilhos'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: h==='Closer'?'left':'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                        ))}</tr></thead>
                      <tbody>{closers.map((c, i) => (
                        <tr key={c.email} style={{ borderBottom: '1px solid var(--border)', background: i%2===0?'transparent':'var(--bg-card2)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text2)' }}>{c.clientes}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{BRL(c.tpv_total)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#34C759', fontWeight: 700 }}>{BRL(c.bonus_total)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>{c.gatilhos > 0 ? <span style={{ background: '#FF9F0A22', color: '#FF9F0A', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>⚡ {c.gatilhos}</span> : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                {tab === 'sdrs' && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['SDR','Clientes','TPV 30d','Bônus (0,05%)'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: h==='SDR'?'left':'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                        ))}</tr></thead>
                      <tbody>{sdrs.map((s, i) => (
                        <tr key={s.email} style={{ borderBottom: '1px solid var(--border)', background: i%2===0?'transparent':'var(--bg-card2)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text2)' }}>{s.clientes}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{BRL(s.tpv_total)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#34C759', fontWeight: 700 }}>{BRL(s.bonus_total)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                {tab === 'detalhes' && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Cliente','Closer','SDR','Data Ativação','TPV 7d','TPV 30d','Bônus Closer','Bônus SDR','Roleta'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}</tr></thead>
                      <tbody>{rows.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: i%2===0?'transparent':'var(--bg-card2)' }}>
                          <td style={{ padding: '8px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cliente_email}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{nameByEmail(r.closer_email)}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{nameByEmail(r.sdr_email)}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text2)' }}>{new Date(r.data_fechamento).toLocaleDateString('pt-BR')}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{BRL(Number(r.tpv_7_dias))}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>{BRL(Number(r.tpv_30_dias))}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#34C759' }}>{BRL(Number(r.bonus_closer))}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#34C759' }}>{BRL(Number(r.bonus_sdr))}</td>
                          <td style={{ padding: '8px 10px' }}>{r.gatilho_roleta ? <span style={{ color: '#FF9F0A', fontWeight: 700 }}>⚡</span> : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </HideCtx.Provider>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────
function SectionHeader({ label, note, color }: { label: string; note: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12, marginTop: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 4, minHeight: 44, borderRadius: 2, background: color, flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, maxWidth: 700 }}>{note}</div>
      </div>
    </div>
  )
}

// ── SDR ────────────────────────────────────────────────────────────────────────
interface SdrCalc {
  display: string; role: 'sdr'; nivelIdx: number; cor: string
  fixo: number; teto: number; nivel: string; variavel: number; total: number
  sdr: {
    agendadas: number; realizadas: number; showupPct: number; metaAgend: number; metaShowup: number; rate: number
    calls: DbCall[]
  }
}

const STATUS_CALL_COLOR: Record<string, string> = {
  Realizada:  'var(--green)',
  Ativado:    '#34C759',
  Agendada:   'var(--action)',
  Cancelada:  'var(--red)',
  'No-show':  'var(--orange)',
}

function SdrCard({ m }: { m: SdrCalc }) {
  const { sdr } = m
  const cor = m.cor
  const metaReal  = Math.round(sdr.metaAgend * sdr.metaShowup / 100)
  const [expandido, setExpandido] = useState(false)

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 }}>
      <CardHeader display={m.display} role="sdr" nivel={m.nivel} fixo={m.fixo} total={m.total} cor={cor} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Agendadas',   val: sdr.agendadas,  meta: sdr.metaAgend,  unit: '' },
          { label: 'Realizadas',  val: sdr.realizadas, meta: metaReal,        unit: '' },
          { label: 'Show-up',     val: sdr.showupPct,  meta: sdr.metaShowup,  unit: '%' },
        ].map(k => {
          const pct  = pctOf(k.val, k.meta)
          const kcor = pct >= 100 ? '#34C759' : pct >= 70 ? '#FF9F0A' : '#FF3B30'
          return (
            <MetricBox key={k.label} label={k.label} val={`${k.val}${k.unit}`} meta={`${k.meta}${k.unit}`} pct={pct} barColor={kcor} />
          )
        })}
      </div>

      {/* Tabela de calls (expansível) */}
      {sdr.calls.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setExpandido(p => !p)} style={{
            background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text2)',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            {expandido ? '▲' : '▼'} Ver calls agendadas ({sdr.calls.length})
          </button>

          {expandido && (
            <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Cliente', 'E-mail', 'Data Agendada', 'Horário', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: h === '#' || h === 'Horário' ? 'center' : 'left',
                        fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                        fontSize: 10, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sdr.calls.map((c, i) => {
                    const statusColor = STATUS_CALL_COLOR[c.status] ?? 'var(--text2)'
                    const clientLabel = c.title || c.client_email || '—'
                    const isAtivado   = c.ativado === true
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card2)' }}>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text2)', fontSize: 11 }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {clientLabel}
                          </div>
                          {isAtivado && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#34C759',
                              background: '#34C75922', padding: '1px 6px', borderRadius: 10, marginTop: 2, display: 'inline-block' }}>
                              ✅ Ativado
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text2)', fontSize: 11, maxWidth: 180,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.client_email || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 12 }}>
                          {new Date(c.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {c.time ? (c.time as string).slice(0, 5) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                            background: `color-mix(in srgb, ${statusColor} 15%, var(--bg-card2))`,
                            color: statusColor, border: `1px solid color-mix(in srgb, ${statusColor} 35%, transparent)`,
                            whiteSpace: 'nowrap',
                          }}>{c.status}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Rodapé */}
                <tfoot>
                  <tr style={{ background: 'var(--bg-card2)', borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--text2)', fontSize: 11 }}>
                      {sdr.calls.length}
                    </td>
                    <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12 }}>
                      Total agendadas
                    </td>
                    <td colSpan={2} style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>
                      Realizadas: <strong style={{ color: '#34C759' }}>{sdr.realizadas}</strong>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#34C759' }}>
                        Show-up: {sdr.showupPct}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      <VariavelBar
        cor={cor} teto={m.teto} variavel={m.variavel}
        desc={`${sdr.realizadas} reuniões × R$${sdr.rate.toFixed(2)}/reunião`} />
      <TotalRow fixo={m.fixo} variavel={m.variavel} total={m.total} cor={cor} />
    </div>
  )
}

// ── Closer ─────────────────────────────────────────────────────────────────────
interface CloserCalc {
  display: string; role: 'closer'; nivelIdx: number; cor: string
  fixo: number; teto: number; nivel: string; variavel: number; total: number
  closer: {
    userId: string; email: string; threshold: number; thresholdLabel: string
    totalAtiv: number; comTpv: number; qualificados: number; rate: number
    clientes: { email: string; nome: string; tpv30: number | null; tem_tpv: boolean; qualifica: boolean; dataInicio: string; dataFim: string }[]
  }
}

function CloserCard({ m, activMonthLabel }: { m: CloserCalc; activMonthLabel: string }) {
  const { closer } = m
  const cor = m.cor
  const [expandido, setExpandido] = useState(false)

  // Totais da tabela
  const totalTpv30 = closer.clientes.filter(c => c.tem_tpv).reduce((s, c) => s + c.tpv30!, 0)
  const totalRoi   = totalTpv30 * 0.06

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 }}>
      <CardHeader display={m.display} role="closer" nivel={m.nivel} fixo={m.fixo} total={m.total} cor={cor}
        badge={`Gatilho ${closer.thresholdLabel} · R$${closer.rate}/cliente`} />

      {/* Aviso se usuário não encontrado */}
      {!closer.userId && (
        <div style={{ background: '#FF9F0A15', border: '1px solid #FF9F0A40', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#FF9F0A', marginBottom: 12 }}>
          ⚠️ Usuário não encontrado por "{m.nameMatch}" — verifique o nome cadastrado em Responsáveis.
        </div>
      )}

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        <MetricBox
          label={`Ativações (${activMonthLabel})`}
          val={String(closer.totalAtiv)}
          meta="total" pct={100} barColor={cor} noBar />
        <MetricBox
          label="Com TPV medido"
          val={String(closer.comTpv)}
          meta={`de ${closer.totalAtiv}`}
          pct={pctOf(closer.comTpv, closer.totalAtiv)} barColor={cor} />
        <MetricBox
          label={`Acima de ${closer.thresholdLabel}`}
          val={String(closer.qualificados)}
          meta={`de ${closer.comTpv} medidos`}
          pct={pctOf(closer.qualificados, Math.max(closer.comTpv, 1))}
          barColor={closer.qualificados > 0 ? '#34C759' : '#FF3B30'} />
      </div>

      {/* Tabela de clientes (expansível) */}
      {closer.clientes.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setExpandido(!expandido)} style={{
            background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text2)',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            {expandido ? '▲' : '▼'} Ver clientes ({closer.clientes.length})
          </button>

          {expandido && (
            <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.04em' }}>Cliente</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.04em' }}>Janela 30d</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.04em' }}>TPV 30d</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#34C759', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.04em' }}>ROI (6%)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.04em' }}>Gatilho</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.04em' }}>Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {closer.clientes.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card2)' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{c.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.email}</div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {c.dataInicio} → {c.dataFim}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {c.tem_tpv ? BRL(c.tpv30!) : <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>sem dados</span>}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: c.tem_tpv && c.tpv30! > 0 ? '#34C759' : 'var(--text2)' }}>
                        {c.tem_tpv && c.tpv30! > 0 ? BRL(c.tpv30! * 0.06) : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {!c.tem_tpv ? (
                          <span style={{ color: '#FF9F0A', fontSize: 11 }}>⏳ aguardando</span>
                        ) : c.qualifica ? (
                          <span style={{ color: '#34C759', fontWeight: 700, fontSize: 11 }}>✅ sim</span>
                        ) : (
                          <span style={{ color: '#FF3B30', fontSize: 11 }}>❌ não ({BRL(c.tpv30!)} &lt; {closer.thresholdLabel})</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: c.qualifica ? '#34C759' : 'var(--text2)' }}>
                        {c.qualifica ? BRL(closer.rate) : '—'}
                      </td>
                    </tr>
                  ))}
                  {/* Rodapé */}
                  <tr style={{ background: 'var(--bg-card2)', borderTop: '2px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 800 }}>Total</td>
                    <td style={{ padding: '10px 12px' }} />
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                      {BRL(totalTpv30)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#34C759' }}>
                      {BRL(totalRoi)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
                      {closer.qualificados} de {closer.totalAtiv}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: cor }}>
                      {BRL(m.variavel)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <VariavelBar
        cor={cor} teto={m.teto} variavel={m.variavel}
        desc={`${closer.qualificados} clientes × R$${closer.rate} (TPV > ${closer.thresholdLabel})`} />
      <TotalRow fixo={m.fixo} variavel={m.variavel} total={m.total} cor={cor} />
    </div>
  )
}

// ── GC ─────────────────────────────────────────────────────────────────────────
interface GCCalc {
  display: string; role: 'gc'; nivelIdx: number; cor: string
  fixo: number; teto: number; nivel: string; variavel: number; total: number
  gc: {
    gmvAtual: number; portfolioGmv: number; maintenancePct: number
    threshold: number; newGmv: number; hitTarget: boolean; rate: string
  }
}

function GCCard({ m }: { m: GCCalc }) {
  const { gc } = m
  const cor = m.cor
  const gmvPct = pctOf(gc.gmvAtual, gc.portfolioGmv)
  const targetPct = gc.maintenancePct * 100

  // Porcentagem da barra: quanto do GMV atual representa em relação à carteira
  const barColor = gc.hitTarget ? '#34C759' : '#FF3B30'

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 }}>
      <CardHeader display={m.display} role="gc" nivel={m.nivel} fixo={m.fixo} total={m.total} cor={cor}
        badge={`Taxa ${gc.rate} do GMV excedente`} />

      {/* Carteira de referência */}
      <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text2)', marginBottom: 10 }}>
          Carteira de referência
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 3 }}>GMV da carteira</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{BRL2(gc.portfolioGmv)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 3 }}>Meta de manutenção ({PCT2(targetPct)})</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FF9F0A' }}>{BRL(gc.threshold)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 3 }}>GMV atual (Metabase)</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: barColor }}>
              {gc.gmvAtual > 0 ? BRL(gc.gmvAtual) : <span style={{ fontStyle: 'italic', fontSize: 12 }}>sem dados</span>}
            </div>
          </div>
        </div>

        {/* Barra de progresso */}
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <ProgressBar pct={gmvPct} color={barColor} height={8} />
          {/* Marcador da meta de manutenção */}
          <div style={{
            position: 'absolute', top: -2, left: `${targetPct}%`,
            width: 2, height: 12, background: '#FF9F0A', borderRadius: 1,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text2)' }}>
          <span>R$0</span>
          <span style={{ color: '#FF9F0A' }}>Meta {PCT2(targetPct)}</span>
          <span>{BRL(gc.portfolioGmv)}</span>
        </div>

        {/* Status */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          {gc.hitTarget ? (
            <>
              <CheckCircle size={14} color="#34C759" />
              <span style={{ fontSize: 12, color: '#34C759', fontWeight: 600 }}>
                Meta atingida — GMV acima de {PCT2(targetPct)} da carteira
              </span>
            </>
          ) : (
            <>
              <XCircle size={14} color="#FF3B30" />
              <span style={{ fontSize: 12, color: '#FF3B30', fontWeight: 600 }}>
                Meta não atingida — sem variável {gc.gmvAtual === 0 ? '(dados do Metabase pendentes)' : `(falta ${BRL(gc.threshold - gc.gmvAtual)} para atingir ${PCT2(targetPct)})`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* GMV excedente (base do variável) */}
      {gc.hitTarget && (
        <div style={{ background: 'rgba(52,199,89,.08)', border: '1px solid rgba(52,199,89,.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#34C759', marginBottom: 6 }}>
            GMV novo (base de cálculo)
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            {BRL(gc.gmvAtual)} atual − {BRL(gc.threshold)} meta = {' '}
            <strong style={{ color: '#34C759', fontSize: 15 }}>{BRL(gc.newGmv)}</strong> elegível para variável
          </div>
        </div>
      )}

      <VariavelBar
        cor={cor} teto={m.teto} variavel={m.variavel}
        desc={gc.hitTarget
          ? `${gc.rate} × ${BRL(gc.newGmv)} (GMV acima de ${PCT2(targetPct)})`
          : `Sem variável — GMV abaixo de ${PCT2(targetPct)} da carteira`} />
      <TotalRow fixo={m.fixo} variavel={m.variavel} total={m.total} cor={cor} />
    </div>
  )
}

// ── Componentes atômicos ──────────────────────────────────────────────────────
function CardHeader({ display, role, nivel, fixo, total, cor, badge }: {
  display: string; role: string; nivel: string; fixo: number; total: number; cor: string; badge?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: ROLE_BG[role],
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: cor, flexShrink: 0 }}>
        {display.charAt(0)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{display}</div>
        <div style={{ display: 'flex', gap: 7, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ background: ROLE_BG[role], color: cor, padding: '1px 8px', borderRadius: 5, fontWeight: 600, fontSize: 11 }}>
            {role === 'sdr' ? 'SDR' : role === 'closer' ? 'Closer' : 'GC'}
          </span>
          <span style={{ background: 'var(--bg-card2)', padding: '1px 8px', borderRadius: 5, fontWeight: 600, fontSize: 11 }}>{nivel}</span>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Fixo <MVal v={fixo} />/mês</span>
          {badge && <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {badge}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <MVal v={total} style={{ fontSize: 22, fontWeight: 800, color: cor }} />
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>total estimado</div>
      </div>
    </div>
  )
}

function MetricBox({ label, val, meta, pct, barColor, noBar }: {
  label: string; val: string; meta: string; pct: number; barColor: string; noBar?: boolean
}) {
  return (
    <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: noBar ? 'var(--text)' : pct >= 100 ? '#34C759' : pct >= 70 ? '#FF9F0A' : '#FF3B30' }}>{val}</span>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>/ {meta}</span>
      </div>
      {!noBar && <ProgressBar pct={pct} color={barColor} />}
    </div>
  )
}

function VariavelBar({ cor, teto, variavel, desc }: { cor: string; teto: number; variavel: number; desc: string }) {
  const pct = pctOf(variavel, teto)
  return (
    <div style={{ background: 'var(--bg-card2)', border: `1px solid ${cor}30`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          <strong style={{ color: 'var(--text)' }}>Variável: </strong>{desc}
          <strong style={{ color: cor }}> = <MVal v={variavel} /></strong>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', marginLeft: 8 }}>teto <MVal v={teto} /></div>
      </div>
      <ProgressBar pct={pct} color={cor} height={6} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text2)' }}>
        <span>R$0</span><span>{Math.round(pct)}% do teto</span><MVal v={teto} />
      </div>
    </div>
  )
}

function TotalRow({ fixo, variavel, total, cor }: { fixo: number; variavel: number; total: number; cor: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text2)', alignItems: 'center', justifyContent: 'flex-end' }}>
      <MVal v={fixo} /> <span>fixo</span>
      <span>+</span>
      <MVal v={variavel} style={{ color: cor }} /> <span>variável</span>
      <span>=</span>
      <MVal v={total} style={{ fontWeight: 800, fontSize: 15, color: cor }} />
    </div>
  )
}
