import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Zap, FileText, CreditCard, LayoutDashboard, Trophy, Package, Calendar, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { KpiCard } from '@/components/ui/KpiCard'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase/client'

type AuditLog    = { id: string; user_name: string; action: string; module: string; created_at: string }
type WebhookLog  = { id: string; ativacao_id: string | null; status: string; tentativas: number; erro: string | null; created_at: string }

const MODULES = [
  { key: 'responsaveis', label: 'Responsáveis', Icon: Users, color: 'var(--action)', desc: 'Gerencie colaboradores e times' },
  { key: 'ativacoes', label: 'Ativações', Icon: Zap, color: 'var(--purple)', desc: 'Controle de clientes ativados' },
  { key: 'ranking', label: 'Ranking', Icon: Trophy, color: 'var(--gold)', desc: 'Performance e classificação' },
  { key: 'formularios', label: 'Formulários', Icon: FileText, color: 'var(--green)', desc: 'Formulários e respostas' },
  { key: 'estoque', label: 'Estoque', Icon: Package, color: 'var(--orange)', desc: 'Itens internos e premiações' },
  { key: 'agenda', label: 'Agenda', Icon: Calendar, color: 'var(--cyan)', desc: 'Calls e agenda comercial' },
  { key: 'dashboards', label: 'Dashboards', Icon: LayoutDashboard, color: 'var(--pink)', desc: 'KPIs e visualizações' },
]

export default function Home() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [kpis, setKpis] = useState({ activeUsers: 0, todayActivations: 0, activeForms: 0, pendingPayments: 0 })
  const [auditLogs, setAuditLogs]       = useState<AuditLog[]>([])
  const [webhookLogs, setWebhookLogs]   = useState<WebhookLog[]>([])

  useEffect(() => {
    if (loading || !user || user.role !== 'Admin') return
    const todayStr = new Date().toISOString().split('T')[0]
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
  }, [user, loading])

  if (loading || !user) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <Loader2 size={32} color="var(--action)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const isAdmin = user.role === 'Admin'
  const firstName = user.name?.split(' ')[0] || 'Usuário'
  const modules = [
    ...MODULES,
    ...(isAdmin ? [{ key: 'pagamentos', label: 'Pagamentos', Icon: CreditCard, color: 'var(--gold)', desc: 'Bônus e pagamentos da equipe' }] : []),
  ]

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>
            Bem-vindo, {firstName}.
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 15, marginTop: 6 }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
          {modules.map(m => (
            <button key={m.key} onClick={() => navigate(`/${m.key}`)} className="card-hover"
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24,
                textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'inherit',
              }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `color-mix(in srgb, ${m.color} 14%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <m.Icon size={22} color={m.color} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {isAdmin && (
          <div className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Painel Admin</h2>
              <Badge label="ACESSO RESTRITO" color="var(--pink)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <KpiCard label="Usuários Ativos" value={kpis.activeUsers} icon={Users} color="var(--action)" />
              <KpiCard label="Ativações Hoje" value={kpis.todayActivations} icon={Zap} color="var(--purple)" />
              <KpiCard label="Formulários" value={kpis.activeForms} icon={FileText} color="var(--green)" />
              <KpiCard label="Pgtos Pendentes" value={kpis.pendingPayments} icon={CreditCard} color="var(--orange)" />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Log de Auditoria</span>
                <Button size="sm" variant="secondary" onClick={() => navigate('/pagamentos')}>Ver Pagamentos</Button>
              </div>
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
                        Nenhuma ação registrada ainda.
                      </td></tr>
                    ) : auditLogs.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={a.user_name} size={28} />
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{a.user_name}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{a.action}</td>
                        <td><Badge label={a.module} color="var(--action)" /></td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                          {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Webhook Logs (DataCrazy) ── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Webhook DataCrazy</span>
                {webhookLogs.some(l => l.status === 'erro') && (
                  <Badge label={`${webhookLogs.filter(l => l.status === 'erro').length} falha(s)`} color="var(--red)" />
                )}
              </div>
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr><th>Status</th><th>Tentativas</th><th>Erro</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {webhookLogs.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
                        Nenhum webhook disparado ainda.
                      </td></tr>
                    ) : webhookLogs.map(w => (
                      <tr key={w.id}>
                        <td>
                          <Badge
                            label={w.status === 'sucesso' ? 'Sucesso' : 'Erro'}
                            color={w.status === 'sucesso' ? 'var(--green)' : 'var(--red)'}
                          />
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text2)' }}>{w.tentativas}×</td>
                        <td style={{ fontSize: 12, color: 'var(--red)', maxWidth: 320,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {w.erro || '—'}
                        </td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                          {new Date(w.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
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
