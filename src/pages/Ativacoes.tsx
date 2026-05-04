import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Eye, Edit, Trash2, ChevronLeft, ChevronRight, Loader2, Download, AlertTriangle, UserCheck } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { useToast } from '@/components/ui/Toast'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { Sheet } from '@/components/ui/Sheet'
import { Field, Sel } from '@/components/ui/Field'
import { Divider } from '@/components/ui/Divider'
import { DateFilter, DateRange } from '@/components/ui/DateFilter'
import { supabase } from '@/lib/supabase/client'
import { capitalize, formatDate, CHANNEL_COLORS } from '@/lib/utils'
import type { ActivationChannel } from '@/lib/supabase/database.types'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subWeeks, subMonths, subDays } from 'date-fns'

type DbActivation = {
  id: string; client: string; email: string | null; phone: string | null
  channel: string; responsible: string; date: string; time: string | null
  sdr_id: string | null; sdr_nome: string | null
  // ATENÇÃO: a coluna `indicado_por` deve existir na tabela `activations` do Supabase.
  // Se não existir, crie-a como: indicado_por text
  indicado_por: string | null
}
type DbUser  = { id: string; name: string; email: string | null; role: string; team_id: string | null }
type DbTeam  = { id: string; name: string }
type AuthUser = { id: string; name: string; role: string; team_id: string | null }

const CHANNELS: ActivationChannel[] = ['Inbound', 'Outbound', 'Indicação']
const EMPTY_FORM = { client: '', email: '', channel: 'Inbound', responsible: '', date: '', phone: '+55 ', sdr_id: '' }
const PER_PAGE = 5

const DEFAULT_RANGE: DateRange = {
  startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
}

export default function Ativacoes() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', color: 'var(--text2)', fontSize: 14, gap: 10 }}>
      <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%',
        border: '2px solid #333', borderTopColor: 'var(--action)',
        animation: 'spin .8s linear infinite' }} />
      Carregando...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  return <AtivacoesContent isAdmin={isAdmin} currentUser={user as AuthUser | null} />
}

