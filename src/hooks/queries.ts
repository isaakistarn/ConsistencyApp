/**
 * TanStack Query bindings for the local-first repositories. All queryFns read
 * from Dexie (fast, offline). Repositories/sync emit table-change events; the
 * bridge below invalidates affected queries so the UI stays live.
 */
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { onDataChange } from '@/services/db/events'
import { db } from '@/services/db/database'
import { notDeleted } from '@/services/db/repository'
import { listReminders } from '@/services/db/repositories/reminders'
import { listOccurrences } from '@/services/db/repositories/occurrences'
import { listCategories, listTimeBlocks } from '@/services/db/repositories/categories'
import { listAllDailyStats, listDailyStats } from '@/services/db/repositories/statistics'
import { listRecentActivity } from '@/services/db/repositories/activity'
import {
  getPreferences,
  getProfile,
  getTelegramSettings,
} from '@/services/db/repositories/preferences'
import { resolveOccurrences } from '@/lib/recurrence/engine'
import type { ResolvedOccurrence, SyncTable } from '@/types'

/** Query-key prefixes affected by a change in each table. */
const AFFECTED: Record<SyncTable, string[]> = {
  categories: ['categories', 'resolved'],
  time_blocks: ['time_blocks', 'resolved'],
  reminders: ['reminders', 'resolved'],
  reminder_occurrences: ['occurrences', 'resolved'],
  completion_logs: ['activity'],
  daily_statistics: ['daily_stats'],
  activity_logs: ['activity'],
  user_preferences: ['preferences'],
  telegram_settings: ['telegram'],
  profiles: ['profile'],
}

/** Mount once: connects data-layer change events to query invalidation. */
export function useQueryInvalidationBridge(): void {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onDataChange((tables) => {
        const prefixes = new Set(tables.flatMap((t) => AFFECTED[t] ?? []))
        for (const prefix of prefixes) {
          void queryClient.invalidateQueries({ queryKey: [prefix] })
        }
      }),
    [queryClient]
  )
}

const local = { staleTime: 30_000, gcTime: 5 * 60_000 }

export function useReminders() {
  return useQuery({ queryKey: ['reminders'], queryFn: listReminders, ...local })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: listCategories, ...local })
}

export function useTimeBlocks() {
  return useQuery({ queryKey: ['time_blocks'], queryFn: listTimeBlocks, ...local })
}

/**
 * The workhorse: resolved (virtual + override-merged) occurrences for a date
 * window — dashboard, calendar and lists all render from this.
 */
export function useResolvedRange(
  fromIso: string,
  toIso: string,
  options: { includeSkipped?: boolean } = {}
) {
  return useQuery<ResolvedOccurrence[]>({
    queryKey: ['resolved', fromIso, toIso, options.includeSkipped ?? false],
    queryFn: async () => {
      const [reminders, overrides] = await Promise.all([
        listReminders(),
        listOccurrences(fromIso, toIso),
      ])
      return resolveOccurrences(reminders, overrides, fromIso, toIso, {
        includeSkipped: options.includeSkipped,
      })
    },
    ...local,
    staleTime: 10_000,
  })
}

export function useDailyStats(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['daily_stats', fromIso, toIso],
    queryFn: () => listDailyStats(fromIso, toIso),
    ...local,
  })
}

export function useAllDailyStats() {
  return useQuery({
    queryKey: ['daily_stats', 'all'],
    queryFn: listAllDailyStats,
    ...local,
  })
}

export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: () => listRecentActivity(limit),
    ...local,
  })
}

export function usePreferences() {
  return useQuery({ queryKey: ['preferences'], queryFn: getPreferences, ...local })
}

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: getProfile, ...local })
}

export function useTelegramSettings() {
  return useQuery({ queryKey: ['telegram'], queryFn: getTelegramSettings, ...local })
}

export function useCompletionLogs() {
  return useQuery({
    queryKey: ['activity', 'completion_logs'],
    queryFn: async () => notDeleted(await db.completion_logs.toArray()),
    ...local,
  })
}
