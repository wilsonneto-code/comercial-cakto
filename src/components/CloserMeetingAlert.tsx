import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import { supabase } from '@/lib/supabase/client'
import { Video, X, Clock, ChevronDown, ChevronUp, Bell, BellOff } from 'lucide-react'

type Call = {
  id: string
  title: string | null
  date: string
  time: string
  end_time: string | null
  status: string
  client_email: string | null
  meet_link: string | null
}

function minutesUntil(date: string, time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  const target = new Date(date)
  target.setHours(h, m, 0, 0)
  return Math.floor((target.getTime() - Date.now()) / 60000)
}

function formatTime(t: string) {
  return t.slice(0, 5)
}

function urgencyColor(mins: number): string {
  if (mins < 0)   return 'var(--text2)'     // passada
  if (mins <= 5)  return 'var(--red)'       // agora!
  if (mins <= 15) return 'var(--orange)'    // iminente
  if (mins <= 30) return '#F59E0B'          // próxima
  return 'var(--action)'                    // normal
}

function urgencyLabel(mins: number): string {
  if (mins < 0)   return 'Encerrada'
  if (mins === 0) return 'Agora!'
  if (mins <= 5)  return `${mins}min`
  if (mins <= 30) return `em ${mins}min`
  const h = Math.floor(mins / 60), rest = mins % 60
  return h > 0 ? `${h}h${rest > 0 ? rest + 'min' : ''}` : `${mins}min`
}

