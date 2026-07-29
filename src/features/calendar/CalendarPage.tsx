/**
 * Calendar — FullCalendar wired to the recurrence engine. Month / week / day /
 * agenda views, drag to move an occurrence, resize to change duration, tap a
 * slot to create a reminder prefilled with that date/time. Time blocks render
 * as tinted background events.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
  EventMountArg,
} from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { ReminderForm } from '@/features/reminders/ReminderForm'
import { TimeBlockForm } from '@/features/settings/OrganizeSections'
import {
  usePreferences,
  useReminders,
  useResolvedRange,
  useTimeBlocks,
} from '@/hooks/queries'
import { moveOccurrence } from '@/services/db/repositories/occurrences'
import { useUiStore } from '@/store/ui'
import { addDaysIso, toIsoDate } from '@/lib/dates'
import type { CalendarView, Reminder, TimeBlock } from '@/types'

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null)
  const { data: preferences } = usePreferences()
  const { data: timeBlocks = [] } = useTimeBlocks()
  const { data: reminders = [] } = useReminders()
  const setEditingReminderId = useUiStore((s) => s.setEditingReminderId)

  const [view, setView] = useState<CalendarView>(
    preferences?.default_calendar_view ?? 'timeGridWeek'
  )
  const [title, setTitle] = useState('')
  const [range, setRange] = useState<{ from: string; to: string }>(() => ({
    from: addDaysIso(toIsoDate(new Date()), -45),
    to: addDaysIso(toIsoDate(new Date()), 45),
  }))
  const [slotDraft, setSlotDraft] = useState<{
    start_date: string
    reminder_time: string | null
  } | null>(null)
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null)
  const timeBlocksRef = useRef(timeBlocks)
  useEffect(() => {
    timeBlocksRef.current = timeBlocks
  }, [timeBlocks])
  // Set while a pointer press started on a time block, so a plain click edits
  // the block instead of also triggering the slot-select quick create.
  const blockPressRef = useRef(false)

  const { data: occurrences = [] } = useResolvedRange(range.from, range.to, {
    includeSkipped: true,
  })

  const events = useMemo<EventInput[]>(() => {
    const reminderEvents: EventInput[] = occurrences.map((o) => ({
      id: o.key,
      title: o.reminder.title,
      start: o.all_day ? o.occurrence_date : o.scheduled_at,
      end: o.all_day ? undefined : o.end_at,
      allDay: o.all_day,
      backgroundColor: o.reminder.color ?? 'var(--primary)',
      textColor: 'var(--primary-foreground)',
      classNames:
        o.status === 'completed'
          ? ['occ-completed']
          : o.status === 'skipped'
            ? ['occ-skipped']
            : [],
      extendedProps: { reminderId: o.reminder.id, occurrenceDate: o.occurrence_date },
    }))

    // Time blocks as recurring background events (daysOfWeek recurrence).
    // The tint alpha lives in the color (not element opacity) so the title
    // text stays fully readable on top of it.
    const blockEvents: EventInput[] = timeBlocks.map((b) => ({
      id: `block:${b.id}`,
      title: b.name,
      daysOfWeek: b.days_of_week,
      startTime: b.start_time,
      endTime: b.end_time <= b.start_time ? '23:59:59' : b.end_time,
      display: 'background',
      backgroundColor: /^#[0-9a-fA-F]{6}$/.test(b.color) ? `${b.color}2e` : b.color,
      extendedProps: { isBlock: true, blockColor: b.color },
    }))

    return [...reminderEvents, ...blockEvents]
  }, [occurrences, timeBlocks])

  const findReminder = useCallback(
    (id: string): Reminder | undefined => reminders.find((r) => r.id === id),
    [reminders]
  )

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setTitle(arg.view.title)
    setView(arg.view.type as CalendarView)
    // Expand with margin so adjacent navigation is instant.
    setRange({
      from: addDaysIso(toIsoDate(arg.start), -7),
      to: addDaysIso(toIsoDate(arg.end), 7),
    })
  }, [])

  const onEventClick = useCallback(
    (arg: EventClickArg) => {
      const { reminderId, isBlock } = arg.event.extendedProps as {
        reminderId?: string
        isBlock?: boolean
      }
      if (isBlock || !reminderId) return
      setEditingReminderId(reminderId)
    },
    [setEditingReminderId]
  )

  const onEventDrop = useCallback(
    async (arg: EventDropArg) => {
      const { reminderId, occurrenceDate } = arg.event.extendedProps as {
        reminderId?: string
        occurrenceDate?: string
      }
      const reminder = reminderId ? findReminder(reminderId) : undefined
      if (!reminder || !occurrenceDate || !arg.event.start) {
        arg.revert()
        return
      }
      await moveOccurrence(reminder, occurrenceDate, arg.event.start)
      toast(`Rescheduled “${reminder.title}”`)
    },
    [findReminder]
  )

  const onEventResize = useCallback(
    async (arg: EventResizeDoneArg) => {
      const { reminderId, occurrenceDate } = arg.event.extendedProps as {
        reminderId?: string
        occurrenceDate?: string
      }
      const reminder = reminderId ? findReminder(reminderId) : undefined
      if (!reminder || !occurrenceDate || !arg.event.start || !arg.event.end) {
        arg.revert()
        return
      }
      const minutes = Math.round(
        (arg.event.end.getTime() - arg.event.start.getTime()) / 60_000
      )
      await moveOccurrence(reminder, occurrenceDate, arg.event.start, minutes)
      toast(`“${reminder.title}” now ${minutes} min`)
    },
    [findReminder]
  )

  // FullCalendar never fires eventClick for display:'background' events, so
  // time blocks get their own DOM listeners. A press that stays put (< 8px)
  // opens the block editor; a real drag falls through to slot selection.
  const onEventDidMount = useCallback((info: EventMountArg) => {
    const { isBlock, blockColor } = info.event.extendedProps as {
      isBlock?: boolean
      blockColor?: string
    }
    if (!isBlock) return
    const el = info.el
    el.style.cursor = 'pointer'
    el.style.pointerEvents = 'auto'
    if (blockColor) el.style.borderLeft = `3px solid ${blockColor}`
    const blockId = info.event.id.slice('block:'.length)
    let downX = 0
    let downY = 0
    el.addEventListener('pointerdown', (e) => {
      downX = e.clientX
      downY = e.clientY
      blockPressRef.current = true
      const onMove = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) {
          blockPressRef.current = false
        }
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        // Cleared async so FullCalendar's own pointerup (slot select) still
        // sees the flag; the click handler below fires before this too.
        setTimeout(() => {
          blockPressRef.current = false
        }, 0)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    })
    el.addEventListener('click', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return
      const block = timeBlocksRef.current.find((b) => b.id === blockId)
      if (block) {
        setSlotDraft(null)
        setEditingBlock(block)
      }
    })
  }, [])

  const onSelect = useCallback((arg: DateSelectArg) => {
    if (blockPressRef.current) {
      blockPressRef.current = false
      return
    }
    setSlotDraft({
      start_date: toIsoDate(arg.start),
      reminder_time: arg.allDay
        ? null
        : `${String(arg.start.getHours()).padStart(2, '0')}:${String(arg.start.getMinutes()).padStart(2, '0')}`,
    })
  }, [])

  const api = () => calendarRef.current?.getApi()

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => api()?.prev()}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => api()?.next()}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => api()?.today()}>
            Today
          </Button>
        </div>
        <h2 className="order-first w-full text-base font-semibold tracking-tight sm:order-none sm:w-auto">
          {title}
        </h2>
        <Tabs value={view} onValueChange={(v) => api()?.changeView(v)}>
          <TabsList>
            <TabsTrigger value="dayGridMonth">Month</TabsTrigger>
            <TabsTrigger value="timeGridWeek">Week</TabsTrigger>
            <TabsTrigger value="timeGridDay">Day</TabsTrigger>
            <TabsTrigger value="listWeek">Agenda</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border p-2 shadow-sm">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={view}
          headerToolbar={false}
          events={events}
          height="auto"
          firstDay={preferences?.week_starts_on ?? 1}
          nowIndicator
          editable
          eventDurationEditable
          selectable
          selectMirror
          longPressDelay={350}
          dayMaxEventRows={3}
          scrollTime={`${String(preferences?.day_start_hour ?? 6).padStart(2, '0')}:00:00`}
          slotDuration="00:30:00"
          eventTimeFormat={{
            hour: preferences?.time_format === '12h' ? 'numeric' : '2-digit',
            minute: '2-digit',
            hour12: preferences?.time_format === '12h',
          }}
          datesSet={onDatesSet}
          eventClick={onEventClick}
          eventDidMount={onEventDidMount}
          eventDrop={(arg) => void onEventDrop(arg)}
          eventResize={(arg) => void onEventResize(arg)}
          select={onSelect}
        />
      </div>

      {/* Slot-tap quick create */}
      <ResponsiveSheet
        open={slotDraft !== null}
        onOpenChange={(open) => {
          if (!open) setSlotDraft(null)
        }}
        title="New reminder"
        dialogClassName="max-w-xl"
      >
        {slotDraft ? (
          <ReminderForm
            defaults={slotDraft}
            onSaved={() => setSlotDraft(null)}
            onCancel={() => setSlotDraft(null)}
          />
        ) : null}
      </ResponsiveSheet>

      {/* Tap a time block to edit it */}
      <ResponsiveSheet
        open={editingBlock !== null}
        onOpenChange={(open) => {
          if (!open) setEditingBlock(null)
        }}
        title="Edit time block"
      >
        {editingBlock ? (
          <TimeBlockForm block={editingBlock} onDone={() => setEditingBlock(null)} />
        ) : null}
      </ResponsiveSheet>
    </div>
  )
}
