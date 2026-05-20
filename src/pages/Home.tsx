import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Zap, FileText, CreditCard, LayoutDashboard, Trophy, Package, Calendar, Loader2, Phone, CheckCircle, Clock, XCircle, Target, MessageSquare, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase/client'

type AuditLog   = { id: string; user_name: string; action: string; module: string; created_at: string }
type WebhookLog = { id: string; ativacao_id: string | null; status: string; tentativas: number; erro: string | null; created_at: string }

// ── Closer ───────────────────────────────────────────────────────────────────
type DailyCall = {
  id: string; title: string; date: string; time: string
  status: string; client_email: string; notes: string; meet_link: string
}
type Activation = { id: string; client: string; email: string; phone: string | null }

// ── SDR ──────────────────────────────────────────────────────────────────────
type SdrCall = { id: string; status: string; date: string; sdr_nome: string | null; ativado: boolean }

// ── GC ───────────────────────────────────────────────────────────────────────
type GcClient   = { id: string; client: string; email: string; phone: string | null; faturamento_mensal: number | null }
type CarteiraNota = { email: string; motivo: string | null; proxima_acao: string | null; data_contato: string | null }

const MODULES = [
  { key: 'responsaveis', label: 'Responsáveis',  Icon: Users,          color: 'var(--cyan)',    desc: 'Gerencie colaboradores e times'     },
  { key: 'ativacoes',    label: 'Ativações',      Icon: Zap,            color: 'var(--purple)',  desc: 'Controle de clientes ativados'      },
  { key: 'ranking',      label: 'Ranking',        Icon: Trophy,         color: 'var(--gold)',    desc: 'Performance e classificação'        },
  { key: 'formularios',  label: 'Formulários',    Icon: FileText,       color: 'var(--green)',   desc: 'Formulários e respostas'            },
  { key: 'estoque',      label: 'Estoque',        Icon: Package,        color: 'var(--orange)',  desc: 'Itens internos e premiações'        },
  { key: 'agenda',       label: 'Agenda',         Icon: Calendar,       color: 'var(--cyan)',    desc: 'Calls e agenda comercial'           },
  { key: 'dashboards',   label: 'Dashboards',     Icon: LayoutDashboard,color: 'var(--pink)',    desc: 'KPIs e visualizações'               },
]

const STATUS_COLOR: Record<string, string> = {
  Agendada: 'var(--action)', Realizada: '#34C759', Cancelada: '#FF3B30', 'No-show': '#FF9F0A',
}

const todayStr = new Date().toISOString().split('T')[0]