export default function CloserMeetingAlert() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [calls,       setCalls]       = useState<Call[]>([])
  const [open,        setOpen]        = useState(false)
  const [notifPerm,   setNotifPerm]   = useState<NotificationPermission>('default')
  const notifiedRef = useRef<Set<string>>(new Set())
  const [tick,        setTick]        = useState(0)     // força re-render a cada minuto

  const isCloser = user?.role === 'Closer'

  // ── Carrega calls do dia ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !isCloser) return

    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('calls')
      .select('id,title,date,time,end_time,status,client_email,meet_link')
      .eq('responsible', user.id)
      .eq('date', today)
      .in('status', ['Agendada', 'Realizada'])
      .order('time')
      .then(({ data }) => {
        if (data) setCalls(data as Call[])
      })
  }, [user?.id, isCloser])

  // ── Pede permissão de notificação ─────────────────────────────────────────
  useEffect(() => {
    if (!isCloser) return
    if ('Notification' in window) {
      setNotifPerm(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => setNotifPerm(p))
      }
    }
  }, [isCloser])

  // ── Tick a cada minuto + notificações nativas ─────────────────────────────
  useEffect(() => {
    if (!isCloser) return
    const interval = setInterval(() => {
      setTick(t => t + 1)

      calls.forEach(c => {
        if (c.status !== 'Agendada') return
        const mins = minutesUntil(c.date, c.time)
        const name = c.title || c.client_email || 'Reunião'

        // Notifica em 15 min
        const key15 = `notif_15_${c.id}`
        if (mins <= 15 && mins > 10 && !notifiedRef.current.has(key15)) {
          notifiedRef.current.add(key15)
          sendNotif(`⏰ Reunião em 15 minutos`, `${name} — ${formatTime(c.time)}`, c.meet_link)
        }

        // Notifica em 5 min
        const key5 = `notif_5_${c.id}`
        if (mins <= 5 && mins > 0 && !notifiedRef.current.has(key5)) {
          notifiedRef.current.add(key5)
          sendNotif(`🔴 Reunião em ${mins} minuto${mins > 1 ? 's' : ''}!`, `${name} — ${formatTime(c.time)}`, c.meet_link)
        }

        // Notifica na hora
        const key0 = `notif_0_${c.id}`
        if (mins === 0 && !notifiedRef.current.has(key0)) {
          notifiedRef.current.add(key0)
          sendNotif(`🚨 Reunião começando AGORA`, `${name}`, c.meet_link)
          // Abre o popup automaticamente
          setOpen(true)
        }
      })
    }, 60000)
    return () => clearInterval(interval)
  }, [isCloser, calls])

  function sendNotif(title: string, body: string, url: string | null) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: title,
    })
    if (url) n.onclick = () => { window.focus(); window.open(url, '_blank') }
    else     n.onclick = () => { window.focus(); navigate('/agenda') }
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) return
    const p = await Notification.requestPermission()
    setNotifPerm(p)
  }

  if (!isCloser || calls.length === 0) return null

  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = calls
    .filter(c => c.status === 'Agendada')
    .map(c => ({ ...c, mins: minutesUntil(c.date, c.time) }))
    .sort((a, b) => a.mins - b.mins)

  const next      = upcoming.find(c => c.mins >= -30) // próxima (ou recém-passada)
  const urgentCount = upcoming.filter(c => c.mins >= 0 && c.mins <= 15).length

  // Cor do pill baseada na urgência
  const pillColor = urgentCount > 0
    ? (upcoming.some(c => c.mins >= 0 && c.mins <= 5) ? 'var(--red)' : 'var(--orange)')
    : 'var(--action)'

  return (
    <>
      {/* ── Pill flutuante ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 40,
            background: pillColor,
            boxShadow: `0 4px 20px ${urgentCount > 0 ? 'rgba(255,59,48,.45)' : 'rgba(47,87,51,.45)'}`,
            border: 'none', cursor: 'pointer', color: '#fff',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
            animation: urgentCount > 0 ? 'pulse 1.4s ease-in-out infinite' : 'none',
          }}
        >
          <Clock size={15} />
          {next
            ? `${next.title || next.client_email || 'Reunião'} · ${urgencyLabel(next.mins)}`
            : `${calls.length} reunião${calls.length > 1 ? 'ões' : ''} hoje`}
          <span style={{
            background: 'rgba(255,255,255,.25)', borderRadius: 20,
            padding: '1px 7px', fontSize: 11,
          }}>
            {calls.length}
          </span>
        </button>
      )}

      {/* ── Painel ── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 340, maxWidth: 'calc(100vw - 48px)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.55)',
          overflow: 'hidden', animation: 'slideUp .25s ease',
        }}>

          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${pillColor}, ${pillColor}cc)`,
            padding: '13px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} color="#fff" />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                Reuniões de hoje
              </span>
              <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 20, padding: '1px 8px', fontSize: 12, color: '#fff', fontWeight: 700 }}>
                {calls.length}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Botão de permissão de notificação */}
              <button
                onClick={requestNotifPermission}
                title={notifPerm === 'granted' ? 'Notificações ativas' : 'Ativar notificações'}
                style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
                {notifPerm === 'granted' ? <Bell size={13} /> : <BellOff size={13} />}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 2 }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Status de notificação */}
          {notifPerm !== 'granted' && (
            <div style={{ padding: '8px 14px', background: 'color-mix(in srgb, var(--orange) 12%, var(--bg-card2))', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BellOff size={12} color="var(--orange)" />
              <span style={{ fontSize: 11, color: 'var(--orange)' }}>
                {notifPerm === 'denied'
                  ? 'Notificações bloqueadas no navegador'
                  : 'Clique no sino para receber alertas mesmo com a janela minimizada'}
              </span>
            </div>
          )}

          {/* Lista de calls */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {calls.map(c => {
              const mins  = minutesUntil(c.date, c.time)
              const color = urgencyColor(mins)
              const isPast = mins < -30
              return (
                <div key={c.id} style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: isPast ? 0.4 : 1,
                  background: mins >= 0 && mins <= 5 ? `color-mix(in srgb, ${color} 8%, var(--bg-card))` : 'transparent',
                }}>
                  {/* Indicador de urgência */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: color,
                    boxShadow: mins >= 0 && mins <= 15 ? `0 0 8px ${color}` : 'none',
                    animation: mins >= 0 && mins <= 5 ? 'pulse 1s ease-in-out infinite' : 'none',
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.title || c.client_email || 'Reunião'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Clock size={10} />
                      {formatTime(c.time)}{c.end_time ? ` – ${formatTime(c.end_time)}` : ''}
                      {c.status === 'Realizada' && <span style={{ color: 'var(--green)', fontWeight: 600 }}>· Realizada</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
                      {c.status === 'Realizada' ? '✓' : urgencyLabel(mins)}
                    </span>
                    {c.meet_link && c.status === 'Agendada' && (
                      <a href={c.meet_link} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
                          color: mins <= 15 && mins >= 0 ? '#fff' : 'var(--action)',
                          background: mins <= 15 && mins >= 0 ? color : 'transparent',
                          border: `1px solid ${color}`, borderRadius: 6, padding: '2px 7px',
                          textDecoration: 'none' }}>
                        <Video size={10} /> Entrar
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <button
              onClick={() => { navigate('/agenda'); setOpen(false) }}
              style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none',
                background: 'var(--action)', color: '#fff',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Ver Agenda
            </button>
            <button onClick={() => setOpen(false)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-card2)', color: 'var(--text2)',
                fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Minimizar
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse  { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
      `}</style>
    </>
  )
}
