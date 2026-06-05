import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Download, FileText, Copy, Check } from 'lucide-react'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase/client'
import { isSDRRole, CHANNEL_COLORS } from '@/lib/utils'

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS      = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTHS_GEN  = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0
const varStr = (curr: number, prev: number) => {
  if (prev === 0) return ''
  const d = curr - prev
  const p = Math.round((d / prev) * 100)
  return d === 0 ? ' (estável)' : ` (${d > 0 ? '+' : ''}${p}% vs mês anterior)`
}

type User       = { id: string; name: string; role: string; email: string | null; active: boolean }
type Activation = { id: string; client: string; email: string | null; responsible: string; date: string; channel: string; faturamento_mensal: number | null; sdr_id: string | null; sdr_nome: string | null; campanha: string | null }
type GcAct = { id: string; client: string; email: string | null; gerente_id: string | null; gc_status: string | null; faturamento_mensal: number | null; welcome_sent: boolean | null }
type Call       = { id: string; date: string; status: string; responsible: string | null; sdr_nome: string | null; client_email: string | null; ativado: boolean | null; motivo_nao_ativacao: string | null }
type TpvRow     = { closer_email: string | null; tpv_30_dias: number; bonus_closer: number; sdr_email: string | null; bonus_sdr: number; data_fechamento: string }

export default function RelatorioMensal() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading])
  if (loading || !user) return null
  if (!hasAnyRole(user, ['Admin'])) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ textAlign: 'center', padding: 64, color: 'var(--text2)' }}>
          Acesso restrito a Administradores.
        </div>
      </>
    )
  }
  return <Content />
}

