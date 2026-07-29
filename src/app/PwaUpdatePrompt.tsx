import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_INTERVAL_MS = 15 * 60 * 1000

/** Shows a toast when a new build is deployed; one tap applies it. */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Browsers only look for a new service worker on navigation, which an
      // installed PWA rarely performs — poll, and re-check whenever the app
      // returns to the foreground. Lives for the app lifetime, no cleanup.
      const check = () => {
        void registration.update().catch(() => {})
      }
      setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('Update available', {
      id: 'pwa-update',
      description: 'A new version of Consistency is ready.',
      duration: Infinity,
      action: {
        label: 'Update',
        onClick: () => void updateServiceWorker(true),
      },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
