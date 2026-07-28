import { db } from '@/services/db/database'
import {
  getCurrentUserId,
  notDeleted,
  softDeleteRow,
  upsertRow,
} from '@/services/db/repository'
import { newId, nowIso } from '@/lib/utils'
import type { Category, TimeBlock } from '@/types'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const rows = notDeleted(await db.categories.toArray())
  return rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export async function saveCategory(
  input: Partial<Category> & { name: string; color: string; icon: string }
): Promise<Category> {
  const existing = input.id ? await db.categories.get(input.id) : undefined
  const row: Category = {
    id: existing?.id ?? newId(),
    user_id: existing?.user_id ?? getCurrentUserId(),
    name: input.name,
    color: input.color,
    icon: input.icon,
    sort_order: input.sort_order ?? existing?.sort_order ?? 0,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  }
  return upsertRow('categories', row)
}

export async function deleteCategory(id: string): Promise<void> {
  await softDeleteRow('categories', id)
  // Detach reminders referencing it (mirrors the FK's on delete set null).
  const linked = await db.reminders.where('category_id').equals(id).toArray()
  for (const r of linked) {
    if (!r.deleted_at) await upsertRow('reminders', { ...r, category_id: null })
  }
}

// ---------------------------------------------------------------------------
// Time blocks
// ---------------------------------------------------------------------------

export async function listTimeBlocks(): Promise<TimeBlock[]> {
  const rows = notDeleted(await db.time_blocks.toArray())
  return rows.sort(
    (a, b) => a.start_time.localeCompare(b.start_time) || a.sort_order - b.sort_order
  )
}

export async function saveTimeBlock(
  input: Partial<TimeBlock> & {
    name: string
    start_time: string
    end_time: string
    days_of_week: number[]
  }
): Promise<TimeBlock> {
  const existing = input.id ? await db.time_blocks.get(input.id) : undefined
  const row: TimeBlock = {
    id: existing?.id ?? newId(),
    user_id: existing?.user_id ?? getCurrentUserId(),
    name: input.name,
    description: input.description ?? existing?.description ?? '',
    icon: input.icon ?? existing?.icon ?? 'clock',
    color: input.color ?? existing?.color ?? '#818cf8',
    start_time: input.start_time,
    end_time: input.end_time,
    days_of_week: input.days_of_week,
    sort_order: input.sort_order ?? existing?.sort_order ?? 0,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  }
  return upsertRow('time_blocks', row)
}

export async function deleteTimeBlock(id: string): Promise<void> {
  await softDeleteRow('time_blocks', id)
  const linked = await db.reminders.where('time_block_id').equals(id).toArray()
  for (const r of linked) {
    if (!r.deleted_at) await upsertRow('reminders', { ...r, time_block_id: null })
  }
}
