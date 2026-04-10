import axios from 'axios'

import { clearSession, getToken } from '../auth/token.js'

const baseURL = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || '/api'

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('API ERROR:', err)
    const status = err?.response?.status
    const url = String(err?.config?.url || '')
    // Do not redirect on login/register failures (user stays on /login).
    if ((status === 401 || status === 403) && !url.includes('/auth/')) {
      clearSession()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default api
