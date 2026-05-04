import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Zap, Sun, Moon, ChevronDown, Tag, Settings, LogOut } from 'lucide-react';
import { useTheme } from './ui/ThemeProvider';
import { Avatar } from './ui/Avatar';
import { Dropdown } from './ui/Dropdown';
import { useAuth } from '@/lib/authContext';

const NAV_ITEMS = [
  { key: 'responsaveis', label: 'Responsáveis' },
  { key: 'ativacoes',    label: 'Ativações' },
  { key: 'ranking',      label: 'Ranking' },
  { key: 'formularios',  label: 'Formulários' },
  { key: 'estoque',      label: 'Estoque' },
  { key: 'agenda',       label: 'Agenda' },
  { key: 'dashboards',   label: 'Dashboards' },
];

export function Header() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ddOpen, setDdOpen] = useState(false);

  const nav = [
    ...NAV_ITEMS,
    ...(user?.role === 'Admin' ? [
      { key: 'pagamentos',    label: 'Pagamentos'    },
      { key: 'configuracoes', label: 'Configurações' },
    ] : []),
  ];

  const isActive = (key: string) => pathname === `/${key}`;

  const navLinkStyle = (key: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    color: isActive(key) ? 'var(--text)' : 'var(--text2)',
    background: isActive(key) ? 'var(--bg-card2)' : 'transparent',
    transition: 'all .15s', border: 'none', fontFamily: 'inherit',
  });

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 64,
      background: 'var(--header-bg)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
    }}>
      {/* Logo */}
      <button onClick={() => navigate('/')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
          cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8,
          background: 'linear-gradient(135deg,#2997FF,#BF5AF2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={16} color="#fff" />
        </div>
        <span className="logo-text" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em' }}>
          Comercial Cakto
        </span>
      </button>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden', marginLeft: 8 }}>
        {nav.map(n => (
          <button key={n.key} style={navLinkStyle(n.key)} onClick={() => navigate(`/${n.key}`)}
            onMouseEnter={e => { if (!isActive(n.key)) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { if (!isActive(n.key)) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)'; }}>
            {n.label}
          </button>
        ))}
      </nav>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={toggle} style={{ width: 34, height: 34, borderRadius: 8, border: 'none',
          background: 'var(--bg-card2)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', transition: 'all .15s' }}>
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <Dropdown
          open={ddOpen}
          onClose={() => setDdOpen(false)}
          trigger={
            <button onClick={() => setDdOpen(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card2)',
                border: '1px solid var(--border)', borderRadius: 10, padding: '4px 10px 4px 4px',
                cursor: 'pointer', fontFamily: 'inherit' }}>
              <Avatar name={user?.name || '?'} size={28} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {user?.name?.split(' ')[0] || 'Usuário'}
              </span>
              <ChevronDown size={14} color="var(--text2)" />
            </button>
          }
          items={[
            { label: user?.name || '', icon: undefined, onClick: () => {}, style: { pointerEvents: 'none', opacity: 0.6 } },
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
