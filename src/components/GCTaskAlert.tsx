import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, hasRole } from '@/lib/authContext'
import { supabase } from '@/lib/supabase/client'
import { AlertCircle, X, Clock, ExternalLink } from 'lucide-react'

type AlertTask = {
  id: string; client_name: string; title: string | null; tipo: string; due_date: string; gc_tier: string | null
}

const TASK_LABEL: Record<string, string> = {
  alterar_taxas:            'Alteração de Taxa',
  d2_boas_vindas:           'Boas Vindas',
  adicionar_carteira:       'Adicionar na Carteira',
  d7_incentivo:             'Followup Ativação',
  d15_manual:               'Acompanhamento Manual',
  d30_ciclo:                'Resultado do Faturamento',
  acompanhamento_quinzenal: 'Acompanhamento Quinzenal',
  acompanhamento_semanal:   'Acompanhamento Semanal',
}
const TIER_COLOR: Record<string, string> = { starter: '#07BA1C', growth: '#2BB9FF', enterprise: '#BF5AF2' }

export default function GCTaskAlert() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [tasks,   setTasks]   = useState<AlertTask[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!user || !hasRole(user, 'Gerente de Contas')) return

    // Só mostra 1x por sessão de navegador
    const key = `gc_alert_dismissed_${user.id}_${new Date().toISOString().slice(0, 10)}`
    if (sessionStorage.getItem(key)) return

    const today = new Date().toISOString().slice(0, 10)

    supabase
      .from('gc_tasks')
      .select('id,client_name,title,tipo,due_date,gc_tier')
      .eq('gerente_id', user.id)
      .eq('status', 'pendente')
      .lte('due_date', today)   // hoje ou vencidas
      .order('due_date')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setTasks(data as AlertTask[])
          setVisible(true)
        }
      })
  }, [user?.id])

  function dismiss() {
    if (!user) return
    const key = `gc_alert_dismissed_${user.id}_${new Date().toISOString().slice(0, 10)}`
    sessionStorage.setItem(key, '1')
    setVisible(false)
  }

  if (!visible || tasks.length === 0) return null

  const today = new Date().toISOString().slice(0, 10)
  const overdue = tasks.filter(t => t.due_date < today)
  const dueToday = tasks.filter(t => t.due_date === today)

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      width: 360, maxWidth: 'calc(100vw - 48px)',
      background: 'var(--bg-card)', border: '1px solid #FF3B3055',
      borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,.5)',
      overflow: 'hidden', animation: 'slideUp .3s ease',
    }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#FF3B30,#FF6B35)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={18} color="#fff" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
            {tasks.length} tarefa{tasks.length > 1 ? 's' : ''} {overdue.length > 0 && dueToday.length > 0 ? 'pendentes' : overdue.length > 0 ? 'vencida' + (overdue.length > 1 ? 's' : '') : 'para hoje'}
          </span>
        </div>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 2 }}>
          <X size={16} />
        </button>
      </div>

      {/* Lista */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {overdue.length > 0 && (
          <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Vencidas ({overdue.length})
          </div>
        )}
        {overdue.map(t => <TaskItem key={t.id} t={t} isOverdue />)}

        {dueToday.length > 0 && (
          <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Vencem hoje ({dueToday.length})
          </div>
        )}
        {dueToday.map(t => <TaskItem key={t.id} t={t} isOverdue={false} />)}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <button
          onClick={() => { navigate('/gerente-contas'); dismiss() }}
          style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--action)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ExternalLink size={13} /> Ver Tarefas
        </button>
        <button
          onClick={dismiss}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Fechar
        </button>
      </div>

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

function TaskItem({ t, isOverdue }: { t: AlertTask; isOverdue: boolean }) {
  const label     = t.title ?? TASK_LABEL[t.tipo] ?? t.tipo
  const tierColor = t.gc_tier ? TIER_COLOR[t.gc_tier] : 'var(--text2)'
  const date      = new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')
  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Clock size={13} color={isOverdue ? 'var(--red)' : 'var(--orange)'} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: t.tipo === 'alterar_taxas' ? 'var(--red)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
          {t.gc_tier && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: `${tierColor}22`, color: tierColor, textTransform: 'capitalize' }}>{t.gc_tier}</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.client_name}</div>
      </div>
      <div style={{ fontSize: 11, color: isOverdue ? 'var(--red)' : 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap' }}>{date}</div>
    </div>
  )
}
