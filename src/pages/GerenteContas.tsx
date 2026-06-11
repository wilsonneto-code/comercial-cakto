import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Video, Trash2, Phone, Calendar, Loader2, CheckCircle, XCircle, Clock, MessageCircle, RefreshCw, ClipboardList, AlertCircle, Database } from 'lucide-react'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Sheet } from '@/components/ui/Sheet'
import { Field, Sel } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase/client'
import { getMbClientes, getMbTpvByEmails, invalidateMbCache } from '@/lib/mbCache'
import { avatarColor } from '@/lib/utils'
import { logActivity } from '@/lib/activityLog'

const DAYS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const DAYS_FULL = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']

const FUNIL_COLORS = {
  Starter:    '#07BA1C',
  Growth:     '#2BB9FF',
  Enterprise: '#BF5AF2',
}

const MEET_STATUS_COLORS: Record<string, string> = {
  Agendada:  'var(--action)',
  Realizada: 'var(--green)',
  Cancelada: 'var(--red)',
  'No-show': 'var(--orange)',
}

// Cores distintas por gerente — usadas no calendário e sidebar
const GERENTE_COLORS: Record<string, string> = {
  '0bfe1dcb-9827-4a2a-8850-8343c53985f5': '#07BA1C', // Carlos Eduardo — verde
  'ea6caf80-fea1-4cd5-b7e0-6a124b783e04': '#2BB9FF', // Gabriel Bairros — azul
  '4923ac02-3f50-49b9-8443-f7e1b0e9f6d6': '#BF5AF2', // Rafael Mendes   — roxo
}
function gerenteColor(gerenteId: string | null): string {
  return (gerenteId && GERENTE_COLORS[gerenteId]) || 'var(--action)'
}

// Opções de resultado da reunião GC
const GC_OUTCOMES = [
  { key: 'ativado',             label: 'Ativado',               color: '#34C759' },
  { key: 'nao_ativado',         label: 'Não Ativado',           color: '#FF3B30' },
  { key: 'churn_recuperado',    label: 'Churn Recuperado',      color: '#5AABB5' },
  { key: 'churn_nao_recuperado',label: 'Churn Não Recuperado',  color: '#FF9F0A' },
  { key: 'onboarding',          label: 'Reunião de Onboarding', color: '#2997FF' },
] as const

type DbUser       = { id: string; name: string; role: string; email?: string }
const KANBAN_COLS = [
  { key: 'Cliente novo',              color: '#6B78FF' },
  { key: 'Cliente atendido',          color: '#2BB9FF' },
  { key: 'Cliente ainda não faturando', color: '#d97706' },
  { key: 'Cliente faturando',         color: '#07BA1C' },
  { key: 'Reunião com Cliente',       color: '#BF5AF2' },
] as const

type KanbanStatus = typeof KANBAN_COLS[number]['key']

type DbActivation = {
  id: string; client: string; email: string; phone: string | null
  responsible: string; date: string; notes: string | null
  faturamento_mensal: number | null; gerente_id: string | null
  gc_status: string; welcome_sent: boolean
}
type Meeting = {
  id: string; activation_id: string | null; gerente_id: string | null
  title: string; date: string; time: string; endTime: string
  status: string; notes: string; clientEmail: string
  google_event_id: string; meet_link: string; gerenteName: string
  gc_outcome: string | null; gc_outcome_notes: string | null
  agendado_por: string | null
}

// Mapeamento inverso: gerente_id → tier (GC ativações seguem o gerente, não o faturamento)
const FUNIL_POR_GERENTE: Record<string, 'Starter' | 'Growth' | 'Enterprise'> = {
  '0bfe1dcb-9827-4a2a-8850-8343c53985f5': 'Starter',    // Carlos Eduardo
  'ea6caf80-fea1-4cd5-b7e0-6a124b783e04': 'Growth',     // Gabriel Bairros
  '4923ac02-3f50-49b9-8443-f7e1b0e9f6d6': 'Enterprise', // Rafael Mendes
}

function funil(fat: number | null, gerenteId?: string | null): 'Starter' | 'Growth' | 'Enterprise' | null {
  // Se há gerente, o tier é determinado pelo gerente (não pelo faturamento)
  if (gerenteId && FUNIL_POR_GERENTE[gerenteId]) return FUNIL_POR_GERENTE[gerenteId]
  if (fat === null || fat === undefined) return null
  if (fat <= 50000)  return 'Starter'
  if (fat <= 250000) return 'Growth'
  return 'Enterprise'
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const GERENTE_POR_FUNIL: Record<string, string> = {
  Starter:    '0bfe1dcb-9827-4a2a-8850-8343c53985f5', // Carlos Eduardo
  Growth:     'ea6caf80-fea1-4cd5-b7e0-6a124b783e04', // Gabriel Bairros
  Enterprise: '4923ac02-3f50-49b9-8443-f7e1b0e9f6d6', // Rafael Mendes
}
function whatsappLink(phone: string | null, clientName: string, gerenteName: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const num = digits.startsWith('55') ? digits : `55${digits}`
  const msg = `Oi, ${clientName}! Tudo bem? 😊

Sou o ${gerenteName}, Gerente de Contas aqui da Cakto. A partir de agora sou eu quem vai estar do seu lado para te ajudar a crescer dentro da plataforma.

Vi aqui que sua conta já está configurada e pronta pra rodar — o time de suporte fez um ótimo trabalho!

Meu papel é simples: acompanhar seus resultados de perto, tirar qualquer dúvida que surgir e te ajudar a escalar suas vendas aqui dentro. Sempre que precisar, pode me chamar diretamente por aqui.

Nos próximos dias vou entrar em contato para bater um papo rápido e entender melhor os seus objetivos — assim a gente consegue traçar o melhor caminho juntos.

Seja muito bem-vindo à Cakto! 🚀`
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
}

function gerentePorFaturamento(fat: number | null): string | null {
  if (!fat) return null
  const tier = funil(fat)
  return tier ? GERENTE_POR_FUNIL[tier] : null
}

const EMPTY_MEET = { activation_id: '', gerente_id: '', title: '', date: '', time: '', endTime: '', status: 'Agendada', notes: '', clientEmail: '' }

export default function GerenteContas() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  if (!hasAnyRole(user, ['Admin', 'Gerente de Contas', 'Social Selling'])) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ textAlign: 'center', padding: 64, color: 'var(--text2)' }}>
          Acesso restrito a Gerentes de Contas.
        </div>
      </>
    )
  }
  return <GCContent />
}

