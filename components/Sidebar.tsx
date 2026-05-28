import { useNavigate, useLocation } from 'react-router-dom'
import {
  Users, Zap, Trophy, FileText, Package, Calendar, Phone,
  LayoutDashboard, Briefcase, Target, Database, GitMerge,
  TrendingUp, CreditCard, Settings, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useSidebar } from '@/lib/sidebarContext'
import { useAuth, hasAnyRole } from '@/lib/authContext'

type NavItem = { key: string; label: string; Icon: React.ElementType }

const ALL_ITEMS: NavItem[] = [
  { key: 'responsaveis',       label: 'Responsáveis',        Icon: Users          },
  { key: 'ativacoes',          label: 'Ativações',           Icon: Zap            },
  { key: 'ranking',            label: 'Ranking',             Icon: Trophy         },
  { key: 'formularios',        label: 'Formulários',         Icon: FileText       },
  { key: 'estoque',            label: 'Estoque',             Icon: Package        },
  { key: 'agenda',             label: 'Agenda',              Icon: Calendar       },
  { key: 'relatorio-calls',    label: 'Relatório de Calls',  Icon: Phone          },
  { key: 'dashboards',         label: 'Dashboards',          Icon: LayoutDashboard},
  { key: 'gerente-contas',     label: 'Gerente de Contas',   Icon: Briefcase      },
  { key: 'gc-ativacoes',       label: 'GC — Ativações',      Icon: Target         },
  { key: 'metabase',           label: 'MetaBase',            Icon: Database       },
  { key: 'relatorio-pipeline', label: 'Pipeline',            Icon: GitMerge       },
  { key: 'plano-carreira',     label: 'Plano de Carreira',   Icon: TrendingUp     },
  { key: 'pagamentos',         label: 'Pagamentos',          Icon: CreditCard     },
  { key: 'configuracoes',      label: 'Configurações',       Icon: Settings       },
]

export function Sidebar() {
  const { open, toggle } = useSidebar()
  const { user, isPreview } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isSocio = hasAnyRole(user, ['Sócio']) && !hasAnyRole(user, ['Admin'])
  const isAdmin = hasAnyRole(user, ['Admin'])
  const isGC    = hasAnyRole(user, ['Admin', 'Gerente de Contas'])

  let visibleKeys: string[]
  if (isSocio) {
    visibleKeys = ['relatorio-calls', 'dashboards', 'metabase', 'ranking', 'plano-carreira']
  } else {
    visibleKeys = [
      'responsaveis', 'ativacoes', 'ranking', 'formularios',
      'estoque', 'agenda', 'relatorio-calls', 'dashboards',
      ...(isGC    ? ['gerente-contas', 'gc-ativacoes', 'metabase', 'relatorio-pipeline'] : []),
      ...(isAdmin ? ['plano-carreira', 'configuracoes'] : []),
      'pagamentos',
    ]
  }

  const items = ALL_ITEMS.filter(i => visibleKeys.includes(i.key))
  const topOffset = isPreview ? 98 : 62

  const isActive = (key: string) => pathname === `/${key}`

  return (
    <aside style={{
      position: 'fixed',
      top: topOffset,
      left: 0,
      bottom: 0,
      width: open ? 220 : 56,
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 40,
      transition: 'width .25s cubic-bezier(.22,1,.36,1)',
      overflow: 'hidden',
    }}>

      {/* Items list */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0' }}>
        {items.map(({ key, label, Icon }) => {
          const active = isActive(key)
          return (
            <button
              key={key}
              title={!open ? label : undefined}
              onClick={() => navigate(`/${key}`)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: open ? '9px 14px' : '9px 0',
                justifyContent: open ? 'flex-start' : 'center',
                border: 'none',
                background: active
                  ? 'rgba(77, 140, 85, 0.15)'
                  : 'transparent',
                borderLeft: active ? '3px solid var(--action)' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background .15s, color .15s',
                borderRadius: open ? '0 8px 8px 0' : 0,
                marginRight: open ? 8 : 0,
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card2)'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <Icon
                size={17}
                color={active ? 'var(--action)' : 'var(--text2)'}
                style={{ flexShrink: 0 }}
              />
              {open && (
                <span style={{
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--text)' : 'var(--text2)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-.01em',
                }}>
                  {label}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Toggle button */}
      <button
        onClick={toggle}
        title={open ? 'Recolher menu' : 'Expandir menu'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px',
          borderTop: '1px solid var(--border)',
          border: 'none',
          borderTopWidth: 1,
          borderTopStyle: 'solid' as const,
          borderTopColor: 'var(--border)',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text2)',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          transition: 'color .15s, background .15s',
          width: '100%',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card2)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)'
        }}
      >
        {open
          ? <><ChevronLeft size={15} /><span>Recolher</span></>
          : <ChevronRight size={15} />
        }
      </button>
    </aside>
  )
}
