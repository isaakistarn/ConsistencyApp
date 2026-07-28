/**
 * Sync engine — reconciles Dexie (local truth for the UI) with Supabase.
 *
 *  PUSH  outbox entries drain FIFO as upserts; ids are client-minted UUIDs so
 *        retries are idempotent (no duplicates possible by construction).
 *  PULL  incremental per table: rows with updated_at > watermark. Last-write-
 *        wins on server-authoritative updated_at; rows with a queued local
 *        edit are skipped (the local edit wins and pushes next).
 *  LIVE  realtime postgres_changes feed applies remote rows straight to Dexie.
 *
 * Deletions are tombstones (deleted_at) so they replicate like any edit.
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { db, getDeviceId, getMeta, setMeta } from '@/services/db/database'
import { emitDataChange } from '@/services/db/events'
import { setCurrentUserId } from '@/services/db/repository'
import { getSupabase, isSupabaseConfigured } from '@/services/supabase/client'
import { useSyncStore } from '@/store/sync'
import { nowIso } from '@/lib/utils'
import type { OutboxEntry, SyncTable } from '@/types'

const SYNC_TABLES: SyncTable[] = [
  'profiles',
  'user_preferences',
  'categories',
  'time_blocks',
  'reminders',
  'reminder_occurrences',
  'completion_logs',
  'daily_statistics',
  'activity_logs',
  'telegram_settings',
]

const PULL_INTERVAL_MS = 5 * 60_000
const MAX_PUSH_ATTEMPTS = 8

class SyncEngine {
  private userId: string | null = null
  private deviceId = ''
  private channel: RealtimeChannel | null = null
  private pullTimer: number | null = null
  private draining = false
  private started = false

  async start(userId: string): Promise<void> {
    if (!isSupabaseConfigured) return
    if (this.started && this.userId === userId) return
    await this.stop()

    this.userId = userId
    this.deviceId = await getDeviceId()
    this.started = true
    setCurrentUserId(userId)

    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)

    await this.adoptLocalRows(userId)
    await this.refreshPendingCount()
    await this.syncNow()
    this.subscribeRealtime()

    this.pullTimer = window.setInterval(() => void this.syncNow(), PULL_INTERVAL_MS)
  }

  async stop(): Promise<void> {
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    if (this.pullTimer) window.clearInterval(this.pullTimer)
    this.pullTimer = null
    if (this.channel) {
      await this.channel.unsubscribe()
      this.channel = null
    }
    this.started = false
    this.userId = null
  }

  private handleOnline = () => {
    useSyncStore.getState().setStatus('syncing')
    void this.syncNow()
  }

  private handleOffline = () => {
    useSyncStore.getState().setStatus('offline')
  }

  /** Full cycle: push outbox, then pull all tables. */
  async syncNow(): Promise<void> {
    if (!this.started || !this.userId) return
    const store = useSyncStore.getState()
    if (!navigator.onLine) {
      store.setStatus('offline')
      return
    }
    store.setStatus('syncing')
    try {
      await this.drainOutbox()
      await this.pullAll()
      store.setStatus('idle')
      store.setLastSyncedAt(nowIso())
    } catch (err) {
      store.setStatus('error', err instanceof Error ? err.message : String(err))
    }
    await this.refreshPendingCount()
  }

  // -------------------------------------------------------------------------
  // Push
  // -------------------------------------------------------------------------

  private async drainOutbox(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      const supabase = getSupabase()
      // FIFO preserves causal order (e.g. reminder before its occurrence).
      for (;;) {
        const entry = await db.outbox.orderBy('seq').first()
        if (!entry) break
        try {
          const payload = { ...entry.payload, user_id: this.userId }
          const { error } = await supabase
            .from(entry.table)
            .upsert(payload, { onConflict: primaryKeyOf(entry.table) })
          if (error) throw new Error(`${entry.table}: ${error.message}`)
          await db.outbox.delete(entry.seq!)
        } catch (err) {
          await this.handlePushFailure(entry, err)
          throw err // stop draining; order must be preserved
        }
      }
    } finally {
      this.draining = false
    }
  }

  private async handlePushFailure(entry: OutboxEntry, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err)
    const attempts = entry.attempts + 1
    // Permanent failures (constraint/validation) would wedge the queue forever:
    // dead-letter them to the server-side sync_queue for diagnostics.
    const permanent =
      attempts >= MAX_PUSH_ATTEMPTS || /violates|invalid|constraint|denied/i.test(message)
    if (permanent) {
      try {
        await getSupabase().from('sync_queue').insert({
          user_id: this.userId,
          device_id: this.deviceId,
          table_name: entry.table,
          op: entry.op,
          payload: entry.payload,
          error: message,
        })
      } catch {
        // Even the dead-letter write failed (offline) — keep the entry local.
        await db.outbox.update(entry.seq!, { attempts, last_error: message })
        return
      }
      await db.outbox.delete(entry.seq!)
    } else {
      await db.outbox.update(entry.seq!, { attempts, last_error: message })
    }
  }

  // -------------------------------------------------------------------------
  // Pull
  // -------------------------------------------------------------------------

  private async pullAll(): Promise<void> {
    for (const table of SYNC_TABLES) {
      await this.pullTable(table)
    }
  }

  private async pullTable(table: SyncTable): Promise<void> {
    const supabase = getSupabase()
    const watermarkKey = `pulled:${table}:${this.userId}`
    const since = (await getMeta(watermarkKey)) ?? '1970-01-01T00:00:00Z'

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(1000)

    if (error) throw new Error(`pull ${table}: ${error.message}`)
    if (!data || data.length === 0) return

    // Rows with a queued local edit are skipped: the local version wins and
    // will push (gaining a newer server updated_at) right after.
    const pendingIds = new Set(
      (await db.outbox.toArray()).filter((e) => e.table === table).map((e) => e.row_id)
    )

    let applied = 0
    for (const row of data) {
      const key = rowKeyValue(table, row)
      if (pendingIds.has(key)) continue
      await db.table(table).put(row)
      applied++
    }

    const last = data[data.length - 1] as { updated_at?: string }
    if (last?.updated_at) await setMeta(watermarkKey, last.updated_at)
    if (applied > 0) emitDataChange(table)
    // Page through backlogs larger than the limit.
    if (data.length === 1000) await this.pullTable(table)
  }

  // -------------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------------

  private subscribeRealtime(): void {
    const supabase = getSupabase()
    this.channel = supabase
      .channel(`db-changes-${this.deviceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => void this.applyRealtime(payload)
      )
      .subscribe()
  }

  private async applyRealtime(payload: {
    table: string
    eventType: string
    new: Record<string, unknown>
    old: Record<string, unknown>
  }): Promise<void> {
    const table = payload.table as SyncTable
    if (!SYNC_TABLES.includes(table)) return

    if (payload.eventType === 'DELETE') {
      const key = rowKeyValue(table, payload.old)
      if (key) await db.table(table).delete(key)
      emitDataChange(table)
      return
    }

    const row = payload.new
    if (!row) return
    const key = rowKeyValue(table, row)

    // Skip if a local edit is queued for this row (local wins until pushed).
    const pending = (await db.outbox.toArray()).some(
      (e) => e.table === table && e.row_id === key
    )
    if (pending) return

    // LWW: only apply if not older than what we already have.
    const local = (await db.table(table).get(key)) as { updated_at?: string } | undefined
    if (
      local?.updated_at &&
      typeof row.updated_at === 'string' &&
      row.updated_at < local.updated_at
    ) {
      return
    }
    await db.table(table).put(row)
    emitDataChange(table)
  }

  // -------------------------------------------------------------------------
  // Local-only data adoption (offline-first sign-in)
  // -------------------------------------------------------------------------

  /** Re-stamp rows created before sign-in ('local' user) and queue pushes. */
  private async adoptLocalRows(userId: string): Promise<void> {
    for (const table of SYNC_TABLES) {
      const rows = (await db.table(table).toArray()) as Record<string, unknown>[]
      const locals = rows.filter((r) => r.user_id === 'local')
      for (const row of locals) {
        const adopted = { ...row, user_id: userId, updated_at: nowIso() }
        await db.transaction('rw', [db.table(table), db.outbox], async () => {
          // Keyed-by-user tables change primary key when adopted.
          if (table === 'user_preferences' || table === 'telegram_settings') {
            await db.table(table).delete('local')
          }
          if (table === 'profiles') await db.table(table).delete('local')
          if (table === 'profiles') {
            ;(adopted as Record<string, unknown>).id = userId
          }
          await db.table(table).put(adopted)
          await db.outbox.add({
            table,
            op: 'upsert',
            row_id: rowKeyValue(table, adopted),
            payload: adopted,
            queued_at: nowIso(),
            attempts: 0,
          })
        })
      }
      if (locals.length > 0) emitDataChange(table)
    }
  }

  private async refreshPendingCount(): Promise<void> {
    useSyncStore.getState().setPendingCount(await db.outbox.count())
  }
}

function primaryKeyOf(table: SyncTable): string {
  return table === 'user_preferences' || table === 'telegram_settings' ? 'user_id' : 'id'
}

function rowKeyValue(table: SyncTable, row: Record<string, unknown>): string {
  return String(row[primaryKeyOf(table)] ?? '')
}

export const syncEngine = new SyncEngine()