function AtivacoesContent({ isAdmin, currentUser }: { isAdmin: boolean; currentUser: AuthUser | null }) {
  const toast = useToast()
  const [activations, setActivations] = useState<DbActivation[]>([])
  const [users, setUsers] = useState<DbUser[]>([])
  const [teams, setTeams] = useState<DbTeam[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)

  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterSdr, setFilterSdr] = useState('')
  const [filterTeam, setFilterTeam] = useState('all')
  const [page, setPage] = useState(1)

  const [kpis, setKpis] = useState({ today: 0, yesterday: 0, week: 0, weekPrev: 0, month: 0, monthPrev: 0, total: 0 })

  useEffect(() => {
    const now = new Date()
    const todayStr = format(now, 'yyyy-MM-dd')
    const yesterdayStr = format(subDays(now, 1), 'yyyy-MM-dd')
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const prevWeekStart = format(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const prevWeekEnd = format(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
    const prevMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
    const prevMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
    Promise.all([
      supabase.from('activations').select('id', { count: 'exact', head: true }).eq('date', todayStr),
      supabase.from('activations').select('id', { count: 'exact', head: true }).eq('date', yesterdayStr),
      supabase.from('activations').select('id', { count: 'exact', head: true }).gte('date', weekStart).lte('date', todayStr),
      supabase.from('activations').select('id', { count: 'exact', head: true }).gte('date', prevWeekStart).lte('date', prevWeekEnd),
      supabase.from('activations').select('id', { count: 'exact', head: true }).gte('date', monthStart).lte('date', todayStr),
      supabase.from('activations').select('id', { count: 'exact', head: true }).gte('date', prevMonthStart).lte('date', prevMonthEnd),
      supabase.from('activations').select('id', { count: 'exact', head: true }),
    ]).then(([r1, r2, r3, r4, r5, r6, r7]) => {
      setKpis({
        today: r1.count ?? 0, yesterday: r2.count ?? 0,
        week: r3.count ?? 0, weekPrev: r4.count ?? 0,
        month: r5.count ?? 0, monthPrev: r6.count ?? 0,
        total: r7.count ?? 0,
      })
    })
  }, [])

  const [modalNew, setModalNew] = useState(false)
  const [modalEdit, setModalEdit] = useState<DbActivation | null>(null)
  const [sheetView, setSheetView] = useState<DbActivation | null>(null)
  const [modalDel, setModalDel] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // ── Indication modal state ────────────────────────────────────────────────
  const [isIndicationModalOpen, setIsIndicationModalOpen] = useState(false)
  const [selectedActivationForIndication, setSelectedActivationForIndication] = useState<string | null>(null)
  const [selectedIndicator, setSelectedIndicator] = useState<string>('')

  // ── Re-fetch whenever date range changes ──────────────────────────────────
  useEffect(() => {
    if (!dateRange.startDate || !dateRange.endDate) return
    async function load() {
      setIsLoading(true)
      const [{ data: acts, error: ae }, { data: usrs, error: ue }, { data: tms }] = await Promise.all([
        supabase
          .from('activations')
          .select('id,client,email,phone,channel,responsible,date,time,sdr_id,sdr_nome,indicado_por')
          .gte('date', dateRange.startDate)
          .lte('date', dateRange.endDate)
          .order('date', { ascending: false })
          .order('time', { ascending: false }),
        supabase.from('users').select('id,name,email,role,team_id').order('name'),
        supabase.from('teams').select('id,name').order('name'),
      ])
      if (ae) toast(ae.message, 'error')
      if (ue) toast(ue.message, 'error')
      if (acts) setActivations(acts as DbActivation[])
      if (usrs) setUsers(usrs as DbUser[])
      if (tms) setTeams(tms as DbTeam[])
      setIsLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: k === 'email' ? e.target.value.toLowerCase() : e.target.value }))

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || '—'
  const getTeamName = (userId: string) => {
    const tid = users.find(u => u.id === userId)?.team_id ?? null
    return tid ? (teams.find(t => t.id === tid)?.name ?? '—') : '—'
  }

  // SDRs disponíveis: filtra pelo time do responsável selecionado no form
  const responsibleTeamId = users.find(u => u.id === form.responsible)?.team_id ?? null
  const sdrOptions = users.filter(u => u.role === 'SDR' && u.team_id === responsibleTeamId && responsibleTeamId !== null)
  const allSdrs = users.filter(u => u.role === 'SDR')

  // Ranking: computed from the already-filtered activations (respects date range)
  const rankingDisplay = useMemo(() => {
    const counts: Record<string, number> = {}
    activations.forEach(a => { counts[a.responsible] = (counts[a.responsible] || 0) + 1 })
    return Object.entries(counts)
      .map(([userId, count]) => {
        const u = users.find(u => u.id === userId)
        return { userId, activations: count, name: u?.name || '—', role: u?.role || '' }
      })
      .sort((a, b) => b.activations - a.activations)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activations, users])

  const filtered = activations.filter(a => {
    const q = search.toLowerCase()
    const matchS = a.client.toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q)
    const matchC = !filterChannel || a.channel === filterChannel
    const matchU = !filterUser || a.responsible === filterUser
    const matchSdr = !filterSdr || a.sdr_id === filterSdr
    const matchT = filterTeam === 'all' || users.find(u => u.id === a.responsible)?.team_id === filterTeam
    return matchS && matchC && matchU && matchSdr && matchT
  })
  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  function exportToCSV() {
    const esc = (v: string | null | undefined) => {
      const s = (v ?? '').replace(/"/g, '""')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
    }
    const headers = ['Nome do Cliente', 'E-mail', 'Telefone', 'Data de Ativação', 'Hora', 'Canal de Origem', 'Responsável', 'Time', 'SDR']
    const rows = filtered.map(a => [
      esc(a.client), esc(a.email), esc(a.phone), esc(formatDate(a.date)), esc(a.time),
      esc(a.channel), esc(getUserName(a.responsible)), esc(getTeamName(a.responsible)),
      esc(a.sdr_nome || (a.sdr_id ? getUserName(a.sdr_id) : '—')),
    ].join(','))
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `ativacoes_${filtered[0]?.date ?? 'relatorio'}_a_${filtered[filtered.length - 1]?.date ?? ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  const medalColors = ['var(--gold)', '#C0C0C0', '#CD7F32']

  // ── Actions ───────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.client || !form.email || !form.responsible || !form.date) {
      toast('Preencha os campos obrigatórios.', 'error'); return
    }
    setIsSaving(true)

    if (modalEdit) {
      const sdrUser = form.sdr_id ? users.find(u => u.id === form.sdr_id) : null
      const patch = {
        client: capitalize(form.client), email: form.email, phone: form.phone || null,
        channel: form.channel as ActivationChannel, responsible: form.responsible, date: form.date,
        sdr_id: form.sdr_id || null, sdr_nome: sdrUser?.name || null,
      }
      const { error } = await supabase.from('activations').update(patch).eq('id', modalEdit.id)
      setIsSaving(false)
      if (error) { toast(error.message, 'error'); return }
      setActivations(p => p.map(a => a.id === modalEdit.id ? { ...a, ...patch } : a))
      toast('Ativação atualizada!', 'success')
      setModalEdit(null)
    } else {
      const emailSanitized = form.email.trim().toLowerCase()

      // Validação: responsável precisa ter time
      const responsibleUser = users.find(u => u.id === form.responsible)
      if (!responsibleUser?.team_id) {
        toast('O Closer selecionado não pertence a nenhum time. Defina um time antes de cadastrar.', 'error')
        setIsSaving(false); return
      }



      // Pre-check: bloqueia e-mail duplicado
      const { data: existing } = await supabase
        .from('activations').select('id').eq('email', emailSanitized).maybeSingle()
      if (existing) {
        toast('Este e-mail já possui uma ativação cadastrada.', 'error')
        setIsSaving(false); return
      }

      const time    = new Date().toTimeString().slice(0, 5)
      const sdrUser = form.sdr_id ? users.find(u => u.id === form.sdr_id) : null
      const teamName = teams.find(t => t.id === responsibleUser.team_id)?.name || ''

      const row = {
        client: capitalize(form.client), email: emailSanitized, phone: form.phone || null,
        channel: form.channel as ActivationChannel, responsible: form.responsible,
        date: form.date, time,
        sdr_id:   form.sdr_id || null,
        sdr_nome: sdrUser?.name || null,
        sem_sdr:  !form.sdr_id,
      }
      const { data, error } = await supabase.from('activations').insert(row).select().single()
      setIsSaving(false)
      if (error) {
        const msg = (error as { code?: string }).code === '23505'
          ? 'Este e-mail já possui uma ativação cadastrada.'
          : error.message
        toast(msg, 'error'); return
      }
      setActivations(p => [data as DbActivation, ...p])
      toast('Cliente ativado com sucesso!', 'success')
      setModalNew(false)

      // Calcula TPV via Metabase (fire-and-forget)
      void supabase.functions.invoke('calcular-tpv', { body: { ativacao_id: (data as DbActivation).id } })

      // Dispara webhook DataCrazy de forma assíncrona — não bloqueia o UI
      const fechamentoISO = `${form.date}T${time}:00-03:00`
      const closerUser = users.find(u => u.id === form.responsible)
      supabase.auth.getSession().then(({ data: { session } }) => {
        void supabase.functions.invoke('datacrazy-webhook', {
          body: {
            ativacao_id:      (data as DbActivation).id,
            closer_id:        form.responsible,
            closer_email:     closerUser?.email ?? null,
            time_id:          teamName,
            data_fechamento:  fechamentoISO,
            canal:            form.channel,
            cliente_nome:     capitalize(form.client),
            cliente_email:    form.email,
            cliente_telefone: form.phone || null,
            sdr_id:           form.sdr_id || null,
            sdr_email:        sdrUser?.email ?? null,
          },
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined,
        })
      })
    }
    setForm({ ...EMPTY_FORM })
  }

  const doDelete = async () => {
    if (!modalDel) return
    const { error } = await supabase.from('activations').delete().eq('id', modalDel)
    if (error) { toast(error.message, 'error'); return }
    setActivations(p => p.filter(a => a.id !== modalDel))
    toast('Ativação removida.', 'info')
    setModalDel(null)
  }

  const handleSaveIndication = async () => {
    if (!selectedActivationForIndication || !selectedIndicator.trim()) {
      toast('Informe o e-mail do indicador.', 'error'); return
    }
    const indicadorEmail = String(selectedIndicator).trim().toLowerCase()
    const payload: Record<string, string> = { indicado_por: indicadorEmail }
    const { error } = await supabase
      .from('activations')
      .update(payload)
      .eq('id', selectedActivationForIndication)
      .select()
    if (error) {
      console.error('Erro Supabase [handleSaveIndication]:', error.message, error.details, error.hint)
      toast(error.message, 'error'); return
    }
    setActivations(p => p.map(a =>
      a.id === selectedActivationForIndication ? { ...a, indicado_por: indicadorEmail } : a
    ))
    toast('Indicação salva com sucesso!', 'success')
    setIsIndicationModalOpen(false)
    setSelectedActivationForIndication(null)
    setSelectedIndicator('')
  }

  // ── Form fields (variable — evita unmount no re-render) ───────────────────
  const noTeamWarning = form.responsible && !responsibleTeamId
  const formFieldsJSX = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Nome do Cliente" required>
        <input className="inp" value={form.client} onChange={setF('client')}
          onBlur={e => setForm(p => ({ ...p, client: capitalize(e.target.value) }))} placeholder="Nome Completo" />
      </Field>
      <Field label="Email" required>
        <input className="inp" type="email" value={form.email} onChange={setF('email')} placeholder="cliente@email.com" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Canal">
          <Sel value={form.channel} onChange={v => setForm(p => ({ ...p, channel: v }))}
            options={CHANNELS} placeholder="" />
        </Field>
        <Field label="Responsável" required>
          <Sel value={form.responsible}
            onChange={v => setForm(p => ({ ...p, responsible: v, sdr_id: '' }))}
            options={users.filter(u => u.role !== 'Colaborador').map(u => ({ value: u.id, label: u.name }))} placeholder="Selecione…" />
        </Field>
      </div>

      {/* Aviso: Closer sem time */}
      {noTeamWarning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'color-mix(in srgb, var(--red) 12%, var(--bg-card2))',
          border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          <AlertTriangle size={14} color="var(--red)" />
          <span style={{ color: 'var(--red)', fontWeight: 500 }}>
            Este Closer não pertence a nenhum time. Defina o time antes de salvar.
          </span>
        </div>
      )}

      {/* SDR Responsável */}
      <Field label="SDR Responsável">
        {!form.responsible ? (
          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text2)', background: 'var(--bg-card2)',
            border: '1px solid var(--border)', borderRadius: 8 }}>
            Selecione um Responsável primeiro
          </div>
        ) : sdrOptions.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 12,
            color: 'var(--text2)', background: 'color-mix(in srgb, var(--action) 8%, var(--bg-card2))',
            border: '1px solid var(--border)', borderRadius: 8 }}>
            <AlertTriangle size={13} color="var(--action)" />
            Sem SDRs cadastrados neste time — salvando sem SDR
          </div>
        ) : (
          <Sel value={form.sdr_id}
            onChange={v => setForm(p => ({ ...p, sdr_id: v }))}
            options={sdrOptions.map(u => ({ value: u.id, label: u.name }))}
            placeholder="Selecione o SDR…" />
        )}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Data de Ativação" required>
          <input className="inp" type="date" value={form.date} onChange={setF('date')} />
        </Field>
        <Field label="Telefone">
          <input className="inp" value={form.phone} onChange={setF('phone')} placeholder="+55 11 99999-0000" />
        </Field>
      </div>
    </div>
  )

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Ativações</h1>
          <Button icon={Plus} onClick={() => { setForm({ ...EMPTY_FORM }); setModalNew(true) }}>
            + Adicionar Cliente
          </Button>
        </div>

        {/* ── Date Filter ── */}
        <div style={{ marginBottom: 24 }}>
          <DateFilter value="Mês Atual" onChange={range => { setDateRange(range); setPage(1) }} />
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text2)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14 }}>Carregando ativações…</span>
          </div>
        ) : <>

        {/* ── Ranking do Período ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Ranking do Período</span>
            <span style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg-card2)', padding: '4px 10px', borderRadius: 7 }}>
              {activations.length} ativação{activations.length !== 1 ? 'ões' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {rankingDisplay.slice(0, 6).map((r, i) => {
              const pct = Math.round((r.activations / (rankingDisplay[0]?.activations || 1)) * 100)
              const medals = ['🥇', '🥈', '🥉']
              return (
                <div key={r.userId} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: i < 3 ? `color-mix(in srgb, ${medalColors[i]} 8%, var(--bg-card2))` : 'var(--bg-card2)',
                  border: `1px solid ${i < 3 ? `color-mix(in srgb, ${medalColors[i]} 25%, transparent)` : 'var(--border)'}`,
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <span style={{ width: 24, textAlign: 'center', fontSize: i < 3 ? 20 : 13,
                    fontWeight: 800, color: medalColors[i] || 'var(--text2)', lineHeight: 1 }}>
                    {i < 3 ? medals[i] : i + 1}
                  </span>
                  <Avatar name={r.name} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name.split(' ').slice(0, 2).join(' ')}
                    </div>
                    {r.role && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{r.role}</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <div style={{ flex: 1, height: 5, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: i === 0 ? 'var(--gold)' : 'linear-gradient(90deg,var(--action),var(--purple))', borderRadius: 3, transition: 'width .4s ease' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{pct}% do líder</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 40 }}>
                    <div style={{ fontWeight: 800, fontSize: 22, color: i < 3 ? medalColors[i] : 'var(--text)', lineHeight: 1 }}>{r.activations}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>ativações</div>
                  </div>
                </div>
              )
            })}
            {rankingDisplay.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13, padding: '8px 0' }}>
                Sem ativações no período selecionado.
              </div>
            )}
          </div>

          {/* ── KPI Cards ── */}
          {(() => {
            const todayDiff = kpis.today - kpis.yesterday
            const weekPct = kpis.weekPrev > 0 ? Math.round((kpis.week - kpis.weekPrev) / kpis.weekPrev * 100) : null
            const monthPct = kpis.monthPrev > 0 ? Math.round((kpis.month - kpis.monthPrev) / kpis.monthPrev * 100) : null
            const cards = [
              { label: 'Ativações Hoje', value: kpis.today,
                sub: todayDiff === 0 ? 'igual a ontem' : `${todayDiff > 0 ? '+' : ''}${todayDiff} vs ontem`,
                subColor: todayDiff > 0 ? 'var(--green)' : todayDiff < 0 ? 'var(--red)' : 'var(--text2)' },
              { label: 'Esta Semana', value: kpis.week,
                sub: weekPct === null ? 'sem dados anteriores' : `${weekPct > 0 ? '+' : ''}${weekPct}% vs semana passada`,
                subColor: weekPct !== null && weekPct > 0 ? 'var(--green)' : weekPct !== null && weekPct < 0 ? 'var(--red)' : 'var(--text2)' },
              { label: 'Este Mês', value: kpis.month,
                sub: monthPct === null ? 'sem dados anteriores' : Math.abs(monthPct) <= 5 ? 'Estável' : `${monthPct > 0 ? '+' : ''}${monthPct}% vs mês passado`,
                subColor: monthPct !== null && monthPct > 5 ? 'var(--green)' : monthPct !== null && monthPct < -5 ? 'var(--red)' : 'var(--text2)' },
              { label: 'Total Geral', value: kpis.total, sub: 'desde o início', subColor: 'var(--text2)' },
            ]
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {cards.map(c => (
                  <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{c.label}</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{c.value}</div>
                    <div style={{ fontSize: 12, color: c.subColor, marginTop: 6, fontWeight: 500 }}>{c.sub}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* ── Filters + Export ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <input className="inp" placeholder="Buscar cliente..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ paddingLeft: 36 }} />
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <Search size={16} color="var(--text2)" />
            </div>
          </div>
          <div style={{ width: 160 }}>
            <Sel value={filterChannel} onChange={v => { setFilterChannel(v); setPage(1) }}
              options={CHANNELS} placeholder="Canal" />
          </div>
          {teams.length > 0 && (
            <div style={{ width: 170 }}>
              <Sel value={filterTeam === 'all' ? '' : filterTeam}
                onChange={v => { setFilterTeam(v || 'all'); setPage(1) }}
                options={teams.map(t => ({ value: t.id, label: t.name }))}
                placeholder="Todos os Times" />
            </div>
          )}
          <div style={{ width: 180 }}>
            <Sel value={filterUser} onChange={v => { setFilterUser(v); setPage(1) }}
              options={users.filter(u => u.role !== 'Colaborador').map(u => ({ value: u.id, label: u.name }))} placeholder="Responsável" />
          </div>
          {allSdrs.length > 0 && (
            <div style={{ width: 170 }}>
              <Sel value={filterSdr} onChange={v => { setFilterSdr(v); setPage(1) }}
                options={allSdrs.map(u => ({ value: u.id, label: u.name }))} placeholder="SDR" />
            </div>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="secondary" icon={Download} onClick={exportToCSV} disabled={filtered.length === 0}>
              Exportar
            </Button>
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data/Hora</th><th>Cliente</th><th>Email</th>
                  <th>Canal</th><th>Responsável</th><th>SDR</th><th>Telefone</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                    Nenhuma ativação encontrada.
                  </td></tr>
                )}
                {paginated.map(a => {
                  const sdrName = a.sdr_nome || (a.sdr_id ? getUserName(a.sdr_id) : null)
                  return (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{formatDate(a.date)} {a.time}</td>
                      <td style={{ fontWeight: 600 }}>
                        <div>{a.client}</div>
                        {a.indicado_por && (
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                            Indicado por: {a.indicado_por}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{a.email}</td>
                      <td><Badge label={a.channel} color={CHANNEL_COLORS[a.channel] || 'var(--action)'} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Avatar name={getUserName(a.responsible)} size={26} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{getUserName(a.responsible).split(' ')[0]}</span>
                        </div>
                      </td>
                      <td>
                        {sdrName ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Avatar name={sdrName} size={26} />
                            <span style={{ fontSize: 13 }}>{sdrName.split(' ')[0]}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{a.phone}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button title="Ver" onClick={() => setSheetView(a)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6 }}>
                            <Eye size={16} />
                          </button>
                          {isAdmin && (
                            <>
                              <button title="Definir Indicação"
                                onClick={() => {
                                  setSelectedActivationForIndication(a.id)
                                  setSelectedIndicator(a.indicado_por || '')
                                  setIsIndicationModalOpen(true)
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                  color: a.indicado_por ? 'var(--green)' : 'var(--text2)', padding: 4, borderRadius: 6 }}>
                                <UserCheck size={16} />
                              </button>
                              <button title="Editar"
                                onClick={() => {
                                  setForm({ ...a, email: a.email || '', phone: a.phone || '',
                                    responsible: a.responsible, sdr_id: a.sdr_id || '' })
                                  setModalEdit(a)
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--action)', padding: 4, borderRadius: 6 }}>
                                <Edit size={16} />
                              </button>
                              <button title="Excluir" onClick={() => setModalDel(a.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, borderRadius: 6 }}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 16, borderTop: '1px solid var(--border)' }}>
              <Button size="sm" variant="secondary" icon={ChevronLeft}
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} />
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)} style={{
                  width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                  background: page === n ? 'var(--action)' : 'var(--bg-card2)',
                  color: page === n ? '#fff' : 'var(--text2)',
                }}>{n}</button>
              ))}
              <Button size="sm" variant="secondary" icon={ChevronRight}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
            </div>
          )}
        </div>
        </>}

        {/* ── Modals ── */}
        <Modal open={modalNew} onClose={() => { setModalNew(false); setForm({ ...EMPTY_FORM }) }}
          title="Adicionar Cliente" width={520}
          footer={<>
            <Button variant="secondary" onClick={() => { setModalNew(false); setForm({ ...EMPTY_FORM }) }}>Cancelar</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</Button>
          </>}>
          {formFieldsJSX}
        </Modal>

        <Modal open={!!modalEdit} onClose={() => setModalEdit(null)} title="Editar Ativação" width={520}
          footer={<>
            <Button variant="secondary" onClick={() => setModalEdit(null)}>Cancelar</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</Button>
          </>}>
          {formFieldsJSX}
        </Modal>

        <Sheet open={!!sheetView} onClose={() => setSheetView(null)} title="Detalhes da Ativação">
          {sheetView && (() => {
            const sdrName = sheetView.sdr_nome || (sheetView.sdr_id ? getUserName(sheetView.sdr_id) : null)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Avatar name={sheetView.client} size={56} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{sheetView.client}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 14 }}>{sheetView.email}</div>
                  </div>
                </div>
                <Divider />
                {([
                  ['Canal', <Badge key="c" label={sheetView.channel} color={CHANNEL_COLORS[sheetView.channel] || 'var(--action)'} />],
                  ['Responsável', getUserName(sheetView.responsible)],
                  ['SDR', sdrName || '—'],
                  ['Telefone', sheetView.phone || '—'],
                  ['Data', `${formatDate(sheetView.date)} às ${sheetView.time || ''}`],
                ] as [string, React.ReactNode][]).map(([l, v]) => (
                  <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{l}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </Sheet>

        <ConfirmModal open={!!modalDel} onClose={() => setModalDel(null)} onConfirm={doDelete}
          description="Deseja excluir esta ativação permanentemente?" />

        {/* ── Modal: Responsável pela Indicação ── */}
        <Modal
          open={isIndicationModalOpen}
          onClose={() => {
            setIsIndicationModalOpen(false)
            setSelectedActivationForIndication(null)
            setSelectedIndicator('')
          }}
          title="Responsável pela Indicação"
          width={440}
          footer={<>
            <Button variant="secondary" onClick={() => {
              setIsIndicationModalOpen(false)
              setSelectedActivationForIndication(null)
              setSelectedIndicator('')
            }}>Cancelar</Button>
            <Button onClick={handleSaveIndication}>Salvar</Button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
              Informe o e-mail de quem indicou esta ativação.
            </p>
            <Field label="E-mail do indicador">
              <input
                className="inp"
                type="email"
                value={selectedIndicator}
                onChange={e => setSelectedIndicator(e.target.value.toLowerCase())}
                placeholder="indicador@email.com"
              />
            </Field>
          </div>
        </Modal>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