function Content() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [users,     setUsers]     = useState<User[]>([])
  const [acts,      setActs]      = useState<Activation[]>([])
  const [prevActs,  setPrevActs]  = useState<Activation[]>([])
  const [calls,     setCalls]     = useState<Call[]>([])
  const [prevCalls, setPrevCalls] = useState<Call[]>([])
  const [tpvRows,   setTpvRows]   = useState<TpvRow[]>([])
  const [gcActs,    setGcActs]    = useState<GcAct[]>([])

  const monthStr = `${year}-${String(month + 1).padStart(2,'0')}`
  const inicio   = `${monthStr}-01`
  const fim      = `${year}-${String(month + 1).padStart(2,'0')}-${new Date(year, month + 1, 0).getDate()}`
  const prevDate = new Date(year, month - 1, 1)
  const prevMS   = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2,'0')}`
  const prevIni  = `${prevMS}-01`
  const prevFim  = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2,'0')}-${new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()}`

  async function load() {
    setIsLoading(true)
    const [u, a, pa, c, pc, t, gc] = await Promise.all([
      supabase.from('users').select('id,name,role,email,active').order('name'),
      supabase.from('activations').select('id,client,email,responsible,date,channel,faturamento_mensal,sdr_id,sdr_nome,campanha').gte('date', inicio).lte('date', fim),
      supabase.from('activations').select('id,responsible,date,channel,faturamento_mensal,sdr_id,sdr_nome,campanha').gte('date', prevIni).lte('date', prevFim),
      supabase.from('calls').select('id,date,status,responsible,sdr_nome,client_email,ativado,motivo_nao_ativacao').gte('date', inicio).lte('date', fim),
      supabase.from('calls').select('id,date,status,responsible,sdr_nome,ativado').gte('date', prevIni).lte('date', prevFim),
      supabase.from('tpv_cache').select('closer_email,tpv_30_dias,bonus_closer,sdr_email,bonus_sdr,data_fechamento').gte('data_fechamento', inicio).lte('data_fechamento', fim),
      // Carteiras GC: todos os clientes com gerente atribuído (sem filtro de mês)
      supabase.from('activations').select('id,client,email,gerente_id,gc_status,faturamento_mensal,welcome_sent').not('gerente_id', 'is', null),
    ])
    setUsers((u.data ?? []) as User[])
    setActs((a.data ?? []) as Activation[])
    setPrevActs((pa.data ?? []) as Activation[])
    setCalls((c.data ?? []) as Call[])
    setPrevCalls((pc.data ?? []) as Call[])
    setTpvRows((t.data ?? []) as TpvRow[])
    setGcActs((gc.data ?? []) as GcAct[])
    setIsLoading(false)
  }

  useEffect(() => { load() }, [monthStr])

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const closers  = useMemo(() => users.filter(u => u.role === 'Closer'), [users])
  const sdrs     = useMemo(() => users.filter(u => isSDRRole(u.role)), [users])
  const gerentes = useMemo(() => users.filter(u => u.role === 'Gerente de Contas'), [users])

  // ── Métricas globais ──────────────────────────────────────────────────────
  const totalActs      = acts.length
  const prevTotalActs  = prevActs.length
  const realizadas     = calls.filter(c => c.status === 'Realizada').length
  const prevRealizadas = prevCalls.filter(c => c.status === 'Realizada').length
  const agendadas      = calls.filter(c => c.status === 'Agendada').length
  const canceladas     = calls.filter(c => c.status === 'Cancelada').length
  const noshow         = calls.filter(c => c.status === 'No-show').length
  const totalCalls     = calls.length
  const prevTotalCalls = prevCalls.length
  const totalTPV       = tpvRows.reduce((s, r) => s + Number(r.tpv_30_dias), 0)
  const totalBonus     = tpvRows.reduce((s, r) => s + Number(r.bonus_closer) + Number(r.bonus_sdr), 0)

  // ── Por Closer ────────────────────────────────────────────────────────────
  const closerStats = closers.map(c => {
    const myActs  = acts.filter(a => a.responsible === c.id)
    const myCalls = calls.filter(x => x.responsible === c.id)
    const myTpv   = tpvRows.filter(r => r.closer_email?.toLowerCase() === c.email?.toLowerCase())
    return {
      id: c.id, name: c.name,
      ativacoes:   myActs.length,
      inbound:     myActs.filter(a => a.channel === 'Inbound').length,
      outbound:    myActs.filter(a => a.channel === 'Outbound').length,
      indicacao:   myActs.filter(a => a.channel === 'Indicação').length,
      realizadas:  myCalls.filter(x => x.status === 'Realizada').length,
      canceladas:  myCalls.filter(x => x.status === 'Cancelada').length,
      noshow:      myCalls.filter(x => x.status === 'No-show').length,
      tpv:         myTpv.reduce((s, r) => s + Number(r.tpv_30_dias), 0),
      bonus:       myTpv.reduce((s, r) => s + Number(r.bonus_closer), 0),
    }
  }).sort((a, b) => b.ativacoes - a.ativacoes)

  // ── Por SDR ───────────────────────────────────────────────────────────────
  const sdrStats = sdrs.map(s => {
    const myActs  = acts.filter(a => a.sdr_id === s.id || a.sdr_nome === s.name)
    const myCalls = calls.filter(x => x.sdr_nome === s.name)
    return {
      id: s.id, name: s.name,
      agendadas: myCalls.length,
      realizadas: myCalls.filter(x => x.status === 'Realizada').length,
      ativacoes: myActs.length,
    }
  }).filter(s => s.agendadas > 0 || s.ativacoes > 0).sort((a, b) => b.ativacoes - a.ativacoes)

  // ── Por Canal ─────────────────────────────────────────────────────────────
  const chanMap: Record<string, number> = {}
  acts.forEach(a => { chanMap[a.channel] = (chanMap[a.channel] ?? 0) + 1 })
  const chanStats = Object.entries(chanMap).sort((a, b) => b[1] - a[1])

  // ── Por Campanha ──────────────────────────────────────────────────────────
  const campMap: Record<string, number> = {}
  acts.forEach(a => { if (a.campanha) campMap[a.campanha] = (campMap[a.campanha] ?? 0) + 1 })
  const campStats = Object.entries(campMap).sort((a, b) => b[1] - a[1])

  // ── GC — Carteiras ativas ─────────────────────────────────────────────────
  const GC_KANBAN = ['Cliente novo','Cliente atendido','Cliente ainda não faturando','Cliente faturando','Reunião com Cliente']
  const gcStats = gerentes.map(g => {
    const myClients = gcActs.filter(a => a.gerente_id === g.id)
    const faturando = myClients.filter(a => a.gc_status === 'Cliente faturando').length
    const byStatus  = GC_KANBAN.map(s => ({ status: s, count: myClients.filter(a => (a.gc_status ?? 'Cliente novo') === s).length })).filter(x => x.count > 0)
    const fatTotal  = myClients.reduce((s, a) => s + (Number(a.faturamento_mensal) || 0), 0)
    return { id: g.id, name: g.name, total: myClients.length, faturando, byStatus, fatTotal }
  }).filter(g => g.total > 0).sort((a, b) => b.total - a.total)

  // ── Não ativados ──────────────────────────────────────────────────────────
  const naoAtivados = calls.filter(c => c.motivo_nao_ativacao)

  // ══ Gera o texto do relatório ══════════════════════════════════════════════
  const mesAno   = `${MONTHS[month]}/${year}`
  const mesGen   = `${MONTHS_GEN[month]} de ${year}`
  const prevMesGen = `${MONTHS_GEN[prevDate.getMonth()]} de ${prevDate.getFullYear()}`

  function buildReportText(): string {
    const lines: string[] = []
    const add = (s = '') => lines.push(s)

    add(`RELATÓRIO MENSAL — ${mesAno.toUpperCase()}`)
    add(`Comercial Cakto`)
    add(`Período: ${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`)
    add()
    add('─'.repeat(60))
    add()

    // Sumário executivo
    add('1. SUMÁRIO EXECUTIVO')
    add()
    const tendAts = totalActs > prevTotalActs ? 'crescimento' : totalActs < prevTotalActs ? 'queda' : 'resultado estável'
    add(`Em ${mesGen}, o time comercial da Cakto registrou ${totalActs} ativação${totalActs !== 1 ? 'ões' : ''}, representando um ${tendAts} de ${Math.abs(Math.round(((totalActs - prevTotalActs) / (prevTotalActs || 1)) * 100))}% em relação a ${prevMesGen} (${prevTotalActs} ativações).`)
    add()
    add(`Foram realizadas ${realizadas} calls no período${varStr(realizadas, prevRealizadas)}, com uma taxa de no-show de ${pct(noshow, totalCalls)}% (${noshow} calls). O total de calls agendadas foi de ${totalCalls}${varStr(totalCalls, prevTotalCalls)}.`)
    if (totalTPV > 0) {
      add()
      add(`O TPV total dos clientes ativados no mês atingiu ${BRL(totalTPV)}, com bônus distribuídos no valor de ${BRL(totalBonus)}.`)
    }
    add()
    add('─'.repeat(60))
    add()

    // Ativações por closer
    add('2. ATIVAÇÕES POR CLOSER')
    add()
    if (closerStats.filter(c => c.ativacoes > 0).length === 0) {
      add('Nenhuma ativação registrada no período.')
    } else {
      closerStats.filter(c => c.ativacoes > 0).forEach((c, i) => {
        const taxaConvStr = c.realizadas > 0 ? ` | Conv: ${pct(c.ativacoes, c.realizadas)}%` : ''
        const tpvStr      = c.tpv > 0   ? ` | TPV 30d: ${BRL(c.tpv)}`   : ''
        const bonusStr    = c.bonus > 0  ? ` | Bônus: ${BRL(c.bonus)}`   : ''
        add(`${i + 1}. ${c.name}`)
        add(`   Total: ${c.ativacoes} ativação${c.ativacoes !== 1 ? 'ões' : ''} | Inbound: ${c.inbound} | Outbound: ${c.outbound} | Indicação: ${c.indicacao}`)
        add(`   Calls: ${c.realizadas} realizadas | Canceladas: ${c.canceladas} | No-show: ${c.noshow}${taxaConvStr}${tpvStr}${bonusStr}`)
      })
    }
    add()
    add('─'.repeat(60))
    add()

    // SDR
    let sec = 3
    if (sdrStats.length > 0) {
      add(`${sec}. PERFORMANCE SDR / SOCIAL SELLING`)
      add()
      sdrStats.forEach((s, i) => {
        const taxaConvStr = s.realizadas > 0 ? ` | Conv: ${pct(s.ativacoes, s.realizadas)}%` : ''
        add(`${i + 1}. ${s.name}: ${s.agendadas} agendadas | ${s.realizadas} realizadas | ${s.ativacoes} ativações${taxaConvStr}`)
      })
      add()
      add('─'.repeat(60))
      add()
      sec++
    }

    // Canais
    add(`${sec}. ORIGEM DAS ATIVAÇÕES NO MÊS`)
    add()
    chanStats.forEach(([ch, count]) => {
      add(`• ${ch}: ${count} ativação${count !== 1 ? 'ões' : ''} (${pct(count, totalActs)}%)`)
    })
    if (campStats.length > 0) {
      add()
      add('Campanhas:')
      campStats.forEach(([name, count]) => {
        add(`• ${name}: ${count} ativação${count !== 1 ? 'ões' : ''} (${pct(count, totalActs)}%)`)
      })
    }
    add()
    add('─'.repeat(60))
    add()
    sec++

    // Calls
    add(`${sec}. CALLS — STATUS GERAL`)
    add()
    add(`• Total de calls: ${totalCalls}`)
    add(`• Realizadas: ${realizadas} (${pct(realizadas, totalCalls)}%)`)
    add(`• Agendadas (pendentes): ${agendadas}`)
    add(`• Canceladas: ${canceladas} (${pct(canceladas, totalCalls)}%)`)
    add(`• No-show: ${noshow} (${pct(noshow, totalCalls)}%)`)
    add()
    add('─'.repeat(60))
    add()
    sec++

    // GC — Carteiras ativas
    if (gcStats.length > 0) {
      add(`${sec}. GERENTE DE CONTAS — CARTEIRAS ATIVAS`)
      add()
      const totalCarteira = gcActs.length
      add(`Total de clientes com gerente atribuído: ${totalCarteira}`)
      add()
      gcStats.forEach((g, i) => {
        add(`${i + 1}. ${g.name} — ${g.total} cliente${g.total !== 1 ? 's' : ''} na carteira`)
        g.byStatus.forEach(s => {
          add(`   • ${s.status}: ${s.count}`)
        })
        if (g.fatTotal > 0) add(`   Faturamento previsto: ${BRL(g.fatTotal)}/mês`)
      })
      add()
      add('─'.repeat(60))
      add()
      sec++
    }

    // Não ativados
    if (naoAtivados.length > 0) {
      add(`${sec}. MOTIVOS DE NÃO ATIVAÇÃO (${naoAtivados.length} cliente${naoAtivados.length !== 1 ? 's' : ''})`)
      add()
      naoAtivados.forEach((c, i) => {
        const closer = closers.find(u => u.id === c.responsible)
        add(`${i + 1}. ${c.client_email ?? '—'} (${closer?.name.split(' ')[0] ?? '?'}): ${c.motivo_nao_ativacao}`)
      })
      add()
      add('─'.repeat(60))
      add()
    }

    add(`Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
    add('Comercial Cakto — comercialcakto.site')

    return lines.join('\n')
  }

  // ══ Download Word ══════════════════════════════════════════════════════════
  function downloadWord() {
    const text = buildReportText()

    const html = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta name:ProgId content="Word.Document">
  <meta name:Generator content="Microsoft Word 15">
  <title>Relatório Mensal ${mesAno}</title>
  <style>
    body { font-family: Calibri, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 2cm; line-height: 1.6; }
    h1   { font-size: 18pt; font-weight: bold; color: #2F5733; margin-bottom: 2pt; }
    h2   { font-size: 13pt; font-weight: bold; color: #2F5733; margin-top: 18pt; margin-bottom: 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
    .sub { font-size: 10pt; color: #666; margin-top: 0; }
    .kpi-grid { display: flex; flex-wrap: wrap; gap: 12pt; margin: 12pt 0; }
    .kpi { border: 1pt solid #ddd; border-radius: 4pt; padding: 10pt 14pt; min-width: 110pt; background: #f9f9f9; }
    .kpi-label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.5pt; }
    .kpi-value { font-size: 20pt; font-weight: bold; color: #2F5733; }
    .kpi-sub   { font-size: 8pt; color: #aaa; }
    table { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 10pt; }
    th    { background: #2F5733; color: white; padding: 6pt 8pt; text-align: left; font-size: 9pt; }
    td    { padding: 5pt 8pt; border-bottom: 0.5pt solid #eee; }
    tr:nth-child(even) td { background: #f5f5f5; }
    .divider { border: none; border-top: 1pt solid #ddd; margin: 14pt 0; }
    p { margin: 6pt 0; }
    ul { margin: 4pt 0 8pt 16pt; }
    li { margin: 3pt 0; }
    .footer { margin-top: 24pt; font-size: 9pt; color: #999; border-top: 0.5pt solid #ddd; padding-top: 8pt; }
  </style>
</head>
<body>
  <h1>Relatório Mensal — ${mesAno}</h1>
  <p class="sub">Comercial Cakto &nbsp;|&nbsp; ${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}</p>
  <hr class="divider">

  <h2>1. Sumário Executivo</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Ativações</div><div class="kpi-value">${totalActs}</div><div class="kpi-sub">ant.: ${prevTotalActs}</div></div>
    <div class="kpi"><div class="kpi-label">Calls Realizadas</div><div class="kpi-value">${realizadas}</div><div class="kpi-sub">ant.: ${prevRealizadas}</div></div>
    <div class="kpi"><div class="kpi-label">Total de Calls</div><div class="kpi-value">${totalCalls}</div><div class="kpi-sub">Agend.: ${agendadas}</div></div>
    <div class="kpi"><div class="kpi-label">No-show</div><div class="kpi-value" style="color:#c8873a">${noshow}</div><div class="kpi-sub">${pct(noshow, totalCalls)}% das calls</div></div>
    <div class="kpi"><div class="kpi-label">Canceladas</div><div class="kpi-value" style="color:#c05050">${canceladas}</div><div class="kpi-sub">${pct(canceladas, totalCalls)}% das calls</div></div>
    ${totalTPV > 0 ? `<div class="kpi"><div class="kpi-label">TPV 30d</div><div class="kpi-value">${BRL(totalTPV)}</div><div class="kpi-sub">Bônus: ${BRL(totalBonus)}</div></div>` : ''}
  </div>
  <p>${buildReportText().split('\n').slice(6).join('\n').split('─')[0].trim().replace(/\n/g, '<br>')}</p>

  <hr class="divider">
  <h2>2. Ativações por Closer — Detalhado por Canal</h2>
  <table>
    <tr><th>Closer</th><th>Total</th><th>Inbound</th><th>Outbound</th><th>Indicação</th><th>Realiz.</th><th>Cancel.</th><th>No-show</th><th>Conv.%</th>${totalTPV > 0 ? '<th>TPV 30d</th><th>Bônus</th>' : ''}</tr>
    ${closerStats.filter(c => c.ativacoes > 0).map(c => `
    <tr>
      <td><b>${c.name}</b></td>
      <td><b style="color:#2F5733">${c.ativacoes}</b></td>
      <td>${c.inbound}</td>
      <td>${c.outbound}</td>
      <td>${c.indicacao}</td>
      <td style="color:#2F5733">${c.realizadas}</td>
      <td style="color:#c05050">${c.canceladas}</td>
      <td style="color:#c8873a">${c.noshow}</td>
      <td>${pct(c.ativacoes, c.realizadas || 1)}%</td>
      ${totalTPV > 0 ? `<td>${c.tpv > 0 ? BRL(c.tpv) : '—'}</td><td>${c.bonus > 0 ? BRL(c.bonus) : '—'}</td>` : ''}
    </tr>`).join('')}
  </table>

  ${sdrStats.length > 0 ? `
  <hr class="divider">
  <h2>3. Performance SDR / Social Selling</h2>
  <table>
    <tr><th>SDR</th><th>Agendadas</th><th>Realizadas</th><th>Ativações</th><th>Conv. %</th></tr>
    ${sdrStats.map(s => `
    <tr>
      <td><b>${s.name}</b></td>
      <td>${s.agendadas}</td>
      <td>${s.realizadas}</td>
      <td><b style="color:#2F5733">${s.ativacoes}</b></td>
      <td>${pct(s.ativacoes, s.realizadas || 1)}%</td>
    </tr>`).join('')}
  </table>` : ''}

  <hr class="divider">
  <h2>${sdrStats.length > 0 ? '4' : '3'}. Origem das Ativações</h2>
  <ul>
    ${chanStats.map(([ch, count]) => `<li><b>${ch}</b>: ${count} ativação${count !== 1 ? 'ões' : ''} (${pct(count, totalActs)}%)</li>`).join('')}
  </ul>
  ${campStats.length > 0 ? `<p><b>Campanhas:</b></p><ul>${campStats.map(([n, c]) => `<li><b>${n}</b>: ${c} ativação${c !== 1 ? 'ões' : ''} (${pct(c, totalActs)}%)</li>`).join('')}</ul>` : ''}

  <hr class="divider">
  <h2>${sdrStats.length > 0 ? '5' : '4'}. Calls — Status Geral</h2>
  <ul>
    <li>Total: <b>${totalCalls}</b></li>
    <li>Realizadas: <b style="color:#2F5733">${realizadas}</b> (${pct(realizadas, totalCalls)}%)</li>
    <li>Agendadas (pendentes): ${agendadas}</li>
    <li>Canceladas: <span style="color:#c05050">${canceladas}</span> (${pct(canceladas, totalCalls)}%)</li>
    <li>No-show: <span style="color:#c8873a">${noshow}</span> (${pct(noshow, totalCalls)}%)</li>
  </ul>

  ${gcStats.length > 0 ? `
  <hr class="divider">
  <h2>${sdrStats.length > 0 ? '6' : '5'}. Gerente de Contas — Carteiras Ativas</h2>
  <p><b>Total de clientes com gerente atribuído: ${gcActs.length}</b></p>
  <table>
    <tr><th>Gerente</th><th>Total Carteira</th><th>Cliente novo</th><th>Atendido</th><th>Ainda não fat.</th><th>Faturando</th><th>Reunião</th><th>Fat. Previsto/mês</th></tr>
    ${gcStats.map(g => {
      const getCount = (s: string) => g.byStatus.find(x => x.status === s)?.count ?? 0
      return `<tr>
        <td><b>${g.name}</b></td>
        <td><b style="color:#2F5733">${g.total}</b></td>
        <td>${getCount('Cliente novo')}</td>
        <td>${getCount('Cliente atendido')}</td>
        <td style="color:#c8873a">${getCount('Cliente ainda não faturando')}</td>
        <td style="color:#2F5733"><b>${getCount('Cliente faturando')}</b></td>
        <td>${getCount('Reunião com Cliente')}</td>
        <td>${g.fatTotal > 0 ? BRL(g.fatTotal) : '—'}</td>
      </tr>`
    }).join('')}
  </table>` : ''}

  ${naoAtivados.length > 0 ? `
  <hr class="divider">
  <h2>${(sdrStats.length > 0 ? 7 : 6) + (gcStats.length > 0 ? 0 : -1)}. Motivos de Não Ativação (${naoAtivados.length})</h2>
  <table>
    <tr><th>Cliente</th><th>Closer</th><th>Motivo</th></tr>
    ${naoAtivados.map(c => {
      const closer = closers.find(u => u.id === c.responsible)
      return `<tr><td>${c.client_email ?? '—'}</td><td>${closer?.name.split(' ')[0] ?? '—'}</td><td>${c.motivo_nao_ativacao}</td></tr>`
    }).join('')}
  </table>` : ''}

  <div class="footer">
    Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    &nbsp;|&nbsp; Comercial Cakto — comercialcakto.site
  </div>
</body>
</html>`

    const blob = new Blob(['﻿', html], { type: 'application/msword' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `Relatorio_Mensal_${mesAno.replace('/', '_')}.doc`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyText() {
    await navigator.clipboard.writeText(buildReportText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Renderiza o texto do relatório no card ─────────────────────────────────
  const reportLines = buildReportText().split('\n')

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--action)', marginBottom: 4 }}>
              Relatório Mensal
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>
              {MONTHS[month]} {year}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Nav mês */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 6px' }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: '4px 10px', borderRadius: 7, fontFamily: 'inherit', fontSize: 18, lineHeight: 1 }}>‹</button>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 130, textAlign: 'center' }}>
                {MONTHS[month].slice(0,3)} {year}
              </span>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: '4px 10px', borderRadius: 7, fontFamily: 'inherit', fontSize: 18, lineHeight: 1 }}>›</button>
            </div>

            <button onClick={load} disabled={isLoading} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text2)',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              opacity: isLoading ? 0.6 : 1,
            }}>
              <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              Atualizar
            </button>

            <button onClick={copyText} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
              borderRadius: 8, border: `1px solid ${copied ? 'var(--green)' : 'var(--border)'}`,
              background: copied ? 'color-mix(in srgb, var(--green) 12%, var(--bg-card))' : 'var(--bg-card)',
              color: copied ? 'var(--green)' : 'var(--text2)',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all .2s',
            }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado!' : 'Copiar texto'}
            </button>

            <button onClick={downloadWord} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
              borderRadius: 8, border: 'none',
              background: 'var(--action)',
              color: '#E2CFB7',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 12px var(--action-glow)',
            }}>
              <Download size={15} />
              Baixar Word (.doc)
            </button>
          </div>
        </div>

        {/* ── Caixa do relatório ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 40px',
          borderTop: '3px solid var(--action)',
          boxShadow: '0 4px 24px rgba(0,0,0,.2)',
        }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)', fontSize: 14 }}>
              Carregando dados…
            </div>
          ) : (
            <pre style={{
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.8,
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}>
              {reportLines.map((line, i) => {
                // Título principal
                if (i === 0) return <span key={i} style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'block', marginBottom: 4 }}>{line}</span>
                // Subtítulo (Comercial Cakto)
                if (i === 1) return <span key={i} style={{ fontSize: 13, color: 'var(--text2)', display: 'block' }}>{line}</span>
                // Seções numeradas
                if (/^\d+\.\s[A-Z]/.test(line)) return <span key={i} style={{ fontSize: 15, fontWeight: 800, color: 'var(--action)', display: 'block', marginTop: 20, marginBottom: 4 }}>{line}</span>
                // Divisor
                if (line.startsWith('─')) return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
                // Bullet
                if (line.startsWith('•')) return <span key={i} style={{ display: 'block', paddingLeft: 16, color: 'var(--text)' }}>{line}</span>
                // Nomes numerados (linhas com 1. 2. etc dentro de seções)
                if (/^\d+\.\s/.test(line) && !line.includes('SUMÁRIO') && !line.includes('ATIVAÇÕES') && !line.includes('PERFORMANCE') && !line.includes('ORIGEM') && !line.includes('CALLS') && !line.includes('MOTIVOS')) {
                  return <span key={i} style={{ display: 'block', paddingLeft: 8, color: 'var(--text)' }}>{line}</span>
                }
                // Footer
                if (line.startsWith('Relatório gerado') || line.startsWith('Comercial Cakto')) {
                  return <span key={i} style={{ fontSize: 11, color: 'var(--text2)', display: 'block' }}>{line}</span>
                }
                return <span key={i} style={{ display: 'block' }}>{line}</span>
              })}
            </pre>
          )}
        </div>

        <div style={{ height: 32 }} />
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
