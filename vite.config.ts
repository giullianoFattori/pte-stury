import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { speechRuntimeProxy } from './config/speechRuntimeProxy.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '^/api/v1(?:/|$)': speechRuntimeProxy(),
      '/__local-stt/transcribe': {
        target: 'http://127.0.0.1:8766',
        changeOrigin: true,
        rewrite: () => '/transcribe',
      },
    },
  },
})
