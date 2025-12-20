import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { connect, disconnect, onServerStatus, requestServerStatus, isConnected } from '../lib/socket'
import type { ServerStatus, ServerStatusResponse, ServerStatusUpdate } from '../types/servers'
import api from '../lib/api'

/**
 * Fetch server status via REST API
 */
async function fetchServerStatus(): Promise<ServerStatus[]> {
  const { data } = await api.get<ServerStatusResponse>('/servers/status')
  return data.data
}

/**
 * Hook for server status with real-time updates
 *
 * - Fetches initial data via REST API
 * - Subscribes to Socket.IO for real-time updates
 * - Falls back to polling if socket connection fails
 */
export function useServerStatus() {
  const { user } = useAuth()
  const [socketConnected, setSocketConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  // Initial fetch via React Query
  const {
    data: servers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['servers', 'status'],
    queryFn: fetchServerStatus,
    enabled: !!user,
    // Poll every 30 seconds as fallback if socket disconnected
    refetchInterval: socketConnected ? false : 30000,
    staleTime: 10000, // Consider data stale after 10 seconds
  })

  // State for real-time updates
  const [realtimeServers, setRealtimeServers] = useState<ServerStatus[] | null>(null)

  // Handle server status updates from socket
  const handleServerStatus = useCallback((data: ServerStatusUpdate) => {
    setRealtimeServers(data.servers)
    setLastUpdate(data.timestamp)
  }, [])

  // Setup socket connection
  useEffect(() => {
    if (!user) return

    // Connect to socket
    connect()

    // Check connection status
    const checkConnection = () => {
      setSocketConnected(isConnected())
    }

    // Subscribe to server status updates
    const unsubscribe = onServerStatus(handleServerStatus)

    // Check connection status periodically
    const intervalId = setInterval(checkConnection, 1000)
    checkConnection()

    return () => {
      unsubscribe()
      clearInterval(intervalId)
      disconnect()
    }
  }, [user, handleServerStatus])

  // Request fresh data when socket connects
  useEffect(() => {
    if (socketConnected) {
      requestServerStatus()
    }
  }, [socketConnected])

  // Prefer realtime data, fall back to initial fetch
  const currentServers = realtimeServers ?? servers ?? []

  return {
    servers: currentServers,
    isLoading: isLoading && !realtimeServers,
    error,
    socketConnected,
    lastUpdate,
    refresh: () => {
      if (socketConnected) {
        requestServerStatus()
      } else {
        refetch()
      }
    },
  }
}
