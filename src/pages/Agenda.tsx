
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft, ChevronRight, Plus, Phone, Calendar, CheckCircle, XCircle, Clock, Loader2, ExternalLink, Video, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';
import { Field, Sel } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';
import type { CallStatus } from '@/lib/supabase/database.types';

const DAYS   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CALL_STATUS_COLORS: Record<string, string> = {
  'Agendada':  'var(--action)',
  'Realizada': 'var(--green)',
  'Cancelada': 'var(--red)',
  'No-show':   'var(--orange)',
};

// Google Calendar colorId palette — mesma lógica na edge function
const GCAL_COLORS: Record<number, string> = {
  1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73',  5: '#f6c026',
  6: '#f5511d', 7: '#039be5', 8: '#3f51b5', 9: '#0b8043', 10: '#d50000', 11: '#f691b3',
};
function closerColorId(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return (hash % 11) + 1;
}
function closerColor(name: string): string {
  return GCAL_COLORS[closerColorId(name)] ?? '#7986cb';
}

const DAYS_FULL = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

type DbUser  = { id: string; name: string; role: string }
type CallItem = {
  id:              string
  title:           string
  date:            string
  time:            string
  endTime:         string
  responsibleId:   string
  responsible:     string
  status:          string
  notes:           string
  clientEmail:     string
  google_event_id: string
  meet_link:       string
}

function formatInviteText(call: CallItem): string {
  const d       = new Date(call.date + 'T12:00:00');
  const dayName = DAYS_FULL[d.getDay()];
  const day     = d.getDate();
  const month   = MONTHS_PT[d.getMonth()];
  const range   = call.endTime ? `${call.time} – ${call.endTime}` : call.time;
  let text = `${call.title}\n\n${dayName}, ${day} de ${month} · ${range}\nFuso horário: America/Sao_Paulo`;
  if (call.meet_link) {
    text += `\n\nComo participar do Google Meet\nLink da videochamada: ${call.meet_link}`;
  }
  return text;
}

const EMPTY_FORM = { title: '', date: '', time: '', endTime: '', responsibleId: '', status: 'Agendada', notes: '', clientEmail: '' };

export default function AgendaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (!loading && !user) navigate('/login'); }, [user, loading, navigate]);
  if (loading || !user) return null;
  return <AgendaContent />;
}

