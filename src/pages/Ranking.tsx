import { useEffect, useMemo, useState } from 'react'
import { Crown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { Header } from '@/components/Header'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Sheet } from '@/components/ui/Sheet'
import { Sel } from '@/components/ui/Field'
import { BarChartV } from '@/components/ui/charts/BarChartV'
import { DateFilter, DateRange } from '@/components/ui/DateFilter'
import { supabase } from '@/lib/supabase/client'
import { ROLE_COLORS } from '@/lib/utils'
import { format, startOfMonth, endOfMonth } from 'date-fns'

type DbUser = { id: string; name: string; role: string; team_id: string | null; active: boolean }
type DbTeam = { id: string; name: string }
type DbActivation = { responsible: string; sdr_id: string | null; date: string }
type DbCall = { responsible: string; status: string; ativado: boolean | null; date: string; sdr_nome: string | null }

type RankEntry = {
  userId: string; name: string; role: string; team: string
  activations: number; score: number; variation: number
  calls: number; realizadas: number; noshow: number; canceladas: number
  taxaRealizacao: number; taxaAtivacao: number
}

const MEDAL_COLORS  = ['var(--gold)', '#C0C0C0', '#CD7F32']
const PODIUM_HEIGHTS = [160, 120, 100]

const DEFAULT_RANGE: DateRange = {
  startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  endDate:   format(endOfMonth(new Date()),   'yyyy-MM-dd'),
}

