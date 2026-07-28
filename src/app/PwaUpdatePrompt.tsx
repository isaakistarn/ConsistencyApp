import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Shows a toast when a new build is deployed; one tap applies it. */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  useEffect(() => {
    if (!needRefresh) return
    toast('Update available', {
      description: 'A new version of Consistency is ready.',
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => void updateServiceWorker(true),
      },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