function AgendaContent() {
  const { user } = useAuth();
  const toast = useToast();
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [activeTab, setActiveTab] = useState('Todos');
  const [viewMode, setViewMode]   = useState<'month' | 'week' | 'day'>('month');
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [nowTime, setNowTime] = useState(() => new Date());

  const [calls, setCalls]         = useState<CallItem[]>([]);
  const [users, setUsers]         = useState<DbUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  const [modal, setModal]             = useState(false);
  const [sheetCall, setSheetCall]     = useState<CallItem | null>(null);
  const [editCall, setEditCall]       = useState<CallItem | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [closerModal, setCloserModal] = useState<{ id: string; name: string } | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: dbCalls, error: ce }, { data: dbUsers, error: ue }] = await Promise.all([
        supabase.from('calls')
          .select('id,title,date,time,end_time,responsible,status,notes,client_email,google_event_id,meet_link')
          .order('date').order('time'),
        supabase.from('users').select('id,name,role').order('name'),
      ]);
      if (ce) toast(ce.message, 'error');
      if (ue) toast(ue.message, 'error');

      const userList = (dbUsers || []) as DbUser[];
      setUsers(userList);
      if (dbCalls) {
        setCalls((dbCalls as any[]).map(c => ({
          id:              c.id,
          title:           c.title,
          date:            c.date,
          time:            (c.time as string)?.slice(0, 5) || '',
          endTime:         (c.end_time as string)?.slice(0, 5) || '',
          responsibleId:   c.responsible,
          responsible:     userList.find(u => u.id === c.responsible)?.name || '?',
          status:          c.status,
          notes:           c.notes ?? '',
          clientEmail:     c.client_email ?? '',
          google_event_id: c.google_event_id ?? '',
          meet_link:       c.meet_link ?? '',
        })));
      }
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closers       = users.filter(u => u.role === 'Closer');
  const filteredCalls = activeTab === 'Todos' ? calls : calls.filter(c => c.responsible === activeTab);

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  // atualiza o indicador de hora atual a cada minuto
  useEffect(() => {
    const t = setInterval(() => setNowTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  function getCallsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filteredCalls.filter(c => c.date === dateStr);
  }
  function getCallsForDate(dateStr: string) {
    return filteredCalls.filter(c => c.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));
  }
  function dateAdd(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function getWeekDates(dateStr: string): string[] {
    const d   = new Date(dateStr + 'T12:00:00');
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((dow + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(mon); x.setDate(mon.getDate() + i); return x.toISOString().slice(0, 10);
    });
  }
  function timeToMin(t: string): number {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  const weekDates  = getWeekDates(selectedDate);
  const selDateObj = new Date(selectedDate + 'T12:00:00');
  const navLabel   = viewMode === 'month'
    ? `${MONTHS[month]} ${year}`
    : viewMode === 'week'
    ? (() => {
        const s = new Date(weekDates[0]+'T12:00:00'), e = new Date(weekDates[6]+'T12:00:00');
        return `${s.getDate()}–${e.getDate()} ${MONTHS_PT[e.getMonth()]} ${e.getFullYear()}`;
      })()
    : `${DAYS_FULL[selDateObj.getDay()]}, ${selDateObj.getDate()} de ${MONTHS_PT[selDateObj.getMonth()]}`;

  function prevNav() {
    if (viewMode === 'month') prevMonth();
    else if (viewMode === 'week') setSelectedDate(d => dateAdd(d, -7));
    else setSelectedDate(d => dateAdd(d, -1));
  }
  function nextNav() {
    if (viewMode === 'month') nextMonth();
    else if (viewMode === 'week') setSelectedDate(d => dateAdd(d, 7));
    else setSelectedDate(d => dateAdd(d, 1));
  }
  function goToday() {
    setSelectedDate(todayStr);
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  function openNew() {
    setEditCall(null);
    setForm({ ...EMPTY_FORM });
    setModal(true);
  }

  function openEdit(call: CallItem) {
    setEditCall(call);
    setForm({ title: call.title, date: call.date, time: call.time, endTime: call.endTime || '', responsibleId: call.responsibleId, status: call.status, notes: call.notes, clientEmail: call.clientEmail || '' });
    setSheetCall(null);
    setModal(true);
  }

  async function saveCall() {
    if (!form.title || !form.date || !form.responsibleId) {
      toast('Preencha título, data e responsável.', 'error'); return;
    }
    setIsSaving(true);
    const responsibleName = users.find(u => u.id === form.responsibleId)?.name || '?';

    if (editCall) {
      const patch = {
        title:        form.title,
        date:         form.date,
        time:         form.time || '00:00',
        end_time:     form.endTime || '',
        responsible:  form.responsibleId,
        status:       form.status as CallStatus,
        notes:        form.notes,
        client_email: form.clientEmail,
      };
      const { error } = await supabase.from('calls').update(patch).eq('id', editCall.id);
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      setCalls(p => p.map(c => c.id === editCall.id
        ? { ...c, ...patch, responsibleId: form.responsibleId, responsible: responsibleName, time: form.time, endTime: form.endTime, clientEmail: form.clientEmail }
        : c));
      setModal(false);
      toast('Call atualizada!', 'success');

      if (editCall.google_event_id) {
        supabase.functions.invoke('schedule-call', {
          body: {
            action: 'update', google_event_id: editCall.google_event_id,
            title: form.title, date: form.date, time: form.time || '09:00', end_time: form.endTime || '',
            closerName: responsibleName, closerEmail: user?.email || '',
            clientEmail: form.clientEmail || '', notes: form.notes,
          },
        }).then(({ error: fnErr }) => {
          if (fnErr) toast('Google Calendar: falha ao atualizar', 'error');
          else toast('Google Calendar atualizado ✓', 'success');
        });
      }
    } else {
      const row = {
        title:        form.title,
        date:         form.date,
        time:         form.time || '00:00',
        end_time:     form.endTime || '',
        responsible:  form.responsibleId,
        status:       form.status as CallStatus,
        notes:        form.notes,
        client_email: form.clientEmail,
      };
      const { data, error } = await supabase.from('calls').insert(row).select().single();
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      const newCall: CallItem = {
        id: (data as any).id, title: form.title, date: form.date, time: form.time, endTime: form.endTime,
        responsibleId: form.responsibleId, responsible: responsibleName,
        status: form.status, notes: form.notes, clientEmail: form.clientEmail,
        google_event_id: '', meet_link: '',
      };
      setCalls(p => [newCall, ...p]);
      setModal(false);
      toast('Call agendada!', 'success');

      supabase.functions.invoke('schedule-call', {
        body: {
          action: 'create',
          title: form.title, date: form.date, time: form.time || '09:00', end_time: form.endTime || '',
          closerName: responsibleName, closerEmail: user?.email || '',
          clientEmail: form.clientEmail || '', notes: form.notes,
        },
      }).then(async ({ data: fnData, error: fnErr }) => {
        if (fnErr) { toast('Call salva, mas falhou no Google Calendar', 'error'); return; }
        const { eventId, meetLink } = (fnData || {}) as { eventId?: string; meetLink?: string };
        if (eventId) {
          await supabase.from('calls').update({ google_event_id: eventId, meet_link: meetLink ?? '' }).eq('id', newCall.id);
          setCalls(p => p.map(c => c.id === newCall.id ? { ...c, google_event_id: eventId, meet_link: meetLink ?? '' } : c));
        }
        toast('Sincronizado com Google Calendar ✓', 'success');
      });
    }
  }

  async function deleteCall(call: CallItem) {
    if (!window.confirm('Apagar esta call permanentemente?')) return;
    const { error } = await supabase.from('calls').delete().eq('id', call.id);
    if (error) { toast(error.message, 'error'); return; }
    setCalls(p => p.filter(c => c.id !== call.id));
    setSheetCall(null);
    toast('Call apagada.', 'success');
    if (call.google_event_id) {
      supabase.functions.invoke('schedule-call', {
        body: { action: 'delete', google_event_id: call.google_event_id },
      }).then(({ error: fnErr }) => {
        if (fnErr) toast('Removido localmente, falhou no Google Calendar', 'error');
        else toast('Removido do Google Calendar ✓', 'success');
      });
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('calls').update({ status: status as CallStatus }).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setCalls(p => p.map(c => c.id === id ? { ...c, status } : c));
    setSheetCall(prev => prev?.id === id ? { ...prev, status } : prev);
    toast(`Status: ${status}`, 'success');
  }

  const upcoming = filteredCalls
    .filter(c => c.status === 'Agendada')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const closerStats = closers.map(u => {
    const uCalls = calls.filter(c => c.responsibleId === u.id);
    const done   = uCalls.filter(c => c.status === 'Realizada').length;
    return { id: u.id, name: u.name, total: uCalls.length, done, rate: uCalls.length ? Math.round((done / uCalls.length) * 100) : 0 };
  });

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando agenda…</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Agenda</h1>
          <Button icon={Plus} onClick={openNew}>Nova Call</Button>
        </div>

        {/* ── KPIs ───────────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
          {([
            { label: 'Agendadas',  value: calls.filter(c => c.status === 'Agendada').length,  color: 'var(--action)' },
            { label: 'Realizadas', value: calls.filter(c => c.status === 'Realizada').length, color: 'var(--green)'  },
            { label: 'Canceladas', value: calls.filter(c => c.status === 'Cancelada').length, color: 'var(--red)'    },
            { label: 'No-show',    value: calls.filter(c => c.status === 'No-show').length,   color: 'var(--orange)' },
          ] as { label: string; value: number; color: string }[]).map(k => (
            <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs por Closer ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['Todos', ...closers.map(c => c.name)] as string[]).map(tab => {
            const isActive = activeTab === tab;
            const bg = isActive ? (tab === 'Todos' ? 'var(--action)' : closerColor(tab)) : 'var(--bg-card)';
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '6px 18px', borderRadius: 20,
                border: `1px solid ${isActive ? 'transparent' : 'var(--border)'}`,
                background: bg, color: isActive ? '#fff' : 'var(--text)',
                fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s',
              }}>{tab === 'Todos' ? 'Todos' : tab.split(' ')[0]}</button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          {/* Calendário Multi-Visão */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>

            {/* ── Toolbar: nav + view switcher ─────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={prevNav} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6 }}><ChevronLeft size={18} /></button>
                <div style={{ fontWeight: 700, fontSize: 15, minWidth: 200, textAlign: 'center' }}>{navLabel}</div>
                <button onClick={nextNav} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6 }}><ChevronRight size={18} /></button>
                <button onClick={goToday} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', cursor: 'pointer', marginLeft: 4, fontFamily: 'inherit' }}>Hoje</button>
              </div>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card2)', borderRadius: 8, padding: 3 }}>
                {(['month','week','day'] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)} style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: viewMode === v ? 'var(--action)' : 'transparent',
                    color: viewMode === v ? '#fff' : 'var(--text2)',
                    fontWeight: 600, fontSize: 12, transition: 'all .15s',
                  }}>{v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Dia'}</button>
                ))}
              </div>
            </div>

            {/* ── Month View ───────────────────────────────────────────── */}
            {viewMode === 'month' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text2)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '.04em' }}>{d}</div>
                ))}
                {cells.map((day, i) => {
                  if (!day) return <div key={`e${i}`} />;
                  const dayCalls = getCallsForDay(day);
                  const isToday  = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  const dStr     = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  return (
                    <div key={day} onClick={() => { setSelectedDate(dStr); setViewMode('day'); }}
                      style={{ minHeight: 60, padding: 4, borderRadius: 8, cursor: 'pointer',
                        background: isToday ? 'color-mix(in srgb, var(--action) 12%, transparent)' : 'transparent',
                        border: isToday ? '1px solid var(--action)' : '1px solid transparent',
                      }}>
                      <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--action)' : 'var(--text)', marginBottom: 2 }}>{day}</div>
                      {dayCalls.slice(0, 2).map(c => {
                        const cc = closerColor(c.responsible);
                        return (
                          <div key={c.id} onClick={e => { e.stopPropagation(); setSheetCall(c); }} style={{
                            fontSize: 10, borderRadius: 4, padding: '2px 4px', marginBottom: 2,
                            cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            background: `color-mix(in srgb, ${cc} 20%, transparent)`,
                            border: `1px solid ${cc}`, color: cc,
                          }}>{c.time} {c.title}</div>
                        );
                      })}
                      {dayCalls.length > 2 && <div style={{ fontSize: 9, color: 'var(--text2)' }}>+{dayCalls.length - 2}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Week View ────────────────────────────────────────────── */}
            {viewMode === 'week' && (() => {
              const WD_SHORT = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {weekDates.map((dStr, i) => {
                    const dObj     = new Date(dStr + 'T12:00:00');
                    const isToday  = dStr === todayStr;
                    const dayCalls = getCallsForDate(dStr);
                    return (
                      <div key={dStr}>
                        <div onClick={() => { setSelectedDate(dStr); setViewMode('day'); }}
                          style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                            background: isToday ? 'color-mix(in srgb, var(--action) 15%, transparent)' : 'transparent',
                            border: isToday ? '1px solid var(--action)' : '1px solid var(--border)',
                          }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'var(--action)' : 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{WD_SHORT[i]}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: isToday ? 'var(--action)' : 'var(--text)', lineHeight: 1.2, marginTop: 2 }}>{dObj.getDate()}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 80 }}>
                          {dayCalls.map(c => {
                            const cc = closerColor(c.responsible);
                            return (
                              <div key={c.id} onClick={() => setSheetCall(c)} style={{
                                borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
                                background: `color-mix(in srgb, ${cc} 18%, transparent)`,
                                border: `1px solid ${cc}`,
                              }}>
                                <div style={{ fontSize: 10, color: cc, fontWeight: 700 }}>{c.time}</div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                                {c.meet_link && <Video size={9} color={cc} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Day View ─────────────────────────────────────────────── */}
            {viewMode === 'day' && (() => {
              const DAY_START_H = 8;
              const DAY_END_H   = 21;
              const HOUR_PX     = 64;
              const TOTAL_PX    = (DAY_END_H - DAY_START_H) * HOUR_PX;
              const DAY_START_M = DAY_START_H * 60;
              const TOTAL_M     = (DAY_END_H - DAY_START_H) * 60;
              const HOURS       = Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => DAY_START_H + i);
              const dayCalls    = getCallsForDate(selectedDate);
              const nowMin      = nowTime.getHours() * 60 + nowTime.getMinutes();
              const showNow     = selectedDate === todayStr && nowMin >= DAY_START_M && nowMin <= DAY_END_H * 60;
              const nowPx       = ((nowMin - DAY_START_M) / TOTAL_M) * TOTAL_PX;
              return (
                <div style={{ display: 'flex', overflowY: 'auto', maxHeight: 600 }}>
                  {/* Eixo de horas */}
                  <div style={{ width: 52, flexShrink: 0, paddingTop: 0 }}>
                    {HOURS.map(h => (
                      <div key={h} style={{ height: HOUR_PX, display: 'flex', alignItems: 'flex-start', paddingTop: 2, justifyContent: 'flex-end', paddingRight: 10 }}>
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap' }}>{String(h).padStart(2,'0')}:00</span>
                      </div>
                    ))}
                  </div>
                  {/* Grid de eventos */}
                  <div style={{ flex: 1, position: 'relative', height: TOTAL_PX }}>
                    {HOURS.map(h => (
                      <div key={h} style={{ position: 'absolute', top: (h - DAY_START_H) * HOUR_PX, left: 0, right: 0,
                        borderTop: `1px solid var(--border)`, pointerEvents: 'none' }} />
                    ))}
                    {/* Indicador de hora atual */}
                    {showNow && (
                      <div style={{ position: 'absolute', top: nowPx, left: 0, right: 0, zIndex: 10, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', flexShrink: 0, marginLeft: -4 }} />
                        <div style={{ flex: 1, height: 2, background: 'var(--red)' }} />
                      </div>
                    )}
                    {/* Eventos */}
                    {dayCalls.map(c => {
                      const startM = timeToMin(c.time);
                      const endM   = c.endTime ? timeToMin(c.endTime) : startM + 60;
                      if (startM < DAY_START_M || startM > DAY_END_H * 60) return null;
                      const top    = Math.max(0, ((startM - DAY_START_M) / TOTAL_M) * TOTAL_PX);
                      const height = Math.max(44, ((endM - startM) / TOTAL_M) * TOTAL_PX);
                      const cc     = closerColor(c.responsible);
                      return (
                        <div key={c.id} onClick={() => setSheetCall(c)}
                          style={{ position: 'absolute', top, left: 4, right: 4, height,
                            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', overflow: 'hidden',
                            background: `color-mix(in srgb, ${cc} 20%, var(--bg-card))`,
                            border: `1.5px solid ${cc}`,
                          }}>
                          <div style={{ fontSize: 11, color: cc, fontWeight: 700, marginBottom: 2 }}>
                            {c.time}{c.endTime ? ` – ${c.endTime}` : ''}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.responsible}</div>
                          {c.meet_link && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Video size={11} color="#1a73e8" />
                              <span style={{ fontSize: 10, color: '#1a73e8', fontWeight: 600 }}>Meet</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dayCalls.length === 0 && (
                      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)',
                        textAlign: 'center', color: 'var(--text2)', fontSize: 13, pointerEvents: 'none' }}>
                        Nenhuma call neste dia
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Próximas Calls</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcoming.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>Nenhuma call agendada</div>}
                {upcoming.map(c => {
                  const cc = closerColor(c.responsible);
                  return (
                    <div key={c.id} onClick={() => setSheetCall(c)} style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 10, cursor: 'pointer', borderLeft: `3px solid ${cc}` }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{c.date} às {c.time}</div>
                      <div style={{ fontSize: 11, color: cc, fontWeight: 600 }}>{c.responsible}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Calendar size={18} color="var(--green)" />
                <div style={{ fontWeight: 700, fontSize: 14 }}>Google Calendar</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
                OAuth Refresh Token ativo.<br />
                Google Meet gerado automaticamente ao agendar.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                <ExternalLink size={13} />
                Calendário compartilhado configurado
              </div>
            </div>
          </div>
        </div>

        {/* ── Performance por Closer ───────────────────────────────────────────── */}
        {closerStats.length > 0 && (
          <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Performance por Closer</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {closerStats.map(c => {
                const cc = closerColor(c.name);
                return (
                  <div key={c.name} onClick={() => setCloserModal({ id: c.id, name: c.name })}
                    style={{ background: 'var(--bg-card2)', borderRadius: 12, padding: 16, cursor: 'pointer',
                      border: '1px solid transparent', transition: 'border .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.border = `1px solid ${cc}`)}
                    onMouseLeave={e => (e.currentTarget.style.border = '1px solid transparent')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <Avatar name={c.name} size={34} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name.split(' ')[0]}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.total} call{c.total !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                      <span>{c.done}/{c.total} realizadas</span>
                      <span style={{ fontWeight: 700, color: c.rate >= 70 ? 'var(--green)' : c.rate >= 40 ? 'var(--orange)' : 'var(--red)' }}>{c.rate}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${c.rate}%`, background: c.rate >= 70 ? 'var(--green)' : c.rate >= 40 ? 'var(--orange)' : 'var(--red)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Modal: Nova / Editar Call ──────────────────────────────────────── */}
        <Modal open={modal} onClose={() => setModal(false)} title={editCall ? 'Editar Call' : 'Nova Call'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Título">
              <input className="inp" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Discovery Call – João" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Data">
                <input className="inp" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Hora Início">
                <input className="inp" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
              </Field>
              <Field label="Hora Fim">
                <input className="inp" type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
              </Field>
            </div>
            <Field label="Responsável (Closer)">
              <Sel value={form.responsibleId} onChange={v => setForm({ ...form, responsibleId: v })}
                options={closers.map(u => ({ value: u.id, label: u.name }))} placeholder="Selecione o Closer" />
            </Field>
            <Field label="Status">
              <Sel value={form.status} onChange={v => setForm({ ...form, status: v })}
                options={['Agendada', 'Realizada', 'Cancelada', 'No-show']} placeholder="Status" />
            </Field>
            <Field label="E-mail do Cliente">
              <input className="inp" type="email" value={form.clientEmail}
                onChange={e => setForm({ ...form, clientEmail: e.target.value })}
                placeholder="cliente@email.com (opcional)" />
            </Field>
            <Field label="Observações">
              <textarea className="inp" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas sobre a call..." style={{ resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
              <Button onClick={saveCall} disabled={isSaving}>
                {editCall ? (isSaving ? 'Salvando…' : 'Salvar') : (isSaving ? 'Agendando…' : 'Agendar')}
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Modal: Calls do Closer ─────────────────────────────────────────── */}
        <Modal open={closerModal !== null} onClose={() => setCloserModal(null)}
          title={`Calls — ${closerModal?.name ?? ''}`}>
          <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {(() => {
              const closerCalls = calls
                .filter(c => c.responsibleId === closerModal?.id)
                .sort((a, b) => b.date.localeCompare(a.date));
              if (closerCalls.length === 0) return (
                <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 32, fontSize: 13 }}>
                  Nenhuma call registrada.
                </div>
              );
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Data', 'Hora', 'Título', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                          color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em',
                          borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closerCalls.map((c, i) => (
                      <tr key={c.id}
                        style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', cursor: 'pointer' }}
                        onClick={() => { setCloserModal(null); setSheetCall(c); }}>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                          {new Date(c.date).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                          {c.time}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                          {c.title}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          <span style={{
                            background: `color-mix(in srgb, ${CALL_STATUS_COLORS[c.status] || 'var(--text2)'} 15%, var(--bg-card2))`,
                            color: CALL_STATUS_COLORS[c.status] || 'var(--text2)',
                            border: `1px solid ${CALL_STATUS_COLORS[c.status] || 'var(--border)'}`,
                            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700,
                          }}>{c.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </Modal>

        {/* ── Sheet: Detalhe da Call ─────────────────────────────────────────── */}
        <Sheet open={!!sheetCall} onClose={() => setSheetCall(null)} title="Detalhe da Call">
          {sheetCall && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{sheetCall.title}</div>
                <Badge label={sheetCall.status} color={CALL_STATUS_COLORS[sheetCall.status] || 'var(--text2)'} />
              </div>

              {/* Link do Meet */}
              {sheetCall.meet_link && (
                <a href={sheetCall.meet_link} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#1a73e8', color: '#fff', borderRadius: 10, padding: '12px 16px',
                    fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <Video size={16} /> Entrar no Google Meet
                </a>
              )}

              {/* Bloco de cópia para WhatsApp */}
              {(() => {
                const inviteText = formatInviteText(sheetCall);
                return (
                  <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        Convite para copiar
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(inviteText); toast('Copiado!', 'success'); }}
                        style={{ background: 'var(--action)', color: '#fff', border: 'none', borderRadius: 6,
                          padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Copiar
                      </button>
                    </div>
                    <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)' }}>
                      {inviteText}
                    </pre>
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Data</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{sheetCall.date}</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Horário</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{sheetCall.time}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Responsável</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={sheetCall.responsible} size={32} />
                  <span style={{ fontWeight: 600, color: closerColor(sheetCall.responsible) }}>{sheetCall.responsible}</span>
                </div>
              </div>

              {sheetCall.notes && (
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Observações</div>
                  <div style={{ fontSize: 13 }}>{sheetCall.notes}</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Alterar Status</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="success"     icon={CheckCircle} onClick={() => updateStatus(sheetCall.id, 'Realizada')}>Realizada</Button>
                  <Button size="sm" variant="destructive" icon={XCircle}     onClick={() => updateStatus(sheetCall.id, 'Cancelada')}>Cancelada</Button>
                  <Button size="sm" variant="warning"     icon={Clock}       onClick={() => updateStatus(sheetCall.id, 'No-show')}>No-show</Button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><Button variant="secondary" icon={Phone} onClick={() => openEdit(sheetCall)}>Editar</Button></div>
                <div style={{ flex: 1 }}><Button variant="destructive" icon={Trash2} onClick={() => deleteCall(sheetCall)}>Apagar</Button></div>
              </div>
            </div>
          )}
        </Sheet>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
