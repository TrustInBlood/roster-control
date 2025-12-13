import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Whitelist from './pages/Whitelist'
import WhitelistDetail from './pages/WhitelistDetail'
import AuditLogs from './pages/AuditLogs'
import UnlinkedStaff from './pages/UnlinkedStaff'
import AccessDenied from './pages/AccessDenied'

function ProtectedRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-discord-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Check if user has staff role
  if (!user.isStaff) {
    return <AccessDenied />
  }

  // Render the child routes only after auth is confirmed
  return <Outlet />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/access-denied" element={<AccessDenied />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="whitelist" element={<Whitelist />} />
          <Route path="whitelist/:steamid64" element={<WhitelistDetail />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="security/unlinked-staff" element={<UnlinkedStaff />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
