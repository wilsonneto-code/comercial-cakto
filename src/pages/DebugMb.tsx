import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

type DbInfo = { id: number; name: string; engine: string }

export default function DebugMb() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [email,      setEmail]      = useState('roniariamaradona2@gmail.com')
  const [databases,  setDatabases]  = useState<DbInfo[]>([])
  const [results,    setResults]    = useState<Record<number, any>>({})
  const [statusRes,  setStatusRes]  = useState<any>(null)
  const [tablesRes,  setTablesRes]  = useState<any>(null)
  const [findRes,    setFindRes]    = useState<any>(null)
  const [isLoading,  setIsLoading]  = useState(false)
  const [loadingDbs, setLoadingDbs] = useState(false)

  if (loading) return null
  if (!user || !hasAnyRole(user, ['Admin'])) { navigate('/'); return null }

  useEffect(() => {
    setLoadingDbs(true)
    supabase.functions.invoke('mb-search', { body: { list_databases: true } })
      .then(({ data }) => { if (data?.databases) setDatabases(data.databases) })
      .finally(() => setLoadingDbs(false))
  }, [])

  async function runAll() {
    if (!email.trim() || databases.length === 0) return
    setIsLoading(true)
    setResults({}); setStatusRes(null); setTablesRes(null); setFindRes(null)
    const entries = await Promise.all(
      databases.map(db =>
        supabase.functions.invoke('mb-search', {
          body: { test_db: db.id, debug_email: email.trim().toLowerCase() },
        }).then(({ data }) => [db.id, data] as [number, any])
      )
    )
    const res = Object.fromEntries(entries)
    setResults(res)

    // Roniaria está no Split (#3) com user_id 1247735 — busca todos os status
    const splitResult = res[3]
    const userId = splitResult?.rows?.[0]?.[0]
    if (userId) {
      const [statusData, tablesData, findData] = await Promise.all([
        supabase.functions.invoke('mb-search', { body: { all_statuses: true, user_id: userId, db_id: 3 } }),
        supabase.functions.invoke('mb-search', { body: { list_tables: true, db_id: 4 } }),
        supabase.functions.invoke('mb-search', { body: { find_user: true, debug_email: email.trim().toLowerCase(), db_id: 4 } }),
      ])
      setStatusRes({ userId, data: statusData.data })
      setTablesRes(tablesData.data)
      setFindRes(findData.data)
    }
    setIsLoading(false)
  }

  const cell = (v: any) => {
    if (v === null || v === undefined) return <span style={{ color: '#636366', fontStyle: 'italic' }}>NULL</span>
    const s = String(v)
    const isNum = typeof v === 'number' || (!isNaN(Number(v)) && s !== '' && s !== 'null')
    return <span style={{ color: isNum && Number(v) > 0 ? '#34C759' : isNum ? '#636366' : '#fff' }}>{s}</span>
  }

  function Table({ cols, rows }: { cols: string[]; rows: any[][] }) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-card2)' }}>
              {cols.map(c => <th key={c} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                {row.map((v, j) => <td key={j} style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{cell(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Debug Metabase — Diagnóstico completo</h1>

        {/* Bancos */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Bancos conectados</div>
          {loadingDbs ? <span style={{ color: 'var(--text2)', fontSize: 13 }}>Carregando…</span> : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {databases.map(db => (
                <span key={db.id} style={{ padding: '5px 12px', borderRadius: 20, background: 'var(--bg-card2)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: 'var(--action)' }}>#{db.id}</span>
                  <span style={{ color: 'var(--text)', marginLeft: 6 }}>{db.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email do cliente"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }} />
          <button onClick={runAll} disabled={isLoading || databases.length === 0}
            style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: 'var(--action)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isLoading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            Diagnóstico completo
          </button>
        </div>

        {/* Resultados por banco */}
        {Object.entries(results).map(([dbIdStr, data]) => {
          const dbId   = Number(dbIdStr)
          const dbInfo = databases.find(d => d.id === dbId)
          const hasData = data?.rows?.length > 0
          const totalLiquid = hasData ? data.rows[0]?.[4] : null
          return (
            <div key={dbId} style={card}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>#{dbId} — {dbInfo?.name ?? '?'}</span>
                {data?.error
                  ? <span style={{ fontSize: 12, color: '#FF3B30' }}>⚠ {data.error}</span>
                  : !hasData ? <span style={{ fontSize: 12, color: '#FF9F0A' }}>⚠ Email não encontrado</span>
                  : <span style={{ fontSize: 12, fontWeight: 700, color: Number(totalLiquid) > 0 ? '#34C759' : '#636366' }}>
                      {Number(totalLiquid) > 0 ? `✓ R$ ${Number(totalLiquid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '— Sem pagamentos paid'}
                    </span>}
              </div>
              {hasData && <Table cols={data.cols ?? []} rows={data.rows ?? []} />}
            </div>
          )
        })}

        {/* Todos os status no Cakto Split */}
        {statusRes && (
          <div style={card}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
              Todos os status — user_id {statusRes.userId} (Cakto Split #3)
            </div>
            {statusRes.data?.error
              ? <div style={{ padding: 16, color: '#FF3B30', fontSize: 13 }}>{statusRes.data.error}</div>
              : statusRes.data?.rows?.length === 0
                ? <div style={{ padding: 16, color: '#FF9F0A', fontSize: 13 }}>Nenhum pagamento encontrado com qualquer status</div>
                : <Table cols={statusRes.data?.cols ?? []} rows={statusRes.data?.rows ?? []} />
            }
          </div>
        )}

        {/* Tabelas do banco Cakto #4 */}
        {tablesRes && (
          <div style={card}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
              Tabelas disponíveis — Cakto #4
            </div>
            {tablesRes?.error
              ? <div style={{ padding: 16, color: '#FF3B30', fontSize: 13 }}>{tablesRes.error}</div>
              : <Table cols={tablesRes?.cols ?? []} rows={tablesRes?.rows ?? []} />
            }
          </div>
        )}

        {/* Busca por usuário no banco Cakto #4 */}
        {findRes && (
          <div style={card}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
              Busca por email no banco Cakto #4
            </div>
            {findRes?.results?.length === 0
              ? <div style={{ padding: 16, color: '#FF9F0A', fontSize: 13 }}>Email não encontrado em nenhuma tabela padrão do banco Cakto</div>
              : findRes?.results?.map((r: any, i: number) => (
                  <div key={i}>
                    <div style={{ padding: '8px 20px', fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace', background: 'var(--bg-card2)' }}>{r.sql}</div>
                    <Table cols={r.cols} rows={r.rows} />
                  </div>
                ))
            }
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
