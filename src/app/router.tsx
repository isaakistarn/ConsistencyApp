import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/app/AppShell'
import { useAuth } from '@/app/AuthProvider'
import { Skeleton } from '@/components/ui/misc'

// Route-level code splitting: each page is its own chunk.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const RemindersPage = lazy(() => import('@/features/reminders/RemindersPage'))
const ProgressPage = lazy(() => import('@/features/statistics/ProgressPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const AuthPage = lazy(() => import('@/features/auth/AuthPage'))

function PageFallback() {
  return (
    <div className="space-y-4 pt-2" aria-busy>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function Protected() {
  const { user, loading, localOnly } = useAuth()
  if (loading) return <PageFallback />
  // Local-only mode (no Supabase configured) skips auth entirely.
  if (!localOnly && !user) return <Navigate to="/auth" replace />
  return <Outlet />
}

function page(node: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>
}

export const router = createBrowserRouter(
  [
    {
      path: '/auth',
      element: page(<AuthPage />),
    },
    {
      element: <Protected />,
      children: [
        {
          element: <AppShell />,
          children: [
            { path: '/', element: page(<DashboardPage />) },
            { path: '/calendar', element: page(<CalendarPage />) },
            { path: '/reminders', element: page(<RemindersPage />) },
            { path: '/progress', element: page(<ProgressPage />) },
            { path: '/settings', element: page(<SettingsPage />) },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' }
)
