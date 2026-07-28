/**
 * Reminders — searchable, filterable list of upcoming (and past) occurrences
 * grouped by day, plus a "Manage" tab of the underlying reminder series.
 */
import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  Archive,
  ArchiveRestore,
  Copy,
  Filter,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/EmptyState'
import { OccurrenceItem } from '@/features/reminders/OccurrenceItem'
import {
  useCategories,
  usePreferences,
  useReminders,
  useResolvedRange,
  useTimeBlocks,
} from '@/hooks/queries'
import { deleteReminderWithToast } from '@/features/reminders/actions'
import {
  duplicateReminder,
  setReminderArchived,
} from '@/services/db/repositories/reminders'
import { useUiStore } from '@/store/ui'
import { describeRecurrence } from '@/lib/recurrence/presets'
import { addDaysIso, humanDate, todayIso } from '@/lib/dates'
import { PRIORITIES, PRIORITY_ORDER } from '@/lib/constants'
import type { Priority, Reminder, ResolvedOccurrence } from '@/types'

type StatusFilter = 'all' | 'pending' | 'completed' | 'overdue'

export default function RemindersPage() {
  const today = todayIso()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [priorityFilter, setPriorityFilter] = useState<Set<Priority>>(new Set())
  const [blockFilter, setBlockFilter] = useState<Set<string>>(new Set())

  const { data: categories = [] } = useCategories()
  const { data: timeBlocks = [] } = useTimeBlocks()
  const { data: reminders = [] } = useReminders()
  const { data: preferences } = usePreferences()
  const setQuickAddOpen = useUiStore((s) => s.setQuickAddOpen)

  // Window: a week back (overdue context) to 30 days ahead.
  const from = addDaysIso(today, -7)
  const to = addDaysIso(today, 30)
  const { data: occurrences = [], isLoading } = useResolvedRange(from, to, {
    includeSkipped: true,
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return occurrences.filter((o) => {
      // Past days: only keep unfinished (overdue) items for context.
      if (o.occurrence_date < today && o.status !== 'pending') return false
      if (q) {
        const hay =
          `${o.reminder.title} ${o.reminder.description} ${o.reminder.notes}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (statusFilter === 'pending' && o.status !== 'pending') return false
      if (statusFilter === 'completed' && o.status !== 'completed') return false
      if (statusFilter === 'overdue' && !o.overdue) return false
      if (categoryFilter.size > 0) {
        if (!o.reminder.category_id || !categoryFilter.has(o.reminder.category_id))
          return false
      }
      if (priorityFilter.size > 0 && !priorityFilter.has(o.reminder.priority))
        return false
      if (blockFilter.size > 0) {
        if (!o.reminder.time_block_id || !blockFilter.has(o.reminder.time_block_id))
          return false
      }
      return true
    })
  }, [
    occurrences,
    query,
    statusFilter,
    categoryFilter,
    priorityFilter,
    blockFilter,
    today,
  ])

  const groups = useMemo(() => groupByDate(filtered), [filtered])
  const activeFilters =
    (statusFilter !== 'all' ? 1 : 0) +
    categoryFilter.size +
    priorityFilter.size +
    blockFilter.size

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reminders…"
            className="pl-9"
            aria-label="Search reminders"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="Filters" className="relative shrink-0">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filter</span>
              {activeFilters > 0 ? (
                <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center px-1">
                  {activeFilters}
                </Badge>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {(['all', 'pending', 'completed', 'overdue'] as const).map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={statusFilter === s}
                onCheckedChange={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'Everything' : s[0]!.toUpperCase() + s.slice(1)}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Priority</DropdownMenuLabel>
            {PRIORITIES.filter((p) => p.value !== 'none').map((p) => (
              <DropdownMenuCheckboxItem
                key={p.value}
                checked={priorityFilter.has(p.value)}
                onCheckedChange={() =>
                  setPriorityFilter((prev) => toggleSet(prev, p.value))
                }
              >
                {p.label}
              </DropdownMenuCheckboxItem>
            ))}
            {categories.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Category</DropdownMenuLabel>
                {categories.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={categoryFilter.has(c.id)}
                    onCheckedChange={() =>
                      setCategoryFilter((prev) => toggleSet(prev, c.id))
                    }
                  >
                    {c.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            ) : null}
            {timeBlocks.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Time block</DropdownMenuLabel>
                {timeBlocks.map((b) => (
                  <DropdownMenuCheckboxItem
                    key={b.id}
                    checked={blockFilter.has(b.id)}
                    onCheckedChange={() =>
                      setBlockFilter((prev) => toggleSet(prev, b.id))
                    }
                  >
                    {b.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="manage">Manage series</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-5">
          {isLoading ? null : groups.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title={query || activeFilters ? 'Nothing matches' : 'No reminders yet'}
              description={
                query || activeFilters
                  ? 'Try a different search or clear some filters.'
                  : 'Create your first reminder and start building consistency.'
              }
              action={
                !query && !activeFilters ? (
                  <Button size="sm" onClick={() => setQuickAddOpen(true)}>
                    <Plus /> New reminder
                  </Button>
                ) : undefined
              }
            />
          ) : (
            groups.map(([date, items]) => (
              <section key={date} aria-label={humanDate(date)}>
                <h2 className="mb-2 px-1 text-base font-extrabold tracking-tight">
                  {humanDate(date)}
                  <span className="text-muted-foreground ml-2 text-xs font-bold">
                    {items.filter((i) => i.status === 'completed').length}/{items.length}
                  </span>
                </h2>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {items.map((o) => (
                      <OccurrenceItem
                        key={o.key}
                        occurrence={o}
                        categories={categories}
                        timeFormat={preferences?.time_format ?? '24h'}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))
          )}
        </TabsContent>

        <TabsContent value="manage">
          <SeriesList reminders={reminders} query={query} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SeriesList({ reminders, query }: { reminders: Reminder[]; query: string }) {
  const setEditingReminderId = useUiStore((s) => s.setEditingReminderId)
  const q = query.trim().toLowerCase()
  const visible = reminders
    .filter((r) => !q || r.title.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.title.localeCompare(b.title)
    )

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No series"
        description="Recurring reminders you create appear here."
      />
    )
  }

  return (
    <div className="space-y-2">
      {visible.map((r) => (
        <div
          key={r.id}
          className="bg-card flex items-center gap-3 rounded-xl border px-3 py-2.5 shadow-sm"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: r.color ?? 'var(--primary)' }}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setEditingReminderId(r.id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-sm font-medium">
              {r.title}
              {r.archived_at ? (
                <Badge variant="muted" className="ml-2">
                  Archived
                </Badge>
              ) : null}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {describeRecurrence(r.rrule)}
              {r.reminder_time ? ` · ${r.reminder_time.slice(0, 5)}` : ' · All-day'}
            </p>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${r.title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingReminderId(r.id)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void duplicateReminder(r.id)}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void setReminderArchived(r.id, !r.archived_at)}
              >
                {r.archived_at ? (
                  <>
                    <ArchiveRestore /> Unarchive
                  </>
                ) : (
                  <>
                    <Archive /> Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => void deleteReminderWithToast(r)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  )
}

function groupByDate(
  occurrences: ResolvedOccurrence[]
): [string, ResolvedOccurrence[]][] {
  const map = new Map<string, ResolvedOccurrence[]>()
  for (const o of occurrences) {
    const list = map.get(o.occurrence_date) ?? []
    list.push(o)
    map.set(o.occurrence_date, list)
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
