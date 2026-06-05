'use client'
import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Header } from '@/components/Header'

type LogEntry = {
  id: string
  user_id: string
  user_name: string
  action: string
  entity: string
  entity_label: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  create: '#34C759',
  update: '#F59E0B',
  delete: '#EF4444',
  move:   '#60A5FA',
  status: '#A78BFA',
}
const ACTION_LABELS: Record<string, string> = {
  create: 'Criou',
  update: 'Editou',
  delete: 'Removeu',
  move:   'Moveu',
  status: 'Status',
}
const ENTITY_LABELS: Record<string, string> = {
  ativacao:  'Ativação',
  reuniao:   'Reunião',
  call:      'Call',
  kanban:    'Kanban',
  usuario:   'Usuário',
  tarefa:    'Tarefa',
  cliente:   'Cliente GC',
  pagamento: 'Pagamento',
  estoque:   'Estoque',
}

const today = new Date().toISOString().slice(0, 10)

interface Props { onBack: () => void }

export default function ActivityLogs({ onBack }: Props) {
  const [logs,         setLogs]        = useState<LogEntry[]>([])
  const [loading,      setLoading]     = useState(true)
  const [refreshing,   setRefreshing]  = useState(false)
  const [search,       setSearch]      = useState('')
  const [filterUser,   setFilterUser]  = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [dateFrom,     setDateFrom]    = useState('2026-04-25')
  const [dateTo,       setDateTo]      = useState(today)

  async function load(silent = false) {
    if (!silent) setLoading(true); else setRefreshing(true)
    let q = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59')
    const { data } = await q
    setLogs((data ?? []) as LogEntry[])
    if (!silent) setLoading(false); else setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  const users    = Array.from(new Set(logs.map(l => l.user_name))).sort()
  const entities = Array.from(new Set(logs.map(l => l.entity))).sort()
  const actions  = Array.from(new Set(logs.map(l => l.action))).sort()

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    if (filterUser   && l.user_name !== filterUser)  return false
    if (filterEntity && l.entity    !== filterEntity) return false
    if (filterAction && l.action    !== filterAction) return false
    if (q && !l.user_name.toLowerCase().includes(q) &&
             !l.description?.toLowerCase().includes(q) &&
             !l.entity_label?.toLowerCase().includes(q)) return false
    return true
  })

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={onBack} style={{
            background: 'var(--bg-card2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
            color: 'var(--text2)', fontFamily: 'inherit', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <ArrowLeft size={14} /> Voltar
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, flex: 1 }}>Log de Atividades</h1>
          <button onClick={() => load(true)} disabled={refreshing} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text2)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            opacity: refreshing ? 0.6 : 1,
          }}>
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>

        {/* Filtros — linha 1: datas + ação */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>De</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="inp" style={{ fontSize: 13, padding: '7px 10px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Até</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="inp" style={{ fontSize: 13, padding: '7px 10px' }} />
          </div>
          <button onClick={() => load()} style={{
            padding: '7px 16px', borderRadius: 8, border: '1px solid var(--action)',
            background: 'var(--action-dim)', color: 'var(--action)',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Filtrar
          </button>

          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="inp" style={{ fontSize: 13, padding: '8px 12px', minWidth: 130 }}>
            <option value="">Todas as ações</option>
            {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </select>
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="inp" style={{ fontSize: 13, padding: '8px 12px', minWidth: 160 }}>
            <option value="">Todos os usuários</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}
            className="inp" style={{ fontSize: 13, padding: '8px 12px', minWidth: 140 }}>
            <option value="">Todos os módulos</option>
            {entities.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] ?? e}</option>)}
          </select>
        </div>

        {/* Filtros — linha 2: busca + contador */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} color="var(--text2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por usuário, cliente, descrição..."
              className="inp"
              style={{ paddingLeft: 34, fontSize: 13, width: '100%' }}
            />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tabela */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)', fontSize: 14 }}>Carregando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)', fontSize: 14 }}>Nenhum registro encontrado.</div>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-card2)' }}>
                  {['Data/Hora', 'Usuário', 'Ação', 'Módulo', 'Registro', 'Descrição'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
                      letterSpacing: '.04em', whiteSpace: 'nowrap',
                      borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l, i) => {
                  const color = ACTION_COLORS[l.action] ?? 'var(--text2)'
                  return (
                    <tr key={l.id}
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 12 }}>
                        {new Date(l.created_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {l.user_name.split(' ')[0]}
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          background: `color-mix(in srgb, ${color} 15%, var(--bg-card2))`,
                          color, border: `1px solid ${color}`,
                          borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700,
                        }}>
                          {ACTION_LABELS[l.action] ?? l.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 12 }}>
                        {ENTITY_LABELS[l.entity] ?? l.entity}
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 500, fontSize: 12 }}>
                        {l.entity_label || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text2)', lineHeight: 1.5 }}>
                        {l.description || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  )
}
