import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RouterProvider } from 'react-router-dom'

import { bootstrapApp } from './app/bootstrap'
import { router } from './app/router'
import './index.css'

async function startApp() {
  try {
    await bootstrapApp()

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
  } catch (error) {
    console.error('Application bootstrap failed:', error)
  }
}

void startApp()