export default function Home() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [kpis, setKpis]             = useState({ activeUsers: 0, todayActivations: 0, activeForms: 0, pendingPayments: 0 })
  const [auditLogs, setAuditLogs]   = useState<AuditLog[]>([])
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])

  // Closer
  const [closerCalls, setCloserCalls]   = useState<DailyCall[]>([])
  const [activations,  setActivations]  = useState<Activation[]>([])

  // SDR
  const [sdrCalls,  setSdrCalls]  = useState<SdrCall[]>([])

  // GC
  const [gcClients, setGcClients] = useState<GcClient[]>([])
  const [gcNotas,   setGcNotas]   = useState<CarteiraNota[]>([])

  useEffect(() => {
    if (loading || !user) return
    const role = user.role

    if (role === 'Admin') {
      Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('activations').select('*', { count: 'exact', head: true }).eq('date', todayStr),
        supabase.from('forms').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'Pendente'),
        supabase.from('audit_logs').select('id,user_name,action,module,created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('webhook_logs').select('id,ativacao_id,status,tentativas,erro,created_at').order('created_at', { ascending: false }).limit(20),
      ]).then(([{ count: uc }, { count: ac }, { count: fc }, { count: pc }, { data: logs }, { data: wlogs }]) => {
        setKpis({ activeUsers: uc || 0, todayActivations: ac || 0, activeForms: fc || 0, pendingPayments: pc || 0 })
        if (logs)  setAuditLogs(logs as AuditLog[])
        if (wlogs) setWebhookLogs(wlogs as WebhookLog[])
      })
    }

    if (role === 'Closer') {
      Promise.all([
        supabase.from('calls').select('id,title,date,time,status,client_email,notes,meet_link')
          .eq('date', todayStr).eq('responsible', user.id).order('time'),
        supabase.from('activations').select('id,client,email,phone'),
      ]).then(([{ data: calls }, { data: acts }]) => {
        if (calls) setCloserCalls(calls as DailyCall[])
        if (acts)  setActivations(acts as Activation[])
      })
    }

    if (role === 'SDR') {
      supabase.from('calls').select('id,status,date,sdr_nome,ativado')
        .eq('date', todayStr)
        .then(({ data }) => { if (data) setSdrCalls(data as SdrCall[]) })
    }

    if (role === 'Gerente de Contas') {
      Promise.all([
        supabase.from('activations').select('id,client,email,phone,faturamento_mensal')
          .eq('gerente_id', user.id),
        supabase.from('carteira_notas').select('email,motivo,proxima_acao,data_contato'),
      ]).then(([{ data: cli }, { data: notas }]) => {
        if (cli)   setGcClients(cli as GcClient[])
        if (notas) setGcNotas(notas as CarteiraNota[])
      })
    }
  }, [user, loading])

  if (loading || !user) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <Loader2 size={32} color="var(--action)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const isAdmin  = user.role === 'Admin'
  const isCloser = user.role === 'Closer'
  const isSdr    = user.role === 'SDR'
  const isGC     = user.role === 'Gerente de Contas'
  const firstName = user.name?.split(' ')[0] || 'Usuário'
  const modules = [
    ...MODULES,
    ...(isAdmin ? [{ key: 'pagamentos', label: 'Pagamentos', Icon: CreditCard, color: 'var(--gold)', desc: 'Bônus e pagamentos da equipe' }] : []),
  ]

  // SDR: filtrar pelo próprio nome
  const myCallsToday = isSdr ? sdrCalls.filter(c => c.sdr_nome === user.name) : []
  const SDR_META = 10
  const sdrAgendadas  = myCallsToday.length
  const sdrRealizadas = myCallsToday.filter(c => c.status === 'Realizada').length
  const sdrNoShow     = myCallsToday.filter(c => c.status === 'No-show').length
  const sdrCanceladas = myCallsToday.filter(c => c.status === 'Cancelada').length
  const sdrAtivadas   = myCallsToday.filter(c => c.ativado).length
  const pctMeta       = Math.min(100, (sdrAgendadas / SDR_META) * 100)

  // GC: clientes para contatar hoje
  const notaMap = Object.fromEntries(gcNotas.map(n => [n.email, n]))
  const clientsToCall = gcClients.filter(c => {
    const nota = notaMap[c.email]
    if (!nota) return true // nunca contatado
    if (!nota.data_contato) return true
    const dias = Math.floor((Date.now() - new Date(nota.data_contato).getTime()) / 86400000)
    return dias >= 7 // não contatado há 7+ dias
  }).sort((a, b) => {
    const na = notaMap[a.email]
    const nb = notaMap[b.email]
    const da = na?.data_contato ? new Date(na.data_contato).getTime() : 0
    const db = nb?.data_contato ? new Date(nb.data_contato).getTime() : 0
    return da - db // mais antigos primeiro
  }).slice(0, 15)

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>
            Bem-vindo, {firstName}.
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 15, marginTop: 6 }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* ═══ PAINEL CLOSER ══════════════════════════════════════════════ */}
        {isCloser && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Phone size={18} color="var(--action)" />
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Suas calls de hoje</h2>
              <span style={{ fontSize: 13, color: 'var(--text2)', marginLeft: 4 }}>
                {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: closerCalls.length === 0 ? 'var(--bg-card2)' : 'color-mix(in srgb, var(--action) 15%, var(--bg-card2))',
                color: closerCalls.length === 0 ? 'var(--text2)' : 'var(--action)', border: '1px solid var(--border)' }}>
                {closerCalls.length} call{closerCalls.length !== 1 ? 's' : ''}
              </span>
            </div>

            {closerCalls.length === 0 ? (
              <div style={{ ...card, padding: '32px 24px', textAlign: 'center' }}>
                <CheckCircle size={32} color="var(--green)" style={{ margin: '0 auto 10px', display: 'block' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>Nenhuma call agendada para hoje.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {closerCalls.map(c => {
                  const act = activations.find(a => a.email === c.client_email)
                  const color = STATUS_COLOR[c.status] || 'var(--border)'
                  return (
                    <div key={c.id} style={{ ...card, padding: '16px 20px', borderLeft: `3px solid ${color}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                      {/* Horário */}
                      <div style={{ minWidth: 52, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color }}>{c.time?.slice(0,5) || '—'}</div>
                      </div>

                      <div style={{ width: 1, height: 40, background: 'var(--border)' }} />

                      {/* Info cliente */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {act?.client ?? c.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{c.client_email}</div>
                        {act?.phone && (
                          <a href={`https://wa.me/${act.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 11, color: '#25D366', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                            📱 {act.phone}
                          </a>
                        )}
                        {c.notes && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>"{c.notes}"</div>}
                      </div>

                      {/* Status */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                          background: `color-mix(in srgb, ${color} 15%, var(--bg-card2))`,
                          color, border: `1px solid ${color}` }}>
                          {c.status}
                        </span>
                        {c.meet_link && (
                          <a href={c.meet_link} target="_blank" rel="noreferrer"
                            style={{ fontSize: 11, color: '#1a73e8', fontWeight: 600, textDecoration: 'none' }}>
                            📹 Entrar no Meet
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ PAINEL SDR ════════════════════════════════════════════════ */}
        {isSdr && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Target size={18} color="var(--purple)" />
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Sua meta de hoje</h2>
            </div>

            {/* Progresso da meta */}
            <div style={{ ...card, padding: '20px 24px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 28, fontWeight: 900, color: pctMeta >= 100 ? '#34C759' : 'var(--action)' }}>{sdrAgendadas}</span>
                  <span style={{ fontSize: 16, color: 'var(--text2)', marginLeft: 6 }}>/ {SDR_META} reuniões</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: pctMeta >= 100 ? '#34C759' : 'var(--action)' }}>
                    {pctMeta.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>da meta diária</div>
                </div>
              </div>

              {/* Barra de progresso */}
              <div style={{ height: 12, background: 'var(--bg-card2)', borderRadius: 20, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ height: '100%', width: `${pctMeta}%`,
                  background: pctMeta >= 100 ? '#34C759' : pctMeta >= 60 ? 'var(--action)' : '#FF9F0A',
                  borderRadius: 20, transition: 'width .4s' }} />
              </div>

              {/* Chips de status */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'Agendadas',  val: sdrAgendadas,  icon: <Clock size={13} />,        color: 'var(--action)' },
                  { label: 'Realizadas', val: sdrRealizadas, icon: <CheckCircle size={13} />,   color: '#34C759'       },
                  { label: 'No-show',    val: sdrNoShow,     icon: <AlertTriangle size={13} />, color: '#FF9F0A'       },
                  { label: 'Canceladas', val: sdrCanceladas, icon: <XCircle size={13} />,       color: '#FF3B30'       },
                ].map(({ label, val, icon, color }) => (
                  <div key={label} style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: '12px 14px', border: `1px solid color-mix(in srgb, ${color} 25%, var(--border))` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, color }}>
                      {icon}
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {sdrAtivadas > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb, #34C759 10%, var(--bg-card2))', border: '1px solid #34C75930', fontSize: 13 }}>
                  <span style={{ color: '#34C759', fontWeight: 700 }}>{sdrAtivadas} cliente{sdrAtivadas !== 1 ? 's' : ''} ativado{sdrAtivadas !== 1 ? 's' : ''}</span>
                  <span style={{ color: 'var(--text2)' }}> hoje — ótimo trabalho! 🎯</span>
                </div>
              )}

              {pctMeta < 100 && (
                <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-card2)', fontSize: 13, color: 'var(--text2)' }}>
                  Faltam <span style={{ fontWeight: 700, color: 'var(--action)' }}>{SDR_META - sdrAgendadas} reuniões</span> para bater a meta de hoje.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ PAINEL GERENTE DE CONTAS ═══════════════════════════════════ */}
        {isGC && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <MessageSquare size={18} color="var(--green)" />
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Clientes para contatar hoje</h2>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'color-mix(in srgb, var(--green) 12%, var(--bg-card2))',
                color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 30%, var(--border))' }}>
                {clientsToCall.length} pendentes
              </span>
            </div>

            {clientsToCall.length === 0 ? (
              <div style={{ ...card, padding: '32px 24px', textAlign: 'center' }}>
                <CheckCircle size={32} color="var(--green)" style={{ margin: '0 auto 10px', display: 'block' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>Todos os clientes foram contatados recentemente.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {clientsToCall.map(c => {
                  const nota = notaMap[c.email]
                  const dias = nota?.data_contato
                    ? Math.floor((Date.now() - new Date(nota.data_contato).getTime()) / 86400000)
                    : null
                  const urgente = dias === null || dias >= 14
                  const waLink = c.phone ? `https://wa.me/${c.phone.replace(/\D/g,'')}` : null
                  return (
                    <div key={c.id} style={{ ...card, padding: '14px 16px', borderLeft: `3px solid ${urgente ? '#FF3B30' : '#FF9F0A'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {c.client}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0,
                          background: urgente ? '#FF3B3015' : '#FF9F0A15',
                          color: urgente ? '#FF3B30' : '#FF9F0A',
                          border: `1px solid ${urgente ? '#FF3B3030' : '#FF9F0A30'}` }}>
                          {dias === null ? 'Nunca contatado' : `${dias}d sem contato`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>{c.email}</div>
                      {nota?.motivo && (
                        <div style={{ fontSize: 11, color: '#FF3B30', marginBottom: 4, fontWeight: 600 }}>⚠ {nota.motivo}</div>
                      )}
                      {nota?.proxima_acao && (
                        <div style={{ fontSize: 11, color: 'var(--action)', marginBottom: 6 }}>→ {nota.proxima_acao}</div>
                      )}
                      {waLink ? (
                        <a href={waLink} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
                            color: '#25D366', textDecoration: 'none', padding: '4px 10px',
                            background: 'color-mix(in srgb, #25D366 10%, var(--bg-card2))',
                            border: '1px solid #25D36630', borderRadius: 6 }}>
                          📱 Chamar no WhatsApp
                        </a>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>Sem telefone cadastrado</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Grid de módulos ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
          {modules.map(m => (
            <button key={m.key} onClick={() => navigate(`/${m.key}`)} className="card-hover"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24,
                textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'inherit' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12,
                background: `color-mix(in srgb, ${m.color} 14%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <m.Icon size={22} color={m.color} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ── Painel Admin ─────────────────────────────────────────────── */}
        {isAdmin && (
          <div className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Painel Admin</h2>
              <Badge label="ACESSO RESTRITO" color="var(--pink)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <KpiCard label="Usuários Ativos"  value={kpis.activeUsers}       icon={Users}        color="var(--action)"  />
              <KpiCard label="Ativações Hoje"   value={kpis.todayActivations}  icon={Zap}          color="var(--purple)"  />
              <KpiCard label="Formulários"      value={kpis.activeForms}       icon={FileText}     color="var(--green)"   />
              <KpiCard label="Pgtos Pendentes"  value={kpis.pendingPayments}   icon={CreditCard}   color="var(--orange)"  />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Log de Auditoria</span>
                <Button size="sm" variant="secondary" onClick={() => navigate('/pagamentos')}>Ver Pagamentos</Button>
              </div>
              <div className="scroll-x">
                <table className="tbl">
                  <thead><tr><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Data</th></tr></thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>Nenhuma ação registrada ainda.</td></tr>
                    ) : auditLogs.map(a => (
                      <tr key={a.id}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={a.user_name} size={28} /><span style={{ fontWeight: 600, fontSize: 13 }}>{a.user_name}</span></div></td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{a.action}</td>
                        <td><Badge label={a.module} color="var(--action)" /></td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>{new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Webhook DataCrazy</span>
                {webhookLogs.some(l => l.status === 'erro') && (
                  <Badge label={`${webhookLogs.filter(l => l.status === 'erro').length} falha(s)`} color="var(--red)" />
                )}
              </div>
              <div className="scroll-x">
                <table className="tbl">
                  <thead><tr><th>Status</th><th>Tentativas</th><th>Erro</th><th>Data</th></tr></thead>
                  <tbody>
                    {webhookLogs.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>Nenhum webhook disparado ainda.</td></tr>
                    ) : webhookLogs.map(w => (
                      <tr key={w.id}>
                        <td><Badge label={w.status === 'sucesso' ? 'Sucesso' : 'Erro'} color={w.status === 'sucesso' ? 'var(--green)' : 'var(--red)'} /></td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{w.tentativas}×</td>
                        <td style={{ fontSize: 12, color: 'var(--red)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.erro || '—'}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>{new Date(w.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
