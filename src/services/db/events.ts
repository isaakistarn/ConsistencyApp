/**
 * Tiny event bus connecting the data layer to TanStack Query invalidation.
 * Repositories and the sync engine emit table names; the query layer listens
 * and refetches affected queries (from Dexie — fast and local).
 */
import type { SyncTable } from '@/types'

type Listener = (tables: SyncTable[]) => void

const listeners = new Set<Listener>()
let pending = new Set<SyncTable>()
let scheduled = false

export function onDataChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Emit change notifications, microtask-batched to coalesce bursts. */
export function emitDataChange(...tables: SyncTable[]): void {
  for (const t of tables) pending.add(t)
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    const batch = [...pending]
    pending = new Set()
    for (const listener of listeners) listener(batch)
  })
}
