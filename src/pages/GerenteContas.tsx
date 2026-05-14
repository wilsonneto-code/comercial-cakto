import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Video, Trash2, Phone, Calendar, Loader2, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Sheet } from '@/components/ui/Sheet'
import { Field, Sel } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase/client'

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

type DbUser       = { id: string; name: string; role: string }
type DbActivation = {
  id: string; client: string; email: string; phone: string | null
  responsible: string; date: string; notes: string | null
  faturamento_mensal: number | null; gerente_id: string | null
}
type Meeting = {
  id: string; activation_id: string | null; gerente_id: string | null
  title: string; date: string; time: string; endTime: string
  status: string; notes: string; clientEmail: string
  google_event_id: string; meet_link: string; gerenteName: string
}

function funil(fat: number | null): 'Starter' | 'Growth' | 'Enterprise' | null {
  if (fat === null || fat === undefined) return null
  if (fat <= 50000)  return 'Starter'
  if (fat <= 250000) return 'Growth'
  return 'Enterprise'
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const EMPTY_MEET = { activation_id: '', gerente_id: '', title: '', date: '', time: '', endTime: '', status: 'Agendada', notes: '', clientEmail: '' }

export default function GerenteContas() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null
  if (!['Admin', 'Gerente de Contas'].includes(user.role ?? '')) {
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

  const [tab, setTab]             = useState<'funis' | 'agenda'>('funis')
  const [users, setUsers]         = useState<DbUser[]>([])
  const [activations, setActs]    = useState<DbActivation[]>([])
  const [meetings, setMeetings]   = useState<Meeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving]   = useState(false)

  // Filtros funil
  const [filterGerente, setFilterGerente] = useState('')

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

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [{ data: usrs }, { data: acts }, { data: mtgs }] = await Promise.all([
        supabase.from('users').select('id,name,role').order('name'),
        supabase.from('activations').select('id,client,email,phone,responsible,date,notes,faturamento_mensal,gerente_id').order('date', { ascending: false }),
        supabase.from('followup_meetings').select('*').order('date').order('time'),
      ])
      const userList = (usrs || []) as DbUser[]
      setUsers(userList)
      setActs((acts || []) as DbActivation[])
      setMeetings(((mtgs || []) as any[]).map(m => ({
        id: m.id, activation_id: m.activation_id, gerente_id: m.gerente_id,
        title: m.title, date: m.date, time: (m.time as string)?.slice(0,5) || '',
        endTime: (m.end_time as string)?.slice(0,5) || '',
        status: m.status, notes: m.notes || '', clientEmail: m.client_email || '',
        google_event_id: m.google_event_id || '', meet_link: m.meet_link || '',
        gerenteName: userList.find(u => u.id === m.gerente_id)?.name || '—',
      })))
      setIsLoading(false)
    }
    load()
  }, [])

  const gerentes = users.filter(u => u.role === 'Gerente de Contas')
  const closers  = users.filter(u => u.role === 'Closer')

  // Ativações visíveis: admin vê tudo, gerente vê só as suas
  const visibleActs = useMemo(() => {
    return activations.filter(a => {
      if (user?.role === 'Admin') return true
      return a.gerente_id === user?.id
    }).filter(a => !filterGerente || a.gerente_id === filterGerente)
  }, [activations, user, filterGerente])

  const starterList    = visibleActs.filter(a => funil(a.faturamento_mensal) === 'Starter')
  const growthList     = visibleActs.filter(a => funil(a.faturamento_mensal) === 'Growth')
  const enterpriseList = visibleActs.filter(a => funil(a.faturamento_mensal) === 'Enterprise')
  const semFunil       = visibleActs.filter(a => funil(a.faturamento_mensal) === null)

  // Calendário
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1)

  function prevMonth() { if (month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  function nextMonth() { if (month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }

  const visibleMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (user?.role === 'Admin') return true
      return m.gerente_id === user?.id
    })
  }, [meetings, user])

  function getMeetingsForDay(day: number) {
    const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return visibleMeetings.filter(m => m.date === dStr)
  }

  // ── Save client (faturamento + gerente) ─────────────────────────────────
  async function saveClient() {
    if (!modalClient) return
    setIsSaving(true)
    const patch: any = {}
    if (clientForm.faturamento_mensal !== '') patch.faturamento_mensal = parseFloat(clientForm.faturamento_mensal.replace(/\./g,'').replace(',','.')) || null
    if (clientForm.gerente_id !== '') patch.gerente_id = clientForm.gerente_id || null
    const { error } = await supabase.from('activations').update(patch).eq('id', modalClient.id)
    setIsSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setActs(p => p.map(a => a.id === modalClient.id ? { ...a, ...patch } : a))
    toast('Cliente atualizado!', 'success')
    setModalClient(null)
  }

  // ── Save meeting ─────────────────────────────────────────────────────────
  async function saveMeeting() {
    if (!meetForm.title || !meetForm.date || !meetForm.gerente_id) {
      toast('Preencha título, data e gerente.', 'error'); return
    }
    setIsSaving(true)
    const gerenteName = users.find(u => u.id === meetForm.gerente_id)?.name || '—'

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
      }
      const { data, error } = await supabase.from('followup_meetings').insert(row).select().single()
      setIsSaving(false)
      if (error) { toast(error.message, 'error'); return }
      const newM: Meeting = { id: (data as any).id, activation_id: meetForm.activation_id || null,
        gerente_id: meetForm.gerente_id, title: meetForm.title, date: meetForm.date,
        time: meetForm.time, endTime: meetForm.endTime, status: meetForm.status,
        notes: meetForm.notes, clientEmail: meetForm.clientEmail,
        google_event_id: '', meet_link: '', gerenteName }
      setMeetings(p => [...p, newM])
      toast('Reunião agendada!', 'success')

      // Google Calendar
      supabase.functions.invoke('schedule-call', {
        body: {
          action: 'create', title: meetForm.title, date: meetForm.date,
          time: meetForm.time || '09:00', end_time: meetForm.endTime || '',
          closerName: gerenteName, closerEmail: user?.email || '',
          clientEmail: meetForm.clientEmail || '', notes: meetForm.notes,
        },
      }).then(async ({ data: fnData, error: fnErr }) => {
        if (fnErr) { toast('Salvo, mas falhou no Google Calendar', 'error'); return }
        const { eventId, meetLink } = (fnData || {}) as any
        if (eventId) {
          await supabase.from('followup_meetings').update({ google_event_id: eventId, meet_link: meetLink ?? '' }).eq('id', newM.id)
          setMeetings(p => p.map(m => m.id === newM.id ? { ...m, google_event_id: eventId, meet_link: meetLink ?? '' } : m))
        }
        toast('Google Calendar sincronizado ✓', 'success')
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
    const f = funil(a.faturamento_mensal)
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {user?.role === 'Admin' && (
              <Sel value={filterGerente} onChange={setFilterGerente}
                options={gerentes.map(g => ({ value: g.id, label: g.name }))}
                placeholder="Todos os gerentes" />
            )}
            <Button icon={Plus} onClick={() => openNewMeet()}>Nova Reunião</Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card2)', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' }}>
          {([['funis','Funis de Clientes'],['agenda','Agenda']] as const).map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: tab === k ? 'var(--action)' : 'transparent',
              color: tab === k ? '#fff' : 'var(--text2)', fontWeight: 600, fontSize: 13,
            }}>{l}</button>
          ))}
        </div>

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
                        const color = MEET_STATUS_COLORS[m.status] || 'var(--action)'
                        return (
                          <div key={m.id} onClick={e => { e.stopPropagation(); setSheetMeet(m) }}
                            style={{ fontSize: 10, borderRadius: 4, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: `color-mix(in srgb, ${color} 20%, transparent)`, border: `1px solid ${color}`, color }}>
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
                        const color = MEET_STATUS_COLORS[m.status] || 'var(--action)'
                        return (
                          <div key={m.id} onClick={() => setSheetMeet(m)}
                            style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 10, cursor: 'pointer', borderLeft: `3px solid ${color}` }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{m.time}{m.endTime ? ` – ${m.endTime}` : ''}</div>
                            <div style={{ fontSize: 11, color, fontWeight: 600 }}>{m.gerenteName.split(' ')[0]}</div>
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

        {/* ── Modal: Editar cliente ── */}
        <Modal open={!!modalClient} onClose={() => setModalClient(null)} title={`Cliente — ${modalClient?.client}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Faturamento Mensal (R$)">
              <input className="inp" value={clientForm.faturamento_mensal}
                onChange={e => setClientForm(p => ({ ...p, faturamento_mensal: e.target.value }))}
                placeholder="Ex: 75000" type="number" />
            </Field>
            {clientForm.faturamento_mensal && (
              <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card2)' }}>
                Funil: <span style={{ fontWeight: 700, color: FUNIL_COLORS[funil(parseFloat(clientForm.faturamento_mensal) || 0) || 'Starter'] }}>
                  {funil(parseFloat(clientForm.faturamento_mensal) || 0) || '—'}
                </span>
              </div>
            )}
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
              <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Gerente</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={sheetMeet.gerenteName} size={32} />
                  <span style={{ fontWeight: 600 }}>{sheetMeet.gerenteName}</span>
                </div>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><Button variant="secondary" icon={Phone} onClick={() => openEditMeet(sheetMeet)}>Editar</Button></div>
                <div style={{ flex: 1 }}><Button variant="destructive" icon={Trash2} onClick={() => deleteMeeting(sheetMeet)}>Apagar</Button></div>
              </div>
            </div>
          )}
        </Sheet>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
