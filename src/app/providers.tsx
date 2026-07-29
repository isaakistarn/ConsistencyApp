import { useEffect, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/app/AuthProvider'
import { TooltipProvider } from '@/components/ui/misc'
import { useQueryInvalidationBridge } from '@/hooks/queries'
import { applyAppearance, useUiStore } from '@/store/ui'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false, // Dexie-backed queries invalidate via events
    },
  },
})

function AppearanceManager() {
  const { theme, accent } = useUiStore()
  useEffect(() => {
    applyAppearance(theme, accent)
    if (theme !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyAppearance(theme, accent)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme, accent])
  return null
}

function InvalidationBridge() {
  useQueryInvalidationBridge()
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          <AppearanceManager />
          <InvalidationBridge />
          {children}
          <Toaster
            position="top-center"
            // The app draws under the iOS status bar (viewport-fit=cover), so
            // toasts must clear it — like a real notification banner would.
            offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
            mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
            toastOptions={{
              classNames: {
                toast:
                  '!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-lg',
              },
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
