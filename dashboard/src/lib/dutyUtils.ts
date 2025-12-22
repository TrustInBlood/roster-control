/**
 * Format duration in milliseconds to human-readable string
 * @param ms Duration in milliseconds
 * @param compact If true, returns compact format (e.g., "2h 30m")
 * @returns Formatted duration string
 */
export function formatDuration(ms: number, compact = false): string {
  if (ms <= 0) return compact ? '0m' : '0 minutes'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const remainingHours = hours % 24
  const remainingMinutes = minutes % 60

  if (compact) {
    if (days > 0) {
      return `${days}d ${remainingHours}h`
    }
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`
    }
    return `${minutes}m`
  }

  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  }
  if (remainingHours > 0) {
    parts.push(`${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`)
  }
  if (remainingMinutes > 0 && days === 0) {
    parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`)
  }

  return parts.length > 0 ? parts.join(' ') : '0 minutes'
}

/**
 * Format duration with hours as decimal
 * @param ms Duration in milliseconds
 * @returns String like "12.5 hrs"
 */
export function formatDurationHours(ms: number): string {
  const hours = ms / (1000 * 60 * 60)
  if (hours < 0.1) {
    const minutes = Math.floor(ms / (1000 * 60))
    return `${minutes} min`
  }
  return `${hours.toFixed(1)} hrs`
}

/**
 * Get rank suffix (1st, 2nd, 3rd, etc.)
 */
export function getRankSuffix(rank: number): string {
  const j = rank % 10
  const k = rank % 100

  if (j === 1 && k !== 11) return `${rank}st`
  if (j === 2 && k !== 12) return `${rank}nd`
  if (j === 3 && k !== 13) return `${rank}rd`
  return `${rank}th`
}

/**
 * Get color class based on rank
 */
export function getRankColorClass(rank: number): string {
  switch (rank) {
    case 1: return 'text-yellow-400'
    case 2: return 'text-gray-300'
    case 3: return 'text-amber-600'
    default: return 'text-gray-400'
  }
}

/**
 * Get badge/medal for top 3 ranks
 */
export function getRankBadge(rank: number): string | null {
  switch (rank) {
    case 1: return '🥇'
    case 2: return '🥈'
    case 3: return '🥉'
    default: return null
  }
}
