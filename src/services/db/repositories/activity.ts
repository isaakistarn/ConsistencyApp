import { db } from '@/services/db/database'
import { getCurrentUserId, notDeleted, upsertRow } from '@/services/db/repository'
import { newId, nowIso } from '@/lib/utils'
import type { ActivityLog } from '@/types'

export async function logActivity(
  type: string,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await upsertRow('activity_logs', {
    id: newId(),
    user_id: getCurrentUserId(),
    type,
    message,
    metadata,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  } satisfies ActivityLog)
}

export async function listRecentActivity(limit = 20): Promise<ActivityLog[]> {
  const rows = await db.activity_logs
    .orderBy('created_at')
    .reverse()
    .limit(limit * 2) // headroom for filtered tombstones
    .toArray()
  return notDeleted(rows).slice(0, limit)
}
