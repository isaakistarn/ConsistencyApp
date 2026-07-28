/**
 * Global instant search (Ctrl/Cmd+K): reminders, quick actions and navigation.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  BarChart3,
  Calendar,
  Home,
  ListChecks,
  Plus,
  Search,
  Settings,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useReminders } from '@/hooks/queries'
import { useUiStore } from '@/store/ui'
import { describeRecurrence } from '@/lib/recurrence/presets'

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setQuickAddOpen, setEditingReminderId } =
    useUiStore()
  const { data: reminders = [] } = useReminders()
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(!useUiStore.getState().commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  const run = (fn: () => void) => {
    setCommandOpen(false)
    fn()
  }

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command label="Search" loop>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="text-muted-foreground h-4 w-4 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Search reminders or type a command…"
              className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <Command.List className="max-h-[50vh] overflow-y-auto p-2">
            <Command.Empty className="text-muted-foreground py-8 text-center text-sm">
              No results.
            </Command.Empty>

            <Command.Group
              heading="Actions"
              className="text-muted-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium"
            >
              <PaletteItem onSelect={() => run(() => setQuickAddOpen(true))}>
                <Plus /> New reminder
              </PaletteItem>
            </Command.Group>

            <Command.Group
              heading="Go to"
              className="text-muted-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium"
            >
              <PaletteItem onSelect={() => run(() => navigate('/'))}>
                <Home /> Today
              </PaletteItem>
              <PaletteItem onSelect={() => run(() => navigate('/calendar'))}>
                <Calendar /> Calendar
              </PaletteItem>
              <PaletteItem onSelect={() => run(() => navigate('/reminders'))}>
                <ListChecks /> Reminders
              </PaletteItem>
              <PaletteItem onSelect={() => run(() => navigate('/progress'))}>
                <BarChart3 /> Progress
              </PaletteItem>
              <PaletteItem onSelect={() => run(() => navigate('/settings'))}>
                <Settings /> Settings
              </PaletteItem>
            </Command.Group>

            {reminders.length > 0 ? (
              <Command.Group
                heading="Reminders"
                className="text-muted-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium"
              >
                {reminders.slice(0, 50).map((r) => (
                  <PaletteItem
                    key={r.id}
                    value={`${r.title} ${r.description}`}
                    onSelect={() => run(() => setEditingReminderId(r.id))}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: r.color ?? 'var(--primary)' }}
                    />
                    <span className="truncate">{r.title}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {describeRecurrence(r.rrule)}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function PaletteItem({
  children,
  onSelect,
  value,
}: {
  children: React.ReactNode
  onSelect: () => void
  value?: string
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="text-foreground aria-selected:bg-accent flex cursor-default items-center gap-2 rounded-lg px-2 py-2.5 text-sm select-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:opacity-60"
    >
      {children}
    </Command.Item>
  )
}
