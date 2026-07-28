/**
 * Progress — GitHub-style year heatmap, streak/consistency stat cards and
 * animated trend charts (weekly trend, best weekdays, category breakdown).
 */
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Flame,
  Medal,
  Percent,
  Star,
  Trophy,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { Heatmap } from '@/features/tracking/Heatmap'
import { StatCard } from '@/features/tracking/StatCards'
import {
  useAllDailyStats,
  useCategories,
  useCompletionLogs,
  usePreferences,
  useReminders,
} from '@/hooks/queries'
import { computeConsistency, computeStreaks } from '@/lib/streaks'
import { addDaysIso, parseISO, todayIso } from '@/lib/dates'
import { format } from 'date-fns'
import { DAY_LABELS } from '@/lib/constants'
import type { Category, CompletionLog, DailyStatistic, Reminder } from '@/types'

export default function ProgressPage() {
  const today = todayIso()
  const { data: stats = [], isLoading } = useAllDailyStats()
  const { data: preferences } = usePreferences()
  const { data: categories = [] } = useCategories()
  const { data: reminders = [] } = useReminders()
  const { data: logs = [] } = useCompletionLogs()

  const streaks = useMemo(() => computeStreaks(stats, today), [stats, today])
  const range = { '30d': 30, '90d': 90, '1y': 365 }

  if (!isLoading && stats.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No data yet"
        description="Complete a few reminders and your progress will light up here."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Last 12 months</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap
            stats={stats}
            weeks={53}
            weekStartsOn={preferences?.week_starts_on ?? 1}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="30d">
        <TabsList>
          <TabsTrigger value="30d">30 days</TabsTrigger>
          <TabsTrigger value="90d">90 days</TabsTrigger>
          <TabsTrigger value="1y">Year</TabsTrigger>
        </TabsList>
        {(Object.keys(range) as (keyof typeof range)[]).map((key) => (
          <TabsContent key={key} value={key}>
            <RangeStats
              stats={stats}
              days={range[key]}
              today={today}
              streaks={streaks}
              logs={logs}
              reminders={reminders}
              categories={categories}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

interface RangeStatsProps {
  stats: DailyStatistic[]
  days: number
  today: string
  streaks: { current: number; longest: number }
  logs: CompletionLog[]
  reminders: Reminder[]
  categories: Category[]
}

function RangeStats({
  stats,
  days,
  today,
  streaks,
  logs,
  reminders,
  categories,
}: RangeStatsProps) {
  const from = addDaysIso(today, -(days - 1))
  const inRange = useMemo(
    () => stats.filter((s) => s.date >= from && s.date <= today),
    [stats, from, today]
  )
  const summary = useMemo(() => computeConsistency(inRange), [inRange])

  // Trend: completion % per day (bucketed weekly for long ranges).
  const trend = useMemo(() => {
    const bucketDays = days > 100 ? 7 : 1
    const buckets = new Map<string, { due: number; done: number; label: string }>()
    for (const s of inRange) {
      if (s.due_count <= 0) continue
      const offset =
        Math.floor(
          (parseISO(s.date).getTime() - parseISO(from).getTime()) /
            86_400_000 /
            bucketDays
        ) * bucketDays
      const key = addDaysIso(from, offset)
      const b = buckets.get(key) ?? {
        due: 0,
        done: 0,
        label: format(parseISO(key), days > 100 ? 'd MMM' : 'EEE d'),
      }
      b.due += s.due_count
      b.done += Math.min(s.completed_count, s.due_count)
      buckets.set(key, b)
    }
    return [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, b]) => ({ label: b.label, pct: Math.round((b.done / b.due) * 100) }))
  }, [inRange, from, days])

  // Best weekday.
  const weekdays = useMemo(() => {
    const acc = Array.from({ length: 7 }, () => ({ due: 0, done: 0 }))
    for (const s of inRange) {
      if (s.due_count <= 0) continue
      const dow = parseISO(s.date).getDay()
      acc[dow]!.due += s.due_count
      acc[dow]!.done += Math.min(s.completed_count, s.due_count)
    }
    return acc.map((a, i) => ({
      day: DAY_LABELS[i]!,
      pct: a.due > 0 ? Math.round((a.done / a.due) * 100) : 0,
    }))
  }, [inRange])
  const bestWeekday = weekdays.reduce((best, w) => (w.pct > best.pct ? w : best), {
    day: '—',
    pct: 0,
  })

  // Category breakdown from completion logs.
  const byCategory = useMemo(() => {
    const reminderCat = new Map(reminders.map((r) => [r.id, r.category_id]))
    const counts = new Map<string, number>()
    for (const log of logs) {
      if (log.action !== 'completed') continue
      if (log.occurrence_date < from || log.occurrence_date > today) continue
      const catId = reminderCat.get(log.reminder_id) ?? null
      const key = catId ?? 'none'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => {
        const cat = categories.find((c) => c.id === id)
        return {
          name: cat?.name ?? 'Uncategorised',
          color: cat?.color ?? 'var(--muted-foreground)',
          count,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [logs, reminders, categories, from, today])

  const avgPerDay =
    summary.activeDays > 0 ? (summary.totalDue / summary.activeDays).toFixed(1) : '0'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label="Current streak"
          value={streaks.current}
          hint="days"
          accent={streaks.current > 0}
          index={0}
        />
        <StatCard
          icon={Trophy}
          label="Longest streak"
          value={streaks.longest}
          hint="days"
          index={1}
        />
        <StatCard
          icon={Percent}
          label="Completion"
          value={`${summary.completionRate}%`}
          hint={`${summary.totalCompleted}/${summary.totalDue} done`}
          index={2}
        />
        <StatCard
          icon={CheckCircle2}
          label="Perfect days"
          value={summary.perfectDays}
          hint={`of ${summary.activeDays} active`}
          index={3}
        />
        <StatCard
          icon={Star}
          label="Perfect weeks"
          value={summary.perfectWeeks}
          index={4}
        />
        <StatCard
          icon={Medal}
          label="Perfect months"
          value={summary.perfectMonths}
          index={5}
        />
        <StatCard
          icon={CalendarCheck}
          label="Avg / day"
          value={avgPerDay}
          hint="reminders due"
          index={6}
        />
        <StatCard
          icon={BarChart3}
          label="Best weekday"
          value={bestWeekday.day}
          hint={`${bestWeekday.pct}% completed`}
          index={7}
        />
      </div>

      {trend.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Completion trend</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  cursor={{ stroke: 'var(--border)' }}
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${Number(v ?? 0)}%`, 'Completed']}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#trendFill)"
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By weekday</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weekdays}
                margin={{ top: 4, right: 8, bottom: 0, left: -22 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  cursor={{ fill: 'color-mix(in oklab, var(--primary) 8%, transparent)' }}
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${Number(v ?? 0)}%`, 'Completed']}
                />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]} animationDuration={600}>
                  {weekdays.map((w) => (
                    <Cell
                      key={w.day}
                      fill={
                        w.day === bestWeekday.day ? 'var(--primary)' : 'var(--heat-2)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No completions in this period.
              </p>
            ) : (
              <ul className="space-y-3">
                {byCategory.map((c) => {
                  const max = byCategory[0]!.count
                  return (
                    <li key={c.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: c.color }}
                          />
                          {c.name}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {c.count}
                        </span>
                      </div>
                      <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${(c.count / max) * 100}%`,
                            background: c.color,
                          }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12,
  color: 'var(--popover-foreground)',
}
