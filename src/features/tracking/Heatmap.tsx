/**
 * GitHub-style consistency heatmap. Pure CSS grid of day cells with
 * tooltip details; scrolls horizontally on phones (anchored to today).
 */
import { useEffect, useMemo, useRef } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/misc'
import { heatLevel } from '@/lib/streaks'
import { addDaysIso, parseISO, todayIso } from '@/lib/dates'
import { format } from 'date-fns'
import type { DailyStatistic } from '@/types'

interface HeatmapProps {
  stats: DailyStatistic[]
  /** Number of weeks to render (default 26; use 53 for the year view) */
  weeks?: number
  weekStartsOn?: number
}

const LEVEL_VARS = [
  'var(--heat-0)',
  'var(--heat-1)',
  'var(--heat-2)',
  'var(--heat-3)',
  'var(--heat-4)',
] as const

export function Heatmap({ stats, weeks = 26, weekStartsOn = 1 }: HeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = todayIso()

  const { columns, monthLabels } = useMemo(() => {
    const byDate = new Map(stats.map((s) => [s.date, s]))
    // End the grid at the end of the current week.
    const todayDow = parseISO(today).getDay()
    const daysToWeekEnd = (7 + 6 - ((todayDow - weekStartsOn + 7) % 7)) % 7
    const end = addDaysIso(today, daysToWeekEnd)
    const start = addDaysIso(end, -(weeks * 7 - 1))

    const columns: { date: string; stat?: DailyStatistic; future: boolean }[][] = []
    const monthLabels: { index: number; label: string }[] = []
    let lastMonth = ''
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; stat?: DailyStatistic; future: boolean }[] = []
      for (let d = 0; d < 7; d++) {
        const date = addDaysIso(start, w * 7 + d)
        col.push({ date, stat: byDate.get(date), future: date > today })
      }
      const firstOfCol = col[0]!.date
      const month = format(parseISO(firstOfCol), 'MMM')
      if (month !== lastMonth) {
        monthLabels.push({ index: w, label: month })
        lastMonth = month
      }
      columns.push(col)
    }
    return { columns, monthLabels }
  }, [stats, weeks, weekStartsOn, today])

  // Keep "today" in view on phones.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [columns])

  return (
    <div ref={scrollRef} className="no-scrollbar overflow-x-auto">
      <div className="min-w-max">
        <div
          className="text-muted-foreground mb-1 grid text-[9px]"
          style={{ gridTemplateColumns: `repeat(${columns.length}, 13px)` }}
          aria-hidden
        >
          {columns.map((_, i) => {
            const label = monthLabels.find((m) => m.index === i)
            return <span key={i}>{label?.label ?? ''}</span>
          })}
        </div>
        <div
          className="grid grid-flow-col gap-[3px]"
          style={{ gridTemplateRows: 'repeat(7, 10px)' }}
          role="img"
          aria-label="Daily consistency heatmap"
        >
          {columns.map((col) =>
            col.map(({ date, stat, future }) => {
              if (future) {
                return <span key={date} className="h-[10px] w-[10px] rounded-[3px]" />
              }
              const level = heatLevel(stat)
              return (
                <Tooltip key={date}>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={-1}
                      className="h-[10px] w-[10px] rounded-[3px] transition-transform hover:scale-125"
                      style={{ background: LEVEL_VARS[level] }}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">
                      {format(parseISO(date), 'EEE, d MMM yyyy')}
                    </p>
                    <p className="text-muted-foreground">
                      {stat && stat.due_count > 0
                        ? `${stat.completed_count}/${stat.due_count} completed`
                        : 'Nothing due'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )
            })
          )}
        </div>
        <div className="text-muted-foreground mt-2 flex items-center justify-end gap-1 text-[10px]">
          Less
          {LEVEL_VARS.map((v) => (
            <span
              key={v}
              className="h-[10px] w-[10px] rounded-[3px]"
              style={{ background: v }}
            />
          ))}
          More
        </div>
      </div>
    </div>
  )
}
