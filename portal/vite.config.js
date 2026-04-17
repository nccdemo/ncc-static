import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  console.log('Vite config loaded')
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || env.VITE_API_URL || ''
  const target = proxyTarget || 'http://127.0.0.1:8000'
  const wsTarget = (env.VITE_DEV_PROXY_WS || target.replace(/^http/, 'ws')).replace(/\/$/, '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@admin': path.resolve(__dirname, '../admin/src'),
        '@driver': path.resolve(__dirname, '../driver-app/src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5178,
      strictPort: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
        '/uploads': {
          target,
          changeOrigin: true,
        },
        '/static': {
          target,
          changeOrigin: true,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
