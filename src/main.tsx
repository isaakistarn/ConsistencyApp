import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import '@fontsource-variable/nunito'
import '@/styles/index.css'
import { Providers } from '@/app/providers'
import { router } from '@/app/router'
import { PwaUpdatePrompt } from '@/app/PwaUpdatePrompt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
      <PwaUpdatePrompt />
    </Providers>
  </StrictMode>
)
