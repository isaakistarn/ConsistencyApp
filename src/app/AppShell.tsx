/**
 * App shell: sticky header + content outlet, with a thumb-friendly bottom tab
 * bar on phones and a slim sidebar on desktop. The center tab-bar slot is the
 * quick-add action.
 */
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Calendar,
  Home,
  ListChecks,
  Plus,
  Search,
  Settings,
} from 'lucide-react'
import { useUiStore } from '@/store/ui'
import { SyncStatusPill } from '@/components/SyncStatusPill'
import { Button } from '@/components/ui/button'
import { QuickAddSheet } from '@/features/reminders/QuickAddSheet'
import { CommandPalette } from '@/features/search/CommandPalette'
import { APP_NAME } from '@/lib/constants'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', icon: Calendar, end: false },
  { to: '/reminders', label: 'Reminders', icon: ListChecks, end: false },
  { to: '/progress', label: 'Progress', icon: BarChart3, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

const TITLES: Record<string, string> = {
  '/': 'Today',
  '/calendar': 'Calendar',
  '/reminders': 'Reminders',
  '/progress': 'Progress',
  '/settings': 'Settings',
}

export function AppShell() {
  const { setQuickAddOpen, setCommandOpen } = useUiStore()
  const location = useLocation()
  const title = TITLES['/' + (location.pathname.split('/')[1] ?? '')] ?? APP_NAME

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="bg-card/50 sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-full px-4 text-sm font-bold transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button
          className="mt-6"
          onClick={() => setQuickAddOpen(true)}
          aria-label="New reminder"
        >
          <Plus /> New reminder
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="bg-background/80 pt-safe sticky top-0 z-40 border-b backdrop-blur-lg">
          <div className="flex h-14 items-center justify-between gap-2 px-4 md:px-6">
            <div className="flex items-center gap-2.5 md:hidden">
              <Logo />
              <h1 className="text-base font-semibold tracking-tight">{title}</h1>
            </div>
            <h1 className="hidden text-base font-semibold tracking-tight md:block">
              {title}
            </h1>
            <div className="flex items-center gap-1">
              <SyncStatusPill />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCommandOpen(true)}
                aria-label="Search (Ctrl+K)"
              >
                <Search className="h-4 w-4" />
              </Button>
              <NavLink to="/settings" className="md:hidden" aria-label="Settings">
                <Button variant="ghost" size="icon-sm" asChild>
                  <span>
                    <Settings className="h-4 w-4" />
                  </span>
                </Button>
              </NavLink>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 md:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="bg-background/90 pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-lg md:hidden"
      >
        <div className="grid h-16 grid-cols-5 items-center px-2">
          {NAV.slice(0, 2).map((item) => (
            <TabLink key={item.to} {...item} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              aria-label="New reminder"
              className="bg-primary text-primary-foreground shadow-primary/30 -mt-5 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" strokeWidth={2.25} />
            </button>
          </div>
          {NAV.slice(2, 4).map((item) => (
            <TabLink key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <QuickAddSheet />
      <CommandPalette />
    </div>
  )
}

function TabLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: typeof Home
  end: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'touch-target flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-bold transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )
      }
    >
      <Icon className="h-5 w-5" aria-hidden />
      {label}
    </NavLink>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-foreground/10" />
      <rect
        x="12"
        y="34"
        width="8"
        height="8"
        rx="2"
        className="fill-primary opacity-40"
      />
      <rect
        x="23"
        y="27"
        width="8"
        height="15"
        rx="2"
        className="fill-primary opacity-60"
      />
      <rect
        x="34"
        y="20"
        width="8"
        height="22"
        rx="2"
        className="fill-primary opacity-80"
      />
      <rect x="45" y="13" width="8" height="29" rx="2" className="fill-primary" />
    </svg>
  )
}
