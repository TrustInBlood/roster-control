import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null): string {
  if (!date) return 'N/A'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy')
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return 'N/A'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy h:mm a')
}

export function formatRelativeTime(date: string | Date | null): string {
  if (!date) return 'N/A'
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'permanent':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'expired':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'revoked':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

export function getSourceColor(source: string | null): string {
  switch (source) {
    case 'role':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    case 'manual':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'donation':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'import':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

export function truncateSteamId(steamid64: string): string {
  if (steamid64.length <= 10) return steamid64
  return `${steamid64.slice(0, 6)}...${steamid64.slice(-4)}`
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for non-secure contexts (HTTP)
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  } catch {
    return false
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'info':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'warn':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'error':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'critical':
      return 'bg-red-700/30 text-red-300 border-red-600/40'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

export function formatActionType(actionType: string): string {
  return actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}
