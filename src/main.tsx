import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RouterProvider } from 'react-router-dom'

import { bootstrapApp } from './app/bootstrap'
import { router } from './app/router'
import './index.css'

async function startApp() {
  try {
    const content = await bootstrapApp()

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        {content.status === 'preserved' && <p role="status">{content.warning.message}</p>}
        <RouterProvider router={router} />
      </StrictMode>,
    )
  } catch {
    console.error('CONTENT_INITIALIZATION_FAILED')
    document.getElementById('root')!.textContent = 'Study content could not be initialized. Please restart the app.'
  }
}

void startApp()
