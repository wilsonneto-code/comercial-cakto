import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Ativacoes from './pages/Ativacoes'
import Ranking from './pages/Ranking'
import Responsaveis from './pages/Responsaveis'
import Formularios from './pages/Formularios'
import Estoque from './pages/Estoque'
import Agenda from './pages/Agenda'
import RelatoriosCalls from './pages/RelatoriosCalls'
import RelatorioDataCrazy from './pages/RelatorioDataCrazy'
import GerenteContas from './pages/GerenteContas'
import Dashboards from './pages/Dashboards'
import Configuracoes from './pages/Configuracoes'
import DashboardTime from './pages/DashboardTime'
import DashboardLifetime from './pages/DashboardLifetime'
import PublicForm from './pages/PublicForm'
import Pagamentos from './pages/Pagamentos'
import Carteiras from './pages/Carteiras'
import DashboardGC from './pages/DashboardGC'
import DashboardClosers from './pages/DashboardClosers'
import DebugMb from './pages/DebugMb'
import GCAtivacoes from './pages/GCAtivacoes'
import DashboardTarefasGC from './pages/DashboardTarefasGC'
import GCTaskAlert from './components/GCTaskAlert'
import PreviewBanner from './components/PreviewBanner'
import PlanoCarreira from './pages/PlanoCarreira'
import { Sidebar } from '../components/Sidebar'
import { SidebarProvider } from '../lib/sidebarContext'

const MAIN_DOMAINS = [
  'localhost',
  'comercialcakto.site',
  'www.comercialcakto.site',
  'caktocomercial.site',
  'www.caktocomercial.site',
  'comercial-cakto.vercel.app',
]

const SOCIO_ALLOWED = ['/', '/relatorio-calls', '/dashboards', '/dashboard/', '/metabase', '/ranking', '/plano-carreira', '/login']

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0D0D0B', gap: 16,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: 'linear-gradient(145deg, #3D7044 0%, #2F5733 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 24px rgba(47,87,51,.5)',
        animation: 'pulse 2s ease-in-out infinite',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E2CFB7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
        </svg>
      </div>
      <span style={{ fontSize: 13, color: '#7A6E62', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500 }}>
        Carregando…
      </span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />

  // Sócio sem Admin: só pode acessar páginas permitidas
  const isSocioOnly = user.role === 'Sócio' && !['Admin'].includes(user.role) && !(user.extra_roles ?? []).includes('Admin')
  if (isSocioOnly && !SOCIO_ALLOWED.some(p => pathname.startsWith(p))) {
    return <Navigate to="/relatorio-calls" replace />
  }

  return <>{children}</>
}

export default function App() {
  const hostname = window.location.hostname

  // Custom domain: bypass the entire panel and serve the public form directly
  if (!MAIN_DOMAINS.includes(hostname)) {
    return <PublicForm customDomain={hostname} />
  }

  return (
    <SidebarProvider>
    <>
    <Sidebar />
    <Routes>
      {/* ── Public routes ── */}
      <Route path="/login" element={<Login />} />
      <Route path="/f/:formId" element={<PublicForm />} />

      {/* ── Protected panel routes ── */}
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/ativacoes" element={<ProtectedRoute><Ativacoes /></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
      <Route path="/responsaveis" element={<ProtectedRoute><Responsaveis /></ProtectedRoute>} />
      <Route path="/formularios" element={<ProtectedRoute><Formularios /></ProtectedRoute>} />
      <Route path="/estoque" element={<ProtectedRoute><Estoque /></ProtectedRoute>} />
      <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
      <Route path="/relatorio-calls" element={<ProtectedRoute><RelatoriosCalls /></ProtectedRoute>} />
      <Route path="/dashboards" element={<ProtectedRoute><Dashboards /></ProtectedRoute>} />
      <Route path="/dashboard/time/:timeId" element={<ProtectedRoute><DashboardTime /></ProtectedRoute>} />
      <Route path="/dashboard/closers" element={<ProtectedRoute><DashboardClosers /></ProtectedRoute>} />
      <Route path="/dashboard/lifetime" element={<ProtectedRoute><DashboardLifetime /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
      <Route path="/relatorio-pipeline" element={<ProtectedRoute><RelatorioDataCrazy /></ProtectedRoute>} />
      <Route path="/gerente-contas" element={<ProtectedRoute><GerenteContas /></ProtectedRoute>} />
      <Route path="/gc-ativacoes" element={<ProtectedRoute><GCAtivacoes /></ProtectedRoute>} />
      <Route path="/pagamentos" element={<ProtectedRoute><Pagamentos /></ProtectedRoute>} />
      <Route path="/carteiras" element={<ProtectedRoute><Carteiras /></ProtectedRoute>} />
      <Route path="/metabase" element={<ProtectedRoute><Carteiras /></ProtectedRoute>} />
      <Route path="/dashboard-gc" element={<ProtectedRoute><DashboardGC /></ProtectedRoute>} />
      <Route path="/debug-mb" element={<ProtectedRoute><DebugMb /></ProtectedRoute>} />
      <Route path="/dashboard/tarefas-gc" element={<ProtectedRoute><DashboardTarefasGC /></ProtectedRoute>} />
      <Route path="/plano-carreira" element={<ProtectedRoute><PlanoCarreira /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <GCTaskAlert />
    <PreviewBanner />
    </>
    </SidebarProvider>
  )
}
