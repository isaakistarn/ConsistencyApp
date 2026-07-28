import { create } from 'zustand'
import type { SyncStatus } from '@/types'

interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncedAt: string | null
  error: string | null
  setStatus: (status: SyncStatus, error?: string | null) => void
  setPendingCount: (n: number) => void
  setLastSyncedAt: (iso: string) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,
  setStatus: (status, error = null) => set({ status, error }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}))
