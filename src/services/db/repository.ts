/**
 * Generic write path for syncable rows. Every mutation:
 *   1. writes the row to Dexie (UI reads see it immediately),
 *   2. appends an outbox entry in the SAME transaction (atomic — a crash can
 *      never leave a change that won't sync),
 *   3. emits a change event (query invalidation).
 */
import { db } from '@/services/db/database'
import { emitDataChange } from '@/services/db/events'
import type { SyncTable } from '@/types'
import { nowIso } from '@/lib/utils'

/**
 * The signed-in user's id, stamped onto every row. Falls back to 'local'
 * before authentication (local-only mode); rows are re-stamped and pushed on
 * first sign-in (see sync engine `adoptLocalRows`).
 */
let currentUserId = 'local'

export function setCurrentUserId(id: string): void {
  currentUserId = id
}

export function getCurrentUserId(): string {
  return currentUserId
}

type AnyRow = { id?: string; user_id?: string }

export async function upsertRow<T extends AnyRow>(
  table: SyncTable,
  row: T,
  { sync = true }: { sync?: boolean } = {}
): Promise<T> {
  const stamped = {
    ...row,
    user_id: row.user_id ?? currentUserId,
    updated_at: nowIso(),
  } as T

  await db.transaction('rw', [db.table(table), db.outbox], async () => {
    await db.table(table).put(stamped)
    if (sync) {
      await db.outbox.add({
        table,
        op: 'upsert',
        row_id: rowKey(table, stamped),
        payload: stamped as unknown as Record<string, unknown>,
        queued_at: nowIso(),
        attempts: 0,
      })
    }
  })
  emitDataChange(table)
  return stamped
}

/**
 * Soft delete: set deleted_at (tombstone) and push. Tombstones replicate the
 * deletion to other devices, then get filtered from every read.
 */
export async function softDeleteRow(table: SyncTable, id: string): Promise<void> {
  const existing = (await db.table(table).get(id)) as AnyRow | undefined
  if (!existing) return
  const stamped = { ...existing, deleted_at: nowIso(), updated_at: nowIso() }
  await db.transaction('rw', [db.table(table), db.outbox], async () => {
    await db.table(table).put(stamped)
    await db.outbox.add({
      table,
      op: 'upsert', // tombstone travels as an upsert with deleted_at set
      row_id: id,
      payload: stamped as unknown as Record<string, unknown>,
      queued_at: nowIso(),
      attempts: 0,
    })
  })
  emitDataChange(table)
}

/** Primary-key value for outbox bookkeeping (most tables: id). */
function rowKey(table: SyncTable, row: AnyRow): string {
  if (table === 'user_preferences' || table === 'telegram_settings') {
    return String(row.user_id)
  }
  return String(row.id)
}

/** Live rows only (tombstones filtered). */
export function notDeleted<T extends { deleted_at?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted_at)
}