function GCContent() {
  const { user } = useAuth()
  const toast    = useToast()
  const today    = new Date()
  const todayStr = today.toISOString().slice(0,10)

  const isSocialSelling = user?.role === 'Social Selling'
  const [tab, setTab]             = useState<'kanban' | 'funis' | 'agenda' | 'tarefas'>(isSocialSelling ? 'agenda' : 'kanban')
  const [gcConnected, setGcConnected] = useState<boolean | null>(null)
  const [users, setUsers]         = useState<DbUser[]>([])
  const [activations, setActs]    = useState<DbActivation[]>([])
  const [meetings, setMeetings]   = useState<Meeting[]>([])
  const [tpvMap, setTpvMap]       = useState<Record<string, { tpv_mes: number; ultima_venda: string | null }>>({})
  const [tpvLoaded, setTpvLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving]   = useState(false)

  // ── Tasks ──────────────────────────────────────────────────────────────────
  type GcTask = {
    id: string; activation_id: string; gerente_id: string
    client_name: string; client_email: string; phone: string | null
    tipo: string; title: string | null; gc_tier: string | null
    due_date: string; status: string; completed_at: string | null
    completed_by: string | null; notes: string | null
  }
  const TASK_LABEL: Record<string, string> = {
    alterar_taxas:             'Alteração de Taxa',
    d2_boas_vindas:            'Boas Vindas',
    d7_incentivo:              'Followup Ativação',
    d15_manual:                'Acompanhamento Manual',
    d30_ciclo:                 'Resultado do Faturamento',
    acompanhamento_quinzenal:  'Acompanhamento Quinzenal',
    acompanhamento_semanal:    'Acompanhamento Semanal',
    adicionar_carteira:        'Adicionar na Carteira',
  }
  const TIER_COLOR: Record<string, string> = { starter: '#07BA1C', growth: '#2BB9FF', enterprise: '#BF5AF2' }
  const [tasks,        setTasks]        = useState<GcTask[]>([])
  const [taskTab,      setTaskTab]      = useState<'pendentes' | 'relatorio'>('pendentes')
  const [completingId, setCompletingId] = useState<string | null>(null)

  // Filtros
  const [filterGerente, setFilterGerente] = useState('')
  const [filterMonth,   setFilterMonth]   = useState(() => today.toISOString().slice(0, 7))
  const [search,        setSearch]        = useState('')

  // Calendário
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(todayStr)

  // Modais
  const [modalMeet,    setModalMeet]    = useState(false)
  const [editMeet,     setEditMeet]     = useState<Meeting | null>(null)
  const [sheetMeet,    setSheetMeet]    = useState<Meeting | null>(null)
  const [modalClient,  setModalClient]  = useState<DbActivation | null>(null)
  const [clientForm,   setClientForm]   = useState({ faturamento_mensal: '', gerente_id: '' })
  const [meetForm,     setMeetForm]     = useState({ ...EMPTY_MEET })
  // Modal simplificado para agendar reunião direto do card
  const [quickMeetClient, setQuickMeetClient] = useState<DbActivation | null>(null)
  const [quickMeetForm,   setQuickMeetForm]   = useState({ date: '', time: '', endTime: '' })
  // Modal de resultado da reunião GC
  const [outcomeModal,    setOutcomeModal]    = useState<{ meetId: string; outcomeKey: string; label: string; color: string } | null>(null)
  const [outcomeNotes,    setOutcomeNotes]    = useState('')

  // ── Nova Tarefa ──────────────────────────────────────────────────────────
  const EMPTY_TASK_FORM = { activation_id: '', gerente_id: '', tipo: '', title: '', due_date: '', notes: '' }
  const [modalNewTask,  setModalNewTask]  = useState(false)
  const [newTaskForm,   setNewTaskForm]   = useState({ ...EMPTY_TASK_FORM })
  const [isSavingTask,  setIsSavingTask]  = useState(false)

  // ── Bulk Sync CRM ─────────────────────────────────────────────────────────
  type BulkSyncResult = {
    email: string; client: string; tier: string | null; gerente: string
    faturamento_mensal: number; tpv_mes: number
    status: 'ok' | 'error' | 'skip'; leadId?: string; leadAction?: string
    bizAction?: string; bizId?: string; tagAdded?: string; error?: string
  }
  type BulkSyncStats = {
    total: number; ok: number; errors: number; skipped: number
    leadsCreated: number; bizCreated: number; bizExisting: number
    starter: number; growth: number; enterprise: number
    pipelinesFound?: Record<string, string>
  }
  const [modalBulkSync,   setModalBulkSync]   = useState(false)
  const [bulkSyncLoading, setBulkSyncLoading] = useState(false)
  const [bulkSyncStats,   setBulkSyncStats]   = useState<BulkSyncStats | null>(null)
  const [bulkSyncResults, setBulkSyncResults] = useState<BulkSyncResult[]>([])
  const [bulkSyncError,   setBulkSyncError]   = useState<string | null>(null)

  async function syncCRM() {
    setBulkSyncLoading(true)
    setBulkSyncStats(null)
    setBulkSyncResults([])
    setBulkSyncError(null)
    try {
      const { data, error } = await supabase.functions.invoke('bulk-sync-gc', { body: {} })
      if (error) {
        let msg = (error as any)?.message ?? 'Erro desconhecido'
        try { const ctx = (error as any)?.context; if (ctx?.json) { const b = await ctx.json(); msg = b?.error ?? msg } } catch {}
        setBulkSyncError(msg)
      } else {
        setBulkSyncStats((data as any).stats ?? null)
        setBulkSyncResults((data as any).results ?? [])
        if ((data as any).success) toast('Sincronização concluída ✓', 'success')
        else setBulkSyncError((data as any).error ?? 'Erro na sincronização')
      }
    } catch (e) {
      setBulkSyncError(String(e))
    }
    setBulkSyncLoading(false)
  }

  // Verifica se o GC atual tem Google Calendar conectado
  useEffect(() => {
    if (!user?.id) return
    supabase.from('users').select('google_refresh_token').eq('id', user.id).maybeSingle()
      .then(({ data }) => setGcConnected(!!data?.google_refresh_token))
    // Detecta retorno do OAuth
    const params = new URLSearchParams(window.location.search)
    const result = params.get('google_oauth')
    if (result === 'success') { toast('Google Calendar conectado! ✓', 'success'); setGcConnected(true) }
    if (result === 'error')   { toast('Erro ao conectar Google Calendar.', 'error') }
    if (result) window.history.replaceState({}, '', '/gerente-contas')
  }, [user?.id])

  async function connectGoogleCalendar() {
    const { data, error } = await supabase.functions.invoke('google-oauth', {
      body: { user_id: user?.id }, headers: { 'x-action': 'url' }
    })
    // A edge function usa query param action=url
    const res = await fetch(
      `${(supabase as any).supabaseUrl}/functions/v1/google-oauth?action=url`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ user_id: user?.id }) }
    )
    const json = await res.json()
    if (json.url) window.location.href = json.url
    else toast('Erro ao gerar URL de autorização.', 'error')
  }

  async function disconnectGoogleCalendar() {
    await fetch(
      `${(supabase as any).supabaseUrl}/functions/v1/google-oauth?action=disconnect`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ user_id: user?.id }) }
    )
    setGcConnected(false)
    toast('Google Calendar desconectado.', 'info')
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [{ data: usrs }, { data: acts }, { data: mtgs }] = await Promise.all([
        supabase.from('users').select('id,name,role,email').order('name'),
        supabase.from('activations').select('id,client,email,phone,responsible,date,notes,faturamento_mensal,gerente_id,gc_status,welcome_sent').order('date', { ascending: false }),
        supabase.from('followup_meetings').select('*,agendado_por').order('date').order('time'),
      ])
      const userList = (usrs || []) as DbUser[]
      setUsers(userList)
      const actsList = (acts || []) as DbActivation[]
      setActs(actsList)

      // Busca TPV: combina portfólio (account_manager_id) + query direta por email (com cache 4h)
      const emails = actsList.map(a => a.email).filter(Boolean)
      Promise.all([
        getMbClientes(),
        getMbTpvByEmails(emails),
      ]).then(([portfolioClientes, emailTpv]) => {
        const tpv: Record<string, { tpv_mes: number; ultima_venda: string | null }> = {}

        // 1. Dados do portfólio
        ;(portfolioClientes as any[]).forEach(c => {
          if (c.email) tpv[c.email.toLowerCase()] = { tpv_mes: c.tpv_mes ?? 0, ultima_venda: c.ultima_venda ?? null }
        })

        // 2. Query direta por email (cacheada)
        Object.entries(emailTpv).forEach(([email, val]) => {
          const existing = tpv[email]
          if (!existing || val.tpv_mes > existing.tpv_mes)
            tpv[email] = { tpv_mes: val.tpv_mes ?? 0, ultima_venda: val.ultima_venda ?? null }
        })

        setTpvMap(tpv)

        // Move automaticamente para "Cliente faturando" se TPV mês > R$1.000
        const toUpdate = actsList.filter(a => {
          const t = tpv[a.email?.toLowerCase()]
          return t && t.tpv_mes > 1000 && a.gc_status !== 'Cliente faturando'
        })
        if (toUpdate.length > 0) {
          const ids = toUpdate.map(a => a.id)
          supabase.from('activations')
            .update({ gc_status: 'Cliente faturando' })
            .in('id', ids)
            .then(() => {
              setActs(prev => prev.map(a =>
                ids.includes(a.id) ? { ...a, gc_status: 'Cliente faturando' } : a
              ))
            })
        }
        setTpvLoaded(true)
      }).catch(() => setTpvLoaded(true))

      setMeetings(((mtgs || []) as any[]).map(m => ({
        id: m.id, activation_id: m.activation_id, gerente_id: m.gerente_id,
        title: m.title, date: m.date, time: (m.time as string)?.slice(0,5) || '',
        endTime: (m.end_time as string)?.slice(0,5) || '',
        status: m.status, notes: m.notes || '', clientEmail: m.client_email || '',
        google_event_id: m.google_event_id || '', meet_link: m.meet_link || '',
        gerenteName: userList.find(u => u.id === m.gerente_id)?.name || '—',
        gc_outcome: m.gc_outcome ?? null,
        gc_outcome_notes: m.gc_outcome_notes ?? null,
        agendado_por: m.agendado_por ?? null,
      })))
      setIsLoading(false)
    }
    load()
  }, [])

  async function refreshTpv() {
    setIsRefreshing(true)
    setTpvLoaded(false)
    invalidateMbCache()
    const emails = acts.map(a => a.email).filter(Boolean)
    const [portfolioClientes, emailTpv] = await Promise.all([
      getMbClientes(true),
      getMbTpvByEmails(emails, true),
    ])
    const tpv: Record<string, { tpv_mes: number; ultima_venda: string | null }> = {}
    ;(portfolioClientes as any[]).forEach(c => {
      if (c.email) tpv[c.email.toLowerCase()] = { tpv_mes: c.tpv_mes ?? 0, ultima_venda: c.ultima_venda ?? null }
    })
    Object.entries(emailTpv).forEach(([email, val]) => {
      const existing = tpv[email]
      if (!existing || val.tpv_mes > existing.tpv_mes)
        tpv[email] = { tpv_mes: val.tpv_mes ?? 0, ultima_venda: val.ultima_venda ?? null }
    })
    setTpvMap(tpv)
    setTpvLoaded(true)
    setIsRefreshing(false)
  }

  // ── Carrega e conclui tarefas ──────────────────────────────────────────────
  async function loadTasks() {
    const q = supabase.from('gc_tasks').select('*').order('due_date').order('created_at')
    const { data } = hasAnyRole(user, ['Admin']) ? await q : await q.eq('gerente_id', user?.id ?? '')
    if (data) setTasks(data as GcTask[])
  }

  async function completeTask(taskId: string) {
    setCompletingId(taskId)
    const now = new Date().toISOString()
    // Atualiza o estado imediatamente (otimista)
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'concluida', completed_at: now, completed_by: user?.id ?? null } : t
    ))
    const { error } = await supabase.from('gc_tasks').update({
      status: 'concluida', completed_at: now, completed_by: user?.id,
    }).eq('id', taskId)
    if (error) {
      // Rollback se falhou
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'pendente', completed_at: null, completed_by: null } : t
      ))
      toast(error.message, 'error')
    } else {
      void logActivity(user!.id, user!.name, 'status', 'tarefa', taskId, `Concluiu tarefa`)
    }
    setCompletingId(null)
  }

  async function reopenTask(taskId: string) {
    setCompletingId(taskId)
    // Atualiza o estado imediatamente (otimista)
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'pendente', completed_at: null, completed_by: null } : t
    ))
    const { error } = await supabase.from('gc_tasks').update({
      status: 'pendente', completed_at: null, completed_by: null,
    }).eq('id', taskId)
    if (error) {
      // Rollback se falhou
      await loadTasks()
      toast(error.message, 'error')
    }
    setCompletingId(null)
  }

  useEffect(() => { if (user) loadTasks() }, [user])

  const gerentes = users.filter(u => u.role === 'Gerente de Contas')
  const closers  = users.filter(u => u.role === 'Closer')

  // Ativações visíveis: admin vê tudo, gerente vê só as suas
  const visibleActs = useMemo(() => {
    const q = search.toLowerCase()
    return activations.filter(a => {
      if (hasAnyRole(user, ['Admin'])) return true
      return a.gerente_id === user?.id
    })
    .filter(a => !filterGerente || a.gerente_id === filterGerente)
    .filter(a => !filterMonth  || a.date?.slice(0, 7) === filterMonth)
    .filter(a => !q || a.client.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
  }, [activations, user, filterGerente, filterMonth, search])

  const starterList    = visibleActs.filter(a => funil(a.faturamento_mensal, a.gerente_id) === 'Starter')
  const growthList     = visibleActs.filter(a => funil(a.faturamento_mensal, a.gerente_id) === 'Growth')
  const enterpriseList = visibleActs.filter(a => funil(a.faturamento_mensal, a.gerente_id) === 'Enterprise')
  const semFunil       = visibleActs.filter(a => funil(a.faturamento_mensal, a.gerente_id) === null)

  // Calendário
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1)

  function prevMonth() { if (month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  function nextMonth() { if (month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }

  const visibleMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (hasAnyRole(user, ['Admin'])) return true
      if (isSocialSelling) return true   // Social Selling vê todas as reuniões
      return m.gerente_id === user?.id
    })
  }, [meetings, user, isSocialSelling])

  function getMeetingsForDay(day: number) {
    const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return visibleMeetings.filter(m => m.date === dStr)
  }

  // ── Transferir cliente para outro GC ────────────────────────────────────
  async function transferClient(id: string, gerenteId: string) {
    const novoGerente = gerentes.find(g => g.id === gerenteId)
    const { error } = await supabase.from('activations').update({ gerente_id: gerenteId || null }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    const act = activations.find(a => a.id === id)
    setActs(p => p.map(a => a.id === id ? { ...a, gerente_id: gerenteId || null } : a))

    // Atualiza também todas as tarefas pendentes do cliente para o novo GC
    if (gerenteId) {
      await supabase.from('gc_tasks')
        .update({ gerente_id: gerenteId })
        .eq('activation_id', id)
        .neq('status', 'concluida')
      setTasks(prev => prev.map(t =>
        t.activation_id === id && t.status !== 'concluida' ? { ...t, gerente_id: gerenteId } : t
      ))
    }

    toast(`Transferido para ${novoGerente?.name ?? 'sem gerente'} ✓`, 'success')
    void logActivity(user!.id, user!.name, 'update', 'cliente', act?.client ?? id, `Transferiu ${act?.client ?? id} para GC ${novoGerente?.name ?? 'sem gerente'}`)

    // Move o card no DataCrazy para o pipeline GC correto do novo responsável
    if (act && gerenteId) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        void supabase.functions.invoke('sync-datacrazy', {
          body: {
            name:               act.client,
            email:              act.email,
            phone:              act.phone ?? null,
            team_uuid:          null,
            notes:              null,
            image_urls:         [],
            faturamento_mensal: act.faturamento_mensal ?? null,
            channel:            null,
            gc_gerente_id:      gerenteId,
          },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        })
      })
    }
  }

  // ── Move card no Kanban ──────────────────────────────────────────────────
  async function moveKanban(id: string, status: string) {
    const act = activations.find(a => a.id === id)
    const { error } = await supabase.from('activations').update({ gc_status: status }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setActs(p => p.map(a => a.id === id ? { ...a, gc_status: status } : a))
    void logActivity(user!.id, user!.name, 'move', 'kanban', act?.client ?? id, `Moveu ${act?.client ?? id} para "${status}"`)
  }

  async function saveQuickMeeting() {
    if (!quickMeetClient || !quickMeetForm.date || !quickMeetForm.time) {
      toast('Preencha data e horário.', 'error'); return
    }
    setIsSaving(true)
    const clientFirst = quickMeetClient.client.split(' ')[0]
    const gerenteUser  = users.find(u => u.id === quickMeetClient.gerente_id)
    const gerenteName  = gerenteUser?.name || user?.name || '—'
    const gerenteEmail = gerenteUser?.email || user?.email || ''
    const row = {
      title:         `Reunião com ${quickMeetClient.client}`,
      date:          quickMeetForm.date,
      time:          quickMeetForm.time,
      end_time:      quickMeetForm.endTime || null,
      gerente_id:    quickMeetClient.gerente_id || user?.id,
      activation_id: quickMeetClient.id,
      client_email:  quickMeetClient.email,
      status:        'Agendada',
      notes:         '',
      agendado_por:  user?.id ?? null,
    }
    const { data, error } = await supabase.from('followup_meetings').insert(row).select().single()
    setIsSaving(false)
    if (error) { toast(error.message, 'error'); return }
    const newM: Meeting = {
      id: (data as any).id, activation_id: quickMeetClient.id,
      gerente_id: row.gerente_id || null, title: row.title,
      date: row.date, time: row.time, endTime: quickMeetForm.endTime,
      status: 'Agendada', notes: '', clientEmail: quickMeetClient.email,
      google_event_id: '', meet_link: '', gerenteName,
      gc_outcome: null, gc_outcome_notes: null, agendado_por: user?.id ?? null,
    }
    setMeetings(p => [...p, newM])
    toast('Reunião agendada!', 'success')
    void logActivity(user!.id, user!.name, 'create', 'reuniao', quickMeetClient.client, `Agendou reunião com ${quickMeetClient.client} em ${quickMeetForm.date}`)
    setQuickMeetClient(null)
    setQuickMeetForm({ date: '', time: '', endTime: '' })

    // Google Calendar
    supabase.functions.invoke('schedule-call', {
      body: {
        action: 'create', title: row.title,
        date: row.date, time: row.time, end_time: quickMeetForm.endTime || '',
        closerName: gerenteName, closerEmail: gerenteEmail,
        clientEmail: quickMeetClient.email, notes: '',
      },
    }).then(async ({ data: fnData, error: fnErr }) => {
      if (fnErr) {
        let msg = (fnErr as any)?.message ?? ''
        try { const ctx = (fnErr as any)?.context; if (ctx?.json) { const b = await ctx.json(); msg = b?.error ?? msg } } catch {}
        console.error('[GCal error]', fnErr)
        toast(`Erro GCal: ${msg}`, 'error'); return
      }
      const { eventId, meetLink, error: fnBodyErr, _debug } = (fnData || {}) as any
      if (fnBodyErr) { toast(`Erro GCal: ${fnBodyErr}`, 'error'); return }
      if (_debug) console.log('[GCal debug]', _debug)
      const { skipped } = (fnData || {}) as any
      if (skipped) { toast('Gerente sem Google Calendar conectado', 'error'); return }
      if (eventId) {
        await supabase.from('followup_meetings').update({ google_event_id: eventId, meet_link: meetLink ?? '' }).eq('id', newM.id)
        setMeetings(p => p.map(m => m.id === newM.id ? { ...m, google_event_id: eventId, meet_link: meetLink ?? '' } : m))
        toast('Google Calendar sincronizado ✓', 'success')
      }
    })
  }

  async function confirmWelcomeSent(id: string) {
    const { error } = await supabase.from('activations').update({ welcome_sent: true }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    const act = activations.find(a => a.id === id)
    setActs(p => p.map(a => a.id === id ? { ...a, welcome_sent: true } : a))
    toast('Mensagem de boas-vindas confirmada ✓', 'success')
    void logActivity(user!.id, user!.name, 'status', 'cliente', act?.client ?? id, `Confirmou envio de boas-vindas para ${act?.client ?? id}`)
  }

  // ── Cria nova tarefa manualmente ─────────────────────────────────────────
  async function saveNewTask() {
    if (!newTaskForm.activation_id || !newTaskForm.gerente_id || !newTaskForm.tipo || !newTaskForm.title || !newTaskForm.due_date) {
      toast('Preencha todos os campos obrigatórios.', 'error'); return
    }
    setIsSavingTask(true)
    const act  = activations.find(a => a.id === newTaskForm.activation_id)
    const tier = act ? (funil(act.faturamento_mensal)?.toLowerCase() ?? null) : null
    const row = {
      activation_id: newTaskForm.activation_id,
      gerente_id:    newTaskForm.gerente_id,
      client_email:  act?.email ?? '',
      client_name:   act?.client ?? null,
      phone:         act?.phone ?? null,
      tipo:          newTaskForm.tipo,
      title:         newTaskForm.title,
      gc_tier:       tier,
      due_date:      newTaskForm.due_date,
      status:        'pendente',
      notes:         newTaskForm.notes || null,
    }
    const { error } = await supabase.from('gc_tasks').insert(row)
    setIsSavingTask(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Tarefa criada! ✓', 'success')
    setModalNewTask(false)
    setNewTaskForm({ activation_id: '', gerente_id: '', tipo: '', title: '', due_date: '', notes: '' })
    await loadTasks()
  }

  // ── Save client (faturamento + gerente) ─────────────────────────────────
  async function saveClient() {
    if (!modalClient) return
    setIsSaving(true)
    const patch: any = {}
    if (clientForm.faturamento_mensal !== '') {
      const fat = parseFloat(clientForm.faturamento_mensal.replace(/\./g,'').replace(',','.')) || null
      patch.faturamento_mensal = fat
      // Auto-atribui gerente conforme funil, mas permite sobrescrever manualmente
      patch.gerente_id = clientForm.gerente_id || gerentePorFaturamento(fat)
    } else if (clientForm.gerente_id !== '') {
      patch.gerente_id = clientForm.gerente_id || null
    }
    const { error } = await supabase.from('activations').update(patch).eq('id', modalClient.id)
    setIsSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setActs(p => p.map(a => a.id === modalClient.id ? { ...a, ...patch } : a))
    toast('Cliente atualizado!', 'success')
    void logActivity(user!.id, user!.name, 'update', 'cliente', modalClient.client, `Editou dados de ${modalClient.client} (fat/gerente)`)
    setModalClient(null)
  }

  // ── Save meeting ─────────────────────────────────────────────────────────
  async function saveMeeting() {
    if (!meetForm.title || !meetForm.date || !meetForm.gerente_id) {
      toast('Preencha título, data e gerente.', 'error'); return
    }
    setIsSaving(true)
    const gerenteUser  = users.find(u => u.id === meetForm.gerente_id)
    const gerenteName  = gerenteUser?.name || '—'
    const gerenteEmail = gerenteUser?.email || ''

    if (editMeet) {
      const patch = {
        title: meetForm.title, date: meetForm.date, time: meetForm.time || '09:00',
        end_time: meetForm.endTime || null, gerente_id: meetForm.gerente_id,
        status: meetForm.status, notes: meetForm.notes, client_email: meetForm.clientEmail,
        activation_id: meetForm.activation_id || null,
      }
      const { error } = await supabase.from('followup_meetings').update(patch).eq('id', editMeet.id)
      setIsSaving(false)
      if (error) { toast(error.message, 'error'); return }
      setMeetings(p => p.map(m => m.id === editMeet.id ? { ...m, ...patch, endTime: meetForm.endTime, gerenteName } : m))
      toast('Reunião atualizada!', 'success')
    } else {
      const row = {
        title: meetForm.title, date: meetForm.date, time: meetForm.time || '09:00',
        end_time: meetForm.endTime || null, gerente_id: meetForm.gerente_id,
        status: meetForm.status, notes: meetForm.notes, client_email: meetForm.clientEmail,
        activation_id: meetForm.activation_id || null,
        agendado_por: user?.id ?? null,
      }
      const { data, error } = await supabase.from('followup_meetings').insert(row).select().single()
      setIsSaving(false)
      if (error) { toast(error.message, 'error'); return }
      const newM: Meeting = { id: (data as any).id, activation_id: meetForm.activation_id || null,
        gerente_id: meetForm.gerente_id, title: meetForm.title, date: meetForm.date,
        time: meetForm.time, endTime: meetForm.endTime, status: meetForm.status,
        notes: meetForm.notes, clientEmail: meetForm.clientEmail,
        google_event_id: '', meet_link: '', gerenteName,
        gc_outcome: null, gc_outcome_notes: null, agendado_por: user?.id ?? null }
      setMeetings(p => [...p, newM])
      toast('Reunião agendada!', 'success')

      // Google Calendar
      supabase.functions.invoke('schedule-call', {
        body: {
          action: 'create', title: meetForm.title, date: meetForm.date,
          time: meetForm.time || '09:00', end_time: meetForm.endTime || '',
          closerName: gerenteName, closerEmail: gerenteEmail,
          clientEmail: meetForm.clientEmail || '', notes: meetForm.notes,
        },
      }).then(async ({ data: fnData, error: fnErr }) => {
        if (fnErr) {
          let msg = (fnErr as any)?.message ?? ''
          try { const ctx = (fnErr as any)?.context; if (ctx?.json) { const b = await ctx.json(); msg = b?.error ?? msg } } catch {}
          console.error('[GCal error]', fnErr)
          toast(`Erro GCal: ${msg}`, 'error'); return
        }
        const { eventId, meetLink, error: fnBodyErr, skipped } = (fnData || {}) as any
        if (fnBodyErr) { toast(`Erro GCal: ${fnBodyErr}`, 'error'); return }
        if (skipped) { toast('Gerente sem Google Calendar conectado', 'error'); return }
        if (eventId) {
          await supabase.from('followup_meetings').update({ google_event_id: eventId, meet_link: meetLink ?? '' }).eq('id', newM.id)
          setMeetings(p => p.map(m => m.id === newM.id ? { ...m, google_event_id: eventId, meet_link: meetLink ?? '' } : m))
          toast('Google Calendar sincronizado ✓', 'success')
        }
      })
    }
    setModalMeet(false)
    setEditMeet(null)
    setMeetForm({ ...EMPTY_MEET })
  }

  async function deleteMeeting(m: Meeting) {
    if (!window.confirm('Apagar esta reunião?')) return
    const { error } = await supabase.from('followup_meetings').delete().eq('id', m.id)
    if (error) { toast(error.message, 'error'); return }
    setMeetings(p => p.filter(x => x.id !== m.id))
    setSheetMeet(null)
    toast('Reunião apagada.', 'info')
    if (m.google_event_id) supabase.functions.invoke('schedule-call', { body: { action: 'delete', google_event_id: m.google_event_id } })
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('followup_meetings').update({ status }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setMeetings(p => p.map(m => m.id === id ? { ...m, status } : m))
    setSheetMeet(prev => prev?.id === id ? { ...prev, status } : prev)
    toast(`Status: ${status}`, 'success')
  }

  async function saveOutcome() {
    if (!outcomeModal) return
    const { meetId, outcomeKey } = outcomeModal
    const { error } = await supabase.from('followup_meetings').update({
      gc_outcome: outcomeKey,
      gc_outcome_notes: outcomeNotes || null,
    }).eq('id', meetId)
    if (error) { toast(error.message, 'error'); return }
    setMeetings(p => p.map(m => m.id === meetId ? { ...m, gc_outcome: outcomeKey, gc_outcome_notes: outcomeNotes || null } : m))
    setSheetMeet(prev => prev?.id === meetId ? { ...prev, gc_outcome: outcomeKey, gc_outcome_notes: outcomeNotes || null } : prev)
    toast(`Resultado registrado: ${outcomeModal.label}`, 'success')
    setOutcomeModal(null)
    setOutcomeNotes('')
  }

  function openNewMeet(clientEmail = '', activationId = '') {
    setEditMeet(null)
    setMeetForm({ ...EMPTY_MEET, clientEmail, activation_id: activationId, gerente_id: user?.role === 'Gerente de Contas' ? user.id : '' })
    setModalMeet(true)
  }

  function openEditMeet(m: Meeting) {
    setEditMeet(m)
    setMeetForm({ title: m.title, date: m.date, time: m.time, endTime: m.endTime, status: m.status, notes: m.notes, clientEmail: m.clientEmail, gerente_id: m.gerente_id || '', activation_id: m.activation_id || '' })
    setSheetMeet(null)
    setModalMeet(true)
  }

  function ClientCard({ a }: { a: DbActivation }) {
    const f = funil(a.faturamento_mensal, a.gerente_id)
    const color = f ? FUNIL_COLORS[f] : 'var(--border)'
    const closer = users.find(u => u.id === a.responsible)?.name || '—'
    const gerente = users.find(u => u.id === a.gerente_id)?.name
    const clientMeetings = visibleMeetings.filter(m => m.activation_id === a.id)
    return (
      <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14, borderLeft: `3px solid ${color}`, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.client}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{a.email}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>Closer: <b>{closer.split(' ')[0]}</b></span>
              {gerente && <span style={{ fontSize: 11, color: 'var(--action)' }}>GC: <b>{gerente.split(' ')[0]}</b></span>}
              {a.faturamento_mensal != null && (
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{BRL(a.faturamento_mensal)}/mês</span>
              )}
            </div>
            {/* TPV do mês */}
            {(() => {
              const emailKey = a.email?.toLowerCase()
              const tpv = emailKey ? tpvMap[emailKey] : undefined
              if (!tpvLoaded) return (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--bg-card2)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '4px 8px' }}>
                  <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>TPV mês</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>…</span>
                </div>
              )
              return (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                  background: tpv && tpv.tpv_mes > 0 ? '#34C75915' : 'var(--bg-card2)',
                  border: `1px solid ${tpv && tpv.tpv_mes > 0 ? '#34C75940' : 'var(--border)'}`,
                  borderRadius: 6, padding: '4px 8px' }}>
                  <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>TPV mês</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: tpv && tpv.tpv_mes > 0 ? '#34C759' : 'var(--text2)' }}>
                    {tpv ? BRL(tpv.tpv_mes) : 'R$0'}
                  </span>
                  {tpv?.ultima_venda && (
                    <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 2 }}>
                      · {new Date(tpv.ultima_venda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  )}
                </div>
              )
            })()}
            {clientMeetings.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {clientMeetings.slice(0,2).map(m => (
                  <span key={m.id} onClick={e => { e.stopPropagation(); setSheetMeet(m) }}
                    style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, cursor: 'pointer',
                      background: `color-mix(in srgb, ${MEET_STATUS_COLORS[m.status] || 'var(--border)'} 15%, var(--bg-card2))`,
                      color: MEET_STATUS_COLORS[m.status] || 'var(--text2)',
                      border: `1px solid ${MEET_STATUS_COLORS[m.status] || 'var(--border)'}`,
                      fontWeight: 600 }}>
                    {m.date} {m.status}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <button onClick={() => { setModalClient(a); setClientForm({ faturamento_mensal: a.faturamento_mensal?.toString() || '', gerente_id: a.gerente_id || '' }) }}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text2)', fontFamily: 'inherit' }}>
              Editar
            </button>
            <button onClick={() => openNewMeet(a.email, a.id)}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 10%, var(--bg-card))`, cursor: 'pointer', color, fontFamily: 'inherit', fontWeight: 700 }}>
              + Reunião
            </button>
          </div>
        </div>
      </div>
    )
  }

  function FunilColumn({ title, items, color }: { title: string; items: DbActivation[]; color: string }) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: `color-mix(in srgb, ${color} 12%, var(--bg-card2))`, border: `1px solid ${color}` }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontWeight: 800, fontSize: 14, color }}>{title}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color }}>{items.length}</span>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', paddingRight: 4 }}>
          {items.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '24px 0' }}>Nenhum cliente</div>}
          {items.map(a => <ClientCard key={a.id} a={a} />)}
        </div>
      </div>
    )
  }

  if (isLoading) return (
    <>
      <Header />
      <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14 }}>Carregando…</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Cabeçalho ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Gerente de Contas</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Busca por nome */}
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="inp"
              style={{ fontSize: 13, padding: '6px 12px', width: 200 }}
            />
            {/* Filtro de mês */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="month"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="inp"
                style={{ fontSize: 13, padding: '6px 10px', width: 148 }}
              />
              {filterMonth && (
                <button onClick={() => setFilterMonth('')}
                  title="Ver todos os meses"
                  style={{ fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card2)', cursor: 'pointer', color: 'var(--text2)', fontFamily: 'inherit' }}>
                  Todos
                </button>
              )}
            </div>
            {hasAnyRole(user, ['Admin']) && (
              <Sel value={filterGerente} onChange={setFilterGerente}
                options={gerentes.map(g => ({ value: g.id, label: g.name }))}
                placeholder="Todos os gerentes" />
            )}
            {/* Conexão Google Calendar */}
            {gcConnected === false && (
              <button onClick={connectGoogleCalendar} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                borderRadius: 8, border: '1px solid #4285F4', cursor: 'pointer',
                background: 'color-mix(in srgb, #4285F4 12%, var(--bg-card))',
                color: '#4285F4', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032c0-3.331,2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/></svg>
                Conectar Google Calendar
              </button>
            )}
            {gcConnected === true && (
              <button onClick={disconnectGoogleCalendar} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                borderRadius: 8, border: '1px solid var(--green)', cursor: 'pointer',
                background: 'color-mix(in srgb, var(--green) 10%, var(--bg-card))',
                color: 'var(--green)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
              }}>
                ✓ Google Calendar conectado
              </button>
            )}
            <button onClick={refreshTpv} disabled={isRefreshing} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 8, border: '1px solid var(--border)', cursor: isRefreshing ? 'default' : 'pointer',
              background: 'var(--bg-card)', color: 'var(--text2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
              opacity: isRefreshing ? 0.7 : 1,
            }}>
              <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              {isRefreshing ? 'Atualizando…' : 'Atualizar TPV'}
            </button>
            {hasAnyRole(user, ['Admin']) && (
              <button onClick={() => { setModalBulkSync(true); setBulkSyncStats(null); setBulkSyncResults([]); setBulkSyncError(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                  borderRadius: 8, border: '1px solid var(--purple)', cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--purple) 10%, var(--bg-card))',
                  color: 'var(--purple)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
                <Database size={14} />
                Sincronizar CRM
              </button>
            )}
            <Button icon={Plus} onClick={() => openNewMeet()}>Nova Reunião</Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' }}>
          {([['kanban','Kanban'],['funis','Funis de Clientes'],['agenda','Agenda'],['tarefas','Tarefas']] as const)
            .filter(([k]) => !isSocialSelling || k === 'agenda')
            .map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: tab === k ? 'var(--action)' : 'transparent',
              color: tab === k ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13,
            }}>{l}</button>
          ))}
        </div>

        {/* ══ ABA KANBAN ════════════════════════════════════════════════════ */}
        {tab === 'kanban' && (
          <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
            <div style={{ display: 'flex', gap: 14, minWidth: 'max-content' }}>
              {KANBAN_COLS.map(col => {
                const cards = visibleActs.filter(a => (a.gc_status || 'Cliente novo') === col.key)
                return (
                  <div key={col.key} style={{ width: 260, flexShrink: 0 }}>
                    {/* Cabeçalho da coluna */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: `color-mix(in srgb, ${col.color} 12%, var(--bg-card2))`,
                      border: `1px solid ${col.color}` }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 800, fontSize: 13, color: col.color, flex: 1 }}>{col.key}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: col.color,
                        background: `color-mix(in srgb, ${col.color} 20%, var(--bg-card2))`,
                        borderRadius: 20, padding: '1px 8px' }}>{cards.length}</span>
                    </div>

                    {/* Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: 4 }}>
                      {cards.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '20px 0', borderRadius: 10, border: '1px dashed var(--border)' }}>
                          Nenhum cliente
                        </div>
                      )}
                      {cards.map(a => {
                        const f      = funil(a.faturamento_mensal, a.gerente_id)
                        const fColor = f ? FUNIL_COLORS[f] : 'var(--border)'
                        const closer = users.find(u => u.id === a.responsible)?.name || '—'
                        const gerente = users.find(u => u.id === a.gerente_id)?.name
                        const clientMeetings = visibleMeetings.filter(m => m.activation_id === a.id)
                        const colIdx = KANBAN_COLS.findIndex(c => c.key === col.key)
                        return (
                          <div key={a.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, borderTop: `3px solid ${col.color}` }}>
                            {/* Nome + funil */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.client}</div>
                              {f && <span style={{ fontSize: 10, fontWeight: 700, color: fColor, background: `color-mix(in srgb, ${fColor} 15%, var(--bg-card2))`, borderRadius: 20, padding: '2px 7px', flexShrink: 0 }}>{f}</span>}
                            </div>

                            {/* Infos */}
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{a.email}</div>
                            <div style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span>Closer: <b>{closer.split(' ')[0]}</b></span>
                              {gerente && <span style={{ color: 'var(--action)' }}>GC: <b>{gerente.split(' ')[0]}</b></span>}
                              {a.faturamento_mensal != null && <span style={{ color: fColor, fontWeight: 700 }}>{BRL(a.faturamento_mensal)}/mês</span>}
                            </div>

                            {/* TPV do mês */}
                            {(() => {
                              const emailKey = a.email?.toLowerCase()
                              const tpv = emailKey ? tpvMap[emailKey] : undefined
                              if (!tpvLoaded) return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                                  background: 'var(--bg-card2)', border: '1px solid var(--border)',
                                  borderRadius: 6, padding: '4px 8px' }}>
                                  <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>TPV mês</span>
                                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>…</span>
                                </div>
                              )
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                                  background: tpv && tpv.tpv_mes > 0 ? '#34C75915' : 'var(--bg-card2)',
                                  border: `1px solid ${tpv && tpv.tpv_mes > 0 ? '#34C75940' : 'var(--border)'}`,
                                  borderRadius: 6, padding: '4px 8px' }}>
                                  <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>TPV mês</span>
                                  <span style={{ fontSize: 12, fontWeight: 800, color: tpv && tpv.tpv_mes > 0 ? '#34C759' : 'var(--text2)' }}>
                                    {tpv ? BRL(tpv.tpv_mes) : 'R$0'}
                                  </span>
                                  {tpv?.ultima_venda && (
                                    <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 2 }}>
                                      · {new Date(tpv.ultima_venda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Reuniões */}
                            {clientMeetings.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                {clientMeetings.slice(0,2).map(m => (
                                  <span key={m.id} onClick={e => { e.stopPropagation(); setSheetMeet(m) }}
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, cursor: 'pointer',
                                      background: `color-mix(in srgb, ${MEET_STATUS_COLORS[m.status] || 'var(--border)'} 15%, var(--bg-card2))`,
                                      color: MEET_STATUS_COLORS[m.status] || 'var(--text2)',
                                      border: `1px solid ${MEET_STATUS_COLORS[m.status] || 'var(--border)'}`,
                                      fontWeight: 600 }}>
                                    {m.date.slice(5)} {m.status}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* WhatsApp — só na coluna Cliente novo */}
                            {col.key === 'Cliente novo' && (() => {
                              const waLink = whatsappLink(a.phone, a.client.split(' ')[0], gerente || 'Gerente')
                              if (a.welcome_sent) {
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    background: 'color-mix(in srgb, #25D366 12%, var(--bg-card2))',
                                    color: '#25D366', border: '1px solid #25D366' }}>
                                    <MessageCircle size={13} /> Boas-vindas enviada ✓
                                  </div>
                                )
                              }
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                  {waLink ? (
                                    <a href={waLink} target="_blank" rel="noreferrer"
                                      style={{ display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '8px 12px', borderRadius: 8,
                                        background: 'color-mix(in srgb, #25D366 15%, var(--bg-card2))',
                                        border: '1px solid #25D366', color: '#25D366',
                                        fontWeight: 700, fontSize: 12, textDecoration: 'none',
                                        justifyContent: 'center' }}>
                                      <MessageCircle size={14} />
                                      Enviar mensagem de boas-vindas
                                    </a>
                                  ) : (
                                    <div style={{ fontSize: 11, color: 'var(--orange)', textAlign: 'center' }}>
                                      Sem telefone cadastrado
                                    </div>
                                  )}
                                  <button onClick={() => confirmWelcomeSent(a.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                      border: '1px dashed #25D366', background: 'transparent',
                                      color: '#25D366', fontWeight: 600, fontSize: 11, fontFamily: 'inherit' }}>
                                    ✓ Confirmei que enviei a mensagem
                                  </button>
                                </div>
                              )
                            })()}

                            {/* Ações */}
                            <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, flexWrap: 'wrap' }}>
                              {colIdx > 0 && (
                                <button onClick={() => moveKanban(a.id, KANBAN_COLS[colIdx - 1].key)}
                                  style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card2)', cursor: 'pointer', color: 'var(--text2)', fontFamily: 'inherit' }}>
                                  ← Voltar
                                </button>
                              )}
                              <button onClick={() => { setQuickMeetClient(a); setQuickMeetForm({ date: '', time: '', endTime: '' }) }}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: `1px solid ${col.color}`, background: `color-mix(in srgb, ${col.color} 10%, var(--bg-card))`, cursor: 'pointer', color: col.color, fontFamily: 'inherit', fontWeight: 700 }}>
                                + Reunião
                              </button>
                              {colIdx < KANBAN_COLS.length - 1 && (() => {
                                const blocked = col.key === 'Cliente novo' && !a.welcome_sent
                                return (
                                  <button
                                    onClick={() => !blocked && moveKanban(a.id, KANBAN_COLS[colIdx + 1].key)}
                                    title={blocked ? 'Confirme o envio da mensagem de boas-vindas primeiro' : ''}
                                    style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6,
                                      border: '1px solid var(--border)', background: 'var(--bg-card2)',
                                      cursor: blocked ? 'not-allowed' : 'pointer',
                                      color: blocked ? 'var(--border)' : 'var(--text2)',
                                      fontFamily: 'inherit', opacity: blocked ? 0.4 : 1 }}>
                                    Avançar →
                                  </button>
                                )
                              })()}
                              {/* Mover coluna */}
                              <select value={col.key} onChange={e => moveKanban(a.id, e.target.value)}
                                style={{ fontSize: 10, padding: '3px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', maxWidth: 80 }}>
                                {KANBAN_COLS.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
                              </select>
                            </div>

                            {/* Transferir GC — visível para Admin ou se o GC quiser transferir para si */}
                            {gerentes.length > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>GC:</span>
                                <select
                                  value={a.gerente_id || ''}
                                  onChange={e => transferClient(a.id, e.target.value)}
                                  style={{ flex: 1, fontSize: 10, padding: '3px 5px', borderRadius: 6,
                                    border: '1px solid var(--border)', background: 'var(--bg-card2)',
                                    color: a.gerente_id ? 'var(--action)' : 'var(--text2)',
                                    cursor: 'pointer', fontFamily: 'inherit' }}>
                                  <option value=''>Sem gerente</option>
                                  {gerentes.map(g => <option key={g.id} value={g.id}>{g.name.split(' ')[0]}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ ABA FUNIS ══════════════════════════════════════════════════════ */}
        {tab === 'funis' && (
          <>
            {semFunil.length > 0 && (
              <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'color-mix(in srgb, var(--orange) 12%, var(--bg-card2))', border: '1px solid var(--orange)', fontSize: 13 }}>
                <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{semFunil.length} cliente{semFunil.length > 1 ? 's' : ''}</span>
                <span style={{ color: 'var(--text2)' }}> sem faturamento definido — edite para classificar no funil correto.</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <FunilColumn title="Starter" items={starterList} color={FUNIL_COLORS.Starter} />
              <FunilColumn title="Growth" items={growthList} color={FUNIL_COLORS.Growth} />
              <FunilColumn title="Enterprise" items={enterpriseList} color={FUNIL_COLORS.Enterprise} />
            </div>
          </>
        )}

        {/* ══ ABA AGENDA ════════════════════════════════════════════════════ */}
        {tab === 'agenda' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
            {/* Calendário */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6 }}><ChevronLeft size={18} /></button>
                  <span style={{ fontWeight: 700, fontSize: 15, minWidth: 160, textAlign: 'center' }}>{MONTHS[month]} {year}</span>
                  <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6 }}><ChevronRight size={18} /></button>
                </div>
                <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDate(todayStr) }}
                  style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit' }}>Hoje</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text2)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '.04em' }}>{d}</div>
                ))}
                {cells.map((day, i) => {
                  if (!day) return <div key={`e${i}`} />
                  const dayMeets = getMeetingsForDay(day)
                  const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                  const isToday = dStr === todayStr
                  return (
                    <div key={day} onClick={() => setSelectedDate(dStr)}
                      style={{ minHeight: 64, padding: 4, borderRadius: 8, cursor: 'pointer',
                        background: selectedDate === dStr ? 'color-mix(in srgb, var(--action) 15%, var(--bg-card2))' : isToday ? 'color-mix(in srgb, var(--action) 8%, transparent)' : 'transparent',
                        border: isToday ? '1px solid var(--action)' : '1px solid transparent' }}>
                      <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--action)' : 'var(--text)', marginBottom: 2 }}>{day}</div>
                      {dayMeets.slice(0,2).map(m => {
                        const color = gerenteColor(m.gerente_id)
                        return (
                          <div key={m.id} onClick={e => { e.stopPropagation(); setSheetMeet(m) }}
                            style={{ fontSize: 10, borderRadius: 4, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: `color-mix(in srgb, ${color} 22%, transparent)`, border: `1px solid ${color}`, color }}>
                            {m.time} {m.title}
                          </div>
                        )
                      })}
                      {dayMeets.length > 2 && <div style={{ fontSize: 9, color: 'var(--text2)' }}>+{dayMeets.length-2}</div>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sidebar: reuniões do dia selecionado */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                  <button onClick={() => openNewMeet('', '')}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--action)', background: 'color-mix(in srgb, var(--action) 12%, var(--bg-card))', color: 'var(--action)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Plus size={12} /> Nova
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleMeetings.filter(m => m.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time)).length === 0
                    ? <div style={{ fontSize: 13, color: 'var(--text2)' }}>Nenhuma reunião neste dia.</div>
                    : visibleMeetings.filter(m => m.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time)).map(m => {
                        const color = gerenteColor(m.gerente_id)
                        return (
                          <div key={m.id} onClick={() => setSheetMeet(m)}
                            style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 10, cursor: 'pointer', borderLeft: `3px solid ${color}` }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{m.time}{m.endTime ? ` – ${m.endTime}` : ''}</div>
                            <div style={{ fontSize: 11, color, fontWeight: 700 }}>{m.gerenteName.split(' ')[0]}</div>
                          </div>
                        )
                      })
                  }
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Calendar size={16} color="var(--green)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Google Calendar</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                  Reuniões sincronizadas automaticamente com o Google Calendar dos gerentes.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Agendar reunião rápida ── */}
        <Modal open={!!quickMeetClient} onClose={() => setQuickMeetClient(null)}
          title={`Agendar Reunião — ${quickMeetClient?.client}`}>
          {quickMeetClient && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg-card2)', fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{quickMeetClient.client}</div>
                <div style={{ color: 'var(--text2)', fontSize: 12 }}>{quickMeetClient.email}</div>
                {quickMeetClient.phone && <div style={{ color: 'var(--text2)', fontSize: 12 }}>{quickMeetClient.phone}</div>}
                {quickMeetClient.gerente_id && (
                  <div style={{ color: 'var(--action)', fontSize: 12, marginTop: 4 }}>
                    GC: {users.find(u => u.id === quickMeetClient.gerente_id)?.name}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Data *">
                  <input className="inp" type="date" value={quickMeetForm.date}
                    onChange={e => setQuickMeetForm(p => ({ ...p, date: e.target.value }))} />
                </Field>
                <Field label="Início *">
                  <input className="inp" type="time" value={quickMeetForm.time}
                    onChange={e => setQuickMeetForm(p => ({ ...p, time: e.target.value }))} />
                </Field>
                <Field label="Fim">
                  <input className="inp" type="time" value={quickMeetForm.endTime}
                    onChange={e => setQuickMeetForm(p => ({ ...p, endTime: e.target.value }))} />
                </Field>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card2)' }}>
                O título, cliente e gerente serão preenchidos automaticamente. A reunião será sincronizada com o Google Calendar.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setQuickMeetClient(null)}>Cancelar</Button>
                <Button onClick={saveQuickMeeting} disabled={isSaving || !quickMeetForm.date || !quickMeetForm.time}>
                  {isSaving ? 'Agendando…' : 'Agendar Reunião'}
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* ── Modal: Editar cliente ── */}
        <Modal open={!!modalClient} onClose={() => setModalClient(null)} title={`Cliente — ${modalClient?.client}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Faturamento Mensal (R$)">
              <input className="inp" value={clientForm.faturamento_mensal}
                onChange={e => setClientForm(p => ({ ...p, faturamento_mensal: e.target.value }))}
                placeholder="Ex: 75000" type="number" />
            </Field>
            {clientForm.faturamento_mensal && (() => {
              const fat  = parseFloat(clientForm.faturamento_mensal) || 0
              const tier = funil(fat) || 'Starter'
              const gId  = GERENTE_POR_FUNIL[tier]
              const gName = users.find(u => u.id === gId)?.name || '—'
              return (
                <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card2)', display: 'flex', gap: 12 }}>
                  <span>Funil: <span style={{ fontWeight: 700, color: FUNIL_COLORS[tier] }}>{tier}</span></span>
                  <span style={{ color: 'var(--text2)' }}>Gerente: <span style={{ fontWeight: 700, color: 'var(--action)' }}>{gName}</span></span>
                </div>
              )
            })()}
            <Field label="Gerente de Contas">
              <Sel value={clientForm.gerente_id} onChange={v => setClientForm(p => ({ ...p, gerente_id: v }))}
                options={gerentes.map(g => ({ value: g.id, label: g.name }))}
                placeholder="Selecione o gerente" />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setModalClient(null)}>Cancelar</Button>
              <Button onClick={saveClient} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        </Modal>

        {/* ── Modal: Nova / Editar Reunião ── */}
        <Modal open={modalMeet} onClose={() => { setModalMeet(false); setEditMeet(null) }} title={editMeet ? 'Editar Reunião' : 'Nova Reunião'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Título">
              <input className="inp" value={meetForm.title} onChange={e => setMeetForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Follow-up — João Silva" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Data"><input className="inp" type="date" value={meetForm.date} onChange={e => setMeetForm(p => ({ ...p, date: e.target.value }))} /></Field>
              <Field label="Início"><input className="inp" type="time" value={meetForm.time} onChange={e => setMeetForm(p => ({ ...p, time: e.target.value }))} /></Field>
              <Field label="Fim"><input className="inp" type="time" value={meetForm.endTime} onChange={e => setMeetForm(p => ({ ...p, endTime: e.target.value }))} /></Field>
            </div>
            <Field label="Gerente de Contas">
              <Sel value={meetForm.gerente_id} onChange={v => setMeetForm(p => ({ ...p, gerente_id: v }))}
                options={gerentes.map(g => ({ value: g.id, label: g.name }))} placeholder="Selecione o gerente" />
            </Field>
            <Field label="Vincular Cliente (opcional)">
              <Sel value={meetForm.activation_id} onChange={v => setMeetForm(p => ({ ...p, activation_id: v }))}
                options={activations.map(a => ({ value: a.id, label: a.client }))} placeholder="Selecione o cliente" />
            </Field>
            <Field label="E-mail do cliente">
              <input className="inp" type="email" value={meetForm.clientEmail} onChange={e => setMeetForm(p => ({ ...p, clientEmail: e.target.value }))} placeholder="cliente@email.com" />
            </Field>
            <Field label="Status">
              <Sel value={meetForm.status} onChange={v => setMeetForm(p => ({ ...p, status: v }))}
                options={['Agendada','Realizada','Cancelada','No-show']} placeholder="Status" />
            </Field>
            <Field label="Notas">
              <textarea className="inp" rows={2} value={meetForm.notes} onChange={e => setMeetForm(p => ({ ...p, notes: e.target.value }))} placeholder="Anotações…" style={{ resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { setModalMeet(false); setEditMeet(null) }}>Cancelar</Button>
              <Button onClick={saveMeeting} disabled={isSaving}>{isSaving ? 'Salvando…' : editMeet ? 'Salvar' : 'Agendar'}</Button>
            </div>
          </div>
        </Modal>

        {/* ── Sheet: Detalhe da Reunião ── */}
        <Sheet open={!!sheetMeet} onClose={() => setSheetMeet(null)} title="Detalhe da Reunião">
          {sheetMeet && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{sheetMeet.title}</div>
                <Badge label={sheetMeet.status} color={MEET_STATUS_COLORS[sheetMeet.status] || 'var(--text2)'} />
              </div>
              {sheetMeet.meet_link && (
                <a href={sheetMeet.meet_link} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1a73e8', color: '#fff', borderRadius: 10, padding: '12px 16px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <Video size={16} /> Entrar no Google Meet
                </a>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Data</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{new Date(sheetMeet.date+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Horário</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{sheetMeet.time}{sheetMeet.endTime ? ` – ${sheetMeet.endTime}` : ''}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: sheetMeet.agendado_por ? '1fr 1fr' : '1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Gerente</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={sheetMeet.gerenteName} size={28} />
                    <span style={{ fontWeight: 600 }}>{sheetMeet.gerenteName.split(' ')[0]}</span>
                  </div>
                </div>
                {sheetMeet.agendado_por && (() => {
                  const agendador = users.find(u => u.id === sheetMeet.agendado_por)
                  return agendador ? (
                    <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Agendado por</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={agendador.name} size={28} />
                        <span style={{ fontWeight: 600 }}>{agendador.name.split(' ')[0]}</span>
                      </div>
                    </div>
                  ) : null
                })()}
              </div>
              {sheetMeet.notes && (
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Notas</div>
                  <div style={{ fontSize: 13 }}>{sheetMeet.notes}</div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Alterar Status</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="success"     icon={CheckCircle} onClick={() => updateStatus(sheetMeet.id, 'Realizada')}>Realizada</Button>
                  <Button size="sm" variant="destructive" icon={XCircle}     onClick={() => updateStatus(sheetMeet.id, 'Cancelada')}>Cancelada</Button>
                  <Button size="sm" variant="warning"     icon={Clock}       onClick={() => updateStatus(sheetMeet.id, 'No-show')}>No-show</Button>
                </div>
              </div>

              {/* Resultado da Reunião GC */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Resultado</div>
                {sheetMeet.gc_outcome && (() => {
                  const o = GC_OUTCOMES.find(x => x.key === sheetMeet.gc_outcome)
                  return o ? (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: `${o.color}18`, border: `1px solid ${o.color}`, color: o.color, fontWeight: 700, fontSize: 13 }}>
                      ✓ {o.label}
                      {sheetMeet.gc_outcome_notes && <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4, color: 'var(--text2)' }}>{sheetMeet.gc_outcome_notes}</div>}
                    </div>
                  ) : null
                })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {GC_OUTCOMES.map(o => (
                    <button key={o.key}
                      onClick={() => { setOutcomeModal({ meetId: sheetMeet.id, outcomeKey: o.key, label: o.label, color: o.color }); setOutcomeNotes(sheetMeet.gc_outcome_notes || '') }}
                      style={{
                        padding: '8px 14px', borderRadius: 8, border: `1px solid ${o.key === sheetMeet.gc_outcome ? o.color : 'var(--border)'}`,
                        background: o.key === sheetMeet.gc_outcome ? `${o.color}18` : 'var(--bg-card2)',
                        color: o.key === sheetMeet.gc_outcome ? o.color : 'var(--text)',
                        fontWeight: o.key === sheetMeet.gc_outcome ? 700 : 500,
                        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><Button variant="secondary" icon={Phone} onClick={() => openEditMeet(sheetMeet)}>Editar</Button></div>
                <div style={{ flex: 1 }}><Button variant="destructive" icon={Trash2} onClick={() => deleteMeeting(sheetMeet)}>Apagar</Button></div>
              </div>
            </div>
          )}
        </Sheet>

        {/* ── Modal: Resultado da Reunião GC ── */}
        {outcomeModal && (
          <div onClick={() => setOutcomeModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-card)', border: `2px solid ${outcomeModal.color}`, borderRadius: 16, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: outcomeModal.color, marginBottom: 6 }}>Resultado da Reunião</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>{outcomeModal.label}</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Observações <span style={{ fontWeight: 400 }}>(opcional)</span></div>
                <textarea
                  className="inp"
                  rows={4}
                  value={outcomeNotes}
                  onChange={e => setOutcomeNotes(e.target.value)}
                  placeholder="Descreva o que aconteceu na reunião…"
                  style={{ resize: 'vertical', fontSize: 13, width: '100%' }}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveOutcome}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: outcomeModal.color, color: '#fff' }}>
                  Confirmar
                </button>
                <button onClick={() => { setOutcomeModal(null); setOutcomeNotes('') }}
                  style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Sincronizar CRM ── */}
        {modalBulkSync && (
          <>
            <div className="overlay" onClick={() => { if (!bulkSyncLoading) setModalBulkSync(false) }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 200, width: 'min(720px, 94vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
              className="modal-box">
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Database size={18} style={{ color: 'var(--purple)' }} />
                  <span style={{ fontWeight: 800, fontSize: 17 }}>Sincronizar Carteira → CRM DataCrazy</span>
                </div>
                {!bulkSyncLoading && (
                  <button onClick={() => setModalBulkSync(false)}
                    style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 18, cursor: 'pointer', color: 'var(--text2)', lineHeight: 1, fontFamily: 'inherit' }}>
                    ×
                  </button>
                )}
              </div>

              {/* Body */}
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Descrição */}
                {!bulkSyncLoading && !bulkSyncStats && !bulkSyncError && (
                  <div style={{ background: 'color-mix(in srgb, var(--purple) 8%, var(--bg-card2))', border: '1px solid color-mix(in srgb, var(--purple) 30%, var(--border))', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'var(--text)', lineHeight: 1.65 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--purple)' }}>O que será feito:</div>
                    <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <li>Fonte: <b>carteira completa do Metabase</b> (todos os clientes dos 3 GCs)</li>
                      <li>Tier determinado pelo gerente responsável:
                        <div style={{ marginTop: 5, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: '#07BA1C22', color: '#07BA1C', fontWeight: 700 }}>Carlos Eduardo → GC Starter</span>
                          <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: '#2BB9FF22', color: '#2BB9FF', fontWeight: 700 }}>Gabriel Bairros → GC Growth</span>
                          <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: 'color-mix(in srgb,var(--purple) 15%,transparent)', color: 'var(--purple)', fontWeight: 700 }}>Rafael Mendes → GC Enterprise</span>
                        </div>
                      </li>
                      <li>Lead pesquisado por e-mail → fallback telefone → criado se não existir</li>
                      <li>Tag GC adicionada ao lead</li>
                      <li>Negócio criado no pipeline correto — sem duplicar se já existir</li>
                    </ul>
                  </div>
                )}

                {/* Loading */}
                {bulkSyncLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '32px 0' }}>
                    <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: 'var(--purple)' }} />
                    <div style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 600 }}>Sincronizando clientes… isso pode levar alguns minutos</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>Não feche esta janela</div>
                  </div>
                )}

                {/* Erro */}
                {bulkSyncError && (
                  <div style={{ background: 'color-mix(in srgb, var(--red) 10%, var(--bg-card2))', border: '1px solid color-mix(in srgb, var(--red) 40%, var(--border))', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                    ✕ {bulkSyncError}
                  </div>
                )}

                {/* Stats */}
                {bulkSyncStats && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Pipelines encontrados */}
                    {bulkSyncStats.pipelinesFound && Object.keys(bulkSyncStats.pipelinesFound).length > 0 && (
                      <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Pipelines mapeados:</span>
                        {Object.entries(bulkSyncStats.pipelinesFound).map(([tier, name]) => {
                          const c = tier.includes('Starter') ? '#07BA1C' : tier.includes('Growth') ? '#2BB9FF' : 'var(--purple)'
                          return <span key={tier} style={{ fontSize: 12, padding: '2px 9px', borderRadius: 20, background: `color-mix(in srgb, ${c} 15%, transparent)`, color: c, fontWeight: 700 }}>{tier} → {name}</span>
                        })}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {[
                        { label: 'Total Carteira',   value: bulkSyncStats.total,        color: 'var(--text2)' },
                        { label: 'Negócios Criados', value: bulkSyncStats.bizCreated,    color: 'var(--green)' },
                        { label: 'Já Existiam',      value: bulkSyncStats.bizExisting,   color: 'var(--action)' },
                        { label: 'Leads Criados',    value: bulkSyncStats.leadsCreated,  color: 'var(--cyan)' },
                        { label: 'Erros',            value: bulkSyncStats.errors,        color: bulkSyncStats.errors > 0 ? 'var(--red)' : 'var(--text2)' },
                        { label: 'Starter / Growth / Enterprise', value: `${bulkSyncStats.starter} / ${bulkSyncStats.growth} / ${bulkSyncStats.enterprise}`, color: 'var(--text2)' },
                      ].map(k => (
                        <div key={k.label} style={{ background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3, fontWeight: 600 }}>{k.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabela de resultados */}
                {bulkSyncResults.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <table className="tbl" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Gerente / Tier</th>
                          <th>Lead</th>
                          <th>Negócio</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkSyncResults.map((r, i) => {
                          const tierColor = r.tier === 'GC Starter' ? '#07BA1C' : r.tier === 'GC Growth' ? '#2BB9FF' : r.tier === 'GC Enterprise' ? 'var(--purple)' : 'var(--text2)'
                          const LEAD_LABEL: Record<string, string> = { created: '✦ Criado', found_email: '✓ Email', found_phone: '✓ Tel' }
                          const BIZ_LABEL:  Record<string, string>  = { created: '✦ Criado', already_exists: '~ Existia' }
                          const isErr  = r.status === 'error'
                          const isSkip = r.status === 'skip'
                          return (
                            <tr key={i} style={{ opacity: isSkip ? 0.5 : 1 }}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{r.client}</div>
                                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.email}</div>
                              </td>
                              <td>
                                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.gerente}</div>
                                {r.tier
                                  ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `color-mix(in srgb, ${tierColor} 15%, var(--bg-card2))`, color: tierColor }}>{r.tier.replace('GC ', '')}</span>
                                  : <span style={{ fontSize: 10, color: 'var(--text2)' }}>—</span>}
                              </td>
                              <td style={{ color: r.leadAction === 'created' ? 'var(--cyan)' : 'var(--green)', fontWeight: 600 }}>
                                {r.leadAction ? (LEAD_LABEL[r.leadAction] ?? r.leadAction) : '—'}
                              </td>
                              <td style={{ color: r.bizAction === 'created' ? 'var(--green)' : r.bizAction === 'already_exists' ? 'var(--action)' : 'var(--text2)', fontWeight: 600 }}>
                                {r.bizAction ? (BIZ_LABEL[r.bizAction] ?? r.bizAction) : '—'}
                              </td>
                              <td>
                                {isErr
                                  ? <span style={{ color: 'var(--red)', fontWeight: 700, cursor: 'help' }} title={r.error}>✕</span>
                                  : isSkip
                                  ? <span style={{ color: 'var(--text2)', fontSize: 11 }}>skip</span>
                                  : <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
                {!bulkSyncLoading && (
                  <button onClick={() => setModalBulkSync(false)}
                    style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Fechar
                  </button>
                )}
                <button onClick={syncCRM} disabled={bulkSyncLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 8,
                    border: 'none', background: bulkSyncLoading ? 'var(--border)' : 'var(--purple)',
                    color: '#fff', fontSize: 14, fontWeight: 700, cursor: bulkSyncLoading ? 'default' : 'pointer', fontFamily: 'inherit',
                    opacity: bulkSyncLoading ? 0.7 : 1 }}>
                  {bulkSyncLoading
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sincronizando…</>
                    : <><Database size={14} /> {bulkSyncStats ? 'Sincronizar Novamente' : 'Iniciar Sincronização'}</>}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Modal: Nova Tarefa ── */}
        <Modal open={modalNewTask} onClose={() => { setModalNewTask(false); setNewTaskForm({ ...EMPTY_TASK_FORM }) }} title="Nova Tarefa">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Cliente */}
            <Field label="Cliente *">
              <Sel
                value={newTaskForm.activation_id}
                onChange={v => {
                  const act = activations.find(a => a.id === v)
                  setNewTaskForm(p => ({
                    ...p,
                    activation_id: v,
                    gerente_id: act?.gerente_id || p.gerente_id || '',
                  }))
                }}
                options={activations.map(a => ({ value: a.id, label: `${a.client} — ${a.email}` }))}
                placeholder="Selecione o cliente"
              />
            </Field>

            {/* Preview do cliente */}
            {newTaskForm.activation_id && (() => {
              const act = activations.find(a => a.id === newTaskForm.activation_id)
              if (!act) return null
              const f     = funil(act.faturamento_mensal)
              const color = f ? FUNIL_COLORS[f] : 'var(--border)'
              return (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card2)', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{act.client}</div>
                    <div style={{ color: 'var(--text2)' }}>{act.email}</div>
                    {act.phone && <div style={{ color: 'var(--text2)' }}>{act.phone}</div>}
                  </div>
                  {f && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${color}22`, color }}>{f}</span>}
                </div>
              )
            })()}

            {/* Gerente */}
            <Field label="Gerente de Contas *">
              <Sel
                value={newTaskForm.gerente_id}
                onChange={v => setNewTaskForm(p => ({ ...p, gerente_id: v }))}
                options={gerentes.map(g => ({ value: g.id, label: g.name }))}
                placeholder="Selecione o gerente"
              />
            </Field>

            {/* Tipo */}
            <Field label="Tipo de Tarefa *">
              <Sel
                value={newTaskForm.tipo}
                onChange={v => setNewTaskForm(p => ({ ...p, tipo: v, title: TASK_LABEL[v] || '' }))}
                options={Object.entries(TASK_LABEL).map(([value, label]) => ({ value, label }))}
                placeholder="Selecione o tipo"
              />
            </Field>

            {/* Título */}
            <Field label="Título *">
              <input className="inp" value={newTaskForm.title}
                onChange={e => setNewTaskForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Título da tarefa" />
            </Field>

            {/* Data */}
            <Field label="Data de Vencimento *">
              <input className="inp" type="date" value={newTaskForm.due_date}
                onChange={e => setNewTaskForm(p => ({ ...p, due_date: e.target.value }))} />
            </Field>

            {/* Observações */}
            <Field label="Observações">
              <textarea className="inp" rows={3} value={newTaskForm.notes}
                onChange={e => setNewTaskForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Anotações, instruções ou contexto…"
                style={{ resize: 'vertical' }} />
            </Field>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { setModalNewTask(false); setNewTaskForm({ ...EMPTY_TASK_FORM }) }}>Cancelar</Button>
              <Button
                onClick={saveNewTask}
                disabled={isSavingTask || !newTaskForm.activation_id || !newTaskForm.gerente_id || !newTaskForm.tipo || !newTaskForm.title || !newTaskForm.due_date}>
                {isSavingTask ? 'Criando…' : 'Criar Tarefa'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* ══ ABA TAREFAS ══════════════════════════════════════════════════ */}
        {tab === 'tarefas' && (() => {
          const today2 = new Date().toISOString().slice(0, 10)
          const pending   = tasks.filter(t => t.status !== 'concluida').sort((a, b) => a.due_date.localeCompare(b.due_date))
          const completed = tasks.filter(t => t.status === 'concluida').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
          const overdue   = pending.filter(t => t.due_date < today2).length
          const card2: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }

          const TaskRow = ({ t }: { t: GcTask }) => {
            const label       = t.title ?? TASK_LABEL[t.tipo] ?? t.tipo
            const isOverdue   = t.status !== 'concluida' && t.due_date < today2
            const tierColor   = t.gc_tier ? TIER_COLOR[t.gc_tier] : 'var(--text2)'
            const gerenteName = users.find(u => u.id === t.gerente_id)?.name ?? '—'
            const [expanded, setExpanded] = useState(false)
            return (
              <div style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: t.tipo === 'alterar_taxas' ? 'var(--red)' : 'var(--text)' }}>{label}</span>
                      {t.gc_tier && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${tierColor}22`, color: tierColor, textTransform: 'capitalize' }}>{t.gc_tier}</span>}
                      {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#ff3b3022', color: 'var(--red)' }}>Vencida</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {t.client_name || t.client_email}
                        {hasAnyRole(user, ['Admin']) && <span style={{ marginLeft: 8, color: avatarColor(gerenteName), fontWeight: 600 }}>· {gerenteName}</span>}
                      </span>
                      {(t.tipo === 'alterar_taxas' || t.tipo === 'adicionar_carteira') && t.notes && (
                        <button onClick={() => setExpanded(p => !p)}
                          style={{ fontSize: 11, color: 'var(--action)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', fontWeight: 600 }}>
                          {expanded ? '▲ ocultar notas' : '▼ ver notas'}
                        </button>
                      )}
                    </div>
                  </div>
                <div style={{ fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--text2)', whiteSpace: 'nowrap', fontWeight: isOverdue ? 700 : 400 }}>
                  {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </div>
                {t.phone && (
                  <a href={`https://wa.me/55${t.phone.replace(/\D/g, '').replace(/^55/, '')}`}
                    target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#25D36622', border: '1px solid #25D366', flexShrink: 0, textDecoration: 'none' }}
                    title={t.phone}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  </a>
                )}
                {t.status !== 'concluida' ? (
                  <button onClick={() => completeTask(t.id)} disabled={completingId === t.id}
                    style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--green)', background: 'color-mix(in srgb,var(--green) 12%,var(--bg-card))', color: 'var(--green)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {completingId === t.id ? '...' : '✓ Concluir'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      ✓ {t.completed_at ? new Date(t.completed_at).toLocaleDateString('pt-BR') : ''}
                    </div>
                    <button onClick={() => reopenTask(t.id)} disabled={completingId === t.id}
                      style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {completingId === t.id ? '...' : '↩ Reabrir'}
                    </button>
                  </div>
                )}
                </div>
                {(t.tipo === 'alterar_taxas' || t.tipo === 'adicionar_carteira') && t.notes && expanded && (
                  <div style={{ margin: '0 16px 12px', padding: 12, background: 'var(--bg-card2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 260, overflowY: 'auto' }}>
                    {t.notes}
                  </div>
                )}
              </div>
            )
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {[
                  { label: 'Pendentes',  value: pending.length,   color: 'var(--action)' },
                  { label: 'Vencidas',   value: overdue,          color: overdue > 0 ? 'var(--red)' : 'var(--text2)' },
                  { label: 'Concluídas', value: completed.length, color: 'var(--green)' },
                  { label: 'Total',      value: tasks.length,     color: 'var(--text2)' },
                ].map(k => (
                  <div key={k.label} style={{ ...card2, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                  {([['pendentes', `Pendentes (${pending.length})`], ['relatorio', `Relatório (${completed.length})`]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setTaskTab(k)}
                      style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: taskTab === k ? 'var(--action)' : 'transparent',
                        color: taskTab === k ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13 }}>{l}</button>
                  ))}
                </div>
                <Button icon={Plus} onClick={() => { setNewTaskForm({ activation_id: '', gerente_id: user?.role === 'Gerente de Contas' ? (user?.id ?? '') : '', tipo: '', title: '', due_date: '', notes: '' }); setModalNewTask(true) }}>Nova Tarefa</Button>
              </div>
              <div style={{ ...card2, padding: 0, overflow: 'hidden' }}>
                {taskTab === 'pendentes' && (pending.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Nenhuma tarefa pendente 🎉</div>
                  : pending.map(t => <TaskRow key={t.id} t={t} />)
                )}
                {taskTab === 'relatorio' && (completed.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>Nenhuma tarefa concluída ainda.</div>
                  : completed.map(t => <TaskRow key={t.id} t={t} />)
                )}
              </div>
            </div>
          )
        })()}

      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
