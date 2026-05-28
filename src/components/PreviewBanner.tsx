import { useEffect } from 'react'
import { useAuth } from '@/lib/authContext'
import { Eye, X } from 'lucide-react'

export default function PreviewBanner() {
  const { user, isPreview, exitPreview } = useAuth()

  useEffect(() => {
    document.body.classList.toggle('preview-mode', isPreview)
    return () => document.body.classList.remove('preview-mode')
  }, [isPreview])

  if (!isPreview || !user) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, height: 36,
      background: 'linear-gradient(135deg, #F59E0B, #D97706)',
      padding: '0 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#000' }}>
        <Eye size={16} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          Modo Visualização — você está vendo como <strong>{user.name}</strong> ({user.role})
        </span>
      </div>
      <button
        onClick={exitPreview}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 8,
          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.3)',
          color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>
        <X size={13} /> Sair da visualização
      </button>
    </div>
  )
}
