
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft, ChevronRight, ChevronDown, Plus, Phone, Calendar, CheckCircle, XCircle, Clock, Loader2, ExternalLink, Video, Trash2, RefreshCw } from 'lucide-react';
import { useAuth, hasAnyRole } from '@/lib/authContext';
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
import { isSDRRole } from '@/lib/utils';

const DAYS   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CALL_STATUS_COLORS: Record<string, string> = {
  'Agendada':        'var(--action)',
  'Em Atendimento':  'var(--cyan)',
  'Realizada':       'var(--green)',
  'Cancelada':       'var(--red)',
  'No-show':         'var(--orange)',
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

// Ícone de status da call — usado nas visões de mês/semana/dia da agenda
function CallStatusIcon({ status, size = 11 }: { status: string; size?: number }) {
  switch (status) {
    case 'Realizada':
      return <CheckCircle size={size} color="var(--green)" strokeWidth={2.5} />
    case 'Cancelada':
      return <XCircle size={size} color="var(--red)" strokeWidth={2.5} />
    case 'No-show':
      return <Clock size={size} color="var(--orange)" strokeWidth={2.5} />
    case 'Em Atendimento':
      return (
        <span style={{
          width: size - 3, height: size - 3, borderRadius: '50%', background: 'var(--cyan)',
          display: 'inline-block', flexShrink: 0, animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      )
    default:
      return null
  }
}

const DAYS_FULL = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

type DbUser  = { id: string; name: string; role: string; email: string; extra_roles: string[] | null }
type CallItem = {
  id:                    string
  title:                 string
  date:                  string
  time:                  string
  endTime:               string
  responsibleId:         string
  responsible:           string
  status:                string
  notes:                 string
  clientEmail:           string
  campanha:              string
  google_event_id:       string
  meet_link:             string
  ativado:               boolean | null
  motivo_nao_ativacao:   string | null
  motivo_cancelamento:   string | null
  motivo_noshow:         string | null
  sdrNome:               string
  image_urls:            string[]
  updatedAt:             string | null
}

const CAMPANHAS = [
  'Campanha Iphone Antiga',
  'Campanha Juros',
  'Campanha Low Ticket',
  'Campanha Meta - Formulário Nativo',
  'Campanha Formulário Distr. Leads',
]

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

type HistoryCall = CallItem & { period: string };

const EMPTY_FORM = { title: '', date: '', time: '', endTime: '', responsibleId: '', status: 'Agendada', notes: '', clientEmail: '', sdrNome: '', campanha: '' };

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
  const [gcConnected, setGcConnected] = useState<boolean | null>(null);
  const [isSyncingOld, setIsSyncingOld] = useState(false);
  const isAdmin = hasAnyRole(user, ['Admin']);

  const [modal, setModal]             = useState(false);
  const [sheetCall, setSheetCall]     = useState<CallItem | null>(null);
  const [editCall, setEditCall]       = useState<CallItem | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [closerModal, setCloserModal] = useState<{ id: string; name: string } | null>(null);
  const [motivoInput,  setMotivoInput]  = useState('');
  const [motivoImages, setMotivoImages] = useState<File[]>([]);
  const [pendingStatus, setPendingStatus] = useState<'Cancelada' | 'No-show' | null>(null);
  const [motivoStatus,  setMotivoStatus]  = useState('');
  // Filtros da tabela de reuniões
  const [tableFilterResp, setTableFilterResp] = useState('');
  const [tableFilterSdr,  setTableFilterSdr]  = useState('');
  // Filtros da agenda (calendário + próximas calls)
  const [statusFilter,   setStatusFilter]   = useState('');
  const [campanhaFilter, setCampanhaFilter] = useState('');

  const [history, setHistory]               = useState<HistoryCall[]>([]);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: dbCalls, error: ce }, { data: dbUsers, error: ue }, { data: dbHistory }] = await Promise.all([
        supabase.from('calls')
          .select('id,title,date,time,end_time,responsible,status,notes,client_email,google_event_id,meet_link,ativado,motivo_nao_ativacao,motivo_cancelamento,motivo_noshow,sdr_nome,image_urls,updated_at,created_at')
          .order('date').order('time'),
        supabase.from('users').select('id,name,role,email,extra_roles').order('name'),
        supabase.from('calls_history')
          .select('id,title,date,time,end_time,responsible,status,notes,client_email,google_event_id,meet_link,period')
          .order('period', { ascending: false }).order('date').order('time'),
      ]);
      if (ce) toast(ce.message, 'error');
      if (ue) toast(ue.message, 'error');

      const userList = (dbUsers || []) as DbUser[];
      setUsers(userList);
      const mapCall = (c: any, period?: string) => ({
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
        google_event_id:     c.google_event_id ?? '',
        meet_link:           c.meet_link ?? '',
        ativado:              c.ativado ?? null,
        motivo_nao_ativacao:  c.motivo_nao_ativacao ?? null,
        motivo_cancelamento:  c.motivo_cancelamento ?? null,
        motivo_noshow:        c.motivo_noshow ?? null,
        sdrNome:              c.sdr_nome || 'Carlos Eduardo',
        campanha:             c.campanha ?? '',
        image_urls:          (c.image_urls as string[]) ?? [],
        updatedAt:            c.updated_at !== c.created_at ? (c.updated_at ?? null) : null,
        ...(period !== undefined ? { period } : {}),
      });

      if (dbCalls) setCalls((dbCalls as any[]).map(c => mapCall(c)));
      if (dbHistory) setHistory((dbHistory as any[]).map(c => mapCall(c, c.period) as HistoryCall));
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Google Calendar OAuth ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('users').select('google_refresh_token').eq('id', user.id).maybeSingle()
      .then(({ data }) => setGcConnected(!!data?.google_refresh_token));
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_oauth');
    if (result === 'success') { toast('Google Calendar conectado! ✓', 'success'); setGcConnected(true); }
    if (result === 'error')   { toast('Erro ao conectar Google Calendar.', 'error'); }
    if (result) window.history.replaceState({}, '', '/agenda');
  }, [user?.id]);

  async function connectGoogleCalendar() {
    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch(
      `${(supabase as any).supabaseUrl}/functions/v1/google-oauth?action=url`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: user?.id, return_to: '/agenda' }) }
    );
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    else toast('Erro ao gerar URL de autorização.', 'error');
  }

  async function disconnectGoogleCalendar() {
    const session = (await supabase.auth.getSession()).data.session;
    await fetch(
      `${(supabase as any).supabaseUrl}/functions/v1/google-oauth?action=disconnect`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: user?.id }) }
    );
    setGcConnected(false);
    toast('Google Calendar desconectado.', 'info');
  }

  const closers       = users.filter(u => u.role === 'Closer');
  const filteredCalls = calls.filter(c =>
    (activeTab === 'Todos' || c.responsible === activeTab) &&
    (!statusFilter || c.status === statusFilter) &&
    (!campanhaFilter || c.campanha === campanhaFilter)
  );

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
    setForm({ title: call.title, date: call.date, time: call.time, endTime: call.endTime || '', responsibleId: call.responsibleId, status: call.status, notes: call.notes, clientEmail: call.clientEmail || '', sdrNome: call.sdrNome || '', campanha: call.campanha || '' });
    setSheetCall(null);
    setModal(true);
  }

  async function saveCall() {
    if (!form.title || !form.date || !form.responsibleId) {
      toast('Preencha título, data e responsável.', 'error'); return;
    }
    setIsSaving(true);
    const responsibleUser = users.find(u => u.id === form.responsibleId);
    const responsibleName = responsibleUser?.name || '?';
    const responsibleEmail = responsibleUser?.email || '';

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
        sdr_nome:     form.sdrNome || null,
        campanha:     form.campanha || '',
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
            closerName: responsibleName, closerEmail: responsibleEmail,
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
        sdr_nome:     form.sdrNome || null,
        campanha:     form.campanha || '',
      };
      const { data, error } = await supabase.from('calls').insert(row).select().single();
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      const newCall: CallItem = {
        id: (data as any).id, title: form.title, date: form.date, time: form.time, endTime: form.endTime,
        responsibleId: form.responsibleId, responsible: responsibleName,
        status: form.status, notes: form.notes, clientEmail: form.clientEmail,
        campanha: form.campanha || '',
        google_event_id: '', meet_link: '',
      };
      setCalls(p => [newCall, ...p]);
      setModal(false);
      toast('Call agendada!', 'success');

      supabase.functions.invoke('schedule-call', {
        body: {
          action: 'create',
          title: form.title, date: form.date, time: form.time || '09:00', end_time: form.endTime || '',
          closerName: responsibleName, closerEmail: responsibleEmail,
          sdrEmail: user?.email || '',
          clientEmail: form.clientEmail || '', notes: form.notes,
        },
      }).then(async ({ data: fnData, error: fnErr }) => {
        if (fnErr) { toast('Call salva, mas falhou no Google Calendar', 'error'); return; }
        const { eventId, meetLink } = (fnData || {}) as { eventId?: string; meetLink?: string };
        if (eventId) {
          await supabase.from('calls').update({ google_event_id: eventId, meet_link: meetLink ?? '' }).eq('id', newCall.id);
          setCalls(p => p.map(c => c.id === newCall.id ? { ...c, google_event_id: eventId, meet_link: meetLink ?? '' } : c));
          toast('Sincronizado com Google Calendar ✓', 'success');
        }
      });
    }
  }

  // Sincroniza calls antigas (sem google_event_id) com o calendário Cakto
  async function syncOldCallsToCalendar() {
    const missing = calls.filter(c => !c.google_event_id);
    if (missing.length === 0) { toast('Todas as calls já estão sincronizadas.', 'success'); return; }
    setIsSyncingOld(true);

    const items = missing.map(c => {
      const responsibleUser = users.find(u => u.id === c.responsibleId);
      const sdrUser = c.sdrNome ? users.find(u => u.name === c.sdrNome) : null;
      return {
        id: c.id, title: c.title, date: c.date, time: c.time || '09:00', end_time: c.endTime,
        closerName: responsibleUser?.name || c.responsible, closerEmail: responsibleUser?.email || '',
        sdrEmail: sdrUser?.email || '',
        clientEmail: c.clientEmail, notes: c.notes,
      };
    });

    const { data, error } = await supabase.functions.invoke('schedule-call', {
      body: { action: 'backfill-batch', items },
    });
    if (error) { toast('Falha ao sincronizar: ' + error.message, 'error'); setIsSyncingOld(false); return; }

    const results = (data?.results ?? []) as Array<{ id: string; ok: boolean; eventId?: string; meetLink?: string | null; error?: string }>;
    let okCount = 0;
    for (const r of results) {
      if (!r.ok || !r.eventId) continue;
      const { error: upErr } = await supabase.from('calls')
        .update({ google_event_id: r.eventId, meet_link: r.meetLink ?? '' }).eq('id', r.id);
      if (!upErr) {
        okCount++;
        setCalls(p => p.map(c => c.id === r.id ? { ...c, google_event_id: r.eventId!, meet_link: r.meetLink ?? '' } : c));
      }
    }
    setIsSyncingOld(false);
    toast(`${okCount}/${missing.length} calls sincronizadas com o Google Calendar (Cakto) ✓`, okCount > 0 ? 'success' : 'error');
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

  async function updateStatus(id: string, status: string, motivo?: string) {
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status: status as CallStatus, updated_at: now }
    if (status === 'Cancelada' && motivo !== undefined) patch.motivo_cancelamento = motivo || null
    if (status === 'No-show'   && motivo !== undefined) patch.motivo_noshow       = motivo || null
    const { error } = await supabase.from('calls').update(patch).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setCalls(p => p.map(c => c.id === id ? { ...c, status, ...patch, updatedAt: now } : c));
    setSheetCall(prev => prev?.id === id ? { ...prev, status, ...patch, updatedAt: now } as CallItem : prev);
    toast(`Status: ${status}`, 'success');
    setPendingStatus(null);
    setMotivoStatus('');
  }

  async function saveAtivacao(id: string, ativado: boolean, motivo?: string, images?: File[]) {
    // Faz upload das imagens se houver
    const uploadedUrls: string[] = []
    if (!ativado && images && images.length > 0) {
      for (const file of images) {
        const ext  = file.name.split('.').pop() ?? 'jpg'
        const path = `calls/${id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('ativacoes-arquivos').upload(path, file, { upsert: true })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('ativacoes-arquivos').getPublicUrl(path)
          if (urlData?.publicUrl) uploadedUrls.push(urlData.publicUrl)
        }
      }
    }

    const existingUrls = calls.find(c => c.id === id)?.image_urls ?? []
    const allUrls = [...existingUrls, ...uploadedUrls]

    const patch: Record<string, unknown> = {
      ativado,
      motivo_nao_ativacao: ativado ? null : (motivo ?? ''),
      updated_at: new Date().toISOString(),
      ...(uploadedUrls.length > 0 ? { image_urls: allUrls } : {}),
    }
    const { error } = await supabase.from('calls').update(patch).eq('id', id);
    const updatedAt = patch.updated_at as string
    if (error) { toast(error.message, 'error'); return; }
    setCalls(p => p.map(c => c.id === id ? { ...c, ...patch, image_urls: allUrls, updatedAt } : c));
    setSheetCall(prev => prev?.id === id ? { ...prev, ...patch, image_urls: allUrls, updatedAt } : prev);
    setMotivoImages([])
    toast(ativado ? 'Marcado como Ativado ✓' : 'Marcado como Não Ativado', 'success');
  }

  const upcoming = filteredCalls
    .filter(c => c.status === 'Agendada' || c.status === 'Em Atendimento')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const closerStats = closers.map(u => {
    const uCalls = calls.filter(c => c.responsibleId === u.id && c.date.startsWith(currentPeriod));
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
            { label: `Agendadas (${String(month + 1).padStart(2,'0')}/${year})`,  value: calls.filter(c => c.status === 'Agendada'  && c.date.startsWith(`${year}-${String(month + 1).padStart(2,'0')}`)).length, color: 'var(--action)' },
            { label: `Realizadas (${String(month + 1).padStart(2,'0')}/${year})`, value: calls.filter(c => c.status === 'Realizada' && c.date.startsWith(`${year}-${String(month + 1).padStart(2,'0')}`)).length, color: 'var(--green)'  },
            { label: `Canceladas (${String(month + 1).padStart(2,'0')}/${year})`, value: calls.filter(c => c.status === 'Cancelada' && c.date.startsWith(`${year}-${String(month + 1).padStart(2,'0')}`)).length, color: 'var(--red)'    },
            { label: `No-show (${String(month + 1).padStart(2,'0')}/${year})`,    value: calls.filter(c => c.status === 'No-show'   && c.date.startsWith(`${year}-${String(month + 1).padStart(2,'0')}`)).length, color: 'var(--orange)' },
          ] as { label: string; value: number; color: string }[]).map(k => (
            <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs por Closer + Filtros ───────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 170 }}>
              <Sel value={statusFilter} onChange={setStatusFilter}
                options={Object.keys(CALL_STATUS_COLORS)} placeholder="Todos os Status" />
            </div>
            <div style={{ minWidth: 220 }}>
              <Sel value={campanhaFilter} onChange={setCampanhaFilter}
                options={CAMPANHAS} placeholder="Todas as Campanhas" />
            </div>
          </div>
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
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3,
                            fontSize: 10, borderRadius: 4, padding: '2px 4px', marginBottom: 2,
                            cursor: 'pointer', overflow: 'hidden',
                            background: `color-mix(in srgb, ${cc} 20%, transparent)`,
                            border: `1px solid ${cc}`, color: cc,
                          }}>
                            <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.time} {c.title}</span>
                            <span style={{ flexShrink: 0 }}><CallStatusIcon status={c.status} size={9} /></span>
                          </div>
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                  <div style={{ fontSize: 10, color: cc, fontWeight: 700 }}>{c.time}</div>
                                  <CallStatusIcon status={c.status} size={10} />
                                </div>
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
                            <div style={{ fontSize: 11, color: cc, fontWeight: 700 }}>
                              {c.time}{c.endTime ? ` – ${c.endTime}` : ''}
                            </div>
                            <CallStatusIcon status={c.status} size={12} />
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
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
                Conecte sua conta para criar eventos e links do Meet automaticamente ao agendar calls.
              </div>
              {gcConnected === false && (
                <button onClick={connectGoogleCalendar} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', width: '100%', justifyContent: 'center',
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
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', width: '100%', justifyContent: 'center',
                  borderRadius: 8, border: '1px solid var(--green)', cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--green) 10%, var(--bg-card))',
                  color: 'var(--green)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                }}>
                  ✓ Google Calendar conectado
                </button>
              )}
              {gcConnected === null && (
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Verificando...</div>
              )}
              {isAdmin && (
                <button onClick={syncOldCallsToCalendar} disabled={isSyncingOld} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', width: '100%', justifyContent: 'center',
                  marginTop: 10, borderRadius: 8, border: '1px solid var(--border)', cursor: isSyncingOld ? 'default' : 'pointer',
                  background: 'var(--bg-card2)', color: 'var(--text2)', fontWeight: 600, fontSize: 12, fontFamily: 'inherit',
                  opacity: isSyncingOld ? .6 : 1,
                }}>
                  {isSyncingOld ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
                  {isSyncingOld ? 'Sincronizando...' : 'Sincronizar calls antigas (Cakto)'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Status de cada reunião/cliente ──────────────────────────────────── */}
        {(() => {
          const monthStr = `${year}-${String(month + 1).padStart(2,'0')}`
          const allMonthCalls = filteredCalls
            .filter(c => c.date.startsWith(monthStr))
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
          if (allMonthCalls.length === 0) return null

          // Opções únicas para os filtros
          const respOptions = [...new Set(allMonthCalls.map(c => c.responsible))].sort()
          const sdrOptions  = [...new Set(allMonthCalls.map(c => c.sdrNome).filter(Boolean))].sort()

          // Aplica filtros
          const monthCalls = allMonthCalls
            .filter(c => !tableFilterResp || c.responsible === tableFilterResp)
            .filter(c => !tableFilterSdr  || c.sdrNome === tableFilterSdr)

          const STATUS_COLOR: Record<string, string> = {
            Realizada: 'var(--green)', Agendada: 'var(--action)',
            'Em Atendimento': 'var(--cyan)',
            Cancelada: 'var(--red)', 'No-show': 'var(--orange)',
          }
          const selStyle: React.CSSProperties = {
            fontSize: 12, padding: '5px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-card2)',
            color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
          }
          return (
            <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>
                  Reuniões — {MONTHS[month]} {year}
                </div>
                {/* Filtro Responsável */}
                <select value={tableFilterResp} onChange={e => setTableFilterResp(e.target.value)} style={selStyle}>
                  <option value="">Todos os Responsáveis</option>
                  {respOptions.map(r => <option key={r} value={r}>{r.split(' ')[0]}</option>)}
                </select>
                {/* Filtro SDR */}
                <select value={tableFilterSdr} onChange={e => setTableFilterSdr(e.target.value)} style={selStyle}>
                  <option value="">Todos os SDRs</option>
                  {sdrOptions.map(s => <option key={s} value={s}>{s.split(' ')[0]}</option>)}
                </select>
                <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {monthCalls.length}/{allMonthCalls.length} call{allMonthCalls.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-card2)' }}>
                      {['Data', 'Horário', 'Cliente', 'Responsável', 'SDR', 'Status', 'Ativado', 'Movimentação', 'Motivo'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthCalls.map((c, i) => {
                      const color = STATUS_COLOR[c.status] ?? 'var(--text2)'
                      const motivo = c.motivo_cancelamento || c.motivo_noshow || c.motivo_nao_ativacao || ''
                      return (
                        <tr key={c.id}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onClick={() => setSheetCall(c)}>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 12 }}>
                            {new Date(c.date + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {c.time}{c.endTime ? ` – ${c.endTime}` : ''}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.title || c.clientEmail || '—'}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 600 }}>{c.responsible.split(' ')[0]}</span>
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 12 }}>
                            {c.sdrNome ? c.sdrNome.split(' ')[0] : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ background: `color-mix(in srgb, ${color} 15%, var(--bg-card2))`, color, border: `1px solid ${color}`, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
                              {c.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {c.ativado === true  && <span style={{ color: 'var(--green)',  fontWeight: 700, fontSize: 12 }}>✓ Ativado</span>}
                            {c.ativado === false && <span style={{ color: 'var(--red)',    fontWeight: 600, fontSize: 12 }}>Não Ativado</span>}
                            {c.ativado === null  && <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 12 }}>
                            {c.updatedAt
                              ? new Date(c.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text2)', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {motivo || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* ── Performance por Closer ───────────────────────────────────────────── */}
        {closerStats.length > 0 && (
          <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Performance por Closer — {MONTHS[today.getMonth()]} {today.getFullYear()}</div>
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

        {/* ── Histórico de Calls ────────────────────────────────────────────── */}
        {history.length > 0 && (() => {
          const periods = [...new Set(history.map(c => c.period))].sort((a, b) => b.localeCompare(a));
          return (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Histórico de Meses Anteriores</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {periods.map(period => {
                  const [py, pm] = period.split('-').map(Number);
                  const label = `${MONTHS[pm - 1]} ${py}`;
                  const pCalls = history.filter(c => c.period === period);
                  const isOpen = expandedPeriods.has(period);
                  const stats = [
                    { label: 'Agendadas',  value: pCalls.filter(c => c.status === 'Agendada').length,  color: 'var(--action)' },
                    { label: 'Realizadas', value: pCalls.filter(c => c.status === 'Realizada').length, color: 'var(--green)'  },
                    { label: 'Canceladas', value: pCalls.filter(c => c.status === 'Cancelada').length, color: 'var(--red)'    },
                    { label: 'No-show',    value: pCalls.filter(c => c.status === 'No-show').length,   color: 'var(--orange)' },
                  ];
                  return (
                    <div key={period} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <button
                        onClick={() => setExpandedPeriods(prev => {
                          const next = new Set(prev);
                          next.has(period) ? next.delete(period) : next.add(period);
                          return next;
                        })}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{pCalls.length} call{pCalls.length !== 1 ? 's' : ''}</span>
                          <div style={{ display: 'flex', gap: 10 }}>
                            {stats.map(s => s.value > 0 && (
                              <span key={s.label} style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>
                                {s.value} {s.label.toLowerCase()}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ChevronDown size={16} style={{ color: 'var(--text2)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr>
                                {['Data', 'Hora', 'Título', 'Responsável', 'Status'].map(h => (
                                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                                    color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em',
                                    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--bg-card2)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pCalls.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map((c, i) => (
                                <tr key={c.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)' }}>
                                  <td style={{ padding: '9px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                                    {new Date(c.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                  </td>
                                  <td style={{ padding: '9px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{c.time}</td>
                                  <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{c.title}</td>
                                  <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c.responsible}</td>
                                  <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

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
            <Field label="Campanha de Captação">
              <Sel value={form.campanha} onChange={v => setForm({ ...form, campanha: v })}
                options={CAMPANHAS} placeholder="Selecione a campanha (opcional)" />
            </Field>
            <Field label="Nome do SDR">
              <Sel value={form.sdrNome} onChange={v => setForm({ ...form, sdrNome: v })}
                options={users.filter(u => isSDRRole(u.role) || u.extra_roles?.includes('SDR') || u.extra_roles?.includes('Social Selling')).map(u => ({ value: u.name, label: u.name }))}
                placeholder="Selecione o SDR (opcional)" />
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

              <div style={{ display: 'grid', gridTemplateColumns: sheetCall.sdrNome ? '1fr 1fr' : '1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Responsável</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={sheetCall.responsible} size={32} />
                    <span style={{ fontWeight: 600, color: closerColor(sheetCall.responsible) }}>{sheetCall.responsible}</span>
                  </div>
                </div>
                {sheetCall.sdrNome && (
                  <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>SDR</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={sheetCall.sdrNome} size={32} />
                      <span style={{ fontWeight: 600 }}>{sheetCall.sdrNome}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Campanha de Captação</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: sheetCall.campanha ? undefined : 'var(--text2)' }}>{sheetCall.campanha || 'Não definida'}</div>
              </div>

              {sheetCall.notes && (
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Observações</div>
                  <div style={{ fontSize: 13 }}>{sheetCall.notes}</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Alterar Status</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="success"     icon={CheckCircle} onClick={() => { updateStatus(sheetCall.id, 'Realizada'); setPendingStatus(null) }}>Realizada</Button>
                  <button
                    onClick={() => { updateStatus(sheetCall.id, 'Em Atendimento'); setPendingStatus(null) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 8, border: `1px solid var(--cyan)`,
                      background: sheetCall.status === 'Em Atendimento' ? 'var(--cyan)' : `color-mix(in srgb, var(--cyan) 12%, var(--bg-card))`,
                      color: sheetCall.status === 'Em Atendimento' ? '#fff' : 'var(--cyan)',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      animation: sheetCall.status === 'Em Atendimento' ? 'pulse 1.4s ease-in-out infinite' : 'none',
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block', flexShrink: 0 }} />
                    Em Atendimento
                  </button>
                  <Button size="sm" variant="destructive" icon={XCircle}     onClick={() => { setPendingStatus('Cancelada'); setMotivoStatus(sheetCall.motivo_cancelamento || '') }}>Cancelada</Button>
                  <Button size="sm" variant="warning"     icon={Clock}       onClick={() => { setPendingStatus('No-show'); setMotivoStatus(sheetCall.motivo_noshow || '') }}>No-show</Button>
                </div>

                {/* Input de motivo — aparece ao clicar em Cancelada ou No-show */}
                {pendingStatus && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, background: `color-mix(in srgb, ${pendingStatus === 'Cancelada' ? 'var(--red)' : 'var(--orange)'} 8%, var(--bg-card2))`, border: `1px solid ${pendingStatus === 'Cancelada' ? 'var(--red)' : 'var(--orange)'}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: pendingStatus === 'Cancelada' ? 'var(--red)' : 'var(--orange)' }}>
                      Motivo da {pendingStatus} <span style={{ fontWeight: 400, color: 'var(--text2)' }}>(opcional)</span>
                    </div>
                    <textarea
                      className="inp"
                      rows={2}
                      value={motivoStatus}
                      onChange={e => setMotivoStatus(e.target.value)}
                      placeholder={`Informe o motivo da ${pendingStatus.toLowerCase()}…`}
                      style={{ resize: 'vertical', fontSize: 13 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => updateStatus(sheetCall.id, pendingStatus, motivoStatus)}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, background: pendingStatus === 'Cancelada' ? 'var(--red)' : 'var(--orange)', color: '#fff' }}>
                        Confirmar {pendingStatus}
                      </button>
                      <button
                        onClick={() => { setPendingStatus(null); setMotivoStatus('') }}
                        style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Mostra motivos já salvos */}
                {!pendingStatus && sheetCall.motivo_cancelamento && sheetCall.status === 'Cancelada' && (
                  <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: 'color-mix(in srgb, var(--red) 8%, var(--bg-card2))', borderRadius: 8, border: '1px solid var(--red)' }}>
                    Motivo: {sheetCall.motivo_cancelamento}
                  </div>
                )}
                {!pendingStatus && sheetCall.motivo_noshow && sheetCall.status === 'No-show' && (
                  <div style={{ fontSize: 12, color: 'var(--orange)', padding: '6px 10px', background: 'color-mix(in srgb, var(--orange) 8%, var(--bg-card2))', borderRadius: 8, border: '1px solid var(--orange)' }}>
                    Motivo: {sheetCall.motivo_noshow}
                  </div>
                )}
              </div>

              {/* ── Ativação ──────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Ativação</div>

                {/* Estado atual */}
                {sheetCall.ativado !== null && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: sheetCall.ativado ? 'color-mix(in srgb, var(--green) 15%, var(--bg-card2))' : 'color-mix(in srgb, var(--red) 15%, var(--bg-card2))',
                    color: sheetCall.ativado ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${sheetCall.ativado ? 'var(--green)' : 'var(--red)'}`,
                  }}>
                    {sheetCall.ativado ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {sheetCall.ativado ? 'Ativado' : `Não Ativado${sheetCall.motivo_nao_ativacao ? ` — ${sheetCall.motivo_nao_ativacao}` : ''}`}
                  </div>
                )}

                {/* Botões */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => saveAtivacao(sheetCall.id, true)} style={{
                    padding: '7px 16px', borderRadius: 8, border: `1px solid ${sheetCall.ativado === true ? 'var(--green)' : 'var(--border)'}`,
                    background: sheetCall.ativado === true ? 'color-mix(in srgb, var(--green) 20%, var(--bg-card2))' : 'var(--bg-card2)',
                    color: sheetCall.ativado === true ? 'var(--green)' : 'var(--text)', fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <CheckCircle size={14} /> Ativado
                  </button>
                  <button onClick={() => {
                    setMotivoInput(sheetCall.motivo_nao_ativacao || '');
                    setSheetCall(prev => prev ? { ...prev, _showMotivo: true } as any : prev);
                  }} style={{
                    padding: '7px 16px', borderRadius: 8, border: `1px solid ${sheetCall.ativado === false ? 'var(--red)' : 'var(--border)'}`,
                    background: sheetCall.ativado === false ? 'color-mix(in srgb, var(--red) 20%, var(--bg-card2))' : 'var(--bg-card2)',
                    color: sheetCall.ativado === false ? 'var(--red)' : 'var(--text)', fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <XCircle size={14} /> Não Ativado
                  </button>
                </div>

                {/* Campo de motivo + upload de imagens */}
                {(sheetCall as any)._showMotivo && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <textarea
                      className="inp"
                      rows={2}
                      value={motivoInput}
                      onChange={e => setMotivoInput(e.target.value)}
                      placeholder="Informe o motivo da não ativação…"
                      style={{ resize: 'vertical', fontSize: 13 }}
                    />

                    {/* Upload de imagens */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)',
                        textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                        Imagens / Comprovantes
                      </label>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                        borderRadius: 8, border: '1px dashed var(--border)', cursor: 'pointer',
                        background: 'var(--bg-card2)', fontSize: 13, color: 'var(--text2)',
                        fontWeight: 600, transition: 'border-color .15s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--action)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                        </svg>
                        {motivoImages.length > 0 ? `${motivoImages.length} arquivo(s) selecionado(s)` : 'Selecionar arquivos…'}
                        <input type="file" multiple accept="image/*,application/pdf"
                          style={{ display: 'none' }}
                          onChange={e => {
                            if (e.target.files) setMotivoImages(p => [...p, ...Array.from(e.target.files!)])
                          }} />
                      </label>

                      {/* Preview dos arquivos selecionados */}
                      {motivoImages.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {motivoImages.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5,
                              padding: '4px 8px', borderRadius: 6, background: 'var(--bg-card)',
                              border: '1px solid var(--border)', fontSize: 11 }}>
                              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <button onClick={() => setMotivoImages(p => p.filter((_, j) => j !== i))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => {
                        saveAtivacao(sheetCall.id, false, motivoInput, motivoImages);
                        setSheetCall(prev => prev ? { ...prev, _showMotivo: false } as any : prev);
                      }} style={{
                        padding: '7px 16px', borderRadius: 8, border: 'none',
                        background: 'var(--red)', color: '#fff', fontWeight: 700, fontSize: 13,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>Salvar</button>
                      <button onClick={() => { setSheetCall(prev => prev ? { ...prev, _showMotivo: false } as any : prev); setMotivoImages([]); }}
                        style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)',
                          background: 'var(--bg-card2)', color: 'var(--text2)', fontWeight: 600, fontSize: 13,
                          cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Imagens já salvas */}
                {!((sheetCall as any)._showMotivo) && sheetCall.image_urls?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                      letterSpacing: '.04em', marginBottom: 8 }}>Imagens anexadas</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {sheetCall.image_urls.map((url, i) => {
                        const isImg = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
                        return isImg ? (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`anexo-${i+1}`}
                              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8,
                                border: '1px solid var(--border)', cursor: 'pointer' }} />
                          </a>
                        ) : (
                          <a key={i} href={url} target="_blank" rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                              borderRadius: 8, background: 'var(--bg-card2)', border: '1px solid var(--border)',
                              fontSize: 12, color: 'var(--action)', textDecoration: 'none', fontWeight: 600 }}>
                            📎 Arquivo {i + 1}
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
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
