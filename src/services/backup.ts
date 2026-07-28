/**
 * Backup / restore: JSON export of every user table, and an import that
 * validates the envelope and re-queues everything for sync.
 */
import { z } from 'zod'
import { db } from '@/services/db/database'
import { emitDataChange } from '@/services/db/events'
import { getCurrentUserId } from '@/services/db/repository'
import { nowIso } from '@/lib/utils'
import type { SyncTable } from '@/types'

const EXPORT_TABLES: SyncTable[] = [
  'categories',
  'time_blocks',
  'reminders',
  'reminder_occurrences',
  'completion_logs',
  'daily_statistics',
  'activity_logs',
  'user_preferences',
]

const envelopeSchema = z.object({
  app: z.literal('consistency'),
  version: z.literal(1),
  exported_at: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
})

export type BackupEnvelope = z.infer<typeof envelopeSchema>

export async function exportBackup(): Promise<Blob> {
  const tables: Record<string, unknown[]> = {}
  for (const table of EXPORT_TABLES) {
    tables[table] = await db.table(table).toArray()
  }
  const envelope: BackupEnvelope = {
    app: 'consistency',
    version: 1,
    exported_at: nowIso(),
    tables: tables as BackupEnvelope['tables'],
  }
  return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
}

export function downloadBackup(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `consistency-backup-${nowIso().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ImportResult {
  imported: number
  skipped: number
}

/**
 * Restore from a backup file. Rows are re-stamped to the current user and
 * queued for sync. Existing rows with the same id are only overwritten when
 * the backup row is newer (safe merge, never destructive by default).
 */
export async function importBackup(file: File): Promise<ImportResult> {
  const raw: unknown = JSON.parse(await file.text())
  const parsed = envelopeSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('Not a valid Consistency backup file.')
  }

  const userId = getCurrentUserId()
  let imported = 0
  let skipped = 0

  for (const table of EXPORT_TABLES) {
    const rows = parsed.data.tables[table] ?? []
    for (const row of rows) {
      const keyField =
        table === 'user_preferences' || table === 'telegram_settings' ? 'user_id' : 'id'
      const incoming = {
        ...row,
        user_id: userId,
        ...(keyField === 'user_id' ? { user_id: userId } : {}),
      } as Record<string, unknown>
      if (keyField === 'user_id') incoming.user_id = userId

      const key = String(incoming[keyField] ?? '')
      if (!key) {
        skipped++
        continue
      }
      const existing = (await db.table(table).get(key)) as
        { updated_at?: string } | undefined
      if (
        existing?.updated_at &&
        typeof incoming.updated_at === 'string' &&
        incoming.updated_at <= existing.updated_at
      ) {
        skipped++
        continue
      }
      incoming.updated_at = nowIso()
      await db.transaction('rw', [db.table(table), db.outbox], async () => {
        await db.table(table).put(incoming)
        await db.outbox.add({
          table,
          op: 'upsert',
          row_id: key,
          payload: incoming,
          queued_at: nowIso(),
          attempts: 0,
        })
      })
      imported++
    }
    emitDataChange(table)
  }
  return { imported, skipped }
}
