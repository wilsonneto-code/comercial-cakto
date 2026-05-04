import { useEffect, useMemo, useState } from 'react'
import { Crown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Sheet } from '@/components/ui/Sheet'
import { Sel } from '@/components/ui/Field'
import { BarChartV } from '@/components/ui/charts/BarChartV'
import { DualLineChart } from '@/components/ui/charts/DualLineChart'
import { DateFilter, DateRange } from '@/components/ui/DateFilter'
import { supabase } from '@/lib/supabase/client'
import { ROLE_COLORS } from '@/lib/utils'
import { format, startOfMonth, endOfMonth } from 'date-fns'

type DbUser = { id: string; name: string; role: string; team_id: string | null; active: boolean }
type DbTeam = { id: string; name: string }
type DbActivation = { responsible: string; date: string }

type RankEntry = {
  userId: string; name: string; role: string; team: string
  activations: number; score: number; variation: number
}

const ROLES = ['Closer', 'SDR', 'Gerente de Contas', 'Supervisor', 'Head Comercial']
const MEDAL_COLORS = ['var(--gold)', '#C0C0C0', '#CD7F32']
const PODIUM_HEIGHTS = [160, 120, 100]

const DEFAULT_RANGE: DateRange = {
  startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
}

export default function Ranking() {
  const toast = useToast()
  const [users, setUsers] = useState<DbUser[]>([])
  const [teams, setTeams] = useState<DbTeam[]>([])
  const [activations, setActivations] = useState<DbActivation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterTeam, setFilterTeam] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [sheetUser, setSheetUser] = useState<RankEntry | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)

  // ── Re-fetch whenever date range changes ──────────────────────────────────
  useEffect(() => {
    if (!dateRange.startDate || !dateRange.endDate) return
    async function load() {
      setIsLoading(true)
      const [{ data: usrs, error: ue }, { data: tms, error: te }, { data: acts, error: ae }] = await Promise.all([
        supabase.from('users').select('id,name,role,team_id,active').order('name'),
        supabase.from('teams').select('id,name').order('name'),
        supabase
          .from('activations')
          .select('responsible,date')
          .gte('date', dateRange.startDate)
          .lte('date', dateRange.endDate),
      ])
      if (ue) toast(ue.message, 'error')
      if (te) toast(te.message, 'error')
      if (ae) toast(ae.message, 'error')
      if (usrs) setUsers(usrs as DbUser[])
      if (tms) setTeams(tms as DbTeam[])
      if (acts) setActivations(acts as DbActivation[])
      setIsLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate])

  // ── Ranking computation (respects period via filtered activations) ─────────
  const ranking = useMemo<RankEntry[]>(() => {
    const counts: Record<string, number> = {}
    activations.forEach(a => { counts[a.responsible] = (counts[a.responsible] || 0) + 1 })
    return users
      .filter(u => u.role !== 'Colaborador')
      .map(u => ({
        userId: u.id, name: u.name, role: u.role,
        team: teams.find(t => t.id === u.team_id)?.name || '—',
        activations: counts[u.id] || 0,
        score: Math.min(100, (counts[u.id] || 0) * 10),
        variation: 0,
      }))
      .filter(r => (!filterTeam || r.team === filterTeam) && (!filterRole || r.role === filterRole))
      .sort((a, b) => b.activations - a.activations)
  }, [users, teams, activations, filterTeam, filterRole])

  const top3 = ranking.slice(0, 3)
  const chartData = ranking.slice(0, 6).map(r => ({ label: r.name.split(' ')[0], value: r.activations }))

  const teamKpis = useMemo(() => {
    const counts: Record<string, number> = {}
    activations.forEach(a => { counts[a.responsible] = (counts[a.responsible] || 0) + 1 })
    return teams.map(t => {
      const memberIds = users.filter(u => u.team_id === t.id).map(u => u.id)
      const total = memberIds.reduce((s, id) => s + (counts[id] || 0), 0)
      const topMemberId = [...memberIds].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0]
      const topName = users.find(u => u.id === topMemberId)?.name || '—'
      return { name: t.name, total, topName }
    })
  }, [teams, users, activations])

  const makeSparkline = (seed: number) =>
    Array.from({ length: 14 }, (_, i) => ({
      value: Math.max(0, Math.round((seed / 14) + Math.sin(i * seed * 0.7) * (seed * 0.3))),
    }))

  return (
    <>
      <Header />
      <div className="page-wrap">
        {/* ── Header + Filters ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Ranking</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <DateFilter value="Mês Atual" onChange={setDateRange} />
            <Sel value={filterTeam} onChange={setFilterTeam}
              options={teams.map(t => t.name)} placeholder="Todos os times" />
            <Sel value={filterRole} onChange={setFilterRole}
              options={ROLES} placeholder="Todos os cargos" />
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text2)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14 }}>Calculando ranking…</span>
          </div>
        ) : <>

        {/* ── Podium ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, minHeight: 220 }}>
            {[1, 0, 2].map(pos => {
              const r = top3[pos]
              if (!r) return <div key={pos} style={{ width: 120 }} />
              return (
                <div key={pos} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  {pos === 0 && <Crown size={28} color="var(--gold)" />}
                  <Avatar name={r.name} size={pos === 0 ? 52 : 44} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name.split(' ')[0]}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{r.activations} ativações</div>
                  </div>
                  <div style={{
                    width: 100, height: PODIUM_HEIGHTS[pos],
                    background: `linear-gradient(180deg, color-mix(in srgb, ${MEDAL_COLORS[pos]} 20%, var(--bg-card2)), var(--bg-card2))`,
                    border: `2px solid ${MEDAL_COLORS[pos]}`, borderRadius: '8px 8px 0 0',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 12,
                  }}>
                    <span style={{ fontWeight: 800, fontSize: 24, color: MEDAL_COLORS[pos] }}>{pos + 1}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {top3.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 14, paddingTop: 40 }}>
              Sem ativações no período selecionado.
            </div>
          )}
        </div>

        {/* ── Team KPIs ── */}
        {teamKpis.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            {teamKpis.map(t => (
              <div key={t.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{t.name}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--action)', marginBottom: 4 }}>{t.total}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Top: {t.topName?.split(' ')[0] || '—'}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Charts ── */}
        {chartData.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Ativações por Colaborador</div>
              <BarChartV data={chartData} height={180} />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Evolução por Time</div>
              <DualLineChart
                dataA={teamKpis[0] ? makeSparkline(teamKpis[0].total) : []}
                dataB={teamKpis[1] ? makeSparkline(teamKpis[1].total) : []}
                height={180}
                labelA={teamKpis[0]?.name || 'Time A'}
                labelB={teamKpis[1]?.name || 'Time B'}
              />
            </div>
          </div>
        )}

        {/* ── Full Ranking Table ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>
            Ranking Completo
          </div>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>Nome</th><th>Cargo</th><th>Time</th><th>Ativações</th><th>Score</th><th>Variação</th></tr>
              </thead>
              <tbody>
                {ranking.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                    Nenhum dado disponível.
                  </td></tr>
                )}
                {ranking.map((r, i) => (
                  <tr key={r.userId} style={{ cursor: 'pointer' }} onClick={() => setSheetUser(r)}>
                    <td style={{ fontWeight: 800, color: i < 3 ? MEDAL_COLORS[i] : 'var(--text2)' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={r.name} size={30} />
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                      </div>
                    </td>
                    <td><Badge label={r.role} color={ROLE_COLORS[r.role] || 'var(--action)'} /></td>
                    <td style={{ fontSize: 13, color: 'var(--text2)' }}>{r.team}</td>
                    <td style={{ fontWeight: 700 }}>{r.activations}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, maxWidth: 80 }}>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${r.score}%` }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{r.score}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700, fontSize: 13,
                        color: r.variation > 0 ? 'var(--green)' : r.variation < 0 ? 'var(--red)' : 'var(--text2)' }}>
                        {r.variation > 0 && <ArrowUp size={13} color="var(--green)" />}
                        {r.variation < 0 && <ArrowDown size={13} color="var(--red)" />}
                        {r.variation === 0 ? '—' : Math.abs(r.variation)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        </>}

        {/* ── User Detail Sheet ── */}
        <Sheet open={!!sheetUser} onClose={() => setSheetUser(null)} title="Perfil de Performance">
          {sheetUser && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Avatar name={sheetUser.name} size={60} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{sheetUser.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <Badge label={sheetUser.role} color={ROLE_COLORS[sheetUser.role] || 'var(--action)'} />
                    <Badge label={sheetUser.team} color="var(--text2)" />
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--action)' }}>{sheetUser.activations}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4 }}>Ativações</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--purple)' }}>{sheetUser.score}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4 }}>Score</div>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Evolução (simulada)</div>
                <BarChartV data={makeSparkline(sheetUser.activations)} height={120} />
              </div>
            </div>
          )}
        </Sheet>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
