import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Players from './pages/Players'
import PlayerProfile from './pages/PlayerProfile'
import Members from './pages/Members'
import AuditLogs from './pages/AuditLogs'
import UnlinkedStaff from './pages/UnlinkedStaff'
import Permissions from './pages/Permissions'
import SquadGroups from './pages/SquadGroups'
import StatsTemplates from './pages/StatsTemplates'
import StatsTemplateEditor from './pages/StatsTemplateEditor'
import Seeding from './pages/Seeding'
import SeedingSession from './pages/SeedingSession'
import DutyStats from './pages/DutyStats'
import DutySettings from './pages/DutySettings'
import InfoButtons from './pages/InfoButtons'
import Settings from './pages/Settings'
import Connections from './pages/Connections'
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

// Redirect component for whitelist/:steamid64 -> players/:steamid64
function WhitelistRedirect() {
  const { steamid64 } = useParams()
  return <Navigate to={`/players/${steamid64}`} replace />
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
          <Route path="players" element={<Players />} />
          <Route path="players/:steamid64" element={<PlayerProfile />} />
          {/* Backward compatibility redirects */}
          <Route path="whitelist" element={<Navigate to="/players" replace />} />
          <Route path="whitelist/:steamid64" element={<WhitelistRedirect />} />
          <Route path="members" element={<Members />} />
          {/* Legacy member detail route - redirect to members list */}
          <Route path="members/:discordId" element={<Navigate to="/members" replace />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="security/unlinked-staff" element={<UnlinkedStaff />} />
          <Route path="admin/permissions" element={<Permissions />} />
          <Route path="admin/squadgroups" element={<SquadGroups />} />
          <Route path="admin/stats-templates" element={<StatsTemplates />} />
          <Route path="admin/stats-templates/:id" element={<StatsTemplateEditor />} />
          <Route path="seeding" element={<Seeding />} />
          <Route path="seeding/:id" element={<SeedingSession />} />
          <Route path="duty" element={<DutyStats />} />
          <Route path="admin/duty-settings" element={<DutySettings />} />
          <Route path="admin/info-buttons" element={<InfoButtons />} />
          <Route path="admin/connections" element={<Connections />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
