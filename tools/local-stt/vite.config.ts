import { defineConfig, mergeConfig } from 'vite';
import appConfig from '../../vite.config.ts';

// Archived developer POC only; normal Vite has just the production STT API.
export default mergeConfig(appConfig, defineConfig({
  server: {
    port: 5178,
    proxy: {
      '/__local-stt/transcribe': {
        target: 'http://127.0.0.1:8766', changeOrigin: true,
        rewrite: () => '/transcribe',
      },
    },
  },
}));
