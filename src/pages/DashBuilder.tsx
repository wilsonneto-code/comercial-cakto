import { useEffect, useState } from 'react'
import { ChevronLeft, Settings, Plus, Trash2, Pencil, Save, Loader2 } from 'lucide-react'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/authContext'
import { supabase } from '@/lib/supabase/client'
import { BarChartV } from '@/components/ui/charts/BarChartV'
import { LineAreaChart } from '@/components/ui/charts/LineAreaChart'
import { DonutChart } from '@/components/ui/charts/DonutChart'
import type { DonutSegment } from '@/components/ui/charts/DonutChart'
import type { Json } from '@/lib/supabase/database.types'

/* ── Interfaces ──────────────────────────────────────────────────────────── */
export interface Widget {
  id: string
  title: string
  type: 'metric' | 'line' | 'bar' | 'doughnut'
  metabaseQuestionId: string
  size: 'small' | 'medium' | 'large'
}

export interface Dashboard {
  id: string
  name: string
  widgets: Widget[]
}

/* ── Mock data (IDs disponíveis até integrar Metabase real) ──────────────── */
type MbResult = { cols: { name: string }[]; rows: unknown[][] }

const MOCK_Q: Record<number, MbResult> = {
  101: { cols:[{name:'Mês'},{name:'Valor'}],   rows:[['Jan',142000],['Fev',158000],['Mar',173000],['Abr',161000],['Mai',189000],['Jun',204000],['Jul',198000],['Ago',221000],['Set',237000],['Out',215000],['Nov',248000],['Dez',263000]] },
  102: { cols:[{name:'Canal'},{name:'Qtd'}],   rows:[['Inbound',312],['Outbound',187],['Indicação',94]] },
  103: { cols:[{name:'Closer'},{name:'Vend'}], rows:[['Ana',47],['Pedro',39],['Carla',35],['João',28],['Luana',24],['Marcos',19]] },
  104: { cols:[{name:'Sem'},{name:'Taxa'}],    rows:[['S1',22],['S2',25],['S3',21],['S4',28],['S5',31],['S6',27],['S7',33],['S8',35]] },
  105: { cols:[{name:'SDR'},{name:'Calls'}],   rows:[['Ana',84],['Carlos',71],['Bia',68],['Lucas',60],['Manu',55]] },
}

function useMbData(qId: string) {
  const n = parseInt(qId)
  const data = isNaN(n) ? null : (MOCK_Q[n] ?? null)
  return { data }
}

function toRows(d: MbResult | null) {
  if (!d) return []
  return d.rows.map(r => ({ label: String(r[0]), value: Number(r[1]) }))
}

/* ── Color palette (command-center) ─────────────────────────────────────── */
const CC = {
  bg: '#060B14', card: '#0D1525', border: 'rgba(255,255,255,0.07)',
  text: '#F8FAFC', text2: '#94A3B8', muted: '#64748B',
  blue: '#3B82F6', purple: '#8B5CF6', green: '#10B981', pink: '#EC4899', cyan: '#06B6D4',
} as const

const SEG_COLORS = [CC.blue, CC.purple, CC.green, CC.pink, CC.cyan]

const EMPTY_W: Omit<Widget, 'id'> = {
  title: '', type: 'line', metabaseQuestionId: '', size: 'medium',
}

/* ── Widget body ─────────────────────────────────────────────────────────── */
function WidgetBody({ widget }: { widget: Widget }) {
  const { data } = useMbData(widget.metabaseQuestionId)
  const rows     = toRows(data)

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: 160, gap: 8, color: CC.muted }}>
      <div style={{ fontSize: 26 }}>📊</div>
      <div style={{ fontSize: 12, textAlign: 'center' }}>Sem dados</div>
      <div style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
        ID: {widget.metabaseQuestionId || '—'}
      </div>
    </div>
  )

  if (widget.type === 'metric') {
    const last = rows[rows.length - 1]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 120, gap: 4 }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: CC.text, letterSpacing: '-.04em', lineHeight: 1,
          textShadow: `0 0 40px ${CC.blue}55` }}>
          {last?.value.toLocaleString('pt-BR') ?? '—'}
        </div>
        <div style={{ fontSize: 11, color: CC.muted }}>{last?.label ?? ''}</div>
      </div>
    )
  }
  if (widget.type === 'line')
    return <LineAreaChart data={rows} height={160} color={CC.blue} valueKey="value" labelKey="label" />
  if (widget.type === 'bar')
    return <BarChartV data={rows} height={160} color1={CC.purple} color2={CC.purple + 'BB'} />
  if (widget.type === 'doughnut') {
    const segs: DonutSegment[] = rows.map((r, i) => ({ ...r, color: SEG_COLORS[i % SEG_COLORS.length] }))
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}><DonutChart data={segs} size={130} /></div>
  }
  return null
}

