import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sun, Moon, ChevronDown, Tag, Settings, LogOut, Leaf } from 'lucide-react';
import { useTheme } from './ui/ThemeProvider';
import { Avatar } from './ui/Avatar';
import { Dropdown } from './ui/Dropdown';
import { useAuth, hasAnyRole } from '@/lib/authContext';

const NAV_ITEMS = [
  { key: 'responsaveis', label: 'Responsáveis' },
  { key: 'ativacoes',    label: 'Ativações' },
  { key: 'ranking',      label: 'Ranking' },
  { key: 'formularios',  label: 'Formulários' },
  { key: 'estoque',      label: 'Estoque' },
  { key: 'agenda',           label: 'Agenda' },
  { key: 'relatorio-calls',  label: 'Relatório de Calls' },
  { key: 'dashboards',       label: 'Dashboards' },
];

export function Header() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ddOpen, setDdOpen] = useState(false);

  const isSocio = hasAnyRole(user, ['Sócio']) && !hasAnyRole(user, ['Admin'])
  if (isSocio) {
    var nav = [
      { key: 'relatorio-calls', label: 'Relatório de Calls' },
      { key: 'dashboards',      label: 'Dashboards'         },
      { key: 'metabase',        label: 'MetaBase'           },
      { key: 'ranking',         label: 'Ranking'            },
      { key: 'plano-carreira',  label: 'Plano de Carreira'  },
    ]
  } else {
    var nav = [
      ...NAV_ITEMS,
      ...(hasAnyRole(user, ['Admin', 'Gerente de Contas']) ? [
        { key: 'gerente-contas',     label: 'Gerente de Contas' },
        { key: 'gc-ativacoes',       label: 'GC — Ativações' },
        { key: 'metabase',           label: 'MetaBase' },
        { key: 'relatorio-pipeline', label: 'Pipeline' },
      ] : []),
      ...(hasAnyRole(user, ['Admin']) ? [
        { key: 'plano-carreira', label: 'Plano de Carreira' },
        { key: 'pagamentos',    label: 'Pagamentos'    },
        { key: 'configuracoes', label: 'Configurações' },
      ] : [
        { key: 'pagamentos',    label: 'Pagamentos'    },
      ]),
    ]
  }

  const { isPreview } = useAuth();
  const BANNER_H = isPreview ? 36 : 0;
  const isActive = (key: string) => pathname === `/${key}`;

  const navLinkStyle = (key: string): React.CSSProperties => ({
    position: 'relative',
    display: 'flex', alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    color: isActive(key) ? 'var(--text)' : 'var(--text2)',
    background: 'transparent',
    transition: 'color .18s',
    border: 'none', fontFamily: 'inherit',
    letterSpacing: '-.01em',
  });

  return (
    <header style={{
      position: 'fixed', top: BANNER_H, left: 0, right: 0, zIndex: 50, height: 62,
      background: 'var(--header-bg)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 24px', gap: 0,
    }}>

      {/* Linha de acento verde no topo */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
        background: 'linear-gradient(90deg, transparent 0%, var(--action) 35%, rgba(77,140,85,.6) 50%, var(--action) 65%, transparent 100%)',
        opacity: .6,
      }} />

      {/* ── Logo ── */}
      <button
        onClick={() => navigate('/')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none',
          border: 'none', cursor: 'pointer', flexShrink: 0, marginRight: 20, padding: '4px 0' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'linear-gradient(145deg, #3D7044 0%, #2F5733 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(47,87,51,.50)',
          flexShrink: 0,
        }}>
          <Leaf size={15} color="#E2CFB7" strokeWidth={2.2} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1 }}>
          <span style={{
            fontSize: 14, fontWeight: 800, letterSpacing: '-.025em',
            background: 'linear-gradient(135deg, #E2CFB7 0%, #C4AF98 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Comercial
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
            color: 'var(--action)', marginTop: 1,
          }}>
            Cakto
          </span>
        </div>
      </button>

      {/* Separador */}
      <div style={{ width: 1, height: 22, background: 'var(--border)', marginRight: 18, flexShrink: 0 }} />

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', gap: 0, flex: 1,
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {nav.map(n => (
          <button
            key={n.key}
            style={navLinkStyle(n.key)}
            onClick={() => navigate(`/${n.key}`)}
            onMouseEnter={e => {
              if (!isActive(n.key)) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              if (!isActive(n.key)) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)';
            }}
          >
            {n.label}
            {/* Indicador ativo */}
            {isActive(n.key) && (
              <span style={{
                position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)',
                width: '60%', height: 2, borderRadius: 99,
                background: 'var(--action)',
                boxShadow: '0 0 8px var(--action-glow)',
              }} />
            )}
          </button>
        ))}
      </nav>

      {/* ── Right side ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
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