export default function Ranking() {
  const toast = useToast()
  const [users,       setUsers]       = useState<DbUser[]>([])
  const [teams,       setTeams]       = useState<DbTeam[]>([])
  const [activations, setActivations] = useState<DbActivation[]>([])
  const [calls,       setCalls]       = useState<DbCall[]>([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [filterTeam,  setFilterTeam]  = useState('')
  const [sheetUser,   setSheetUser]   = useState<RankEntry | null>(null)
  const [viewMode,    setViewMode]    = useState<'closers' | 'sdr'>('closers')
  const [dateRange,   setDateRange]   = useState<DateRange>(DEFAULT_RANGE)

  useEffect(() => {
    if (!dateRange.startDate || !dateRange.endDate) return
    async function load() {
      setIsLoading(true)
      const [{ data: usrs, error: ue }, { data: tms, error: te }, { data: acts, error: ae }, { data: cls, error: ce }] = await Promise.all([
        supabase.from('users').select('id,name,role,team_id,active').order('name'),
        supabase.from('teams').select('id,name').order('name'),
        supabase.from('activations').select('responsible,sdr_id,date')
          .gte('date', dateRange.startDate).lte('date', dateRange.endDate),
        supabase.from('calls').select('responsible,status,ativado,date,sdr_nome')
          .gte('date', dateRange.startDate).lte('date', dateRange.endDate),
      ])
      if (ue) toast(ue.message, 'error')
      if (te) toast(te.message, 'error')
      if (ae) toast(ae.message, 'error')
      if (ce) toast(ce.message, 'error')
      if (usrs) setUsers(usrs as DbUser[])
      if (tms)  setTeams(tms as DbTeam[])
      if (acts) setActivations(acts as DbActivation[])
      if (cls)  setCalls(cls as DbCall[])
      setIsLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate])

  // ── Ranking Closers ───────────────────────────────────────────────────────
  const closerRanking = useMemo<RankEntry[]>(() => {
    const actCounts: Record<string, number> = {}
    activations.forEach(a => { actCounts[a.responsible] = (actCounts[a.responsible] || 0) + 1 })

    return users
      .filter(u => u.role === 'Closer')
      .filter(u => !filterTeam || teams.find(t => t.id === u.team_id)?.name === filterTeam)
      .map(u => {
        const uCalls     = calls.filter(c => c.responsible === u.id)
        const realizadas = uCalls.filter(c => c.status === 'Realizada').length
        const noshow     = uCalls.filter(c => c.status === 'No-show').length
        const canceladas = uCalls.filter(c => c.status === 'Cancelada').length
        const ativadas   = uCalls.filter(c => c.ativado === true).length
        const taxaReal   = uCalls.length > 0 ? Math.round((realizadas / uCalls.length) * 100) : 0
        const taxaAtiv   = realizadas > 0 ? Math.round((ativadas / realizadas) * 100) : 0
        const atv        = actCounts[u.id] || 0
        return {
          userId: u.id, name: u.name, role: u.role,
          team: teams.find(t => t.id === u.team_id)?.name || '—',
          activations: atv,
          score: Math.min(100, atv * 10),
          variation: 0,
          calls: uCalls.length,
          realizadas, noshow, canceladas,
          taxaRealizacao: taxaReal,
          taxaAtivacao: taxaAtiv,
        }
      })
      .sort((a, b) => b.activations - a.activations)
  }, [users, teams, activations, calls, filterTeam])

  // ── Ranking SDR ───────────────────────────────────────────────────────────
  const sdrRanking = useMemo<RankEntry[]>(() => {
    // Ativações por sdr_id
    const actCounts: Record<string, number> = {}
    activations.forEach(a => { if (a.sdr_id) actCounts[a.sdr_id] = (actCounts[a.sdr_id] || 0) + 1 })

    return users
      .filter(u => u.role === 'SDR')
      .filter(u => !filterTeam || teams.find(t => t.id === u.team_id)?.name === filterTeam)
      .map(u => {
        const atv        = actCounts[u.id] || 0
        const uCalls     = calls.filter(c => c.sdr_nome === u.name)
        const agendadas  = uCalls.length
        const realizadas = uCalls.filter(c => c.status === 'Realizada').length
        const noshow     = uCalls.filter(c => c.status === 'No-show').length
        const canceladas = uCalls.filter(c => c.status === 'Cancelada').length
        const taxaReal   = agendadas > 0 ? Math.round((realizadas / agendadas) * 100) : 0
        return {
          userId: u.id, name: u.name, role: u.role,
          team: teams.find(t => t.id === u.team_id)?.name || '—',
          activations: atv,
          score: Math.min(100, atv * 10),
          variation: 0,
          calls: agendadas, realizadas, noshow, canceladas,
          taxaRealizacao: taxaReal, taxaAtivacao: 0,
        }
      })
      .sort((a, b) => b.calls - a.calls || b.activations - a.activations)
  }, [users, teams, activations, calls, filterTeam])

  const closerTop3   = closerRanking.slice(0, 3)
  const sdrTop3      = sdrRanking.slice(0, 3)
  const closerChart  = closerRanking.slice(0, 6).map(r => ({ label: r.name.split(' ')[0], value: r.activations }))
  const sdrChart     = sdrRanking.slice(0, 6).map(r => ({ label: r.name.split(' ')[0], value: r.activations }))

  const makeSparkline = (seed: number) =>
    Array.from({ length: 14 }, (_, i) => ({
      value: Math.max(0, Math.round((seed / 14) + Math.sin(i * seed * 0.7) * (seed * 0.3))),
    }))

  function Podium({ top3, color }: { top3: RankEntry[]; color: string }) {
    return (
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
        {top3.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 14, paddingTop: 40 }}>
            Sem ativações no período selecionado.
          </div>
        )}
      </div>
    )
  }

  function RankingTable({ ranking, title, showCalls = false, showSdrCalls = false }: { ranking: RankEntry[]; title: string; showCalls?: boolean; showSdrCalls?: boolean }) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>
          {title}
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th><th>Nome</th><th>Time</th><th>Ativações</th>
                {showCalls && <>
                  <th>Calls</th>
                  <th>Realizadas</th>
                  <th>No-show</th>
                  <th>Canceladas</th>
                  <th>% Realização</th>
                  <th>% Ativação</th>
                </>}
                {showSdrCalls && <>
                  <th>Agendadas</th>
                  <th>Realizadas</th>
                  <th>No-show</th>
                  <th>Canceladas</th>
                  <th>% Realização</th>
                </>}
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 && (
                <tr><td colSpan={showCalls ? 11 : showSdrCalls ? 10 : 5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
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
                  <td style={{ fontSize: 13, color: 'var(--text2)' }}>{r.team}</td>
                  <td style={{ fontWeight: 700 }}>{r.activations}</td>
                  {showSdrCalls && <>
                    <td style={{ fontWeight: 700, color: 'var(--action)' }}>{r.calls}</td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>{r.realizadas}</td>
                    <td style={{ fontWeight: 600, color: 'var(--orange)' }}>{r.noshow}</td>
                    <td style={{ fontWeight: 600, color: 'var(--red)' }}>{r.canceladas}</td>
                    <td>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: r.taxaRealizacao >= 70 ? 'var(--green)' : r.taxaRealizacao >= 40 ? 'var(--orange)' : 'var(--red)'
                      }}>{r.taxaRealizacao}%</span>
                    </td>
                  </>}
                  {showCalls && <>
                    <td style={{ fontWeight: 600 }}>{r.calls}</td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>{r.realizadas}</td>
                    <td style={{ fontWeight: 600, color: 'var(--orange)' }}>{r.noshow}</td>
                    <td style={{ fontWeight: 600, color: 'var(--red)' }}>{r.canceladas}</td>
                    <td>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: r.taxaRealizacao >= 70 ? 'var(--green)' : r.taxaRealizacao >= 40 ? 'var(--orange)' : 'var(--red)'
                      }}>{r.taxaRealizacao}%</span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: r.taxaAtivacao >= 50 ? 'var(--green)' : r.taxaAtivacao >= 25 ? 'var(--orange)' : 'var(--red)'
                      }}>{r.taxaAtivacao}%</span>
                    </td>
                  </>}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Header + Filtros ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Ranking</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <DateFilter value="Mês Atual" onChange={setDateRange} />
            <Sel value={filterTeam} onChange={setFilterTeam}
              options={teams.map(t => t.name)} placeholder="Todos os times" />
            <Sel value={viewMode} onChange={v => setViewMode(v as 'closers' | 'sdr')}
              options={[{ value: 'closers', label: 'Closers' }, { value: 'sdr', label: 'SDR' }]}
              placeholder="" />
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text2)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14 }}>Calculando ranking…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {viewMode === 'closers' ? (
              <section>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, marginBottom: 16 }}>
                  <Podium top3={closerTop3} color="var(--action)" />
                </div>
                {closerChart.length > 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Ativações por Closer</div>
                    <BarChartV data={closerChart} height={180} />
                  </div>
                )}
                <RankingTable ranking={closerRanking} title="Ranking Closers" showCalls />
              </section>
            ) : (
              <section>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, marginBottom: 16 }}>
                  <Podium top3={sdrTop3} color="#0891b2" />
                </div>
                {sdrChart.length > 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Ativações por SDR</div>
                    <BarChartV data={sdrChart} height={180} />
                  </div>
                )}
                <RankingTable ranking={sdrRanking} title="Ranking SDR" showSdrCalls />
              </section>
            )}

          </div>
        )}

        {/* ── Sheet: Perfil ── */}
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