/* ── Widget card (with edit overlay) ────────────────────────────────────── */
function WidgetCard({ widget, editMode, onEdit, onDelete }: {
  widget: Widget; editMode: boolean; onEdit: () => void; onDelete: () => void
}) {
  const span = widget.size === 'small' ? 1 : widget.size === 'medium' ? 2 : 4
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: CC.card, border: `1px solid ${CC.border}`, borderRadius: 16, padding: '18px 20px',
      position: 'relative',
      ...(editMode ? { outline: '1px dashed rgba(59,130,246,0.3)', outlineOffset: 2 } : {}),
    }}>
      {editMode && (
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 5 }}>
          <button onClick={onEdit}   style={iconBtn(CC.blue,  'rgba(59,130,246,0.15)' )}>✏</button>
          <button onClick={onDelete} style={iconBtn('#EF4444','rgba(239,68,68,0.12)'  )}>✕</button>
        </div>
      )}
      <div style={{ fontSize: 10, fontWeight: 700, color: CC.text2, textTransform: 'uppercase',
        letterSpacing: '.1em', marginBottom: 12, paddingRight: editMode ? 68 : 0 }}>
        {widget.title}
      </div>
      <WidgetBody widget={widget} />
    </div>
  )
}

function iconBtn(color: string, bg: string): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 6, border: 'none', background: bg, color,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }
}

