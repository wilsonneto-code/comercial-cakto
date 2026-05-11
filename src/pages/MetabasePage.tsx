import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'

const METABASE_URL = 'https://team.cakto.app/collection/35-comercial'
const ALLOWED_ROLES = ['Admin', 'Gerente de Contas']

export default function MetabasePage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && (!user || !ALLOWED_ROLES.includes(user.role))) {
      navigate('/', { replace: true })
    }
  }, [user, loading, navigate])

  if (loading || !user || !ALLOWED_ROLES.includes(user.role)) return null

  return (
    <>
      <Header />
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
        <iframe
          src={METABASE_URL}
          style={{ flex: 1, border: 'none', width: '100%' }}
          allowFullScreen
        />
      </div>
    </>
  )
}
