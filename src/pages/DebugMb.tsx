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
    setResults({})
    const entries = await Promise.all(
      databases.map(db =>
        supabase.functions.invoke('mb-search', {
          body: { test_db: db.id, debug_email: email.trim().toLowerCase() },
        }).then(({ data }) => [db.id, data] as [number, any])
      )
    )
    setResults(Object.fromEntries(entries))
    setIsLoading(false)
  }

  const cell = (v: any) => {
    if (v === null || v === undefined) return <span style={{ color: '#636366', fontStyle: 'italic' }}>NULL</span>
    const s = String(v)
    const isNum = typeof v === 'number' || (!isNaN(Number(v)) && s !== '' && s !== 'null')
    return <span style={{ color: isNum && Number(v) > 0 ? '#34C759' : isNum ? '#636366' : '#fff' }}>{s}</span>
  }

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
  }

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Debug Metabase — Busca em todos os bancos</h1>

        {/* Bancos disponíveis */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Bancos conectados no Metabase
          </div>
          {loadingDbs ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando…
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {databases.map(db => (
                <div key={db.id} style={{ padding: '6px 14px', borderRadius: 20, background: 'var(--bg-card2)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: 'var(--action)' }}>#{db.id}</span>
                  <span style={{ color: 'var(--text)', marginLeft: 6 }}>{db.name}</span>
                  <span style={{ color: 'var(--text2)', marginLeft: 6, fontSize: 10 }}>({db.engine})</span>
                </div>
              ))}
              {databases.length === 0 && <span style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhum banco encontrado</span>}
            </div>
          )}
        </div>

        {/* Input + botão */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <input value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email do cliente"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }} />
          <button onClick={runAll} disabled={isLoading || databases.length === 0}
            style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: 'var(--action)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, opacity: databases.length === 0 ? 0.5 : 1 }}>
            {isLoading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            Consultar em todos os bancos
          </button>
        </div>

        {/* Resultados por banco */}
        {Object.entries(results).map(([dbIdStr, data]) => {
          const dbId   = Number(dbIdStr)
          const dbInfo = databases.find(d => d.id === dbId)
          const hasData = data?.rows?.length > 0
          const totalLiquid = hasData ? data.rows[0]?.[4] : null

          return (
            <div key={dbId} style={{ ...card, marginBottom: 16 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  #{dbId} — {dbInfo?.name ?? 'Banco desconhecido'}
                </span>
                {data?.error ? (
                  <span style={{ fontSize: 12, color: '#FF3B30', fontWeight: 600 }}>⚠ Erro: {data.error}</span>
                ) : !hasData ? (
                  <span style={{ fontSize: 12, color: '#FF9F0A', fontWeight: 600 }}>⚠ Email não encontrado neste banco</span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: Number(totalLiquid) > 0 ? '#34C759' : '#636366' }}>
                    {Number(totalLiquid) > 0
                      ? `✓ Total liquid: R$ ${Number(totalLiquid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '— Sem pagamentos paid encontrados'}
                  </span>
                )}
              </div>
              {hasData && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-card2)' }}>
                        {(data.cols ?? []).map((c: string) => (
                          <th key={c} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data.rows ?? []).map((row: any[], i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          {row.map((v, j) => (
                            <td key={j} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{cell(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
