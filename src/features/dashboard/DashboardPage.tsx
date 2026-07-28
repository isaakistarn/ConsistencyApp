/**
 * Dashboard ("Today"): greeting + progress ring, streak/consistency stat
 * cards, today's schedule, overdue + upcoming lists, heatmap preview and
 * recent activity — the phone home screen of the app.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Flame,
  Percent,
  Plus,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/misc'
import { EmptyState } from '@/components/EmptyState'
import { OccurrenceItem } from '@/features/reminders/OccurrenceItem'
import { Heatmap } from '@/features/tracking/Heatmap'
import { StatCard } from '@/features/tracking/StatCards'
import {
  useAllDailyStats,
  useCategories,
  usePreferences,
  useProfile,
  useRecentActivity,
  useResolvedRange,
} from '@/hooks/queries'
import { useUiStore } from '@/store/ui'
import { computeConsistency, computeStreaks } from '@/lib/streaks'
import { addDaysIso, formatClock, humanDate, todayIso } from '@/lib/dates'

export default function DashboardPage() {
  const today = todayIso()
  const reduceMotion = useReducedMotion()
  const setQuickAddOpen = useUiStore((s) => s.setQuickAddOpen)

  const { data: profile } = useProfile()
  const { data: preferences } = usePreferences()
  const { data: categories = [] } = useCategories()
  const { data: allStats = [], isLoading: statsLoading } = useAllDailyStats()
  const { data: activity = [] } = useRecentActivity(8)

  // Overdue window (past week) + today + next 7 days in one query.
  const { data: windowOccurrences = [], isLoading } = useResolvedRange(
    addDaysIso(today, -7),
    addDaysIso(today, 7)
  )

  const todays = useMemo(
    () => windowOccurrences.filter((o) => o.occurrence_date === today),
    [windowOccurrences, today]
  )
  const overdue = useMemo(
    () =>
      windowOccurrences.filter(
        (o) => o.occurrence_date < today && o.status === 'pending'
      ),
    [windowOccurrences, today]
  )
  const upcoming = useMemo(
    () =>
      windowOccurrences
        .filter((o) => o.occurrence_date > today && o.status === 'pending')
        .slice(0, 5),
    [windowOccurrences, today]
  )

  const done = todays.filter((o) => o.status === 'completed').length
  const total = todays.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const streaks = useMemo(() => computeStreaks(allStats, today), [allStats, today])
  const last30 = useMemo(
    () => computeConsistency(allStats.filter((s) => s.date >= addDaysIso(today, -29))),
    [allStats, today]
  )

  const timeFormat = preferences?.time_format ?? '24h'
  const firstName = profile?.display_name?.split(' ')[0]

  return (
    <div className="space-y-6">
      {/* Day card — greeting, progress ring, streak chip */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        aria-label="Today's progress"
        className="relative overflow-hidden rounded-3xl p-6"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in oklab, var(--primary) 26%, var(--card)) 0%, color-mix(in oklab, var(--primary) 8%, var(--card)) 55%, var(--card) 100%)',
        }}
      >
        {/* soft ambient shapes */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-8 h-40 w-40 rounded-full"
          style={{ background: 'color-mix(in oklab, var(--primary) 14%, transparent)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-14 right-24 h-32 w-32 rounded-full"
          style={{ background: 'color-mix(in oklab, var(--primary) 9%, transparent)' }}
        />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl leading-tight font-black tracking-tight">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </h2>
            <p className="text-foreground/75 mt-1.5 text-sm font-semibold">
              {total === 0
                ? 'Nothing scheduled — enjoy the space.'
                : done === total
                  ? 'Everything done. Beautiful day. 🎉'
                  : `${done} of ${total} done · ${insight(pct, streaks.current)}`}
            </p>
            {streaks.current > 0 ? (
              <span
                className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold"
                style={{
                  background: 'color-mix(in oklab, var(--tone-honey) 22%, transparent)',
                  color: 'var(--tone-honey)',
                }}
              >
                <Flame className="h-3.5 w-3.5" aria-hidden />
                {streaks.current}-day streak
              </span>
            ) : null}
          </div>
          <ProgressRing value={pct} label={`${pct}%`} />
        </div>
      </motion.section>

      {/* Stat cards */}
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Statistics summary"
      >
        <StatCard
          icon={Flame}
          label="Current streak"
          value={streaks.current}
          hint={streaks.current === 1 ? 'day' : 'days'}
          tone="coral"
          accent={streaks.current > 0}
          index={0}
        />
        <StatCard
          icon={Trophy}
          label="Longest streak"
          value={streaks.longest}
          hint={streaks.longest === 1 ? 'day' : 'days'}
          tone="honey"
          index={1}
        />
        <StatCard
          icon={Percent}
          label="Consistency"
          value={`${last30.completionRate}%`}
          hint="last 30 days"
          tone="sage"
          index={2}
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={last30.totalCompleted}
          hint="last 30 days"
          tone="sky"
          index={3}
        />
      </section>

      {/* Overdue */}
      {overdue.length > 0 ? (
        <section aria-label="Overdue reminders">
          <SectionTitle
            title="Overdue"
            trailing={<span className="text-destructive text-xs">{overdue.length}</span>}
          />
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {overdue.map((o) => (
                <OccurrenceItem
                  key={o.key}
                  occurrence={o}
                  categories={categories}
                  timeFormat={timeFormat}
                  showDate
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      ) : null}

      {/* Today's schedule */}
      <section aria-label="Today's reminders">
        <SectionTitle
          title="Today"
          trailing={
            <Button variant="ghost" size="sm" onClick={() => setQuickAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          }
        />
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : todays.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="A clean slate"
            description="No reminders today. Add one, or enjoy the calm."
            action={
              <Button size="sm" onClick={() => setQuickAddOpen(true)}>
                <Plus /> New reminder
              </Button>
            }
            className="py-8"
          />
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {todays.map((o) => (
                <OccurrenceItem
                  key={o.key}
                  occurrence={o}
                  categories={categories}
                  timeFormat={timeFormat}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Upcoming */}
      {upcoming.length > 0 ? (
        <section aria-label="Upcoming reminders">
          <SectionTitle
            title="Upcoming"
            trailing={
              <Button variant="ghost" size="sm" asChild>
                <Link to="/reminders">
                  All <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
          <Card>
            <CardContent className="divide-y p-0">
              {upcoming.map((o) => (
                <div key={o.key} className="flex items-center gap-3 px-4 py-3">
                  <CalendarClock className="text-muted-foreground h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.reminder.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {humanDate(o.occurrence_date)}
                      {o.all_day ? '' : ` · ${formatClock(o.scheduled_at, timeFormat)}`}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Consistency preview */}
      <section aria-label="Consistency heatmap">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Consistency</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/progress">
                Details <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <Heatmap
                stats={allStats}
                weeks={26}
                weekStartsOn={preferences?.week_starts_on ?? 1}
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Recent activity */}
      {activity.length > 0 ? (
        <section aria-label="Recent activity">
          <SectionTitle title="Recent activity" />
          <Card>
            <CardContent className="divide-y p-0">
              {activity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Activity className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                  <p className="min-w-0 flex-1 truncate text-xs">{a.message}</p>
                  <time className="text-muted-foreground shrink-0 text-[11px]">
                    {relativeTime(a.created_at)}
                  </time>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

function SectionTitle({
  title,
  trailing,
}: {
  title: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="mb-2 flex h-8 items-center justify-between px-1">
      <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
      {trailing}
    </div>
  )
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const reduceMotion = useReducedMotion()
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div
      className="relative h-24 w-24 shrink-0"
      role="img"
      aria-label={`Today: ${label} complete`}
    >
      <svg viewBox="0 0 64 64" className="h-24 w-24 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={r}
          strokeWidth="7"
          fill="none"
          style={{ stroke: 'color-mix(in oklab, var(--primary) 18%, transparent)' }}
        />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          className="stroke-primary"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={
            reduceMotion
              ? { strokeDashoffset: c - (value / 100) * c }
              : { strokeDashoffset: c }
          }
          animate={{ strokeDashoffset: c - (value / 100) * c }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none font-black tabular-nums">{label}</span>
        <span className="text-foreground/60 mt-0.5 text-[10px] font-bold">today</span>
      </span>
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Late night focus'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function insight(pct: number, streak: number): string {
  if (pct >= 80) return 'strong finish ahead.'
  if (pct >= 50) return 'past halfway — keep going.'
  if (streak > 2) return `keep the ${streak}-day streak alive.`
  return 'small steps count.'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
