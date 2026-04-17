import axios from 'axios'

import { clearSession, getToken } from '../auth/token.js'

import { apiBasePath } from './apiUrl.js'

const api = axios.create({
  baseURL: apiBasePath(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    const auth = `Bearer ${token}`
    if (config.headers && typeof config.headers.set === 'function') {
      config.headers.set('Authorization', auth)
    } else {
      config.headers = config.headers || {}
      config.headers.Authorization = auth
    }
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
