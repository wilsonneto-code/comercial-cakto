import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, hasAnyRole } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function DebugMb() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('junior.startmkt@gmail.com')
  const [result, setResult] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  if (loading) return null
  if (!user || !hasAnyRole(user, ['Admin'])) {
    navigate('/')
    return null
  }

  async function run() {
    setIsLoading(true)
    setResult(null)
    const { data, error } = await supabase.functions.invoke('mb-search', {
      body: { debug_email: email.trim().toLowerCase() },
    })
    setResult(error ? { erro: error } : data)
    setIsLoading(false)
  }

  const cell = (v: any) => {
    if (v === null || v === undefined) return <span style={{ color: '#636366', fontStyle: 'italic' }}>NULL</span>
    const s = String(v)
    const isDate = s.match(/^\d{4}-\d{2}-\d{2}/)
    const isNum  = typeof v === 'number' || (!isNaN(Number(v)) && s !== '')
    return (
      <span style={{ color: isDate ? '#2997FF' : isNum ? '#34C759' : '#fff' }}>
        {s.length > 60 ? s.slice(0, 58) + '…' : s}
      </span>
    )
  }

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ paddingTop: 88 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Debug Metabase — TPV</h1>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email do cliente"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }}
          />
          <button onClick={run} disabled={isLoading}
            style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: 'var(--action)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isLoading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            Consultar
          </button>
        </div>

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Stats */}
            {result.stats && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                  Estatísticas agregadas
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-card2)' }}>
                        {result.stats.cols.map((c: string) => (
                          <th key={c} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.stats.rows.length === 0 && (
                        <tr><td colSpan={99} style={{ padding: 24, textAlign: 'center', color: '#FF3B30', fontWeight: 700 }}>
                          ⚠ Email não encontrado no Metabase
                        </td></tr>
                      )}
                      {result.stats.rows.map((row: any[], i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          {row.map((v, j) => (
                            <td key={j} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{cell(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sample payments */}
            {result.sample && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                  Últimos 10 pagamentos (bruto)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-card2)' }}>
                        {result.sample.cols.map((c: string) => (
                          <th key={c} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.sample.rows.length === 0 && (
                        <tr><td colSpan={99} style={{ padding: 24, textAlign: 'center', color: 'var(--text2)' }}>Sem pagamentos</td></tr>
                      )}
                      {result.sample.rows.map((row: any[], i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          {row.map((v, j) => (
                            <td key={j} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>{cell(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Raw error */}
            {result.erro && (
              <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 10, padding: 16, color: '#fca5a5', fontSize: 13 }}>
                {JSON.stringify(result.erro, null, 2)}
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
