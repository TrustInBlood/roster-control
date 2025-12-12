import { ShieldX } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function AccessDenied() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-discord-dark flex items-center justify-center p-4">
      <div className="bg-discord-light rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-red-500/20 p-4 rounded-full">
            <ShieldX className="w-12 h-12 text-red-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-gray-400 mb-6">
          You must be a staff member to access the dashboard.
        </p>
        {user && (
          <p className="text-sm text-gray-500 mb-6">
            Logged in as <span className="text-white">{user.displayName}</span>
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={logout}
            className="w-full bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Log Out
          </button>
          <p className="text-xs text-gray-500">
            If you believe this is an error, please contact an administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
