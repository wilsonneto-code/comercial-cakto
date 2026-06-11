import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, ChevronDown, Tag, Settings, LogOut, Menu } from 'lucide-react';
import { useTheme } from './ui/ThemeProvider';
import { Avatar } from './ui/Avatar';
import { Dropdown } from './ui/Dropdown';
import { useAuth } from '@/lib/authContext';
import { useSidebar } from '@/lib/sidebarContext';

export function Header() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { toggle: toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const [ddOpen, setDdOpen] = useState(false);

  const { isPreview } = useAuth();
  const BANNER_H = isPreview ? 36 : 0;

  return (
    <header style={{
      position: 'fixed', top: BANNER_H, left: 0, right: 0, zIndex: 50, height: 62,
      background: 'var(--header-bg)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10,
    }}>

      {/* Linha de acento verde no topo */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
        background: 'linear-gradient(90deg, transparent 0%, var(--action) 35%, rgba(77,140,85,.6) 50%, var(--action) 65%, transparent 100%)',
        opacity: .6,
      }} />

      {/* Botão hamburguer */}
      <button
        onClick={toggleSidebar}
        title="Menu"
        style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-card2)', border: '1px solid var(--border)',
          cursor: 'pointer', color: 'var(--text2)', transition: 'all .18s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)';
        }}
      >
        <Menu size={16} />
      </button>

      {/* ── Logo ── */}
      <button
        onClick={() => navigate('/')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none',
          border: 'none', cursor: 'pointer', flexShrink: 0, padding: '4px 6px', borderRadius: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(145deg, #3D7044 0%, #2F5733 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(47,87,51,.45)',
          flexShrink: 0,
        }}>
          {/* Cakto cactus logo */}
          <svg width="18" height="18" viewBox="0 0 100 120" fill="white">
            <rect x="38" y="8"  width="24" height="104" rx="12" />
            <rect x="8"  y="48" width="46" height="20"  rx="10" />
            <rect x="8"  y="16" width="20" height="52"  rx="10" />
            <rect x="46" y="60" width="46" height="20"  rx="10" />
            <rect x="72" y="28" width="20" height="52"  rx="10" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 800, letterSpacing: '-.025em',
            background: 'linear-gradient(135deg, #E2CFB7 0%, #C4AF98 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Comercial
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
            color: 'var(--action)', marginTop: 1,
          }}>
            Cakto
          </span>
        </div>
      </button>

      {/* Espaço flexível */}
      <div style={{ flex: 1 }} />

      {/* ── Right side ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={dark ? 'Mudar para claro' : 'Mudar para escuro'}
          style={{
            width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text2)', transition: 'all .18s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)';
          }}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Profile dropdown */}
        <Dropdown
          open={ddOpen}
          onClose={() => setDdOpen(false)}
          trigger={
            <button
              onClick={() => setDdOpen(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-card2)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: '4px 10px 4px 5px',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'border-color .18s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-mid)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'}
            >
              <Avatar name={user?.name || '?'} size={26} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', letterSpacing: '-.01em' }}>
                {user?.name?.split(' ')[0] || 'Usuário'}
              </span>
              <ChevronDown size={13} color="var(--text2)" />
            </button>
          }
          items={[
            { label: user?.name || '', icon: undefined, onClick: () => {}, style: { pointerEvents: 'none', opacity: 0.55 } },
            { label: user?.role || '', icon: 'Tag', onClick: () => {} },
            'divider',
            { label: 'Configurações', icon: 'Settings', onClick: () => navigate('/configuracoes') },
            { label: 'Sair', icon: 'LogOut', onClick: () => logout(), danger: true },
          ]}
        />
      </div>
    </header>
  );
}