/* ══════════════════════════ DashBuilder ════════════════════════════════════ */
export function DashBuilder({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const toast    = useToast()

  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [activeId,   setActiveId]   = useState<string | null>(null)
  const [editMode,   setEditMode]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(true)

  const [tabModal,   setTabModal]   = useState(false)
  const [newTabName, setNewTabName] = useState('')

  const [wModal,     setWModal]     = useState(false)
  const [editingW,   setEditingW]   = useState<Widget | null>(null)
  const [wForm,      setWForm]      = useState<Omit<Widget,'id'>>({ ...EMPTY_W })

  /* load */
  useEffect(() => {
    if (!user) return
    supabase.from('dashboard_configs').select('config').eq('created_by', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.config) {
          const dbs = data.config as Dashboard[]
          setDashboards(dbs)
          setActiveId(dbs[0]?.id ?? null)
        }
        setLoading(false)
      })
  }, [user])

  const activeTab = dashboards.find(d => d.id === activeId) ?? null

  /* ── tab actions ── */
  function createTab() {
    if (!newTabName.trim()) return
    const d: Dashboard = { id: crypto.randomUUID(), name: newTabName.trim(), widgets: [] }
    const next = [...dashboards, d]
    setDashboards(next); setActiveId(d.id); setNewTabName(''); setTabModal(false)
  }
  function deleteTab(id: string) {
    const next = dashboards.filter(d => d.id !== id)
    setDashboards(next); setActiveId(next[0]?.id ?? null)
  }

  /* ── widget actions ── */
  function openAdd()          { setEditingW(null); setWForm({ ...EMPTY_W }); setWModal(true) }
  function openEdit(w: Widget){ setEditingW(w); setWForm({ title: w.title, type: w.type, metabaseQuestionId: w.metabaseQuestionId, size: w.size }); setWModal(true) }

  function saveWidget() {
    if (!wForm.title.trim() || !activeId) return
    const apply = editingW
      ? (dbs: Dashboard[]) => dbs.map(d => d.id === activeId
          ? { ...d, widgets: d.widgets.map(w => w.id === editingW.id ? { ...editingW, ...wForm } : w) } : d)
      : (dbs: Dashboard[]) => dbs.map(d => d.id === activeId
          ? { ...d, widgets: [...d.widgets, { id: crypto.randomUUID(), ...wForm }] } : d)
    setDashboards(apply)
    setWModal(false)
  }

  function deleteWidget(wId: string) {
    setDashboards(dbs => dbs.map(d => d.id === activeId
      ? { ...d, widgets: d.widgets.filter(w => w.id !== wId) } : d))
  }

  /* ── save to Supabase ── */
  async function handleSave() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('dashboard_configs')
      .upsert({ created_by: user.id, config: dashboards as unknown as Json }, { onConflict: 'created_by' })
    setSaving(false)
    error ? toast(error.message, 'error') : toast('Layout salvo!', 'success')
  }

  /* ── shared styles ── */
  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 13px', borderRadius: 9, fontSize: 13,
    background: 'var(--bg-card2)', border: '1px solid var(--border)',
    color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const sel: React.CSSProperties = { ...inp, appearance: 'none', cursor: 'pointer' }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
    letterSpacing: '.06em', marginBottom: 5, display: 'block',
  }

  if (loading) return (
    <>
      <Header />
      <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Carregando dashboards…</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )

  return (
    <div style={{ minHeight: '100vh', background: CC.bg }}>
      <Header />
      <div style={{ padding: '80px 24px 48px', maxWidth: 1280, margin: '0 auto' }}>

        {/* ── Top bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: CC.text, margin: 0, letterSpacing: '-.02em' }}>Dashboard Builder</h1>
            <div style={{ fontSize: 11, color: CC.muted, marginTop: 2 }}>Crie e configure seus painéis livremente</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editMode && (
              <button onClick={handleSave} disabled={saving} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9,
                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
                color: CC.green, fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                {saving ? 'Salvando…' : 'Salvar Layout'}
              </button>
            )}
            <button onClick={() => setEditMode(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9,
              background: editMode ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)',
              border: editMode ? '1px solid rgba(59,130,246,0.45)' : '1px solid rgba(255,255,255,0.1)',
              color: editMode ? CC.blue : CC.text2, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
            }}>
              <Settings size={12} />
              {editMode ? 'Concluir Edição' : 'Editar Layout'}
            </button>
          </div>
        </div>

        {/* ── Tabs bar ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, marginBottom: 20,
          borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {dashboards.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={() => setActiveId(d.id)} style={{
                padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600, transition: 'color .15s',
                color: activeId === d.id ? CC.text : CC.text2,
                borderBottom: activeId === d.id ? `2px solid ${CC.blue}` : '2px solid transparent',
                marginBottom: -1,
              }}>{d.name}</button>
              {editMode && dashboards.length > 1 && (
                <button onClick={() => deleteTab(d.id)} style={{
                  width: 17, height: 17, borderRadius: '50%', border: 'none',
                  background: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer',
                  fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginLeft: -6, marginBottom: 8, flexShrink: 0,
                }}>✕</button>
              )}
            </div>
          ))}
          {editMode && (
            <button onClick={() => setTabModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', marginBottom: 2,
              background: 'none', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8,
              color: CC.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Plus size={11} /> Nova Aba
            </button>
          )}
        </div>

        {/* ── Empty state (nenhum dashboard) ── */}
        {dashboards.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 320, gap: 14, color: CC.muted }}>
            <div style={{ fontSize: 44 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: CC.text2 }}>Nenhum painel criado ainda</div>
            <div style={{ fontSize: 13 }}>Ative o modo de edição e crie sua primeira aba.</div>
            {!editMode && (
              <button onClick={() => setEditMode(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10,
                border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.1)',
                color: CC.blue, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Settings size={13} /> Começar a editar
              </button>
            )}
          </div>
        )}

        {/* ── Widget grid ── */}
        {activeTab && (
          <>
            {editMode && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={openAdd} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
                  border: '1px dashed rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.07)',
                  color: CC.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <Plus size={13} /> Adicionar Gráfico
                </button>
              </div>
            )}

            {activeTab.widgets.length === 0 && !editMode && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: 200, gap: 8, color: CC.muted }}>
                <div style={{ fontSize: 13 }}>Esta aba está vazia.</div>
                <div style={{ fontSize: 11 }}>Ative "Editar Layout" para adicionar gráficos.</div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {activeTab.widgets.map(w => (
                <WidgetCard key={w.id} widget={w} editMode={editMode}
                  onEdit={() => openEdit(w)} onDelete={() => deleteWidget(w.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Modal: Nova Aba ── */}
      <Modal open={tabModal} onClose={() => setTabModal(false)} title="Nova Aba">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Nome da Aba</label>
            <input style={inp} value={newTabName} onChange={e => setNewTabName(e.target.value)}
              placeholder="ex: Visão Geral, Vendas, Atendimento…"
              onKeyDown={e => e.key === 'Enter' && createTab()} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setTabModal(false)}>Cancelar</Button>
            <Button icon={Plus} onClick={createTab} disabled={!newTabName.trim()}>Criar Aba</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Gráfico ── */}
      <Modal open={wModal} onClose={() => setWModal(false)} title={editingW ? 'Editar Gráfico' : 'Adicionar Gráfico'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Título do Gráfico *</label>
            <input style={inp} value={wForm.title}
              onChange={e => setWForm(p => ({ ...p, title: e.target.value }))}
              placeholder="ex: Receita Mensal, Calls por SDR…" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Tipo de Gráfico</label>
              <select style={sel} value={wForm.type}
                onChange={e => setWForm(p => ({ ...p, type: e.target.value as Widget['type'] }))}>
                <option value="metric">Métrica Simples</option>
                <option value="line">Linha</option>
                <option value="bar">Barra</option>
                <option value="doughnut">Rosca</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Tamanho no Grid</label>
              <select style={sel} value={wForm.size}
                onChange={e => setWForm(p => ({ ...p, size: e.target.value as Widget['size'] }))}>
                <option value="small">Pequeno (1 col)</option>
                <option value="medium">Médio (2 cols)</option>
                <option value="large">Grande (linha inteira)</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>ID da Pergunta Metabase</label>
            <input style={inp} value={wForm.metabaseQuestionId}
              onChange={e => setWForm(p => ({ ...p, metabaseQuestionId: e.target.value }))}
              placeholder="ex: 101, 847, 1203…" inputMode="numeric" />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5 }}>
              Mock disponível: <strong>101</strong> Receita · <strong>102</strong> Canais · <strong>103</strong> Closers · <strong>104</strong> Conversão · <strong>105</strong> Calls
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setWModal(false)}>Cancelar</Button>
            <Button icon={editingW ? Pencil : Plus} onClick={saveWidget} disabled={!wForm.title.trim()}>
              {editingW ? 'Salvar Alterações' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
