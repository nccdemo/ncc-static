import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || env.VITE_API_URL || ''
  const target = proxyTarget || 'http://127.0.0.1:8000'
  const wsTarget = (env.VITE_DEV_PROXY_WS || target.replace(/^http/, 'ws')).replace(/\/$/, '')

  return {
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': {
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
